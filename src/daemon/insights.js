// Sermon index: every scripture reference, every story and illustration, and the themes a preacher
// returns to, across all transcribed sermons. Plus series and a report of what hasn't been shared yet.
// Worked out from the transcripts on this Mac and cached next to each project.
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { file, getProject, getTranscript, listProjects } from './projects.js';
import { toSentences, backgroundOf, keywords } from './text.js';
import { lineFeatures } from './clips.js';
import { extractRefs, normalizeText, normalizeWords } from './scripture.js';
import { contentPlan } from './hub.js';

const VERSION = 2;

export async function forProject(id) {
  const tf = file(id, 'transcript.json');
  if (!existsSync(tf)) return null;
  const cache = file(id, 'insights.json');
  const mtime = statSync(tf).mtimeMs;
  if (existsSync(cache)) {
    try { const c = JSON.parse(await readFile(cache, 'utf8')); if (c.mtime === mtime && c.version === VERSION) return c; } catch { /* rebuild */ }
  }
  const project = await getProject(id);
  const t = await getTranscript(id);
  if (!t?.words?.length) return null;
  const range = project.sermon?.confirmed ? project.sermon : null;
  const words = normalizeWords(t.words.filter((w) => !range || (w.start >= range.start && w.end <= range.end)));
  const sentences = toSentences(words).map((s) => ({ ...s, text: normalizeText(s.text) }));
  const refs = [];
  for (const s of sentences) for (const r of extractRefs(s.text, 4)) if (!refs.some((x) => x.ref === r && Math.abs(x.start - s.start) < 60)) refs.push({ ref: r, start: s.start });
  const stories = [];
  sentences.forEach((s, i) => {
    if (!lineFeatures(s.text).story) return;
    if (stories.some((x) => s.start - x.start < 45)) return;
    const text = sentences.slice(i, i + 4).map((x) => x.text).join(' ');
    if (text.split(' ').length >= 18) stories.push({ start: s.start, text: text.slice(0, 600) });
  });
  const all = sentences.map((s) => s.text).join(' ');
  const themes = keywords(all, backgroundOf(sentences), 10);
  const out = { version: VERSION, mtime, refs, stories, themes, words: words.length };
  await writeFile(cache, JSON.stringify(out));
  return out;
}

const BOOK = (ref) => ref.replace(/\s+\d+(:.*)?$/, '');

/** Series names suggested from titles like "Rooted, Part 2", "Rooted | Week 3" or "Rooted (2)". */
function seriesGuess(title) {
  const t = String(title);
  const m = t.match(/^(.{3,40}?)\s*(?:[:|\-–]\s*)?(?:part|week|pt\.?|session|wk)\s*\d+/i) || t.match(/^(.{3,40}?)\s*\(\d+\)/) || t.match(/^(.{3,40}?)\s*[|:]\s+.+/);
  return m ? m[1].replace(/[,|:\-–\s]+$/, '').trim() : null;
}

export async function sermonIndex() {
  const projects = (await listProjects()).filter((p) => p.status === 'transcribed');
  const sermons = [];
  for (const p of projects) {
    const full = await getProject(p.id);
    if (full.blank) continue;
    const i = await forProject(p.id).catch(() => null);
    if (!i) continue;
    sermons.push({ id: p.id, title: p.title, date: p.created, series: full.series || null, guess: seriesGuess(p.title), ...i });
  }
  // Scripture by book.
  const books = new Map();
  for (const s of sermons) for (const r of s.refs) {
    const b = BOOK(r.ref);
    if (!books.has(b)) books.set(b, []);
    books.get(b).push({ ref: r.ref, start: r.start, projectId: s.id, title: s.title, date: s.date });
  }
  const scripture = [...books.entries()].map(([book, refs]) => ({ book, refs: refs.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true })) })).sort((a, b) => b.refs.length - a.refs.length);
  // Illustrations.
  const stories = sermons.flatMap((s) => s.stories.map((x) => ({ ...x, projectId: s.id, title: s.title, date: s.date })));
  // Themes that come back across sermons.
  const tally = new Map();
  for (const s of sermons) for (const k of s.themes) { const t = tally.get(k) || { theme: k, sermons: [] }; t.sermons.push({ id: s.id, title: s.title }); tally.set(k, t); }
  const themes = [...tally.values()].sort((a, b) => b.sermons.length - a.sermons.length).slice(0, 24);
  // Series: set by hand, or suggested from titles.
  const groups = new Map();
  for (const s of sermons) {
    const name = s.series || s.guess;
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, { name, set: false, sermons: [] });
    const g = groups.get(name);
    g.set = g.set || Boolean(s.series);
    g.sermons.push({ id: s.id, title: s.title, date: s.date, set: Boolean(s.series) });
  }
  const series = [...groups.values()].filter((g) => g.set || g.sermons.length >= 2).sort((a, b) => b.sermons.length - a.sermons.length);
  return { count: sermons.length, scripture, stories, themes, series };
}

/** Which sermons haven't been turned into other formats yet. */
export async function gapReport() {
  const projects = (await listProjects()).filter((p) => p.status === 'transcribed');
  const rows = [];
  for (const p of projects) {
    const full = await getProject(p.id);
    if (full.blank) continue;
    const plan = await contentPlan(p.id).catch(() => null);
    if (!plan) continue;
    rows.push({ id: p.id, title: p.title, date: p.created, done: plan.done, total: plan.total, missing: plan.pieces.filter((x) => !x.done && !x.aside).map((x) => x.label) });
  }
  rows.sort((a, b) => a.done / a.total - b.done / b.total);
  return { rows };
}

export function gapMarkdown({ rows }, church = '') {
  const lines = [`# Content report${church ? `: ${church}` : ''}`, '', `Made with Church Studio on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`, ''];
  lines.push(`${rows.length} sermons transcribed. Here's what each one has been turned into so far, and what's still waiting.`, '');
  for (const r of rows) {
    lines.push(`## ${r.title}`, '', `${r.done} of ${r.total} pieces made.`, '');
    if (r.missing.length) lines.push(`Still to make: ${r.missing.join(', ')}.`, '');
  }
  return lines.join('\n');
}
