import { RotateCcw, Settings2 } from 'lucide-react';
import type { LyricLine, Track } from '../types';
import { featuredArtistFor } from '../../shared/artist-credit.mjs';
import { api, time, type Act } from '../api';
import { LyricsRetry } from './LyricsRetry';
import { ReadingTiming } from './ReadingTiming';

const stepLabels: Record<string, string> = { transcript: 'Transcription', lyrics: 'Lyrics lookup', alignment: 'Word alignment' };

export function Review({ track, act, onSettings }: { track: Track; act: Act; onSettings: () => void }) {
  const featuredArtist = featuredArtistFor(track);
  if (track.demo) return <div className="review-panel">
    <div className="info-box">Demo fixture: original instrumental and illustrative lyrics. No lyrics lookup, transcription, or accuracy comparison was performed.</div>
  </div>;
  const retry = () => {
    if (track.result?.timing !== 'manual' || window.confirm('Retry processing and replace the manual timing? Save a project file first to keep it.')) void act(() => api!.retry(track.id));
  };
  return <div className="review-panel">
    {featuredArtist && <p className="info-box">Featuring {featuredArtist}</p>}
    {Object.entries(track.steps).filter(([, step]) => step.state === 'error' || step.state === 'review' || step.state === 'running').map(([key, step]) => <div className="review-message" key={key}>
      <strong>{stepLabels[key] || 'Audio extraction'}</strong><p>{step.message}</p>
    </div>)}
    <LyricsRetry track={track} act={act} />
    <ReadingTiming track={track} act={act} />
    {track.candidates.length > 0 && <label className="field">
      <span>Confirm the recording <small>{track.candidates[0].source || 'LRCLIB'} ({track.candidates.length})</small></span>
      <select aria-label="Lyrics recording" disabled={track.steps.lyrics.state === 'running'} value={track.lyrics?.id || ''}
        onChange={event => void act(() => api!.selectLyrics(track.id, Number(event.target.value)))}>
        <option value="" disabled>Select the matching song and version</option>
        {track.candidates.map(row => <option key={row.id} value={row.id}>{row.artist} — {row.title} {row.album ? ` (${row.album})` : ''} ({time(row.duration)})</option>)}
      </select>
    </label>}
    <div className="review-summary">
      <div><strong>{track.result?.agreement == null ? '—' : `${Math.round(track.result.agreement * 100)}%`}</strong><span>word agreement</span></div>
      <p>{track.result?.notes[0] || 'Each source runs independently. The comparison appears when processing finishes.'}</p>
    </div>
    {track.result?.lines.some(line => line.review) && <div className="comparison">
      <div className="comparison-head"><span>PRIMARY WORDING</span><span>INDEPENDENT TRANSCRIPT EVIDENCE</span></div>
      {track.result.lines.filter(line => line.review).map((line, i) => <Comparison key={i} line={line} />)}
    </div>}
    {track.result?.lines.length === 0 && track.transcript.length > 0 && <p>{track.transcript.map(segment => segment.text).join(' ')}</p>}
    <div className="review-actions">
      <button className="secondary" onClick={retry} disabled={track.status === 'processing' || track.status === 'queued' || track.steps.lyrics.state === 'running'}><RotateCcw size={14} /> Retry processing</button>
      <button className="text-button" onClick={onSettings}><Settings2 size={14} /> Audio settings</button>
    </div>
  </div>;
}

function Comparison({ line }: { line: LyricLine }) {
  return <div className="comparison-row">
    <div><span>{line.start === null ? 'Untimed' : time(line.start)} ({line.timing})</span><p>{line.text}</p></div>
    <div><span>{line.agreement === null ? 'Unverified' : `${Math.round(line.agreement * 100)}% word agreement`}</span><p>{line.heard || 'No matching transcript evidence.'}</p></div>
  </div>;
}
