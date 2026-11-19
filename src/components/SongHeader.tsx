import type { ExportFormat, Track } from '../types';
import type { LyricsMode } from '../../shared/karaoke.mjs';
import { primaryArtistFor } from '../../shared/artist-credit.mjs';
import { api, type Act } from '../api';
import { MenuButton } from './MenuButton';

const modeChoices = [
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'scrolling', label: 'Rolling' },
] as const;

const exportChoices: { id: ExportFormat; label: string; hint: string; group: 'Video' | 'Lyrics file' }[] = [
  { id: 'mp4', label: 'MP4', hint: '1080p video', group: 'Video' },
  { id: 'webm', label: 'WebM', hint: 'Smaller video file', group: 'Video' },
  { id: 'gif', label: 'Animated GIF', hint: 'No audio, short clips', group: 'Video' },
  { id: 'lrc', label: 'LRC lyrics', hint: 'Synced lyric lines', group: 'Lyrics file' },
  { id: 'srt', label: 'SRT subtitles', hint: 'Timed captions', group: 'Lyrics file' },
];

type Props = {
  track: Track; mode: LyricsMode; setMode: (mode: LyricsMode) => void; exportBlocker: string | null; sync: number; act: Act;
  openMixer: () => void; openReview: () => void; openTiming: () => void;
};

export function SongHeader({ track, mode, setMode, exportBlocker, sync, act, openMixer, openReview, openTiming }: Props) {
  const primaryArtist = primaryArtistFor(track);
  const releaseDetails = [track.album || track.lyrics?.album, track.releaseYear].filter(Boolean).join(', ');
  return <div className="song-heading">
    <div className="song-identity">
      <div className="song-byline">
        <h2>{track.title}</h2>
        {primaryArtist && <span className="song-artist">{primaryArtist}</span>}
      </div>
      {releaseDetails && <p className="song-release">{releaseDetails}</p>}
    </div>
    <div className="song-tools">
      <MenuButton label="Mode" title={`Lyrics mode: ${modeChoices.find(choice => choice.id === mode)?.label}`} disabled={track.export.state === 'running'}
        groups={[{ items: modeChoices.map(choice => ({ id: choice.id, label: choice.label, checked: mode === choice.id, onSelect: () => setMode(choice.id) })) }]} />
      <button className="text-button" disabled={!track.audioUrl} onClick={openMixer}>Mixer</button>
      <MenuButton label="Review" disabled={track.export.state === 'running'}
        groups={[{ items: [
          { id: 'cross-check', label: 'Cross-check', hint: 'Compare sources and fix mismatches', onSelect: openReview },
          { id: 'timing', label: 'Edit timing', hint: 'Adjust lyric start and end times', disabled: !track.audioUrl || ['processing', 'queued'].includes(track.status), onSelect: openTiming },
        ] }]} />
      <MenuButton label="Export" title={exportBlocker || 'Export in the selected lyrics mode'} disabled={Boolean(exportBlocker)}
        groups={['Video', 'Lyrics file'].map(name => ({ name, items: exportChoices.filter(choice => choice.group === name).map(choice => ({
          id: choice.id, label: choice.label, hint: choice.hint, onSelect: () => void act(() => api!.exportVideo(track.id, mode, choice.id, sync)),
        })) }))} />
    </div>
  </div>;
}
