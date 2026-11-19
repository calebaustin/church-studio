// Design model and drawing for Graphics: single graphics, carousels, stories and slide decks.
// A design has pages; a page has a background and items (text, shapes, images, QR codes).
// Positions are fractions of the page (x, y = center), so pages resize cleanly.
import QRCode from 'qrcode';

export const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- kinds and sizes
export const KINDS = {
  presentation: { label: 'Presentation', w: 1920, h: 1080, multi: true, hint: 'Sermon slides, scripture, announcements' },
  post: { label: 'Social post', w: 1080, h: 1350, hint: 'Quote cards, events, verses' },
  carousel: { label: 'Carousel', w: 1080, h: 1350, multi: true, hint: 'Swipeable posts, sermon recaps' },
  story: { label: 'Story', w: 1080, h: 1920, multi: true, hint: 'Instagram and Facebook stories' },
  thumbnail: { label: 'Thumbnail', w: 1920, h: 1080, hint: 'YouTube video covers' },
  flyer: { label: 'Flyer', w: 1275, h: 1650, hint: 'Letter size, print or share' },
  notes: { label: 'Sermon notes', w: 1275, h: 1650, multi: true, hint: 'Fill-in-the-blank handouts' },
  custom: { label: 'Custom size', w: 1080, h: 1080, multi: true, hint: 'Any size you need' },
};
export const SIZE_PRESETS = [
  ['Square 1:1', 1080, 1080], ['Portrait 4:5', 1080, 1350], ['Story 9:16', 1080, 1920], ['Wide 16:9', 1920, 1080],
  ['Letter', 1275, 1650], ['Half letter', 825, 1275], ['Poster 11x17', 1650, 2550], ['Poster 18x24', 2700, 3600],
  ['Facebook cover', 1640, 924], ['Banner 3:1', 1500, 500],
];

// ---------------------------------------------------------------- colors
const hex2rgb = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
const rgb2hex = (r) => `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** Cohesive palette: multiply each color toward one tint. */
export const cohesive = (colors, tint, amount) => colors.map((c) => {
  if (!amount) return c;
  const a = hex2rgb(c); const t = hex2rgb(tint);
  return rgb2hex(a.map((v, i) => v * (1 - amount) + ((v * t[i]) / 255) * amount));
});
export const luminance = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const onColor = (bg) => (luminance(bg) > 0.45 ? '#111418' : '#FFFFFF');
function seeded(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------------------------------------------------------------- item helpers
export const text = (p) => ({ id: uid(), type: 'text', text: 'Text', x: 0.5, y: 0.5, w: 0.8, size: 64, weight: 700, color: '#FFFFFF', align: 'center', lh: 1.15, ...p });
export const shape = (p) => ({ id: uid(), type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.4, h: 0.2, fill: '#FFFFFF', radius: 0, opacity: 1, ...p });
export const page = (p = {}) => ({ id: uid(), bg: { type: 'mesh', seed: Math.floor(Math.random() * 9999), darken: 0.15 }, items: [], notes: '', ...p });

// ---------------------------------------------------------------- templates
// ctx: { c: colors[5], h: heading font, b: body font, o: sermon outline or null }
const H = (ctx, p) => text({ font: ctx.h, weight: 800, ...p });
const B = (ctx, p) => text({ font: ctx.b, weight: 500, size: 40, lh: 1.35, ...p });
/** Smaller type for longer text, so titles fit their slot. */
const fit = (t, base, min = base * 0.55, room = 26) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const mesh = (seed, darken = 0.15) => ({ type: 'mesh', seed, darken });

function sermonDeck(ctx) {
  const o = ctx.o || {};
  const dark = ctx.c[2]; const light = ctx.c[3] || '#F4EFE6';
  const pages = [
    page({ bg: mesh(11, 0.25), items: [
      B(ctx, { text: (o.sermon ? 'THIS SUNDAY' : 'SERMON SERIES'), size: 34, weight: 700, letter: 8, x: 0.5, y: 0.22, opacity: 0.85 }),
      H(ctx, { text: o.title || 'Sermon Title', size: fit(o.title, 128), x: 0.5, y: 0.5, w: 0.8 }),
      B(ctx, { text: 'Pastor Name · Church Name', size: 38, x: 0.5, y: 0.8, opacity: 0.85 }),
    ] }),
  ];
  const refs = (o.refs?.length ? o.refs.slice(0, 2) : ['John 3:16']);
  for (const ref of refs) {
    pages.push(page({ bg: solid(dark), items: [
      shape({ x: 0.08, y: 0.5, w: 0.006, h: 0.5, fill: ctx.c[1] }),
      H(ctx, { text: ref, size: 64, align: 'left', x: 0.47, y: 0.27, w: 0.74, color: ctx.c[1] }),
      B(ctx, { text: 'Paste the verse text here.', size: 56, weight: 500, align: 'left', x: 0.47, y: 0.52, w: 0.74, lh: 1.4, color: light }),
    ], notes: `Read ${ref}.` }));
  }
  const points = o.points?.length ? o.points : [{ heading: 'First point', line: 'One sentence that explains it.' }, { heading: 'Second point', line: 'One sentence that explains it.' }];
  points.slice(0, 4).forEach((pt, i) => pages.push(page({ bg: solid(light), items: [
    H(ctx, { text: String(i + 1).padStart(2, '0'), size: 220, x: 0.17, y: 0.48, w: 0.25, color: ctx.c[0], opacity: 0.9 }),
    H(ctx, { text: pt.heading, size: fit(pt.heading, 86, 56, 30), align: 'left', x: 0.6, y: 0.4, w: 0.62, color: dark }),
    B(ctx, { text: pt.line, size: 44, align: 'left', x: 0.6, y: 0.62, w: 0.62, color: dark, opacity: 0.8 }),
  ], notes: pt.line })));
  (o.quotes?.length ? o.quotes.slice(0, 2) : ['A line people will remember.']).forEach((q, i) => pages.push(page({ bg: mesh(40 + i, 0.3), items: [
    H(ctx, { text: `“${q.replace(/^“|”$/g, '')}”`, size: fit(q, 92, 60, 50), x: 0.5, y: 0.47, w: 0.78, lh: 1.2 }),
  ] })));
  pages.push(page({ bg: solid(ctx.c[0]), items: [
    H(ctx, { text: 'This week', size: 96, align: 'left', x: 0.5, y: 0.24, w: 0.8, color: onColor(ctx.c[0]) }),
    B(ctx, { text: (o.steps?.length ? o.steps : ['Name one thing to carry differently.', 'Tell one person.', 'Pray every morning.']).map((s) => `•  ${s}`).join('\n'), size: 46, align: 'left', x: 0.5, y: 0.55, w: 0.8, lh: 1.6, color: onColor(ctx.c[0]) }),
  ] }));
  pages.push(page({ bg: mesh(77, 0.3), items: [
    H(ctx, { text: 'Thanks for being here', size: 104, x: 0.5, y: 0.42 }),
    B(ctx, { text: 'Church Name · Sundays at 10am', size: 40, x: 0.5, y: 0.6, opacity: 0.85 }),
  ] }));
  return pages;
}

export const TEMPLATES = [
  // presentations
  { id: 'deck-sermon', kind: 'presentation', name: 'Sermon slides', build: sermonDeck },
  { id: 'deck-scripture', kind: 'presentation', name: 'Scripture slides', build: (ctx) => ['Psalm 23:1', 'Psalm 23:2-3', 'Psalm 23:4'].map((r, i) => page({ bg: solid('#0E1116'), items: [
    B(ctx, { text: 'Paste the verse text here.', size: 64, x: 0.5, y: 0.45, w: 0.8, lh: 1.4, color: '#FFFFFF' }),
    B(ctx, { text: r, size: 40, weight: 700, x: 0.5, y: 0.78, color: ctx.c[1], letter: 2 }),
  ], notes: i === 0 ? 'Change the passage and verse text on each slide.' : '' })) },
  { id: 'deck-announce', kind: 'presentation', name: 'Announcements', build: (ctx) => [
    page({ bg: mesh(5, 0.2), items: [H(ctx, { text: 'Announcements', size: 140, x: 0.5, y: 0.5 })] }),
    ...['Family Night', 'Serve Team Lunch'].map((t, i) => page({ bg: solid(i ? ctx.c[2] : ctx.c[0]), items: [
      B(ctx, { text: i ? 'SUNDAY · 12:15PM' : 'FRIDAY · 6PM', size: 36, weight: 700, letter: 6, align: 'left', x: 0.45, y: 0.3, w: 0.8, color: ctx.c[1] }),
      H(ctx, { text: t, size: 120, align: 'left', x: 0.45, y: 0.46, w: 0.8, color: onColor(i ? ctx.c[2] : ctx.c[0]) }),
      B(ctx, { text: 'One sentence about what it is and who it is for.', size: 44, align: 'left', x: 0.45, y: 0.62, w: 0.8, color: onColor(i ? ctx.c[2] : ctx.c[0]), opacity: 0.85 }),
    ] })),
  ] },
  { id: 'deck-lyrics', kind: 'presentation', name: 'Song lyrics', build: (ctx) => ['Verse 1', 'Chorus', 'Verse 2', 'Bridge'].map((part) => page({ bg: mesh(60, 0.45), items: [
    B(ctx, { text: `${part} line one\n${part} line two`, size: 76, weight: 700, x: 0.5, y: 0.5, w: 0.86, lh: 1.35 }),
  ] })) },
  // single posts
  { id: 'post-quote', kind: 'post', name: 'Quote card', build: (ctx) => [page({ bg: mesh(7, 0.12), items: [
    H(ctx, { text: `“${ctx.o?.quotes?.[0]?.replace(/^“|”$/g, '') || 'Grace is not something you earn. It is something you receive.'}”`, size: 78, x: 0.5, y: 0.44, w: 0.8, lh: 1.2 }),
    B(ctx, { text: 'Pastor Name · Sunday message', size: 34, x: 0.5, y: 0.8, opacity: 0.85 }),
  ] })] },
  { id: 'post-verse', kind: 'post', name: 'Verse of the day', build: (ctx) => [page({ bg: solid(ctx.c[3] || '#F4EFE6'), items: [
    shape({ x: 0.5, y: 0.5, w: 0.86, h: 0.86, fill: '#FFFFFF', radius: 40, opacity: 0.7 }),
    B(ctx, { text: 'VERSE OF THE DAY', size: 30, weight: 700, letter: 6, x: 0.5, y: 0.2, color: ctx.c[0] }),
    H(ctx, { text: 'The Lord is my shepherd; I shall not want.', size: 72, x: 0.5, y: 0.47, w: 0.72, color: ctx.c[2], lh: 1.2 }),
    B(ctx, { text: 'Psalm 23:1', size: 38, weight: 700, x: 0.5, y: 0.76, color: ctx.c[0] }),
  ] })] },
  { id: 'post-event', kind: 'post', name: 'Event', build: (ctx) => [page({ bg: solid(ctx.c[0]), items: [
    H(ctx, { text: ctx.ev?.title || 'Family Night', size: fit(ctx.ev?.title, 120, 80, 18), x: 0.5, y: 0.22, w: 0.85, color: onColor(ctx.c[0]) }),
    B(ctx, { text: ctx.ev ? [ctx.ev.when, ctx.ev.place].filter(Boolean).join(' · ') + (ctx.ev.summary ? `\n${ctx.ev.summary.slice(0, 90)}` : '') : 'Friday, 6pm · Fellowship Hall\nFood, games and worship for all ages.', size: 42, x: 0.5, y: 0.4, w: 0.8, color: onColor(ctx.c[0]) }),
    { id: uid(), type: 'qr', url: ctx.ev?.link || 'https://example.org/signup', x: 0.5, y: 0.68, w: 0.28, color: onColor(ctx.c[0]) },
    B(ctx, { text: 'Scan to sign up', size: 34, weight: 700, x: 0.5, y: 0.89, color: onColor(ctx.c[0]) }),
  ] })] },
  { id: 'post-welcome', kind: 'post', name: 'New here?', build: (ctx) => [page({ bg: mesh(31, 0.1), items: [
    H(ctx, { text: 'New here?', size: 150, x: 0.5, y: 0.38 }),
    B(ctx, { text: 'We saved you a seat. Sundays at 9 and 11.', size: 46, x: 0.5, y: 0.56, w: 0.75 }),
    shape({ x: 0.5, y: 0.74, w: 0.46, h: 0.075, fill: '#FFFFFF', radius: 60 }),
    B(ctx, { text: 'Plan a visit', size: 38, weight: 700, x: 0.5, y: 0.74, color: ctx.c[2] }),
  ] })] },
  // carousels
  { id: 'car-recap', kind: 'carousel', name: 'Sermon recap', build: (ctx) => {
    const o = ctx.o || {};
    const pts = o.points?.length ? o.points.slice(0, 4) : [{ heading: 'First point', line: 'One sentence.' }, { heading: 'Second point', line: 'One sentence.' }, { heading: 'Third point', line: 'One sentence.' }];
    return [
      page({ bg: mesh(9, 0.2), items: [B(ctx, { text: 'SUNDAY RECAP', size: 34, weight: 700, letter: 8, x: 0.5, y: 0.22 }), H(ctx, { text: o.title || 'Sermon Title', size: fit(o.title, 104), x: 0.5, y: 0.5, w: 0.84 }), B(ctx, { text: 'Swipe →', size: 36, x: 0.5, y: 0.85, opacity: 0.8 })] }),
      ...pts.map((p, i) => page({ bg: solid(ctx.c[3] || '#F4EFE6'), items: [
        H(ctx, { text: String(i + 1), size: 180, x: 0.5, y: 0.22, color: ctx.c[0] }),
        H(ctx, { text: p.heading, size: fit(p.heading, 76, 52, 30), x: 0.5, y: 0.45, w: 0.82, color: ctx.c[2] }),
        B(ctx, { text: p.line, size: 42, x: 0.5, y: 0.64, w: 0.8, color: ctx.c[2], opacity: 0.85 }),
      ] })),
      page({ bg: solid(ctx.c[0]), items: [H(ctx, { text: 'Watch the full message', size: 88, x: 0.5, y: 0.44, w: 0.8, color: onColor(ctx.c[0]) }), B(ctx, { text: 'Link in bio', size: 40, x: 0.5, y: 0.6, color: onColor(ctx.c[0]) })] }),
    ];
  } },
  { id: 'car-quotes', kind: 'carousel', name: 'Quotes from Sunday', build: (ctx) => (ctx.o?.quotes?.length ? ctx.o.quotes.slice(0, 5) : ['A line people will remember.', 'Another line worth sharing.', 'One more line from the message.'])
    .map((q, i) => page({ bg: mesh(100 + i * 7, 0.15), items: [H(ctx, { text: `“${q}”`, size: 74, x: 0.5, y: 0.46, w: 0.8, lh: 1.2 }), B(ctx, { text: `${i + 1}`, size: 30, weight: 700, x: 0.5, y: 0.88, opacity: 0.7 })] })) },
  // stories
  { id: 'story-recap', kind: 'story', name: 'Story recap', build: (ctx) => [
    page({ bg: mesh(14, 0.2), items: [B(ctx, { text: 'THIS SUNDAY', size: 40, weight: 700, letter: 8, x: 0.5, y: 0.3 }), H(ctx, { text: ctx.o?.title || 'Sermon Title', size: fit(ctx.o?.title, 120), x: 0.5, y: 0.5, w: 0.84 })] }),
    ...(ctx.o?.quotes?.length ? ctx.o.quotes.slice(0, 2) : ['A line people will remember.']).map((q, i) => page({ bg: solid(i % 2 ? ctx.c[2] : ctx.c[0]), items: [H(ctx, { text: `“${q}”`, size: 84, x: 0.5, y: 0.48, w: 0.82, color: onColor(i % 2 ? ctx.c[2] : ctx.c[0]), lh: 1.2 })] })),
    page({ bg: mesh(22, 0.25), items: [H(ctx, { text: 'Watch the full message', size: 100, x: 0.5, y: 0.45, w: 0.8 }), shape({ x: 0.5, y: 0.6, w: 0.5, h: 0.05, fill: '#FFFFFF', radius: 60 }), B(ctx, { text: 'Link in bio', size: 40, weight: 700, x: 0.5, y: 0.6, color: ctx.c[2] })] }),
  ] },
  { id: 'story-event', kind: 'story', name: 'Event countdown', build: (ctx) => [page({ bg: mesh(55, 0.2), items: [
    B(ctx, { text: ctx.ev?.countdown || '3 DAYS TO GO', size: 46, weight: 700, letter: 8, x: 0.5, y: 0.3 }),
    H(ctx, { text: ctx.ev?.title || 'Easter at Church Name', size: fit(ctx.ev?.title, 128, 84, 20), x: 0.5, y: 0.46, w: 0.84 }),
    B(ctx, { text: ctx.ev?.when || 'Sunday · 9am and 11am', size: 46, x: 0.5, y: 0.62, w: 0.84 }),
  ] })] },
  // video intro and outro cards (export as PNG, then pick them in a clip's Graphics tab)
  { id: 'intro-vertical', kind: 'story', name: 'Clip intro card', build: (ctx) => [page({ bg: mesh(21, 0.3), items: [
    B(ctx, { text: 'SERMON SERIES', size: 40, weight: 700, letter: 8, x: 0.5, y: 0.4, opacity: 0.85 }),
    H(ctx, { text: ctx.o?.title || 'Series Title', size: fit(ctx.o?.title, 150, 90, 14), x: 0.5, y: 0.5, w: 0.84 }),
    shape({ x: 0.5, y: 0.59, w: 0.14, h: 0.004, fill: ctx.c[1] }),
  ] })] },
  { id: 'outro-vertical', kind: 'story', name: 'Clip end card', build: (ctx) => [page({ bg: solid(ctx.c[0]), items: [
    H(ctx, { text: 'Join us Sunday', size: 120, x: 0.5, y: 0.44, w: 0.84, color: onColor(ctx.c[0]) }),
    B(ctx, { text: '9 & 11 AM · yourchurch.org', size: 44, x: 0.5, y: 0.56, w: 0.84, color: onColor(ctx.c[0]), opacity: 0.9 }),
  ] })] },
  { id: 'intro-wide', kind: 'presentation', name: 'Video intro (16:9)', build: (ctx) => [page({ bg: mesh(33, 0.3), items: [
    B(ctx, { text: 'SERMON SERIES', size: 40, weight: 700, letter: 8, x: 0.5, y: 0.36, opacity: 0.85 }),
    H(ctx, { text: ctx.o?.title || 'Series Title', size: fit(ctx.o?.title, 150, 90, 20), x: 0.5, y: 0.52, w: 0.84 }),
  ] })] },
  // thumbnails
  { id: 'thumb-sermon', kind: 'thumbnail', name: 'Sermon thumbnail', build: (ctx) => [page({ bg: mesh(3, 0.25), items: [
    H(ctx, { text: ctx.o?.title || 'You Can’t Earn This', size: fit(ctx.o?.title, 130, 76, 22), align: 'left', x: 0.34, y: 0.42, w: 0.6 }),
    B(ctx, { text: 'SUNDAY MESSAGE', size: 40, weight: 700, letter: 4, align: 'left', x: 0.34, y: 0.72, w: 0.6, opacity: 0.85 }),
  ] })] },
  { id: 'thumb-bold', kind: 'thumbnail', name: 'Bold title', build: (ctx) => [page({ bg: solid(ctx.c[1]), items: [
    shape({ x: 0.75, y: 0.5, w: 0.5, h: 1, fill: ctx.c[2] }),
    H(ctx, { text: 'Rooted', size: 210, align: 'left', x: 0.32, y: 0.45, w: 0.56, color: onColor(ctx.c[1]) }),
    B(ctx, { text: 'PART 1', size: 44, weight: 700, letter: 6, align: 'left', x: 0.32, y: 0.66, w: 0.56, color: onColor(ctx.c[1]) }),
  ] })] },
  // print
  { id: 'flyer-event', kind: 'flyer', name: 'Event flyer', build: (ctx) => [page({ bg: solid(ctx.c[3] || '#F4EFE6'), items: [
    shape({ x: 0.5, y: 0.22, w: 1, h: 0.44, fill: ctx.c[0] }),
    H(ctx, { text: ctx.ev?.title || 'Fall Festival', size: fit(ctx.ev?.title, 150, 90, 16), x: 0.5, y: 0.2, w: 0.86, color: onColor(ctx.c[0]) }),
    B(ctx, { text: ctx.ev?.when || 'Saturday, October 18 · 2 to 5pm', size: 50, weight: 700, x: 0.5, y: 0.52, w: 0.86, color: ctx.c[2] }),
    B(ctx, { text: ctx.ev ? (ctx.ev.summary?.slice(0, 120) || ctx.ev.place || 'Everyone is welcome.') : 'Games, food trucks, hayrides and a pie contest. Bring a friend.', size: 42, x: 0.5, y: 0.62, w: 0.76, color: ctx.c[2] }),
    { id: uid(), type: 'qr', url: ctx.ev?.link || 'https://example.org', x: 0.5, y: 0.8, w: 0.18, color: ctx.c[2] },
    B(ctx, { text: ctx.ev?.place || 'Church Name · 123 Main St', size: 34, x: 0.5, y: 0.93, color: ctx.c[2], opacity: 0.8 }),
  ] })] },
  { id: 'notes-blanks', kind: 'notes', name: 'Fill-in notes', build: (ctx) => {
    const o = ctx.o || {};
    const pts = o.points?.length ? o.points : [{ heading: 'First point' }, { heading: 'Second point' }, { heading: 'Third point' }];
    const blank = (h) => { const w = h.split(' '); const k = w.reduce((best, x, i) => (x.length > w[best].length ? i : best), 0); w[k] = '_'.repeat(Math.max(8, w[k].length + 2)); return w.join(' '); };
    return [page({ bg: solid('#FFFFFF'), items: [
      H(ctx, { text: o.title || 'Sermon Title', size: 64, align: 'left', x: 0.5, y: 0.08, w: 0.84, color: '#111418' }),
      B(ctx, { text: `${o.refs?.[0] || 'Passage'} · ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`, size: 28, align: 'left', x: 0.5, y: 0.13, w: 0.84, color: ctx.c[0] }),
      shape({ x: 0.5, y: 0.16, w: 0.84, h: 0.002, fill: '#D0D4DA' }),
      ...pts.slice(0, 4).flatMap((p, i) => [
        B(ctx, { text: `${i + 1}. ${blank(p.heading)}`, size: 34, weight: 700, align: 'left', x: 0.5, y: 0.22 + i * 0.17, w: 0.84, color: '#111418' }),
        ...[0, 1, 2].map((k) => shape({ x: 0.5, y: 0.27 + i * 0.17 + k * 0.035, w: 0.8, h: 0.0015, fill: '#D0D4DA' })),
      ]),
    ] })];
  } },
];

export const blankPage = (kind, ctx) => page({ bg: kind === 'notes' || kind === 'flyer' ? solid('#FFFFFF') : mesh(Math.floor(Math.random() * 999), 0.15) });

// ---------------------------------------------------------------- drawing
/**
 * Break text into lines that fit. Each paragraph is then balanced so it never ends with one word
 * alone on its last line: words move down from the line above while they still fit.
 */
function wrap(ctx, str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    const lines = [];
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    for (let guard = 0; guard < 3 && lines.length >= 2; guard++) {
      const last = lines[lines.length - 1].split(' ');
      const prev = lines[lines.length - 2].split(' ');
      if (last.length > 1 || prev.length < 3) break;
      const moved = `${prev[prev.length - 1]} ${last.join(' ')}`;
      if (ctx.measureText(moved).width > maxW) break;
      lines[lines.length - 2] = prev.slice(0, -1).join(' ');
      lines[lines.length - 1] = moved;
    }
    out.push(...lines);
  }
  return out;
}

function drawMesh(ctx, W, H, colors, seed) {
  const rnd = seeded(seed);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, W, H);
  const off = document.createElement('canvas');
  off.width = Math.max(8, Math.ceil(W / 4)); off.height = Math.max(8, Math.ceil(H / 4));
  const o = off.getContext('2d');
  o.fillStyle = colors[0]; o.fillRect(0, 0, off.width, off.height);
  colors.forEach((c, i) => {
    for (let k = 0; k < 2; k++) {
      const x = rnd() * off.width; const y = rnd() * off.height; const r = (0.45 + rnd() * 0.5) * Math.max(off.width, off.height);
      const g = o.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c); g.addColorStop(1, `${c}00`);
      o.globalAlpha = i === 0 ? 0.6 : 0.85;
      o.fillStyle = g; o.fillRect(0, 0, off.width, off.height);
    }
  });
  ctx.save();
  ctx.filter = `blur(${Math.max(1, Math.round(Math.max(W, H) / 40))}px)`;
  ctx.drawImage(off, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
  ctx.restore();
}

const fontCss = (f) => (f ? `'${String(f).replace(/^'|'$/g, '')}'` : "'Montserrat'");
const libUrl = (rel) => `/library/${rel.split('/').map(encodeURIComponent).join('/')}`;
export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
const qrKey = (it) => `qr:${it.url}:${it.color}`;
const svgKey = (it) => `svg:${it.rel}:${JSON.stringify(it.recolor)}`;

// ---------------------------------------------------------------- SVG colors
const COLOR_RE = /((?:fill|stroke|stop-color|color)\s*[:=]\s*["']?)(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/g;
const normColor = (c) => {
  const v = c.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v.slice(1).split('').map((x) => x + x).join('')}`;
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(0, 7);
  const m = v.match(/^rgba?\(([^)]*)\)/);
  if (m) { const [r, g, b] = m[1].split(',').map((x) => parseFloat(x)); return `#${[r, g, b].map((n) => Math.round(n || 0).toString(16).padStart(2, '0')).join('')}`; }
  return v;
};
async function svgText(rel, cache) {
  const k = `svgtext:${rel}`;
  if (!(k in cache)) cache[k] = await fetch(libUrl(rel)).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  return cache[k];
}
/** The distinct colors an SVG uses, most used first. One with no colors draws in black. */
export async function svgColors(rel, cache) {
  const txt = await svgText(rel, cache);
  if (!txt) return [];
  const count = new Map();
  for (const m of txt.matchAll(COLOR_RE)) { const c = normColor(m[2]); count.set(c, (count.get(c) || 0) + 1); }
  if (!count.size) return ['#000000'];
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 8);
}
export function recolorSvg(txt, map) {
  let out = txt.replace(COLOR_RE, (all, pre, c) => (map[normColor(c)] ? `${pre}${map[normColor(c)]}` : all));
  if (map['#000000'] && !COLOR_RE.test(txt)) out = out.replace(/<svg\b/i, `<svg fill="${map['#000000']}"`);
  COLOR_RE.lastIndex = 0;
  return out;
}

// ---------------------------------------------------------------- shapes, photo frames and devices
export const SHAPES = [
  ['rect', 'Square'], ['ellipse', 'Circle'], ['hexagon', 'Hexagon'], ['arch', 'Arch'], ['blob', 'Blob'], ['iphone', 'iPhone'], ['macbook', 'MacBook'],
];
export const DEVICE_ASPECT = { iphone: 0.49, macbook: 1.55 }; // width / height
function shapePath(ctx, kind, x, y, w, h, r) {
  ctx.beginPath();
  if (kind === 'ellipse') { ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  if (kind === 'hexagon') {
    const pts = [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]];
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * w, y + py * h) : ctx.moveTo(x + px * w, y + py * h)));
    ctx.closePath(); return;
  }
  if (kind === 'arch') {
    const rr = Math.min(w / 2, h);
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + rr); ctx.arc(x + w / 2, y + rr, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); return;
  }
  if (kind === 'blob') {
    const p = [[0.5, 0.02], [0.9, 0.18], [0.98, 0.6], [0.7, 0.97], [0.25, 0.92], [0.03, 0.55], [0.15, 0.15]].map(([px, py]) => [x + px * w, y + py * h]);
    ctx.moveTo((p[0][0] + p[6][0]) / 2, (p[0][1] + p[6][1]) / 2);
    for (let i = 0; i < p.length; i++) { const a = p[i]; const b = p[(i + 1) % p.length]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    ctx.closePath(); return;
  }
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.roundRect ? ctx.roundRect(x, y, w, h, rr) : ctx.rect(x, y, w, h);
}
function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * r) / 2, y + (h - img.height * r) / 2, img.width * r, img.height * r);
}
/** An empty photo spot: soft stripes and a small picture icon, shown only while editing. */
function drawPlaceholder(ctx, x, y, w, h, color) {
  ctx.save(); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = Math.max(2, w / 60);
  for (let d = -h; d < w; d += Math.max(10, w / 9)) { ctx.beginPath(); ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); ctx.stroke(); }
  const s = Math.min(w, h) * 0.22; const cx = x + w / 2; const cy = y + h / 2;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.roundRect(cx - s / 2, cy - s * 0.38, s, s * 0.76, s * 0.12); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx - s * 0.4, cy + s * 0.28); ctx.lineTo(cx - s * 0.1, cy - s * 0.06); ctx.lineTo(cx + s * 0.1, cy + s * 0.12); ctx.lineTo(cx + s * 0.22, cy); ctx.lineTo(cx + s * 0.4, cy + s * 0.28); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s * 0.2, cy - s * 0.16, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
/** Fill a shape: a photo, an empty photo spot, or a solid color. */
function fillShape(ctx, it, kind, x, y, w, h, r, cache, placeholders) {
  shapePath(ctx, kind, x, y, w, h, r);
  const img = it.photo ? cache[it.photo] : null;
  if (img) { ctx.save(); ctx.clip(); drawCover(ctx, img, x, y, w, h); ctx.restore(); }
  else if (it.frame && placeholders) drawPlaceholder(ctx, x, y, w, h, it.fill || '#8A94A6');
  else { ctx.fillStyle = it.fill || '#FFFFFF'; ctx.fill(); }
}
function drawDevice(ctx, it, x, y, w, h, cache, placeholders) {
  if (it.shape === 'iphone') {
    ctx.fillStyle = '#121316'; shapePath(ctx, 'rect', x, y, w, h, w * 0.17); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = Math.max(1, w * 0.008); ctx.stroke();
    const b = w * 0.04;
    fillShape(ctx, it, 'rect', x + b, y + b, w - 2 * b, h - 2 * b, w * 0.135, cache, placeholders);
    ctx.fillStyle = '#121316'; shapePath(ctx, 'rect', x + w * 0.35, y + b + h * 0.018, w * 0.3, h * 0.03, h * 0.015); ctx.fill();
    return;
  }
  const lidH = h * 0.92; const lidX = x + w * 0.07; const lidW = w * 0.86;
  ctx.fillStyle = '#1B1C1F'; shapePath(ctx, 'rect', lidX, y, lidW, lidH, w * 0.025); ctx.fill();
  const b = w * 0.018;
  fillShape(ctx, it, 'rect', lidX + b, y + b, lidW - 2 * b, lidH - 2 * b * 1.4, w * 0.008, cache, placeholders);
  ctx.fillStyle = '#1B1C1F'; shapePath(ctx, 'rect', x + w * 0.46, y + b, w * 0.08, h * 0.022, h * 0.008); ctx.fill();
  const g = ctx.createLinearGradient(0, y + lidH, 0, y + h);
  g.addColorStop(0, '#D7DADF'); g.addColorStop(1, '#9EA3AB');
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(x, y + lidH); ctx.lineTo(x + w, y + lidH); ctx.lineTo(x + w * 0.985, y + h); ctx.lineTo(x + w * 0.015, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)'; shapePath(ctx, 'rect', x + w * 0.43, y + lidH, w * 0.14, (h - lidH) * 0.35, (h - lidH) * 0.2); ctx.fill();
}

/** Load photos, logos and QR codes a page needs into the cache. */
export async function loadAssets(pg, cache) {
  const need = [...(pg.bg?.type === 'image' && pg.bg.image ? [pg.bg.image] : []), ...pg.items.filter((i) => i.type === 'image').map((i) => i.rel),
    ...pg.items.filter((i) => i.type === 'shape' && i.photo).map((i) => i.photo)];
  for (const rel of need) if (!(rel in cache)) cache[rel] = await loadImage(libUrl(rel)).catch(() => null);
  // SVGs with changed colors: rewrite the file's colors and draw that version.
  for (const it of pg.items.filter((i) => i.type === 'image' && /\.svg$/i.test(i.rel) && i.recolor && Object.keys(i.recolor).length)) {
    const key = svgKey(it);
    if (key in cache) continue;
    const txt = await svgText(it.rel, cache);
    cache[key] = txt ? await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolorSvg(txt, it.recolor))}`).catch(() => null) : null;
  }
  for (const it of pg.items.filter((i) => i.type === 'qr' && i.url)) {
    const key = qrKey(it);
    if (!(key in cache)) cache[key] = await loadImage(await QRCode.toDataURL(it.url, { margin: 1, width: 600, color: { dark: it.color || '#000000', light: '#00000000' } })).catch(() => null);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, rr) : ctx.rect(x, y, w, h);
}

/**
 * Draw a page. Returns each item's box in page fractions {x0, y0, x1, y1}, used for selection,
 * snapping and inline editing. `skip` hides one item (while it is edited in place).
 */
export function renderPage(canvas, doc, pg, scale, cache, { skip, placeholders = true } = {}) {
  const W = Math.max(1, Math.round(doc.size.w * scale)); const H = Math.max(1, Math.round(doc.size.h * scale));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const colors = cohesive(doc.palette || ['#2B7F5F', '#D9A441', '#1B2440', '#F4EFE6', '#8FB8A8'], doc.tint?.color || '#FF9A62', doc.tint?.amount || 0);
  const bg = pg.bg || {};
  if (bg.type === 'solid') { ctx.fillStyle = bg.color || colors[0]; ctx.fillRect(0, 0, W, H); }
  else if (bg.type === 'gradient') {
    const a = ((bg.angle ?? 135) * Math.PI) / 180; const r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    g.addColorStop(0, bg.from || colors[0]); g.addColorStop(1, bg.to || colors[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'image' && cache[bg.image]) {
    const img = cache[bg.image];
    const r = Math.max(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * r) / 2, (H - img.height * r) / 2, img.width * r, img.height * r);
  } else drawMesh(ctx, W, H, bg.colors || colors, bg.seed || 1);
  if (bg.darken) { ctx.fillStyle = `rgba(0,0,0,${bg.darken})`; ctx.fillRect(0, 0, W, H); }

  const boxes = {};
  const k = scale;
  for (const it of pg.items) {
    ctx.save();
    ctx.globalAlpha = it.opacity ?? 1;
    if (it.type === 'shape') {
      const w = it.w * W; const h = it.h * H; const x = it.x * W - w / 2; const y = it.y * H - h / 2;
      // An eraser cuts through everything drawn under it, background included.
      if (it.erase) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; shapePath(ctx, it.shape, x, y, w, h, (it.radius || 0) * k); ctx.fill(); }
      else if (DEVICE_ASPECT[it.shape]) drawDevice(ctx, it, x, y, w, h, cache, placeholders);
      else fillShape(ctx, it, it.shape, x, y, w, h, (it.radius || 0) * k, cache, placeholders);
      boxes[it.id] = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - it.h / 2, y1: it.y + it.h / 2 };
    } else if (it.type === 'image' || it.type === 'qr') {
      const img = it.type === 'qr' ? cache[qrKey(it)] : (it.recolor && cache[svgKey(it)]) || cache[it.rel];
      const w = it.w * W; const h = img ? (img.height / img.width) * w : w;
      const x = it.x * W - w / 2; const y = it.y * H - h / 2;
      if (img && it.id !== skip) {
        if (it.radius) { roundRect(ctx, x, y, w, h, it.radius * k); ctx.clip(); }
        ctx.drawImage(img, x, y, w, h);
      }
      boxes[it.id] = { x0: x / W, x1: (x + w) / W, y0: y / H, y1: (y + h) / H };
    } else if (it.type === 'text') {
      ctx.font = `${it.italic ? 'italic ' : ''}${it.weight || 600} ${it.size * k}px ${fontCss(it.font)}`;
      ctx.fillStyle = it.color || '#FFFFFF';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(it.letter || 0) * k}px`;
      const boxW = it.w * W;
      const lines = wrap(ctx, it.upper ? it.text.toUpperCase() : it.text, boxW);
      const lh = it.size * k * (it.lh || 1.15);
      const h = Math.max(lh, lines.length * lh);
      const top = it.y * H - h / 2;
      const left = it.x * W - boxW / 2;
      ctx.textAlign = it.align || 'center';
      const tx = it.align === 'left' ? left : it.align === 'right' ? left + boxW : it.x * W;
      if (it.id !== skip) lines.forEach((l, i) => ctx.fillText(l, tx, top + lh * (i + 0.5)));
      boxes[it.id] = { x0: left / W, x1: (left + boxW) / W, y0: top / H, y1: (top + h) / H };
    }
    ctx.restore();
  }
  return boxes;
}

/** Fully drawn page as a data URL (for export and thumbnails). */
export async function pageDataUrl(doc, pg, scale, cache, type = 'image/png', quality) {
  await loadAssets(pg, cache);
  await document.fonts.ready;
  const c = document.createElement('canvas');
  renderPage(c, doc, pg, scale, cache, { placeholders: false });
  return c.toDataURL(type, quality);
}

// ---------------------------------------------------------------- one design, many sizes
export const RESIZE_TARGETS = [
  ['post', 'Social post', 1080, 1350], ['square', 'Square post', 1080, 1080], ['story', 'Story or reel', 1080, 1920],
  ['presentation', 'Slide', 1920, 1080], ['thumbnail', 'YouTube thumbnail', 1920, 1080], ['facebook', 'Facebook cover', 1640, 924],
  ['flyer', 'Flyer (letter)', 1275, 1650], ['banner', 'Banner 3:1', 1500, 500],
];
const KIND_FOR = { post: 'post', square: 'custom', story: 'story', presentation: 'presentation', thumbnail: 'thumbnail', facebook: 'custom', flyer: 'flyer', banner: 'custom' };

/**
 * A copy of a design at a new size. Positions are fractions of the page, so the layout carries over;
 * type is scaled for the new space, and shapes keep their proportions unless they span the page.
 */
export function resizeDesign(doc, target) {
  const [key, label, W2, H2] = target;
  const { w: W1, h: H1 } = doc.size;
  const kText = Math.min(Math.sqrt((W2 * H2) / (W1 * H1)), (W2 / W1) * 1.15);
  const copy = JSON.parse(JSON.stringify(doc));
  copy.id = uid();
  copy.name = `${doc.name} · ${label}`;
  copy.kind = KIND_FOR[key] || 'custom';
  copy.size = { w: W2, h: H2 };
  copy.thumb = null;
  for (const pg of copy.pages) {
    pg.id = uid();
    for (const it of pg.items) {
      it.id = uid();
      if (it.type === 'text') { it.size = Math.max(10, Math.round(it.size * kText)); if (it.letter) it.letter = +(it.letter * kText).toFixed(1); }
      if (it.type === 'shape' && it.w < 0.95 && it.h < 0.95) {
        const h2 = (it.h * H1 * W2) / (W1 * H2);
        it.h = +Math.min(0.98, h2).toFixed(4);
      }
      if (it.radius) it.radius = Math.round(it.radius * kText);
    }
  }
  return copy;
}

/** A countdown story set for an event: one page for each day left, ending on the day itself. */
export function countdownPages(ctx, ev) {
  const marks = [['7', 'DAYS TO GO'], ['3', 'DAYS TO GO'], ['1', 'MORE DAY'], ['TODAY', '']];
  return marks.map(([big, small], i) => page({ bg: i === 3 ? { type: 'solid', color: ctx.c[0], darken: 0 } : { type: 'mesh', seed: 55 + i * 9, darken: 0.25 }, items: [
    H(ctx, { text: big, size: big.length > 2 ? 200 : 420, x: 0.5, y: 0.36, color: i === 3 ? onColor(ctx.c[0]) : '#FFFFFF' }),
    ...(small ? [B(ctx, { text: small, size: 56, weight: 800, letter: 8, x: 0.5, y: 0.52 })] : []),
    H(ctx, { text: ev?.title || 'Event name', size: fit(ev?.title, 96, 60, 20), x: 0.5, y: 0.68, w: 0.84, color: i === 3 ? onColor(ctx.c[0]) : '#FFFFFF' }),
    B(ctx, { text: ev?.when || 'Day · time', size: 42, x: 0.5, y: 0.78, w: 0.84, color: i === 3 ? onColor(ctx.c[0]) : '#FFFFFF', opacity: 0.9 }),
  ] }));
}

/** A branded scripture graphic: the verse large, the reference beneath, the translation small. */
export function scripturePage(ctx, { ref, verse, translation = '' }, look = 'calm') {
  const dark = ctx.c[2]; const light = ctx.c[3] || '#F4EFE6'; const accent = ctx.c[1];
  const quote = `“${String(verse || 'Paste the verse here.').trim().replace(/^“|”$/g, '')}”`;
  if (look === 'bold') {
    return page({ bg: solid(dark), items: [
      shape({ x: 0.5, y: 0.14, w: 0.12, h: 0.008, fill: accent }),
      H(ctx, { text: quote, size: fit(quote, 84, 48, 60), x: 0.5, y: 0.47, w: 0.82, lh: 1.2, color: '#FFFFFF' }),
      B(ctx, { text: ref || 'Reference', size: 44, weight: 800, letter: 3, x: 0.5, y: 0.8, color: accent }),
      ...(translation ? [B(ctx, { text: translation.toUpperCase(), size: 24, weight: 700, letter: 4, x: 0.5, y: 0.86, color: '#FFFFFF', opacity: 0.6 })] : []),
    ] });
  }
  return page({ bg: solid(light), items: [
    shape({ x: 0.5, y: 0.5, w: 0.86, h: 0.86, fill: '#FFFFFF', radius: 40, opacity: 0.7 }),
    B(ctx, { text: 'SCRIPTURE', size: 28, weight: 700, letter: 8, x: 0.5, y: 0.17, color: ctx.c[0] }),
    H(ctx, { text: quote, size: fit(quote, 76, 44, 60), x: 0.5, y: 0.47, w: 0.72, lh: 1.25, color: dark }),
    B(ctx, { text: ref || 'Reference', size: 40, weight: 700, x: 0.5, y: 0.77, color: ctx.c[0] }),
    ...(translation ? [B(ctx, { text: translation.toUpperCase(), size: 22, weight: 700, letter: 4, x: 0.5, y: 0.82, color: dark, opacity: 0.55 })] : []),
  ] });
}
