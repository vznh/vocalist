import { useRef, useState } from 'react';
import { Check } from 'lucide-react';

type MenuItem = { id: string; label: string; hint?: string; checked?: boolean; disabled?: boolean; onSelect: () => void };

type Props = { label: string; title?: string; disabled?: boolean; groups: { name?: string; items: MenuItem[] }[]; className?: string };

export function MenuButton({ label, title, disabled = false, groups, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  return <div className={`menu-control ${className}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" className="text-button" aria-expanded={open && !disabled} aria-haspopup="menu" disabled={disabled}
      title={title || label} onClick={() => setOpen(!open)}>{label}</button>
    {open && !disabled && <div className="track-menu menu-options" role="menu" aria-label={label}>
      {groups.map(group => <div className="menu-group" key={group.name || 'items'} role="group" aria-label={group.name}>
        {group.name && <p className="menu-group-label">{group.name}</p>}
        {group.items.map(item => <button type="button" role="menuitemradio" key={item.id} aria-checked={item.checked} disabled={item.disabled}
          onClick={() => { item.onSelect(); close(); }}>
          <span className="menu-copy">{item.label}{item.hint && <small>{item.hint}</small>}</span>
          {item.checked && <Check size={14} aria-hidden="true" />}
        </button>)}
      </div>)}
    </div>}
  </div>;
}
