import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import User from '../models/User.js';
import MagicToken from '../models/MagicToken.js';
import { signSession, setAuthCookie, clearAuthCookie } from './jwt.js';
import { requireAuth } from './middleware.js';
import { sendMagicLink } from '../services/email.js';

const router = Router();

const TOKEN_TTL_MS = 15 * 60 * 1000;

const magicSchema = z.object({
  email: z.string().email().max(120),
});

/**
 * POST /api/auth/magic { email }
 * Issues a one-time token, emails the link, returns 200.
 * Always returns 200 even if delivery fails — we don't reveal whether an
 * email exists, and the user can always retry. Errors are logged server-side.
 */
router.post('/magic', async (req, res) => {
  const parsed = magicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'enter a valid email' });
  const email = parsed.data.email.toLowerCase().trim();

  // Rate limit: max 5 unconsumed tokens per email (prevents inbox spam).
  const recent = await MagicToken.countDocuments({
    email, consumed: false, expiresAt: { $gt: new Date() },
  });
  if (recent >= 5) return res.status(429).json({ error: 'too many sign-in attempts. wait a few minutes.' });

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await MagicToken.create({ email, token, expiresAt });

  const link = `${env.APP_URL}/auth/verify?token=${encodeURIComponent(token)}`;
  try { await sendMagicLink({ to: email, link }); }
  catch (e) {
    console.error('[email] sendMagicLink failed:', e.message);
    // Resend test mode only allows the verified email. Surface a clear
    // hint rather than masking the failure during local development.
    if (e.message?.includes('testing emails') || e.message?.includes('verified domain')) {
      return res.status(400).json({
        error: `we can't email this address yet — id3a's sender domain isn't verified. for now, use the email registered with resend.`,
      });
    }
    return res.status(502).json({ error: "couldn't send the email. try again." });
  }

  res.json({ ok: true, message: `sign-in link sent to ${email}` });
});

const verifySchema = z.object({
  token: z.string().min(8),
  displayName: z.string().min(1).max(50).optional(),
});

/**
 * POST /api/auth/verify { token, displayName? }
 * Consumes the magic-link token. Creates the user on first verify.
 */
router.post('/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid request' });
  const { token, displayName } = parsed.data;

  const record = await MagicToken.findOne({ token });
  if (!record) return res.status(401).json({ error: 'this link is invalid or has been used' });
  if (record.consumed) return res.status(401).json({ error: 'this link has already been used' });
  if (record.expiresAt < new Date()) return res.status(401).json({ error: 'this link has expired' });

  // Consume the token (and best-effort invalidate other unconsumed tokens for
  // the same email — keeps the inbox clean).
  record.consumed = true;
  await record.save();
  await MagicToken.updateMany(
    { email: record.email, consumed: false, _id: { $ne: record._id } },
    { consumed: true }
  );

  let user = await User.findOne({ email: record.email });
  const isNew = !user;
  if (!user) {
    const fallbackName = (displayName || record.email.split('@')[0]).slice(0, 50);
    user = await User.create({ email: record.email, displayName: fallbackName });
  } else if (displayName && displayName.trim() && !user.displayName) {
    user.displayName = displayName.trim().slice(0, 50);
  }
  user.lastLoginAt = new Date();
  await user.save();

  setAuthCookie(res, signSession(user));
  res.json({ user: user.toPublic(), isNew });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

export default router;
