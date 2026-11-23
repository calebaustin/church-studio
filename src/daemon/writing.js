// Writing from a sermon: blog post, email summary, small group guide, social captions.
// Offline and extractive: every sentence comes from the sermon itself (the honesty rule:
// never invent stories, numbers or quotes). Anything the writer must add is a [bracketed] placeholder.
// An optional AI helper can polish a draft afterwards.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';
import { getProject, getTranscript, listProjects } from './projects.js';
import { cachedEvents } from './calendar.js';
import { toSentences, backgroundOf, keywords, STOPWORDS } from './text.js';
import { lineScore, lineFeatures } from './clips.js';
import { normalizeWords, normalizeText, extractRefs } from './scripture.js';
import { loadConfig, saveConfig } from './config.js';
import { aiStatus, complete, providerReady, withFallback } from './ai.js';
import { assembleBlog, isFragment, sermonDigest, structure, styleExample, tidy, writeBlogWithAI, writeDevotionalWithAI, writeEmailWithAI, writeGuideWithAI } from './blogwriter.js';
import { loadVoice, themeBonus, voiceGuide } from './voice.js';
import { readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const DRAFTS = path.join(DATA_DIR, 'writing');

const clean = (t) => t.replace(/\s+/g, ' ').replace(/\s([,.?!;:])/g, '$1').replace(/^(and|but|so|because|now)\s+/i, (m) => '').trim().replace(/^./, (c) => c.toUpperCase());
const sentenceEnd = (t) => (/[.?!]$/.test(t) ? t : `${t}.`);
const slugify = (t) => t.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const SMALL = /^(a|an|the|and|but|or|of|to|in|on|for|with|at|by)$/;
const titleCase = (t) => t.replace(/(^|[\s"“(-])([a-z])([\w'’]*)/g, (m, pre, a, b, i) => (i > 0 && SMALL.test(a + b) ? m : pre + a.toUpperCase() + b));

function analyze(words, range) {
  const inRange = words.filter((w) => (!range || (w.start >= range.start && w.end <= range.end)));
  // Whole spoken sentences (not 28-word slices), cleaned of filler and repeated phrases.
  const sentences = toSentences(normalizeWords(inRange), { maxWords: 60, gap: 1.6 }).map((s) => ({ ...s, text: tidy(normalizeText(s.text)) })).filter((s) => s.text.split(' ').length >= 5);
  const scored = sentences.map((s, i) => {
    const f = { ...lineFeatures(s.text), fragment: isFragment(s.text) };
    return { ...s, i, score: lineScore(s.text) - (f.fragment ? 5 : 0) - (s.text.split(' ').length > 45 ? 1.5 : 0), f };
  });
  const bg = backgroundOf(sentences);
  const all = sentences.map((s) => s.text).join(' ');
  const keys = keywords(all, bg, 8);
  const refs = extractRefs(all, 6);
  // The message's own parts: split where the preacher turns, without the opening small talk or the closing invitation.
  const st = structure(scored);
  const body = scored.slice(st.startAt, st.endAt);
  const usable = (s) => !s.f.fragment && !s.f.housekeeping;
  const questions = body.filter((s) => s.f.question && s.text.length < 160 && !s.f.dangling && usable(s)).sort((a, b) => b.score - a.score).slice(0, 6);
  const parts = st.sections.length ? st.sections : [body];
  const best = [...body].filter(usable).sort((a, b) => b.score - a.score);
  return { sentences: scored, body, keys, refs, questions, parts: parts.filter((p) => p.length), best: best.length ? best : [...scored].sort((a, b) => b.score - a.score), all };
}

/** A short, complete heading: the punchiest short line in a section, or a clean cut at a natural break. */
function headingFor(part, avoid = '') {
  const ranked = [...part].sort((x, y) => y.score - x.score).filter((x, i, arr) => arr.length < 2 || clean(x.text).replace(/[\s.,;:?!]+$/, '').toLowerCase() !== avoid.toLowerCase());
  const short = ranked.find((s) => clean(s.text).length <= 60 && !s.f.dangling);
  if (short) return titleCase(clean(short.text).replace(/[.?!,;:]$/, ''));
  let words = clean(ranked[0].text).replace(/[\s.,;:?!]+$/, '').split(' ');
  const cut = words.findIndex((w, i) => i >= 4 && /[,;:]$/.test(w));
  words = words.slice(0, cut > 0 && cut < 9 ? cut + 1 : 8);
  while (words.length > 3 && /^(a|an|the|and|but|or|of|to|in|on|for|with|my|your|his|her|our|their|that|this|i|we|you|was|is)$/i.test(words.at(-1).replace(/[,;:]$/, ''))) words.pop();
  return titleCase(words.join(' ').replace(/[,;:]$/, ''));
}

function topIn(list, n) {
  return [...list].sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
}

const has = (text, kp) => kp && text.toLowerCase().includes(kp.toLowerCase());

/** Two-word phrases the preacher kept coming back to ("god's grace", "second chances"). */
function phrases(sentences, n = 6) {
  const tally = new Map();
  const base = (w) => w.toLowerCase().replace(/['’]s$/, '');
  for (const s of sentences) {
    const raw = s.text.match(/[A-Za-z][A-Za-z'’]+/g) || [];
    for (let k = 0; k < raw.length - 1; k++) {
      const a = base(raw[k]); const b = base(raw[k + 1]);
      if (a.length < 3 || b.length < 3 || STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
      const key = `${a} ${b}`;
      const t = tally.get(key) || { c: 0, form: `${raw[k]} ${raw[k + 1]}`.replace(/^(\w)/, (x) => (raw[k] === raw[k].toUpperCase() || /^(God|Jesus|Christ|Lord|Spirit)/.test(raw[k]) ? x : x.toLowerCase())) };
      t.c++; tally.set(key, t);
    }
  }
  return [...tally.values()].filter((t) => t.c >= 2).sort((x, y) => y.c - x.c).slice(0, n).map((t) => t.form.replace(/[.,;:]$/, ''));
}
/** The keyphrase as the sermon writes it ("God's grace", not "god's grace"). */
const casedIn = (all, kp) => { if (!kp) return kp; const m = all.match(new RegExp(kp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')); return m && !/^[A-Z]/.test(kp) && /^[A-Z]/.test(m[0]) && /^(god|jesus|christ|lord|holy)/i.test(kp) ? m[0] : kp; };

/** Meta descriptions: whole sentences from the sermon, 120 to 155 characters when possible. */
function metasFor(a, kp, n = 4) {
  const pool = a.best.filter((s) => clean(s.text).length <= 150 && !s.f.dangling && !s.f.context).slice(0, 24);
  const firsts = [...pool.filter((s) => has(s.text, kp)), ...pool.filter((s) => !has(s.text, kp))];
  const out = [];
  for (const lead of firsts) {
    let m = sentenceEnd(clean(lead.text));
    for (const extra of pool) {
      if (extra === lead || m.length >= 120) continue;
      const next = `${m} ${sentenceEnd(clean(extra.text))}`;
      if (next.length <= 155) m = next;
    }
    if (!out.includes(m)) out.push(m);
    if (out.length >= n) break;
  }
  return out;
}

/** Choices for the blog's title, keyphrase, web address and meta description. */
export async function suggest(projectId, { keyphrase = '' } = {}) {
  const { a } = await load(projectId);
  // With the sermon summary, the choices come from what the message is about, not lines lifted from it.
  const digest = await savedDigest(projectId);
  if (digest?.length) return suggestFromDigest(a, digest, keyphrase);
  const kpList = [...new Set([...phrases(a.sentences, 5), ...a.keys.slice(0, 6), ...a.refs.slice(0, 2)])].slice(0, 10);
  const kp = keyphrase || kpList[0] || '';
  const Kp = titleCase(kp);
  const shortLines = a.best.filter((s) => clean(s.text).length <= 64 && clean(s.text).length >= 18 && !s.f.dangling && !s.f.context && !s.f.housekeeping).slice(0, 5)
    .map((s) => titleCase(clean(s.text).replace(/[.,;:]$/, '')));
  const q = a.questions.find((s) => clean(s.text).length <= 64);
  const titles = [
    ...shortLines.slice(0, 3),
    kp && `What the Bible Says About ${Kp}`,
    kp && shortLines[0] && `${Kp}: ${shortLines[0]}`.length <= 70 && `${Kp}: ${shortLines[0]}`,
    q && titleCase(clean(q.text)),
    a.refs[0] && kp && `${a.refs[0]} and ${Kp}`,
  ].filter(Boolean);
  return {
    keyphrases: kpList,
    titles: [...new Set(titles)].slice(0, 7),
    metas: metasFor(a, kp),
  };
}

/** Titles, keyphrases and descriptions built from the summary's points. */
function suggestFromDigest(a, digest, keyphrase = '') {
  const points = digest.map((d) => String(d.point || '').replace(/[.?!:]+$/, '')).filter(Boolean);
  // Keyphrases: the sermon's own recurring phrases (like "Lord's Supper"), ranked by how much the summary is about them.
  const text = digest.map((d) => `${d.point} ${d.summary}`).join(' ').toLowerCase();
  const hits = (ph) => (text.match(new RegExp(`\\b${ph.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) || []).length;
  const cands = [...new Set([...phrases(a.sentences, 14), ...a.keys.slice(0, 12)])];
  const ranked = cands.map((ph, i) => ({ ph, n: hits(ph), i })).filter((x) => x.n > 0).sort((x, y) => (y.ph.includes(' ') - x.ph.includes(' ')) || y.n - x.n || x.i - y.i).map((x) => x.ph);
  const kpList = [...new Set([...ranked, ...cands, ...a.refs.slice(0, 2)])].slice(0, 10);
  const kp = keyphrase || kpList[0] || '';
  const Kp = titleCase(kp);
  const titles = [
    ...points.slice(0, 4).map((pt) => titleCase(pt)).filter((t) => t.length <= 70),
    kp && `What the Bible Says About ${Kp}`,
    kp && points[0] && `${Kp}: ${titleCase(points[0])}`.length <= 70 && `${Kp}: ${titleCase(points[0])}`,
    a.refs[0] && kp && `${a.refs[0]} and ${Kp}`,
  ].filter(Boolean);
  // Descriptions: a summary sentence that names the keyphrase when it can, under 156 characters.
  const sentences = digest.flatMap((d) => String(d.summary || '').split(/(?<=[.?!])\s+/)).map((x) => x.trim()).filter((x) => x.length > 40);
  const metas = [...sentences.filter((x) => kp && x.toLowerCase().includes(kp.toLowerCase())), ...sentences].map((x) => (x.length > 155 ? `${x.slice(0, 152).replace(/\s+\S*$/, '')}…` : x));
  return { keyphrases: kpList, titles: [...new Set(titles)].slice(0, 7), metas: [...new Set(metas)].slice(0, 5), fromDigest: true };
}

async function load(projectId) {
  const project = await getProject(projectId);
  const transcript = await getTranscript(projectId);
  if (!transcript) throw new Error('Transcribe the sermon first.');
  const a = analyze(transcript.words, project.sermon);
  if (!a.sentences.length) throw new Error('Not enough words in the sermon to write from.');
  // Lines that echo the church's own themes rank a little higher.
  const voice = await loadVoice();
  const bonus = themeBonus(voice);
  a.best = [...a.best].sort((x, y) => (y.score + bonus(y.text)) - (x.score + bonus(x.text)));
  a.mission = voice.mission;
  a.voice = voice;
  a.church = (await loadConfig()).churchInfo || {};
  return { project, a };
}

export const ANGLES = [
  ['teaching', 'Main points'],
  ['story', 'Story first'],
  ['steps', 'Practical steps'],
  ['questions', 'Questions answered'],
  ['devotional', 'Short devotional'],
  ['newcomer', 'For newcomers'],
];

/** The lines that follow a sentence in the sermon (to answer a question or support a step). */
const after = (a, s, n = 3) => a.sentences.slice(s.i + 1, s.i + 1 + n).filter((x) => !x.f.housekeeping).map((x) => sentenceEnd(clean(x.text))).join(' ');

function blogFor(a, project, { title, keyphrase = '', angle = 'teaching' } = {}) {
  const kp = casedIn(a.all, keyphrase.trim());
  const main = a.best.find((s) => has(s.text, kp) && (s.f.apply || s.f.quotable)) || a.best.find((s) => s.f.apply || s.f.quotable) || a.best[0];
  const watch = project.sourceUrl ? `[Watch the full message](${project.sourceUrl})` : '[ADD: link to the full message]';
  const kpLine = kp && !has(main.text, kp) ? ` Here's what this message says about ${kp}.` : '';
  const takeaways = topIn([...a.best.filter((s) => has(s.text, kp)).slice(0, 2), ...a.best.slice(0, 10)].filter((s, i, arr) => arr.indexOf(s) === i), 4)
    .map((s) => `- ${sentenceEnd(clean(s.text))}`);
  const scripture = a.refs.length ? `## Scripture in this message\n\n${a.refs.map((r) => `- ${r}`).join('\n')}` : '';
  const join = `## Join us\n\n${a.mission ? `${sentenceEnd(a.mission.trim())}\n\n` : ''}${watch}. [ADD: service times and address, or a link to plan a visit.]`;
  const kpHeading = (h) => (kp ? `What this message teaches about ${kp}` : h);
  const sections = (n = 6) => a.parts.map((part, k) => {
    const heading = k === 1 && kp && !a.parts.some((p) => has(headingFor(p, title), kp)) ? kpHeading('') : headingFor(part, title);
    const pick = topIn([...part.filter((s) => has(s.text, kp)).slice(0, 1), ...part].filter((s, i, arr) => arr.indexOf(s) === i), Math.min(n, Math.max(3, Math.round(part.length / 6))));
    return `## ${titleCase(heading)}\n\n${pick.map((s) => sentenceEnd(clean(s.text))).join(' ')}`;
  });
  const intro = `${sentenceEnd(clean(main.text))}${kpLine} [ADD: one sentence on who this message is for.]`;
  const key = ['> **Key takeaways**', ...takeaways.map((t) => `> ${t}`)].join('\n');
  let body;
  if (angle === 'story') {
    const stories = a.sentences.filter((s) => s.f.story && !s.f.housekeeping).slice(0, 2);
    const open = stories.length ? stories.map((s) => `${sentenceEnd(clean(s.text))} ${after(a, s, 3)}`).join('\n\n') : '[ADD: a story from the message or from your church family.]';
    body = [open, `## The point\n\n${intro}`, key, ...sections(4), scripture, join];
  } else if (angle === 'steps') {
    const pool = a.sentences.filter((s) => s.f.apply && !s.f.dangling && !s.f.housekeeping && !s.f.question).sort((x, y) => y.score - x.score);
    const picked = [];
    for (const s of [...pool, ...a.best.filter((x) => !x.f.question && !x.f.dangling && !x.f.housekeeping)]) if (picked.length < (pool.length >= 3 ? 5 : 4) && picked.every((p) => Math.abs(p.i - s.i) > 2)) picked.push(s);
    const steps = picked.sort((x, y) => x.i - y.i);
    const stepHead = (s) => {
      const t = clean(s.text).replace(/[\s.,;:?!]+$/, '');
      const colon = t.split(/:\s+/);
      if (colon.length === 2 && colon[1].length <= 60) return titleCase(colon[1].replace(/^./, (c) => c.toUpperCase()));
      return t.length <= 64 ? titleCase(t) : headingFor([s]);
    };
    const list = steps.map((s, k) => {
      const head = stepHead(s);
      const lead = clean(s.text).replace(/[\s.,;:?!]+$/, '').length <= 64 ? '' : `${sentenceEnd(clean(s.text))} `;
      return `### ${k + 1}. ${head}\n\n${lead}${after(a, s, 2)}`;
    });
    body = [intro, `## ${steps.length} ${kp ? `steps toward ${kp}` : 'things to take into this week'}`, ...list, scripture, join];
  } else if (angle === 'questions') {
    const qs = [];
    for (const q of a.questions) if (qs.length < 4 && qs.every((p) => Math.abs(p.i - q.i) > 3)) qs.push(q);
    qs.sort((x, y) => x.i - y.i);
    const list = qs.length ? qs.map((s) => `## ${clean(s.text)}\n\n${after(a, s, 4)}`) : sections(5);
    body = [intro, ...list, key, scripture, join];
  } else if (angle === 'devotional') {
    body = [
      a.refs.length ? `**Read:** ${a.refs.slice(0, 2).join(', ')}` : '**Read:** [ADD: the main passage]',
      intro,
      topIn(a.best.slice(0, 8), 4).map((s) => sentenceEnd(clean(s.text))).join(' '),
      `## Reflect\n\n${(a.questions.length ? a.questions.slice(0, 2) : a.best.slice(0, 2)).map((s) => `- ${sentenceEnd(clean(s.text))}`).join('\n')}`,
      '## Pray\n\n[ADD: a short prayer that responds to this message.]',
      `${watch}.`,
    ];
  } else if (angle === 'newcomer') {
    body = [
      '[ADD: a warm welcome from your church, in one or two sentences.]',
      `## What this message was about\n\n${intro}`,
      key,
      ...sections(3).slice(0, 3),
      scripture,
      '## Visiting for the first time?\n\n[ADD: what to expect on a Sunday: times, parking, kids, what to wear.]',
      join,
    ];
  } else {
    return localPost(a, project, { title, kp });
  }
  return [`# ${title}`, ...body].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n');
}

/** The line that closes every post: watch the sermon, then come worship (real times when the church set them). */
function inviteLine(a, project) {
  const name = a.church?.name || 'us';
  const times = a.church?.times ? ` ${a.church.times.replace(/^Sundays?/i, (m) => m)}` : ' [ADD: service times]';
  const watch = project.sourceUrl ? `[Watch the full sermon](${project.sourceUrl})` : 'Watch the full sermon';
  return `${watch}, and join ${name} for worship${times}.`;
}
const usable = (s) => !s.f.fragment && !s.f.housekeeping && !s.f.dangling;
/** Sentences for a short paragraph, in the order they were said. */
const para = (list, n) => topIn(list.filter(usable), n).map((s) => sentenceEnd(clean(s.text))).join(' ');

/**
 * The offline post, in the shape good sermon recaps share: a hook and the main idea up top, a heading and two
 * short paragraphs per point, a closing that applies it, then the invitation. Every sentence is from the sermon.
 */
function localPost(a, project, { title, kp = '' }) {
  const open = a.parts[0] || a.body;
  // Lines about the message's own subject (its key words), so asides and small talk don't lead.
  const keys = a.keys.map((k) => k.toLowerCase());
  const onTopic = (s) => keys.some((k) => s.text.toLowerCase().includes(k));
  const fit = (s) => usable(s) && s.text.split(' ').length >= 8 && s.text.split(' ').length <= 30 && !s.f.question;
  const hook = open.find((s) => fit(s) && onTopic(s)) || open.find(fit);
  const passage = a.body.find((s) => usable(s) && extractRefs(s.text, 1).length && s.text.split(' ').length <= 35);
  const main = a.best.find((s) => has(s.text, kp) && (s.f.apply || s.f.quotable)) || a.best.find((s) => s.f.apply || s.f.quotable) || a.best[0];
  const intro = [...new Set([hook, passage, main].filter(Boolean))].sort((x, y) => x.i - y.i).map((s) => sentenceEnd(clean(s.text))).join(' ');
  const sections = a.parts.map((part) => {
    const all = part.filter(usable);
    if (!all.length) return null;
    const topical = all.filter(onTopic);
    const pool = topical.length >= 3 ? topical : all;
    const ranked = topIn(pool, Math.min(5, Math.max(3, Math.round(pool.length / 6))));
    const half = Math.ceil(ranked.length / 2);
    return { heading: titleCase(headingFor(pool, title)), paras: [ranked.slice(0, half), ranked.slice(half)].filter((g) => g.length).map((g) => g.map((s) => sentenceEnd(clean(s.text))).join(' ')) };
  }).filter(Boolean);
  const last = a.parts.at(-1) || a.body;
  const closing = para(last.filter((s) => s.f.apply && !s.f.question), 2) || '';
  return assembleBlog({ title, intro, sections, closing, invite: inviteLine(a, project) });
}

// Endings for "The sermon said: “…”" prompts. Rotated so a guide never repeats one.
const QUOTE_ENDINGS = [
  'How would you put that in your own words?',
  'Where have you seen this play out in your own life?',
  'What makes this hard to believe or live out?',
  'Who in your life needs to hear this?',
  'What would change this week if you took this seriously?',
  'Does this comfort you, challenge you, or both? Why?',
  'How does this connect to the passage we read?',
  'What would living this out look like at home or at work?',
  'When have you found this hard to accept?',
  'What part of this would you push back on or want to ask about?',
  'How does this shape the way you see God?',
  'How does this change the way you treat the people around you?',
  'What is one small step you could take toward this?',
  'If a friend who doesn’t go to church heard this, what would they think?',
];
const QUESTION_ENDINGS = ['How would you answer that?', 'How would you answer that honestly right now?', 'What answer do you find yourself living by most days?'];
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

function groupFor(a, title, topic) {
  const endings = shuffle(QUOTE_ENDINGS);
  const asked = a.questions.slice(0, 2).map((q, k) => `The sermon asked: “${sentenceEnd(clean(q.text))}” ${QUESTION_ENDINGS[k % QUESTION_ENDINGS.length]}`);
  const quotes = topIn(a.best.filter((s) => !s.f.question && !s.f.dangling && !s.f.context && !s.f.housekeeping && clean(s.text).length < 170).slice(0, 10), 4)
    .map((s, k) => `The sermon said: “${sentenceEnd(clean(s.text))}” ${endings[k]}`);
  const discuss = [...asked, ...quotes].slice(0, 6);
  return [
    `# Small group guide: ${title}`,
    '',
    '**Open:** What stood out to you most from this message, and why?',
    '',
    a.refs.length ? `**Read:** ${a.refs.slice(0, 2).join(', ')}` : '**Read:** [ADD: the main passage]',
    '',
    '**Discuss:**',
    ...discuss.map((q, i) => `${i + 1}. ${q}`),
    `${discuss.length + 1}. What is one step you'll take because of this message?`,
    '',
    `**Pray:** [ADD: a prayer focus drawn from the message, like asking God to help with ${topic}.]`,
  ].join('\n');
}

/**
 * A devotional series: one short reading a day for 3, 5 or 7 days, walking through the sermon in
 * order. Each day has a passage to read, the sermon's own words, a question and a prayer prompt.
 */
function devotionalFor(a, title, days = 5) {
  const n = [3, 5, 7].includes(Number(days)) ? Number(days) : 5;
  const ok = (s) => !s.f.dangling && !s.f.context && !s.f.housekeeping && !s.f.logistics;
  const per = Math.ceil(a.sentences.length / n);
  const out = [`# ${n}-day devotional: ${title}`, '', `A short reading for each day this week, from Sunday's message.`];
  for (let d = 0; d < n; d++) {
    const part = a.sentences.slice(d * per, (d + 1) * per);
    if (!part.length) break;
    const strong = [...part].filter(ok).sort((x, y) => y.score - x.score);
    const lead = strong.find((s) => !s.f.question) || part[0];
    const body = topIn([lead, ...strong.filter((s) => s !== lead && !s.f.question)].slice(0, 6), 3).map((s) => sentenceEnd(clean(s.text))).join(' ');
    const q = part.find((s) => s.f.question && ok(s) && clean(s.text).length < 160) || a.questions[d % Math.max(1, a.questions.length)];
    const apply = strong.find((s) => s.f.apply && !s.f.question);
    const ref = a.refs[d % Math.max(1, a.refs.length)];
    const head = headingFor(part, title);
    out.push('', `## Day ${d + 1}: ${titleCase(head)}`, '',
      ref ? `**Read:** ${ref}` : '**Read:** [ADD: a passage for today]', '',
      body, '',
      `**Reflect:** ${q ? sentenceEnd(clean(q.text)) : 'Where do you see this in your own life right now?'}`, '',
      ...(apply ? [`**Try today:** ${sentenceEnd(clean(apply.text))}`, ''] : []),
      `**Pray:** [ADD: a one-line prayer about ${titleCase(head).toLowerCase()}.]`);
  }
  return out.join('\n');
}

/** Rebuild the devotional with a different number of days. */
export async function devotional(projectId, days = 5) {
  const { project, a } = await load(projectId);
  const titleLine = a.best.find((s) => s.text.length <= 70 && !s.f.dangling) || a.best[0];
  return { text: devotionalFor(a, titleCase(clean(titleLine.text).replace(/[\s.,;:?!]+$/, '')) || project.title, days) };
}

export async function generate(projectId) {
  const { project, a } = await load(projectId);
  const main = a.best.find((s) => s.f.apply || s.f.quotable) || a.best[0];
  const topic = phrases(a.sentences, 1)[0] || a.keys[0] || 'faith';
  const titleLine = a.best.find((s) => s.text.length <= 70 && !s.f.dangling) || main;
  const title = titleCase(clean(titleLine.text).replace(/[\s.,;:?!]+$/, ''));
  const metaDescription = metasFor(a, topic, 1)[0] || sentenceEnd(clean(main.text)).slice(0, 155);
  const takeaways = topIn(a.best.slice(0, 12), 4).map((s) => `- ${sentenceEnd(clean(s.text))}`);
  const watch = project.sourceUrl ? `[Watch the full message](${project.sourceUrl})` : '[ADD: link to the full message]';

  const blog = blogFor(a, project, { title, keyphrase: topic, angle: 'teaching' });

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

  const group = groupFor(a, title, topic);
  const devo = devotionalFor(a, title, 5);

  const lines = topIn(a.best.filter((s) => s.text.length < 220).slice(0, 10), 3);
  const social = lines.map((s, i) => [
    `**Caption ${i + 1}**`,
    `${sentenceEnd(clean(s.text))}`,
    '',
    i === 0 ? 'Share this with someone who needs it today.' : i === 1 ? 'Watch the full message at the link in our bio.' : 'What would change this week if you believed this?',
    '',
    `#${topic.replace(/\s+/g, '')} #sermon #faith`,
  ].join('\n')).join('\n\n');

  return {
    generated: new Date().toISOString(), title, slug: slugify(title), metaDescription, keyphrase: topic, angle: 'teaching',
    blog, email, group, social, devotional: devo, keywords: a.keys, refs: a.refs,
  };
}

const ANGLE_NOTES = {
  teaching: 'Organize it around the sermon\'s main points.',
  story: 'Open with a story the preacher told, then draw out the point.',
  steps: 'Organize it as practical, numbered steps a reader can take this week.',
  questions: 'Organize it around the questions the sermon raised, each answered from the sermon.',
  devotional: 'Make it a short devotional: Scripture, a brief reflection, two reflection questions, a prayer placeholder.',
  newcomer: 'Write for someone new to church: plain words, no insider terms, a warm invitation.',
};

/** Write the blog again from the chosen title, keyphrase and angle. With an AI helper, it rewrites the prose too. */
export async function rewriteBlog(projectId, { title, keyphrase, slug, metaDescription, angle = 'teaching', ai = false, signal, onPartial } = {}) {
  const { project, a } = await load(projectId);
  const draft = blogFor(a, project, { title, keyphrase, angle });
  if (!ai) return { text: draft };
  const cfg = await loadConfig();
  if (!providerReady(cfg)) throw new Error('Turn on an AI helper in Settings to rewrite with AI.');
  const guide = voiceGuide(await loadVoice());
  const system = `${POLISH_SYSTEM}\n${guide}\nThis is a church blog post. ${ANGLE_NOTES[angle] || ''} Use the title "${title}" as the H1.
Use the focus keyphrase "${keyphrase}" naturally in the first paragraph and in one subheading. Keep it between 600 and 1000 words.`;
  // Written part by part (small requests that suit on-device helpers), in the church's own blog voice when its
  // posts are connected. Any part the helper can't write keeps the local version.
  let local = 0;
  // The church's own posts teach the helper its voice. If the blog isn't connected yet, try the church website once.
  if (!a.voice?.samples?.some((x) => x.source === 'blog') && cfg.blogVoice !== false && cfg.churchInfo?.website && !cfg.blogAutoTried) {
    await saveConfig({ blogAutoTried: new Date().toISOString() });
    try { const { syncBlog } = await import('./blog.js'); await syncBlog({ url: cfg.churchInfo.website }); a.voice = await loadVoice(); } catch { /* no blog found: write without it */ }
  }
  const r = await withFallback(cfg, async () => {
    // Each finished section is sent along as it's written, so the post fills in on screen.
    const onSection = onPartial ? (done) => onPartial(assembleBlog({ title, intro: '', sections: done, closing: '', invite: '' })) : undefined;
    // The whole-sermon summary (made after transcribing, or now) gives each section the big picture.
    const digest = await makeDigest(projectId, { signal }).catch((e) => { if (signal?.aborted) throw e; return null; });
    const out = await writeBlogWithAI(cfg, a, { title, keyphrase, angleNote: ANGLE_NOTES[angle] || '', guide, example: styleExample(a.voice?.samples, a.all), digest, signal, onSection });
    const localSections = (() => { const md = localPost(a, project, { title, kp: keyphrase }); return md.split(/\n## /).slice(1).map((chunk) => { const [heading, ...rest] = chunk.split('\n\n'); return { heading, paras: rest.filter((x) => !x.startsWith('[Watch') && !x.includes('join ')) }; }); })();
    const sections = out.sections.map((x, k) => { if (x) return x; local++; return localSections[k] || null; }).filter(Boolean);
    const f = out.frame || {};
    return assembleBlog({ title: title?.trim() || f.title?.trim() || 'Untitled post', intro: f.intro || localPost(a, project, { title, kp: keyphrase }).split('\n\n')[1] || '', sections, closing: f.closing || '', invite: inviteLine(a, project) });
  }, () => draft);
  const notice = r.notice?.text || (r.local ? `${PROVIDER_LABEL(cfg)} couldn't write this one, so it was written locally.` : local ? `${PROVIDER_LABEL(cfg)} wrote most of this. ${local} part${local === 1 ? ' was' : 's were'} written locally.` : null);
  return { text: r.value, notice };
}
const PROVIDER_LABEL = (cfg) => ({ cshelper: 'CS Helper', apple: 'Apple Intelligence', anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', ollama: 'Ollama' }[cfg.llmProvider] || 'The helper');

/** Good moments for a still from the sermon video: strong lines, at least 40 seconds apart. */
export async function stillTimes(projectId, n = 6) {
  const { a, project } = await load(projectId);
  const picks = [];
  for (const s of a.best) {
    if (s.f.housekeeping || s.f.logistics) continue;
    const t = s.start + Math.min(1.5, (s.end - s.start) / 2);
    if (picks.every((p) => Math.abs(p - t) > 40)) picks.push(t);
    if (picks.length >= n) break;
  }
  return { times: picks.sort((x, y) => x - y), project };
}

/** A sermon outline for slides and carousels: title, passages, main points, quotes, questions. */
export async function outline(projectId) {
  const { project, a } = await load(projectId);
  const titleLine = a.best.find((s) => s.text.length <= 70 && !s.f.dangling) || a.best[0];
  const ok = (s) => !s.f.dangling && !s.f.context && !s.f.housekeeping && !s.f.logistics;
  const points = a.parts.map((part) => {
    const best = [...part].filter(ok).sort((x, y) => y.score - x.score)[0] || part[0];
    return { heading: headingFor(part), line: sentenceEnd(clean(best.text)) };
  });
  const quotes = topIn(a.best.filter((s) => ok(s) && !s.f.question && clean(s.text).length <= 120).slice(0, 12), 6).map((s) => sentenceEnd(clean(s.text)));
  const steps = a.sentences.filter((s) => s.f.apply && ok(s) && !s.f.question).sort((x, y) => y.score - x.score).slice(0, 3).map((s) => sentenceEnd(clean(s.text)));
  return {
    title: titleCase(clean(titleLine.text).replace(/[\s.,;:?!]+$/, '')), sermon: project.title,
    refs: a.refs, points, quotes, questions: a.questions.slice(0, 3).map((q) => clean(q.text)), steps,
  };
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
  const guide = voiceGuide(await loadVoice());
  const r = await withFallback(cfg, () => complete(cfg, guide ? `${POLISH_SYSTEM}\n${guide}` : POLISH_SYSTEM, `Kind: ${kind}\n\nSermon excerpt:\n${excerpt}\n\nDraft:\n${text}`), () => text);
  return { text: r.value, notice: r.notice?.text || null };
}

// ---------------------------------------------------------------- writing projects
// A draft is a writing project. Ones made from a sermon use the sermon's id; ones started from
// scratch or from a calendar event get their own "w-" id and have no transcript behind them.
export const isStandalone = (id) => String(id).startsWith('w-');

/** The first words of a piece, as plain text, for preview tiles. */
export function excerptOf(d) {
  const t = String(d?.blog || d?.newsletter || d?.email || d?.group || d?.devotional || d?.social || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#+\s.*$/m, '').replace(/[#>*_`]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.slice(0, 180);
}

export async function listDrafts() {
  const out = [];
  for (const f of existsSync(DRAFTS) ? await readdir(DRAFTS) : []) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(await readFile(path.join(DRAFTS, f), 'utf8'));
      const id = f.replace(/\.json$/, '');
      const project = isStandalone(id) ? null : await getProject(id).catch(() => null);
      out.push({ id, title: d.title || project?.title || 'Untitled', source: d.source?.type || 'sermon', sermon: project?.title || null,
        updated: d.saved || d.generated, header: Object.values(d.headers || {}).find((h) => h?.rel)?.rel || null, words: String(d.blog || '').split(/\s+/).length, excerpt: excerptOf(d) });
    } catch { /* skip */ }
  }
  return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}

const when = (e) => {
  const d = new Date(e.start);
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return e.allDay ? day : `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};


/**
 * A weekly newsletter built from what's already in the app: the latest sermon, the next two weeks of
 * church events, a verse from the message and the church's details. Brackets mark what to fill in.
 */
async function newsletterDraft(title = '') {
  const cfg = await loadConfig();
  const church = cfg.churchInfo || {};
  const name = church.name || 'our church';
  // The most recent sermon with a transcript.
  const latest = (await listProjects()).filter((p) => p.status === 'transcribed').sort((a, b) => String(b.created).localeCompare(String(a.created)));
  let sermon = null;
  for (const s of latest.slice(0, 5)) { const p = await getProject(s.id); if (p && !p.blank) { sermon = p; break; } }
  let summary = ''; let verse = '';
  if (sermon) {
    const draft = await loadDraft(sermon.id).catch(() => null);
    const firstPara = String(draft?.blog || '').split(/\n{2,}/).map((x) => x.trim()).find((x) => x && !x.startsWith('#') && !x.startsWith('!') && !x.includes('[ADD'));
    summary = firstPara || sermon.clips.find((c) => c.summary)?.summary || '';
    verse = (draft?.refs || [])[0] || '';
    if (!verse) { const t = await getTranscript(sermon.id).catch(() => null); verse = t?.words ? extractRefs(normalizeText(t.words.slice(0, 4000).map((w) => w.w).join(' ')), 1)[0] || '' : ''; }
  }
  const watch = sermon?.sourceUrl ? `[Watch the message](${sermon.sourceUrl})` : '[ADD: link to watch the message]';
  const soon = (await cachedEvents()).events.filter((e) => { const t = Date.parse(e.start); return t >= Date.now() && t <= Date.now() + 15 * 86400000; }).slice(0, 6);
  const eventLines = soon.length ? soon.map((e) => `- **${e.title}**, ${when(e)}${e.location ? ` at ${e.location}` : ''}${e.link ? ` ([details](${e.link}))` : ''}`) : ['- [ADD: an event, a date and a time]'];
  const t = title.trim() || `This week at ${name}`;
  const footer = [name, church.address, church.times, church.website, church.phone, church.email].filter(Boolean).join(' · ');
  const newsletter = [
    `# ${t}`,
    'Hi [FIRST NAME],',
    '[ADD: a warm opening line or two. What are you grateful for this week?]',
    sermon ? `## Sunday’s message: “${sermon.title}”` : '## This Sunday',
    summary ? sentenceEnd(summary) : '[ADD: the main point of the message in two sentences.]',
    sermon ? watch : '[ADD: what’s happening Sunday and when.]',
    '## Coming up',
    eventLines.join('\n'),
    ...(verse ? ['## A verse for the week', `> ${verse}. [ADD: paste the verse text.]`] : []),
    '## Get involved',
    '[ADD: a serving need, a sign-up, or a giving link.]',
    'See you Sunday,',
    '[YOUR NAME]',
    `*${footer}*`,
  ].join('\n\n');
  return {
    title: t, keyphrase: '', metaDescription: '', slug: slugify(t),
    newsletter, blog: '', email: '', group: '', social: `**Caption 1**\nThis week’s newsletter is out. ${sermon ? `A look back at “${sermon.title}”, ` : ''}what’s coming up, and ways to get involved. [ADD: link]`,
    source: { type: 'newsletter', projectId: sermon?.id || null },
  };
}

/** Start a blank draft, or one about a calendar event. Brackets mark what the writer fills in. */
export async function newDraft({ type = 'blank', event = null, title = '' } = {}) {
  const id = `w-${randomUUID().slice(0, 8)}`;
  const voice = await loadVoice();
  const mission = voice.mission ? `${sentenceEnd(voice.mission.trim())}\n\n` : '';
  let d;
  if (type === 'event' && event) {
    const t = event.title || 'Our next event';
    const place = event.location ? ` at ${event.location}` : '';
    const link = event.link ? `[Sign up or learn more](${event.link})` : '[ADD: link to sign up or learn more]';
    const about = event.summary ? `${sentenceEnd(event.summary)}` : '[ADD: what it is and who it is for, in two sentences.]';
    d = {
      title: t, keyphrase: t.toLowerCase(), metaDescription: `${t}: ${when(event)}${place}. ${event.summary || 'Everyone is welcome.'}`.slice(0, 155), slug: slugify(t),
      blog: [`# ${t}`, `Join us ${when(event)}${place}. ${about}`, '## What to expect', '[ADD: what will happen, how long it lasts, and anything to bring.]', '## Who it is for', '[ADD: families, students, newcomers, everyone?]', '## How to join', `${link}. [ADD: who to contact with questions.]`, mission.trim()].filter(Boolean).join('\n\n'),
      email: [`**Subject:** ${t}`, `**Preview:** ${when(event)}${place}`, '', 'Hi [FIRST NAME],', '', `${about} It's ${when(event)}${place}.`, '', `${link}.`, '', '[YOUR NAME]'].join('\n'),
      group: '', social: [`**Caption 1**`, `${t} is ${when(event)}${place}. ${event.summary ? sentenceEnd(event.summary) : '[ADD: one line about why to come.]'}`, '', 'Save the date and bring a friend.'].join('\n'),
      source: { type: 'event', event: { title: event.title, start: event.start, location: event.location || '', link: event.link || null } },
    };
  } else if (type === 'newsletter') {
    d = await newsletterDraft(title);
  } else {
    const t = title.trim() || 'Untitled post';
    d = {
      title: t, keyphrase: '', metaDescription: '', slug: slugify(t),
      blog: `# ${t}\n\n[ADD: your opening paragraph.]\n\n## [ADD: a heading]\n\n[ADD: the main part of your post.]\n\n${mission}`.trim(),
      email: `**Subject:** ${t}\n**Preview:** [ADD: one line]\n\nHi [FIRST NAME],\n\n[ADD: your message.]\n\n[YOUR NAME]`,
      group: '', social: '**Caption 1**\n[ADD: your caption.]',
      source: { type: 'blank' },
    };
  }
  await saveDraft(id, { ...d, generated: new Date().toISOString(), angle: 'teaching', keywords: [], refs: [] });
  return { id, draft: await loadDraft(id) };
}

// ------------------------------------------------------------------ rewrite for an audience
export const AUDIENCES = [
  ['newcomers', 'Guests and newcomers', 'Plain words for someone new to church, with a warm welcome.'],
  ['kids', 'Kids', 'Short sentences and simple words a child can follow.'],
  ['students', 'Students', 'Shorter and more direct, for middle and high school.'],
  ['volunteers', 'Volunteers and leaders', 'Clear and practical, ending with what you need from them.'],
  ['short', 'A short version', 'Two or three sentences for social media or a text.'],
];

// Church words a guest might not know, and plainer ways to say them.
const PLAIN = [
  [/\bfellowship\b(?!\s+(meal|hall|dinner|lunch|time|night|event|supper|breakfast))/gi, 'time together'], [/\bsanctification\b/gi, 'growing more like Jesus'], [/\bjustification\b/gi, 'being made right with God'],
  [/\bthe body of christ\b/gi, 'the church'], [/\btithes?\b/gi, 'giving'], [/\btithing\b/gi, 'giving'], [/\bthe lord'?s supper\b/gi, 'communion (bread and cup shared to remember Jesus)'],
  [/\bsaints\b/gi, 'Christians'], [/\bbrethren\b/gi, 'friends'], [/\brepent(ance)?\b/gi, 'turning back to God'], [/\bthe sanctuary\b/gi, 'the main room'],
  [/\bsmall groups?\b/gi, (m) => `${m} (a few people who meet during the week)`], [/\bdeacons?\b/gi, (m) => `${m} (servant leaders)`], [/\belders\b/gi, 'elders (church leaders)'],
];
const SIMPLE = [
  [/\bapproximately\b/gi, 'about'], [/\butilize\b/gi, 'use'], [/\btherefore\b/gi, 'so'], [/\bhowever\b/gi, 'but'], [/\bnumerous\b/gi, 'many'], [/\bdemonstrates?\b/gi, 'shows'],
  [/\bassist\b/gi, 'help'], [/\brequires?\b/gi, 'needs'], [/\bindividuals\b/gi, 'people'], [/\bpurchase\b/gi, 'buy'], [/\bcommence\b/gi, 'start'],
  [/\bopportunity\b/gi, 'chance'], [/\bencounter\b/gi, 'meet'], [/\bprovide\b/gi, 'give'], [/\bnevertheless\b/gi, 'still'], [/\bfurthermore\b/gi, 'also'],
];
const sentences = (t) => String(t).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["”’)]*|\S[^.!?]*$/g) || [];
/** Split a long sentence at a comma or "and" so each part stays short. */
function shorten(s, max = 16, depth = 0) {
  const words = s.trim().split(' ');
  if (words.length <= max || depth > 4) return s.trim();
  const at = s.search(/,\s+(and|but|so|because)\s+|;\s+|,\s+which\s+/i);
  if (at > 20) {
    const head = s.slice(0, at).trim().replace(/[,;]$/, '');
    const tail = s.slice(at).replace(/^[,;]\s+(and|but|which)?\s*/i, '').replace(/^\w/, (c) => c.toUpperCase()).trim();
    return `${head}. ${shorten(tail, max, depth + 1)}`;
  }
  return s.trim();
}
/** Swap words but keep a capital letter where the original had one. */
const swapCase = (t, list) => list.reduce((acc, [re, to]) => acc.replace(re, (m, ...rest) => {
  const out = typeof to === 'function' ? to(m, ...rest) : to;
  return /^[A-Z]/.test(m) ? out.replace(/^\w/, (c) => c.toUpperCase()) : out;
}), t).replace(/\b([Aa])n (?=[bcdfghjklmnpqrstvwxyz])/g, '$1 ');
/** Keep Markdown headings, lists and quotes; change the words in the paragraphs. */
function mapParagraphs(md, fn) {
  return String(md).split(/\n{2,}/).map((p) => (/^(#|>|!|\s*[-*]|\s*\d+\.|\*\*Subject|\*\*Preview)/.test(p.trim()) ? p : fn(p))).join('\n\n');
}

function rewriteLocal(text, audience) {
  const swap = swapCase;
  if (audience === 'short') {
    const body = String(text).replace(/^#.*$/gm, '').replace(/\*\*(Subject|Preview):\*\*.*$/gm, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/[#>*_]/g, '');
    const out = []; let n = 0;
    for (const s of sentences(body).map((x) => x.trim()).filter((x) => x.length > 20 && !/^\[/.test(x) && !/^hi\b/i.test(x))) { if (n + s.length > 240) break; out.push(s); n += s.length; }
    return `${out.join(' ') || '[ADD: two sentences that say it simply.]'} [ADD: link]`;
  }
  if (audience === 'newcomers') {
    const t = mapParagraphs(text, (p) => swap(p, PLAIN));
    return `${t}\n\nNew here? You’re welcome just as you are. [ADD: where to park, what to expect, or who to ask.]`;
  }
  if (audience === 'kids') return mapParagraphs(text, (p) => sentences(swap(swap(p, PLAIN), SIMPLE)).map((s) => shorten(s, 12)).join(' '));
  if (audience === 'students') return mapParagraphs(text, (p) => sentences(swap(p, SIMPLE)).map((s) => shorten(s, 18)).join(' '));
  if (audience === 'volunteers') {
    const t = mapParagraphs(text, (p) => sentences(swap(p, SIMPLE)).map((s) => shorten(s, 20)).join(' '));
    return `${t}\n\n**What we need from you:** [ADD: the ask, the time, and who to reply to.]\n\nThank you for serving.`;
  }
  return text;
}

const REWRITE_SYSTEM = (who) => `You rewrite church communications for a specific audience: ${who}.
Keep the meaning, every fact and every link. Never invent events, times, names or stories. Keep Markdown headings and lists.
Keep every [BRACKETED] placeholder exactly as written. Capitalize pronouns for God and Jesus. No em dashes. Return only the rewritten text.`;

/** Rewrite text for an audience. Uses the AI helper when it's on; otherwise plain-language rules on this Mac. */
export async function rewriteFor(text, audience) {
  const a = AUDIENCES.find(([id]) => id === audience);
  if (!a) throw new Error('Pick who it’s for.');
  if (!String(text || '').trim()) throw new Error('There’s nothing to rewrite yet.');
  const cfg = await loadConfig();
  if (!providerReady(cfg)) return { text: rewriteLocal(text, audience), local: true };
  const r = await withFallback(cfg, () => complete(cfg, REWRITE_SYSTEM(`${a[1]}. ${a[2]}`), text), () => rewriteLocal(text, audience));
  return { text: r.value, local: r.local };
}

// ---------------------------------------------------------------- email, discussion guide and devotional with an AI helper
// The whole-message digest, made once per sermon (right after transcribing when a helper is on) and kept on disk.
// It feeds the Sermon page's main points and next steps and the email, guide and devotional.
const DIGESTS = path.join(DATA_DIR, 'digests');
const digestFile = (id) => path.join(DIGESTS, `${String(id).replace(/[^\w-]/g, '')}.json`);
/** The saved digest, if it still matches the transcript. */
export async function savedDigest(projectId) {
  try {
    const d = JSON.parse(await readFile(digestFile(projectId), 'utf8'));
    const { a } = await load(projectId);
    return d.key === `${a.all.length}:${a.parts.length}` ? d.digest : null;
  } catch { return null; }
}
/** Make (or reuse) the digest with the AI helper. */
export async function makeDigest(projectId, { signal, onProgress } = {}) {
  const have = await savedDigest(projectId);
  if (have) return have;
  const { project, a } = await load(projectId);
  const cfg = await loadConfig();
  if (!providerReady(cfg)) throw new Error('Turn on an AI helper in Settings first.');
  const title = (await loadDraft(projectId))?.title || project.title;
  const digest = await sermonDigest(cfg, a, { title, signal, onProgress });
  await mkdir(DIGESTS, { recursive: true });
  await writeFile(digestFile(projectId), JSON.stringify({ key: `${a.all.length}:${a.parts.length}`, at: new Date().toISOString(), digest }));
  return digest;
}
/** Write the email, discussion guide or devotional with the AI helper, from a digest of the whole sermon. */
export async function aiWrite(projectId, kind, { days = 5, signal } = {}) {
  const { project, a } = await load(projectId);
  const cfg = await loadConfig();
  if (!providerReady(cfg)) throw new Error('Turn on an AI helper in Settings first.');
  const title = (await loadDraft(projectId))?.title || project.title;
  const digest = await makeDigest(projectId, { signal });
  const watch = project.sourceUrl ? `[Watch the full message](${project.sourceUrl})` : '';
  if (kind === 'email') return { text: await writeEmailWithAI(cfg, digest, { title, source: a.all, guide: voiceGuide(a.voice || {}), example: styleExample(a.voice?.samples, a.all), watch, invite: `Join ${a.church?.name || 'us'} for worship${a.church?.times ? ` ${a.church.times}` : ' [ADD: service times]'}.`, signal }) };
  if (kind === 'group') return { text: await writeGuideWithAI(cfg, digest, { title, refs: a.refs, source: a.all, signal }) };
  if (kind === 'devotional') return { text: await writeDevotionalWithAI(cfg, digest, { title, days, refs: a.refs, source: a.all, signal }) };
  throw new Error('That kind of writing can\'t be written this way yet.');
}

// ---------------------------------------------------------------- pieces written when asked
/**
 * A sermon's writing starts empty: the post settings are filled in with suggestions, and each piece (blog, email,
 * guide, devotional, captions) is written when someone asks for it.
 */
export async function startDraft(projectId) {
  const have = await loadDraft(projectId);
  if (have) return have;
  const { a } = await load(projectId);
  const s = await suggest(projectId, {});
  const title = s.titles[0] || 'Untitled post';
  return saveDraft(projectId, {
    title, keyphrase: s.keyphrases[0] || '', slug: slugify(title), metaDescription: s.metas[0] || '', angle: 'teaching',
    blog: '', email: '', group: '', devotional: '', social: '', keywords: a.keys, refs: a.refs, started: new Date().toISOString(),
  });
}

/** Write one piece now: with the AI helper from the sermon summary when it's on, otherwise on this Mac. */
export async function writeKind(projectId, kind, { days = 5, clipId = null, about = 'clip', signal } = {}) {
  if (kind === 'social') return { text: await socialCaptions(projectId, { clipId, about, signal }) };
  const cfg = await loadConfig();
  if (['email', 'group', 'devotional'].includes(kind) && providerReady(cfg)) {
    try { return await aiWrite(projectId, kind, { days, signal }); } catch (e) { if (signal?.aborted) throw e; /* fall back to writing it here */ }
  }
  if (kind === 'devotional') return { text: (await devotional(projectId, days)).text, local: true };
  const all = await generate(projectId);
  if (!(kind in all)) throw new Error('That kind of writing can\'t be written here.');
  return { text: all[kind], local: true };
}

/**
 * Social captions about one thing: a clip (its own words) or the blog post. Three short options, each with a
 * line to act on and a few hashtags.
 */
async function socialCaptions(projectId, { clipId, about, signal }) {
  const { project, a } = await load(projectId);
  const draft = await loadDraft(projectId);
  const cfg = await loadConfig();
  const tags = (list) => [...new Set(list.map((t) => `#${String(t).replace(/[^A-Za-z0-9]/g, '')}`).filter((t) => t.length > 2))].slice(0, 4).join(' ');
  if (about === 'blog') {
    if (!draft?.blog?.trim()) throw new Error('Write the blog post first, then captions for it.');
    const title = draft.title; const desc = draft.metaDescription || '';
    const link = '[ADD: link to the post]';
    const kp = draft.keyphrase || a.keys[0] || 'faith';
    return [
      `**Caption 1**\nNew on the blog: ${title}. ${desc}\n\nRead it here: ${link}\n\n${tags([kp, 'sermon', 'faith'])}`,
      `**Caption 2**\nMissed Sunday? We wrote up the heart of the message: ${title}.\n\nLink in bio.\n\n${tags([kp, 'church'])}`,
      `**Caption 3**\n${desc || title}\n\nThe full post is on our blog. ${link}\n\n${tags([kp, 'blog'])}`,
    ].join('\n\n');
  }
  const clips = (project.clips || []).filter((c) => c.status === 'kept' || c.status === 'exported' || c.export);
  const clip = clips.find((c) => c.id === clipId) || clips[0];
  if (!clip) throw new Error('Keep a clip first, then write captions for it.');
  const words = (await getTranscript(projectId)).words.filter((w) => w.start >= clip.start && w.end <= clip.end).map((w) => w.w).join(' ');
  if (providerReady(cfg)) {
    try {
      const { completeJSON } = await import('./ai.js');
      const r = await completeJSON(cfg, `You write short social captions for a church's video clips (Reels, Shorts, TikTok).\nUse only what the speaker says in the clip. No em dashes. Warm, plain, no clickbait.`,
        `Clip from "${project.title}":\n${words.slice(0, 1800)}\n\nWrite three different captions (one to three sentences each). One invites a comment or share, one quotes the clip's strongest line, one points to the full message. Then four hashtags without #.`,
        { type: 'object', additionalProperties: false, required: ['captions', 'hashtags'], properties: { captions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', maxLength: 320 } }, hashtags: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 6 } } },
        { signal, maxTokens: 600 });
      if (r.captions?.length) return r.captions.map((c, i) => `**Caption ${i + 1}**\n${String(c).trim()}\n\n${tags(r.hashtags || clip.hashtags || [])}`).join('\n\n');
    } catch (e) { if (signal?.aborted) throw e; }
  }
  // On this Mac: the clip's own strongest line, its summary and a next step.
  const line = clip.keyLine || clip.hook || clip.title;
  return [
    `**Caption 1**\n${sentenceEnd(clean(line))}\n\nShare this with someone who needs it today.\n\n${tags(clip.hashtags || ['sermon', 'faith'])}`,
    `**Caption 2**\n${clip.summary ? sentenceEnd(clean(clip.summary)) : sentenceEnd(clean(clip.title))}\n\nWatch the full message at the link in our bio.\n\n${tags(clip.hashtags || ['church'])}`,
    `**Caption 3**\nWhat would change this week if you believed this?\n\n${tags(clip.hashtags || ['faith'])}`,
  ].join('\n\n');
}

// ---------------------------------------------------------------- add in a section, and rewrite for one score
/**
 * Split a post into its body and its closing call to action (the "watch the full sermon and join us" line, or a
 * last short invite), so new writing can go between them.
 */
export function splitCta(md) {
  const paras = String(md || '').trimEnd().split(/\n{2,}/);
  const isCta = (p) => /\[watch|join (us|\S+.*) for worship|see you (on )?sunday|plan (a|your) visit|we('d| would) love to (see|have) you|\[add: service times\]/i.test(p) && p.split(/\s+/).length < 60;
  let i = paras.length;
  while (i > 1 && paras.length - i < 2 && isCta(paras[i - 1])) i--;
  // A closing section of its own ("## Join us", "## Next steps") belongs with the invite.
  const head = /^#{2,3}\s+(join us|come (and )?(join|worship|see)|your next step|next steps?|plan (a|your) visit|see you|visit us|we('d| would) love)/i;
  for (let k = paras.length - 1; k >= Math.max(1, paras.length - 4); k--) if (head.test(paras[k].trim())) { i = Math.min(i, k); break; }
  return { body: paras.slice(0, i).join('\n\n'), cta: paras.slice(i).join('\n\n') };
}

const ADD_NOTES = {
  teaching: 'a short summary of the main points that ties them together',
  story: 'a short story or illustration from the sermon and what it shows',
  steps: 'practical, numbered steps a reader can take this week',
  questions: 'two or three questions the message raises, each answered briefly from the sermon',
  devotional: 'a short devotional: a Scripture from the sermon, a brief reflection, one question to sit with, and a one-line prayer',
  newcomer: 'a warm word for someone new to church: what this message means for them, in plain words',
};
const ADD_HEADINGS = { teaching: 'Bringing it together', story: 'A story worth remembering', steps: 'Practical steps for this week', questions: 'Questions worth asking', devotional: 'A short devotional', newcomer: 'If you’re new here' };

/**
 * Add a new section to a written post, in light of what it already says: practical steps, a short devotional and
 * so on, about `words` long, placed below the writing and above the closing invite.
 */
export async function addIn(projectId, { text, angle = 'steps', words = 150, signal } = {}) {
  const { body, cta } = splitCta(text);
  if (!body.trim()) throw new Error('Write the post first, then add to it.');
  const n = Math.max(60, Math.min(400, Number(words) || 150));
  const cfg = await loadConfig();
  const sermon = !isStandalone(projectId);
  // Without a helper, the section comes from the sermon itself: the matching part of a post written that way.
  const localSection = async () => {
    if (!sermon) throw new Error('Turn on an AI helper in Settings to add to writing that isn’t from a sermon.');
    const { project, a } = await load(projectId);
    const md = blogFor(a, project, { title: 'x', angle });
    const have = new Set((body.match(/^##\s+.+$/gm) || []).map((h) => h.toLowerCase()));
    const chunks = md.split(/\n(?=## )/).slice(1).filter((c) => !have.has(c.split('\n')[0].toLowerCase()) && !/\[watch|join .* for worship/i.test(c));
    let out = ''; let count = 0;
    for (const c of chunks) { const w = c.split(/\s+/).length; if (count && count + w > n * 1.4) break; out += `${out ? '\n\n' : ''}${c.trim()}`; count += w; if (count >= n) break; }
    if (!out) out = `## ${ADD_HEADINGS[angle] || 'One more thing'}\n\n[ADD: ${ADD_NOTES[angle] || 'a short section'}.]`;
    return out;
  };
  let section; let local = true; let notice = null;
  if (providerReady(cfg)) {
    const guide = voiceGuide(await loadVoice());
    let source = '';
    if (sermon) {
      const digest = await savedDigest(projectId);
      source = digest ? `Sermon summary:\n${JSON.stringify(digest).slice(0, 6000)}` : `Sermon excerpt:\n${((await getTranscript(projectId))?.words || []).map((w) => w.w).join(' ').slice(0, 9000)}`;
    }
    const system = `${POLISH_SYSTEM}\n${guide}\nYou add one new section to a church blog post that is already written.
Write ${ADD_NOTES[angle] || 'a short section'}, about ${n} words. Start with a "## " subheading. Build on what the post already says
and don't repeat it. Match its voice. Return only the new section in Markdown.`;
    const r = await withFallback(cfg, () => complete(cfg, system, `${source}\n\nThe post so far:\n${body}`), localSection);
    section = String(r.value || '').trim().replace(/^```\w*\n?|```$/g, '').trim();
    local = r.local;
    notice = r.notice?.text || null;
    if (!/^#{2,3}\s/.test(section)) section = `## ${ADD_HEADINGS[angle] || 'One more thing'}\n\n${section}`;
  } else section = await localSection();
  return { section, text: [body.trimEnd(), section, cta].filter(Boolean).join('\n\n'), local, notice };
}

/** Readability fixes that work without a helper: long sentences split at a natural joint. */
function readableLocal(md) {
  return mapParagraphs(md, (p) => sentences(p).map((s) => shorten(s.trim(), 20)).join(' '));
}

/**
 * Rewrite the post to raise one score: readability (shorter sentences, active voice, transitions), brand voice
 * (the church's own words and themes) or search (the keyphrase where it counts). `notes` are the checks that need
 * work, in the words the score panel shows, so the helper knows exactly what to fix.
 */
export async function rewriteFocus(projectId, { text, focus = 'read', notes = [], keyphrase = '', title = '' } = {}) {
  if (!String(text || '').trim()) throw new Error('There’s nothing to rewrite yet.');
  const cfg = await loadConfig();
  const { body, cta } = splitCta(text);
  const join = (t) => [String(t).trim(), cta].filter(Boolean).join('\n\n');
  const fix = notes.length ? `Fix these, from the post's checks:\n- ${notes.join('\n- ')}` : '';
  if (!providerReady(cfg)) {
    if (focus === 'read') return { text: join(readableLocal(body)), local: true, notice: 'Long sentences were split on this Mac. An AI helper does a fuller rewrite.' };
    throw new Error('Turn on an AI helper in Settings to rewrite for this.');
  }
  const guide = voiceGuide(await loadVoice());
  const aims = {
    read: 'Make it easier to read: keep most sentences under 20 words, use active voice, add natural transition words, keep paragraphs short, and add a subheading at least every 300 words. Keep every point.',
    voice: 'Make it sound more like this church: use its own words, themes and tone from the voice guide. Keep every point and fact.',
    seo: `Help it rank in search for "${keyphrase || title}": use that phrase naturally in the first paragraph and in one subheading, about once every 150 words, and keep the title "${title}" as the H1. Don't stuff it. Keep every point.`,
  };
  const system = `${POLISH_SYSTEM}\n${focus === 'voice' || focus === 'read' ? guide : ''}\n${aims[focus] || aims.read}\n${fix}
You get one part of the post at a time. Keep its heading line exactly, keep every point, and keep about the same number of words. Return only that part, revised, in Markdown.`;
  // One section at a time: small on-device helpers stay on task and don't drop half the post. A part that comes
  // back much shorter (or not at all) keeps a local readability fix instead, so nothing is lost.
  const wc = (t) => String(t).split(/\s+/).filter(Boolean).length;
  const parts = body.split(/\n(?=## )/);
  const out = []; let local = 0; let notice = null;
  for (const part of parts) {
    const keep = () => (focus === 'read' ? readableLocal(part) : part);
    const r = await withFallback(cfg, () => complete(cfg, system, part), keep);
    let v = String(r.value || '').trim().replace(/^```\w*\n?|```$/g, '').trim();
    if (r.local || wc(v) < wc(part) * 0.7 || wc(v) > wc(part) * 1.4) { v = keep(); local++; }
    else if (focus === 'read') v = readableLocal(v); // any sentence still too long is split where it naturally joins
    // Keep the part's own heading (an H1 title or a ## subheading) even if the helper changed or dropped it.
    const h = part.match(/^#{1,3}\s.+$/m)?.[0];
    if (h && !v.includes(h.trim())) v = `${h}\n\n${v.replace(/^#{1,3}\s.+\n+/, '')}`;
    out.push(v);
    notice = notice || r.notice?.text || null;
  }
  const helper = PROVIDER_LABEL(cfg);
  return { text: join(out.join('\n\n')), local: local === parts.length, notice: notice || (local === parts.length ? `${helper} couldn't rewrite this, so it was fixed on this Mac.` : local ? `${helper} rewrote most of it. ${local} part${local === 1 ? ' was' : 's were'} fixed on this Mac.` : null) };
}
