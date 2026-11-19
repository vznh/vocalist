import { useEffect, useRef, useState } from 'react';
import type { Track } from '../types';
import { drawKaraoke, extractAlbumColors, lerpHexColor, VIDEO_WIDTH, VIDEO_HEIGHT, DEFAULT_FONT, type LyricsMode } from '../../shared/karaoke.mjs';

const DEFAULT_SCROLL_COLORS: [string, string] = ['#303635', '#303635'];

export function KaraokePreview({ track, position, mode }: { track: Track; position: number; mode: LyricsMode }) {
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

  return <div className="karaoke-viewport">
    <canvas ref={canvas} className="karaoke-preview" width={VIDEO_WIDTH} height={VIDEO_HEIGHT}
      aria-label={mode === 'karaoke' ? 'Four-line karaoke video preview' : 'Rolling video preview'} role="img" />
  </div>;
}
