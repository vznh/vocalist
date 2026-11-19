import { getReadingCursors, READING_BAR_OPACITY, READING_BAR_WIDTH, SUNG_TEXT_COLOR, UPCOMING_TEXT_COLOR } from './reading-cursor.mjs';
import { pairWindows, pairOpacity, sequenceState, clamp } from './lyric-sequence.mjs';
import { speakerColorMap, extractAlbumColors, mixHexColors } from './colors.mjs';
import { VIDEO_WIDTH, VIDEO_HEIGHT, DEFAULT_FONT, unitsFor, displayLyricText, unitProgress } from './karaoke-common.mjs';
import { drawScrollingLyrics } from './scrolling.mjs';
export { FADE_SECONDS, clamp, hasCompleteWordTiming, lineTiming, lyricPairs, frameState } from './lyric-sequence.mjs';
export { VIDEO_WIDTH, VIDEO_HEIGHT, DEFAULT_SYNC, DEFAULT_FONT, fonts, unitsFor, displayLyricText, unitProgress } from './karaoke-common.mjs';
export { ARTIST_COLORS, speakerColorMap, extractAlbumColors, lerpHexColor, mixHexColors } from './colors.mjs';
export { scrollingState } from './scrolling.mjs';

function layoutPair(ctx, lines, window, font, size) {
  ctx.font = `${size}px "${font}"`;
  return window.indices.flatMap((index, lineOffset) => {
    const line = lines[index];
    const units = (line.words?.length ? line.words : unitsFor(line.text)).map(unit => ({ ...unit, text: displayLyricText(unit.text) }));
    const widths = units.map(unit => ctx.measureText(unit.text).width);
    let x = (1920 - widths.reduce((sum, width) => sum + width, 0)) / 2;
    return units.map((unit, unitIndex) => {
      const positioned = { ...unit, x, y: 360 + (window.bank * 2 + lineOffset) * 120, width: ctx.measureText(unit.text.trimEnd()).width, fontSize: size, lineIndex: index, verseStart: index === 0 || !!line.blockStart, leadInStart: window.start };
      x += widths[unitIndex];
      return positioned;
    });
  });
}

// Identical frames in desktop preview and MP4.
export function drawKaraoke(ctx, lines, position, duration, { font = DEFAULT_FONT, copyright = '', artwork, mode = 'karaoke', lyricsOpacity = 1, albumColors: overrideColors = null } = {}) {
  ctx.save(); ctx.globalAlpha = 1;
  const resolvedColors = overrideColors || extractAlbumColors(ctx, artwork);
  if (mode === 'scrolling') {
    if (resolvedColors) {
      const grad = ctx.createLinearGradient(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      grad.addColorStop(0, resolvedColors[0]);
      grad.addColorStop(1, resolvedColors[1]);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#303635';
    }
  } else {
    ctx.fillStyle = '#000';
  }
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  const alpha = clamp(lyricsOpacity);
  if (mode === 'scrolling') drawScrollingLyrics(ctx, lines, position, font, !!artwork, resolvedColors, alpha);
  else drawTraditionalKaraoke(ctx, lines, position, duration, font, alpha);
  if (artwork) {
    ctx.globalAlpha = 1;
    ctx.drawImage(artwork, VIDEO_WIDTH - 216, VIDEO_HEIGHT - 216, 168, 168);
  }
  if (copyright) {
    ctx.globalAlpha = 1; ctx.fillStyle = '#aaa'; ctx.font = '18px Arial'; ctx.textAlign = 'center';
    ctx.fillText(copyright.replace(/\s+/g, ' ').slice(0, 1000), 960, 1035, artwork ? 1400 : 1740);
  }
  ctx.restore();
}

function drawTraditionalKaraoke(ctx, lines, position, duration, font, lyricsOpacity = 1) {
  if (lyricsOpacity <= 0) return;
  const speakerColors = speakerColorMap(lines);
  const windows = pairWindows(lines, duration);
  const state = sequenceState(windows, position);
  const activePair = windows.filter(window => window.first !== null && window.first <= position).at(-1) || windows[0];
  const section = activePair ? lines.slice(0, activePair.indices[0] + 1).reverse().find(line => line.blockStart)?.section : '';
  if (section && state.length) { ctx.globalAlpha = lyricsOpacity; ctx.fillStyle = '#aaa'; ctx.font = '26px Arial'; ctx.textAlign = 'center'; ctx.fillText(section, 960, 215, 1660); }
  // Stable font geometry across replacement keeps the untouched bank in place.
  ctx.font = `64px "${font}"`;
  const widest = Math.max(1, ...lines.map(line => ctx.measureText(displayLyricText(line.text)).width));
  const size = 64 * Math.min(1, 1660 / widest);
  const visiblePairs = new Set(state.map(row => row.pairIndex));
  const layouts = windows.filter(window => visiblePairs.has(window.pairIndex)).map(window => ({ window, units: layoutPair(ctx, lines, window, font, size) }));
  const rowOpacity = new Map(state.map(row => [row.index, row.opacity]));
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const { units } of layouts) for (const unit of units) {
    const { x, y, width, fontSize } = unit;
    ctx.font = `${fontSize}px "${font}"`;
    ctx.globalAlpha = (rowOpacity.get(unit.lineIndex) ?? 0) * lyricsOpacity;
    ctx.fillStyle = UPCOMING_TEXT_COLOR; ctx.fillText(unit.text, x, y);
    const progress = unitProgress(unit, position);
    if (progress > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - 1, y - fontSize, Math.max(0, width * progress + 1), fontSize * 2); ctx.clip();
      const lineObj = lines[unit.lineIndex]; const lineSpeakers = [...new Set((lineObj?.words || []).map(w => speakerColors.get(w.speaker_id)).filter(Boolean))]; const mixed = lineObj?.color || (lineSpeakers.length > 1 ? mixHexColors(lineSpeakers) : speakerColors.get(unit.speaker_id)) || SUNG_TEXT_COLOR; ctx.fillStyle = mixed; ctx.fillText(unit.text, x, y); ctx.restore();
    }
  }
  const cursorWords = layouts.flatMap(({ window, units }) => units.map(unit => ({ ...unit, opacity: pairOpacity(window, position) })));
  for (const cursor of getReadingCursors(cursorWords, position)) {
    ctx.globalAlpha = cursor.opacity * READING_BAR_OPACITY * lyricsOpacity; ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.roundRect(cursor.x - READING_BAR_WIDTH / 2, cursor.y - cursor.fontSize * .58, READING_BAR_WIDTH, cursor.fontSize * 1.16, READING_BAR_WIDTH / 4);
    ctx.fill();
  }
}
