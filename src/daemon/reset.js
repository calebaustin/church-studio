// Start fresh: move everything Church Studio has saved to the Trash and start over, as on the first day.
// Nothing is deleted for good: the old data sits in one folder in the Trash until the Trash is emptied.
// Downloaded helper models stay, so nothing big has to download again.
import { existsSync } from 'node:fs';
import { cp, mkdir, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BASE } from './tools.js';

/** What a fresh start clears, all inside the app's own data folder (folders chosen elsewhere are left alone). */
export const FRESH_ITEMS = ['config.local.json', 'data', 'projects', 'backups', 'workspaces', 'workspaces.json', 'version.json'];

export async function startFresh() {
  const stamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/[/:]/g, '.');
  const trash = path.join(os.homedir(), '.Trash');
  const dest = path.join(existsSync(trash) ? trash : path.join(BASE, '..'), `Church Studio data (${stamp})`);
  await mkdir(dest, { recursive: true });
  const moved = [];
  for (const name of FRESH_ITEMS) {
    const from = path.join(BASE, name);
    if (!existsSync(from)) continue;
    const to = path.join(dest, name);
    try { await rename(from, to); } catch (e) {
      if (e.code !== 'EXDEV') throw e;
      await cp(from, to, { recursive: true }); // a different disk: copy, then remove
      await rm(from, { recursive: true, force: true });
    }
    moved.push(name);
  }
  return { moved, savedTo: dest };
}
