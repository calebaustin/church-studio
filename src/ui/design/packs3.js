// Six more template packs, adapted from the visual systems in beautiful-html-templates (MIT, see CREDITS.md):
// Sanctuary (from Grove), Table (from Long Table), Vesper (from Soft Editorial), Daisy (from Daisy Days),
// Poster (from Bold Poster) and Quarterly (from Editorial Forest). Same seven pieces as the other packs, with
// your church's details filled in and photo spots you fill with your own pictures. Fonts are the ones built
// into macOS, so every template works offline.
import { page, shape, text as rawText } from './model.js';

// A text box's x is its center. For left-aligned lines written by their left edge (x below half the width),
// move the center so the box starts at that edge instead of running off the page.
const text = (p) => (p.align === 'left' && p.x < (p.w ?? 0.8) / 2 ? rawText({ ...p, x: p.x + (p.w ?? 0.8) / 2 }) : rawText(p));

export const PACKS3 = {
  sanctuary: { name: 'Sanctuary', about: 'Quiet monograph serif, ink green on warm paper, generous space.', c: ['#2F4A3A', '#C9B79C', '#1E2A22', '#F3EEE3', '#8FA58C'], h: 'Bodoni 72', b: 'Avenir Next', hw: 400 },
  table: { name: 'Table', about: 'One warm ink on cream, big italic numbers and tight bold type, like a supper-club poster.', c: ['#B83D2C', '#F2C9B8', '#B83D2C', '#FAF0E2', '#E7A08A'], h: 'Futura', b: 'Hoefler Text', hw: 700 },
  vesper: { name: 'Vesper', about: 'Soft, literary and unhurried: classic serif, blush and charcoal.', c: ['#3B3A3E', '#E9C9C1', '#2A2A2E', '#F7F1EC', '#B8A6A0'], h: 'Baskerville', b: 'Baskerville', hw: 600 },
  daisy: { name: 'Daisy', about: 'Sunny and friendly for kids and family: rounded type, turquoise and sunflower.', c: ['#2BA8A0', '#F7C844', '#1F3B4D', '#FFF8E7', '#F28FA0'], h: 'Arial Rounded MT Bold', b: 'Avenir Next', hw: 700 },
  poster: { name: 'Poster', about: 'Loud and quotable: slab poster type, tomato red, navy and cream.', c: ['#E2482D', '#1D2B53', '#16130F', '#F4EAD5', '#F2B63D'], h: 'Rockwell', b: 'Georgia', hw: 700 },
  quarterly: { name: 'Quarterly', about: 'A considered editorial: forest green, paper and a single rule.', c: ['#24543F', '#D9C7A3', '#16241C', '#F2EDE2', '#7FA38E'], h: 'Iowan Old Style', b: 'Avenir Next', hw: 600 },
};

// ------------------------------------------------------------------ shared helpers (same shape as the other packs)
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const pattern = (kind, color, color2, scale = 0.08) => ({ type: 'pattern', pattern: kind, color, color2, scale, darken: 0 });
const fit = (t, base, min = base * 0.55, room = 18) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const ev = (ctx) => ({
  title: ctx.ev?.title || 'Family Night', day: ctx.ev?.day || 'Saturday, Nov 22', time: ctx.ev?.time || '6 PM',
  when: ctx.ev?.when || 'Saturday, Nov 22 · 6 PM', place: ctx.ev?.place || 'Fellowship Hall', month: ctx.ev?.month || 'NOV', num: ctx.ev?.num || '22', weekday: ctx.ev?.weekday || 'Saturday',
});
const quoteOf = (ctx) => (ctx.o?.quotes?.[0] || 'Grace is not something you earn. It is something you receive.').replace(/^“|”$/g, '');
const times = (ctx) => ctx.church?.times || 'Sundays at 9 & 11';
function kit(P) {
  const H = (t, p) => text({ text: t, font: P.h, weight: P.hw, lh: 1.05, ...p });
  const B = (t, p) => text({ text: t, font: P.b, weight: 500, size: 38, lh: 1.35, ...p });
  const photo = (p) => shape({ frame: true, fill: P.c[4], ...p });
  const rule = (x, y, w, color, h = 0.004) => shape({ x, y, w, h, fill: color });
  return { H, B, photo, rule };
}

// ------------------------------------------------------------------ Sanctuary (after Grove: quiet, monograph serif)
function sanctuary(kind) {
  const P = PACKS3.sanctuary; const { H, B, photo, rule } = kit(P); const [green, sand, ink, paper, sage] = P.c;
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(paper), items: [
      photo({ x: 0.5, y: 0.34, w: 0.84, h: 0.46, fill: sage }),
      B(e.weekday.toUpperCase(), { x: 0.5, y: 0.64, size: 26, weight: 600, letter: 10, color: green }),
      H(e.title, { size: fit(e.title, 110, 66, 14), x: 0.5, y: 0.74, w: 0.84, color: ink }),
      rule(0.5, 0.83, 0.12, green),
      B(`${e.when}  ·  ${e.place}`, { x: 0.5, y: 0.88, w: 0.86, size: 30, color: ink }),
      B(churchName(ctx), { x: 0.5, y: 0.95, size: 22, letter: 4, color: green, opacity: 0.8 }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(paper), items: [
      B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.07, size: 24, weight: 600, letter: 10, color: green }),
      H(e.title, { size: fit(e.title, 150, 88, 12), x: 0.5, y: 0.2, w: 0.84, italic: true, color: ink }),
      photo({ x: 0.5, y: 0.5, w: 0.8, h: 0.36, fill: sage }),
      rule(0.5, 0.74, 0.12, green),
      B(`${e.day}\n${e.time} · ${e.place}`, { x: 0.5, y: 0.81, w: 0.8, size: 40, color: ink }),
      B(site(ctx), { x: 0.5, y: 0.93, size: 28, color: green }),
    ] })]; },
    welcome: (ctx) => [page({ bg: solid(green), items: [
      photo({ x: 0.5, y: 0.34, w: 0.72, h: 0.44, fill: sage }),
      H('Welcome home', { size: 120, x: 0.5, y: 0.7, w: 0.86, italic: true, color: paper }),
      rule(0.5, 0.8, 0.1, sand),
      B(times(ctx), { x: 0.5, y: 0.86, size: 34, color: paper }),
    ] })],
    announce: (ctx) => [page({ bg: solid(paper), items: [
      B('AN INVITATION', { x: 0.5, y: 0.12, size: 26, weight: 600, letter: 10, color: green }),
      H('Join a small group', { size: 104, x: 0.5, y: 0.26, w: 0.84, color: ink }),
      photo({ x: 0.5, y: 0.56, w: 0.84, h: 0.34, fill: sage }),
      B('Real friends, honest questions, and a table to share. New groups start this month.', { x: 0.5, y: 0.83, w: 0.78, size: 32, color: ink }),
      B(site(ctx), { x: 0.5, y: 0.94, size: 26, color: green }),
    ] })],
    quote: (ctx) => [page({ bg: solid(paper), items: [
      H('“', { size: 260, x: 0.5, y: 0.2, w: 0.3, color: sand }),
      H(quoteOf(ctx), { size: fit(quoteOf(ctx), 84, 52, 60), x: 0.5, y: 0.5, w: 0.8, lh: 1.18, italic: true, color: ink }),
      rule(0.5, 0.74, 0.1, green),
      B(churchName(ctx), { x: 0.5, y: 0.8, size: 28, letter: 4, color: green }),
    ] })],
    verse: () => [page({ bg: solid(sage), items: [
      H('Be still, and know that I am God.', { size: 112, x: 0.5, y: 0.44, w: 0.8, lh: 1.1, italic: true, color: paper }),
      rule(0.5, 0.64, 0.1, paper),
      B('PSALM 46:10', { x: 0.5, y: 0.7, size: 30, weight: 600, letter: 8, color: paper }),
    ] })],
    series: (ctx) => [page({ bg: solid(paper), items: [
      B('A SERMON SERIES', { x: 0.3, y: 0.3, w: 0.46, align: 'left', size: 28, weight: 600, letter: 10, color: green }),
      H('Rooted', { size: 220, x: 0.3, y: 0.5, w: 0.5, align: 'left', italic: true, color: ink }),
      B(ctx.church?.pastor || 'Minister Name', { x: 0.3, y: 0.68, w: 0.46, align: 'left', size: 36, color: ink }),
      photo({ x: 0.76, y: 0.5, w: 0.38, h: 0.84, fill: sage }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Table (after Long Table: one warm ink)
function table(kind) {
  const P = PACKS3.table; const { H, B, photo } = kit(P); const [ink, blush, , cream] = P.c;
  const outline = (t, x, y, w, p = {}) => [shape({ x, y, w, h: 0.05, radius: 200, fill: 'none', line: 2.5, stroke: ink }), B(t, { x, y, w: w * 0.9, size: 30, color: ink, ...p })];
  const num = (t, p) => text({ text: t, font: 'Hoefler Text', weight: 400, italic: true, lh: 0.95, color: ink, ...p });
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      num(e.num, { size: 360, x: 0.74, y: 0.3, w: 0.5 }),
      B(e.month, { x: 0.74, y: 0.5, size: 30, weight: 700, letter: 10, color: ink }),
      H(e.title.toUpperCase(), { size: fit(e.title, 104, 64, 12), x: 0.08, y: 0.66, w: 0.84, align: 'left', lh: 0.95, color: ink }),
      ...outline(e.time, 0.2, 0.84, 0.24),
      ...outline(e.place, 0.52, 0.84, 0.34),
      B(churchName(ctx), { x: 0.08, y: 0.94, w: 0.8, align: 'left', size: 26, color: ink }),
      photo({ x: 0.26, y: 0.26, w: 0.36, h: 0.34, fill: blush }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      B(`${e.weekday.toLowerCase()} edition`, { x: 0.5, y: 0.07, size: 36, italic: true, color: ink }),
      H(e.title.toUpperCase(), { size: fit(e.title, 140, 84, 10), x: 0.5, y: 0.2, w: 0.86, lh: 0.95, color: ink }),
      photo({ x: 0.5, y: 0.47, w: 0.78, h: 0.3, fill: blush }),
      num(e.num, { size: 300, x: 0.5, y: 0.73, w: 0.6 }),
      B(`${e.month} · ${e.time} · ${e.place}`.toUpperCase(), { x: 0.5, y: 0.86, size: 28, weight: 700, letter: 6, color: ink }),
      B(site(ctx), { x: 0.5, y: 0.93, size: 30, color: ink }),
    ] })]; },
    welcome: (ctx) => [page({ bg: solid(ink), items: [
      H('PULL UP\nA CHAIR', { size: 150, x: 0.5, y: 0.36, w: 0.86, lh: 0.92, color: cream }),
      B('There’s a seat at the table for you.', { x: 0.5, y: 0.6, w: 0.8, size: 44, italic: true, color: cream }),
      shape({ x: 0.5, y: 0.75, w: 0.5, h: 0.055, radius: 200, fill: 'none', line: 2.5, stroke: cream }),
      B(times(ctx), { x: 0.5, y: 0.75, w: 0.46, size: 30, color: cream }),
      B(churchName(ctx), { x: 0.5, y: 0.92, size: 28, color: cream, opacity: 0.85 }),
    ] })],
    announce: (ctx) => [page({ bg: solid(cream), items: [
      H('SERVE\nSUNDAY', { size: 150, x: 0.08, y: 0.3, w: 0.84, align: 'left', lh: 0.92, color: ink }),
      B('Greeters, coffee and kids rooms. Two hours, one month, a whole lot of joy.', { x: 0.08, y: 0.56, w: 0.62, align: 'left', size: 36, color: ink }),
      photo({ x: 0.76, y: 0.66, w: 0.34, h: 0.4, fill: blush }),
      ...outline('Sign up', 0.2, 0.84, 0.22),
      B(site(ctx), { x: 0.08, y: 0.94, w: 0.8, align: 'left', size: 26, color: ink }),
    ] })],
    quote: (ctx) => [page({ bg: solid(blush), items: [
      num('“', { size: 300, x: 0.18, y: 0.18, w: 0.3 }),
      B(quoteOf(ctx), { size: fit(quoteOf(ctx), 66, 44, 60), x: 0.5, y: 0.5, w: 0.8, lh: 1.25, color: ink }),
      B(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.82, size: 26, weight: 700, letter: 8, color: ink }),
    ] })],
    verse: () => [page({ bg: solid(cream), items: [
      H('TASTE\nAND SEE', { size: 170, x: 0.5, y: 0.38, w: 0.86, lh: 0.92, color: ink }),
      B('that the Lord is good.', { x: 0.5, y: 0.6, w: 0.8, size: 52, italic: true, color: ink }),
      shape({ x: 0.5, y: 0.75, w: 0.36, h: 0.055, radius: 200, fill: 'none', line: 2.5, stroke: ink }),
      B('Psalm 34:8', { x: 0.5, y: 0.75, w: 0.32, size: 30, color: ink }),
    ] })],
    series: (ctx) => [page({ bg: solid(cream), items: [
      H('ROOTED', { size: 230, x: 0.06, y: 0.42, w: 0.6, align: 'left', lh: 0.92, color: ink }),
      B('a sermon series', { x: 0.06, y: 0.62, w: 0.5, align: 'left', size: 48, italic: true, color: ink }),
      B(ctx.church?.pastor || 'Minister Name', { x: 0.06, y: 0.72, w: 0.5, align: 'left', size: 34, color: ink }),
      num('No. 1', { size: 220, x: 0.78, y: 0.48, w: 0.4 }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Vesper (after Soft Editorial: literary)
function vesper(kind) {
  const P = PACKS3.vesper; const { H, B, photo, rule } = kit(P); const [char, blush, ink, paper, taupe] = P.c;
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(paper), items: [
      photo({ shape: 'arch', x: 0.5, y: 0.36, w: 0.62, h: 0.5, fill: blush }),
      H(e.title, { size: fit(e.title, 100, 62, 14), x: 0.5, y: 0.73, w: 0.86, italic: true, color: ink }),
      B(`${e.when}\n${e.place}`, { x: 0.5, y: 0.85, w: 0.8, size: 32, color: char }),
      B(churchName(ctx), { x: 0.5, y: 0.95, size: 24, letter: 6, color: taupe }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(blush), items: [
      B('you are invited', { x: 0.5, y: 0.1, size: 40, italic: true, color: ink }),
      H(e.title, { size: fit(e.title, 140, 84, 12), x: 0.5, y: 0.22, w: 0.84, color: ink }),
      photo({ shape: 'arch', x: 0.5, y: 0.52, w: 0.62, h: 0.36, fill: paper }),
      rule(0.5, 0.75, 0.12, ink, 0.002),
      B(`${e.day} · ${e.time}\n${e.place}`, { x: 0.5, y: 0.82, w: 0.8, size: 38, color: ink }),
      B(site(ctx), { x: 0.5, y: 0.93, size: 28, color: ink }),
    ] })]; },
    welcome: (ctx) => [page({ bg: solid(paper), items: [
      H('Come as\nyou are', { size: 140, x: 0.5, y: 0.36, w: 0.86, italic: true, lh: 1.0, color: ink }),
      rule(0.5, 0.58, 0.12, char, 0.002),
      B(times(ctx), { x: 0.5, y: 0.65, size: 36, color: char }),
      photo({ shape: 'arch', x: 0.5, y: 0.86, w: 0.3, h: 0.22, fill: blush }),
    ] })],
    announce: (ctx) => [page({ bg: solid(paper), items: [
      photo({ x: 0.5, y: 0.3, w: 0.84, h: 0.4, fill: blush }),
      H('Women’s retreat', { size: 100, x: 0.5, y: 0.62, w: 0.86, italic: true, color: ink }),
      B('A quiet weekend to rest, pray and laugh together. Registration is open.', { x: 0.5, y: 0.76, w: 0.76, size: 32, color: char }),
      B(site(ctx), { x: 0.5, y: 0.92, size: 26, color: taupe }),
    ] })],
    quote: (ctx) => [page({ bg: solid(blush), items: [
      H(`“${quoteOf(ctx)}”`, { size: fit(quoteOf(ctx), 88, 54, 60), x: 0.5, y: 0.46, w: 0.8, lh: 1.18, italic: true, color: ink }),
      rule(0.5, 0.72, 0.1, ink, 0.002),
      B(churchName(ctx), { x: 0.5, y: 0.78, size: 28, letter: 4, color: ink }),
    ] })],
    verse: () => [page({ bg: solid(paper), items: [
      H('The Lord is my shepherd; I shall not want.', { size: 108, x: 0.5, y: 0.44, w: 0.8, lh: 1.1, italic: true, color: ink }),
      B('Psalm 23:1', { x: 0.5, y: 0.68, size: 36, color: taupe }),
    ] })],
    series: (ctx) => [page({ bg: solid(paper), items: [
      photo({ shape: 'arch', x: 0.74, y: 0.52, w: 0.36, h: 0.78, fill: blush }),
      B('a series on rest', { x: 0.3, y: 0.32, w: 0.46, align: 'left', size: 44, italic: true, color: char }),
      H('Sabbath', { size: 210, x: 0.3, y: 0.5, w: 0.52, align: 'left', color: ink }),
      B(ctx.church?.pastor || 'Minister Name', { x: 0.3, y: 0.68, w: 0.46, align: 'left', size: 34, color: char }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Daisy (after Daisy Days: kids and family)
function daisy(kind) {
  const P = PACKS3.daisy; const { H, B, photo } = kit(P); const [teal, sun, navy, cream, pink] = P.c;
  const flower = (x, y, s, fill = sun) => [shape({ shape: 'scallop', x, y, w: s, h: s, fill }), shape({ shape: 'ellipse', x, y, w: s * 0.36, h: s * 0.36, fill: '#FFFFFF' })];
  const blob = (t, x, y, w, fill, color = navy) => [shape({ x, y, w, h: 0.06, radius: 200, fill }), B(t, { x, y, w: w * 0.9, size: 32, weight: 700, color })];
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      photo({ shape: 'blob', x: 0.5, y: 0.36, w: 0.74, h: 0.5, fill: teal }),
      ...flower(0.14, 0.12, 0.14), ...flower(0.88, 0.6, 0.1, pink),
      H(e.title, { size: fit(e.title, 100, 62, 14), x: 0.5, y: 0.72, w: 0.86, color: navy }),
      ...blob(e.when, 0.5, 0.83, 0.62, sun),
      B(`${churchName(ctx)} · ${e.place}`, { x: 0.5, y: 0.93, w: 0.9, size: 26, color: navy }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(teal), items: [
      ...flower(0.16, 0.08, 0.14), ...flower(0.86, 0.14, 0.1, pink),
      H(e.title, { size: fit(e.title, 130, 80, 12), x: 0.5, y: 0.22, w: 0.86, color: '#FFFFFF' }),
      photo({ shape: 'blob', x: 0.5, y: 0.5, w: 0.78, h: 0.32, fill: cream }),
      ...blob(e.day, 0.5, 0.74, 0.6, sun),
      B(`${e.time} · ${e.place}`, { x: 0.5, y: 0.82, w: 0.8, size: 36, weight: 700, color: '#FFFFFF' }),
      B(site(ctx), { x: 0.5, y: 0.92, size: 30, color: '#FFFFFF' }),
    ] })]; },
    welcome: (ctx) => [page({ bg: solid(sun), items: [
      ...flower(0.5, 0.2, 0.22, '#FFFFFF'),
      H('Kids are\nwelcome here!', { size: 110, x: 0.5, y: 0.52, w: 0.86, lh: 1.05, color: navy }),
      ...blob(times(ctx), 0.5, 0.75, 0.62, teal, '#FFFFFF'),
      B(churchName(ctx), { x: 0.5, y: 0.9, size: 30, weight: 700, color: navy }),
    ] })],
    announce: (ctx) => [page({ bg: solid(cream), items: [
      H('Vacation\nBible School', { size: 110, x: 0.5, y: 0.2, w: 0.86, lh: 1.05, color: teal }),
      photo({ shape: 'blob', x: 0.5, y: 0.52, w: 0.8, h: 0.34, fill: pink }),
      ...flower(0.84, 0.36, 0.12),
      B('A week of games, songs and Bible stories for kids ages 4 to 11.', { x: 0.5, y: 0.78, w: 0.78, size: 32, color: navy }),
      ...blob(site(ctx), 0.5, 0.9, 0.56, sun),
    ] })],
    quote: (ctx) => [page({ bg: pattern('dots', cream, '#F3E4BD', 0.06), items: [
      shape({ x: 0.5, y: 0.48, w: 0.84, h: 0.52, radius: 60, fill: '#FFFFFF' }),
      H(quoteOf(ctx), { size: fit(quoteOf(ctx), 70, 46, 60), x: 0.5, y: 0.48, w: 0.72, lh: 1.2, color: navy }),
      ...flower(0.84, 0.22, 0.12, pink),
      B(churchName(ctx), { x: 0.5, y: 0.84, size: 30, weight: 700, color: teal }),
    ] })],
    verse: () => [page({ bg: solid(teal), items: [
      ...flower(0.5, 0.16, 0.16),
      H('Let the little children come to me.', { size: 100, x: 0.5, y: 0.46, w: 0.82, lh: 1.12, color: '#FFFFFF' }),
      ...blob('Matthew 19:14', 0.5, 0.7, 0.46, sun),
    ] })],
    series: (ctx) => [page({ bg: solid(cream), items: [
      photo({ shape: 'blob', x: 0.74, y: 0.5, w: 0.4, h: 0.74, fill: teal }),
      ...flower(0.56, 0.2, 0.12), ...flower(0.92, 0.84, 0.1, pink),
      B('KIDS SERIES', { x: 0.3, y: 0.3, w: 0.46, align: 'left', size: 32, weight: 700, letter: 6, color: teal }),
      H('Brave\nHearts', { size: 170, x: 0.3, y: 0.5, w: 0.5, align: 'left', lh: 1.0, color: navy }),
      B(ctx.church?.pastor || 'Minister Name', { x: 0.3, y: 0.7, w: 0.46, align: 'left', size: 34, color: navy }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Poster (after Bold Poster: loud and quotable)
function poster(kind) {
  const P = PACKS3.poster; const { H, B, photo, rule } = kit(P); const [red, navy, ink, cream, gold] = P.c;
  const mono = (t, p) => text({ text: t, font: 'Menlo', weight: 700, size: 24, letter: 4, lh: 1.3, ...p });
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(cream), items: [
      shape({ x: 0.5, y: 0.3, w: 1, h: 0.6, fill: red }),
      H(e.title.toUpperCase(), { size: fit(e.title, 130, 76, 10), x: 0.5, y: 0.3, w: 0.9, lh: 0.95, color: cream }),
      photo({ x: 0.5, y: 0.68, w: 0.84, h: 0.26, fill: gold }),
      mono(`${e.when}  /  ${e.place}`.toUpperCase(), { x: 0.5, y: 0.87, w: 0.9, color: navy }),
      mono(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.94, w: 0.9, color: ink, opacity: 0.7 }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(navy), items: [
      mono(`NO. ${e.num} / ${e.month}`, { x: 0.5, y: 0.07, color: gold }),
      H(e.title.toUpperCase(), { size: fit(e.title, 170, 96, 10), x: 0.5, y: 0.24, w: 0.9, lh: 0.92, color: cream }),
      photo({ x: 0.5, y: 0.54, w: 0.84, h: 0.3, fill: red }),
      rule(0.5, 0.74, 0.84, gold, 0.003),
      B(`${e.day} · ${e.time}\n${e.place}`, { x: 0.5, y: 0.81, w: 0.84, size: 40, color: cream }),
      mono(site(ctx).toUpperCase(), { x: 0.5, y: 0.93, color: gold }),
    ] })]; },
    welcome: (ctx) => [page({ bg: solid(red), items: [
      H('ALL\nARE\nWELCOME', { size: 156, x: 0.5, y: 0.42, w: 0.9, lh: 0.88, color: cream }),
      rule(0.5, 0.77, 0.7, cream, 0.004),
      mono(times(ctx).toUpperCase(), { x: 0.5, y: 0.83, w: 0.9, size: 28, color: cream }),
      mono(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.92, w: 0.9, color: cream, opacity: 0.8 }),
    ] })],
    announce: (ctx) => [page({ bg: solid(cream), items: [
      mono('ANNOUNCEMENT / 01', { x: 0.5, y: 0.08, color: red }),
      H('NEW\nSERIES\nSUNDAY', { size: 160, x: 0.5, y: 0.32, w: 0.9, lh: 0.9, color: navy }),
      photo({ x: 0.5, y: 0.68, w: 0.84, h: 0.24, fill: gold }),
      B('Bring a friend. Every week builds on the last.', { x: 0.5, y: 0.86, w: 0.8, size: 34, color: ink }),
      mono(site(ctx).toUpperCase(), { x: 0.5, y: 0.94, color: red }),
    ] })],
    quote: (ctx) => [page({ bg: solid(gold), items: [
      H(`“${quoteOf(ctx)}”`, { size: fit(quoteOf(ctx), 96, 56, 50), x: 0.5, y: 0.46, w: 0.86, lh: 1.05, color: navy }),
      rule(0.5, 0.74, 0.3, navy, 0.004),
      mono(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.8, w: 0.9, color: navy }),
    ] })],
    verse: () => [page({ bg: solid(navy), items: [
      H('DO NOT\nBE AFRAID', { size: 180, x: 0.5, y: 0.4, w: 0.9, lh: 0.9, color: red }),
      B('for I am with you.', { x: 0.5, y: 0.62, w: 0.8, size: 54, italic: true, color: cream }),
      mono('ISAIAH 41:10', { x: 0.5, y: 0.72, color: gold }),
    ] })],
    series: (ctx) => [page({ bg: solid(cream), items: [
      shape({ x: 0.24, y: 0.5, w: 0.48, h: 1, fill: red }),
      H('HOPE\nIS\nCOMING', { size: 150, x: 0.24, y: 0.46, w: 0.42, lh: 0.88, color: cream }),
      photo({ x: 0.74, y: 0.42, w: 0.4, h: 0.56, fill: gold }),
      mono(`A SERMON SERIES / ${String(ctx.church?.pastor || 'Minister Name').toUpperCase()}`, { x: 0.74, y: 0.8, w: 0.44, color: navy }),
    ] })],
  }[kind];
}

// ------------------------------------------------------------------ Quarterly (after Editorial Forest: considered)
function quarterly(kind) {
  const P = PACKS3.quarterly; const { H, B, photo, rule } = kit(P); const [forest, tan, ink, paper, moss] = P.c;
  const kicker = (t, p) => B(t, { size: 24, weight: 700, letter: 8, color: forest, ...p });
  return {
    eventPost: (ctx) => { const e = ev(ctx); return [page({ bg: solid(paper), items: [
      kicker(`${churchName(ctx).toUpperCase()}  ·  ${e.month} ${e.num}`, { x: 0.5, y: 0.07, w: 0.9 }),
      rule(0.5, 0.11, 0.84, ink, 0.0015),
      H(e.title, { size: fit(e.title, 110, 66, 14), x: 0.08, y: 0.24, w: 0.84, align: 'left', color: ink }),
      photo({ x: 0.5, y: 0.57, w: 0.84, h: 0.4, fill: moss }),
      rule(0.5, 0.82, 0.84, ink, 0.0015),
      B(`${e.when}\n${e.place}`, { x: 0.08, y: 0.89, w: 0.84, align: 'left', size: 30, color: ink }),
    ] })]; },
    eventStory: (ctx) => { const e = ev(ctx); return [page({ bg: solid(forest), items: [
      kicker(`${e.weekday.toUpperCase()} · ${e.time}`, { x: 0.5, y: 0.07, color: tan }),
      H(e.title, { size: fit(e.title, 140, 84, 12), x: 0.5, y: 0.22, w: 0.84, color: paper }),
      photo({ x: 0.5, y: 0.5, w: 0.8, h: 0.32, fill: moss }),
      rule(0.5, 0.71, 0.8, tan, 0.002),
      B(`${e.day}\n${e.place}`, { x: 0.5, y: 0.79, w: 0.8, size: 38, color: paper }),
      B(site(ctx), { x: 0.5, y: 0.92, size: 28, color: tan }),
    ] })]; },
    welcome: (ctx) => [page({ bg: solid(paper), items: [
      kicker('NEW HERE?', { x: 0.08, y: 0.12, w: 0.84, align: 'left' }),
      H('We saved\nyou a seat.', { size: 130, x: 0.08, y: 0.32, w: 0.84, align: 'left', lh: 1.02, color: ink }),
      photo({ x: 0.5, y: 0.66, w: 0.84, h: 0.32, fill: moss }),
      B(times(ctx), { x: 0.08, y: 0.9, w: 0.84, align: 'left', size: 32, color: forest }),
    ] })],
    announce: (ctx) => [page({ bg: solid(paper), items: [
      kicker('NOTES FROM THE CHURCH OFFICE', { x: 0.08, y: 0.08, w: 0.84, align: 'left' }),
      rule(0.5, 0.12, 0.84, ink, 0.0015),
      H('Fall classes\nbegin Sunday', { size: 104, x: 0.08, y: 0.28, w: 0.84, align: 'left', lh: 1.04, color: ink }),
      B('Bible classes for every age, from preschool to adults, 9:30 before worship.', { x: 0.08, y: 0.48, w: 0.7, align: 'left', size: 32, color: ink }),
      photo({ x: 0.5, y: 0.74, w: 0.84, h: 0.3, fill: moss }),
      B(site(ctx), { x: 0.08, y: 0.94, w: 0.84, align: 'left', size: 26, color: forest }),
    ] })],
    quote: (ctx) => [page({ bg: solid(paper), items: [
      rule(0.5, 0.2, 0.84, ink, 0.0015),
      H(quoteOf(ctx), { size: fit(quoteOf(ctx), 84, 52, 60), x: 0.08, y: 0.46, w: 0.84, align: 'left', lh: 1.15, color: ink }),
      rule(0.5, 0.72, 0.84, ink, 0.0015),
      kicker(churchName(ctx).toUpperCase(), { x: 0.08, y: 0.77, w: 0.84, align: 'left' }),
    ] })],
    verse: () => [page({ bg: solid(forest), items: [
      H('Your word is a lamp to my feet and a light to my path.', { size: 96, x: 0.5, y: 0.44, w: 0.8, lh: 1.12, color: paper }),
      rule(0.5, 0.66, 0.1, tan, 0.002),
      kicker('PSALM 119:105', { x: 0.5, y: 0.72, color: tan }),
    ] })],
    series: (ctx) => [page({ bg: solid(paper), items: [
      kicker('A SERMON SERIES  ·  WINTER', { x: 0.08, y: 0.12, w: 0.6, align: 'left' }),
      rule(0.5, 0.17, 0.84, ink, 0.0015),
      H('The Way of Jesus', { size: 150, x: 0.08, y: 0.42, w: 0.56, align: 'left', lh: 1.0, color: ink }),
      B(ctx.church?.pastor || 'Minister Name', { x: 0.08, y: 0.7, w: 0.5, align: 'left', size: 34, color: forest }),
      photo({ x: 0.8, y: 0.56, w: 0.3, h: 0.66, fill: moss }),
    ] })],
  }[kind];
}

const BUILDERS = { sanctuary, table, vesper, daisy, poster, quarterly };
const SETS = [
  ['eventPost', 'post', 'Event post', { event: true, photos: 1 }],
  ['eventStory', 'story', 'Event story', { event: true, photos: 1 }],
  ['welcome', 'post', 'Welcome', { photos: 1 }],
  ['announce', 'post', 'Announcement', { photos: 1 }],
  ['quote', 'post', 'Sermon quote', { photos: 0 }],
  ['verse', 'post', 'Verse', { photos: 0 }],
  ['series', 'presentation', 'Series title slide', { photos: 1 }],
];
export const PACK3_TEMPLATES = Object.entries(PACKS3).flatMap(([id, P]) => SETS.map(([key, kind, label, meta]) => ({
  id: `${id}-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, pack: id, kind, name: `${P.name} ${label.toLowerCase()}`, ...meta,
  build: (ctx) => BUILDERS[id](key)(ctx),
})));
