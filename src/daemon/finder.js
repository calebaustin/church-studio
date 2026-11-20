// All projects: one view over sermons, clips, writing and designs, plus folders, stars and trash.
// Items are referenced by key ("design:abc", "sermon:id", "clip:projectId/clipId", "writing:projectId").
// Folders only hold references, so an item can live in several folders and nothing is copied.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './tools.js';
import { getProject, listProjects, projectDir } from './projects.js';
import { deleteDesign, getDesign, listDesigns, saveDesign } from './designs.js';
import * as socialStore from './social/store.js';
import { excerptOf } from './writing.js';

const STORE = path.join(DATA_DIR, 'finder.json');
const WRITING = path.join(DATA_DIR, 'writing');

async function load() {
  try { return { tags: {}, archived: [], ...JSON.parse(await readFile(STORE, 'utf8')) }; } catch { return { folders: [], starred: [], trash: [], tags: {}, archived: [] }; }
}
async function save(s) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${STORE}.tmp`, JSON.stringify(s, null, 2));
  await rename(`${STORE}.tmp`, STORE);
  return s;
}

const media = (pid, rel) => `/media/${encodeURIComponent(pid)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
const lib = (rel) => `/library/${rel.split('/').map(encodeURIComponent).join('/')}`;

/** Every item, newest first. Trashed designs and drafts are listed separately. */
async function allItems(state) {
  const items = [];
  const trashed = new Set(state.trash.map((t) => t.key));
  for (const p of await listProjects()) {
    // The key stays sermon:<id> for every project, so stars, folders and tags never move.
    items.push({ key: `sermon:${p.id}`, type: p.isSermon ? 'sermon' : 'video', id: p.id, name: p.title, thumb: p.thumbnail || null, updated: p.updated || p.created, meta: p.duration ? `${Math.round(p.duration / 60)} min` : p.status });
    const full = await getProject(p.id).catch(() => null);
    for (const c of full?.clips || []) {
      if (!c.export) continue;
      items.push({ key: `clip:${p.id}/${c.id}`, type: 'clip', id: `${p.id}/${c.id}`, projectId: p.id, clipId: c.id, name: c.title || 'Clip', thumb: c.export.thumb ? media(p.id, c.export.thumb) : null, updated: c.export.at, meta: `${Math.round(c.export.length || c.end - c.start)}s clip`, portrait: true });
    }
  }
  for (const f of existsSync(WRITING) ? await readdir(WRITING) : []) {
    if (!f.endsWith('.json')) continue;
    const pid = f.replace(/\.json$/, '');
    try {
      const d = JSON.parse(await readFile(path.join(WRITING, f), 'utf8'));
      const project = await getProject(pid).catch(() => null);
      const head = Object.values(d.headers || {}).find((h) => h?.rel)?.rel;
      items.push({ key: `writing:${pid}`, type: 'writing', id: pid, name: d.title || project?.title || 'Writing', thumb: head ? lib(head) : project?.thumbnail || null, updated: d.saved || d.generated, meta: 'Blog, email, guide, captions', projectId: pid, excerpt: excerptOf(d) });
    } catch { /* skip */ }
  }
  for (const d of await listDesigns()) {
    items.push({ key: `design:${d.id}`, type: 'design', id: d.id, name: d.name, thumb: d.thumb, updated: d.updated, kind: d.kind, meta: d.pages > 1 ? `${d.pages} pages` : null, size: d.size, palette: d.palette || [] });
  }
  const starred = new Set(state.starred);
  const archived = new Set(state.archived || []);
  // Usage: how many posts used each clip or design.
  const used = new Map();
  for (const p of await socialStore.listPosts().catch(() => [])) {
    const k = p.media?.clipId ? `clip:${p.media.projectId}/${p.media.clipId}` : p.media?.designId ? `design:${p.media.designId}` : null;
    if (k) used.set(k, (used.get(k) || 0) + 1);
  }
  return items.filter((i) => !trashed.has(i.key)).map((i) => ({ ...i, starred: starred.has(i.key), tags: state.tags?.[i.key] || [], archived: archived.has(i.key), used: used.get(i.key) || 0, folders: state.folders.filter((f) => f.items.includes(i.key)).map((f) => f.id) }))
    .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}

export async function finder() {
  const state = await load();
  const items = await allItems(state);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const folders = state.folders.map((f) => {
    const inside = f.items.map((k) => byKey.get(k)).filter(Boolean);
    return { id: f.id, name: f.name, starred: Boolean(f.starred), created: f.created, count: inside.length, previews: inside.filter((i) => i.thumb).slice(0, 3).map((i) => i.thumb), updated: inside[0]?.updated || f.created };
  });
  const trash = [];
  for (const t of state.trash) {
    if (t.type === 'design') { const d = await getDesign(t.id).catch(() => null); if (d) trash.push({ ...t, name: d.name, thumb: d.thumb || null, kind: d.kind }); }
    if (t.type === 'writing') trash.push({ ...t, name: t.name || 'Writing', thumb: null });
  }
  return { folders, items, trash };
}

export async function createFolder(name) {
  const s = await load();
  const f = { id: randomUUID().slice(0, 8), name: String(name || 'New folder').slice(0, 80), starred: false, created: new Date().toISOString(), items: [] };
  s.folders.push(f);
  await save(s);
  return f;
}
export async function updateFolder(id, patch) {
  const s = await load();
  const f = s.folders.find((x) => x.id === id);
  if (!f) throw new Error('Folder not found');
  if (patch.name != null) f.name = String(patch.name).slice(0, 80) || f.name;
  if (patch.starred != null) f.starred = Boolean(patch.starred);
  await save(s);
  return f;
}
export async function deleteFolder(id) {
  const s = await load();
  s.folders = s.folders.filter((x) => x.id !== id);
  await save(s);
}
export async function addToFolder(id, key) {
  const s = await load();
  const f = s.folders.find((x) => x.id === id);
  if (!f) throw new Error('Folder not found');
  if (!f.items.includes(key)) f.items.unshift(key);
  await save(s);
}
export async function removeFromFolder(id, key) {
  const s = await load();
  const f = s.folders.find((x) => x.id === id);
  if (f) f.items = f.items.filter((k) => k !== key);
  await save(s);
}
export async function star(key, on) {
  const s = await load();
  s.starred = s.starred.filter((k) => k !== key);
  if (on) s.starred.unshift(key);
  await save(s);
}

/** Designs and writing drafts go to the trash first; sermons are deleted from Sermons. */
export async function trashItem(key) {
  const [type, id] = [key.split(':')[0], key.split(':').slice(1).join(':')];
  if (!['design', 'writing'].includes(type)) throw new Error('Only designs and writing can go to the trash.');
  const s = await load();
  let name = null;
  if (type === 'writing') { try { name = JSON.parse(await readFile(path.join(WRITING, `${id}.json`), 'utf8')).title; } catch { /* fine */ } }
  if (!s.trash.some((t) => t.key === key)) s.trash.unshift({ key, type, id, name, at: new Date().toISOString() });
  await save(s);
}
export async function restoreItem(key) {
  const s = await load();
  s.trash = s.trash.filter((t) => t.key !== key);
  await save(s);
}
/** Delete for good: the design file or the draft, and every reference to it. */
export async function deleteForever(key) {
  const s = await load();
  const t = s.trash.find((x) => x.key === key);
  if (!t) throw new Error('Not in the trash');
  if (t.type === 'design') await deleteDesign(t.id);
  if (t.type === 'writing') await rm(path.join(WRITING, `${t.id}.json`), { force: true });
  s.trash = s.trash.filter((x) => x.key !== key);
  s.starred = s.starred.filter((k) => k !== key);
  for (const f of s.folders) f.items = f.items.filter((k) => k !== key);
  await save(s);
}
export async function emptyTrash() {
  for (const t of (await load()).trash) await deleteForever(t.key);
}
/** Where an item lives on this Mac: the exported file when there is one, else its project or data file. */
export async function locate(key) {
  const [type, ...rest] = key.split(':'); const id = rest.join(':');
  if (type === 'sermon') { const p = await getProject(id); if (!p) throw new Error('Not found'); return projectDir(id); }
  if (type === 'clip') {
    const [pid, cid] = id.split('/');
    const c = (await getProject(pid))?.clips.find((x) => x.id === cid);
    if (c?.export?.file && existsSync(c.export.file)) return c.export.file;
    return projectDir(pid);
  }
  if (type === 'writing') return path.join(WRITING, `${id}.json`);
  if (type === 'design') return path.join(DATA_DIR, 'designs', `${id}.json`);
  throw new Error('Not found');
}
/** Tags on any item, by key. Used by All projects and search. */
export async function loadTags() { return (await load()).tags || {}; }
export async function setTags(key, tags) {
  const s = await load();
  const clean = [...new Set((tags || []).map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 12);
  s.tags = { ...(s.tags || {}) };
  if (clean.length) s.tags[key] = clean; else delete s.tags[key];
  await save(s);
  return clean;
}
/** Archive: out of the way in lists, but kept and searchable. Not the trash. */
export async function archive(key, on) {
  const s = await load();
  const set = new Set(s.archived || []);
  if (on) set.add(key); else set.delete(key);
  s.archived = [...set];
  await save(s);
  return { ok: true };
}

export async function isTrashed(key) { return (await load()).trash.some((t) => t.key === key); }
export { saveDesign };
