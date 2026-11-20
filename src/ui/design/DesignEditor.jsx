import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowLeft, BringToFront, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Copy, Download, Grid3x3, Image as ImageIcon,
  Magnet, Minus, MonitorUp, Hexagon, Scaling, Smartphone, Laptop, Eraser, ImageOff, Play, RefreshCw, Plus, QrCode, Redo2, SendToBack, Shapes, Square, Trash2, Type, Undo2, Shuffle, X,
  Send,
} from 'lucide-react';
import { useApp, useHelperFocus } from '../App.jsx';
import { api } from '../api.js';
import ColorField from '../components/ColorField.jsx';
import FontMenu, { useFamilies } from '../components/FontMenu.jsx';
import BackgroundEraser from '../components/BackgroundEraser.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import Popover, { PopList } from '../components/Popover.jsx';
import { DEVICE_ASPECT, KINDS, PATTERNS, RESIZE_TARGETS, SHAPES, resizeDesign, blankPage, cohesive, loadAssets, onColor, page as newPage, renderPage, shape as newShape, svgColors, text as newText, uid } from './model.js';
import { snapMove } from './snap.js';
import PhotoEdits from './PhotoEdits.jsx';
import Layers from './Layers.jsx';
import CampaignHeader from '../components/CampaignHeader.jsx';
import { exportDesign } from './exporters.js';
import { BLACK_KEYS, NEXT_KEYS, PREV_KEYS, PresentHere, PresenterConsole, openChannel } from './Presenter.jsx';

const clone = (x) => JSON.parse(JSON.stringify(x));
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// ---------------------------------------------------------------- page thumbnail
function PageThumb({ doc, pg, width = 132 }) {
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    const cache = PageThumb.cache;
    const t = setTimeout(async () => {
      await loadAssets(pg, cache);
      if (live && ref.current) renderPage(ref.current, doc, pg, (width * 2) / doc.size.w, cache);
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [doc.palette, doc.tint, doc.size, pg, width]);
  return <canvas ref={ref} style={{ width, aspectRatio: `${doc.size.w}/${doc.size.h}` }} />;
}
PageThumb.cache = {};

// ---------------------------------------------------------------- editor
export default function DesignEditor({ id, onClose }) {
  const { toast, config, showNext, go } = useApp();
  const families = useFamilies();
  const [doc, setDoc] = useState(null);
  const [pi, setPi] = useState(0);
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [guides, setGuides] = useState([]);
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(false);
  const [picker, setPicker] = useState(null);
  const [erasing, setErasing] = useState(null); // library path of the picture being cleared
  const [saved, setSaved] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [presenting, setPresenting] = useState(null);
  const [presentOpen, setPresentOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [sizes, setSizes] = useState([]);
  const [displays, setDisplays] = useState([]);
  const [show, setShow] = useState(null); // live on a second screen: { index, black, doc, display }
  const [consoleOpen, setConsoleOpen] = useState(true);
  const chan = useRef(null);
  const [lines, setLines] = useState(null);
  const [stage, setStage] = useState({ w: 800, h: 600 });
  const past = useRef([]); const future = useRef([]);
  const canvas = useRef(null); const stageRef = useRef(null);
  const cache = useRef({}); const boxes = useRef({});
  const drag = useRef(null);
  const clip = useRef(null);
  const [, force] = useState(0);

  useEffect(() => {
    api.get(`/api/designs/${id}`).then((r) => {
      const d = r.design;
      // Fresh from a template: select its photo spot so adding a photo is the one thing left to do.
      if (d.firstPhoto) {
        delete d.firstPhoto;
        const spot = d.pages[0]?.items.find((x) => x.type === 'shape' && x.frame && !x.photo);
        if (spot) { setSel(spot.id); toast({ text: 'Add your photo to finish. Press Replace with a photo on the right.' }); }
        setSaved(false);
      }
      setDoc(d);
    }).catch((e) => { toast({ kind: 'error', text: e.message }); onClose(); });
  }, [id]);

  // History
  const update = useCallback((fn, { record = true } = {}) => {
    setDoc((d) => {
      if (record) { past.current.push(d); if (past.current.length > 80) past.current.shift(); future.current = []; }
      const next = fn(clone(d));
      return next;
    });
    setSaved(false);
  }, []);
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(doc); setDoc(prev); setSaved(false); };
  const redo = () => { const next = future.current.pop(); if (!next) return; past.current.push(doc); setDoc(next); setSaved(false); };

  // Autosave with a small cover image for the home screen.
  useEffect(() => {
    if (!doc || saved) return undefined;
    const t = setTimeout(async () => {
      let thumb = null;
      try {
        const c = document.createElement('canvas');
        await loadAssets(doc.pages[0], cache.current);
        renderPage(c, doc, doc.pages[0], 360 / doc.size.w, cache.current);
        thumb = c.toDataURL('image/jpeg', 0.82);
      } catch { /* no cover */ }
      await api.put(`/api/designs/${doc.id}`, { ...doc, thumb });
      setSaved(true);
    }, 700);
    return () => clearTimeout(t);
  }, [doc, saved]);

  // Stage size → canvas display size.
  useLayoutEffect(() => {
    if (!stageRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [doc == null]);

  const pg = doc?.pages[Math.min(pi, (doc?.pages.length || 1) - 1)];
  const fit = doc ? Math.min((stage.w - 56) / doc.size.w, (stage.h - 56) / doc.size.h) : 1;
  const dispW = doc ? Math.max(120, doc.size.w * fit) : 0; const dispH = doc ? Math.max(120, doc.size.h * fit) : 0;

  // Draw the current page.
  useEffect(() => {
    if (!doc || !pg) return undefined;
    let live = true;
    (async () => {
      await loadAssets(pg, cache.current);
      await document.fonts.ready;
      if (!live || !canvas.current) return;
      boxes.current = renderPage(canvas.current, doc, pg, (dispW / doc.size.w) * (window.devicePixelRatio || 1), cache.current, { skip: editing });
      force((n) => n + 1);
    })();
    return () => { live = false; };
  }, [doc, pg, dispW, editing]);

  // Lines from recent sermons, for quick text.
  useEffect(() => {
    api.get('/api/projects').then(async ({ projects }) => {
      const ready = projects.filter((p) => p.status === 'transcribed').slice(0, 3);
      const out = [];
      for (const p of ready) {
        const o = await api.get(`/api/outline/${p.id}`).then((r) => r.outline).catch(() => null);
        if (o) out.push({ sermon: p.title, lines: [...o.quotes, ...o.points.map((x) => x.heading), ...o.refs] });
      }
      setLines(out);
    }).catch(() => setLines([]));
  }, []);

  const item = pg?.items.find((x) => x.id === sel) || null;
  const setItem = (p, opts) => update((d) => { const it = d.pages[pi].items.find((x) => x.id === sel); Object.assign(it, p); return d; }, opts);
  // The helper chat sees this design. A picked headline replaces the text box that's selected.
  useHelperFocus(id ? { kind: 'design', id, selectedText: item?.type === 'text' ? item.text : undefined } : null, (field, value) => {
    if (field !== 'text') return false;
    if (item?.type !== 'text') return 'Click the text you want to replace, then press Use.';
    setItem({ text: value });
    return true;
  });
  const setPage = (p, opts) => update((d) => { Object.assign(d.pages[pi], p); return d; }, opts);
  const addItem = (it) => { update((d) => { d.pages[pi].items.push(it); return d; }); setSel(it.id); };
  const removeItem = () => { if (!sel) return; update((d) => { d.pages[pi].items = d.pages[pi].items.filter((x) => x.id !== sel); return d; }); setSel(null); };
  const duplicateItem = () => { if (!item) return; const c = { ...clone(item), id: uid(), x: Math.min(0.95, item.x + 0.03), y: Math.min(0.95, item.y + 0.03) }; addItem(c); };
  const reorder = (dir) => update((d) => {
    const list = d.pages[pi].items; const k = list.findIndex((x) => x.id === sel); if (k < 0) return d;
    const [it] = list.splice(k, 1); list.splice(dir === 'front' ? list.length : dir === 'back' ? 0 : Math.max(0, Math.min(list.length, k + dir)), 0, it); return d;
  });
  const alignTo = (where) => {
    const b = boxes.current[sel]; if (!b || !item) return;
    const w = b.x1 - b.x0; const h = b.y1 - b.y0;
    const p = { left: { x: w / 2 }, hcenter: { x: 0.5 }, right: { x: 1 - w / 2 }, top: { y: h / 2 }, vcenter: { y: 0.5 }, bottom: { y: 1 - h / 2 } }[where];
    setItem(p);
  };

  // Pages
  const addPage = () => { update((d) => { d.pages.splice(pi + 1, 0, blankPage(d.kind)); return d; }); setPi(pi + 1); setSel(null); };
  const dupPage = (k = pi) => { update((d) => { const c = clone(d.pages[k]); c.id = uid(); c.items.forEach((x) => { x.id = uid(); }); d.pages.splice(k + 1, 0, c); return d; }); setPi(k + 1); };
  const delPage = (k = pi) => { if (doc.pages.length < 2) return; update((d) => { d.pages.splice(k, 1); return d; }); setPi(Math.max(0, Math.min(k, doc.pages.length - 2))); setSel(null); };
  const movePage = (k, dir) => { const t = k + dir; if (t < 0 || t >= doc.pages.length) return; update((d) => { const [x] = d.pages.splice(k, 1); d.pages.splice(t, 0, x); return d; }); setPi(t); };

  // Pointer: select, drag with snapping, resize.
  const frac = (e) => { const r = canvas.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const hit = (p) => { for (const it of [...pg.items].reverse()) { const b = boxes.current[it.id]; if (b && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) return it; } return null; };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const p = frac(e); const it = hit(p);
    setEditing(null);
    if (!it) { setSel(null); return; }
    setSel(it.id);
    drag.current = { pending: doc, mode: 'move', id: it.id, start: p, orig: { ...it }, box: { ...boxes.current[it.id] } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startResize = (e, mode) => {
    e.stopPropagation();
    past.current.push(doc); future.current = [];
    drag.current = { mode, id: item.id, start: frac(e), orig: { ...item }, box: { ...boxes.current[item.id] } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    if (d.pending) { past.current.push(d.pending); future.current = []; d.pending = null; }
    const p = frac(e);
    const { orig, box } = d;
    const th = 7 / dispW; const thy = 7 / dispH;
    if (d.mode === 'move') {
      let dx = p.x - d.start.x; let dy = p.y - d.start.y;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const moved = { x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy };
      const others = pg.items.filter((x) => x.id !== d.id).map((x) => boxes.current[x.id]).filter(Boolean);
      const s = snap || grid ? snapMove(moved, others, { thresholdX: th, thresholdY: thy, grid: grid ? 1 / 12 : 0, aspect: doc.size.w / doc.size.h, items: snap }) : { dx: 0, dy: 0, guides: [] };
      if (e.altKey) { s.dx = 0; s.dy = 0; s.guides = []; }
      setGuides(s.guides);
      update((dd) => { const it = dd.pages[pi].items.find((x) => x.id === d.id); it.x = +(orig.x + dx + s.dx).toFixed(4); it.y = +(orig.y + dy + s.dy).toFixed(4); return dd; }, { record: false });
      return;
    }
    const x0 = box.x0; const y0 = box.y0;
    update((dd) => {
      const it = dd.pages[pi].items.find((x) => x.id === d.id);
      if (d.mode === 'e') {
        const w = Math.max(0.03, p.x - x0); it.w = +w.toFixed(4); it.x = +(x0 + w / 2).toFixed(4);
      } else if (d.mode === 'w') {
        const x1 = box.x1; const w = Math.max(0.03, x1 - p.x); it.w = +w.toFixed(4); it.x = +(x1 - w / 2).toFixed(4);
      } else if (d.mode === 's' && it.type === 'shape') {
        const h = Math.max(0.003, p.y - y0); it.h = +h.toFixed(4); it.y = +(y0 + h / 2).toFixed(4);
      } else if (d.mode === 'se') {
        if (it.type === 'shape' && DEVICE_ASPECT[it.shape]) {
          const w = Math.max(0.05, p.x - x0); const h = (w * doc.size.w) / doc.size.h / DEVICE_ASPECT[it.shape];
          it.w = +w.toFixed(4); it.h = +h.toFixed(4); it.x = +(x0 + w / 2).toFixed(4); it.y = +(y0 + h / 2).toFixed(4);
        } else if (it.type === 'shape') {
          const w = Math.max(0.01, p.x - x0); const h = Math.max(0.003, p.y - y0);
          it.w = +w.toFixed(4); it.h = +h.toFixed(4); it.x = +(x0 + w / 2).toFixed(4); it.y = +(y0 + h / 2).toFixed(4);
        } else {
          const f = Math.max(0.1, (p.x - x0) / (box.x1 - x0));
          it.w = +(orig.w * f).toFixed(4); it.x = +(x0 + it.w / 2).toFixed(4);
          const h = (box.y1 - box.y0) * f; it.y = +(y0 + h / 2).toFixed(4);
          if (it.type === 'text') it.size = Math.max(8, Math.round(orig.size * f));
        }
      }
      return dd;
    }, { record: false });
  };
  const onUp = () => { drag.current = null; setGuides([]); };

  // Keyboard
  useEffect(() => {
    const key = (e) => {
      if (presenting != null || (show && consoleOpen) || isTyping(document.activeElement) || editing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateItem(); return; }
      if (mod && e.key.toLowerCase() === 'c' && item) { clip.current = clone(item); return; }
      if (mod && e.key.toLowerCase() === 'v' && clip.current) { e.preventDefault(); addItem({ ...clone(clip.current), id: uid(), x: clip.current.x + 0.02, y: clip.current.y + 0.02 }); return; }
      if (!item) return;
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeItem(); }
      if (e.key === 'Escape') setSel(null);
      if (e.key === 'Enter' && item.type === 'text') { e.preventDefault(); setEditing(item.id); }
      const step = (e.shiftKey ? 10 : 1);
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv) { e.preventDefault(); setItem({ x: +(item.x + mv[0] / doc.size.w).toFixed(4), y: +(item.y + mv[1] / doc.size.h).toFixed(4) }); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ---- second-screen show
  const showRef = useRef(show); showRef.current = show;
  const docRef = useRef(doc); docRef.current = doc;
  const sendState = (st) => chan.current?.post({ type: 'state', doc: st.doc, index: st.index, black: st.black });
  const goLive = (index, opts = {}) => setShow((st) => {
    if (!st) return st;
    const d = docRef.current;
    const next = { ...st, index: Math.max(0, Math.min(d.pages.length - 1, index)), black: opts.black ?? false, doc: d };
    sendState(next);
    return next;
  });
  const endShow = () => {
    chan.current?.post({ type: 'end' });
    window.desktop?.presentClose?.();
    chan.current?.close(); chan.current = null;
    setShow(null);
  };
  const startShow = async (display) => {
    setPresentOpen(false);
    chan.current?.close();
    chan.current = openChannel((m) => {
      const st = showRef.current;
      if (!st) return;
      if (m.type === 'hello') sendState(st);
      if (m.type === 'bye') endShow();
      if (m.type === 'key') {
        if (NEXT_KEYS.includes(m.key)) goLive(st.index + 1);
        else if (PREV_KEYS.includes(m.key)) goLive(st.index - 1);
        else if (BLACK_KEYS.includes(m.key)) goLive(st.index, { black: !st.black });
      }
    });
    const st = { index: pi, black: false, doc, display: display?.label || null };
    setShow(st);
    setConsoleOpen(true);
    if (window.desktop?.presentOpen) {
      const r = await window.desktop.presentOpen({ displayId: display?.id ?? null });
      if (!r?.ok) { toast({ kind: 'error', text: r?.error || 'Could not open the audience screen.' }); endShow(); }
    } else {
      window.open('/#present-out', 'church-studio-present', 'width=960,height=540');
    }
  };
  const openPresentMenu = async () => {
    setPresentOpen(!presentOpen);
    if (window.desktop?.displays) setDisplays(await window.desktop.displays().catch(() => []));
  };
  useEffect(() => () => { if (chan.current) { chan.current.post({ type: 'end' }); window.desktop?.presentClose?.(); chan.current.close(); } }, []);
  // Clicker and keys while live. In the console every key works; while editing, only Page Up and Page Down.
  useEffect(() => {
    if (!show) return undefined;
    const key = (e) => {
      const st = showRef.current;
      if (!consoleOpen) {
        if (e.key === 'PageDown') { e.preventDefault(); goLive(st.index + 1); }
        if (e.key === 'PageUp') { e.preventDefault(); goLive(st.index - 1); }
        return;
      }
      if (isTyping(document.activeElement)) return;
      if (NEXT_KEYS.includes(e.key)) { e.preventDefault(); goLive(st.index + 1); }
      else if (PREV_KEYS.includes(e.key)) { e.preventDefault(); goLive(st.index - 1); }
      else if (BLACK_KEYS.includes(e.key)) goLive(st.index, { black: !st.black });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [show != null, consoleOpen]);
  const livePending = show && doc && JSON.stringify([doc.pages[show.index], doc.palette, doc.tint]) !== JSON.stringify([show.doc.pages[show.index], show.doc.palette, show.doc.tint]);

  const runExport = async (format) => {
    setExportOpen(false);
    setBusy('Exporting…');
    try {
      const r = await exportDesign(doc, format, { pageIndex: pi, onProgress: (i, n) => setBusy(n > 1 ? `Exporting page ${i + 1} of ${n}…` : 'Exporting…') });
      showNext({ kind: 'design', title: doc.name, rel: r.rel, thumb: null });
      toast({ celebrate: true, text: r.count ? `Saved ${r.count} pages to Graphics in your brand library.` : 'Saved to Graphics in your brand library.', action: { label: 'Show', run: () => api.post('/api/library/reveal', { rel: r.rel }) } });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(null);
  };

  if (!doc) return <div className="page"><div className="skeleton" style={{ height: '70vh' }} /></div>;
  const colors = cohesive(doc.palette, doc.tint?.color || '#FF9A62', doc.tint?.amount || 0);
  const brand = config.brandFonts || { heading: 'Montserrat', body: 'Montserrat' };
  const b = sel ? boxes.current[sel] : null;
  const multi = KINDS[doc.kind]?.multi || doc.pages.length > 1;
  const fill = colors[0];

  return (
    <div className="dz">
      {/* top bar */}
      <div className="dz-top glass">
        <button className="btn ghost sm" onClick={onClose}><ArrowLeft size={15} />Designs</button>
        <input className="dz-name" value={doc.name} onChange={(e) => update((d) => { d.name = e.target.value; return d; }, { record: false })} aria-label="Design name" />
        <span className="chip">{KINDS[doc.kind]?.label || 'Design'} · {doc.size.w}×{doc.size.h}</span>
        <span className="muted small">{saved ? <><Check size={12} /> Saved</> : 'Saving…'}</span>
        <div className="grow" />
        <div className="rt-group">
          <button className="rt-btn" title="Undo (⌘Z)" aria-label="Undo" disabled={!past.current.length} onClick={undo}><Undo2 size={16} /></button>
          <button className="rt-btn" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 size={16} /></button>
          <span className="rt-sep" />
          <button className={`rt-btn ${snap ? 'on' : ''}`} title="Snap to page center, edges and other items (hold Option to skip)" aria-label="Smart guides" aria-pressed={snap} onClick={() => setSnap(!snap)}><Magnet size={16} /></button>
          <button className={`rt-btn ${grid ? 'on' : ''}`} title="Show and snap to a grid" aria-label="Grid" aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid3x3 size={16} /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn sm" data-pop-trigger onClick={() => setResizeOpen(!resizeOpen)}><Scaling size={14} />Resize</button>
          <Popover open={resizeOpen} onClose={() => setResizeOpen(false)} align="right" width={270}>
            <div className="stack" style={{ gap: 6, padding: 6 }}>
              <strong className="small">Make copies in other sizes</strong>
              {RESIZE_TARGETS.filter((t) => !(t[2] === doc.size.w && t[3] === doc.size.h)).map((t) => (
                <label key={t[0]} className="row small" style={{ gap: 8 }}>
                  <input type="checkbox" checked={sizes.includes(t[0])} onChange={(e) => setSizes(e.target.checked ? [...sizes, t[0]] : sizes.filter((x) => x !== t[0]))} />
                  <span className="grow">{t[1]}</span><span className="muted num">{t[2]}×{t[3]}</span>
                </label>
              ))}
              <button className="btn primary sm" disabled={!sizes.length} onClick={async () => {
                const made = [];
                for (const key of sizes) {
                  const copy = resizeDesign(doc, RESIZE_TARGETS.find((t) => t[0] === key));
                  await api.put(`/api/designs/${copy.id}`, copy);
                  made.push(copy);
                }
                setResizeOpen(false); setSizes([]);
                toast({ celebrate: true, text: `Made ${made.length} new size${made.length > 1 ? 's' : ''}. Find them with your designs.`, action: { label: 'Back to designs', run: onClose } });
              }}>Make {sizes.length || ''} cop{sizes.length === 1 ? 'y' : 'ies'}</button>
              <span className="hint">The layout carries over. Check each one and nudge anything that needs it.</span>
            </div>
          </Popover>
        </div>
        {show ? (
          <div className="row" style={{ gap: 6 }}>
            <span className="pc-live sm"><span className="status-dot" aria-hidden="true" />Live · {show.index + 1}</span>
            {livePending && <button className="btn sm" onClick={() => goLive(show.index, { black: show.black })}><RefreshCw size={13} />Update screen</button>}
            <button className="btn sm" onClick={() => setConsoleOpen(true)}><MonitorUp size={14} />Console</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <button className="btn sm" data-pop-trigger onClick={openPresentMenu}><Play size={14} />Present<ChevronDown size={13} /></button>
            <Popover open={presentOpen} onClose={() => setPresentOpen(false)} align="right" width={280}>
              <PopList onPick={(v) => { if (v === 'here') { setPresentOpen(false); setPresenting(pi); } else startShow(v === 'window' ? null : displays.find((x) => String(x.id) === v)); }} items={[
                { label: 'On this screen', value: 'here', hint: 'Full screen. Esc to stop.' },
                ...displays.filter((x) => !x.primary).map((x) => ({ label: `To ${x.label}`, value: String(x.id), hint: 'Audience sees the slides. You get notes and the next slide.' })),
                ...(displays.filter((x) => !x.primary).length ? [] : [{ label: 'To a second screen', value: 'window', hint: window.desktop?.isDesktop ? 'No second screen found. Opens a window you can drag to a projector.' : 'Opens a window you can drag to a projector.' }]),
              ]} />
            </Popover>
          </div>
        )}
        {doc.kind !== 'presentation' && doc.kind !== 'notes' && (
          <button className="btn sm" title="Plan a post with this design" onClick={async () => {
            let thumb = null;
            try { const c = document.createElement('canvas'); await loadAssets(doc.pages[0], cache.current); renderPage(c, doc, doc.pages[0], 360 / doc.size.w, cache.current); thumb = c.toDataURL('image/jpeg', 0.82); } catch { /* no cover */ }
            await api.put(`/api/designs/${doc.id}`, { ...doc, thumb });
            go({ name: 'social', compose: { design: { id: doc.id, name: doc.name, thumb, size: doc.size } } });
          }}><Send size={14} />Plan a post</button>
        )}
        <div style={{ position: 'relative' }}>
          <button className="btn primary sm" data-pop-trigger disabled={Boolean(busy)} onClick={() => setExportOpen(!exportOpen)}><Download size={14} />{busy || 'Export'}<ChevronDown size={14} /></button>
          <Popover open={exportOpen} onClose={() => setExportOpen(false)} align="right" width={250}>
            <PopList onPick={runExport} items={[
              { label: doc.pages.length > 1 ? 'PNG, this page' : 'PNG image', value: 'png-one', hint: 'Best for posting' },
              ...(doc.pages.length > 1 ? [{ label: `PNG, all ${doc.pages.length} pages`, value: 'png-all', hint: 'A folder of images, in order' }] : []),
              { label: 'PDF', value: 'pdf', hint: 'For sharing and printing at home' },
              { label: 'Print shop PDF', value: 'pdf-print', hint: `300 dpi with bleed and crop marks · ${(doc.size.w / 150).toFixed(1)} x ${(doc.size.h / 150).toFixed(1)} in` },
              { label: 'PowerPoint (.pptx)', value: 'pptx', hint: 'Opens in PowerPoint, Keynote and ProPresenter' },
            ]} />
          </Popover>
        </div>
      </div>

      <div className="dz-body">
        {/* add panel */}
        <aside className="dz-side glass stack">
          <span className="eyebrow">Add</span>
          <button className="dz-add-text h" style={{ fontFamily: `'${brand.heading}'` }} onClick={() => addItem(newText({ text: 'Add a heading', font: brand.heading, size: Math.round(doc.size.w * 0.07), weight: 800, color: onColor(fill), y: 0.4 }))}>Add a heading</button>
          <button className="dz-add-text s" style={{ fontFamily: `'${brand.heading}'` }} onClick={() => addItem(newText({ text: 'Add a subheading', font: brand.heading, size: Math.round(doc.size.w * 0.04), weight: 700, color: onColor(fill), y: 0.55 }))}>Add a subheading</button>
          <button className="dz-add-text b" style={{ fontFamily: `'${brand.body}'` }} onClick={() => addItem(newText({ text: 'Add a little body text', font: brand.body, size: Math.round(doc.size.w * 0.028), weight: 500, lh: 1.35, color: onColor(fill), y: 0.65 }))}>Add a little body text</button>
          {lines?.length > 0 && (
            <LinePicker lines={lines} onPick={(t) => addItem(newText({ text: /:\d/.test(t) && t.length < 30 ? t : `“${t.replace(/^“|”$/g, '')}”`, font: brand.heading, size: Math.round(doc.size.w * 0.05), weight: 700, w: 0.8, lh: 1.2, color: onColor(fill) }))} />
          )}
          <hr className="hairline" />
          <span className="eyebrow">Shapes</span>
          <div className="dz-shapes">
            <button aria-label="Square" title="Square" onClick={() => addItem(newShape({ w: 0.3, h: 0.3 * (doc.size.w / doc.size.h), fill: colors[1] }))}><Square size={22} /></button>
            <button aria-label="Rounded box" title="Rounded box" onClick={() => addItem(newShape({ w: 0.5, h: 0.12, radius: 40, fill: '#FFFFFF', opacity: 0.85 }))}><span className="dz-rounded" /></button>
            <button aria-label="Circle" title="Circle" onClick={() => addItem(newShape({ shape: 'ellipse', w: 0.25, h: 0.25 * (doc.size.w / doc.size.h), fill: colors[4] || colors[1] }))}><Circle size={22} /></button>
            <button aria-label="Hexagon" title="Hexagon" onClick={() => addItem(newShape({ shape: 'hexagon', w: 0.3, h: 0.26 * (doc.size.w / doc.size.h), fill: colors[0] }))}><Hexagon size={22} /></button>
            <button aria-label="Arch" title="Arch" onClick={() => addItem(newShape({ shape: 'arch', w: 0.3, h: 0.42 * (doc.size.w / doc.size.h), fill: colors[4] || colors[1] }))}><span className="dz-arch" /></button>
            <button aria-label="Blob" title="Blob" onClick={() => addItem(newShape({ shape: 'blob', w: 0.34, h: 0.3 * (doc.size.w / doc.size.h), fill: colors[1] }))}><span className="dz-blob" /></button>
            <button aria-label="Badge" title="Badge" onClick={() => addItem(newShape({ shape: 'scallop', w: 0.2, h: 0.2 * (doc.size.w / doc.size.h), fill: colors[1] }))}><span className="dz-ico">✿</span></button>
            <button aria-label="Starburst" title="Starburst" onClick={() => addItem(newShape({ shape: 'burst', w: 0.16, h: 0.16 * (doc.size.w / doc.size.h), fill: colors[1] }))}><span className="dz-ico">✺</span></button>
            <button aria-label="Window card" title="Window card" onClick={() => addItem(newShape({ shape: 'window', w: 0.56, h: 0.3 * (doc.size.w / doc.size.h), fill: '#FFFFFF' }))}><span className="dz-ico">▭</span></button>
            <button aria-label="Line" title="Line" onClick={() => addItem(newShape({ w: 0.5, h: 3 / doc.size.h, fill: onColor(fill) }))}><Minus size={22} /></button>
          </div>
          <span className="eyebrow">Frames</span>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => addItem(newShape({ frame: true, w: 0.44, h: 0.32 * (doc.size.w / doc.size.h), radius: 24, fill: colors[2] || '#555' }))}><ImageIcon size={13} />Photo frame</button>
            <button className="btn sm" onClick={() => addItem(newShape({ shape: 'wave', frame: true, w: 0.5, h: 0.4 * (doc.size.w / doc.size.h), fill: colors[0] }))}><ImageIcon size={13} />Wavy frame</button>
            <button className="btn sm" onClick={() => addItem(newShape({ shape: 'iphone', frame: true, w: 0.22, h: (0.22 * doc.size.w) / doc.size.h / DEVICE_ASPECT.iphone, fill: colors[0] }))}><Smartphone size={13} />iPhone</button>
            <button className="btn sm" onClick={() => addItem(newShape({ shape: 'macbook', frame: true, w: 0.56, h: (0.56 * doc.size.w) / doc.size.h / DEVICE_ASPECT.macbook, fill: colors[0] }))}><Laptop size={13} />MacBook</button>
          </div>
          <hr className="hairline" />
          <span className="eyebrow">Images</span>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setPicker('photo')}><ImageIcon size={13} />Photo</button>
            <button className="btn sm" onClick={() => setPicker('logo')}><Shapes size={13} />Logo</button>
            <button className="btn sm" onClick={() => addItem({ id: uid(), type: 'qr', url: 'https://', x: 0.5, y: 0.7, w: 0.22, color: onColor(fill) })}><QrCode size={13} />QR code</button>
          </div>
        </aside>

        {/* canvas */}
        <div className="dz-center" onPointerDown={(e) => { if (e.target === e.currentTarget && !editing) setSel(null); }}>
          {doc.source?.campaignId && <CampaignHeader campaignId={doc.source.campaignId} compact />}
          <div ref={stageRef} className="dz-stage" onPointerDown={(e) => { if (e.target === e.currentTarget && !editing) setSel(null); }}>
            <div className="dz-canvas" style={{ width: dispW, height: dispH }}>
              <canvas ref={canvas} style={{ width: dispW, height: dispH }} aria-label="Page" />
              <div className="dz-overlay" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                onDoubleClick={(e) => { const it = hit(frac(e)); if (it?.type === 'text') { setSel(it.id); setEditing(it.id); } }}>
                {grid && <div className="dz-grid" style={{ backgroundSize: `${dispW / 12}px ${dispW / 12}px` }} />}
                {guides.map((g, k) => (
                  <i key={k} className={`dz-guide ${g.axis} ${g.center ? 'center' : ''}`} style={g.axis === 'x' ? { left: g.at * dispW } : { top: g.at * dispH }} />
                ))}
                {b && !editing && (
                  <div className="dz-sel" style={{ left: b.x0 * dispW, top: b.y0 * dispH, width: (b.x1 - b.x0) * dispW, height: (b.y1 - b.y0) * dispH }}>
                    {item?.type !== 'image' && item?.type !== 'qr' && !DEVICE_ASPECT[item?.shape] && <i className="h w" onPointerDown={(e) => startResize(e, 'w')} />}
                    {item?.type !== 'image' && item?.type !== 'qr' && !DEVICE_ASPECT[item?.shape] && <i className="h e" onPointerDown={(e) => startResize(e, 'e')} />}
                    {item?.type === 'shape' && !DEVICE_ASPECT[item?.shape] && <i className="h s" onPointerDown={(e) => startResize(e, 's')} />}
                    <i className="h se" onPointerDown={(e) => startResize(e, 'se')} />
                  </div>
                )}
                {editing && item?.type === 'text' && b && (
                  <textarea
                    className="dz-inline"
                    autoFocus
                    value={item.text}
                    onChange={(e) => setItem({ text: e.target.value }, { record: false })}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditing(null); } e.stopPropagation(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      left: b.x0 * dispW, top: b.y0 * dispH, width: (b.x1 - b.x0) * dispW, minHeight: (b.y1 - b.y0) * dispH,
                      font: `${item.italic ? 'italic ' : ''}${item.weight} ${item.size * (dispW / doc.size.w)}px '${item.font}'`,
                      lineHeight: item.lh || 1.15, color: item.color, textAlign: item.align, letterSpacing: `${(item.letter || 0) * (dispW / doc.size.w)}px`,
                      textTransform: item.upper ? 'uppercase' : 'none', opacity: item.opacity ?? 1,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          {/* pages */}
          <div className="dz-pages">
            {doc.pages.map((p, k) => (
              <div key={p.id} className={`dz-page ${k === pi ? 'on' : ''}`}>
                <button className="dz-page-thumb" onClick={() => { setPi(k); setSel(null); setEditing(null); }} aria-label={`Page ${k + 1}`}>
                  <PageThumb doc={doc} pg={p} width={doc.size.w >= doc.size.h ? 132 : 74} />
                </button>
                <span className="dz-page-n num">{k + 1}</span>
                {k === pi && (
                  <div className="dz-page-tools">
                    <button aria-label="Move left" title="Move left" disabled={k === 0} onClick={() => movePage(k, -1)}><ChevronLeft size={13} /></button>
                    <button aria-label="Duplicate page" title="Duplicate page" onClick={() => dupPage(k)}><Copy size={13} /></button>
                    <button aria-label="Delete page" title="Delete page" disabled={doc.pages.length < 2} onClick={() => delPage(k)}><Trash2 size={13} /></button>
                    <button aria-label="Move right" title="Move right" disabled={k === doc.pages.length - 1} onClick={() => movePage(k, 1)}><ChevronRight size={13} /></button>
                  </div>
                )}
              </div>
            ))}
            <button className="dz-page-add" onClick={addPage} aria-label="Add a page" title="Add a page"><Plus size={20} /></button>
          </div>
        </div>

        {/* inspector */}
        <aside className="dz-side glass stack dz-inspector">
          {item ? (
            <>
              <div className="row between"><span className="eyebrow">{{ text: 'Text', shape: 'Shape', image: 'Image', qr: 'QR code' }[item.type]}</span>
                <button className="rt-btn" aria-label="Done" title="Done (Esc)" onClick={() => setSel(null)}><X size={15} /></button></div>
              {item.type === 'text' && (
                <>
                  <textarea className="input" rows={3} value={item.text} onChange={(e) => setItem({ text: e.target.value }, { record: false })} onFocus={() => { past.current.push(doc); }} spellCheck />
                  <FontMenu value={String(item.font || '').replace(/'/g, '')} options={families} onChange={(v) => setItem({ font: v })} align="right" />
                  <div className="row" style={{ gap: 8 }}>
                    <div className="seg sm grow">{[[500, 'Regular'], [700, 'Bold'], [800, 'Heavy']].map(([w, l]) => <button key={w} className={item.weight === w ? 'on' : ''} onClick={() => setItem({ weight: w })}>{l}</button>)}</div>
                    <ColorField value={item.color} onChange={(c) => setItem({ color: c }, { record: false })} swatches={colors} align="right" />
                  </div>
                  <label className="field">Size · {item.size}<input type="range" min="12" max={Math.round(doc.size.w * 0.2)} value={item.size} onChange={(e) => setItem({ size: Number(e.target.value) }, { record: false })} /></label>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="seg sm">{['left', 'center', 'right'].map((a) => <button key={a} className={item.align === a ? 'on' : ''} onClick={() => setItem({ align: a })}>{a[0].toUpperCase() + a.slice(1)}</button>)}</div>
                    <button className={`pill-choice ${item.upper ? 'on' : ''}`} onClick={() => setItem({ upper: !item.upper })}>AA</button>
                    <button className={`pill-choice ${item.italic ? 'on' : ''}`} style={{ fontStyle: 'italic' }} onClick={() => setItem({ italic: !item.italic })}>I</button>
                  </div>
                  <div className="token-grid">
                    <label className="field">Spacing · {item.letter || 0}<input type="range" min="-4" max="20" value={item.letter || 0} onChange={(e) => setItem({ letter: Number(e.target.value) }, { record: false })} /></label>
                    <label className="field">Line height · {(item.lh || 1.15).toFixed(2)}<input type="range" min="0.8" max="2" step="0.05" value={item.lh || 1.15} onChange={(e) => setItem({ lh: Number(e.target.value) }, { record: false })} /></label>
                  </div>
                </>
              )}
              {item.type === 'shape' && (
                <>
                  {!DEVICE_ASPECT[item.shape] && !item.erase && (
                    <label className="field">Shape
                      <select className="input" value={item.shape || 'rect'} onChange={(e) => setItem({ shape: e.target.value })}>
                        {SHAPES.filter(([k]) => !DEVICE_ASPECT[k]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </label>
                  )}
                  {!item.erase && (
                    <div className="keycard stack" style={{ gap: 8 }}>
                      <strong className="small">{DEVICE_ASPECT[item.shape] ? 'Screen' : 'Photo'}</strong>
                      {item.photo ? (
                        <div className="row wrap" style={{ gap: 6 }}>
                          <button className="btn sm" onClick={() => setPicker('frame')}><ImageIcon size={13} />Change photo</button>
                          <button className="btn sm ghost" onClick={() => setItem({ photo: null, frame: true })}><ImageOff size={13} />Remove photo</button>
                        </div>
                      ) : (
                        <div className="row wrap" style={{ gap: 6 }}>
                          <button className="btn sm primary" onClick={() => setPicker('frame')}><ImageIcon size={13} />{item.frame ? 'Replace with a photo' : 'Fill with a photo'}</button>
                          {item.frame && <button className="btn sm" onClick={() => setItem({ frame: false })}>Make it solid</button>}
                        </div>
                      )}
                      {item.frame && !item.photo && <span className="hint">The pattern only shows while you edit. Exports show the color.</span>}
                    </div>
                  )}
                  {item.photo && !item.erase && <PhotoEdits value={item.adjust} colors={colors} onChange={(adjust) => setItem({ adjust }, { record: false })} />}
                  {!item.photo && !item.erase && <div className="row" style={{ gap: 10 }}><ColorField label={DEVICE_ASPECT[item.shape] ? 'Screen color' : 'Fill'} value={item.fill} onChange={(c) => setItem({ fill: c }, { record: false })} swatches={colors} /></div>}
                  {(item.shape || 'rect') === 'rect' && <label className="field">Corners · {item.radius || 0}<input type="range" min="0" max="200" value={item.radius || 0} onChange={(e) => setItem({ radius: Number(e.target.value) }, { record: false })} /></label>}
                  {!DEVICE_ASPECT[item.shape] && (
                    <label className="switch"><input type="checkbox" checked={Boolean(item.erase)} onChange={(e) => setItem({ erase: e.target.checked })} /><Eraser size={14} />Use as an eraser</label>
                  )}
                  {item.erase && (
                    <div className="stack" style={{ gap: 6 }}>
                      <span className="small" style={{ fontWeight: 600 }}>Erases</span>
                      <div className="seg sm">
                        <button className={!item.depth ? 'on' : ''} onClick={() => setItem({ depth: 0 })}>Everything under it</button>
                        <button className={item.depth > 0 ? 'on' : ''} onClick={() => setItem({ depth: item.depth || 1 })}>Some layers</button>
                      </div>
                      {item.depth > 0 && (() => {
                        const below = pg.items.findIndex((x) => x.id === item.id);
                        return <label className="field small">Layers under it · {Math.min(item.depth, Math.max(1, below))}<input type="range" min="1" max={Math.max(1, below)} value={Math.min(item.depth, Math.max(1, below))} onChange={(e) => setItem({ depth: Number(e.target.value) }, { record: false })} /></label>;
                      })()}
                      <span className="hint">{item.depth > 0 ? 'Cuts only the layers right under it. The background and anything lower stay.' : 'Cuts a see-through hole in everything behind it, background included.'} See the layers list to check what’s under it.</span>
                    </div>
                  )}
                </>
              )}
              {item.type === 'image' && <label className="field">Corners · {item.radius || 0}<input type="range" min="0" max="200" value={item.radius || 0} onChange={(e) => setItem({ radius: Number(e.target.value) }, { record: false })} /></label>}
              {item.type === 'image' && !/\.svg$/i.test(item.rel) && <button className="btn sm" onClick={() => setErasing(item.rel)}><Eraser size={13} />Erase background</button>}
              {item.type === 'image' && !/\.svg$/i.test(item.rel) && <PhotoEdits value={item.adjust} colors={colors} onChange={(adjust) => setItem({ adjust }, { record: false })} />}
              {item.type === 'image' && /\.svg$/i.test(item.rel) && <SvgColors item={item} cache={cache.current} swatches={colors} onChange={(recolor) => setItem({ recolor }, { record: false })} />}
              {item.type === 'qr' && (
                <>
                  <label className="field">Link<input className="input" value={item.url} onChange={(e) => setItem({ url: e.target.value }, { record: false })} placeholder="https://yourchurch.org/give" /></label>
                  <div className="row"><ColorField label="Color" value={item.color} onChange={(c) => setItem({ color: c }, { record: false })} swatches={colors} /></div>
                </>
              )}
              <label className="field">Opacity · {Math.round((item.opacity ?? 1) * 100)}%<input type="range" min="0.05" max="1" step="0.05" value={item.opacity ?? 1} onChange={(e) => setItem({ opacity: Number(e.target.value) }, { record: false })} /></label>
              <hr className="hairline" />
              <span className="eyebrow">Arrange</span>
              <div className="dz-align">
                <button title="Align left" aria-label="Align left" onClick={() => alignTo('left')}><AlignStartVertical size={16} /></button>
                <button title="Center across" aria-label="Center across" onClick={() => alignTo('hcenter')}><AlignCenterVertical size={16} /></button>
                <button title="Align right" aria-label="Align right" onClick={() => alignTo('right')}><AlignEndVertical size={16} /></button>
                <button title="Align top" aria-label="Align top" onClick={() => alignTo('top')}><AlignStartHorizontal size={16} /></button>
                <button title="Center up and down" aria-label="Center up and down" onClick={() => alignTo('vcenter')}><AlignCenterHorizontal size={16} /></button>
                <button title="Align bottom" aria-label="Align bottom" onClick={() => alignTo('bottom')}><AlignEndHorizontal size={16} /></button>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => reorder('front')}><BringToFront size={13} />To front</button>
                <button className="btn sm" onClick={() => reorder('back')}><SendToBack size={13} />To back</button>
                <button className="btn sm" onClick={duplicateItem}><Copy size={13} />Duplicate</button>
                <button className="btn sm ghost danger" onClick={removeItem}><Trash2 size={13} />Delete</button>
              </div>
              <hr className="hairline" />
              <Layers items={pg.items} sel={sel} onSelect={setSel} onMove={(from, to) => update((d) => { const list = d.pages[pi].items; const [x] = list.splice(from, 1); list.splice(to, 0, x); return d; })} onDelete={(id) => { update((d) => { d.pages[pi].items = d.pages[pi].items.filter((x) => x.id !== id); return d; }); if (id === sel) setSel(null); }} />
            </>
          ) : (
            <>
              <span className="eyebrow">Page {pi + 1}</span>
              <div className="seg sm">
                {[['mesh', 'Gradient'], ['solid', 'Solid'], ['gradient', 'Blend'], ['pattern', 'Pattern'], ['image', 'Photo']].map(([k, l]) => (
                  <button key={k} className={(pg.bg?.type || 'mesh') === k ? 'on' : ''} onClick={() => (k === 'image' ? setPicker('bg') : setPage({ bg: { ...pg.bg, type: k, color: pg.bg?.color || (k === 'pattern' ? colors[3] : colors[0]), pattern: pg.bg?.pattern || 'checker' } }))}>{l}</button>
                ))}
              </div>
              {pg.bg?.type === 'pattern' && (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="row wrap" style={{ gap: 6 }}>{PATTERNS.map(([k, l]) => <button key={k} className={`pill-choice ${pg.bg.pattern === k ? 'on' : ''}`} onClick={() => setPage({ bg: { ...pg.bg, pattern: k } })}>{l}</button>)}</div>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <ColorField label="Base" value={pg.bg.color || colors[3]} onChange={(c) => setPage({ bg: { ...pg.bg, color: c } }, { record: false })} swatches={colors} />
                    <ColorField label="Pattern" value={pg.bg.color2 || colors[0]} onChange={(c) => setPage({ bg: { ...pg.bg, color2: c } }, { record: false })} swatches={colors} align="right" />
                  </div>
                  <label className="field">Size · {Math.round((pg.bg.scale || 0.08) * 100)}<input type="range" min="0.02" max="0.25" step="0.01" value={pg.bg.scale || 0.08} onChange={(e) => setPage({ bg: { ...pg.bg, scale: Number(e.target.value) } }, { record: false })} /></label>
                </div>
              )}
              {pg.bg?.type === 'image' && <PhotoEdits value={pg.bg.adjust} colors={colors} onChange={(adjust) => setPage({ bg: { ...pg.bg, adjust } }, { record: false })} />}
              {['mesh', 'gradient', 'pattern', undefined].includes(pg.bg?.type) && <label className="field">Grain · {Math.round((pg.bg?.grain || 0) * 100)}%<input type="range" min="0" max="0.5" step="0.02" value={pg.bg?.grain || 0} onChange={(e) => setPage({ bg: { ...pg.bg, grain: Number(e.target.value) } }, { record: false })} /></label>}
              {pg.bg?.type === 'solid' && <ColorField label="Background" value={pg.bg.color || colors[0]} onChange={(c) => setPage({ bg: { ...pg.bg, color: c } }, { record: false })} swatches={colors} />}
              {pg.bg?.type === 'gradient' && (
                <div className="row wrap" style={{ gap: 12 }}>
                  <ColorField label="From" value={pg.bg.from || colors[0]} onChange={(c) => setPage({ bg: { ...pg.bg, from: c } }, { record: false })} swatches={colors} />
                  <ColorField label="To" value={pg.bg.to || colors[2]} onChange={(c) => setPage({ bg: { ...pg.bg, to: c } }, { record: false })} swatches={colors} align="right" />
                  <label className="field" style={{ width: '100%' }}>Angle · {pg.bg.angle ?? 135}°<input type="range" min="0" max="360" value={pg.bg.angle ?? 135} onChange={(e) => setPage({ bg: { ...pg.bg, angle: Number(e.target.value) } }, { record: false })} /></label>
                </div>
              )}
              {(pg.bg?.type || 'mesh') === 'mesh' && <button className="btn sm" onClick={() => setPage({ bg: { ...pg.bg, seed: Math.floor(Math.random() * 9999) } })}><Shuffle size={13} />Shuffle gradient</button>}
              <label className="field">Darken · {Math.round((pg.bg?.darken || 0) * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={pg.bg?.darken || 0} onChange={(e) => setPage({ bg: { ...pg.bg, darken: Number(e.target.value) } }, { record: false })} /></label>
              <hr className="hairline" />
              <span className="eyebrow">Design colors</span>
              <div className="row wrap" style={{ gap: 8 }}>
                {doc.palette.map((c, i) => <ColorField key={i} value={c} onChange={(v) => update((d) => { d.palette[i] = v; return d; }, { record: false })} />)}
              </div>
              <div className="row" style={{ gap: 10 }}>
                <ColorField value={doc.tint?.color || '#FF9A62'} onChange={(c) => update((d) => { d.tint = { ...(d.tint || {}), color: c }; return d; }, { record: false })} />
                <label className="field grow">Make colors work together · {Math.round((doc.tint?.amount || 0) * 100)}%
                  <input type="range" min="0" max="0.8" step="0.05" value={doc.tint?.amount || 0} onChange={(e) => update((d) => { d.tint = { ...(d.tint || { color: '#FF9A62' }), amount: Number(e.target.value) }; return d; }, { record: false })} />
                </label>
              </div>
              <button className="btn ghost sm" onClick={() => update((d) => { d.palette = [...(config.brandColors || d.palette)].slice(0, 5); while (d.palette.length < 5) d.palette.push('#888888'); return d; })}>Use my brand colors</button>
              {doc.kind === 'presentation' && (
                <>
                  <hr className="hairline" />
                  <label className="field">Speaker notes<textarea className="input" rows={4} value={pg.notes || ''} placeholder="Notes for this slide. You see them while presenting, and they go into PowerPoint." onChange={(e) => setPage({ notes: e.target.value }, { record: false })} /></label>
                </>
              )}
              <hr className="hairline" />
              <Layers items={pg.items} sel={sel} onSelect={setSel} onMove={(from, to) => update((d) => { const list = d.pages[pi].items; const [x] = list.splice(from, 1); list.splice(to, 0, x); return d; })} onDelete={(id) => update((d) => { d.pages[pi].items = d.pages[pi].items.filter((x) => x.id !== id); return d; })} />
              <span className="hint">Click an item to edit it. Double-click text to type on the page. Drag to move; guides show when things line up.</span>
            </>
          )}
        </aside>
      </div>

      {erasing && <BackgroundEraser rel={erasing} onClose={() => setErasing(null)} onSaved={(out) => { setErasing(null); setItem({ rel: out.rel }); toast({ text: 'Background erased. The copy is in your brand library.' }); }} />}
      {picker && (
        <LibraryPicker folder={picker === 'logo' ? 'Logos' : 'All'} title={picker === 'logo' ? 'Pick a logo' : picker === 'bg' ? 'Pick a background photo' : picker === 'frame' ? 'Pick a photo for this shape' : 'Pick a photo'} onClose={() => setPicker(null)}
          onPick={(i) => {
            if (picker === 'bg') setPage({ bg: { ...pg.bg, type: 'image', image: i.rel, darken: pg.bg?.darken || 0.3 } });
            else if (picker === 'frame') setItem({ photo: i.rel });
            else addItem({ id: uid(), type: 'image', rel: i.rel, x: 0.5, y: picker === 'logo' ? 0.88 : 0.5, w: picker === 'logo' ? 0.18 : 0.5, opacity: 1 });
            setPicker(null);
          }} />
      )}
      {presenting != null && <PresentHere doc={doc} start={presenting} onClose={() => setPresenting(null)} />}
      {show && consoleOpen && (
        <PresenterConsole doc={doc} live={show} pending={livePending} displayName={show.display}
          onGo={(k) => goLive(k)} onBlack={() => goLive(show.index, { black: !show.black })} onPush={() => goLive(show.index, { black: show.black })}
          onEdit={() => { setPi(show.index); setSel(null); setConsoleOpen(false); }} onStop={endShow} />
      )}
    </div>
  );
}

function LinePicker({ lines, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn sm" data-pop-trigger onClick={() => setOpen(!open)}><Type size={13} />Line from a sermon<ChevronDown size={13} /></button>
      <Popover open={open} onClose={() => setOpen(false)} width={360}>
        <div className="pop-list">
          {lines.map((g) => (
            <div key={g.sermon} className="stack" style={{ gap: 1 }}>
              <span className="cp-group-name" style={{ padding: '8px 10px 2px' }}>{g.sermon}</span>
              {g.lines.map((l, k) => <button key={k} className="pop-item" onClick={() => { onPick(l); setOpen(false); }}>{l}</button>)}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}

/** Change the colors inside an SVG: each color it uses gets its own swatch. */
function SvgColors({ item, cache, swatches, onChange }) {
  const [list, setList] = useState(null);
  useEffect(() => { svgColors(item.rel, cache).then(setList).catch(() => setList([])); }, [item.rel]);
  if (!list?.length) return null;
  const map = item.recolor || {};
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between"><strong className="small">Colors in this SVG</strong>{Object.keys(map).length > 0 && <button className="btn ghost sm" onClick={() => onChange({})}>Reset</button>}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        {list.map((c, k) => <ColorField key={c} label={`Color ${k + 1}`} value={map[c] || c} swatches={swatches} onChange={(v) => onChange({ ...map, [c]: v })} />)}
      </div>
    </div>
  );
}
