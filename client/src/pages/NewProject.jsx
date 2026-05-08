import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../store/auth.js';

const SAMPLES = [
  'a nursery for street animals',
  'a subscription bookstore that only sells one perfectly chosen book per month',
  'a bicycle repair stand that doubles as a public art installation',
  'a pocket-sized dictionary of words other languages have but English doesn’t',
];

export default function NewProject() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!loading && !user) nav('/'); }, [loading, user, nav]);
  if (loading || !user) return null;

  async function go(e) {
    e?.preventDefault?.();
    if (!seed.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const { project } = await api.createProject(seed.trim());
      nav(`/project/${project._id}/wizard`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-12 md:py-20">
        <p className="caps mb-3 rise rise-1">new pitch</p>
        <h1
          className="text-white leading-[0.98] rise rise-1"
          style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(48px, 7vw, 84px)' }}
        >
          What's the idea?
        </h1>
        <p className="text-white/55 mt-5 max-w-xl rise rise-2">
          One sentence to start. We'll ask a few quick questions to lock the look, sound, and pace before drafting any scenes.
        </p>

        <form onSubmit={go} className="mt-10 rise rise-3">
          <textarea
            className="input lg"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="e.g., a nursery for street animals"
            rows={3}
            maxLength={500}
            autoFocus
          />
          {error && <div className="text-rust text-sm mt-3">{error}</div>}
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className="btn primary lg gap-2" disabled={busy || !seed.trim()}>
              {busy ? 'starting…' : <>Begin <ArrowRight size={16} /></>}
            </button>
            {busy && <span className="text-sm text-white/45">a few seconds</span>}
          </div>
        </form>

        <div className="mt-14 rise rise-4">
          <p className="caps mb-3">or try a sample</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s}
                onClick={() => setSeed(s)}
                className="text-left text-sm px-4 py-2.5 rounded-full surface-inset hover:border-white/20 transition-colors max-w-md"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
