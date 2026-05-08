import { Check } from 'lucide-react';

/**
 * Compact stepper. Shows N circles with labels under each. Past steps marked
 * with a check, current step solid, future steps faded.
 *
 * `answers` is currently unused but reserved — we'll surface a tooltip with
 * the saved answer for completed steps in a future polish pass.
 */
// eslint-disable-next-line no-unused-vars
export default function WizardProgress({ step, total, labels = [], answers = {} }) {
  return (
    <div className="flex items-center gap-1.5 select-none">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <div key={i} className="flex-1 min-w-0">
            <div className="flex items-center">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
                  done
                    ? 'bg-white text-black'
                    : current
                      ? 'bg-white/15 text-white border border-white/40'
                      : 'bg-transparent text-white/35 border border-white/10'
                }`}
              >
                {done ? <Check size={13} strokeWidth={2.5} /> : <span className="mono text-[10px]">{String(i + 1).padStart(2, '0')}</span>}
              </div>
              {i < total - 1 && (
                <div className={`flex-1 h-px ${done ? 'bg-white/40' : 'bg-white/10'}`} />
              )}
            </div>
            <p
              className={`mt-2 caps !text-[9px] truncate ${
                current ? 'text-white' : done ? 'text-white/55' : 'text-white/25'
              }`}
            >
              {labels[i] || ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
