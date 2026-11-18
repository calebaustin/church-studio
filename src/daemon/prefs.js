// Things the app learns and remembers per workspace:
//  - speaker hints: where the preacher's face was when the user clicked it (a prior for tracking)
//  - edit templates: saved bundles of edit settings, plus the settings from the last export
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './tools.js';

const SPEAKER = path.join(DATA_DIR, 'speaker.json');
const TEMPLATES = path.join(DATA_DIR, 'edit-templates.json');

async function read(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function write(file, data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
}

// ---------------- speaker hints
export async function speakerPrior() {
  const { hints = [] } = await read(SPEAKER, {});
  if (hints.length < 3) return { count: hints.length, x: null };
  const xs = hints.slice(-40).map((h) => h.x).sort((a, b) => a - b);
  return { count: hints.length, x: xs[Math.floor(xs.length / 2)] };
}
export async function addSpeakerHints(points) {
  const data = await read(SPEAKER, { hints: [] });
  for (const p of points) if (p.x >= 0 && p.x <= 1) data.hints.push({ x: +p.x.toFixed(4), y: +(p.y ?? 0.3).toFixed(4), at: Date.now() });
  data.hints = data.hints.slice(-200);
  await write(SPEAKER, data);
  return speakerPrior();
}
export async function resetSpeakerHints() { await write(SPEAKER, { hints: [] }); return speakerPrior(); }

// ---------------- edit templates
/** The clip settings an edit template carries (not the words or timing). */
export function pickEditSettings(clip = {}, exportOptions = null) {
  const { crop = {}, videoTheme = null, captions = true, tightenPauses = false, pauseMax = 0.45, hookY = null, overlay = null, endCard = null } = clip;
  const { cues, anchors, x, ...cropStyle } = crop; // positions are clip-specific
  return { crop: cropStyle, videoTheme, captions, tightenPauses, pauseMax, hookY, overlay, endCard, ...(exportOptions ? { exportOptions } : {}) };
}
export async function listTemplates() { return read(TEMPLATES, { last: null, templates: [] }); }
export async function saveLast(settings) {
  const data = await listTemplates();
  data.last = { ...settings, at: new Date().toISOString() };
  await write(TEMPLATES, data);
}
export async function saveTemplate(name, settings) {
  const data = await listTemplates();
  const t = { id: randomUUID().slice(0, 8), name: String(name || 'My template').slice(0, 60), settings, at: new Date().toISOString() };
  data.templates = [...data.templates.filter((x) => x.name !== t.name), t];
  await write(TEMPLATES, data);
  return t;
}
export async function deleteTemplate(id) {
  const data = await listTemplates();
  data.templates = data.templates.filter((t) => t.id !== id);
  await write(TEMPLATES, data);
}
