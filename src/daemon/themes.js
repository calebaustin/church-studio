// App themes (the UI look) and video themes (caption presets burned into exports).
// Built-ins live here; the user's saved themes live in data/themes.json.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';

const FILE = path.join(DATA_DIR, 'themes.json');
const SUP = '/System/Library/Fonts/Supplemental';
const SYS = '/System/Library/Fonts';

/** Caption fonts: the file the renderer loads + the CSS the preview uses, so they match. */
export const FONTS = [
  { id: 'avenir-heavy', name: 'Avenir Next Heavy', file: `${SYS}/Avenir Next.ttc`, style: 'Heavy', css: "'Avenir Next'", weight: 800 },
  { id: 'avenir-bold', name: 'Avenir Next Bold', file: `${SYS}/Avenir Next.ttc`, style: 'Bold', css: "'Avenir Next'", weight: 700 },
  { id: 'arial-black', name: 'Arial Black', file: `${SUP}/Arial Black.ttf`, css: "'Arial Black'", weight: 900 },
  { id: 'helvetica-bold', name: 'Helvetica Neue Bold', file: `${SYS}/HelveticaNeue.ttc`, style: 'Bold', css: "'Helvetica Neue'", weight: 700 },
  { id: 'futura-bold', name: 'Futura Bold', file: `${SUP}/Futura.ttc`, style: 'Bold', css: 'Futura', weight: 700 },
  { id: 'din-condensed', name: 'DIN Condensed', file: `${SUP}/DIN Condensed Bold.ttf`, css: "'DIN Condensed'", weight: 700 },
  { id: 'impact', name: 'Impact', file: `${SUP}/Impact.ttf`, css: 'Impact', weight: 400 },
  { id: 'georgia-bold', name: 'Georgia Bold', file: `${SUP}/Georgia Bold.ttf`, css: 'Georgia', weight: 700 },
  { id: 'rockwell-bold', name: 'Rockwell Bold', file: `${SUP}/Rockwell.ttc`, style: 'Bold', css: 'Rockwell', weight: 700 },
  { id: 'trebuchet-bold', name: 'Trebuchet Bold', file: `${SUP}/Trebuchet MS Bold.ttf`, css: "'Trebuchet MS'", weight: 700 },
].filter((f) => existsSync(f.file));

const VIDEO_BUILTINS = [
  {
    id: 'clean-white', name: 'Clean White', builtin: true,
    font: 'avenir-heavy', size: 78, color: '#FFFFFF', active: '#FFD54A', outline: 6, outlineColor: '#000000',
    shadow: 0.35, position: 0.68, words: 3, uppercase: false, highlight: 'color', boxColor: '#FFD54A',
  },
  {
    id: 'bold-sunday', name: 'Bold Sunday', builtin: true,
    font: 'arial-black', size: 84, color: '#FFFFFF', active: '#7CE0FF', outline: 7, outlineColor: '#0B1020',
    shadow: 0.4, position: 0.66, words: 2, uppercase: true, highlight: 'color', boxColor: '#7CE0FF',
  },
  {
    id: 'soft-box', name: 'Soft Box', builtin: true,
    font: 'helvetica-bold', size: 70, color: '#111111', active: '#111111', outline: 0, outlineColor: '#FFFFFF',
    shadow: 0, position: 0.72, words: 4, uppercase: false, highlight: 'box', boxColor: '#FFFFFF',
  },
  {
    id: 'scripture', name: 'Scripture Serif', builtin: true,
    font: 'georgia-bold', size: 72, color: '#FFFDF5', active: '#F2C46D', outline: 5, outlineColor: '#1A140A',
    shadow: 0.45, position: 0.7, words: 4, uppercase: false, highlight: 'color', boxColor: '#F2C46D',
  },
];

const APP_BUILTINS = [
  {
    id: 'sermon-light', name: 'Sermon Light', builtin: true,
    tokens: {
      '--bg': '#EEF2F8', '--bg-2': '#F8F4EE', '--surface': 'rgba(255,255,255,0.55)', '--text': '#141821',
      '--muted': '#5E6676', '--accent': '#3D6BFF', '--accent-2': '#FF8A5B', '--radius': '22px',
      '--glass-blur': '18px', '--glass-tint': '0.55', '--font-sans': "-apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif",
      '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif",
    },
  },
  {
    id: 'morning-sage', name: 'Morning Sage', builtin: true,
    tokens: {
      '--bg': '#EEF3EE', '--bg-2': '#F6F1E7', '--surface': 'rgba(255,255,255,0.55)', '--text': '#18211C',
      '--muted': '#5C6A61', '--accent': '#2F8F6B', '--accent-2': '#D9A441', '--radius': '20px',
      '--glass-blur': '16px', '--glass-tint': '0.6', '--font-sans': "-apple-system, 'SF Pro Text', system-ui, sans-serif",
      '--font-display': "Georgia, 'Times New Roman', serif",
    },
  },
  {
    id: 'evening-glass', name: 'Evening Glass', builtin: true,
    tokens: {
      '--bg': '#151826', '--bg-2': '#221B2E', '--surface': 'rgba(40,44,64,0.5)', '--text': '#F2F3F8',
      '--muted': '#A3A8BC', '--accent': '#8EA6FF', '--accent-2': '#FFB18A', '--radius': '22px',
      '--glass-blur': '20px', '--glass-tint': '0.35', '--font-sans': "-apple-system, 'SF Pro Text', system-ui, sans-serif",
      '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif",
    },
  },
];

async function loadSaved() {
  if (!existsSync(FILE)) return { app: [], video: [] };
  try {
    const s = JSON.parse(await readFile(FILE, 'utf8'));
    return { app: s.app || [], video: s.video || [] };
  } catch {
    return { app: [], video: [] };
  }
}

export async function listThemes() {
  const saved = await loadSaved();
  return {
    app: [...APP_BUILTINS, ...saved.app],
    video: [...VIDEO_BUILTINS, ...saved.video],
    fonts: FONTS.map(({ file, ...f }) => f),
  };
}

export async function getVideoTheme(id) {
  const all = await listThemes();
  return all.video.find((t) => t.id === id) || VIDEO_BUILTINS[0];
}

/** Save (create or replace) a user theme. Built-ins can't be overwritten; saving one forks it. */
export async function saveTheme(kind, theme) {
  if (!['app', 'video'].includes(kind)) throw new Error('kind must be app or video');
  const saved = await loadSaved();
  const builtins = kind === 'app' ? APP_BUILTINS : VIDEO_BUILTINS;
  let id = String(theme.id || '').trim();
  if (!id || builtins.some((b) => b.id === id)) {
    id = `${String(theme.name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36).slice(-4)}`;
  }
  const clean = { ...theme, id, builtin: false };
  saved[kind] = [...saved[kind].filter((t) => t.id !== id), clean];
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(saved, null, 2));
  return clean;
}

export async function deleteTheme(kind, id) {
  const saved = await loadSaved();
  saved[kind] = (saved[kind] || []).filter((t) => t.id !== id);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(saved, null, 2));
}

export function fontFile(id) {
  return FONTS.find((f) => f.id === id) || FONTS[0];
}
