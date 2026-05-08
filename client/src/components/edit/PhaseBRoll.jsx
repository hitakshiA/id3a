import { useState } from 'react';
import { ArrowRight, Film, Image as ImageIcon, ImageDown } from 'lucide-react';
import { useProject } from '../../store/project.js';
import { api } from '../../lib/api.js';
import PromptRewriteBar from '../shared/PromptRewriteBar.jsx';
import EngineeredPromptPeek from '../shared/EngineeredPromptPeek.jsx';

/**
 * Phase 3 — B-roll. For every VIDEO scene, the user fine-tunes:
 *   - first frame  (regen with direction or as-is)
 *   - last frame   (regen with direction or as-is)
 *   - motion prompt (rewrite via Veo target rewriter; doesn't generate the
 *     video — that happens at render time)
 *
 * SLIDE scenes are not video — for each, the user can promote slide → video
 * inline (uses current slide as first frame; generates a complementary last
 * frame on demand).
 */
export default function PhaseBRoll({ onAdvance }) {
  const scenes = useProject((s) => s.scenes);
  const regenerate = useProject((s) => s.regenerate);
  const convertScene = useProject((s) => s.convertScene);
  const setSceneLocal = useProject((s) => s.setSceneLocal);

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <p className="caps mb-2">phase 3 of 5 — b-roll</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          Film the videos.
        </h2>
        <p className="text-white/50 text-sm mt-3 max-w-2xl">
          For every video scene: lock the opening still, lock the closing still, and direct the camera. We'll interpolate the motion at render time.
        </p>
      </header>

      <div className="space-y-8">
        {scenes.map((scene) => (
          scene.visualKind === 'video' ? (
            <VideoSceneCard
              key={scene._id}
              scene={scene}
              regenerate={regenerate}
              setSceneLocal={setSceneLocal}
              onDemote={() => convertScene(scene._id, 'slide')}
            />
          ) : (
            <SlideSceneRow key={scene._id} scene={scene} />
          )
        ))}
      </div>

      <div className="mt-12 flex items-center justify-end gap-3">
        <span className="text-white/45 text-sm">
          {scenes.filter((s) => s.visualKind === 'video' && s.firstFrameImage?.base64 && s.lastFrameImage?.base64).length}
          /{scenes.filter((s) => s.visualKind === 'video').length} video scenes ready
        </span>
        <button onClick={onAdvance} className="btn primary lg gap-2">
          Continue to voice <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function VideoSceneCard({ scene, regenerate, setSceneLocal, onDemote }) {
  const [error, setError] = useState('');
  const [savingMotion, setSavingMotion] = useState(false);
  const [confirmDemote, setConfirmDemote] = useState(false);

  async function regen(target, direction = '') {
    setError('');
    try { await regenerate(scene._id, target, direction); }
    catch (e) { setError(e.message); }
  }

  async function rewriteMotion(direction) {
    setError(''); setSavingMotion(true);
    try {
      const r = await api.rewriteMotion(scene._id, direction);
      setSceneLocal(scene._id, {
        engineeredVideoMotionPrompt: r.engineeredPrompt,
        userDirection: direction,
      });
    } catch (e) { setError(e.message); }
    finally { setSavingMotion(false); }
  }

  return (
    <article className="surface p-4 md:p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="caps">scene {String(scene.order + 1).padStart(2, '0')}</span>
        <Film size={11} className="text-white/40" />
        <span className="caps !text-[9px] text-white/30">{scene.durationSec}s</span>
        <div className="flex-1" />
        {confirmDemote ? (
          <div className="flex items-center gap-2">
            <span className="text-white/55 text-xs">drop the last frame &amp; revert to a slide?</span>
            <button onClick={() => { setConfirmDemote(false); onDemote(); }} className="btn danger sm">Yes, revert</button>
            <button onClick={() => setConfirmDemote(false)} className="btn ghost sm">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDemote(true)}
            className="btn ghost sm gap-1.5"
            title="convert this scene back to a still slide"
          >
            <ImageDown size={13} /> Revert to slide
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <FramePane
          label="first frame"
          image={scene.firstFrameImage}
          engineered={scene.engineeredFirstFramePrompt}
          onApply={(d) => regen('firstFrame', d)}
          onSame={scene.firstFrameImage?.base64 ? () => regen('firstFrame') : null}
        />
        <FramePane
          label="last frame"
          image={scene.lastFrameImage}
          engineered={scene.engineeredLastFramePrompt}
          onApply={(d) => regen('lastFrame', d)}
          onSame={scene.lastFrameImage?.base64 ? () => regen('lastFrame') : null}
        />
      </div>

      <div className="surface-inset p-4">
        <p className="caps mb-2">camera direction</p>
        <PromptRewriteBar
          placeholder='"slow dolly in", "handheld push, lens flare"…'
          applyLabel={savingMotion ? 'saving…' : 'Rewrite motion'}
          onApply={rewriteMotion}
        />
        <p className="text-white/40 text-xs mt-3">
          plain language → cinematic motion prompt. Camera, atmosphere, pacing.
        </p>
        <div className="mt-3">
          <EngineeredPromptPeek label="motion prompt" prompt={scene.engineeredVideoMotionPrompt} />
        </div>
      </div>

      {error && <div className="text-rust text-sm mt-3">{error}</div>}
    </article>
  );
}

function FramePane({ label, image, engineered, onApply, onSame }) {
  return (
    <div>
      <p className="caps mb-2">{label}</p>
      {image?.base64 ? (
        <div className="surface-inset overflow-hidden aspect-video mb-2">
          <img src={`data:${image.mime};base64,${image.base64}`} alt={label} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="surface-inset overflow-hidden aspect-video mb-2 flex items-center justify-center">
          <div className="text-center">
            <ImageIcon size={22} className="mx-auto text-white/25 mb-2" />
            <p className="text-white/40 text-xs">not generated yet</p>
          </div>
        </div>
      )}
      <PromptRewriteBar
        placeholder="nudge…"
        applyLabel={image?.base64 ? 'Regen' : 'Gen'}
        onApply={onApply}
        allowEmpty
        secondaryLabel={onSame ? 'Same' : undefined}
        onSecondary={onSame || undefined}
      />
      <div className="mt-2">
        <EngineeredPromptPeek label="prompt" prompt={engineered} />
      </div>
    </div>
  );
}

/** Read-only slide row shown inline in the b-roll phase for context only. */
function SlideSceneRow({ scene }) {
  return (
    <article className="surface p-4 flex items-center gap-4 opacity-70">
      <div className="w-32 aspect-video surface-inset overflow-hidden flex-shrink-0">
        {scene.slideImage?.base64 ? (
          <img
            src={`data:${scene.slideImage.mime};base64,${scene.slideImage.base64}`}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="caps mb-1">scene {String(scene.order + 1).padStart(2, '0')} · slide</p>
        <p className="text-white/45 text-sm truncate">
          still slide — nothing to film here
        </p>
      </div>
    </article>
  );
}
