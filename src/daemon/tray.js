// What the menu bar panel shows: the next seven days, a short checklist, three quick stats, and the thing you
// were last working on. Built from data the app already has; nothing here runs unless the panel asks.
import { loadConfig } from './config.js';
import { cachedEvents } from './calendar.js';
import { listCampaigns } from './campaigns.js';
import { getProject, listProjects } from './projects.js';
import { finder } from './finder.js';
import { contentPlan } from './hub.js';
import * as socialStore from './social/store.js';

const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`;
};

export async function traySummary() {
  const cfg = await loadConfig();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ---- the next seven days: events and posts per day
  const { events } = await cachedEvents();
  const posts = await socialStore.listPosts().catch(() => []);
  const when = (p) => p.scheduledAt || p.plannedAt || p.publishedAt || null;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400_000);
    const k = dayKey(d);
    return {
      date: d.toISOString(), letter: d.toLocaleDateString('en-US', { weekday: 'narrow' }), num: d.getDate(), today: i === 0,
      events: (events || []).filter((e) => dayKey(e.start) === k).map((e) => e.title).slice(0, 3),
      posts: posts.filter((p) => when(p) && dayKey(when(p)) === k).length,
    };
  });
  const next = (events || []).filter((e) => Date.parse(e.start) >= start.getTime()).sort((a, b) => a.start.localeCompare(b.start))[0] || null;

  // ---- quick stats for this week (Sunday to Saturday)
  const weekStart = new Date(start.getTime() - start.getDay() * 86400_000);
  const inWeek = (iso) => iso && Date.parse(iso) >= weekStart.getTime() && Date.parse(iso) < weekStart.getTime() + 7 * 86400_000;
  const posted = posts.filter((p) => p.status === 'published' && inWeek(p.publishedAt)).length;
  const scheduled = posts.filter((p) => p.status === 'scheduled' && Date.parse(p.scheduledAt) >= Date.now()).length;
  let clips = 0;
  const projects = await listProjects().catch(() => []);
  for (const s of projects.slice(0, 20)) {
    const p = await getProject(s.id).catch(() => null);
    for (const c of p?.clips || []) for (const e of c.exports?.length ? c.exports : c.export ? [c.export] : []) if (inWeek(e.at)) clips++;
  }
  const goal = Number(cfg.weeklyGoal) || 5;

  // ---- a short checklist: the latest Sermon's next steps, and the next event that has no posts yet
  const checklist = [];
  const sermon = projects.find((p) => p.isSermon) || projects.find((p) => p.status === 'transcribed');
  if (sermon) {
    const plan = await contentPlan(sermon.id).catch(() => null);
    const pick = ['clips', 'blog', 'social', 'quote'];
    for (const id of pick) {
      const piece = plan?.pieces.find((x) => x.id === id && !x.aside);
      if (!piece) continue;
      const go = id === 'clips' ? { name: 'project', id: sermon.id, step: piece.done ? 'edit' : 'clips' }
        : ['blog', 'social'].includes(id) ? { name: 'writing', project: sermon.id, kind: id }
          : { name: 'project', id: sermon.id, step: 'plan' };
      checklist.push({ id: `${sermon.id}:${id}`, label: piece.label, done: piece.done, go, group: sermon.title });
    }
  }
  const planned = new Set((await listCampaigns().catch(() => [])).map((c) => c.event?.id).filter(Boolean));
  const unplanned = (events || []).filter((e) => Date.parse(e.start) > Date.now() && Date.parse(e.start) < Date.now() + 28 * 86400_000 && !planned.has(e.id)).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (unplanned) checklist.push({ id: `event:${unplanned.id}`, label: `Plan posts for ${unplanned.title}`, done: false, go: { name: 'calendar', campaign: { event: unplanned } }, group: 'Coming up' });

  // ---- jump back in: the most recently edited item in All projects (not trashed or archived)
  const items = (await finder().catch(() => ({ items: [] }))).items.filter((i) => !i.archived && i.updated)
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const top = items[0];
  const goTo = (i) => ({
    sermon: { name: 'project', id: i.id, step: 'plan' }, video: { name: 'project', id: i.id },
    clip: { name: 'project', id: i.projectId, step: 'edit', clip: i.clipId },
    writing: { name: 'writing', project: i.projectId || i.id }, design: { name: 'graphics', design: i.id },
  }[i.type] || { name: 'library' });
  const label = { sermon: 'Sermon', video: 'Video', clip: 'Clip', writing: 'Writing', design: 'Design' };
  const last = top ? { kind: top.type, title: top.name, thumb: top.thumb || null, go: goTo(top), sub: `${label[top.type] || 'Project'} · ${ago(top.updated)}` } : null;

  return {
    church: cfg.churchInfo?.name || '',
    week, next: next ? { title: next.title, start: next.start } : null,
    stats: { posted, goal, scheduled, clips },
    checklist: checklist.slice(0, 5),
    jumpBack: last,
  };
}
