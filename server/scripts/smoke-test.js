// End-to-end smoke test against OpenRouter for every model id3a uses.
// Cheapest call first, most expensive last. Bails on any failure.
//
//   1. Text generation         · Gemini 3.1 Pro              ~$0.001
//   2. Structured output       · Gemini 3.1 Pro + JSON       ~$0.01
//   3. TTS                     · Gemini 3.1 Flash TTS         ~$0.001
//   4. Image                   · Nano Banana 2                ~$0.04
//   5. Music                   · Lyria 3 Clip                 ~$0.04
//   6. Video w/ keyframes      · Veo 3.1 Fast                 ~$0.20-0.40

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY missing'); process.exit(1); }

const OUT = '/tmp/id3a-smoke';
await fs.mkdir(OUT, { recursive: true });

function header() {
  return {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/hitakshiA/id3a',
    'X-Title': 'id3a smoke test',
  };
}

const start = Date.now();
const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;
function step(n, name) { console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[${n}] ${name}  (t+${elapsed()})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

// ─────────────────────────────────────────────────────────
// 1 · Text generation (cheapest canary)
// ─────────────────────────────────────────────────────────
step(1, 'Text generation · google/gemini-3.1-pro-preview');
{
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: header(),
    body: JSON.stringify({
      model: 'google/gemini-3.1-pro-preview',
      messages: [{ role: 'user', content: 'In one short sentence, what is a startup pitch?' }],
    }),
  });
  if (!r.ok) fail(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content || '';
  if (!text) fail('empty response');
  ok(`got ${text.length} chars`);
  ok(`reply: "${text.slice(0, 120).replace(/\n/g, ' ')}"`);
  ok(`tokens — in:${j.usage?.prompt_tokens} out:${j.usage?.completion_tokens}`);
}

// ─────────────────────────────────────────────────────────
// 2 · Structured output (the scene planner)
// ─────────────────────────────────────────────────────────
step(2, 'Structured output · scene plan as JSON schema');
let scenePlan;
{
  const schema = {
    type: 'object',
    properties: {
      totalSeconds: { type: 'integer', minimum: 30, maximum: 180 },
      voiceName: { type: 'string', enum: ['Kore', 'Charon', 'Puck', 'Aoede'] },
      musicPrompt: { type: 'string' },
      scenes: {
        type: 'array',
        minItems: 3, maxItems: 5,
        items: {
          type: 'object',
          properties: {
            order: { type: 'integer' },
            durationSec: { type: 'integer', minimum: 4, maximum: 15 },
            narration: { type: 'string' },
            visualKind: { type: 'string', enum: ['slide', 'video'] },
            visualPrompt: { type: 'string' },
          },
          required: ['order', 'durationSec', 'narration', 'visualKind', 'visualPrompt'],
        },
      },
    },
    required: ['totalSeconds', 'voiceName', 'musicPrompt', 'scenes'],
  };

  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: header(),
    body: JSON.stringify({
      model: 'google/gemini-3.1-pro-preview',
      messages: [{
        role: 'user',
        content: 'Plan a 30-45 second pitch video for: "a nursery for street animals". Keep it to 3-4 scenes. Mix slides and short b-roll videos.',
      }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'pitch_plan', strict: true, schema },
      },
    }),
  });
  if (!r.ok) fail(`HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content || '';
  try { scenePlan = JSON.parse(raw); } catch (e) { fail(`not valid JSON: ${raw.slice(0, 200)}`); }
  ok(`got plan: ${scenePlan.scenes.length} scenes, ${scenePlan.totalSeconds}s, voice=${scenePlan.voiceName}`);
  ok(`first scene narration: "${scenePlan.scenes[0].narration.slice(0, 100)}…"`);
  ok(`music prompt: "${scenePlan.musicPrompt.slice(0, 100)}…"`);
}

// ─────────────────────────────────────────────────────────
// 3 · TTS (cheapest audio call)
// ─────────────────────────────────────────────────────────
step(3, 'TTS · google/gemini-3.1-flash-tts-preview');
{
  // Gemini TTS via OpenRouter ONLY accepts pcm (raw 24kHz/16-bit/mono).
  // We wrap it in a WAV header so it's playable as-is.
  const r = await fetch(`${API}/audio/speech`, {
    method: 'POST',
    headers: header(),
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-tts-preview',
      input: 'Welcome to id3a. Type any idea, watch it become a pitch video.',
      voice: 'Kore',
      response_format: 'pcm',
    }),
  });
  if (!r.ok) fail(`HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const pcm = Buffer.from(await r.arrayBuffer());

  // Build a minimal RIFF/WAVE header for 24kHz 16-bit mono PCM.
  function wavHeader(pcmLen, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const buf = Buffer.alloc(44);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + pcmLen, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);          // PCM chunk size
    buf.writeUInt16LE(1, 20);           // PCM format
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(blockAlign, 32);
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(pcmLen, 40);
    return buf;
  }
  const wav = Buffer.concat([wavHeader(pcm.length), pcm]);
  const file = path.join(OUT, 'tts.wav');
  await fs.writeFile(file, wav);
  ok(`pcm bytes=${pcm.length}, wav bytes=${wav.length}`);
  ok(`wrote ${file}  (~${(pcm.length / 48000).toFixed(1)}s @ 24kHz mono)`);
  ok(`generation id: ${r.headers.get('x-generation-id') || 'n/a'}`);
}

// ─────────────────────────────────────────────────────────
// 4 · Image generation (Nano Banana 2)
// ─────────────────────────────────────────────────────────
step(4, 'Image · google/gemini-3.1-flash-image-preview (Nano Banana 2)');
let firstFrameDataUrl;
{
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: header(),
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      messages: [{
        role: 'user',
        content: 'A warm, hopeful editorial illustration: a cozy nursery for street animals, gentle morning light, no text.',
      }],
      modalities: ['image', 'text'],
    }),
  });
  if (!r.ok) fail(`HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const j = await r.json();
  const msg = j.choices?.[0]?.message || {};
  const images = msg.images || [];
  if (!images.length) fail(`no images in response. message: ${JSON.stringify(msg).slice(0, 400)}`);
  firstFrameDataUrl = images[0].image_url?.url || images[0].url;
  if (!firstFrameDataUrl?.startsWith('data:')) fail(`unexpected image url shape: ${String(firstFrameDataUrl).slice(0, 80)}`);
  const [, mime, , b64] = firstFrameDataUrl.match(/^data:([^;]+);(base64),(.*)$/) || [];
  const buf = Buffer.from(b64, 'base64');
  const file = path.join(OUT, 'image.png');
  await fs.writeFile(file, buf);
  ok(`mime=${mime} bytes=${buf.length}`);
  ok(`wrote ${file}`);
}

// ─────────────────────────────────────────────────────────
// 5 · Music · Lyria 3 Clip (30s, $0.04)
// ─────────────────────────────────────────────────────────
step(5, 'Music · google/lyria-3-clip-preview (SSE-streamed audio)');
{
  // Audio output through /chat/completions requires stream: true on OpenRouter.
  // We accumulate delta.audio.data (base64) chunks across SSE frames.
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { ...header(), Accept: 'text/event-stream' },
    body: JSON.stringify({
      model: 'google/lyria-3-clip-preview',
      messages: [{
        role: 'user',
        content: 'A warm, hopeful instrumental cue: solo piano with strings, 80 BPM, in C major, gentle and uplifting. Instrumental only.',
      }],
      modalities: ['audio', 'text'],
      stream: true,
      audio: { format: 'mp3', voice: 'default' }, // OpenAI-compatible audio config
    }),
  });
  if (!r.ok) fail(`HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const audioChunks = [];
  let mime = 'audio/mp3';
  let transcript = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta || {};
        if (delta.audio?.data) audioChunks.push(delta.audio.data);
        if (delta.audio?.format) mime = `audio/${delta.audio.format}`;
        if (delta.audio?.transcript) transcript += delta.audio.transcript;
      } catch { /* ignore parse errors on partial chunks */ }
    }
  }

  if (!audioChunks.length) fail('SSE finished with zero audio chunks');
  const buf = Buffer.concat(audioChunks.map(b => Buffer.from(b, 'base64')));
  const ext = mime.includes('wav') ? 'wav' : 'mp3';
  const file = path.join(OUT, `music.${ext}`);
  await fs.writeFile(file, buf);
  ok(`${audioChunks.length} chunks, mime=${mime}, total bytes=${buf.length}`);
  if (transcript) ok(`transcript: "${transcript.slice(0, 100)}…"`);
  ok(`wrote ${file}`);
}

// ─────────────────────────────────────────────────────────
// 6 · Video with first+last frame (most expensive)
// ─────────────────────────────────────────────────────────
step(6, 'Video · google/veo-3.1-fast with first+last frame keyframes');
{
  // Reuse the image we generated as both first and last frame for testing.
  // (In real product, we generate two distinct keyframes.)
  const r = await fetch(`${API}/videos`, {
    method: 'POST',
    headers: header(),
    body: JSON.stringify({
      model: 'google/veo-3.1-fast',
      prompt: 'A gentle camera push-in over the cozy nursery scene, warm morning light, peaceful atmosphere.',
      aspect_ratio: '16:9',
      duration: 4,
      resolution: '720p',
      generate_audio: false,  // we'll add our own narration + music
      frame_images: [
        { type: 'image_url', frame_type: 'first_frame', image_url: { url: firstFrameDataUrl } },
        { type: 'image_url', frame_type: 'last_frame',  image_url: { url: firstFrameDataUrl } },
      ],
    }),
  });
  const submitText = await r.text();
  if (!r.ok) fail(`submit HTTP ${r.status}: ${submitText.slice(0, 600)}`);
  const submit = JSON.parse(submitText);
  ok(`job submitted: id=${submit.id} status=${submit.status || 'queued'}`);

  const pollUrl = submit.polling_url || `${API}/videos/${submit.id}`;
  const submitTime = Date.now();
  let videoUrl;

  while (true) {
    if (Date.now() - submitTime > 5 * 60 * 1000) fail('video gen timed out after 5 minutes');
    await new Promise(r => setTimeout(r, 6000));
    const pr = await fetch(pollUrl, { headers: header() });
    if (!pr.ok) fail(`poll HTTP ${pr.status}: ${(await pr.text()).slice(0, 300)}`);
    const ps = await pr.json();
    process.stdout.write(`  · poll: ${ps.status} (t+${elapsed()})\n`);
    if (ps.status === 'completed' || ps.status === 'succeeded') {
      videoUrl = ps.unsigned_urls?.[0] || ps.urls?.[0] || ps.output?.[0]?.url || ps.video_url;
      if (!videoUrl) {
        console.log('  full poll response:', JSON.stringify(ps, null, 2).slice(0, 1200));
        fail('completed but no video url');
      }
      break;
    }
    if (ps.status === 'failed' || ps.status === 'error') fail(`gen failed: ${ps.error || JSON.stringify(ps).slice(0, 300)}`);
  }

  ok(`completed, downloading from ${videoUrl.slice(0, 80)}…`);
  // OpenRouter's "unsigned_urls" point back to its API and require auth.
  const dr = await fetch(videoUrl, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!dr.ok) fail(`download HTTP ${dr.status}: ${(await dr.text()).slice(0, 200)}`);
  const buf = Buffer.from(await dr.arrayBuffer());
  const file = path.join(OUT, 'video.mp4');
  await fs.writeFile(file, buf);
  ok(`wrote ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nALL ENDPOINTS PASS · total wallclock ${elapsed()}\nartifacts in ${OUT}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
