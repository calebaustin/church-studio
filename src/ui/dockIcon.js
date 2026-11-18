// The Dock icon: the church's logo on a rounded square, with a white circle tucked into the
// bottom-right corner and "CS" cut out of it, so the logo's color shows through. When the area
// behind the circle is light (a white logo or a white background), "CS" is drawn in a dark color
// instead, so it never disappears.
const S = 1024; const B = 824; const O = (S - B) / 2; const R = B * 0.225;

const load = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hex = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function squircle(ctx) {
  ctx.beginPath();
  ctx.roundRect(O, O, B, B, R);
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

  // The corner circle: centered past the corner so it grows out of it.
  const cx = O + B - B * 0.1; const cy = O + B - B * 0.1; const cr = B * 0.27;
  const under = ctx.getImageData(cx - cr * 0.5, cy - cr * 0.5, cr, cr).data;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < under.length; i += 4) if (under[i + 3] > 0) { r += under[i]; g += under[i + 1]; b += under[i + 2]; n++; }
  const lightBehind = n ? lum([r / n, g / n, b / n]) > 0.78 : false;

  const badge = document.createElement('canvas'); badge.width = S; badge.height = S;
  const bx = badge.getContext('2d');
  bx.save(); bx.beginPath(); bx.roundRect(O, O, B, B, R); bx.clip();
  bx.shadowColor = 'rgba(0,0,0,.18)'; bx.shadowBlur = 24;
  bx.beginPath(); bx.arc(cx, cy, cr, 0, Math.PI * 2); bx.fillStyle = '#FFFFFF'; bx.fill();
  bx.restore();
  bx.font = `700 ${Math.round(cr * 0.82)}px 'Caveat', cursive`;
  bx.textAlign = 'center'; bx.textBaseline = 'middle';
  const tx = cx - cr * 0.24; const ty = cy - cr * 0.2;
  if (lightBehind) { bx.fillStyle = ink; bx.fillText('CS', tx, ty); }
  else { bx.globalCompositeOperation = 'destination-out'; bx.fillText('CS', tx, ty); }
  ctx.drawImage(badge, 0, 0);
  return c.toDataURL('image/png');
}
