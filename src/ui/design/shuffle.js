// Shuffle a design's colors from the brand colors. Every distinct color on the page moves to a brand color as a
// group, so things that matched still match (all gray text turns the same new color together). Text stays
// readable on its background, and the mapping can then be applied to every page.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const norm = (c) => {
  if (typeof c !== 'string' || !HEX.test(c.trim())) return null;
  let x = c.trim().toLowerCase();
  if (x.length === 4) x = `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}`;
  return x;
};
const lumOf = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const contrast = (a, b) => { const x = lumOf(a); const y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Every place a color is used on one page: [holder, key] pairs, like eachUse in the editor. */
function slots(pg) {
  const out = [];
  for (const it of pg.items || []) {
    for (const k of ['color', 'fill', 'stroke']) if (norm(it[k])) out.push([it, k]);
    if (it.type === 'qr' && norm(it.bg)) out.push([it, 'bg']);
    // Text styles: shadow, outline, circles and the shape behind each have a color.
    if (it.fx && it.type === 'text') for (const v of Object.values(it.fx)) if (v && norm(v.color)) out.push([v, 'color']);
  }
  if (pg.bg) {
    for (const k of ['color', 'color2', 'from', 'via', 'to']) if (norm(pg.bg[k])) out.push([pg.bg, k]);
    if (Array.isArray(pg.bg.colors)) pg.bg.colors.forEach((c, i) => { if (norm(c)) out.push([pg.bg.colors, i]); });
  }
  return out;
}
const bgOf = (pg) => norm(pg.bg?.color) || norm(pg.bg?.from) || norm(pg.bg?.colors?.[0]) || null;

/** The page's colors with how often each is used, most used first. */
export function pageColors(pg) {
  const n = new Map();
  for (const [o, k] of slots(pg)) { const c = norm(o[k]); n.set(c, (n.get(c) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

const shuffled = (list) => list.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

/**
 * A new mapping for this page's colors. `origin` maps a current color back to the color it started as, so
 * shuffling again keeps building one mapping from the original colors. Returns { map: original -> new }.
 */
export function shuffleMap(pg, brand, origin = {}) {
  const pal = [...new Set((brand || []).map(norm).filter(Boolean))];
  // A few neutrals so there's always a readable choice, used after the brand colors.
  const extra = ['#ffffff', '#141414'].filter((c) => !pal.includes(c));
  const cur = pageColors(pg);
  const bg = bgOf(pg); const bgOrig = bg ? origin[bg] || bg : null;
  // A mesh, pattern or photo background has no one color to check against: white and near-black text stays as it
  // is so it keeps reading, and everything else shuffles.
  const keep = new Set(bgOrig ? [] : (pg.items || []).filter((it) => it.type === 'text' && norm(it.color)).map((it) => origin[norm(it.color)] || norm(it.color)).filter((c) => { const l = lumOf(c); return l > 0.8 || l < 0.02; }));
  const origs = [...new Set(cur.map((c) => origin[c] || c))].filter((o) => !keep.has(o));
  const textOrigs = new Set((pg.items || []).filter((it) => it.type === 'text' && norm(it.color)).map((it) => origin[norm(it.color)] || norm(it.color)));
  let best = null;
  for (let t = 0; t < 40; t++) {
    const order = [...shuffled(pal), ...extra];
    const map = {};
    origs.forEach((o, i) => { map[o] = order[i % order.length]; });
    for (const o of keep) map[o] = o;
    // Text must read against the page: the lowest text contrast decides, with a nudge toward a fresh look.
    const newBg = bgOrig ? map[bgOrig] : null;
    const worst = newBg && textOrigs.size ? Math.min(...[...textOrigs].map((o) => contrast(map[o], newBg))) : 21;
    const same = origs.filter((o) => map[o] === (Object.entries(origin).find(([, v]) => v === o)?.[0] || o)).length;
    const score = Math.min(worst, 4.5) * 10 - same;
    if (!best || score > best.score) best = { map, score };
    if (worst >= 4.5 && same === 0) break;
  }
  return best ? best.map : {};
}

/** Recolor one page with an original -> new mapping. `origin` (current -> original) handles a page already shuffled. */
export function applyMap(pg, map, origin = {}) {
  for (const [o, k] of slots(pg)) {
    const c = norm(o[k]); const from = origin[c] || c;
    if (map[from]) o[k] = map[from];
  }
}

const chroma = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); };

/**
 * Puts a whole design in the brand colors. Every colorful color moves to a brand color (the most used one to the
 * first brand color, and so on), while blacks, whites and grays stay. Then any text that no longer reads on its
 * page gets the most readable brand color, or black or white.
 */
export function applyBrandAll(pages, brand) {
  const pal = [...new Set((brand || []).map(norm).filter(Boolean))];
  if (!pal.length) return 0;
  const n = new Map();
  for (const pg of pages) for (const [o, k] of slots(pg)) { const c = norm(o[k]); if (chroma(c) >= 24) n.set(c, (n.get(c) || 0) + 1); }
  const colorful = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const accents = pal.filter((c) => chroma(c) >= 24);
  const use = accents.length ? accents : pal;
  const map = Object.fromEntries(colorful.map((c, i) => [c, use[i % use.length]]));
  let changed = 0;
  for (const pg of pages) {
    for (const [o, k] of slots(pg)) { const c = norm(o[k]); if (map[c] && map[c] !== c) { o[k] = map[c]; changed++; } }
    const bg = bgOf(pg);
    if (!bg) continue;
    for (const it of pg.items || []) {
      if (it.type !== 'text' || !norm(it.color) || it.fx?.bg) continue;
      if (contrast(norm(it.color), bg) >= 3) continue;
      const pick = [...pal, '#ffffff', '#141414'].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
      it.color = pick; changed++;
    }
  }
  return changed;
}
