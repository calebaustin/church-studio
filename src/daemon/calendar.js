// Church calendar events from Planning Center (API) or any calendar link (.ics: Subsplash,
// Tithe.ly, Google, Outlook...). Fetched at most once a week: on the first run after Monday 6 AM,
// or when someone presses refresh. Events are cached in data/church-events.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';
import { loadConfig, saveConfig } from './config.js';

const STORE = path.join(DATA_DIR, 'church-events.json');
const PCO = 'https://api.planningcenteronline.com/calendar/v2';

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
export const connected = (cfg) => Boolean((cfg.pcoAppId && cfg.pcoSecret) || cfg.calendarIcal);

async function fetchPco(cfg) {
  const auth = `Basic ${Buffer.from(`${cfg.pcoAppId}:${cfg.pcoSecret}`).toString('base64')}`;
  const out = [];
  let url = `${PCO}/event_instances?filter=future&order=starts_at&include=event&per_page=100`;
  for (let page = 0; url && page < 4; page++) {
    const r = await fetch(url, { headers: { authorization: auth, 'user-agent': 'Church-Studio' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401) throw new Error('Planning Center did not accept that Application ID and Secret.');
    if (!r.ok) throw new Error(`Planning Center said ${r.status}.`);
    const j = await r.json();
    const events = new Map((j.included || []).filter((x) => x.type === 'Event').map((x) => [x.id, x.attributes]));
    for (const it of j.data) {
      const ev = events.get(it.relationships?.event?.data?.id) || {};
      if (cfg.calendarPublicOnly !== false && ev.visible_in_church_center === false) continue;
      out.push({ id: `pco-${it.id}`, title: ev.name || 'Event', start: it.attributes.starts_at, end: it.attributes.ends_at, allDay: Boolean(it.attributes.all_day_event),
        location: it.attributes.location || '', summary: (ev.summary || ev.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
        image: ev.image_url || null, link: it.attributes.church_center_url || null, source: 'Planning Center' });
    }
    url = j.links?.next || null;
    if (out.length && new Date(out.at(-1).start) - Date.now() > 180 * 86400000) break; // six months is plenty
  }
  return out;
}

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
    out.push({ id: `ics-${icsText(f.UID?.v) || st.iso}-${st.iso}`, title: icsText(f.SUMMARY?.v) || 'Event', start: st.iso, end: en?.iso || st.iso, allDay: st.allDay,
      location: icsText(f.LOCATION?.v), summary: icsText(f.DESCRIPTION?.v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400), link: icsText(f.URL?.v) || null, image: null, source: 'Calendar' });
  }
  return out;
}
async function fetchIcs(url) {
  const r = await fetch(url.replace(/^webcal:/i, 'https:'), { headers: { 'user-agent': 'Church-Studio' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`That calendar link said ${r.status}.`);
  const text = await r.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That link isn't a calendar feed. Look for an iCal or .ics link.");
  const now = Date.now() - 86400000;
  return parseIcs(text).filter((e) => new Date(e.end).getTime() >= now);
}

export async function refreshEvents() {
  const cfg = await loadConfig();
  if (!connected(cfg)) throw new Error('Connect Planning Center or a calendar link first.');
  const events = [];
  if (cfg.pcoAppId && cfg.pcoSecret) events.push(...await fetchPco(cfg));
  if (cfg.calendarIcal) events.push(...await fetchIcs(cfg.calendarIcal));
  events.sort((a, b) => a.start.localeCompare(b.start));
  const data = { events: events.slice(0, 400), fetched: new Date().toISOString(), source: [cfg.pcoAppId && 'Planning Center', cfg.calendarIcal && 'Calendar link'].filter(Boolean).join(' and ') };
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
