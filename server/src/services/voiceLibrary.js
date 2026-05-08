/**
 * Voice library: pre-generates one TTS sample per supported voice and writes it
 * to disk so the editor can audition voices without a per-click API call.
 *
 * Idempotent — only generates WAVs that aren't already on disk. Run once at
 * server boot via the index.js boot hook.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tts } from './openrouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICES_DIR = path.resolve(__dirname, '../../public/voices');

const SAMPLE_SCRIPT =
  'id3a turns one sentence into a sixty-second pitch video. ' +
  'Type the line, watch it become art.';

export const VOICES = [
  { name: 'Kore',   blurb: 'Warm, approachable. The default — friendly without being saccharine.' },
  { name: 'Charon', blurb: 'Deeper, authoritative. Newsroom cadence. Best for serious or investigative pitches.' },
  { name: 'Puck',   blurb: 'Lighter, energetic. Younger feel. Plays well with disruptive or playful brands.' },
  { name: 'Aoede',  blurb: 'Lyrical, expressive range. Good for emotional beats and storytelling.' },
];

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Returns the on-disk path for a voice's sample WAV. */
export function voiceSamplePath(voiceName) {
  return path.join(VOICES_DIR, `${voiceName.toLowerCase()}.wav`);
}

/** Returns the URL the client should use to play a voice sample. */
export function voiceSampleUrl(voiceName) {
  return `/voices/${voiceName.toLowerCase()}.wav`;
}

/**
 * Generate any missing voice samples. Runs in parallel; per-voice failures are
 * logged but do not abort the others.
 */
export async function seedVoiceSamples({ force = false } = {}) {
  await ensureDir(VOICES_DIR);
  const results = await Promise.allSettled(
    VOICES.map(async (v) => {
      const file = voiceSamplePath(v.name);
      if (!force && (await fileExists(file))) {
        return { voice: v.name, status: 'cached' };
      }
      const r = await tts(SAMPLE_SCRIPT, { voice: v.name });
      if (!r.ok) throw new Error(r.error);
      const wav = Buffer.from(r.data, 'base64');
      await fs.writeFile(file, wav);
      return { voice: v.name, status: 'generated', bytes: wav.length };
    })
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[voiceLibrary] seed failed:', r.reason?.message || r.reason);
    } else if (r.value.status === 'generated') {
      console.log(`[voiceLibrary] generated ${r.value.voice} sample (${r.value.bytes} bytes)`);
    }
  }
}

/** Public catalog payload for `GET /api/voices`. */
export function voiceCatalog() {
  return VOICES.map((v) => ({
    name: v.name,
    blurb: v.blurb,
    sampleUrl: voiceSampleUrl(v.name),
  }));
}
