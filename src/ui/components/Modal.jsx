import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

/** Title, and an optional line under it. Every modal has its own close button in the corner. */
export function ModalHead({ title, sub }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <h2>{title}</h2>
      {sub && <p className="muted small" style={{ margin: 0 }}>{sub}</p>}
    </div>
  );
}

/** Modal with scrim: closes on Escape and scrim click, keeps focus inside, restores it after. */
/**
 * footer: actions that stay put at the bottom while the body scrolls under them.
 */
export default function Modal({ onClose, children, width, label, footer }) {
  const panel = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const first = panel.current?.querySelector('input, textarea, select, button');
    first?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll('a[href], button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const [a, z] = [items[0], items.at(-1)];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); opener?.focus?.({ preventScroll: true }); };
  }, []);
  // Always on top of the whole app, whatever panel opened it.
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="glass strong modal framed" role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
        <button type="button" className="modal-x" aria-label="Close" title="Close (Esc)" onClick={onClose}><X size={16} /></button>
        <div className="modal-body stack">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
