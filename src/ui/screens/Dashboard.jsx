import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Wand2, Download, CalendarClock, CalendarDays, Palette, ArrowRight, Zap, Link2, CheckCircle2, Clock, Hand, Clapperboard, Target, MonitorPlay, Check, Radio, PenLine, Shapes, LayoutGrid, Flame, RotateCcw, Lightbulb, Send } from 'lucide-react';
import { isOn } from '../tools.js';
import { nextNote } from '../encourage.js';
import { EventCard, useChurchEvents } from '../components/ChurchEvents.jsx';
import { useApp } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import { usePoll } from '../poll.js';
import AddVideo from '../components/AddVideo.jsx';

const DAY = 86400000;
/** Midnight n calendar days after d (daylight saving safe). */
const dayAt = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = () => { const d = startOfDay(); d.setDate(d.getDate() - d.getDay()); return d; };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}

/** Buckets for the bar chart: today in 2-hour blocks, this week by day, last 30 days by day. */
function buckets(period) {
  const now = new Date();
  if (period === 'daily') {
    const s = startOfDay();
    return Array.from({ length: 12 }, (_, i) => ({ from: s.getTime() + i * 7200000, to: s.getTime() + (i + 1) * 7200000, label: i % 3 === 0 ? `${(i * 2) % 12 || 12}${i * 2 < 12 ? 'a' : 'p'}` : '' }));
  }
  if (period === 'weekly') {
    const s = startOfWeek();
    return Array.from({ length: 7 }, (_, i) => ({ from: dayAt(s, i), to: dayAt(s, i + 1), label: 'SMTWTFS'[i] }));
  }
  const s = startOfDay(new Date(now.getTime() - 29 * DAY));
  return Array.from({ length: 30 }, (_, i) => ({ from: dayAt(s, i), to: dayAt(s, i + 1), label: i % 7 === 0 ? new Date(dayAt(s, i)).getDate() : '' }));
}

function Ring({ value, max, size = 132 }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} aria-hidden="true">
      <path d={`M10 ${size / 2} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2}`} fill="none" stroke="var(--hover)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M10 ${size / 2} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2}`} fill="none" stroke="var(--accent-2)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(c / 2) * pct} ${c}`} style={{ transition: 'stroke-dasharray .8s var(--ease)' }} />
    </svg>
  );
}

export default function Dashboard() {
  const { config, saveConfig, go, jobs, trackJob, onJobFinished, toast } = useApp();
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('weekly');
  const [link, setLink] = useState('');
  const [adding, setAdding] = useState(null);
  const cal = useChurchEvents();
  const [extra, setExtra] = useState({ drafts: [], designs: [] });
  useEffect(() => {
    Promise.all([api.get('/api/writing').catch(() => ({ drafts: [] })), api.get('/api/designs').catch(() => ({ designs: [] }))])
      .then(([w, d]) => setExtra({ drafts: w.drafts || [], designs: d.designs || [] }));
  }, []);
  const [ev, setEv] = useState(null);
  const on = (id) => isOn(config, id);
  const [note] = useState(() => nextNote());

  const load = useCallback(() => api.get('/api/stats').then(setStats).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  usePoll(load, 30000, [load]);
  useEffect(() => onJobFinished(() => load()), [onJobFinished, load]);

  const week = startOfWeek().getTime();
  const goal = Number(config.weeklyGoal) || 5;
  const madeThisWeek = stats ? stats.exports.filter((e) => new Date(e.at) >= week).length : 0;
  const latest = stats?.projects[0];

  const summary = useMemo(() => {
    if (!stats) return null;
    const bs = buckets(period);
    const from = bs[0].from;
    const exports = stats.exports.filter((e) => new Date(e.at).getTime() >= from);
    const posted = stats.posts.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= from && ['published', 'partial', 'needs-you'].includes(p.status));
    const scheduled = stats.posts.filter((p) => p.status === 'scheduled');
    const counts = bs.map((b) => exports.filter((e) => { const t = new Date(e.at).getTime(); return t >= b.from && t < b.to; }).length);
    const minutes = exports.reduce((a, e) => a + (e.length || 0), 0) / 60;
    const mins = bs.map((b) => exports.filter((e) => { const t = new Date(e.at).getTime(); return t >= b.from && t < b.to; }).reduce((a, e) => a + (e.length || 0), 0));
    const periodGoal = period === 'daily' ? Math.max(1, Math.round(goal / 7)) : period === 'weekly' ? goal : goal * 4;
    return { bs, exports, posted, scheduled, counts, minutes, mins, periodGoal };
  }, [stats, period, goal]);

  // "Up next": what needs attention, most useful first.
  const upNext = useMemo(() => {
    if (!stats) return [];
    const items = [];
    for (const j of jobs.filter((x) => x.status === 'running' || x.status === 'queued').slice(0, 3)) {
      items.push({ key: j.id, icon: Zap, tone: 'accent', title: j.label, sub: j.status === 'queued' ? 'Waiting' : j.message, progress: j.progress, go: j.projectId ? () => go({ name: 'project', id: j.projectId }) : null });
    }
    for (const p of stats.posts.filter((x) => x.status === 'needs-you').slice(0, 2)) {
      items.push({ key: p.id, icon: Hand, tone: 'warn', title: `Ready for you to post`, sub: p.title || p.caption?.slice(0, 50), go: () => go({ name: 'social' }) });
    }
    const waiting = stats.projects.find((p) => p.status === 'ready');
    if (waiting) items.push({ key: `t${waiting.id}`, icon: Wand2, tone: 'accent', title: 'Ready to transcribe', sub: waiting.title, go: () => go({ name: 'project', id: waiting.id }) });
    for (const p of stats.projects.filter((x) => x.proposed > 0).slice(0, 2)) {
      items.push({ key: `r${p.id}`, icon: Clapperboard, tone: 'accent', title: `${p.proposed} suggested clip${p.proposed === 1 ? '' : 's'} to review`, sub: p.title, go: () => go({ name: 'project', id: p.id }) });
    }
    return items.filter((it) => on('library') || !['t', 'r'].includes(String(it.key)[0]) || it.icon === CalendarDays).slice(0, 5);
  }, [stats, jobs, cal.events, config.toolsOff]);

  const add = async (body) => {
    setAdding(null);
    setLink('');
    try { const { job } = await api.post('/api/projects', body); trackJob(job); toast({ text: 'Downloading. It’ll show up in Sermons.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };

  // Quick actions for the tools this church uses.
  const actions = [
    ['New video', Plus, () => go({ name: 'library', pick: true }), 'library'],
    ['Find clips', Wand2, latest ? () => go({ name: 'project', id: latest.id }) : null, 'library'],
    ['Write', PenLine, () => go({ name: 'writing' }), 'writing'],
    ['Design', Shapes, () => go({ name: 'graphics' }), 'graphics'],
    ['Plan', CalendarClock, () => go({ name: 'calendar' }), 'calendar'],
    ['Export', Download, latest ? () => go({ name: 'project', id: latest.id, step: 'edit' }) : null, 'library'],
    ['Themes', Palette, () => go({ name: 'settings', section: 'video-themes' }), 'library'],
    ['Find a file', LayoutGrid, () => go({ name: 'projects' }), 'projects'],
  ].filter((a) => on(a[3])).slice(0, 5);

  const maxBar = Math.max(1, ...(summary?.counts || [1]));
  const maxMin = Math.max(1, ...(summary?.mins || [1]));

  return (
    <div className="page dash">
      <section className="glass strong dash-top">
        <div className="stack" style={{ gap: 18 }}>
          <h1 className="dash-hello">{greeting()}<br />Let's make Sunday count.</h1>
          <Streaks stats={stats} extra={extra} />
          <div className="quick">
            {actions.map(([label, Icon, fn]) => (
              <button key={label} className="quick-btn" disabled={!fn} onClick={fn || undefined}>
                <span className="quick-icon"><Icon size={18} /></span>{label}
              </button>
            ))}
          </div>
        </div>

        <div className="upnext glass">
          <div className="row between">
            <span className="chip accent"><Clock size={13} />Up next</span>
            <span className="muted small">{new Date().toLocaleDateString([], { weekday: 'long' })}</span>
          </div>
          <div className="stack" style={{ gap: 8, flex: 1, alignContent: 'start' }}>
            {!stats && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 54 }} />)}
            {stats && !upNext.length && (
              <div className="feed-item"><CheckCircle2 size={18} style={{ color: 'var(--ok)' }} /><div className="stack" style={{ gap: 0 }}><strong>All caught up</strong><span className="muted small">{on('library') ? 'Paste a link below to start the next one.' : 'Nothing waiting on you right now.'}</span></div></div>
            )}
            {upNext.map((it) => (
              <button key={it.key} className="feed-item" onClick={it.go || undefined} disabled={!it.go}>
                <span className={`feed-icon ${it.tone}`}><it.icon size={16} /></span>
                <div className="stack grow" style={{ gap: 2 }}>
                  <strong className="truncate">{it.title}</strong>
                  {it.sub && <span className="muted small truncate">{it.sub}</span>}
                  {it.progress != null && <div className="progress" style={{ marginTop: 4 }}><i style={{ width: `${it.progress}%` }} /></div>}
                </div>
                {it.go && <ArrowRight size={15} className="muted" />}
              </button>
            ))}
          </div>
          {on('library') && (
          <form className="dash-input" onSubmit={(e) => { e.preventDefault(); if (link.trim()) setAdding({ url: link.trim() }); }}>
            <Link2 size={16} className="muted" />
            <input placeholder="Paste a YouTube link" value={link} onChange={(e) => setLink(e.target.value)} aria-label="YouTube link" />
            <button className="btn primary sm" disabled={!link.trim()}>Add</button>
          </form>
          )}
        </div>
      </section>

      <Widgets stats={stats} extra={extra} cal={cal} onEvent={setEv} />

      {on('library') && <ChannelFeed onAdd={(v) => setAdding({ url: v.url, title: v.title })} projects={stats?.projects || []} />}

      {(on('library') || on('social')) && <><div className="row between">
        <h2>Summary</h2>
        <div className="seg">
          {[['daily', 'Today'], ['weekly', 'This week'], ['monthly', '30 days']].map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </div>

      <div className="dash-cards">
        {on('library') && <div className="glass dash-card">
          <span className="muted small">Clips made</span>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <Ring value={summary?.exports.length || 0} max={summary?.periodGoal || 1} />
            <strong className="num" style={{ fontSize: 26, marginTop: -26, color: 'var(--ink)' }}>{summary?.exports.length ?? '–'}</strong>
            <span className="muted small num">Goal {summary?.periodGoal ?? '–'}</span>
          </div>
        </div>}
        {on('social') && <div className="glass dash-card">
          <span className="muted small">Sharing</span>
          <div className="stack" style={{ gap: 12, marginTop: 6 }}>
            {[['Posted', summary?.posted.length, 'var(--accent-2)'], ['Scheduled', summary?.scheduled.length, 'var(--accent)'], ['Clips kept', stats?.kept, 'var(--muted)']].map(([l, v, c]) => (
              <div key={l} className="row between">
                <span className="row small"><span className="dot" style={{ color: c }} />{l}</span>
                <strong className="num" style={{ color: 'var(--ink)' }}>{v ?? '–'}</strong>
              </div>
            ))}
            {stats && stats.accounts === 0 && <button className="btn sm" onClick={() => go({ name: 'social' })}>Connect an account</button>}
          </div>
        </div>}
        {on('library') && <><div className="glass dash-card wide">
          <div className="row between"><span className="muted small">Exports</span><strong className="num" style={{ color: 'var(--ink)' }}>{summary?.exports.length ?? '–'}</strong></div>
          <div className="bars" aria-hidden="true">
            {summary?.counts.map((n, i) => (
              <div key={i} className="bar-col">
                <i style={{ height: `${Math.max(4, (n / maxBar) * 100)}%`, opacity: n ? 1 : 0.35 }} />
                <span>{summary.bs[i].label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dash-card dark">
          <span className="small" style={{ opacity: 0.75 }}>Sermon shared</span>
          <svg viewBox="0 0 120 50" style={{ width: '100%', height: 56 }} aria-hidden="true" preserveAspectRatio="none">
            <polyline fill="none" stroke="var(--accent-2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              points={(summary?.mins || [0, 0]).map((m, i, a) => `${(i / Math.max(1, a.length - 1)) * 116 + 2},${46 - (m / maxMin) * 40}`).join(' ')} />
          </svg>
          <strong className="num" style={{ fontSize: 26 }}>{summary ? (summary.minutes < 10 ? summary.minutes.toFixed(1) : Math.round(summary.minutes)) : '–'} min</strong>
        </div></>}
      </div></>}

      {on('library') && stats?.projects.length > 0 && (
        <>
          <div className="row between"><h2>Recent projects</h2><button className="btn ghost sm" onClick={() => go({ name: 'library' })}>See all<ArrowRight size={14} /></button></div>
          <div className="projects">
            {stats.projects.slice(0, 3).map((p) => (
              <div key={p.id} className="glass card" onClick={() => go({ name: 'project', id: p.id })}>
                <div style={{ padding: 8 }}><div className="thumb"><img src={p.thumbnail || media(p.id, 'poster.jpg')} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></div></div>
                <div className="body">
                  <div className="title">{p.title}</div>
                  <div className="row wrap">
                    {p.duration && <span className="chip num">{fmt(p.duration)}</span>}
                    {p.clips > 0 && <span className="chip accent">{p.clips} clips</span>}
                    {p.exported > 0 && <span className="chip ok">{p.exported} exported</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {adding && <AddVideo url={adding.url} onClose={() => setAdding(null)} onAdd={add} />}
      <p className="dash-note">{note}</p>
      {ev && <EventCard event={ev} onClose={() => setEv(null)} onPlanPost={on('social') ? () => go({ name: 'social' }) : null} />}
    </div>
  );
}

/** Latest long videos from the church's channel: likely services to clip. */
function ChannelFeed({ onAdd, projects }) {
  const { config, go } = useApp();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!config.youtubeChannel) return;
    api.get('/api/youtube/channel').then((r) => setItems(r.items.filter((v) => !v.duration || v.duration >= 15 * 60).slice(0, 4))).catch((e) => setError(e.message));
  }, [config.youtubeChannel]);
  if (!config.youtubeChannel) {
    return (
      <section className="glass panel row between wrap">
        <div className="row"><span className="feed-icon"><MonitorPlay size={16} /></span><div className="stack" style={{ gap: 0 }}><strong>See your latest services here</strong><span className="muted small">Add your YouTube channel once.</span></div></div>
        <button className="btn sm" onClick={() => go({ name: 'settings', section: 'youtube' })}>Add channel</button>
      </section>
    );
  }
  const have = new Set(projects.map((p) => p.youtubeId).filter(Boolean));
  return (
    <>
      <div className="row between">
        <h2>From your channel</h2>
        <button className="btn ghost sm" onClick={() => go({ name: 'library', pick: true })}>See all<ArrowRight size={14} /></button>
      </div>
      {error && <div className="banner">{error}</div>}
      <div className="channel-grid">
        {!items && !error && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '16/12' }} />)}
        {items?.map((v) => (
          <div key={v.id} className="glass card" onClick={() => !have.has(v.id) && onAdd(v)}>
            <div style={{ padding: 8 }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <img src={v.thumb} alt="" loading="lazy" />
                {v.duration && <span className="chip num" style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,.7)', color: '#fff' }}>{fmt(v.duration)}</span>}
              </div>
            </div>
            <div className="body">
              <div className="title">{v.title}</div>
              <div className="row between">
                {v.live ? <span className="chip accent"><Radio size={12} />Livestream</span> : <span />}
                {have.has(v.id) ? <span className="chip ok"><Check size={12} />Added</span> : <button className="btn primary sm" onClick={(e) => { e.stopPropagation(); onAdd(v); }}>Clip this</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- streaks
const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x.getTime(); };
/** Weeks in a row (ending this week or last week) with at least one of these dates. */
function streak(dates) {
  const weeks = new Set(dates.filter(Boolean).map((d) => weekStart(d)));
  let w = weekStart(new Date());
  const back = (t) => weekStart(t - 3 * DAY); // the week before, safe across daylight saving
  if (!weeks.has(w)) w = back(w); // this week isn't over yet
  let n = 0;
  while (weeks.has(w)) { n++; w = back(w); }
  return n;
}

function Streaks({ stats, extra }) {
  const { config, go } = useApp();
  if (!stats) return <div className="goal-card"><div className="skeleton" style={{ height: 44 }} /></div>;
  const month = Date.now() - 30 * DAY;
  const n = (dates) => dates.filter((t) => t && Date.parse(t) > month).length;
  const kinds = [
    isOn(config, 'library') && ['clips', n(stats.exports.map((e) => e.at))],
    isOn(config, 'social') && ['posts', n(stats.posts.filter((p) => p.publishedAt).map((p) => p.publishedAt))],
    isOn(config, 'writing') && ['written', n(extra.drafts.map((d) => d.updated))],
    isOn(config, 'graphics') && ['designs', n(extra.designs.map((d) => d.updated))],
  ].filter(Boolean);
  const total = kinds.reduce((a, k) => a + k[1], 0);
  return (
    <div className="goal-card">
      <div className="row between" style={{ gap: 10 }}>
        <div className="stack" style={{ gap: 2 }}>
          <strong>{total ? `${total} things made in the last month` : 'Make one thing this month to get started.'}</strong>
          <span className="muted small">Your activity</span>
        </div>
        <button className="goal-icon" aria-label="See your activity" title="See your activity" onClick={() => go({ name: 'me', section: 'activity' })}><Flame size={18} /></button>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
        {kinds.map(([k, v]) => <span key={k} className={`chip ${v ? 'accent' : ''}`}><span className="num">{v}</span> {k}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- widgets
const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };

/**
 * Personal widgets: upcoming events, scheduled posts, work to jump back into, and ideas.
 * They're ordered by what this church makes most, so the dashboard leans toward its real work.
 */
function Widgets({ stats, extra, cal, onEvent }) {
  const { config, go } = useApp();
  if (!stats) return null;
  const month = Date.now() - 30 * DAY;
  const use = {
    events: 2 + (cal.linked ? 3 : -9),
    scheduled: stats.posts.filter((p) => Date.parse(p.created || 0) > month).length + (isOn(config, 'social') ? 1 : -9),
    jump: extra.drafts.filter((d) => Date.parse(d.updated || 0) > month).length + extra.designs.filter((d) => Date.parse(d.updated || 0) > month).length + stats.exports.filter((e) => Date.parse(e.at) > month).length,
    ideas: 1.5,
  };
  const events = cal.events.filter((e) => new Date(e.end || e.start) >= new Date()).slice(0, 4);
  const scheduled = stats.posts.filter((p) => p.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 4);
  const jump = [
    ...extra.drafts.map((d) => ({ key: `w${d.id}`, icon: PenLine, title: d.title, sub: `Writing · ${ago(d.updated)}`, at: d.updated, go: { name: 'writing', project: d.id } })),
    ...extra.designs.map((d) => ({ key: `d${d.id}`, icon: Shapes, title: d.name, sub: `Design · ${ago(d.updated)}`, at: d.updated, go: { name: 'graphics', design: d.id } })),
    ...stats.projects.filter((p) => p.status !== 'transcribed' || p.proposed > 0).map((p) => ({ key: `p${p.id}`, icon: Clapperboard, title: p.title, sub: p.proposed ? `${p.proposed} clips to review` : 'Not transcribed yet', at: p.updated || p.created, go: { name: 'project', id: p.id } })),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 4);
  const written = new Set(extra.drafts.map((d) => d.id));
  const postedThisWeek = stats.posts.some((p) => p.publishedAt && Date.parse(p.publishedAt) > startOfWeek().getTime());
  const ideas = [
    ...stats.projects.filter((p) => p.status === 'transcribed' && !written.has(p.id) && isOn(config, 'writing')).slice(0, 1).map((p) => ({ key: `iw${p.id}`, icon: PenLine, title: 'Turn a video into a blog', sub: `“${p.title}” has a transcript ready.`, go: { name: 'writing', project: p.id } })),
    ...(!postedThisWeek && isOn(config, 'social') && isOn(config, 'graphics') ? [{ key: 'ic', icon: Shapes, title: "You haven't posted this week", sub: 'Make a carousel from a template.', go: { name: 'graphics' } }] : []),
    ...(events[0] && isOn(config, 'graphics') ? [{ key: 'ie', icon: CalendarDays, title: `Promote ${events[0].title}`, sub: 'Make an event graphic in one click.', go: { name: 'graphics', event: events[0] } }] : []),
    ...(stats.exports[0] && isOn(config, 'social') ? [{ key: 'ip', icon: Send, title: 'Share your latest clip', sub: stats.exports[0].title, go: { name: 'social', compose: { projectId: stats.exports[0].projectId, clipId: stats.exports[0].clipId } } }] : []),
  ].slice(0, 3);
  const cards = [
    events.length > 0 && ['events', use.events, (
      <div key="events" className="glass dash-widget">
        <div className="row between"><span className="eyebrow"><CalendarDays size={13} /> Coming up</span><button className="btn ghost sm" onClick={() => go({ name: 'calendar' })}>Calendar<ArrowRight size={13} /></button></div>
        {events.map((e) => (
          <button key={e.id} className="feed-item" onClick={() => onEvent(e)}>
            <span className="date-tile"><span>{new Date(e.start).toLocaleDateString([], { month: 'short' })}</span><strong>{new Date(e.start).getDate()}</strong></span>
            <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="truncate">{e.title}</strong><span className="muted small truncate">{e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>
          </button>
        ))}
      </div>
    )],
    scheduled.length > 0 && ['scheduled', use.scheduled, (
      <div key="scheduled" className="glass dash-widget">
        <div className="row between"><span className="eyebrow"><CalendarClock size={13} /> Scheduled</span><button className="btn ghost sm" onClick={() => go({ name: 'social' })}>Social<ArrowRight size={13} /></button></div>
        {scheduled.map((p) => (
          <button key={p.id} className="feed-item" onClick={() => go({ name: 'social' })}>
            <span className="feed-icon ok"><Send size={15} /></span>
            <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="truncate">{p.title || p.caption || 'Post'}</strong><span className="muted small">{new Date(p.scheduledAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>
          </button>
        ))}
      </div>
    )],
    jump.length > 0 && ['jump', use.jump, (
      <div key="jump" className="glass dash-widget">
        <span className="eyebrow"><RotateCcw size={13} /> Jump back in</span>
        {jump.map((j) => (
          <button key={j.key} className="feed-item" onClick={() => go(j.go)}>
            <span className="feed-icon"><j.icon size={15} /></span>
            <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="truncate">{j.title}</strong><span className="muted small truncate">{j.sub}</span></div>
            <ArrowRight size={14} className="muted" />
          </button>
        ))}
      </div>
    )],
    ideas.length > 0 && ['ideas', use.ideas, (
      <div key="ideas" className="glass dash-widget idea-widget">
        <span className="eyebrow"><Lightbulb size={13} /> Ideas for you</span>
        {ideas.map((x) => (
          <button key={x.key} className="feed-item" onClick={() => go(x.go)}>
            <span className="feed-icon accent"><x.icon size={15} /></span>
            <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="truncate">{x.title}</strong><span className="muted small truncate">{x.sub}</span></div>
            <ArrowRight size={14} className="muted" />
          </button>
        ))}
      </div>
    )],
  ].filter(Boolean).sort((a, b) => b[1] - a[1]);
  if (!cards.length) return null;
  return <div className="dash-widgets">{cards.map((c) => c[2])}</div>;
}
