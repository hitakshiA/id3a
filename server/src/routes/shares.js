import { Router } from 'express';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { z } from 'zod';
import { env } from '../env.js';
import { requireAuth } from '../auth/middleware.js';
import Share from '../models/Share.js';
import User from '../models/User.js';
import { serveRange } from './render.js';

const router = Router();

/* ─── Owner-scoped: list, rename, delete ───────────────────── */
router.get('/', requireAuth, async (req, res) => {
  const list = await Share.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .select('slug projectId title durationSec fileSizeBytes viewCount createdAt')
    .lean();
  // URLs always point at the client origin, never the API host.
  const base = env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json(list.map((s) => ({ ...s, url: `${base}/v/${s.slug}` })));
});

const patchSchema = z.object({ title: z.string().trim().min(1).max(120) });

router.patch('/:slug', requireAuth, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid' });
  const share = await Share.findOneAndUpdate(
    { slug: req.params.slug, userId: req.user._id },
    { title: parsed.data.title },
    { new: true }
  );
  if (!share) return res.status(404).json({ error: 'not found' });
  res.json({ share: { slug: share.slug, title: share.title } });
});

router.delete('/:slug', requireAuth, async (req, res) => {
  const share = await Share.findOneAndDelete({ slug: req.params.slug, userId: req.user._id });
  if (!share) return res.status(404).json({ error: 'not found' });
  fs.unlink(share.filePath).catch(() => {});
  fs.unlink(share.posterPath).catch(() => {});
  res.json({ ok: true });
});

export default router;

/* ─── Public viewer endpoints (mounted separately) ─────────── */
export const publicRouter = Router();

publicRouter.get('/share/:slug', async (req, res) => {
  const share = await Share.findOne({ slug: req.params.slug }).lean();
  if (!share) return res.status(404).json({ error: 'video not found' });
  const owner = await User.findById(share.userId).select('displayName').lean();
  res.json({
    slug: share.slug,
    title: share.title,
    seedPrompt: share.seedPrompt || '',
    sceneCount: share.sceneCount || 0,
    voiceName: share.voiceName || '',
    durationSec: share.durationSec,
    fileSizeBytes: share.fileSizeBytes,
    viewCount: share.viewCount,
    createdAt: share.createdAt,
    creator: owner?.displayName || 'someone',
    posterUrl: `/api/share/${share.slug}/poster.jpg`,
    videoUrl: `/api/share/${share.slug}/video`,
  });
});

publicRouter.get('/share/:slug/video', async (req, res) => {
  const share = await Share.findOne({ slug: req.params.slug });
  if (!share) return res.status(404).end();
  const stat = await fs.stat(share.filePath).catch(() => null);
  if (!stat) return res.status(404).end();
  // Bump view count on initial (non-range) request only — avoid double-count
  // when the browser requests a small probe range.
  if (!req.headers.range) {
    share.viewCount += 1;
    share.lastViewedAt = new Date();
    share.save().catch(() => {});
  }
  const downloadName = req.query.download ? `${share.title.replace(/[^\w\s.-]/g, '_').slice(0, 80)}.mp4` : null;
  serveRange(req, res, share.filePath, stat.size, 'video/mp4', downloadName);
});

publicRouter.get('/share/:slug/poster.jpg', async (req, res) => {
  const share = await Share.findOne({ slug: req.params.slug }).select('posterPath').lean();
  if (!share) return res.status(404).end();
  if (!fsSync.existsSync(share.posterPath)) return res.status(404).end();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  fsSync.createReadStream(share.posterPath).pipe(res);
});
