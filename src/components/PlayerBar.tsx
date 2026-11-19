import { Expand, Pause, Play, SkipForward, Volume2 } from 'lucide-react';
import { time } from '../api';
import { IconButton } from './IconButton';

type Props = {
  canPlay: boolean; playing: boolean; play: () => void; hasNext: boolean; next: () => void;
  position: number; total: number; canSeek: boolean; seek: (position: number) => void;
  volume: number; setVolume: (volume: number) => void; toggleStage: () => void;
};

export function PlayerBar({ canPlay, playing, play, hasNext, next, position, total, canSeek, seek, volume, setVolume, toggleStage }: Props) {
  return <footer className="player" aria-label="Playback controls">
    <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={play} disabled={!canPlay}>
      {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
    </button>
    <IconButton label="Next song" onClick={next} disabled={!hasNext}><SkipForward size={18} /></IconButton>
    <div className="progress">
      <span>{time(position)}</span>
      <input aria-label="Playback position" type="range" min="0" max={total || 1} step="0.1" value={Math.min(position, total || 1)}
        onChange={event => seek(Number(event.target.value))} disabled={!canSeek} />
      <span>{time(total)}</span>
    </div>
    <div className="player-volume">
      <Volume2 size={17} />
      <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setVolume(Number(event.target.value))} />
    </div>
    <IconButton label="Toggle stage view" onClick={toggleStage} disabled={!canPlay}><Expand size={18} /></IconButton>
  </footer>;
}
