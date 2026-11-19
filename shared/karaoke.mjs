import { getReadingCursors, READING_BAR_OPACITY, READING_BAR_WIDTH, SUNG_TEXT_COLOR, UPCOMING_TEXT_COLOR } from './reading-cursor.mjs';
import { pairWindows, pairOpacity, sequenceState, clamp, lineTiming } from './lyric-sequence.mjs';
export { FADE_SECONDS, clamp, hasCompleteWordTiming, lineTiming, lyricPairs, frameState } from './lyric-sequence.mjs';


export const ARTIST_COLORS = [
  { id: "red-maho", name: "Red Maho", hex: "#5F363C" },
  { id: "burnt-orange", name: "Burnt Orange", hex: "#B84F05" },
  { id: "forest-biome", name: "Forest Biome", hex: "#1A4A46" },
];

export function speakerColorMap(lines = []) {
  const map = new Map();
  for (const line of lines) {
    for (const word of line.words || []) {
      if (typeof word?.speaker_id === "string" && word.speaker_id && !map.has(word.speaker_id)) {
        map.set(word.speaker_id, ARTIST_COLORS[map.size % ARTIST_COLORS.length].hex);
        if (map.size >= ARTIST_COLORS.length) return map;
      }
    }
  }
  return map;
}

const albumPaletteCache = new WeakMap();
export function extractAlbumColors(ctx, artwork) {
  if (!artwork || typeof artwork !== "object") return null;
  if (albumPaletteCache.has(artwork)) return albumPaletteCache.get(artwork);
  try {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(artwork, 0, 0, 24, 24);
    const { data } = ctx.getImageData(0, 0, 24, 24);
    ctx.restore();
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, score: 0 };
      const weight = 1 + sat * 2 - (lum > 0.9 || lum < 0.08 ? 0.6 : 0);
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
      entry.score += Math.max(0.2, weight);
      buckets.set(key, entry);
    }
    const sorted = [...buckets.values()].sort((a, b) => b.score - a.score);
    if (!sorted.length) { albumPaletteCache.set(artwork, null); return null; }
    const toHex = (e) => {
      const r = Math.round((e.r / e.count) * 0.45);
      const g = Math.round((e.g / e.count) * 0.45);
      const b = Math.round((e.b / e.count) * 0.45);
      return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
    };
    const primary = toHex(sorted[0]);
    const secondary = sorted.length > 1 ? toHex(sorted[1]) : primary;
    const palette = [primary, secondary];
    albumPaletteCache.set(artwork, palette);
    return palette;
  } catch {
    albumPaletteCache.set(artwork, null);
    return null;
  }
}


export function lerpHexColor(a, b, t) {
  const parse = hex => [1, 3, 5].map(i => parseInt((/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#303635').slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a), [r2, g2, b2] = parse(b);
  const u = clamp(t);
  return `#${[r1 + (r2 - r1) * u, g1 + (g2 - g1) * u, b1 + (b2 - b1) * u].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function mixHexColors(hexes = []) {
  const valid = hexes.filter(h => /^#[0-9a-f]{6}$/i.test(h));
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  let r = 0, g = 0, b = 0;
  for (const h of valid) {
    r += parseInt(h.slice(1, 3), 16);
    g += parseInt(h.slice(3, 5), 16);
    b += parseInt(h.slice(5, 7), 16);
  }
  const n = valid.length;
  return `#${[r / n, g / n, b / n].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function isLightHex(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55;
}

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

// Schengen is the house face; the rest stay as fallbacks when it is unavailable.
export const DEFAULT_FONT = 'ABC Schengen A Trial';
export const fonts = [
  { name: 'ABC Schengen A Trial', description: 'Tight geometric sans with a wide stance' },
  { name: 'Arial', description: 'Neutral, familiar letterforms' },
  { name: 'Verdana', description: 'Wide letters and generous spacing' },
  { name: 'Trebuchet MS', description: 'Rounded letters with distinct shapes' },
];
export const unitsFor = text => (text.match(/\S+\s*/g) || []).map(text => ({ text, start: null, end: null }));
// Presentation only: reference lyrics and their alignment tokens stay intact.
export const displayLyricText = text => {
  const cleaned = text.replace(/[.\u2026]/g, '');
  return cleaned.replace(/\s*\(([^)]+)\)/g, (match, inner, offset, full) => {
    const before = full.slice(0, offset).trim().toLowerCase();
    const candidate = inner.trim().toLowerCase();
    return candidate && before.endsWith(candidate) ? '' : match;
  });
};
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

// Every line whose span covers the playhead sings, so overlapping verses highlight together.
export function scrollingState(blocks, position) {
  const singing = new Set();
  let active = -1, last = -1, previous = -1;
  for (const [index, { start, end }] of blocks.entries()) {
    if (start === null || start > position) continue;
    const isSinging = end !== null && position < end;
    if (isSinging) singing.add(index);
    if (isSinging && (active === -1 || start >= blocks[active].start)) active = index;
    if (last === -1 || start >= blocks[last].start) {
      previous = last;
      last = index;
    } else if (previous === -1 || start >= blocks[previous].start) {
      previous = index;
    }
  }
  const anchor = active === -1 ? last : active;
  return { singing, anchor, from: anchor === last && previous !== -1 ? previous : anchor };
}

function drawScrollingLyrics(ctx, lines, position, font, hasArtwork, albumColors = null, lyricsOpacity = 1) {
  if (lyricsOpacity <= 0) return;
  const baseTextColor = albumColors && isLightHex(albumColors[0]) && isLightHex(albumColors[1]) ? '#000' : '#fff';
  const speakerColors = speakerColorMap(lines);
  const center = 490;
  const left = 128;
  const ARTWORK_COLUMN = 264;
  const right = hasArtwork ? VIDEO_WIDTH - ARTWORK_COLUMN : VIDEO_WIDTH - left;
  const width = right - left;
  // The cover owns the lower-right corner, so reserve that column for every row.
  ctx.font = `400 80px "${font}"`;
  const blocks = scrollingLayout(ctx, lines, font, width);
  const { singing, anchor, from } = scrollingState(blocks, position);
  const midpoint = index => blocks[index] ? blocks[index].top + blocks[index].height / 2 : SCROLLING_LINE_HEIGHT / 2;
  const elapsed = anchor === -1 ? 0 : position - blocks[anchor].start;
  const motion = 1 - (1 - clamp(elapsed / .32)) ** 3;
  const scroll = midpoint(from) + (midpoint(anchor) - midpoint(from)) * motion;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = baseTextColor;
  ctx.strokeStyle = baseTextColor;
  ctx.lineWidth = 0.8;
  for (const [index, block] of blocks.entries()) {
    const top = center + block.top - scroll;
    if (top + block.height < 0) continue;
    if (top > VIDEO_HEIGHT) break;
    const activeLine = singing.has(index);
    const followsSyllables = activeLine && block.rows.some(row => row.marks.length);
    const opacity = activeLine ? (followsSyllables ? .76 : 1) : block.end !== null && block.end <= position ? .38 : .72;
    for (const [index, row] of block.rows.entries()) {
      const y = top + (index + .5) * SCROLLING_LINE_HEIGHT;
      const paint = () => { ctx.strokeText(row.text, left, y); ctx.fillText(row.text, left, y); };
      ctx.globalAlpha = opacity * lyricsOpacity;
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
      if (visible) { ctx.clip(); ctx.globalAlpha = lyricsOpacity; const markColors = [...new Set(row.marks.map(m => speakerColors.get(m.unit?.speaker_id)).filter(Boolean))]; const speakerColor = block.line?.color || (markColors.length > 1 ? mixHexColors(markColors) : markColors[0]) || SUNG_TEXT_COLOR; ctx.fillStyle = speakerColor; ctx.strokeStyle = speakerColor; paint(); ctx.fillStyle = baseTextColor; ctx.strokeStyle = baseTextColor; }
      ctx.restore();
    }
  }
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
