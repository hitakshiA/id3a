import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Mail, X, Check } from 'lucide-react';
import { useProject } from '../../store/project.js';
import { useAuth } from '../../store/auth.js';
import { api } from '../../lib/api.js';

/**
 * Async render flow.
 *
 *   confirm  → user reviews cost + caption toggle and hits start
 *   queued   → "we'll email you when it's done — you can close this tab"
 *              optional in-tab progress (we poll the queue)
 *   done     → "live at <link>" — but we still emailed them, so this is
 *              just a courtesy if they happened to keep the tab open
 *   failed   → error message + suggestion to try again
 *
 * Async by design — the user closes the tab, the render runs server-side,
 * The render is enqueued; rendering happens server-side; the share is auto-
 * created; the user receives an email with the link.
 */

const STEP_LABELS = {
  narrate:    'Recording narration',
  score:      'Composing music',
  film:       'Filming video scenes',
  stitch:     'Rendering slides',
  mixing:     'Assembling final cut',
  captioning: 'Burning captions',
};
const STEP_ORDER = ['narrate', 'score', 'film', 'stitch', 'mixing', 'captioning'];

export default function RenderFlow({ onClose }) {
  const project = useProject((s) => s.project);
  const scenes = useProject((s) => s.scenes);
  const user = useAuth((s) => s.user);

  const [phase, setPhase] = useState('confirm'); // confirm | queued | done | failed
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  /* If an existing job is already running/queued for this project, hop into it. */
  useEffect(() => {
    let alive = true;
    api.listRenderJobs()
      .then(({ jobs }) => {
        if (!alive) return;
        const mine = (jobs || []).find((j) => String(j.projectId) === String(project._id));
        if (mine) { setJob(mine); setPhase('queued'); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [project._id]);

  const videoCount = scenes.filter((s) => s.visualKind === 'video').length;
  const cost = useMemo(() => {
    // Veo is the heaviest cost ($0.10/clip). The planner caps video scenes
    // at 2, so this always lands between $0 and $0.20 for video.
    const veo = videoCount * 0.10;
    const lyria = 0.08;
    const tts = scenes.length * 0.005;
    return (veo + lyria + tts).toFixed(2);
  }, [videoCount, scenes.length]);

  /* poll the job until it terminates */
  useEffect(() => {
    if (phase !== 'queued' || !job?.jobId) return;
    let alive = true;
    async function poll() {
      try {
        const { job: j } = await api.getRenderJob(job.jobId);
        if (!alive) return;
        setJob(j);
        if (j.status === 'done') setPhase('done');
        else if (j.status === 'failed') { setPhase('failed'); setError(j.errorMessage || 'render failed'); }
        else pollRef.current = setTimeout(poll, 2500);
      } catch (e) {
        if (!alive) return;
        // job 404 means it was GC'd — assume it succeeded if we hadn't seen failure.
        if (/job not found/i.test(e.message)) { setPhase('done'); return; }
        pollRef.current = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { alive = false; clearTimeout(pollRef.current); };
  }, [phase, job?.jobId]);

  async function startRender() {
    setError('');
    try {
      const r = await api.startRender(project._id);
      setJob(r.job);
      setPhase('queued');
    } catch (e) {
      setError(e.message);
      setPhase('failed');
    }
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
      <div className="liquid-glass rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        <header className="px-6 py-4 flex items-center justify-between border-b border-white/[0.06]">
          <p className="caps">render · {project.title}</p>
          <button onClick={onClose} className="btn ghost sm" aria-label="close">
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-7">
          {phase === 'confirm' && (
            <ConfirmView
              project={project}
              scenes={scenes}
              videoCount={videoCount}
              cost={cost}
              userEmail={user?.email}
              onCancel={onClose}
              onStart={startRender}
            />
          )}

          {phase === 'queued' && job && (
            <QueuedView job={job} userEmail={user?.email} />
          )}

          {phase === 'done' && job && (
            <DoneView job={job} onClose={onClose} />
          )}

          {phase === 'failed' && (
            <FailedView error={error} onClose={onClose} onRetry={() => { setPhase('confirm'); setError(''); }} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── views ──────────────────────────────────────────────────────── */

function ConfirmView({ project, scenes, videoCount, cost, userEmail, onCancel, onStart }) {
  return (
    <div>
      <h2
        className="text-white mb-3 leading-[0.98]"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(36px, 5vw, 52px)' }}
      >
        Ready to ship?
      </h2>
      <p className="text-white/55 mb-6 leading-relaxed">
        We'll film {videoCount} {videoCount === 1 ? 'video scene' : 'video scenes'}, score the music bed, narrate {scenes.length} scenes, and stitch the final cut at 720p.
        <br />
        <span className="text-white/40 text-sm">~3–6 minutes. You can close this tab — we'll email you the link.</span>
      </p>

      <div className="surface-inset px-6 py-5 mb-5 grid grid-cols-3 gap-4">
        <Stat label="duration" v={`${project.totalSeconds}s`} />
        <Stat label="scenes" v={`${scenes.length}`} />
        <Stat label="estimated cost" v={`$${cost}`} accent />
      </div>

      <CaptionToggle project={project} />

      <div className="surface-inset mt-4 p-4 flex items-start gap-3">
        <Mail size={16} className="text-white/55 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/65 leading-relaxed">
          We'll email <span className="text-white">{userEmail || 'your account'}</span> when the render finishes — you can close this tab now and the work continues server-side.
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onCancel} className="btn glass">Cancel</button>
        <button onClick={onStart} className="btn primary lg gap-2">
          Start render <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function QueuedView({ job, userEmail }) {
  const queueLabel =
    job.status === 'running' ? null
      : job.position > 0 ? `${ord(job.position)} in queue`
      : '';

  const stepIdx = job.currentStep ? STEP_ORDER.indexOf(job.currentStep) : -1;

  return (
    <div>
      <p className="caps mb-2">{job.status === 'running' ? 'rendering' : 'queued'}</p>
      <h2
        className="text-white mb-3 leading-[0.98]"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(32px, 4.5vw, 44px)' }}
      >
        {job.status === 'running' ? 'Cutting it together.' : 'Lined up.'}
      </h2>
      <p className="text-white/55 mb-6 leading-relaxed">
        You can close this tab now — we'll email <span className="text-white">{userEmail || 'your account'}</span> when it's live, usually in 3–6 minutes.
      </p>

      {queueLabel && (
        <div className="surface-inset p-4 mb-5">
          <p className="text-white/85 text-sm">{queueLabel} · waiting for the slot to open.</p>
        </div>
      )}

      <ol className="space-y-3 mb-6">
        {STEP_ORDER.map((key, i) => {
          const isCurrent = job.currentStep === key;
          const isDone = stepIdx >= 0 && i < stepIdx;
          return (
            <li key={key} className="flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isDone ? 'bg-phosphor' : isCurrent ? 'bg-phosphor pulse-soft' : 'bg-white/15'
                }`}
                style={{ boxShadow: (isDone || isCurrent) ? '0 0 8px rgba(158,255,74,0.6)' : 'none' }}
              />
              <span className={isCurrent ? 'text-white' : isDone ? 'text-white/65' : 'text-white/35'}>
                {STEP_LABELS[key]}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-white/35 text-xs">
        Render id: <span className="mono text-white/55">{job.jobId}</span>
      </p>
    </div>
  );
}

function DoneView({ job, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <h2
        className="text-white mb-3 leading-[0.98]"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(36px, 5vw, 52px)' }}
      >
        It's live.
      </h2>
      <p className="text-white/55 mb-6 leading-relaxed">
        Check your inbox for the watch + share link. You can also grab it here:
      </p>
      <div className="surface-inset p-1 flex items-center gap-2 mb-4">
        <input
          readOnly
          value={job.shareUrl}
          onFocus={(e) => e.target.select()}
          className="flex-1 bg-transparent text-white px-4 py-2 mono text-sm focus:outline-none"
        />
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(job.shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="btn primary sm gap-1.5"
        >
          {copied ? <><Check size={13} /> copied</> : 'copy'}
        </button>
      </div>
      <div className="flex gap-2 justify-end mt-6">
        <a href={job.shareUrl} target="_blank" rel="noreferrer" className="btn glass">Open ↗</a>
        <button onClick={onClose} className="btn primary">Done</button>
      </div>
    </div>
  );
}

function FailedView({ error, onClose, onRetry }) {
  return (
    <div>
      <h2
        className="mb-3"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: '40px', color: '#ff6a3d' }}
      >
        Render failed.
      </h2>
      <p className="text-white/55 mb-2">{error}</p>
      <p className="text-white/40 text-sm mb-6">
        We've sent you an email with the same details so you can come back later.
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="btn glass">Close</button>
        <button onClick={onRetry} className="btn primary">Try again</button>
      </div>
    </div>
  );
}

/* ─── small pieces ───────────────────────────────────────────────── */

function CaptionToggle({ project }) {
  const patchProject = useProject((s) => s.patchProject);
  const enabled = project.captionsEnabled !== false;
  return (
    <button
      type="button"
      onClick={() => patchProject(project._id, { captionsEnabled: !enabled })}
      className="w-full surface-inset px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors"
    >
      <div className={`w-10 h-6 rounded-full flex-shrink-0 relative transition-colors ${enabled ? 'bg-white' : 'bg-white/15'}`}>
        <div
          className={`absolute top-0.5 ${enabled ? 'left-[18px] bg-black' : 'left-0.5 bg-white/55'} w-5 h-5 rounded-full transition-all`}
        />
      </div>
      <div className="text-left flex-1">
        <p className="text-sm text-white">Burn captions into the final video</p>
        <p className="text-xs text-white/45">{enabled ? 'Subtitles will be visible on every scene.' : 'Final video has no on-screen text.'}</p>
      </div>
    </button>
  );
}

function Stat({ label, v, accent }) {
  return (
    <div>
      <p className="caps mb-1">{label}</p>
      <p
        className={`${accent ? 'text-white' : 'text-white'}`}
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: '32px', lineHeight: 1 }}
      >
        {v}
      </p>
    </div>
  );
}

function ord(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}
