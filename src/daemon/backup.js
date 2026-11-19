// Backups, portable projects and cloud folders.
// - Backup: settings (without keys), sermons' transcripts and clips, writing, designs, posts, campaigns
//   and, if wanted, the brand library. Videos are left out; they're big and can be brought back in.
// - Portable project: one sermon with its clips, writing and designs as a .zip, for a teammate or
//   another Mac. Optionally with its video.
// - Cloud folders: Google Drive, Dropbox, OneDrive and iCloud Drive keep a folder on this Mac in sync.
//   Point backups or a team folder there and the cloud does the rest. No accounts needed.
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { APP_NAME, HOME, BASE, DATA_DIR, PROJECTS_DIR, WORKSPACE } from './tools.js';
import { SECRET_FIELDS, loadConfig, saveConfig } from './config.js';
import { libraryRoot } from './library.js';
import { createWorkspace } from './workspaces.js';
import { getProject } from './projects.js';
import { listDesigns, getDesign, saveDesign } from './designs.js';
import { downloadsDir } from './render.js';

const run = promisify(execFile);
const MEDIA = ['*.mp4', '*.mov', '*.m4v', '*.m4a', '*.mp3', '*.wav', '*.webm', '*.mkv', '*/previews/*', '*/source.*'];
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');

// ------------------------------------------------------------------ cloud folders
/** Folders on this Mac that a cloud service keeps in sync. */
export async function cloudFolders() {
  const home = os.homedir();
  const out = [];
  const cs = path.join(home, 'Library', 'CloudStorage');
  if (existsSync(cs)) {
    for (const name of await readdir(cs)) {
      const service = /^GoogleDrive/i.test(name) ? 'Google Drive' : /^Dropbox/i.test(name) ? 'Dropbox' : /^OneDrive/i.test(name) ? 'OneDrive' : /^Box/i.test(name) ? 'Box' : null;
      if (!service) continue;
      let dir = path.join(cs, name);
      // Google Drive keeps files under "My Drive".
      if (service === 'Google Drive' && existsSync(path.join(dir, 'My Drive'))) dir = path.join(dir, 'My Drive');
      out.push({ service, label: `${service}${/-(.+)$/.test(name) && service !== 'Dropbox' ? ` (${name.replace(/^[^-]+-/, '')})` : ''}`, path: dir });
    }
  }
  if (existsSync(path.join(home, 'Dropbox')) && !out.some((x) => x.service === 'Dropbox')) out.push({ service: 'Dropbox', label: 'Dropbox', path: path.join(home, 'Dropbox') });
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (existsSync(icloud)) out.push({ service: 'iCloud Drive', label: 'iCloud Drive', path: icloud });
  return out;
}

async function backupDir() {
  const cfg = await loadConfig();
  const dir = cfg.backupFolder || path.join(os.homedir(), 'Documents', `${APP_NAME} Backups`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ------------------------------------------------------------------ backups
/** Make a backup zip. Runs at low priority so the Mac stays responsive. */
export async function backupNow({ includeLibrary = false, auto = false } = {}) {
  const cfg = await loadConfig();
  const dir = await backupDir();
  const name = `${APP_NAME} Backup - ${WORKSPACE.name} - ${stamp()}.zip`;
  const out = path.join(dir, name);
  const stage = await mkdtemp(path.join(os.tmpdir(), 'cs-backup-'));
  try {
    // Settings without passwords or keys.
    const clean = Object.fromEntries(Object.entries(cfg).filter(([k]) => !SECRET_FIELDS.includes(k)));
    await writeFile(path.join(stage, 'config.json'), JSON.stringify(clean, null, 2));
    await writeFile(path.join(stage, 'backup.json'), JSON.stringify({ app: APP_NAME, format: 1, made: new Date().toISOString(), workspace: WORKSPACE.name, library: includeLibrary }, null, 2));
    await run('/usr/bin/nice', ['-n', '15', '/usr/bin/zip', '-q', '-j', out, path.join(stage, 'config.json'), path.join(stage, 'backup.json')]);
    const parts = ['data', 'projects'].filter((p) => existsSync(path.join(HOME, p)));
    if (parts.length) await run('/usr/bin/nice', ['-n', '15', '/usr/bin/zip', '-q', '-r', out, ...parts, '-x', ...MEDIA, '*.DS_Store'], { cwd: HOME, maxBuffer: 1 << 26 });
    if (includeLibrary) {
      const lib = await libraryRoot();
      if (existsSync(lib)) {
        // Stored under "Library/" so a restore knows where it goes.
        await mkdir(path.join(stage, 'wrap'), { recursive: true });
        await run('/bin/ln', ['-s', lib, path.join(stage, 'wrap', 'Library')]);
        await run('/usr/bin/nice', ['-n', '15', '/usr/bin/zip', '-q', '-r', out, 'Library', '-x', '*.DS_Store'], { cwd: path.join(stage, 'wrap'), maxBuffer: 1 << 26 });
      }
    }
  } finally { await rm(stage, { recursive: true, force: true }); }
  await saveConfig({ lastBackup: new Date().toISOString() });
  if (auto) await prune(dir);
  return { file: out, name, bytes: statSync(out).size };
}

/** Keep the newest four automatic backups. */
async function prune(dir) {
  const mine = (await readdir(dir)).filter((f) => f.startsWith(`${APP_NAME} Backup - ${WORKSPACE.name} - `) && f.endsWith('.zip')).sort().reverse();
  for (const f of mine.slice(4)) await rm(path.join(dir, f), { force: true });
}

export async function listBackups() {
  const dir = await backupDir();
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${APP_NAME} Backup`) && f.endsWith('.zip'));
  return { folder: dir, backups: files.map((f) => { const st = statSync(path.join(dir, f)); return { name: f, file: path.join(dir, f), bytes: st.size, made: st.mtime.toISOString() }; }).sort((a, b) => b.made.localeCompare(a.made)) };
}

/** Restore a backup as a new workspace, so nothing in the open one is replaced. */
export async function restoreBackup(file) {
  if (!existsSync(file) || !file.endsWith('.zip')) throw new Error('Pick a Church Studio backup .zip.');
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cs-restore-'));
  try {
    await run('/usr/bin/unzip', ['-q', '-o', file, 'backup.json', '-d', tmp]).catch(() => {});
    const info = existsSync(path.join(tmp, 'backup.json')) ? JSON.parse(await readFile(path.join(tmp, 'backup.json'), 'utf8')) : null;
    if (info?.app !== APP_NAME) throw new Error('That zip isn’t a Church Studio backup.');
    const ws = await createWorkspace({ name: `${info.workspace || 'Restored'} (restored)` });
    const dir = path.join(BASE, 'workspaces', ws.id);
    await run('/usr/bin/unzip', ['-q', '-o', file, '-d', dir], { maxBuffer: 1 << 26 });
    const cfg = existsSync(path.join(dir, 'config.json')) ? JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8')) : {};
    if (existsSync(path.join(dir, 'Library'))) {
      const lib = path.join(os.homedir(), 'Documents', `${APP_NAME} Library (${ws.name})`);
      await cp(path.join(dir, 'Library'), lib, { recursive: true });
      await rm(path.join(dir, 'Library'), { recursive: true, force: true });
      cfg.libraryFolder = lib;
    } else delete cfg.libraryFolder;
    await writeFile(path.join(dir, 'config.local.json'), JSON.stringify({ ...cfg, onboarded: true }, null, 2));
    await rm(path.join(dir, 'config.json'), { force: true });
    await rm(path.join(dir, 'backup.json'), { force: true });
    return { workspace: ws };
  } finally { await rm(tmp, { recursive: true, force: true }); }
}

/** Weekly automatic backups, when turned on. Checked a little after the engine starts. */
export async function backupIfDue() {
  const cfg = await loadConfig();
  if (!cfg.backupAuto) return null;
  if (cfg.lastBackup && Date.now() - Date.parse(cfg.lastBackup) < 7 * 86400000) return null;
  return backupNow({ includeLibrary: Boolean(cfg.backupLibrary), auto: true }).catch((e) => console.error('[backup]', e.message));
}

// ------------------------------------------------------------------ portable projects
/** One sermon with its clips, writing and designs, as a zip in Downloads or a team folder. */
export async function exportProject(id, { includeMedia = false, folder = null } = {}) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  const stage = await mkdtemp(path.join(os.tmpdir(), 'cs-proj-'));
  try {
    const root = path.join(stage, 'project');
    await cp(path.join(PROJECTS_DIR, id), path.join(root, 'files'), { recursive: true, filter: (src) => includeMedia || !/\.(mp4|mov|m4v|webm|mkv|wav|m4a|mp3)$|\/previews(\/|$)/i.test(src) });
    const draft = path.join(DATA_DIR, 'writing', `${id}.json`);
    if (existsSync(draft)) await copyFile(draft, path.join(root, 'writing.json'));
    const designs = [];
    for (const d of await listDesigns()) if (d.source?.projectId === id) designs.push(await getDesign(d.id));
    await writeFile(path.join(root, 'designs.json'), JSON.stringify(designs));
    await writeFile(path.join(root, 'churchstudio.json'), JSON.stringify({ app: APP_NAME, format: 1, kind: 'project', title: p.title, made: new Date().toISOString(), media: includeMedia }));
    const dest = folder || downloadsDir() || os.homedir();
    await mkdir(dest, { recursive: true });
    let out = path.join(dest, `${p.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70)}.churchstudio.zip`);
    for (let n = 2; existsSync(out); n++) out = out.replace(/( \d+)?\.churchstudio\.zip$/, ` ${n}.churchstudio.zip`);
    await run('/usr/bin/nice', ['-n', '10', '/usr/bin/ditto', '-c', '-k', '--norsrc', root, out]);
    return { file: out, name: path.basename(out), bytes: statSync(out).size };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

/** Bring in a project someone shared. It always comes in as a new project. */
export async function importProject(file) {
  if (!existsSync(file)) throw new Error('That file is missing.');
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cs-projin-'));
  try {
    await run('/usr/bin/ditto', ['-x', '-k', file, tmp]);
    const meta = JSON.parse(await readFile(path.join(tmp, 'churchstudio.json'), 'utf8').catch(() => '{}'));
    if (meta.app !== APP_NAME || meta.kind !== 'project') throw new Error('That isn’t a Church Studio project file.');
    const proj = JSON.parse(await readFile(path.join(tmp, 'files', 'project.json'), 'utf8'));
    const oldId = proj.id;
    const id = `${String(oldId).replace(/-[a-z0-9]{6}$/, '')}-${randomUUID().slice(0, 6)}`;
    await cp(path.join(tmp, 'files'), path.join(PROJECTS_DIR, id), { recursive: true });
    proj.id = id; proj.imported = { from: meta.title, at: new Date().toISOString() };
    if (!meta.media && !existsSync(path.join(PROJECTS_DIR, id, proj.sourceFile || 'x'))) proj.needsMedia = true;
    await writeFile(path.join(PROJECTS_DIR, id, 'project.json'), JSON.stringify(proj, null, 2));
    if (existsSync(path.join(tmp, 'writing.json'))) { await mkdir(path.join(DATA_DIR, 'writing'), { recursive: true }); await copyFile(path.join(tmp, 'writing.json'), path.join(DATA_DIR, 'writing', `${id}.json`)); }
    const designs = JSON.parse(await readFile(path.join(tmp, 'designs.json'), 'utf8').catch(() => '[]'));
    for (const d of designs) { const nid = randomUUID().slice(0, 12); await saveDesign(nid, { ...d, id: nid, source: { ...(d.source || {}), projectId: id } }); }
    return { id, title: proj.title, designs: designs.length, needsMedia: Boolean(proj.needsMedia) };
  } finally { await rm(tmp, { recursive: true, force: true }); }
}

/** Shared project files waiting in the team folder. */
export async function teamFolder() {
  const cfg = await loadConfig();
  if (!cfg.teamFolder || !existsSync(cfg.teamFolder)) return { folder: cfg.teamFolder || null, files: [] };
  const files = (await readdir(cfg.teamFolder)).filter((f) => f.endsWith('.churchstudio.zip')).map((f) => { const st = statSync(path.join(cfg.teamFolder, f)); return { name: f.replace(/\.churchstudio\.zip$/, ''), file: path.join(cfg.teamFolder, f), bytes: st.size, modified: st.mtime.toISOString() }; });
  return { folder: cfg.teamFolder, files: files.sort((a, b) => b.modified.localeCompare(a.modified)) };
}
