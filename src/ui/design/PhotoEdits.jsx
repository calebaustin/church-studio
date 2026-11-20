// Quick photo edits in the designer: a color wash in your brand colors, one-tap looks, and simple
// light and color sliders. Works on photos, photo spots and background photos.
import { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import ColorField from '../components/ColorField.jsx';
import { NO_EDITS } from './model.js';

const LOOKS = (colors) => [
  ['None', null],
  ['Brand wash', { wash: { color: colors[0], amount: 0.55, mode: 'color' } }],
  ['Duotone', { gray: 100, contrast: 115, wash: { color: colors[0], amount: 0.75, mode: 'screen' } }],
  ['Deep tint', { gray: 100, wash: { color: colors[2] || colors[0], amount: 0.6, mode: 'multiply' } }],
  ['Warm', { warmth: 45, saturate: 110 }],
  ['Cool', { warmth: -40 }],
  ['Faded', { contrast: 85, saturate: 70, brightness: 108 }],
  ['Moody', { brightness: 85, contrast: 120, saturate: 80 }],
  ['Black and white', { gray: 100, contrast: 110 }],
  ['Soft focus', { blur: 4, brightness: 105 }],
];
const MODES = [['color', 'Tint'], ['multiply', 'Darken'], ['screen', 'Lighten']];

export default function PhotoEdits({ value, onChange, colors }) {
  const [open, setOpen] = useState(Boolean(value));
  const a = { ...NO_EDITS, ...(value || {}) };
  const set = (patch) => onChange({ ...a, ...patch });
  const looks = LOOKS(colors);
  const slider = (key, label, min, max, unit = '') => (
    <label className="field small">{label} · {a[key]}{unit}<input type="range" min={min} max={max} value={a[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} /></label>
  );
  return (
    <div className="keycard stack" style={{ gap: 10 }}>
      <button className="row between photo-edits-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong className="small">Photo edits</strong>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--fast) var(--ease)' }} />
      </button>
      {open && (
        <>
          <div className="look-grid">
            {looks.map(([label, look]) => (
              <button key={label} className={`pill-choice ${JSON.stringify(look ? { ...NO_EDITS, ...look } : null) === JSON.stringify(value ? a : null) ? 'on' : ''}`} onClick={() => onChange(look ? { ...NO_EDITS, ...look } : null)}>{label}</button>
            ))}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small" style={{ fontWeight: 600 }}>Color wash</span>
            <div className="row wrap" style={{ gap: 8 }}>
              <ColorField value={a.wash?.color || colors[0]} swatches={colors} onChange={(c) => set({ wash: { mode: 'color', amount: 0.5, ...(a.wash || {}), color: c } })} />
              <div className="seg sm">{MODES.map(([m, l]) => <button key={m} className={(a.wash?.mode || 'color') === m ? 'on' : ''} onClick={() => set({ wash: { color: colors[0], amount: 0.5, ...(a.wash || {}), mode: m } })}>{l}</button>)}</div>
            </div>
            <label className="field small">Strength · {Math.round((a.wash?.amount || 0) * 100)}%<input type="range" min="0" max="1" step="0.05" value={a.wash?.amount || 0} onChange={(e) => set({ wash: { color: colors[0], mode: 'color', ...(a.wash || {}), amount: Number(e.target.value) } })} /></label>
          </div>
          <div className="token-grid">
            {slider('brightness', 'Brightness', 40, 160, '%')}
            {slider('contrast', 'Contrast', 40, 170, '%')}
            {slider('saturate', 'Color', 0, 200, '%')}
            {slider('warmth', 'Warmth', -100, 100)}
            {slider('gray', 'Black and white', 0, 100, '%')}
            {slider('blur', 'Soften', 0, 20)}
          </div>
          {value && <button className="btn ghost sm" onClick={() => onChange(null)}><RotateCcw size={13} />Undo all edits</button>}
        </>
      )}
    </div>
  );
}
