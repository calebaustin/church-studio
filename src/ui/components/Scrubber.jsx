import { useRef, useState } from 'react';
import { fmt } from '../api.js';

/**
 * Timeline scrub bar. While you drag (or hover), a tooltip shows the time and the words being said
 * there; letting go snaps to the start of the nearest word so cuts and cues land cleanly.
 * `words` are { w, start, end } in the same time base as `value` / `max`.
 */
export default function Scrubber({ value, max, onChange, words = [], marks = [], height = 8, label = 'Position', snap = true }) {
  const bar = useRef(null);
  const [tip, setTip] = useState(null); // { t, x }
  const [dragging, setDragging] = useState(false);

  const timeAt = (clientX) => {
    const r = bar.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { t: f * max, x: f * r.width };
  };
  const wordIndexAt = (t) => {
    if (!words.length) return -1;
    let best = 0;
    for (let i = 0; i < words.length; i++) {
      if (words[i].start <= t) best = i; else break;
    }
    return best;
  };
  const snapTo = (t) => {
    if (!snap || !words.length) return t;
    let best = null;
    for (const w of words) if (best == null || Math.abs(w.start - t) < Math.abs(best - t)) best = w.start;
    return best != null && Math.abs(best - t) < 0.8 ? Math.max(0, Math.min(max, best)) : t;
  };
  const context = (t) => {
    const i = wordIndexAt(t);
    if (i < 0) return null;
    return { before: words.slice(Math.max(0, i - 3), i).map((w) => w.w).join(' '), now: words[i].w, after: words.slice(i + 1, i + 4).map((w) => w.w).join(' ') };
  };

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const p = timeAt(e.clientX);
    setTip(p);
    onChange(p.t);
  };
  const move = (e) => {
    const p = timeAt(e.clientX);
    setTip(p);
    if (dragging) onChange(p.t);
  };
  const up = (e) => {
    if (!dragging) return;
    setDragging(false);
    const p = timeAt(e.clientX);
    onChange(snapTo(p.t));
  };
  const key = (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(max, value + step)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(0, value - step)); }
  };
  const pct = max ? (value / max) * 100 : 0;
  const c = tip && context(tip.t);

  return (
    <div className="scrub" ref={bar} style={{ '--h': `${height}px` }}
      role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)} aria-valuetext={fmt(value)}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => !dragging && setTip(null)} onKeyDown={key}>
      <div className="scrub-track"><i style={{ width: `${pct}%` }} /></div>
      {marks.map((m, i) => <b key={i} className={`scrub-mark ${m.on ? 'on' : ''}`} style={{ left: `${(m.t / max) * 100}%` }} title={m.label} />)}
      <span className="scrub-thumb" style={{ left: `${pct}%` }} />
      {tip && (
        <div className="scrub-tip" style={{ left: Math.min(Math.max(tip.x, 90), (bar.current?.clientWidth || 200) - 90) }}>
          <span className="num">{fmt(tip.t)}.{Math.floor((tip.t % 1) * 10)}</span>
          {c && <span className="scrub-words">{c.before} <b>{c.now}</b> {c.after}</span>}
        </div>
      )}
    </div>
  );
}
