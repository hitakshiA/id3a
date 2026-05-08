import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ExternalLink, Copy, Check } from 'lucide-react';
import { useAuth } from '../store/auth.js';
import { useProject } from '../store/project.js';
import { api } from '../lib/api.js';
import PhaseRail, { PHASES } from '../components/edit/PhaseRail.jsx';
import PhaseSlides from '../components/edit/PhaseSlides.jsx';
import PhaseNarration from '../components/edit/PhaseNarration.jsx';
import PhaseBRoll from '../components/edit/PhaseBRoll.jsx';
import PhaseVoice from '../components/edit/PhaseVoice.jsx';

const RenderFlow = lazy(() => import('../components/render/RenderFlow.jsx'));

export default function ProjectEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const loadingAuth = useAuth((s) => s.loading);
  const project = useProject((s) => s.project);
  const scenes = useProject((s) => s.scenes);
  const load = useProject((s) => s.load);
  const patchProject = useProject((s) => s.patchProject);
  const [renderOpen, setRenderOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => { if (!loadingAuth && !user) nav('/'); }, [loadingAuth, user, nav]);
  useEffect(() => { if (id) load(id); }, [id, load]);
  useEffect(() => {
    if (project && !project.wizardComplete && project.editPhase === 'wizard') {
      nav(`/project/${project._id}/wizard`, { replace: true });
    }
  }, [project, nav]);

  /* Compute which phases the user has reached / completed. */
  const completedSet = useMemo(() => computeCompleted(scenes, project), [scenes, project]);
  // Music was removed as a UI phase; legacy projects stuck on 'music' jump to 'render'.
  const rawPhase = project?.editPhase;
  const phase = !rawPhase || rawPhase === 'wizard' ? 'slides' : rawPhase === 'music' ? 'render' : rawPhase;

  if (!project) return (
    <div className="h-full flex items-center justify-center">
      <span className="caps">loading<span className="blink" /></span>
    </div>
  );

  async function setPhase(p) {
    if (p === project.editPhase) return;
    await patchProject(project._id, { editPhase: p });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* top bar */}
      <div className="px-6 md:px-10 py-5 flex items-center gap-4 flex-shrink-0">
        <Link to="/dashboard" className="caps text-white/55 hover:text-white transition-colors">← dashboard</Link>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={async () => {
              if (titleDraft.trim() && titleDraft !== project.title)
                await patchProject(project._id, { title: titleDraft.trim() });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingTitle(false); }}
            className="input flex-1 max-w-2xl !py-2"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: '28px', lineHeight: 1.1 }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(project.title); setEditingTitle(true); }}
            className="text-white truncate flex-1 min-w-0 text-left hover:text-white/80 transition-colors"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 3.6vw, 40px)', lineHeight: 1.05 }}
            title="rename"
          >
            {project.title}
          </button>
        )}
        <div className="flex-shrink-0 flex items-center gap-3">
          <span className="caps hidden md:inline">{project.totalSeconds}s · {scenes.length} scenes</span>
          <button
            onClick={() => setRenderOpen(true)}
            disabled={!completedSet.has('voice')}
            className="btn primary gap-2"
            title={completedSet.has('voice') ? 'render the final video' : 'pick a narrator voice first'}
          >
            Render <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* phase rail */}
      <PhaseRail current={phase} completedSet={completedSet} onPick={setPhase} />

      {/* phase body */}
      <div className="flex-1 overflow-auto">
        {phase === 'slides'    && <PhaseSlides    onAdvance={() => setPhase('narration')} />}
        {phase === 'narration' && <PhaseNarration onAdvance={() => setPhase('broll')} />}
        {phase === 'broll'     && <PhaseBRoll     onAdvance={() => setPhase('voice')} />}
        {phase === 'voice'     && <PhaseVoice     onAdvance={() => setPhase('render')} />}
        {phase === 'render'    && <PhaseRender project={project} onOpen={() => setRenderOpen(true)} />}
      </div>

      <Suspense fallback={null}>
        {renderOpen && <RenderFlow onClose={() => setRenderOpen(false)} />}
      </Suspense>
    </div>
  );
}

/**
 * Decide which phases the user has *completed* — used to gate forward
 * navigation in PhaseRail.
 */
function computeCompleted(scenes, project) {
  const done = new Set();
  if (!scenes?.length || !project) return done;

  const slidesDone = scenes.every((s) =>
    s.visualKind === 'slide' ? !!s.slideImage?.base64 : !!s.firstFrameImage?.base64
  );
  if (slidesDone) done.add('slides');

  const narrationDone = slidesDone && scenes.every((s) => (s.narration || '').trim().length > 0);
  if (narrationDone) done.add('narration');

  const brollDone = narrationDone && scenes.every((s) =>
    s.visualKind === 'slide' ? true : !!s.firstFrameImage?.base64 && !!s.lastFrameImage?.base64
  );
  if (brollDone) done.add('broll');

  if (brollDone && project.voiceName) done.add('voice');

  return done;
}

/** Temporary placeholder for phases that haven't been built yet. */
function PhasePlaceholder({ phase, next, setPhase }) {
  const meta = PHASES.find((p) => p.id === phase);
  return (
    <div className="px-6 md:px-10 py-12 max-w-3xl mx-auto">
      <p className="caps mb-2">{phase}</p>
      <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
        {meta?.label} — coming up next.
      </h2>
      <p className="text-white/50 text-sm mt-3">
        This phase is being built. For now you can advance to keep testing the flow.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => setPhase(next)} className="btn primary gap-2">
          Continue to {next} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Render phase — three states:
 *   1. Active: a render job is running for this project. Show a live progress
 *      strip + "we'll email you" reassurance + an Open button to surface the
 *      modal (which polls the same job).
 *   2. Done: this project has a completed Share. Show the share URL with copy
 *      + open buttons, plus a "Render again" affordance.
 *   3. Idle: no active job and no share — show "Ship it" + render button.
 */
function PhaseRender({ project, onOpen }) {
  const [activeJob, setActiveJob] = useState(null);
  const [latestShare, setLatestShare] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  async function refresh() {
    try {
      const [{ jobs }, shares] = await Promise.all([
        api.listRenderJobs(),
        api.listShares(),
      ]);
      const mine = (jobs || []).find((j) => String(j.projectId) === String(project._id));
      setActiveJob(mine || null);
      const share = (shares || [])
        .filter((s) => String(s.projectId) === String(project._id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      setLatestShare(share || null);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refresh();
    function tick() { refresh().finally(() => { pollRef.current = setTimeout(tick, 4000); }); }
    pollRef.current = setTimeout(tick, 4000);
    return () => clearTimeout(pollRef.current);
  }, [project._id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── ACTIVE ── */
  if (activeJob) {
    const order = ['narrate', 'score', 'film', 'stitch', 'mixing', 'captioning'];
    const labels = {
      narrate: 'recording narration', score: 'composing music', film: 'filming video',
      stitch: 'rendering slides', mixing: 'assembling cut', captioning: 'burning captions',
    };
    const stepIdx = activeJob.currentStep ? order.indexOf(activeJob.currentStep) : -1;
    return (
      <div className="px-6 md:px-10 py-12 max-w-3xl mx-auto">
        <p className="caps mb-2">phase 5 of 5 — render</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          {activeJob.status === 'running' ? 'Cutting it together.' : 'Lined up.'}
        </h2>
        <p className="text-white/50 text-sm mt-3">
          {activeJob.status === 'running'
            ? "Don't wait around — we'll email you the link when it's live."
            : `${activeJob.position > 0 ? `${activeJob.position} ahead in queue` : 'Starting'} — we'll email you when it's live.`}
        </p>

        <ol className="mt-7 space-y-2.5">
          {order.map((key, i) => {
            const isCurrent = activeJob.currentStep === key;
            const isDone = stepIdx >= 0 && i < stepIdx;
            return (
              <li key={key} className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isDone ? 'bg-phosphor' : isCurrent ? 'bg-phosphor pulse-soft' : 'bg-white/15'
                  }`}
                  style={{ boxShadow: (isDone || isCurrent) ? '0 0 8px rgba(158,255,74,0.6)' : 'none' }}
                />
                <span className={`text-sm ${isCurrent ? 'text-white' : isDone ? 'text-white/55' : 'text-white/30'}`}>
                  {labels[key]}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-7 flex items-center gap-3">
          <button onClick={onOpen} className="btn outline">Open render window</button>
          <span className="text-white/35 text-xs">id <span className="mono text-white/55">{activeJob.jobId}</span></span>
        </div>
      </div>
    );
  }

  /* ── DONE ── */
  if (latestShare) {
    async function copy() {
      await navigator.clipboard.writeText(latestShare.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    return (
      <div className="px-6 md:px-10 py-12 max-w-3xl mx-auto">
        <p className="caps mb-2">phase 5 of 5 — render</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          Already live.
        </h2>
        <p className="text-white/50 text-sm mt-3">
          Last shipped {new Date(latestShare.createdAt).toLocaleString()} · {latestShare.viewCount} {latestShare.viewCount === 1 ? 'view' : 'views'}.
        </p>

        <div className="surface-inset p-1 flex items-center gap-2 mt-6">
          <input
            readOnly
            value={latestShare.url}
            onFocus={(e) => e.target.select()}
            className="flex-1 bg-transparent text-white px-4 py-2 mono text-sm focus:outline-none"
          />
          <button onClick={copy} className="btn primary sm gap-1.5">
            {copied ? <><Check size={13} /> copied</> : <><Copy size={13} /> copy</>}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <a href={latestShare.url} target="_blank" rel="noreferrer" className="btn outline gap-2">
            Open <ExternalLink size={14} />
          </a>
          <button onClick={onOpen} className="btn ghost">Render again</button>
        </div>

        <p className="text-white/35 text-xs mt-6">
          Re-rendering creates a new public link — the old one stays live until you delete it from your dashboard.
        </p>
      </div>
    );
  }

  /* ── IDLE ── */
  return (
    <div className="px-6 md:px-10 py-12 max-w-3xl mx-auto">
      <p className="caps mb-2">phase 5 of 5 — render</p>
      <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
        Ship it.
      </h2>
      <p className="text-white/50 text-sm mt-3">
        We have everything we need. Click render to assemble the final cut.
      </p>
      <button onClick={onOpen} className="btn primary lg gap-2 mt-6">
        Render the final video <ArrowRight size={16} />
      </button>
    </div>
  );
}
