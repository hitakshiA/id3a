import { Router } from 'express';
import { z } from 'zod';
import Project from '../models/Project.js';
import Scene from '../models/Scene.js';
import { requireAuth } from '../auth/middleware.js';
import {
  regenerateSlide,
  regenerateFirstFrame,
  regenerateLastFrame,
  rewriteVeoMotion,
  rewriteNarrationLine,
  previewSceneVoice,
} from '../services/scene.js';

const router = Router();
router.use(requireAuth);

async function loadOwnedScene(req, res) {
  const scene = await Scene.findById(req.params.id);
  if (!scene) { res.status(404).json({ error: 'not found' }); return null; }
  const project = await Project.findById(scene.projectId);
  if (!project || String(project.userId) !== String(req.user._id)) {
    res.status(404).json({ error: 'not found' }); return null;
  }
  return { scene, project };
}

const patchSchema = z.object({
  narration: z.string().max(2000).optional(),
  durationSec: z.number().int().min(4).max(15).optional(),
  visualPrompt: z.string().max(1000).optional(),
  firstFramePrompt: z.string().max(1000).optional(),
  lastFramePrompt: z.string().max(1000).optional(),
  videoMotionPrompt: z.string().max(1000).optional(),
});

router.patch('/:id', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid update' });
  Object.assign(owned.scene, parsed.data);
  await owned.scene.save();
  res.json({ scene: owned.scene });
});

const regenSchema = z.object({
  target: z.enum(['slide', 'firstFrame', 'lastFrame']),
  direction: z.string().max(500).optional(),
});

router.post('/:id/regenerate', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  const parsed = regenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid' });
  const { target, direction = '' } = parsed.data;
  try {
    let result;
    if (target === 'slide')      result = await regenerateSlide(owned.scene, owned.project, direction);
    if (target === 'firstFrame') result = await regenerateFirstFrame(owned.scene, owned.project, direction);
    if (target === 'lastFrame')  result = await regenerateLastFrame(owned.scene, owned.project, direction);

    if (target === 'slide') {
      owned.scene.slideImage = result.image;
      owned.scene.engineeredVisualPrompt = result.engineeredPrompt;
    }
    if (target === 'firstFrame') {
      owned.scene.firstFrameImage = result.image;
      owned.scene.engineeredFirstFramePrompt = result.engineeredPrompt;
    }
    if (target === 'lastFrame') {
      owned.scene.lastFrameImage = result.image;
      owned.scene.engineeredLastFramePrompt = result.engineeredPrompt;
    }

    if (direction) owned.scene.userDirection = direction;
    owned.scene.status = 'drafted';
    await owned.scene.save();

    res.json({
      scene: owned.scene,
      image: { mime: result.image.mime, dataUrl: `data:${result.image.mime};base64,${result.image.base64}` },
      engineeredPrompt: result.engineeredPrompt,
    });
  } catch (e) {
    res.status(502).json({ error: e.message || 'generation failed' });
  }
});

const motionSchema = z.object({ direction: z.string().max(500).optional() });

router.post('/:id/motion/rewrite', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  const parsed = motionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid' });
  try {
    const { engineeredPrompt } = await rewriteVeoMotion(owned.scene, owned.project, parsed.data.direction || '');
    owned.scene.engineeredVideoMotionPrompt = engineeredPrompt;
    if (parsed.data.direction) owned.scene.userDirection = parsed.data.direction;
    await owned.scene.save();
    res.json({ scene: owned.scene, engineeredPrompt });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const narrationSchema = z.object({ direction: z.string().max(500).min(1) });

router.post('/:id/narration/rewrite', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  const parsed = narrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid' });
  try {
    const { line } = await rewriteNarrationLine(owned.scene, owned.project, parsed.data.direction);
    res.json({ original: owned.scene.narration, suggestion: line });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const convertSchema = z.object({ toKind: z.enum(['slide']) });

/**
 * One-way conversion: video → slide only.
 *
 * v4 caps Veo usage at 2 video scenes max, set at planning time. We do NOT
 * let users promote a slide to a video after the fact — that would blow the
 * Veo budget. Reverting a video back to a slide is allowed (and useful for
 * trimming spend further).
 */
router.post('/:id/convert', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  const parsed = convertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'only slide conversion is supported' });
  if (owned.scene.visualKind === 'slide') return res.json({ scene: owned.scene });

  // Promote first frame to slide; drop video-only state.
  if (owned.scene.firstFrameImage?.base64) {
    owned.scene.slideImage = owned.scene.firstFrameImage;
    owned.scene.engineeredVisualPrompt = owned.scene.engineeredFirstFramePrompt;
  }
  owned.scene.visualKind = 'slide';
  owned.scene.firstFrameImage = { mime: '', base64: '' };
  owned.scene.lastFrameImage = { mime: '', base64: '' };
  owned.scene.engineeredFirstFramePrompt = '';
  owned.scene.engineeredLastFramePrompt = '';
  owned.scene.engineeredVideoMotionPrompt = '';
  await owned.scene.save();
  res.json({ scene: owned.scene });
});

router.post('/:id/preview-voice', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  try {
    const wav = await previewSceneVoice(owned.scene, owned.project.voiceName);
    res.set('Content-Type', 'audio/wav');
    res.set('Content-Length', String(wav.length));
    res.send(wav);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  const owned = await loadOwnedScene(req, res); if (!owned) return;
  await Scene.deleteOne({ _id: owned.scene._id });
  const remaining = await Scene.find({ projectId: owned.project._id }).sort({ order: 1 });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].order !== i) { remaining[i].order = i; await remaining[i].save(); }
  }
  res.json({ ok: true });
});

const reorderSchema = z.object({ sceneIds: z.array(z.string()).min(1) });

router.post('/project/:projectId/reorder', async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id }).lean();
  if (!project) return res.status(404).json({ error: 'not found' });
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid' });
  for (let i = 0; i < parsed.data.sceneIds.length; i++) {
    await Scene.updateOne(
      { _id: parsed.data.sceneIds[i], projectId: project._id },
      { order: i }
    );
  }
  res.json({ ok: true });
});

router.post('/project/:projectId/append', async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id });
  if (!project) return res.status(404).json({ error: 'not found' });
  const last = await Scene.findOne({ projectId: project._id }).sort({ order: -1 }).lean();
  const order = (last?.order ?? -1) + 1;
  const scene = await Scene.create({
    projectId: project._id,
    order,
    durationSec: 6,
    narration: '',
    visualKind: 'slide',
    visualPrompt: 'A complementary scene continuing the story',
    status: 'planning',
  });
  res.json({ scene });
});

export default router;
