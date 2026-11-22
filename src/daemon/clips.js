// Propose clip cuts from a sermon transcript. Default engine is rule-based and fully offline
// (tuned for preaching). An optional LLM can
// re-rank and retitle the heuristic's candidates (ai.js); if it fails we keep the heuristic.
import { randomUUID } from 'node:crypto';
import { toSentences, backgroundOf, keywords, firstWords, lastWords, tokens } from './text.js';

// Words that make a line land on its own in a short.
const HOOK = new Set(`never always nobody everyone everybody truth secret mistake why how biggest worst best only
first stop imagine actually problem reason wrong lie remember listen here's question answer real really
change changed life death die died fear afraid alone broken hurt pain shame guilt anxiety worry weak
strong power powerful free freedom chains enough worth worthy identity purpose calling love loved loves
grace mercy forgive forgiven forgiveness hope faith trust believe doubt peace joy heaven hell eternal
god god's jesus christ cross spirit holy savior lord kingdom gospel prayer pray scripture bible`.split(/\s+/));

const STORY = [/\bi remember\b/i, /\bwhen i was\b/i, /\bthere was (a|this|an)\b/i, /\bone (day|time|night),? (i|we|my|when)\b/i,
  /\byears ago\b/i, /\blet me tell you\b/i, /\bi'll never forget\b/i, /\bstory\b/i, /\bmy (wife|husband|son|daughter|dad|mom|father|mother|kids?|grand\w+|brother|sister|friend)\b/i,
  // A personal moment told in the past: "I got a key chain", "that year", "growing up", "in elementary school".
  // Only "I" (teaching says "we had" all the time) and only verbs that tell what happened.
  /\bi (got|bought|walked|drove|grew up|dropped|picked up|found|lost|tried|ran|called|met|wore|kept)\b/i,
  /\b(that|one|last) (year|summer|christmas|thanksgiving)\b/i, /\bgrowing up\b/i,
  /\b(elementary|middle|high) school\b/i, /\bwhen (my|our) (kids?|son|daughter)\b/i, /\bi was (\d+|a kid|little|young)\b/i];
// The line a story or illustration lands on: why it matters.
const PAYOFF = [/\bbecause of (who|why|what)\b/i, /\bthat's why\b/i, /\b(it|that) matters\b/i, /\bthe (point|reason) is\b/i,
  /\bwhat (matters|makes)\b/i, /\bbecame (special|sacred|holy)\b/i, /\b(simple|ordinary|common)\b.*\b(sacred|extraordinary|holy)\b/i,
  /\bnot (just|only)\b.*\bbut\b/i, /\bit's (not|never) about\b/i];
const APPLY = [/\byou (need|have|get|can|don't have|are|were) to\b/i, /\bwhat if you\b/i, /\bthis week\b/i,
  /\bhere's (the thing|what)\b/i, /\bif you('re| are)\b/i, /\byou are\b/i, /\bgod (is|will|wants|loves|sees|knows)\b/i,
  /\bthe (truth|point|good news) is\b/i, /\bi want you to\b/i];
const QUOTABLE = [/\bisn't\b.*\bit's\b/i, /\bnot\b.*\bbut\b/i, /\bthe (opposite|enemy) of\b/i, /\byou can't\b.*\band\b/i];
export const SCRIPTURE = /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|jonah|micah|habakkuk|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|hebrews|james|peter|jude|revelation)\b[^.]{0,12}\d/i;
// Lines that won't stand alone.
const DANGLING_OPENER = new Set(['and', 'but', 'because', 'which', 'or', 'then', 'so', 'that', 'it', 'this', 'they', 'he', 'she', 'also']);
const CONTEXT_DEPENDENT = [/\bas i (said|mentioned)\b/i, /\blike i (said|mentioned)\b/i, /\bearlier\b/i, /\blast week\b/i, /\bverse \d+ says\b/i, /\bwe('ll| will) (get|come) (to|back)\b/i];
const LOGISTICS = /\b(turn with me|open (up )?your bibles?|if you have (a|your) bibles?|you can be seated|on the screen)\b/i;
const HOUSEKEEPING = [/\boffering\b/i, /\bgiving\b/i, /\bannouncement/i, /\bparking\b/i, /\bwebsite\b/i, /\bapp\b/i, /\bsign up\b/i, /\bnext (week|sunday)\b/i, /\bwelcome to\b/i, /\bkids?('s)? (ministry|church)\b/i, /\bconnect card\b/i, /\bturn (in your bibles )?to (page|chapter)\b/i];

export function lineFeatures(text) {
  const toks = tokens(text);
  const f = {
    hook: toks.slice(0, 16).filter((t) => HOOK.has(t)).length,
    question: /\?/.test(text),
    story: STORY.some((r) => r.test(text)),
    payoff: PAYOFF.some((r) => r.test(text)),
    apply: APPLY.some((r) => r.test(text)),
    quotable: QUOTABLE.some((r) => r.test(text)) && toks.length <= 22,
    scripture: SCRIPTURE.test(text),
    you: toks.filter((t) => t === 'you' || t === 'your').length,
    dangling: DANGLING_OPENER.has(toks[0]),
    context: CONTEXT_DEPENDENT.some((r) => r.test(text)),
    housekeeping: HOUSEKEEPING.some((r) => r.test(text)),
    logistics: LOGISTICS.test(text),
    len: toks.length,
  };
  return f;
}

export function lineScore(text) {
  const f = lineFeatures(text);
  let s = 1.6 * Math.min(f.hook, 4);
  if (f.question) s += 1.5;
  if (f.story) s += 2;
  if (f.payoff) s += 2;
  if (f.apply) s += 2;
  if (f.quotable) s += 2.5;
  if (f.scripture) s += 1;
  s += 0.4 * Math.min(f.you, 4);
  if (f.len < 4) s -= 1;
  if (f.context) s -= 3;
  if (f.housekeeping) s -= 6;
  if (f.logistics) s -= 3;
  return s;
}

function categoryOf(feats) {
  const total = (k) => feats.reduce((a, f) => a + (f[k] ? 1 : 0), 0);
  const scores = { Story: total('story') * 1.5, Application: total('apply'), Quote: total('quotable') * 1.4, Scripture: total('scripture'), Question: total('question') * 0.8 };
  const [best, v] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return v > 0 ? best : 'Key point';
}

/** Score every window of whole sentences that fits [min,max] seconds, then pick non-overlapping. */
export function proposeHeuristic(words, { start, end, count = 8, min = 25, max = 60, prompt = '' } = {}) {
  const inRange = words.filter((w) => (start == null || w.start >= start) && (end == null || w.end <= end));
  const sentences = toSentences(inRange);
  const n = sentences.length;
  if (!n) return [];
  const feats = sentences.map((s) => lineFeatures(s.text));
  const scores = sentences.map((s) => lineScore(s.text));
  const bg = backgroundOf(sentences);
  const want = new Set(tokens(prompt).filter((t) => t.length > 2));

  // Lines that start the same way ("It's His love that…", "We remember…") build rhythm, which carries a short clip.
  const head = (t) => tokens(t).slice(0, 2).join(' ');
  const rhythm = sentences.map((s, i) => (i > 0 && head(s.text).length > 3 && head(s.text) === head(sentences[i - 1].text) ? 1 : 0));
  const cands = [];
  for (let a = 0; a < n; a++) {
    let b = a;
    // A story needs room for its setup and its point: windows that open on a story may run a quarter longer.
    const room = feats[a].story || feats[Math.min(n - 1, a + 1)].story ? max * 1.25 : max;
    while (b + 1 < n && sentences[b + 1].end - sentences[a].start <= room) b++;
    // Prefer to end on a finished sentence: walk back to the last one that ends with punctuation.
    let bEnd = b;
    while (bEnd > a && !sentences[bEnd].endsSentence && sentences[bEnd].end - sentences[a].start > min) bEnd--;
    for (const bb of new Set([b, bEnd])) {
      const dur = sentences[bb].end - sentences[a].start;
      if (dur < min || dur > room + 1) continue;
      const span = sentences.slice(a, bb + 1);
      const wordsN = span.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
      const density = wordsN / dur; // preaching ≈ 2–3 words/s
      const body = scores.slice(a + 1, bb + 1).reduce((x, y) => x + y, 0) / Math.max(bb - a, 1);
      const peak = Math.max(...scores.slice(a, bb + 1));
      const opener = scores[a] - (feats[a].dangling ? 3 : 0) - (a > 0 && !sentences[a - 1].endsSentence ? 2 : 0);
      const closer = (sentences[bb].endsSentence ? 1.5 : -1.5) + 0.5 * Math.min(scores[bb], 4);
      const leadPause = a > 0 ? sentences[a - 1].pauseAfter : 1;
      const tailPause = sentences[bb].pauseAfter;
      const housekeeping = feats.slice(a, bb + 1).some((f) => f.housekeeping);
      // A story that lands: a story early on and a payoff line later in the same window.
      const storyAt = feats.slice(a, bb + 1).findIndex((f) => f.story);
      const arc = storyAt >= 0 && feats.slice(a + storyAt + 1, bb + 1).some((f) => f.payoff || f.quotable || f.apply) ? 4 : 0;
      const beat = Math.min(3, rhythm.slice(a + 1, bb + 1).reduce((x, y) => x + y, 0));
      let score = 3 * opener + 2 * body + 1.2 * peak + 2 * Math.min(density, 3.2) + closer
        + 1.2 * Math.min(leadPause, 1.5) + 1.5 * Math.min(tailPause, 1.5) - (housekeeping ? 8 : 0) + arc + 1.2 * beat;
      if (want.size) {
        const toks = new Set(tokens(span.map((s) => s.text).join(' ')));
        const hit = [...want].filter((t) => toks.has(t)).length;
        score += 12 * hit / want.size;
      }
      cands.push({ score, a, b: bb });
    }
  }
  if (!cands.length) return [];
  cands.sort((x, y) => y.score - x.score);
  const top = cands[0].score || 1;
  const picked = [];
  for (const c of cands) {
    const s = sentences[c.a].start;
    const e = sentences[c.b].end;
    if (picked.some((p) => !(e <= p.start || s >= p.end))) continue;
    picked.push(buildClip(sentences, feats, scores, c, top, bg, inRange));
    if (picked.length >= count) break;
  }
  return picked.sort((x, y) => y.score - x.score);
}

function buildClip(sentences, feats, scores, { a, b, score }, top, bg, words) {
  const span = sentences.slice(a, b + 1);
  const text = span.map((s) => s.text).join(' ');
  // Title: the punchiest complete line (short enough for a thumbnail).
  const titleIdx = span
    .map((s, i) => ({ i, s: scores[a + i] + (s.text.length <= 90 ? 1 : -2) + (i === 0 ? 0.5 : 0) }))
    .sort((x, y) => y.s - x.s)[0].i;
  let title = span[titleIdx].text.replace(/^(and|but|so|because)\s+/i, '');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 90) title = `${title.slice(0, 87).replace(/\s+\S*$/, '')}…`;
  // Summary: the two strongest lines in time order (extractive).
  const summary = span
    .map((s, i) => ({ i, t: s.text, s: scores[a + i] }))
    .sort((x, y) => y.s - x.s).slice(0, 2).sort((x, y) => x.i - y.i)
    .map((x) => x.t).join(' ');
  const f = feats.slice(a, b + 1);
  const reasons = [];
  if (scores[a] > 2) reasons.push('Strong opening line');
  if (f.some((x) => x.story)) reasons.push(f.some((x) => x.payoff) ? 'A story that lands its point' : 'Tells a story');
  if (f.some((x) => x.apply)) reasons.push('Personal application');
  if (f.some((x) => x.quotable)) reasons.push('Quotable line');
  if (f.some((x) => x.scripture)) reasons.push('Cites scripture');
  if (f.some((x) => x.question)) reasons.push('Asks a question');
  if (sentences[b].endsSentence) reasons.push('Ends on a complete thought');
  const tags = keywords(text, bg, 3);
  const startT = Math.max(0, span[0].start - 0.15);
  const endT = span.at(-1).end + 0.35;
  return {
    id: randomUUID().slice(0, 8),
    start: +startT.toFixed(3), end: +endT.toFixed(3),
    title, summary, hook: '',
    score: Math.round(55 + 40 * Math.max(0, Math.min(score / top, 1))),
    category: categoryOf(f), reasons,
    startPhrase: firstWords(span[0].text), endPhrase: lastWords(span.at(-1).text),
    hashtags: [...tags, 'sermon', 'faith'],
    cutWords: [], tightenPauses: false, crop: { mode: 'auto', smooth: 0 }, videoTheme: null,
    status: 'proposed', source: 'heuristic',
  };
}
