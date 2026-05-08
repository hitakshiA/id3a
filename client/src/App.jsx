import { useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './components/Logo.jsx';
import { useAuth } from './store/auth.js';

export default function App() {
  const refresh = useAuth((s) => s.refresh);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { refresh(); }, [refresh]);

  // Pages with their own full-bleed chrome shouldn't render the app shell.
  const HIDE_HEADER =
    loc.pathname === '/' ||
    loc.pathname.startsWith('/v/') ||
    loc.pathname.startsWith('/auth/');

  return (
    <div className="h-full flex flex-col bg-black">
      {!HIDE_HEADER && (
        <header className="px-6 md:px-10 pt-6">
          <div className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between max-w-6xl mx-auto">
            <Link to={user ? '/dashboard' : '/'} className="text-white" aria-label="id3a — home">
              <Logo height={22} />
            </Link>
            <nav className="flex items-center gap-1">
              {user ? (
                <>
                  <Link to="/dashboard" className="text-white/80 hover:text-white text-sm font-medium px-4 py-1 transition-colors">
                    {user.displayName.split(' ')[0]}
                  </Link>
                  <button
                    onClick={async () => { await logout(); nav('/'); }}
                    className="text-white/80 hover:text-white text-sm font-medium px-4 py-1 transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link to="/" className="btn glass sm">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
      )}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
