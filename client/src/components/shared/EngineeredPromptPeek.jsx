import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

/**
 * Disclosure that shows the engineered prompt the rewriter actually sent the
 * model. Default collapsed — keeps the editor clean — but power users can
 * peek to audit what the agent did with their nudge.
 */
export default function EngineeredPromptPeek({ label = 'Engineered prompt', prompt }) {
  const [open, setOpen] = useState(false);
  if (!prompt?.trim()) return null;
  return (
    <div className="rounded-md border border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-white/55 hover:text-white/80 transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Sparkles size={11} className="text-white/40" />
        <span>{label}</span>
        <span className="text-white/30">— {prompt.length} chars</span>
      </button>
      {open && (
        <pre className="px-3 pb-3 mono text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap break-words">
{prompt}
        </pre>
      )}
    </div>
  );
}
