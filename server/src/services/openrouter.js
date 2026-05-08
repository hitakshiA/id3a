/**
 * OpenRouter wrapper. All shapes verified against live API on 2026-05-03.
 *
 *   text(prompt)             → Gemini 3.1 Pro plain text
 *   structuredJSON(p, schema)→ Gemini 3.1 Pro with response_format json_schema
 *   image(prompt, refs?)     → Nano Banana 2 (gemini-3.1-flash-image-preview)
 *   tts(text, voice)         → Gemini 3.1 Flash TTS (PCM, wrapped in WAV header)
 *   music(prompt)            → Lyria 3 Clip (SSE-streamed audio)
 *   video({...})             → Veo 3.1 Fast async + poll + download
 *
 * Single API base, single bearer token. Every method returns a normalized
 * shape: {ok, kind, data, mimeType?} on success or {ok:false, error}.
 */

import { env } from '../env.js';

const API = 'https://openrouter.ai/api/v1';

function authHeaders() {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/hitakshiA/id3a',
    'X-Title': 'id3a',
  };
}

async function asJson(r) {
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 400) || r.statusText}`);
  }
  return r.json();
}

const MODELS = {
  text:  'google/gemini-3.1-pro-preview',
  image: 'google/gemini-3.1-flash-image-preview:nitro',
  video: 'google/veo-3.1-fast',
  music: 'google/lyria-3-clip-preview',
  tts:   'google/gemini-3.1-flash-tts-preview',
};

/* ─── 1. Plain text ────────────────────────────────────────── */
export async function text(prompt, { model = MODELS.text } = {}) {
  try {
    const r = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await asJson(r);
    const out = j.choices?.[0]?.message?.content || '';
    return { ok: true, kind: 'text', data: out };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ─── 2. Structured JSON via response_format ───────────────── */
export async function structuredJSON(prompt, jsonSchema, { name = 'output', model = MODELS.text, strict = true } = {}) {
  try {
    const r = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: { name, strict, schema: jsonSchema },
        },
      }),
    });
    const j = await asJson(r);
    const msg = j.choices?.[0]?.message || {};
    // Some Gemini 3.x preview routes occasionally put structured output in a
    // `reasoning` field instead of `content`. Be liberal about where we look.
    let raw = msg.content || msg.reasoning || '';
    if (!raw && Array.isArray(msg.content)) {
      raw = msg.content.map((p) => p.text || '').join('');
    }
    if (!raw) {
      console.warn('[openrouter] empty content. full message:', JSON.stringify(msg).slice(0, 600));
      throw new Error('model returned no content');
    }
    // Strip markdown fences if the model wrapped the JSON.
    raw = raw.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let data;
    try { data = JSON.parse(raw); }
    catch (e) {
      console.warn('[openrouter] JSON.parse failed. raw[0:400]:', raw.slice(0, 400));
      throw new Error('model returned non-JSON output');
    }
    return { ok: true, kind: 'json', data };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ─── 3. Image (Nano Banana 2) ─────────────────────────────── */
async function _imageOnce(model, prompt, references) {
  const content = [{ type: 'text', text: prompt }];
  for (const ref of references) {
    content.push({ type: 'image_url', image_url: { url: ref } });
  }
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 400) || r.statusText}`);
  }
  const j = await r.json();
  const msg = j.choices?.[0]?.message;
  const img = msg?.images?.[0]?.image_url?.url;
  if (!img?.startsWith('data:')) throw new Error('no image in response');
  const m = img.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('malformed data url');
  return { ok: true, kind: 'image', data: m[2], mimeType: m[1] };
}

export async function image(prompt, { references = [], aspectRatio = '16:9' } = {}) {
  // We default to the :nitro variant for fastest provider routing on OpenRouter.
  // If that ID is rejected (some accounts can't access nitro routing), fall
  // back to the plain model id once before surfacing the error.
  try {
    return await _imageOnce(MODELS.image, prompt, references);
  } catch (e) {
    const msg = e.message || '';
    const looksLikeBadId = /not a valid model id|model_not_found|invalid model/i.test(msg);
    const fallback = MODELS.image.replace(/:[a-z]+$/i, '');
    if (looksLikeBadId && fallback !== MODELS.image) {
      console.warn(`[openrouter] image ${MODELS.image} rejected, retrying with ${fallback}`);
      try { return await _imageOnce(fallback, prompt, references); }
      catch (e2) { return { ok: false, error: e2.message }; }
    }
    return { ok: false, error: msg };
  }
}

/* ─── 4. TTS — returns base64 WAV (PCM wrapped in RIFF header) */
function wavHeader(pcmLen, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + pcmLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(pcmLen, 40);
  return buf;
}

export async function tts(text, { voice = 'Kore' } = {}) {
  try {
    const r = await fetch(`${API}/audio/speech`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODELS.tts,
        input: text,
        voice,
        response_format: 'pcm',
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
    }
    const pcm = Buffer.from(await r.arrayBuffer());
    const wav = Buffer.concat([wavHeader(pcm.length), pcm]);
    return { ok: true, kind: 'audio', data: wav.toString('base64'), mimeType: 'audio/wav' };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** TTS that returns the raw WAV Buffer (used by the FFmpeg pipeline). */
export async function ttsBuffer(text, opts) {
  const r = await tts(text, opts);
  if (!r.ok) throw new Error(r.error);
  return Buffer.from(r.data, 'base64');
}

/* ─── 5. Music — Lyria via SSE-streamed chat completion ────── */
export async function music(prompt, { model = MODELS.music } = {}) {
  try {
    const r = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { ...authHeaders(), Accept: 'text/event-stream' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['audio', 'text'],
        stream: true,
        audio: { format: 'mp3', voice: 'default' },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const chunks = [];
    let mime = 'audio/mp3';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta || {};
          if (delta.audio?.data) chunks.push(delta.audio.data);
          if (delta.audio?.format) mime = `audio/${delta.audio.format}`;
        } catch {}
      }
    }
    if (!chunks.length) throw new Error('no audio chunks');
    const merged = Buffer.concat(chunks.map(b => Buffer.from(b, 'base64')));
    return { ok: true, kind: 'audio', data: merged.toString('base64'), mimeType: mime };
  } catch (e) { return { ok: false, error: e.message }; }
}

export async function musicBuffer(prompt, opts) {
  const r = await music(prompt, opts);
  if (!r.ok) throw new Error(r.error);
  return { buffer: Buffer.from(r.data, 'base64'), mimeType: r.mimeType };
}

/* ─── 6. Video — Veo 3.1 Fast w/ first+last frame ──────────── */
export async function video({
  prompt,
  firstFrameDataUrl,
  lastFrameDataUrl,
  aspectRatio = '16:9',
  duration = 4,
  resolution = '720p',
  pollIntervalMs = 6000,
  maxWaitMs = 5 * 60 * 1000,
} = {}) {
  try {
    if (!firstFrameDataUrl || !lastFrameDataUrl) throw new Error('first+last frame required');
    const submit = await fetch(`${API}/videos`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODELS.video,
        prompt,
        aspect_ratio: aspectRatio,
        duration,
        resolution,
        generate_audio: false,
        frame_images: [
          { type: 'image_url', frame_type: 'first_frame', image_url: { url: firstFrameDataUrl } },
          { type: 'image_url', frame_type: 'last_frame',  image_url: { url: lastFrameDataUrl  } },
        ],
      }),
    });
    if (!submit.ok) {
      const t = await submit.text();
      throw new Error(`submit ${submit.status}: ${t.slice(0, 400)}`);
    }
    const { id, polling_url } = await submit.json();
    const poll = polling_url || `${API}/videos/${id}`;
    const start = Date.now();
    let videoUrl;
    while (true) {
      if (Date.now() - start > maxWaitMs) throw new Error('video gen timed out');
      await new Promise(r => setTimeout(r, pollIntervalMs));
      const pr = await fetch(poll, { headers: authHeaders() });
      if (!pr.ok) throw new Error(`poll ${pr.status}`);
      const ps = await pr.json();
      if (ps.status === 'completed' || ps.status === 'succeeded') {
        videoUrl = ps.unsigned_urls?.[0] || ps.urls?.[0] || ps.video_url;
        if (!videoUrl) throw new Error('completed but no video url');
        break;
      }
      if (ps.status === 'failed' || ps.status === 'error') throw new Error(ps.error || 'gen failed');
    }
    const dl = await fetch(videoUrl, { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
    if (!dl.ok) throw new Error(`download ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    return { ok: true, kind: 'video', data: buf.toString('base64'), mimeType: 'video/mp4', sizeBytes: buf.length };
  } catch (e) { return { ok: false, error: e.message }; }
}

export async function videoBuffer(opts) {
  const r = await video(opts);
  if (!r.ok) throw new Error(r.error);
  return Buffer.from(r.data, 'base64');
}

export const models = MODELS;
