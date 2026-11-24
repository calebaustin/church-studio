// Seven sermon series packs in looks churches love right now: heavy condensed type on black, a burgundy
// grotesk, sunbursts on tan, script on blueprint blue, a repeating high-contrast serif, a sunset gradient and
// letters in circles. Each one is a five-slide series kit (title, welcome, scripture, giving, see you next week),
// the same kit as a carousel, and single announcement cards and event slides. Original layouts, built only from
// fonts that come with macOS, so they work offline. Words are friendly samples you can change.
import { page, shape, text as rawText, uid } from './model.js';

export const PACKS5 = {
  ember: { name: 'Ember', about: 'Heavy condensed type on warm black and paper, with copper accents.', c: ['#1D1D1F', '#C8764A', '#141416', '#ECE6D8', '#8E5536'], h: 'Avenir Next Condensed', b: 'Helvetica Neue' },
  vintner: { name: 'Vintner', about: 'Burgundy and cream with a clean, quiet grotesk.', c: ['#6A1E2A', '#E6D6B4', '#2A0E12', '#E9DBBA', '#9C3B48'], h: 'Helvetica Neue', b: 'Helvetica Neue' },
  sunrise: { name: 'Sunrise', about: 'Tight capitals on tan and rust, with hand-cut sun rays.', c: ['#B65A2E', '#E1CFAD', '#3A2716', '#E4D4B6', '#8C4626'], h: 'Helvetica Neue', b: 'Helvetica Neue' },
  blueprint: { name: 'Blueprint', about: 'Flowing script on denim blue, a fine grid and small caps.', c: ['#3A5A86', '#DCE8F2', '#22385A', '#E6EFF6', '#FFFFFF'], h: 'Snell Roundhand', b: 'Helvetica Neue' },
  refrain: { name: 'Refrain', about: 'A tall, high-contrast serif that repeats off the edges, with a row of dots.', c: ['#232323', '#ECE9E0', '#141414', '#EFECE3', '#FFFFFF'], h: 'Didot', b: 'Helvetica Neue' },
  dusk: { name: 'Dusk', about: 'A grainy sunset gradient with plain black capitals.', c: ['#E8772A', '#3E3653', '#141414', '#F0E2CC', '#D9542E'], h: 'Helvetica Neue', b: 'Helvetica Neue' },
  orbit: { name: 'Orbit', about: 'Tomato red and cream, with letters set in circles.', c: ['#D44D33', '#ECE8DE', '#1A1A1A', '#EEEAE0', '#B83A22'], h: 'Helvetica Neue', b: 'Helvetica Neue' },
};

// ------------------------------------------------------------------ helpers
const solid = (color, grain) => ({ type: 'solid', color, darken: 0, ...(grain ? { grain } : {}) });
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const times = (ctx) => ctx.church?.times || 'Sundays at 9 & 11';
const city = (ctx) => { const a = String(ctx.church?.address || '').split(',').map((s) => s.trim()).filter(Boolean); return a.length >= 2 ? a.slice(1).join(', ').replace(/\s+\d{5}(-\d{4})?$/, '') : 'City, State'; };
const yr = () => String(new Date().getFullYear());
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
// Times as separate lines ("9:00 AM", "11:00 AM") when they can be read from the church's details.
const serviceTimes = (ctx) => {
  const found = [...String(times(ctx)).matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)].map((m) => `${m[1]}:${m[2] || '00'} ${(m[3] || 'AM').toUpperCase()}`);
  return found.length ? found.slice(0, 3) : ['9:00 AM', '11:00 AM'];
};
const VERSE = 'But seek first God’s Kingdom and his righteousness; and all these things will be given to you as well. Therefore don’t be anxious for tomorrow, for tomorrow will be anxious for itself.';
const REF = 'Matthew 6:33-34';

// Sizes text to fit a width, measured with the real font (fonts built into macOS are ready right away).
let mc = null;
function widest(t, font, weight, size, italic, letter) {
  if (typeof document === 'undefined') return 0;
  mc ||= document.createElement('canvas').getContext('2d');
  mc.font = `${italic ? 'italic ' : ''}${weight} ${size}px '${font}'`;
  if ('letterSpacing' in mc) mc.letterSpacing = `${letter || 0}px`;
  return Math.max(...String(t).split('\n').map((l) => mc.measureText(l).width));
}

/** Text helpers for one page size. x is the anchor: the left edge, the right edge or the center, by align. */
function kit(kind) {
  const wide = kind === 'presentation' || kind === 'slide';
  const W = wide ? 1920 : 1080; const H = wide ? 1080 : 1350; const R = W / H;
  // T(text, { font, weight, size, x, y, w, align, max }): max sizes the text down so its widest line fits w.
  const T = (text, p) => {
    const { font, weight = 500, size = 40, x = 0.5, y = 0.5, w = 0.8, align = 'center', fit = true, ...rest } = p;
    let s = size;
    if (fit) { const m = widest(p.upper ? String(text).toUpperCase() : text, font, weight, size, p.italic, (p.letter || 0)); if (m > w * W * 0.97) s = Math.floor((size * w * W * 0.97) / m); }
    const cx = align === 'left' ? x + w / 2 : align === 'right' ? x - w / 2 : x;
    return rawText({ text, font, weight, size: Math.max(8, Math.round(s)), x: cx, y, w, align, lh: 1.05, ...rest });
  };
  const box = (x, y, w, h, fill, p = {}) => shape({ x, y, w, h, fill, ...p });
  const circle = (x, y, w, p) => shape({ shape: 'ellipse', x, y, w, h: w * R, ...p });
  const qr = (url, x, y, w, color) => ({ id: uid(), type: 'qr', url: `https://${url}`, x, y, w, color });
  const star = (x, y, w, fill, p = {}) => shape({ shape: 'asterisk', x, y, w, h: w * R, fill, ...p });
  const dots = (y, color, xs, d = 0.009) => xs.map((x) => circle(x, y, d, { fill: color }));
  return { wide, W, H, R, T, box, circle, qr, star, dots };
}

// ------------------------------------------------------------------ Ember: heavy condensed on black, copper accents
function ember(kind, ctx) {
  const P = PACKS5.ember; const [black, copper, ink, paper] = P.c; const { wide, T, star, qr } = kit(kind);
  const Hd = (t, p) => T(t, { font: P.h, weight: 800, upper: true, letter: -1, lh: 0.9, ...p });
  const Sv = (t, p) => T(t, { font: 'Bodoni 72', weight: 400, upper: true, letter: -1, color: copper, ...p });
  const Bd = (t, p) => T(t, { font: P.b, weight: 500, upper: true, size: 22, lh: 1.25, color: copper, ...p });
  const g = 0.05;
  return {
    series: () => page({ bg: solid(black, g), items: wide ? [
      Hd('Unshaken', { x: 0.08, y: 0.28, w: 0.62, size: 380, align: 'left', color: paper }),
      star(0.84, 0.6, 0.032, copper),
      Sv('Standing firm when life shakes', { x: 0.86, y: 0.73, w: 0.5, size: 44, align: 'right' }),
      Bd(churchName(ctx), { x: 0.86, y: 0.84, w: 0.4, size: 28, align: 'right' }),
    ] : [
      Hd('Unshaken', { x: 0.08, y: 0.24, w: 0.84, size: 320, align: 'left', color: paper }),
      star(0.86, 0.58, 0.06, copper),
      Sv('Standing firm when life shakes', { x: 0.92, y: 0.75, w: 0.8, size: 44, align: 'right' }),
      Bd(churchName(ctx), { x: 0.92, y: 0.84, w: 0.6, size: 28, align: 'right' }),
    ] }),
    welcome: () => page({ bg: solid(black, g), items: [
      Bd('Welcome home\nwe’re glad you’re here', { x: 0.92, y: wide ? 0.13 : 0.1, w: 0.4, size: 20, align: 'right' }),
      Hd(churchName(ctx).replace(/\s+/, '\n'), { x: 0.08, y: 0.5, w: wide ? 0.55 : 0.84, size: wide ? 200 : 190, align: 'left', color: paper }),
      star(0.88, 0.5, wide ? 0.022 : 0.04, copper),
      Bd(`${times(ctx)}\n${city(ctx)}`, { x: 0.92, y: wide ? 0.85 : 0.88, w: 0.4, size: 20, align: 'right' }),
    ] }),
    verse: () => page({ bg: solid(paper, g), items: [
      Bd(VERSE, { x: 0.5, y: wide ? 0.38 : 0.36, w: wide ? 0.8 : 0.84, size: wide ? 30 : 34, lh: 1.4, fit: false }),
      Hd(REF, { x: 0.5, y: wide ? 0.66 : 0.66, w: 0.6, size: 84, color: ink }),
    ] }),
    give: () => page({ bg: solid(paper, g), items: [
      ...['Online', 'In person', 'By text'].flatMap((o, i) => [
        Sv(o, { x: 0.08, y: (wide ? 0.13 : 0.1) + i * (wide ? 0.13 : 0.1), w: 0.4, size: 34, align: 'left' }),
        Bd(i === 0 ? `${site(ctx)}/give` : i === 1 ? 'The giving box in the lobby' : 'Text GIVE to (770) 555-0100', { x: 0.08, y: (wide ? 0.18 : 0.135) + i * (wide ? 0.13 : 0.1), w: 0.4, size: 16, align: 'left' }),
      ]),
      qr(`${site(ctx)}/give`, wide ? 0.11 : 0.16, wide ? 0.78 : 0.48, wide ? 0.07 : 0.16, copper),
      Bd(`${churchName(ctx)}\nGenerous together`, { x: 0.92, y: wide ? 0.13 : 0.1, w: 0.4, size: 20, align: 'right' }),
      star(0.88, wide ? 0.38 : 0.3, wide ? 0.022 : 0.04, copper),
      Hd('Ways\nto give', { x: 0.92, y: wide ? 0.74 : 0.8, w: wide ? 0.42 : 0.7, size: 190, align: 'right', color: ink }),
    ] }),
    next: () => page({ bg: solid(black, g), items: [
      Bd('Welcome home', { x: 0.92, y: wide ? 0.1 : 0.08, w: 0.4, size: 20, align: 'right' }),
      star(0.94, wide ? 0.1 : 0.08, wide ? 0.018 : 0.03, copper),
      Hd('See you\nnext week', { x: 0.5, y: 0.47, w: wide ? 0.42 : 0.8, size: 200, color: paper }),
      Sv('Sundays', { x: wide ? 0.27 : 0.5, y: wide ? 0.49 : 0.72, w: 0.2, size: 50, align: wide ? 'right' : 'center' }),
      Sv(serviceTimes(ctx).join('\n'), { x: wide ? 0.73 : 0.5, y: wide ? 0.49 : 0.81, w: 0.2, size: 46, lh: 1.5, align: wide ? 'left' : 'center' }),
      star(0.07, wide ? 0.9 : 0.93, wide ? 0.018 : 0.03, copper),
      Bd(`${churchName(ctx)}\n${city(ctx)}`, { x: 0.1, y: wide ? 0.9 : 0.93, w: 0.4, size: 18, align: 'left' }),
    ] }),
  };
}

// ------------------------------------------------------------------ Vintner: burgundy and cream, a quiet grotesk
function vintner(kind, ctx) {
  const P = PACKS5.vintner; const [wine, cream, ink, paper] = P.c; const { wide, T, qr } = kit(kind);
  const Hd = (t, p) => T(t, { font: P.h, weight: 500, letter: -4, lh: 1, color: cream, ...p });
  const Sm = (t, p) => T(t, { font: P.b, weight: 500, size: 24, lh: 1.15, color: cream, ...p });
  const tiny = (t, p) => Sm(t, { size: 14, ...p });
  return {
    series: () => page({ bg: solid(wine), items: [
      Sm(`${churchName(ctx)}\nA sermon series`, { x: 0.06, y: 0.09, w: 0.3, align: 'left' }),
      ...(wide ? [Sm('Sundays this winter', { x: 0.5, y: 0.08, w: 0.3 })] : []),
      Sm('Week one\nGrowing deep', { x: 0.94, y: 0.09, w: 0.3, align: 'right' }),
      Hd('Rooted', { x: 0.06, y: wide ? 0.29 : 0.25, w: wide ? 0.62 : 0.88, size: 340, align: 'left' }),
      ...(wide ? [] : [Sm('Sundays this winter', { x: 0.06, y: 0.93, w: 0.5, align: 'left' })]),
    ] }),
    welcome: () => page({ bg: solid(wine), items: [
      Hd('Welcome\nHome', { x: 0.5, y: wide ? 0.27 : 0.27, w: 0.6, size: 130 }),
      tiny(times(ctx), { x: 0.07, y: 0.53, w: 0.3, align: 'left' }),
      tiny('We’re glad you’re here', { x: 0.5, y: 0.53, w: 0.3 }),
      tiny(site(ctx), { x: 0.93, y: 0.53, w: 0.3, align: 'right' }),
      Hd(churchName(ctx), { x: 0.5, y: wide ? 0.8 : 0.78, w: 0.84, size: 130 }),
    ] }),
    verse: () => page({ bg: solid(paper), items: [
      Sm(`${REF} (WEB)`, { x: 0.06, y: wide ? 0.3 : 0.2, w: 0.6, size: wide ? 40 : 36, align: 'left', color: wine }),
      Sm(VERSE, { x: 0.06, y: wide ? 0.48 : 0.42, w: wide ? 0.6 : 0.86, size: wide ? 34 : 34, lh: 1.3, align: 'left', color: wine, fit: false }),
      tiny(`${churchName(ctx)}\nA sermon series`, { x: 0.94, y: wide ? 0.3 : 0.86, w: 0.3, align: 'right', color: wine }),
      tiny('Rooted\nWeek one', { x: 0.94, y: wide ? 0.43 : 0.91, w: 0.3, align: 'right', color: wine }),
      ...(wide ? [tiny(site(ctx), { x: 0.94, y: 0.56, w: 0.3, align: 'right', color: wine })] : []),
    ] }),
    give: () => page({ bg: solid(paper), items: wide ? [
      tiny('Online, in person\nor by text', { x: 0.27, y: 0.2, w: 0.3, align: 'left', color: wine }),
      Hd('Ways to\nGive', { x: 0.07, y: 0.53, w: 0.3, size: 130, align: 'left', color: wine }),
      Sm(`Give online at ${site(ctx)}/give, in the lobby on Sunday, or scan the code.`, { x: 0.4, y: 0.53, w: 0.3, size: 36, lh: 1.1, align: 'left', color: wine, fit: false }),
      qr(`${site(ctx)}/give`, 0.88, 0.53, 0.09, wine),
      tiny(`${churchName(ctx)}\nGenerous together`, { x: 0.93, y: 0.86, w: 0.3, align: 'right', color: wine }),
    ] : [
      tiny('Online, in person or by text', { x: 0.08, y: 0.08, w: 0.6, align: 'left', color: wine }),
      Hd('Ways to\nGive', { x: 0.08, y: 0.27, w: 0.84, size: 190, align: 'left', color: wine }),
      Sm(`Give online at ${site(ctx)}/give, in the lobby on Sunday, or scan the code.`, { x: 0.08, y: 0.56, w: 0.6, size: 40, lh: 1.12, align: 'left', color: wine, fit: false }),
      qr(`${site(ctx)}/give`, 0.8, 0.82, 0.22, wine),
      tiny(`${churchName(ctx)}\nGenerous together`, { x: 0.08, y: 0.9, w: 0.5, align: 'left', color: wine }),
    ] }),
    next: () => page({ bg: solid(wine), items: [
      tiny(times(ctx), { x: 0.07, y: 0.1, w: 0.3, align: 'left' }),
      tiny(site(ctx), { x: 0.93, y: 0.1, w: 0.3, align: 'right' }),
      Hd('See You', { x: 0.5, y: 0.33, w: 0.7, size: 140 }),
      tiny(churchName(ctx), { x: 0.5, y: 0.53, w: 0.4 }),
      Hd('Next Week', { x: 0.5, y: 0.75, w: 0.7, size: 140 }),
    ] }),
  };
}

// ------------------------------------------------------------------ Sunrise: tight capitals, tan and rust, sun rays
function sunrise(kind, ctx) {
  const P = PACKS5.sunrise; const [rust, tan, ink, paper] = P.c; const { wide, R, T, qr } = kit(kind);
  const Hd = (t, p) => T(t, { font: P.h, weight: 500, upper: true, letter: -5, lh: 0.86, color: ink, ...p });
  const Sm = (t, p) => T(t, { font: P.b, weight: 500, upper: true, size: 22, lh: 1, color: ink, ...p });
  const rays = (x, y, w, fill, p = {}) => shape({ shape: 'rays', x, y, w, h: w * R, fill, count: 16, inner: 0.42, thick: 0.03, ...p });
  const top3 = (color) => churchName(ctx).toUpperCase().split(/\s+/).slice(0, 3).map((wd, i, a) => Sm(wd, { x: a.length === 1 ? 0.5 : 0.25 + (0.5 * i) / Math.max(1, a.length - 1), y: 0.1, w: 0.3, size: 30, color }));
  const pastor = ctx.church?.pastor || 'Speaker Name';
  return {
    series: () => page({ bg: solid(paper), items: [
      Hd('Light for\nthe road', { x: 0.05, y: wide ? 0.27 : 0.22, w: wide ? 0.6 : 0.9, size: 200, align: 'left' }),
      Sm(churchName(ctx).replace(/\s+/g, '\n'), { x: 0.95, y: wide ? 0.15 : 0.45, w: 0.3, size: 44, lh: 0.9, align: 'right', letter: -2 }),
      Hd(`With\n${pastor}`, { x: 0.95, y: wide ? 0.72 : 0.72, w: wide ? 0.5 : 0.7, size: 170, align: 'right' }),
      rays(0.02, 1.02, wide ? 0.32 : 0.5, ink, { phase: 0.1 }),
    ] }),
    welcome: () => page({ bg: solid(rust), items: [
      ...top3(tan),
      Hd('Welcome\nto church', { x: 0.5, y: wide ? 0.33 : 0.3, w: 0.84, size: 170, color: tan }),
      Hd(yr().slice(0, 2), { x: 0.08, y: wide ? 0.6 : 0.56, w: 0.2, size: 150, align: 'left', color: tan }),
      Hd(yr().slice(2), { x: 0.92, y: wide ? 0.6 : 0.56, w: 0.2, size: 150, align: 'right', color: tan }),
      rays(0.5, 1.03, wide ? 0.5 : 0.8, tan),
    ] }),
    verse: () => page({ bg: solid(paper), items: [
      Sm(VERSE, { x: 0.12, y: 0.45, w: wide ? 0.6 : 0.74, size: wide ? 50 : 42, lh: 1.05, letter: -1, align: 'left', fit: false }),
      Sm(REF, { x: 0.12, y: wide ? 0.72 : 0.74, w: 0.5, size: 24, weight: 700, letter: 0, align: 'left' }),
      rays(1.02, 0.45, wide ? 0.24 : 0.4, ink),
    ] }),
    give: () => page({ bg: solid(paper), items: [
      Hd('Get', { x: 0.5, y: wide ? 0.15 : 0.14, w: 0.5, size: 150 }),
      qr(`${site(ctx)}/connect`, wide ? 0.2 : 0.3, wide ? 0.5 : 0.48, wide ? 0.12 : 0.26, ink),
      Sm('Groups, serving\nand classes\nall start\nright here', { x: wide ? 0.42 : 0.68, y: wide ? 0.5 : 0.48, w: 0.3, size: 30, lh: 0.95, letter: -1 }),
      Hd('Connected', { x: 0.5, y: wide ? 0.86 : 0.86, w: 0.84, size: 150 }),
      rays(1.02, wide ? 0.48 : 0.62, wide ? 0.3 : 0.4, ink),
    ] }),
    next: () => page({ bg: solid(rust), items: [
      ...top3(tan),
      Hd('See you\nnext week', { x: 0.5, y: wide ? 0.33 : 0.3, w: 0.84, size: 170, color: tan }),
      Hd(yr().slice(0, 2), { x: 0.08, y: wide ? 0.6 : 0.56, w: 0.2, size: 150, align: 'left', color: tan }),
      Hd(yr().slice(2), { x: 0.92, y: wide ? 0.6 : 0.56, w: 0.2, size: 150, align: 'right', color: tan }),
      rays(0.5, 1.03, wide ? 0.5 : 0.8, tan),
    ] }),
  };
}

// ------------------------------------------------------------------ Blueprint: script on denim, a fine grid
function blueprint(kind, ctx) {
  const P = PACKS5.blueprint; const [denim, , , pale, white] = P.c; const { wide, T, box, circle, qr } = kit(kind);
  const Sc = (t, p) => T(t, { font: P.h, weight: 400, lh: 1.05, color: white, ...p });
  const Cap = (t, p) => T(t, { font: P.b, weight: 700, upper: true, size: 20, lh: 1.15, letter: 1, color: white, ...p });
  const Sm = (t, p) => Cap(t, { weight: 500, ...p });
  const grid = (x, y, w, h, cols, fill = white, p = {}) => shape({ shape: 'gridlines', x, y, w, h, cols, fill, thick: 0.004, ...p });
  return {
    series: () => page({ bg: solid(denim, 0.05), items: [
      Sc('Abide', { x: wide ? 0.28 : 0.5, y: wide ? 0.33 : 0.27, w: wide ? 0.42 : 0.84, size: 240 }),
      Cap('A sermon series', { x: wide ? 0.74 : 0.5, y: wide ? 0.29 : 0.45, w: 0.3, size: 24 }),
      Sm('Staying close to Jesus\nin a hurried world', { x: wide ? 0.74 : 0.5, y: wide ? 0.36 : 0.51, w: 0.36, size: 22 }),
      grid(0.5, wide ? 0.87 : 0.86, 1.02, wide ? 0.27 : 0.3, wide ? 26 : 12),
    ] }),
    welcome: () => page({ bg: solid(pale), items: [
      Cap('Welcome home', { x: 0.5, y: 0.34, w: 0.5, size: 20, color: denim }),
      Sm(`${times(ctx)}\n${site(ctx)}`, { x: 0.5, y: 0.39, w: 0.6, size: 18, color: denim }),
      Sc(churchName(ctx), { x: 0.5, y: 0.56, w: wide ? 0.5 : 0.84, size: 140, color: denim }),
      circle(wide ? 0.78 : 0.84, wide ? 0.46 : 0.45, wide ? 0.05 : 0.1, { fill: 'none', line: 3, stroke: denim }),
      Cap(`Est.\n${yr()}`, { x: wide ? 0.78 : 0.84, y: wide ? 0.46 : 0.45, w: 0.08, size: 14, color: denim, fit: false }),
    ] }),
    verse: () => page({ bg: solid(denim, 0.05), items: [
      Cap(REF, { x: 0.5, y: wide ? 0.18 : 0.14, w: 0.5, size: 24 }),
      Sm(VERSE, { x: 0.5, y: wide ? 0.32 : 0.3, w: wide ? 0.56 : 0.8, size: wide ? 20 : 26, fit: false }),
      Sc('Abide', { x: wide ? 0.06 : 0.08, y: wide ? 0.76 : 0.72, w: 0.4, size: 160, align: 'left' }),
      Sm('A sermon series\nStaying close to Jesus', { x: wide ? 0.94 : 0.92, y: wide ? 0.78 : 0.86, w: 0.36, size: 18, align: 'right' }),
    ] }),
    give: () => page({ bg: solid(denim, 0.05), items: [
      qr(`${site(ctx)}/give`, 0.5, wide ? 0.3 : 0.3, wide ? 0.06 : 0.14, white),
      Sc('Ways to Give', { x: 0.5, y: 0.53, w: wide ? 0.56 : 0.86, size: 170 }),
      Sm('Online\nanytime', { x: wide ? 0.13 : 0.25, y: wide ? 0.53 : 0.72, w: 0.14, size: 14 }),
      Sm('In person\non Sunday', { x: wide ? 0.87 : 0.75, y: wide ? 0.53 : 0.72, w: 0.14, size: 14 }),
      Sm(`${site(ctx)}/give`, { x: 0.5, y: wide ? 0.85 : 0.88, w: 0.6, size: 18 }),
    ] }),
    next: () => page({ bg: solid(denim, 0.05), items: [
      grid(0.5, 0.5, 1.02, 1.02, wide ? 22 : 12),
      box(0.5, 0.5, wide ? 0.66 : 0.8, wide ? 0.6 : 0.5, pale),
      Sc('See You\nNext Week', { x: wide ? 0.42 : 0.5, y: wide ? 0.5 : 0.46, w: wide ? 0.36 : 0.7, size: 150, color: denim }),
      Cap(`${churchName(ctx)}\n${times(ctx)}`, { x: wide ? 0.72 : 0.5, y: wide ? 0.5 : 0.66, w: wide ? 0.16 : 0.6, size: 16, color: denim }),
    ] }),
  };
}

// ------------------------------------------------------------------ Refrain: a repeating tall serif and a row of dots
function refrain(kind, ctx) {
  const P = PACKS5.refrain; const [coal, cream, ink, paper, white] = P.c; const { wide, T, box, qr, dots } = kit(kind);
  const Sf = (t, p) => T(t, { font: P.h, weight: 400, letter: -6, lh: 0.88, color: cream, ...p });
  const Sm = (t, p) => T(t, { font: P.b, weight: 500, upper: true, size: 20, lh: 1.15, color: cream, ...p });
  const row = (y, color) => dots(y, color, wide ? [0.12, 0.23, 0.31, 0.45, 0.62, 0.7, 0.76, 0.85] : [0.1, 0.24, 0.33, 0.5, 0.66, 0.75, 0.9], wide ? 0.007 : 0.012);
  // "Welcome / To Church / Name", the church name split over two lines so the type can stay big.
  const words = churchName(ctx).replace(/^The\s+/i, '').split(/\s+/);
  const cut = Math.max(1, Math.ceil(words.length / 2));
  const big = `Welcome\nTo ${words.slice(0, cut).join(' ')}${words.length > 1 ? `\n${words.slice(cut).join(' ')}` : ''}`;
  return {
    series: () => {
      const main = Sf(big, { x: 0.5, y: 0.46, w: wide ? 0.74 : 0.9, size: 300, lh: 0.84 });
      // Copies repeat to the left and right, one real text width (plus a gap) apart.
      const span = widest(big, P.h, 400, main.size, false, -6) / (wide ? 1920 : 1080) + (wide ? 0.07 : 0.1);
      return page({ bg: solid(coal), items: [
        { ...main, id: uid(), x: 0.5 - span, w: main.w }, main, { ...main, id: uid(), x: 0.5 + span, w: main.w },
        ...row(wide ? 0.9 : 0.86, white),
      ] });
    },
    welcome: () => page({ bg: solid(paper), items: [
      ...[0, 1, 2, 3, 4].map((i) => Sf(i % 2 ? `${churchName(ctx)} ${churchName(ctx)}` : `Welcome Home Welcome`, { x: wide ? -0.08 - i * 0.05 : -0.1 - i * 0.07, y: 0.12 + i * 0.19, w: 1.6, size: wide ? 150 : 120, align: 'left', color: ink, fit: false })),
      box(wide ? 0.69 : 0.5, wide ? 0.5 : 0.82, wide ? 0.62 : 1.02, wide ? 1.02 : 0.36, paper),
      box(wide ? 0.38 : 0.5, wide ? 0.5 : 0.64, wide ? 0.0015 : 0.96, wide ? 0.94 : 0.0012, ink),
      box(0.5, 0.5, 0.96, 0.94, 'none', { line: 2, stroke: ink }),
      Sm(`${churchName(ctx)}      ${times(ctx)}`, { x: wide ? 0.69 : 0.5, y: wide ? 0.5 : 0.82, w: wide ? 0.5 : 0.84, size: 22, color: ink }),
    ] }),
    verse: () => page({ bg: solid(coal), items: [
      Sm('A sermon series', { x: 0.93, y: 0.1, w: 0.4, align: 'right' }),
      Sm(VERSE, { x: 0.07, y: wide ? 0.33 : 0.3, w: wide ? 0.6 : 0.86, size: wide ? 26 : 30, align: 'left', fit: false }),
      Sf(REF.replace(/\s.*$/, '').toUpperCase() + REF.replace(/^\S+/, ''), { x: 0.5, y: wide ? 0.73 : 0.7, w: 0.9, size: 170, letter: -8 }),
      ...row(wide ? 0.88 : 0.84, white),
    ] }),
    give: () => page({ bg: solid(coal), items: [
      ...row(0.1, white),
      qr(`${site(ctx)}/give`, wide ? 0.15 : 0.22, wide ? 0.33 : 0.3, wide ? 0.09 : 0.24, white),
      Sm('Every gift helps\nshare the good news\nhere and around\nthe world', { x: wide ? 0.08 : 0.1, y: wide ? 0.72 : 0.52, w: 0.3, size: 14, align: 'left' }),
      Sf('Ways\nto Give', { x: wide ? 0.56 : 0.5, y: wide ? 0.47 : 0.68, w: wide ? 0.42 : 0.84, size: 200 }),
      Sm(churchName(ctx), { x: wide ? 0.93 : 0.92, y: wide ? 0.36 : 0.3, w: 0.2, size: 18, align: 'right' }),
      ...['Online', 'In person', 'By text'].map((o, i) => Sm(o, { x: (wide ? 0.42 : 0.2) + i * (wide ? 0.17 : 0.3), y: wide ? 0.86 : 0.92, w: 0.2, size: 20 })),
    ] }),
    next: () => page({ bg: solid(paper), items: [
      Sm(`${churchName(ctx)}      ${times(ctx)}`, { x: 0.5, y: 0.1, w: 0.8, size: 20, color: ink }),
      ...row(0.2, ink),
      Sf('See You\nNext Week', { x: 0.5, y: 0.58, w: wide ? 0.6 : 0.88, size: 230, color: ink }),
    ] }),
  };
}

// ------------------------------------------------------------------ Dusk: a grainy sunset and plain black capitals
function dusk(kind, ctx) {
  const P = PACKS5.dusk; const [orange, plum, ink, , red] = P.c; const { wide, T, box, qr, star } = kit(kind);
  const sky = (flip) => ({ type: 'gradient', from: flip ? orange : plum, via: red, viaAt: flip ? 0.4 : 0.6, to: flip ? plum : orange, angle: 90, darken: 0, grain: 0.07 });
  const Hd = (t, p) => T(t, { font: P.h, weight: 400, upper: true, letter: -3, lh: 0.95, color: ink, ...p });
  const Sm = (t, p) => T(t, { font: P.b, weight: 400, upper: true, size: 18, lh: 1.1, color: ink, ...p });
  const foot = (y) => [
    Sm(`${churchName(ctx)} · Welcome home\n${city(ctx)}\n${times(ctx)}`, { x: 0.07, y, w: 0.4, align: 'left' }),
    star(0.5, y, wide ? 0.02 : 0.035, ink, { count: 3, thick: 0.12 }),
    Sm(`${churchName(ctx)}\n${site(ctx)}`, { x: 0.93, y, w: 0.3, align: 'right' }),
  ];
  return {
    series: () => page({ bg: sky(false), items: [
      Hd(`Seek first\nOne thing\n(${yr()})`, { x: 0.5, y: 0.44, w: wide ? 0.6 : 0.88, size: 170 }),
      ...foot(wide ? 0.87 : 0.9),
    ] }),
    welcome: () => page({ bg: { ...sky(true), angle: 90 }, items: [
      Hd(churchName(ctx).replace(/\s+/, '\n'), { x: 0.07, y: wide ? 0.26 : 0.2, w: wide ? 0.44 : 0.8, size: 120, align: 'left' }),
      Hd(`(${yr().slice(2)})`, { x: wide ? 0.62 : 0.93, y: wide ? 0.18 : 0.38, w: 0.2, size: 90, align: wide ? 'left' : 'right' }),
      Hd(`(${yr().slice(2)})`, { x: 0.07, y: wide ? 0.55 : 0.5, w: 0.2, size: 90, align: 'left' }),
      Hd('Welcome\nhome', { x: 0.93, y: wide ? 0.5 : 0.64, w: 0.44, size: 120, align: 'right' }),
      Sm('Wherever you are on your journey, there is a seat for you here. Come as you are.', { x: 0.07, y: wide ? 0.82 : 0.84, w: wide ? 0.4 : 0.6, size: 14, align: 'left', fit: false }),
      star(0.9, wide ? 0.85 : 0.9, wide ? 0.016 : 0.03, ink, { count: 3, thick: 0.12 }),
    ] }),
    verse: () => page({ bg: sky(true), items: [
      ...(wide ? [box(0.83, 0.5, 0.34, 1.02, plum, { opacity: 0.85 })] : [box(0.5, 0.86, 1.02, 0.28, plum, { opacity: 0.85 })]),
      Hd(REF, { x: 0.06, y: wide ? 0.2 : 0.12, w: 0.6, size: 48, upper: false, letter: -1, align: 'left' }),
      T(VERSE, { font: P.b, weight: 400, size: wide ? 30 : 38, lh: 1.15, x: 0.06, y: wide ? 0.47 : 0.38, w: wide ? 0.56 : 0.86, align: 'left', color: ink, fit: false }),
      star(wide ? 0.83 : 0.5, wide ? 0.48 : 0.8, wide ? 0.016 : 0.03, ink, { count: 3, thick: 0.12 }),
      Sm(`${churchName(ctx)}\n${site(ctx)}`, { x: wide ? 0.95 : 0.5, y: wide ? 0.9 : 0.9, w: 0.3, align: wide ? 'right' : 'center' }),
    ] }),
    give: () => page({ bg: sky(true), items: [
      Sm('Online  |  In person  |  By text  |  Every Sunday', { x: 0.5, y: 0.07, w: 0.8, size: 14, letter: 2 }),
      qr(`${site(ctx)}/give`, wide ? 0.25 : 0.25, wide ? 0.27 : 0.2, wide ? 0.07 : 0.15, ink),
      Hd('Ways\nto give', { x: wide ? 0.42 : 0.92, y: wide ? 0.35 : 0.36, w: 0.5, size: 140, align: wide ? 'left' : 'right' }),
      Hd('Safe\n& secure', { x: 0.06, y: wide ? 0.72 : 0.62, w: 0.5, size: 140, align: 'left' }),
      qr(`${site(ctx)}/give`, wide ? 0.75 : 0.78, wide ? 0.78 : 0.85, wide ? 0.07 : 0.15, ink),
    ] }),
    next: () => page({ bg: { ...sky(false), from: red, via: null, to: orange }, items: [
      Sm(city(ctx), { x: 0.5, y: 0.2, w: 0.4, size: 20 }),
      Hd('See you\nnext week', { x: 0.5, y: 0.45, w: wide ? 0.6 : 0.88, size: 160 }),
      ...foot(wide ? 0.87 : 0.9),
    ] }),
  };
}

// ------------------------------------------------------------------ Orbit: red and cream, letters in circles
function orbit(kind, ctx) {
  const P = PACKS5.orbit; const [red, cream, ink] = P.c; const { wide, T, qr, star } = kit(kind);
  const Hd = (t, p) => T(t, { font: P.h, weight: 500, letter: -6, lh: 0.92, color: cream, ...p });
  const Sm = (t, p) => T(t, { font: P.b, weight: 500, size: 40, lh: 1, letter: -1, color: cream, ...p });
  // Letters in rings. Each letter takes about 1.2 times the text size, so the width is set from that.
  const Ring = (t, p) => { const n = [...t.replace(/\s/g, '')].length + t.split(/\s+/).length * 0.45; const W = wide ? 1920 : 1080; const size = Math.min(p.size || 90, (p.w * W * 0.96) / (n * 1.2)); return T(t, { font: P.h, weight: 500, upper: true, fit: false, letter: 0, color: cream, ...p, size, fx: { circles: { width: 0.06, gap: 0.06 } } }); };
  const ast = (x, y, w, fill) => star(x, y, w, fill, { count: 3, thick: 0.16 });
  // Where a circled word starts after a plain one: the plain word's width plus a small space.
  const after = (word, size) => (widest(word, P.h, 500, size, false, -6) + size * 0.25) / (wide ? 1920 : 1080);
  return {
    series: () => page({ bg: solid(red), items: [
      Hd('Made', { x: 0.1, y: wide ? 0.27 : 0.22, w: wide ? 0.5 : 0.8, size: 280, align: 'left' }),
      Ring('New', { x: 0.1, y: wide ? 0.53 : 0.41, w: wide ? 0.42 : 0.62, size: wide ? 170 : 150, align: 'left' }),
      Sm(`A series\n${new Date().toLocaleString('en', { month: 'long' })}\n${yr()}`, { x: 0.9, y: wide ? 0.22 : 0.62, w: 0.3, size: 60, align: 'right' }),
      Ring(churchName(ctx), { x: 0.1, y: wide ? 0.86 : 0.88, w: wide ? 0.3 : 0.5, size: 34, align: 'left' }),
      ast(wide ? 0.43 : 0.65, wide ? 0.86 : 0.88, wide ? 0.05 : 0.09, cream),
      Sm('Becoming who\nGod made you\nto be', { x: 0.9, y: wide ? 0.82 : 0.78, w: 0.4, size: 40, align: 'right' }),
    ] }),
    welcome: () => page({ bg: solid(cream), items: [
      Hd('Welcome', { x: 0.5, y: wide ? 0.25 : 0.25, w: 0.86, size: 230, color: red }),
      Hd('To', { x: wide ? 0.08 : 0.06, y: wide ? 0.52 : 0.47, w: 0.2, size: 170, align: 'left', color: red }),
      Ring('Church', { x: (wide ? 0.08 : 0.06) + after('To', 170), y: wide ? 0.52 : 0.47, w: wide ? 0.66 : 0.72, size: 150, align: 'left', color: red }),
      ast(wide ? 0.25 : 0.18, wide ? 0.8 : 0.72, wide ? 0.06 : 0.1, red),
      Hd(nextSunday(), { x: 0.5, y: wide ? 0.8 : 0.72, w: 0.4, size: 150, color: red }),
      ast(wide ? 0.75 : 0.82, wide ? 0.8 : 0.72, wide ? 0.09 : 0.14, red),
    ] }),
    verse: () => page({ bg: solid(red), items: [
      Ring('Made new', { x: 0.98, y: 0.06, w: wide ? 0.34 : 0.6, size: 50, align: 'right' }),
      T(VERSE.toUpperCase(), { font: P.b, weight: 500, size: wide ? 30 : 34, lh: 1.25, x: 0.12, y: wide ? 0.36 : 0.36, w: wide ? 0.56 : 0.76, align: 'left', color: cream, fit: false }),
      Hd('sermon', { x: wide ? -0.02 : -0.04, y: wide ? 0.95 : 0.96, w: 0.9, size: wide ? 260 : 220, align: 'left', fit: false, fx: { outline: { width: 3, hollow: true } } }),
      Sm(REF.replace(' ', '\n'), { x: 0.94, y: wide ? 0.84 : 0.78, w: 0.3, size: 32, align: 'right' }),
    ] }),
    give: () => page({ bg: solid(red), items: [
      Hd('Get', { x: 0.08, y: wide ? 0.2 : 0.2, w: 0.5, size: 220, align: 'left' }),
      Ring('Connected', { x: 0.08, y: wide ? 0.44 : 0.4, w: 0.84, size: 120, align: 'left' }),
      qr(`${site(ctx)}/connect`, wide ? 0.87 : 0.8, wide ? 0.18 : 0.14, wide ? 0.08 : 0.16, cream),
      Ring(churchName(ctx), { x: 0.08, y: wide ? 0.85 : 0.88, w: wide ? 0.3 : 0.5, size: 30, align: 'left' }),
      Sm(`Groups\nServing\n${site(ctx)}`, { x: 0.92, y: wide ? 0.8 : 0.82, w: 0.4, size: 44, align: 'right' }),
    ] }),
    next: () => page({ bg: solid(cream), items: [
      Hd('See you\nnext', { x: 0.08, y: wide ? 0.32 : 0.3, w: 0.84, size: 230, align: 'left', color: red }),
      Ring('Week', { x: 0.08 + after('next', 230), y: wide ? 0.43 : 0.42, w: wide ? 0.3 : 0.44, size: wide ? 100 : 80, align: 'left', color: red }),
      ast(wide ? 0.2 : 0.16, wide ? 0.78 : 0.74, wide ? 0.06 : 0.1, red),
      Hd(nextSunday(), { x: 0.5, y: wide ? 0.78 : 0.74, w: 0.4, size: 150, color: red }),
      ast(wide ? 0.8 : 0.84, wide ? 0.78 : 0.74, wide ? 0.09 : 0.14, red),
    ] }),
  };
}

const BUILDERS = { ember, vintner, sunrise, blueprint, refrain, dusk, orbit };

// With "My brand colors" on, only each pack's signature colors change (to the church's first and second colors).
// Its paper, black and ink stay, so text keeps reading clearly on its background.
const SIGNATURE = {
  ember: { '#C8764A': 0 }, vintner: { '#6A1E2A': 0 }, sunrise: { '#B65A2E': 0 }, blueprint: { '#3A5A86': 0 },
  refrain: {}, dusk: { '#E8772A': 0, '#D9542E': 0, '#3E3653': 1 }, orbit: { '#D44D33': 0 },
};
/** Swaps exact signature colors for brand colors everywhere in the pages: backgrounds, shapes, text, QR codes and text styles. */
export function inSignatureColors(pages, swap, brand) {
  const sw = (v) => (typeof v === 'string' && swap[v.toUpperCase()] !== undefined ? brand[swap[v.toUpperCase()]] || v : v);
  return pages.map((pg) => ({
    ...pg,
    bg: { ...pg.bg, color: sw(pg.bg?.color), color2: sw(pg.bg?.color2), from: sw(pg.bg?.from), via: sw(pg.bg?.via), to: sw(pg.bg?.to) },
    items: pg.items.map((it) => ({ ...it, id: uid(), fill: sw(it.fill), color: sw(it.color), stroke: sw(it.stroke), ...(it.fx ? { fx: Object.fromEntries(Object.entries(it.fx).map(([k, v]) => [k, v && { ...v, color: sw(v.color) }])) } : {}) })),
  }));
}
const PAGES = ['series', 'welcome', 'verse', 'give', 'next'];
// The fourth page is about giving in most packs and about getting connected in two.
const FOURTH = { sunrise: 'Get connected', orbit: 'Get connected' };
const pages = (id, kind, keys, ctx) => { const b = BUILDERS[id](kind, ctx); return keys.map((k) => b[k]()); };

export const PACK5_TEMPLATES = Object.entries(PACKS5).flatMap(([id, P]) => {
  const fourth = FOURTH[id] || 'Ways to give';
  const meta = { pack: id, photos: 0, brandSwap: SIGNATURE[id] };
  return [
    { id: `${id}-series-deck`, ...meta, kind: 'presentation', name: `${P.name} sermon series slides`, build: (ctx) => pages(id, 'presentation', PAGES, ctx) },
    { id: `${id}-series-carousel`, ...meta, kind: 'carousel', name: `${P.name} sermon series carousel`, build: (ctx) => pages(id, 'carousel', PAGES, ctx) },
    { id: `${id}-card-welcome`, ...meta, kind: 'post', name: `${P.name} welcome card`, build: (ctx) => pages(id, 'post', ['welcome'], ctx) },
    { id: `${id}-card-give`, ...meta, kind: 'post', name: `${P.name} ${fourth.toLowerCase()} card`, build: (ctx) => pages(id, 'post', ['give'], ctx) },
    { id: `${id}-card-next`, ...meta, kind: 'post', name: `${P.name} see you next week card`, build: (ctx) => pages(id, 'post', ['next'], ctx) },
    { id: `${id}-slide-welcome`, ...meta, kind: 'slide', name: `${P.name} welcome slide`, build: (ctx) => pages(id, 'slide', ['welcome'], ctx) },
    { id: `${id}-slide-give`, ...meta, kind: 'slide', name: `${P.name} ${fourth.toLowerCase()} slide`, build: (ctx) => pages(id, 'slide', ['give'], ctx) },
    { id: `${id}-slide-next`, ...meta, kind: 'slide', name: `${P.name} see you next week slide`, build: (ctx) => pages(id, 'slide', ['next'], ctx) },
  ];
});
