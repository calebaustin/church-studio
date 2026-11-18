import { useEffect, useRef } from 'react';

/** Modal with scrim: closes on Escape and scrim click, keeps focus inside, restores it after. */
export default function Modal({ onClose, children, width, label }) {
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
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="glass strong modal stack" role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
        {children}
      </div>
    </div>
  );
}
