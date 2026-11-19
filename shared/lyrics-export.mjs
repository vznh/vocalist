const stamp = (seconds, sep) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return sep === ',' ? `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0').replace('.', ',')}` : `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
};

// A sync offset moves lyric files with the preview so every export agrees.
function timedLines(lines = [], shift = 0) {
  const offset = Number.isFinite(shift) ? shift : 0;
  return lines.filter(line => line.start !== null && line.end !== null && line.end > line.start)
    .map(line => ({ ...line, start: Math.max(0, line.start + offset), end: Math.max(0, line.end + offset) }))
    .filter(line => line.end > line.start);
}

export function toLrc(lines = [], { title = '', artist = '', shift = 0 } = {}) {
  const rows = timedLines(lines, shift).map(line => `[${stamp(line.start, ':')}]${line.text}`);
  const meta = [title && `[ti:${title}]`, artist && `[ar:${artist}]`].filter(Boolean);
  return `${[...meta, ...rows].join('\n')}\n`;
}

export function toSrt(lines = [], { shift = 0 } = {}) {
  return `${timedLines(lines, shift).map((line, index) => `${index + 1}\n${stamp(line.start, ',')} --> ${stamp(line.end, ',')}\n${line.text}`).join('\n\n')}\n`;
}
