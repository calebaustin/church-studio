// Church calendar events from calendar links (.ics): Planning Center, Church Center, Subsplash,
// Tithe.ly, Google, Outlook. One or more feeds. Fetched at most once a week: on the first run after
// Monday 6 AM, or when someone presses refresh. Events are cached in data/church-events.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';
import { loadConfig, saveConfig } from './config.js';

const STORE = path.join(DATA_DIR, 'church-events.json');
const HORIZON = 183 * 86400000; // about six months ahead

export async function cachedEvents() {
  try { return JSON.parse(await readFile(STORE, 'utf8')); } catch { return { events: [], fetched: null, source: null }; }
}

/** The most recent Monday at 6 AM, local time. */
export function lastMondayMorning(now = new Date()) {
  const d = new Date(now); d.setHours(6, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back);
  if (d > now) d.setDate(d.getDate() - 7);
  return d;
}
/** The calendar links, including one saved by older versions. */
export const feedsOf = (cfg) => (cfg.calendarFeeds?.length ? cfg.calendarFeeds : cfg.calendarIcal ? [{ id: 'cal', name: 'Church calendar', url: cfg.calendarIcal }] : []).filter((f) => f?.url);
export const connected = (cfg) => feedsOf(cfg).length > 0;

// ---- iCal (.ics)
const unfold = (t) => t.replace(/\r?\n[ \t]/g, '');
const icsText = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
function icsDate(v, params) {
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { iso: new Date(+y, +mo - 1, +d).toISOString(), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  void params; // floating or TZID times: read as this Mac's local time
  return { iso: new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString(), allDay: false };
}
/** Start times for an event and its repeats (daily, weekly, monthly or yearly), up to six months out. */
export function occurrences(start, rule, now = Date.now()) {
  if (!rule) return [start];
  const r = Object.fromEntries(rule.split(';').map((p) => p.split('=')));
  const step = Math.max(1, Number(r.INTERVAL) || 1);
  const until = r.UNTIL ? new Date(icsDate(r.UNTIL)?.iso || now + HORIZON) : null;
  const max = Number(r.COUNT) || Infinity;
  const stop = Math.min(until ? until.getTime() : Infinity, now + HORIZON);
  const days = r.FREQ === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d.slice(-2))).filter((d) => d >= 0) : null;
  const out = []; let n = 0;
  for (let i = 0; i < 2000 && n < max; i++) {
    const t = new Date(start);
    if (r.FREQ === 'DAILY') t.setDate(t.getDate() + i * step);
    else if (r.FREQ === 'WEEKLY') t.setDate(t.getDate() + i * 7 * step);
    else if (r.FREQ === 'MONTHLY') t.setMonth(t.getMonth() + i * step);
    else if (r.FREQ === 'YEARLY') t.setFullYear(t.getFullYear() + i * step);
    else return [start];
    if (t.getTime() > stop) break;
    const batch = days ? days.map((d) => { const x = new Date(t); x.setDate(t.getDate() - t.getDay() + d); return x; }).filter((x) => x >= start).sort((a, b) => a - b) : [t];
    for (const x of batch) { if (n >= max || x.getTime() > stop) break; n++; if (x.getTime() >= now - 86400000 * 31) out.push(x); }
  }
  return out;
}

export function parseIcs(text) {
  const out = [];
  for (const block of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const f = {};
    for (const line of body.split(/\r?\n/)) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(';');
      f[name.toUpperCase()] = { v: line.slice(i + 1), params };
    }
    const st = f.DTSTART && icsDate(f.DTSTART.v, f.DTSTART.params);
    if (!st) continue;
    const en = f.DTEND && icsDate(f.DTEND.v, f.DTEND.params);
    const base = { title: icsText(f.SUMMARY?.v) || 'Event', allDay: st.allDay, location: icsText(f.LOCATION?.v),
      summary: icsText(f.DESCRIPTION?.v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400), link: icsText(f.URL?.v) || null, image: null, source: 'Calendar' };
    const len = en ? new Date(en.iso) - new Date(st.iso) : 0;
    const skip = new Set(Object.entries(f).filter(([k]) => k === 'EXDATE').flatMap(([, x]) => x.v.split(',')).map((v) => icsDate(v)?.iso).filter(Boolean));
    for (const t of occurrences(new Date(st.iso), f.RRULE?.v)) {
      if (skip.has(t.toISOString())) continue;
      out.push({ ...base, id: `ics-${icsText(f.UID?.v) || st.iso}-${t.toISOString()}`, start: t.toISOString(), end: new Date(t.getTime() + len).toISOString() });
    }
  }
  return out;
}
async function fetchIcs(url, name) {
  const r = await fetch(url.replace(/^webcal:/i, 'https:'), { headers: { 'user-agent': 'Church-Studio' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`That calendar link said ${r.status}.`);
  const text = await r.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That link isn't a calendar feed. Look for an iCal or .ics link.");
  const now = Date.now() - 86400000;
  return parseIcs(text).filter((e) => new Date(e.end).getTime() >= now && new Date(e.start).getTime() <= Date.now() + HORIZON).map((e) => ({ ...e, source: name || 'Calendar' }));
}

export async function refreshEvents() {
  const cfg = await loadConfig();
  const feeds = feedsOf(cfg);
  if (!feeds.length) throw new Error('Add a calendar link first.');
  const events = []; const problems = [];
  for (const f of feeds) {
    try { events.push(...await fetchIcs(f.url, f.name)); } catch (e) { problems.push(`${f.name || 'A calendar'}: ${e.message}`); }
  }
  if (problems.length === feeds.length) throw new Error(problems.join(' '));
  events.sort((a, b) => a.start.localeCompare(b.start));
  const data = { events: events.slice(0, 500), fetched: new Date().toISOString(), source: feeds.map((f) => f.name || 'Calendar').join(', '), problems };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE, JSON.stringify(data));
  await saveConfig({ lastCalendarFetch: data.fetched });
  return data;
}

/** Once a week, quietly. Called at startup and every hour. */
export async function refreshIfDue() {
  const cfg = await loadConfig();
  if (!connected(cfg)) return null;
  const last = cfg.lastCalendarFetch ? new Date(cfg.lastCalendarFetch) : null;
  if (last && last >= lastMondayMorning()) return null;
  return refreshEvents().catch((e) => { console.error('[calendar]', e.message); return null; });
}
