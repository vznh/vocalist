import { SUNG_TEXT_COLOR } from './reading-cursor.mjs';
import { clamp, lineTiming } from './lyric-sequence.mjs';
import { speakerColorMap, mixHexColors, isLightHex } from './colors.mjs';
import { VIDEO_WIDTH, VIDEO_HEIGHT, displayLyricText, unitProgress } from './karaoke-common.mjs';

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

export function drawScrollingLyrics(ctx, lines, position, font, hasArtwork, albumColors = null, lyricsOpacity = 1) {
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
