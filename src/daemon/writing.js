// Writing from a sermon: blog post, email summary, small group guide, social captions.
// Offline and extractive: every sentence comes from the sermon itself (claude-blog's honesty rule:
// never invent stories, numbers or quotes). Anything the writer must add is a [bracketed] placeholder.
// An optional AI helper can polish a draft afterwards.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';
import { getProject, getTranscript } from './projects.js';
import { toSentences, backgroundOf, keywords } from './text.js';
import { lineScore, lineFeatures, SCRIPTURE } from './clips.js';
import { loadConfig } from './config.js';
import { complete, providerReady } from './ai.js';

const DRAFTS = path.join(DATA_DIR, 'writing');

const clean = (t) => t.replace(/\s+/g, ' ').replace(/\s([,.?!;:])/g, '$1').replace(/^(and|but|so|because|now)\s+/i, (m) => '').trim().replace(/^./, (c) => c.toUpperCase());
const sentenceEnd = (t) => (/[.?!]$/.test(t) ? t : `${t}.`);
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const titleCase = (t) => t.replace(/\b([a-z])(\w*)/g, (m, a, b, i) => (i > 0 && /^(a|an|the|and|but|or|of|to|in|on|for|with|at|by)$/.test(m) ? m : a.toUpperCase() + b));

function analyze(words, range) {
  const inRange = words.filter((w) => (!range || (w.start >= range.start && w.end <= range.end)));
  const sentences = toSentences(inRange).filter((s) => s.text.split(' ').length >= 5);
  const scored = sentences.map((s, i) => ({ ...s, i, score: lineScore(s.text), f: lineFeatures(s.text) }));
  const bg = backgroundOf(sentences);
  const all = sentences.map((s) => s.text).join(' ');
  const keys = keywords(all, bg, 8);
  const refs = [...new Set((all.match(new RegExp(SCRIPTURE.source, 'gi')) || []).map((r) => r.replace(/\s+/g, ' ').trim()))].slice(0, 6);
  const questions = scored.filter((s) => s.f.question && s.text.length < 160).sort((a, b) => b.score - a.score).slice(0, 6);
  // Four movements of the sermon, by time.
  const parts = [];
  const per = Math.ceil(scored.length / 4);
  for (let k = 0; k < 4; k++) parts.push(scored.slice(k * per, (k + 1) * per));
  const best = [...scored].sort((a, b) => b.score - a.score);
  return { sentences: scored, keys, refs, questions, parts: parts.filter((p) => p.length), best };
}

/** A short, complete heading: the punchiest short line in a section, or a clean cut at a natural break. */
function headingFor(part, avoid = '') {
  const ranked = [...part].sort((x, y) => y.score - x.score).filter((x, i, arr) => arr.length < 2 || clean(x.text).replace(/[.?!]$/, '').toLowerCase() !== avoid.toLowerCase());
  const short = ranked.find((s) => clean(s.text).length <= 60 && !s.f.dangling);
  if (short) return titleCase(clean(short.text).replace(/[.?!,;:]$/, ''));
  let words = clean(ranked[0].text).replace(/[.?!]$/, '').split(' ');
  const cut = words.findIndex((w, i) => i >= 4 && /[,;:]$/.test(w));
  words = words.slice(0, cut > 0 && cut < 9 ? cut + 1 : 8);
  while (words.length > 3 && /^(a|an|the|and|but|or|of|to|in|on|for|with|my|your|his|her|our|their|that|this|i|we|you|was|is)$/i.test(words.at(-1).replace(/[,;:]$/, ''))) words.pop();
  return titleCase(words.join(' ').replace(/[,;:]$/, ''));
}

function topIn(list, n) {
  return [...list].sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
}

export async function generate(projectId) {
  const project = await getProject(projectId);
  const transcript = await getTranscript(projectId);
  if (!transcript) throw new Error('Transcribe the sermon first.');
  const a = analyze(transcript.words, project.sermon);
  if (!a.sentences.length) throw new Error('Not enough words in the sermon to write from.');
  const main = a.best.find((s) => s.f.apply || s.f.quotable) || a.best[0];
  const topic = a.keys[0] || 'faith';
  const titleLine = a.best.find((s) => s.text.length <= 70 && !s.f.dangling) || main;
  const title = titleCase(clean(titleLine.text).replace(/[.?!]$/, ''));
  // Meta description: the main point plus the next strong line, within 155 characters.
  let metaDescription = sentenceEnd(clean(main.text));
  for (const extra of a.best) {
    if (extra === main) continue;
    const next = `${metaDescription} ${sentenceEnd(clean(extra.text))}`;
    if (next.length <= 155) { metaDescription = next; if (metaDescription.length >= 120) break; }
  }
  const takeaways = topIn(a.best.slice(0, 12), 4).map((s) => `- ${sentenceEnd(clean(s.text))}`);
  const watch = project.sourceUrl ? `[Watch the full message](${project.sourceUrl})` : '[ADD: link to the full message]';

  const sections = a.parts.map((part, k) => {
    const heading = headingFor(part, title);
    const body = topIn(part, Math.min(6, Math.max(3, Math.round(part.length / 6)))).map((s) => sentenceEnd(clean(s.text))).join(' ');
    return `## ${heading}\n\n${body}`;
  });

  const blog = [
    `# ${title}`,
    '',
    `${sentenceEnd(clean(main.text))} [ADD: one sentence on who this message is for.]`,
    '',
    '> **Key takeaways**',
    ...takeaways.map((t) => `> ${t}`),
    '',
    ...sections.flatMap((s) => [s, '']),
    a.refs.length ? `## Scripture in this message\n\n${a.refs.map((r) => `- ${r}`).join('\n')}\n` : '',
    a.questions.length ? `## Questions to sit with\n\n${a.questions.slice(0, 3).map((q) => `- ${sentenceEnd(clean(q.text))}`).join('\n')}\n` : '',
    `## Join us\n\n${watch}. [ADD: service times and address, or a link to plan a visit.]`,
  ].filter((x) => x !== false && x != null).join('\n').replace(/\n{3,}/g, '\n\n');

  const email = [
    `**Subject:** ${title}`,
    `**Preview:** ${metaDescription.slice(0, 90)}`,
    '',
    'Hi [FIRST NAME],',
    '',
    `In case you missed Sunday, here's the heart of the message: ${sentenceEnd(clean(main.text))}`,
    '',
    ...takeaways.slice(0, 3),
    '',
    `${watch}.`,
    '',
    '[ADD: one upcoming event or next step.]',
    '',
    '[YOUR NAME]',
  ].join('\n');

  const groupQs = [
    `What stood out to you most from this message, and why?`,
    ...a.questions.slice(0, 3).map((q) => `The sermon asked: “${sentenceEnd(clean(q.text))}” How would you answer that?`),
    `Where does “${topic}” show up in your week right now?`,
    `What is one step you'll take because of this message?`,
  ];
  const group = [
    `# Small group guide: ${title}`,
    '',
    `**Open:** ${groupQs[0]}`,
    '',
    a.refs.length ? `**Read:** ${a.refs.slice(0, 2).join(', ')}` : '**Read:** [ADD: the main passage]',
    '',
    '**Discuss:**',
    ...groupQs.slice(1).map((q, i) => `${i + 1}. ${q}`),
    '',
    `**Pray:** [ADD: a prayer focus drawn from the message, like asking God to help with ${topic}.]`,
  ].join('\n');

  const lines = topIn(a.best.filter((s) => s.text.length < 220).slice(0, 10), 3);
  const social = lines.map((s, i) => [
    `**Caption ${i + 1}**`,
    `${sentenceEnd(clean(s.text))}`,
    '',
    i === 0 ? 'Share this with someone who needs it today.' : i === 1 ? 'Watch the full message at the link in our bio.' : 'What would change this week if you believed this?',
    '',
    `#${topic.replace(/\s+/g, '')} #sermon #faith`,
  ].join('\n')).join('\n\n');

  const out = {
    generated: new Date().toISOString(), title, slug: slugify(title), metaDescription, keyphrase: topic,
    blog, email, group, social, keywords: a.keys, refs: a.refs,
  };
  return out;
}

export async function loadDraft(projectId) {
  const f = path.join(DRAFTS, `${projectId}.json`);
  if (!existsSync(f)) return null;
  return JSON.parse(await readFile(f, 'utf8'));
}
export async function saveDraft(projectId, draft) {
  await mkdir(DRAFTS, { recursive: true });
  await writeFile(path.join(DRAFTS, `${projectId}.json`), JSON.stringify({ ...draft, saved: new Date().toISOString() }, null, 2));
  return draft;
}

const POLISH_SYSTEM = `You edit church communications. Improve the draft's flow, clarity and warmth while keeping its meaning.
Rules: use only facts, quotes and stories present in the draft or the sermon excerpt. Never invent stories, numbers,
names or results. Keep every [BRACKETED] placeholder exactly as written. Capitalize pronouns for God and Jesus.
No em dashes. Keep Markdown headings. Return only the revised draft.`;

export async function polish(projectId, kind, text) {
  const cfg = await loadConfig();
  if (!providerReady(cfg)) throw new Error('Turn on an AI helper in Settings to polish drafts.');
  const transcript = await getTranscript(projectId);
  const excerpt = (transcript?.words || []).map((w) => w.w).join(' ').slice(0, 12000);
  return complete(cfg, POLISH_SYSTEM, `Kind: ${kind}\n\nSermon excerpt:\n${excerpt}\n\nDraft:\n${text}`);
}
