// Six more template packs, built to be plug and play. Event templates fill in the event's name, day,
// time and place, plus your church's name and website, and leave one photo spot: add a photo and post.
// No stock photos: photo spots are frames you fill with your own.
import { page, shape, text, uid } from './model.js';

export const PACKS2 = {
  meadow: { name: 'Meadow', about: 'Sky blue, olive and peach, checkerboards, wavy photo frames and window cards.', c: ['#8A9A2B', '#F2B48C', '#2E3A12', '#FBF6EC', '#BFD9F2'], h: 'Georgia', b: 'Avenir Next' },
  pulse: { name: 'Pulse', about: 'Bold purple, pink and orange with heavy type and rounded cards.', c: ['#8C6CE0', '#F28C28', '#111214', '#F2F1EF', '#E79AB8'], h: 'Montserrat', b: 'Avenir Next' },
  grove: { name: 'Grove', about: 'Deep green, lime and lilac with editorial serif type and a stamp.', c: ['#0E6B4E', '#D8F5B0', '#1D2A55', '#F4F1E8', '#D3C6F8'], h: 'Georgia', b: 'Avenir Next' },
  ember: { name: 'Ember', about: 'Warm glowing gradients with grain, soft serif type and outlined tags.', c: ['#E8762C', '#F4B860', '#2A1810', '#FCE7D6', '#C9542A'], h: 'Georgia', b: 'Avenir Next' },
  dusk: { name: 'Dusk', about: 'Dark, moody gradients with grain and quiet serif type.', c: ['#2E6E7E', '#E36A2E', '#0B0E14', '#F1EEE6', '#1E2C5A'], h: 'Georgia', b: 'Avenir Next' },
  collage: { name: 'Collage', about: 'Cream paper, elegant serif, handwritten notes and photo cut-outs.', c: ['#141414', '#4A8FE7', '#141414', '#F5F0E6', '#F3C7D2'], h: 'Didot', b: 'Avenir Next' },
};

// ------------------------------------------------------------------ shared helpers
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const pattern = (kind, color, color2, scale = 0.08, extra = {}) => ({ type: 'pattern', pattern: kind, color, color2, scale, darken: 0, ...extra });
const mesh = (colors, seed, darken = 0, grain = 0) => ({ type: 'mesh', colors, seed, darken, grain });
const fit = (t, base, min = base * 0.55, room = 18) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const initial = (ctx) => (ctx.church?.name || 'C').trim()[0].toUpperCase();
/** The event's details, or friendly samples when there's no event. */
const ev = (ctx) => ({
  title: ctx.ev?.title || 'Family Night',
  day: ctx.ev?.day || 'Saturday, Nov 22',
  time: ctx.ev?.time || '6 PM',
  when: ctx.ev?.when || 'Saturday, Nov 22 · 6 PM',
  place: ctx.ev?.place || 'Fellowship Hall',
  month: ctx.ev?.month || 'NOV',
  num: ctx.ev?.num || '22',
  weekday: ctx.ev?.weekday || 'Saturday',
});
const quoteOf = (ctx) => (ctx.o?.quotes?.[0] || 'Grace is not something you earn. It is something you receive.').replace(/^“|”$/g, '');

function kit(P) {
  const H = (t, p) => text({ text: t, font: P.h, weight: P.h === 'Montserrat' ? 800 : 700, lh: 1.05, ...p });
  const B = (t, p) => text({ text: t, font: P.b, weight: 500, size: 38, lh: 1.35, ...p });
  const hand = (t, p) => text({ text: t, font: 'Caveat', weight: 700, size: 64, lh: 1.1, ...p });
  const photo = (p) => shape({ frame: true, fill: P.c[0], ...p });
  /** A pill tag with text, filled or outlined. */
  const pill = (t, x, y, w, { fill = P.c[2], color = '#FFFFFF', outline = false, size = 32, h = 0.055 } = {}) => [
    shape({ x, y, w, h, radius: 200, fill: outline ? 'none' : fill, line: outline ? 2.5 : 0, stroke: color }),
    B(t, { x, y, w: w * 0.92, size, weight: 700, color }),
  ];
  return { H, B, hand, photo, pill };
}

// ------------------------------------------------------------------ Meadow
function meadow(kind) {
  const P = PACKS2.meadow; const { H, B, photo, pill } = kit(P); const [olive, peach, ink, cream, sky] = P.c;
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      photo({ shape: 'wave', x: 0.5, y: 0.36, w: 0.86, h: 0.52, fill: sky }),
      shape({ shape: 'window', x: 0.5, y: 0.76, w: 0.8, h: 0.25, fill: '#FFFFFF', stroke: ink }),
      H(e.title, { size: fit(e.title, 96, 60, 14), x: 0.5, y: 0.75, w: 0.7, color: ink }),
      B(e.when, { x: 0.5, y: 0.84, w: 0.72, size: 34, weight: 700, color: olive }),
      shape({ shape: 'burst', x: 0.84, y: 0.1, w: 0.2, h: 0.16, fill: peach }),
      B('JOIN\nUS', { x: 0.84, y: 0.1, w: 0.16, size: 26, weight: 800, lh: 1.05, color: ink }),
      B(`${churchName(ctx)} · ${e.place}`, { x: 0.5, y: 0.95, w: 0.9, size: 26, color: ink, opacity: 0.8 }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: pattern('checker', cream, olive, 0.05), items: [
      shape({ x: 0.5, y: 0.5, w: 0.88, h: 0.92, radius: 40, fill: cream }),
      B(e.weekday.toUpperCase(), { x: 0.5, y: 0.12, size: 36, weight: 800, letter: 8, color: olive }),
      H(e.title, { size: fit(e.title, 120, 76, 12), x: 0.5, y: 0.2, w: 0.8, color: ink }),
      photo({ shape: 'wave', x: 0.5, y: 0.48, w: 0.76, h: 0.34, fill: sky }),
      shape({ shape: 'window', x: 0.5, y: 0.77, w: 0.76, h: 0.14, fill: '#FFFFFF', stroke: ink }),
      B(`${e.day}\n${e.time}${e.place ? ` · ${e.place}` : ''}`, { x: 0.5, y: 0.785, w: 0.68, size: 38, weight: 700, color: ink }),
      ...pill(site(ctx), 0.5, 0.9, 0.5, { fill: olive, color: cream, size: 28, h: 0.04 }),
    ] })]; },
    quote: (ctx) => [page({ bg: pattern('grid', sky, '#FFFFFF', 0.07), items: [
      shape({ shape: 'window', x: 0.5, y: 0.48, w: 0.82, h: 0.5, fill: '#FFFFFF', stroke: ink }),
      H(`“${quoteOf(ctx)}”`, { size: fit(quoteOf(ctx), 72, 46, 60), x: 0.5, y: 0.5, w: 0.7, lh: 1.2, color: ink }),
      shape({ shape: 'scallop', x: 0.8, y: 0.2, w: 0.22, h: 0.18, fill: peach }),
      B('Sunday\nmessage', { x: 0.8, y: 0.2, w: 0.18, size: 26, weight: 800, lh: 1.05, color: ink }),
      B(churchName(ctx), { x: 0.5, y: 0.86, size: 30, weight: 700, color: ink }),
    ] })],
    welcome: (ctx) => [page({ bg: solid('#F6D3CF'), items: [
      photo({ shape: 'wave', x: 0.5, y: 0.36, w: 0.8, h: 0.5, fill: sky }),
      H('You belong here', { size: 100, x: 0.5, y: 0.72, w: 0.86, color: ink }),
      ...pill(ctx.church?.times || 'Sundays at 9 & 11', 0.5, 0.86, 0.56, { fill: olive, color: cream }),
      shape({ shape: 'burst', x: 0.14, y: 0.66, w: 0.08, h: 0.065, fill: olive }),
    ] })],
    announce: (ctx) => [page({ bg: pattern('checker', cream, '#E7EBC9', 0.06), items: [
      photo({ shape: 'wave', x: 0.5, y: 0.34, w: 0.84, h: 0.44, fill: sky }),
      shape({ shape: 'window', x: 0.5, y: 0.73, w: 0.84, h: 0.3, fill: '#FFFFFF', stroke: ink }),
      H('Join our team', { size: 84, x: 0.5, y: 0.69, w: 0.74, color: ink }),
      B('We need greeters, kids helpers and coffee makers. Serve with friends.', { x: 0.5, y: 0.79, w: 0.72, size: 32, color: ink }),
      B(site(ctx), { x: 0.5, y: 0.94, size: 28, weight: 700, color: olive }),
    ] })],
    verse: () => [page({ bg: solid(cream), items: [
      shape({ shape: 'burst', x: 0.5, y: 0.17, w: 0.14, h: 0.11, fill: peach }),
      H('“Come to me, all you who are weary, and I will give you rest.”', { size: 76, x: 0.5, y: 0.48, w: 0.8, lh: 1.2, color: ink }),
      ...pill('Matthew 11:28', 0.5, 0.75, 0.42, { fill: olive, color: cream }),
    ] })],
    series: (ctx) => [page({ bg: solid(cream), items: [
      photo({ shape: 'wave', x: 0.72, y: 0.5, w: 0.44, h: 0.8, fill: sky }),
      B('SERMON SERIES', { x: 0.3, y: 0.28, w: 0.46, align: 'left', size: 34, weight: 800, letter: 8, color: olive }),
      H('Rooted', { size: 200, x: 0.3, y: 0.48, w: 0.48, align: 'left', color: ink }),
      B(ctx.church?.pastor || 'Minister Name', { x: 0.3, y: 0.66, w: 0.46, align: 'left', size: 40, color: ink }),
      shape({ shape: 'scallop', x: 0.08, y: 0.84, w: 0.07, h: 0.12, fill: peach }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Pulse
function pulse(kind) {
  const P = PACKS2.pulse; const { H, B, photo, pill } = kit(P); const [purple, orange, ink, light, pink] = P.c;
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(light), items: [
      photo({ x: 0.5, y: 0.33, w: 0.86, h: 0.5, radius: 44, fill: purple }),
      H(e.title, { size: fit(e.title, 104, 62, 14), x: 0.5, y: 0.68, w: 0.86, align: 'left', color: ink, letter: -2 }),
      ...pill(e.when, 0.38, 0.8, 0.62, { fill: ink, color: '#FFFFFF', size: 30 }),
      shape({ shape: 'ellipse', x: 0.79, y: 0.8, w: 0.06, h: 0.048, fill: orange }),
      B(`${churchName(ctx)}${e.place ? ` · ${e.place}` : ''}`, { x: 0.5, y: 0.92, w: 0.86, align: 'left', size: 28, color: ink, opacity: 0.75 }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(purple), items: [
      B(`${e.month} ${e.num}`, { x: 0.5, y: 0.1, w: 0.84, align: 'left', size: 44, weight: 800, color: '#FFFFFF' }),
      H(e.title, { size: fit(e.title, 140, 84, 12), x: 0.5, y: 0.22, w: 0.84, align: 'left', color: '#FFFFFF', letter: -2 }),
      photo({ x: 0.5, y: 0.56, w: 0.84, h: 0.38, radius: 50, fill: pink }),
      shape({ shape: 'burst', x: 0.82, y: 0.38, w: 0.2, h: 0.11, fill: ink }),
      ...pill(`${e.time}${e.place ? ` · ${e.place}` : ''}`, 0.5, 0.83, 0.7, { fill: ink, color: '#FFFFFF', size: 34, h: 0.045 }),
      B(site(ctx), { x: 0.5, y: 0.92, size: 28, weight: 700, color: '#FFFFFF' }),
    ] })]; },
    quote: (ctx) => [page({ bg: solid(light), items: [
      shape({ x: 0.5, y: 0.47, w: 0.84, h: 0.62, radius: 60, fill: purple }),
      H(quoteOf(ctx), { size: fit(quoteOf(ctx), 80, 52, 50), x: 0.5, y: 0.47, w: 0.7, color: '#FFFFFF', letter: -1, lh: 1.1 }),
      ...pill(`@${(ctx.church?.name || 'yourchurch').toLowerCase().replace(/[^a-z0-9]+/g, '')}`, 0.5, 0.86, 0.46, { fill: ink, color: '#FFFFFF', size: 28 }),
    ] })],
    welcome: (ctx) => [page({ bg: solid(ink), items: [
      photo({ x: 0.5, y: 0.5, w: 1, h: 1, fill: '#2A2B30' }),
      shape({ x: 0.5, y: 0.86, w: 1, h: 0.28, fill: ink, opacity: 0.55 }),
      H('Welcome home', { size: 104, x: 0.5, y: 0.8, w: 0.86, align: 'left', color: '#FFFFFF', letter: -2 }),
      ...pill(ctx.church?.times || 'Sundays at 9 & 11', 0.3, 0.91, 0.44, { fill: orange, color: ink, size: 28, h: 0.05 }),
    ] })],
    announce: (ctx) => [page({ bg: solid(light), items: [
      H('3 next steps', { size: 96, x: 0.5, y: 0.14, w: 0.84, align: 'left', color: ink, letter: -2 }),
      ...[['01', 'Come to a Sunday'], ['02', 'Join a group'], ['03', 'Find a place to serve']].flatMap(([n, t], i) => [
        shape({ x: 0.5, y: 0.32 + i * 0.13, w: 0.84, h: 0.002, fill: ink, opacity: 0.25 }),
        ...pill(n, 0.16, 0.38 + i * 0.13, 0.13, { fill: orange, color: ink, size: 28, h: 0.045 }),
        B(t, { x: 0.58, y: 0.38 + i * 0.13, w: 0.6, align: 'left', size: 44, weight: 700, color: ink }),
      ]),
      photo({ x: 0.5, y: 0.82, w: 0.84, h: 0.22, radius: 36, fill: purple }),
    ] })],
    verse: () => [page({ bg: solid(ink), items: [
      shape({ shape: 'blob', x: 0.72, y: 0.28, w: 0.6, h: 0.42, fill: purple }),
      H('Be still, and know that I am God.', { size: 104, x: 0.5, y: 0.6, w: 0.84, align: 'left', color: '#FFFFFF', letter: -2 }),
      ...pill('Psalm 46:10', 0.3, 0.84, 0.36, { fill: pink, color: ink, size: 30 }),
    ] })],
    series: (ctx) => [page({ bg: solid(purple), items: [
      shape({ shape: 'burst', x: 0.12, y: 0.2, w: 0.08, h: 0.14, fill: ink }),
      H('Unshaken', { size: 220, x: 0.42, y: 0.5, w: 0.7, align: 'left', color: '#FFFFFF', letter: -4 }),
      ...pill(ctx.church?.pastor || 'A new series', 0.2, 0.72, 0.26, { fill: ink, color: '#FFFFFF', size: 32, h: 0.07 }),
      photo({ x: 0.84, y: 0.5, w: 0.26, h: 0.8, radius: 40, fill: pink }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Grove
function grove(kind) {
  const P = PACKS2.grove; const { H, B, photo } = kit(P); const [green, lime, navy, cream, lilac] = P.c;
  const stamp = (ctx, x, y, w, color, ink) => [shape({ shape: 'scallop', x, y, w, h: w * 0.8, fill: color }), H(initial(ctx), { x, y, w, size: 64, color: ink })];
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(green), items: [
      B(e.when, { x: 0.5, y: 0.08, w: 0.86, align: 'left', size: 30, weight: 700, color: lime }),
      H(e.title, { size: fit(e.title, 120, 70, 12), x: 0.5, y: 0.22, w: 0.86, align: 'left', italic: true, color: lime }),
      photo({ x: 0.56, y: 0.62, w: 0.74, h: 0.44, fill: '#0A5A41' }),
      ...stamp(ctx, 0.18, 0.84, 0.18, lilac, navy),
      B(`${churchName(ctx)}\n${e.place}`, { x: 0.62, y: 0.92, w: 0.62, align: 'left', size: 26, lh: 1.3, color: lime }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(lilac), items: [
      B(e.weekday, { x: 0.5, y: 0.1, w: 0.84, align: 'left', size: 36, weight: 700, color: navy }),
      H(e.title, { size: fit(e.title, 140, 80, 10), x: 0.5, y: 0.22, w: 0.84, align: 'left', italic: true, color: navy }),
      photo({ x: 0.5, y: 0.55, w: 0.84, h: 0.36, fill: green }),
      shape({ x: 0.5, y: 0.82, w: 0.84, h: 0.1, fill: green }),
      B(`${e.day} · ${e.time}`, { x: 0.5, y: 0.82, w: 0.76, size: 36, weight: 700, color: lime }),
      ...stamp(ctx, 0.82, 0.37, 0.2, lime, navy),
      B(site(ctx), { x: 0.5, y: 0.93, size: 26, color: navy }),
    ] })]; },
    quote: (ctx) => [page({ bg: solid(lilac), items: [
      B('From Sunday', { x: 0.5, y: 0.1, size: 28, weight: 700, color: navy }),
      H(quoteOf(ctx), { size: fit(quoteOf(ctx), 84, 54, 50), x: 0.5, y: 0.48, w: 0.82, lh: 1.15, color: navy }),
      ...stamp(ctx, 0.84, 0.85, 0.16, lime, navy),
      B(churchName(ctx), { x: 0.4, y: 0.88, w: 0.6, align: 'left', size: 28, weight: 700, color: navy }),
    ] })],
    welcome: (ctx) => [page({ bg: solid(navy), items: [
      H('There’s a seat for you', { size: 100, x: 0.5, y: 0.2, w: 0.86, align: 'left', italic: true, color: lime }),
      shape({ shape: 'blob', x: 0.3, y: 0.66, w: 0.44, h: 0.36, fill: lilac }),
      photo({ x: 0.66, y: 0.62, w: 0.5, h: 0.42, fill: green }),
      B(ctx.church?.times || 'Sundays at 9 & 11', { x: 0.5, y: 0.92, w: 0.86, align: 'left', size: 32, weight: 700, color: lime }),
    ] })],
    announce: (ctx) => [page({ bg: solid(lime), items: [
      H('Small groups start soon', { size: 96, x: 0.5, y: 0.2, w: 0.86, align: 'left', italic: true, color: green }),
      photo({ x: 0.5, y: 0.6, w: 0.86, h: 0.4, fill: green }),
      B(`Sign up at ${site(ctx)}`, { x: 0.5, y: 0.89, w: 0.86, align: 'left', size: 34, weight: 700, color: green }),
    ] })],
    verse: (ctx) => [page({ bg: solid(green), items: [
      H('The steadfast love of the Lord never ceases.', { size: 92, x: 0.5, y: 0.46, w: 0.82, lh: 1.15, italic: true, color: lime }),
      B('Lamentations 3:22', { x: 0.5, y: 0.72, size: 34, weight: 700, color: lime }),
      ...stamp(ctx, 0.5, 0.88, 0.14, lilac, navy),
    ] })],
    series: (ctx) => [page({ bg: solid(navy), items: [
      H('The Greater Story', { size: 170, x: 0.32, y: 0.48, w: 0.56, align: 'left', italic: true, color: lime }),
      B(ctx.church?.pastor || 'A sermon series', { x: 0.32, y: 0.76, w: 0.56, align: 'left', size: 40, color: lime }),
      photo({ x: 0.79, y: 0.5, w: 0.34, h: 0.84, fill: green }),
      ...stamp(ctx, 0.62, 0.18, 0.09, lilac, navy),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Ember
function ember(kind) {
  const P = PACKS2.ember; const { H, B, photo, pill } = kit(P); const [orange, amber, dark, cream, rust] = P.c;
  const glow = (seed) => mesh(['#F7842F', '#FFC266', '#EE5A24', '#FFD9A8', '#D9471C'], seed, 0, 0.16);
  const serif = (t, p) => H(t, { weight: 500, ...p });
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: glow(12), items: [
      serif(e.title, { size: fit(e.title, 104, 64, 14), x: 0.5, y: 0.26, w: 0.84, align: 'left', lh: 1.1, color: '#FFFFFF' }),
      photo({ shape: 'ellipse', x: 0.68, y: 0.6, w: 0.5, h: 0.4, fill: rust }),
      ...pill(e.day, 0.26, 0.56, 0.38, { outline: true, color: '#FFFFFF', size: 26, h: 0.05 }),
      ...pill(e.time, 0.2, 0.64, 0.26, { outline: true, color: '#FFFFFF', size: 26, h: 0.05 }),
      B(`${churchName(ctx)} · ${site(ctx)}`, { x: 0.5, y: 0.92, w: 0.84, align: 'left', size: 26, color: '#FFFFFF', opacity: 0.9 }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: glow(41), items: [
      serif(`Join us for\n${e.title}`, { size: fit(e.title, 116, 72, 12), x: 0.5, y: 0.22, w: 0.82, align: 'left', lh: 1.1, color: '#FFFFFF' }),
      photo({ x: 0.5, y: 0.56, w: 0.82, h: 0.34, radius: 36, fill: rust }),
      ...pill(e.day, 0.36, 0.8, 0.54, { outline: true, color: '#FFFFFF', size: 30, h: 0.04 }),
      ...pill(e.place || e.time, 0.36, 0.86, 0.54, { outline: true, color: '#FFFFFF', size: 30, h: 0.04 }),
      B(site(ctx), { x: 0.5, y: 0.94, w: 0.82, align: 'left', size: 26, color: '#FFFFFF' }),
    ] })]; },
    quote: (ctx) => [page({ bg: solid(cream), items: [
      serif('“', { size: 200, x: 0.14, y: 0.16, w: 0.2, color: orange }),
      serif(quoteOf(ctx), { size: fit(quoteOf(ctx), 70, 46, 50), x: 0.5, y: 0.46, w: 0.78, align: 'left', lh: 1.25, color: dark }),
      photo({ shape: 'ellipse', x: 0.16, y: 0.86, w: 0.1, h: 0.08, fill: orange }),
      B(ctx.church?.pastor || churchName(ctx), { x: 0.55, y: 0.86, w: 0.66, align: 'left', size: 30, weight: 700, color: dark }),
    ] })],
    welcome: (ctx) => [page({ bg: solid(dark), items: [
      photo({ shape: 'ellipse', x: 0.5, y: 0.34, w: 0.56, h: 0.45, fill: rust }),
      ...['Worship', 'Kids', 'Community'].flatMap((t, i) => pill(t, 0.26 + i * 0.24, 0.62, 0.22, { fill: i === 0 ? '#5C7CE8' : i === 1 ? amber : '#F3E3D3', color: dark, size: 24, h: 0.045 })),
      serif('Let’s grow together.', { size: 84, x: 0.5, y: 0.78, w: 0.8, color: cream }),
    ] })],
    announce: (ctx) => [page({ bg: glow(77), items: [
      serif('Join a group that feels like family.', { size: 88, x: 0.5, y: 0.3, w: 0.82, align: 'left', lh: 1.15, color: '#FFFFFF' }),
      photo({ x: 0.5, y: 0.66, w: 0.82, h: 0.28, radius: 30, fill: rust }),
      ...pill('Groups', 0.2, 0.89, 0.22, { outline: true, color: '#FFFFFF', size: 24, h: 0.045 }),
      ...pill(site(ctx), 0.52, 0.89, 0.38, { outline: true, color: '#FFFFFF', size: 24, h: 0.045 }),
    ] })],
    verse: () => [page({ bg: glow(5), items: [
      serif('This is the day the Lord has made; let us rejoice and be glad in it.', { size: 78, x: 0.5, y: 0.46, w: 0.8, lh: 1.2, color: '#FFFFFF' }),
      ...pill('Psalm 118:24', 0.5, 0.74, 0.36, { outline: true, color: '#FFFFFF', size: 28 }),
    ] })],
    series: (ctx) => [page({ bg: glow(23), items: [
      serif('Kindled', { size: 210, x: 0.34, y: 0.46, w: 0.6, align: 'left', color: '#FFFFFF' }),
      ...pill(ctx.church?.pastor || 'A new series', 0.18, 0.7, 0.24, { outline: true, color: '#FFFFFF', size: 30, h: 0.07 }),
      photo({ shape: 'ellipse', x: 0.8, y: 0.5, w: 0.3, h: 0.53, fill: rust }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Dusk
function dusk(kind) {
  const P = PACKS2.dusk; const { H, B, photo } = kit(P); const [teal, orange, black, cream, navy] = P.c;
  const night = (seed) => mesh(['#0B0E14', '#245E6E', '#1E2C5A', '#6E3424', '#101826'], seed, 0.12, 0.22);
  const serif = (t, p) => H(t, { weight: 400, ...p });
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: night(9), items: [
      serif(e.title, { size: fit(e.title, 104, 64, 14), x: 0.5, y: 0.22, w: 0.84, align: 'left', lh: 1.1, color: '#FFFFFF' }),
      photo({ x: 0.5, y: 0.55, w: 0.84, h: 0.34, radius: 20, fill: navy }),
      B(`${e.when}\n${e.place}`, { x: 0.5, y: 0.82, w: 0.84, align: 'left', size: 32, lh: 1.4, color: '#FFFFFF', opacity: 0.9 }),
      B(`Register now → ${site(ctx)}`, { x: 0.5, y: 0.93, w: 0.84, align: 'left', size: 24, color: '#FFFFFF', opacity: 0.75 }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: night(33), items: [
      B(e.weekday.toUpperCase(), { x: 0.5, y: 0.12, w: 0.82, align: 'left', size: 28, weight: 700, letter: 8, color: '#FFFFFF', opacity: 0.8 }),
      serif(e.title, { size: fit(e.title, 128, 76, 12), x: 0.5, y: 0.25, w: 0.82, align: 'left', lh: 1.08, color: '#FFFFFF' }),
      photo({ x: 0.5, y: 0.58, w: 0.82, h: 0.34, radius: 24, fill: navy }),
      B(`${e.day}\n${e.time}${e.place ? ` · ${e.place}` : ''}`, { x: 0.5, y: 0.84, w: 0.82, align: 'left', size: 36, lh: 1.4, color: '#FFFFFF' }),
    ] })]; },
    quote: (ctx) => [page({ bg: solid(cream), items: [
      serif(`“${quoteOf(ctx)}”`, { size: fit(quoteOf(ctx), 74, 48, 50), x: 0.5, y: 0.42, w: 0.8, lh: 1.2, color: black }),
      B(ctx.church?.pastor || churchName(ctx), { x: 0.5, y: 0.66, size: 28, color: black, opacity: 0.8 }),
      shape({ x: 0.5, y: 0.85, w: 0.84, h: 0.12, radius: 12, fill: orange }),
    ] })],
    welcome: (ctx) => [page({ bg: night(51), items: [
      serif('Sharing\nlife\ntogether', { size: 110, x: 0.5, y: 0.42, w: 0.8, lh: 1.25, color: '#FFFFFF' }),
      B(`${churchName(ctx)} · ${ctx.church?.times || 'Sundays at 9 & 11'}`, { x: 0.5, y: 0.86, w: 0.84, size: 28, color: '#FFFFFF', opacity: 0.85 }),
    ] })],
    announce: (ctx) => [page({ bg: solid(orange), items: [
      serif('We need you on the team.', { size: 100, x: 0.5, y: 0.22, w: 0.84, align: 'left', lh: 1.08, color: '#FFFFFF' }),
      photo({ x: 0.5, y: 0.62, w: 0.84, h: 0.4, radius: 20, fill: '#B4451A' }),
      B(`Serve with us → ${site(ctx)}`, { x: 0.5, y: 0.9, w: 0.84, align: 'left', size: 28, color: '#FFFFFF' }),
    ] })],
    verse: () => [page({ bg: night(77), items: [
      serif('The light shines in the darkness, and the darkness has not overcome it.', { size: 76, x: 0.5, y: 0.46, w: 0.8, lh: 1.25, color: '#FFFFFF' }),
      B('John 1:5', { x: 0.5, y: 0.72, size: 30, weight: 700, letter: 4, color: '#FFFFFF', opacity: 0.85 }),
    ] })],
    series: (ctx) => [page({ bg: night(15), items: [
      serif('Night & Day', { size: 190, x: 0.38, y: 0.46, w: 0.66, align: 'left', color: '#FFFFFF' }),
      B(ctx.church?.pastor || 'A sermon series', { x: 0.38, y: 0.68, w: 0.66, align: 'left', size: 40, color: '#FFFFFF', opacity: 0.85 }),
      photo({ x: 0.84, y: 0.5, w: 0.24, h: 0.78, radius: 20, fill: navy }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Collage
function collage(kind) {
  const P = PACKS2.collage; const { H, B, hand, photo, pill } = kit(P); const [ink, blue, , cream, pink] = P.c;
  const cutout = (p) => photo({ fill: '#C9C2B5', line: 14, stroke: '#FFFFFF', radius: 6, ...p });
  const serif = (t, p) => H(t, { weight: 400, ...p });
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      serif(e.title, { size: fit(e.title, 112, 66, 12), x: 0.5, y: 0.15, w: 0.86, lh: 1.05, color: ink }),
      hand('save the date!', { x: 0.5, y: 0.27, w: 0.7, size: 60, color: blue }),
      cutout({ x: 0.5, y: 0.58, w: 0.66, h: 0.44 }),
      ...pill(e.when, 0.5, 0.86, 0.64, { outline: true, color: ink, size: 28, h: 0.05 }),
      B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.95, size: 22, weight: 700, letter: 6, color: ink }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.07, size: 24, weight: 700, letter: 6, color: ink }),
      serif(e.title, { size: fit(e.title, 130, 76, 10), x: 0.5, y: 0.18, w: 0.84, lh: 1.05, color: ink }),
      cutout({ x: 0.5, y: 0.5, w: 0.74, h: 0.36 }),
      hand(`${e.weekday.toLowerCase()} night!`, { x: 0.62, y: 0.71, w: 0.6, size: 66, color: blue }),
      shape({ shape: 'window', x: 0.5, y: 0.84, w: 0.74, h: 0.11, fill: '#FFFFFF', stroke: ink }),
      B(`${e.day} · ${e.time}\n${e.place}`, { x: 0.5, y: 0.85, w: 0.66, size: 30, lh: 1.35, color: ink }),
    ] })]; },
    quote: (ctx) => [page({ bg: solid(cream), items: [
      serif(quoteOf(ctx), { size: fit(quoteOf(ctx), 84, 54, 46), x: 0.5, y: 0.44, w: 0.8, lh: 1.15, color: ink }),
      hand(`— ${ctx.church?.pastor || 'from Sunday'}`, { x: 0.5, y: 0.7, w: 0.7, size: 56, color: blue }),
      B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.92, size: 22, weight: 700, letter: 6, color: ink }),
    ] })],
    welcome: (ctx) => [page({ bg: pattern('checker', '#FFFFFF', pink, 0.04), items: [
      shape({ shape: 'window', x: 0.5, y: 0.3, w: 0.8, h: 0.3, fill: '#FFFFFF', stroke: ink }),
      serif('New here?', { size: 120, x: 0.5, y: 0.3, w: 0.74, color: ink }),
      cutout({ x: 0.5, y: 0.68, w: 0.6, h: 0.38 }),
      hand('we saved you a seat', { x: 0.5, y: 0.92, w: 0.8, size: 56, color: blue }),
    ] })],
    announce: (ctx) => [page({ bg: solid(cream), items: [
      serif('30 days of prayer', { size: 112, x: 0.5, y: 0.18, w: 0.84, lh: 1.05, color: ink }),
      hand('start this week', { x: 0.5, y: 0.31, w: 0.7, size: 56, color: blue }),
      cutout({ x: 0.36, y: 0.62, w: 0.5, h: 0.36 }),
      shape({ shape: 'window', x: 0.72, y: 0.72, w: 0.44, h: 0.22, fill: '#FFFFFF', stroke: ink }),
      B(`A daily guide and a group to pray with. ${site(ctx)}`, { x: 0.72, y: 0.735, w: 0.38, size: 26, color: ink }),
    ] })],
    verse: () => [page({ bg: solid(cream), items: [
      serif('Taste and see that the Lord is good.', { size: 104, x: 0.5, y: 0.44, w: 0.8, lh: 1.1, color: ink }),
      hand('Psalm 34:8', { x: 0.5, y: 0.66, w: 0.6, size: 64, color: blue }),
    ] })],
    series: (ctx) => [page({ bg: solid(cream), items: [
      serif('Ordinary Holy', { size: 180, x: 0.36, y: 0.44, w: 0.6, lh: 1.02, color: ink }),
      hand(ctx.church?.pastor ? `with ${ctx.church.pastor}` : 'a new series', { x: 0.36, y: 0.72, w: 0.6, size: 72, color: blue }),
      cutout({ x: 0.8, y: 0.5, w: 0.28, h: 0.76 }),
    ] })],
  }[kind];
}

const BUILDERS = { meadow, pulse, grove, ember, dusk, collage };
const SETS = [
  ['eventPost', 'post', 'Event post', { event: true, photos: 1 }],
  ['eventStory', 'story', 'Event story', { event: true, photos: 1 }],
  ['welcome', 'post', 'Welcome', { photos: 1 }],
  ['announce', 'post', 'Announcement', { photos: 1 }],
  ['quote', 'post', 'Sermon quote', { photos: 0 }],
  ['verse', 'post', 'Verse', { photos: 0 }],
  ['series', 'presentation', 'Series title slide', { photos: 1 }],
];

export const PACK2_TEMPLATES = Object.entries(PACKS2).flatMap(([id, P]) => SETS.map(([key, kind, label, meta]) => ({
  id: `${id}-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, pack: id, kind, name: `${P.name} ${label.toLowerCase()}`, ...meta,
  build: (ctx) => BUILDERS[id](key)(ctx),
})));

/**
 * Swap a pack's own colors for the church's brand colors, keeping each color's job. One-off shades
 * map to the brand color of the nearest pack color; white, black and grays stay as they are.
 */
export function inBrandColors(pages, packColors, brand) {
  const rgb = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
  const neutral = (h) => { const [r, g, b] = rgb(h); return Math.max(r, g, b) - Math.min(r, g, b) < 18; };
  const exact = Object.fromEntries(packColors.map((c, i) => [c.toUpperCase(), brand[i] || c]));
  const sw = (v) => {
    if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (exact[v.toUpperCase()]) return exact[v.toUpperCase()];
    if (neutral(v)) return v;
    const [r, g, b] = rgb(v);
    let best = 0; let bd = Infinity;
    packColors.forEach((c, i) => { const [r2, g2, b2] = rgb(c); const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2; if (d < bd) { bd = d; best = i; } });
    return brand[best] || v;
  };
  return pages.map((pg) => ({
    ...pg,
    bg: { ...pg.bg, color: sw(pg.bg?.color), color2: sw(pg.bg?.color2), from: sw(pg.bg?.from), to: sw(pg.bg?.to), colors: pg.bg?.type === 'mesh' ? [brand[0], brand[1], brand[4] || brand[0], brand[3] || brand[1], brand[2] || brand[0]] : pg.bg?.colors?.map(sw) },
    items: pg.items.map((it) => ({ ...it, id: uid(), fill: sw(it.fill), color: sw(it.color), stroke: sw(it.stroke), ...(it.fx && it.type === 'text' ? { fx: Object.fromEntries(Object.entries(it.fx).map(([k, v]) => [k, v && { ...v, color: sw(v.color) }])) } : {}) })),
  }));
}
