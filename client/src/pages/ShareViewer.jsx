import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Download, Copy, Check, Calendar, Eye, Mic, User, Film } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { api } from '../lib/api.js';
import { fmtBytes, fmtSeconds, relTime } from '../lib/format.js';

export default function ShareViewer() {
  const { slug } = useParams();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getShare(slug).then(setMeta).catch((e) => setError(e.message));
  }, [slug]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-black">
      <p className="caps mb-4">404</p>
      <h1
        className="text-white mb-3"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 6vw, 64px)' }}
      >
        Video not found.
      </h1>
      <p className="text-white/55 mb-8">{error}</p>
      <Link to="/" className="btn glass">Go home</Link>
    </div>
  );

  if (!meta) return (
    <div className="h-full flex items-center justify-center bg-black">
      <span className="caps">loading<span className="blink" /></span>
    </div>
  );

  const generatedOn = new Date(meta.createdAt);
  const generatedNice = generatedOn.toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const generatedTime = generatedOn.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="h-full overflow-auto bg-black">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-12">

        {/* nav */}
        <div className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between mb-10">
          <Link to="/" className="text-white" aria-label="id3a — home">
            <Logo height={22} />
          </Link>
          <Link to="/" className="btn glass sm gap-2">Make your own <ArrowRight size={14} /></Link>
        </div>

        {/* title */}
        <h1
          className="text-white leading-[0.98] tracking-tight mb-3 rise rise-1"
          style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 6vw, 72px)' }}
        >
          {meta.title}
        </h1>
        <p className="text-white/45 mb-8 rise rise-1 text-sm">
          by <span className="text-white">{meta.creator}</span>
          <span className="mx-2 text-white/25">·</span>
          {fmtSeconds(meta.durationSec)}
          <span className="mx-2 text-white/25">·</span>
          {meta.viewCount} {meta.viewCount === 1 ? 'view' : 'views'}
        </p>

        {/* video + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_1.4fr] gap-6 rise rise-2">

          <div>
            <div className="surface-inset overflow-hidden">
              <video
                src={meta.videoUrl}
                poster={meta.posterUrl}
                controls
                preload="metadata"
                className="w-full"
                playsInline
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href={`${meta.videoUrl}?download=1`} className="btn outline gap-2">
                <Download size={16} /> Download MP4
              </a>
              <button onClick={copyLink} className="btn outline gap-2">
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
              </button>
              <Link to="/" className="btn primary gap-2">
                Make your own <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* sidebar — about this video */}
          <aside className="space-y-5">
            {meta.seedPrompt && (
              <div className="surface p-5">
                <p className="caps mb-3">about this video</p>
                <p
                  className="text-white/90 leading-relaxed"
                  style={{ fontFamily: "'Instrument Serif', serif", fontSize: '20px', lineHeight: 1.4 }}
                >
                  {meta.seedPrompt}
                </p>
              </div>
            )}

            <div className="surface p-5">
              <p className="caps mb-3">details</p>
              <dl className="space-y-3 text-sm">
                <Row icon={User}     label="creator"   value={meta.creator} />
                <Row icon={Calendar} label="generated" value={
                  <>
                    {generatedNice}
                    <span className="text-white/40 mono ml-2">{generatedTime}</span>
                    <div className="text-white/40 text-xs mt-0.5">{relTime(meta.createdAt)}</div>
                  </>
                } />
                {meta.sceneCount > 0 && (
                  <Row icon={Film} label="scenes" value={`${meta.sceneCount} cuts`} />
                )}
                {meta.voiceName && (
                  <Row icon={Mic} label="narrator" value={meta.voiceName} />
                )}
                <Row icon={Eye} label="views"      value={`${meta.viewCount}`} />
                <Row              label="size"     value={`${fmtBytes(meta.fileSizeBytes)}, 720p · H.264`} />
              </dl>
            </div>
          </aside>
        </div>

        <div className="dotted mt-16 pt-8 text-sm text-white/40 rise rise-3">
          Built on id3a — type one line, get a pitch video.
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3">
      <div className="w-5 flex-shrink-0 pt-0.5">
        {Icon && <Icon size={13} className="text-white/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <dt className="caps mb-1">{label}</dt>
        <dd className="text-white/85">{value}</dd>
      </div>
    </div>
  );
}
