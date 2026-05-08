import jwt from 'jsonwebtoken';
import { env } from '../env.js';

const COOKIE_NAME = 'id3a_jwt';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function signSession(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifySession(token) {
  try { return jwt.verify(token, env.JWT_SECRET); } catch { return null; }
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.IS_PROD,
    maxAge: SEVEN_DAYS,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export const COOKIE = COOKIE_NAME;
