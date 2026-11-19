import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Track } from '../types';

export function TrackActions({ track, index, count, move, remove }: { track: Track; index: number; count: number; move: (direction: number) => void; remove: () => void }) {
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
