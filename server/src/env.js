import 'dotenv/config';

const required = ['OPENROUTER_API_KEY', 'MONGODB_URI', 'JWT_SECRET', 'RESEND_API_KEY'];
for (const k of required) {
  if (!process.env[k]) { console.error(`[env] missing ${k}`); process.exit(1); }
}

export const env = {
  PORT: Number(process.env.PORT || 4000),
  MONGODB_URI: process.env.MONGODB_URI,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  // VPS disk locations for shared renders. Override via env in production.
  SHARES_DIR: process.env.SHARES_DIR || '/tmp/id3a/shares',
  POSTERS_DIR: process.env.POSTERS_DIR || '/tmp/id3a/posters',
  RENDERS_TEMP_DIR: process.env.RENDERS_TEMP_DIR || '/tmp/id3a/renders',
  // Magic-link auth via Resend
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  APP_URL: process.env.APP_URL || 'http://localhost:5173',
};
