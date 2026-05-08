import { Router } from 'express';
import fsSync from 'node:fs';
import { env } from '../env.js';
import { requireAuth } from '../auth/middleware.js';
import Project from '../models/Project.js';
import Scene from '../models/Scene.js';
import { enqueue, getJob, listJobsForUser } from '../services/renderQueue.js';

const router = Router();

/* ─── Async render: enqueue + return jobId immediately ─────── */
router.post('/projects/:id/render', requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
  if (!project) return res.status(404).json({ error: 'not found' });

  const scenes = await Scene.find({ projectId: project._id }).sort({ order: 1 });
  if (!scenes.length) return res.status(400).json({ error: 'no scenes' });

  for (const s of scenes) {
    if (s.visualKind === 'slide' && !s.slideImage?.base64)
      return res.status(400).json({ error: `scene ${s.order + 1}: slide image not generated yet` });
    if (s.visualKind === 'video' && (!s.firstFrameImage?.base64 || !s.lastFrameImage?.base64))
      return res.status(400).json({ error: `scene ${s.order + 1}: video scene needs first and last frames` });
  }

  // The share link in the email + the Done view goes to the *client* origin,
  // not the API. APP_URL is set per-environment (dev: localhost:5173, prod:
  // https://id3a.in). req.get('host') would point at the API host (:4000).
  const appUrl = env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const result = enqueue({
    userId: req.user._id,
    projectId: project._id,
    projectTitle: project.title,
    appUrl,
  });

  res.json(result);
});

/* ─── Poll a job's status — optional, for the in-tab progress UI ─── */
router.get('/render-jobs/:jobId', requireAuth, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found (maybe already completed and GC\'d)' });
  if (String(job.userId) !== String(req.user._id)) return res.status(404).json({ error: 'not found' });
  res.json({ job });
});

/* ─── List the user's active render jobs (dashboard surface) ─── */
router.get('/render-jobs', requireAuth, (req, res) => {
  res.json({ jobs: listJobsForUser(req.user._id) });
});

/**
 * Range-aware streamer used by the public share viewer's MP4 endpoint.
 * Kept here for historical mounting reasons — exported and consumed by
 * shares.js.
 */
function serveRange(req, res, filePath, fileSize, mime, downloadName) {
  const range = req.headers.range;
  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
  };
  if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName}"`;

  if (range) {
    const m = /bytes=(\d+)-(\d+)?/.exec(range);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        ...headers,
        'Content-Length': chunkSize,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      });
      fsSync.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }
  res.writeHead(200, { ...headers, 'Content-Length': fileSize });
  fsSync.createReadStream(filePath).pipe(res);
}

export { serveRange };
export default router;
