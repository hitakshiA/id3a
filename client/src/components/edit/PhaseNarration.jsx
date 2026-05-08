import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { useProject } from '../../store/project.js';
import { api } from '../../lib/api.js';
import PromptRewriteBar from '../shared/PromptRewriteBar.jsx';

/**
 * Phase 2 — narration. Two-column layout:
 *   • LEFT: a vertical "captioned timeline" — slide thumbnails stacked, each
 *           with the narration line beneath it. Click a line to focus it.
 *   • RIGHT: focus panel — the selected line in larger type, an editable
 *           textarea, a PromptRewriteBar to ask Gemini to rewrite the line,
 *           and a diff/accept/reject panel for the suggestion.
 *
 * Edits are debounced and persisted to the scene via PATCH /scenes/:id.
 */
export default function PhaseNarration({ onAdvance }) {
  const scenes = useProject((s) => s.scenes);
  const setSceneLocal = useProject((s) => s.setSceneLocal);
  const patchScene = useProject((s) => s.patchScene);
  const project = useProject((s) => s.project);

  const [focusedId, setFocusedId] = useState(scenes[0]?._id || null);
  const focused = scenes.find((s) => s._id === focusedId) || scenes[0];

  const [suggestion, setSuggestion] = useState(null); // { sceneId, original, suggestion }
  const [error, setError] = useState('');

  /* debounced save of narration text */
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  function changeNarration(scene, value) {
    setSceneLocal(scene._id, { narration: value });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      patchScene(scene._id, { narration: value }).catch((e) => setError(e.message));
    }, 600);
  }

  async function rewriteLine(direction) {
    if (!focused) return;
    setError('');
    try {
      const r = await api.rewriteNarration(focused._id, direction);
      setSuggestion({ sceneId: focused._id, original: r.original, suggestion: r.suggestion });
    } catch (e) { setError(e.message); }
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    setSceneLocal(suggestion.sceneId, { narration: suggestion.suggestion });
    patchScene(suggestion.sceneId, { narration: suggestion.suggestion }).catch((e) => setError(e.message));
    setSuggestion(null);
  }

  const allHaveNarration = scenes.every((s) => (s.narration || '').trim().length > 0);
  const totalSec = scenes.reduce((acc, s) => acc + (s.durationSec || 0), 0);

  return (
    <div className="px-6 md:px-10 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <p className="caps mb-2">phase 2 of 5 — narration</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          Tune the script.
        </h2>
        <p className="text-white/50 text-sm mt-3 max-w-2xl">
          Click any line to focus it. Edit directly, or describe a change ("punchier opener", "cut the jargon") — we'll rewrite it in your voice mood.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

        {/* LEFT — captioned timeline */}
        <div className="space-y-3">
          {scenes.map((s) => {
            const active = focused && s._id === focused._id;
            return (
              <button
                key={s._id}
                onClick={() => { setFocusedId(s._id); setSuggestion(null); }}
                className={`w-full text-left grid grid-cols-[140px_1fr] gap-4 surface p-3 transition-colors ${
                  active ? 'border-white/35 bg-white/[0.04]' : 'hover:border-white/15'
                }`}
              >
                <Thumb scene={s} />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="caps">scene {String(s.order + 1).padStart(2, '0')}</span>
                    <span className="caps !text-[9px] text-white/30">{s.durationSec}s</span>
                  </div>
                  <p className="text-white/85 text-sm leading-relaxed" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '17px' }}>
                    {s.narration || <span className="text-white/30">(empty — click to write)</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT — focus panel */}
        <div className="lg:sticky lg:top-4 self-start space-y-4">
          {focused && (
            <>
              <div className="surface p-5">
                <p className="caps mb-2">scene {String(focused.order + 1).padStart(2, '0')} · {focused.durationSec}s</p>
                <textarea
                  className="input"
                  rows={6}
                  value={focused.narration || ''}
                  onChange={(e) => changeNarration(focused, e.target.value)}
                  placeholder="say the line out loud as you type it…"
                  style={{ fontFamily: "'Instrument Serif', serif", fontSize: '20px', lineHeight: 1.4 }}
                />
                <p className="text-white/40 text-xs mt-2">
                  {wordCount(focused.narration)} words · roughly {estimateSeconds(focused.narration)}s spoken · scene budget {focused.durationSec}s
                  {estimateSeconds(focused.narration) > focused.durationSec && (
                    <span className="text-amber ml-2">⚠ may run long</span>
                  )}
                </p>
              </div>

              <div className="surface p-5">
                <p className="caps mb-3">rewrite with direction</p>
                <PromptRewriteBar
                  placeholder='"punchier opener", "drop the jargon", "more poetic"…'
                  applyLabel="Suggest"
                  onApply={rewriteLine}
                />
                {suggestion && suggestion.sceneId === focused._id && (
                  <div className="mt-4 surface-inset p-4">
                    <p className="caps mb-2">suggested</p>
                    <p className="text-white/90 mb-4" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '18px', lineHeight: 1.4 }}>
                      {suggestion.suggestion}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={acceptSuggestion} className="btn primary sm gap-1.5">
                        <Check size={14} /> accept
                      </button>
                      <button onClick={() => setSuggestion(null)} className="btn outline sm gap-1.5">
                        <X size={14} /> discard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {error && <div className="text-rust text-sm">{error}</div>}
        </div>
      </div>

      <div className="mt-12 flex items-center justify-end gap-3">
        <span className="text-white/45 text-sm">
          {scenes.filter((s) => (s.narration || '').trim()).length} / {scenes.length} written · ~{Math.round(totalSec)}s total
        </span>
        <button
          onClick={onAdvance}
          disabled={!allHaveNarration}
          className="btn primary lg gap-2"
        >
          Continue to b-roll <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Thumb({ scene }) {
  const slide = scene.slideImage;
  const first = scene.firstFrameImage;
  const img = slide?.base64 ? slide : first?.base64 ? first : null;
  if (!img) {
    return <div className="aspect-video surface-inset" />;
  }
  return (
    <div className="aspect-video surface-inset overflow-hidden">
      <img src={`data:${img.mime};base64,${img.base64}`} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

function wordCount(s) {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

/** Rough estimate: ~2.5 words/second of natural narration. */
function estimateSeconds(s) {
  const w = wordCount(s);
  return Math.round(w / 2.5);
}
