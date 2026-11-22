// Turning a sermon into a blog post that reads like writing, not a transcript.
//
// 1. Structure (always, no AI): whole spoken sentences, cleaned of filler and repeated phrases; the opening
//    small talk and the closing invitation set aside; the message split where the preacher turns to a new
//    point or passage ("First thing I want to look at…", "That's what we'll move to next", "Luke 22…").
// 2. Writing (with an AI helper): each section is written as its own short piece of prose, then the title,
//    intro and takeaways are written from those sections. Small requests suit on-device helpers, and every
//    piece is checked against the sermon so nothing is invented (numbers and quotes must appear in it).
import { extractRefs } from './scripture.js';
import { completeJSON } from './ai.js';

// ---------------------------------------------------------------- cleaning spoken words
const FILLER = /(^|[\s,])(?:um+|uh+|you know|I mean|right\?)(?=[\s,.]|$),?/gi;
export function tidy(text) {
  let s = ` ${String(text || '')} `.replace(FILLER, '$1').replace(/\s+/g, ' ');
  // Spoken repeats: "the the", "develop into, develop into", "Paul Paul".
  for (let k = 0; k < 2; k++) s = s.replace(/\b((?:\w[\w'’]*\s+){0,3}\w[\w'’]*)([,.]?\s+)\1\b/gi, '$1');
  return s.replace(/\s([,.?!;:])/g, '$1').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim().replace(/^[,.;:\s]+/, '');
}
/** A sentence that trails off ("…who they are and.", "…the person Jesus,."). */
export const isFragment = (t) => /\b(and|but|or|the|a|an|to|of|that|which|with|as|is|was|were|for|in|on|at|by|our|your|his|their|my)[,]?[.?!]?$/i.test(String(t).trim()) || /,\s*[.?!]$/.test(String(t).trim());

// ---------------------------------------------------------------- structure
const GREETING = /^(good (morning|evening|afternoon)|welcome|thank you|thanks|oh,? good morning|let'?s pray)\b/i;
// Opening chatter before the message starts: the week, jokes, a quick aside to someone in the room.
const CHATTER = /\b(this past week|a lot going on|comedian|tough week|i don'?t know what all that means|do i have to say|before we get started|how'?s everybody)\b/i;
const INVITE = /(if you('re| are)( not)? (a christian|part of the body|ready)|if you haven'?t been baptized|come (forward|and (have|be)|down)|as (we|together we) (stand and )?sing|make (those|your) needs known|while we sing|invitation song)/i;
const SIGNPOST = /\b(first(ly)? thing|the first (point|thing)|second(ly)?\b|the (second|third|next|last) (point|thing)|another (thing|point)|let'?s (look|turn|move)|move to next|we'?ll move (on|to)|that leads us|leads us to|turn our attention|go(ing)? back to|in closing|as we close|we begin(ning)? by|what are we remembering|so what does)\b/i;
const words = (t) => String(t).split(/\s+/).filter(Boolean).length;

/**
 * The parts of a message. sentences: [{ text, ... }] in order. Returns { startAt, endAt, sections: [[sentence…]] }
 * where sections cover startAt..endAt, and endAt is where the closing invitation begins (if there is one).
 */
export function structure(sentences, { target = 4 } = {}) {
  const n = sentences.length;
  if (!n) return { startAt: 0, endAt: 0, sections: [] };
  let endAt = n;
  for (let i = Math.floor(n * 0.7); i < n; i++) if (INVITE.test(sentences[i].text)) { endAt = i; break; }
  let startAt = 0;
  while (startAt < Math.min(10, n * 0.05) && (GREETING.test(sentences[startAt].text) || words(sentences[startAt].text) < 6)) startAt++;
  // Skip past any chatter in the first few minutes (only sentences before the last chatter line, never further than 8%).
  for (let i = startAt; i < Math.min(n, Math.max(12, n * 0.08)); i++) if (CHATTER.test(sentences[i].text)) startAt = i + 1;
  const body = sentences.slice(startAt, endAt);
  const total = body.reduce((a, s) => a + words(s.text), 0) || 1;
  // Where the preacher turns: a signpost, or a passage not mentioned before.
  const seen = new Set(); const cuts = [];
  body.forEach((s, i) => {
    const refs = extractRefs(s.text, 3).map((r) => r.split(':')[0]);
    const fresh = refs.some((r) => !seen.has(r)); refs.forEach((r) => seen.add(r));
    if (i > 0 && (SIGNPOST.test(s.text) || (fresh && i > body.length * 0.08))) cuts.push(i);
  });
  let parts = [];
  let from = 0;
  for (const c of [...cuts, body.length]) { if (c > from) parts.push(body.slice(from, c)); from = c; }
  const size = (p) => p.reduce((a, s) => a + words(s.text), 0);
  // Too small to stand alone (under ~9% of the message): fold into the part before.
  parts = parts.reduce((out, p) => { if (out.length && size(p) < total * 0.09) out[out.length - 1] = [...out.at(-1), ...p]; else out.push(p); return out; }, []);
  if (parts.length > 1 && size(parts[0]) < total * 0.09) parts = [[...parts[0], ...parts[1]], ...parts.slice(2)];
  // Too many: join the two smallest neighbors. Too few: split the biggest in the middle.
  while (parts.length > target + 1) {
    let k = 0; let best = Infinity;
    for (let i = 0; i < parts.length - 1; i++) { const v = size(parts[i]) + size(parts[i + 1]); if (v < best) { best = v; k = i; } }
    parts.splice(k, 2, [...parts[k], ...parts[k + 1]]);
  }
  while (parts.length < Math.max(2, target - 1) && parts.some((p) => p.length > 8)) {
    const k = parts.reduce((m, p, i) => (size(p) > size(parts[m]) ? i : m), 0);
    const mid = Math.floor(parts[k].length / 2);
    parts.splice(k, 1, parts[k].slice(0, mid), parts[k].slice(mid));
  }
  return { startAt, endAt, sections: parts };
}

// ---------------------------------------------------------------- writing with an AI helper
const SECTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['heading', 'paragraphs', 'keyLine'],
  properties: {
    heading: { type: 'string', maxLength: 80 },
    paragraphs: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 900 } },
    keyLine: { type: 'string', maxLength: 200 },
  },
};
const FRAME_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'intro', 'meta', 'takeaways'],
  properties: {
    title: { type: 'string', maxLength: 90 }, intro: { type: 'string', maxLength: 700 }, closing: { type: 'string', maxLength: 500 }, meta: { type: 'string', maxLength: 180 },
    takeaways: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string', maxLength: 160 } },
  },
};
FRAME_SCHEMA.required.push('closing');

/** The church's own post that is closest in topic, as a style example (its voice and rhythm, not its content). */
export function styleExample(samples, sermonText, max = 900) {
  const blog = (samples || []).filter((x) => x.source === 'blog' && x.text);
  if (!blog.length) return '';
  const vocab = (t) => new Set((String(t).toLowerCase().match(/[a-z]{5,}/g) || []));
  const mine = vocab(sermonText);
  const best = blog.map((x) => { const v = vocab(x.text); let n = 0; for (const w of v) if (mine.has(w)) n++; return { x, n: n / Math.sqrt(v.size || 1) }; }).sort((a, b) => b.n - a.n)[0].x;
  const text = best.text.replace(/\s+/g, ' ').trim();
  const cut = text.slice(0, max); const end = cut.lastIndexOf('. ');
  return `${best.title ? `"${best.title}"\n` : ''}${end > 200 ? cut.slice(0, end + 1) : cut}`;
}
const exampleBlock = (ex) => (ex ? `\nHere is how this church writes on its blog. Match its voice, rhythm and sentence length, not its content:\n---\n${ex}\n---` : '');
// How a good sermon recap reads (learned from church blogs that do this well): short sentences of 10 to 15 words,
// paragraphs of two or three sentences, linking words (However, Therefore, Instead, Likewise), Scripture named
// inline ("Philippians 2:10-11 promises..."), "we" more than "I", and the sermon described in the third person.
const RULES = `Write like a thoughtful church writer, not a transcript. Short, clear sentences (10 to 15 words) in short paragraphs
of two or three sentences. Link ideas with words like However, Therefore, Instead and Likewise. Name Scripture inline,
like "Luke 22:15 says..." or "1 Corinthians 11 reminds us...". Write as the church ("we", "believers"), and speak of the
message in the third person ("The sermon showed...", "The message pointed to..."), never as the preacher ("I").
Leave out spoken stage directions ("this morning", "today", "let's turn to", "I want to look at"), greetings, jokes and announcements.
Use only the ideas, stories and Scripture in the excerpt. Never invent names, numbers, quotes, events or results.
Tell each story and Bible example exactly as the excerpt does, and never merge two of them into one.
Call things what the excerpt calls them (if it says juice or fruit of the vine, do not say wine).
Quote Scripture only with the excerpt's own words. Capitalize He, Him and His for God and Jesus. No em dashes.
Plain words a newcomer understands.`;

/**
 * Keep only sentences the sermon backs up: every number in it appears in the sermon, and anything in quotation
 * marks is the sermon's own words. Stray quote marks are dropped. max: most sentences to keep.
 */
const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function grounded(text, source, max = 99) {
  const nums = new Set((source.match(/\d[\d,]*/g) || []).map((x) => x.replace(/,/g, '')));
  const src = norm(source);
  const quoteOk = (s) => [...s.matchAll(/["\u201C\u2018']([^"\u201D\u2019']{12,})["\u201D\u2019']/g)].every((m) => {
    const q = norm(m[1]).split(' ').filter(Boolean);
    // The quote's words appear in the sermon in order (checked four words at a time).
    for (let i = 0; i + 4 <= q.length; i++) if (!src.includes(q.slice(i, i + 4).join(' '))) return false;
    return true;
  });
  const out = String(text || '').replace(/\u2014|\u2013|\s-\s/g, ', ').replace(/\.\.\.|\u2026/g, '.')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => (s.match(/\d[\d,]*/g) || []).every((x) => nums.has(x.replace(/,/g, ''))) && quoteOk(s))
    .map((s) => ((s.match(/["\u201C\u201D]/g) || []).length % 2 ? s.replace(/["\u201C\u201D]/g, '') : s))
    .slice(0, max);
  return out.join(' ').trim();
}
const SCALE = { apple: 2400, cshelper: 5200 };

/**
 * Write the blog with the AI helper, section by section. a: the analysis (parts, refs, all), opts: { title,
 * keyphrase, angle note, voice guide, church }. onProgress(n, of) after each section. Returns markdown, or throws.
 */
export async function writeBlogWithAI(cfg, a, { title = '', keyphrase = '', angleNote = '', guide = '', example = '', signal, onProgress, onSection } = {}) {
  const max = SCALE[cfg.llmProvider] || 9000;
  // On-device helpers get a shorter example so the sermon excerpt still fits.
  const ex = exampleBlock(cfg.llmProvider === 'apple' ? example.slice(0, 450) : example);
  const system = `You turn one part of a sermon into one section of a church blog post.\n${RULES}\n${guide || ''}${ex}`.trim();
  const sections = [];
  const source = a.all;
  for (let k = 0; k < a.parts.length; k++) {
    onProgress?.(k, a.parts.length);
    const text = a.parts[k].map((s) => s.text).join(' ').slice(0, max);
    const user = `Sermon: "${title}"${a.refs.length ? `\nPassages: ${a.refs.join(', ')}` : ''}${keyphrase ? `\nFocus: ${keyphrase}` : ''}
This is part ${k + 1} of ${a.parts.length}.${k === 0 ? ' If it opens with greetings, jokes or announcements, leave them out.' : ''}
Write a heading that states this part's point as a short claim (3 to 7 words, Title Case, not a question, made from
this part's own idea), exactly two short paragraphs (70 to 110 words in all) that explain the point with its illustration
or Scripture, and one key line (a sentence a reader could remember).\n\nExcerpt:\n${text}`;
    let done = null;
    for (let attempt = 0; attempt < 2 && !done; attempt++) { // a second try when the first answer doesn't hold up
      try {
        const r = await completeJSON(cfg, system, user, SECTION_SCHEMA, { signal, maxTokens: 700 });
        const paras = (r.paragraphs || []).slice(0, 2).map((p) => grounded(p, source, 4)).filter((p) => words(p) >= 12);
        if (paras.length) done = { heading: String(r.heading || '').replace(/[.?!:]+$/, '').slice(0, 80), paras, keyLine: grounded(r.keyLine, source) };
      } catch (e) { if (signal?.aborted) throw e; }
    }
    sections.push(done); // null: this part is written locally
    if (done) onSection?.(sections.filter(Boolean));
  }
  if (!sections.some(Boolean)) throw new Error('The helper could not write this one.');
  onProgress?.(a.parts.length, a.parts.length);
  const outline = sections.map((s, k) => (s ? `${k + 1}. ${s.heading}: ${s.keyLine}` : '')).filter(Boolean).join('\n');
  // The passage the message spent the most time in (named most often), for the intro.
  const chapters = (a.refs || []).map((r) => r.replace(/:.*$/, ''));
  const count = (c) => (source.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
  const mainPassage = [...new Set(chapters)].sort((x, y) => count(y) - count(x))[0] || '';
  let frame = null;
  for (let attempt = 0; attempt < 2 && !frame?.intro; attempt++) try {
    frame = await completeJSON(cfg, `You write the opening and closing of a church blog post from its outline.\n${RULES}\n${guide || ''}${ex}`.trim(),
      `Sermon: "${title}"${keyphrase ? `\nFocus keyphrase (use it naturally in the intro): ${keyphrase}` : ''}${angleNote ? `\n${angleNote}` : ''}
${mainPassage ? `Main passage: ${mainPassage}\n` : ''}Outline:\n${outline}\n\nThe post's first section reads:\n${(sections.find(Boolean)?.paras || []).join(' ').slice(0, 900)}
Write: a title (under 70 characters${title ? `; you may keep "${title}"` : ''}); an intro of three or four short sentences that opens with
a relatable hook, then names the main passage and states the message's big idea in your own words (do not paste the title,
do not write "the message is:", and do not say "today"); a closing of two or three sentences that applies the message
to the reader's week (do not invite them to anything, that is added after); a meta description under 155 characters; and three or four
short takeaways (each under 18 words).`, FRAME_SCHEMA, { signal, maxTokens: 650 });
  } catch (e) { if (signal?.aborted) throw e; frame = null; }
  return { sections, frame: frame && { ...frame, intro: grounded(frame.intro, source, 4), closing: grounded(frame.closing, source, 3), takeaways: (frame.takeaways || []).map((t) => grounded(t, source)).filter(Boolean) } };
}

/**
 * A finished post in the house style: title, intro, a heading and short paragraphs per point, a closing that
 * applies it, then a line to watch the sermon and visit (with real service times when the church set them).
 * written: the helper's sections (null where a part is written locally); local(k): offline text for part k.
 */
export function assembleBlog({ title, intro, sections, closing, invite }) {
  // Say each sentence once: drop any that repeat the intro or an earlier section.
  const seen = new Set(String(intro || '').split(/(?<=[.!?])\s+/).map(norm));
  const once = (p) => p.split(/(?<=[.!?])\s+/).filter((x) => { const k = norm(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }).join(' ');
  const body = sections.map((s) => ({ ...s, paras: s.paras.map(once).filter(Boolean) })).filter((s) => s.paras.length)
    .map((s) => `## ${s.heading}\n\n${s.paras.join('\n\n')}`);
  return [`# ${title}`, intro, ...body, closing, invite].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------- email, discussion guide and devotional
// All three start from a digest of the whole message (each part's point, a short summary, its Scripture, its
// illustration and how to live it), written once per sermon, so they reflect the full sermon rather than a few lines.
const DIGEST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['point', 'summary', 'illustration', 'apply'],
  properties: { point: { type: 'string', maxLength: 90 }, summary: { type: 'string', maxLength: 600 }, illustration: { type: 'string', maxLength: 300 }, apply: { type: 'string', maxLength: 250 } },
};
export async function sermonDigest(cfg, a, { title = '', signal, onProgress } = {}) {
  const max = SCALE[cfg.llmProvider] || 9000;
  const system = `You summarize one part of a sermon for a church's own notes.\n${RULES}`;
  const out = [];
  for (let k = 0; k < a.parts.length; k++) {
    onProgress?.(k, a.parts.length);
    const text = a.parts[k].map((s) => s.text).join(' ').slice(0, max);
    let d = null;
    for (let attempt = 0; attempt < 2 && !d; attempt++) {
      try {
        const r = await completeJSON(cfg, system, `Sermon: "${title}". Part ${k + 1} of ${a.parts.length}.
Give: this part's point as one short claim (under 9 words); a summary in two or three sentences; the story or example it uses, in one
sentence (or "" if none); and one way to live it this week, as a short instruction that starts with a verb (under 16 words).\n\nExcerpt:\n${text}`, DIGEST_SCHEMA, { signal, maxTokens: 450 });
        if (r.summary) d = { point: String(r.point || '').replace(/[.?!:]+$/, ''), summary: grounded(r.summary, a.all, 3), illustration: grounded(r.illustration, a.all, 1), apply: grounded(r.apply, a.all, 1), refs: extractRefs(text, 3) };
      } catch (e) { if (signal?.aborted) throw e; }
    }
    if (d?.summary) out.push(d);
  }
  if (!out.length) throw new Error('The helper could not read this sermon.');
  return out;
}
const digestText = (digest) => digest.map((d, k) => `${k + 1}. ${d.point}${d.refs?.length ? ` (${d.refs.join(', ')})` : ''}: ${d.summary}${d.illustration ? ` Example: ${d.illustration}` : ''}${d.apply ? ` Live it: ${d.apply}` : ''}`).join('\n');

const EMAIL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['subject', 'preview', 'opening', 'points', 'closing'],
  properties: { subject: { type: 'string', maxLength: 70 }, preview: { type: 'string', maxLength: 110 }, opening: { type: 'string', maxLength: 600 }, points: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string', maxLength: 220 } }, closing: { type: 'string', maxLength: 300 } },
};
/** A warm "in case you missed Sunday" email from the digest. */
export async function writeEmailWithAI(cfg, digest, { title = '', source = '', guide = '', example = '', watch = '', invite = '', signal } = {}) {
  const r = await completeJSON(cfg, `You write a church's weekly email to its members and friends.\n${RULES}\n${guide}${exampleBlock(example.slice(0, 500))}`,
    `Sermon: "${title}"\nThe message, part by part:\n${digestText(digest)}
Write: a subject line under 50 characters; preview text under 90 characters; an opening paragraph of two or three warm sentences for
someone who missed Sunday; three or four short points that carry the heart of the message (one sentence each); and a closing sentence
that invites them to live it this week.`, EMAIL_SCHEMA, { signal, maxTokens: 600 });
  return [`**Subject:** ${r.subject}`, `**Preview:** ${r.preview}`, '', 'Hi [FIRST NAME],', '', grounded(r.opening, source, 3), '',
    ...(r.points || []).map((p) => `- ${grounded(p, source, 1)}`).filter((p) => p.length > 2), '', grounded(r.closing, source, 2) || String(r.closing || '').replace(/["\u201C\u201D]/g, ''), '',
    watch ? `${watch}. ${invite}` : invite, '', '[YOUR NAME]'].join('\n');
}

const GUIDE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['open', 'context', 'questions', 'apply', 'pray'],
  properties: { open: { type: 'string', maxLength: 200 }, context: { type: 'string', maxLength: 600 }, questions: { type: 'array', minItems: 4, maxItems: 7, items: { type: 'string', maxLength: 220 } }, apply: { type: 'string', maxLength: 220 }, pray: { type: 'string', maxLength: 220 } },
};
/** A small group guide that walks the message: an opening question, a little context, questions in order, a step and a prayer. */
export async function writeGuideWithAI(cfg, digest, { title = '', refs = [], source = '', signal } = {}) {
  const r = await completeJSON(cfg, `You write small group discussion guides for a church.\n${RULES}\nQuestions are open (not yes or no), one idea each, and move from understanding the passage to living it.`,
    `Sermon: "${title}"${refs.length ? `\nPassages: ${refs.join(', ')}` : ''}\nThe message, part by part:\n${digestText(digest)}
Write: one easy opening question anyone can answer; two or three sentences of context for the main passage, from the message; four to six
discussion questions that follow the message in order; one question about a step to take this week; and a one-sentence prayer focus.`, GUIDE_SCHEMA, { signal, maxTokens: 700 });
  return [`# Small group guide: ${title}`, '', `**Open:** ${r.open}`, '', refs.length ? `**Read:** ${refs.slice(0, 2).join(', ')}` : '', '',
    grounded(r.context, source, 3), '', '**Discuss:**', ...(r.questions || []).map((q, i) => `${i + 1}. ${q}`), '',
    `**Live it:** ${r.apply}`, '', `**Pray:** ${grounded(r.pray, source, 1) || r.pray}`].filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n');
}

const DAY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'reflection', 'question', 'prayer'],
  properties: { title: { type: 'string', maxLength: 80 }, reflection: { type: 'string', maxLength: 900 }, question: { type: 'string', maxLength: 220 }, prayer: { type: 'string', maxLength: 300 } },
};
/** A devotional series walking through the message in order, one short reading a day. */
export async function writeDevotionalWithAI(cfg, digest, { title = '', days = 5, refs = [], source = '', signal, onProgress } = {}) {
  const n = [3, 5, 7].includes(Number(days)) ? Number(days) : 5;
  const out = [`# ${n}-day devotional: ${title}`, '', `A short reading each day, walking through "${title}" in order.`];
  for (let d = 0; d < n; d++) {
    onProgress?.(d, n);
    const part = digest[Math.min(digest.length - 1, Math.floor((d * digest.length) / n))];
    const read = part.refs?.[0] || refs[d % Math.max(1, refs.length)] || '';
    try {
      const r = await completeJSON(cfg, `You write short daily devotionals for a church.\n${RULES}`,
        `Day ${d + 1} of ${n}, from the sermon "${title}".${read ? ` Passage: ${read}.` : ''}\nThis day's idea: ${part.point}. ${part.summary}${part.illustration ? ` Example: ${part.illustration}` : ''}
Write: a short title; a reflection of 80 to 120 words that helps a reader sit with this idea; one honest question to reflect on; and a one-sentence prayer.`, DAY_SCHEMA, { signal, maxTokens: 450 });
      out.push('', `## Day ${d + 1}: ${String(r.title).replace(/^Day \d+:\s*/i, '')}`, read ? `**Read:** ${read}` : '', '', grounded(r.reflection, source, 7), '', `**Reflect:** ${r.question}`, '', `**Pray:** ${r.prayer}`);
    } catch (e) {
      if (signal?.aborted) throw e;
      out.push('', `## Day ${d + 1}: ${part.point}`, read ? `**Read:** ${read}` : '', '', part.summary, '', `**Reflect:** ${part.apply || 'Where do you see this in your week?'}`, '', '**Pray:** [ADD: a short prayer.]');
    }
  }
  return out.filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n');
}
