// The Dock icon: the church's logo on a rounded square, with a small rounded-square badge in the
// bottom-right corner and "CS" in the logo's background color, so it looks cut out. The badge is white
// over dark logos and a dark brand color over light ones (at least 3:1 contrast), so it always stands out.
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

  // The corner badge: a rounded square tucked into the bottom-right corner, with "CS" cut out of it.
  // Its color is picked to stand out from whatever is behind it (at least 3:1 contrast): white over
  // dark or colorful logos, and a dark brand color over white or light ones.
  const bs = B * 0.34; const pad = B * 0.045;
  const bx0 = O + B - bs - pad; const by0 = O + B - bs - pad;
  const under = ctx.getImageData(bx0 - bs * 0.2, by0 - bs * 0.2, bs * 1.4, bs * 1.4).data;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < under.length; i += 4) if (under[i + 3] > 0) { r += under[i]; g += under[i + 1]; b += under[i + 2]; n++; }
  const behind = n ? [r / n, g / n, b / n] : [255, 255, 255];
  const relLum = (rgb) => { const [R2, G2, B2] = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * R2 + 0.7152 * G2 + 0.0722 * B2; };
  const contrast = (a1, a2) => { const [hi, lo] = [relLum(a1), relLum(a2)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const candidates = [[255, 255, 255], hex(ink), hex(brandColor), [17, 20, 24]];
  const fill = candidates.find((c) => contrast(c, behind) >= 3) || (relLum(behind) > 0.4 ? [17, 20, 24] : [255, 255, 255]);

  const badge = document.createElement('canvas'); badge.width = S; badge.height = S;
  const bx = badge.getContext('2d');
  bx.save();
  bx.shadowColor = 'rgba(0,0,0,.22)'; bx.shadowBlur = 20; bx.shadowOffsetY = 4;
  bx.beginPath(); bx.roundRect(bx0, by0, bs, bs, bs * 0.26); bx.fillStyle = `rgb(${fill.join(',')})`; bx.fill();
  bx.restore();
  bx.font = `700 ${Math.round(bs * 0.62)}px 'Caveat', cursive`;
  bx.textAlign = 'center'; bx.textBaseline = 'middle';
  // "CS" in the color behind the badge, so it reads as cut out without showing busy logo details.
  const whiteBadge = fill[0] === 255 && fill[1] === 255 && fill[2] === 255;
  bx.fillStyle = whiteBadge ? `rgb(${behind.map((v) => Math.round(v)).join(',')})` : '#FFFFFF';
  bx.fillText('CS', bx0 + bs / 2, by0 + bs / 2 + bs * 0.02);
  ctx.drawImage(badge, 0, 0);
  return c.toDataURL('image/png');
}
