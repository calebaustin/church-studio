// The World English Bible (public domain), used only to check Bible references and show their exact wording,
// and to find verses that use a word. Never to interpret them. Loaded the first time it's needed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ASSETS_DIR } from './tools.js';

let bible = null;
function load() {
  if (!bible) bible = JSON.parse(zlib.gunzipSync(readFileSync(path.join(ASSETS_DIR, 'bible', 'web.json.gz'))).toString('utf8'));
  return bible;
}
export const TRANSLATION = 'World English Bible';

const ALIAS = { psalms: 'psalm', 'song of songs': 'song of solomon', songs: 'song of solomon', revelations: 'revelation', 'canticles': 'song of solomon' };
const ORD = { first: '1', second: '2', third: '3', i: '1', ii: '2', iii: '3', '1st': '1', '2nd': '2', '3rd': '3' };
function bookIndex(name) {
  let n = String(name).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  n = n.replace(/^(first|second|third|iii|ii|i|1st|2nd|3rd)\s+/, (m, w) => `${ORD[w]} `).replace(/^([1-3])\s*/, '$1 ');
  n = ALIAS[n] || n;
  return load().books.findIndex((b) => b.name.toLowerCase() === n);
}

const BOOKS = '(?:(?:[1-3]|First|Second|Third|I{1,3})\\s?)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of (?:Solomon|Songs)|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelations?)';
/** Every Bible reference in some text, like "John 3:16-17" or "Psalm 23". */
export const REF_RE = new RegExp(`\\b(${BOOKS})\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s?[-–]\\s?(\\d{1,3}))?)?`, 'g');

/** Look up a reference. Returns { ref, text } with the exact wording, or null if it doesn't exist. */
export function lookup(book, chapter, from, to) {
  const bi = bookIndex(book);
  if (bi < 0) return null;
  const b = load().books[bi];
  const ch = b.ch[Number(chapter) - 1];
  if (!ch) return null;
  if (!from) return { ref: `${b.name} ${chapter}`, text: ch.slice(0, 3).filter(Boolean).join(' ') + (ch.length > 3 ? ' …' : ''), whole: true };
  const a = Number(from); const z = Math.min(Number(to || from), a + 5, ch.length);
  if (!ch[a - 1] || z < a) return null;
  return { ref: `${b.name} ${chapter}:${a}${z > a ? `-${z}` : ''}`, text: ch.slice(a - 1, z).join(' ') };
}

export function refsIn(text) {
  const out = [];
  for (const m of String(text).matchAll(REF_RE)) out.push({ raw: m[0], book: m[1], chapter: m[2], from: m[3], to: m[4], index: m.index });
  return out;
}

// Books people quote most often come first when many verses use the same word.
const FAVORED = new Set(['Psalm', 'Proverbs', 'Isaiah', 'Matthew', 'John', 'Romans', '2 Corinthians', 'Ephesians', 'Philippians', 'Hebrews', 'James', '1 Peter', '1 John', 'Lamentations', 'Joshua', 'Jeremiah', 'Colossians', 'Galatians', '1 Corinthians', 'Luke']);
const STOP = new Set(['verse', 'verses', 'bible', 'scripture', 'scriptures', 'about', 'more', 'some', 'give', 'find', 'other', 'alternative', 'post', 'blog', 'sermon', 'that', 'with', 'from', 'this', 'what', 'have', 'like', 'could', 'would', 'please', 'topic', 'for', 'the', 'and', 'our', 'few', 'any', 'can', 'you', 'me', 'my']);
/** Topic words from a request like "a few more verses about hope and patience". */
export function topicWords(text) {
  return [...new Set((String(text).toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)))].slice(0, 4);
}
/** Verses that use the topic words (or their simple forms), favoring well-known books and short verses. */
export function versesAbout(words, n = 8) {
  if (!words.length) return [];
  const res = words.map((w) => new RegExp(`\\b${w.replace(/(s|es|ing|ed)$/, '')}\\w{0,4}\\b`, 'i'));
  const hits = [];
  load().books.forEach((b) => b.ch.forEach((ch, ci) => ch.forEach((v, vi) => {
    if (!v) return;
    const score = res.filter((re) => re.test(v)).length;
    if (!score) return;
    hits.push({ ref: `${b.name} ${ci + 1}:${vi + 1}`, text: v, score: score * 10 + (FAVORED.has(b.name) ? 4 : 0) - v.length / 80 });
  })));
  return hits.sort((a, b) => b.score - a.score).slice(0, n);
}
