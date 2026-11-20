// Search across everything: sermons (and what was said in them), clips, writing, designs, posts,
// campaigns, brand library pictures, blog posts and church events.
// Plain phrases work without AI: "sermons about prayer from last fall", "flyers from October",
// "clips on grace this year". The kind of thing, the time and the topic are read from the words.
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { file, getProject, listProjects } from './projects.js';
import { getDesign, listDesigns } from './designs.js';
import { listDrafts, loadDraft } from './writing.js';
import * as socialStore from './social/store.js';
import { listCampaigns } from './campaigns.js';
import { listLibrary } from './library.js';
import { loadNotes } from './photos.js';
import { blogHistory } from './blog.js';
import { cachedEvents } from './calendar.js';
import { TOPICS } from './inspiration.js';
import { loadTags } from './finder.js';

// ------------------------------------------------------------------ reading the question
const KINDS = [
  ['sermon', /^(sermons?|messages?|talks?|teachings?)$/],
  ['video', /^(videos?|services?|recordings?)$/],
  ['clip', /^(clips?|reels?|shorts?)$/],
  ['design', /^(designs?|graphics?|slides?|decks?|flyers?|posters?|stories|carousels?|thumbnails?|cards?)$/],
  ['writing', /^(writing|blogs?|drafts?|emails?|newsletters?|devotionals?|guides?|articles?)$/],
  ['post', /^(posts?|captions?|socials?)$/],
  ['photo', /^(photos?|pictures?|images?|logos?|pics?)$/],
  ['campaign', /^(campaigns?)$/],
  ['event', /^(events?)$/],
];
const FILLER = new Set('a an the and or of to in on at for with about from by is are was were be find show me my our all any that where which who what when this those these some i we us please get search look looking for one ones'.split(' '));
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Read a plain-language search into { kinds, from, to, label, terms }. */
export function parseQuery(q, now = new Date()) {
  let text = ` ${String(q || '').toLowerCase().replace(/[^\w\s'-]/g, ' ')} `;
  let from = null; let to = null; let label = '';
  const Y = now.getFullYear();
  const day = (y, m, d) => new Date(y, m, d);
  const set = (a, b, l) => { from = a; to = b; label = l; };
  const take = (re, fn) => { const m = text.match(re); if (m && !from) { fn(m); text = text.replace(m[0], ' '); } };
  take(/\b(today)\b/, () => set(day(Y, now.getMonth(), now.getDate()), now, 'today'));
  take(/\b(yesterday)\b/, () => set(day(Y, now.getMonth(), now.getDate() - 1), day(Y, now.getMonth(), now.getDate()), 'yesterday'));
  take(/\b(this|past) week\b/, () => set(day(Y, now.getMonth(), now.getDate() - now.getDay()), now, 'this week'));
  take(/\blast week\b/, () => set(day(Y, now.getMonth(), now.getDate() - now.getDay() - 7), day(Y, now.getMonth(), now.getDate() - now.getDay()), 'last week'));
  take(/\bthis month\b/, () => set(day(Y, now.getMonth(), 1), now, 'this month'));
  take(/\blast month\b/, () => set(day(Y, now.getMonth() - 1, 1), day(Y, now.getMonth(), 1), 'last month'));
  take(/\bthis year\b/, () => set(day(Y, 0, 1), now, 'this year'));
  take(/\blast year\b/, () => set(day(Y - 1, 0, 1), day(Y, 0, 1), `${Y - 1}`));
  take(/\b(?:past|last) (\d+) (days?|weeks?|months?)\b/, (m) => { const n = Number(m[1]); const k = m[2][0]; set(new Date(now - n * (k === 'd' ? 1 : k === 'w' ? 7 : 30.4) * 86400000), now, `the last ${n} ${m[2]}`); });
  take(/\b(last |this )?(spring|summer|fall|autumn|winter)(?: of)?(?: (\d{4}))?\b/, (m) => {
    const season = m[2] === 'autumn' ? 'fall' : m[2];
    const start = { spring: 2, summer: 5, fall: 8, winter: 11 }[season];
    let y = m[3] ? Number(m[3]) : Y;
    if (!m[3] && (m[1] === 'last ' || day(y, start, 1) > now)) y -= 1;
    set(day(y, start, 1), day(y, start + 3, 1), `${season} ${y}`);
  });
  take(/\b(christmas|advent|easter|lent)(?: (\d{4}))?\b/, (m) => {
    let y = m[2] ? Number(m[2]) : Y;
    const ranges = { christmas: [11, 1, 12, 6], advent: [10, 25, 11, 26], easter: [2, 15, 4, 1], lent: [1, 1, 3, 25] };
    const [m1, d1, m2, d2] = ranges[m[1]];
    if (!m[2] && day(y, m1, d1) > now) y -= 1;
    set(day(y, m1, d1), day(y + (m2 < m1 ? 1 : 0), m2, d2), `${m[1]} ${y}`);
  });
  take(new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS.map((x) => x.slice(0, 3)).join('|')})(?: (\\d{4}))?\\b`), (m) => {
    const mi = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3)));
    let y = m[2] ? Number(m[2]) : Y;
    if (!m[2] && day(y, mi, 1) > now) y -= 1;
    set(day(y, mi, 1), day(y, mi + 1, 1), `${MONTHS[mi][0].toUpperCase()}${MONTHS[mi].slice(1)} ${y}`);
  });
  take(/\b(20\d{2})\b/, (m) => set(day(Number(m[1]), 0, 1), day(Number(m[1]) + 1, 0, 1), m[1]));
  const kinds = new Set();
  const terms = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const k = KINDS.find(([, re]) => re.test(w));
    if (k) kinds.add(k[0]);
    else if (!FILLER.has(w) && w.length > 1) terms.push(w);
  }
  return { kinds: [...kinds], from: from?.toISOString() || null, to: to?.toISOString() || null, label, terms };
}

/** Words that count as a match for a term: the word, its plural, and the topic it belongs to. */
function expand(term) {
  const out = new Set([term, term.replace(/(es|s)$/, '')]);
  for (const [, label, stems] of TOPICS) {
    const words = label.toLowerCase().split(/\W+/);
    if (words.includes(term) || stems.some((s) => s === term || term.startsWith(s))) stems.forEach((s) => out.add(s));
  }
  return [...out].filter((x) => x.length > 1);
}

// ------------------------------------------------------------------ the index
const transcriptCache = new Map(); // projectId -> { mtime, text }
const designCache = new Map(); // id -> { updated, text }
let built = null; // { at, docs }

async function transcriptText(id) {
  const f = file(id, 'transcript.json');
  if (!existsSync(f)) return '';
  const mtime = statSync(f).mtimeMs;
  const c = transcriptCache.get(id);
  if (c?.mtime === mtime) return c.text;
  try {
    const t = JSON.parse(await readFile(f, 'utf8'));
    const text = (t.words || []).map((w) => w.w).join(' ');
    transcriptCache.set(id, { mtime, text, words: t.words || [] });
    return text;
  } catch { return ''; }
}

async function buildIndex() {
  if (built && Date.now() - built.at < 20_000) return built.docs;
  const docs = [];
  const tags = await loadTags().catch(() => ({}));
  const T = (key) => tags[key] || [];
  // Items tied to a sermon also carry its name, so "grace blog" finds the blog from the grace sermon.
  const sermonNames = new Map((await listProjects().catch(() => [])).map((x) => [x.id, x.title]));
  const from = (pid) => (pid && sermonNames.get(pid) ? ` From the sermon ${sermonNames.get(pid)}.` : '');
  for (const s of await listProjects()) {
    const p = await getProject(s.id).catch(() => null);
    if (!p) continue;
    docs.push({ key: `sermon:${p.id}`, type: s.isSermon ? 'sermon' : 'video', title: p.title, text: await transcriptText(p.id), date: p.created, thumb: p.thumbnail || null, go: { name: 'project', id: p.id }, tags: T(`sermon:${p.id}`), projectId: p.id });
    for (const c of p.clips || []) {
      if (!['kept', 'exported'].includes(c.status) && !c.export) continue;
      docs.push({ key: `clip:${p.id}/${c.id}`, type: 'clip', title: c.title || 'Clip', text: [c.hook, c.summary, c.text, (c.hashtags || []).join(' ')].filter(Boolean).join(' '), date: c.export?.at || p.created, sub: p.title, go: { name: 'project', id: p.id, clip: c.id }, tags: T(`clip:${p.id}/${c.id}`) });
    }
  }
  for (const d of await listDrafts().catch(() => [])) {
    const full = await loadDraft(d.id).catch(() => null);
    docs.push({ key: `writing:${d.id}`, type: 'writing', title: d.title, text: ['blog', 'email', 'newsletter', 'group', 'devotional', 'social'].map((k) => full?.[k] || '').join('\n') + from(full?.source?.projectId || (sermonNames.has(d.id) ? d.id : null)), date: d.updated, sub: d.source === 'newsletter' ? 'Newsletter' : d.sermon ? `From ${d.sermon}` : 'Writing', go: { name: 'writing', project: d.id }, tags: T(`writing:${d.id}`) });
  }
  for (const d of await listDesigns().catch(() => [])) {
    let c = designCache.get(d.id);
    if (!c || c.updated !== d.updated) {
      const full = await getDesign(d.id).catch(() => null);
      c = { updated: d.updated, text: (full?.pages || []).flatMap((pg) => pg.items.filter((i) => i.type === 'text').map((i) => i.text)).join(' '), projectId: full?.source?.projectId || null };
      designCache.set(d.id, c);
    }
    docs.push({ key: `design:${d.id}`, type: 'design', title: d.name, text: c.text + from(c.projectId), date: d.updated, thumb: d.thumb, sub: d.kind, go: { name: 'graphics', design: d.id }, tags: T(`design:${d.id}`) });
  }
  for (const p of await socialStore.listPosts().catch(() => [])) {
    docs.push({ key: `post:${p.id}`, type: 'post', title: p.title || p.caption?.slice(0, 60) || 'Post', text: `${p.caption || ''} ${(p.hashtags || []).join(' ')}${from(p.sermonId || p.media?.projectId)}`, date: p.publishedAt || p.scheduledAt || p.plannedAt || p.created, sub: p.status, go: { name: 'social' } });
  }
  for (const c of await listCampaigns().catch(() => [])) {
    docs.push({ key: `campaign:${c.id}`, type: 'campaign', title: c.name, text: c.steps.map((s) => `${s.label} ${s.post?.caption || ''}`).join(' ') + from(c.projectId), date: c.date, go: { name: 'calendar', tab: 'campaigns' } });
  }
  const notes = await loadNotes().catch(() => ({}));
  const lib = await listLibrary().catch(() => ({ items: [] }));
  for (const i of lib.items || []) {
    if (i.kind !== 'image') continue;
    const n = notes[i.rel] || {};
    docs.push({ key: `photo:${i.rel}`, type: 'photo', title: i.name, text: `${i.folder} ${n.alt || ''}`, date: i.modified || null, thumb: i.url, sub: i.folder, go: { name: 'assets' }, tags: n.tags || [] });
  }
  for (const b of (await blogHistory().catch(() => ({ posts: [] }))).posts || []) {
    docs.push({ key: `blog:${b.link}`, type: 'writing', title: b.title, text: b.text || b.summary || '', date: b.date, sub: 'On your blog', link: b.link });
  }
  for (const e of (await cachedEvents().catch(() => ({ events: [] }))).events || []) {
    docs.push({ key: `event:${e.id}`, type: 'event', title: e.title, text: `${e.location || ''} ${e.summary || ''}`, date: e.start, sub: e.location || 'Church calendar', go: { name: 'calendar' } });
  }
  built = { at: Date.now(), docs };
  return docs;
}

const clean = (t) => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]+/g, ' ').replace(/\s+/g, ' ');
function snippet(doc0, words) {
  const doc = { text: clean(doc0.text) };
  const low = doc.text.toLowerCase();
  let at = -1; let len = 0;
  for (const w of words) { const i = low.search(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)); if (i >= 0 && (at < 0 || i < at)) { at = i; len = w.length; } }
  if (at < 0) return doc.text.slice(0, 140).trim();
  const start = Math.max(0, at - 60);
  return `${start ? '…' : ''}${doc.text.slice(start, at + len + 90).trim()}${at + len + 90 < doc.text.length ? '…' : ''}`;
}

/** For a sermon, the moment a word was said, so the result can jump there. */
function momentOf(projectId, words) {
  const c = transcriptCache.get(projectId);
  if (!c?.words) return null;
  const hit = c.words.find((w) => words.some((x) => w.w.toLowerCase().replace(/[^a-z']/g, '').startsWith(x)));
  return hit ? hit.start : null;
}

export async function search(q, { limit = 40 } = {}) {
  const query = parseQuery(q);
  const docs = await buildIndex();
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;
  const groups = query.terms.map(expand);
  const results = [];
  for (const d of docs) {
    if (query.kinds.length && !query.kinds.includes(d.type)) continue;
    if (from && (!d.date || Date.parse(d.date) < from || Date.parse(d.date) >= to)) continue;
    const title = d.title.toLowerCase(); const text = (d.text || '').toLowerCase(); const tagText = (d.tags || []).join(' ').toLowerCase();
    let score = 0; let ok = true;
    for (const g of groups) {
      const re = new RegExp(`\\b(${g.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
      const t = (title.match(re) || []).length; const tg = (tagText.match(re) || []).length; const x = (text.match(re) || []).length;
      if (!t && !tg && !x) { ok = false; break; }
      score += t * 6 + tg * 5 + Math.min(8, x) + (x ? 1 : 0);
    }
    if (!ok) continue;
    if (!groups.length) score = 1;
    const age = d.date ? (Date.now() - Date.parse(d.date)) / 86400000 : 999;
    score += Math.max(0, 2 - age / 180);
    const flat = groups.flat();
    results.push({
      key: d.key, type: d.type, title: d.title, sub: d.sub || null, date: d.date, thumb: d.thumb || null, tags: d.tags || [], go: d.go || null, link: d.link || null, score,
      snippet: flat.length ? snippet(d, flat) : null,
      at: (d.type === 'sermon' || d.type === 'video') && flat.length ? momentOf(d.projectId, flat) : null,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return { query, total: results.length, results: results.slice(0, limit) };
}

export function invalidateSearch() { built = null; }
