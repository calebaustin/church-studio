// Transcript files people can take elsewhere: readable text, text with times, and caption files.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getProject, getTranscript } from './projects.js';
import { downloadsDir } from './render.js';

const two = (n) => String(n).padStart(2, '0');
const clock = (t, sep = ',') => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60; return `${two(h)}:${two(m)}:${two(s)}${sep}${String(ms % 1000).padStart(3, '0')}`; };
const short = (t) => { t = Math.floor(t); const h = Math.floor(t / 3600); const m = Math.floor(t / 60) % 60; return h ? `${h}:${two(m)}:${two(t % 60)}` : `${m}:${two(t % 60)}`; };

/** Segments grouped into paragraphs at pauses, about five sentences each. */
export function paragraphs(segments) {
  const out = []; let cur = null;
  for (const s of segments || []) {
    if (!s.text || s.noSpeech > 0.8) continue;
    const gap = cur ? s.start - cur.end : 0;
    const sentences = cur ? (cur.text.match(/[.!?](\s|$)/g) || []).length : 0;
    if (!cur || gap > 1.6 || (sentences >= 5 && /[.!?]$/.test(cur.text))) { cur = { start: s.start, end: s.end, text: s.text }; out.push(cur); }
    else { cur.text += ` ${s.text}`; cur.end = s.end; }
  }
  return out;
}

/** Caption lines from words: short lines that break at pauses and punctuation. */
function cues(words, maxChars = 42) {
  const out = []; let cur = null;
  for (const w of words) {
    const t = w.w.trim(); if (!t) continue;
    if (cur && (cur.text.length + t.length + 1 > maxChars || w.start - cur.end > 0.8 || cur.end - cur.start > 5)) cur = null;
    if (!cur) { cur = { start: w.start, end: w.end, text: t }; out.push(cur); }
    else { cur.text += ` ${t}`; cur.end = w.end; }
    if (/[.!?]$/.test(t)) cur = null;
  }
  return out;
}

export async function transcriptText(id, format) {
  const project = await getProject(id);
  const t = await getTranscript(id);
  if (!t) throw new Error('Transcribe this first.');
  const range = project.sermon?.confirmed && format !== 'all' ? project.sermon : null;
  const inRange = (x) => !range || (x.start >= range.start - 0.5 && x.end <= range.end + 0.5);
  if (format === 'srt') return cues(t.words.filter(inRange)).map((c, i) => `${i + 1}\n${clock(c.start)} --> ${clock(c.end)}\n${c.text}\n`).join('\n');
  if (format === 'vtt') return `WEBVTT\n\n${cues(t.words.filter(inRange)).map((c) => `${clock(c.start, '.')} --> ${clock(c.end, '.')}\n${c.text}\n`).join('\n')}`;
  const paras = paragraphs((t.segments || []).filter(inRange));
  const head = `${project.title}\n\n`;
  if (format === 'timed') return head + paras.map((p) => `[${short(p.start)}] ${p.text}`).join('\n\n') + '\n';
  return head + paras.map((p) => p.text).join('\n\n') + '\n';
}

export async function saveTranscript(id, format = 'txt') {
  const project = await getProject(id);
  const text = await transcriptText(id, format);
  const ext = { srt: 'srt', vtt: 'vtt' }[format] || 'txt';
  const safe = project.title.replace(/[/\\:*?"<>|]+/g, '-').slice(0, 120);
  const dest = path.join(downloadsDir(), `${safe}${format === 'timed' ? ' (with times)' : ''}.${ext}`);
  await writeFile(dest, text);
  return { file: dest };
}

/** Paragraphs with their words and times, for reading, timestamps and selections. */
export async function transcriptParagraphs(id, whole = false) {
  const project = await getProject(id);
  const t = await getTranscript(id);
  if (!t) throw new Error('Transcribe this first.');
  const range = project.sermon?.confirmed && !whole ? project.sermon : null;
  const inRange = (x) => !range || (x.start >= range.start - 0.5 && x.end <= range.end + 0.5);
  const paras = paragraphs((t.segments || []).filter(inRange));
  const words = t.words.filter(inRange);
  let k = 0;
  const out = paras.map((p) => {
    const ws = [];
    while (k < words.length && words[k].start < p.end + 0.05) { if (words[k].start >= p.start - 0.3) ws.push({ w: words[k].w, start: words[k].start, end: words[k].end }); k++; }
    return { start: p.start, end: p.end, words: ws.length ? ws : p.text.split(/\s+/).map((w) => ({ w, start: p.start, end: p.end })) };
  });
  return { title: project.title, trimmed: Boolean(range), paragraphs: out };
}
