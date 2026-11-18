// Presenting slides.
// - "On this screen": the slides fill this screen; click, arrows or a clicker move through them.
// - "To a second screen": the audience screen opens full screen on the other display. This window
//   becomes the presenter console: live slide, next slide, notes, timer and every slide in a strip.
//   Edits made while live are staged: the audience keeps seeing the last version you sent until you
//   press "Update screen" (or move to another slide).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, RefreshCw, X } from 'lucide-react';
import { loadAssets, renderPage } from './model.js';

const CHANNEL = 'church-studio-present';
export const NEXT_KEYS = ['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n'];
export const PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'];
export const BLACK_KEYS = ['b', 'B', '.'];

export function openChannel(onMessage) {
  if (typeof BroadcastChannel === 'undefined') return { post() {}, close() {} };
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => onMessage?.(e.data);
  return { post: (m) => ch.postMessage(m), close: () => ch.close() };
}

/** Draw one page into a canvas, sized to fit a box. */
function Slide({ doc, index, width, height, cache, black, className, audience = false }) {
  const ref = useRef(null);
  const pg = doc?.pages[index];
  useEffect(() => {
    if (!pg || !ref.current) return undefined;
    let live = true;
    (async () => {
      await loadAssets(pg, cache);
      await document.fonts.ready;
      const k = Math.min(width / doc.size.w, height / doc.size.h) * (window.devicePixelRatio || 1);
      if (live && ref.current) renderPage(ref.current, doc, pg, k, cache, { placeholders: !audience });
    })();
    return () => { live = false; };
  }, [doc, pg, width, height]);
  if (!pg) return <div className={`slide-empty ${className || ''}`} style={{ width, height: Math.min(height, width * 9 / 16) }} />;
  const fit = Math.min(width / doc.size.w, height / doc.size.h);
  return (
    <div className={`slide-frame ${className || ''}`} style={{ width: doc.size.w * fit, height: doc.size.h * fit }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', visibility: black ? 'hidden' : 'visible' }} />
    </div>
  );
}

function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return box;
}

// ---------------------------------------------------------------- on this screen
export function PresentHere({ doc, start, onClose }) {
  const [i, setI] = useState(start);
  const [black, setBlack] = useState(false);
  const wrap = useRef(null);
  const cache = useRef({});
  const close = useRef(onClose);
  close.current = onClose;
  const n = doc.pages.length;
  const box = useBox(wrap);

  useEffect(() => {
    // Full screen once. Leaving full screen (Esc, or the green button) ends the show.
    let entered = false;
    const el = wrap.current;
    el?.requestFullscreen?.().then(() => { entered = true; }).catch(() => {});
    const onFs = () => { if (entered && !document.fullscreenElement) close.current(); };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (NEXT_KEYS.includes(e.key)) { e.preventDefault(); setBlack(false); setI((k) => Math.min(n - 1, k + 1)); }
      else if (PREV_KEYS.includes(e.key)) { e.preventDefault(); setBlack(false); setI((k) => Math.max(0, k - 1)); }
      else if (BLACK_KEYS.includes(e.key)) setBlack((b) => !b);
      else if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [n]);

  return createPortal(
    <div ref={wrap} className="present" onClick={() => setI((k) => Math.min(n - 1, k + 1))}>
      {box.w > 0 && <Slide doc={doc} index={i} width={box.w} height={box.h} cache={cache.current} black={black} audience />}
      <div className="present-bar" onClick={(e) => e.stopPropagation()}>
        <button className="rt-btn" aria-label="Previous" onClick={() => setI((k) => Math.max(0, k - 1))}><ChevronLeft size={18} /></button>
        <span className="num">{i + 1} / {n}</span>
        <button className="rt-btn" aria-label="Next" onClick={() => setI((k) => Math.min(n - 1, k + 1))}><ChevronRight size={18} /></button>
        <button className="rt-btn" aria-label={black ? 'Show slide' : 'Black screen'} title="Black screen (B)" onClick={() => setBlack(!black)}>{black ? <Eye size={17} /> : <EyeOff size={17} />}</button>
        <button className="rt-btn" aria-label="Stop presenting" onClick={() => close.current()}><X size={18} /></button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- audience screen (second window)
export function PresentOut() {
  const [state, setState] = useState(null);
  const wrap = useRef(null);
  const cache = useRef({});
  const box = useBox(wrap);
  useEffect(() => {
    document.title = 'Church Studio audience screen';
    const ch = openChannel((m) => { if (m?.type === 'state') setState(m); if (m?.type === 'end') window.close(); });
    ch.post({ type: 'hello' });
    // A clicker pointed at this window still works: pass its keys to the console.
    const key = (e) => { ch.post({ type: 'key', key: e.key }); if (e.key === 'Escape') ch.post({ type: 'bye' }); };
    const bye = () => ch.post({ type: 'bye' });
    window.addEventListener('keydown', key);
    window.addEventListener('beforeunload', bye);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', bye); ch.close(); };
  }, []);
  return (
    <div ref={wrap} className="present out">
      {state && box.w > 0 && <Slide doc={state.doc} index={state.index} width={box.w} height={box.h} cache={cache.current} black={state.black} audience />}
    </div>
  );
}

// ---------------------------------------------------------------- presenter console
function Clock({ since }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.floor((Date.now() - since) / 1000);
  const now = new Date();
  return (
    <div className="pc-clock">
      <span className="num">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>
      <span className="muted small num">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
    </div>
  );
}

/**
 * The operator's view while the audience screen is live.
 * live = { index, black, doc (what the audience sees) }; doc = the latest edits.
 */
export function PresenterConsole({ doc, live, pending, onGo, onBlack, onPush, onEdit, onStop, displayName }) {
  const cache = useRef({});
  const mainRef = useRef(null);
  const nextRef = useRef(null);
  const mainBox = useBox(mainRef);
  const nextBox = useBox(nextRef);
  const [since] = useState(Date.now());
  const n = doc.pages.length;
  const i = live.index;
  const notes = doc.pages[i]?.notes;
  return createPortal(
    <div className="pc" role="dialog" aria-label="Presenter console">
      <div className="pc-top">
        <span className="pc-live"><span className="status-dot" aria-hidden="true" />Live{displayName ? ` on ${displayName}` : ''}</span>
        <strong className="grow">{doc.name}</strong>
        <Clock since={since} />
        <button className="btn sm" onClick={onEdit}><Pencil size={14} />Edit slides</button>
        <button className="btn sm danger" onClick={onStop}><X size={14} />End show</button>
      </div>
      <div className="pc-body">
        <div className="pc-main">
          <span className="eyebrow">On screen · {i + 1} of {n}</span>
          <div ref={mainRef} className="pc-stage">
            {mainBox.w > 0 && <Slide doc={live.doc} index={i} width={mainBox.w} height={mainBox.h} cache={cache.current} black={live.black} className="pc-shadow" audience />}
            {live.black && <span className="pc-black">Screen is black</span>}
          </div>
          {pending && (
            <div className="pc-pending glass">
              <span className="grow small">You changed this slide. The audience still sees the last version.</span>
              <button className="btn primary sm" onClick={onPush}><RefreshCw size={14} />Update screen</button>
            </div>
          )}
        </div>
        <div className="pc-side">
          <span className="eyebrow">Next</span>
          <div ref={nextRef} className="pc-next">
            {nextBox.w > 0 && (i + 1 < n ? <Slide doc={doc} index={i + 1} width={nextBox.w} height={nextBox.h} cache={cache.current} className="pc-shadow" /> : <span className="muted small">End of the deck</span>)}
          </div>
          <span className="eyebrow">Notes</span>
          <div className="pc-notes">{notes ? notes : <span className="muted">No notes on this slide.</span>}</div>
          <div className="pc-ctl">
            <button className="btn" onClick={() => onGo(Math.max(0, i - 1))} disabled={i === 0}><ChevronLeft size={16} />Back</button>
            <button className={`btn ${live.black ? 'primary' : ''}`} onClick={onBlack} title="Black screen (B)">{live.black ? <Eye size={15} /> : <EyeOff size={15} />}{live.black ? 'Show' : 'Black'}</button>
            <button className="btn primary" onClick={() => onGo(Math.min(n - 1, i + 1))} disabled={i >= n - 1}>Next<ChevronRight size={16} /></button>
          </div>
          <span className="hint">Clickers work here. Arrows, Page Up and Page Down move. B blacks out the screen.</span>
        </div>
      </div>
      <div className="pc-strip">
        {doc.pages.map((p, k) => (
          <button key={p.id} className={`pc-thumb ${k === i ? 'on' : ''}`} onClick={() => onGo(k)} aria-label={`Show slide ${k + 1}`}>
            <Slide doc={doc} index={k} width={150} height={90} cache={cache.current} />
            <span className="num">{k + 1}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
