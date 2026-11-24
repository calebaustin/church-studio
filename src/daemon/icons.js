// Icons and shapes from open-source sets (Tabler, Lucide, Phosphor, Material Design Icons), searchable offline.
// Packed by scripts/build-icons.mjs into assets/icons/icons.json.gz and loaded the first time someone searches.
// A picked icon is saved into the brand library as a plain SVG with real colors, so Design can recolor it.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { ASSETS_DIR } from './tools.js';
import { ensureLibrary } from './library.js';

let pack = null;
function load() {
  if (!pack) {
    const raw = JSON.parse(zlib.gunzipSync(readFileSync(path.join(ASSETS_DIR, 'icons', 'icons.json.gz'))).toString('utf8'));
    // Each icon's search text: its name words, other names and categories.
    pack = { sets: raw.sets, icons: raw.icons.map(([s, name, body, w, h, style, words]) => ({ s, name, body, w, h, style, text: `${name.replace(/-/g, ' ')} ${words}` })) };
  }
  return pack;
}
export function iconSets() { return load().sets; }

// Church words people search for, and the icon words that match them.
const ALSO = {
  church: ['church', 'building', 'chapel', 'cross'], cross: ['cross', 'church', 'christian'], jesus: ['cross', 'christian'], christ: ['cross', 'christian'],
  pray: ['pray', 'hands', 'prayer'], prayer: ['pray', 'hands'], bible: ['book', 'bible', 'open'], scripture: ['book', 'bible'], word: ['book'],
  dove: ['bird', 'dove'], spirit: ['bird', 'dove', 'flame', 'fire'], baptism: ['water', 'drop', 'waves'], communion: ['bread', 'wine', 'glass', 'cup'],
  worship: ['music', 'note', 'hands', 'microphone'], sing: ['music', 'microphone'], choir: ['music', 'users'], give: ['gift', 'heart', 'donate', 'hand'],
  giving: ['gift', 'heart', 'donate', 'coin'], tithe: ['coin', 'cash', 'donate'], love: ['heart'], family: ['users', 'family', 'home'], kids: ['child', 'baby', 'balloon'],
  youth: ['users', 'school', 'star'], group: ['users', 'group'], event: ['calendar', 'ticket'], sunday: ['calendar', 'sun'], easter: ['egg', 'cross', 'sunrise'],
  christmas: ['tree', 'star', 'gift', 'snow'], advent: ['candle', 'star'], thanksgiving: ['leaf', 'pumpkin', 'turkey'], harvest: ['leaf', 'wheat', 'pumpkin'],
  light: ['sun', 'bulb', 'candle', 'flame'], peace: ['dove', 'leaf'], hope: ['sun', 'sunrise', 'star'], serve: ['hand', 'heart'], missions: ['world', 'globe', 'plane'],
  coffee: ['coffee', 'cup', 'mug'], welcome: ['door', 'hand', 'wave'], arrow: ['arrow'], frame: ['frame', 'square', 'circle', 'border'],
};

/**
 * Search the icons: whole words in the name count most, then name starts, then other names and categories.
 * set: one prefix or ''. style: 'line', 'solid', 'duotone' or ''. Returns up to `limit`, best first.
 */
export function searchIcons({ q = '', set = '', style = '', limit = 160 } = {}) {
  const { sets, icons } = load();
  const terms = String(q).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const si = set ? sets.findIndex((x) => x.prefix === set) : -1;
  const pool = icons.filter((ic) => (si < 0 || ic.s === si) && (!style || ic.style === style));
  let hits;
  if (!terms.length) {
    // Nothing typed: a sampler of simple shapes and common church things.
    const starts = ['circle', 'square', 'star', 'heart', 'cross', 'arrow', 'church', 'book', 'bird', 'flame', 'sun', 'leaf', 'calendar', 'music', 'hand', 'users', 'gift', 'candle'];
    hits = pool.filter((ic) => starts.some((w) => ic.name === w || ic.name.startsWith(`${w}-`))).sort((a, b) => a.name.length - b.name.length);
  } else {
    hits = [];
    for (const ic of pool) {
      let score = 0;
      for (const t of terms) {
        const also = ALSO[t] || [];
        const nameWords = ic.name.split('-');
        if (nameWords.includes(t)) score += 10;
        else if (ic.name.startsWith(t)) score += 7;
        else if (nameWords.some((w) => w.startsWith(t))) score += 5;
        else if (` ${ic.text} `.includes(` ${t}`)) score += 3;
        else if (also.some((a) => nameWords.includes(a))) score += 4;
        else { score = 0; break; } // every word has to match something
      }
      if (score) hits.push([score - ic.name.length * 0.05, ic]);
    }
    hits = hits.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }
  return hits.slice(0, limit).map((ic) => ({ id: `${sets[ic.s].prefix}:${ic.name}`, name: ic.name.replace(/-/g, ' '), set: sets[ic.s].name, style: ic.style, w: ic.w, h: ic.h, body: ic.body }));
}

/** The icon as a standalone SVG, every "currentColor" set to a real color so it can be recolored later. */
export function iconSvg(id, color = '#1B2440') {
  const [prefix, name] = String(id).split(':');
  const { sets, icons } = load();
  const si = sets.findIndex((x) => x.prefix === prefix);
  const ic = icons.find((x) => x.s === si && x.name === name);
  if (!ic) throw new Error('That icon wasn’t found.');
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : '#1B2440';
  const size = 512; const scale = size / Math.max(ic.w, ic.h);
  return { name: ic.name, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ic.w} ${ic.h}" width="${Math.round(ic.w * scale)}" height="${Math.round(ic.h * scale)}">${ic.body.replace(/currentColor/g, c)}</svg>` };
}

/** Save an icon into the brand library (Icons folder) and return where. The same icon in the same color is reused. */
export async function saveIcon(id, color) {
  const { name, svg } = iconSvg(id, color);
  const root = await ensureLibrary();
  const dir = path.join(root, 'Icons');
  await mkdir(dir, { recursive: true });
  const base = `${name.replace(/[^a-z0-9-]+/gi, '-')} (${String(id).split(':')[0]})`;
  let file = path.join(dir, `${base}.svg`);
  for (let n = 2; existsSync(file); n++) {
    if ((await readFile(file, 'utf8').catch(() => '')) === svg) break;
    file = path.join(dir, `${base} ${n}.svg`);
  }
  if (!existsSync(file)) await writeFile(file, svg);
  return { rel: path.relative(root, file).split(path.sep).join('/') };
}
