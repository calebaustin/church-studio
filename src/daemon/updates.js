// Updates without breaking anything people made.
// - Releases live on GitHub. "Check for updates" asks GitHub for the latest release, shows its
//   notes, and downloads the new .dmg to Downloads. Installing replaces only the app; sermons,
//   designs, drafts and settings live in Application Support (or the workspace folder) and stay put.
// - On the first launch of a new version we copy settings and small data files to backups/ first,
//   then run any data migrations. The last five backups are kept.
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BASE, ROOT, run } from './tools.js';
import { downloadsDir } from './render.js';

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const VERSION = pkg.version;
export const UPDATE_REPO = process.env.SC_UPDATE_REPO || pkg.updateRepo || null;

/** "1.2.10" > "1.2.9". Pre-release tags sort before the release. */
export function newer(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('-');
  const [ma, pa] = parse(a); const [mb, pb] = parse(b);
  const x = ma.split('.').map(Number); const y = mb.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  if (pa && !pb) return false;
  if (!pa && pb) return true;
  return String(pa || '') > String(pb || '');
}

let lastCheck = null;
export async function checkForUpdate() {
  if (!UPDATE_REPO) return { current: VERSION, available: false, message: 'Updates are not set up for this copy.' };
  const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=10`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Church-Studio-Updater' },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404) return (lastCheck = { current: VERSION, available: false, checked: new Date().toISOString(), message: 'No releases published yet.' });
  if (!r.ok) throw new Error(`GitHub said ${r.status}. Try again in a few minutes.`);
  const releases = (await r.json()).filter((x) => !x.draft && !x.prerelease);
  const latest = releases[0];
  if (!latest) return (lastCheck = { current: VERSION, available: false, checked: new Date().toISOString(), message: 'No releases published yet.' });
  const version = latest.tag_name.replace(/^v/, '');
  const dmg = latest.assets.find((a) => /arm64.*\.dmg$/i.test(a.name)) || latest.assets.find((a) => /\.dmg$/i.test(a.name));
  // Notes for every release between this copy and the latest, newest first.
  const between = releases.filter((x) => newer(x.tag_name, VERSION)).map((x) => ({ version: x.tag_name.replace(/^v/, ''), date: x.published_at, notes: x.body || '' }));
  lastCheck = {
    current: VERSION, latest: version, available: newer(version, VERSION), checked: new Date().toISOString(),
    published: latest.published_at, notes: between, page: latest.html_url,
    asset: dmg ? { name: dmg.name, url: dmg.browser_download_url, bytes: dmg.size } : null,
  };
  return lastCheck;
}
export const lastUpdateCheck = () => lastCheck;

/** Download the new .dmg to Downloads with progress, then open it. */
export async function downloadUpdate(ctx) {
  const info = lastCheck?.available ? lastCheck : await checkForUpdate();
  if (!info.available) throw new Error('You already have the latest version.');
  if (!info.asset) throw new Error('This release has no Mac download yet.');
  const dest = path.join(downloadsDir(), info.asset.name);
  const r = await fetch(info.asset.url, { headers: { 'user-agent': 'Church-Studio-Updater' }, signal: ctx.signal });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}).`);
  const total = Number(r.headers.get('content-length')) || info.asset.bytes || 0;
  let got = 0;
  const body = Readable.fromWeb(r.body);
  body.on('data', (c) => { got += c.length; if (total) ctx.progress(Math.min(99, (got / total) * 100), `Downloading ${info.latest}…`); });
  await pipeline(body, createWriteStream(dest));
  ctx.progress(100, `Church Studio ${info.latest} is in Downloads`);
  await run('open', [dest]).catch(() => {});
  return { file: dest, version: info.latest };
}

// ---------------------------------------------------------------- safe upgrades
const MIGRATIONS = [
  // { to: '0.4.0', run: async (home) => { ... } }  Each runs once, in order, after a backup.
];

async function backupSmallData(from) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dir = path.join(BASE, 'backups', `${from || 'first'}-${stamp}`);
  await mkdir(dir, { recursive: true });
  const copyIfSmall = async (src, rel) => {
    if (!existsSync(src)) return;
    const st = await stat(src);
    if (st.isFile() && st.size < 20_000_000) { await mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await copyFile(src, path.join(dir, rel)); }
  };
  await copyIfSmall(path.join(BASE, 'config.local.json'), 'config.local.json');
  await copyIfSmall(path.join(BASE, 'workspaces.json'), 'workspaces.json');
  const walk = async (d, rel) => {
    for (const name of await readdir(d).catch(() => [])) {
      const p = path.join(d, name);
      const st = await stat(p).catch(() => null);
      if (!st) continue;
      if (st.isDirectory()) { if (name !== 'cache' && name !== 'models') await walk(p, path.join(rel, name)); } else if (/\.json$/.test(name)) await copyIfSmall(p, path.join(rel, name));
    }
  };
  await walk(path.join(BASE, 'data'), 'data');
  // Other workspaces: their settings and data files.
  for (const w of await readdir(path.join(BASE, 'workspaces')).catch(() => [])) {
    await copyIfSmall(path.join(BASE, 'workspaces', w, 'config.local.json'), path.join('workspaces', w, 'config.local.json'));
    await walk(path.join(BASE, 'workspaces', w, 'data'), path.join('workspaces', w, 'data'));
  }
  // Project settings and clip edits (not the videos).
  for (const id of await readdir(path.join(BASE, 'projects')).catch(() => [])) await copyIfSmall(path.join(BASE, 'projects', id, 'project.json'), path.join('projects', id, 'project.json'));
  // Keep the newest five.
  const all = (await readdir(path.join(BASE, 'backups'))).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 5))) await rm(path.join(BASE, 'backups', old), { recursive: true, force: true });
  return dir;
}

/** Called once at startup. Backs up and migrates when the app version changed. */
export async function prepareUpgrade() {
  const f = path.join(BASE, 'version.json');
  let prev = null;
  try { prev = JSON.parse(await readFile(f, 'utf8')).version; } catch { /* first run */ }
  if (prev === VERSION) return { upgraded: false };
  const firstRun = !prev && !existsSync(path.join(BASE, 'config.local.json'));
  let backup = null;
  if (!firstRun) {
    backup = await backupSmallData(prev);
    for (const m of MIGRATIONS) if (!prev || newer(m.to, prev)) await m.run(BASE);
  }
  await writeFile(f, JSON.stringify({ version: VERSION, previous: prev, at: new Date().toISOString() }, null, 2));
  return { upgraded: Boolean(prev), from: prev, to: VERSION, backup };
}

export async function changelog() {
  const f = path.join(ROOT, 'CHANGELOG.md');
  return existsSync(f) ? readFile(f, 'utf8') : '';
}
