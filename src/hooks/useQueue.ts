import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dependency, Track } from '../types';
import { groupTranscriptLines } from '../../shared/lyrics.mjs';
import { api, errorText } from '../api';

export function useQueue(setError: (message: string) => void) {
  const [rawTracks, setTracks] = useState<Track[]>([]);
  // Reformat already-queued word transcripts after a renderer update as well.
  const tracks = useMemo(() => rawTracks.map(track => track.result?.source === 'transcript' && track.result.timing === 'transcript' ? { ...track, result: { ...track.result, lines: groupTranscriptLines(track.transcript) } } : track), [rawTracks]);
  const appliedLayouts = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);

  useEffect(() => {
    if (!api) return;
    let disposed = false;
    const update = (next: Track[]) => {
      if (disposed) return;
      setTracks(next);
      setSelectedId(current => next.some(track => track.id === current) ? current : next[0]?.id || null);
    };
    const unsubscribe = api.onChange(update);
    const unsubscribeStorage = api.onStorageError?.(message => setError(message));
    api.snapshot().then(update).catch(error => setError(errorText(error)));
    api.check().then(next => { if (!disposed) setDependencies(next); }).catch(error => setError(errorText(error)));
    return () => { disposed = true; unsubscribe(); unsubscribeStorage?.(); };
  }, []);
  useEffect(() => {
    // Persist the requested reflow for legacy queued tracks so export uses it too.
    if (!api) return;
    for (const track of tracks) {
      const original = rawTracks.find(row => row.id === track.id);
      if (!track.audioUrl || !track.result || !original?.result || track.result.source !== 'transcript' || track.result.timing !== 'transcript') continue;
      if (!['ready', 'review'].includes(track.status) || ['running', 'waiting'].includes(track.steps.alignment.state) || appliedLayouts.current.has(track.id)) continue;
      if (track.result.lines.length === original.result.lines.length && track.result.lines.every((line, i) => line.text === original.result!.lines[i].text)) continue;
      appliedLayouts.current.add(track.id);
      void api.saveTiming(track.id, { lines: track.result.lines, font: track.font, reviewed: false }).catch(error => setError(errorText(error)));
    }
  }, [tracks, rawTracks]);

  return { tracks, selectedId, setSelectedId, dependencies, setDependencies };
}
