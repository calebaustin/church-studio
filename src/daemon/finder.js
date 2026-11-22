// All projects: one view over sermons, clips, writing and designs, plus folders, stars and trash.
// Items are referenced by key ("design:abc", "sermon:id", "clip:projectId/clipId", "writing:projectId").
// Folders only hold references, so an item can live in several folders and nothing is copied.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './tools.js';
import { deleteProject, getProject, listProjects, projectDir, updateProject } from './projects.js';
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
    // Every recording is a Video. A Sermon also gets its Sermon page as an item of its own, linked to that video.
    // A video's key stays sermon:<id> (stars, folders and tags never move); a Sermon's video moves to video:<id>
    // so the Sermon page keeps what was starred or filed as the Sermon.
    const len = p.duration ? `${Math.round(p.duration / 60)} min` : p.status;
    if (p.isSermon) {
      items.push({ key: `sermon:${p.id}`, type: 'sermon', id: p.id, name: p.title, thumb: null, // its own tile, so it never looks like the video
        updated: p.updated || p.created, meta: 'Sermon page', projectId: p.id });
      items.push({ key: `video:${p.id}`, type: 'video', id: p.id, name: p.title, thumb: p.thumbnail || null, updated: p.updated || p.created, meta: `${len} · video of the sermon`, projectId: p.id });
    } else items.push({ key: `sermon:${p.id}`, type: 'video', id: p.id, name: p.title, thumb: p.thumbnail || null, updated: p.updated || p.created, meta: len });
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
  if (type === 'sermon' || type === 'video') { const p = await getProject(id); if (!p) throw new Error('Not found'); return projectDir(id); }
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

// ---------------------------------------------------------------- right-click actions on any item
const split = (key) => { const [type, ...rest] = String(key).split(':'); return [type, rest.join(':')]; };

/** Rename any item: a video or Sermon, a clip, a writing draft or a design. */
export async function renameItem(key, name) {
  const [type, id] = split(key);
  const n = String(name || '').trim().slice(0, 160);
  if (!n) throw new Error('Give it a name.');
  if (type === 'sermon' || type === 'video') { if (!(await getProject(id))) throw new Error('Not found'); await updateProject(id, (p) => { p.title = n; }); return n; }
  if (type === 'clip') { const [pid, cid] = id.split('/'); await updateProject(pid, (p) => { const c = p.clips.find((x) => x.id === cid); if (!c) throw new Error('Not found'); c.title = n; }); return n; }
  if (type === 'writing') { const f = path.join(WRITING, `${id}.json`); const d = JSON.parse(await readFile(f, 'utf8')); d.title = n; await writeFile(f, JSON.stringify(d, null, 2)); return n; }
  if (type === 'design') { const d = await getDesign(id); if (!d) throw new Error('Not found'); await saveDesign(id, { ...d, name: n }); return n; }
  throw new Error('This can\'t be renamed.');
}

/** The file on this Mac an item is made from, if it has one: a project's video or recording, or a clip's export. */
export async function sourceOf(key) {
  const [type, id] = split(key);
  if (type === 'sermon' || type === 'video') {
    const p = await getProject(id);
    const f = p?.sourceFile ? path.join(projectDir(id), p.sourceFile) : null;
    return f && existsSync(f) ? f : null;
  }
  if (type === 'clip') {
    const [pid, cid] = id.split('/');
    const c = (await getProject(pid))?.clips.find((x) => x.id === cid);
    return c?.export?.file && existsSync(c.export.file) ? c.export.file : null;
  }
  return null;
}

/** Erase an item's source file from this Mac. The project, transcript and clips stay; a video can be added back. */
export async function deleteSource(key) {
  const [type, id] = split(key);
  const f = await sourceOf(key);
  if (!f) throw new Error('There is no source file on this Mac for this.');
  await rm(f, { force: true });
  if (type === 'clip') { const [pid, cid] = id.split('/'); await updateProject(pid, (p) => { const c = p.clips.find((x) => x.id === cid); if (c) delete c.export; }); }
  else await updateProject(id, (p) => { p.needsMedia = true; });
  return path.basename(f);
}

/** Delete a video or Sermon project (its folder), or one clip from its project. Designs and writing use the trash. */
export async function deleteItem(key) {
  const [type, id] = split(key);
  const s = await load();
  if (type === 'sermon' || type === 'video') {
    await deleteProject(id);
    const gone = new Set([`sermon:${id}`, `video:${id}`]);
    for (const k of [...(s.starred || [])]) if (gone.has(k) || k.startsWith(`clip:${id}/`)) s.starred = s.starred.filter((x) => x !== k);
    for (const f of s.folders) f.items = f.items.filter((k) => !gone.has(k) && !k.startsWith(`clip:${id}/`));
  } else if (type === 'clip') {
    const [pid, cid] = id.split('/');
    const f = await sourceOf(key);
    if (f) await rm(f, { force: true });
    await updateProject(pid, (p) => { p.clips = p.clips.filter((c) => c.id !== cid); });
    s.starred = (s.starred || []).filter((k) => k !== key);
    for (const fo of s.folders) fo.items = fo.items.filter((k) => k !== key);
  } else throw new Error('Designs and writing go to the trash.');
  await save(s);
}
