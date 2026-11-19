// Inspiration: what your church has been saying, what it hasn't said in a while, what's coming up on
// the church calendar, and ideas for the blog. Worked out on this Mac from sermons, writing, posts and
// the blog feed. No AI needed.
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { file, getProject, getTranscript, listProjects } from './projects.js';
import { contentWords } from './text.js';
import { extractRefs, normalizeText } from './scripture.js';
import { listDrafts, loadDraft } from './writing.js';
import * as socialStore from './social/store.js';
import { blogHistory } from './blog.js';
import { contentPlan } from './hub.js';
import { listDesigns } from './designs.js';

/** Topics most churches come back to. A topic counts when one of its word stems shows up. */
export const TOPICS = [
  ['prayer', 'Prayer', ['pray', 'prayer', 'prayed', 'praying']],
  ['generosity', 'Generosity and giving', ['generous', 'generosity', 'giving', 'tithe', 'offering', 'stewardship']],
  ['grace', 'Grace', ['grace']],
  ['forgiveness', 'Forgiveness', ['forgive', 'forgiven', 'forgiveness']],
  ['hope', 'Hope', ['hope', 'hopeful']],
  ['grief', 'Grief and loss', ['grief', 'grieve', 'mourn', 'loss', 'lament']],
  ['anxiety', 'Anxiety and peace', ['anxiety', 'anxious', 'worry', 'worried', 'fear', 'peace']],
  ['suffering', 'Suffering', ['suffer', 'suffering', 'pain', 'trial']],
  ['spirit', 'The Holy Spirit', ['holy spirit', 'spirit-filled', 'the spirit']],
  ['jesus', 'Who Jesus is', ['jesus', 'christ', 'messiah']],
  ['cross', 'The cross and resurrection', ['cross', 'resurrection', 'risen', 'tomb']],
  ['gospel', 'The gospel', ['gospel', 'good news', 'salvation', 'saved']],
  ['scripture', 'Reading the Bible', ['bible', 'scripture', 'word of god']],
  ['worship', 'Worship', ['worship', 'praise']],
  ['community', 'Community and belonging', ['community', 'belong', 'fellowship', 'together']],
  ['family', 'Marriage and family', ['marriage', 'married', 'husband', 'wife', 'family', 'families']],
  ['parenting', 'Parenting and kids', ['parent', 'parenting', 'children', 'kids', 'teenager']],
  ['nextgen', 'The next generation', ['students', 'youth', 'next generation', 'young adults']],
  ['serving', 'Serving and volunteering', ['serve', 'serving', 'volunteer']],
  ['mission', 'Mission and outreach', ['mission', 'outreach', 'neighbor', 'neighbors', 'city']],
  ['evangelism', 'Sharing your faith', ['share your faith', 'evangelism', 'invite', 'witness']],
  ['justice', 'Justice and mercy', ['justice', 'mercy', 'oppressed', 'poor']],
  ['work', 'Work and calling', ['your job', 'calling', 'vocation', 'workplace', 'at work', 'coworker']],
  ['money', 'Money', ['money', 'debt', 'wealth', 'budget']],
  ['rest', 'Rest and sabbath', ['rest', 'sabbath', 'weary', 'burnout']],
  ['identity', 'Identity', ['identity', 'worth', 'who you are', 'beloved']],
  ['doubt', 'Doubt and questions', ['doubt', 'questions', 'skeptic']],
  ['joy', 'Joy and gratitude', ['joy', 'joyful', 'grateful', 'gratitude', 'thankful']],
  ['baptism', 'Baptism and communion', ['baptism', 'baptized', 'communion', 'lord\'s supper', 'table']],
  ['love', 'Loving others', ['love your neighbor', 'love one another', 'kindness']],
];

const countTopics = (text) => {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z' -]+/g, ' ')} `;
  const out = {};
  for (const [id, , stems] of TOPICS) {
    let n = 0;
    for (const s of stems) { const m = t.match(new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es|ed|d|ing|er|ers|ful|fully|ness|ly)?\\b`, 'g')); if (m) n += m.length; }
    if (n) out[id] = n;
  }
  return out;
};

/** Per-sermon topic counts, words and scripture, cached next to the transcript. */
async function sermonFacts(id) {
  const tf = file(id, 'transcript.json');
  if (!existsSync(tf)) return null;
  const cache = file(id, 'topics.json');
  const mtime = statSync(tf).mtimeMs;
  if (existsSync(cache)) { try { const c = JSON.parse(await readFile(cache, 'utf8')); if (c.mtime === mtime && c.v === 1) return c; } catch { /* rebuild */ } }
  const p = await getProject(id);
  const t = await getTranscript(id);
  if (!t?.words?.length) return null;
  const r = p.sermon?.confirmed ? p.sermon : null;
  const text = normalizeText(t.words.filter((w) => !r || (w.start >= r.start && w.end <= r.end)).map((w) => w.w).join(' '));
  const words = {};
  for (const w of contentWords(text)) words[w] = (words[w] || 0) + 1;
  const top = Object.fromEntries(Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 80));
  const out = { v: 1, mtime, topics: countTopics(text), words: top, refs: extractRefs(text, 40), length: text.split(' ').length };
  await writeFile(cache, JSON.stringify(out));
  return out;
}

/** Everything the church has said, as dated items. */
async function corpus() {
  const items = [];
  for (const s of await listProjects()) {
    if (s.status !== 'transcribed') continue;
    const p = await getProject(s.id);
    if (!p || p.blank) continue;
    const f = await sermonFacts(s.id).catch(() => null);
    if (f) items.push({ kind: 'sermon', id: s.id, title: p.title, date: p.created, topics: f.topics, words: f.words, refs: f.refs });
  }
  for (const d of await listDrafts().catch(() => [])) {
    const full = await loadDraft(d.id).catch(() => null);
    const text = [full?.blog, full?.email, full?.devotional].filter(Boolean).join('\n');
    if (text.length < 200) continue;
    const words = {};
    for (const w of contentWords(text)) words[w] = (words[w] || 0) + 1;
    items.push({ kind: 'writing', id: d.id, title: d.title, date: d.updated, topics: countTopics(text), words, refs: extractRefs(text, 20) });
  }
  for (const post of await socialStore.listPosts().catch(() => [])) {
    if (post.status === 'draft' || !post.caption) continue;
    items.push({ kind: 'post', id: post.id, title: post.title || post.caption.slice(0, 60), date: post.publishedAt || post.scheduledAt || post.created, topics: countTopics(post.caption), words: {}, refs: [] });
  }
  const blog = await blogHistory();
  for (const b of blog.posts || []) {
    const text = `${b.title} ${b.text || b.summary}`;
    const words = {};
    for (const w of contentWords(text)) words[w] = (words[w] || 0) + 1;
    items.push({ kind: 'blog', id: b.link, title: b.title, date: b.date, link: b.link, topics: countTopics(text), words, refs: extractRefs(text, 20) });
  }
  return { items, blog };
}

const WEB_WORDS = new Set('actually almost through plus really around without thing things other another every post posts appeared first episode episodes podcast listen subscribe review reviews leave click link links website newsletter follow share comment comments read reading apple spotify youtube instagram facebook watch video videos email sign blog article articles page continue'.split(' '));
const PERIODS = { month: 31, quarter: 92, year: 366, all: 36500 };
const OT = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', 'Samuel', 'Kings', 'Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'];
const GOSPELS = ['Matthew', 'Mark', 'Luke', 'John'];
const bookOf = (ref) => ref.replace(/\s+\d+(:.*)?$/, '').replace(/^[1-3]\s/, '');
const fullBook = (ref) => ref.replace(/\s+\d+(:.*)?$/, '');

// ------------------------------------------------------------------ church seasons
function easter(y) { // Anonymous Gregorian algorithm
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const nthWeekday = (y, m, wd, n) => { const d = new Date(y, m, 1); return addDays(d, ((wd - d.getDay() + 7) % 7) + (n - 1) * 7); };
function seasonsFor(y) {
  const e = easter(y);
  const christmas = new Date(y, 11, 25);
  const advent = addDays(christmas, -((christmas.getDay() || 7) + 21)); // fourth Sunday before Christmas
  return [
    { id: 'newyear', name: 'New Year', date: new Date(y, 0, 1), idea: 'A fresh-start series or a prayer and fasting week.' },
    { id: 'ash', name: 'Ash Wednesday and Lent', date: addDays(e, -46), idea: 'A Lent devotional and a 40-day reading plan.' },
    { id: 'palm', name: 'Palm Sunday', date: addDays(e, -7), idea: 'Holy Week service times and an invite card people can share.' },
    { id: 'goodfriday', name: 'Good Friday', date: addDays(e, -2), idea: 'A service graphic and a reflection post.' },
    { id: 'easter', name: 'Easter', date: e, idea: 'Invite graphics, a countdown, and a "plan your visit" post. Your biggest guest Sunday.' },
    { id: 'mothers', name: 'Mother’s Day', date: nthWeekday(y, 4, 0, 2), idea: 'Honor moms, and be gentle with those for whom the day is hard.' },
    { id: 'pentecost', name: 'Pentecost', date: addDays(e, 49), idea: 'A message on the Holy Spirit and a church birthday post.' },
    { id: 'fathers', name: 'Father’s Day', date: nthWeekday(y, 5, 0, 3), idea: 'A dads video clip or a quote card.' },
    { id: 'school', name: 'Back to school', date: new Date(y, 7, 15), idea: 'Prayer for students and teachers, and fall small groups.' },
    { id: 'thanks', name: 'Thanksgiving', date: nthWeekday(y, 10, 4, 4), idea: 'A gratitude series, testimonies, or a serve day.' },
    { id: 'advent', name: 'Advent', date: advent, idea: 'An Advent devotional, a sermon series graphic and a Christmas invite.' },
    { id: 'christmas', name: 'Christmas Eve', date: new Date(y, 11, 24), idea: 'Service times everywhere, a countdown, and a warm welcome for guests.' },
  ];
}
export function upcomingSeasons(now = new Date(), days = 90) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [...seasonsFor(now.getFullYear()), ...seasonsFor(now.getFullYear() + 1)]
    .map((s) => ({ ...s, days: Math.round((s.date - today) / 86400000) }))
    .filter((s) => s.days >= 0 && s.days <= days)
    .map((s) => ({ ...s, date: s.date.toISOString(), planBy: addDays(s.date, -21).toISOString() }));
}

// ------------------------------------------------------------------ the report
export async function inspiration({ period = 'quarter' } = {}) {
  const days = PERIODS[period] || PERIODS.quarter;
  const since = Date.now() - days * 86400000;
  const { items, blog } = await corpus();
  const inPeriod = items.filter((i) => i.date && Date.parse(i.date) >= since);
  const by = (kind) => inPeriod.filter((i) => i.kind === kind).length;

  // What you've been saying: words that show up across many pieces, not just one. Each kind of piece
  // gets a fair share, so a long blog archive doesn't drown out a handful of sermons.
  const WEIGHT = { sermon: 2, writing: 1.5, blog: 1, post: 0.7 };
  const kindTotals = {};
  for (const i of inPeriod) kindTotals[i.kind] = (kindTotals[i.kind] || 0) + 1;
  const spread = new Map();
  for (const i of inPeriod) for (const [w, n] of Object.entries(i.words || {})) {
    const s = spread.get(w) || { word: w, count: 0, pieces: 0, score: 0 };
    s.count += n; s.pieces += 1; s.score += (WEIGHT[i.kind] || 1) / kindTotals[i.kind]; spread.set(w, s);
  }
  // Words in nearly every piece are boilerplate (a feed footer, the church's own name), not themes.
  const site = (blog.site || '').replace(/^https?:\/\/(www\.)?/, '').split('.')[0];
  const words = [...spread.values()].filter((w) => w.pieces >= Math.min(2, inPeriod.length) && w.word.length > 3 && !WEB_WORDS.has(w.word) && w.word !== site
    && !(inPeriod.length >= 8 && w.pieces / inPeriod.length > 0.8))
    .sort((a, b) => b.score * Math.log(2 + b.count) - a.score * Math.log(2 + a.count)).slice(0, 28);

  // Topics: how often, and the last time each came up (looking back over everything).
  const topics = TOPICS.map(([id, label]) => {
    const hits = inPeriod.filter((i) => i.topics?.[id]).length;
    const ever = items.filter((i) => i.topics?.[id] && i.date).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const last = ever[0] ? { date: ever[0].date, title: ever[0].title, kind: ever[0].kind, id: ever[0].id, link: ever[0].link || null } : null;
    const share = inPeriod.length ? hits / inPeriod.length : 0;
    return { id, label, hits, share, last, status: !inPeriod.length ? 'none' : hits === 0 ? 'quiet' : share >= 0.4 ? 'often' : 'some' };
  });
  const blindSpots = topics.filter((t) => t.status === 'quiet').sort((a, b) => Date.parse(a.last?.date || 0) - Date.parse(b.last?.date || 0)).slice(0, 10);

  // Scripture balance.
  const refs = inPeriod.flatMap((i) => (i.refs || []).map((r) => ({ ref: r, kind: i.kind })));
  const books = new Map();
  for (const r of refs) books.set(fullBook(r.ref), (books.get(fullBook(r.ref)) || 0) + 1);
  const ot = refs.filter((r) => OT.includes(bookOf(r.ref))).length;
  const gospels = refs.filter((r) => GOSPELS.includes(bookOf(r.ref))).length;
  const scripture = { total: refs.length, ot, nt: refs.length - ot, gospels, books: [...books.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([book, n]) => ({ book, n })) };

  // Blog: rhythm, gap since the last post, and ideas for the next one.
  const posts = (blog.posts || []).filter((p) => p.date);
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleDateString('en-US', { month: 'short' }), n: posts.filter((p) => p.date.startsWith(key)).length });
  }
  const lastPost = posts[0] || null;
  const recentSermons = items.filter((i) => i.kind === 'sermon').sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 6);
  const unblogged = [];
  for (const s of recentSermons) {
    const plan = await contentPlan(s.id).catch(() => null);
    if (plan && !plan.pieces.find((p) => p.id === 'blog')?.done) unblogged.push({ id: s.id, title: s.title, date: s.date });
  }
  const evergreen = posts.filter((p) => Date.now() - Date.parse(p.date) > 270 * 86400000 && p.words > 300)
    .map((p) => ({ title: p.title, link: p.link, date: p.date, topics: Object.keys(countTopics(`${p.title} ${p.text || ''}`)) }))
    .filter((p) => p.topics.length).slice(0, 5);

  return {
    period, since: new Date(since).toISOString(),
    counts: { sermons: by('sermon'), writing: by('writing'), posts: by('post'), blog: by('blog'), total: inPeriod.length },
    words, topics, blindSpots, scripture,
    seasons: upcomingSeasons(),
    blog: blog.feed ? {
      feed: blog.feed, site: blog.site, fetched: blog.fetched, total: posts.length, months,
      lastPost: lastPost ? { title: lastPost.title, link: lastPost.link, date: lastPost.date } : null,
      daysSince: lastPost ? Math.floor((Date.now() - Date.parse(lastPost.date)) / 86400000) : null,
      perMonth: +(months.reduce((a, m) => a + m.n, 0) / 12).toFixed(1),
      recent: posts.slice(0, 6).map((p) => ({ title: p.title, link: p.link, date: p.date, summary: p.summary })),
    } : null,
    ideas: { unblogged, evergreen },
  };
}

// ------------------------------------------------------------------ year in review

/** The numbers for a year: what was preached, made and shared. */
export async function yearInReview(year = new Date().getFullYear()) {
  const inYear = (d) => d && new Date(d).getFullYear() === Number(year);
  const projects = [];
  for (const s of await listProjects()) { const p = await getProject(s.id); if (p && !p.blank) projects.push(p); }
  const sermons = projects.filter((p) => inYear(p.created) && p.status === 'transcribed');
  const clips = projects.flatMap((p) => p.clips.filter((c) => inYear(c.export?.at)).map((c) => ({ ...c, project: p.title })));
  const posts = (await socialStore.listPosts().catch(() => [])).filter((p) => ['published', 'partial', 'needs-you'].includes(p.status) && inYear(p.publishedAt));
  const designs = (await listDesigns().catch(() => [])).filter((d) => inYear(d.updated));
  const drafts = (await listDrafts().catch(() => [])).filter((d) => inYear(d.updated));
  const { items } = await corpus();
  const yearItems = items.filter((i) => inYear(i.date));
  const refs = yearItems.filter((i) => i.kind === 'sermon').flatMap((i) => i.refs || []);
  const books = new Map(); for (const r of refs) books.set(fullBook(r), (books.get(fullBook(r)) || 0) + 1);
  const preached = yearItems.filter((i) => i.kind === 'sermon');
  const pool = preached.length >= 3 ? preached : yearItems;
  const topicCount = TOPICS.map(([id, label]) => ({ label, n: pool.filter((i) => i.topics?.[id]).length })).filter((t) => t.n).sort((a, b) => b.n - a.n);
  const words = new Map(); for (const i of yearItems.filter((x) => x.kind === 'sermon')) for (const [w, n] of Object.entries(i.words || {})) words.set(w, (words.get(w) || 0) + n);
  const dates = [...sermons.map((p) => p.created), ...clips.map((c) => c.export.at), ...posts.map((p) => p.publishedAt), ...designs.map((d) => d.updated), ...drafts.map((d) => d.updated)].filter(Boolean);
  const byMonth = Array.from({ length: 12 }, (_, m) => dates.filter((d) => new Date(d).getMonth() === m).length);
  const weeks = new Set(dates.map((d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x.getTime(); }));
  let best = 0; let run = 0; let prev = null;
  for (const w of [...weeks].sort((a, b) => a - b)) { run = prev && Math.round((w - prev) / 604800000) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = w; }
  const minutes = Math.round(sermons.reduce((a, p) => a + (p.media?.duration || 0), 0) / 60);
  return {
    year: Number(year),
    sermons: sermons.length, minutes, clips: clips.length, posts: posts.length, designs: designs.length, writing: drafts.length,
    topBooks: [...books.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([book, n]) => ({ book, n })),
    topTopics: topicCount.slice(0, 3),
    topWords: [...words.entries()].filter(([w]) => w.length > 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w),
    busiestMonth: byMonth.some(Boolean) ? new Date(Number(year), byMonth.indexOf(Math.max(...byMonth)), 1).toLocaleDateString('en-US', { month: 'long' }) : null,
    byMonth, bestStreak: best,
    firstSermon: sermons.sort((a, b) => Date.parse(a.created) - Date.parse(b.created))[0]?.title || null,
  };
}
