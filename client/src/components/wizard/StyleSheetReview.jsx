import { ArrowRight, RotateCcw } from 'lucide-react';

/**
 * Final wizard step: shows the user a summary of their answers, then asks
 * them to confirm. On confirm we call /finalize which (a) locks the
 * styleSheet via Gemini Pro and (b) plans the scenes.
 */
export default function StyleSheetReview({ answers, onFinalize, onRestart, finalizing }) {
  const rows = [
    ['Audience', answers.audience],
    ['Tone', answers.tone],
    ['Length', `${answers.lengthSec || 60} sec`],
    ['Key points', (answers.keyPoints || []).join(' · ')],
    ['Visual', answers.visualAesthetic],
    ['Voice mood', answers.voiceMood],
    ['Music vibe', answers.musicVibe],
  ];

  return (
    <div>
      <h2
        className="text-white leading-[1.05]"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 44px)' }}
      >
        Lock it in?
      </h2>
      <p className="text-white/45 text-sm mt-3">
        We'll freeze a project style sheet from these answers and use it to plan every scene, slide, voice, and music sample.
      </p>

      <div className="mt-8 surface p-6">
        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-6 gap-y-4">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="caps">{label}</dt>
              <dd className="text-white/85 text-sm">{value || <span className="text-white/30">—</span>}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={onFinalize}
          className="btn primary lg gap-2"
          disabled={finalizing}
        >
          {finalizing ? 'locking the look + planning scenes…' : <>Lock it in <ArrowRight size={16} /></>}
        </button>
        <button onClick={onRestart} className="btn ghost gap-2" disabled={finalizing}>
          <RotateCcw size={14} /> Start over
        </button>
      </div>
      {finalizing && (
        <p className="text-white/45 text-xs mt-3">~10–15 seconds. We're designing the look, then planning every scene.</p>
      )}
    </div>
  );
}
