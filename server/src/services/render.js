/**
 * Render orchestrator. Run as an async generator so the route can stream
 * progress events to the client over SSE.
 *
 * Yields events of shape: { type: 'started'|'step'|'progress'|'done'|'error', ... }
 *
 * Phases (in order):
 *   1. narrate   — TTS for every scene in parallel
 *   2. score     — Lyria for the music bed
 *   3. film      — Veo for every video scene in parallel (slide scenes skip)
 *   4. stitch    — slide stills → clips, concat scenes, mix narration + music
 *   5. poster    — extract a JPEG poster from the final MP4
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { env } from '../env.js';
import { ttsBuffer, musicBuffer, videoBuffer } from './openrouter.js';
import { expandToFullTrack } from './music.js';
import {
  stillToClip,
  normalizeClip,
  concatClips,
  concatAudio,
  mixAudioOverVideo,
  burnSubtitles,
  extractPoster,
  probeDuration,
} from './ffmpeg.js';

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

function dataUrl(img) {
  return img?.base64 ? `data:${img.mime || 'image/png'};base64,${img.base64}` : '';
}

/**
 * Generate a render. Yields events. The caller is responsible for SSE serialization.
 *
 * Returns the temp path on completion via the final 'done' event so the route
 * can decide whether to stream + delete (download-only) or move to /shares.
 */
export async function* renderProject({ project, scenes }) {
  const tempId = nanoid(12);
  const workDir = path.join(env.RENDERS_TEMP_DIR, tempId);
  await ensureDir(workDir);

  yield { type: 'started', tempId, totalScenes: scenes.length };

  // ── 1. Narrate (parallel)
  yield { type: 'step', step: 'narrate', label: 'recording narration' };
  const narrationPaths = [];
  await Promise.all(scenes.map(async (s, i) => {
    if (!s.narration?.trim()) {
      const wavPath = path.join(workDir, `narration_${i}.wav`);
      await fs.writeFile(wavPath, makeSilenceWav(s.durationSec));
      narrationPaths[i] = wavPath;
      return;
    }
    const buf = await ttsBuffer(s.narration, { voice: project.voiceName || 'Kore' });
    const wavPath = path.join(workDir, `narration_${i}.wav`);
    await fs.writeFile(wavPath, buf);
    narrationPaths[i] = wavPath;
  }));

  // Probe each narration WAV's actual duration. We use these — not the
  // planner's guesses — to drive caption timing and the visual timeline.
  // TTS pacing varies by voice + emphasis tags, so the probed numbers are
  // the only ground truth we have.
  const narrationSec = await Promise.all(
    narrationPaths.map((p) => probeDuration(p).catch(() => 0))
  );

  // ── 2. Score
  // The music phase was removed from the editor flow — every render now uses
  // the planner's musicPrompt directly. We still honor a chosen sample if one
  // happens to be persisted (legacy projects). If music generation fails
  // entirely, we ship with a silent track so the user still gets a render.
  yield { type: 'step', step: 'score', label: 'composing music' };
  const musicPath = path.join(workDir, 'music.mp3');
  let musicAvailable = true;
  {
    let fullPrompt = project.musicPrompt
      || synthesizeMusicPrompt(project)
      || 'gentle cinematic instrumental, contemplative, 72 BPM, sparse piano and strings, low volume voice-over friendly';
    const chosenId = project.selectedMusicSampleId;
    const sample = chosenId && (project.musicSamples || []).find((s) => s.sampleId === chosenId);
    if (sample?.prompt) {
      try { fullPrompt = await expandToFullTrack(project, sample.prompt); }
      catch (e) {
        console.warn('[render] expandToFullTrack failed, using sample prompt:', e.message);
        fullPrompt = sample.prompt;
      }
    }
    try {
      const m = await musicBuffer(fullPrompt);
      await fs.writeFile(musicPath, m.buffer);
    } catch (e) {
      console.warn('[render] music generation failed, shipping silent bed:', e.message);
      // Generate a silent stand-in so the audio mix step still runs.
      await fs.writeFile(musicPath, makeSilenceWav(Math.max(60, project.totalSeconds || 60)));
      musicAvailable = false;
    }
  }

  // ── 3. Film video scenes (parallel)
  yield { type: 'step', step: 'film', label: 'filming video scenes' };
  const sceneVideoPaths = [];
  const videoScenes = scenes.filter((s) => s.visualKind === 'video');
  if (videoScenes.length) {
    await Promise.all(videoScenes.map(async (s) => {
      if (!s.firstFrameImage?.base64 || !s.lastFrameImage?.base64) {
        throw new Error(`scene ${s.order + 1}: video scene needs both first and last frame generated`);
      }
      const buf = await videoBuffer({
        prompt: s.engineeredVideoMotionPrompt || s.videoMotionPrompt || 'cinematic motion, 4 seconds',
        firstFrameDataUrl: dataUrl(s.firstFrameImage),
        lastFrameDataUrl: dataUrl(s.lastFrameImage),
        aspectRatio: '16:9',
        duration: Math.min(8, Math.max(4, s.durationSec)),
        resolution: '720p',
      });
      const rawPath = path.join(workDir, `veo_${s.order}.mp4`);
      await fs.writeFile(rawPath, buf);
      const normalized = path.join(workDir, `scene_${s.order}.mp4`);
      await normalizeClip({ inPath: rawPath, outPath: normalized, durationSec: s.durationSec });
      sceneVideoPaths[s.order] = normalized;
    }));
  }

  // Slide scenes → clips
  yield { type: 'step', step: 'stitch', label: 'rendering slides' };
  for (const s of scenes) {
    if (s.visualKind === 'slide') {
      if (!s.slideImage?.base64) {
        throw new Error(`scene ${s.order + 1}: missing slide image`);
      }
      const imgPath = path.join(workDir, `slide_${s.order}.${(s.slideImage.mime || 'image/png').split('/')[1] || 'png'}`);
      await fs.writeFile(imgPath, Buffer.from(s.slideImage.base64, 'base64'));
      const clipPath = path.join(workDir, `scene_${s.order}.mp4`);
      await stillToClip({ imagePath: imgPath, outPath: clipPath, durationSec: s.durationSec });
      sceneVideoPaths[s.order] = clipPath;
    }
  }

  // ── 4. Concat scenes + concat narrations + mix
  yield { type: 'step', step: 'mixing', label: 'assembling final video' };
  const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
  const orderedClips = sortedScenes.map((s) => sceneVideoPaths[s.order]);

  // Compute narration vs visual totals. If narration runs past the visual
  // timeline (TTS pacing → script overruns the planned duration), hold the
  // last frame as a still until the narration finishes. The user said
  // "narration is important" — so it always plays out.
  const visualTotal = sortedScenes.reduce((acc, s) => acc + s.durationSec, 0);
  const narrationTotal = narrationSec.reduce((acc, n) => acc + (n || 0), 0);
  const tailSec = Math.max(0, narrationTotal - visualTotal + 0.5);
  if (tailSec > 0.3) {
    const lastScene = sortedScenes[sortedScenes.length - 1];
    const stillImg = lastScene.visualKind === 'video'
      ? lastScene.lastFrameImage || lastScene.firstFrameImage
      : lastScene.slideImage;
    if (stillImg?.base64) {
      const tailImgPath = path.join(workDir, `tail.${(stillImg.mime || 'image/png').split('/')[1] || 'png'}`);
      await fs.writeFile(tailImgPath, Buffer.from(stillImg.base64, 'base64'));
      const tailClipPath = path.join(workDir, 'scene_tail.mp4');
      await stillToClip({ imagePath: tailImgPath, outPath: tailClipPath, durationSec: tailSec });
      orderedClips.push(tailClipPath);
    }
  }

  const joined = path.join(workDir, 'joined.mp4');
  await concatClips({ clipPaths: orderedClips, outPath: joined, workDir });

  const narrationConcat = path.join(workDir, 'narration_all.wav');
  await concatAudio({ wavPaths: scenes.map((_, i) => narrationPaths[i]), outPath: narrationConcat });

  // Cap the final at the longer of (visual+tail) and narration. Narration
  // wins by design — we'd rather see the last frame held than truncated.
  const finalDuration = Math.max(visualTotal + tailSec, narrationTotal) + 0.2;

  const mixedPath = path.join(workDir, 'mixed.mp4');
  await mixAudioOverVideo({
    videoPath: joined,
    narrationPath: narrationConcat,
    musicPath,
    outPath: mixedPath,
    durationSec: finalDuration,
  });

  // ── 4b. Captions (optional)
  let finalPath = mixedPath;
  if (project.captionsEnabled !== false) {
    yield { type: 'step', step: 'captioning', label: 'burning captions' };
    const srtPath = path.join(workDir, 'captions.srt');
    await fs.writeFile(srtPath, buildSrt(sortedScenes, narrationSec), 'utf8');
    const burnedPath = path.join(workDir, 'final.mp4');
    try {
      await burnSubtitles({ videoPath: mixedPath, srtPath, outPath: burnedPath });
      finalPath = burnedPath;
    } catch (e) {
      console.warn('[render] subtitle burn failed, shipping uncaptioned:', e.message);
      // finalPath stays as mixedPath
    }
  } else {
    finalPath = path.join(workDir, 'final.mp4');
    await fs.rename(mixedPath, finalPath);
  }

  // ── 5. Poster
  const posterPath = path.join(workDir, 'poster.jpg');
  await extractPoster({ videoPath: finalPath, outPath: posterPath });

  const stat = await fs.stat(finalPath);
  const durationSec = await probeDuration(finalPath);

  yield {
    type: 'done',
    tempId,
    finalPath,
    posterPath,
    durationSec: Math.round(durationSec),
    fileSizeBytes: stat.size,
    posterBase64: (await fs.readFile(posterPath)).toString('base64'),
  };
}

/**
 * Build a fallback music brief from the project's styleSheet so renders never
 * fail just because the planner's musicPrompt is empty. Voice-over friendly
 * by default — sparse instrumentation, no vocals, low dynamic range.
 */
function synthesizeMusicPrompt(project) {
  const s = project.styleSheet || {};
  const tempo = s.musicTempo || '72 BPM, slow build';
  const key = s.musicKey || 'A minor';
  const vibe = (project.wizardAnswers?.musicVibe || '').toString();
  const genre = vibe.match(/^([^(]+)/)?.[1]?.trim() || 'cinematic ambient underscore';
  return `${genre}, ${tempo}, key ${key}, sparse instrumentation (pad + light arpeggio), no vocals, low-volume voice-over friendly mix, leave 1-3kHz open for narration.`;
}

/**
 * Build an SRT caption file synced to the actual TTS WAV durations.
 *
 * Each scene's narration is split into multiple short cues — one line max,
 * ≤ 38 chars — and time is distributed proportional to word count so cues
 * roughly align with what the narrator is saying. Without word-level
 * timestamps from TTS this is still an estimate, but it's far better than
 * stretching one giant cue across the whole scene.
 *
 * @param {Array} sortedScenes
 * @param {Array<number>} narrationSec — probed WAV durations (in seconds)
 */
function buildSrt(sortedScenes, narrationSec = []) {
  let cueIdx = 1;
  let t = 0;
  const out = [];
  for (let i = 0; i < sortedScenes.length; i++) {
    const s = sortedScenes[i];
    // Use the probed duration when we have one, falling back to the
    // planner's guess only as a safety net.
    const sceneDur = narrationSec[i] || s.durationSec || 6;
    const text = (s.narration || '').trim();
    if (!text) { t += sceneDur; continue; }

    const cues = splitIntoCues(text, sceneDur, 38);
    for (const c of cues) {
      out.push(buildCue(cueIdx++, t + c.start, t + c.end, c.text));
    }
    t += sceneDur;
  }
  return out.join('\n');
}

/**
 * Break narration text into short cues (≤ maxChars, one line each), and
 * distribute the available time across cues proportional to word count.
 */
function splitIntoCues(text, totalSec, maxChars = 38) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);

  const totalWords = words.length;
  const cues = [];
  let elapsed = 0;
  for (let i = 0; i < lines.length; i++) {
    const wordsInLine = lines[i].split(' ').filter(Boolean).length;
    // Reserve a small minimum on-screen time so super-short cues don't flash.
    const proportional = (wordsInLine / totalWords) * totalSec;
    const dur = Math.max(0.6, proportional);
    const start = elapsed;
    const end = i === lines.length - 1 ? totalSec : Math.min(totalSec, elapsed + dur);
    cues.push({ start, end, text: lines[i] });
    elapsed = end;
  }
  return cues;
}

function buildCue(idx, startSec, endSec, text) {
  return `${idx}\n${srtTime(startSec)} --> ${srtTime(endSec)}\n${text}\n`;
}

function srtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n, w) { return String(n).padStart(w, '0'); }

/** Generates a silent WAV of the given duration in seconds. */
function makeSilenceWav(sec, sampleRate = 24000) {
  const samples = Math.floor(sampleRate * sec);
  const dataLen = samples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

/** Background janitor: delete /tmp/id3a/renders/* dirs older than maxAgeMs. */
export async function janitor(maxAgeMs = 60 * 60 * 1000) {
  try {
    await ensureDir(env.RENDERS_TEMP_DIR);
    const dirs = await fs.readdir(env.RENDERS_TEMP_DIR);
    const now = Date.now();
    for (const d of dirs) {
      const full = path.join(env.RENDERS_TEMP_DIR, d);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.rm(full, { recursive: true, force: true });
        console.log(`[janitor] removed stale render ${d}`);
      }
    }
  } catch (e) { console.warn('[janitor] error', e.message); }
}
