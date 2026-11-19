import { clamp } from './lyric-sequence.mjs';

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

// A small positive offset lets the voice land before the highlight moves.
export const DEFAULT_SYNC = .15;
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
