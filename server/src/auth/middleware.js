import User from '../models/User.js';
import { COOKIE, verifySession, clearAuthCookie } from './jwt.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'not signed in' });
  const payload = verifySession(token);
  if (!payload?.sub) { clearAuthCookie(res); return res.status(401).json({ error: 'session expired' }); }
  const user = await User.findById(payload.sub);
  if (!user) { clearAuthCookie(res); return res.status(401).json({ error: 'user not found' }); }
  req.user = user;
  next();
}

/** Same as requireAuth but doesn't 401 — just attaches req.user when present. */
export async function maybeAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const payload = verifySession(token);
    if (payload?.sub) {
      const user = await User.findById(payload.sub);
      if (user) req.user = user;
    }
  }
  next();
}
