// On-page SEO and readability checks for blog drafts. Our own implementation of widely used
// rules (keyphrase placement, length, readability). Plain notes, no network.
const TRANSITIONS = ['also', 'because', 'but', 'so', 'then', 'first', 'second', 'finally', 'however', 'therefore', 'for example', 'for instance', 'in fact', 'instead', 'meanwhile', 'besides', 'still', 'yet', 'after', 'before', 'later', 'next', 'as a result', 'in other words', 'that is why', 'even so', 'at the same time', 'above all', 'in short', 'similarly', 'likewise', 'otherwise'];

const strip = (md) => md.replace(/^>\s?/gm, '').replace(/[#*_`[\]()]/g, ' ');
// Headings and list items end at their line, so they never run into the next sentence.
const sentencesOf = (t) => t.split(/\n+|(?<=[.?!])\s+/).map((s) => s.replace(/^\s*[-*]\s+|^\s*\d+\.\s+/, '').replace(/\s+/g, ' ').trim()).filter((s) => s.split(/\s+/).length > 2);
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export function seoChecks(md, { keyphrase = '', title = '', meta = '', slug = '' } = {}) {
  const kp = keyphrase.trim().toLowerCase();
  const text = strip(md);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const lower = text.toLowerCase();
  const paras = md.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('#'));
  const intro = (paras.find((p) => !p.startsWith('>')) || '').toLowerCase();
  const heads = (md.match(/^#{2,3}\s.+$/gm) || []).map((h) => h.toLowerCase());
  const sents = sentencesOf(text);
  const count = kp ? (lower.match(new RegExp(`\\b${kp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length : 0;
  const density = words.length ? (count * kp.split(' ').length * 100) / words.length : 0;
  const long = sents.filter((s) => s.split(/\s+/).length > 20).length / Math.max(1, sents.length);
  const passive = sents.filter((s) => /\b(is|are|was|were|be|been|being)\s+\w+ed\b/i.test(s)).length / Math.max(1, sents.length);
  const trans = sents.filter((s) => TRANSITIONS.some((t) => s.toLowerCase().startsWith(t) || s.toLowerCase().includes(` ${t} `))).length / Math.max(1, sents.length);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const flesch = 206.835 - 1.015 * (words.length / Math.max(1, sents.length)) - 84.6 * (syl / Math.max(1, words.length));
  const longPara = paras.filter((p) => p.split(/\s+/).length > 150).length;
  let gaps = 0; let run = 0;
  for (const line of md.split('\n')) { if (/^#{2,3}\s/.test(line)) run = 0; else { run += line.split(/\s+/).filter(Boolean).length; if (run > 300) { gaps++; run = 0; } } }

  const c = (label, ok, warn, note) => ({ label, status: ok ? 'good' : warn ? 'ok' : 'bad', note });
  const seo = [
    c('Focus keyphrase', Boolean(kp), false, kp ? `“${keyphrase}”` : 'Pick the phrase people would search for.'),
    c('Keyphrase in title', kp && title.toLowerCase().includes(kp), false, 'Put the keyphrase in the title.'),
    c('Keyphrase in the opening', kp && intro.includes(kp), false, 'Mention it in the first paragraph.'),
    c('Keyphrase use', density >= 0.5 && density <= 3, count > 0, kp ? `Used ${count} times (${density.toFixed(1)}%). Aim for 0.5% to 3%.` : ''),
    c('Keyphrase in a heading', kp && heads.some((h) => h.includes(kp)), false, 'Use it in at least one subheading.'),
    c('Meta description length', meta.length >= 120 && meta.length <= 156, meta.length >= 80 && meta.length <= 170, `${meta.length} characters. Aim for 120 to 156.`),
    c('Keyphrase in meta description', kp && meta.toLowerCase().includes(kp), false, 'Include it in the meta description.'),
    c('Keyphrase in the web address', kp && slug.includes(kp.replace(/\s+/g, '-')), false, 'Use it in the slug.'),
    c('Length', words.length >= 600, words.length >= 300, `${words.length} words. 600 or more tends to rank better.`),
    c('Title length', title.length >= 30 && title.length <= 65, title.length >= 20 && title.length <= 75, `${title.length} characters. Aim for 30 to 65.`),
  ];
  // Where each problem is, so the editor can underline it: the exact sentences or paragraphs (plain text).
  const spot = (item, list) => (list.length ? { ...item, spots: list } : item);
  const passiveRe = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/i;
  const read = [
    spot(c('Short sentences', long <= 0.25, long <= 0.3, `${Math.round(long * 100)}% of sentences are over 20 words. Keep it under 25%.`), sents.filter((x) => x.split(/\s+/).length > 20)),
    spot(c('Short paragraphs', longPara === 0, longPara <= 1, longPara ? `${longPara} paragraph${longPara > 1 ? 's are' : ' is'} over 150 words.` : 'Paragraphs are a comfortable length.'), paras.filter((p) => p.split(/\s+/).length > 150).map((p) => strip(p).replace(/\s+/g, ' ').trim())),
    c('Subheadings', gaps === 0, gaps <= 1, gaps ? 'Add a subheading at least every 300 words.' : 'Text is well broken up.'),
    spot(c('Active voice', passive <= 0.1, passive <= 0.15, `${Math.round(passive * 100)}% passive voice. Keep it under 10%.`), sents.filter((x) => passiveRe.test(x)).map((x) => x.match(passiveRe)[0])),
    c('Transition words', trans >= 0.3, trans >= 0.2, `${Math.round(trans * 100)}% of sentences use them. Aim for 30%.`),
    c('Easy to read', flesch >= 60, flesch >= 50, `Reading ease ${Math.round(flesch)}. 60 or higher reads easily.`),
  ];
  const score = (list) => Math.round((list.reduce((a, x) => a + (x.status === 'good' ? 2 : x.status === 'ok' ? 1 : 0), 0) / (list.length * 2)) * 100);
  return { seo, read, seoScore: score(seo), readScore: score(read), words: words.length };
}
