import { useState } from 'react';
import { Wand2, RefreshCw } from 'lucide-react';

/**
 * Generic prompt-rewrite input. Used across phases:
 *   - Slides: "make it more dramatic" → regenerate slide via rewriter
 *   - Narration: "punchier opener" → /scenes/:id/narration/rewrite
 *   - B-roll: "switch to nighttime" → regenerate first/last frame
 *
 * The component itself is dumb. Caller passes:
 *   - onApply(direction)   → returns Promise; bar shows busy state until resolved
 *   - placeholder          → contextual placeholder text
 *   - applyLabel           → "Regenerate", "Rewrite", etc.
 *   - secondaryLabel?      → optional second action ("Same prompt") to bypass the bar
 *   - onSecondary?
 */
export default function PromptRewriteBar({
  placeholder = 'describe the change you want…',
  applyLabel = 'Apply',
  onApply,
  secondaryLabel,
  onSecondary,
  allowEmpty = false,
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (busy) return;
    const direction = text.trim();
    if (!direction && !allowEmpty) return;
    setBusy(true);
    try { await onApply(direction); setText(''); }
    finally { setBusy(false); }
  }

  async function secondary() {
    if (busy || !onSecondary) return;
    setBusy(true);
    try { await onSecondary(); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2 surface-inset px-3 py-1.5">
        <Wand2 size={14} className="text-white/40 flex-shrink-0" />
        <input
          className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/35 py-1"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          disabled={busy}
        />
      </div>
      <button
        onClick={apply}
        disabled={busy || (!allowEmpty && !text.trim())}
        className="btn primary sm gap-1.5 flex-shrink-0"
      >
        {busy ? '…' : applyLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button onClick={secondary} disabled={busy} className="btn outline sm gap-1.5 flex-shrink-0">
          <RefreshCw size={12} /> {secondaryLabel}
        </button>
      )}
    </div>
  );
}
