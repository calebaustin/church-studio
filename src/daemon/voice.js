// Brand voice: the church's own words (mission, website copy, core themes and writing samples).
// Used three ways, all offline: a "sounds like you" score while writing, nudging drafts toward the
// church's themes, and (when an AI helper is on) a short style guide sent along with rewrites.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './tools.js';
import { STOPWORDS } from './text.js';

const STORE = path.join(DATA_DIR, 'brand-voice.json');
const EMPTY = { mission: '', website: '', themes: [], samples: [] };

export async function loadVoice() {
  if (!existsSync(STORE)) return { ...EMPTY };
  try { return { ...EMPTY, ...JSON.parse(await readFile(STORE, 'utf8')) }; } catch { return { ...EMPTY }; }
}
async function save(v) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${STORE}.tmp`, JSON.stringify(v, null, 2));
  await rename(`${STORE}.tmp`, STORE);
  return v;
}
export async function updateVoice(patch) {
  const v = await loadVoice();
  if (typeof patch.mission === 'string') v.mission = patch.mission.slice(0, 2000);
  if (typeof patch.website === 'string') v.website = patch.website.slice(0, 20000);
  if (Array.isArray(patch.themes)) v.themes = patch.themes.map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
  return save(v);
}
export async function addSample({ title = '', text = '', source = 'pasted' }) {
  const clean = String(text).trim();
  if (clean.split(/\s+/).length < 30) throw new Error('Add a little more: at least a paragraph or two.');
  const v = await loadVoice();
  const s = { id: randomUUID().slice(0, 8), title: String(title || clean.split('\n')[0].replace(/^#+\s*/, '')).slice(0, 120), text: clean.slice(0, 30000), source, added: new Date().toISOString() };
  v.samples = [s, ...v.samples].slice(0, 40);
  await save(v);
  return s;
}
/**
 * Keep the newest blog posts as writing samples, so writing help sounds like the church's own posts.
 * Replaces earlier blog samples (pasted and Writing samples stay). posts: [{ title, text, link, date }].
 */
export async function setBlogSamples(posts) {
  const v = await loadVoice();
  const old = new Map(v.samples.filter((x) => x.source === 'blog').map((x) => [x.link, x]));
  const blog = posts.map((p) => old.get(p.link) || { id: randomUUID().slice(0, 8), title: String(p.title || 'Blog post').slice(0, 120), text: String(p.text).trim().slice(0, 30000), source: 'blog', link: p.link, added: p.date || new Date().toISOString() });
  v.samples = [...v.samples.filter((x) => x.source !== 'blog'), ...blog].slice(0, 40);
  await save(v);
  return blog.length;
}
export async function clearBlogSamples() {
  const v = await loadVoice();
  v.samples = v.samples.filter((x) => x.source !== 'blog');
  return save(v);
}
export async function removeSample(id) {
  const v = await loadVoice();
  v.samples = v.samples.filter((s) => s.id !== id);
  return save(v);
}

// ---------------------------------------------------------------- scoring
const plain = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').replace(/[#>*_`]|!\[[^\]]*\]\([^)]*\)|\]\([^)]*\)/g, ' ');
const tokens = (t) => (plain(t).toLowerCase().match(/[a-z][a-z'’]+/g) || []).map((w) => w.replace(/['’]s$/, '')).filter((w) => w.length > 2 && !STOPWORDS.has(w));
const sentences = (t) => plain(t).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
const freq = (list) => { const m = new Map(); for (const w of list) m.set(w, (m.get(w) || 0) + 1); return m; };
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [k, v] of b) { nb += v * v; if (a.has(k)) dot += v * a.get(k); }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
const avgLen = (ss) => (ss.length ? ss.reduce((n, s) => n + s.split(/\s+/).length, 0) / ss.length : 0);
const rate = (t, re) => { const all = (plain(t).match(/\b\w+\b/g) || []).length || 1; return (plain(t).match(re) || []).length / all; };
/** Words of a theme, to look for in a draft. "Grace for everyone" -> grace, everyone. */
export const themeWords = (theme) => tokens(theme).map(stem).filter((w) => w.length > 2);

export function corpusOf(v) {
  return [v.mission, v.website, ...v.themes, ...v.samples.map((s) => s.text)].filter(Boolean).join('\n\n');
}

/** How much a draft sounds like the church. Returns a 0-100 score with checks like the SEO panel. */
export function scoreVoice(text, v) {
  const corpus = corpusOf(v);
  const ready = corpus.split(/\s+/).length >= 60 || v.themes.length >= 2;
  if (!ready) return { ready: false };
  const d = tokens(text);
  if (d.length < 25) return { ready: true, short: true };
  const checks = [];
  // 1. Vocabulary: shared words, weighted toward the church's distinctive ones.
  const sim = cosine(freq(tokens(corpus).map(stem)), freq(d.map(stem)));
  const vocab = Math.min(100, Math.round(sim * 260));
  checks.push({ label: 'Sounds like your church', status: vocab >= 60 ? 'good' : vocab >= 35 ? 'ok' : 'bad', score: vocab,
    note: 'Use more of the words and phrases from your mission, website and samples.' });
  // 2. Themes that show up.
  const ds = new Set(d.map(stem));
  const found = v.themes.filter((t) => { const w = themeWords(t); return w.length && w.filter((x) => ds.has(x)).length >= Math.ceil(w.length / 2); });
  const themeScore = v.themes.length ? Math.round((found.length / Math.min(v.themes.length, 3)) * 100) : null;
  if (themeScore != null) {
    const missing = v.themes.filter((t) => !found.includes(t)).slice(0, 2);
    checks.push({ label: `${found.length} of ${v.themes.length} themes show up`, status: themeScore >= 66 ? 'good' : themeScore >= 33 ? 'ok' : 'bad', score: Math.min(100, themeScore),
      note: missing.length ? `Where it fits, touch on ${missing.map((m) => `“${m}”`).join(' or ')}.` : '' });
  }
  // 3. Sentence rhythm.
  const target = avgLen(sentences(corpus)); const mine = avgLen(sentences(text));
  if (target) {
    const diff = Math.abs(mine - target);
    const rhythm = Math.max(0, Math.round(100 - diff * 7));
    checks.push({ label: 'Sentence rhythm', status: rhythm >= 70 ? 'good' : rhythm >= 45 ? 'ok' : 'bad', score: rhythm,
      note: mine > target ? `Your church writes shorter sentences (about ${Math.round(target)} words). Try splitting a few.` : `Your church writes a little longer sentences (about ${Math.round(target)} words).` });
  }
  // 4. Warmth: "we and our" versus "you", compared with the church's own writing.
  const weT = rate(corpus, /\b(we|our|us)\b/gi); const weD = rate(text, /\b(we|our|us)\b/gi);
  const youT = rate(corpus, /\b(you|your)\b/gi); const youD = rate(text, /\b(you|your)\b/gi);
  const warmth = Math.max(0, Math.round(100 - (Math.abs(weT - weD) + Math.abs(youT - youD)) * 1400));
  checks.push({ label: 'Speaks like you do', status: warmth >= 70 ? 'good' : warmth >= 45 ? 'ok' : 'bad', score: warmth,
    note: weD < weT ? 'Your church says "we" and "our" more often. Invite readers in.' : youD < youT ? 'Your church speaks to the reader as "you" more often.' : 'Balance "we" and "you" like your samples do.' });
  const weights = { 'Sounds like your church': 0.4, 'Sentence rhythm': 0.2, 'Speaks like you do': 0.15 };
  let total = 0; let wsum = 0;
  for (const c of checks) { const w = weights[c.label] ?? 0.25; total += c.score * w; wsum += w; }
  return { ready: true, score: Math.round(total / wsum), checks };
}

/** Extra ranking for sermon sentences that echo the church's themes. */
export function themeBonus(v) {
  const sets = v.themes.map(themeWords).filter((w) => w.length);
  if (!sets.length) return () => 0;
  return (text) => {
    const ws = new Set(tokens(text).map(stem));
    return sets.reduce((n, w) => n + (w.filter((x) => ws.has(x)).length / w.length >= 0.5 ? 0.12 : 0), 0);
  };
}

/** A short style guide for the AI helper, built from the church's own words. */
export function voiceGuide(v) {
  if (!corpusOf(v).trim()) return '';
  const parts = ['Write in this church\'s voice.'];
  if (v.mission) parts.push(`Mission: ${v.mission.slice(0, 600)}`);
  if (v.themes.length) parts.push(`Core themes to let show up naturally where they fit (never forced): ${v.themes.join('; ')}.`);
  const samples = v.samples.slice(0, 3).map((s) => s.text.slice(0, 1500));
  if (v.website) samples.unshift(v.website.slice(0, 1200));
  if (samples.length) parts.push(`Examples of their writing (match the tone, sentence length and warmth, not the content):\n${samples.map((s, i) => `--- Example ${i + 1}\n${s}`).join('\n')}`);
  return parts.join('\n');
}
