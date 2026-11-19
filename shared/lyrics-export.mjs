const stamp = (seconds, sep) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return sep === ',' ? `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0').replace('.', ',')}` : `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
};

function timedLines(lines = []) {
  return lines.filter(line => line.start !== null && line.end !== null && line.end > line.start);
}

export function toLrc(lines = [], { title = '', artist = '' } = {}) {
  const rows = timedLines(lines).map(line => `[${stamp(line.start, ':')}]${line.text}`);
  const meta = [title && `[ti:${title}]`, artist && `[ar:${artist}]`].filter(Boolean);
  return `${[...meta, ...rows].join('\n')}\n`;
}

export function toSrt(lines = []) {
  return `${timedLines(lines).map((line, index) => `${index + 1}\n${stamp(line.start, ',')} --> ${stamp(line.end, ',')}\n${line.text}`).join('\n\n')}\n`;
}
