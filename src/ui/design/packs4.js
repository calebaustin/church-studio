// More kinds of church designs, in every template pack's colors and fonts: invite cards (5x7 and 7x5), event and
// announcement slides (1920x1080), rack cards (4x9), trifold brochures and infographics (schedules, ways to give).
// Ideas from printed church pieces; each layout is drawn from the pack's own palette, so it matches the rest.
import { page, shape, text as rawText } from './model.js';
import { KINDS } from './model.js';
import { PACKS } from './packs.js';
import { PACKS2 } from './packs2.js';
import { PACKS3 } from './packs3.js';

const hex = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
const lum = (h) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const on = (h) => (lum(h) > 0.6 ? '#141414' : '#FFFFFF');
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const dark = (P) => [...P.c].sort((a, b) => lum(a) - lum(b))[0];
const light = (P) => [...P.c].sort((a, b) => lum(b) - lum(a))[0];
const fit = (t, base, min = base * 0.55, room = 14) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const ev = (ctx) => ({
  title: ctx.ev?.title || 'Fall Festival', day: ctx.ev?.day || 'Saturday, Nov 22', time: ctx.ev?.time || '6 PM',
  place: ctx.ev?.place || 'Fellowship Hall', month: ctx.ev?.month || 'NOV', num: ctx.ev?.num || '22', weekday: ctx.ev?.weekday || 'Saturday',
});

/** Text helpers for one pack on one page size: sizes are given for a 1080-wide page and scaled to this one. */
function kit(P, kind) {
  const S = KINDS[kind].w / 1080;
  const up = (t) => (P.up ? String(t).toUpperCase() : t);
  const H = (t, p) => rawText({ text: up(t), font: P.h, weight: P.hw || 700, letter: P.letter || 0, lh: 1.04, ...p, size: Math.round((p.size || 80) * S) });
  const B = (t, p) => rawText({ text: t, font: P.b, weight: 500, lh: 1.35, ...p, size: Math.round((p.size || 36) * S) });
  return { H, B, S, R: KINDS[kind].w / KINDS[kind].h };
}

// ---------------------------------------------------------------- invite cards
// 5x7: a framed invitation with a soft ornament, the title in the middle and the details under a rule.
function invitePortrait(P, ctx) {
  const { H, B, R } = kit(P, 'invite'); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(paper), items: [
    // Even margins all around: a margin of 6% (and 8%) of the width, turned into a share of the height.
    shape({ x: 0.5, y: 0.5, w: 0.88, h: 1 - 0.12 * R, radius: 18, fill: 'none', line: 6, stroke: c0 }),
    shape({ x: 0.5, y: 0.5, w: 0.84, h: 1 - 0.16 * R, radius: 12, fill: 'none', line: 2, stroke: c0, opacity: 0.6 }),
    shape({ shape: 'sparkle', x: 0.5, y: 0.16, w: 0.09, h: 0.09 * R, fill: c1 }),
    B('YOU’RE INVITED TO', { x: 0.5, y: 0.25, w: 0.7, size: 30, weight: 700, letter: 8, color: c0 }),
    H(e.title, { x: 0.5, y: 0.4, w: 0.74, size: fit(e.title, 130, 80, 12), color: ink }),
    shape({ x: 0.5, y: 0.53, w: 0.2, h: 0.003, fill: c1 }),
    B(`${e.day}\n${e.time}`, { x: 0.5, y: 0.62, w: 0.72, size: 40, weight: 600, color: ink }),
    B(e.place, { x: 0.5, y: 0.72, w: 0.72, size: 32, color: ink, opacity: 0.8 }),
    B(`${churchName(ctx)} · ${site(ctx)}`, { x: 0.5, y: 0.86, w: 0.72, size: 24, weight: 600, color: c0 }),
  ] })];
}
// 5x7: a color block on top with a scalloped edge, the details on paper below.
function inviteBlock(P, ctx) {
  const { H, B, R } = kit(P, 'invite'); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(paper), items: [
    shape({ x: 0.5, y: 0.27, w: 1, h: 0.54, fill: c0 }),
    shape({ shape: 'hill', x: 0.5, y: 0.53, w: 1, h: 0.06, cycles: 3, fill: c0 }),
    B('JOIN US FOR', { x: 0.5, y: 0.12, w: 0.8, size: 30, weight: 700, letter: 8, color: on(c0), opacity: 0.9 }),
    H(e.title, { x: 0.5, y: 0.3, w: 0.84, size: fit(e.title, 140, 84), color: on(c0) }),
    shape({ shape: 'ellipse', x: 0.5, y: 0.6, w: 0.24, h: 0.24 * R, fill: c1, line: 10, stroke: paper }),
    H(e.month, { x: 0.5, y: 0.585, w: 0.2, size: 30, color: on(c1) }),
    H(e.num, { x: 0.5, y: 0.625, w: 0.2, size: 62, color: on(c1) }),
    B(`${e.weekday} · ${e.time}`, { x: 0.5, y: 0.76, w: 0.8, size: 42, weight: 700, color: ink }),
    B(e.place, { x: 0.5, y: 0.82, w: 0.8, size: 32, color: ink, opacity: 0.8 }),
    B(site(ctx), { x: 0.5, y: 0.92, w: 0.8, size: 26, weight: 600, color: c0 }),
  ] })];
}
// 7x5: the title on a color panel at left, the details on paper at right.
function inviteWide(P, ctx) {
  const { H, B } = kit(P, 'invitewide'); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(paper), items: [
    shape({ x: 0.27, y: 0.5, w: 0.54, h: 1, fill: c0 }),
    shape({ shape: 'sparkle', x: 0.08, y: 0.14, w: 0.05, h: 0.07, fill: c1 }),
    B('YOU’RE INVITED', { x: 0.27, y: 0.24, w: 0.44, size: 22, weight: 700, letter: 8, color: on(c0), opacity: 0.9 }),
    H(e.title, { x: 0.27, y: 0.48, w: 0.46, size: fit(e.title, 86, 52, 12), color: on(c0) }),
    B(churchName(ctx).toUpperCase(), { x: 0.27, y: 0.82, w: 0.44, size: 18, weight: 700, letter: 4, color: on(c0), opacity: 0.85 }),
    H(e.day, { x: 0.77, y: 0.34, w: 0.38, size: 36, color: ink }),
    shape({ x: 0.77, y: 0.45, w: 0.12, h: 0.006, fill: c1 }),
    B(`${e.time}\n${e.place}`, { x: 0.77, y: 0.58, w: 0.38, size: 26, color: ink }),
    B(site(ctx), { x: 0.77, y: 0.82, w: 0.38, size: 18, weight: 600, color: c0 }),
  ] })];
}

// ---------------------------------------------------------------- event and announcement slides (1920x1080)
function slideEvent(P, ctx) {
  const { H, B } = kit(P, 'slide'); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  return [page({ bg: solid(ink), items: [
    shape({ shape: 'blob2', x: 0.9, y: 0.12, w: 0.36, h: 0.64, fill: c0, opacity: 0.9 }),
    shape({ shape: 'dots', x: 0.08, y: 0.86, w: 0.1, h: 0.18, fill: paper, opacity: 0.25 }),
    B(e.weekday.toUpperCase(), { x: 0.36, y: 0.24, w: 0.62, size: 14, weight: 700, letter: 6, color: c1, align: 'left' }),
    H(e.title, { x: 0.38, y: 0.46, w: 0.66, size: fit(e.title, 66, 40), color: paper, align: 'left' }),
    shape({ x: 0.1, y: 0.64, w: 0.08, h: 0.008, fill: c1 }),
    B(`${e.day} · ${e.time}\n${e.place}`, { x: 0.36, y: 0.75, w: 0.62, size: 20, color: paper, align: 'left' }),
    B(site(ctx), { x: 0.36, y: 0.92, w: 0.62, size: 13, weight: 600, color: paper, opacity: 0.7, align: 'left' }),
  ] })];
}
function slideAnnouncements(P, ctx) {
  const { H, B } = kit(P, 'slide'); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  const items = ctx.ev?.title ? [[ctx.ev.title, `${ctx.ev.day} · ${ctx.ev.time}`], ['Next Sunday', 'Worship and kids church'], ['Get connected', site(ctx)]]
    : [['Fall Festival', 'Saturday · 6 PM'], ['Baptism Sunday', 'Next week, during worship'], ['Serve with us', 'Sign up at the welcome desk']];
  return [page({ bg: solid(paper), items: [
    shape({ x: 0.15, y: 0.5, w: 0.3, h: 1, fill: c0 }),
    H('Announcements', { x: 0.15, y: 0.5, w: 0.26, size: 34, color: on(c0) }),
    ...items.flatMap(([t, d], i) => [
      shape({ shape: 'ellipse', x: 0.37, y: 0.26 + i * 0.24, w: 0.035, h: 0.062, fill: c1 }),
      H(t, { x: 0.66, y: 0.235 + i * 0.24, w: 0.52, size: 30, color: ink, align: 'left' }),
      B(d, { x: 0.66, y: 0.3 + i * 0.24, w: 0.52, size: 17, color: ink, opacity: 0.75, align: 'left' }),
    ]),
  ] })];
}
function slideSaveDate(P, ctx) {
  const { H, B } = kit(P, 'slide'); const e = ev(ctx); const [c0, c1] = P.c; const paper = light(P);
  return [page({ bg: { type: 'gradient', from: c0, to: dark(P), angle: 135, darken: 0 }, items: [
    shape({ shape: 'ring', x: 0.78, y: 0.5, w: 0.3, h: 0.53, fill: c1, opacity: 0.25 }),
    B('SAVE THE DATE', { x: 0.36, y: 0.28, w: 0.6, size: 16, weight: 700, letter: 10, color: c1, align: 'left' }),
    H(e.title, { x: 0.38, y: 0.48, w: 0.64, size: fit(e.title, 64, 40), color: paper, align: 'left' }),
    B(`${e.place} · ${site(ctx)}`, { x: 0.36, y: 0.72, w: 0.6, size: 17, color: paper, opacity: 0.85, align: 'left' }),
    H(e.month, { x: 0.78, y: 0.4, w: 0.2, size: 26, color: paper }),
    H(e.num, { x: 0.78, y: 0.54, w: 0.2, size: 80, color: paper }),
  ] })];
}

// ---------------------------------------------------------------- rack card (4x9)
function rackCard(P, ctx) {
  const { H, B, R } = kit(P, 'rack'); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  const rows = [['Sunday worship', ctx.church?.times || 'Sundays at 10 AM'], ['Kids and students', 'Safe, fun and Bible centered'], ['Small groups', 'Grow with friends during the week']];
  return [page({ bg: solid(paper), items: [
    shape({ x: 0.5, y: 0.16, w: 1, h: 0.32, fill: c0 }),
    B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.07, w: 0.84, size: 30, weight: 700, letter: 6, color: on(c0), opacity: 0.9 }),
    H('Welcome Home', { x: 0.5, y: 0.17, w: 0.84, size: 120, color: on(c0) }),
    B('There’s a place for you here.', { x: 0.5, y: 0.26, w: 0.84, size: 36, color: on(c0), opacity: 0.9 }),
    ...rows.flatMap(([t, d], i) => [
      shape({ shape: 'ellipse', x: 0.16, y: 0.42 + i * 0.13, w: 0.14, h: 0.14 * R, fill: c1 }),
      H(t, { x: 0.6, y: 0.41 + i * 0.13, w: 0.66, size: 46, color: ink, align: 'left' }),
      B(d, { x: 0.6, y: 0.445 + i * 0.13, w: 0.66, size: 30, color: ink, opacity: 0.75, align: 'left' }),
    ]),
    shape({ x: 0.5, y: 0.86, w: 0.84, h: 0.07, radius: 40, fill: c0 }),
    B('Plan your visit', { x: 0.5, y: 0.86, w: 0.8, size: 38, weight: 700, color: on(c0) }),
    B(site(ctx), { x: 0.5, y: 0.94, w: 0.84, size: 30, weight: 600, color: c0 }),
  ] })];
}

// ---------------------------------------------------------------- trifold brochure (letter, landscape; outside and inside)
function trifold(P, ctx) {
  const { H, B } = kit(P, 'brochure'); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  const col = (i) => (i + 0.5) / 3; // panel centers
  const guide = (i) => shape({ x: i / 3, y: 0.5, w: 0.0012, h: 1, fill: ink, opacity: 0.12 });
  const outside = page({ bg: solid(paper), items: [
    guide(1), guide(2),
    // inside flap: what to expect
    H('What to expect', { x: col(0), y: 0.18, w: 0.28, size: 48, color: c0 }),
    B('Friendly people, music that lifts, and a message from the Bible you can use this week. Come as you are.', { x: col(0), y: 0.36, w: 0.27, size: 34, color: ink }),
    shape({ x: col(0), y: 0.62, w: 0.25, h: 0.22, radius: 18, fill: c1, opacity: 0.18 }),
    B(ctx.church?.times || 'Sundays at 10 AM', { x: col(0), y: 0.62, w: 0.24, size: 38, weight: 700, color: ink }),
    // back: contact
    H('Find us', { x: col(1), y: 0.3, w: 0.28, size: 48, color: c0 }),
    B(`${ctx.church?.address || '123 Main Street, Your City'}\n${site(ctx)}`, { x: col(1), y: 0.46, w: 0.27, size: 32, color: ink }),
    // front cover
    shape({ x: col(2), y: 0.5, w: 1 / 3, h: 1, fill: c0 }),
    shape({ shape: 'sparkle', x: col(2), y: 0.22, w: 0.06, h: 0.08, fill: c1 }),
    H(churchName(ctx), { x: col(2), y: 0.46, w: 0.28, size: fit(churchName(ctx), 72, 44, 14), color: on(c0) }),
    B('Welcome. We’re glad you’re here.', { x: col(2), y: 0.62, w: 0.28, size: 34, color: on(c0), opacity: 0.9 }),
  ] });
  const inside = page({ bg: solid(paper), items: [
    guide(1), guide(2),
    ...[['Who we are', 'A family of believers following Jesus together, here for our neighbors and our city.'],
      ['Ministries', 'Kids, students, small groups, care and outreach. Something for every age and stage.'],
      ['Next steps', 'Meet us at the welcome desk, join a group, or ask about baptism. We’d love to know you.']].flatMap(([t, d], i) => [
      shape({ shape: 'ellipse', x: col(i), y: 0.2, w: 0.07, h: 0.09, fill: c1 }),
      H(t, { x: col(i), y: 0.34, w: 0.28, size: 46, color: c0 }),
      B(d, { x: col(i), y: 0.5, w: 0.27, size: 32, color: ink }),
    ]),
  ] });
  return [outside, inside];
}

// ---------------------------------------------------------------- infographics (4:5)
function infoSchedule(P, ctx) {
  const { H, B, R } = kit(P, 'infographic'); const e = ev(ctx); const [c0, c1] = P.c; const ink = dark(P); const paper = light(P);
  const steps = [['5:30 PM', 'Doors open and dinner'], ['6:15 PM', 'Games for every age'], ['7:00 PM', 'Worship and a short message'], ['7:45 PM', 'Dessert and goodbyes']];
  return [page({ bg: solid(paper), items: [
    B(`${e.day.toUpperCase()}`, { x: 0.5, y: 0.08, w: 0.84, size: 26, weight: 700, letter: 6, color: c0 }),
    H(`${e.title} schedule`, { x: 0.5, y: 0.17, w: 0.86, size: fit(e.title, 84, 54, 12), color: ink }),
    shape({ x: 0.2, y: 0.6, w: 0.006, h: 0.62, fill: c0, opacity: 0.4 }),
    ...steps.flatMap(([t, d], i) => [
      shape({ shape: 'ellipse', x: 0.2, y: 0.34 + i * 0.16, w: 0.08, h: 0.08 * R, fill: i % 2 ? c1 : c0 }),
      H(t, { x: 0.6, y: 0.32 + i * 0.16, w: 0.66, size: 40, color: c0, align: 'left' }),
      B(d, { x: 0.6, y: 0.37 + i * 0.16, w: 0.66, size: 30, color: ink, align: 'left' }),
    ]),
    B(`${e.place} · ${site(ctx)}`, { x: 0.5, y: 0.95, w: 0.86, size: 24, weight: 600, color: ink, opacity: 0.7 }),
  ] })];
}
function infoWays(P, ctx) {
  const { H, B, R } = kit(P, 'infographic'); const [c0, c1, c2] = P.c; const ink = dark(P); const paper = light(P);
  const ways = [['Give', 'Online, in the app, or in the offering on Sunday'], ['Serve', 'Kids, greeting, tech, coffee and more'], ['Pray', 'Join the prayer team or send a request'], ['Invite', 'Bring a friend this Sunday']];
  return [page({ bg: solid(c0), items: [
    H('Ways to be part of it', { x: 0.5, y: 0.12, w: 0.86, size: 76, color: on(c0) }),
    ...ways.flatMap(([t, d], i) => {
      const x = i % 2 ? 0.74 : 0.26; const y = i < 2 ? 0.42 : 0.74;
      return [
        shape({ x, y, w: 0.42, h: 0.27, radius: 26, fill: paper }),
        shape({ shape: 'ellipse', x, y: y - 0.07, w: 0.1, h: 0.1 * R, fill: [c1, c2 || c1][i % 2] }),
        H(t, { x, y: y + 0.01, w: 0.36, size: 46, color: ink }),
        B(d, { x, y: y + 0.07, w: 0.36, size: 26, color: ink, opacity: 0.8 }),
      ];
    }),
    B(`${churchName(ctx)} · ${site(ctx)}`, { x: 0.5, y: 0.95, w: 0.86, size: 24, weight: 600, color: on(c0), opacity: 0.8 }),
  ] })];
}

// Each layout, the kind it makes, and whether it fills in an event.
const LAYOUTS = [
  ['invite', 'framed', 'Framed invitation', invitePortrait, true],
  ['invite', 'block', 'Color block invitation', inviteBlock, true],
  ['invitewide', 'panel', 'Panel invitation', inviteWide, true],
  ['slide', 'event', 'Event slide', slideEvent, true],
  ['slide', 'announcements', 'Announcements slide', slideAnnouncements, false],
  ['slide', 'savedate', 'Save the date slide', slideSaveDate, true],
  ['rack', 'welcome', 'Welcome rack card', rackCard, false],
  ['brochure', 'trifold', 'Trifold brochure', trifold, false],
  ['infographic', 'schedule', 'Event schedule', infoSchedule, true],
  ['infographic', 'ways', 'Ways to get involved', infoWays, false],
];
const ALL = { ...PACKS, ...PACKS2, ...PACKS3 };
const PACK_IDS = Object.keys(ALL);

/** Every layout in a spread of packs (every third pack, starting at a different one per layout), so each look gets some. */
export const MORE_TEMPLATES = LAYOUTS.flatMap(([kind, key, label, build, event], li) => PACK_IDS.filter((_, i) => (i + li) % 3 === 0).map((id) => ({
  id: `${id}-${kind}-${key}`, pack: id, kind, name: `${ALL[id].name} ${label.toLowerCase()}`, layout: label, event, photos: 0, textOnly: true, build: (ctx = {}) => build(ALL[id], ctx),
})));
