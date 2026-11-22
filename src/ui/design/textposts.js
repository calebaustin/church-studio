// Text-led announcements: no photo needed. Big type, the pack's colors and an accent shape or two, so an
// announcement can be made in a minute when there's no good picture. One per pack, in four layouts.
// Event templates fill in the event's name, day, time and place, plus the church's name and website.
import { page, shape, text as rawText } from './model.js';
import { PACKS } from './packs.js';
import { PACKS2 } from './packs2.js';
import { PACKS3 } from './packs3.js';

const R = 1080 / 1350;
const hex = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
const lum = (h) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const on = (h) => (lum(h) > 0.6 ? '#141414' : '#FFFFFF');
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const fit = (t, base, min = base * 0.55, room = 14) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const ev = (ctx) => ({
  title: ctx.ev?.title || 'Family Night', day: ctx.ev?.day || 'Saturday, Nov 22', time: ctx.ev?.time || '6 PM',
  place: ctx.ev?.place || 'Fellowship Hall', month: ctx.ev?.month || 'NOV', num: ctx.ev?.num || '22', weekday: ctx.ev?.weekday || 'Saturday',
});
function kit(P) {
  const up = (t) => (P.up ? String(t).toUpperCase() : t);
  const H = (t, p) => rawText({ text: up(t), font: P.h, weight: P.hw || 700, letter: P.letter || 0, lh: 1.02, ...p });
  const B = (t, p) => rawText({ text: t, font: P.b, weight: 500, size: 36, lh: 1.35, ...p });
  const left = (fn) => (t, x0, y, w, p = {}) => fn(t, { align: 'left', x: x0 + w / 2, y, w, ...p });
  return { H, B, HL: left(H), BL: left(B) };
}
const dark = (P) => [...P.c].sort((a, b) => lum(a) - lum(b))[0];
const light = (P) => [...P.c].sort((a, b) => lum(b) - lum(a))[0];

// Big type: the event's name fills the page, details underneath, a soft blob in the corner.
function bigType(P, ctx) {
  const { HL, BL } = kit(P); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(paper), items: [
    shape({ shape: 'blob2', x: 0.92, y: 0.08, w: 0.5, h: 0.5 * R, fill: c1, opacity: 0.9 }),
    shape({ shape: 'sparkle', x: 0.16, y: 0.12, w: 0.08, h: 0.08 * R, fill: c0 }),
    BL(e.weekday.toUpperCase(), 0.08, 0.3, 0.8, { size: 30, weight: 700, letter: 8, color: c0 }),
    HL(e.title, 0.08, 0.5, 0.86, { size: fit(e.title, 190, 110), color: ink }),
    shape({ x: 0.2, y: 0.7, w: 0.24, h: 0.006, fill: c0 }),
    BL(`${e.day}\n${e.time} · ${e.place}`, 0.08, 0.78, 0.84, { size: 40, color: ink }),
    BL(`${churchName(ctx)} · ${site(ctx)}`, 0.08, 0.93, 0.84, { size: 26, weight: 600, color: ink, opacity: 0.7 }),
  ] })];
}

// Color block: a strong block with the title, details on the paper below, a date circle on the seam.
function colorBlock(P, ctx) {
  const { H, B } = kit(P); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(paper), items: [
    shape({ x: 0.5, y: 0.31, w: 1, h: 0.62, fill: c0 }),
    shape({ shape: 'hill', x: 0.5, y: 0.6, w: 1, h: 0.08, cycles: 1.5, fill: c0 }),
    B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.1, w: 0.8, size: 26, weight: 700, letter: 6, color: on(c0), opacity: 0.85 }),
    H(e.title, { x: 0.5, y: 0.34, w: 0.86, size: fit(e.title, 150, 90), color: on(c0) }),
    shape({ shape: 'ellipse', x: 0.5, y: 0.64, w: 0.22, h: 0.22 * R, fill: c1, line: 10, stroke: paper }),
    H(e.month, { x: 0.5, y: 0.615, w: 0.2, size: 30, color: on(c1) }),
    H(e.num, { x: 0.5, y: 0.66, w: 0.2, size: 64, color: on(c1) }),
    B(`${e.weekday} · ${e.time}`, { x: 0.5, y: 0.79, w: 0.8, size: 42, weight: 700, color: ink }),
    B(e.place, { x: 0.5, y: 0.85, w: 0.8, size: 34, color: ink, opacity: 0.8 }),
    B(site(ctx), { x: 0.5, y: 0.94, w: 0.8, size: 26, weight: 600, color: c0 }),
  ] })];
}

// Badge: the title centered inside a scalloped badge with sparkles, like a sticker.
function badge(P, ctx) {
  const { H, B } = kit(P); const e = ev(ctx); const [c0, c1, , , c4] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(c4 || paper), items: [
    shape({ shape: 'scallop', x: 0.5, y: 0.44, w: 0.84, h: 0.84 * R, fill: paper }),
    shape({ shape: 'ring', x: 0.5, y: 0.44, w: 0.74, h: 0.74 * R, fill: c0, opacity: 0.15 }),
    shape({ shape: 'sparkle', x: 0.13, y: 0.13, w: 0.1, h: 0.1 * R, fill: c1 }),
    shape({ shape: 'sparkle', x: 0.88, y: 0.8, w: 0.07, h: 0.07 * R, fill: c0 }),
    B('YOU’RE INVITED', { x: 0.5, y: 0.3, w: 0.6, size: 28, weight: 700, letter: 8, color: c0 }),
    H(e.title, { x: 0.5, y: 0.44, w: 0.6, size: fit(e.title, 120, 70, 12), color: ink }),
    B(`${e.day}`, { x: 0.5, y: 0.57, w: 0.6, size: 32, weight: 600, color: ink }),
    shape({ x: 0.5, y: 0.84, w: 0.66, h: 0.075, radius: 60, fill: c0 }),
    B(`${e.time} · ${e.place}`, { x: 0.5, y: 0.84, w: 0.62, size: 32, weight: 700, color: on(c0) }),
    B(churchName(ctx), { x: 0.5, y: 0.94, w: 0.8, size: 26, weight: 600, color: on(c4 || paper), opacity: 0.8 }),
  ] })];
}

// Poster: fine rules, a big headline and the details in a framed box, like a printed notice.
function poster(P, ctx) {
  const { H, B, HL, BL } = kit(P); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P);
  const bg = c0; const fg = on(bg);
  return [page({ bg: solid(bg), items: [
    shape({ x: 0.5, y: 0.08, w: 0.84, h: 0.003, fill: fg, opacity: 0.6 }),
    B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.115, w: 0.84, size: 24, weight: 700, letter: 8, color: fg, opacity: 0.85 }),
    shape({ x: 0.5, y: 0.15, w: 0.84, h: 0.003, fill: fg, opacity: 0.6 }),
    BL('JOIN US FOR', 0.08, 0.27, 0.84, { size: 32, weight: 700, letter: 6, color: c1 === bg ? fg : c1 }),
    HL(e.title, 0.08, 0.45, 0.86, { size: fit(e.title, 170, 100), color: fg }),
    shape({ shape: 'arrowLine', x: 0.18, y: 0.62, w: 0.2, h: 0.04, fill: c1 === bg ? fg : c1 }),
    shape({ x: 0.5, y: 0.79, w: 0.84, h: 0.2, radius: 24, fill: 'none', line: 4, stroke: fg }),
    H(e.day, { x: 0.5, y: 0.75, w: 0.76, size: 46, color: fg }),
    B(`${e.time} · ${e.place}`, { x: 0.5, y: 0.83, w: 0.76, size: 34, color: fg, opacity: 0.9 }),
    B(site(ctx), { x: 0.5, y: 0.94, w: 0.8, size: 26, weight: 600, color: fg, opacity: 0.8 }),
    ...(lum(bg) > 0.6 ? [] : [shape({ shape: 'dots', x: 0.88, y: 0.32, w: 0.14, h: 0.14 * R, fill: fg, opacity: 0.25 })]),
  ].map((it) => (it.color === undefined && it.fill === undefined ? { ...it, color: ink } : it)) })];
}

const LAYOUTS = [['bigType', 'Big type', bigType], ['colorBlock', 'Color block', colorBlock], ['badge', 'Badge', badge], ['poster', 'Poster', poster]];
const ALL = { ...PACKS, ...PACKS2, ...PACKS3 };

/** One text-only announcement per pack, layouts rotating through the packs so every look gets a fitting one. */
export const TEXT_TEMPLATES = Object.entries(ALL).map(([id, P], i) => {
  const [key, label, build] = LAYOUTS[i % LAYOUTS.length];
  return { id: `${id}-text-${key}`, pack: id, kind: 'post', name: `${P.name} text announcement`, layout: label, event: true, photos: 0, textOnly: true, build: (ctx = {}) => build(P, ctx) };
});
