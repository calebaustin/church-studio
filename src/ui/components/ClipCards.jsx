// Full-screen cards for a clip: lyrics, a verse or the words being said, in front of everything for a while.
// The editor panel (in Graphics) and the live preview. The export draws them the same way (Cards in render_clip.py).
import { useState } from 'react';
import { Plus, Trash2, LogIn, LogOut } from 'lucide-react';
import Toggle from './Toggle.jsx';
import ColorField from './ColorField.jsx';
import CaptionOverlay from './CaptionOverlay.jsx';
import { fmt } from '../api.js';

const BG_TYPES = [['solid', 'Solid'], ['pattern', 'Pattern'], ['gradient', 'Gradient'], ['mesh', 'Mesh'], ['motion', 'Moving']];
// The same patterns as Design, plus diagonal lines.
const PATTERNS = [['dots', 'Dots'], ['lines', 'Lines'], ['grid', 'Grid'], ['checker', 'Checker'], ['stripes', 'Stripes']];
const MOTIONS = [['drift', 'Drift'], ['glow', 'Glow'], ['bokeh', 'Soft lights'], ['wave', 'Wave'], ['pulse', 'Pulse'], ['sweep', 'Light sweep'], ['scroll', 'Moving pattern']];
// How long one pass of each moving background takes in the preview, at normal speed.
const MOTION_SECONDS = { drift: 18, glow: 14, bokeh: 22, wave: 10, pulse: 6, sweep: 9, scroll: 12 };
const TRANSITIONS = [['fade', 'Fade'], ['blur', 'Blur'], ['slide', 'Slide']];
// How a card comes in and goes out. Cards made before these were separate use their one transition for both.
const trIn = (c) => (c.transitionIn !== undefined ? c.transitionIn : c.transition || 'fade') || 'none';
const trOut = (c) => (c.transitionOut !== undefined ? c.transitionOut : c.transition || 'fade') || 'none';
// Where a slide comes in from, and its name in the export.
const SLIDES = [['slide-down', 'Top'], ['slide-left', 'Right'], ['slide-up', 'Bottom'], ['slide-right', 'Left']];

const colorsOf = (c, brand) => { const list = c.bg?.colors?.length ? c.bg.colors : brand?.length ? brand : ['#1F3A2E', '#2B7F5F', '#D9A441']; const out = [...list]; while (out.length < 3) out.push(out.at(-1)); return out.slice(0, 3); };

/** The card's background as CSS, close to the export's. */
function bgStyle(c, brand) {
  const [c0, c1, c2] = colorsOf(c, brand);
  const type = c.bg?.type || 'mesh';
  const kind = type === 'motion' ? ({ drift: 'mesh', glow: 'gradient', bokeh: 'gradient', wave: 'gradient', pulse: 'gradient', sweep: 'gradient', scroll: 'pattern' }[c.bg?.motion || 'drift']) : type;
  if (kind === 'solid') return { background: c0 };
  if (kind === 'gradient') return { background: `linear-gradient(135deg, ${c0}, ${c1})` };
  if (kind === 'pattern') {
    const p = c.bg?.pattern || 'dots';
    const k = Math.max(0.4, Math.min(2.5, c.bg?.scale || 1)); const u = (n) => `${Math.round(n * k)}px`;
    const mix = (a) => `color-mix(in srgb, ${c1} ${a}%, transparent)`;
    const layer = p === 'lines' ? `repeating-linear-gradient(45deg, ${mix(35)} 0 2px, transparent 2px ${u(22)})`
      : p === 'grid' ? `linear-gradient(${mix(35)} 1px, transparent 1px) 0 0 / ${u(24)} ${u(24)}, linear-gradient(90deg, ${mix(35)} 1px, transparent 1px) 0 0 / ${u(24)} ${u(24)}`
        : p === 'checker' ? `conic-gradient(${mix(35)} 25%, transparent 0 50%, ${mix(35)} 0 75%, transparent 0) 0 0 / ${u(36)} ${u(36)}`
          : p === 'stripes' ? `repeating-linear-gradient(90deg, ${mix(35)} 0 ${u(14)}, transparent ${u(14)} ${u(28)})`
            : `radial-gradient(${mix(45)} 2px, transparent 2.5px) 0 0 / ${u(20)} ${u(20)}`;
    return { background: `${layer}, ${c0}` };
  }
  return { background: `radial-gradient(circle at 22% 28%, ${c1} 0, transparent 45%), radial-gradient(circle at 78% 72%, ${c2} 0, transparent 48%), radial-gradient(circle at 80% 18%, color-mix(in srgb, ${c1} 60%, transparent) 0, transparent 32%), ${c0}` };
}

/** A card's text layout, with the defaults the export uses. */
const cardLayout = (c) => ({ scale: c.scale ?? 1.35, width: c.width ?? 0.84, position: c.position ?? 0.5, align: c.align || 'center', anchor: c.anchor || 'middle', lineHeight: c.lineHeight ?? null });

/** Which transition is playing at output time t and how far along it is (0..1), eased like the export. */
const reveal = (c, t) => {
  const entering = t - c.start < c.end - t;
  const tr = entering ? trIn(c) : trOut(c);
  const r = tr === 'none' ? 1 : Math.max(0, Math.min(1, (entering ? t - c.start : c.end - t) / 0.45));
  return { e: 1 - (1 - r) ** 3, tr };
};

/** The live preview of whichever card is showing. */
export function CardPreview({ cards, outTime, keep, capWords, theme, font, frameWidth, playing, brand }) {
  const c = (cards || []).find((x) => outTime >= x.start && outTime <= x.end);
  if (!c) return null;
  const { e, tr } = reveal(c, outTime);
  const from = { 'slide-up': [0, 100], 'slide-down': [0, -100], 'slide-left': [100, 0], 'slide-right': [-100, 0] }[tr];
  const style = tr.startsWith('slide') ? { transform: `translate(${(1 - e) * from[0]}%, ${(1 - e) * from[1]}%)` } : { opacity: e, filter: tr === 'blur' && e < 1 ? `blur(${((1 - e) * 14).toFixed(1)}px)` : undefined };
  // Card time is output time; caption words are clip time. Map them across the cuts.
  const relToOut = (r) => { let acc = 0; for (const [s, en] of keep) { if (r < en) return acc + Math.max(0, r - s); acc += en - s; } return acc; };
  const words = c.text ? [] : capWords.filter((w) => { const o = relToOut(w.start); return o >= c.start - 0.05 && o <= c.end + 0.05; }).map((w) => ({ ...w, start: relToOut(w.start), end: relToOut(w.end) }));
  const all = c.show === 'all';
  const lay = cardLayout(c);
  const cardTheme = theme ? { ...theme, size: (theme.size || 78) * lay.scale * (all ? 0.82 : 1), position: lay.position, anchor: lay.anchor, maxWidth: lay.width, words: all ? 9999 : c.words || 14, maxChars: Math.round(30 * lay.width / 0.84), sentences: true, align: lay.align, lineHeight: lay.lineHeight ?? theme.lineHeight } : null;
  const type = c.bg?.type || 'mesh';
  return (
    <div className="clip-card-layer" style={style} aria-hidden="true">
      <div className={`clip-card-bg ${type === 'motion' ? `moving ${c.bg?.motion || 'drift'}` : ''}`} style={{ ...bgStyle(c, brand), animationPlayState: playing ? 'running' : 'paused', animationDuration: type === 'motion' ? `${(MOTION_SECONDS[c.bg?.motion || 'drift'] || 18) / Math.max(0.25, c.bg?.speed || 1)}s` : undefined }} />
      {c.bg?.dim > 0 && <div className="clip-card-dim" style={{ opacity: c.bg.dim }} />}
      {c.text
        ? <div className="clip-card-text" style={{ fontFamily: font?.css, color: theme?.color || '#FFFFFF', fontSize: Math.round(frameWidth * 0.075 * lay.scale / 1.35), width: `${lay.width * 100}%`, textAlign: lay.align, lineHeight: lay.lineHeight ?? 1.18,
          top: `${lay.position * 100}%`, transform: lay.anchor === 'bottom' ? 'translate(-50%, -100%)' : lay.anchor === 'top' ? 'translate(-50%, 0)' : 'translate(-50%, -50%)' }}>{c.text}</div>
        : cardTheme && <CaptionOverlay theme={cardTheme} font={font} words={words} t={outTime} frameWidth={frameWidth} />}
      {c.label?.trim() && <div className={`clip-card-label ${c.labelPos === 'top' ? 'top' : ''}`} style={{ fontFamily: font?.css, color: theme?.color || '#FFFFFF', fontSize: Math.round(frameWidth * 0.045) }}>{c.label}</div>}
    </div>
  );
}

/** The Graphics tab panel: add cards at the playhead, then set the words, background and transition. */
export function CardsPanel({ clip, set, now, len, brand }) {
  const list = clip.cards || [];
  const [tabs, setTabs] = useState({}); // which page each card shows: words, background or text layout
  const save = (next) => set({ cards: next });
  const up = (id, patch) => save(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const upBg = (c, patch) => up(c.id, { bg: { type: 'mesh', ...(c.bg || {}), ...patch } });
  const add = () => {
    const start = +Math.min(Math.max(0, now), Math.max(0, len - 1)).toFixed(1);
    save([...list, { id: Math.random().toString(36).slice(2, 8), start, end: +Math.min(len, start + 5).toFixed(1), text: '', transitionIn: 'none', transitionOut: 'none', bg: { type: 'motion', motion: 'drift', colors: (brand || []).slice(0, 3), dim: 0.15 } }]);
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
            <div className="tabs card-tabs" role="tablist">
              {[['words', 'Words'], ['bg', 'Background'], ['layout', 'Text size and place']].map(([k, l]) => <button key={k} role="tab" aria-selected={(tabs[c.id] || 'words') === k} className={(tabs[c.id] || 'words') === k ? 'on' : ''} onClick={() => setTabs((t) => ({ ...t, [c.id]: k }))}>{l}</button>)}
            </div>
            {(tabs[c.id] || 'words') === 'words' && (<>
            <div className="seg" role="group" aria-label="Card words">
              <button className={!c.text && !c.custom ? 'on' : ''} onClick={() => up(c.id, { text: '', custom: false })}>The words being said</button>
              <button className={c.text || c.custom ? 'on' : ''} onClick={() => up(c.id, { custom: true })}>My own text</button>
            </div>
            {(c.text || c.custom) && <textarea className="input" rows={3} value={c.text || ''} placeholder="“This is my body, which is given for you.” Luke 22:19" onChange={(e) => up(c.id, { text: e.target.value, custom: true })} />}
            {!c.text && !c.custom && (
              <div className="row wrap" style={{ gap: 8 }}>
                <div className="seg" role="group" aria-label="How the words show">
                  <button className={c.show !== 'all' ? 'on' : ''} onClick={() => up(c.id, { show: 'phrase' })}>Phrase by phrase</button>
                  <button className={c.show === 'all' ? 'on' : ''} onClick={() => up(c.id, { show: 'all' })}>All at once</button>
                </div>
                <span className="hint">Each word lights up as it's said, styled like your captions.</span>
              </div>
            )}
            <div className="row wrap" style={{ gap: 8 }}>
              <input className="input grow" style={{ minWidth: 160 }} value={c.label || ''} placeholder="Reference or label, like Luke 22:19" onChange={(e) => up(c.id, { label: e.target.value })} />
              {c.label?.trim() && <div className="seg" role="group" aria-label="Label place">{[['top', 'Above'], ['bottom', 'Below']].map(([k, l]) => <button key={k} className={(c.labelPos || 'bottom') === k ? 'on' : ''} onClick={() => up(c.id, { labelPos: k })}>{l}</button>)}</div>}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="small" style={{ fontWeight: 600 }}>Transition</span>
              {[['In', LogIn, trIn(c), 'transitionIn'], ['Out', LogOut, trOut(c), 'transitionOut']].map(([name, Icon, cur, key]) => {
                const on = cur !== 'none';
                const isSlide = cur.startsWith('slide');
                return (
                  <div key={key} className="row wrap card-tr" style={{ gap: 8 }}>
                    <Toggle checked={on} onChange={(e) => up(c.id, { [key]: e.target.checked ? 'fade' : 'none' })} icon={Icon} label={name} small />
                    {on && <div className="seg" role="group" aria-label={`Transition ${name.toLowerCase()}`}>{TRANSITIONS.map(([k, l]) => <button key={k} className={(k === 'slide' ? isSlide : cur === k) ? 'on' : ''} onClick={() => up(c.id, { [key]: k === 'slide' ? 'slide-up' : k })}>{l}</button>)}</div>}
                    {on && isSlide && <div className="seg" role="group" aria-label={`Slide ${name.toLowerCase()} ${name === 'In' ? 'from' : 'toward'}`}>{SLIDES.map(([k, l]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => up(c.id, { [key]: k })}>{l}</button>)}</div>}
                  </div>
                );
              })}
            </div>
            </>)}
            {tabs[c.id] === 'bg' && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="seg" role="group" aria-label="Background">{BG_TYPES.map(([k, l]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => upBg(c, { type: k })}>{l}</button>)}</div>
              {type === 'motion' && <div className="look-grid" role="group" aria-label="Motion">{MOTIONS.map(([k, l]) => <button key={k} className={`pill-choice ${(c.bg?.motion || 'drift') === k ? 'on' : ''}`} onClick={() => upBg(c, { motion: k })}>{l}</button>)}</div>}
              {(type === 'pattern' || (type === 'motion' && c.bg?.motion === 'scroll')) && (
                <div className="row wrap" style={{ gap: 10 }}>
                  <div className="seg" role="group" aria-label="Pattern">{PATTERNS.map(([k, l]) => <button key={k} className={(c.bg?.pattern || 'dots') === k ? 'on' : ''} onClick={() => upBg(c, { pattern: k })}>{l}</button>)}</div>
                  <label className="field small grow" style={{ minWidth: 140 }}>Pattern size · {Math.round((c.bg?.scale || 1) * 100)}%<input type="range" min="0.5" max="2.5" step="0.1" value={c.bg?.scale || 1} onChange={(e) => upBg(c, { scale: Number(e.target.value) })} /></label>
                </div>
              )}
              {type === 'motion' && <label className="field small" style={{ maxWidth: 320 }}>Speed · {(c.bg?.speed || 1).toFixed(2).replace(/\.?0+$/, '')}×<input type="range" min="0.25" max="3" step="0.25" value={c.bg?.speed || 1} onChange={(e) => upBg(c, { speed: Number(e.target.value) })} /></label>}
              <div className="row wrap" style={{ gap: 10 }}>
                {(type === 'solid' ? [0] : type === 'gradient' || type === 'pattern' ? [0, 1] : [0, 1, 2]).map((i) => (
                  <ColorField key={i} value={cols[i]} swatches={brand || []} onChange={(v) => { const next = [...cols]; next[i] = v; upBg(c, { colors: next }); }} />
                ))}
                <label className="field small grow" style={{ minWidth: 140 }}>Darken · {Math.round((c.bg?.dim ?? 0.15) * 100)}%<input type="range" min="0" max="0.6" step="0.05" value={c.bg?.dim ?? 0.15} onChange={(e) => upBg(c, { dim: Number(e.target.value) })} /></label>
              </div>
            </div>
            )}
            {tabs[c.id] === 'layout' && (() => {
              const lay = cardLayout(c);
              return (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="token-grid">
                    <label className="field small">Text size · {Math.round(lay.scale / 1.35 * 100)}%<input type="range" min="0.5" max="2.2" step="0.05" value={lay.scale} onChange={(e) => up(c.id, { scale: Number(e.target.value) })} /></label>
                    <label className="field small">Text width · {Math.round(lay.width * 100)}%<input type="range" min="0.5" max="0.95" step="0.01" value={lay.width} onChange={(e) => up(c.id, { width: Number(e.target.value) })} /></label>
                    <label className="field small">Position · {Math.round(lay.position * 100)}% down<input type="range" min="0.12" max="0.88" step="0.01" value={lay.position} onChange={(e) => up(c.id, { position: Number(e.target.value) })} /></label>
                    {!c.text && !c.custom && c.show !== 'all' && <label className="field small">Words on screen · up to {c.words || 14}<input type="range" min="3" max="30" value={c.words || 14} onChange={(e) => up(c.id, { words: Number(e.target.value) })} /></label>}
                  </div>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <div className="seg" role="group" aria-label="Alignment">{[['left', 'Left'], ['center', 'Centered'], ['right', 'Right']].map(([k, l]) => <button key={k} className={lay.align === k ? 'on' : ''} onClick={() => up(c.id, { align: k })}>{l}</button>)}</div>
                    <div className="seg" role="group" aria-label="Pinned to">{[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']].map(([k, l]) => <button key={k} className={lay.anchor === k ? 'on' : ''} onClick={() => up(c.id, { anchor: k })}>{l}</button>)}</div>
                  </div>
                  <span className="hint">Make the text smaller and wider to fit a whole verse on one card. Pinned to sets the edge that stays put as lines are added.</span>
                </div>
              );
            })()}
          </div>
        );
      })}
      {!list.length && <span className="small muted">No cards yet. Play to a moment, then add one.</span>}
    </div>
  );
}
