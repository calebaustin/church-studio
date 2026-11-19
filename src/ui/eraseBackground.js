// Background eraser: clears a plain background (usually white) off a logo or picture, on this Mac.
// It reads the color around the edges, then clears pixels close to it: only the area connected to the
// edges ("edges"), or that color everywhere, including inside letters ("everywhere").
// Pixels that are nearly a match fade out, so edges stay smooth.

const MAX = 2400;

export async function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('Couldn’t open that picture.')); im.src = src; });
}

/** The background color: the most common color around the border. */
function edgeColor(d, w, h) {
  const tally = new Map();
  const add = (i) => {
    if (d[i + 3] < 200) return;
    const k = `${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`;
    tally.set(k, (tally.get(k) || 0) + 1);
  };
  for (let x = 0; x < w; x++) { add(x * 4); add(((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y++) { add(y * w * 4); add((y * w + w - 1) * 4); }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const share = top[1] / (2 * (w + h));
  const [r, g, b] = top[0].split(',').map((v) => (Number(v) << 3) + 4);
  return { r, g, b, share };
}

/**
 * Erase into a new canvas. opts: { tolerance 0..1, mode 'edges'|'everywhere', trim, max (longest side) }.
 * Returns { canvas, bg: '#RRGGBB' | null, cleared: share of pixels cleared }.
 */
export function erase(img, { tolerance = 0.18, mode = 'edges', trim = true, max = MAX } = {}) {
  const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * k));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const bg = edgeColor(d, w, h);
  if (!bg) return { canvas: c, bg: null, cleared: 0 };
  const hard = 441 * tolerance; // 441 = the largest RGB distance
  const soft = hard * 1.7 + 6;
  const dist = (i) => Math.hypot(d[i] - bg.r, d[i + 1] - bg.g, d[i + 2] - bg.b);
  const alphaFor = (dd) => (dd <= hard ? 0 : dd >= soft ? 1 : (dd - hard) / (soft - hard));
  let cleared = 0;
  if (mode === 'everywhere') {
    for (let i = 0; i < d.length; i += 4) {
      const a = alphaFor(dist(i));
      if (a < 1) { d[i + 3] = Math.round(d[i + 3] * a); cleared++; }
    }
  } else {
    // Flood from every edge pixel that matches; soft pixels at the border of the flood fade.
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (p) => { if (!seen[p]) { seen[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop();
      const i = p * 4;
      const a = alphaFor(dist(i));
      if (a >= 1) continue;
      d[i + 3] = Math.round(d[i + 3] * a);
      cleared++;
      if (a > 0.6) continue; // a soft edge pixel: don't spread past it
      const x = p % w; const y = (p - x) / w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
  }
  ctx.putImageData(data, 0, 0);
  const result = { canvas: c, bg: `#${[bg.r, bg.g, bg.b].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('')}`.toUpperCase(), cleared: cleared / (w * h) };
  if (!trim) return result;
  // Trim the empty margin so the logo sits tight in its box.
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return result;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const t = document.createElement('canvas'); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
  t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
  return { ...result, canvas: t };
}
