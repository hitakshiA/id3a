import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { connectDB } from './db.js';
import { janitor } from './services/render.js';
import { seedVoiceSamples } from './services/voiceLibrary.js';

import authRoutes from './auth/routes.js';
import projectRoutes from './routes/projects.js';
import sceneRoutes from './routes/scenes.js';
import renderRoutes from './routes/render.js';
import sharesRoutes, { publicRouter as sharesPublic } from './routes/shares.js';
import voicesRoutes from './routes/voices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '12mb' }));

// Static assets: voice samples, music samples (served as files for direct <audio> playback)
app.use('/voices', express.static(path.resolve(__dirname, '../public/voices'), { maxAge: '7d' }));
app.use('/music-samples', express.static(path.resolve(__dirname, '../public/music-samples'), { maxAge: '1d' }));

app.get('/api/health', (req, res) => res.json({ ok: true, version: '4.0.0' }));

app.use('/api/auth', authRoutes);
app.use('/api/voices', voicesRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api', renderRoutes);          // /api/projects/:id/render, /api/renders/*
app.use('/api/shares', sharesRoutes);   // owner-scoped
app.use('/api', sharesPublic);          // /api/share/:slug, /api/share/:slug/video, /api/share/:slug/poster.jpg

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'server error' });
});

connectDB()
  .then(() => app.listen(env.PORT, () => console.log(`[server] http://localhost:${env.PORT}`)))
  .catch((e) => { console.error('db connect failed', e); process.exit(1); });

// Run janitor every 30 min to nuke stale temp renders.
setInterval(() => janitor().catch(() => {}), 30 * 60 * 1000);
janitor().catch(() => {});

// Seed voice library once at boot (idempotent — skips voices already on disk).
seedVoiceSamples().catch((e) => console.warn('[voiceLibrary] boot seed error:', e?.message || e));
