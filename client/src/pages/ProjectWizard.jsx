import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import WizardProgress from '../components/wizard/WizardProgress.jsx';
import WizardStep from '../components/wizard/WizardStep.jsx';
import StyleSheetReview from '../components/wizard/StyleSheetReview.jsx';

const QUESTION_LABELS = {
  audience:        'Audience',
  tone:            'Tone',
  lengthSec:       'Length',
  keyPoints:       'Key points',
  visualAesthetic: 'Visual',
  voiceMood:       'Voice',
  musicVibe:       'Music',
};

export default function ProjectWizard() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const loadingAuth = useAuth((s) => s.loading);

  const [project, setProject] = useState(null);
  const [state, setState] = useState(null);   // { answers, step, complete, question }
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // bounce unauth'd users
  useEffect(() => { if (!loadingAuth && !user) nav('/'); }, [loadingAuth, user, nav]);

  // load project + initial wizard state
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const [p, w] = await Promise.all([api.getProject(id), api.getWizard(id)]);
        if (!alive) return;
        setProject(p.project);
        setState(w);
        // if already finalized, jump to editor
        if (p.project?.wizardComplete && p.project?.editPhase !== 'wizard') {
          nav(`/project/${id}`, { replace: true });
        }
      } catch (e) { if (alive) setError(e.message); }
    })();
    return () => { alive = false; };
  }, [id, user, nav]);

  async function submitAnswer(value) {
    if (submitting || !state?.question) return;
    setSubmitting(true); setError('');
    try {
      const next = await api.answerWizard(id, { questionId: state.question.id, answer: value });
      setState(next);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  async function restart() {
    if (submitting) return;
    setSubmitting(true); setError('');
    try {
      const next = await api.restartWizard(id);
      setState(next);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  async function finalize() {
    if (finalizing) return;
    setFinalizing(true); setError('');
    try {
      const r = await api.finalizeWizard(id);
      // move to editor
      nav(`/project/${r.project._id}`);
    } catch (e) { setError(e.message); setFinalizing(false); }
  }

  if (!project || !state) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="caps">{error || 'loading'}<span className="blink" /></span>
      </div>
    );
  }

  const totalSteps = 7;
  const currentStep = state.complete ? totalSteps : (state.question?.step ?? state.step ?? 0);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-14">

        {/* header */}
        <div className="flex items-center justify-between mb-8 rise rise-1">
          <Link to="/dashboard" className="caps hover:text-white transition-colors">
            ← back to dashboard
          </Link>
          <button onClick={restart} className="caps hover:text-white transition-colors flex items-center gap-1.5" disabled={submitting}>
            <RotateCcw size={11} /> restart
          </button>
        </div>

        {/* seed echo */}
        <p className="caps mb-3 rise rise-1">your idea</p>
        <h1
          className="text-white leading-[0.98] mb-10 rise rise-1"
          style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(32px, 4.5vw, 52px)' }}
        >
          {project.seedPrompt}
        </h1>

        {/* progress */}
        <WizardProgress
          step={currentStep}
          total={totalSteps}
          labels={Object.values(QUESTION_LABELS)}
          answers={state.answers || {}}
        />

        <div className="rise rise-2 mt-10">
          {state.complete ? (
            <StyleSheetReview
              answers={state.answers}
              onFinalize={finalize}
              onRestart={restart}
              finalizing={finalizing}
            />
          ) : (
            <WizardStep
              key={state.question.id}
              question={state.question}
              prevAnswer={state.answers?.[state.question.id]}
              onSubmit={submitAnswer}
              submitting={submitting}
            />
          )}
          {error && <div className="text-rust text-sm mt-4">{error}</div>}
        </div>
      </div>
    </div>
  );
}
