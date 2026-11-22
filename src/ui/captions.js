// Mirrors scripts/render_clip.py (group_words / events) and src/daemon/render.js (keepSegments)
// so the live preview shows the same caption grouping and cuts as the export.

export function groupWords(words, maxWords = 3, maxChars = 22, sentences = false) {
  // A full-screen card showing the whole passage is one group; cards otherwise break only at sentence ends.
  if (maxWords >= 9999) return words.length ? [words] : [];
  const groups = [];
  let cur = [];
  const ends = sentences ? /[.?!]$/ : /[.?!,;:]$/;
  for (const w of words) {
    const chars = cur.reduce((a, x) => a + x.w.length, 0) + cur.length;
    const gap = cur.length ? w.start - cur.at(-1).end : 0;
    if (cur.length && (cur.length >= maxWords || chars + w.w.length > maxChars * Math.max(1, maxWords / 3) || gap > (sentences ? 1.2 : 0.6))) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
    if (ends.test(w.w)) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function captionEvents(words, maxWords, maxChars = 22, sentences = false) {
  const groups = groupWords(words, maxWords, maxChars, sentences);
  const events = [];
  groups.forEach((g, gi) => g.forEach((w, wi) => {
    let e = wi + 1 < g.length ? g[wi + 1].start : w.end + 0.15;
    if (gi + 1 < groups.length) e = Math.min(e, groups[gi + 1][0].start);
    if (e - w.start > 0.01) events.push({ s: w.start, e, group: g, wi });
  }));
  return events;
}

export function activeCaption(events, t) {
  // Small lists (one clip): a linear scan is fine.
  for (const ev of events) if (ev.s <= t && t < ev.e) return ev;
  return null;
}

export function keepSegments(words, clip, { maxPause = 0.45, pad = 0.08, fillers = null } = {}) {
  const len = clip.end - clip.start;
  const cut = new Set(clip.cutWords || []);
  const inClip = words.map((w, i) => ({ ...w, i })).filter((w) => w.end > clip.start && w.start < clip.end);
  // Each run of cut words goes from the end of the last kept word to the start of the next kept one, so the
  // pauses around cut words go too and the clip jumps straight to the next word (no little gaps of air).
  // Keep the tail of the last kept word and the start of the next one so neither sounds clipped.
  const TAIL = 0.12; const LEAD = 0.06;
  const cuts = [];
  for (let k = 0; k < inClip.length; k++) {
    if (!cut.has(inClip[k].i)) continue;
    let j = k; while (j + 1 < inClip.length && cut.has(inClip[j + 1].i)) j++;
    const prev = inClip[k - 1]; const next = inClip[j + 1];
    const from = prev ? Math.min(prev.end + TAIL, inClip[k].start) - clip.start : 0; // at the clip's start: cut from 0
    const to = next ? Math.max(next.start - LEAD, inClip[j].end) - clip.start : clip.end - clip.start; // at its end: cut to the end
    cuts.push([from, to]);
    k = j;
  }
  // "um" and "uh": each one goes with the air around it, keeping the tail of the word before and the start of the next.
  if (clip.cutFillers && fillers?.length) {
    for (const f of fillers) {
      if (f.end <= clip.start || f.start >= clip.end) continue;
      const prev = [...inClip].reverse().find((w) => w.end <= f.start + 0.01 && !cut.has(w.i));
      const next = inClip.find((w) => w.start >= f.end - 0.01 && !cut.has(w.i));
      const from = prev ? Math.min(prev.end + TAIL, f.start) : f.start;
      const to = next ? Math.max(next.start - LEAD, f.end) : f.end;
      cuts.push([from - clip.start, to - clip.start]);
    }
  }
  if (clip.tightenPauses) {
    const kept = inClip.filter((w) => !cut.has(w.i));
    for (let k = 1; k < kept.length; k++) {
      if (kept[k].start - kept[k - 1].end > maxPause) cuts.push([kept[k - 1].end - clip.start + pad, kept[k].start - clip.start - pad]);
    }
  }
  if (!cuts.length) return [[0, len]];
  cuts.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of cuts) {
    const a = Math.max(0, s);
    const b = Math.min(len, e);
    if (b <= a) continue;
    if (merged.length && a <= merged.at(-1)[1] + 0.01) merged.at(-1)[1] = Math.max(merged.at(-1)[1], b);
    else merged.push([a, b]);
  }
  const keep = [];
  let pos = 0;
  for (const [s, e] of merged) { if (s - pos > 0.05) keep.push([pos, s]); pos = e; }
  if (len - pos > 0.05) keep.push([pos, len]);
  return keep;
}

export const keptLength = (keep) => keep.reduce((a, [s, e]) => a + (e - s), 0);
