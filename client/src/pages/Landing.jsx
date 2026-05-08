import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Github, Twitter, Globe } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../store/auth.js';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4';

const SOCIALS = [
  { icon: Github,  label: 'GitHub',  href: 'https://github.com/hitakshiA/id3a' },
  { icon: Twitter, label: 'X',       href: 'https://x.com/hitakshi_exe' },
  { icon: Globe,   label: 'Website', href: 'https://hitakshii.lovable.app' },
];

export default function Landing() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const sendMagic = useAuth((s) => s.sendMagic);

  /* ── slide state: which view is showing ─────────────────── */
  const [view, setView] = useState('hero'); // 'hero' | 'how' | 'models' | 'manifesto'

  /* ── cinematic looping video ─────────────────────────────── */
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const fadingOutRef = useRef(false);
  function fadeTo(target, duration = 500) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const v = videoRef.current; if (!v) return;
    const start = parseFloat(v.style.opacity || '0');
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      v.style.opacity = String(start + (target - start) * k);
      if (k < 1) rafRef.current = requestAnimationFrame(tick); else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  function onLoadedData() { if (videoRef.current) videoRef.current.style.opacity = '0'; fadeTo(1, 500); }
  function onTimeUpdate(e) {
    const v = e.currentTarget;
    const rem = v.duration - v.currentTime;
    if (!fadingOutRef.current && Number.isFinite(rem) && rem > 0 && rem <= 0.55) {
      fadingOutRef.current = true; fadeTo(0, 500);
    }
  }
  function onEnded() {
    const v = videoRef.current; if (!v) return;
    v.style.opacity = '0';
    setTimeout(() => { v.currentTime = 0; v.play().catch(() => {}); fadingOutRef.current = false; fadeTo(1, 500); }, 100);
  }

  /* ── magic link send ─────────────────────────────────────── */
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  async function submitEmail(e) {
    e?.preventDefault?.();
    if (!email.trim() || status.kind === 'sending') return;
    if (user) { nav('/dashboard'); return; }
    setStatus({ kind: 'sending', message: '' });
    try {
      const r = await sendMagic(email.trim());
      setStatus({ kind: 'sent', message: r.message || `Link sent to ${email.trim()}.` });
    } catch (err) { setStatus({ kind: 'error', message: err.message }); }
  }

  function goHero() {
    setView('hero');
    setTimeout(() => document.getElementById('email-input')?.focus(), 600);
  }

  /* ── keyboard: esc returns to hero, arrows cycle slides ── */
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && view !== 'hero') { setView('hero'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  return (
    <div className="h-screen overflow-hidden bg-black relative">

      {/* ── STICKY NAV (always visible, switches slides) ─────── */}
      <header className="absolute top-0 inset-x-0 z-30 px-6 pt-6">
        <div className="liquid-glass rounded-full px-5 md:px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-6 md:gap-8">
            <button onClick={() => setView('hero')} className="text-white" aria-label="id3a — home">
              <Logo height={24} />
            </button>
            <nav className="hidden md:flex items-center gap-7">
              {[
                ['hero',      'Home'],
                ['how',       'How it works'],
                ['models',    'Models'],
                ['manifesto', 'Manifesto'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={`text-sm font-medium transition-colors ${
                    view === k ? 'text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard" className="liquid-glass rounded-full px-5 py-2 text-white text-sm font-medium">
                Dashboard
              </Link>
            ) : (
              <button
                onClick={goHero}
                className="bg-white text-black rounded-full px-5 py-2 text-sm font-semibold hover:bg-white/90 transition-colors flex items-center gap-2"
              >
                Get started <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO (always rendered so video keeps playing; just hidden) ── */}
      <Slide visible={view === 'hero'}>
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted autoPlay playsInline preload="auto"
          onLoadedData={onLoadedData}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          className="absolute inset-0 w-full h-full object-cover translate-y-[17%]"
          style={{ opacity: 0 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70 pointer-events-none" />
        <div className="relative z-10 h-full flex flex-col items-center px-6 text-center pt-[14vh] md:pt-[12vh]">
          <h1
            className="text-white mb-8 tracking-tight whitespace-nowrap"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 7vw, 84px)' }}
          >
            Built for the curious.
          </h1>
          <div className="max-w-xl w-full space-y-4">
            <form onSubmit={submitEmail} className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3">
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-base"
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={status.kind === 'sending'}
                aria-label="send sign-in link"
                className="bg-white rounded-full p-3 text-black hover:bg-white/90 disabled:opacity-50 transition-opacity"
              >
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </form>
            <p className="text-white text-sm leading-relaxed px-4">
              {status.kind === 'idle' && 'One sentence becomes a 60-second pitch video — image, diagram, voice, music, b-roll. Drop your email; we’ll send a sign-in link.'}
              {status.kind === 'sending' && 'Sending your sign-in link…'}
              {status.kind === 'sent' && (<span>✓ {status.message} <span className="text-white/60">Check your inbox — the link expires in 15 minutes.</span></span>)}
              {status.kind === 'error' && <span>{status.message}</span>}
            </p>
          </div>
          <button
            onClick={() => setView('manifesto')}
            className="mt-8 liquid-glass rounded-full px-7 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Read the manifesto
          </button>
        </div>

        {/* socials anchor at bottom of hero */}
        <div className="absolute bottom-8 inset-x-0 z-10 flex justify-center gap-3">
          {SOCIALS.map(({ icon: Icon, label, href }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}
               className="liquid-glass rounded-full p-3 text-white/70 hover:text-white transition-colors">
              <Icon size={18} aria-hidden="true" />
            </a>
          ))}
        </div>
      </Slide>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <Slide visible={view === 'how'}>
        <div className="h-full overflow-y-auto px-6 md:px-10 pt-32 pb-20">
          <div className="max-w-5xl mx-auto">
            <p className="caps mb-5">how it works</p>
            <h2
              className="text-white mb-12 leading-[0.98]"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(36px, 5.5vw, 64px)' }}
            >
              Plan, iterate, ship<br />— in three moves.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-14">
              {[
                { n: '01', t: 'Plan',
                  body: 'A single sentence becomes 4–8 scenes with narration, visuals, and a music brief. Ten seconds, structured output.' },
                { n: '02', t: 'Iterate',
                  body: 'Re-roll any slide or keyframe. Give a direction. Edit narration line by line. Drafts are cheap, so you can be fearless.' },
                { n: '03', t: 'Ship',
                  body: 'Render the final cut. Download it, or get a link anyone can watch — no signup needed for viewers.' },
              ].map((s) => (
                <div key={s.n}>
                  <p className="caps mb-2">{s.n}</p>
                  <h3 className="text-white mb-2" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '28px', lineHeight: 1.05 }}>{s.t}</h3>
                  <p className="text-white/55 leading-relaxed text-sm">{s.body}</p>
                </div>
              ))}
            </div>
            <FooterCTA goHero={goHero} />
          </div>
        </div>
      </Slide>

      {/* ── MODELS ───────────────────────────────────────────── */}
      <Slide visible={view === 'models'}>
        <div className="h-full overflow-y-auto px-6 md:px-10 pt-32 pb-20">
          <div className="max-w-5xl mx-auto">
            <p className="caps mb-5">how it's made</p>
            <h2
              className="text-white mb-10 leading-[0.98]"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(36px, 5.5vw, 64px)' }}
            >
              Six craft moves,<br />one finished video.
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5 max-w-3xl mb-14">
              {[
                ['Plan',     'reads your idea and drafts the pitch, scene by scene, line by line.'],
                ['Paint',    'illustrates the slides and the keyframe stills you iterate on.'],
                ['Film',     'shoots the b-roll between your approved keyframes — only at final render.'],
                ['Score',    'composes the music in the key and tempo you locked.'],
                ['Narrate',  'voices every scene with the narrator you pick.'],
                ['Stitch',   'assembles every clip with the music sitting under the voice.'],
              ].map(([k, v]) => (
                <li key={k}>
                  <p className="text-white mb-1" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '22px', lineHeight: 1.1 }}>{k}</p>
                  <p className="text-white/55 leading-relaxed text-sm">{v}</p>
                </li>
              ))}
            </ul>
            <FooterCTA goHero={goHero} />
          </div>
        </div>
      </Slide>

      {/* ── MANIFESTO ────────────────────────────────────────── */}
      <Slide visible={view === 'manifesto'}>
        <div className="h-full overflow-y-auto px-6 md:px-10 pt-32 pb-20">
          <div className="max-w-3xl mx-auto">
            <p className="caps mb-5">manifesto</p>
            <div
              className="text-white space-y-5 leading-[1.2]"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(20px, 2.6vw, 30px)' }}
            >
              <p>
                An idea isn't worth less because it's <em className="text-white/65">small</em>.
                It's worth less because it's <em className="text-white/65">unseen</em>.
              </p>
              <p>
                For every shipped product there are a hundred shelved ones — not because they were
                wrong, but because the gap between <em className="text-white/65">sentence</em> and
                <em className="text-white/65"> something to show</em> was too long.
              </p>
              <p>
                id3a closes that gap. Type the line. Watch it become a pitch.
                Share the link. Find out if anyone cares before you build the thing.
              </p>
              <p className="text-white/55 italic">Curiosity is the only requirement.</p>
            </div>
            <div className="mt-10">
              <FooterCTA goHero={goHero} />
            </div>
          </div>
        </div>
      </Slide>

      {/* hint when not on hero */}
      {view !== 'hero' && (
        <div className="absolute bottom-6 right-6 z-30 hidden md:flex items-center gap-2 text-white/35 text-xs">
          <kbd className="liquid-glass rounded px-2 py-1 mono !text-[11px]">esc</kbd>
          to go back
        </div>
      )}
    </div>
  );
}

/** Absolute-positioned slide that fades in/out when `visible` flips. */
function Slide({ visible, children }) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

/** Shared footer for non-hero slides — primary CTA into auth. */
function FooterCTA({ goHero }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <button onClick={goHero} className="btn primary lg gap-2">
        Try it free <ArrowRight size={16} />
      </button>
    </div>
  );
}
