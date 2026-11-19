import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, PanelLeft, X } from 'lucide-react';
import type { Track } from './types';
import type { LyricsMode } from '../shared/karaoke.mjs';
import { exportIssue } from '../shared/timing-validation.mjs';
import { api, errorText } from './api';
import { useAudioMixer } from './useAudioMixer';
import { useLegacyUpgrade } from './hooks/useLegacyUpgrade';
import { useQueue } from './hooks/useQueue';
import { useWindowFocused } from './hooks/useWindowFocused';
import { useZoom } from './hooks/useZoom';
import { IconButton } from './components/IconButton';
import { KaraokePreview } from './components/KaraokePreview';
import { Lyrics } from './components/Lyrics';
import { LyricsRetry } from './components/LyricsRetry';
import { MixerModal, defaultMix } from './components/MixerModal';
import { Modal } from './components/Modal';
import { PlayerBar } from './components/PlayerBar';
import { QueueInput } from './components/QueueInput';
import { QueuePanel } from './components/QueuePanel';
import { ReadingTiming } from './components/ReadingTiming';
import { Review } from './components/Review';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { SongHeader } from './components/SongHeader';
import { StageIcon } from './components/StageIcon';
import { TimingEditor } from './components/TimingEditor';
import { ZoomPill } from './components/ZoomPill';

const MODE_KEY = 'vocalist:lyrics-mode';

export default function App() {
  const upgradeMessage = useLegacyUpgrade(api);
  const [error, setError] = useState('');
  const windowFocused = useWindowFocused();
  const { zoom, zoomHud, updateZoom, holdZoomHud, releaseZoomHud } = useZoom();
  const { tracks, selectedId, setSelectedId, dependencies, setDependencies } = useQueue(setError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [timingDirty, setTimingDirty] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mix, setMix] = useState(defaultMix);
  const [stage, setStage] = useState(false);
  const [mode, setMode] = useState<LyricsMode>(() => localStorage.getItem(MODE_KEY) === 'scrolling' ? 'scrolling' : 'karaoke');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shiftMode, setShiftMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState({ source: '', seconds: 0 });
  const [volume, setVolume] = useState(.7);
  const audio = useRef<HTMLAudioElement>(null);
  const [voice, setVoice] = useState(100);
  const autoPlay = useRef(false);
  const selected = tracks.find(track => track.id === selectedId) || null;
  const { enable: enableMixer, voiceState } = useAudioMixer(audio, mix.bass, mix.treble, voice, selected?.voiceMix === 'ready' ? selected.audioUrl || undefined : undefined);

  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
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
  const remove = (track: Track) => {
    if (track.id === selectedId) audio.current?.pause();
    void act(() => api!.remove(track.id));
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
  const changeMode = (nextMode: LyricsMode) => { setMode(nextMode); localStorage.setItem(MODE_KEY, nextMode); };
  const closeTiming = () => {
    if (!timingDirty || window.confirm('Discard the unsaved timing changes?')) { setTimingOpen(false); setTimingDirty(false); }
  };
  const lyricPosition = Math.max(0, position - mix.lyrics);
  const seekLyric = (time: number) => seek(time + mix.lyrics);
  // Overlapping verses are all current, so every line singing now lights up.
  const activeIndices = selected?.result?.lines.flatMap((line, index) => line.start !== null && line.end !== null && lyricPosition >= line.start && lyricPosition < line.end ? [index] : []) ?? [];
  const total = mediaDuration.source === selected?.audioUrl && mediaDuration.seconds > 0 ? mediaDuration.seconds : selected?.duration || 0;
  const canSeek = Boolean(selected?.audioUrl && mediaDuration.source === selected.audioUrl && mediaDuration.seconds > 0);
  const needsSetup = dependencies.some(dep => !dep.ok && !dep.optional);
  const sourceNote = sourceNoteFor(selected);
  const exportBlocker = useMemo(() => exportIssue(selected), [selected]);
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

    {!stage && sidebarOpen && <Sidebar trackCount={tracks.length} canStage={Boolean(selected?.audioUrl)} toggleStage={toggleStage} openSettings={() => setSettingsOpen(true)} />}
    {!stage && <button type="button" className={`sidebar-toggle ${!windowFocused ? 'window-unfocused' : ''}`} style={{ zoom: 1 / zoom }}
      aria-label="Toggle sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}><PanelLeft size={16} /></button>}
    {zoomHud && <ZoomPill zoom={zoom} update={updateZoom} hold={holdZoomHud} release={releaseZoomHud} />}
    {!stage && !sidebarOpen && <button type="button" className="sidebar-toggle stage-toggle" aria-label="Stage" title="Stage" onClick={toggleStage} disabled={!selected?.audioUrl}><StageIcon /></button>}
    <div className="content">
    {!stage ? <main className="main">
        <QueueInput added={id => setSelectedId(current => current || id)} />
        {!api && <p className="notice">Open the desktop app with <code>npm run dev</code> to queue songs.</p>}
        {needsSetup && <button className="setup-notice" onClick={() => setSettingsOpen(true)}>Tools or API credentials need setup <span>Open settings</span></button>}
        <div className="workspace">
          <QueuePanel tracks={tracks} selectedId={selectedId} select={select} remove={remove} act={act} shiftMode={shiftMode} setShiftMode={setShiftMode} />
          <section className="song-panel" aria-label="Lyrics">
            {selected ? <>
              <SongHeader track={selected} mode={mode} setMode={changeMode} exportBlocker={exportBlocker} sync={mix.lyrics} act={act}
                openMixer={() => { setMixerOpen(true); void act(enableMixer); }} openReview={() => setReviewOpen(true)} openTiming={() => setTimingOpen(true)} />
              <div className="song-warnings">
                {exportWarning && <p>{exportWarning}{(exportWarning.startsWith('Line ') || exportWarning.startsWith('Provide ')) && ' Open Edit timing to correct lyric boundaries.'}</p>}
                {sourceNote && <p>{sourceNote}</p>}
                <ReadingTiming track={selected} act={act} />
              </div>
              <LyricsRetry track={selected} act={act} />
              {selected.result?.lines.length ? <div className="song-preview">
                <section className="video-column" aria-label="Video"><h3>Video</h3><KaraokePreview track={selected} position={lyricPosition} mode={mode} /></section>
                <section className="all-lyrics" aria-label="All lyrics"><h3>All lyrics</h3><Lyrics track={selected} activeIndices={activeIndices} onSeek={seekLyric} /></section>
              </div> : <Lyrics track={selected} activeIndices={activeIndices} onSeek={seekLyric} />}
              {selected.lyrics?.copyright && <p className="source-note">{selected.lyrics.copyright}</p>}
              {selected.export.state !== 'idle' && <div className="export-status" role="status">
                {selected.export.message}
                {selected.export.state === 'running' && <>
                  <progress aria-label="MP4 export progress" max="100" value={selected.export.progress} />{selected.export.progress}%{' '}
                  <button onClick={() => void act(() => api!.cancelExport(selected.id))}>Cancel export</button>
                </>}
              </div>}
            </> : <p className="empty-queue">Nothing in queue.</p>}
          </section>
        </div>
      </main> : <main className="stage">
      <header><span>{selected?.title}</span><small>{sourceNote}</small></header>
      {selected && <ReadingTiming track={selected} act={act} />}
      {selected && <KaraokePreview track={selected} position={lyricPosition} mode={mode} />}
    </main>}

    {selected && <PlayerBar canPlay={Boolean(selected.audioUrl)} playing={playing} play={play} hasNext={Boolean(nextTrack)} next={next}
      position={position} total={total} canSeek={canSeek} seek={seek} volume={volume} setVolume={setVolume} toggleStage={toggleStage} />}
    </div>
    {error && <div className="toast" role="alert"><span>{error}</span><IconButton label="Dismiss notification" onClick={() => setError('')}><X size={16} /></IconButton></div>}
    {mixerOpen && <MixerModal track={selected} mix={mix} setMix={setMix} voice={voice} setVoice={setVoice} voiceState={voiceState} enableMixer={enableMixer} act={act} close={() => setMixerOpen(false)} />}
    {reviewOpen && selected && <Modal title="Cross-check" close={() => setReviewOpen(false)} className="review-modal">
      <Review track={selected} act={act} onSettings={() => { setReviewOpen(false); setSettingsOpen(true); }} />
    </Modal>}
    {timingOpen && selected && <Modal title="Edit timing" close={closeTiming} className="timing-modal">
      <TimingEditor track={selected} mode={mode} duration={total} canSeek={canSeek} position={position} playing={playing} play={play} seek={seek} dirtyChanged={setTimingDirty} />
    </Modal>}
    {settingsOpen && <SettingsModal track={selected} act={act} close={() => setSettingsOpen(false)} checked={setDependencies} loadDemo={async () => {
      const id = await api!.demo(); select(id); setSettingsOpen(false);
    }} />}
  </div>;
}

function sourceNoteFor(track: Track | null) {
  if (!track || track.demo || !track.result) return '';
  if (track.result.source === 'transcript' || !track.lyrics && track.transcript.length) return 'Review line and verse breaks in the unverified transcript.';
  if (track.result.timing === 'partial') return 'Review word timing to complete alignment.';
  if (track.result.source === 'database' && track.result.lines.some(line => line.timing === 'transcript')) return 'Review the accuracy of the transcript timing.';
  if (track.result.timing === 'approximate') return 'Approximate timing';
  return '';
}
