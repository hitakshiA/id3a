import { structuredJSON } from './openrouter.js';

/**
 * Plan a pitch video from a seed + locked styleSheet + wizard answers.
 *
 * Returns: {
 *   totalSeconds, voiceName, musicPrompt,
 *   scenes: [{
 *     order, durationSec, narration, visualKind,
 *     visualPrompt, firstFramePrompt?, lastFramePrompt?, videoMotionPrompt?,
 *     engineeredVisualPrompt, engineeredFirstFramePrompt?, engineeredLastFramePrompt?, engineeredVideoMotionPrompt?,
 *   }],
 * }
 *
 * v4: planner now consumes the styleSheet and emits engineered prompts directly
 * so the very first slide draft already inherits palette/typography/film/lighting.
 */

const SCHEMA = {
  type: 'object',
  properties: {
    totalSeconds: { type: 'integer', minimum: 30, maximum: 180 },
    voiceName: { type: 'string', enum: ['Kore', 'Charon', 'Puck', 'Aoede'] },
    musicPrompt: { type: 'string' },
    scenes: {
      type: 'array',
      minItems: 4,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          durationSec: { type: 'integer', minimum: 4, maximum: 15 },
          narration: { type: 'string' },
          visualKind: { type: 'string', enum: ['slide', 'video'] },

          // author intent — short, plain language
          visualPrompt: { type: 'string' },
          firstFramePrompt: { type: 'string' },
          lastFramePrompt: { type: 'string' },
          videoMotionPrompt: { type: 'string' },

          // engineered prompts — style-locked, model-ready
          engineeredVisualPrompt: { type: 'string' },
          engineeredFirstFramePrompt: { type: 'string' },
          engineeredLastFramePrompt: { type: 'string' },
          engineeredVideoMotionPrompt: { type: 'string' },
        },
        required: ['order', 'durationSec', 'narration', 'visualKind', 'visualPrompt', 'engineeredVisualPrompt'],
      },
    },
  },
  required: ['totalSeconds', 'voiceName', 'musicPrompt', 'scenes'],
};

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
  if (s.voiceName)  lines.push(`voice: ${s.voiceName}`);
  return lines.length ? lines.join('\n') : '(no style sheet — use neutral premium defaults)';
}

function buildPrompt(seedPrompt, styleSheet, wizardAnswers) {
  const a = wizardAnswers || {};
  const lengthSec = Number(a.lengthSec) || 60;
  const targetScenes = lengthSec <= 60 ? '4-5' : lengthSec <= 90 ? '5-7' : '6-8';

  return `Plan a ${lengthSec}-second narrated pitch video.

SEED IDEA:
"${seedPrompt}"

USER INTAKE:
- audience: ${a.audience || '(unspecified)'}
- tone: ${a.tone || '(unspecified)'}
- key points: ${(a.keyPoints || []).join(' / ') || '(unspecified)'}
- visual aesthetic: ${a.visualAesthetic || '(unspecified)'}
- voice mood: ${a.voiceMood || '(unspecified)'}
- music vibe: ${a.musicVibe || '(unspecified)'}

LOCKED STYLE SHEET (every engineered prompt MUST respect this):
${styleSheetBlock(styleSheet)}

OUTPUT a pitch plan with ${targetScenes} scenes. The default is SLIDE (typographic / editorial poster). At most 2 scenes total may be VIDEO (photographic b-roll) — reserve those for the highest-impact moments (typically the opening hook and one turning point). Every other scene must be a SLIDE. Total durations should sum to roughly ${lengthSec}s.

For EACH scene produce:
- order: 0-indexed
- durationSec: 4–12
- narration: 1–2 declarative spoken sentences. Conversational, no headings, no quotes, no startup jargon. Honor the voice mood + pacing.
- visualKind: 'slide' or 'video'
- visualPrompt: short plain-language description (the author's intent), 12–25 words
- engineeredVisualPrompt: production-grade Nano Banana 2 prompt for this scene's slide. LEAD with a "STYLE LOCK:" block (palette, typography, film, lighting, texture from the style sheet). THEN one paragraph (≤110 words) describing the layout. For SLIDE scenes, treat each slide as a TEXT-RICH editorial INFOGRAPHIC: pack it with a HEADLINE, a DECK/subtitle, AND 2–4 supporting CALLOUTS (numbers, labels, short phrases — e.g. '3 × cheaper', 'Stage 02', '1.2M readers'). Use connector lines, dotted rules, small bracketed numerals, or an icon glyph to anchor each callout. Magazine/annual-report feel, Swiss-grid alignment, generous negative space, halftone texture. ALWAYS wrap any literal text in single quotes (don't say "the word X" — write "'X'") so the model actually renders it. For VIDEO scenes, this prompt is unused — but still emit a placeholder that describes the still-frame vibe.

For VIDEO scenes ONLY, also produce:
- firstFramePrompt: short plain-language opening-still description
- lastFramePrompt: short plain-language closing-still description
- videoMotionPrompt: short plain-language motion description (camera + subject action)
- engineeredFirstFramePrompt: Nano Banana 2 prompt for the OPENING b-roll keyframe (photographic, 16:9, STYLE LOCK preamble matching the slide series)
- engineeredLastFramePrompt: matching closing keyframe — same style lock, evolved subject/light, believable continuation Veo can interpolate
- engineeredVideoMotionPrompt: Veo 3.1 motion prompt — [Camera] + [Subject Action] + [Atmosphere] + [Pacing], ≤90 words. Do NOT redescribe the frames; describe motion + camera + feel only.

Pick ONE narrator voice (use ${styleSheet?.voiceName || 'Kore'} unless the tone clearly demands otherwise) and ONE musicPrompt (genre, BPM ≈ ${styleSheet?.musicTempo || '70-80 BPM'}, key ≈ ${styleSheet?.musicKey || 'A minor'}, low-volume voice-friendly instrumentation, no vocals).

Be specific, human, emotionally honest. Make the engineered prompts feel like a senior art director wrote them.`;
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return 'no plan returned';
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 1) return 'no scenes in plan';
  if (typeof plan.totalSeconds !== 'number') plan.totalSeconds = 60;
  if (!plan.voiceName) plan.voiceName = 'Kore';
  if (!plan.musicPrompt) plan.musicPrompt = 'gentle cinematic instrumental, hopeful, 80 BPM, in C major';

  plan.scenes.forEach((s, i) => {
    if (typeof s.order !== 'number') s.order = i;
    if (typeof s.durationSec !== 'number') s.durationSec = 6;
    if (!s.narration) s.narration = '';
    if (!s.visualKind) s.visualKind = 'slide';
    if (!s.visualPrompt) s.visualPrompt = '';
    if (!s.engineeredVisualPrompt) s.engineeredVisualPrompt = s.visualPrompt;
    if (s.visualKind === 'video') {
      if (!s.firstFramePrompt) s.firstFramePrompt = `${s.visualPrompt} — opening still`;
      if (!s.lastFramePrompt)  s.lastFramePrompt  = `${s.visualPrompt} — closing still`;
      if (!s.videoMotionPrompt) s.videoMotionPrompt = 'gentle camera push, atmospheric, 4 seconds';
      if (!s.engineeredFirstFramePrompt) s.engineeredFirstFramePrompt = s.firstFramePrompt;
      if (!s.engineeredLastFramePrompt)  s.engineeredLastFramePrompt  = s.lastFramePrompt;
      if (!s.engineeredVideoMotionPrompt) s.engineeredVideoMotionPrompt = s.videoMotionPrompt;
    }
  });

  // Hard cap: at most 2 VIDEO scenes per project — Veo is the most expensive
  // call ($0.10/clip) and 2 is the right balance of motion vs. spend. Any
  // extras the model produced get demoted to slides, with their video-only
  // fields cleared so the render pipeline doesn't try to film them.
  const MAX_VIDEO = 2;
  let videoCount = 0;
  plan.scenes.forEach((s) => {
    if (s.visualKind !== 'video') return;
    if (videoCount < MAX_VIDEO) { videoCount += 1; return; }
    // Demote.
    s.visualKind = 'slide';
    s.firstFramePrompt = '';
    s.lastFramePrompt = '';
    s.videoMotionPrompt = '';
    s.engineeredFirstFramePrompt = '';
    s.engineeredLastFramePrompt = '';
    s.engineeredVideoMotionPrompt = '';
  });

  return null;
}

/**
 * Plan a pitch.
 *
 * @param {string} seedPrompt
 * @param {object} [opts]
 * @param {object} [opts.styleSheet]
 * @param {object} [opts.wizardAnswers]
 * @returns {Promise<object>}
 */
export async function planPitch(seedPrompt, opts = {}) {
  const { styleSheet = {}, wizardAnswers = {} } = opts;
  const prompt = buildPrompt(seedPrompt, styleSheet, wizardAnswers);

  // Strict first.
  let r = await structuredJSON(prompt, SCHEMA, { name: 'pitch_plan' });
  if (r.ok) {
    const issue = validatePlan(r.data);
    if (!issue) {
      r.data.scenes.sort((a, b) => a.order - b.order);
      return r.data;
    }
    console.warn('[planner] strict plan invalid:', issue, '— retrying without strict');
  } else {
    console.warn('[planner] strict attempt failed:', r.error, '— retrying without strict');
  }

  // Loosen.
  r = await structuredJSON(prompt, SCHEMA, { name: 'pitch_plan', strict: false });
  if (!r.ok) throw new Error(r.error || 'planning failed');
  const issue = validatePlan(r.data);
  if (issue) throw new Error(`planner output invalid: ${issue}`);
  r.data.scenes.sort((a, b) => a.order - b.order);
  return r.data;
}
