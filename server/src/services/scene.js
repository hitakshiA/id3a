import { image as genImage, ttsBuffer } from './openrouter.js';
import { rewriteForModel } from './rewriter.js';

/**
 * Scene-level edits. Every regen routes the user's casual *direction* through
 * the prompt-rewriter (Gemini Flash) along with the project styleSheet + the
 * scene's last engineered prompt, then sends the rewriter's output to Nano
 * Banana 2. We persist BOTH the casual direction and the engineered prompt so
 * users can audit what the agent did.
 *
 * Each function returns: { image: {mime, base64}, engineeredPrompt }
 */

function sceneCtx(scene) {
  return {
    narration: scene.narration,
    visualKind: scene.visualKind,
    durationSec: scene.durationSec,
    intent: scene.visualPrompt,
  };
}

/** Regenerate the slide image. */
export async function regenerateSlide(scene, project, direction = '') {
  const { prompt } = await rewriteForModel({
    target: 'nano-slide',
    userIntent: direction,
    styleSheet: project?.styleSheet || {},
    previousPrompt: scene.engineeredVisualPrompt || scene.visualPrompt || '',
    sceneContext: sceneCtx(scene),
  });
  const r = await genImage(prompt);
  if (!r.ok) throw new Error(r.error);
  return {
    image: { mime: r.mimeType, base64: r.data },
    engineeredPrompt: prompt,
  };
}

export async function regenerateFirstFrame(scene, project, direction = '') {
  const { prompt } = await rewriteForModel({
    target: 'nano-keyframe-first',
    userIntent: direction,
    styleSheet: project?.styleSheet || {},
    previousPrompt: scene.engineeredFirstFramePrompt || scene.firstFramePrompt || scene.visualPrompt || '',
    sceneContext: sceneCtx(scene),
  });
  const r = await genImage(prompt);
  if (!r.ok) throw new Error(r.error);
  return {
    image: { mime: r.mimeType, base64: r.data },
    engineeredPrompt: prompt,
  };
}

export async function regenerateLastFrame(scene, project, direction = '') {
  const { prompt } = await rewriteForModel({
    target: 'nano-keyframe-last',
    userIntent: direction,
    styleSheet: project?.styleSheet || {},
    previousPrompt: scene.engineeredLastFramePrompt || scene.lastFramePrompt || scene.visualPrompt || '',
    sceneContext: sceneCtx(scene),
  });
  const r = await genImage(prompt);
  if (!r.ok) throw new Error(r.error);
  return {
    image: { mime: r.mimeType, base64: r.data },
    engineeredPrompt: prompt,
  };
}

/**
 * Re-engineer the Veo motion prompt for a video scene. Doesn't generate video
 * here — just produces the engineered text the render pipeline will send Veo.
 */
export async function rewriteVeoMotion(scene, project, direction = '') {
  const { prompt } = await rewriteForModel({
    target: 'veo-motion',
    userIntent: direction,
    styleSheet: project?.styleSheet || {},
    previousPrompt: scene.engineeredVideoMotionPrompt || scene.videoMotionPrompt || '',
    sceneContext: sceneCtx(scene),
  });
  return { engineeredPrompt: prompt };
}

/**
 * Rewrite a narration line in the project's voice mood + pacing.
 * Returns the rewritten line (no audio tags — those are added at render time
 * by the 'tts' rewriter target).
 */
export async function rewriteNarrationLine(scene, project, direction = '') {
  const { prompt } = await rewriteForModel({
    target: 'narration-edit',
    userIntent: direction,
    styleSheet: project?.styleSheet || {},
    previousPrompt: scene.narration || '',
    sceneContext: { ...sceneCtx(scene), original: scene.narration },
  });
  return { line: prompt };
}

/** Quick TTS preview for a single scene — returns Buffer, never persisted. */
export async function previewSceneVoice(scene, voiceName) {
  if (!scene.narration?.trim()) throw new Error('no narration to speak');
  return ttsBuffer(scene.narration, { voice: voiceName || 'Kore' });
}
