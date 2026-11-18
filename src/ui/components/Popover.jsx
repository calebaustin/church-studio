import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Every popover sits on top of the whole app and always stays inside the window, with this
// much room from each edge. If there isn't room below its button, it opens above.
export const EDGE = 12;
const GAP = 6;

/**
 * Floating glass panel anchored to its trigger (the element it sits next to in the markup).
 * Closes on outside click or Escape.
 */
export default function Popover({ open, onClose, children, align = 'left', width, className = '' }) {
  const marker = useRef(null);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const anchor = marker.current?.parentElement;
    const el = ref.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth; const vh = window.innerHeight;
    const w = Math.min(el.offsetWidth, vw - EDGE * 2);
    let left = align === 'right' ? a.right - w : a.left;
    left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
    const below = vh - a.bottom - GAP - EDGE;
    const above = a.top - GAP - EDGE;
    const h = el.scrollHeight;
    const up = h > below && above > below;
    const room = Math.max(120, up ? above : below);
    const top = up ? Math.max(EDGE, a.top - GAP - Math.min(h, room)) : a.bottom + GAP;
    setPos({ left, top, maxHeight: room });
  }, [align]);

  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[data-pop-trigger]')) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, onClose, place]);

  return (
    <>
      <span ref={marker} hidden />
      {open && createPortal(
        <div ref={ref} className={`pop ${className}`} role="dialog"
          style={{ ...(width ? { width } : null), left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }}>
          {children}
        </div>,
        document.body,
      )}
    </>
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
