/**
 * In-memory render queue. FIFO. Single worker — at most one render runs at
 * a time. This is intentional for the 1GB-RAM box: parallel encodes would
 * blow OOM with libx264 + Veo download buffers.
 *
 * Lifecycle of a job:
 *   queued → running → done   (auto-saves as a Share + emails the owner)
 *                    → failed (emails the owner with the error)
 *
 * Jobs are NOT persisted across server restarts. If the server reboots
 * mid-render the user's project.status will say "rendering" until they hit
 * render again — we surface that on load.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { env } from '../env.js';
import Project from '../models/Project.js';
import Scene from '../models/Scene.js';
import Share from '../models/Share.js';
import User from '../models/User.js';
import { renderProject } from './render.js';
import { sendVideoReady, sendRenderFailed } from './email.js';

/* ── state ─────────────────────────────────────────────────── */

const jobs = new Map();   // jobId → job record (see makeJob)
const queue = [];         // array of jobIds
let running = null;       // jobId currently running, or null

function makeJob({ userId, projectId, projectTitle }) {
  return {
    jobId: nanoid(12),
    userId: String(userId),
    projectId: String(projectId),
    projectTitle,
    status: 'queued',                  // queued | running | done | failed
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    currentStep: null,                  // 'narrate' | 'score' | 'film' | ...
    completedSteps: [],
    errorMessage: '',
    shareSlug: '',
    shareUrl: '',
  };
}

/* ── public API ────────────────────────────────────────────── */

/**
 * Queue a render for the given project. Returns the job snapshot the client
 * should display ("queued, position 2"). Caller should validate ownership +
 * scene readiness before calling.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.projectId
 * @param {string} args.projectTitle
 * @param {string} args.appUrl  — base URL like https://id3a.in (used in email)
 * @returns {{job: object, position: number}}
 */
export function enqueue({ userId, projectId, projectTitle, appUrl }) {
  // Refuse a second concurrent enqueue for the same project — easy mistake to
  // double-click. The user should poll the existing job instead.
  for (const j of jobs.values()) {
    if (j.projectId === String(projectId) && (j.status === 'queued' || j.status === 'running')) {
      return { job: serialize(j), position: positionOf(j.jobId), reused: true };
    }
  }

  const job = makeJob({ userId, projectId, projectTitle });
  job._appUrl = appUrl;
  jobs.set(job.jobId, job);
  queue.push(job.jobId);
  setImmediate(tick); // kick the worker
  return { job: serialize(job), position: positionOf(job.jobId), reused: false };
}

export function getJob(jobId) {
  const j = jobs.get(jobId);
  if (!j) return null;
  return { ...serialize(j), position: positionOf(jobId) };
}

export function listJobsForUser(userId) {
  const u = String(userId);
  return [...jobs.values()]
    .filter((j) => j.userId === u && (j.status === 'queued' || j.status === 'running'))
    .map((j) => ({ ...serialize(j), position: positionOf(j.jobId) }));
}

/* ── worker ────────────────────────────────────────────────── */

async function tick() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  const job = jobs.get(next);
  if (!job) return tick();

  running = job.jobId;
  job.status = 'running';
  job.startedAt = new Date();

  try {
    await runJob(job);
  } catch (e) {
    console.error('[renderQueue] job failed', job.jobId, e);
    job.status = 'failed';
    job.errorMessage = e.message || String(e);
    job.completedAt = new Date();
    notifyFailure(job).catch(() => {});
  } finally {
    running = null;
    // GC: drop done/failed jobs after 30 minutes so polling clients still see
    // their result on a refresh, but memory doesn't grow unbounded.
    setTimeout(() => { jobs.delete(job.jobId); }, 30 * 60 * 1000);
    // Run the next one (if any).
    setImmediate(tick);
  }
}

async function runJob(job) {
  const project = await Project.findById(job.projectId);
  if (!project) throw new Error('project deleted');
  const scenes = await Scene.find({ projectId: project._id }).sort({ order: 1 });
  if (!scenes.length) throw new Error('no scenes');

  // Validate visuals before spending money.
  for (const s of scenes) {
    if (s.visualKind === 'slide' && !s.slideImage?.base64)
      throw new Error(`scene ${s.order + 1}: slide image not generated yet`);
    if (s.visualKind === 'video' && (!s.firstFrameImage?.base64 || !s.lastFrameImage?.base64))
      throw new Error(`scene ${s.order + 1}: video scene needs first and last frames`);
  }

  project.status = 'rendering';
  await project.save();

  let result = null;
  try {
    for await (const ev of renderProject({ project: project.toObject(), scenes: scenes.map((s) => s.toObject()) })) {
      if (ev.type === 'step') {
        job.currentStep = ev.step;
        if (!job.completedSteps.includes(ev.step)) job.completedSteps.push(ev.step);
      } else if (ev.type === 'done') {
        result = ev;
      }
    }
    if (!result) throw new Error('renderer never reached done');

    /* Auto-save as a Share. The user has closed the tab — this IS the artifact. */
    const userShareCount = await Share.countDocuments({ userId: project.userId });
    if (userShareCount >= 50) {
      throw new Error('share quota reached (50). delete some on /dashboard first.');
    }

    const slug = nanoid(16);
    await fs.mkdir(env.SHARES_DIR, { recursive: true });
    await fs.mkdir(env.POSTERS_DIR, { recursive: true });
    const sharedMp4 = path.join(env.SHARES_DIR, `${slug}.mp4`);
    const sharedJpg = path.join(env.POSTERS_DIR, `${slug}.jpg`);
    await fs.copyFile(result.finalPath, sharedMp4);
    await fs.copyFile(result.posterPath, sharedJpg);

    const share = await Share.create({
      slug,
      projectId: project._id,
      userId: project.userId,
      title: project.title,
      seedPrompt: project.seedPrompt,
      sceneCount: scenes.length,
      voiceName: project.voiceName,
      durationSec: result.durationSec,
      fileSizeBytes: result.fileSizeBytes,
      filePath: sharedMp4,
      posterPath: sharedJpg,
    });

    /* Cleanup the temp render. */
    fs.rm(path.dirname(result.finalPath), { recursive: true, force: true }).catch(() => {});

    project.status = 'rendered';
    project.lastRenderAt = new Date();
    await project.save();

    /* Wrap up the job + notify the user. */
    const shareUrl = `${job._appUrl || env.APP_URL || ''}/v/${share.slug}`;
    job.status = 'done';
    job.shareSlug = share.slug;
    job.shareUrl = shareUrl;
    job.completedAt = new Date();

    await notifySuccess({ job, project, share, shareUrl });
  } catch (e) {
    project.status = 'draft';
    await project.save().catch(() => {});
    throw e;
  }
}

async function notifySuccess({ job, project, share, shareUrl }) {
  try {
    const user = await User.findById(project.userId).select('email displayName').lean();
    if (!user?.email) {
      console.warn('[renderQueue] no email on file for user', project.userId);
      return;
    }
    await sendVideoReady({
      to: user.email,
      displayName: user.displayName,
      title: share.title,
      shareUrl,
      durationSec: share.durationSec,
      seedPrompt: project.seedPrompt,
    });
  } catch (e) {
    console.warn('[renderQueue] sendVideoReady failed:', e.message);
  }
}

async function notifyFailure(job) {
  try {
    const project = await Project.findById(job.projectId).select('userId title').lean();
    const user = project?.userId ? await User.findById(project.userId).select('email displayName').lean() : null;
    if (!user?.email) return;
    await sendRenderFailed({
      to: user.email,
      displayName: user.displayName,
      title: project?.title || job.projectTitle || 'your pitch',
      errorMessage: job.errorMessage,
    });
  } catch (e) {
    console.warn('[renderQueue] sendRenderFailed failed:', e.message);
  }
}

/* ── helpers ───────────────────────────────────────────────── */

function positionOf(jobId) {
  if (running === jobId) return 0;
  const idx = queue.indexOf(jobId);
  return idx === -1 ? -1 : idx + 1;
}

function serialize(j) {
  return {
    jobId: j.jobId,
    userId: j.userId,
    projectId: j.projectId,
    projectTitle: j.projectTitle,
    status: j.status,
    queuedAt: j.queuedAt,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    currentStep: j.currentStep,
    completedSteps: j.completedSteps,
    errorMessage: j.errorMessage,
    shareSlug: j.shareSlug,
    shareUrl: j.shareUrl,
  };
}
