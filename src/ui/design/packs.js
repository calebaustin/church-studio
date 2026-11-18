// Template packs: five looks for the most common church graphics and a sermon slide deck.
// No stock photos. Photo spots are frames: click one to drop in your own photo, or make it solid.
import { page, shape, text } from './model.js';

export const PACKS = {
  natural: { name: 'Natural', about: 'Earthy greens, cream and soft arches.', c: ['#5E7A5A', '#C8875E', '#2F3A2E', '#F2ECE0', '#A9B79A'], h: 'Georgia', b: 'Avenir Next', hw: 700, up: false, letter: 0, frame: 'arch', radius: 0, accent: 'Georgia', accentItalic: true },
  smooth: { name: 'Smooth', about: 'Calm gradients, rounded shapes and lots of air.', c: ['#6F8FD8', '#B9A6F0', '#1E2547', '#F3F4FB', '#9CD3E0'], h: 'Avenir Next', b: 'Avenir Next', hw: 700, up: false, letter: -1, frame: 'blob', radius: 48, accent: 'Avenir Next', accentItalic: false },
  bold: { name: 'Bold', about: 'Black, white and one loud color. Big type.', c: ['#111214', '#F7C531', '#FFFFFF', '#2A2B2F', '#E9E9E9'], h: 'Montserrat', b: 'Montserrat', hw: 800, up: true, letter: 2, frame: 'rect', radius: 0, accent: 'Montserrat', accentItalic: false },
  youth: { name: 'Youth', about: 'Bright colors, hexagons and a handwritten touch.', c: ['#FF6B35', '#7B2FF7', '#1A1033', '#FFF4E8', '#2EC4B6'], h: 'Montserrat', b: 'Montserrat', hw: 800, up: true, letter: 1, frame: 'hexagon', radius: 0, accent: 'Caveat', accentItalic: false },
  traditional: { name: 'Traditional', about: 'Navy and gold, classic serif type, fine lines.', c: ['#1F3A5F', '#C9A227', '#0F1C2E', '#F7F3EA', '#8A9BB0'], h: 'Baskerville', b: 'Georgia', hw: 600, up: false, letter: 1, frame: 'arch', radius: 0, accent: 'Baskerville', accentItalic: true },
};

const solid = (color) => ({ type: 'solid', color, darken: 0 });
const grad = (from, to, angle = 135) => ({ type: 'gradient', from, to, angle, darken: 0 });
const on = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#111418' : '#FFFFFF'; };

function kit(P, aspect) {
  const H = (t, p) => text({ text: P.up ? t.toUpperCase() : t, font: P.h, weight: P.hw, letter: P.letter, lh: 1.05, ...p });
  const B = (t, p) => text({ text: t, font: P.b, weight: 500, size: 40, lh: 1.35, ...p });
  const A = (t, p) => text({ text: t, font: P.accent, weight: P.accent === 'Caveat' ? 700 : 500, italic: P.accentItalic, size: 70, lh: 1.1, ...p });
  // A photo spot in the pack's shape. h is a fraction of page height, from a width fraction.
  const frame = (p) => shape({ shape: P.frame, frame: true, radius: P.radius, fill: P.c[0], ...p, h: p.h ?? p.w * aspect * (P.frame === 'arch' ? 1.3 : P.frame === 'hexagon' ? 0.87 : 1) });
  const pill = (t, x, y, w, fill, color) => [shape({ x, y, w, h: 0.06, radius: 60, fill }), B(t, { x, y, w, size: 34, weight: 700, color })];
  return { H, B, A, frame, pill };
}

const post = (P) => kit(P, 1080 / 1350);
const story = (P) => kit(P, 1080 / 1920);
const slide = (P) => kit(P, 1920 / 1080);

function welcome(P) {
  const { H, B, A, frame, pill } = post(P);
  const light = P.c[3]; const dark = P.c[2];
  if (P === PACKS.bold) {
    return [page({ bg: solid(P.c[0]), items: [
      frame({ x: 0.5, y: 0.6, w: 0.84, h: 0.5, fill: P.c[3] }),
      H('Welcome home', { size: 132, x: 0.5, y: 0.17, w: 0.9, color: P.c[2] }),
      B('SUNDAYS · 9 & 11 AM', { x: 0.5, y: 0.29, size: 36, weight: 800, letter: 6, color: P.c[1] }),
      shape({ x: 0.5, y: 0.92, w: 1, h: 0.08, fill: P.c[1] }),
      B('CHURCH NAME', { x: 0.5, y: 0.92, size: 32, weight: 800, letter: 8, color: P.c[0] }),
    ] })];
  }
  return [page({ bg: P === PACKS.smooth ? grad(light, '#E3E8FA') : solid(light), items: [
    frame({ x: 0.5, y: 0.38, w: 0.66 }),
    A(P === PACKS.youth ? 'you belong here' : 'welcome', { x: 0.5, y: 0.7, w: 0.8, size: 64, color: P.c[1] }),
    H('Welcome home', { size: 104, x: 0.5, y: 0.78, w: 0.86, color: dark }),
    ...pill('Sundays at 9 & 11', 0.5, 0.9, 0.46, P.c[0], on(P.c[0])),
  ] })];
}

function verse(P) {
  const { H, B, A } = post(P);
  const bg = P === PACKS.bold ? solid(P.c[0]) : P === PACKS.smooth ? grad(P.c[0], P.c[1]) : solid(P.c[2]);
  const ink = P === PACKS.bold ? P.c[2] : '#FFFFFF';
  return [page({ bg, items: [
    ...(P === PACKS.traditional ? [shape({ x: 0.5, y: 0.1, w: 0.2, h: 0.003, fill: P.c[1] }), shape({ x: 0.5, y: 0.9, w: 0.2, h: 0.003, fill: P.c[1] })] : []),
    A(P === PACKS.youth ? 'verse of the week' : 'Verse of the week', { x: 0.5, y: 0.2, w: 0.8, size: P.accent === 'Caveat' ? 66 : 38, color: P.c[1] }),
    H('We love because he first loved us.', { size: 88, x: 0.5, y: 0.47, w: 0.8, lh: 1.15, color: ink }),
    B('1 John 4:19', { x: 0.5, y: 0.72, size: 38, weight: 700, letter: 4, color: P.c[1] }),
  ] })];
}

function eventStory(P) {
  const { H, B, A, frame, pill } = story(P);
  const bg = P === PACKS.bold ? solid(P.c[0]) : P === PACKS.smooth ? grad(P.c[3], '#DCE3F7', 160) : solid(P.c[3]);
  const ink = P === PACKS.bold ? P.c[2] : P.c[2];
  return [page({ bg, items: [
    B(P.up ? 'THIS SATURDAY' : 'This Saturday', { x: 0.5, y: 0.12, size: 40, weight: 700, letter: 6, color: P.c[P === PACKS.bold ? 1 : 0] }),
    H('Family Night', { size: 140, x: 0.5, y: 0.22, w: 0.86, color: ink }),
    A(P === PACKS.youth ? 'bring a friend!' : 'food, games and worship', { x: 0.5, y: 0.31, w: 0.86, size: P.accent === 'Caveat' ? 72 : 44, color: P.c[1] }),
    frame({ x: 0.5, y: 0.6, w: P.frame === 'arch' ? 0.62 : 0.74, fill: P.c[0] }),
    ...pill('6 PM · Fellowship Hall', 0.5, 0.88, 0.62, P.c[P === PACKS.bold ? 1 : 0], P === PACKS.bold ? P.c[0] : on(P.c[0])),
  ] })];
}

function sermonSlides(P) {
  const { H, B, A, frame } = slide(P);
  const dark = P.c[2]; const light = P.c[3];
  const darkBg = P === PACKS.bold ? solid(P.c[0]) : P === PACKS.smooth ? grad(P.c[2], '#2D3A72') : solid(dark);
  const lightBg = P === PACKS.smooth ? grad(light, '#E6EAFB') : solid(P === PACKS.bold ? P.c[4] : light);
  const titleInk = P === PACKS.bold ? P.c[2] : '#FFFFFF';
  return [
    page({ bg: darkBg, items: [
      frame({ x: 0.72, y: 0.5, w: 0.38, h: P.frame === 'arch' ? 0.8 : 0.72, fill: P.c[0] }),
      A(P.accent === 'Caveat' ? 'new series' : 'Sermon series', { x: 0.3, y: 0.26, w: 0.48, align: 'left', size: P.accent === 'Caveat' ? 80 : 40, color: P.c[1] }),
      H('Rooted', { size: 190, x: 0.3, y: 0.46, w: 0.5, align: 'left', color: titleInk }),
      B('Part 1 · Pastor Name', { x: 0.3, y: 0.66, w: 0.5, align: 'left', size: 40, color: titleInk, opacity: 0.85 }),
    ], notes: 'Title slide. Click the photo spot to add your own photo.' }),
    page({ bg: lightBg, items: [
      ...(P === PACKS.traditional ? [shape({ x: 0.5, y: 0.2, w: 0.12, h: 0.004, fill: P.c[1] })] : [shape({ x: 0.08, y: 0.5, w: 0.006, h: 0.46, fill: P.c[1] })]),
      B(P.up ? 'COLOSSIANS 2:6-7' : 'Colossians 2:6-7', { x: P === PACKS.traditional ? 0.5 : 0.47, y: 0.28, w: 0.76, align: P === PACKS.traditional ? 'center' : 'left', size: 44, weight: 700, letter: 4, color: P.c[0] }),
      H('So then, just as you received Christ Jesus as Lord, continue to live your lives in him, rooted and built up in him.', { size: 64, x: P === PACKS.traditional ? 0.5 : 0.47, y: 0.56, w: 0.76, align: P === PACKS.traditional ? 'center' : 'left', lh: 1.3, color: dark, upper: false, text: 'So then, just as you received Christ Jesus as Lord, continue to live your lives in him, rooted and built up in him.' }),
    ], notes: 'Paste the verse text in your translation.' }),
    page({ bg: lightBg, items: [
      H('01', { size: 240, x: 0.18, y: 0.5, w: 0.26, color: P.c[1] }),
      H('Roots grow in hidden places', { size: 92, x: 0.62, y: 0.42, w: 0.6, align: 'left', color: dark }),
      B('What happens in private shapes what we can carry in public.', { size: 44, x: 0.62, y: 0.62, w: 0.6, align: 'left', color: dark, opacity: 0.8 }),
    ], notes: 'First point.' }),
    page({ bg: darkBg, items: [
      frame({ x: 0.27, y: 0.5, w: 0.34, h: P.frame === 'arch' ? 0.78 : 0.66, fill: P.c[1] }),
      A(P.accent === 'Caveat' ? 'remember this' : 'Take this with you', { x: 0.68, y: 0.3, w: 0.52, align: 'left', size: P.accent === 'Caveat' ? 72 : 38, color: P.c[1] }),
      H('“You can’t rush a root.”', { size: 104, x: 0.68, y: 0.52, w: 0.52, align: 'left', lh: 1.1, color: titleInk }),
    ], notes: 'A line people will remember.' }),
    page({ bg: P === PACKS.bold ? solid(P.c[1]) : solid(P.c[0]), items: [
      H('Next steps', { size: 120, x: 0.5, y: 0.26, w: 0.84, align: 'left', color: on(P === PACKS.bold ? P.c[1] : P.c[0]) }),
      B('•  Join a group this week\n•  Read Colossians 2 each morning\n•  Tell one person what you heard', { size: 52, x: 0.5, y: 0.58, w: 0.84, align: 'left', lh: 1.6, color: on(P === PACKS.bold ? P.c[1] : P.c[0]) }),
    ], notes: 'Closing slide.' }),
  ];
}

export const PACK_TEMPLATES = Object.entries(PACKS).flatMap(([id, P]) => [
  { id: `${id}-welcome`, pack: id, kind: 'post', name: `${P.name} welcome`, build: () => welcome(P) },
  { id: `${id}-verse`, pack: id, kind: 'post', name: `${P.name} verse`, build: () => verse(P) },
  { id: `${id}-event`, pack: id, kind: 'story', name: `${P.name} event story`, build: () => eventStory(P) },
  { id: `${id}-sermon`, pack: id, kind: 'presentation', name: `${P.name} sermon slides`, build: () => sermonSlides(P) },
]);
