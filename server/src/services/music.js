/**
 * Music phase service.
 *
 *   generateMusicSamples(project)  → 3 distinct ~10s Lyria clips written to disk.
 *                                    Each sample carries the engineered prompt
 *                                    that produced it; we expand the chosen
 *                                    sample's prompt into a full ~60s track at
 *                                    render time.
 *
 *   expandToFullTrack(samplePrompt) → engineered Lyria prompt for full track.
 *
 * Samples are stored at:  server/public/music-samples/<projectId>-<sampleId>.mp3
 * served as static files at  /music-samples/<filename>.mp3
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { musicBuffer } from './openrouter.js';
import { rewriteForModel } from './rewriter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.resolve(__dirname, '../../public/music-samples');

/** Three prompt seeds — different *sub-genre + instrumentation* per sample,
 *  same tempo/key locked to the project styleSheet. */
const SAMPLE_DIRECTIONS = [
  { key: 'warm',      label: 'Warm acoustic',     hint: 'sub-genre: warm acoustic cinematic. Solo guitar or piano up front, soft string pad underneath, no percussion. Intimate, grounded.' },
  { key: 'minimal',   label: 'Minimal pad',       hint: 'sub-genre: ambient minimal. Sustained synth pad, sparse harp arpeggio, no drums. Floating, contemplative.' },
  { key: 'cinematic', label: 'Cinematic build',   hint: 'sub-genre: hybrid cinematic underscore. Cello sustain, light timpani roll under, slow swell. Composed and deliberate.' },
];

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

export function musicSampleUrl(filename) {
  return `/music-samples/${filename}`;
}

/**
 * Build engineered Lyria prompts for 3 distinct sample directions, then
 * generate them in parallel. Returns an array of MusicSample subdocs ready to
 * persist on the project.
 */
export async function generateMusicSamples(project) {
  await ensureDir(SAMPLES_DIR);

  // 1. Engineer 3 distinct prompts in parallel.
  const prompts = await Promise.all(
    SAMPLE_DIRECTIONS.map(async (dir) => {
      try {
        const { prompt } = await rewriteForModel({
          target: 'lyria-sample',
          userIntent: dir.hint,
          styleSheet: project.styleSheet || {},
          previousPrompt: '',
          sceneContext: { lengthSec: 10 },
        });
        return { dir, prompt };
      } catch (e) {
        // Fall back to the hint itself — better than aborting the whole batch.
        return { dir, prompt: `${dir.hint} 10 seconds, ${project.styleSheet?.musicTempo || '70 BPM'}, ${project.styleSheet?.musicKey || 'A minor'}, low volume voice-friendly mix.` };
      }
    })
  );

  // 2. Call Lyria for each in parallel. Per-sample failures don't kill siblings.
  const out = await Promise.all(prompts.map(async ({ dir, prompt }) => {
    const sampleId = nanoid(8);
    const filename = `${project._id}-${sampleId}.mp3`;
    const filePath = path.join(SAMPLES_DIR, filename);
    try {
      const { buffer } = await musicBuffer(prompt);
      await fs.writeFile(filePath, buffer);
      return {
        sampleId,
        label: dir.label,
        prompt,
        filePath,
        url: musicSampleUrl(filename),
        durationSec: 10,
        ok: true,
      };
    } catch (e) {
      console.warn(`[music] sample ${dir.key} failed:`, e.message);
      return { sampleId, label: dir.label, prompt, filePath: '', url: '', durationSec: 0, ok: false, error: e.message };
    }
  }));

  return out;
}

/**
 * Take a chosen sample's engineered prompt and run it through the rewriter
 * once more (target='lyria-full') to expand into a full ~60s track prompt
 * that respects voice-over headroom.
 */
export async function expandToFullTrack(project, samplePrompt) {
  const { prompt } = await rewriteForModel({
    target: 'lyria-full',
    userIntent: 'Expand this sample direction into a full track for the final render.',
    styleSheet: project.styleSheet || {},
    previousPrompt: samplePrompt,
    sceneContext: { lengthSec: project.totalSeconds || 60 },
  });
  return prompt;
}

/**
 * Janitor: remove sample files that no longer have a backing project.
 * Called occasionally; matches against `<projectId>-*` filenames.
 */
export async function cleanupOrphans(activeProjectIds) {
  try {
    await ensureDir(SAMPLES_DIR);
    const files = await fs.readdir(SAMPLES_DIR);
    const active = new Set(activeProjectIds.map(String));
    for (const f of files) {
      const id = f.split('-')[0];
      if (!active.has(id)) {
        await fs.rm(path.join(SAMPLES_DIR, f), { force: true });
        console.log(`[music] removed orphan ${f}`);
      }
    }
  } catch (e) { console.warn('[music] cleanup error:', e.message); }
}
