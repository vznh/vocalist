import { youtubeUrl } from './source-url.mjs';

const featured = /(?:^|[\s(\[])feat(?:uring|\.)?\s+([^\])]+)/i;
const primary = value => value?.split(featured)[0].replace(/[\s([]+$/, '').trim() || '';

export function primaryArtistFor(track) {
  if (track.primaryArtist || track.overrides?.artist) return primary(track.primaryArtist || track.overrides.artist);
  const artist = primary(track.artist);
  try { youtubeUrl(track.url); } catch { return artist; }
  const credited = primary(track.lyrics?.artist);
  if (credited && artist.startsWith(`${credited},`)) return credited;
  return artist.split(/,\s+/)[0];
}

export function featuredArtistFor(track) {
  if (track.featuredArtist) return track.featuredArtist;
  for (const value of [track.originalMetadata?.title, track.title, track.artist]) {
    const name = value?.match(featured)?.[1].trim();
    if (name) return name;
  }
  return '';
}

export function sourcePrimaryArtist(info, track, url, overrides = {}) {
  if (overrides.artist?.trim()) return primary(overrides.artist);
  const first = Array.isArray(info.artists) && info.artists.find(value => typeof value === 'string' && value.trim());
  return first ? primary(first) : primaryArtistFor({ artist: track.artist, url });
}
