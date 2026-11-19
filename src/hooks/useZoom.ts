import { useEffect, useRef, useState } from 'react';

export function useZoom() {
  const [zoom, setZoom] = useState(1);
  const [zoomHud, setZoomHud] = useState(false);
  const zoomTimer = useRef<number | undefined>(undefined);
  const updateZoom = (next: number) => {
    const clamped = Math.min(2, Math.max(0.5, Math.round(next * 10) / 10));
    setZoom(clamped);
    setZoomHud(true);
    window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => setZoomHud(false), 2000);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); updateZoom(zoom + 0.1); }
      else if (event.key === '-') { event.preventDefault(); updateZoom(zoom - 0.1); }
      else if (event.key === '0') { event.preventDefault(); updateZoom(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoom]);
  const holdZoomHud = () => window.clearTimeout(zoomTimer.current);
  const releaseZoomHud = () => { zoomTimer.current = window.setTimeout(() => setZoomHud(false), 1200); };
  return { zoom, zoomHud, updateZoom, holdZoomHud, releaseZoomHud };
}
