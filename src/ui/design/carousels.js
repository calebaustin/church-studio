// Swipeable carousels for every template pack. Each one reads as one long canvas: ribbons, paths, blobs and
// circles run across the seams, so swiping feels like sliding along a single picture. Layout ideas adapted from
// common carousel patterns (continuous waves, numbered paths, seam circles, big numbers); colors and fonts come
// from the pack, and the words from your sermon, or a friendly sample you can change.
import { page, shape, text as rawText, uid } from './model.js';
import { PACKS } from './packs.js';
import { PACKS2 } from './packs2.js';
import { PACKS3 } from './packs3.js';

const W = 1080; const H = 1350; const R = W / H; // a circle w wide is w * R tall

// ------------------------------------------------------------------ helpers
const hex = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const mix = (a, b, t) => { const x = hex(a); const y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const on = (h) => (lum(h) > 0.6 ? '#141414' : '#FFFFFF');
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const fit = (t, base, min = base * 0.55, room = 18) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const times = (ctx) => ctx.church?.times || 'Sundays at 9 & 11';
const num = (i) => String(i).padStart(2, '0');

/**
 * A left-to-right gradient that flows across all the slides: each slide gets the slice it covers, with its
 * stops set so the colors meet exactly at the seams (the gradient line runs past the page edges).
 */
function flow(i, n, from, to) {
  const e0 = hex(mix(from, to, i / n)); const e1 = hex(mix(from, to, (i + 1) / n));
  const r = Math.hypot(W, H) / 2; const t0 = (r - W / 2) / (2 * r);
  const d = e1.map((v, k) => (v - e0[k]) / (1 - 2 * t0));
  const a = e0.map((v, k) => v - d[k] * t0);
  return { type: 'gradient', from: toHex(a), to: toHex(a.map((v, k) => v + d[k])), angle: 0, darken: 0 };
}

/**
 * Build the slides. `across` items are placed on the whole carousel (x from 0 to n, in slide widths) and
 * copied onto every slide they touch, shifted, so they line up at the seams. `slide(i)` adds each slide's own items.
 */
function carousel(n, bg, across, slide) {
  // Every piece that runs across slides is linked, so moving or recoloring it on one slide moves it on all.
  across = across.map((it) => ({ ...it, link: uid() }));
  return Array.from({ length: n }, (_, i) => {
    const shared = across
      .filter((it) => it.x + it.w / 2 > i && it.x - it.w / 2 < i + 1)
      .map((it) => shape({ ...it, x: it.x - i }));
    return page({ bg: bg(i), items: [...shared, ...slide(i)] });
  });
}

function kit(P) {
  const up = (t) => (P.up ? String(t).toUpperCase() : t);
  const Hd = (t, p) => rawText({ text: up(t), font: P.h, weight: P.hw || 700, letter: P.letter || 0, lh: 1.05, ...p });
  const Bd = (t, p) => rawText({ text: t, font: P.b, weight: 500, size: 38, lh: 1.35, ...p });
  // Left-aligned text by its left edge (a text box's x is its center).
  const left = (fn) => (t, x0, y, w, p = {}) => fn(t, { align: 'left', x: x0 + w / 2, y, w, ...p });
  return { Hd, Bd, HL: left(Hd), BL: left(Bd) };
}

// ------------------------------------------------------------------ words: a sermon recap, a first-Sunday guide or a Bible basics list
function words(kind, ctx) {
  const o = ctx.o || {};
  if (kind === 'recap') {
    const pts = (o.points?.length ? o.points : [
      { heading: 'Roots grow in hidden places', line: 'What happens in private shapes what we can carry in public.' },
      { heading: 'Growth takes seasons', line: 'You can’t rush a root. Stay planted and keep watering.' },
      { heading: 'We grow together', line: 'No tree grows alone. Find a few people to grow with.' },
    ]).slice(0, 4).map((p) => ({ h: p.heading, b: p.line || '' }));
    return {
      kicker: 'Sunday recap', title: o.title || 'Rooted', sub: ctx.church?.pastor ? `A message from ${ctx.church.pastor}` : 'Missed Sunday? Here it is in a minute.',
      points: pts, endTitle: 'See you Sunday', endLine: `${times(ctx)} · ${churchName(ctx)}`,
    };
  }
  if (kind === 'expect') {
    return {
      kicker: 'New here?', title: 'Your first Sunday', sub: 'What to expect when you visit, so you can walk in at ease.',
      points: [
        { h: 'Come as you are', b: 'Jeans are fine. So are questions. There is no dress code.' },
        { h: 'Someone will say hi', b: 'Look for a friendly face at the door. They can show you around.' },
        { h: 'About an hour', b: 'Singing, prayer and a message from the Bible.' },
        { h: 'Kids are welcome', b: 'Families are part of everything here. Ask about classes for kids.' },
      ],
      endTitle: 'We saved you a seat', endLine: `${times(ctx)} · ${site(ctx)}`,
    };
  }
  return {
    kicker: 'Bible basics', title: 'How to start reading the Bible', sub: 'Four small steps to build a habit that lasts.',
    points: [
      { h: 'Start with a Gospel', b: 'Mark is short and fast. Read one chapter a day.' },
      { h: 'Pick a time', b: 'Same time, same place. Five quiet minutes counts.' },
      { h: 'Read it slowly', b: 'Notice what Jesus says and does. Underline what stands out.' },
      { h: 'Talk about it', b: 'Bring your questions to a friend or a small group.' },
    ],
    endTitle: 'Start this week', endLine: `Join us ${times(ctx).replace(/^Sundays/, 'Sundays')} · ${site(ctx)}`,
  };
}

// Small things every slide shares: the count in the corner and the church's name.
const counter = (Bd, i, n, color) => Bd(`${i + 1}/${n}`, { x: 0.9, y: 0.05, w: 0.14, size: 24, weight: 700, color, opacity: 0.75 });
const swipeCue = (Bd, color) => [
  Bd('Swipe', { x: 0.74, y: 0.93, w: 0.16, size: 26, weight: 700, letter: 2, color }),
  shape({ shape: 'swipe', x: 0.87, y: 0.93, w: 0.1, h: 0.03, fill: color }),
];

// ------------------------------------------------------------------ styles
// Ribbon: two flowing bands sweep across every slide over a deep gradient.
function ribbon(P, C) {
  const { Hd, Bd, HL, BL } = kit(P); const [c0, c1, c2] = P.c;
  const dark = lum(c2) < 0.35 ? c2 : mix(c0, '#000000', 0.55); const ink = '#FFFFFF';
  const n = C.points.length + 2;
  return carousel(n, (i) => flow(i, n, dark, mix(dark, c0, 0.5)), [
    { shape: 'ribbon', x: n / 2, w: n, y: 0.8, h: 0.34, cycles: n * 0.42, phase: 1.3, fill: c1, opacity: 0.55 },
    { shape: 'ribbon', x: n / 2, w: n, y: 0.76, h: 0.42, cycles: n * 0.45, fill: c0, opacity: 0.95 },
  ], (i) => {
    if (i === 0) return [
      BL(C.kicker.toUpperCase(), 0.08, 0.14, 0.8, { size: 28, weight: 700, letter: 6, color: c1 }),
      HL(C.title, 0.08, 0.3, 0.84, { size: fit(C.title, 124, 76, 14), color: ink }),
      BL(C.sub, 0.08, 0.46, 0.7, { size: 34, color: ink, opacity: 0.85 }),
      ...swipeCue(Bd, ink),
    ];
    if (i === n - 1) return [
      Hd(C.endTitle, { x: 0.5, y: 0.26, w: 0.84, size: fit(C.endTitle, 110, 70, 14), color: ink }),
      Bd(C.endLine, { x: 0.5, y: 0.42, w: 0.8, size: 34, color: ink, opacity: 0.85 }),
      Bd(site(ctxSite), { x: 0.5, y: 0.5, w: 0.8, size: 30, weight: 700, color: c1 }),
    ];
    const p = C.points[i - 1];
    return [
      counter(Bd, i, n, ink),
      HL(num(i), 0.08, 0.14, 0.4, { size: 150, color: c1 }),
      HL(p.h, 0.08, 0.31, 0.84, { size: fit(p.h, 78, 54, 24), color: ink }),
      BL(p.b, 0.08, 0.45, 0.8, { size: 36, color: ink, opacity: 0.85 }),
    ];
  });
}
let ctxSite = {}; // the church details for the end slides (set per build)

// Path: one winding line runs through every slide, with a numbered stop on each.
function path(P, C, thin = false) {
  const { Hd, Bd, HL, BL } = kit(P); const [c0, c1, c2, c3, c4] = P.c;
  const n = C.points.length + 2; const y0 = 0.66; const hh = 0.3;
  const stopY = (i) => y0 + hh * 0.32 * Math.sin(Math.PI * (i + 0.5));
  return carousel(n, (i) => flow(i, n, c3, mix(c3, c4, 0.35)), [
    { shape: 'squiggle', edge: true, x: n / 2, w: n, y: y0, h: hh, cycles: n / 2, thick: thin ? 0.035 : 0.075, fill: c0 },
  ], (i) => {
    const stop = (label) => [
      shape({ shape: 'ellipse', x: 0.5, y: stopY(i), w: 0.2, h: 0.2 * R, fill: c3, line: thin ? 6 : 10, stroke: c0 }),
      Hd(label, { x: 0.5, y: stopY(i), w: 0.2, size: 60, color: c0 }),
    ];
    if (i === 0) return [
      Bd(C.kicker.toUpperCase(), { x: 0.5, y: 0.12, w: 0.8, size: 26, weight: 700, letter: 8, color: c0 }),
      Hd(C.title, { x: 0.5, y: 0.26, w: 0.86, size: fit(C.title, 112, 70, 14), color: c2 }),
      Bd(C.sub, { x: 0.5, y: 0.4, w: 0.76, size: 32, color: c2, opacity: 0.8 }),
      ...swipeCue(Bd, c0),
    ];
    if (i === n - 1) return [
      Hd(C.endTitle, { x: 0.5, y: 0.22, w: 0.84, size: fit(C.endTitle, 100, 64, 14), color: c2 }),
      Bd(C.endLine, { x: 0.5, y: 0.36, w: 0.8, size: 32, color: c2, opacity: 0.85 }),
      shape({ shape: 'sparkle', x: 0.5, y: stopY(i), w: 0.12, h: 0.12 * R, fill: c1 }),
      Bd(churchName(ctxSite), { x: 0.5, y: 0.93, w: 0.8, size: 26, weight: 700, letter: 4, color: c0 }),
    ];
    const p = C.points[i - 1];
    return [
      counter(Bd, i, n, c0),
      HL(p.h, 0.08, 0.17, 0.84, { size: fit(p.h, 72, 50, 24), color: c2 }),
      BL(p.b, 0.08, 0.32, 0.8, { size: 34, color: c2, opacity: 0.8 }),
      ...stop(String(i)),
      Bd(churchName(ctxSite), { x: 0.5, y: 0.94, w: 0.8, size: 22, weight: 700, letter: 4, color: c0, opacity: 0.7 }),
    ];
  });
}

// Big numbers: slides alternate strong and light, with half circles rising across each seam.
function bignum(P, C) {
  const { Hd, Bd, HL, BL } = kit(P); const [c0, c1, c2, c3] = P.c;
  const n = C.points.length + 2;
  const bgc = (i) => (i % 2 ? c0 : c3); const ink = (i) => (i % 2 ? on(c0) : c2);
  const seams = Array.from({ length: n - 1 }, (_, k) => ({ shape: 'ellipse', x: k + 1, y: 1.0, w: 0.8, h: 0.8 * R, fill: c1, opacity: 0.9 }));
  return carousel(n, (i) => solid(bgc(i)), seams, (i) => {
    const head = Bd(churchName(ctxSite).toUpperCase(), { x: 0.3, y: 0.05, w: 0.5, size: 22, weight: 700, letter: 4, color: ink(i), opacity: 0.7 });
    if (i === 0) return [
      head,
      BL(C.kicker.toUpperCase(), 0.08, 0.2, 0.8, { size: 28, weight: 700, letter: 6, color: c0 }),
      HL(C.title, 0.08, 0.36, 0.84, { size: fit(C.title, 120, 74, 14), color: c2 }),
      BL(C.sub, 0.08, 0.52, 0.66, { size: 34, color: c2, opacity: 0.8 }),
      BL('Swipe', 0.08, 0.93, 0.16, { size: 26, weight: 700, letter: 2, color: c2 }),
      shape({ shape: 'swipe', x: 0.29, y: 0.93, w: 0.1, h: 0.03, fill: c2 }),
    ];
    if (i === n - 1) return [
      head,
      HL(C.endTitle, 0.08, 0.3, 0.84, { size: fit(C.endTitle, 110, 70, 14), color: ink(i) }),
      BL(C.endLine, 0.08, 0.46, 0.8, { size: 34, color: ink(i), opacity: 0.85 }),
    ];
    const p = C.points[i - 1];
    return [
      head, counter(Bd, i, n, ink(i)),
      HL(num(i), 0.07, 0.24, 0.6, { size: 320, color: i % 2 ? on(c0) : c0, opacity: i % 2 ? 0.28 : 0.2, italic: P === PACKS3.table }),
      HL(p.h, 0.08, 0.44, 0.84, { size: fit(p.h, 76, 52, 24), color: ink(i) }),
      BL(p.b, 0.08, 0.57, 0.78, { size: 34, color: ink(i), opacity: 0.85 }),
    ];
  });
}

// Blobs: soft shapes drift over the seams, with photo spots in the pack's frame shape.
function blobs(P, C, frameShape = 'pebble') {
  const { Hd, Bd, HL, BL } = kit(P); const [c0, c1, c2, c3, c4] = P.c;
  const n = C.points.length + 2;
  const across = [
    { shape: 'blob3', x: 0.2, y: 0.0, w: 0.7, h: 0.24, fill: c0 },
    ...Array.from({ length: n - 1 }, (_, k) => ({ shape: k % 2 ? 'blob2' : 'blob3', x: k + 1, y: k % 2 ? 0.02 : 0.98, w: 0.8, h: 0.24, fill: k % 2 ? c0 : c1 })),
    { shape: 'blob2', x: n - 0.2, y: 1.0, w: 0.7, h: 0.24, fill: c0 },
  ];
  const fh = (w) => w * R * (frameShape === 'arch' ? 1.3 : frameShape === 'wave' ? 0.85 : 1);
  return carousel(n, () => solid(c3), across, (i) => {
    if (i === 0) return [
      Bd(C.kicker.toUpperCase(), { x: 0.5, y: 0.3, w: 0.8, size: 28, weight: 700, letter: 6, color: c0 }),
      Hd(C.title, { x: 0.5, y: 0.45, w: 0.84, size: fit(C.title, 116, 72, 14), color: c2 }),
      Bd(C.sub, { x: 0.5, y: 0.6, w: 0.72, size: 32, color: c2, opacity: 0.8 }),
      ...swipeCue(Bd, c2),
    ];
    if (i === n - 1) return [
      Hd(C.endTitle, { x: 0.5, y: 0.42, w: 0.84, size: fit(C.endTitle, 104, 66, 14), color: c2 }),
      Bd(C.endLine, { x: 0.5, y: 0.56, w: 0.78, size: 32, color: c2, opacity: 0.85 }),
    ];
    const p = C.points[i - 1];
    if (i % 2) return [
      counter(Bd, i, n, c2),
      shape({ shape: frameShape, frame: true, x: 0.29, y: 0.5, w: 0.42, h: fh(0.42), fill: c4 }),
      HL(num(i), 0.56, 0.32, 0.36, { size: 70, color: c0 }),
      HL(p.h, 0.56, 0.45, 0.38, { size: fit(p.h, 60, 42, 20), color: c2 }),
      BL(p.b, 0.56, 0.6, 0.38, { size: 30, color: c2, opacity: 0.8 }),
    ];
    return [
      counter(Bd, i, n, c2),
      Hd(num(i), { x: 0.5, y: 0.32, w: 0.4, size: 80, color: c0 }),
      Hd(p.h, { x: 0.5, y: 0.45, w: 0.8, size: fit(p.h, 72, 50, 24), color: c2 }),
      Bd(p.b, { x: 0.5, y: 0.58, w: 0.74, size: 34, color: c2, opacity: 0.8 }),
    ];
  });
}

// Bracket: one thick line steps up and down across the slides, like a road to follow.
function bracket(P, C, accent) {
  const { Hd, Bd, HL, BL } = kit(P);
  const all = [...P.c].sort((a, b) => lum(a) - lum(b)); const dark = all[0]; const light = all[all.length - 1];
  const n = C.points.length + 2; const t = 0.03; const tx = t / R;
  const yAt = (i) => (i % 2 ? 0.1 : 0.9);
  const across = [];
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0.08 : i; const b = i === n - 1 ? n - 0.14 : i + 1;
    across.push({ x: (a + b) / 2, y: yAt(i), w: b - a + (i ? tx : 0), h: t, fill: accent, radius: 30 });
    if (i) across.push({ x: i, y: 0.5, w: tx, h: 0.8 + t, fill: accent, radius: 30 });
  }
  across.push({ shape: 'arrow', x: n - 0.1, y: yAt(n - 1), w: 0.09, h: 0.06, fill: accent });
  return carousel(n, () => solid(dark), across, (i) => {
    if (i === 0) return [
      BL(C.kicker.toUpperCase(), 0.1, 0.2, 0.8, { size: 28, weight: 800, letter: 6, color: accent }),
      HL(C.title, 0.1, 0.4, 0.8, { size: fit(C.title, 124, 76, 14), color: light }),
      BL(C.sub, 0.1, 0.6, 0.7, { size: 32, color: light, opacity: 0.8 }),
      Bd('Swipe', { x: 0.74, y: 0.83, w: 0.16, size: 26, weight: 700, letter: 2, color: light }),
    ];
    if (i === n - 1) return [
      HL(C.endTitle, 0.1, 0.4, 0.8, { size: fit(C.endTitle, 110, 70, 14), color: light }),
      BL(C.endLine, 0.1, 0.56, 0.78, { size: 32, color: light, opacity: 0.85 }),
      BL(site(ctxSite), 0.1, 0.64, 0.78, { size: 30, weight: 700, color: accent }),
    ];
    const p = C.points[i - 1];
    return [
      counter(Bd, i, n, light),
      HL(`#${i}`, 0.1, 0.3, 0.5, { size: 120, color: accent }),
      HL(p.h, 0.1, 0.46, 0.8, { size: fit(p.h, 72, 50, 24), color: light }),
      BL(p.b, 0.1, 0.6, 0.76, { size: 34, color: light, opacity: 0.85 }),
    ];
  });
}

// Blocks: rounded color blocks straddle the seams, with number badges and little triangles pointing on.
function blocks(P, C) {
  const { Hd, Bd } = kit(P); const [c0, c1, c2, c3, c4] = P.c;
  const n = C.points.length + 2;
  const across = Array.from({ length: n - 1 }, (_, k) => ({ x: k + 1, y: k % 2 ? 0.84 : 0.16, w: 0.44, h: 0.34, radius: 70, fill: k % 2 ? c1 : c0 }));
  const tri = (i) => shape({ shape: 'tri3', x: i % 2 ? 0.1 : 0.9, y: i % 2 ? 0.26 : 0.74, w: 0.18, h: 0.06, rot: 90, fill: c0 });
  return carousel(n, () => solid(c3), across, (i) => {
    if (i === 0) return [
      shape({ frame: true, x: 0.5, y: 0.3, w: 0.8, h: 0.4, radius: 50, fill: c4 }),
      Hd(C.title, { x: 0.5, y: 0.64, w: 0.84, size: fit(C.title, 92, 60, 18), color: c2 }),
      Bd(C.sub, { x: 0.5, y: 0.77, w: 0.74, size: 30, color: c2, opacity: 0.85 }),
      ...swipeCue(Bd, c0),
    ];
    if (i === n - 1) return [
      shape({ x: 0.5, y: 0.45, w: 0.62, h: 0.42, radius: 60, fill: c1 }),
      Hd(C.endTitle, { x: 0.5, y: 0.42, w: 0.54, size: fit(C.endTitle, 80, 54, 14), color: on(c1) }),
      Bd(C.endLine, { x: 0.5, y: 0.54, w: 0.54, size: 28, color: on(c1), opacity: 0.9 }),
      ...[0.38, 0.46, 0.54, 0.62].map((x) => shape({ shape: 'ellipse', x, y: 0.74, w: 0.035, h: 0.035 * R, fill: c0 })),
    ];
    const p = C.points[i - 1];
    return [
      tri(i),
      shape({ shape: 'ellipse', x: 0.5, y: 0.32, w: 0.18, h: 0.18 * R, fill: c0 }),
      Hd(String(i), { x: 0.5, y: 0.32, w: 0.18, size: 84, color: on(c0) }),
      Hd(p.h, { x: 0.5, y: 0.47, w: 0.76, size: fit(p.h, 70, 48, 22), color: c2 }),
      Bd(p.b, { x: 0.5, y: 0.6, w: 0.68, size: 32, color: c2, opacity: 0.85 }),
    ];
  });
}

// Circles: big circles sit on the seams at the top and bottom, and hand-drawn arrows point the way.
function circles(P, C) {
  const { Hd, Bd } = kit(P); const [c0, c1, c2, c3] = P.c;
  const n = C.points.length + 2;
  const across = Array.from({ length: n - 1 }, (_, k) => ({ shape: 'ellipse', x: k + 1, y: k % 2 ? 0.92 : 0.08, w: 0.66, h: 0.66 * R, fill: k % 2 ? c1 : c0 }));
  const arrow = shape({ shape: 'arrowCurve', x: 0.84, y: 0.84, w: 0.14, h: 0.1, fill: c2 });
  return carousel(n, () => solid(c3), across, (i) => {
    if (i === 0) return [
      Bd(C.kicker.toUpperCase(), { x: 0.5, y: 0.3, w: 0.8, size: 28, weight: 700, letter: 6, color: c0 }),
      Hd(C.title, { x: 0.5, y: 0.45, w: 0.84, size: fit(C.title, 112, 70, 14), color: c2 }),
      Bd(C.sub, { x: 0.5, y: 0.6, w: 0.7, size: 32, color: c2, opacity: 0.8 }),
      arrow,
    ];
    if (i === n - 1) return [
      Hd(C.endTitle, { x: 0.5, y: 0.44, w: 0.8, size: fit(C.endTitle, 100, 64, 14), color: c2 }),
      Bd(C.endLine, { x: 0.5, y: 0.57, w: 0.76, size: 32, color: c2, opacity: 0.85 }),
    ];
    const p = C.points[i - 1];
    return [
      counter(Bd, i, n, c2),
      Hd(num(i), { x: 0.5, y: 0.33, w: 0.3, size: 64, color: c0 }),
      Hd(p.h, { x: 0.5, y: 0.45, w: 0.78, size: fit(p.h, 72, 50, 24), color: c2 }),
      Bd(p.b, { x: 0.5, y: 0.58, w: 0.7, size: 34, color: c2, opacity: 0.8 }),
      arrow,
    ];
  });
}

// Photo story: a big photo up top and a rounded color card with the words, like a minister's quote series.
function photoStory(P, C) {
  const { Hd, Bd } = kit(P); const [c0, c1, c2, c3, c4] = P.c;
  const n = C.points.length + 2; const card = c1; const ink = on(card);
  return carousel(n, () => solid(c2), [], (i) => {
    const base = [
      shape({ frame: true, x: 0.5, y: 0.31, w: 1, h: 0.64, fill: c4 }),
      shape({ x: 0.5, y: 0.82, w: 0.94, h: 0.52, radius: 90, fill: card }),
      shape({ x: 0.87, y: 0.05, w: 0.15, h: 0.042, radius: 40, fill: c2, opacity: 0.7 }),
      Bd(`${i + 1}/${n}`, { x: 0.87, y: 0.05, w: 0.15, size: 24, weight: 700, color: c3 }),
    ];
    if (i === 0) return [...base,
      Bd(C.kicker.toUpperCase(), { x: 0.5, y: 0.66, w: 0.8, size: 26, weight: 700, letter: 6, color: ink, opacity: 0.85 }),
      Hd(C.title, { x: 0.5, y: 0.76, w: 0.82, size: fit(C.title, 96, 60, 16), color: ink }),
      Bd(churchName(ctxSite), { x: 0.5, y: 0.9, w: 0.8, size: 26, weight: 700, letter: 4, color: ink, opacity: 0.8 }),
    ];
    if (i === n - 1) return [...base,
      Hd(C.endTitle, { x: 0.5, y: 0.72, w: 0.82, size: fit(C.endTitle, 86, 56, 16), color: ink }),
      Bd(C.endLine, { x: 0.5, y: 0.84, w: 0.8, size: 30, color: ink, opacity: 0.9 }),
    ];
    const p = C.points[i - 1];
    return [...base,
      Hd(`“${p.h}”`, { x: 0.5, y: 0.72, w: 0.82, size: fit(p.h, 70, 48, 26), lh: 1.12, color: ink }),
      Bd(p.b, { x: 0.5, y: 0.85, w: 0.78, size: 28, color: ink, opacity: 0.85 }),
    ];
  });
}

// Notes: cream paper, sparkles, handwritten asides and curved arrows that hop from slide to slide.
function notes(P, C) {
  const { Hd, Bd, HL, BL } = kit(P); const [c0, c1, c2, c3] = P.c;
  const n = C.points.length + 2;
  const across = Array.from({ length: n - 1 }, (_, k) => ({ shape: 'arrowCurve', x: k + 1, y: 0.82, w: 0.2, h: 0.13, fill: c2 }));
  const hand = (t, p) => rawText({ text: t, font: 'Caveat', weight: 700, size: 64, lh: 1.05, color: c1, ...p });
  return carousel(n, () => solid(c3), across, (i) => {
    const spark = shape({ shape: 'sparkle', x: i % 2 ? 0.16 : 0.84, y: 0.14, w: 0.08, h: 0.08 * R, fill: c1 });
    if (i === 0) return [
      spark,
      hand('swipe along', { x: 0.5, y: 0.26, w: 0.6, size: 60 }),
      HL(C.title, 0.08, 0.44, 0.84, { size: fit(C.title, 116, 72, 14), italic: true, color: c2 }),
      BL(C.sub, 0.08, 0.6, 0.7, { size: 32, color: c2, opacity: 0.8 }),
    ];
    if (i === n - 1) return [
      spark,
      Hd(C.endTitle, { x: 0.5, y: 0.4, w: 0.84, size: fit(C.endTitle, 100, 64, 14), italic: true, color: c2 }),
      Bd(C.endLine, { x: 0.5, y: 0.54, w: 0.78, size: 32, color: c2, opacity: 0.85 }),
      hand('see you there!', { x: 0.5, y: 0.66, w: 0.7, size: 56 }),
    ];
    const p = C.points[i - 1];
    if (i % 2 === 0) return [
      shape({ shape: 'blob2', x: 0.5, y: 0.47, w: 0.82, h: 0.5, fill: c1 }),
      hand(`no. ${i}`, { x: 0.5, y: 0.31, w: 0.4, size: 56, color: on(c1) }),
      Hd(p.h, { x: 0.5, y: 0.44, w: 0.62, size: fit(p.h, 62, 44, 22), color: on(c1) }),
      Bd(p.b, { x: 0.5, y: 0.57, w: 0.58, size: 28, color: on(c1), opacity: 0.9 }),
    ];
    return [
      spark, counter(Bd, i, n, c2),
      hand(`no. ${i}`, { x: 0.3, y: 0.3, w: 0.4 }),
      HL(p.h, 0.1, 0.44, 0.8, { size: fit(p.h, 68, 48, 24), color: c2 }),
      BL(p.b, 0.1, 0.58, 0.74, { size: 32, color: c2, opacity: 0.8 }),
    ];
  });
}

// Hills: a quiet editorial carousel with one rule up top and soft hills rolling along the bottom.
function hills(P, C) {
  const { Bd, HL, BL } = kit(P); const [c0, c1, c2, c3, c4] = P.c;
  const n = C.points.length + 2;
  return carousel(n, (i) => flow(i, n, c3, mix(c3, c4, 0.4)), [
    { x: n / 2, y: 0.12, w: n, h: 0.0016, fill: c2 },
    { shape: 'hill', x: n / 2, w: n, y: 0.86, h: 0.3, cycles: n * 0.5, phase: 1, fill: c4, opacity: 0.8 },
    { shape: 'hill', x: n / 2, w: n, y: 0.9, h: 0.22, cycles: n * 0.38, fill: c0 },
  ], (i) => {
    const top = BL(churchName(ctxSite).toUpperCase(), 0.08, 0.08, 0.6, { size: 22, weight: 700, letter: 4, color: c2, opacity: 0.75 });
    if (i === 0) return [
      top,
      BL(C.kicker.toUpperCase(), 0.08, 0.2, 0.8, { size: 26, weight: 700, letter: 6, color: c0 }),
      HL(C.title, 0.08, 0.38, 0.84, { size: fit(C.title, 124, 76, 14), color: c2 }),
      BL(C.sub, 0.08, 0.54, 0.7, { size: 32, color: c2, opacity: 0.8 }),
      ...swipeCue(Bd, on(c0)),
    ];
    if (i === n - 1) return [
      top,
      HL(C.endTitle, 0.08, 0.34, 0.84, { size: fit(C.endTitle, 110, 70, 14), color: c2 }),
      BL(C.endLine, 0.08, 0.5, 0.8, { size: 32, color: c2, opacity: 0.85 }),
    ];
    const p = C.points[i - 1];
    return [
      top, counter(Bd, i, n, c2),
      BL(`PART ${i}`, 0.08, 0.2, 0.4, { size: 26, weight: 700, letter: 6, color: c0 }),
      HL(p.h, 0.08, 0.34, 0.84, { size: fit(p.h, 82, 56, 24), color: c2 }),
      BL(p.b, 0.08, 0.5, 0.78, { size: 34, color: c2, opacity: 0.8 }),
    ];
  });
}

// ------------------------------------------------------------------ one carousel per pack, in the style that suits its look
const PLAN = [
  ['natural', PACKS, 'blobs', 'expect', { frame: 'arch' }], ['smooth', PACKS, 'ribbon', 'recap'], ['bold', PACKS, 'bracket', 'read', { accent: 1 }],
  ['youth', PACKS, 'blocks', 'expect'], ['traditional', PACKS, 'path', 'recap'],
  ['meadow', PACKS2, 'blobs', 'read', { frame: 'wave' }], ['pulse', PACKS2, 'bignum', 'recap'], ['grove', PACKS2, 'circles', 'expect'],
  ['ember', PACKS2, 'ribbon', 'read'], ['dusk', PACKS2, 'photoStory', 'recap'], ['collage', PACKS2, 'notes', 'read'],
  ['sanctuary', PACKS3, 'path', 'expect', { thin: true }], ['table', PACKS3, 'bignum', 'read'], ['vesper', PACKS3, 'blobs', 'recap'],
  ['daisy', PACKS3, 'blocks', 'expect'], ['poster', PACKS3, 'bracket', 'recap', { accent: 0 }], ['quarterly', PACKS3, 'hills', 'expect'],
];
const STYLES = {
  ribbon: (P, C) => ribbon(P, C), path: (P, C, o) => path(P, C, o.thin), bignum: (P, C) => bignum(P, C),
  blobs: (P, C, o) => blobs(P, C, o.frame || 'pebble'), bracket: (P, C, o) => bracket(P, C, P.c[o.accent ?? 0]),
  blocks: (P, C) => blocks(P, C), circles: (P, C) => circles(P, C), photoStory: (P, C) => photoStory(P, C), notes: (P, C) => notes(P, C), hills: (P, C) => hills(P, C),
};
const LABEL = { recap: 'sermon recap carousel', expect: 'first Sunday carousel', read: 'Bible basics carousel' };

export const CAROUSEL_TEMPLATES = PLAN.map(([id, group, style, kind, opts = {}]) => {
  const P = group[id];
  return {
    id: `${id}-carousel`, pack: id, kind: 'carousel', name: `${P.name} ${LABEL[kind]}`, photos: style === 'photoStory' ? 1 : 0, sermon: kind === 'recap',
    build: (ctx = {}) => { ctxSite = ctx; return STYLES[style](P, words(kind, ctx), opts); },
  };
});
