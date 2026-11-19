// Alt text and tags for brand library pictures, so photos are easy to find and posts are accessible.
// Kept in one small file per workspace. Suggestions use the AI helper when one is turned on.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { DATA_DIR } from './tools.js';
import { libraryFile } from './library.js';
import { loadConfig } from './config.js';
import { describeImage, providerReady, withFallback } from './ai.js';

const STORE = path.join(DATA_DIR, 'photo-notes.json');
const run = promisify(execFile);

export async function loadNotes() {
  if (!existsSync(STORE)) return {};
  try { return JSON.parse(await readFile(STORE, 'utf8')); } catch { return {}; }
}

export async function setNote(rel, { alt, tags }) {
  const notes = await loadNotes();
  const cur = notes[rel] || {};
  const next = {
    ...cur,
    ...(typeof alt === 'string' ? { alt: alt.trim().slice(0, 600) } : null),
    ...(Array.isArray(tags) ? { tags: [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 12) } : null),
    updated: new Date().toISOString(),
  };
  if (!next.alt && !next.tags?.length) delete notes[rel]; else notes[rel] = next;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE, JSON.stringify(notes, null, 2));
  return notes[rel] || null;
}

/** Ask the AI helper for alt text and tags. Pictures are shrunk to 1024 pixels first with macOS sips. */
export async function suggestNote(rel) {
  const cfg = await loadConfig();
  if (!providerReady(cfg)) throw new Error('Turn on an AI helper in Settings to suggest alt text. You can always write it yourself.');
  const src = await libraryFile(rel);
  if (!src || !existsSync(src)) throw new Error('That picture is missing.');
  const tmp = path.join(os.tmpdir(), `cs-alt-${Date.now()}.jpg`);
  try {
    await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '1024', src, '--out', tmp]);
    const data = (await readFile(tmp)).toString('base64');
    const { value: text } = await withFallback(cfg, () => describeImage(cfg, { data, mediaType: 'image/jpeg' }), () => { throw new Error('The AI helper isn’t available right now. Write the alt text yourself, or try again later.'); });
    const [altPart, tagPart = ''] = String(text).split(/\n\s*Tags?:/i);
    return { alt: altPart.replace(/^alt text:\s*/i, '').replace(/^["“]|["”]$/g, '').trim(), tags: tagPart.split(',').map((t) => t.replace(/[.#]/g, '').trim().toLowerCase()).filter(Boolean).slice(0, 6) };
  } finally {
    await rm(tmp, { force: true });
  }
}
