import { useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, LoaderCircle } from 'lucide-react';
import type { Track } from '../types';
import { api, type Act } from '../api';
import { TrackActions } from './TrackActions';

const statusText = { queued: 'Queued', processing: 'Preparing…', ready: '', review: 'Needs review', error: 'Failed' };
const inLowerHalf = (event: DragEvent<HTMLDivElement>) => event.clientY >= event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2;

type Props = {
  tracks: Track[]; selectedId: string | null; select: (id: string) => void; remove: (track: Track) => void; act: Act;
  shiftMode: boolean; setShiftMode: (update: (value: boolean) => boolean) => void;
};

export function QueuePanel({ tracks, selectedId, select, remove, act, shiftMode, setShiftMode }: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const drop = (event: DragEvent<HTMLDivElement>, track: Track) => {
    event.preventDefault();
    const id = draggedId;
    if (!id) return;
    const source = tracks.findIndex(row => row.id === id);
    const target = tracks.findIndex(row => row.id === track.id);
    if (source < 0 || target < 0) return;
    const index = target + (inLowerHalf(event) ? 1 : 0);
    const targetIndex = source < index ? index - 1 : index;
    void act(() => api!.reorder(id, targetIndex));
  };
  const clear = () => {
    if (window.confirm(`Clear all ${tracks.length} queued songs? Saved timing projects stay on disk.`)) void act(() => api!.clearQueue());
  };
  return <section className="queue-panel" aria-label="Song queue">
    <h2>Queue <span className="queue-total">{tracks.length}</span><div className="queue-tools">
      <button type="button" className="text-button" aria-pressed={shiftMode} onClick={() => setShiftMode(value => !value)}>Shift</button>
      <button type="button" className="text-button" disabled={!tracks.length} onClick={clear}>Clear</button>
    </div></h2>
    <div className="queue-list">
      {!tracks.length && <p className="empty-queue">No songs queued.</p>}
      {tracks.map((track, i) => <div key={track.id} draggable
        onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', track.id); setDraggedId(track.id); }}
        onDragOver={event => {
          if (!draggedId) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'move';
          setDropTarget({ id: track.id, after: inLowerHalf(event) });
        }}
        onDrop={event => drop(event, track)}
        onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
        className={`queue-row ${selectedId === track.id ? 'selected' : ''} ${draggedId === track.id ? 'dragging' : ''} ${dropTarget?.id === track.id ? dropTarget.after ? 'drop-after' : 'drop-before' : ''}`}>
        <button className="track-select" onClick={() => select(track.id)} aria-label={`Select ${track.title}`} aria-pressed={selectedId === track.id}>
          <span className="track-number">{i + 1}</span>
          <span className="track-info">
            <strong>{track.title}</strong>
            {track.status !== 'ready' && <small className={`status-${track.status}`}>{track.status === 'processing' && <LoaderCircle size={11} className="spin" />}{statusText[track.status]}</small>}
            {!['You', 'Everyone'].includes(track.singer) && <small>{track.singer}</small>}
          </span>
        </button>
        {shiftMode && <div className="shift-buttons">
          <button type="button" className="icon-button" aria-label={`Shift ${track.title} earlier`} disabled={i === 0} onClick={() => void act(() => api!.move(track.id, -1))}><ArrowUp size={14} /></button>
          <button type="button" className="icon-button" aria-label={`Shift ${track.title} later`} disabled={i === tracks.length - 1} onClick={() => void act(() => api!.move(track.id, 1))}><ArrowDown size={14} /></button>
        </div>}
        <TrackActions track={track} index={i} count={tracks.length}
          move={direction => void act(() => api!.move(track.id, direction))}
          remove={() => remove(track)} />
      </div>)}
    </div>
  </section>;
}
