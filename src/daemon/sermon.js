// Find the sermon inside a full service video — no LLM.
//
// A service is worship songs, announcements, prayer, the sermon, and a closing. The sermon is
// almost always the longest stretch of continuous, conversational speech. Songs look different
// in a transcript: slower word rate, gaps, and lyrics that repeat. So we:
//   1. bin the transcript into 30 s windows and mark each as "talk" or not,
//   2. take the longest run of talk (bridging gaps up to ~90 s for scripture readings / pauses),
//   3. snap the edges to nearby cue phrases ("turn with me to…", "let's pray").
// The user always confirms or drags the range in the UI.
import { toSentences, tokens } from './text.js';

const BIN = 30;
const START_CUES = [
  /\b(open|turn) (your bibles?|with me|to)\b/i, /\bif you have (a|your) bibles?\b/i,
  /\b(our|the) (text|passage|scripture) (today|this morning|this week)\b/i,
  /\b(chapter|verse) \d+/i, /\bthis morning we('re| are)\b/i, /\bseries\b/i, /\bgood morning\b/i,
  /\blet's (pray|open)\b/i,
];
const END_CUES = [
  /\blet's pray\b/i, /\bwould you (stand|bow|pray)\b/i, /\bin jesus'? name\b/i, /\bamen\b/i,
  /\bworship team\b/i, /\bas (we|the band) (close|come)\b/i, /\bheads bowed\b/i,
];

/** Per-bin features. Exported for tests and the timeline strip in the UI. */
export function binTranscript(words, duration) {
  const n = Math.max(1, Math.ceil((duration || words.at(-1)?.end || 0) / BIN));
  const bins = Array.from({ length: n }, (_, i) => ({ start: i * BIN, end: (i + 1) * BIN, words: 0, voiced: 0, grams: [], prob: 0 }));
  for (const w of words) {
    const b = bins[Math.min(n - 1, Math.floor(w.start / BIN))];
    b.words++;
    b.voiced += Math.max(0, Math.min(w.end, b.end) - Math.max(w.start, b.start));
    b.prob += w.p ?? 0.8;
  }
  // Lyric repetition: share of a bin's 3-grams already heard in the previous 4 minutes.
  const toks = words.map((w) => ({ t: tokens(w.w)[0] || '', s: w.start }));
  const recent = [];
  for (let i = 2; i < toks.length; i++) {
    const g = `${toks[i - 2].t} ${toks[i - 1].t} ${toks[i].t}`;
    const b = bins[Math.min(n - 1, Math.floor(toks[i].s / BIN))];
    while (recent.length && recent[0].s < toks[i].s - 240) recent.shift();
    b.grams.push(recent.some((r) => r.g === g) ? 1 : 0);
    recent.push({ g, s: toks[i].s });
  }
  return bins.map((b) => {
    const wpm = b.words * (60 / BIN);
    const repeat = b.grams.length ? b.grams.reduce((a, x) => a + x, 0) / b.grams.length : 0;
    const prob = b.words ? b.prob / b.words : 0;
    const talk = wpm >= 85 && repeat < 0.3 && prob > 0.45;
    return { start: b.start, end: b.end, wpm: Math.round(wpm), repeat: +repeat.toFixed(2), prob: +prob.toFixed(2), talk };
  });
}

function longestRun(bins, maxGap = 3) {
  let best = null;
  let i = 0;
  while (i < bins.length) {
    if (!bins[i].talk) { i++; continue; }
    let j = i;
    let k = i;
    let gap = 0;
    let talkBins = 1;
    while (k + 1 < bins.length) {
      k++;
      if (bins[k].talk) { j = k; gap = 0; talkBins++; } else if (++gap > maxGap) break;
    }
    const run = { a: i, b: j, len: j - i + 1, talkBins };
    if (!best || run.talkBins > best.talkBins) best = run;
    i = j + 1;
  }
  return best;
}

function snap(sentences, t, cues, windowSec, prefer) {
  const near = sentences.filter((s) => Math.abs(s.start - t) <= windowSec && cues.some((c) => c.test(s.text)));
  if (!near.length) return null;
  near.sort((x, y) => Math.abs(x.start - t) - Math.abs(y.start - t));
  return prefer === 'start' ? near[0].start : near[0].start;
}

export function detectSermon(words, duration) {
  if (!words?.length) return { start: 0, end: duration || 0, confidence: 0, method: 'none', confirmed: false, reasons: ['No speech found.'] };
  const bins = binTranscript(words, duration);
  const run = longestRun(bins);
  const totalTalk = bins.filter((b) => b.talk).length;
  const sentences = toSentences(words);
  const reasons = [];
  if (!run) {
    return { start: words[0].start, end: words.at(-1).end, confidence: 0.2, method: 'heuristic', confirmed: false, reasons: ['No long talk section found; using the whole video.'] };
  }
  let start = bins[run.a].start;
  let end = bins[run.b].end;
  reasons.push(`${Math.round((end - start) / 60)} minutes of steady speaking.`);

  const cueStart = snap(sentences, start, START_CUES, 150, 'start');
  if (cueStart != null) { start = cueStart; reasons.push('Starts at an opener like “turn with me to”.'); }
  // End: the last closing cue inside the final 4 minutes of the run.
  const closers = sentences.filter((s) => s.start <= end + 60 && s.start >= end - 240 && END_CUES.some((c) => c.test(s.text)));
  if (closers.length) { end = closers.at(-1).end; reasons.push('Ends at a closing like “let\'s pray”.'); }

  // Snap edges to sentence boundaries.
  const first = sentences.find((s) => s.end > start);
  const last = [...sentences].reverse().find((s) => s.start < end);
  if (first) start = first.start;
  if (last) end = last.end;

  const share = totalTalk ? run.talkBins / totalTalk : 0;
  let confidence = 0.35 + 0.4 * share + (cueStart != null ? 0.15 : 0) + (closers.length ? 0.1 : 0);
  if (end - start < 8 * 60) { confidence -= 0.25; reasons.push('Short for a sermon. Check the range.'); }
  return {
    start: Math.max(0, +start.toFixed(2)), end: +end.toFixed(2),
    confidence: +Math.max(0.05, Math.min(0.98, confidence)).toFixed(2),
    method: 'heuristic', confirmed: false, reasons,
    bins: bins.map(({ start: s, wpm, talk }) => ({ s, wpm, talk })),
  };
}
