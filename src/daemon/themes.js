// App themes (the UI look, light and dark) and video themes (caption presets burned into exports).
// Built-ins live here; the user's saved themes live in data/themes.json.
// Caption fonts: a curated list (bundled Montserrat + good macOS fonts) plus every installed
// system font, discovered once with scripts/list_fonts.py and cached in data/fonts.json.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ASSETS_DIR, DATA_DIR, pyCommand, run, jsonFrom } from './tools.js';

const FILE = path.join(DATA_DIR, 'themes.json');
const FONT_CACHE = path.join(DATA_DIR, 'fonts.json');
const SUP = '/System/Library/Fonts/Supplemental';
const SYS = '/System/Library/Fonts';
const BUNDLED = path.join(ASSETS_DIR, 'fonts');

/** Curated caption fonts: the file the renderer loads + the CSS the preview uses, so they match. */
export const FONTS = [
  { id: 'montserrat-semibold', name: 'Montserrat SemiBold', file: path.join(BUNDLED, 'Montserrat_600SemiBold.ttf'), css: "'Montserrat'", weight: 600, bundled: true },
  { id: 'montserrat-medium', name: 'Montserrat Medium', file: path.join(BUNDLED, 'Montserrat_500Medium.ttf'), css: "'Montserrat'", weight: 500, bundled: true },
  { id: 'montserrat-bold', name: 'Montserrat Bold', file: path.join(BUNDLED, 'Montserrat_700Bold.ttf'), css: "'Montserrat'", weight: 700, bundled: true },
  { id: 'montserrat-extrabold', name: 'Montserrat ExtraBold', file: path.join(BUNDLED, 'Montserrat_800ExtraBold.ttf'), css: "'Montserrat'", weight: 800, bundled: true },
  { id: 'avenir-heavy', name: 'Avenir Next Heavy', file: `${SYS}/Avenir Next.ttc`, style: 'Heavy', css: "'Avenir Next'", weight: 800 },
  { id: 'avenir-bold', name: 'Avenir Next Bold', file: `${SYS}/Avenir Next.ttc`, style: 'Bold', css: "'Avenir Next'", weight: 700 },
  { id: 'arial-black', name: 'Arial Black', file: `${SUP}/Arial Black.ttf`, css: "'Arial Black'", weight: 900 },
  { id: 'helvetica-bold', name: 'Helvetica Neue Bold', file: `${SYS}/HelveticaNeue.ttc`, style: 'Bold', css: "'Helvetica Neue'", weight: 700 },
  { id: 'futura-bold', name: 'Futura Bold', file: `${SUP}/Futura.ttc`, style: 'Bold', css: 'Futura', weight: 700 },
  { id: 'din-condensed', name: 'DIN Condensed', file: `${SUP}/DIN Condensed Bold.ttf`, css: "'DIN Condensed'", weight: 700 },
  { id: 'impact', name: 'Impact', file: `${SUP}/Impact.ttf`, css: 'Impact', weight: 400 },
  { id: 'georgia-bold', name: 'Georgia Bold', file: `${SUP}/Georgia Bold.ttf`, css: 'Georgia', weight: 700 },
  { id: 'rockwell-bold', name: 'Rockwell Bold', file: `${SUP}/Rockwell.ttc`, style: 'Bold', css: 'Rockwell', weight: 700 },
].filter((f) => existsSync(f.file));

export function styleWeight(style = '') {
  const s = style.toLowerCase().replace(/[\s-]/g, '');
  const table = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['medium', 500],
    ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['heavy', 800], ['black', 900], ['bold', 700]];
  for (const [k, w] of table) if (s.includes(k)) return w;
  return 400;
}

let systemFonts = null;
export async function listSystemFonts() {
  if (systemFonts) return systemFonts;
  if (existsSync(FONT_CACHE)) {
    try { systemFonts = JSON.parse(await readFile(FONT_CACHE, 'utf8')); return systemFonts; } catch { /* rebuild */ }
  }
  try {
    const { stdout } = await run(...pyCommand('list_fonts', []));
    systemFonts = jsonFrom(stdout).map((f) => ({
      id: `sys:${f.family}|${f.style}`, name: `${f.family} ${f.style}`.replace(/ (Regular|Plain|Roman)$/, ''),
      family: f.family, file: f.file, index: f.index, style: f.style,
      css: `'${f.family.replace(/'/g, "\\'")}'`, weight: styleWeight(f.style), italic: /italic|oblique/i.test(f.style), system: true,
    }));
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(FONT_CACHE, JSON.stringify(systemFonts));
  } catch (e) {
    console.error('Could not list system fonts:', e.message);
    systemFonts = [];
  }
  return systemFonts;
}

export async function refreshSystemFonts() {
  systemFonts = null;
  await writeFile(FONT_CACHE, '[]').catch(() => {});
  const { rm } = await import('node:fs/promises');
  await rm(FONT_CACHE, { force: true });
  return listSystemFonts();
}

/** Defaults every video theme has, so older saved themes keep working. */
const CAPTION_DEFAULTS = {
  colorOpacity: 1, activeOpacity: 1, future: null, futureOpacity: 1, outlineOpacity: 1, boxOpacity: 0.92,
  align: 'center', maxWidth: 0.86, lineHeight: 1.12,
  // On-screen hook (title banner at the start of a clip)
  hookShape: 'pill', hookBg: '#FFFFFF', hookBgOpacity: 0.94, hookColor: '#11141C', hookSize: 58, hookY: 0.13,
  hookDuration: 3.5, hookUppercase: false,
};

const VIDEO_BUILTINS = [
  {
    id: 'soft-pill', name: 'Soft Pill', builtin: true,
    font: 'montserrat-semibold', size: 72, color: '#FFFFFF', active: '#FFFFFF', future: '#FFFFFF', futureOpacity: 0.45,
    outline: 0, outlineColor: '#000000', shadow: 0.3, position: 0.16, words: 6, uppercase: false,
    highlight: 'pill', boxColor: '#E9A47C', boxOpacity: 0.95, align: 'left', maxWidth: 0.72, lineHeight: 1.22,
  },
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
].map((t) => ({ ...CAPTION_DEFAULTS, ...t }));

// App themes set a few base tokens; the stylesheet derives text, borders and surfaces from them
// (see docs/ui-ux-guide.md §4). `mode` decides which slot a theme fills: light or dark.
const sans = "-apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif";
const APP_BUILTINS = [
  // The standard palette: a warm off-white leaning olive, leaf green, and a clay accent. Natural and calm.
  {
    id: 'olive', name: 'Olive', mode: 'light', builtin: true,
    tokens: { '--bg': '#ECEBDF', '--bg-2': '#E2E2D0', '--ink': '#20251D', '--accent': '#4A7C59', '--accent-2': '#C08A4E',
      '--glass-rgb': '252, 252, 246', '--radius': '18px', '--glass-blur': '14px', '--glass-tint': '0.9',
      '--font-sans': sans, '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif" },
  },
  {
    id: 'olive-night', name: 'Olive Night', mode: 'dark', builtin: true,
    tokens: { '--bg': '#171A15', '--bg-2': '#1E221B', '--ink': '#ECEDE3', '--accent': '#93C29B', '--accent-2': '#E2AE72',
      '--glass-rgb': '37, 42, 34', '--radius': '18px', '--glass-blur': '14px', '--glass-tint': '0.9',
      '--font-sans': sans, '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif" },
  },
  {
    id: 'sermon-light', name: 'Sermon Light', mode: 'light', builtin: true,
    tokens: { '--bg': '#EEF2F8', '--bg-2': '#F8F4EE', '--ink': '#141821', '--accent': '#3D6BFF', '--accent-2': '#FF8A5B',
      '--glass-rgb': '255, 255, 255', '--radius': '20px', '--glass-blur': '18px', '--glass-tint': '0.55',
      '--font-sans': sans, '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif" },
  },
  {
    id: 'morning-sage', name: 'Morning Sage', mode: 'light', builtin: true,
    tokens: { '--bg': '#EEF3EE', '--bg-2': '#F6F1E7', '--ink': '#18211C', '--accent': '#2B7F5F', '--accent-2': '#D9A441',
      '--glass-rgb': '255, 255, 255', '--radius': '18px', '--glass-blur': '16px', '--glass-tint': '0.6',
      '--font-sans': sans, '--font-display': "Georgia, 'Times New Roman', serif" },
  },
  {
    id: 'midnight-glass', name: 'Midnight Glass', mode: 'dark', builtin: true,
    tokens: { '--bg': '#0E1220', '--bg-2': '#17142A', '--ink': '#EEF0F8', '--accent': '#7C9BFF', '--accent-2': '#FFA37A',
      '--glass-rgb': '34, 39, 60', '--radius': '20px', '--glass-blur': '22px', '--glass-tint': '0.55',
      '--font-sans': sans, '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif" },
  },
  {
    id: 'evening-glass', name: 'Evening Glass', mode: 'dark', builtin: true,
    tokens: { '--bg': '#1A1626', '--bg-2': '#2A1D2E', '--ink': '#F6F2F7', '--accent': '#B59CFF', '--accent-2': '#FFB18A',
      '--glass-rgb': '48, 40, 62', '--radius': '22px', '--glass-blur': '20px', '--glass-tint': '0.6',
      '--font-sans': sans, '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif" },
  },
];

async function loadSaved() {
  if (!existsSync(FILE)) return { app: [], video: [] };
  try {
    const s = JSON.parse(await readFile(FILE, 'utf8'));
    // Themes saved before tokens were derived: migrate the old --text to --ink.
    const app = (s.app || []).map((t) => ({
      mode: 'light', ...t,
      tokens: { '--glass-rgb': '255, 255, 255', ...t.tokens, '--ink': t.tokens?.['--ink'] || t.tokens?.['--text'] || '#141821' },
    }));
    return { app, video: (s.video || []).map((t) => ({ ...CAPTION_DEFAULTS, ...t })) };
  } catch {
    return { app: [], video: [] };
  }
}

export async function listThemes() {
  const saved = await loadSaved();
  const system = await listSystemFonts();
  return {
    app: [...APP_BUILTINS, ...saved.app],
    video: [...VIDEO_BUILTINS, ...saved.video],
    fonts: FONTS.map(({ file, ...f }) => f),
    systemFonts: system.map(({ file, ...f }) => f),
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

/** Font file for a theme's font id: curated, system (sys:Family|Style) or the first fallback. */
export async function fontFile(id) {
  const curated = FONTS.find((f) => f.id === id);
  if (curated) return curated;
  if (String(id).startsWith('sys:')) {
    const f = (await listSystemFonts()).find((x) => x.id === id);
    if (f) return f;
  }
  return FONTS[0];
}

export const bundledFontDir = BUNDLED;
