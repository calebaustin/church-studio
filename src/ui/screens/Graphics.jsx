import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Image as ImageIcon, Plus, QrCode, RefreshCw, Shuffle, Trash2, Type, Wand2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import LibraryPicker from '../components/LibraryPicker.jsx';

// ---------------------------------------------------------------- color helpers
const hex2rgb = (h) => { const x = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const rgb2hex = (r) => `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** Cohesive palette: multiply each color toward one tint (the cohesive-colors idea, BSD). */
export const cohesive = (colors, tint, amount) => colors.map((c) => {
  const a = hex2rgb(c); const t = hex2rgb(tint);
  return rgb2hex(a.map((v, i) => v * (1 - amount) + ((v * t[i]) / 255) * amount));
});
function seeded(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const SIZES = {
  portrait: { label: 'Feed 4:5', w: 1080, h: 1350 },
  square: { label: 'Square', w: 1080, h: 1080 },
  story: { label: 'Story 9:16', w: 1080, h: 1920 },
  wide: { label: 'Thumbnail 16:9', w: 1920, h: 1080 },
};
const FONTS = ["'Montserrat'", "'Avenir Next'", 'Georgia', "'Helvetica Neue'", 'Futura', "'DIN Condensed'", 'Rockwell'];
const id = () => Math.random().toString(36).slice(2, 8);

const TEMPLATES = {
  quote: (p) => ({
    size: 'portrait', bg: { type: 'mesh', colors: p, seed: 7, darken: 0.1 },
    texts: [
      { id: id(), text: '“Grace is not something you earn. It is something you receive.”', font: "'Montserrat'", size: 78, weight: 700, color: '#FFFFFF', align: 'center', x: 0.5, y: 0.42, width: 0.8 },
      { id: id(), text: 'Pastor Name · Sunday message', font: "'Montserrat'", size: 34, weight: 500, color: '#FFFFFF', align: 'center', x: 0.5, y: 0.78, width: 0.8, opacity: 0.85 },
    ], images: [], qr: null,
  }),
  series: (p) => ({
    size: 'square', bg: { type: 'mesh', colors: p, seed: 21, darken: 0.2 },
    texts: [
      { id: id(), text: 'A NEW SERIES', font: "'Montserrat'", size: 34, weight: 600, color: '#FFFFFF', align: 'left', x: 0.09, y: 0.3, width: 0.8, letter: 6, opacity: 0.85 },
      { id: id(), text: 'Rooted', font: 'Georgia', size: 190, weight: 700, color: '#FFFFFF', align: 'left', x: 0.09, y: 0.48, width: 0.85 },
      { id: id(), text: 'Sundays at 10am', font: "'Montserrat'", size: 40, weight: 500, color: '#FFFFFF', align: 'left', x: 0.09, y: 0.72, width: 0.8 },
    ], images: [], qr: null,
  }),
  announce: (p) => ({
    size: 'portrait', bg: { type: 'solid', colors: p, color: p[0], darken: 0 },
    texts: [
      { id: id(), text: 'Family Night', font: "'Montserrat'", size: 120, weight: 800, color: '#FFFFFF', align: 'center', x: 0.5, y: 0.22, width: 0.85 },
      { id: id(), text: 'Friday, 6pm · Fellowship Hall\nFood, games and worship for all ages.', font: "'Montserrat'", size: 42, weight: 500, color: '#FFFFFF', align: 'center', x: 0.5, y: 0.42, width: 0.8 },
      { id: id(), text: 'Scan to sign up', font: "'Montserrat'", size: 34, weight: 600, color: '#FFFFFF', align: 'center', x: 0.5, y: 0.9, width: 0.8 },
    ], images: [], qr: { url: 'https://example.org/signup', x: 0.5, y: 0.68, size: 0.3, color: '#FFFFFF' },
  }),
  thumb: (p) => ({
    size: 'wide', bg: { type: 'mesh', colors: p, seed: 3, darken: 0.25 },
    texts: [
      { id: id(), text: 'You can’t earn this', font: "'Montserrat'", size: 130, weight: 800, color: '#FFFFFF', align: 'left', x: 0.06, y: 0.4, width: 0.55 },
      { id: id(), text: 'SUNDAY MESSAGE', font: "'Montserrat'", size: 40, weight: 600, color: '#FFFFFF', align: 'left', x: 0.06, y: 0.75, width: 0.5, letter: 4, opacity: 0.8 },
    ], images: [], qr: null,
  }),
};

// ---------------------------------------------------------------- drawing
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function drawMesh(ctx, W, H, colors, seed) {
  const rnd = seeded(seed);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, W, H);
  const off = document.createElement('canvas');
  off.width = Math.ceil(W / 4); off.height = Math.ceil(H / 4);
  const o = off.getContext('2d');
  o.fillStyle = colors[0]; o.fillRect(0, 0, off.width, off.height);
  colors.forEach((c, i) => {
    for (let k = 0; k < 2; k++) {
      const x = rnd() * off.width; const y = rnd() * off.height; const r = (0.45 + rnd() * 0.5) * Math.max(off.width, off.height);
      const g = o.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c); g.addColorStop(1, `${c}00`);
      o.globalAlpha = i === 0 ? 0.6 : 0.85;
      o.fillStyle = g; o.fillRect(0, 0, off.width, off.height);
    }
  });
  ctx.save();
  ctx.filter = `blur(${Math.round(Math.max(W, H) / 40)}px)`;
  ctx.drawImage(off, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
  ctx.restore();
}

async function render(canvas, d, scale, cache) {
  const S = SIZES[d.size];
  const W = Math.round(S.w * scale); const H = Math.round(S.h * scale);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const k = scale;
  const bg = d.bg;
  if (bg.type === 'solid') { ctx.fillStyle = bg.color || bg.colors[0]; ctx.fillRect(0, 0, W, H); }
  else if (bg.type === 'image' && cache[bg.image]) {
    const img = cache[bg.image];
    const r = Math.max(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * r) / 2, (H - img.height * r) / 2, img.width * r, img.height * r);
  } else drawMesh(ctx, W, H, bg.colors, bg.seed || 1);
  if (bg.darken) { ctx.fillStyle = `rgba(0,0,0,${bg.darken})`; ctx.fillRect(0, 0, W, H); }
  for (const im of d.images) {
    const img = cache[im.rel];
    if (!img) continue;
    const w = im.w * W; const h = (img.height / img.width) * w;
    ctx.globalAlpha = im.opacity ?? 1;
    ctx.drawImage(img, im.x * W - w / 2, im.y * H - h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  if (d.qr?.url && cache[`qr:${d.qr.url}:${d.qr.color}`]) {
    const q = cache[`qr:${d.qr.url}:${d.qr.color}`];
    const s = d.qr.size * W;
    ctx.drawImage(q, d.qr.x * W - s / 2, d.qr.y * H - s / 2, s, s);
  }
  for (const t of d.texts) {
    ctx.save();
    ctx.font = `${t.weight || 600} ${t.size * k}px ${t.font}`;
    ctx.fillStyle = t.color;
    ctx.globalAlpha = t.opacity ?? 1;
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(t.letter || 0) * k}px`;
    const maxW = t.width * W;
    const lines = wrap(ctx, t.upper ? t.text.toUpperCase() : t.text, maxW);
    const lh = t.size * k * 1.15;
    const y0 = t.y * H - ((lines.length - 1) * lh) / 2;
    ctx.textAlign = t.align;
    const x = t.align === 'center' ? t.x * W : t.align === 'right' ? t.x * W : t.x * W;
    lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lh));
    ctx.restore();
  }
  return canvas;
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export default function Graphics({ image: startImage }) {
  const { toast, themes, config } = useApp();
  const appTheme = themes.app.find((t) => t.id === config.appTheme) || themes.app[0];
  const brand = [appTheme?.tokens['--accent'] || '#3D6BFF', appTheme?.tokens['--accent-2'] || '#FF8A5B', '#1B2440', '#8FE3C8', '#F6D365'];
  const [palette, setPalette] = useState(() => { try { return JSON.parse(localStorage.getItem('sc-palette')) || brand; } catch { return brand; } });
  const [tint, setTint] = useState({ color: '#FF9A62', amount: 0 });
  const colors = useMemo(() => cohesive(palette, tint.color, tint.amount), [palette, tint]);
  const [d, setD] = useState(() => TEMPLATES.quote(colors));
  const [sel, setSel] = useState(0);
  const [picker, setPicker] = useState(null); // 'bg' | 'logo'
  const [lines, setLines] = useState([]);
  const [name, setName] = useState('Quote card');
  const canvas = useRef(null);
  const cache = useRef({});
  const [tick, setTick] = useState(0);
  const drag = useRef(null);

  useEffect(() => { try { localStorage.setItem('sc-palette', JSON.stringify(palette)); } catch { /* fine */ } }, [palette]);
  useEffect(() => { setD((x) => ({ ...x, bg: { ...x.bg, colors } })); }, [colors]);
  useEffect(() => { if (startImage) setD((x) => ({ ...x, bg: { ...x.bg, type: 'image', image: startImage, darken: 0.35 } })); }, [startImage]);

  // Lines from recent sermons, for quote cards.
  useEffect(() => {
    api.get('/api/projects').then(async ({ projects }) => {
      const out = [];
      for (const p of projects.slice(0, 4)) {
        const { project } = await api.get(`/api/projects/${p.id}`);
        for (const c of project.clips.slice(0, 8)) out.push({ text: c.title, sermon: project.title });
      }
      setLines(out);
    }).catch(() => {});
  }, []);

  // Load any images the design needs, then draw.
  useEffect(() => {
    let live = true;
    (async () => {
      const need = [...(d.bg.type === 'image' && d.bg.image ? [d.bg.image] : []), ...d.images.map((i) => i.rel)];
      for (const rel of need) if (!cache.current[rel]) cache.current[rel] = await loadImage(`/library/${rel.split('/').map(encodeURIComponent).join('/')}`).catch(() => null);
      if (d.qr?.url) {
        const key = `qr:${d.qr.url}:${d.qr.color}`;
        if (!cache.current[key]) cache.current[key] = await loadImage(await QRCode.toDataURL(d.qr.url, { margin: 1, width: 600, color: { dark: d.qr.color || '#000000', light: '#00000000' } }));
      }
      await document.fonts.ready;
      if (live && canvas.current) render(canvas.current, d, 0.5, cache.current);
    })();
    return () => { live = false; };
  }, [d, tick]);

  const S = SIZES[d.size];
  const t = d.texts[sel];
  const setText = (p) => setD({ ...d, texts: d.texts.map((x, i) => (i === sel ? { ...x, ...p } : x)) });
  const useTemplate = (k) => { setD(TEMPLATES[k](colors)); setSel(0); setName({ quote: 'Quote card', series: 'Series title', announce: 'Announcement', thumb: 'Thumbnail' }[k]); };

  // Drag text on the preview.
  const down = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; const py = (e.clientY - r.top) / r.height;
    let best = -1; let dist = 1;
    d.texts.forEach((x, i) => { const dd = Math.hypot(px - x.x, py - x.y); if (dd < dist) { dist = dd; best = i; } });
    if (best >= 0 && dist < 0.25) { setSel(best); drag.current = { i: best, dx: px - d.texts[best].x, dy: py - d.texts[best].y }; e.currentTarget.setPointerCapture(e.pointerId); }
  };
  const move = (e) => {
    if (!drag.current) return;
    const r = canvas.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; const py = (e.clientY - r.top) / r.height;
    const { i, dx, dy } = drag.current;
    setD((x) => ({ ...x, texts: x.texts.map((tt, j) => (j === i ? { ...tt, x: +(px - dx).toFixed(3), y: +(py - dy).toFixed(3) } : tt)) }));
  };

  const exportPng = async () => {
    const c = document.createElement('canvas');
    await render(c, d, 1, cache.current);
    const r = await api.post('/api/library/save', { folder: 'Graphics', name, dataUrl: c.toDataURL('image/png') });
    toast({ text: `Saved to Graphics. Use it in posts or as a clip end card.`, action: { label: 'Show', run: () => api.post('/api/library/reveal', { rel: r.rel }) } });
  };

  return (
    <div className="page">
      <div className="row between wrap">
        <div className="stack" style={{ gap: 2 }}>
          <h1>Graphics</h1>
          <span className="muted">Quote cards, series art, announcements and thumbnails in your colors.</span>
        </div>
        <div className="row">
          <input className="input" style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Graphic name" />
          <button className="btn primary" onClick={exportPng}><Download size={15} />Save to library</button>
        </div>
      </div>
      <div className="seg">
        {[['quote', 'Quote card'], ['series', 'Series title'], ['announce', 'Announcement'], ['thumb', 'Thumbnail']].map(([k, l]) => <button key={k} onClick={() => useTemplate(k)}>{l}</button>)}
      </div>
      <div className="editor" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 1fr)' }}>
        <div className="stack sticky-col">
          <div className="glass panel" style={{ display: 'grid', placeItems: 'center' }}>
            <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
              style={{ width: '100%', maxWidth: S.w > S.h ? 640 : 420, aspectRatio: `${S.w}/${S.h}`, borderRadius: 14, cursor: 'move', boxShadow: 'var(--shadow-lg)' }} aria-label="Graphic preview" />
          </div>
          <div className="seg">{Object.entries(SIZES).map(([k, v]) => <button key={k} className={d.size === k ? 'on' : ''} onClick={() => setD({ ...d, size: k })}>{v.label}</button>)}</div>
          <span className="hint">Drag text to move it. Fonts and sizes match the saved file.</span>
        </div>

        <section className="glass strong panel stack" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h3>Colors</h3>
            <div className="row wrap">
              {palette.map((c, i) => <input key={i} type="color" value={c} aria-label={`Color ${i + 1}`} onChange={(e) => setPalette(palette.map((x, j) => (j === i ? e.target.value : x)))} />)}
              <button className="btn icon sm" title="Shuffle background" aria-label="Shuffle background" onClick={() => setD({ ...d, bg: { ...d.bg, seed: Math.floor(Math.random() * 9999) } })}><Shuffle size={14} /></button>
            </div>
            <label className="row small muted">Make colors work together
              <input type="color" value={tint.color} onChange={(e) => setTint({ ...tint, color: e.target.value })} aria-label="Blend color" />
              <input type="range" min="0" max="0.8" step="0.05" value={tint.amount} onChange={(e) => setTint({ ...tint, amount: Number(e.target.value) })} style={{ width: 120 }} aria-label="Blend amount" />
            </label>
            <div className="row" style={{ gap: 4 }}>{colors.map((c, i) => <span key={i} style={{ width: 28, height: 18, borderRadius: 5, background: c }} />)}</div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <h3>Background</h3>
            <div className="seg">
              <button className={d.bg.type === 'mesh' ? 'on' : ''} onClick={() => setD({ ...d, bg: { ...d.bg, type: 'mesh' } })}>Gradient</button>
              <button className={d.bg.type === 'solid' ? 'on' : ''} onClick={() => setD({ ...d, bg: { ...d.bg, type: 'solid', color: d.bg.color || colors[0] } })}>Solid</button>
              <button className={d.bg.type === 'image' ? 'on' : ''} onClick={() => setPicker('bg')}><ImageIcon size={13} />Photo</button>
            </div>
            {d.bg.type === 'solid' && <label className="row small"><input type="color" value={d.bg.color || colors[0]} onChange={(e) => setD({ ...d, bg: { ...d.bg, color: e.target.value } })} />Background color</label>}
            <label className="field">Darken · {Math.round((d.bg.darken || 0) * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={d.bg.darken || 0} onChange={(e) => setD({ ...d, bg: { ...d.bg, darken: Number(e.target.value) } })} /></label>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div className="row between"><h3>Text</h3><button className="btn sm" onClick={() => { setD({ ...d, texts: [...d.texts, { id: id(), text: 'New text', font: "'Montserrat'", size: 60, weight: 600, color: '#FFFFFF', align: 'center', x: 0.5, y: 0.5, width: 0.8 }] }); setSel(d.texts.length); }}><Type size={13} />Add text</button></div>
            <div className="row wrap" style={{ gap: 6 }}>{d.texts.map((x, i) => <button key={x.id} className={`chip ${i === sel ? 'accent' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setSel(i)}>{x.text.slice(0, 18) || 'Text'}</button>)}</div>
            {t && (
              <div className="keycard">
                <textarea className="input" rows={3} value={t.text} onChange={(e) => setText({ text: e.target.value })} spellCheck />
                {lines.length > 0 && (
                  <select className="input" value="" onChange={(e) => { if (e.target.value) setText({ text: `“${e.target.value}”` }); }}>
                    <option value="">Use a line from a sermon…</option>
                    {lines.map((l, i) => <option key={i} value={l.text}>{l.text.slice(0, 90)}</option>)}
                  </select>
                )}
                <div className="token-grid">
                  <label className="field">Font<select className="input" value={t.font} onChange={(e) => setText({ font: e.target.value })}>{FONTS.map((f) => <option key={f} value={f}>{f.replace(/'/g, '')}</option>)}</select></label>
                  <label className="field">Weight<select className="input" value={t.weight} onChange={(e) => setText({ weight: Number(e.target.value) })}>{[400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
                  <label className="field">Size · {t.size}<input type="range" min="20" max="240" value={t.size} onChange={(e) => setText({ size: Number(e.target.value) })} /></label>
                  <label className="field">Width · {Math.round(t.width * 100)}%<input type="range" min="0.2" max="1" step="0.01" value={t.width} onChange={(e) => setText({ width: Number(e.target.value) })} /></label>
                  <label className="row small"><input type="color" value={t.color} onChange={(e) => setText({ color: e.target.value })} />Color</label>
                  <div className="seg">{['left', 'center', 'right'].map((a) => <button key={a} className={t.align === a ? 'on' : ''} onClick={() => setText({ align: a })}>{a}</button>)}</div>
                </div>
                <button className="btn ghost sm danger" onClick={() => { setD({ ...d, texts: d.texts.filter((_, i) => i !== sel) }); setSel(0); }}><Trash2 size={13} />Remove text</button>
              </div>
            )}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div className="row between">
              <h3>Logo and QR code</h3>
              <div className="row">
                <button className="btn sm" onClick={() => setPicker('logo')}><Plus size={13} />Logo</button>
                <button className="btn sm" onClick={() => setD({ ...d, qr: d.qr ? null : { url: 'https://', x: 0.5, y: 0.75, size: 0.25, color: '#FFFFFF' } })}><QrCode size={13} />{d.qr ? 'Remove QR' : 'QR code'}</button>
              </div>
            </div>
            {d.images.map((im, i) => (
              <div key={i} className="row wrap small">
                <span className="truncate" style={{ maxWidth: 140 }}>{im.rel.split('/').pop()}</span>
                <label className="row">Size<input type="range" min="0.05" max="0.8" step="0.01" value={im.w} onChange={(e) => setD({ ...d, images: d.images.map((x, j) => (j === i ? { ...x, w: Number(e.target.value) } : x)) })} style={{ width: 90 }} /></label>
                <label className="row">Up/down<input type="range" min="0.05" max="0.95" step="0.01" value={im.y} onChange={(e) => setD({ ...d, images: d.images.map((x, j) => (j === i ? { ...x, y: Number(e.target.value) } : x)) })} style={{ width: 90 }} /></label>
                <button className="btn icon sm danger" aria-label="Remove logo" onClick={() => setD({ ...d, images: d.images.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            {d.qr && (
              <div className="keycard">
                <label className="field">QR link<input className="input" value={d.qr.url} onChange={(e) => setD({ ...d, qr: { ...d.qr, url: e.target.value } })} placeholder="https://yourchurch.org/give" /></label>
                <div className="row wrap">
                  <label className="row small"><input type="color" value={d.qr.color} onChange={(e) => setD({ ...d, qr: { ...d.qr, color: e.target.value } })} />Color</label>
                  <label className="row small">Size<input type="range" min="0.12" max="0.6" step="0.01" value={d.qr.size} onChange={(e) => setD({ ...d, qr: { ...d.qr, size: Number(e.target.value) } })} style={{ width: 100 }} /></label>
                  <label className="row small">Up/down<input type="range" min="0.1" max="0.9" step="0.01" value={d.qr.y} onChange={(e) => setD({ ...d, qr: { ...d.qr, y: Number(e.target.value) } })} style={{ width: 100 }} /></label>
                </div>
              </div>
            )}
          </div>
          <button className="btn ghost sm" onClick={() => setTick((n) => n + 1)}><RefreshCw size={13} />Redraw</button>
          <span className="hint"><Wand2 size={12} /> Saved graphics can be added to a clip as a logo or end card in the editor.</span>
        </section>
      </div>
      {picker && (
        <LibraryPicker folder={picker === 'logo' ? 'Logos' : 'All'} title={picker === 'logo' ? 'Pick a logo' : 'Pick a background photo'} onClose={() => setPicker(null)}
          onPick={(i) => {
            if (picker === 'logo') setD({ ...d, images: [...d.images, { rel: i.rel, x: 0.5, y: 0.9, w: 0.18 }] });
            else setD({ ...d, bg: { ...d.bg, type: 'image', image: i.rel, darken: d.bg.darken || 0.35 } });
            setPicker(null);
          }} />
      )}
    </div>
  );
}
