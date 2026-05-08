import { useEffect, useState } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import { useProject } from '../../store/project.js';
import { api } from '../../lib/api.js';
import VoiceCard from '../voice/VoiceCard.jsx';

/**
 * Phase 4 — Voice. Lists every supported voice with a pre-seeded sample
 * users can play. Selecting a voice persists project.voiceName.
 *
 * Below the grid: a "preview your script" panel that calls TTS for the first
 * narrated scene with the currently selected voice — so users can hear their
 * actual line in the chosen voice before committing.
 */
export default function PhaseVoice({ onAdvance }) {
  const project = useProject((s) => s.project);
  const scenes = useProject((s) => s.scenes);
  const patchProject = useProject((s) => s.patchProject);

  const [voices, setVoices] = useState([]);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);  // voice name currently playing
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listVoices()
      .then((d) => { if (alive) setVoices(d.voices || []); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  const selectedName = project?.voiceName || '';

  async function selectVoice(name) {
    if (!project || project.voiceName === name) return;
    try { await patchProject(project._id, { voiceName: name }); }
    catch (e) { setError(e.message); }
  }

  async function previewScript() {
    setPreviewBusy(true); setError('');
    try {
      const firstNarrated = scenes.find((s) => (s.narration || '').trim());
      if (!firstNarrated) throw new Error('no narration written yet');
      const res = await fetch(`/api/scenes/${firstNarrated._id}/preview-voice`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
    } catch (e) { setError(e.message); }
    finally { setPreviewBusy(false); }
  }

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <p className="caps mb-2">phase 4 of 5 — voice</p>
        <h2 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
          Pick the narrator.
        </h2>
        <p className="text-white/50 text-sm mt-3 max-w-2xl">
          Audition each voice with a short pre-seeded clip. Hear your own opening line in the chosen voice with one click.
        </p>
      </header>

      {voices.length === 0 && !error && (
        <div className="caps">{error || 'loading voices'}<span className="blink" /></div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {voices.map((v) => (
          <VoiceCard
            key={v.name}
            voice={v}
            selected={selectedName === v.name}
            currentlyPlaying={playing}
            onPlay={() => setPlaying(v.name)}
            onPause={() => setPlaying(null)}
            onSelect={() => selectVoice(v.name)}
          />
        ))}
      </div>

      {selectedName && (
        <div className="mt-8 surface p-5">
          <p className="caps mb-3">preview your opening line</p>
          <p className="text-white/70 text-sm leading-relaxed mb-4" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '18px' }}>
            {scenes.find((s) => (s.narration || '').trim())?.narration || <span className="text-white/30">(no narration written yet — write some in the previous phase)</span>}
          </p>
          <button
            onClick={previewScript}
            disabled={previewBusy || !scenes.some((s) => (s.narration || '').trim())}
            className="btn outline sm gap-1.5"
          >
            <Volume2 size={13} /> {previewBusy ? 'speaking…' : `Hear it in ${selectedName}`}
          </button>
        </div>
      )}

      {error && <div className="text-rust text-sm mt-4">{error}</div>}

      <div className="mt-12 flex items-center justify-end gap-3">
        <span className="text-white/45 text-sm">{selectedName ? `${selectedName} selected` : 'pick a voice to continue'}</span>
        <button
          onClick={onAdvance}
          disabled={!selectedName}
          className="btn primary lg gap-2"
        >
          Continue to render <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
