import { useEffect, useState } from 'react';
import type { LyricLine, Track } from '../types';
import { DEFAULT_FONT, fonts, unitsFor, type LyricsMode } from '../../shared/karaoke.mjs';
import { reflowLyrics } from '../../shared/lyrics.mjs';
import { api, errorText } from '../api';
import { KaraokePreview } from './KaraokePreview';

export function TimingEditor({ track, mode, duration, canSeek, position, playing, play, seek, dirtyChanged }: { track: Track; mode: LyricsMode; duration: number; canSeek: boolean; position: number; playing: boolean; play: () => void; seek: (position: number) => void; dirtyChanged: (dirty: boolean) => void }) {
  const [lines, setLines] = useState<LyricLine[]>(() => structuredClone(track.result?.lines || []));
  const [index, setIndex] = useState(0), [font, setFont] = useState(track.font || DEFAULT_FONT);
  const [text, setText] = useState(''), [pasteText, setPasteText] = useState(''), [split, setSplit] = useState(''), [splitIndex, setSplitIndex] = useState<number | null>(null);
  const [tapIndex, setTapIndex] = useState(0);
  const [layoutText, setLayoutText] = useState(() => (track.result?.lines || []).map((line, i) => `${line.blockStart && i ? '\n' : ''}${line.section ? `[${line.section}]\n` : ''}${line.text}`).join('\n'));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(track.reviewed), [dirty, setDirty] = useState(false);
  useEffect(() => { dirtyChanged(dirty); }, [dirty, dirtyChanged]);
  const line = lines[index];
  const update = (change: (lines: LyricLine[]) => void) => {
    setLines(previous => { const next = structuredClone(previous); change(next); return next; });
    setDirty(true); setReviewed(false); setMessage('');
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const save = async () => { await api!.saveTiming(track.id, { lines, font, reviewed }); setDirty(false); setMessage('Timing saved for playback and MP4 export.'); };
  const reload = async () => {
    const current = (await api!.snapshot()).find(row => row.id === track.id);
    if (current) { setLines(structuredClone(current.result?.lines || [])); setFont(current.font); setReviewed(current.reviewed); setIndex(0); setDirty(false); }
  };
  const setTime = (unit: number, field: 'start' | 'end', value: number | null) => update(rows => { rows[index].words![unit][field] = value; const words = rows[index].words!; rows[index].start = words.every(word => word.start !== null && word.end !== null) ? words[0].start : null; rows[index].end = words.every(word => word.start !== null && word.end !== null) ? words.at(-1)!.end : null; });
  const tap = () => {
    const words = line?.words || [];
    if (!words.length || tapIndex > words.length) return;
    const stamp = Math.round(position * 100) / 100, finishing = tapIndex === words.length;
    update(rows => { const units = rows[index].words!; if (tapIndex > 0) units[tapIndex - 1].end = stamp; if (tapIndex < units.length) units[tapIndex].start = stamp; rows[index].start = units[0].start; rows[index].end = units.at(-1)!.end; });
    // The final tap closes the line, so review moves straight to the next one.
    if (finishing && index < lines.length - 1) { setIndex(index + 1); setTapIndex(0); return; }
    setTapIndex(tapIndex + 1);
  };
  useEffect(() => { setTapIndex(0); }, [index]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (event.key === ' ') { event.preventDefault(); play(); }
      else if (event.key.toLowerCase() === 't') { event.preventDefault(); tap(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [position, index, tapIndex, lines, playing]);
  const splitUnit = () => {
    const parts = split.split('|');
    if (splitIndex === null || parts.length < 2 || parts.some(part => !part.trim())) { setError('Separate syllables with |, for example a|way.'); return; }
    const unit = line.words![splitIndex], trailing = unit.text.match(/\s*$/)?.[0] || '';
    if (parts.join('') !== unit.text.trimEnd()) { setError('The syllables must reproduce this word without changing its spelling.'); return; }
    update(rows => {
      rows[index].words!.splice(splitIndex, 1, ...parts.map((part, i) => ({ text: part + (i === parts.length - 1 ? trailing : ''), start: unit.start === null || unit.end === null ? null : unit.start + i * (unit.end - unit.start) / parts.length, end: unit.start === null || unit.end === null ? null : unit.start + (i + 1) * (unit.end - unit.start) / parts.length })));
    });
    setSplitIndex(null); setMessage('Split created. Adjust the estimated syllable boundaries while listening.');
  };
  const draft = { ...track, font, result: { source: 'manual', timing: 'manual', agreement: track.result?.agreement ?? null, notes: [], lines } };
  const words = line?.words || [];
  const tapLabel = tapIndex === 0 ? 'Tap first word' : tapIndex >= words.length ? 'Tap last end' : `Tap “${words[tapIndex]?.text.trim() ?? ''}”`;
  return <div className="timing-editor">
    <div className="timing-playback">
      <button className="timing-play" onClick={play}>{playing ? 'Pause' : 'Play'}</button>
      <input aria-label="Reviewer playback position" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(position, duration || 1)} disabled={!canSeek} onChange={event => seek(Number(event.target.value))} />
      <output>{position.toFixed(2)} s</output>
      <button className="primary" disabled={busy || !lines.length} onClick={() => void run(save)}>Save timing</button>
    </div>
    <KaraokePreview track={draft} position={position} mode={mode} />
    {lines.length > 0 ? <>
      <div className="timing-linebar">
        <button className="icon-button" aria-label="Previous lyric line" disabled={index === 0} onClick={() => { setIndex(index - 1); setSplitIndex(null); }}>‹</button>
        <select aria-label="Lyric line" value={index} onChange={event => { setIndex(Number(event.target.value)); setSplitIndex(null); }}>{lines.map((line, i) => <option key={i} value={i}>{i + 1}. {line.text}</option>)}</select>
        <button className="icon-button" aria-label="Next lyric line" disabled={index >= lines.length - 1} onClick={() => { setIndex(index + 1); setSplitIndex(null); }}>›</button>
        <button onClick={() => line.start !== null && seek(line.start)} disabled={line.start === null}>Seek to line</button>
      </div>
      <div className="tap-panel">
        <ol className="tap-words">{words.map((unit, j) => <li key={j} className={`tap-word ${unit.start !== null ? 'done' : ''} ${j === tapIndex ? 'current' : ''}`}><span>{unit.text.trim() || unit.text}</span><small>{unit.start === null ? '—' : unit.start.toFixed(2)}{unit.end === null ? '' : ` – ${unit.end.toFixed(2)}`}</small></li>)}</ol>
        <div className="tap-actions">
          <button className="tap-button" disabled={tapIndex > words.length} onClick={tap}>{tapLabel}<kbd>T</kbd></button>
          <button className="text-button" disabled={tapIndex === 0} onClick={() => setTapIndex(0)}>Restart taps</button>
        </div>
        <p className="tap-hint">Play the song and tap <kbd>T</kbd> as each word begins. The last tap ends the final word and moves to the next line.</p>
      </div>
      <details className="timing-numbers"><summary>Fine-tune numbers</summary>
        <table className="timing-table"><thead><tr><th>Word / syllable</th><th>Start</th><th>End</th><th /></tr></thead><tbody>{words.map((unit, j) => <tr key={j}><td>{unit.text}</td>{(['start', 'end'] as const).map(field => <td key={field}><input aria-label={`${field === 'start' ? 'Start' : 'End'} of unit ${j + 1}`} type="number" min="0" max={track.duration} step="0.01" value={unit[field] ?? ''} onChange={event => setTime(j, field, event.target.value === '' ? null : Number(event.target.value))} /><button aria-label={`Mark ${field} of unit ${j + 1} at playback position`} onClick={() => setTime(j, field, Math.round(position * 100) / 100)}>Now</button></td>)}<td><button onClick={() => { setSplitIndex(j); setSplit(unit.text.trimEnd()); }}>Split syllables</button></td></tr>)}</tbody></table>
      </details>
      {splitIndex !== null && <div className="timing-toolbar"><input aria-label="Syllable split" value={split} onChange={event => setSplit(event.target.value)} placeholder="a|way" /><button onClick={splitUnit}>Apply split</button><button onClick={() => setSplitIndex(null)}>Cancel split</button></div>}
      <div className="timing-meta">
        <label><input type="checkbox" checked={Boolean(line.blockStart)} disabled={index === 0} onChange={event => update(rows => { rows[index].blockStart = event.target.checked; })} /> Begin a new stanza here</label>
        {line.blockStart && <label className="field"><span>Section name <small>optional</small></span><input aria-label="Section name" value={line.section || ''} maxLength={200} onChange={event => update(rows => { rows[index].section = event.target.value; })} /></label>}
        <details><summary>Change this line’s wording</summary><input aria-label="Replacement line text" value={text} onChange={event => setText(event.target.value)} placeholder={line.text} maxLength={500} /><button disabled={!text.trim()} onClick={() => { update(rows => { rows[index] = { ...rows[index], text: text.trim(), words: unitsFor(text.trim()), start: null, end: null, review: true }; }); setText(''); }}>Replace line and clear its timing</button></details>
      </div>
    </> : <p className="save-message">Add lyrics before setting timing.</p>}
    <details className="timing-font"><summary>Font and layout</summary>
      <label className="field"><span>Font</span><select aria-label="Video font" value={font} onChange={event => { setFont(event.target.value); setDirty(true); setReviewed(false); }}>{fonts.map(option => <option key={option.name} value={option.name}>{option.name} — {option.description}</option>)}</select></label>
    </details>
    <details className="paste-lyrics"><summary>Edit line and verse layout</summary><p>Keep the same words. Add line breaks, blank lines between verses, or headings such as [Chorus]. Word and syllable timings are preserved.</p><textarea aria-label="Line and verse layout" rows={10} value={layoutText} onChange={event => setLayoutText(event.target.value)} /><button disabled={busy || !layoutText.trim()} onClick={() => { setError(''); try { const next = reflowLyrics(lines, layoutText); setLines(next); setIndex(0); setDirty(true); setReviewed(false); setMessage('Line and verse layout updated. Save timing to apply it to playback and export.'); } catch (error) { setError(errorText(error)); } }}>Apply verse layout</button><button onClick={() => setLayoutText(lines.map((line, i) => `${line.blockStart && i ? '\n' : ''}${line.section ? `[${line.section}]\n` : ''}${line.text}`).join('\n'))}>Load current layout</button></details>
    <details className="paste-lyrics"><summary>Paste or replace complete lyrics</summary><textarea aria-label="Complete English lyrics" value={pasteText} onChange={event => setPasteText(event.target.value)} rows={8} placeholder="Paste English lyrics. Preserve blank lines between verses and choruses." /><button disabled={busy || !pasteText.trim()} onClick={() => void run(async () => { await api!.replaceLyrics(track.id, pasteText); await reload(); setPasteText(''); setMessage('Lyrics replaced. Align them or set timing manually.'); })}>Replace all lyrics</button></details>
    <div className="timing-footer">
      <label><input type="checkbox" checked={reviewed} onChange={event => { setReviewed(event.target.checked); setDirty(true); }} /> I reviewed these timings</label>
      {dirty && <span className="timing-dirty">Unsaved</span>}
      <details className="timing-more"><summary>More</summary>
        <div className="timing-toolbar"><button disabled={busy || dirty || !lines.length || track.demo} onClick={() => void run(async () => { await api!.align(track.id); await reload(); setMessage('Alignment finished. Check its status in Cross-check.'); })}>Align lyrics with ElevenLabs</button><button disabled={busy || dirty} onClick={() => void run(async () => { const file = await api!.saveProject(track.id); if (file) setMessage('Timing project saved. Queue the same recording and load this file to resume later.'); })}>Save project file</button><button disabled={busy || dirty} onClick={() => void run(async () => { if (await api!.loadProject(track.id)) { await reload(); setMessage('Timing project loaded.'); } })}>Load project file</button></div>
      </details>
    </div>
    {dirty && <p className="save-message">Unsaved changes — save timing before aligning or saving a project file.</p>}
    {message && <p role="status" className="save-message">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
