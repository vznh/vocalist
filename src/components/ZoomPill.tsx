type Props = { zoom: number; update: (zoom: number) => void; hold: () => void; release: () => void };

export function ZoomPill({ zoom, update, hold, release }: Props) {
  return <div className="zoom-pill" style={{ zoom: 1 / zoom }} role="status" aria-label="Zoom level" onMouseEnter={hold} onMouseLeave={release}>
    <strong>{Math.round(zoom * 100)}%</strong>
    <button type="button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => update(zoom - 0.1)}>−</button>
    <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => update(zoom + 0.1)}>+</button>
    <span className="zoom-divider" aria-hidden="true" />
    <button type="button" className="zoom-reset" disabled={zoom === 1} onClick={() => update(1)}>Reset</button>
  </div>;
}
