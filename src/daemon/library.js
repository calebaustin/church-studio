// Brand library: a normal folder in Documents (Photos, Logos, Graphics, Brand) that the app reads.
// Drop files in with Finder; every tool can use them. Graphics made in the app are saved here too.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_NAME, WORKSPACE } from './tools.js';
import { loadConfig } from './config.js';

export const FOLDERS = ['Photos', 'Logos', 'Graphics', 'Brand', 'Writing'];
const KINDS = { image: /\.(png|jpe?g|webp|gif|heic|svg)$/i, video: /\.(mp4|mov|m4v)$/i, doc: /\.(pdf|md|txt|docx)$/i };

export async function libraryRoot() {
  const cfg = await loadConfig();
  if (cfg.libraryFolder) return cfg.libraryFolder;
  const suffix = WORKSPACE.id === 'main' ? '' : ` (${WORKSPACE.name})`;
  return path.join(os.homedir(), 'Documents', `${APP_NAME} Library${suffix}`);
}

export async function ensureLibrary() {
  const root = await libraryRoot();
  // The app used to be called Sermon Clips: keep using that library by renaming it once.
  const old = root.replace(`${APP_NAME} Library`, 'Sermon Clips Library');
  if (old !== root && !existsSync(root) && existsSync(old)) await rename(old, root).catch(() => {});
  for (const f of FOLDERS) await mkdir(path.join(root, f), { recursive: true });
  return root;
}

export async function listLibrary() {
  const root = await ensureLibrary();
  const items = [];
  for (const folder of FOLDERS) {
    const dir = path.join(root, folder);
    for (const name of await readdir(dir).catch(() => [])) {
      if (name.startsWith('.')) continue;
      const kind = Object.entries(KINDS).find(([, re]) => re.test(name))?.[0];
      if (!kind) continue;
      const st = await stat(path.join(dir, name));
      items.push({ folder, name, kind, bytes: st.size, modified: st.mtime.toISOString(), rel: `${folder}/${name}`, url: `/library/${encodeURIComponent(folder)}/${encodeURIComponent(name)}` });
    }
  }
  return { root, folders: FOLDERS, items: items.sort((a, b) => b.modified.localeCompare(a.modified)) };
}

/** Resolve a library-relative path safely (no escaping the folder). */
export async function libraryFile(rel) {
  const root = await libraryRoot();
  const target = path.resolve(root, rel);
  if (!target.startsWith(path.resolve(root) + path.sep) || !existsSync(target)) return null;
  return target;
}

export async function saveDataUrl(folder, name, dataUrl) {
  const root = await ensureLibrary();
  if (!FOLDERS.includes(folder)) throw new Error('Unknown folder');
  const m = String(dataUrl).match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!m) throw new Error('Expected a PNG or JPEG image');
  const ext = m[1] === 'jpeg' ? 'jpg' : 'png';
  const base = String(name || 'graphic').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'graphic';
  let file = path.join(root, folder, `${base}.${ext}`);
  for (let n = 2; existsSync(file); n++) file = path.join(root, folder, `${base} ${n}.${ext}`);
  await writeFile(file, Buffer.from(m[2], 'base64'));
  return { file, rel: `${folder}/${path.basename(file)}` };
}

export async function saveText(folder, name, text) {
  const root = await ensureLibrary();
  const base = String(name || 'draft').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'draft';
  let file = path.join(root, folder, `${base}.md`);
  for (let n = 2; existsSync(file); n++) file = path.join(root, folder, `${base} ${n}.md`);
  await writeFile(file, text);
  return { file };
}

export async function importFiles(paths, folder = 'Photos') {
  const root = await ensureLibrary();
  const out = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const dest = path.join(root, FOLDERS.includes(folder) ? folder : 'Photos', path.basename(p));
    await copyFile(p, dest);
    out.push(dest);
  }
  return out;
}
