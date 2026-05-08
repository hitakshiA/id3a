import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { connectDB } from './db.js';

import authRoutes from './auth/routes.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'server error' });
});

connectDB()
  .then(() => app.listen(env.PORT, () => console.log(`[server] http://localhost:${env.PORT}`)))
  .catch((e) => { console.error('db connect failed', e); process.exit(1); });
