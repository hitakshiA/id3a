import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Renders a single wizard question. Adapts to:
 *   - kind: 'choice'         → option pills, single-select
 *   - kind: 'text'           → input
 *   - kind: 'text-or-choice' → option pills + free-text fallback
 *   - kind: 'multi-text'     → textarea, one item per line
 *
 * On submit calls onSubmit(value). Pre-fills `suggested` so users can hit
 * Continue immediately if the AI guess is fine.
 */
export default function WizardStep({ question, prevAnswer, onSubmit, submitting }) {
  const { id, prompt, helpText, kind, options = [], suggested = '' } = question;
  const isMulti = kind === 'multi-text';
  const isChoice = kind === 'choice' || kind === 'text-or-choice';

  const [text, setText] = useState(() => {
    if (prevAnswer != null) {
      if (Array.isArray(prevAnswer)) return prevAnswer.join('\n');
      return String(prevAnswer);
    }
    return suggested || '';
  });
  const [picked, setPicked] = useState(() => {
    if (prevAnswer != null && options.includes(String(prevAnswer))) return String(prevAnswer);
    if (suggested && options.includes(suggested)) return suggested;
    return '';
  });

  const inputRef = useRef(null);
  useEffect(() => {
    // Refocus on question change.
    if (inputRef.current && !isChoice) inputRef.current.focus();
  }, [id, isChoice]);

  function submit() {
    if (submitting) return;
    let value;
    if (isMulti) {
      value = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!value.length) return;
    } else if (isChoice) {
      value = picked || text.trim();
      if (!value) return;
    } else {
      value = text.trim();
      if (!value) return;
    }
    onSubmit(value);
  }

  return (
    <div>
      <h2
        className="text-white leading-[1.05]"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 44px)' }}
      >
        {prompt}
      </h2>
      {helpText && <p className="text-white/45 text-sm mt-3">{helpText}</p>}

      <div className="mt-8 space-y-4">
        {isChoice && options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const active = picked === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { setPicked(opt); setText(opt); }}
                  className={`px-4 py-2.5 rounded-full text-sm transition-colors ${
                    active
                      ? 'bg-white text-black border border-white'
                      : 'border border-white/15 text-white/85 hover:border-white/40 hover:text-white'
                  }`}
                  disabled={submitting}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {kind === 'text-or-choice' && (
          <input
            ref={inputRef}
            className="input"
            placeholder="…or type your own"
            value={picked ? '' : text}
            onChange={(e) => { setPicked(''); setText(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            disabled={submitting}
          />
        )}

        {kind === 'text' && (
          <input
            ref={inputRef}
            className="input lg"
            placeholder={suggested ? `e.g., ${suggested}` : ''}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            disabled={submitting}
          />
        )}

        {isMulti && (
          <textarea
            ref={inputRef}
            className="input"
            rows={5}
            placeholder={'one per line\nbe specific'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
          />
        )}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={submit}
          className="btn primary lg gap-2"
          disabled={submitting || (isMulti ? !text.trim() : isChoice ? !(picked || text.trim()) : !text.trim())}
        >
          {submitting ? 'saving…' : <>Continue <ArrowRight size={16} /></>}
        </button>
        {suggested && !picked && !text.trim() && (
          <button
            type="button"
            onClick={() => { isChoice && options.includes(suggested) ? setPicked(suggested) : setText(suggested); }}
            className="btn ghost"
          >
            Use suggestion: <span className="text-white">{suggested}</span>
          </button>
        )}
      </div>
    </div>
  );
}
