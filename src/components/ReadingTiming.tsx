import { useState } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import type { Track } from '../types';
import { hasCompleteWordTiming } from '../../shared/karaoke.mjs';
import { api, type Act } from '../api';

export function ReadingTiming({ track, act }: { track: Track; act: Act }) {
  const [busy, setBusy] = useState(false);
  const missing = track.result?.lines.flatMap((line, index) => hasCompleteWordTiming(line) ? [] : [index + 1]) ?? [];
  if (!track.audioUrl || !missing.length || track.demo) return null;
  const affected = `line${missing.length > 1 ? 's' : ''} ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`;
  const preparing = track.status === 'processing' || track.steps.alignment.state === 'running' || busy;
  const align = () => void act(async () => { setBusy(true); try { await api!.align(track.id); } finally { setBusy(false); } });
  return <div className="reading-timing" role="status">
    <span>{preparing ? 'Preparing word timing for the reading bar…' : `Reading bar needs word timing for ${affected}`}</span>
    <button className="text-button" disabled={preparing || track.export.state === 'running'} onClick={align}>
      {preparing ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}Align words
    </button>
    {track.steps.alignment.state === 'error' && <small>{track.steps.alignment.message} Open Edit timing to set word boundaries manually.</small>}
  </div>;
}
