import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Bell, CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react';

const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };

/**
 * Notifications you might have missed, as a stack of cards like a wallet. Flip through them, act on
 * one, or dismiss them all. The button only shows when there is something to show.
 */
export function NotificationsButton({ items, onOpen }) {
  if (!items.length) return null;
  const unread = items.filter((n) => !n.read).length;
  return (
    <button onClick={onOpen} aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}>
      <Bell size={18} aria-hidden="true" /><span className="grow">Notifications</span>
      {unread > 0 && <span className="badge">{unread}</span>}
    </button>
  );
}

export default function NotificationsWallet({ items, onClose, onDismiss, onDismissAll }) {
  const [i, setI] = useState(0);
  const ref = useRef(null);
  useEffect(() => { if (i >= items.length) setI(Math.max(0, items.length - 1)); }, [items.length]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((n) => Math.min(items.length - 1, n + 1)); if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1)); };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', key);
    setTimeout(() => document.addEventListener('mousedown', down), 0);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [items.length]);
  if (!items.length) return null;
  return createPortal(
    <div className="wallet" ref={ref} role="dialog" aria-label="Notifications">
      <div className="wallet-stack">
        {items.map((n, k) => {
          const off = k - i;
          if (off < 0 || off > 3) return null;
          const Icon = n.kind === 'error' ? AlertCircle : CheckCircle2;
          return (
            <div key={n.id} className={`wallet-card glass strong ${off === 0 ? 'top' : ''}`} style={{ '--off': off, zIndex: 10 - off }} onClick={() => off > 0 && setI(k)}>
              <div className="row between" style={{ gap: 8 }}>
                <span className="row small muted" style={{ gap: 6 }}><Icon size={14} style={{ color: n.kind === 'error' ? 'var(--bad)' : 'var(--ok)' }} />{ago(n.at)}</span>
                <button className="rt-btn" aria-label="Dismiss" title="Dismiss" onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}><X size={14} /></button>
              </div>
              <strong className="wallet-text">{n.text}</strong>
              {n.action && <button className="btn sm accent" onClick={(e) => { e.stopPropagation(); n.action.run(); onClose(); }}>{n.action.label}</button>}
            </div>
          );
        })}
      </div>
      <div className="wallet-bar">
        <button className="btn icon sm" aria-label="Newer" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={15} /></button>
        <span className="small muted num">{i + 1} of {items.length}</span>
        <button className="btn icon sm" aria-label="Older" disabled={i >= items.length - 1} onClick={() => setI(i + 1)}><ChevronRight size={15} /></button>
        <button className="btn sm ghost" onClick={onDismissAll}>Dismiss all</button>
      </div>
    </div>,
    document.body,
  );
}
