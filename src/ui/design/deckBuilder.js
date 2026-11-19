// Slide deck maker: builds a sermon or class deck from a few answers, from pasted notes, or from a
// transcribed sermon's outline. Headlines only, full bullets, or a mix. Optional discussion questions.
import { onColor, page, shape, text } from './model.js';

const REF = /\b((?:[1-3]\s?)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of (?:Songs|Solomon)|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d+(?::\d+(?:[-–]\d+)?)?)/gi;
export const findRefs = (t) => [...new Set([...String(t).matchAll(REF)].map((m) => m[1].replace(/\s+/g, ' ').replace(/^Psalms\b/i, 'Psalm')))];

/**
 * Read notes into sections. A heading is a Markdown heading, a numbered or Roman-numeral line, or a
 * short line with no ending punctuation. Lines under it become its points.
 */
export function parseNotes(notes) {
  const lines = String(notes || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections = []; const questions = []; let cur = null;
  const isHead = (l) => /^#{1,3}\s/.test(l) || /^(\d+|[IVX]+)[.)]\s+\S/.test(l) || (l.length <= 60 && !/[.,;:?!]$/.test(l) && !/^[-*•]/.test(l) && l.split(' ').length <= 9);
  for (const raw of lines) {
    const l = raw.replace(/^#{1,3}\s+/, '');
    if (/\?$/.test(l) && !isHead(raw)) { questions.push(l.replace(/^[-*•\d.)\s]+/, '')); continue; }
    if (isHead(raw)) { cur = { title: l.replace(/^(\d+|[IVX]+)[.)]\s+/, ''), points: [] }; sections.push(cur); continue; }
    if (!cur) { cur = { title: '', points: [] }; sections.push(cur); }
    cur.points.push(l.replace(/^[-*•]\s*/, ''));
  }
  return { sections: sections.filter((s) => s.title || s.points.length), questions, refs: findRefs(notes) };
}

const fit = (t, base, min = base * 0.55, room = 26) => Math.round(Math.max(min, Math.min(base, base * Math.sqrt(room / Math.max(room, String(t || '').length)))));

/** Build the pages. a = { kind: 'sermon'|'class', title, subtitle, passages[], format, questions, notes, outline } */
export function buildDeck(a, ctx) {
  const H = (p) => text({ font: ctx.h, weight: 800, ...p });
  const B = (p) => text({ font: ctx.b, weight: 500, size: 44, lh: 1.4, ...p });
  const dark = ctx.c[2]; const light = ctx.c[3] || '#F4EFE6'; const accent = ctx.c[1]; const primary = ctx.c[0];
  const parsed = a.notes?.trim() ? parseNotes(a.notes) : null;
  const o = a.outline;
  const passages = [...new Set([...(a.passages || []), ...(parsed?.refs || []), ...(!parsed && o?.refs ? o.refs.slice(0, 3) : [])])].slice(0, 6);
  let sections = parsed?.sections?.length ? parsed.sections : (o?.points || []).map((p) => ({ title: p.heading, points: p.line ? [p.line] : [] }));
  if (!sections.length) sections = [{ title: 'First point', points: [] }, { title: 'Second point', points: [] }, { title: 'Third point', points: [] }];
  const questions = parsed?.questions?.length ? parsed.questions : o?.questions || [];
  const pages = [];
  // Title
  pages.push(page({ bg: { type: 'mesh', seed: 11, darken: 0.3 }, items: [
    B({ text: a.kind === 'class' ? 'CLASS' : 'THIS SUNDAY', size: 34, weight: 700, letter: 8, x: 0.5, y: 0.24, opacity: 0.85 }),
    H({ text: a.title || o?.title || 'Title', size: fit(a.title || o?.title, 130), x: 0.5, y: 0.48, w: 0.82 }),
    ...(a.subtitle ? [B({ text: a.subtitle, size: 40, x: 0.5, y: 0.72, opacity: 0.85 })] : []),
  ], notes: 'Title slide.' }));
  // Scripture
  for (const ref of passages) {
    pages.push(page({ bg: { type: 'solid', color: dark, darken: 0 }, items: [
      shape({ x: 0.08, y: 0.5, w: 0.006, h: 0.5, fill: accent }),
      H({ text: ref, size: 64, align: 'left', x: 0.47, y: 0.27, w: 0.74, color: accent }),
      B({ text: 'Paste the verse text here.', size: 56, align: 'left', x: 0.47, y: 0.55, w: 0.74, lh: 1.4, color: light }),
    ], notes: `Read ${ref}.` }));
  }
  // Points
  sections.forEach((s, i) => {
    const pts = s.points.filter(Boolean);
    const head = s.title || `Point ${i + 1}`;
    if (a.format === 'headlines' || !pts.length) {
      pages.push(page({ bg: { type: 'solid', color: light, darken: 0 }, items: [
        H({ text: String(i + 1).padStart(2, '0'), size: 200, x: 0.5, y: 0.3, color: primary, opacity: 0.9 }),
        H({ text: head, size: fit(head, 104, 64, 26), x: 0.5, y: 0.6, w: 0.84, color: dark }),
      ], notes: pts.join('\n') }));
    } else if (a.format === 'bullets') {
      pages.push(page({ bg: { type: 'solid', color: light, darken: 0 }, items: [
        H({ text: head, size: fit(head, 84, 56, 30), align: 'left', x: 0.5, y: 0.2, w: 0.84, color: dark }),
        shape({ x: 0.13, y: 0.3, w: 0.1, h: 0.006, fill: accent }),
        B({ text: pts.slice(0, 5).map((p) => `•  ${p}`).join('\n'), size: pts.length > 3 ? 42 : 48, align: 'left', x: 0.5, y: 0.58, w: 0.84, lh: 1.5, color: dark }),
      ], notes: pts.join('\n') }));
    } else {
      pages.push(page({ bg: { type: 'solid', color: light, darken: 0 }, items: [
        H({ text: String(i + 1).padStart(2, '0'), size: 220, x: 0.17, y: 0.48, w: 0.25, color: primary, opacity: 0.9 }),
        H({ text: head, size: fit(head, 86, 56, 30), align: 'left', x: 0.6, y: 0.38, w: 0.62, color: dark }),
        B({ text: pts[0], size: 44, align: 'left', x: 0.6, y: 0.62, w: 0.62, color: dark, opacity: 0.85 }),
      ], notes: pts.slice(1).join('\n') }));
    }
  });
  // Discussion questions
  if (a.questions) {
    const qs = questions.length ? questions.slice(0, 4) : ['What stood out to you most?', 'Where do you see this in your own life?', 'What is one step you will take this week?'];
    pages.push(page({ bg: { type: 'solid', color: primary, darken: 0 }, items: [
      H({ text: 'Talk about it', size: 96, align: 'left', x: 0.5, y: 0.2, w: 0.84, color: onColor(primary) }),
      B({ text: qs.map((q, k) => `${k + 1}.  ${q}`).join('\n'), size: 44, align: 'left', x: 0.5, y: 0.58, w: 0.84, lh: 1.55, color: onColor(primary) }),
    ], notes: 'Give groups a few minutes for each question.' }));
  }
  // Close
  pages.push(page({ bg: { type: 'mesh', seed: 77, darken: 0.3 }, items: [
    H({ text: a.kind === 'class' ? 'Thanks for coming' : 'Thanks for being here', size: 104, x: 0.5, y: 0.44, w: 0.84 }),
    B({ text: '[Add next steps or a website]', size: 40, x: 0.5, y: 0.62, opacity: 0.85 }),
  ] }));
  return pages;
}
