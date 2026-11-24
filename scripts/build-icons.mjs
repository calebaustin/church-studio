#!/usr/bin/env node
// Packs the open-source icon sets Church Studio ships with into one small file the engine searches offline:
// assets/icons/icons.json.gz. Sets come from the Iconify JSON packages (dev dependencies). Only permissive
// licenses (MIT, ISC, Apache-2.0); each set's license and author are kept for the Thank you page.
// Run: node scripts/build-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETS = [
  // prefix, how its style shows in names
  ['tabler', (n) => (n.endsWith('-filled') ? 'solid' : 'line')],
  ['lucide', () => 'line'],
  ['ph', (n) => (/-(fill)$/.test(n) ? 'solid' : /-duotone$/.test(n) ? 'duotone' : 'line')],
  ['mdi', (n) => (n.endsWith('-outline') ? 'line' : 'solid')],
];
const OK = new Set(['MIT', 'ISC', 'Apache-2.0', 'CC0-1.0']);

const out = { sets: [], icons: [] };
for (const [prefix, styleOf] of SETS) {
  const dir = path.join(ROOT, 'node_modules', '@iconify-json', prefix);
  const data = JSON.parse(readFileSync(path.join(dir, 'icons.json'), 'utf8'));
  const info = JSON.parse(readFileSync(path.join(dir, 'info.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  if (!OK.has(info.license?.spdx)) throw new Error(`${prefix} has license ${info.license?.spdx}, not allowed`);
  const si = out.sets.length;
  out.sets.push({ prefix, name: info.name, license: info.license.spdx, licenseUrl: info.license.url, author: info.author?.name, url: info.author?.url, count: Object.keys(data.icons).length });
  // Categories become search words (Material Design Icons has them).
  const cat = {};
  for (const [c, names] of Object.entries(meta.categories || {})) for (const n of names) (cat[n] ||= []).push(c.toLowerCase());
  // Aliases (other names for the same icon) are search words too.
  const alias = {};
  for (const [a, v] of Object.entries(data.aliases || {})) if (v.parent && !v.rotate && !v.hFlip && !v.vFlip) (alias[v.parent] ||= []).push(a);
  const W = data.width || 16; const H = data.height || 16;
  for (const [name, icon] of Object.entries(data.icons)) {
    const words = [...new Set([...(alias[name] || []), ...(cat[name] || [])].join(' ').split(/[^a-z0-9]+/).filter((w) => w.length > 1))].join(' ');
    out.icons.push([si, name, icon.body, icon.width || W, icon.height || H, styleOf(name), words]);
  }
}
mkdirSync(path.join(ROOT, 'assets', 'icons'), { recursive: true });
const json = JSON.stringify(out);
const gz = gzipSync(json, { level: 9 });
writeFileSync(path.join(ROOT, 'assets', 'icons', 'icons.json.gz'), gz);
console.log(`${out.icons.length} icons from ${out.sets.length} sets: ${(json.length / 1048576).toFixed(1)} MB, ${(gz.length / 1048576).toFixed(1)} MB packed`);
