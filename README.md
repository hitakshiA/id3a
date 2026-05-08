# id3a

> **Type one sentence. Get a sixty-second pitch video.**
> Live: **[id3a.fun](https://id3a.fun)**

id3a is an autonomous director that turns a one-line idea into a finished narrated pitch. Behind a wizard-driven editor, an agent orchestrates **five frontier generative models** — every casual user direction becomes a production-grade prompt, every model call respects a single locked design language, and every render lands in your inbox.

---

## How it works

1. **Type a sentence.** A wizard agent runs a 7-step intake — audience, tone, length, key points, visual aesthetic, narrator mood, music vibe — adapting each question to your seed.
2. **Lock the look.** A *style sheet* is frozen at the end of the wizard: palette, typography, film stock, lighting, texture, music tempo + key, narrator voice, pacing. It is injected into every downstream model call.
3. **Edit by phase.** Slides → Narration → B-roll → Voice → Render. Every visual auto-drafts on entry. Nudge any one with casual language ("more dramatic", "switch to nighttime", "Wes Anderson symmetry") and a prompt-rewriter agent translates your intent into model-specific vocabulary.
4. **Render asynchronously.** A single-task FIFO queue runs the full pipeline server-side. Close the tab. The share link arrives by email when the cut is live.

---

## Five models, one finished video

| Layer | Model | Role |
|---|---|---|
| Plan + agent | **Gemini 3.1 Pro** | Drafts the wizard's adaptive questions, locks the style sheet, plans every scene, and rewrites each casual direction into a production-grade prompt for the right downstream model. |
| Image | **Nano Banana 2** (`gemini-3.1-flash-image-preview:nitro`) | Renders text-rich infographic slides and b-roll keyframes. Anchors literal text in single quotes so the model actually composes typography. |
| Video | **Veo 3.1 Fast** | Interpolates b-roll motion between approved first + last keyframes. Only at final render — drafts stay cheap. |
| Music | **Lyria 3** | Composes the score in the style sheet's tempo and key. Looped at the mix to fit narration, ducked under voice. |
| Voice | **Gemini 3.1 Flash TTS** | Narrates each scene in the picked voice (Kore, Charon, Puck, Aoede), with audio-tag steering for pacing and emphasis. |

The render orchestrator stitches everything with **FFmpeg**: TTS WAVs probed for actual duration, captions split into one-line cues synced to those probes, music looped under voice, captions burned into the final 720p MP4. Narration drives the timeline — if it overruns, the last frame holds.

---

## Design choices worth knowing

- **Style sheet is the lynchpin.** Without one shared descriptor across calls, regen drift across slides + b-roll is severe. A single locked JSON shape solves it.
- **Rewriter, not raw prompts.** Every casual direction routes through Gemini with a target-specific system prompt that translates intent into the vocabulary of the model that's about to receive it. The engineered prompt is persisted on the scene so users can audit what the agent did.
- **Render queue is intentionally serial.** One libx264 + Veo download + ffprobe pipeline at a time keeps RAM under ~400 MB peak on a 1 GB box.
- **Captions sync via WAV probing.** TTS pacing varies by voice + emphasis tags, so each generated WAV is probed with `ffprobe` and those numbers drive SRT timing — not the planner's guesses. Each scene's narration is split into multiple short cues (≤ 38 chars, one line each) with time distributed proportional to word count.
- **Magic-link auth, not passwords.** One less thing to remember. Tokens have a 15-minute TTL index in Mongo and are single-use.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 · Vite 6 · Tailwind · Zustand · Instrument Serif / Inter / JetBrains Mono |
| Backend | Node 20 · Express 4 · Mongoose 8 · zod · fluent-ffmpeg · nanoid |
| Auth | Resend magic links · 15-min one-time tokens · JWT cookie (httpOnly, sameSite=lax, 7-day) |
| Database | MongoDB Atlas |
| Disk | `/var/lib/id3a/{shares,posters}` for kept renders · `/tmp/id3a/renders` for in-flight workdirs · `server/public/voices/*.wav` for the seeded sample library |
| AI | OpenRouter — single API key fans out to all five Google models |
| Email | Resend HTML + text (magic-link sign-in, "your video is ready", render failure) |
| Deploy | pm2 + nginx + Let's Encrypt on a 1 GB VPS, encoding tuned to fit |

---

## Architecture

```
USER INPUT  ─►  WIZARD AGENT  ─►  STYLE SHEET (frozen)
                                       │
                                       ▼
                       ┌───────────────────────────────────┐
        nudge ────────►│   PROMPT REWRITER (Gemini Pro)    │
                       │   in:  {intent, style, prev}      │
                       │   out: model-specific prompt      │
                       └───────────────────────────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
   Nano Banana 2  Nano Banana 2   Veo 3.1 Fast      Lyria 3    Gemini 3.1 TTS
   (slides)       (keyframes)    (b-roll motion)    (music)    (narration)
                                       │
                                       ▼
                                  FFmpeg stitch
                                       │
                                       ▼
                              share link → email
```

---

## Setup

```sh
git clone https://github.com/hitakshiA/id3a.git
cd id3a
npm install
cp server/.env.example server/.env
# fill in MONGODB_URI, OPENROUTER_API_KEY, JWT_SECRET, RESEND_API_KEY
npm run dev   # client :5173 · server :4000
```

Generate `JWT_SECRET`:
```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The required four env vars:
- `MONGODB_URI` — Atlas connection string
- `OPENROUTER_API_KEY` — `sk-or-v1-…`
- `JWT_SECRET` — 32+ random bytes
- `RESEND_API_KEY` — `re_…`

Optional but useful for prod: `APP_URL` (used in email + share links), `EMAIL_FROM`, `SHARES_DIR`, `POSTERS_DIR`.

---

## Deploy

```sh
ssh root@<server> 'bash /var/www/id3a/ops/redeploy.sh'
```

`ops/` ships a working nginx config (`^~` prefix locations to keep API + static asset URLs out of the SPA fallback), a pm2 ecosystem, and an idempotent redeploy script that pulls main, rebuilds the client, and gracefully reloads the API process.

---

## Try it

**[id3a.fun](https://id3a.fun)** — sign in with a magic link, type one sentence, watch the wizard.
