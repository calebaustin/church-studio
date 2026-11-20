// Saved designs (graphics, carousels, stories, slide decks). One JSON file per design in
// data/designs/. Pages are drawn in the UI; exports land in the brand library.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';

const DIR = path.join(DATA_DIR, 'designs');
const safe = (id) => { if (!/^[a-z0-9-]{4,40}$/i.test(id)) throw new Error('Bad design id'); return id; };

export async function listDesigns() {
  if (!existsSync(DIR)) return [];
  const out = [];
  for (const f of await readdir(DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(await readFile(path.join(DIR, f), 'utf8'));
      out.push({ id: d.id, name: d.name, kind: d.kind, size: d.size, pages: d.pages?.length || 0, updated: d.updated, thumb: d.thumb || null, source: d.source || null, palette: (d.palette || []).slice(0, 5) });
    } catch { /* skip broken files */ }
  }
  return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export async function getDesign(id) {
  const f = path.join(DIR, `${safe(id)}.json`);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null;
}

export async function saveDesign(id, doc) {
  await mkdir(DIR, { recursive: true });
  const out = { ...doc, id: safe(id), updated: new Date().toISOString() };
  await writeFile(path.join(DIR, `${id}.json`), JSON.stringify(out));
  return out;
}

export async function deleteDesign(id) {
  await rm(path.join(DIR, `${safe(id)}.json`), { force: true });
}
