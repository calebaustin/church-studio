import { useEffect, useRef } from 'react';

/** Floating glass panel anchored under its trigger. Closes on outside click or Escape. */
export default function Popover({ open, onClose, children, align = 'left', width, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[data-pop-trigger]')) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`pop ${align === 'right' ? 'right' : ''} ${className}`} style={width ? { width } : undefined} role="dialog">
      {children}
    </div>
  );
}

/** A list of choices inside a Popover. */
export function PopList({ items, onPick, empty = 'Nothing to suggest yet.' }) {
  if (!items?.length) return <div className="pop-empty">{empty}</div>;
  return (
    <div className="pop-list">
      {items.map((it, k) => (
        <button key={k} type="button" className="pop-item" onClick={() => onPick(it.value ?? it)}>
          {it.label ?? it}
          {it.hint && <span className="pop-hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
