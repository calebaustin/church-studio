// Jumpstart: get a church set up fast.
// 1. Settings file: pack the lightweight settings of one or more workspaces (brand kit, logos, voice,
//    church info, links, themes, preferences) into a zip for another Mac or a teammate. Never projects,
//    videos or keys. Import drops each part where it goes.
// 2. From the website: read the church's site for name, contact info, service times, logo, colors,
//    fonts, social links and voice, so the app looks like theirs in a minute.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_NAME, BASE, WORKSPACE } from './tools.js';
import { loadConfig, saveConfig } from './config.js';
import { ensureLibrary } from './library.js';
import { addSample, loadVoice, updateVoice } from './voice.js';
import { createWorkspace, listWorkspaces } from './workspaces.js';
import { downloadsDir } from './render.js';
import { syncBlog } from './blog.js';

const run = promisify(execFile);
const FORMAT = 1;

/** What can be shared, and the settings each part carries. */
export const PARTS = {
  brand: { label: 'Brand kit', about: 'Colors, fonts and logos', keys: ['brandColors', 'brandFonts', 'brandColorsSet', 'brandFontsSet', 'logoKinds', 'appLogo', 'dockLogo'] },
  voice: { label: 'Brand voice', about: 'Mission, website copy, themes and writing samples', keys: [] },
  church: { label: 'Church info', about: 'Name, address, phone, email and service times', keys: ['churchInfo'] },
  links: { label: 'Links and connections', about: 'YouTube channel, calendar links and social links. No passwords or keys.', keys: ['youtubeChannel', 'calendarFeeds', 'socialLinks'] },
  themes: { label: 'Themes', about: 'Your app and caption themes and which ones are picked', keys: ['appTheme', 'appThemeDark', 'appearance', 'videoTheme', 'refraction'] },
  prefs: { label: 'Preferences', about: 'Export settings, file names, goals, tools and content plan', keys: ['exportOptions', 'exportPattern', 'weeklyGoal', 'clipCount', 'clipMin', 'clipMax', 'toolOrder', 'toolsOff', 'planHidden', 'whisperModel'] },
};

// ------------------------------------------------------------------ reading any workspace's files
async function registryList() {
  const { list } = await listWorkspaces();
  const reg = existsSync(path.join(BASE, 'workspaces.json')) ? JSON.parse(await readFile(path.join(BASE, 'workspaces.json'), 'utf8')) : { list: [] };
  return list.map((w) => ({ ...w, dir: w.id === 'main' ? BASE : reg.list.find((x) => x.id === w.id)?.dir || path.join(BASE, 'workspaces', w.id) }));
}
const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } };
const libraryFor = (cfg, w) => cfg.libraryFolder || path.join(os.homedir(), 'Documents', `${APP_NAME} Library${w.id === 'main' ? '' : ` (${w.name})`}`);

// ------------------------------------------------------------------ export
/** Make the zip in Downloads. workspaces: ids (default: the open one). parts: ids from PARTS. */
export async function exportSettings({ workspaces: ids, parts }) {
  const all = await registryList();
  const chosen = all.filter((w) => (ids?.length ? ids : [WORKSPACE.id]).includes(w.id));
  const want = (parts?.length ? parts : Object.keys(PARTS)).filter((p) => PARTS[p]);
  if (!chosen.length) throw new Error('Pick at least one workspace.');
  const stage = await mkdtemp(path.join(os.tmpdir(), 'cs-jumpstart-'));
  const manifest = { format: FORMAT, app: APP_NAME, made: new Date().toISOString(), parts: want, workspaces: [] };
  try {
    for (const [i, w] of chosen.entries()) {
      const cfg = await readJson(path.join(w.dir, 'config.local.json'), {});
      const entry = { name: w.name, settings: {}, files: [] };
      for (const p of want) for (const k of PARTS[p].keys) if (k in cfg) entry.settings[k] = cfg[k];
      if (want.includes('voice')) entry.voice = await readJson(path.join(w.dir, 'data', 'brand-voice.json'), null);
      if (want.includes('themes')) {
        const t = await readJson(path.join(w.dir, 'data', 'themes.json'), { app: [], video: [] });
        entry.themes = { app: t.app || [], video: t.video || [] };
      }
      if (want.includes('brand')) {
        const logos = path.join(libraryFor(cfg, w), 'Logos');
        if (existsSync(logos)) {
          const dir = path.join(stage, `w${i}`, 'Logos');
          await mkdir(dir, { recursive: true });
          for (const f of (await readdir(logos)).filter((n) => /\.(png|jpe?g|svg|webp)$/i.test(n)).slice(0, 12)) {
            await copyFile(path.join(logos, f), path.join(dir, f));
            entry.files.push(`w${i}/Logos/${f}`);
          }
        }
      }
      manifest.workspaces.push(entry);
    }
    await writeFile(path.join(stage, 'jumpstart.json'), JSON.stringify(manifest, null, 2));
    const out = downloadsDir() || os.homedir();
    const base = `${APP_NAME} Jumpstart - ${chosen.length === 1 ? chosen[0].name : `${chosen.length} workspaces`} - ${new Date().toISOString().slice(0, 10)}`;
    let file = path.join(out, `${base}.zip`);
    for (let n = 2; existsSync(file); n++) file = path.join(out, `${base} ${n}.zip`);
    await run('/usr/bin/ditto', ['-c', '-k', '--norsrc', stage, file]);
    return { file, name: path.basename(file), workspaces: chosen.length, parts: want };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ import
async function unpack(zip) {
  if (!existsSync(zip) || !/\.zip$/i.test(zip)) throw new Error('Pick a Jumpstart .zip file.');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cs-jumpstart-in-'));
  await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
  const m = await readJson(path.join(dir, 'jumpstart.json'), null);
  if (!m || m.app !== APP_NAME || !Array.isArray(m.workspaces)) { await rm(dir, { recursive: true, force: true }); throw new Error('That zip isn’t a Church Studio Jumpstart file.'); }
  if (m.format > FORMAT) { await rm(dir, { recursive: true, force: true }); throw new Error('This file was made by a newer Church Studio. Update the app, then import it.'); }
  return { dir, m };
}

/** Look inside a file before importing: which workspaces and parts it holds. */
export async function readPackage(zip) {
  const { dir, m } = await unpack(zip);
  await rm(dir, { recursive: true, force: true });
  return {
    made: m.made, parts: m.parts.filter((p) => PARTS[p]).map((p) => ({ id: p, ...PARTS[p], keys: undefined })),
    workspaces: m.workspaces.map((w, i) => ({ index: i, name: w.name, logos: w.files.length, samples: w.voice?.samples?.length || 0, colors: w.settings.brandColors || [] })),
  };
}

/**
 * Bring settings in. plan: [{ index, target: 'current' | 'new' }]. parts: which parts to apply.
 * "current" applies to the open workspace now. "new" makes a workspace and writes its files, ready to switch to.
 */
export async function importPackage(zip, { plan, parts }) {
  const { dir, m } = await unpack(zip);
  const want = (parts?.length ? parts : m.parts).filter((p) => m.parts.includes(p) && PARTS[p]);
  const done = [];
  try {
    for (const step of plan || [{ index: 0, target: 'current' }]) {
      const w = m.workspaces[step.index];
      if (!w) continue;
      const settings = Object.fromEntries(Object.entries(w.settings || {}).filter(([k]) => want.some((p) => PARTS[p].keys.includes(k))));
      if (step.target === 'new') {
        const made = await createWorkspace({ name: w.name });
        const wdir = path.join(BASE, 'workspaces', made.id);
        const cfgFile = path.join(wdir, 'config.local.json');
        const cfg = { ...(await readJson(cfgFile, {})), ...settings, onboarded: true };
        await writeFile(cfgFile, JSON.stringify(cfg, null, 2));
        await mkdir(path.join(wdir, 'data'), { recursive: true });
        if (want.includes('voice') && w.voice) await writeFile(path.join(wdir, 'data', 'brand-voice.json'), JSON.stringify(w.voice, null, 2));
        if (want.includes('themes') && w.themes) await writeFile(path.join(wdir, 'data', 'themes.json'), JSON.stringify(w.themes, null, 2));
        if (want.includes('brand')) await copyLogos(dir, w, path.join(libraryFor(cfg, { id: made.id, name: made.name }), 'Logos'));
        done.push({ name: made.name, target: 'new', id: made.id });
      } else {
        await saveConfig(settings);
        if (want.includes('voice') && w.voice) {
          const mine = await loadVoice();
          const have = new Set(mine.samples.map((s) => s.text.slice(0, 80)));
          await updateVoice({
            mission: mine.mission || w.voice.mission || '', website: mine.website || w.voice.website || '',
            themes: [...new Set([...(mine.themes || []), ...(w.voice.themes || [])])].slice(0, 12),
          });
          for (const smp of (w.voice.samples || []).filter((x) => x.text && !have.has(String(x.text).slice(0, 80)))) await addSample({ title: smp.title || '', text: smp.text, source: smp.source || 'pasted' }).catch(() => {});
        }
        if (want.includes('themes') && w.themes) {
          const file = path.join(WORKSPACE.dir, 'data', 'themes.json');
          const mine = await readJson(file, { app: [], video: [] });
          const merge = (a = [], b = []) => [...a.filter((t) => !b.some((x) => x.id === t.id)), ...b];
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, JSON.stringify({ app: merge(mine.app, w.themes.app), video: merge(mine.video, w.themes.video) }, null, 2));
        }
        if (want.includes('brand')) await copyLogos(dir, w, path.join(await ensureLibrary(), 'Logos'));
        done.push({ name: WORKSPACE.name, target: 'current' });
      }
    }
    return { done, parts: want };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function copyLogos(dir, w, dest) {
  await mkdir(dest, { recursive: true });
  for (const rel of w.files || []) {
    const src = path.join(dir, rel);
    if (!rel.includes('..') && existsSync(src)) {
      const target = path.join(dest, path.basename(rel));
      if (!existsSync(target)) await copyFile(src, target);
    }
  }
}

// ------------------------------------------------------------------ from the website
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
async function get(url, { binary = false, limit = 3_000_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: binary ? '*/*' : 'text/html,text/css,*/*' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > limit) return null;
    return binary ? { buf, type: r.headers.get('content-type') || '', url: r.url } : { text: buf.toString('utf8'), url: r.url };
  } catch { return null; } finally { clearTimeout(t); }
}
const abs = (u, base) => { try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch { return null; } };
const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '';
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&#8217;/g, '’').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#8211;|&ndash;/g, '-').replace(/&#x27;/gi, '’').replace(/&#x[0-9a-f]+;|&#\d+;/gi, '').trim();
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|section)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ');

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); out.push(...(Array.isArray(j) ? j : j['@graph'] || [j])); } catch { /* skip */ }
  }
  return out;
}

const hexOf = (c) => {
  c = c.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c.toUpperCase();
  const m = c.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : null;
};
const sat = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const near = (a, b) => [1, 3, 5].reduce((s, i) => s + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0) < 60;

/** The brand colors a site uses most: theme-color first, then the most-used colorful values in its CSS. */
function pickColors(css, themeColor) {
  const tally = new Map();
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)/g)) {
    const h = hexOf(m[0]);
    if (h) tally.set(h, (tally.get(h) || 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const colorful = ranked.filter((h) => sat(h) > 0.25 && lum(h) > 0.06 && lum(h) < 0.9);
  const dark = ranked.find((h) => lum(h) < 0.12 && !['#000000'].includes(h)) || '#1B2440';
  const light = ranked.find((h) => lum(h) > 0.88 && h !== '#FFFFFF') || '#F4EFE6';
  const picks = [];
  for (const h of [themeColor && hexOf(themeColor), ...colorful]) if (h && !picks.some((p) => near(p, h))) picks.push(h);
  const main = picks.slice(0, 3);
  while (main.length < 2) main.push(['#2B7F5F', '#D9A441'][main.length]);
  return [main[0], main[1], dark, light, main[2] || '#8FB8A8'];
}

function pickFonts(html, css) {
  const fams = [];
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/g)) {
    for (const f of decode(m[1]).matchAll(/family=([^:&|]+)/g)) fams.push(decodeURIComponent(f[1].replace(/\+/g, ' ')));
  }
  const tally = new Map();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (first && !/^(inherit|initial|var\(|-apple|system-ui|ui-|sans-serif|serif|monospace|helvetica|arial|times|georgia|font ?awesome|dashicons|eicons|icomoon)/i.test(first) && !/fallback|icons?$/i.test(first)) tally.set(first, (tally.get(first) || 0) + 1);
  }
  const ranked = [...new Set([...fams, ...[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)])];
  const heading = css.match(/h1[^{]*\{[^}]*font-family\s*:\s*["']?([^,;"'}]+)/i)?.[1]?.trim();
  return { heading: heading && ranked.includes(heading) ? heading : ranked[0] || null, body: ranked.find((f) => f !== heading) || ranked[0] || null, all: ranked.slice(0, 6) };
}

function contactFrom(html, text, ld) {
  const org = ld.find((x) => /Church|Organization|LocalBusiness|PlaceOfWorship|ReligiousOrganization/i.test(String(x['@type']))) || {};
  const a = org.address || {};
  const ldAddress = typeof a === 'string' ? a : [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const phone = org.telephone || html.match(/href=["']tel:([^"']+)/i)?.[1] || text.match(/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/)?.[0] || '';
  const email = org.email || html.match(/href=["']mailto:([^"'?]+)/i)?.[1] || text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || '';
  const address = ldAddress || text.match(/\d{2,6}\s+[A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,4}\s+(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Hwy|Highway|Pkwy|Parkway|Ct|Court|Pl|Place)\.?,?\s+[A-Z][a-zA-Z.\s]+,?\s+[A-Z]{2}\s+\d{5}/)?.[0] || '';
  const times = [...new Set([...text.matchAll(/\b(?:Sundays?|Saturdays?|Wednesdays?)[^.\n]{0,60}?\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)(?:[^.\n]{0,40}?\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.))*/gi)].map((m) => m[0].replace(/\s+/g, ' ').trim()))].slice(0, 3).join(' · ');
  return { name: decode(org.name || ''), address: decode(ldAddress || address).replace(/\s+/g, ' '), phone: decode(phone).replace(/^\+1\s?/, ''), email: decode(email).toLowerCase(), times };
}

function socialFrom(html) {
  const out = {};
  const nets = { facebook: /facebook\.com\/(?!sharer|share|plugins|tr\b)[\w.-]+/i, instagram: /instagram\.com\/[\w.]+/i, youtube: /youtube\.com\/(?:@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)/i, tiktok: /tiktok\.com\/@[\w.]+/i, x: /(?:twitter|x)\.com\/(?!intent|share)[\w]+/i, vimeo: /vimeo\.com\/[\w]+/i };
  for (const [k, re] of Object.entries(nets)) { const m = html.match(new RegExp(`https?://(?:www\\.)?${re.source}`, 'i')); if (m) out[k] = m[0]; }
  return out;
}

function logoCandidates(html, base) {
  const found = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'srcset').split(/\s/)[0];
    const hint = `${attr(tag, 'class')} ${attr(tag, 'alt')} ${attr(tag, 'id')} ${src}`.toLowerCase();
    if (src && /logo|brand|site-title|wordmark|header/.test(hint)) found.push({ url: abs(src, base), score: /logo/.test(hint) ? 3 : 1, from: 'page' });
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attr(m[0], 'rel').toLowerCase();
    if (/apple-touch-icon|icon/.test(rel)) found.push({ url: abs(attr(m[0], 'href'), base), score: /apple/.test(rel) ? 2 : 0.5, from: 'icon' });
  }
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0];
  if (og) found.push({ url: abs(attr(og, 'content'), base), score: 0.8, from: 'share image' });
  return [...new Map(found.filter((f) => f.url).map((f) => [f.url, f])).values()].sort((a, b) => b.score - a.score).slice(0, 4);
}

function voiceFrom(texts) {
  const paras = texts.flatMap((t) => t.split(/\n+/)).map((p) => p.trim()).filter((p) => p.split(' ').length >= 14 && p.split(' ').length <= 140 && !/cookie|copyright|©|privacy|javascript/i.test(p));
  const uniq = [...new Set(paras)];
  const mission = uniq.find((p) => /\b(our mission|we exist to|our vision|we are a church|we believe)\b/i.test(p) && !p.includes('?')) || '';
  const website = uniq.filter((p) => p !== mission).slice(0, 4).join('\n\n').slice(0, 1800);
  const words = uniq.join(' ').toLowerCase();
  const themes = ['grace', 'community', 'family', 'hope', 'love', 'jesus', 'gospel', 'neighbors', 'belong', 'serve', 'worship', 'generosity', 'mission', 'prayer', 'next generation']
    .filter((w) => (words.match(new RegExp(`\\b${w}`, 'g')) || []).length >= 2).slice(0, 5);
  return { mission: mission.slice(0, 600), website, themes };
}

/** Read the site and return best guesses. Nothing is saved until the person says so. */
export async function scanWebsite(input) {
  let url = String(input || '').trim();
  if (!url) throw new Error('Add your church website.');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try { const u = new URL(url); if (!/\./.test(u.hostname)) throw new Error(); } catch { throw new Error('That doesn’t look like a website address.'); }
  const home = await get(url);
  if (!home) throw new Error('Couldn’t reach that website. Check the address, or skip this step.');
  const base = home.url;
  const html = home.text;
  // A couple of likely pages for contact info and voice.
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: abs(m[1], base), label: textOf(m[2]).toLowerCase() }))
    .filter((l) => l.href && new URL(l.href).hostname === new URL(base).hostname);
  const pick = (re) => links.find((l) => re.test(l.label) || re.test(l.href))?.href;
  const extra = [...new Set([pick(/\babout|who we are|our story|beliefs\b/), pick(/\bcontact|visit|plan a visit|new here|location\b/)].filter(Boolean))].slice(0, 2);
  const pages = [html, ...(await Promise.all(extra.map((u) => get(u)))).filter(Boolean).map((p) => p.text)];
  // Stylesheets for colors and fonts.
  const sheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].map((m) => abs(attr(m[0], 'href'), base)).filter((u) => u && !/fonts\.googleapis|font-?awesome|bootstrap\.min|jquery/i.test(u)).slice(0, 4);
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + (await Promise.all(sheets.map((u) => get(u)))).filter(Boolean).map((r) => r.text).join('\n')
    + [...html.matchAll(/style=["']([^"']+)["']/gi)].map((m) => m[1]).join(';');
  const ld = pages.flatMap(jsonLd);
  const texts = pages.map(textOf);
  const contact = contactFrom(pages.join('\n'), texts.join('\n'), ld);
  const siteName = decode(html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)/i)?.[1] || '');
  // Page titles look like "Home | Grace Church" or "A long tagline - Redeemer": keep the short name part.
  const parts = decode(html.match(/<title[^>]*>([^<]+)/i)?.[1] || '').split(/\s*[|–·]\s*|\s+-\s*|\s*-\s+/).map((x) => x.trim()).filter((x) => x && !/^(home|welcome)$/i.test(x));
  const title = siteName || parts.find((x) => /church|chapel|fellowship|community|ministr|parish|cathedral/i.test(x)) || parts.sort((a, b) => a.length - b.length)[0] || '';
  const themeColor = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)/i)?.[1];
  const logos = [];
  for (const c of logoCandidates(html, base)) {
    const r = await get(c.url, { binary: true, limit: 4_000_000 });
    if (!r || !/image|svg/.test(r.type) || r.buf.length < 400) continue;
    const ext = /svg/.test(r.type) ? 'svg' : /png/.test(r.type) ? 'png' : /webp/.test(r.type) ? 'webp' : /icon/.test(r.type) ? 'ico' : 'jpg';
    if (ext === 'ico') continue;
    logos.push({ url: c.url, from: c.from, dataUrl: `data:${ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`};base64,${r.buf.toString('base64')}`, ext });
    if (logos.length >= 3) break;
  }
  return {
    website: base,
    name: contact.name || title,
    churchInfo: { name: contact.name || title, address: contact.address, phone: contact.phone, email: contact.email, website: base.replace(/\/$/, ''), times: contact.times },
    colors: pickColors(css, themeColor),
    fonts: pickFonts(html, css),
    logos,
    social: socialFrom(pages.join('\n')),
    voice: voiceFrom(texts),
  };
}

/** Save what the person kept from the website scan. */
export async function applyScan(found, keep) {
  const patch = { jumpstart: { at: new Date().toISOString(), website: found.website || '' } };
  if (keep.church && found.churchInfo) {
    const cur = (await loadConfig()).churchInfo || {};
    patch.churchInfo = { ...cur, ...Object.fromEntries(Object.entries(found.churchInfo).filter(([, v]) => v)) };
  }
  if (keep.colors && found.colors?.length) { patch.brandColors = found.colors; patch.brandColorsSet = true; }
  if (keep.fonts && found.fonts?.heading) { patch.brandFonts = { heading: found.fonts.heading, body: found.fonts.body || found.fonts.heading }; patch.brandFontsSet = true; }
  if (keep.social && found.social) patch.socialLinks = { ...(await loadConfig()).socialLinks, ...found.social };
  if (keep.youtube && found.youtube) patch.youtubeChannel = found.youtube;
  let logo = null;
  if (keep.logo != null && found.logos?.[keep.logo]) {
    const l = found.logos[keep.logo];
    const m = String(l.dataUrl).match(/^data:[^;]+;base64,(.+)$/);
    if (m) {
      const root = await ensureLibrary();
      const base = `${(found.name || 'Church').replace(/[^\w\s-]/g, '').trim() || 'Church'} logo`;
      let file = path.join(root, 'Logos', `${base}.${l.ext}`);
      for (let n = 2; existsSync(file); n++) file = path.join(root, 'Logos', `${base} ${n}.${l.ext}`);
      await writeFile(file, Buffer.from(m[1], 'base64'));
      logo = `Logos/${path.basename(file)}`;
      patch.appLogo = logo;
    }
  }
  await saveConfig(patch);
  // Their blog, for Inspiration. Quietly skipped when the site has no feed.
  if (found.website && !(await loadConfig()).blogFeed) syncBlog({ url: found.website }).catch(() => {});
  if (keep.voice && found.voice) {
    const v = await loadVoice();
    await updateVoice({ mission: v.mission || found.voice.mission, website: v.website || found.voice.website, themes: [...new Set([...(v.themes || []), ...(found.voice.themes || [])])].slice(0, 12) });
  }
  return { ok: true, logo };
}
