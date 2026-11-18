import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Wand2, Download, CalendarClock, Palette, ArrowRight, Zap, Link2, CheckCircle2, Clock, Hand, Clapperboard, Target, MonitorPlay, Check, Radio } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import AddVideo from '../components/AddVideo.jsx';

const DAY = 86400000;
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
    return Array.from({ length: 7 }, (_, i) => ({ from: s.getTime() + i * DAY, to: s.getTime() + (i + 1) * DAY, label: 'SMTWTFS'[i] }));
  }
  const s = startOfDay(new Date(now.getTime() - 29 * DAY));
  return Array.from({ length: 30 }, (_, i) => ({ from: s.getTime() + i * DAY, to: s.getTime() + (i + 1) * DAY, label: i % 7 === 0 ? new Date(s.getTime() + i * DAY).getDate() : '' }));
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

  const load = useCallback(() => api.get('/api/stats').then(setStats).catch(() => {}), []);
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);
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
    const soon = stats.posts.filter((x) => x.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 2);
    for (const p of soon) {
      items.push({ key: `s${p.id}`, icon: CalendarClock, tone: 'ok', title: p.title || 'Scheduled post', sub: new Date(p.scheduledAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }), go: () => go({ name: 'social' }) });
    }
    const waiting = stats.projects.find((p) => p.status === 'ready');
    if (waiting) items.push({ key: `t${waiting.id}`, icon: Wand2, tone: 'accent', title: 'Ready to transcribe', sub: waiting.title, go: () => go({ name: 'project', id: waiting.id }) });
    for (const p of stats.projects.filter((x) => x.proposed > 0).slice(0, 2)) {
      items.push({ key: `r${p.id}`, icon: Clapperboard, tone: 'accent', title: `${p.proposed} suggested clip${p.proposed === 1 ? '' : 's'} to review`, sub: p.title, go: () => go({ name: 'project', id: p.id }) });
    }
    return items.slice(0, 5);
  }, [stats, jobs]);

  const add = async (body) => {
    setAdding(null);
    setLink('');
    try { const { job } = await api.post('/api/projects', body); trackJob(job); toast({ text: 'Downloading. It’ll show up in Sermons.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };

  const actions = [
    ['New sermon', Plus, () => go({ name: 'library', pick: true })],
    ['Find clips', Wand2, latest ? () => go({ name: 'project', id: latest.id }) : null],
    ['Export', Download, latest ? () => go({ name: 'project', id: latest.id, step: 'edit' }) : null],
    ['Schedule', CalendarClock, () => go({ name: 'social' })],
    ['Themes', Palette, () => go({ name: 'settings', section: 'video-themes' })],
  ];

  const maxBar = Math.max(1, ...(summary?.counts || [1]));
  const maxMin = Math.max(1, ...(summary?.mins || [1]));

  return (
    <div className="page dash">
      <section className="glass strong dash-top">
        <div className="stack" style={{ gap: 18 }}>
          <h1 className="dash-hello">{greeting()}<br />Let's make Sunday count.</h1>
          <div className="goal-card">
            <div className="row between">
              <div className="stack" style={{ gap: 2 }}>
                <strong>{madeThisWeek >= goal ? 'Weekly goal met. Nice work.' : `${madeThisWeek} of ${goal} clips this week`}</strong>
                <span className="muted small">Weekly goal</span>
              </div>
              <button className="goal-icon" title="Change weekly goal" aria-label="Change weekly goal" onClick={() => {
                const v = Number(prompt('How many clips a week?', String(goal)));
                if (v > 0) saveConfig({ weeklyGoal: v });
              }}><Target size={18} /></button>
            </div>
            <div className="meter" style={{ height: 10, marginTop: 10 }}><i style={{ width: `${Math.min(100, (madeThisWeek / goal) * 100)}%`, background: 'var(--accent-2)' }} /></div>
          </div>
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
              <div className="feed-item"><CheckCircle2 size={18} style={{ color: 'var(--ok)' }} /><div className="stack" style={{ gap: 0 }}><strong>All caught up</strong><span className="muted small">Paste a link below to start the next one.</span></div></div>
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
          <form className="dash-input" onSubmit={(e) => { e.preventDefault(); if (link.trim()) setAdding({ url: link.trim() }); }}>
            <Link2 size={16} className="muted" />
            <input placeholder="Paste a YouTube link" value={link} onChange={(e) => setLink(e.target.value)} aria-label="YouTube link" />
            <button className="btn primary sm" disabled={!link.trim()}>Add</button>
          </form>
        </div>
      </section>

      <ChannelFeed onAdd={(v) => setAdding({ url: v.url, title: v.title })} projects={stats?.projects || []} />

      <div className="row between">
        <h2>Summary</h2>
        <div className="seg">
          {[['daily', 'Today'], ['weekly', 'This week'], ['monthly', '30 days']].map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </div>

      <div className="dash-cards">
        <div className="glass dash-card">
          <span className="muted small">Clips made</span>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <Ring value={summary?.exports.length || 0} max={summary?.periodGoal || 1} />
            <strong className="num" style={{ fontSize: 26, marginTop: -26, color: 'var(--ink)' }}>{summary?.exports.length ?? '–'}</strong>
            <span className="muted small num">Goal {summary?.periodGoal ?? '–'}</span>
          </div>
        </div>
        <div className="glass dash-card">
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
        </div>
        <div className="glass dash-card wide">
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
        </div>
      </div>

      {stats?.projects.length > 0 && (
        <>
          <div className="row between"><h2>Recent sermons</h2><button className="btn ghost sm" onClick={() => go({ name: 'library' })}>See all<ArrowRight size={14} /></button></div>
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
