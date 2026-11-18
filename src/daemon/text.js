// Transcript helpers shared by sermon detection and clip picking. Pure functions (tested).

/**
 * Group words into sentences. Whisper punctuates well, but long run-ons and pauses also
 * break lines. Each sentence keeps word index bounds.
 */
export function toSentences(words, { maxWords = 28, gap = 0.9 } = {}) {
  const out = [];
  let cur = [];
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length === 0) first = i;
    cur.push(w);
    const next = words[i + 1];
    const pause = next ? next.start - w.end : 99;
    const ends = /[.?!]["')\]]?$/.test(w.w);
    if (ends || pause > gap || cur.length >= maxWords || !next) {
      out.push({
        start: cur[0].start, end: cur[cur.length - 1].end,
        text: cur.map((x) => x.w).join(' '),
        i0: first, i1: i,
        pauseAfter: next ? Math.max(0, next.start - w.end) : 2,
        endsSentence: ends,
      });
      cur = [];
    }
  }
  return out;
}

export const STOPWORDS = new Set(`a an the and or but of to in on at for with about from by is are was were be been being am
it its it's this that these those i you he she we they me my your his her our their us them him s t
so just like really very well yeah oh okay ok uh um gonna wanna got get gets do does did done have has had
not no yes all any some can could would should will shall may might must there here what when where who
how why which while if then than as into out up down over again also one two even still because let let's
know think say said going go goes come came thing things way lot something anything everything someone
every before after check sees see already never always maybe much many more most little big good great
im i'm you're we're they're that's there's don't didn't can't won't isn't aren't wasn't i've you've we've
i'll you'll we'll he's she's right now today back make made see want take`.split(/\s+/));

export function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z][a-z']+/g) || []).map((t) => t.replace(/'s$/, ''));
}

export function contentWords(text) {
  return tokens(text).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Top keywords of `text` relative to a background document-frequency map (simple TF-IDF). */
export function keywords(text, background, n = 5) {
  const tf = new Map();
  for (const t of contentWords(text)) tf.set(t, (tf.get(t) || 0) + 1);
  const total = background?.total || 1;
  return [...tf.entries()]
    .map(([t, c]) => [t, c * Math.log(1 + total / (1 + (background?.df.get(t) || 0)))])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

/** Document frequency over sentences, used as the IDF background. */
export function backgroundOf(sentences) {
  const df = new Map();
  for (const s of sentences) for (const t of new Set(contentWords(s.text))) df.set(t, (df.get(t) || 0) + 1);
  return { df, total: sentences.length };
}

export function firstWords(text, n = 8) {
  const parts = String(text).split(/\s+/);
  return parts.slice(0, n).join(' ') + (parts.length > n ? '…' : '');
}

export function lastWords(text, n = 8) {
  const parts = String(text).split(/\s+/);
  return (parts.length > n ? '…' : '') + parts.slice(-n).join(' ');
}

export function fmtTime(t) {
  t = Math.max(0, Math.round(t));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
