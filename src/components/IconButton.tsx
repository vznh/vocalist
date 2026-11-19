import type { ReactNode } from 'react';

export function IconButton({ label, children, onClick, disabled = false }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} className="icon-button" onClick={onClick} disabled={disabled}>{children}</button>;
}
