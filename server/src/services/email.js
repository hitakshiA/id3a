import { Resend } from 'resend';
import { env } from '../env.js';

let _client = null;
function client() {
  if (!_client) _client = new Resend(env.RESEND_API_KEY);
  return _client;
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 70" height="28" style="display:block;color:#f4ede0">
<path fill="currentColor" d="m139.5 19.9 0.1 5.7c-3.5-3.2-8.2-6.1-14.2-6.5-1.8-0.1-3.8 0-5.7 0.3-4.7 1.1-10.5 3.6-15.2 10.5 2.6 3.7 4.9 8.7 4.9 14.6 0.1 4.7-1.1 9.3-3.5 13.3 1.6 2.3 5.5 6.3 11.4 8.3 4.1 1.4 8 1.5 11.7 0.8 3.6-0.7 7.3-2.5 10.5-6v5.3h8.4v-46.3h-8.4zm-2.5 31.8c-2 3.3-5.9 6.5-11.4 6.8-8.8 0.3-15-6.7-15.1-15-0.1-8.6 7.1-15.8 14.5-15.9 7.9 0 14.6 6.3 14.7 15.4-0.1 3.2-0.9 6.2-2.7 8.7z"/>
<path fill="currentColor" d="m90.9 25 12.1-16.5v-6.1h-36.2v8.6h23.4l-13.5 18.1 2.3 3.7c2.1-0.4 4.7-0.7 7.1-0.1 5.5 1.2 10.2 6 10.2 12.4 0 7-5.3 13-13 13.3-9.4 0.1-12.7-7-13.5-10.3-4.3 0.4-12.2 3.1-18 5.9-3.9 1.9-7.1 4.4-12.3 4.5-7.8 0.1-15.1-6.1-15.2-15.2-0.1-8.9 7.2-15.7 14.6-15.8 7.8-0.2 13.1 4.9 14.6 10 0.8 2.8 0.8 8.4-0.4 11.8 2.2-1 6.4-2.6 9.7-3.3v-43.6h-9.1l0.1 22c-3.7-2.8-7.9-5.3-14.7-5.3-11.8-0.2-23.3 9.4-23.8 23-0.4 12.5 8.1 25.5 23.4 25.4 8 0 12.1-2.7 15.1-4.3 3.4-2.1 8.4-4.8 10.2-6.5 3.8 6.1 10.8 10.8 19.3 10.8 12.4 0 22.1-9 22.1-22.3-0.1-9.1-6.4-17.2-14.5-20.2z"/>
<path fill="currentColor" d="m3.4 19.9h8.1l-0.1 46.3h-8z"/>
<path fill="currentColor" d="m7.3 2.1c-3-0.1-5.4 2.7-5.4 5.6 0.1 3 2.3 6.1 6.1 6.1 3.7-0.1 4.8-3 4.6-3 2-3.5-0.4-8.7-5.3-8.7z"/>
</svg>`;

function fmtSec(n) {
  const m = Math.floor(n / 60), s = Math.round(n % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "Your video is ready" email after an async render finishes. */
export async function sendVideoReady({ to, displayName, title, shareUrl, durationSec, seedPrompt = '' }) {
  const subject = `Your pitch is ready — ${title}`;
  const friendly = (displayName || 'there').split(' ')[0];
  const dur = fmtSec(durationSec || 60);

  const html = `
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0908;color:#f4ede0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0908">
    <tr><td align="center" style="padding:48px 24px">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td>
          <div style="margin-bottom:32px">${LOGO_SVG}</div>
          <h1 style="margin:0 0 12px 0;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-size:44px;line-height:1.05;letter-spacing:-0.01em;color:#f4ede0;font-weight:400">
            Your pitch is live, ${friendly}.
          </h1>
          <p style="margin:0 0 28px 0;font-size:15px;line-height:1.55;color:#bdb6a8">
            "${title}" — ${dur} · 720p H.264. The link below is public; share it anywhere.
          </p>
          <p style="margin:0 0 28px 0">
            <a href="${shareUrl}"
               style="display:inline-block;background:#ffffff;color:#0a0908;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:6px;font-size:15px">
              Watch &amp; share →
            </a>
          </p>
          <p style="margin:0 0 8px 0;font-size:12px;color:#857f74">Or paste this URL into your browser:</p>
          <p style="margin:0 0 32px 0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#bdb6a8;word-break:break-all">
            ${shareUrl}
          </p>
          ${seedPrompt ? `
          <div style="border-top:1px solid #26231f;padding-top:20px;margin-top:8px">
            <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#857f74">the seed</p>
            <p style="margin:0;font-family:'Instrument Serif',Georgia,serif;font-size:18px;line-height:1.35;color:#f4ede0">${escapeHtml(seedPrompt)}</p>
          </div>` : ''}
          <p style="margin:32px 0 0 0;font-size:12px;color:#857f74;line-height:1.5">
            You can manage and delete shared videos from your dashboard at any time.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Your pitch is live, ${friendly}.

"${title}" — ${dur} · 720p H.264.

Watch & share:
${shareUrl}

${seedPrompt ? `The seed: ${seedPrompt}\n\n` : ''}You can manage and delete shared videos from your dashboard at any time.`;

  const res = await client().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
  if (res.error) throw new Error(res.error.message || 'email send failed');
  return res;
}

/** "Your render failed" email — best-effort heads-up so the user isn't left hanging. */
export async function sendRenderFailed({ to, displayName, title, errorMessage }) {
  const subject = `Render failed — ${title}`;
  const friendly = (displayName || 'there').split(' ')[0];
  const html = `
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0908;color:#f4ede0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0908">
    <tr><td align="center" style="padding:48px 24px">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px">
        <tr><td>
          <div style="margin-bottom:32px">${LOGO_SVG}</div>
          <h1 style="margin:0 0 12px 0;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-size:40px;line-height:1.05;color:#f4ede0;font-weight:400">
            Sorry, ${friendly}.
          </h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#bdb6a8">
            "${title}" didn't finish rendering. The error was:
          </p>
          <pre style="margin:0 0 24px 0;background:#13110f;border:1px solid #26231f;padding:14px;border-radius:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#f4ede0;white-space:pre-wrap;word-break:break-word">${escapeHtml(errorMessage || 'unknown error')}</pre>
          <p style="margin:0 0 0 0;font-size:13px;color:#857f74;line-height:1.55">
            Open the project on id3a and try render again. If it keeps failing, the render is fully refunded — nothing is charged on a failed run.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Sorry, ${friendly}.

"${title}" didn't finish rendering.

Error: ${errorMessage || 'unknown error'}

Open the project on id3a and try render again.`;

  await client().emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Magic-link email. Returns Resend's API response. */
export async function sendMagicLink({ to, link }) {
  const subject = 'Sign in to id3a';
  // Logo is inlined as SVG so it shows wherever HTML is rendered. The
  // `fill="currentColor"` plus a wrapper `color` attribute keeps it pale.
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 70" height="28" style="display:block;color:#f4ede0">
<path fill="currentColor" d="m139.5 19.9 0.1 5.7c-3.5-3.2-8.2-6.1-14.2-6.5-1.8-0.1-3.8 0-5.7 0.3-4.7 1.1-10.5 3.6-15.2 10.5 2.6 3.7 4.9 8.7 4.9 14.6 0.1 4.7-1.1 9.3-3.5 13.3 1.6 2.3 5.5 6.3 11.4 8.3 4.1 1.4 8 1.5 11.7 0.8 3.6-0.7 7.3-2.5 10.5-6v5.3h8.4v-46.3h-8.4zm-2.5 31.8c-2 3.3-5.9 6.5-11.4 6.8-8.8 0.3-15-6.7-15.1-15-0.1-8.6 7.1-15.8 14.5-15.9 7.9 0 14.6 6.3 14.7 15.4-0.1 3.2-0.9 6.2-2.7 8.7z"/>
<path fill="currentColor" d="m90.9 25 12.1-16.5v-6.1h-36.2v8.6h23.4l-13.5 18.1 2.3 3.7c2.1-0.4 4.7-0.7 7.1-0.1 5.5 1.2 10.2 6 10.2 12.4 0 7-5.3 13-13 13.3-9.4 0.1-12.7-7-13.5-10.3-4.3 0.4-12.2 3.1-18 5.9-3.9 1.9-7.1 4.4-12.3 4.5-7.8 0.1-15.1-6.1-15.2-15.2-0.1-8.9 7.2-15.7 14.6-15.8 7.8-0.2 13.1 4.9 14.6 10 0.8 2.8 0.8 8.4-0.4 11.8 2.2-1 6.4-2.6 9.7-3.3v-43.6h-9.1l0.1 22c-3.7-2.8-7.9-5.3-14.7-5.3-11.8-0.2-23.3 9.4-23.8 23-0.4 12.5 8.1 25.5 23.4 25.4 8 0 12.1-2.7 15.1-4.3 3.4-2.1 8.4-4.8 10.2-6.5 3.8 6.1 10.8 10.8 19.3 10.8 12.4 0 22.1-9 22.1-22.3-0.1-9.1-6.4-17.2-14.5-20.2z"/>
<path fill="currentColor" d="m3.4 19.9h8.1l-0.1 46.3h-8z"/>
<path fill="currentColor" d="m7.3 2.1c-3-0.1-5.4 2.7-5.4 5.6 0.1 3 2.3 6.1 6.1 6.1 3.7-0.1 4.8-3 4.6-3 2-3.5-0.4-8.7-5.3-8.7z"/>
</svg>`;

  const html = `
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0908;color:#f4ede0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0908">
    <tr><td align="center" style="padding:48px 24px">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px">
        <tr><td>
          <div style="margin-bottom:32px">${logoSvg}</div>
          <h1 style="margin:0 0 12px 0;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-size:48px;line-height:1.05;letter-spacing:-0.01em;color:#f4ede0;font-weight:400">
            Sign in to id3a.
          </h1>
          <p style="margin:0 0 32px 0;font-size:15px;line-height:1.55;color:#bdb6a8">
            Click the button below to sign in. The link expires in 15 minutes and works once.
          </p>
          <p style="margin:0 0 32px 0">
            <a href="${link}"
               style="display:inline-block;background:#9eff4a;color:#0a0908;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:6px;font-size:15px">
              Sign in →
            </a>
          </p>
          <p style="margin:0 0 8px 0;font-size:12px;color:#857f74">Or paste this URL into your browser:</p>
          <p style="margin:0 0 32px 0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#bdb6a8;word-break:break-all">
            ${link}
          </p>
          <p style="margin:0;font-size:12px;color:#857f74;line-height:1.5">
            If you didn't request this, ignore this email — no account is created until you click the link.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Sign in to id3a.

Click this link to sign in (expires in 15 minutes, single-use):

${link}

If you didn't request this, ignore this email.`;

  const res = await client().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
  if (res.error) throw new Error(res.error.message || 'email send failed');
  return res;
}
