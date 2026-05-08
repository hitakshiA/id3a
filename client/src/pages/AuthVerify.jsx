import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../store/auth.js';

export default function AuthVerify() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const verifyMagic = useAuth((s) => s.verifyMagic);
  const [state, setState] = useState({ kind: 'verifying', message: '' });
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  const token = params.get('token');

  useEffect(() => {
    if (!token) { setState({ kind: 'error', message: 'no token in link' }); return; }
    (async () => {
      try {
        const { isNew } = await verifyMagic(token);
        if (isNew) setAskName(true);
        else nav('/dashboard', { replace: true });
      } catch (e) {
        setState({ kind: 'error', message: e.message });
      }
    })();
  }, [token, verifyMagic, nav]);

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await verifyMagic(token, name.trim());
      nav('/dashboard', { replace: true });
    } catch (e) {
      setState({ kind: 'error', message: e.message });
    }
  }

  return (
    <div className="h-full overflow-auto bg-black">
      <div className="max-w-md mx-auto px-6 py-20 md:py-28">

        {askName ? (
          <>
            <p className="caps mb-3">welcome</p>
            <h1
              className="text-white mb-3 leading-tight"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 5.5vw, 60px)' }}
            >
              What should we call you?
            </h1>
            <p className="text-white/55 mb-10">First names work. You can change it later.</p>
            <form onSubmit={saveName} className="space-y-5">
              <input
                autoFocus
                className="input lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hitakshi"
                maxLength={50}
                required
              />
              <button className="btn primary lg w-full gap-2" disabled={!name.trim()}>
                Continue <ArrowRight size={16} />
              </button>
            </form>
          </>
        ) : state.kind === 'error' ? (
          <>
            <p className="caps mb-3">sign-in failed</p>
            <h1
              className="text-white mb-3 leading-tight"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 5.5vw, 60px)' }}
            >
              {state.message}
            </h1>
            <p className="text-white/55 mb-8">Magic links expire after 15 minutes and only work once.</p>
            <Link to="/" className="btn glass">Try again →</Link>
          </>
        ) : (
          <>
            <p className="caps mb-3">signing you in</p>
            <h1
              className="text-white"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 5.5vw, 60px)' }}
            >
              Hold tight<span className="blink" />
            </h1>
          </>
        )}
      </div>
    </div>
  );
}
