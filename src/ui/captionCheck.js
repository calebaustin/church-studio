// Caption checks for social posts: plain, fixable notes. No network, no AI.
const CTA = /\b(watch|join|share|comment|tag|follow|visit|link|subscribe|save|tell|come|invite|pray|read|listen|sign up|register)\b|\?/i;

export function checkCaption(text, platforms = []) {
  const notes = [];
  const t = text || '';
  const words = t.split(/\s+/).filter(Boolean);
  const tags = (t.match(/#[\p{L}\p{N}_]+/gu) || []);
  const firstLine = t.split('\n')[0];
  for (const p of platforms) {
    if (p.captionMax && t.length > p.captionMax) notes.push({ level: 'bad', msg: `${t.length - p.captionMax} characters too long for ${p.name}.` });
  }
  if (!t.trim()) notes.push({ level: 'warn', msg: 'The caption is empty.' });
  if (firstLine.length > 125 && platforms.some((p) => /instagram|facebook|tiktok/.test(p.id))) notes.push({ level: 'warn', msg: 'The first line gets cut off with “more”. Put the main point in the first 125 characters.' });
  if (tags.length > 8) notes.push({ level: 'warn', msg: `${tags.length} hashtags. Three to five usually works better.` });
  if (t.length > 40 && !CTA.test(t)) notes.push({ level: 'info', msg: 'Add a next step, like “Share this with someone who needs it.”' });
  const caps = words.filter((w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  if (words.length > 6 && caps / words.length > 0.3) notes.push({ level: 'warn', msg: 'Lots of ALL CAPS reads as shouting.' });
  if (/https?:\/\//.test(t) && platforms.some((p) => /instagram|tiktok/.test(p.id))) notes.push({ level: 'info', msg: 'Links aren’t clickable in Instagram and TikTok captions. Say “link in bio”.' });
  const rep = {};
  for (const w of words.map((x) => x.toLowerCase().replace(/[^a-z']/g, '')).filter((x) => x.length > 4)) rep[w] = (rep[w] || 0) + 1;
  const over = Object.entries(rep).filter(([, n]) => n >= 4).map(([w]) => w);
  if (over.length) notes.push({ level: 'info', msg: `“${over[0]}” shows up a lot. Try another word.` });
  if (/ {2,}/.test(t)) notes.push({ level: 'info', msg: 'There are double spaces.' });
  return notes;
}
