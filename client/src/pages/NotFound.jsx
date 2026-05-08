import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-black">
      <p className="caps mb-4">404</p>
      <h1
        className="text-white mb-3"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(56px, 8vw, 96px)' }}
      >
        Nothing here.
      </h1>
      <p className="text-white/55 mb-8">The page you're looking for doesn't exist or moved.</p>
      <Link to="/" className="btn primary">Go home</Link>
    </div>
  );
}
