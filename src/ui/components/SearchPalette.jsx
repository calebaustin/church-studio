// Search everything, from anywhere: press ⌘K. Plain phrases work, like "sermons about prayer from
// last fall" or "flyers from October".
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clapperboard, FileText, Image as ImageIcon, Megaphone, Search, Send, Shapes, Video, ExternalLink } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, fmt, openLink } from '../api.js';

const TYPE = {
  sermon: ['Sermons and videos', Video], clip: ['Clips', Clapperboard], writing: ['Writing', FileText], design: ['Designs', Shapes],
  post: ['Posts', Send], campaign: ['Campaigns', Megaphone], photo: ['Brand library', ImageIcon], event: ['Church events', CalendarDays],
};
const EXAMPLES = ['sermons about prayer', 'clips on hope this year', 'flyers from October', 'posts last month', 'photos of kids'];

export default function SearchPalette({ onClose }) {
  const { go } = useApp();
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (!q.trim()) { setData(null); return undefined; }
    setBusy(true);
    const t = setTimeout(() => api.get(`/api/search?q=${encodeURIComponent(q)}`).then((r) => { setData(r); setSel(0); }).catch(() => {}).finally(() => setBusy(false)), 180);
    return () => clearTimeout(t);
  }, [q]);
  const flat = data?.results || [];
  const groups = useMemo(() => {
    const m = new Map();
    flat.forEach((r, i) => { if (!m.has(r.type)) m.set(r.type, []); m.get(r.type).push({ ...r, i }); });
    return [...m.entries()];
  }, [data]);
  const open = (r) => {
    onClose();
    if (r.link) return openLink(r.link);
    if (r.type === 'sermon' && r.at != null) return go({ ...r.go, step: 'text' });
    if (r.go) go(r.go);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((n) => Math.min(flat.length - 1, n + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((n) => Math.max(0, n - 1)); }
    else if (e.key === 'Enter' && flat[sel]) { e.preventDefault(); open(flat[sel]); }
  };
  useEffect(() => { document.querySelector(`[data-sr="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const qd = data?.query;
  return createPortal(
    <div className="scrim search-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass strong search-pal" role="dialog" aria-modal="true" aria-label="Search everything" onKeyDown={onKey}>
        <label className="search-pal-input">
          <Search size={18} />
          <input ref={input} value={q} placeholder="Search sermons, clips, writing, designs, posts…" onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <kbd>esc</kbd>
        </label>
        {qd && (qd.kinds.length || qd.label) ? (
          <div className="search-read small muted">
            Looking in {qd.kinds.length ? qd.kinds.map((k) => TYPE[k]?.[0].toLowerCase()).join(', ') : 'everything'}{qd.label ? ` from ${qd.label}` : ''}{qd.terms.length ? ` for “${qd.terms.join(' ')}”` : ''}
          </div>
        ) : null}
        <div className="search-results">
          {!q.trim() && (
            <div className="stack" style={{ gap: 8, padding: 14 }}>
              <span className="muted small">Try plain words. Search reads the kind of thing, when, and what it’s about, and finds what was said inside sermons too.</span>
              <div className="row wrap" style={{ gap: 6 }}>{EXAMPLES.map((x) => <button key={x} className="pill-choice" onClick={() => setQ(x)}>{x}</button>)}</div>
            </div>
          )}
          {q.trim() && data && !flat.length && !busy && <div className="muted small" style={{ padding: 14 }}>Nothing found. Try fewer words, or a different time.</div>}
          {groups.map(([type, list]) => {
            const [label, Icon] = TYPE[type] || ['Results', Search];
            return (
              <div key={type} className="search-group">
                <span className="eyebrow">{label}</span>
                {list.map((r) => (
                  <button key={r.key} data-sr={r.i} className={`search-item ${r.i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(r.i)} onClick={() => open(r)}>
                    <span className="search-thumb">{r.thumb ? <img src={r.thumb} alt="" /> : <Icon size={16} />}</span>
                    <span className="stack grow" style={{ gap: 1, minWidth: 0 }}>
                      <span className="row" style={{ gap: 6, minWidth: 0 }}><strong className="small truncate">{r.title}</strong>{r.tags?.slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}</span>
                      {r.snippet && <span className="small muted search-snip">{r.snippet}</span>}
                      <span className="small muted">{[r.sub, r.date && new Date(r.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }), r.at != null && `said at ${fmt(r.at)}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    {r.link && <ExternalLink size={13} className="muted" />}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="search-foot small muted"><span>↑↓ to move · Enter to open</span><span>{data ? `${data.total} found` : ''}</span></div>
      </div>
    </div>,
    document.body,
  );
}
