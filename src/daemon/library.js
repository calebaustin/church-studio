// Brand library: a normal folder in Documents (Photos, Logos, Graphics, Brand) that the app reads.
// Drop files in with Finder; every tool can use them. Graphics made in the app are saved here too.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_NAME, WORKSPACE } from './tools.js';
import { loadConfig } from './config.js';

export const FOLDERS = ['Photos', 'Logos', 'Graphics', 'Brand', 'Writing', 'Audio'];
const KINDS = { image: /\.(png|jpe?g|webp|gif|heic|svg)$/i, video: /\.(mp4|mov|m4v)$/i, doc: /\.(pdf|md|txt|docx|pptx)$/i, audio: /\.(mp3|m4a|wav|aac|aiff?|flac|ogg)$/i };

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
    const dir = path.join(root, FOLDERS.includes(folder) ? folder : 'Photos');
    // Never overwrite a file already in the library: add a number instead.
    const ext = path.extname(p); const base = path.basename(p, ext);
    let dest = path.join(dir, `${base}${ext}`);
    for (let n = 2; existsSync(dest); n++) dest = path.join(dir, `${base} ${n}${ext}`);
    await copyFile(p, dest);
    out.push(dest);
  }
  return out;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx' };
const clean = (n) => String(n || 'Design').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Design';

/** Save a design export into Graphics: one file as Graphics/<name>.<ext>, several pages into Graphics/<name>/. */
export async function saveExport(name, files, folder = 'Graphics') {
  if (!['Graphics', 'Writing'].includes(folder)) throw new Error('Unknown folder');
  const root = await ensureLibrary();
  const decoded = files.map((f) => {
    const m = String(f.dataUrl).match(/^data:([\w/.+-]+);base64,(.+)$/);
    const ext = EXT[m?.[1]] || (['png', 'jpg', 'pdf', 'pptx'].includes(f.ext) ? f.ext : null);
    if (!m || !ext) throw new Error('Unsupported file type');
    return { name: clean(f.name), ext, data: Buffer.from(m[2], 'base64') };
  });
  if (!decoded.length) throw new Error('Nothing to export');
  const base = clean(name);
  if (decoded.length === 1) {
    const d = decoded[0];
    let file = path.join(root, folder, `${base}.${d.ext}`);
    for (let n = 2; existsSync(file); n++) file = path.join(root, folder, `${base} ${n}.${d.ext}`);
    await writeFile(file, d.data);
    return { file, rel: `${folder}/${path.basename(file)}` };
  }
  let dir = path.join(root, folder, base);
  for (let n = 2; existsSync(dir); n++) dir = path.join(root, folder, `${base} ${n}`);
  await mkdir(dir, { recursive: true });
  for (const d of decoded) await writeFile(path.join(dir, `${d.name}.${d.ext}`), d.data);
  return { file: dir, rel: `${folder}/${path.basename(dir)}`, count: decoded.length };
}

/** Move a library file to the Mac's Trash (it can be put back from there). */
export async function trashFile(rel) {
  const f = await libraryFile(rel);
  if (!f) throw new Error('File not found.');
  const trash = path.join(os.homedir(), '.Trash');
  await mkdir(trash, { recursive: true });
  const ext = path.extname(f); const base = path.basename(f, ext);
  let dest = path.join(trash, path.basename(f));
  for (let i = 2; existsSync(dest); i++) dest = path.join(trash, `${base} ${i}${ext}`);
  await rename(f, dest);
  return { trashed: path.basename(dest) };
}

/** Replace a library file with another one, keeping its place. Returns the new file's path in the library. */
export async function replaceFile(rel, source) {
  const f = await libraryFile(rel);
  if (!f) throw new Error('File not found.');
  if (!existsSync(source)) throw new Error('Pick a file to use instead.');
  const dest = path.join(path.dirname(f), path.basename(source));
  if (path.resolve(dest) !== path.resolve(f)) await trashFile(rel);
  await copyFile(source, dest);
  const root = await libraryRoot();
  return { rel: path.relative(root, dest).split(path.sep).join('/') };
}
