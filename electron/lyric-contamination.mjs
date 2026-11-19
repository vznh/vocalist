const recommendationHeading = /^you might also like$/i;
const sectionHeading = /^\[[^\]]+\]$/;
const recommendationEntries = 6;

// This copied recommendation widget has three title/artist pairs before the
// next lyric section. A lyric that merely contains the heading stays intact.
export function cleanReferenceLyrics(text = '', artist = '') {
  if (typeof text !== 'string') return { text, removedBlocks: [] };
  const rows = text.split(/\r?\n/);
  const removedBlocks = [];
  const cleaned = [];
  const header = rows.slice(0, 3).map(row => row.trim());
  const firstSection = rows.findIndex(row => sectionHeading.test(row.trim()));
  const hasSingerKey = firstSection >= 3 && typeof artist === 'string' && artist.trim() && header[0] && !sectionHeading.test(header[0])
    && header[1]?.toLowerCase() === `(${artist.trim().toLowerCase()})` && /^both$/i.test(header[2] || '')
    && rows.slice(3, firstSection).every(row => !row.trim());
  if (hasSingerKey) removedBlocks.push(header);
  for (let i = hasSingerKey ? firstSection : 0; i < rows.length; i++) {
    if (recommendationHeading.test(rows[i].trim())) {
      let next = i + 1;
      const entries = [];
      while (next < rows.length && entries.length <= recommendationEntries && !sectionHeading.test(rows[next].trim())) {
        const entry = rows[next++].trim();
        if (entry) entries.push(entry);
      }
      if (entries.length === recommendationEntries && next < rows.length && sectionHeading.test(rows[next].trim())) {
        removedBlocks.push([rows[i].trim(), ...entries]);
        i = next - 1;
        continue;
      }
    }
    cleaned.push(rows[i]);
  }
  return { text: removedBlocks.length ? cleaned.join('\n') : text, removedBlocks };
}

export function repairSavedLyricCopy(track) {
  let changed = false;
  const cleaned = track.lyrics && track.lyrics.source !== 'manual' ? cleanReferenceLyrics(track.lyrics.plainLyrics, track.lyrics.artist) : null;
  for (const candidate of track.candidates) {
    const candidateCopy = cleanReferenceLyrics(candidate?.plainLyrics, candidate?.artist);
    if (candidateCopy.removedBlocks.length) { candidate.plainLyrics = candidateCopy.text; changed = true; }
  }
  if (!cleaned?.removedBlocks.length) return changed;
  track.lyrics.plainLyrics = cleaned.text;
  if (track.result?.source !== 'database') return true;
  const lines = [...track.result.lines];
  for (const block of cleaned.removedBlocks) {
    const start = lines.findIndex((_, index) => block.every((text, offset) => lines[index + offset]?.text === text));
    if (start >= 0) lines.splice(start, block.length);
  }
  if (lines.length !== track.result.lines.length) {
    track.result = { ...track.result, lines, notes: ['Removed copied page labels from the reference lyrics. Timing on retained lines was kept.'] };
    if (track.steps.alignment.state === 'review') track.steps.alignment.message = 'Review the timing on the remaining lyric lines.';
  }
  return true;
}
