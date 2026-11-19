// Your blog, read from its RSS or Atom feed: what you've posted, how often, and about what.
// Saved on this Mac so the history keeps growing even though feeds only show recent posts.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';
import { loadConfig, saveConfig } from './config.js';

const STORE = path.join(DATA_DIR, 'blog.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) return null;
    const text = await r.text();
    return text.length > 6_000_000 ? null : { text, url: r.url, type: r.headers.get('content-type') || '' };
  } catch { return null; } finally { clearTimeout(t); }
}
const abs = (u, base) => { try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch { return null; } };
const isFeed = (text) => /<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 2000));
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”').replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, '\u2014').replace(/&nbsp;|&#160;/g, ' ').replace(/&#x27;/gi, '’').replace(/&#\d+;|&#x[0-9a-f]+;/gi, '').replace(/&amp;/g, '&');
const strip = (html) => decode(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';

/** Find a site's feed: its <link rel="alternate">, then the usual addresses for WordPress, Squarespace and Wix. */
export async function findFeed(input) {
  let url = String(input || '').trim();
  if (!url) throw new Error('Add your blog or website address.');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const page = await get(url);
  if (!page) throw new Error('Couldn’t reach that address.');
  if (isFeed(page.text)) return page.url;
  const links = [...page.text.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((l) => /rel=["']alternate["']/i.test(l) && /(rss|atom)\+xml/i.test(l))
    .map((l) => abs(l.match(/href=["']([^"']+)["']/i)?.[1] || '', page.url)).filter((u) => u && !/comments/i.test(u));
  const u = new URL(page.url);
  const guesses = [...links, `${u.origin}/feed`, `${u.origin}/blog/feed`, `${u.origin}/rss`, `${u.origin}/feed.xml`, `${u.origin}/rss.xml`, `${u.origin}/atom.xml`, `${u.origin}/blog?format=rss`, `${u.origin}/blog-feed.xml`, `${page.url.replace(/\/$/, '')}?format=rss`];
  for (const g of [...new Set(guesses)]) {
    const r = await get(g);
    if (r && isFeed(r.text)) return r.url;
  }
  throw new Error('No blog feed found there. Try your blog page’s address, like yourchurch.org/blog.');
}

export function parseFeed(xml) {
  const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return items.map((b) => {
    const link = decode(tag(b, 'link')).trim() || b.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] || decode(tag(b, 'guid')).trim();
    const date = decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')).trim();
    const body = tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary');
    // WordPress adds "The post X appeared first on Y." to every item.
    const text = strip(body).replace(/The post .{0,240}? appeared first on .{0,120}?\.?$/i, '').trim();
    return {
      title: strip(tag(b, 'title')) || 'Untitled', link: decode(link).trim(),
      date: Number.isNaN(Date.parse(date)) ? null : new Date(date).toISOString(),
      summary: text.slice(0, 400), words: text ? text.split(' ').length : 0, text: text.slice(0, 6000),
      categories: [...b.matchAll(/<category\b[^>]*?(?:term=["']([^"']+)["'][^>]*)?(?:\/>|>([\s\S]*?)<\/category>)/gi)].map((c) => strip(c[1] || c[2] || '')).filter(Boolean).slice(0, 8),
    };
  }).filter((p) => p.link);
}

async function load() {
  if (!existsSync(STORE)) return { feed: '', fetched: null, posts: [] };
  try { return JSON.parse(await readFile(STORE, 'utf8')); } catch { return { feed: '', fetched: null, posts: [] }; }
}
async function save(s) { await mkdir(DATA_DIR, { recursive: true }); await writeFile(STORE, JSON.stringify(s)); }

/** Read the feed (and older pages where the blog offers them) and add new posts to the history. */
export async function syncBlog({ url } = {}) {
  const cfg = await loadConfig();
  const store = await load();
  let feed = store.feed || cfg.blogFeed;
  if (url) feed = await findFeed(url);
  if (!feed) throw new Error('Add your blog first.');
  // A different blog starts a fresh history.
  const seen = new Map((feed === store.feed ? store.posts : []).map((p) => [p.link, p]));
  let added = 0;
  for (let page = 1; page <= 6; page++) {
    const u = page === 1 ? feed : /\/feed\/?$|[?&]feed=/.test(feed) ? `${feed}${feed.includes('?') ? '&' : '?'}paged=${page}` : null;
    if (!u) break;
    const r = await get(u);
    if (!r || !isFeed(r.text)) break;
    const posts = parseFeed(r.text);
    if (!posts.length) break;
    let fresh = 0;
    for (const p of posts) { if (!seen.has(p.link)) { fresh++; added++; } seen.set(p.link, { ...seen.get(p.link), ...p }); }
    if (!fresh && page > 1) break;
  }
  const out = { feed, site: new URL(feed).origin, fetched: new Date().toISOString(), posts: [...seen.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 600) };
  await save(out);
  if (cfg.blogFeed !== feed) await saveConfig({ blogFeed: feed });
  return { added, total: out.posts.length, feed };
}

export async function blogHistory() { return load(); }

export async function forgetBlog() { await save({ feed: '', fetched: null, posts: [] }); await saveConfig({ blogFeed: '' }); return { ok: true }; }
