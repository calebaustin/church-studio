// One project per sermon video: projects/<id>/{project.json, source.mp4, audio.wav,
// transcript.json, exports/}. project.json holds the sermon range and the clips.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECTS_DIR } from './tools.js';
import { normalizeWords } from './scripture.js';

/**
 * A Sermon is a project type: a sermon recording whose sermon has been found (its range confirmed), or one
 * someone marked as a sermon. Older projects count by the same rule, so nothing needs converting.
 */
export const isSermon = (p) => (typeof p?.isSermon === 'boolean' ? p.isSermon : (p?.kind === 'sermon' || !p?.kind) && Boolean(p?.sermon?.confirmed) && p?.sermon?.method !== 'whole');

export function projectDir(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Bad project id');
  return path.join(PROJECTS_DIR, id);
}

export const file = (id, name) => path.join(projectDir(id), name);

function slug(text) {
  return String(text || 'sermon').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40) || 'sermon';
}

export async function createProject({ title, sourceUrl = null, youtubeId = null, thumbnail = null, kind = 'sermon', uploadedOn = null }) {
  const id = `${slug(title)}-${randomUUID().slice(0, 6)}`;
  await mkdir(projectDir(id), { recursive: true });
  const project = {
    id, title, sourceUrl, youtubeId, thumbnail, uploadedOn, // uploadedOn: when YouTube says it was streamed or posted
    kind, // sermon | short (a whole short video as one clip) | lyric (audio with moving color) | wide (a 16:9 video)
    created: new Date().toISOString(),
    status: 'new', // new | downloading | ready | transcribed
    media: null, // {duration,width,height,fps}
    sermon: null, // {start,end,confidence,method,confirmed}
    clips: [],
    proposalMethod: null,
    videoTheme: null,
  };
  await saveProject(project);
  return project;
}

export async function getProject(id) {
  const f = file(id, 'project.json');
  if (!existsSync(f)) return null;
  return JSON.parse(await readFile(f, 'utf8'));
}

export async function saveProject(project) {
  project.updated = new Date().toISOString();
  const f = file(project.id, 'project.json');
  await writeFile(`${f}.tmp`, JSON.stringify(project, null, 2));
  await rename(`${f}.tmp`, f);
  return project;
}

export async function updateProject(id, mutate) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  const out = (await mutate(p)) ?? p;
  return saveProject(out);
}

export async function listProjects() {
  if (!existsSync(PROJECTS_DIR)) return [];
  const out = [];
  for (const name of await readdir(PROJECTS_DIR)) {
    try {
      const p = await getProject(name);
      if (p) out.push({
        id: p.id, title: p.title, status: p.status, created: p.created, updated: p.updated,
        thumbnail: p.thumbnail, youtubeId: p.youtubeId || null, duration: p.media?.duration ?? null, clips: p.clips.length,
        exported: p.clips.filter((c) => c.export).length, isSermon: isSermon(p), kind: p.kind || 'sermon', audio: Boolean(p.media && !p.media.width),
      });
    } catch { /* skip broken folders */ }
  }
  return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export async function deleteProject(id) {
  await rm(projectDir(id), { recursive: true, force: true });
}

/** Fix one word the transcription got wrong (captions and writing use the new spelling; timing stays). */
export async function setTranscriptWord(id, index, text) {
  const t = await getTranscript(id);
  if (!t?.words?.[index]) throw new Error('That word is not in the transcript.');
  const w = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!w) throw new Error('Type the word.');
  t.words[index] = { ...t.words[index], w, fixed: true };
  const f = file(id, 'transcript.json');
  await writeFile(`${f}.tmp`, JSON.stringify(t));
  await rename(`${f}.tmp`, f);
  return t.words[index];
}

/**
 * Replace a run of words with typed text (a phrase the transcription got wrong). Typed words fill the run in
 * order; extra typed words join the last one, and any left-over words in the run go blank (captions skip them).
 */
export async function replaceTranscriptWords(id, from, to, text) {
  const t = await getTranscript(id);
  const a = Math.min(from, to); const b = Math.max(from, to);
  if (!t?.words?.[a] || !t.words[b] || b - a > 60) throw new Error('Pick the words to replace again.');
  const typed = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w.slice(0, 60));
  if (!typed.length) throw new Error('Type the words.');
  const n = b - a + 1;
  const parts = typed.length <= n ? typed : [...typed.slice(0, n - 1), typed.slice(n - 1).join(' ')];
  for (let k = 0; k < n; k++) t.words[a + k] = { ...t.words[a + k], w: parts[k] || '', fixed: true };
  const f = file(id, 'transcript.json');
  await writeFile(`${f}.tmp`, JSON.stringify(t));
  await rename(`${f}.tmp`, f);
  return t.words.slice(a, b + 1);
}

export async function getTranscript(id) {
  const f = file(id, 'transcript.json');
  if (!existsSync(f)) return null;
  const t = JSON.parse(await readFile(f, 'utf8'));
  // Older transcripts: tidy Bible references on the way in.
  // Skipped when clips already cut words by position, so those cuts stay on the right words.
  if (!t.scripture && !(await getProject(id))?.clips?.some((c) => c.cutWords?.length)) { t.words = normalizeWords(t.words); t.scripture = 1; }
  return t;
}
