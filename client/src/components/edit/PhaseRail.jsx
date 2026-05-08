import { Check, Lock } from 'lucide-react';

/**
 * Sticky phase rail — drives the editor flow. Phases run in fixed order:
 *   slides → narration → broll → voice → music → render
 *
 * Users can jump forward to any phase whose prerequisite is met (e.g. you can't
 * pick a music sample before slides exist), but going backward is always free.
 */

export const PHASES = [
  { id: 'slides',    label: 'Slides',    blurb: 'paint each scene' },
  { id: 'narration', label: 'Narration', blurb: 'tune the script' },
  { id: 'broll',     label: 'B-roll',    blurb: 'film the videos' },
  { id: 'voice',     label: 'Voice',     blurb: 'pick the narrator' },
  { id: 'render',    label: 'Render',    blurb: 'ship the cut' },
];

export default function PhaseRail({ current, completedSet, onPick }) {
  return (
    <nav
      className="flex items-stretch gap-1.5 overflow-x-auto px-6 md:px-10 py-3 border-y border-white/[0.06]"
      aria-label="edit phases"
    >
      {PHASES.map((p, i) => {
        const isCurrent = current === p.id;
        const isDone = completedSet.has(p.id);
        const lockedNote = lockedReason(p.id, completedSet);
        const disabled = !!lockedNote && !isDone && !isCurrent;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => !disabled && onPick(p.id)}
            disabled={disabled}
            title={disabled ? lockedNote : `${p.label} — ${p.blurb}`}
            className={`flex-1 min-w-[120px] text-left px-3 py-2 rounded-md transition-colors border ${
              isCurrent
                ? 'bg-white/[0.06] border-white/30 text-white'
                : isDone
                  ? 'border-white/[0.10] text-white/85 hover:bg-white/[0.04]'
                  : disabled
                    ? 'border-white/[0.05] text-white/25 cursor-not-allowed'
                    : 'border-white/[0.08] text-white/65 hover:bg-white/[0.03] hover:text-white/90'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="mono text-[10px] text-white/40">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-sm font-medium truncate">{p.label}</span>
              {isDone && !isCurrent && <Check size={12} className="text-white/55 ml-auto" />}
              {disabled && <Lock size={11} className="text-white/30 ml-auto" />}
            </div>
            <p className="text-[11px] text-white/45 truncate">{p.blurb}</p>
          </button>
        );
      })}
    </nav>
  );
}

function lockedReason(id, done) {
  if (id === 'narration' && !done.has('slides')) return 'finish Slides first';
  if (id === 'broll' && !done.has('narration')) return 'finish Narration first';
  if (id === 'voice' && !done.has('broll')) return 'finish B-roll first';
  if (id === 'render' && !done.has('voice')) return 'finish Voice first';
  return '';
}
