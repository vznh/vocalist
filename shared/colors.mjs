import { clamp } from './lyric-sequence.mjs';

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

export function isLightHex(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55;
}
