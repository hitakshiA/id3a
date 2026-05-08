import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Check } from 'lucide-react';

/**
 * Single voice tile. Shows the voice name, the blurb, a play/pause button
 * for the pre-seeded sample, and a "Selected" badge when active.
 *
 * Uses a single <audio> element ref so the parent can coordinate which voice
 * is currently playing (only one at a time).
 */
export default function VoiceCard({ voice, selected, currentlyPlaying, onPlay, onPause, onSelect }) {
  const audioRef = useRef(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onLoad = () => setDuration(a.duration || 0);
    const onEnded = () => onPause?.();
    a.addEventListener('loadedmetadata', onLoad);
    a.addEventListener('ended', onEnded);
    return () => { a.removeEventListener('loadedmetadata', onLoad); a.removeEventListener('ended', onEnded); };
  }, [onPause]);

  // External pause coordination: when another voice starts playing, we stop.
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    if (currentlyPlaying === voice.name) {
      a.play().catch(() => {});
    } else {
      a.pause();
      // Don't reset currentTime — let users resume.
    }
  }, [currentlyPlaying, voice.name]);

  const isPlaying = currentlyPlaying === voice.name;

  return (
    <article
      className={`surface p-5 transition-all ${selected ? 'border-white/50 bg-white/[0.05]' : 'hover:border-white/20'}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-white" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '24px', lineHeight: 1.05 }}>
            {voice.name}
          </h3>
          <p className="text-white/55 text-sm mt-1 leading-relaxed">{voice.blurb}</p>
        </div>
        {selected && (
          <div className="caps !text-[9px] flex items-center gap-1 text-white/85">
            <Check size={11} /> selected
          </div>
        )}
      </div>

      <audio ref={audioRef} src={voice.sampleUrl} preload="none" />

      <div className="flex items-center gap-2">
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="btn outline sm gap-1.5"
          aria-label={isPlaying ? `pause ${voice.name} sample` : `play ${voice.name} sample`}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          {isPlaying ? 'Pause' : 'Play sample'}
        </button>
        {duration > 0 && (
          <span className="text-white/35 text-xs mono">{Math.round(duration)}s</span>
        )}
        <div className="flex-1" />
        <button
          onClick={onSelect}
          disabled={selected}
          className={selected ? 'btn ghost sm' : 'btn primary sm'}
        >
          {selected ? 'Selected' : 'Use this voice'}
        </button>
      </div>
    </article>
  );
}
