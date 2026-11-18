// Local workspaces: separate brands or ministries on one Mac. Each has its own folder with
// settings, sermons, themes, social accounts and brand library. Switching restarts the engine.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { BASE, WORKSPACE } from './tools.js';

const REG = path.join(BASE, 'workspaces.json');

async function registry() {
  const main = { id: 'main', name: 'Main', dir: BASE, created: null };
  if (!existsSync(REG)) return { active: 'main', list: [main] };
  try {
    const r = JSON.parse(await readFile(REG, 'utf8'));
    if (!r.list.some((w) => w.id === 'main')) r.list.unshift(main);
    return r;
  } catch { return { active: 'main', list: [main] }; }
}

export async function listWorkspaces() {
  const r = await registry();
  return { active: WORKSPACE.id, list: r.list.map(({ id, name, color, created }) => ({ id, name, color, created })) };
}

export async function createWorkspace({ name, color }) {
  const r = await registry();
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Error('Give the workspace a name.');
  const id = `${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${Date.now().toString(36).slice(-4)}`;
  const dir = path.join(BASE, 'workspaces', id);
  await mkdir(dir, { recursive: true });
  // Carry over app-wide preferences (not channel, keys or accounts) so it feels familiar.
  const cfg = path.join(WORKSPACE.dir, 'config.local.json');
  if (existsSync(cfg)) {
    const c = JSON.parse(await readFile(cfg, 'utf8'));
    const keep = ['whisperModel', 'appearance', 'appTheme', 'appThemeDark', 'refraction', 'exportOptions', 'exportPattern', 'clipCount', 'clipMin', 'clipMax'];
    await writeFile(path.join(dir, 'config.local.json'), JSON.stringify(Object.fromEntries(keep.filter((k) => k in c).map((k) => [k, c[k]])), null, 2));
  }
  const w = { id, name: clean, color: color || null, dir, created: new Date().toISOString() };
  r.list.push(w);
  await writeFile(REG, JSON.stringify(r, null, 2));
  void copyFile;
  return { id, name: clean };
}

/** Make a workspace active. The caller restarts the engine so every path points at it. */
export async function switchWorkspace(id) {
  const r = await registry();
  if (!r.list.some((w) => w.id === id)) throw new Error('Workspace not found');
  r.active = id;
  await writeFile(REG, JSON.stringify(r, null, 2));
}

export async function renameWorkspace(id, name) {
  const r = await registry();
  const w = r.list.find((x) => x.id === id);
  if (!w) throw new Error('Workspace not found');
  w.name = String(name).trim().slice(0, 40) || w.name;
  await writeFile(REG, JSON.stringify(r, null, 2));
  return w;
}
