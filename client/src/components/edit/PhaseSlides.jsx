import { ArrowRight, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useProject } from '../../store/project.js';
import PromptRewriteBar from '../shared/PromptRewriteBar.jsx';
import EngineeredPromptPeek from '../shared/EngineeredPromptPeek.jsx';

/**
 * Linear, prompt-driven slide editor. Every scene gets a card showing:
 *   - the slide image (or placeholder)
 *   - the narration line below as caption (read-only here; narration phase edits it)
 *   - a PromptRewriteBar to direct a regen ("make it more dramatic")
 *   - a "Regenerate as-is" secondary action
 *   - the engineered prompt as a collapsible peek
 *
 * VIDEO-kind scenes show first+last keyframes instead of one slide.
 */
export default function PhaseSlides({ onAdvance }) {
  const scenes = useProject((s) => s.scenes);
  const regenerate = useProject((s) => s.regenerate);
  const [autoGen, setAutoGen] = useState({ active: false, currentLabel: '', done: 0, total: 0 });
  const autoRanRef = useRef(false);

  /**
   * On entering Slides for the first time on this project, auto-generate every
   * missing visual one after another. Sequential (not parallel) keeps memory
   * sane and respects API rate limits. We re-read the live store inside the
   * loop so a manual user-regen can update the cache mid-flight.
   */
  useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    (async () => {
      const ids = useProject.getState().scenes.map((s) => s._id);
      // First count how much we have to do.
      const countMissing = () => {
        let n = 0;
        for (const id of ids) {
          const cur = useProject.getState().scenes.find((s) => s._id === id);
          if (!cur) continue;
          if (cur.visualKind === 'slide') {
            if (!cur.slideImage?.base64) n += 1;
          } else {
            if (!cur.firstFrameImage?.base64) n += 1;
            if (!cur.lastFrameImage?.base64) n += 1;
          }
        }
        return n;
      };
      const total = countMissing();
      if (total === 0) return;
      setAutoGen({ active: true, currentLabel: '', done: 0, total });

      let done = 0;
      for (let idx = 0; idx < ids.length; idx++) {
        const id = ids[idx];
        const cur = useProject.getState().scenes.find((s) => s._id === id);
        if (!cur) continue;
        const tasks = [];
        if (cur.visualKind === 'slide') {
          if (!cur.slideImage?.base64) tasks.push({ target: 'slide', label: `scene ${idx + 1} slide` });
        } else {
          if (!cur.firstFrameImage?.base64) tasks.push({ target: 'firstFrame', label: `scene ${idx + 1} first frame` });
          if (!cur.lastFrameImage?.base64)  tasks.push({ target: 'lastFrame',  label: `scene ${idx + 1} last frame` });
        }
        for (const t of tasks) {
          setAutoGen((p) => ({ ...p, currentLabel: t.label }));
          try { await regenerate(id, t.target, ''); }
          catch (e) { console.warn(`[autogen] ${t.label} failed:`, e.message); }
          done += 1;
          setAutoGen((p) => ({ ...p, done }));
        }
      }
      setAutoGen({ active: false, currentLabel: '', done: total, total });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allDrafted = scenes.every((s) =>
    s.visualKind === 'slide'
      ? !!s.slideImage?.base64
      : !!s.firstFrameImage?.base64 && !!s.lastFrameImage?.base64
  );

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <p className="caps mb-2">phase 1 of 5 — slides</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          Paint each scene.
        </h2>
        <p className="text-white/50 text-sm mt-3 max-w-2xl">
          Every scene's visual locks here. We're drafting them in order — type a casual direction ("make it warmer", "switch to nighttime", "Wes Anderson symmetry") to nudge any one.
        </p>
        {autoGen.active && (
          <div className="mt-5 surface-inset px-4 py-3 flex items-center gap-3">
            <Sparkles size={14} className="text-phosphor pulse-soft flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(158,255,74,0.5))' }} />
            <div className="flex-1 min-w-0">
              <p className="text-white/90 text-sm">Drafting visuals · {autoGen.done} / {autoGen.total}</p>
              <p className="text-white/45 text-xs truncate">working on {autoGen.currentLabel || 'next scene'}…</p>
            </div>
            <div className="hidden md:block w-32 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-phosphor transition-all" style={{ width: `${Math.round((autoGen.done / Math.max(1, autoGen.total)) * 100)}%` }} />
            </div>
          </div>
        )}
      </header>

      <div className="space-y-8">
        {scenes.map((scene) => (
          <SceneSlideCard key={scene._id} scene={scene} regenerate={regenerate} />
        ))}
      </div>

      <div className="mt-12 flex items-center justify-end gap-3">
        <span className="text-white/45 text-sm">
          {allDrafted ? 'all visuals drafted' : `${scenes.filter((s) => (s.visualKind === 'slide' ? !!s.slideImage?.base64 : (!!s.firstFrameImage?.base64 && !!s.lastFrameImage?.base64))).length} / ${scenes.length} drafted`}
        </span>
        <button
          onClick={onAdvance}
          disabled={!allDrafted}
          className="btn primary lg gap-2"
        >
          Continue to narration <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function SceneSlideCard({ scene, regenerate }) {
  const [error, setError] = useState('');

  async function regen(target, direction = '') {
    setError('');
    try { await regenerate(scene._id, target, direction); }
    catch (e) { setError(e.message); }
  }

  const hasSlide = !!scene.slideImage?.base64;
  const hasFirst = !!scene.firstFrameImage?.base64;
  const hasLast = !!scene.lastFrameImage?.base64;

  return (
    <article className="surface p-4 md:p-5">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="caps">scene {String(scene.order + 1).padStart(2, '0')}</span>
        <span className="caps !text-[9px] text-white/30">{scene.visualKind} · {scene.durationSec}s</span>
      </div>

      {scene.visualKind === 'slide' ? (
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
          <SlidePreview image={scene.slideImage} />
          <div className="space-y-3">
            <p className="text-white/70 text-sm leading-relaxed italic" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '17px' }}>
              {scene.narration || <span className="text-white/30">(no narration yet)</span>}
            </p>
            <PromptRewriteBar
              placeholder='nudge it: "make it darker", "switch to a closeup"…'
              applyLabel={hasSlide ? 'Regenerate' : 'Generate'}
              onApply={(d) => regen('slide', d)}
              allowEmpty
              secondaryLabel={hasSlide ? 'Same prompt' : undefined}
              onSecondary={hasSlide ? () => regen('slide') : undefined}
            />
            {scene.userDirection && (
              <p className="text-white/40 text-xs">last direction: <span className="text-white/65">"{scene.userDirection}"</span></p>
            )}
            <EngineeredPromptPeek prompt={scene.engineeredVisualPrompt} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <KeyframeCard
            label="first frame"
            image={scene.firstFrameImage}
            engineeredPrompt={scene.engineeredFirstFramePrompt}
            onApply={(d) => regen('firstFrame', d)}
            onSame={hasFirst ? () => regen('firstFrame') : null}
          />
          <KeyframeCard
            label="last frame"
            image={scene.lastFrameImage}
            engineeredPrompt={scene.engineeredLastFramePrompt}
            onApply={(d) => regen('lastFrame', d)}
            onSame={hasLast ? () => regen('lastFrame') : null}
          />
        </div>
      )}
      {error && <div className="text-rust text-sm mt-3">{error}</div>}
    </article>
  );
}

function SlidePreview({ image }) {
  if (image?.base64) {
    return (
      <div className="surface-inset overflow-hidden aspect-video">
        <img
          src={`data:${image.mime};base64,${image.base64}`}
          alt="slide"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="surface-inset overflow-hidden aspect-video flex items-center justify-center">
      <div className="text-center">
        <ImageIcon size={28} className="mx-auto text-white/25 mb-2" />
        <p className="text-white/40 text-sm">no slide yet — generate below</p>
      </div>
    </div>
  );
}

function KeyframeCard({ label, image, engineeredPrompt, onApply, onSame }) {
  return (
    <div>
      <p className="caps mb-2">{label}</p>
      <SlidePreview image={image} />
      <div className="mt-2 space-y-2">
        <PromptRewriteBar
          placeholder="nudge it…"
          applyLabel={image?.base64 ? 'Regen' : 'Gen'}
          onApply={onApply}
          allowEmpty
          secondaryLabel={onSame ? 'Same' : undefined}
          onSecondary={onSame || undefined}
        />
        <EngineeredPromptPeek label="prompt" prompt={engineeredPrompt} />
      </div>
    </div>
  );
}
