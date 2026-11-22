import { useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import Popover from './Popover.jsx';

/** Font families for design tools: recommended first, then everything installed on this Mac. */
export function useFamilies() {
  const { themes } = useApp();
  return useMemo(() => {
    const strip = (css) => String(css || '').replace(/^'|'$/g, '').replace(/\\'/g, "'");
    const rec = [...new Set(['Montserrat', ...themes.fonts.map((f) => strip(f.css)), 'Georgia', 'Avenir Next', 'Playfair Display', 'Baskerville', 'Didot', 'Gill Sans', 'Optima', 'Futura', 'Helvetica Neue'])];
    const sys = [...new Set((themes.systemFonts || []).map((f) => f.family))].filter((f) => !rec.includes(f)).sort((a, b) => a.localeCompare(b));
    const installed = new Set((themes.systemFonts || []).map((f) => f.family));
    return [
      ...rec.filter((f) => f === 'Montserrat' || installed.has(f) || !themes.systemFonts?.length).map((f) => ({ value: f, label: f, css: `'${f}'`, group: 'Recommended' })),
      ...sys.map((f) => ({ value: f, label: f, css: `'${f}'`, group: 'On this Mac' })),
    ];
  }, [themes]);
}

/**
 * Searchable font menu. Each name is shown in its own typeface.
 * options: [{value, label, css, group}]
 */
export default function FontMenu({ value, onChange, options, label, align = 'left', width = '100%' }) {
  const { reloadThemes } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const current = options.find((o) => o.value === value);
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const groups = [...new Set(shown.map((o) => o.group))];
  return (
    <div className="stack" style={{ gap: 6, position: 'relative', width }}>
      {label && <span className="field-label">{label}</span>}
      <button type="button" className="font-trigger" data-pop-trigger onClick={() => { if (!open) reloadThemes().catch(() => {}); setOpen(!open); }}>
        <span className="truncate" style={{ fontFamily: current?.css }}>{current?.label || 'Choose a font'}</span>
        <ChevronDown size={15} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align={align} width={300}>
        <div className="row" style={{ gap: 6, padding: 4 }}>
          <div className="input-affix grow"><Search size={14} className="muted" /><input className="input" autoFocus placeholder={`Search ${options.length} fonts`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button type="button" className="rt-btn" title="Look for newly installed fonts" aria-label="Refresh fonts" disabled={busy}
            onClick={async () => { setBusy(true); await api.post('/api/fonts/refresh'); await reloadThemes(); setBusy(false); }}><RefreshCw size={15} /></button>
        </div>
        <div className="pop-list" style={{ maxHeight: 320 }}>
          {groups.map((g) => (
            <div key={g} className="stack" style={{ gap: 1 }}>
              <span className="cp-group-name" style={{ padding: '8px 10px 2px' }}>{g}</span>
              {shown.filter((o) => o.group === g).map((o) => (
                <button key={o.value} type="button" className={`pop-item font-item ${o.value === value ? 'on' : ''}`} style={{ fontFamily: o.css, fontWeight: o.weight }}
                  onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}>{o.label}</button>
              ))}
            </div>
          ))}
          {!shown.length && <div className="pop-empty">No fonts match.</div>}
        </div>
      </Popover>
    </div>
  );
}
