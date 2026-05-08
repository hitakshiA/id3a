import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Music, Play, Pause, RefreshCw, Check } from 'lucide-react';
import { useProject } from '../../store/project.js';
import { api } from '../../lib/api.js';

/**
 * Phase 5 — Music. Three-card sample picker:
 *   1. "Generate samples" → calls Lyria 3 times in parallel for ~10s clips,
 *      each in a different sub-genre (warm acoustic / minimal pad / cinematic).
 *   2. User plays each, picks one.
 *   3. The chosen sample's engineered prompt is expanded into a full ~60s
 *      track at render time.
 */
export default function PhaseMusic({ onAdvance }) {
  const project = useProject((s) => s.project);
  const load = useProject((s) => s.load);

  const [samples, setSamples] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null); // sampleId currently playing

  // Hydrate from project on mount.
  useEffect(() => {
    if (project?.musicSamples?.length) {
      setSamples(project.musicSamples.map((s) => ({
        sampleId: s.sampleId,
        label: s.label,
        url: s.url,
        durationSec: s.durationSec,
      })));
    }
  }, [project?._id]);

  async function regenerate() {
    if (!project) return;
    setBusy(true); setError(''); setPlaying(null);
    try {
      const r = await api.generateMusicSamples(project._id);
      setSamples(r.samples || []);
      if (r.failed?.length) setError(`${r.failed.length} sample(s) failed`);
      await load(project._id); // refresh to clear selection on regen
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function pick(sampleId) {
    if (!project) return;
    setError('');
    try {
      await api.selectMusicSample(project._id, sampleId);
      await load(project._id);
    } catch (e) { setError(e.message); }
  }

  const selectedId = project?.selectedMusicSampleId || '';

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <p className="caps mb-2">phase 5 of 6 — music</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          Choose the score.
        </h2>
        <p className="text-white/50 text-sm mt-3 max-w-2xl">
          Three short samples in different directions — same tempo and key, different feel. Pick the one that fits. We'll expand the chosen direction into a full track at render time.
        </p>
      </header>

      {samples.length === 0 ? (
        <div className="surface p-10 text-center">
          <Music size={28} className="mx-auto text-white/35 mb-4" />
          <h3 className="text-white mb-2" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '24px' }}>
            Generate three sample clips
          </h3>
          <p className="text-white/45 text-sm mb-6 max-w-md mx-auto">
            About 30–45 seconds. We render three short clips in parallel so you can pick a direction.
          </p>
          <button onClick={regenerate} disabled={busy} className="btn primary lg gap-2">
            {busy ? 'composing samples…' : <>Generate samples <ArrowRight size={16} /></>}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {samples.map((s) => (
              <SampleCard
                key={s.sampleId}
                sample={s}
                selected={selectedId === s.sampleId}
                isPlaying={playing === s.sampleId}
                onPlay={() => setPlaying(s.sampleId)}
                onPause={() => setPlaying(null)}
                onPick={() => pick(s.sampleId)}
              />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button onClick={regenerate} disabled={busy} className="btn outline sm gap-1.5">
              <RefreshCw size={13} /> {busy ? 'regenerating…' : 'Regenerate samples'}
            </button>
            <span className="text-white/40 text-xs">~$0.12 per sample set · samples are kept until you pick</span>
          </div>
        </>
      )}

      {error && <div className="text-rust text-sm mt-4">{error}</div>}

      <div className="mt-12 flex items-center justify-end gap-3">
        <span className="text-white/45 text-sm">{selectedId ? 'direction locked' : 'pick a sample to continue'}</span>
        <button onClick={onAdvance} disabled={!selectedId} className="btn primary lg gap-2">
          Continue to render <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function SampleCard({ sample, selected, isPlaying, onPlay, onPause, onPick }) {
  const audioRef = useRef(null);

  // External coordination: pause when another sample plays.
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    if (isPlaying) a.play().catch(() => {});
    else a.pause();
  }, [isPlaying]);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onEnded = () => onPause?.();
    a.addEventListener('ended', onEnded);
    return () => a.removeEventListener('ended', onEnded);
  }, [onPause]);

  return (
    <article
      className={`surface p-4 transition-all ${selected ? 'border-white/50 bg-white/[0.05]' : 'hover:border-white/20'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '20px', lineHeight: 1.05 }}>
          {sample.label}
        </h3>
        {selected && <Check size={14} className="text-white" />}
      </div>

      <audio ref={audioRef} src={sample.url} preload="none" />

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="btn outline sm gap-1.5"
          aria-label={isPlaying ? 'pause' : 'play'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <span className="text-white/35 text-xs mono">{sample.durationSec}s</span>
      </div>

      <button
        onClick={onPick}
        disabled={selected}
        className={selected ? 'btn ghost sm w-full' : 'btn primary sm w-full'}
      >
        {selected ? 'Picked' : 'Pick this direction'}
      </button>
    </article>
  );
}
