import { useEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { useApp } from '../App.jsx';
import Popover from './Popover.jsx';

// ---- color math
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const normHex = (h) => {
  let x = String(h || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(x)) x = x.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(x) ? `#${x.toUpperCase()}` : null;
};
function hexToHsv(hex) {
  const n = normHex(hex) || '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const RECENT_KEY = 'sc-recent-colors';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const pushRecent = (c) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...readRecent().filter((x) => x !== c)].slice(0, 10))); } catch { /* fine */ } };

function SatVal({ hsv, onChange }) {
  const ref = useRef(null);
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect();
    onChange({ ...hsv, s: clamp((e.clientX - r.left) / r.width), v: clamp(1 - (e.clientY - r.top) / r.height) });
  };
  return (
    <div ref={ref} className="cp-sv" style={{ background: `hsl(${hsv.h} 100% 50%)` }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
      onPointerMove={(e) => { if (e.buttons) pick(e); }}>
      <i className="cp-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
    </div>
  );
}

/**
 * Modern color control: a swatch that opens a glass picker with a color field, hue slider,
 * hex entry, eyedropper and your brand, theme and recent colors.
 */
export default function ColorField({ value, onChange, label, swatches = [], align = 'left', size = 30 }) {
  const { config, themes } = useApp();
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hex, setHex] = useState(normHex(value) || '#000000');
  useEffect(() => { if (!open) { setHsv(hexToHsv(value)); setHex(normHex(value) || '#000000'); } }, [value, open]);

  const set = (c, fromHsv) => {
    const n = normHex(c);
    if (!n) return;
    setHex(n);
    if (!fromHsv) setHsv(hexToHsv(n));
    onChange(n);
  };
  const close = () => { setOpen(false); if (normHex(value)) pushRecent(normHex(value)); };
  const theme = themes?.app?.find((t) => t.id === config?.appTheme)?.tokens || {};
  const groups = [
    ['Brand', config?.brandColors || []],
    ['Suggested', swatches],
    ['Theme', [theme['--accent'], theme['--accent-2'], theme['--ink'], theme['--bg']].filter(Boolean)],
    ['Basics', ['#FFFFFF', '#000000', '#111827', '#6B7280', '#F3F4F6']],
    ['Recent', open ? readRecent() : []],
  ].map(([n, list]) => [n, [...new Set(list.map(normHex).filter(Boolean))]]).filter(([, list]) => list.length);

  const dropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  return (
    <span className="cp" style={{ position: 'relative' }}>
      <button type="button" className="cp-swatch" data-pop-trigger aria-label={label ? `${label} color` : 'Color'} title={normHex(value) || ''}
        style={{ '--sw': normHex(value) || 'transparent', width: size, height: size }} onClick={() => (open ? close() : setOpen(true))} />
      {label && <span className="cp-label" onClick={() => setOpen(true)}>{label}</span>}
      <Popover open={open} onClose={close} align={align} width={252} className="cp-pop">
        <SatVal hsv={hsv} onChange={(x) => { setHsv(x); set(hsvToHex(x), true); }} />
        <input type="range" className="cp-hue" min="0" max="359" value={Math.round(hsv.h)} aria-label="Hue"
          onChange={(e) => { const x = { ...hsv, h: Number(e.target.value) }; setHsv(x); set(hsvToHex(x), true); }} />
        <div className="row" style={{ gap: 6 }}>
          {dropper && (
            <button type="button" className="rt-btn" title="Pick a color from the screen" aria-label="Eyedropper"
              onClick={async () => { try { const r = await new window.EyeDropper().open(); set(r.sRGBHex); } catch { /* cancelled */ } }}>
              <Pipette size={15} />
            </button>
          )}
          <span className="cp-preview" style={{ background: hex }} />
          <input className="input cp-hex mono" value={hex} spellCheck={false} aria-label="Hex color"
            onChange={(e) => { setHex(e.target.value); if (normHex(e.target.value)) set(e.target.value); }} />
        </div>
        {groups.map(([name, list]) => (
          <div key={name} className="cp-group">
            <span className="cp-group-name">{name}</span>
            <div className="cp-dots">
              {list.map((c) => <button key={c} type="button" className={`cp-dot ${c === normHex(value) ? 'on' : ''}`} style={{ '--sw': c }} title={c} aria-label={c} onClick={() => set(c)} />)}
            </div>
          </div>
        ))}
      </Popover>
    </span>
  );
}
