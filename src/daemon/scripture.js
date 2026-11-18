// Bible references as preachers say them, written the way people read them.
// "First Corinthians 10 beginning in verse 16" -> "1 Corinthians 10:16"
// "John chapter three, verses sixteen through eighteen" -> "John 3:16-18"
// Works on Whisper's word list (keeps timings) and on plain text.

const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', 'Samuel', 'Kings', 'Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Song of Songs', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', 'Thessalonians', 'Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', 'Peter', 'Jude', 'Revelation',
];
const ALIASES = {
  psalms: 'Psalm', revelations: 'Revelation', 'song of songs': 'Song of Songs', 'songs of solomon': 'Song of Solomon',
  ecclesiastics: 'Ecclesiastes', phillipians: 'Philippians', colosians: 'Colossians', habakuk: 'Habakkuk', galations: 'Galatians',
};
const NUMBERED = new Set(['Samuel', 'Kings', 'Chronicles', 'Corinthians', 'Thessalonians', 'Timothy', 'Peter', 'John']);
// Common words or names: only treated as a book when the reference is unmistakable.
const AMBIGUOUS = new Set(['Numbers', 'Job', 'Mark', 'John', 'Acts', 'James', 'Jude', 'Ruth', 'Daniel', 'Amos', 'Joel', 'Titus', 'Peter', 'Luke', 'Matthew']);
const ORDINAL = { first: 1, '1st': 1, one: 1, '1': 1, second: 2, '2nd': 2, two: 2, ii: 2, '2': 2, third: 3, '3rd': 3, three: 3, iii: 3, '3': 3 };

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const core = (t) => String(t || '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9:-]+$/g, '').replace(/[-–]$/, '');
const trail = (t) => (String(t).match(/[^A-Za-z0-9]+$/) || [''])[0];
const lead = (t) => (String(t).match(/^[^A-Za-z0-9]+/) || [''])[0];

const bookIndex = new Map();
for (const b of BOOKS) bookIndex.set(b.toLowerCase(), b);
for (const [k, v] of Object.entries(ALIASES)) bookIndex.set(k, v);
const MAX_BOOK_WORDS = 3;

/** Number at toks[i] (digits or words up to 199). Returns {value, next} or null. */
function readNumber(toks, i) {
  const c = core(toks[i]);
  if (!c) return null;
  if (/^\d{1,3}$/.test(c)) return { value: Number(c), next: i + 1 };
  const hy = c.split('-');
  if (hy.length === 2 && TENS[hy[0]] && ONES.indexOf(hy[1]) > 0 && ONES.indexOf(hy[1]) < 10) return { value: TENS[hy[0]] + ONES.indexOf(hy[1]), next: i + 1 };
  let value = null; let j = i;
  if (c === 'hundred' || c === 'a') return null;
  if (core(toks[j]) === 'one' && core(toks[j + 1]) === 'hundred') { value = 100; j += 2; if (core(toks[j]) === 'and') j++; }
  const w = core(toks[j]);
  if (TENS[w] != null) {
    value = (value || 0) + TENS[w]; j++;
    const o = ONES.indexOf(core(toks[j]));
    if (o > 0 && o < 10) { value += o; j++; }
  } else if (ONES.indexOf(w) >= 0) { value = (value || 0) + ONES.indexOf(w); j++; }
  if (value == null || value === 0) return null;
  return { value, next: j };
}

/** Book at toks[i] (one to three words). Returns {book, next} or null. */
function readBook(toks, i) {
  for (let n = MAX_BOOK_WORDS; n >= 1; n--) {
    const words = toks.slice(i, i + n).map(core);
    if (words.length < n || words.some((w) => !w)) continue;
    const b = bookIndex.get(words.join(' '));
    if (b) return { book: b, next: i + n };
  }
  return null;
}

const skip = (toks, i, set) => { while (i < toks.length && set.has(core(toks[i]))) i++; return i; };
const CH_WORDS = new Set(['chapter', 'chapters']);
const VERSE_LEAD = new Set(['beginning', 'starting', 'in', 'at', 'with', 'and', 'verse', 'verses', 'v', 'vs']);
const RANGE = new Set(['through', 'thru', 'to', '-', '–']);

/** Try to read a reference starting at toks[i]. Returns {text parts, next} or null. */
function readRef(toks, i) {
  let j = i; let ord = null;
  const o = ORDINAL[core(toks[j])];
  if (o) {
    const b = readBook(toks, j + 1);
    if (b && NUMBERED.has(b.book)) { ord = o; j += 1; }
  }
  const b = readBook(toks, j);
  if (!b) return null;
  j = b.next;
  // "chapter" is optional; "10:16" may come as one token.
  let k = skip(toks, j, CH_WORDS);
  const sawChapterWord = k > j;
  const whole = core(toks[k]).match(/^(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?$/);
  if (whole) {
    return { ord, book: b.book, ch: Number(whole[1]), v: Number(whole[2]), v2: whole[3] ? Number(whole[3]) : null, next: k + 1, strong: true };
  }
  const ch = readNumber(toks, k);
  if (!ch || ch.value > 150) return null;
  const chDigits = /^\d+$/.test(core(toks[k]));
  k = ch.next;
  let v = null; let v2 = null; let strong = sawChapterWord || chDigits || ord != null;
  // Verse: "verse 16", "beginning in verse 16", ", 16", or a second number right away ("John three sixteen").
  const afterLead = skip(toks, k, VERSE_LEAD);
  const leadWords = toks.slice(k, afterLead).map(core);
  const hasVerseWord = leadWords.some((w) => w === 'verse' || w === 'verses' || w === 'v' || w === 'vs');
  if (hasVerseWord || afterLead === k) {
    const vn = readNumber(toks, afterLead);
    if (vn && vn.value <= 176 && (hasVerseWord || !/[.?!]$/.test(String(toks[k - 1])))) {
      v = vn.value; k = vn.next; strong = true;
      const r = skip(toks, k, RANGE);
      if (r > k) { const vr = readNumber(toks, r); if (vr && vr.value > v) { v2 = vr.value; k = vr.next; } }
      else if (core(toks[k]) === 'and') { const vr = readNumber(toks, k + 1); if (vr && vr.value === v + 1) { v2 = vr.value; k = vr.next; } }
    }
  }
  if (AMBIGUOUS.has(b.book) && !ord && !strong) return null;
  if (!strong && !chDigits) return null;
  return { ord, book: b.book, ch: ch.value, v, v2, next: k };
}

const refText = (r) => `${r.ord ? `${r.ord} ` : ''}${r.book} ${r.ch}${r.v ? `:${r.v}${r.v2 ? `-${r.v2}` : ''}` : ''}`;

/** Rewrite spoken references in a Whisper word list, keeping timings. */
export function normalizeWords(words) {
  if (!Array.isArray(words) || !words.length) return words;
  const toks = words.map((w) => w.w);
  const out = [];
  for (let i = 0; i < words.length;) {
    const prev = core(toks[i - 1]);
    const r = /^[a-z]/.test(core(toks[i])) || /^\d$/.test(core(toks[i])) ? readRef(toks, i) : null;
    if (!r || prev === 'the' && r.book === 'Numbers') { out.push(words[i]); i++; continue; }
    const span = words.slice(i, r.next);
    const p = Math.min(...span.map((w) => w.p ?? 1));
    const tail = trail(span.at(-1).w).replace(/^[-–]+/, '');
    const parts = refText(r).split(' ');
    // First part keeps the first word's start; the last part keeps the last word's end.
    const t0 = span[0].start; const t1 = span.at(-1).end;
    const step = (t1 - t0) / parts.length;
    parts.forEach((part, k) => out.push({
      w: `${k === 0 ? lead(span[0].w) : ''}${part}${k === parts.length - 1 ? tail : ''}`,
      start: +(t0 + step * k).toFixed(3), end: k === parts.length - 1 ? t1 : +(t0 + step * (k + 1)).toFixed(3),
      ...(span[0].p != null ? { p } : {}),
    }));
    i = r.next;
  }
  return out;
}

/** Same rewrite for plain text. */
export function normalizeText(text) {
  if (!text) return text;
  return String(text).split(/\n/).map((line) => {
    const toks = line.split(/(\s+)/);
    const words = toks.filter((t, k) => k % 2 === 0 && t).map((w) => ({ w, start: 0, end: 0 }));
    const fixed = normalizeWords(words).map((w) => w.w);
    return fixed.join(' ').replace(/^\s+/, line.match(/^\s*/)[0]);
  }).join('\n');
}

const REF_RE = new RegExp(`\\b(?:[123] )?(?:${BOOKS.map((b) => b.replace(/ /g, '\\s')).join('|')})s?\\s\\d{1,3}(?::\\d{1,3}(?:-\\d{1,3})?)?`, 'g');
/** Clean references found in text, in order, without repeats. */
export function extractRefs(text, max = 8) {
  const found = [];
  for (const m of normalizeText(text).matchAll(REF_RE)) {
    const ref = m[0].replace(/^Psalms /, 'Psalm ');
    // Skip bare "John 3" style mentions that are really names, unless a verse is given.
    const book = ref.replace(/^[123] /, '').split(' ')[0];
    if (AMBIGUOUS.has(book) && !/^[123] /.test(ref) && !ref.includes(':')) continue;
    if (!found.includes(ref)) found.push(ref);
    if (found.length >= max) break;
  }
  return found;
}

/** Words that help Whisper spell book names (used as hotwords). */
export const WHISPER_HINT = 'Bible references like 1 Corinthians 10:16, John 3:16-18, Psalm 23, Habakkuk, Ecclesiastes, Philippians, Thessalonians, Deuteronomy, Zechariah, Nehemiah, Lamentations.';
