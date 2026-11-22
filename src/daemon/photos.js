// Alt text and tags for brand library pictures, so photos are easy to find and posts are accessible.
// Kept in one small file per workspace. Suggestions use the AI helper when one is turned on.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { DATA_DIR, run as runTool, tool } from './tools.js';
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

// ---------------------------------------------------------------- tags from Apple's Vision framework
// What a picture shows (people, outdoor, food, crowd…), worked out on this Mac by cs-vision: fast, free and
// private. Used for quick searchable tags on new photos, and in bulk from the brand library.
const SKIP = new Set(['structure', 'material', 'textile', 'consumer_electronics', 'document', 'screenshot', 'adult']);
const friendly = (id) => id.replace(/_/g, ' ').replace(/\bother\b/, '').trim();
/** Tags for picture files: up to four labels Vision is fairly sure of. { [file]: [tag…] } */
export async function visionTags(files) {
  const bin = tool('cs-vision');
  const out = {};
  for (let i = 0; i < files.length; i += 16) {
    const batch = files.slice(i, i + 16);
    try {
      const { stdout } = await runTool(bin, batch);
      for (const line of stdout.split('\n').filter(Boolean)) {
        const r = JSON.parse(line);
        out[r.file] = (r.labels || []).filter(([id, c]) => c >= 0.35 && !SKIP.has(id)).slice(0, 4).map(([id]) => friendly(id)).filter(Boolean);
      }
    } catch { /* cs-vision missing or a file it can't read: no tags for these */ }
  }
  return out;
}
/** Add tags to brand pictures (keeping any tags already there). untaggedOnly skips pictures that have tags. */
export async function autoTag(rels, { untaggedOnly = true, ctx } = {}) {
  const notes = await loadNotes();
  const todo = [];
  for (const rel of rels) {
    if (!/\.(jpe?g|png|heic|webp|gif|tiff?)$/i.test(rel)) continue;
    if (untaggedOnly && notes[rel]?.tags?.length) continue;
    const file = await libraryFile(rel).catch(() => null);
    if (file && existsSync(file)) todo.push({ rel, file });
  }
  let done = 0;
  for (let i = 0; i < todo.length; i += 16) {
    const batch = todo.slice(i, i + 16);
    const tags = await visionTags(batch.map((x) => x.file));
    for (const x of batch) {
      const t = tags[x.file] || [];
      if (t.length) { await setNote(x.rel, { tags: [...(notes[x.rel]?.tags || []), ...t] }); done++; }
    }
    ctx?.progress(Math.round(((i + batch.length) / todo.length) * 100), `Tagging pictures ${Math.min(todo.length, i + batch.length)} of ${todo.length}…`);
  }
  return { tagged: done, looked: todo.length };
}

/** Keep a file's alt text and tags when it's renamed, and drop them when it's erased. */
export async function moveNote(from, to) {
  const notes = await loadNotes();
  if (!notes[from]) return;
  if (to) notes[to] = notes[from];
  delete notes[from];
  await writeFile(STORE, JSON.stringify(notes, null, 2));
}
