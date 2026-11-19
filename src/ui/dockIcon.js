// The Dock icon: the church's logo on a rounded square, with a small rounded-square badge in the
// bottom-right corner and "CS" in the logo's background color, so it looks cut out. The badge is white
// over dark logos and a dark brand color over light ones (at least 3:1 contrast), so it always stands out.
const S = 1024; const B = 824; const O = (S - B) / 2; const R = B * 0.225;

// An SVG with no width or height loads with a size of 0: give it a square size so it can be drawn.
const load = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { if (!i.naturalWidth || !i.naturalHeight) { i.width = 512; i.height = 512; } res(i); }; i.onerror = rej; i.src = src; });
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hex = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function squircle(ctx) {
  ctx.beginPath();
  ctx.roundRect(O, O, B, B, R);
}

/** The logo's main dark color: the most used color that isn't near white or near black. */
function darkFromLogo(img) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  const tally = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 160) continue;
    const l = lum([d[i], d[i + 1], d[i + 2]]);
    if (l > 0.72 || l < 0.06) continue;
    const key = `${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5}`;
    const t = tally.get(key) || { weight: 0, count: 0, r: 0, g: 0, b: 0 };
    t.weight += 1 + (0.72 - l) * 2; t.count += 1; t.r += d[i]; t.g += d[i + 1]; t.b += d[i + 2];
    tally.set(key, t);
  }
  const best = [...tally.values()].sort((p, q) => q.weight - p.weight)[0];
  return best ? [best.r / best.count, best.g / best.count, best.b / best.count] : null;
}

/** Average color of the logo's visible pixels, and whether its corners are see-through. */
function readLogo(img) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const corner = [0, 63 * 4, 63 * 64 * 4, (64 * 64 - 1) * 4].some((i) => d[i + 3] < 200);
  return { avg: n ? [r / n, g / n, b / n] : [255, 255, 255], transparent: corner };
}

export async function makeDockIcon({ logoUrl, brandColor = '#2B7F5F', ink = '#1B2440' }) {
  await document.fonts.load("700 300px 'Caveat'").catch(() => {});
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const logo = logoUrl ? await load(logoUrl).catch(() => null) : null;
  const info = logo ? readLogo(logo) : null;

  // Background: the brand color behind a logo with see-through edges; a dark logo sits on white.
  const bg = !logo || info.transparent ? (info && lum(info.avg) < 0.35 ? '#FFFFFF' : brandColor) : '#FFFFFF';
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10; squircle(ctx); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
  ctx.save(); squircle(ctx); ctx.clip();
  ctx.fillStyle = bg; ctx.fillRect(O, O, B, B);
  if (logo) {
    if (info.transparent) {
      const k = Math.min((B * 0.66) / logo.width, (B * 0.66) / logo.height);
      const w = logo.width * k; const h = logo.height * k;
      ctx.drawImage(logo, (S - w) / 2, (S - h) / 2 - B * 0.03, w, h);
    } else {
      const k = Math.max(B / logo.width, B / logo.height);
      const w = logo.width * k; const h = logo.height * k;
      ctx.drawImage(logo, (S - w) / 2, (S - h) / 2, w, h);
    }
  }
  ctx.restore();

  // The corner badge: a tab filling the bottom-right corner. Its outer corner follows the icon's own
  // rounding; its inner corner is softly rounded. Its color is a dark color taken from the logo itself,
  // so it always looks like the church's brand. "CS" sits on it in white.
  const bs = B * 0.47;
  const relLum = (rgb) => { const [R2, G2, B2] = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * R2 + 0.7152 * G2 + 0.0722 * B2; };
  const contrastWhite = (rgb) => 1.05 / (relLum(rgb) + 0.05);
  let fill = logo ? darkFromLogo(logo) : null;
  if (!fill) fill = hex(brandColor);
  // Darken until white "CS" reads clearly (at least 3:1).
  for (let i = 0; i < 12 && contrastWhite(fill) < 3; i++) fill = fill.map((v) => v * 0.86);

  const badge = document.createElement('canvas'); badge.width = S; badge.height = S;
  const bx = badge.getContext('2d');
  bx.save();
  squircle(bx); bx.clip();
  bx.shadowColor = 'rgba(0,0,0,.25)'; bx.shadowBlur = 18; bx.shadowOffsetX = -2; bx.shadowOffsetY = -2;
  bx.beginPath(); bx.roundRect(O + B - bs, O + B - bs, bs + R, bs + R, bs * 0.2);
  bx.fillStyle = `rgb(${fill.map((v) => Math.round(v)).join(',')})`; bx.fill();
  bx.restore();
  bx.font = `700 ${Math.round(bs * 0.5)}px 'Caveat', cursive`;
  bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillStyle = '#FFFFFF';
  bx.fillText('CS', O + B - bs / 2 + bs * 0.01, O + B - bs / 2 + bs * 0.03);
  ctx.drawImage(badge, 0, 0);
  return c.toDataURL('image/png');
}
