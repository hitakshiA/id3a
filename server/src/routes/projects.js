import { Router } from 'express';
import { z } from 'zod';
import Project from '../models/Project.js';
import Scene from '../models/Scene.js';
import { requireAuth } from '../auth/middleware.js';
import { planPitch } from '../services/planner.js';
import {
  QUESTION_IDS,
  nextQuestion,
  normalizeAnswer,
  finalizeStyleSheet,
} from '../services/wizard.js';
import { generateMusicSamples, musicSampleUrl } from '../services/music.js';

const router = Router();
router.use(requireAuth);

/* ─── list / create ──────────────────────────────────────────────── */

router.get('/', async (req, res) => {
  const projects = await Project.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .select('_id title seedPrompt status editPhase wizardComplete totalSeconds updatedAt')
    .lean();
  res.json(projects);
});

const createSchema = z.object({
  seedPrompt: z.string().trim().min(3).max(500),
});

/**
 * v4: creating a project no longer plans scenes. It only seeds the project
 * with the user's one-liner and puts it into wizard mode. Scenes are planned
 * after the wizard finalizes the styleSheet (see POST /:id/finalize).
 */
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'tell us your idea in one line' });
  const { seedPrompt } = parsed.data;

  const title = seedPrompt.length <= 80 ? seedPrompt : seedPrompt.slice(0, 77) + '…';
  const project = await Project.create({
    userId: req.user._id,
    title,
    seedPrompt,
    editPhase: 'wizard',
    wizardStep: 0,
    wizardComplete: false,
  });
  res.json({ project });
});

/* ─── single ─────────────────────────────────────────────────────── */

router.get('/:id', async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!project) return res.status(404).json({ error: 'not found' });
  const scenes = await Scene.find({ projectId: project._id }).sort({ order: 1 }).lean();
  res.json({ project, scenes });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  voiceName: z.enum(['Kore', 'Charon', 'Puck', 'Aoede']).optional(),
  musicPrompt: z.string().max(800).optional(),
  selectedMusicSampleId: z.string().max(40).optional(),
  captionsEnabled: z.boolean().optional(),
  editPhase: z.enum(['wizard', 'slides', 'narration', 'broll', 'voice', 'music', 'render']).optional(),
});

router.patch('/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid update' });
  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    parsed.data,
    { new: true }
  );
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json({ project });
});

router.delete('/:id', async (req, res) => {
  const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!project) return res.status(404).json({ error: 'not found' });
  await Scene.deleteMany({ projectId: project._id });
  res.json({ ok: true });
});

/* ─── wizard ─────────────────────────────────────────────────────── */

async function loadOwned(req, res) {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
  if (!project) { res.status(404).json({ error: 'not found' }); return null; }
  return project;
}

/** Current wizard state: next question + so-far answers + completion. */
router.get('/:id/wizard', async (req, res) => {
  const project = await loadOwned(req, res); if (!project) return;
  const next = await nextQuestion(project);
  res.json({
    answers: project.wizardAnswers,
    step: project.wizardStep,
    complete: !!next.complete || project.wizardComplete,
    question: next.complete ? null : next,
  });
});

const answerSchema = z.object({
  questionId: z.enum(QUESTION_IDS),
  answer: z.any(),
});

router.post('/:id/wizard/answer', async (req, res) => {
  const project = await loadOwned(req, res); if (!project) return;
  if (project.wizardComplete) return res.status(400).json({ error: 'wizard already complete; restart to redo' });

  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid answer payload' });

  let normalized;
  try { normalized = normalizeAnswer(parsed.data.questionId, parsed.data.answer); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  project.wizardAnswers = { ...(project.wizardAnswers?.toObject?.() || project.wizardAnswers || {}), [parsed.data.questionId]: normalized };
  project.wizardStep = QUESTION_IDS.indexOf(parsed.data.questionId) + 1;
  await project.save();

  const next = await nextQuestion(project);
  res.json({
    answers: project.wizardAnswers,
    step: project.wizardStep,
    complete: !!next.complete,
    question: next.complete ? null : next,
  });
});

router.post('/:id/wizard/restart', async (req, res) => {
  const project = await loadOwned(req, res); if (!project) return;
  project.wizardAnswers = {};
  project.wizardStep = 0;
  project.wizardComplete = false;
  project.editPhase = 'wizard';
  await project.save();
  const next = await nextQuestion(project);
  res.json({ answers: {}, step: 0, complete: false, question: next });
});

/**
 * Finalize the wizard: lock styleSheet (Gemini Pro), then plan scenes,
 * then advance to editPhase='slides'.
 *
 * Note: in v4-P2 we still call the legacy planPitch(seedPrompt). P3 rewrites
 * planner.js to consume styleSheet + answers fully.
 */
/* ─── music samples ──────────────────────────────────────────────── */

router.post('/:id/music/samples', async (req, res) => {
  const project = await loadOwned(req, res); if (!project) return;
  if (!project.styleSheet?.palette) return res.status(400).json({ error: 'finalize the wizard first' });
  try {
    const samples = await generateMusicSamples(project);
    const ok = samples.filter((s) => s.ok);
    if (!ok.length) return res.status(502).json({ error: 'all samples failed' });

    project.musicSamples = ok.map((s) => ({
      sampleId: s.sampleId,
      label: s.label,
      prompt: s.prompt,
      filePath: s.filePath,
      url: s.url,
      durationSec: s.durationSec,
      createdAt: new Date(),
    }));
    project.selectedMusicSampleId = ''; // user picks again after regenerate
    await project.save();
    res.json({
      samples: ok.map((s) => ({ sampleId: s.sampleId, label: s.label, url: s.url, durationSec: s.durationSec })),
      failed: samples.filter((s) => !s.ok).map((s) => ({ label: s.label, error: s.error })),
    });
  } catch (e) {
    res.status(502).json({ error: e.message || 'music generation failed' });
  }
});

const selectSampleSchema = z.object({ sampleId: z.string().min(1).max(40) });

router.post('/:id/music/select', async (req, res) => {
  const project = await loadOwned(req, res); if (!project) return;
  const parsed = selectSampleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid' });
  const found = (project.musicSamples || []).find((s) => s.sampleId === parsed.data.sampleId);
  if (!found) return res.status(404).json({ error: 'sample not found — regenerate' });
  project.selectedMusicSampleId = found.sampleId;
  project.musicPrompt = found.prompt; // cache for render-time fallback
  await project.save();
  res.json({ project });
});

router.post('/:id/finalize', async (req, res) => {
  const project = await loadOwned(req, res); if (!project) return;
  // All questions must be answered.
  for (const id of QUESTION_IDS) {
    const v = project.wizardAnswers?.[id];
    const empty = id === 'keyPoints' ? !Array.isArray(v) || !v.length : !v;
    if (empty) return res.status(400).json({ error: `wizard incomplete: missing ${id}` });
  }

  let styleSheet;
  try { styleSheet = await finalizeStyleSheet(project); }
  catch (e) { return res.status(502).json({ error: `couldn't lock the style sheet: ${e.message}` }); }

  let plan;
  try { plan = await planPitch(project.seedPrompt, { styleSheet, wizardAnswers: project.wizardAnswers }); }
  catch (e) { return res.status(502).json({ error: `couldn't plan scenes: ${e.message}` }); }

  await Scene.deleteMany({ projectId: project._id }); // restart-safe
  const scenes = await Scene.insertMany(
    plan.scenes.map((s) => ({
      projectId: project._id,
      order: s.order,
      durationSec: s.durationSec,
      narration: s.narration,
      visualKind: s.visualKind,
      visualPrompt: s.visualPrompt,
      firstFramePrompt: s.firstFramePrompt || '',
      lastFramePrompt: s.lastFramePrompt || '',
      videoMotionPrompt: s.videoMotionPrompt || '',
      engineeredVisualPrompt: s.engineeredVisualPrompt || '',
      engineeredFirstFramePrompt: s.engineeredFirstFramePrompt || '',
      engineeredLastFramePrompt: s.engineeredLastFramePrompt || '',
      engineeredVideoMotionPrompt: s.engineeredVideoMotionPrompt || '',
      status: 'planning',
    }))
  );

  project.styleSheet = styleSheet;
  project.voiceName = styleSheet.voiceName || plan.voiceName || 'Kore';
  project.musicPrompt = plan.musicPrompt || '';
  project.totalSeconds = plan.totalSeconds || project.wizardAnswers.lengthSec || 60;
  project.wizardComplete = true;
  project.editPhase = 'slides';
  await project.save();

  res.json({ project, scenes });
});

export default router;
