import { LoaderCircle, RotateCcw } from 'lucide-react';
import type { Track } from '../types';
import { api, type Act } from '../api';

export function LyricsRetry({ track, act }: { track: Track; act: Act }) {
  const state = track.steps.lyrics.state;
  if (track.demo || !track.audioUrl || !['error', 'review', 'running'].includes(state) || state === 'review' && track.candidates.length > 0) return null;
  const running = state === 'running';
  const supported = typeof api?.retryLyrics === 'function';
  return <div className="lyrics-retry">
    <span>{running ? 'Searching LRCLIB…' : state === 'error' ? 'LRCLIB lyrics unavailable' : 'No matching LRCLIB lyrics found'}</span>
    <button className="text-button" disabled={running || !supported} onClick={() => void act(() => api!.retryLyrics(track.id))}>
      {running ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}{running ? 'Searching lyrics…' : 'Retry lyrics'}
    </button>
    {!supported && <small>Save your timing project and restart vocalist to enable lyrics retry.</small>}
  </div>;
}
