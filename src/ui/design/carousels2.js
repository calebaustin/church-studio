// Ten more carousels, in looks churches use a lot right now: a sky-blue "why we gather", gritty black-and-white
// photos with bold words, a sermon recap with round photos, story questions, a quiet editorial recap, a reading
// challenge with hand-drawn circles, a vision series in browser cards, a group invite on dark photos, a missions
// call and a highlighted verse. Original layouts; colors use your brand where it fits, and the words come from
// your sermon or friendly samples you can change. Photo spots fill with your own pictures.
import { page, shape, text as rawText, uid } from './model.js';

const W = 1080; const H = 1350; const R = W / H; // a circle w wide is w * R tall

const hex = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const mix = (a, b, t) => { const x = hex(a); const y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const solid = (color) => ({ type: 'solid', color, darken: 0 });
const fit = (t, base, min = base * 0.55, room = 18) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));
const churchName = (ctx) => ctx.church?.name || 'Church Name';
const site = (ctx) => String(ctx.church?.website || 'yourchurch.org').replace(/^https?:\/\//, '').replace(/\/$/, '');
const times = (ctx) => ctx.church?.times || 'Sundays at 9 & 11';
const year = () => new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0); // a vision series looks ahead in late fall

/** Slides, with pieces that run across the seams copied onto each slide they touch (linked, so they move together). */
function carousel(n, bg, across, slide) {
  across = across.map((it) => ({ ...it, link: uid() }));
  return Array.from({ length: n }, (_, i) => page({
    bg: bg(i),
    items: [...across.filter((it) => it.x + it.w / 2 > i && it.x - it.w / 2 < i + 1).map((it) => shape({ ...it, x: it.x - i })), ...slide(i)],
  }));
}
const T = (font, weight) => (t, p) => rawText({ text: t, font, weight, lh: 1.08, ...p });
const left = (fn) => (t, x0, y, w, p = {}) => fn(t, { align: 'left', x: x0 + w / 2, y, w, ...p });
const photo = (p) => shape({ frame: true, fill: '#8A94A6', ...p });
const gray = { gray: 100, contrast: 112 };

// ------------------------------------------------------------------ words
function recap(ctx) {
  const o = ctx.o || {};
  const pts = (o.points?.length ? o.points : [
    { heading: 'God sees the hidden places', line: 'What happens in private shapes who we become in public.' },
    { heading: 'Faith is a daily choice', line: 'Small steps of trust add up over a lifetime.' },
    { heading: 'We were made to belong', line: 'No one grows alone. Find a few people to walk with.' },
    { heading: 'Live it out this week', line: 'Pick one thing from Sunday and practice it.' },
  ]).slice(0, 4).map((p) => ({ h: p.heading, b: p.line || '' }));
  return { title: o.title || 'Sermon recap', pts };
}

// ------------------------------------------------------------------ 1. Gather: sky blue, heavy white type, a pill to swipe
function gather(ctx, c) {
  const blue = '#4A9BE0'; const deep = '#2F6FB5'; const ink = '#FFFFFF';
  const Hd = T('Avenir Next', 800); const Bd = T('Avenir Next', 600); const HL = left(Hd); const BL = left(Bd);
  const slides = [
    ['Why the church gathers every week', ''],
    ['We gather to worship', 'Not to watch a show, but to give God the praise He deserves, together.'],
    ['We gather to be shaped', 'The Word opens our eyes. Week by week, it changes us.'],
    ['We gather to belong', 'Faith was never meant to be a solo project. We need each other.'],
    ['We gather to be sent', 'Sunday fills us up so we can pour out all week long.'],
    ['Because God still meets us here.', `Join us ${times(ctx).replace(/^Sundays/, 'Sundays')}.`],
  ];
  const n = slides.length;
  return carousel(n, () => solid(blue), [
    { shape: 'ellipse', x: n / 2, y: 0.9, w: n * 0.9, h: 0.5, fill: deep, opacity: 0.35 },
  ], (i) => {
    const [h, b] = slides[i];
    const big = i === 0 || i === n - 1;
    return [
      Bd(`${i + 1}/${n}`, { x: 0.9, y: 0.06, w: 0.14, size: 24, color: ink, opacity: 0.8 }),
      HL(h, 0.09, big ? 0.36 : 0.32, 0.82, { size: fit(h, big ? 120 : 96, 66, 16), color: ink, lh: 1.02 }),
      ...(b ? [BL(b, 0.09, big ? 0.6 : 0.56, 0.74, { size: 36, color: ink, opacity: 0.92, lh: 1.32 })] : []),
      shape({ x: 0.2, y: 0.86, w: 0.22, h: 0.05, radius: 60, fill: ink }),
      Bd(i === n - 1 ? site(ctx) : 'Swipe', { x: 0.2, y: 0.86, w: 0.22, size: 24, color: deep }),
      ...(i === n - 1 ? [] : [shape({ shape: 'swipe', x: 0.42, y: 0.86, w: 0.1, h: 0.03, fill: ink })]),
    ];
  });
}

// ------------------------------------------------------------------ 2. Grit: black-and-white photos, bold condensed words
function grit(ctx) {
  const Hd = T('Avenir Next Condensed', 800); const Bd = T('Avenir Next', 600);
  const slides = ['Your faith won’t grow if this is missing', 'His Word', 'Prayer', 'Community', 'Serving others', 'Growth takes time'];
  const lines = ['', 'Read a little every day. It feeds what lasts.', 'Talk with God like you talk with a friend.', 'Find people who will walk with you.', 'Faith grows when it moves your hands.', 'Keep showing up. God is not in a hurry.'];
  const n = slides.length;
  return carousel(n, () => solid('#151515'), [], (i) => [
    photo({ x: 0.5, y: 0.5, w: 1, h: 1, adjust: gray }),
    shape({ x: 0.5, y: 0.5, w: 1, h: 1, fill: '#000000', opacity: 0.42 }),
    Hd(slides[i].toUpperCase(), { x: 0.5, y: i === 0 ? 0.44 : 0.46, w: 0.84, size: fit(slides[i], i === 0 ? 120 : 150, 80, 12), color: '#FFFFFF', lh: 0.98, letter: 1 }),
    ...(lines[i] ? [Bd(lines[i], { x: 0.5, y: 0.6, w: 0.7, size: 34, color: '#FFFFFF', opacity: 0.9, lh: 1.3 })] : []),
    Bd(i === 0 ? 'Swipe →' : `${i}/${n - 1}`, { x: 0.5, y: 0.92, w: 0.4, size: 24, color: '#FFFFFF', letter: 3, opacity: 0.85 }),
  ]);
}

// ------------------------------------------------------------------ 3. Circles: a recap with round photos crossing the seams
function circles(ctx, c) {
  const S = recap(ctx); const paper = '#EAF3FC'; const navy = '#13284A'; const blue = '#3B8EDB';
  const Hd = T('Avenir Next', 800); const Bd = T('Avenir Next', 500); const HL = left(Hd); const BL = left(Bd);
  const n = S.pts.length + 2;
  const across = Array.from({ length: n - 1 }, (_, k) => ({ frame: true, shape: 'ellipse', x: k + 1, y: k % 2 ? 0.24 : 0.74, w: 0.42, h: 0.42 * R, fill: '#8A94A6', line: 14, stroke: blue }));
  return carousel(n, () => solid(paper), across, (i) => {
    const num = String(i).padStart(2, '0');
    if (i === 0) return [
      HL('Sermon', 0.08, 0.24, 0.7, { size: 120, color: navy }), HL('Recap', 0.08, 0.36, 0.7, { size: 120, color: blue }),
      BL(S.title, 0.08, 0.52, 0.56, { size: 40, weight: 700, color: navy, lh: 1.2 }),
      BL(churchName(ctx), 0.08, 0.9, 0.6, { size: 24, weight: 700, letter: 3, color: navy, opacity: 0.7 }),
    ];
    if (i === n - 1) return [
      HL('Live this out', 0.08, 0.42, 0.6, { size: 84, color: navy }), HL('this week', 0.08, 0.52, 0.6, { size: 84, color: blue }),
      BL(`See you Sunday · ${times(ctx)}`, 0.08, 0.64, 0.6, { size: 30, color: navy, opacity: 0.8 }),
    ];
    const p = S.pts[i - 1]; const top = i % 2 === 1;
    const y = top ? 0.56 : 0.2;
    return [
      BL(num, 0.08, y, 0.3, { size: 34, weight: 800, color: blue }),
      HL(p.h, 0.08, y + 0.1, 0.62, { size: fit(p.h, 66, 46, 22), color: navy }),
      BL(p.b, 0.08, y + 0.24, 0.6, { size: 30, color: navy, opacity: 0.8, lh: 1.32 }),
    ];
  });
}

// ------------------------------------------------------------------ 4. Questions: bold questions with highlighted words
function questions(ctx) {
  const blue = '#3E8EDE'; const light = '#CFE6FF'; const ink = '#FFFFFF';
  const Hd = T('Avenir Next', 800); const Bd = T('Avenir Next', 600);
  const qs = [['We want to hear stories of', 'what God is doing in our church'], ['Where have you seen God', 'move recently?'], ['Has God answered', 'a prayer for you?'],
    ['How has your faith', 'stretched you lately?'], ['What is God', 'teaching you right now?'], ['Share', 'your story']];
  const n = qs.length;
  return carousel(n, () => solid(blue), [{ x: n / 2, y: 0.9, w: n, h: 0.004, fill: light, opacity: 0.6 }], (i) => {
    const [a, b] = qs[i]; const end = i === n - 1;
    return [
      Hd(a.toUpperCase(), { x: 0.5, y: end ? 0.38 : 0.36, w: 0.84, size: fit(a, end ? 150 : 84, 62, 18), color: ink, lh: 1 }),
      Hd(b.toUpperCase(), { x: 0.5, y: end ? 0.54 : 0.52, w: 0.84, size: fit(b, end ? 150 : 84, 62, 18), color: light, lh: 1 }),
      Bd(end ? `Send it to us · ${site(ctx)}` : 'Tell us in the comments', { x: 0.5, y: 0.82, w: 0.8, size: 28, color: ink, opacity: 0.9 }),
      shape({ x: 0.5, y: 0.96, w: 0.24, h: 0.012, radius: 20, fill: ink, opacity: 0.5 }),
    ];
  });
}

// ------------------------------------------------------------------ 5. Editorial: quiet serif recap on pale paper, a photo now and then
function editorial(ctx) {
  const S = recap(ctx); const paper = '#EEF4FA'; const ink = '#1D2B3D'; const soft = '#6E8196';
  const Hd = T('Didot', 400); const Bd = T('Avenir Next', 500); const HL = left(Hd); const BL = left(Bd);
  const n = S.pts.length + 2;
  return carousel(n, () => solid(paper), [{ x: n / 2, y: 0.1, w: n, h: 0.0015, fill: ink, opacity: 0.4 }], (i) => {
    const tag = shape({ x: 0.86, y: 0.06, w: 0.14, h: 0.034, radius: 40, fill: ink });
    const tagT = Bd(`${i + 1}/${n}`, { x: 0.86, y: 0.06, w: 0.14, size: 20, weight: 700, color: paper });
    if (i === 0) return [tag, tagT,
      HL('Sermon Recap', 0.09, 0.32, 0.82, { size: 112, italic: true, color: ink }),
      BL(S.title, 0.09, 0.46, 0.7, { size: 34, color: soft }),
      BL(churchName(ctx).toUpperCase(), 0.09, 0.9, 0.7, { size: 20, weight: 700, letter: 5, color: soft }),
    ];
    if (i === n - 1) return [tag, tagT,
      HL('The big idea', 0.09, 0.3, 0.82, { size: 90, italic: true, color: ink }),
      BL(S.pts[0]?.b || 'Faith grows one faithful step at a time.', 0.09, 0.44, 0.74, { size: 36, color: ink, lh: 1.35 }),
      BL(`${times(ctx)} · ${site(ctx)}`, 0.09, 0.9, 0.8, { size: 22, weight: 700, letter: 2, color: soft }),
    ];
    const p = S.pts[i - 1]; const pic = i % 2 === 0;
    return [tag, tagT,
      ...(pic ? [photo({ x: 0.5, y: 0.68, w: 0.82, h: 0.4, radius: 18 })] : []),
      BL(['Scripture we explored', 'Our takeaway', 'Why it matters', 'Your next step'][(i - 1) % 4].toUpperCase(), 0.09, pic ? 0.16 : 0.3, 0.8, { size: 20, weight: 700, letter: 5, color: soft }),
      HL(p.h, 0.09, pic ? 0.27 : 0.42, 0.82, { size: fit(p.h, 78, 54, 22), italic: true, color: ink }),
      ...(pic ? [] : [BL(p.b, 0.09, 0.58, 0.76, { size: 34, color: ink, opacity: 0.85, lh: 1.35 })]),
    ];
  });
}

// ------------------------------------------------------------------ 6. Challenge: a reading challenge, light serif with hand-drawn circles
function challenge(ctx) {
  const paper = '#F7F4EE'; const blue = '#5C8FD6'; const red = '#C8473A';
  const Hd = T('Baskerville', 400); const Bd = T('Avenir Next', 500); const hand = T('Caveat', 700);
  const slides = [
    ['52 week', 'Challenge', 'Read through the New Testament together this year.'],
    ['Most people don’t read the Bible because', 'no one showed them how to start', ''],
    ['We’re calling it the', 'one chapter a day challenge', 'Five minutes. One chapter. Every day.'],
    ['Can I really', 'do this?', 'Yes. Miss a day? Pick up where you left off.'],
    ['This isn’t just for', 'pastors and leaders', 'It’s for anyone who wants to know God more.'],
    ['If you’re ready, the plan is', 'free', `Get it at ${site(ctx)}`],
  ];
  const n = slides.length;
  return carousel(n, () => solid(paper), [], (i) => {
    const [a, b, c2] = slides[i];
    if (i === 0) return [
      Hd(a, { x: 0.5, y: 0.36, w: 0.8, size: 110, color: blue }),
      hand(b, { x: 0.5, y: 0.48, w: 0.8, size: 150, color: blue }),
      Bd(c2, { x: 0.5, y: 0.64, w: 0.66, size: 32, color: '#4A4A4A', lh: 1.3 }),
      Bd(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.9, w: 0.7, size: 20, weight: 700, letter: 5, color: blue }),
    ];
    return [
      Hd(a.toUpperCase(), { x: 0.5, y: 0.32, w: 0.8, size: fit(a, 64, 46, 26), color: blue, lh: 1.12 }),
      Hd(b.toUpperCase(), { x: 0.5, y: 0.5, w: 0.8, size: fit(b, 74, 50, 18), color: blue, lh: 1.08 }),
      // A red pen circle around the key words, like someone marked it up.
      shape({ shape: 'ellipse', x: 0.5, y: 0.5, w: 0.84, h: 0.2, fill: 'none', line: 7, stroke: red, rot: -3 }),
      ...(c2 ? [Bd(c2, { x: 0.5, y: 0.68, w: 0.66, size: 32, color: '#4A4A4A', lh: 1.3 })] : [shape({ shape: 'arrowCurve', x: 0.5, y: 0.7, w: 0.2, h: 0.12, fill: red, rot: 90 })]),
      Bd(`${i + 1}/${n}`, { x: 0.5, y: 0.92, w: 0.2, size: 22, color: blue, opacity: 0.7 }),
    ];
  });
}

// ------------------------------------------------------------------ 7. Vision: a new-year series in browser cards with sparks
function vision(ctx) {
  const bg = '#E6EEF7'; const ink = '#101820'; const blue = '#3D7BD9';
  const Hd = T('Avenir Next Condensed', 800); const Bd = T('Avenir Next', 500);
  const y0 = year();
  const slides = [[`Vision for ${y0}`, 'One word to guide our year'], ['Intention', 'Living on purpose, not by accident.'], ['What intention looks like', 'Time in the Word. Time with people. Time to rest.'],
    ['Intention requires action', 'A plan you follow beats a plan you admire.'], ['What we’re saying yes to', 'Prayer, generosity and an open table.'], [`In ${y0}, we go all in`, `Start with us this Sunday · ${times(ctx)}`]];
  const n = slides.length;
  return carousel(n, () => solid(bg), [], (i) => {
    const [h, b] = slides[i]; const pic = i % 3 !== 2;
    return [
      shape({ shape: 'window', x: 0.5, y: pic ? 0.4 : 0.46, w: 0.86, h: pic ? 0.6 : 0.5, fill: '#FFFFFF', stroke: ink }),
      ...(pic ? [photo({ x: 0.5, y: 0.36, w: 0.78, h: 0.36, adjust: i === 0 ? gray : undefined })] : []),
      Hd(h.toUpperCase(), { x: 0.5, y: pic ? 0.62 : 0.42, w: 0.78, size: fit(h, pic ? 76 : 96, 52, 16), color: ink, lh: 0.98 }),
      Bd(b, { x: 0.5, y: pic ? 0.8 : 0.58, w: 0.74, size: 30, color: ink, opacity: 0.8, lh: 1.3 }),
      shape({ shape: 'sparkle', x: i % 2 ? 0.1 : 0.9, y: 0.88, w: 0.08, h: 0.08 * R, fill: i % 2 ? blue : ink }),
    ];
  });
}

// ------------------------------------------------------------------ 8. Group: a Bible study invite on dark photos, soft serif
function group(ctx) {
  const cream = '#F3E9D7';
  const Hd = T('Georgia', 400); const Bd = T('Avenir Next', 500);
  const slides = [['Men who pray don’t stay the same', ''], ['Men want to grow spiritually', 'But most don’t know where to start.'], ['What to expect', 'Coffee, an open Bible and honest talk. No experience needed.'],
    ['When men grow in their faith', 'Families, friendships and churches grow too.'], ['This study is a place to slow down', 'One hour a week to get your bearings.'], ['Join the men’s Bible study', `Your next step · ${site(ctx)}`]];
  const n = slides.length;
  return carousel(n, () => solid('#1B1A18'), [], (i) => {
    const [h, b] = slides[i];
    return [
      photo({ x: 0.5, y: 0.5, w: 1, h: 1, adjust: { brightness: 70, saturate: 80 } }),
      shape({ x: 0.5, y: 0.5, w: 1, h: 1, fill: '#000000', opacity: 0.45 }),
      Hd(h, { x: 0.5, y: b ? 0.4 : 0.46, w: 0.78, size: fit(h, 92, 60, 20), italic: i % 2 === 0, color: cream, lh: 1.08 }),
      ...(b ? [Bd(b, { x: 0.5, y: 0.6, w: 0.68, size: 32, color: cream, opacity: 0.9, lh: 1.3 })] : []),
      Bd(churchName(ctx).toUpperCase(), { x: 0.5, y: 0.92, w: 0.7, size: 20, weight: 700, letter: 5, color: cream, opacity: 0.7 }),
    ];
  });
}

// ------------------------------------------------------------------ 9. Missions: heavy words over photos, a round badge in the corner
function missions(ctx, c) {
  const accent = '#E8B04B'; const ink = '#FFFFFF';
  const Hd = T('Avenir Next Condensed', 800); const Bd = T('Avenir Next', 600);
  const slides = [['Missions is not optional', ''], ['Jesus didn’t call us to stay comfortable', 'He called us to go, to serve and to love.'], ['Every nation, every neighbor', 'The mission field starts across the street.'],
    ['Go, send, or pray', 'Everyone has a part to play.'], ['Welcome to a lifestyle of sending', 'Compassion and faith in action.'], ['We will pray. We will give. We will go.', `Learn more · ${site(ctx)}`]];
  const n = slides.length;
  return carousel(n, () => solid('#202020'), [], (i) => {
    const [h, b] = slides[i];
    return [
      photo({ x: 0.5, y: 0.5, w: 1, h: 1 }),
      shape({ x: 0.5, y: 0.5, w: 1, h: 1, fill: '#000000', opacity: 0.5 }),
      shape({ shape: 'ellipse', x: 0.88, y: 0.08, w: 0.1, h: 0.1 * R, fill: accent }),
      shape({ shape: 'arrowLine', x: 0.88, y: 0.08, w: 0.05, h: 0.02, fill: '#1A1A1A' }),
      Hd(h.toUpperCase(), { x: 0.5, y: b ? 0.42 : 0.5, w: 0.84, size: fit(h, 120, 72, 16), color: ink, lh: 0.98 }),
      ...(b ? [Bd(b, { x: 0.5, y: 0.64, w: 0.7, size: 32, color: ink, opacity: 0.9, lh: 1.3 })] : []),
    ];
  });
}

// ------------------------------------------------------------------ 10. Highlight: a verse in plain type with a marker highlight
function highlight(ctx) {
  const sky = '#D5E7F7'; const ink = '#1E2A36'; const marker = '#F6E35A';
  const Bd = T('Helvetica Neue', 500);
  const verse = ctx.o?.quotes?.[0] || 'Come to me, all who are weary and burdened, and I will give you rest.';
  const words = verse.split(' ');
  const chunks = []; for (let k = 0; k < words.length; k += 7) chunks.push(words.slice(k, k + 7).join(' '));
  const slides = [...chunks.slice(0, 4), ctx.o?.refs?.[0] || 'Matthew 11:28', `Rest for the weary · ${churchName(ctx)}`];
  const n = slides.length;
  return carousel(n, () => solid(sky), [{ shape: 'blob3', x: n / 2, y: 0.12, w: n * 0.8, h: 0.24, fill: '#FFFFFF', opacity: 0.55 }], (i) => {
    const t = slides[i]; const ref = i === n - 2;
    return [
      shape({ x: 0.5, y: 0.5, w: 0.74, h: ref ? 0.07 : 0.12, radius: 6, fill: marker, opacity: 0.9, rot: -1 }),
      Bd(t, { x: 0.5, y: 0.5, w: 0.78, size: ref ? 54 : fit(t, 62, 44, 30), color: ink, lh: 1.25, weight: ref ? 700 : 500 }),
      Bd(i < n - 1 ? 'Swipe' : site(ctx), { x: 0.5, y: 0.9, w: 0.4, size: 22, color: ink, letter: 3, opacity: 0.7 }),
    ];
  });
}

// ------------------------------------------------------------------ the list
// Each one's own colors, in brand-kit order (primary, secondary, text, background, accent), so the
// "My brand colors" switch in Design can swap them for the church's.
const LIST = [
  ['gather', 'Gather sky carousel', gather, 0, false, ['#4A9BE0', '#2F6FB5', '#13284A', '#EAF3FC', '#CFE6FF']],
  ['grit', 'Grit photo carousel', grit, 6, false, null],
  ['circles', 'Round photo recap carousel', circles, 5, true, ['#3B8EDB', '#7FB6EA', '#13284A', '#EAF3FC', '#3B8EDB']],
  ['questions', 'Story questions carousel', questions, 0, false, ['#3E8EDE', '#2F6FB5', '#13284A', '#EAF3FC', '#CFE6FF']],
  ['editorial', 'Editorial recap carousel', editorial, 2, true, ['#6E8196', '#A9C1DA', '#1D2B3D', '#EEF4FA', '#6E8196']],
  ['challenge', 'Reading challenge carousel', challenge, 0, false, ['#5C8FD6', '#C8473A', '#4A4A4A', '#F7F4EE', '#C8473A']],
  ['vision', 'Vision series carousel', vision, 4, false, ['#3D7BD9', '#3D7BD9', '#101820', '#E6EEF7', '#3D7BD9']],
  ['group', 'Group invite carousel', group, 6, false, ['#8A6F45', '#F3E9D7', '#F3E9D7', '#1B1A18', '#F3E9D7']],
  ['missions', 'Missions carousel', missions, 6, false, ['#E8B04B', '#E8B04B', '#FFFFFF', '#202020', '#E8B04B']],
  ['highlight', 'Highlighted verse carousel', highlight, 0, true, ['#7FB0E0', '#F6E35A', '#1E2A36', '#D5E7F7', '#F6E35A']],
];
export const CAROUSEL_TEMPLATES2 = LIST.map(([id, name, fn, photos, sermon, colors]) => ({
  id: `${id}-carousel2`, kind: 'carousel', name, photos, sermon: Boolean(sermon), ...(colors ? { colors } : {}),
  build: (ctx = {}) => fn(ctx, ctx.c || []),
}));
