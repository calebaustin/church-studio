// Full-screen cards for a clip: lyrics, a verse or the words being said, in front of everything for a while.
// The editor panel (in Graphics) and the live preview. The export draws them the same way (Cards in render_clip.py).
import { Plus, Trash2 } from 'lucide-react';
import ColorField from './ColorField.jsx';
import CaptionOverlay from './CaptionOverlay.jsx';
import { fmt } from '../api.js';

const BG_TYPES = [['mesh', 'Mesh'], ['gradient', 'Gradient'], ['pattern', 'Pattern'], ['solid', 'Solid'], ['motion', 'Moving']];
const PATTERNS = [['dots', 'Dots'], ['lines', 'Lines'], ['grid', 'Grid']];
const MOTIONS = [['drift', 'Drift'], ['glow', 'Glow'], ['bokeh', 'Soft lights']];
const TRANSITIONS = [['fade', 'Fade'], ['blur', 'Blur'], ['slide', 'Slide']];
// Where a slide comes in from, and its name in the export.
const SLIDES = [['slide-down', 'Top'], ['slide-left', 'Right'], ['slide-up', 'Bottom'], ['slide-right', 'Left']];

const colorsOf = (c, brand) => { const list = c.bg?.colors?.length ? c.bg.colors : brand?.length ? brand : ['#1F3A2E', '#2B7F5F', '#D9A441']; const out = [...list]; while (out.length < 3) out.push(out.at(-1)); return out.slice(0, 3); };

/** The card's background as CSS, close to the export's. */
function bgStyle(c, brand) {
  const [c0, c1, c2] = colorsOf(c, brand);
  const type = c.bg?.type || 'mesh';
  const kind = type === 'motion' ? ({ drift: 'mesh', glow: 'gradient', bokeh: 'gradient' }[c.bg?.motion || 'drift']) : type;
  if (kind === 'solid') return { background: c0 };
  if (kind === 'gradient') return { background: `linear-gradient(135deg, ${c0}, ${c1})` };
  if (kind === 'pattern') {
    const p = c.bg?.pattern || 'dots';
    const layer = p === 'lines' ? `repeating-linear-gradient(45deg, color-mix(in srgb, ${c1} 35%, transparent) 0 2px, transparent 2px 22px)`
      : p === 'grid' ? `linear-gradient(color-mix(in srgb, ${c1} 35%, transparent) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, color-mix(in srgb, ${c1} 35%, transparent) 1px, transparent 1px) 0 0 / 24px 24px`
        : `radial-gradient(color-mix(in srgb, ${c1} 45%, transparent) 2px, transparent 2.5px) 0 0 / 20px 20px`;
    return { background: `${layer}, ${c0}` };
  }
  return { background: `radial-gradient(circle at 22% 28%, ${c1} 0, transparent 45%), radial-gradient(circle at 78% 72%, ${c2} 0, transparent 48%), radial-gradient(circle at 80% 18%, color-mix(in srgb, ${c1} 60%, transparent) 0, transparent 32%), ${c0}` };
}

/** How far a card is in (0..1) at output time t, eased like the export. */
const reveal = (c, t) => { const r = Math.max(0, Math.min(1, (t - c.start) / 0.45, (c.end - t) / 0.45)); return 1 - (1 - r) ** 3; };

/** The live preview of whichever card is showing. */
export function CardPreview({ cards, outTime, keep, capWords, theme, font, frameWidth, playing, brand }) {
  const c = (cards || []).find((x) => outTime >= x.start && outTime <= x.end);
  if (!c) return null;
  const e = reveal(c, outTime);
  const tr = c.transition || 'fade';
  const from = { 'slide-up': [0, 100], 'slide-down': [0, -100], 'slide-left': [100, 0], 'slide-right': [-100, 0] }[tr];
  const style = tr.startsWith('slide') ? { transform: `translate(${(1 - e) * from[0]}%, ${(1 - e) * from[1]}%)` } : { opacity: e, filter: tr === 'blur' && e < 1 ? `blur(${((1 - e) * 14).toFixed(1)}px)` : undefined };
  // Card time is output time; caption words are clip time. Map them across the cuts.
  const relToOut = (r) => { let acc = 0; for (const [s, en] of keep) { if (r < en) return acc + Math.max(0, r - s); acc += en - s; } return acc; };
  const words = c.text ? [] : capWords.filter((w) => { const o = relToOut(w.start); return o >= c.start - 0.05 && o <= c.end + 0.05; }).map((w) => ({ ...w, start: relToOut(w.start), end: relToOut(w.end) }));
  const cardTheme = theme ? { ...theme, size: (theme.size || 78) * (c.scale || 1.35), position: 0.5, maxWidth: 0.84, words: c.words || 10, align: 'center' } : null;
  const type = c.bg?.type || 'mesh';
  return (
    <div className="clip-card-layer" style={style} aria-hidden="true">
      <div className={`clip-card-bg ${type === 'motion' ? `moving ${c.bg?.motion || 'drift'}` : ''}`} style={{ ...bgStyle(c, brand), animationPlayState: playing ? 'running' : 'paused' }} />
      {c.bg?.dim > 0 && <div className="clip-card-dim" style={{ opacity: c.bg.dim }} />}
      {c.text
        ? <div className="clip-card-text" style={{ fontFamily: font?.css, color: theme?.color || '#FFFFFF', fontSize: Math.round(frameWidth * 0.075) }}>{c.text}</div>
        : cardTheme && <CaptionOverlay theme={cardTheme} font={font} words={words} t={outTime} frameWidth={frameWidth} />}
    </div>
  );
}

/** The Graphics tab panel: add cards at the playhead, then set the words, background and transition. */
export function CardsPanel({ clip, set, now, len, brand }) {
  const list = clip.cards || [];
  const save = (next) => set({ cards: next });
  const up = (id, patch) => save(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const upBg = (c, patch) => up(c.id, { bg: { type: 'mesh', ...(c.bg || {}), ...patch } });
  const add = () => {
    const start = +Math.min(Math.max(0, now), Math.max(0, len - 1)).toFixed(1);
    save([...list, { id: Math.random().toString(36).slice(2, 8), start, end: +Math.min(len, start + 5).toFixed(1), text: '', transition: 'fade', bg: { type: 'motion', motion: 'drift', colors: (brand || []).slice(0, 3), dim: 0.15 } }]);
  };
  return (
    <div className="keycard stack" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="stack" style={{ gap: 0 }}><strong>Full-screen cards</strong><span className="small muted">Lyrics, a verse or the words being said, in front of everything for a moment.</span></div>
        <button className="btn primary sm" onClick={add}><Plus size={13} />Add at {fmt(now)}</button>
      </div>
      {list.map((c) => {
        const cols = colorsOf(c, brand);
        const type = c.bg?.type || 'mesh';
        const slide = (c.transition || '').startsWith('slide');
        return (
          <div key={c.id} className="card-row stack" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>From</span>
              <input className="input num card-time" type="number" min="0" step="0.1" value={c.start} onChange={(e) => up(c.id, { start: Number(e.target.value) })} />
              <button className="btn ghost sm" onClick={() => up(c.id, { start: +now.toFixed(1), end: Math.max(c.end, +(now + 1).toFixed(1)) })}>Start here</button>
              <span className="small" style={{ fontWeight: 600 }}>to</span>
              <input className="input num card-time" type="number" min="0" step="0.1" value={c.end} onChange={(e) => up(c.id, { end: Number(e.target.value) })} />
              <button className="btn ghost sm" disabled={now <= c.start} onClick={() => up(c.id, { end: +now.toFixed(1) })}>End here</button>
              <button className="btn icon sm danger" aria-label="Delete card" style={{ marginLeft: 'auto' }} onClick={() => save(list.filter((x) => x.id !== c.id))}><Trash2 size={14} /></button>
            </div>
            <div className="seg" role="group" aria-label="Card words">
              <button className={!c.text && !c.custom ? 'on' : ''} onClick={() => up(c.id, { text: '', custom: false })}>The words being said</button>
              <button className={c.text || c.custom ? 'on' : ''} onClick={() => up(c.id, { custom: true })}>My own text</button>
            </div>
            {(c.text || c.custom) && <textarea className="input" rows={3} value={c.text || ''} placeholder="“This is my body, which is given for you.” Luke 22:19" onChange={(e) => up(c.id, { text: e.target.value, custom: true })} />}
            {!c.text && !c.custom && <span className="hint">Styled like your captions, larger and centered. Change the caption style in Captions.</span>}
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>Background</span>
              <div className="seg" role="group" aria-label="Background">{BG_TYPES.map(([k, l]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => upBg(c, { type: k })}>{l}</button>)}</div>
              {type === 'pattern' && <div className="seg" role="group" aria-label="Pattern">{PATTERNS.map(([k, l]) => <button key={k} className={(c.bg?.pattern || 'dots') === k ? 'on' : ''} onClick={() => upBg(c, { pattern: k })}>{l}</button>)}</div>}
              {type === 'motion' && <div className="seg" role="group" aria-label="Motion">{MOTIONS.map(([k, l]) => <button key={k} className={(c.bg?.motion || 'drift') === k ? 'on' : ''} onClick={() => upBg(c, { motion: k })}>{l}</button>)}</div>}
              <div className="row wrap" style={{ gap: 10 }}>
                {(type === 'solid' ? [0] : type === 'gradient' || type === 'pattern' ? [0, 1] : [0, 1, 2]).map((i) => (
                  <ColorField key={i} value={cols[i]} swatches={brand || []} onChange={(v) => { const next = [...cols]; next[i] = v; upBg(c, { colors: next }); }} />
                ))}
                <label className="field small grow" style={{ minWidth: 140 }}>Darken · {Math.round((c.bg?.dim ?? 0.15) * 100)}%<input type="range" min="0" max="0.6" step="0.05" value={c.bg?.dim ?? 0.15} onChange={(e) => upBg(c, { dim: Number(e.target.value) })} /></label>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="small" style={{ fontWeight: 600 }}>Comes in with</span>
              <div className="seg" role="group" aria-label="Transition">{TRANSITIONS.map(([k, l]) => <button key={k} className={(k === 'slide' ? slide : (c.transition || 'fade') === k) ? 'on' : ''} onClick={() => up(c.id, { transition: k === 'slide' ? 'slide-up' : k })}>{l}</button>)}</div>
              {slide && <div className="seg" role="group" aria-label="Slide in from">{SLIDES.map(([k, l]) => <button key={k} className={c.transition === k ? 'on' : ''} onClick={() => up(c.id, { transition: k })}>{l}</button>)}</div>}
            </div>
          </div>
        );
      })}
      {!list.length && <span className="small muted">No cards yet. Play to a moment, then add one.</span>}
    </div>
  );
}
