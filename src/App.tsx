import { useAudioMixer } from './useAudioMixer';
import UpdateControl from './UpdateControl';
import { featuredArtistFor, primaryArtistFor } from '../shared/artist-credit.mjs';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Expand, Globe, LoaderCircle, MoreHorizontal, PanelLeft, Pause, Play, Plus, RotateCcw, Settings2, SkipForward, Trash2, Volume2, X } from 'lucide-react';
import type { Dependency, ExportFormat, LyricLine, Settings, Track } from './types';
import { drawKaraoke, extractAlbumColors, lerpHexColor, VIDEO_WIDTH, VIDEO_HEIGHT, fonts, DEFAULT_FONT, unitsFor, displayLyricText, hasCompleteWordTiming, type LyricsMode } from '../shared/karaoke.mjs';
import { groupTranscriptLines, lyricSections, reflowLyrics } from '../shared/lyrics.mjs';
import { exportIssue } from '../shared/timing-validation.mjs';
import { useLegacyUpgrade } from './hooks/useLegacyUpgrade';

const api = window.norae;
const WEBSITE_URL = 'https://github.com/vznh/vocalist';
const time = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const errorText = (error: unknown) => (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const statusText = { queued: 'Queued', processing: 'Preparing…', ready: '', review: 'Needs review', error: 'Failed' };

function IconButton({ label, children, onClick, disabled = false }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} className="icon-button" onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function App() {
  const upgradeMessage = useLegacyUpgrade(api);
  const [rawTracks, setTracks] = useState<Track[]>([]);
  // Reformat already-queued word transcripts after a renderer update as well.
  const tracks = useMemo(() => rawTracks.map(track => track.result?.source === 'transcript' && track.result.timing === 'transcript' ? { ...track, result: { ...track.result, lines: groupTranscriptLines(track.transcript) } } : track), [rawTracks]);
  const appliedLayouts = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [timingDirty, setTimingDirty] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mix, setMix] = useState({ bass: 0, treble: 0, lyrics: 0 });
  const [stage, setStage] = useState(false);
  const [mode, setMode] = useState<LyricsMode>(() => localStorage.getItem('vocalist:lyrics-mode') === 'scrolling' ? 'scrolling' : 'karaoke');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shiftMode, setShiftMode] = useState(false);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, []);
  const [zoom, setZoom] = useState(1);
  const [zoomHud, setZoomHud] = useState(false);
  const zoomTimer = useRef<number | undefined>(undefined);
  const updateZoom = (next: number) => {
    const clamped = Math.min(2, Math.max(0.5, Math.round(next * 10) / 10));
    setZoom(clamped);
    setZoomHud(true);
    window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => setZoomHud(false), 2000);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); updateZoom(zoom + 0.1); }
      else if (event.key === '-') { event.preventDefault(); updateZoom(zoom - 0.1); }
      else if (event.key === '0') { event.preventDefault(); updateZoom(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoom]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState({ source: '', seconds: 0 });
  const [volume, setVolume] = useState(.7);
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const [voice, setVoice] = useState(100);
  const autoPlay = useRef(false);
  const selected = tracks.find(track => track.id === selectedId) || null;
  const { enable: enableMixer, voiceState } = useAudioMixer(audio, mix.bass, mix.treble, voice, selected?.voiceMix === 'ready' ? selected.audioUrl || undefined : undefined);

  useEffect(() => {
    if (!api) return;
    let disposed = false;
    const update = (next: Track[]) => {
      if (disposed) return;
      setTracks(next);
      setSelectedId(current => next.some(track => track.id === current) ? current : next[0]?.id || null);
    };
    const unsubscribe = api.onChange(update);
    const unsubscribeStorage = api.onStorageError?.(message => setError(message));
    api.snapshot().then(update).catch(error => setError(errorText(error)));
    api.check().then(next => { if (!disposed) setDependencies(next); }).catch(error => setError(errorText(error)));
    return () => { disposed = true; unsubscribe(); unsubscribeStorage?.(); };
  }, []);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => {
    // Persist the requested reflow for legacy queued tracks so export uses it too.
    if (!api) return;
    for (const track of tracks) {
      const original = rawTracks.find(row => row.id === track.id);
      if (!track.audioUrl || !track.result || !original?.result || track.result.source !== 'transcript' || track.result.timing !== 'transcript' || !['ready', 'review'].includes(track.status) || ['running', 'waiting'].includes(track.steps.alignment.state) || appliedLayouts.current.has(track.id)) continue;
      if (track.result.lines.length === original.result.lines.length && track.result.lines.every((line, i) => line.text === original.result!.lines[i].text)) continue;
      appliedLayouts.current.add(track.id);
      void api.saveTiming(track.id, { lines: track.result.lines, font: track.font, reviewed: false }).catch(error => setError(errorText(error)));
    }
  }, [tracks, rawTracks]);
  useEffect(() => { setPosition(0); setPlaying(false); setVoice(100); setReviewOpen(false); setTimingOpen(false); }, [selectedId]);
  useEffect(() => { setPosition(0); setPlaying(false); }, [selected?.audioUrl]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => { setPosition(audio.current?.currentTime || 0); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    if (!stage) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setStage(false); void api?.fullscreen(false).catch(error => setError(errorText(error))); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [stage]);

  const act = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); } catch (error) { setError(errorText(error)); }
  };
  const play = () => {
    if (!selected?.audioUrl) return;
    if (audio.current?.paused) void act(() => audio.current!.play());
    else audio.current?.pause();
  };
  const select = (id: string) => {
    if (id !== selectedId) { autoPlay.current = false; audio.current?.pause(); setSelectedId(id); }
  };
  const nextTrack = tracks.slice(tracks.findIndex(track => track.id === selectedId) + 1).find(track => track.audioUrl);
  const next = () => {
    if (nextTrack) { autoPlay.current = true; setSelectedId(nextTrack.id); }
    else { audio.current?.pause(); setPlaying(false); }
  };
  const toggleStage = () => {
    setStage(!stage);
    void act(async () => { await api?.fullscreen(!stage); });
  };
  const seek = (value: number) => {
    const media = audio.current;
    if (!media || !selected?.audioUrl || media.readyState < 1 || !Number.isFinite(value)) return;
    const end = Number.isFinite(media.duration) ? media.duration : selected.duration;
    media.currentTime = Math.max(0, Math.min(value, end));
    setPosition(media.currentTime);
  };
  const updateDuration = (media: HTMLAudioElement) => {
    setMediaDuration({ source: selected?.audioUrl || '', seconds: Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0 });
  };
  const lyricPosition = Math.max(0, position - mix.lyrics);
  // Overlapping verses are all current, so every line singing now lights up.
  const activeIndices = selected?.result?.lines.flatMap((line, index) => line.start !== null && line.end !== null && lyricPosition >= line.start && lyricPosition < line.end ? [index] : []) ?? [];
  const activeIndex = activeIndices.at(-1) ?? -1;
  const total = mediaDuration.source === selected?.audioUrl && mediaDuration.seconds > 0 ? mediaDuration.seconds : selected?.duration || 0;
  const canSeek = Boolean(selected?.audioUrl && mediaDuration.source === selected.audioUrl && mediaDuration.seconds > 0);
  const needsSetup = dependencies.some(dep => !dep.ok && !dep.optional);
  const transcriptWordTiming = selected?.result?.source === 'database' && selected.result.lines.some(line => line.timing === 'transcript');
  const sourceNote = selected?.demo ? '' : selected?.result && (selected.result.source === 'transcript' || !selected.lyrics && selected.transcript.length) ? 'Review line and verse breaks in the unverified transcript.' : selected?.result?.timing === 'partial' ? 'Review word timing to complete alignment.' : transcriptWordTiming ? 'Review the accuracy of the transcript timing.' : selected?.result?.timing === 'approximate' ? 'Approximate timing' : '';
  const exportBlocker = useMemo(() => exportIssue(selected), [selected]);
  const primaryArtist = selected ? primaryArtistFor(selected) : '';
  const releaseDetails = [selected?.album || selected?.lyrics?.album, selected?.releaseYear].filter(Boolean).join(', ');
  const exportWarning = selected?.audioUrl && selected.export.state !== 'running' ? exportBlocker : null;

  return <div className={`app ${!sidebarOpen && !stage ? 'sidebar-collapsed' : ''}`} style={{ ['--app-zoom' as string]: zoom }}>
    {upgradeMessage && <div className="upgrade-overlay" role="status"><LoaderCircle className="spin" size={24} /><p>{upgradeMessage}</p></div>}
    <audio ref={audio} crossOrigin="anonymous" src={selected?.audioUrl || undefined}
      onLoadedMetadata={event => updateDuration(event.currentTarget)} onDurationChange={event => updateDuration(event.currentTarget)}
      onEmptied={() => { setMediaDuration({ source: '', seconds: 0 }); setPosition(0); setPlaying(false); }}
      onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onSeeking={event => setPosition(event.currentTarget.currentTime)} onSeeked={event => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={next}
      onCanPlay={() => { if (autoPlay.current) { autoPlay.current = false; void act(() => audio.current!.play()); } }}
      onError={() => { if (selected?.audioUrl) setError('Audio could not be played. Retry the song in Cross-check.'); }} />

    {!stage && sidebarOpen && <aside className="sidebar" aria-label="Sidebar">
      <nav className="sidebar-nav" aria-label="Main">
        <button type="button" className="sidebar-item active" aria-current="page"><span>Queue</span><span className="sidebar-count">{tracks.length}</span></button>
        <button type="button" className="sidebar-item" onClick={toggleStage} disabled={!selected?.audioUrl}><span>Stage</span></button>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <button type="button" className="sidebar-icon" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)} disabled={!api}><Settings2 size={16} /></button>
        <a className="sidebar-icon" href={WEBSITE_URL} target="_blank" rel="noreferrer" aria-label="Website" title="Website"><Globe size={16} /></a>
        <UpdateControl />
      </div>
    </aside>}
    {!stage && <button type="button" className={`sidebar-toggle ${!windowFocused ? 'window-unfocused' : ''}`} style={{ zoom: 1 / zoom }} aria-label="Toggle sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}><PanelLeft size={16} /></button>}
    {zoomHud && <div className="zoom-pill" style={{ zoom: 1 / zoom }} role="status" aria-label="Zoom level" onMouseEnter={() => window.clearTimeout(zoomTimer.current)} onMouseLeave={() => { zoomTimer.current = window.setTimeout(() => setZoomHud(false), 1200); }}>
      <strong>{Math.round(zoom * 100)}%</strong>
      <button type="button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => updateZoom(zoom - 0.1)}>−</button>
      <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => updateZoom(zoom + 0.1)}>+</button>
      <span className="zoom-divider" aria-hidden="true" />
      <button type="button" className="zoom-reset" disabled={zoom === 1} onClick={() => updateZoom(1)}>Reset</button>
    </div>}
    {!stage && !sidebarOpen && <button type="button" className="sidebar-toggle stage-toggle" aria-label="Stage" title="Stage" onClick={toggleStage} disabled={!selected?.audioUrl}><StageIcon /></button>}
    <div className="content">
    {!stage ? <main className="main">
        <QueueInput added={id => setSelectedId(current => current || id)} />
        {!api && <p className="notice">Open the desktop app with <code>npm run dev</code> to queue songs.</p>}
        {needsSetup && <button className="setup-notice" onClick={() => setSettingsOpen(true)}>Tools or API credentials need setup <span>Open settings</span></button>}
        <div className="workspace">
          <section className="queue-panel" aria-label="Song queue">
            <h2>Queue <span className="queue-total">{tracks.length}</span><div className="queue-tools"><button type="button" className="text-button" aria-pressed={shiftMode} onClick={() => setShiftMode(value => !value)}>Shift</button><button type="button" className="text-button" disabled={!tracks.length} onClick={() => { if (window.confirm(`Clear all ${tracks.length} queued songs? Saved timing projects stay on disk.`)) void act(() => api!.clearQueue()); }}>Clear</button></div></h2>
            <div className="queue-list">
              {!tracks.length && <p className="empty-queue">No songs queued.</p>}
              {tracks.map((track, i) => <div key={track.id} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', track.id); setDraggedId(track.id); }} onDragOver={event => { if (!draggedId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget({ id: track.id, after: event.clientY >= event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2 }); }} onDrop={event => { event.preventDefault(); const id = draggedId; if (!id) return; const source = tracks.findIndex(row => row.id === id); const target = tracks.findIndex(row => row.id === track.id); if (source < 0 || target < 0) return; const after = event.clientY >= event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2; const index = target + (after ? 1 : 0); const targetIndex = source < index ? index - 1 : index; void act(() => api!.reorder(id, targetIndex)); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }} className={`queue-row ${selectedId === track.id ? 'selected' : ''} ${draggedId === track.id ? 'dragging' : ''} ${dropTarget?.id === track.id ? dropTarget.after ? 'drop-after' : 'drop-before' : ''}`}>
                <button className="track-select" onClick={() => select(track.id)} aria-label={`Select ${track.title}`} aria-pressed={selectedId === track.id}>
                  <span className="track-number">{i + 1}</span>
                  <span className="track-info">
                    <strong>{track.title}</strong>
                    {track.status !== 'ready' && <small className={`status-${track.status}`}>{track.status === 'processing' && <LoaderCircle size={11} className="spin" />}{statusText[track.status]}</small>}
                    {!['You', 'Everyone'].includes(track.singer) && <small>{track.singer}</small>}
                  </span>
                </button>
                {shiftMode && <div className="shift-buttons"><button type="button" className="icon-button" aria-label={`Shift ${track.title} earlier`} disabled={i === 0} onClick={() => void act(() => api!.move(track.id, -1))}><ArrowUp size={14} /></button><button type="button" className="icon-button" aria-label={`Shift ${track.title} later`} disabled={i === tracks.length - 1} onClick={() => void act(() => api!.move(track.id, 1))}><ArrowDown size={14} /></button></div>}
                <TrackActions track={track} index={i} count={tracks.length}
                  move={direction => void act(() => api!.move(track.id, direction))}
                  remove={() => { if (track.id === selectedId) audio.current?.pause(); void act(() => api!.remove(track.id)); }} />
              </div>)}
            </div>
          </section>
          <section className="song-panel" aria-label="Lyrics">
            {selected ? <>
              <div className="song-heading">
                <div className="song-identity">
                  <div className="song-byline">
                    <h2>{selected.title}</h2>
                    {primaryArtist && <span className="song-artist">{primaryArtist}</span>}
                  </div>
                  {releaseDetails && <p className="song-release">{releaseDetails}</p>}
                </div>
                <div className="song-tools">
                  <MenuButton label="Mode" title={`Lyrics mode: ${modeChoices.find(choice => choice.id === mode)?.label}`} disabled={selected.export.state === 'running'}
                    groups={[{ items: modeChoices.map(choice => ({ id: choice.id, label: choice.label, checked: mode === choice.id, onSelect: () => { setMode(choice.id); localStorage.setItem('vocalist:lyrics-mode', choice.id); } })) }]} />
                  <button className="text-button" disabled={!selected.audioUrl} onClick={() => { setMixerOpen(true); void act(enableMixer); }}>Mixer</button>
                  <MenuButton label="Review" disabled={selected.export.state === 'running'}
                    groups={[{ items: [
                      { id: 'cross-check', label: 'Cross-check', hint: 'Compare sources and fix mismatches', onSelect: () => setReviewOpen(true) },
                      { id: 'timing', label: 'Edit timing', hint: 'Adjust lyric start and end times', disabled: !selected.audioUrl || ['processing', 'queued'].includes(selected.status), onSelect: () => setTimingOpen(true) },
                    ] }]} />
                  <MenuButton label="Export" title={exportBlocker || 'Export in the selected lyrics mode'} disabled={Boolean(exportBlocker)}
                    groups={['Video', 'Lyrics file'].map(name => ({ name, items: exportChoices.filter(choice => choice.group === name).map(choice => ({
                      id: choice.id, label: choice.label, hint: choice.hint, onSelect: () => void act(() => api!.exportVideo(selected.id, mode, choice.id)),
                    })) }))} />
                </div>
              </div>
              <div className="song-warnings">
                {exportWarning && <p>{exportWarning}{(exportWarning.startsWith('Line ') || exportWarning.startsWith('Provide ')) && ' Open Edit timing to correct lyric boundaries.'}</p>}
                {sourceNote && <p>{sourceNote}</p>}
                <ReadingTiming track={selected} act={act} />
              </div>
              <LyricsRetry track={selected} act={act} />
              {selected.result?.lines.length ? <div className="song-preview">
                <section className="video-column" aria-label="Video"><h3>Video</h3><KaraokePreview track={selected} position={lyricPosition} mode={mode} /></section>
                <section className="all-lyrics" aria-label="All lyrics"><h3>All lyrics</h3><Lyrics track={selected} activeIndices={activeIndices} onSeek={time => seek(time + mix.lyrics)} /></section>
              </div> : <Lyrics track={selected} activeIndices={activeIndices} onSeek={time => seek(time + mix.lyrics)} />}
              {selected.lyrics?.copyright && <p className="source-note">{selected.lyrics.copyright}</p>}
              {selected.export.state !== 'idle' && <div className="export-status" role="status">{selected.export.message}{selected.export.state === 'running' && <><progress aria-label="MP4 export progress" max="100" value={selected.export.progress} />{selected.export.progress}% <button onClick={() => void act(() => api!.cancelExport(selected.id))}>Cancel export</button></>}</div>}
            </> : <p className="empty-queue">Nothing in queue.</p>}
          </section>
        </div>
      </main> : <main className="stage">
      <header><span>{selected?.title}</span><small>{sourceNote}</small></header>
      {selected && <ReadingTiming track={selected} act={act} />}
      {selected && <KaraokePreview track={selected} position={lyricPosition} mode={mode} />}
    </main>}

    {selected && <footer className="player" aria-label="Playback controls">
      <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={play} disabled={!selected.audioUrl}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
      <IconButton label="Next song" onClick={next} disabled={!nextTrack}><SkipForward size={18} /></IconButton>
      <div className="progress"><span>{time(position)}</span><input aria-label="Playback position" type="range" min="0" max={total || 1} step="0.1" value={Math.min(position, total || 1)} onChange={event => seek(Number(event.target.value))} disabled={!canSeek} /><span>{time(total)}</span></div>
      <div className="player-volume"><Volume2 size={17} /><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setVolume(Number(event.target.value))} /></div>
      <IconButton label="Toggle stage view" onClick={toggleStage} disabled={!selected.audioUrl}><Expand size={18} /></IconButton>
    </footer>}
    </div>
    {error && <div className="toast" role="alert"><span>{error}</span><IconButton label="Dismiss notification" onClick={() => setError('')}><X size={16} /></IconButton></div>}
    {mixerOpen && <Modal title="Mixer" close={() => setMixerOpen(false)} className="mixer-modal">
      {mixerControls.map(control => <label className="mixer-row" key={control.key}>
        <span>{control.label}</span>
        <input type="range" aria-label={control.label} min={control.min} max={control.max} step={control.step} value={mix[control.key]}
          onChange={event => {
            const value = Number(event.target.value);
            setMix(current => ({ ...current, [control.key]: value }));
            if (control.key !== 'lyrics') void act(enableMixer);
          }} />
        <span className="mixer-value">{mix[control.key] > 0 ? '+' : ''}{mix[control.key]} {control.unit}</span>
      </label>)}
      {selected?.voiceMix === 'ready' ? <label className="mixer-row">
        <span>Voice level</span>
        <input type="range" aria-label="Voice level" min="0" max="100" step="1" value={voice} disabled={voiceState !== 'ready'}
          onChange={event => setVoice(Number(event.target.value))} />
        <span className="mixer-value">{voice}%</span>
      </label> : <div className="mixer-row">
        <span>Voice level</span>
        <button type="button" className="secondary" disabled={!selected?.audioUrl || selected.status === 'processing' || selected.voiceMix === 'preparing'}
          onClick={() => selected && void act(() => api!.prepareVoiceMix(selected.id))}>
          {selected?.voiceMix === 'preparing' ? 'Separating voices…' : selected?.voiceMix === 'error' ? 'Retry voice separation' : 'Separate voices'}
        </button>
      </div>}
      {voiceState === 'error' && <p className="mixer-note" role="status">Voice tracks could not load. The original mix is playing.</p>}
      {selected?.voiceMix === 'ready' && voiceState === 'loading' && <p className="mixer-note" role="status">Loading voice tracks…</p>}
      <button className="text-button mixer-reset" type="button" onClick={() => { setMix({ bass: 0, treble: 0, lyrics: 0 }); setVoice(100); }}>Reset mixer</button>
    </Modal>}
    {reviewOpen && selected && <Modal title="Cross-check" close={() => setReviewOpen(false)} className="review-modal"><Review track={selected} act={act} onSettings={() => { setReviewOpen(false); setSettingsOpen(true); }} /></Modal>}
    {timingOpen && selected && <Modal title="Edit timing" close={() => { if (!timingDirty || window.confirm('Discard the unsaved timing changes?')) { setTimingOpen(false); setTimingDirty(false); } }} className="timing-modal"><TimingEditor track={selected} mode={mode} duration={total} canSeek={canSeek} position={position} playing={playing} play={play} seek={seek} dirtyChanged={setTimingDirty} /></Modal>}
    {settingsOpen && <SettingsModal track={selected} act={act} close={() => setSettingsOpen(false)} checked={setDependencies} loadDemo={async () => {
      const id = await api!.demo(); select(id); setSettingsOpen(false);
    }} />}
  </div>;
}

function StageIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1 3.25C1 3.11193 1.11193 3 1.25 3H13.75C13.8881 3 14 3.11193 14 3.25V10.75C14 10.8881 13.8881 11 13.75 11H1.25C1.11193 11 1 10.8881 1 10.75V3.25ZM1.25 2C0.559643 2 0 2.55964 0 3.25V10.75C0 11.4404 0.559644 12 1.25 12H5.07341L4.82991 13.2986C4.76645 13.6371 5.02612 13.95 5.37049 13.95H9.62951C9.97389 13.95 10.2336 13.6371 10.1701 13.2986L9.92659 12H13.75C14.4404 12 15 11.4404 15 10.75V3.25C15 2.55964 14.4404 2 13.75 2H1.25ZM9.01091 12H5.98909L5.79222 13.05H9.20778L9.01091 12Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" /></svg>;
}

function QueueInput({ added }: { added: (id: string) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!api) return;
    setBusy(true); setError('');
    try {
      added(await api.add({ url }));
      setUrl('');
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <form className="queue-input" onSubmit={submit}>
    <div className="url-row"><input aria-label="Song URL" required type="url" placeholder="Paste a YouTube or SoundCloud link" value={url} onChange={event => { setUrl(event.target.value); setError(''); }} maxLength={2048} disabled={!api} /><button className="primary" disabled={!api || busy || !url.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}Add to queue</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

function TrackActions({ track, index, count, move, remove }: { track: Track; index: number; count: number; move: (direction: number) => void; remove: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="track-actions" ref={ref} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="icon-button" aria-label={`Options for ${track.title}`} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    {open && <div className="track-menu">
      <button disabled={index === 0} onClick={() => { move(-1); setOpen(false); }}><ArrowUp size={14} />Move up</button>
      <button disabled={index === count - 1} onClick={() => { move(1); setOpen(false); }}><ArrowDown size={14} />Move down</button>
      <button onClick={() => { remove(); setOpen(false); }}><Trash2 size={14} />Remove</button>
    </div>}
  </div>;
}

function Lyrics({ track, activeIndices, onSeek }: { track: Track; activeIndices: number[]; onSeek: (time: number) => void }) {
  const activeIndex = activeIndices.at(-1) ?? -1;
  const active = useRef<HTMLButtonElement>(null);
  const [displayed, setDisplayed] = useState(track);
  const [fadingOut, setFadingOut] = useState(false);
  useEffect(() => {
    if (track.id === displayed.id) { setDisplayed(track); return; }
    setFadingOut(true);
    const swapTimer = window.setTimeout(() => { setDisplayed(track); setFadingOut(false); }, 400);
    return () => window.clearTimeout(swapTimer);
  }, [track, displayed.id]);
  useEffect(() => { active.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [activeIndex, displayed.id]);
  if (!displayed.result?.lines.length) {
    const message = displayed.status === 'processing' ? 'Preparing lyrics…' : displayed.status === 'queued' ? 'Waiting to prepare.' : displayed.status === 'error' ? 'Could not prepare this song.' : 'No lyrics found.';
    return <div className={`empty-state ${fadingOut ? 'lyrics-fading-out' : 'lyrics-fading-in'}`}>{displayed.status === 'processing' && <LoaderCircle size={20} className="spin" />}<p>{message}</p>{!['processing', 'queued'].includes(displayed.status) && <small>Open Cross-check for details.</small>}</div>;
  }
  const current = new Set(displayed.id === track.id ? activeIndices : []);
  return <div className={`lyric-list ${fadingOut ? 'lyrics-fading-out' : 'lyrics-fading-in'}`} style={{ fontFamily: `"${displayed.font || DEFAULT_FONT}", sans-serif` }}>{lyricSections(displayed.result.lines).map((section, sectionIndex) => <section className="lyric-verse" key={sectionIndex} aria-label={section.label || `Lyric section ${sectionIndex + 1}`}>
    {section.label && <h3>{section.label}</h3>}
    {section.indices.map(i => { const line = displayed.result!.lines[i]; return <button
    ref={i === activeIndex ? active : undefined} key={i}
    className={`lyric-line ${current.has(i) ? 'current' : ''}`}
    title={line.start === null ? 'Timing unavailable' : `Seek to ${time(line.start)}`}
    disabled={line.start === null} onClick={() => line.start !== null && onSeek(line.start)}>{displayLyricText(line.text)}</button>; })}
  </section>)}</div>;
}
const mixerControls = [
  { key: 'bass', label: 'Bass', min: -12, max: 12, step: 1, unit: 'dB' },
  { key: 'treble', label: 'Treble', min: -12, max: 12, step: 1, unit: 'dB' },
  { key: 'lyrics', label: 'Lyrics sync', min: -2, max: 2, step: .05, unit: 's' },
] as const;

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

type MenuItem = { id: string; label: string; hint?: string; checked?: boolean; disabled?: boolean; onSelect: () => void };

function MenuButton({ label, title, disabled = false, groups, className = '' }: {
  label: string; title?: string; disabled?: boolean; groups: { name?: string; items: MenuItem[] }[]; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  return <div className={`menu-control ${className}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" className="text-button" aria-expanded={open && !disabled} aria-haspopup="menu" disabled={disabled}
      title={title || label} onClick={() => setOpen(!open)}>{label}</button>
    {open && !disabled && <div className="track-menu menu-options" role="menu" aria-label={label}>
      {groups.map(group => <div className="menu-group" key={group.name || 'items'} role="group" aria-label={group.name}>
        {group.name && <p className="menu-group-label">{group.name}</p>}
        {group.items.map(item => <button type="button" role="menuitemradio" key={item.id} aria-checked={item.checked} disabled={item.disabled}
          onClick={() => { item.onSelect(); close(); }}><span className="menu-copy">{item.label}{item.hint && <small>{item.hint}</small>}</span>{item.checked && <Check size={14} aria-hidden="true" />}</button>)}
      </div>)}
    </div>}
  </div>;
}

const DEFAULT_SCROLL_COLORS: [string, string] = ['#303635', '#303635'];

function KaraokePreview({ track, position, mode }: { track: Track; position: number; mode: LyricsMode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cover, setCover] = useState<HTMLImageElement>();
  const [transition, setTransition] = useState<{
    shownTrack: Track;
    shownCover?: HTMLImageElement;
    lyricsOpacity: number;
    albumColors: [string, string] | null;
  }>(() => ({ shownTrack: track, lyricsOpacity: 1, albumColors: null }));
  const currentColorsRef = useRef<[string, string]>(DEFAULT_SCROLL_COLORS);
  const shownTrackRef = useRef<Track>(track);
  const shownCoverRef = useRef<HTMLImageElement | undefined>(undefined);

  useEffect(() => {
    if (!track.artwork) { setCover(undefined); return; }
    const image = new Image();
    image.onload = () => setCover(image);
    image.src = track.artwork;
    return () => { image.onload = null; };
  }, [track.artwork]);

  const activeCover = track.artwork ? (cover?.src === track.artwork ? cover : undefined) : undefined;
  const coverReady = !track.artwork || Boolean(activeCover);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    if (track.id === shownTrackRef.current.id) {
      shownTrackRef.current = track;
      shownCoverRef.current = activeCover;
      const colors = extractAlbumColors(ctx, activeCover) || DEFAULT_SCROLL_COLORS;
      currentColorsRef.current = colors;
      setTransition({ shownTrack: track, shownCover: activeCover, lyricsOpacity: 1, albumColors: colors });
      return;
    }
    if (!coverReady) return;
    const fromColors = currentColorsRef.current;
    const toColors = extractAlbumColors(ctx, activeCover) || DEFAULT_SCROLL_COLORS;
    const fromTrack = shownTrackRef.current;
    const fromCover = shownCoverRef.current;
    const fadeOutMs = 160, colorMs = 200, fadeInMs = 160;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      if (elapsed < fadeOutMs) {
        const t = elapsed / fadeOutMs;
        setTransition({ shownTrack: fromTrack, shownCover: fromCover, lyricsOpacity: 1 - t, albumColors: fromColors });
        frame = requestAnimationFrame(step);
      } else if (elapsed < fadeOutMs + colorMs) {
        const t = (elapsed - fadeOutMs) / colorMs;
        const blended: [string, string] = [lerpHexColor(fromColors[0], toColors[0], t), lerpHexColor(fromColors[1], toColors[1], t)];
        currentColorsRef.current = blended;
        setTransition({ shownTrack: track, shownCover: activeCover, lyricsOpacity: 0, albumColors: blended });
        frame = requestAnimationFrame(step);
      } else if (elapsed < fadeOutMs + colorMs + fadeInMs) {
        const t = (elapsed - fadeOutMs - colorMs) / fadeInMs;
        currentColorsRef.current = toColors;
        shownTrackRef.current = track;
        shownCoverRef.current = activeCover;
        setTransition({ shownTrack: track, shownCover: activeCover, lyricsOpacity: t, albumColors: toColors });
        frame = requestAnimationFrame(step);
      } else {
        currentColorsRef.current = toColors;
        shownTrackRef.current = track;
        shownCoverRef.current = activeCover;
        setTransition({ shownTrack: track, shownCover: activeCover, lyricsOpacity: 1, albumColors: toColors });
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [track, activeCover, coverReady]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const active = transition.shownTrack;
    const pos = active.id === track.id ? position : 0;
    drawKaraoke(ctx, active.result?.lines || [], pos, active.duration, {
      font: active.font || DEFAULT_FONT,
      mode,
      copyright: active.lyrics?.copyright || '',
      artwork: transition.shownCover,
      lyricsOpacity: transition.lyricsOpacity,
      albumColors: transition.albumColors,
    });
  }, [transition, position, mode, track.id]);

  return <div className="karaoke-viewport"><canvas ref={canvas} className="karaoke-preview" width={VIDEO_WIDTH} height={VIDEO_HEIGHT} aria-label={mode === 'karaoke' ? 'Four-line karaoke video preview' : 'Rolling video preview'} role="img" /></div>;
}
function TimingEditor({ track, mode, duration, canSeek, position, playing, play, seek, dirtyChanged }: { track: Track; mode: LyricsMode; duration: number; canSeek: boolean; position: number; playing: boolean; play: () => void; seek: (position: number) => void; dirtyChanged: (dirty: boolean) => void }) {
  const [lines, setLines] = useState<LyricLine[]>(() => structuredClone(track.result?.lines || []));
  const [index, setIndex] = useState(0), [font, setFont] = useState(track.font || DEFAULT_FONT);
  const [text, setText] = useState(''), [pasteText, setPasteText] = useState(''), [split, setSplit] = useState(''), [splitIndex, setSplitIndex] = useState<number | null>(null);
  const [tapIndex, setTapIndex] = useState(0);
  const [layoutText, setLayoutText] = useState(() => (track.result?.lines || []).map((line, i) => `${line.blockStart && i ? '\n' : ''}${line.section ? `[${line.section}]\n` : ''}${line.text}`).join('\n'));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(track.reviewed), [dirty, setDirty] = useState(false);
  useEffect(() => { dirtyChanged(dirty); }, [dirty, dirtyChanged]);
  const line = lines[index];
  const update = (change: (lines: LyricLine[]) => void) => {
    setLines(previous => { const next = structuredClone(previous); change(next); return next; });
    setDirty(true); setReviewed(false); setMessage('');
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const save = async () => { await api!.saveTiming(track.id, { lines, font, reviewed }); setDirty(false); setMessage('Timing saved for playback and MP4 export.'); };
  const reload = async () => {
    const current = (await api!.snapshot()).find(row => row.id === track.id);
    if (current) { setLines(structuredClone(current.result?.lines || [])); setFont(current.font); setReviewed(current.reviewed); setIndex(0); setDirty(false); }
  };
  const setTime = (unit: number, field: 'start' | 'end', value: number | null) => update(rows => { rows[index].words![unit][field] = value; const words = rows[index].words!; rows[index].start = words.every(word => word.start !== null && word.end !== null) ? words[0].start : null; rows[index].end = words.every(word => word.start !== null && word.end !== null) ? words.at(-1)!.end : null; });
  const tap = () => {
    const words = line?.words || [];
    if (!words.length || tapIndex > words.length) return;
    const stamp = Math.round(position * 100) / 100, finishing = tapIndex === words.length;
    update(rows => { const units = rows[index].words!; if (tapIndex > 0) units[tapIndex - 1].end = stamp; if (tapIndex < units.length) units[tapIndex].start = stamp; rows[index].start = units[0].start; rows[index].end = units.at(-1)!.end; });
    // The final tap closes the line, so review moves straight to the next one.
    if (finishing && index < lines.length - 1) { setIndex(index + 1); setTapIndex(0); return; }
    setTapIndex(tapIndex + 1);
  };
  useEffect(() => { setTapIndex(0); }, [index]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (event.key === ' ') { event.preventDefault(); play(); }
      else if (event.key.toLowerCase() === 't') { event.preventDefault(); tap(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [position, index, tapIndex, lines, playing]);
  const splitUnit = () => {
    const parts = split.split('|');
    if (splitIndex === null || parts.length < 2 || parts.some(part => !part.trim())) { setError('Separate syllables with |, for example a|way.'); return; }
    const unit = line.words![splitIndex], trailing = unit.text.match(/\s*$/)?.[0] || '';
    if (parts.join('') !== unit.text.trimEnd()) { setError('The syllables must reproduce this word without changing its spelling.'); return; }
    update(rows => {
      rows[index].words!.splice(splitIndex, 1, ...parts.map((part, i) => ({ text: part + (i === parts.length - 1 ? trailing : ''), start: unit.start === null || unit.end === null ? null : unit.start + i * (unit.end - unit.start) / parts.length, end: unit.start === null || unit.end === null ? null : unit.start + (i + 1) * (unit.end - unit.start) / parts.length })));
    });
    setSplitIndex(null); setMessage('Split created. Adjust the estimated syllable boundaries while listening.');
  };
  const draft = { ...track, font, result: { source: 'manual', timing: 'manual', agreement: track.result?.agreement ?? null, notes: [], lines } };
  const words = line?.words || [];
  const tapLabel = tapIndex === 0 ? 'Tap first word' : tapIndex >= words.length ? 'Tap last end' : `Tap “${words[tapIndex]?.text.trim() ?? ''}”`;
  return <div className="timing-editor">
    <div className="timing-playback">
      <button className="timing-play" onClick={play}>{playing ? 'Pause' : 'Play'}</button>
      <input aria-label="Reviewer playback position" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(position, duration || 1)} disabled={!canSeek} onChange={event => seek(Number(event.target.value))} />
      <output>{position.toFixed(2)} s</output>
      <button className="primary" disabled={busy || !lines.length} onClick={() => void run(save)}>Save timing</button>
    </div>
    <KaraokePreview track={draft} position={position} mode={mode} />
    {lines.length > 0 ? <>
      <div className="timing-linebar">
        <button className="icon-button" aria-label="Previous lyric line" disabled={index === 0} onClick={() => { setIndex(index - 1); setSplitIndex(null); }}>‹</button>
        <select aria-label="Lyric line" value={index} onChange={event => { setIndex(Number(event.target.value)); setSplitIndex(null); }}>{lines.map((line, i) => <option key={i} value={i}>{i + 1}. {line.text}</option>)}</select>
        <button className="icon-button" aria-label="Next lyric line" disabled={index >= lines.length - 1} onClick={() => { setIndex(index + 1); setSplitIndex(null); }}>›</button>
        <button onClick={() => line.start !== null && seek(line.start)} disabled={line.start === null}>Seek to line</button>
      </div>
      <div className="tap-panel">
        <ol className="tap-words">{words.map((unit, j) => <li key={j} className={`tap-word ${unit.start !== null ? 'done' : ''} ${j === tapIndex ? 'current' : ''}`}><span>{unit.text.trim() || unit.text}</span><small>{unit.start === null ? '—' : unit.start.toFixed(2)}{unit.end === null ? '' : ` – ${unit.end.toFixed(2)}`}</small></li>)}</ol>
        <div className="tap-actions">
          <button className="tap-button" disabled={tapIndex > words.length} onClick={tap}>{tapLabel}<kbd>T</kbd></button>
          <button className="text-button" disabled={tapIndex === 0} onClick={() => setTapIndex(0)}>Restart taps</button>
        </div>
        <p className="tap-hint">Play the song and tap <kbd>T</kbd> as each word begins. The last tap ends the final word and moves to the next line.</p>
      </div>
      <details className="timing-numbers"><summary>Fine-tune numbers</summary>
        <table className="timing-table"><thead><tr><th>Word / syllable</th><th>Start</th><th>End</th><th /></tr></thead><tbody>{words.map((unit, j) => <tr key={j}><td>{unit.text}</td>{(['start', 'end'] as const).map(field => <td key={field}><input aria-label={`${field === 'start' ? 'Start' : 'End'} of unit ${j + 1}`} type="number" min="0" max={track.duration} step="0.01" value={unit[field] ?? ''} onChange={event => setTime(j, field, event.target.value === '' ? null : Number(event.target.value))} /><button aria-label={`Mark ${field} of unit ${j + 1} at playback position`} onClick={() => setTime(j, field, Math.round(position * 100) / 100)}>Now</button></td>)}<td><button onClick={() => { setSplitIndex(j); setSplit(unit.text.trimEnd()); }}>Split syllables</button></td></tr>)}</tbody></table>
      </details>
      {splitIndex !== null && <div className="timing-toolbar"><input aria-label="Syllable split" value={split} onChange={event => setSplit(event.target.value)} placeholder="a|way" /><button onClick={splitUnit}>Apply split</button><button onClick={() => setSplitIndex(null)}>Cancel split</button></div>}
      <div className="timing-meta">
        <label><input type="checkbox" checked={Boolean(line.blockStart)} disabled={index === 0} onChange={event => update(rows => { rows[index].blockStart = event.target.checked; })} /> Begin a new stanza here</label>
        {line.blockStart && <label className="field"><span>Section name <small>optional</small></span><input aria-label="Section name" value={line.section || ''} maxLength={200} onChange={event => update(rows => { rows[index].section = event.target.value; })} /></label>}
        <details><summary>Change this line’s wording</summary><input aria-label="Replacement line text" value={text} onChange={event => setText(event.target.value)} placeholder={line.text} maxLength={500} /><button disabled={!text.trim()} onClick={() => { update(rows => { rows[index] = { ...rows[index], text: text.trim(), words: unitsFor(text.trim()), start: null, end: null, review: true }; }); setText(''); }}>Replace line and clear its timing</button></details>
      </div>
    </> : <p className="save-message">Add lyrics before setting timing.</p>}
    <details className="timing-font"><summary>Font and layout</summary>
      <label className="field"><span>Font</span><select aria-label="Video font" value={font} onChange={event => { setFont(event.target.value); setDirty(true); setReviewed(false); }}>{fonts.map(option => <option key={option.name} value={option.name}>{option.name} — {option.description}</option>)}</select></label>
    </details>
    <details className="paste-lyrics"><summary>Edit line and verse layout</summary><p>Keep the same words. Add line breaks, blank lines between verses, or headings such as [Chorus]. Word and syllable timings are preserved.</p><textarea aria-label="Line and verse layout" rows={10} value={layoutText} onChange={event => setLayoutText(event.target.value)} /><button disabled={busy || !layoutText.trim()} onClick={() => { setError(''); try { const next = reflowLyrics(lines, layoutText); setLines(next); setIndex(0); setDirty(true); setReviewed(false); setMessage('Line and verse layout updated. Save timing to apply it to playback and export.'); } catch (error) { setError(errorText(error)); } }}>Apply verse layout</button><button onClick={() => setLayoutText(lines.map((line, i) => `${line.blockStart && i ? '\n' : ''}${line.section ? `[${line.section}]\n` : ''}${line.text}`).join('\n'))}>Load current layout</button></details>
    <details className="paste-lyrics"><summary>Paste or replace complete lyrics</summary><textarea aria-label="Complete English lyrics" value={pasteText} onChange={event => setPasteText(event.target.value)} rows={8} placeholder="Paste English lyrics. Preserve blank lines between verses and choruses." /><button disabled={busy || !pasteText.trim()} onClick={() => void run(async () => { await api!.replaceLyrics(track.id, pasteText); await reload(); setPasteText(''); setMessage('Lyrics replaced. Align them or set timing manually.'); })}>Replace all lyrics</button></details>
    <div className="timing-footer">
      <label><input type="checkbox" checked={reviewed} onChange={event => { setReviewed(event.target.checked); setDirty(true); }} /> I reviewed these timings</label>
      {dirty && <span className="timing-dirty">Unsaved</span>}
      <details className="timing-more"><summary>More</summary>
        <div className="timing-toolbar"><button disabled={busy || dirty || !lines.length || track.demo} onClick={() => void run(async () => { await api!.align(track.id); await reload(); setMessage('Alignment finished. Check its status in Cross-check.'); })}>Align lyrics with ElevenLabs</button><button disabled={busy || dirty} onClick={() => void run(async () => { const file = await api!.saveProject(track.id); if (file) setMessage('Timing project saved. Queue the same recording and load this file to resume later.'); })}>Save project file</button><button disabled={busy || dirty} onClick={() => void run(async () => { if (await api!.loadProject(track.id)) { await reload(); setMessage('Timing project loaded.'); } })}>Load project file</button></div>
      </details>
    </div>
    {dirty && <p className="save-message">Unsaved changes — save timing before aligning or saving a project file.</p>}
    {message && <p role="status" className="save-message">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
function LyricsRetry({ track, act }: { track: Track; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const state = track.steps.lyrics.state;
  if (track.demo || !track.audioUrl || !['error', 'review', 'running'].includes(state) || state === 'review' && track.candidates.length > 0) return null;
  const running = state === 'running';
  const supported = typeof api?.retryLyrics === 'function';
  return <div className="lyrics-retry">
    <span>{running ? 'Searching LRCLIB…' : state === 'error' ? 'LRCLIB lyrics unavailable' : 'No matching LRCLIB lyrics found'}</span>
    <button className="text-button" disabled={running || !supported} onClick={() => void act(() => api!.retryLyrics(track.id))}>{running ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}{running ? 'Searching lyrics…' : 'Retry lyrics'}</button>
    {!supported && <small>Save your timing project and restart vocalist to enable lyrics retry.</small>}
  </div>;
}
function ReadingTiming({ track, act }: { track: Track; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const missing = track.result?.lines.flatMap((line, index) => hasCompleteWordTiming(line) ? [] : [index + 1]) ?? [];
  if (!track.audioUrl || !missing.length || track.demo) return null;
  const affected = `line${missing.length > 1 ? 's' : ''} ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`;
  const preparing = track.status === 'processing' || track.steps.alignment.state === 'running' || busy;
  return <div className="reading-timing" role="status">
    <span>{preparing ? 'Preparing word timing for the reading bar…' : `Reading bar needs word timing for ${affected}`}</span>
    <button className="text-button" disabled={preparing || track.export.state === 'running'} onClick={() => void act(async () => { setBusy(true); try { await api!.align(track.id); } finally { setBusy(false); } })}>{preparing ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}Align words</button>
    {track.steps.alignment.state === 'error' && <small>{track.steps.alignment.message} Open Edit timing to set word boundaries manually.</small>}
  </div>;
}
function Review({ track, act, onSettings }: { track: Track; act: (fn: () => Promise<unknown>) => Promise<void>; onSettings: () => void }) {
  const featuredArtist = featuredArtistFor(track);
  return <div className="review-panel">{track.demo ? <div className="info-box">Demo fixture: original instrumental and illustrative lyrics. No lyrics lookup, transcription, or accuracy comparison was performed.</div> : <>
    {featuredArtist && <p className="info-box">Featuring {featuredArtist}</p>}
    {Object.entries(track.steps).filter(([, step]) => step.state === 'error' || step.state === 'review' || step.state === 'running').map(([key, step]) => <div className="review-message" key={key}><strong>{key === 'transcript' ? 'Transcription' : key === 'lyrics' ? 'Lyrics lookup' : key === 'alignment' ? 'Word alignment' : 'Audio extraction'}</strong><p>{step.message}</p></div>)}
    <LyricsRetry track={track} act={act} />
    <ReadingTiming track={track} act={act} />
    {track.candidates.length > 0 && <label className="field"><span>Confirm the recording <small>{track.candidates[0].source || 'LRCLIB'} ({track.candidates.length})</small></span><select aria-label="Lyrics recording" disabled={track.steps.lyrics.state === 'running'} value={track.lyrics?.id || ''} onChange={event => void act(() => api!.selectLyrics(track.id, Number(event.target.value)))}><option value="" disabled>Select the matching song and version</option>{track.candidates.map(row => <option key={row.id} value={row.id}>{row.artist} — {row.title} {row.album ? ` (${row.album})` : ''} ({time(row.duration)})</option>)}</select></label>}
    <div className="review-summary"><div><strong>{track.result?.agreement == null ? '—' : `${Math.round(track.result.agreement * 100)}%`}</strong><span>word agreement</span></div><p>{track.result?.notes[0] || 'Each source runs independently. The comparison appears when processing finishes.'}</p></div>
    {track.result?.lines.some(line => line.review) && <div className="comparison"><div className="comparison-head"><span>PRIMARY WORDING</span><span>INDEPENDENT TRANSCRIPT EVIDENCE</span></div>{track.result.lines.filter(line => line.review).map((line, i) => <Comparison key={i} line={line} />)}</div>}
    {track.result?.lines.length === 0 && track.transcript.length > 0 && <p>{track.transcript.map(segment => segment.text).join(' ')}</p>}
    <div className="review-actions"><button className="secondary" onClick={() => { if (track.result?.timing !== 'manual' || window.confirm('Retry processing and replace the manual timing? Save a project file first to keep it.')) void act(() => api!.retry(track.id)); }} disabled={track.status === 'processing' || track.status === 'queued' || track.steps.lyrics.state === 'running'}><RotateCcw size={14} /> Retry processing</button><button className="text-button" onClick={onSettings}><Settings2 size={14} /> Audio settings</button></div>
  </>}</div>;
}
function Comparison({ line }: { line: LyricLine }) { return <div className="comparison-row"><div><span>{line.start === null ? 'Untimed' : time(line.start)} ({line.timing})</span><p>{line.text}</p></div><div><span>{line.agreement === null ? 'Unverified' : `${Math.round(line.agreement * 100)}% word agreement`}</span><p>{line.heard || 'No matching transcript evidence.'}</p></div></div>; }
function Modal({ title, close, children, className = '' }: { title: string; close: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const latestClose = useRef(close); latestClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || [])].filter(element => element.getClientRects().length);
    focusable()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestClose.current();
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    dialog?.addEventListener('keydown', handler);
    return () => { dialog?.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div className={`modal ${className}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><IconButton label="Close dialog" onClick={close}><X size={19} /></IconButton></div>{children}</div></div>;
}

function SettingsModal({ close, checked, loadDemo, track, act }: { close: () => void; checked: (deps: Dependency[]) => void; loadDemo: () => Promise<void>; track: Track | null; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [settings, setSettings] = useState<Settings | null>(null), [deps, setDeps] = useState<Dependency[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [section, setSection] = useState<"General" | "Audio tools">("General");
  useEffect(() => {
    api?.getSettings().then(setSettings).catch(error => setError(errorText(error)));
    api?.check().then(setDeps).catch(error => setError(errorText(error)));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!api || !settings) return;
    if (!settings.ytDlp.trim() || !settings.ffmpeg.trim() || (settings.transcriptionProvider === 'whisper' && !settings.whisper.trim())) {
      setSection('Audio tools');
      setError('Enter the missing audio tool paths.');
      return;
    }
    setBusy(true); setError('');
    try {
      setSettings(await api.saveSettings(settings));
      const results = await api.check(); setDeps(results); checked(results);
      setMessage(results.every(dep => dep.ok || dep.optional) ? 'Saved. Audio tools are ready.' : 'Saved. Some audio tools still need setup.');
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Modal title="Settings" close={close} className="settings-modal">
    <nav className="settings-nav" aria-label="Settings sections">
      {(['General', 'Audio tools'] as const).map(item => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}
    </nav>
    {settings ? <form className="settings-form" onSubmit={save}>
      <div className="settings-content">
        <section hidden={section !== 'General'} aria-label="General">
          <h3>General</h3>
          {track && <div className="settings-row"><span>Cover</span><div className="cover-setting"><p>{track.artwork ? track.title : 'No cover for this song'}<small>Shown in the Rolling video and export.</small></p><button type="button" className="secondary" disabled={!track.audioUrl} onClick={() => void act(() => api!.chooseCover(track.id))}>{track.artwork ? 'Change cover' : 'Add cover'}</button></div></div>}
          <div className="settings-row"><span>Lyrics</span><p>LRCLIB<small>No API key required.</small></p></div>
          <div className="settings-row"><span>Song titles</span><p>Apple Intelligence<small>{deps.find(dep => dep.key === 'appleIntelligence')?.detail || 'Checking on-device model availability…'}</small></p></div>
          <label className="field"><span>Transcription</span><div><select aria-label="Transcription" value={settings.transcriptionProvider} onChange={event => setSettings({ ...settings, transcriptionProvider: event.target.value as Settings['transcriptionProvider'] })}><option value="elevenlabs">ElevenLabs Scribe v2 — English</option><option value="whisper">Local Whisper — English</option></select><small>Word alignment uses ElevenLabs after the independent transcription.</small></div></label>
          <label className="field"><span>Credentials file</span><div><div className="file-field"><input aria-label="Credentials file" value={settings.credentialsFile} onChange={event => setSettings({ ...settings, credentialsFile: event.target.value })} placeholder=".env.local" /><button type="button" onClick={async () => { try { const file = await api?.chooseCredentials(); if (file) setSettings({ ...settings, credentialsFile: file }); } catch (error) { setError(errorText(error)); } }}>Browse</button></div>{deps.find(dep => dep.key === 'elevenlabs' && !dep.ok) && <small>Choose a dotenv file containing ELEVENLABS_API_KEY.</small>}</div></label>
          {settings.transcriptionProvider === 'whisper' && <label className="field"><span>Whisper model</span><div className="file-field"><input aria-label="Whisper model" value={settings.model} onChange={event => setSettings({ ...settings, model: event.target.value })} placeholder="Path to a ggml .bin model" /><button type="button" className="secondary" onClick={async () => {
            try { const model = await api?.chooseModel(); if (model) setSettings({ ...settings, model }); } catch (error) { setError(errorText(error)); }
          }}>Browse</button></div></label>}
          <label className="field"><span>Song language</span><input value="English" readOnly /></label>
        </section>
        <section hidden={section !== 'Audio tools'} aria-label="Audio tools">
          <h3>Audio tools</h3>
          {(['ytDlp', 'ffmpeg', ...(settings.transcriptionProvider === 'whisper' ? ['whisper' as const] : [])] as const).map(key => <label className="field" key={key}><span>{key === 'ytDlp' ? 'yt-dlp' : key === 'whisper' ? 'Whisper CLI' : 'FFmpeg'}<small className={deps.find(dep => dep.key === key)?.ok ? 'dep-ok' : 'dep-missing'}>{deps.find(dep => dep.key === key)?.ok ? 'Available' : 'Missing'}</small></span><input value={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.value })} /></label>)}
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="save-message" role="status">{message}</p>}
      <div className="settings-actions"><button type="button" className="text-button" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await loadDemo(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
      }}>Load demo</button><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Save & check tools</button></div>
    </form> : <p className="settings-content" role={error ? "alert" : "status"}>{error || "Loading settings…"}</p>}
  </Modal>;
}
