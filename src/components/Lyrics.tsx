import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { Track } from '../types';
import { DEFAULT_FONT, displayLyricText } from '../../shared/karaoke.mjs';
import { lyricSections } from '../../shared/lyrics.mjs';
import { time } from '../api';

export function Lyrics({ track, activeIndices, onSeek }: { track: Track; activeIndices: number[]; onSeek: (time: number) => void }) {
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
  const fade = fadingOut ? 'lyrics-fading-out' : 'lyrics-fading-in';
  if (!displayed.result?.lines.length) {
    const message = displayed.status === 'processing' ? 'Preparing lyrics…' : displayed.status === 'queued' ? 'Waiting to prepare.' : displayed.status === 'error' ? 'Could not prepare this song.' : 'No lyrics found.';
    return <div className={`empty-state ${fade}`}>
      {displayed.status === 'processing' && <LoaderCircle size={20} className="spin" />}
      <p>{message}</p>
      {!['processing', 'queued'].includes(displayed.status) && <small>Open Cross-check for details.</small>}
    </div>;
  }
  const current = new Set(displayed.id === track.id ? activeIndices : []);
  return <div className={`lyric-list ${fade}`} style={{ fontFamily: `"${displayed.font || DEFAULT_FONT}", sans-serif` }}>
    {lyricSections(displayed.result.lines).map((section, sectionIndex) => <section className="lyric-verse" key={sectionIndex} aria-label={section.label || `Lyric section ${sectionIndex + 1}`}>
      {section.label && <h3>{section.label}</h3>}
      {section.indices.map(i => {
        const line = displayed.result!.lines[i];
        return <button
          ref={i === activeIndex ? active : undefined} key={i}
          className={`lyric-line ${current.has(i) ? 'current' : ''}`}
          title={line.start === null ? 'Timing unavailable' : `Seek to ${time(line.start)}`}
          disabled={line.start === null} onClick={() => line.start !== null && onSeek(line.start)}>{displayLyricText(line.text)}</button>;
      })}
    </section>)}
  </div>;
}
