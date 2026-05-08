import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { connectDB } from './db.js';

import authRoutes from './auth/routes.js';
import projectRoutes from './routes/projects.js';
import sceneRoutes from './routes/scenes.js';
import voicesRoutes from './routes/voices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '12mb' }));

app.use('/voices', express.static(path.resolve(__dirname, '../public/voices'), { maxAge: '7d' }));
app.use('/music-samples', express.static(path.resolve(__dirname, '../public/music-samples'), { maxAge: '1d' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/voices', voicesRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/scenes', sceneRoutes);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'server error' });
});

connectDB()
  .then(() => app.listen(env.PORT, () => console.log(`[server] http://localhost:${env.PORT}`)))
  .catch((e) => { console.error('db connect failed', e); process.exit(1); });
