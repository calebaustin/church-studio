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
  ['Letter', 1275, 1650], ['Facebook cover', 1640, 924], ['Banner 3:1', 1500, 500],
];

// ---------------------------------------------------------------- colors
const hex2rgb = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
const rgb2hex = (r) => `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** Cohesive palette: multiply each color toward one tint (the cohesive-colors idea, BSD). */
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
    H(ctx, { text: 'Family Night', size: 120, x: 0.5, y: 0.22, w: 0.85, color: onColor(ctx.c[0]) }),
    B(ctx, { text: 'Friday, 6pm · Fellowship Hall\nFood, games and worship for all ages.', size: 42, x: 0.5, y: 0.4, w: 0.8, color: onColor(ctx.c[0]) }),
    { id: uid(), type: 'qr', url: 'https://example.org/signup', x: 0.5, y: 0.68, w: 0.28, color: onColor(ctx.c[0]) },
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
    B(ctx, { text: '3 DAYS TO GO', size: 46, weight: 700, letter: 8, x: 0.5, y: 0.3 }),
    H(ctx, { text: 'Easter at Church Name', size: 128, x: 0.5, y: 0.46, w: 0.84 }),
    B(ctx, { text: 'Sunday · 9am and 11am', size: 46, x: 0.5, y: 0.62 }),
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
    H(ctx, { text: 'Fall Festival', size: 150, x: 0.5, y: 0.2, w: 0.86, color: onColor(ctx.c[0]) }),
    B(ctx, { text: 'Saturday, October 18 · 2 to 5pm', size: 50, weight: 700, x: 0.5, y: 0.52, w: 0.86, color: ctx.c[2] }),
    B(ctx, { text: 'Games, food trucks, hayrides and a pie contest. Bring a friend.', size: 42, x: 0.5, y: 0.62, w: 0.76, color: ctx.c[2] }),
    { id: uid(), type: 'qr', url: 'https://example.org', x: 0.5, y: 0.8, w: 0.18, color: ctx.c[2] },
    B(ctx, { text: 'Church Name · 123 Main St', size: 34, x: 0.5, y: 0.93, color: ctx.c[2], opacity: 0.8 }),
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
function wrap(ctx, str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
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

/** Load photos, logos and QR codes a page needs into the cache. */
export async function loadAssets(pg, cache) {
  const need = [...(pg.bg?.type === 'image' && pg.bg.image ? [pg.bg.image] : []), ...pg.items.filter((i) => i.type === 'image').map((i) => i.rel)];
  for (const rel of need) if (!(rel in cache)) cache[rel] = await loadImage(libUrl(rel)).catch(() => null);
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
export function renderPage(canvas, doc, pg, scale, cache, { skip } = {}) {
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
      ctx.fillStyle = it.fill || '#FFFFFF';
      if (it.shape === 'ellipse') { ctx.beginPath(); ctx.ellipse(it.x * W, it.y * H, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
      else { roundRect(ctx, x, y, w, h, (it.radius || 0) * k); ctx.fill(); }
      boxes[it.id] = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - it.h / 2, y1: it.y + it.h / 2 };
    } else if (it.type === 'image' || it.type === 'qr') {
      const img = it.type === 'qr' ? cache[qrKey(it)] : cache[it.rel];
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
  renderPage(c, doc, pg, scale, cache);
  return c.toDataURL(type, quality);
}
