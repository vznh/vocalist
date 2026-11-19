import { getReadingCursors, READING_BAR_OPACITY, READING_BAR_WIDTH, SUNG_TEXT_COLOR, UPCOMING_TEXT_COLOR } from './reading-cursor.mjs';
import { pairWindows, pairOpacity, sequenceState, clamp, lineTiming } from './lyric-sequence.mjs';
export { FADE_SECONDS, clamp, hasCompleteWordTiming, lineTiming, lyricPairs, frameState } from './lyric-sequence.mjs';

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export const fonts = [
  { name: 'Arial', description: 'Neutral, familiar letterforms' },
  { name: 'Verdana', description: 'Wide letters and generous spacing' },
  { name: 'Trebuchet MS', description: 'Rounded letters with distinct shapes' },
];
export const unitsFor = text => (text.match(/\S+\s*/g) || []).map(text => ({ text, start: null, end: null }));
// Presentation only: reference lyrics and their alignment tokens stay intact.
export const displayLyricText = text => text.replace(/[.\u2026]/g, '');
export function unitProgress(unit, position) {
  return unit.start === null || unit.end === null || unit.end <= unit.start ? 0 : clamp((position - unit.start) / (unit.end - unit.start));
}

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

const SCROLLING_LINE_HEIGHT = 96;
const SCROLLING_LYRIC_GAP = 56;
const scrollingLayouts = new WeakMap();

function wrapLyric(ctx, text, width) {
  const rows = [];
  let start = 0, end = 0;
  for (const match of text.matchAll(/\S+/g)) {
    const wordStart = match.index;
    const wordEnd = wordStart + match[0].length;
    if (start === end) start = wordStart;
    if (ctx.measureText(text.slice(start, wordEnd)).width <= width) {
      end = wordEnd;
      continue;
    }
    if (end > start) rows.push({ start, end });
    start = end = wordStart;
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(match[0])) {
      if (end > start && ctx.measureText(text.slice(start, end + segment.length)).width > width) {
        rows.push({ start, end });
        start = end;
      }
      end += segment.length;
    }
  }
  if (end > start || !rows.length) rows.push({ start, end });
  return rows;
}

function scrollingRows(ctx, line, width) {
  const text = displayLyricText(line.text);
  const words = line.words || [];
  let offset = 0;
  const units = words.map(unit => {
    const content = displayLyricText(unit.text);
    const start = offset;
    offset += content.length;
    return { unit, start, end: start + content.trimEnd().length };
  });
  const timed = words.map(unit => displayLyricText(unit.text)).join('') === text;
  return wrapLyric(ctx, text, width).map(row => {
    const marks = timed ? units.flatMap(({ unit, start, end }) => {
      const from = Math.max(start, row.start), to = Math.min(end, row.end);
      if (from >= to || unit.start === null || unit.end === null || unit.end <= unit.start) return [];
      const unitWidth = ctx.measureText(text.slice(start, end)).width;
      if (!unitWidth) return [];
      return [{ unit, left: ctx.measureText(text.slice(row.start, from)).width, right: ctx.measureText(text.slice(row.start, to)).width,
        from: ctx.measureText(text.slice(start, from)).width / unitWidth, to: ctx.measureText(text.slice(start, to)).width / unitWidth }];
    }) : [];
    return { text: text.slice(row.start, row.end), marks };
  });
}

function scrollingLayout(ctx, lines, font, width) {
  const cached = scrollingLayouts.get(ctx);
  if (cached?.lines === lines && cached.font === font && cached.width === width) return cached.blocks;
  let top = 0;
  const blocks = lines.map(line => {
    const rows = scrollingRows(ctx, line, width);
    const height = rows.length * SCROLLING_LINE_HEIGHT;
    const block = { ...lineTiming(line), top, height, rows };
    top += height + SCROLLING_LYRIC_GAP;
    return block;
  });
  scrollingLayouts.set(ctx, { lines, font, width, blocks });
  return blocks;
}

function drawScrollingLyrics(ctx, lines, position, font, hasArtwork) {
  const center = 490;
  const left = 128;
  const width = VIDEO_WIDTH - left - (hasArtwork ? 246 : left);
  ctx.font = `500 80px "${font}"`;
  const blocks = scrollingLayout(ctx, lines, font, width);
  let active = -1, last = -1, previous = -1;
  for (const [index, { start, end }] of blocks.entries()) {
    if (start === null || start > position) continue;
    if (end !== null && position < end && (active === -1 || start >= blocks[active].start)) active = index;
    if (last === -1 || start >= blocks[last].start) {
      previous = last;
      last = index;
    } else if (previous === -1 || start >= blocks[previous].start) {
      previous = index;
    }
  }
  const anchor = active === -1 ? last : active;
  const from = anchor === last && previous !== -1 ? previous : anchor;
  const midpoint = index => blocks[index] ? blocks[index].top + blocks[index].height / 2 : SCROLLING_LINE_HEIGHT / 2;
  const elapsed = anchor === -1 ? 0 : position - blocks[anchor].start;
  const motion = 1 - (1 - clamp(elapsed / .32)) ** 3;
  const scroll = midpoint(from) + (midpoint(anchor) - midpoint(from)) * motion;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.8;
  for (const [index, block] of blocks.entries()) {
    const top = center + block.top - scroll;
    if (top + block.height < 0) continue;
    if (top > VIDEO_HEIGHT) break;
    const activeLine = index === active;
    const followsSyllables = activeLine && block.rows.some(row => row.marks.length);
    const opacity = activeLine ? (followsSyllables ? .76 : 1) : block.end !== null && block.end <= position ? .38 : .72;
    for (const [index, row] of block.rows.entries()) {
      const y = top + (index + .5) * SCROLLING_LINE_HEIGHT;
      const paint = () => { ctx.strokeText(row.text, left, y); ctx.fillText(row.text, left, y); };
      ctx.globalAlpha = opacity;
      paint();
      if (!followsSyllables) continue;
      ctx.save();
      ctx.beginPath();
      let visible = false;
      for (const mark of row.marks) {
        const progress = clamp((unitProgress(mark.unit, position) - mark.from) / (mark.to - mark.from));
        if (!(progress > 0)) continue;
        visible = true;
        ctx.rect(left + mark.left - .5, y - SCROLLING_LINE_HEIGHT / 2, (mark.right - mark.left) * progress + .5, SCROLLING_LINE_HEIGHT);
      }
      if (visible) { ctx.clip(); ctx.globalAlpha = 1; paint(); }
      ctx.restore();
    }
  }
}

// Identical frames in desktop preview and MP4.
export function drawKaraoke(ctx, lines, position, duration, { font = 'Arial', copyright = '', readingBarWidth = READING_BAR_WIDTH, artwork, mode = 'karaoke' } = {}) {
  ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = mode === 'scrolling' ? '#303635' : '#000'; ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  if (mode === 'scrolling') drawScrollingLyrics(ctx, lines, position, font, !!artwork);
  else drawTraditionalKaraoke(ctx, lines, position, duration, font, readingBarWidth);
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

function drawTraditionalKaraoke(ctx, lines, position, duration, font, readingBarWidth) {
  const windows = pairWindows(lines, duration);
  const state = sequenceState(windows, position);
  const activePair = windows.filter(window => window.first !== null && window.first <= position).at(-1) || windows[0];
  const section = activePair ? lines.slice(0, activePair.indices[0] + 1).reverse().find(line => line.blockStart)?.section : '';
  if (section && state.length) { ctx.fillStyle = '#aaa'; ctx.font = '26px Arial'; ctx.textAlign = 'center'; ctx.fillText(section, 960, 215, 1660); }
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
    ctx.globalAlpha = rowOpacity.get(unit.lineIndex) ?? 0;
    ctx.fillStyle = UPCOMING_TEXT_COLOR; ctx.fillText(unit.text, x, y);
    const progress = unitProgress(unit, position);
    if (progress > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - 1, y - fontSize, Math.max(0, width * progress + 1), fontSize * 2); ctx.clip();
      ctx.fillStyle = SUNG_TEXT_COLOR; ctx.fillText(unit.text, x, y); ctx.restore();
    }
  }
  const cursorWords = layouts.flatMap(({ window, units }) => units.map(unit => ({ ...unit, opacity: pairOpacity(window, position) })));
  for (const cursor of getReadingCursors(cursorWords, position)) {
    ctx.globalAlpha = cursor.opacity * READING_BAR_OPACITY; ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.roundRect(cursor.x - readingBarWidth / 2, cursor.y - cursor.fontSize * .58, readingBarWidth, cursor.fontSize * 1.16, readingBarWidth / 4);
    ctx.fill();
  }
}
