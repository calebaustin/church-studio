// One project per sermon video: projects/<id>/{project.json, source.mp4, audio.wav,
// transcript.json, exports/}. project.json holds the sermon range and the clips.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECTS_DIR } from './tools.js';
import { normalizeWords } from './scripture.js';

export function projectDir(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Bad project id');
  return path.join(PROJECTS_DIR, id);
}

export const file = (id, name) => path.join(projectDir(id), name);

function slug(text) {
  return String(text || 'sermon').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40) || 'sermon';
}

export async function createProject({ title, sourceUrl = null, youtubeId = null, thumbnail = null }) {
  const id = `${slug(title)}-${randomUUID().slice(0, 6)}`;
  await mkdir(projectDir(id), { recursive: true });
  const project = {
    id, title, sourceUrl, youtubeId, thumbnail,
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
        exported: p.clips.filter((c) => c.export).length,
      });
    } catch { /* skip broken folders */ }
  }
  return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export async function deleteProject(id) {
  await rm(projectDir(id), { recursive: true, force: true });
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
