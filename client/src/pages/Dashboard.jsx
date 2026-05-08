import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { relTime, fmtSeconds, fmtBytes } from '../lib/format.js';

const RENDER_STEP_LABELS = {
  narrate:    'recording narration',
  score:      'composing music',
  film:       'filming video scenes',
  stitch:     'rendering slides',
  mixing:     'assembling final cut',
  captioning: 'burning captions',
};
const RENDER_STEP_ORDER = ['narrate', 'score', 'film', 'stitch', 'mixing', 'captioning'];

export default function Dashboard() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const [tab, setTab] = useState('drafts');

  useEffect(() => { if (!loading && !user) nav('/'); }, [loading, user, nav]);
  if (loading || !user) return null;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16">

        <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 rise rise-1">
          <div>
            <p className="caps mb-3">your studio</p>
            <h1
              className="text-white tracking-tight leading-[0.95]"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(40px, 6vw, 64px)' }}
            >
              Hi, {user.displayName.split(' ')[0]}.
            </h1>
          </div>
          <Link to="/new" className="btn primary lg gap-2">
            New pitch <ArrowRight size={16} />
          </Link>
        </section>

        <div className="liquid-glass rounded-full inline-flex p-1 mb-8 rise rise-2">
          {[
            ['drafts', 'Drafts'],
            ['shared', 'Shared'],
            ['account', 'Account'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2 text-sm rounded-full transition-colors ${
                tab === key ? 'bg-white text-black font-semibold' : 'text-white/70 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rise rise-3">
          {tab === 'drafts' && <DraftsTab />}
          {tab === 'shared' && <SharedTab />}
          {tab === 'account' && <AccountTab user={user} />}
        </div>
      </div>
    </div>
  );
}

function DraftsTab() {
  const [items, setItems] = useState(null);
  const [jobs, setJobs] = useState([]);     // active render jobs (queued / running)
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function refresh() {
    try { setItems(await api.listProjects()); }
    catch (e) { setError(e.message); }
  }

  async function refreshJobs() {
    try {
      const r = await api.listRenderJobs();
      setJobs(r.jobs || []);
    } catch { /* not signed-in race or transient — ignore */ }
  }

  /* Initial load + always poll jobs every 4s while there's anything active.
     Poll stops automatically once the queue empties and resumes if the user
     starts a new render from the editor. */
  useEffect(() => {
    refresh();
    refreshJobs();
    function tick() {
      refreshJobs().finally(() => {
        pollRef.current = setTimeout(tick, 4000);
      });
    }
    pollRef.current = setTimeout(tick, 4000);
    return () => clearTimeout(pollRef.current);
  }, []);

  /* When a job transitions done → not-in-list, re-load the project list so
     the row reflects new status / shared link. */
  const lastJobIdsRef = useRef(new Set());
  useEffect(() => {
    const ids = new Set(jobs.map((j) => j.jobId));
    const dropped = [...lastJobIdsRef.current].filter((id) => !ids.has(id));
    if (dropped.length) refresh();
    lastJobIdsRef.current = ids;
  }, [jobs]);

  function jobForProject(projectId) {
    return jobs.find((j) => String(j.projectId) === String(projectId)) || null;
  }

  if (error) return <p className="text-white/60">{error}</p>;
  if (items === null) return <ListSkeleton rows={3} />;
  if (!items.length) return (
    <div className="surface px-8 py-14 text-center">
      <h3
        className="text-white mb-2"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: '32px', lineHeight: 1.1 }}
      >
        No drafts yet.
      </h3>
      <p className="text-white/55 mb-6">Type one line. Get a pitch video.</p>
      <Link to="/new" className="btn primary">Start your first pitch →</Link>
    </div>
  );
  return (
    <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
      {items.map((p) => {
        const inWizard = !p.wizardComplete && p.editPhase === 'wizard';
        const job = jobForProject(p._id);
        const targetPath = inWizard ? `/project/${p._id}/wizard` : `/project/${p._id}`;
        return (
        <li key={p._id} className="px-6 py-5 group hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-4">
            <Link to={targetPath} className="flex-1 min-w-0">
              <div
                className="text-white truncate"
                style={{ fontFamily: "'Instrument Serif', serif", fontSize: '24px', lineHeight: 1.15 }}
              >
                {p.title}
              </div>
              <div className="text-xs text-white/45 mt-1.5 flex items-center gap-3">
                <span className={`caps ${inWizard ? 'text-amber' : job ? 'text-phosphor' : ''}`}>
                  {inWizard
                    ? 'wizard in progress'
                    : job
                      ? (job.status === 'queued' ? `queued · #${job.position}` : 'rendering')
                      : (p.editPhase || p.status)}
                </span>
                <span>{p.totalSeconds}s</span>
                <span>{relTime(p.updatedAt)}</span>
              </div>
            </Link>
            <Link to={targetPath} className="btn outline sm">{inWizard ? 'Resume' : job ? 'View' : 'Open'}</Link>
            <button
              onClick={async () => {
                if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
                await api.deleteProject(p._id); refresh();
              }}
              disabled={!!job}
              className="btn ghost sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
              title={job ? 'cannot delete while rendering' : 'delete project'}
            >
              Delete
            </button>
          </div>
          {job && job.status === 'running' && <RenderProgressStrip job={job} />}
        </li>
        );
      })}
    </ul>
  );
}

/** Live phase strip shown below a project row while it's rendering. */
function RenderProgressStrip({ job }) {
  const stepIdx = job.currentStep ? RENDER_STEP_ORDER.indexOf(job.currentStep) : -1;
  return (
    <div className="mt-4 ml-1">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {RENDER_STEP_ORDER.map((key, i) => {
          const isCurrent = job.currentStep === key;
          const isDone = stepIdx >= 0 && i < stepIdx;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isDone ? 'bg-phosphor' : isCurrent ? 'bg-phosphor pulse-soft' : 'bg-white/15'
                }`}
                style={{ boxShadow: (isDone || isCurrent) ? '0 0 8px rgba(158,255,74,0.6)' : 'none' }}
              />
              <span className={`text-[11px] ${isCurrent ? 'text-white' : isDone ? 'text-white/55' : 'text-white/25'}`}>
                {RENDER_STEP_LABELS[key]}
              </span>
              {i < RENDER_STEP_ORDER.length - 1 && <span className="text-white/15 text-[11px]">·</span>}
            </div>
          );
        })}
      </div>
      <p className="text-white/35 text-xs">
        Render id <span className="mono text-white/50">{job.jobId}</span>
        {' · '}we'll email you when it's live
      </p>
    </div>
  );
}

function SharedTab() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function refresh() {
    try { setItems(await api.listShares()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function copyLink(url, slug) {
    await navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(''), 1500);
  }

  if (error) return <p className="text-white/60">{error}</p>;
  if (items === null) return <ListSkeleton rows={3} />;
  if (!items.length) return (
    <div className="surface px-8 py-14 text-center">
      <h3
        className="text-white mb-2"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: '32px', lineHeight: 1.1 }}
      >
        No shared videos.
      </h3>
      <p className="text-white/55">Render a pitch and choose “Save & share” to get a public link.</p>
    </div>
  );
  return (
    <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
      {items.map((s) => (
        <li key={s.slug} className="px-6 py-5 flex items-center gap-4 group">
          <a href={s.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0">
            <div
              className="text-white truncate"
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: '24px', lineHeight: 1.15 }}
            >
              {s.title}
            </div>
            <div className="text-xs text-white/45 mt-1.5 flex items-center gap-3 flex-wrap">
              <span className="mono">{s.url.replace(/^https?:\/\//, '')}</span>
              <span>{fmtSeconds(s.durationSec)}</span>
              <span>{fmtBytes(s.fileSizeBytes)}</span>
              <span>{s.viewCount} {s.viewCount === 1 ? 'view' : 'views'}</span>
              <span>{relTime(s.createdAt)}</span>
            </div>
          </a>
          <button onClick={() => copyLink(s.url, s.slug)} className="btn outline sm">
            {copied === s.slug ? 'Copied' : 'Copy link'}
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Delete "${s.title}"? The link will stop working.`)) return;
              await api.deleteShare(s.slug); refresh();
            }}
            className="btn ghost sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

function AccountTab({ user }) {
  return (
    <div className="surface p-8 max-w-xl">
      <p className="caps mb-3">signed in as</p>
      <div
        className="text-white mb-1"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: '36px', lineHeight: 1.1 }}
      >
        {user.displayName}
      </div>
      <div className="text-white/55 mono text-sm">{user.email}</div>
      <div className="dotted my-6" />
      <p className="text-sm text-white/45">
        Settings are intentionally minimal in this build. Magic-link sign-in only — no password to manage.
      </p>
    </div>
  );
}

function ListSkeleton({ rows = 3 }) {
  return (
    <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="px-6 py-5">
          <div className="skeleton h-5 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/3 rounded mt-2" />
        </li>
      ))}
    </ul>
  );
}
