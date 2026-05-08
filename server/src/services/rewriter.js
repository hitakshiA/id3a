/**
 * Prompt-rewriter agent. Sits between every casual user input and every model call.
 *
 *   in:  { target, userIntent, styleSheet, previousPrompt, sceneContext? }
 *   out: { prompt }   — production-grade, model-specific
 *
 * Why: a one-line user nudge ("make slide 3 darker") needs to become a properly
 * engineered Nano Banana / Veo / Lyria / TTS prompt that respects the project's
 * locked styleSheet and stays coherent with the previous prompt for that scene.
 *
 * We always go through Gemini 3.1 Flash (cheap + fast). The system prompt for
 * each target encodes the documented best-prompting vocabulary for that model
 * (drawn from the v4 prompt-engineering research doc).
 */

import { text } from './openrouter.js';

// We used to route the rewriter through a Flash variant for speed, but the
// flash-text route returned HTTP 400 ("not a valid model ID") on this account.
// Falling back to the verified default text model (Pro) — slightly slower but
// reliable, and still under a cent per call.

/* ─── target catalog ──────────────────────────────────────────────── */

const TARGETS = {
  /* Nano Banana 2 — text-rich INFOGRAPHIC slide */
  'nano-slide': {
    label: 'Nano Banana 2 (slide)',
    rules: `Write a single Nano Banana 2 image prompt for a TEXT-RICH INFOGRAPHIC pitch slide. Nano Banana 2 renders typography unusually well — lean into that.
- 16:9 aspect, no logos, no watermarks. Frame the whole image — no part of the layout will be cropped at render time.
- LEAD with a "STYLE LOCK:" block listing the project's palette, typography, film stock, lighting, texture. ≤ 60 words.
- THEN one paragraph (≤ 110 words) describing the layout. Pack it with TEXT:
  • one HEADLINE (200pt-feel, single quotes around the literal words),
  • one DECK / subtitle (60–80pt, single quotes, one short sentence),
  • 2–4 SUPPORTING CALLOUTS — each has a number, label, or short phrase in single quotes (e.g. '3 × cheaper', 'Stage 02', '1.2M readers'). Use connector lines, dotted rules, small icons, or bracketed numerals to anchor them.
  • optional small body line (≤ 12 words) for context, in single quotes.
- Compose like an editorial magazine spread or a corporate annual-report page — typography is the subject, not just decoration. Use Swiss-grid alignment, generous negative space around dense type, halftone or grain texture per the style sheet.
- If the previous prompt is provided, preserve its specific subject unless the user direction explicitly changes it.
- Anchor every text element in single quotes so Nano Banana 2 actually renders the words. Don't write "the word X" — write "'X'".
- Never over-decorate. Information density, not visual noise.`,
  },

  /* Nano Banana 2 — photographic b-roll keyframe (paired with slides) */
  'nano-keyframe-first': {
    label: 'Nano Banana 2 (first frame)',
    rules: `Write a single Nano Banana 2 image prompt for the OPENING frame of a 4-second b-roll clip.
- 16:9, photographic (not graphic). The "photographic plate that would accompany" the slide series.
- LEAD with a "STYLE LOCK:" block (palette, film stock, lighting, texture).
- THEN one paragraph: subject, camera (lens, f-stop, distance), action-at-rest, atmosphere.
- Anchor lighting consistent with the slide series — same warmth, same mood.
- The opening frame is composition + state; motion will be inferred by Veo from the last-frame difference.
- No text rendered in the image.`,
  },

  'nano-keyframe-last': {
    label: 'Nano Banana 2 (last frame)',
    rules: `Write a single Nano Banana 2 image prompt for the CLOSING frame of a 4-second b-roll clip.
- 16:9, photographic. Same subject and environment as the first frame, but evolved.
- LEAD with the same "STYLE LOCK:" block (must match the first-frame prompt).
- THEN one paragraph: how the subject/light/composition has changed — small, deliberate evolution Veo can interpolate (a turn of the head, a hand reaching, light shifting from blue to amber, dust catching the new key).
- Avoid impossible jumps. The end state must be a believable continuation of the start.
- No text rendered in the image.`,
  },

  /* Veo 3.1 — motion prompt that ties first→last frame */
  'veo-motion': {
    label: 'Veo 3.1 (motion)',
    rules: `Write a single Veo 3.1 motion prompt to interpolate a first frame and a last frame.
- Structure: [Camera Movement] + [Subject Action] + [Atmospheric Notes] + [Pacing].
- Camera vocabulary: "slow dolly in", "handheld push forward", "rack focus from foreground to background", "crane ascending", "tracking shot following".
- Atmospheric notes: "dust motes catch light", "lens flare in upper corner", "shallow depth of field softens background", "film grain breathing".
- Pacing: explicit duration + rhythm, e.g. "8 seconds, deliberate, no jump cuts" or "4 seconds, quick and punchy".
- LEAD with a one-line lighting/atmosphere lock matching the project styleSheet. Keep total prompt ≤ 90 words.
- Do NOT redescribe the frames — Veo sees them. Describe motion, camera, and feel only.`,
  },

  /* Lyria 3 — short sample for direction-picking */
  'lyria-sample': {
    label: 'Lyria 3 (sample, ~10s)',
    rules: `Write a single Lyria 3 prompt for a SHORT 8–12 second sample clip used to pick a musical direction.
- Output structure: Genre / Sub-genre / Instrumentation / Mood / Tempo (BPM) / Key / Dynamic arc / Duration.
- Keep instrumentation SPARSE and voice-friendly: minimal percussion, no aggressive transients, no vocals, leave the 1–3kHz band open for narration.
- Anchor tempo+key to the project styleSheet.
- Make the sample distinct from siblings via instrumentation or sub-genre, not by tempo (tempo stays consistent across samples).
- Cap the prompt at ~80 words.`,
  },

  /* Lyria 3 — full ~60s track in the chosen direction */
  'lyria-full': {
    label: 'Lyria 3 (full ~60s)',
    rules: `Expand a chosen Lyria sample direction into a full ~60-second cinematic underscore.
- Output structure: Genre / Sub-genre / Instrumentation / Mood / Tempo (BPM) / Key / Dynamic arc (per-section in seconds) / Duration.
- Build a deliberate arc: minimal intro, swell at the midpoint, soft outro.
- LOW-VOLUME background-friendly: -18 to -16 db ceiling, no vocals, no drum hits over -12 db, no transient stings.
- Keep mid-frequency space (1–3 kHz) clear for narration. Use the exact instrumentation language from the source sample.
- Cap the prompt at ~120 words.`,
  },

  /* Gemini 3.1 TTS — per-line narration steering */
  'tts': {
    label: 'Gemini TTS',
    rules: `Rewrite narration text with embedded TTS audio tags so Gemini 3.1 TTS reads it well.
- Keep the user's wording — only ADD tags. Allowed: [whispers] [determination] [enthusiasm] [pause:N] [breathy] [emphasis].
- Use tags sparingly: at most one per sentence. Pauses: [pause:1] between thoughts, [pause:2] before a punchline.
- Output plain text with inline tags. No JSON, no preamble.
- Voice + pacing must respect the project styleSheet voiceMood + pacing fields.`,
  },

  /* Gemini 3.1 Pro — narration line rewrite */
  'narration-edit': {
    label: 'Narration line rewrite',
    rules: `Rewrite a single narration line per the user's direction, preserving meaning + pitch tone + project styleSheet voiceMood.
- Output ONLY the rewritten line. No quotes, no preamble, no explanation.
- Keep word count within ±25% of the original unless the user direction explicitly says shorter / longer.
- One or two declarative sentences — never more. No headings, no lists, no quotes, no exclamations unless the original had one.`,
  },
};

/* ─── helpers ─────────────────────────────────────────────────────── */

function styleSheetBlock(s = {}) {
  const lines = [];
  if (s.palette)    lines.push(`palette: ${s.palette}`);
  if (s.typography) lines.push(`typography: ${s.typography}`);
  if (s.filmRef)    lines.push(`film: ${s.filmRef}`);
  if (s.lighting)   lines.push(`lighting: ${s.lighting}`);
  if (s.texture)    lines.push(`texture: ${s.texture}`);
  if (s.musicTempo) lines.push(`music tempo: ${s.musicTempo}`);
  if (s.musicKey)   lines.push(`music key: ${s.musicKey}`);
  if (s.pacing)     lines.push(`pacing: ${s.pacing}`);
  return lines.length ? lines.join('\n') : '(no style sheet locked yet — use neutral premium defaults)';
}

function buildSystemPrompt(target, ctx) {
  const t = TARGETS[target];
  if (!t) throw new Error(`unknown rewriter target: ${target}`);

  const sceneCtx = ctx.sceneContext
    ? `\nSCENE CONTEXT:\n${JSON.stringify(ctx.sceneContext, null, 2)}`
    : '';
  const prev = ctx.previousPrompt
    ? `\nPREVIOUS PROMPT (for continuity):\n${ctx.previousPrompt}`
    : '';
  const intent = ctx.userIntent
    ? `\nUSER NUDGE (translate this casual intent into model vocabulary):\n${ctx.userIntent}`
    : '';

  return `You are a prompt-engineering agent for ${t.label}.

RULES:
${t.rules}

PROJECT STYLE SHEET (locked, must respect):
${styleSheetBlock(ctx.styleSheet)}
${prev}${sceneCtx}${intent}

OUTPUT:
Just the engineered prompt. No JSON wrapper, no preamble like "Here is", no surrounding markdown.`;
}

/* ─── public API ──────────────────────────────────────────────────── */

/**
 * Rewrite a user's casual intent into a production-grade prompt for `target`.
 *
 * @param {object} args
 * @param {keyof TARGETS} args.target
 * @param {string} [args.userIntent]      — casual nudge ("make it more dramatic")
 * @param {object} [args.styleSheet]      — project.styleSheet
 * @param {string} [args.previousPrompt]  — last engineered prompt for this scene
 * @param {object} [args.sceneContext]    — { narration, visualKind, durationSec, neighborSummary? }
 * @returns {Promise<{prompt:string}>}
 */
export async function rewriteForModel({
  target,
  userIntent = '',
  styleSheet = {},
  previousPrompt = '',
  sceneContext = null,
} = {}) {
  if (!TARGETS[target]) throw new Error(`unknown rewriter target: ${target}`);
  const sys = buildSystemPrompt(target, { userIntent, styleSheet, previousPrompt, sceneContext });
  const r = await text(sys);
  if (!r.ok) throw new Error(`rewriter (${target}) failed: ${r.error}`);
  let out = (r.data || '').trim();
  // Strip markdown fences if Flash got chatty.
  if (out.startsWith('```')) {
    out = out.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  if (!out) throw new Error(`rewriter (${target}) returned empty output`);
  return { prompt: out };
}

export const rewriterTargets = Object.keys(TARGETS);
