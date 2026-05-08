/**
 * FFmpeg helpers built on the system `ffmpeg` binary via fluent-ffmpeg.
 * Each function writes its output to disk and resolves with the final path.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import ffmpeg from 'fluent-ffmpeg';

function run(label, cmd) {
  return new Promise((resolve, reject) => {
    cmd.on('error', (err) => reject(new Error(`[ffmpeg ${label}] ${err.message}`)))
       .on('end', () => resolve())
       .run();
  });
}

/**
 * Quality / RAM profile.
 *
 * The server runs on a 1GB-RAM box, so we tune every libx264 encode to:
 *   • preset medium  — good speed + good compression (vs 'fast' = lower quality)
 *   • crf 18-19      — visually lossless at 720p
 *   • tune stillimage / film as appropriate
 *   • -threads 2     — caps libx264's lookahead RAM use (~150-250 MB peak)
 *
 * Concat + mix stages stream-copy and don't re-encode, so they're cheap.
 */
const X264_THREADS = ['-threads 2'];

/**
 * Convert a still image (PNG/JPEG) to a silent video clip.
 *
 * The full image is fit inside 1280×720 with `force_original_aspect_ratio=decrease`
 * and any leftover area letterboxes black. We deliberately do NOT zoom or pan —
 * infographic slides have small text + callouts that must remain readable;
 * a Ken Burns crop ate the edges of those.
 */
export async function stillToClip({ imagePath, outPath, durationSec, width = 1280, height = 720, fps = 30 }) {
  await run('still→clip',
    ffmpeg(imagePath)
      .loop(durationSec)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
        `fps=${fps}`,
      ])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset medium',
        '-crf 19',
        '-tune stillimage',
        ...X264_THREADS,
        `-t ${durationSec}`,
      ])
      .output(outPath)
  );
  return outPath;
}

/** Re-encode an existing video to standard format (so concat doesn't fight codecs). */
export async function normalizeClip({ inPath, outPath, durationSec, width = 1280, height = 720, fps = 30 }) {
  await run('normalize',
    ffmpeg(inPath)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
        `fps=${fps}`,
      ])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset medium',
        '-crf 18',
        '-tune film',
        ...X264_THREADS,
        '-an',
        ...(durationSec ? [`-t ${durationSec}`] : []),
      ])
      .output(outPath)
  );
  return outPath;
}

/** Concat a list of MP4s using the concat demuxer. All inputs must share codec. */
export async function concatClips({ clipPaths, outPath, workDir }) {
  const listFile = path.join(workDir, 'concat.txt');
  const lines = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listFile, lines, 'utf8');
  await run('concat',
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outPath)
  );
  return outPath;
}

/** Concat narration WAVs into one continuous narration track of total duration. */
export async function concatAudio({ wavPaths, outPath }) {
  const inputs = ffmpeg();
  wavPaths.forEach((p) => inputs.input(p));
  await run('concat-audio',
    inputs
      .complexFilter([
        `${wavPaths.map((_, i) => `[${i}:a]`).join('')}concat=n=${wavPaths.length}:v=0:a=1[aout]`,
      ], 'aout')
      .outputOptions(['-c:a pcm_s16le'])
      .output(outPath)
  );
  return outPath;
}

/**
 * Mix narration on top of a looping music bed (music ducked to ~18%).
 *
 * Narration drives the duration. Music loops indefinitely so it never cuts
 * off mid-narration. Output is hard-capped to `durationSec` so we don't
 * accumulate a tail of silent video past the last narration cue.
 *
 * @param {object} args
 * @param {string} args.videoPath
 * @param {string} args.narrationPath
 * @param {string} args.musicPath
 * @param {string} args.outPath
 * @param {number} [args.musicVolume=0.18]
 * @param {number} [args.durationSec]   — hard cap; if omitted, runs to first input
 */
export async function mixAudioOverVideo({ videoPath, narrationPath, musicPath, outPath, musicVolume = 0.18, durationSec }) {
  const cmd = ffmpeg()
    .input(videoPath)
    .input(narrationPath);
  // Loop the music bed indefinitely so a 30s Lyria clip can underscore a 90s
  // narration without the audio falling off the end.
  cmd.input(musicPath).inputOptions(['-stream_loop -1']);

  cmd
    .complexFilter([
      `[2:a]volume=${musicVolume}[bed]`,
      // duration=first uses narration's length (input 1 of amix), so the
      // mixed audio runs exactly as long as the narration.
      `[1:a][bed]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ])
    .outputOptions([
      '-map 0:v',
      '-map [aout]',
      '-c:v copy',
      '-c:a aac',
      '-b:a 192k',
      ...(durationSec ? [`-t ${durationSec.toFixed(3)}`] : ['-shortest']),
      '-movflags +faststart',
    ])
    .output(outPath);

  await run('mix', cmd);
  return outPath;
}

/**
 * Burn an SRT subtitle file into a video with a clean, premium look.
 * Style: white text, semi-transparent black box, bottom-center, generous padding.
 */
export async function burnSubtitles({ videoPath, srtPath, outPath }) {
  // FFmpeg subtitles filter wants the path escaped just-so.
  // Single-quote-wrap and escape any colons (Windows drive letters etc.).
  const safe = srtPath.replace(/:/g, '\\:').replace(/'/g, "\\'");
  await run('subtitles',
    ffmpeg(videoPath)
      .videoFilters([
        `subtitles='${safe}':force_style='FontName=Inter,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BackColour=&H88000000,BorderStyle=4,Outline=1,Shadow=0,Alignment=2,MarginV=48'`
      ])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset medium',
        '-crf 18',
        '-tune film',
        ...X264_THREADS,
        '-c:a copy',
        '-movflags +faststart',
      ])
      .output(outPath)
  );
  return outPath;
}

/** Extract a single JPEG frame at t=0.5s as the share-page poster. */
export async function extractPoster({ videoPath, outPath, width = 1280, height = 720 }) {
  await run('poster',
    ffmpeg(videoPath)
      .seekInput(0.5)
      .outputOptions(['-frames:v 1', '-q:v 3'])
      .videoFilters([`scale=${width}:${height}:force_original_aspect_ratio=decrease`])
      .output(outPath)
  );
  return outPath;
}

/** Probe a video file's duration (in seconds). */
export async function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data?.format?.duration || 0);
    });
  });
}
