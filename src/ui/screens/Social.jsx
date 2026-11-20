import { useCallback, useEffect, useMemo, useState } from 'react';
import ToolIntro from '../components/ToolIntro.jsx';
import { useApp } from '../App.jsx';
import { api, desktop, fmt, openLink } from '../api.js';
import { usePoll } from '../poll.js';
import { ChevronDown, Laptop, MessageSquare, Repeat2, Shapes } from 'lucide-react';
import { exportDesign } from '../design/exporters.js';
import { checkCaption } from '../captionCheck.js';
import Modal from '../components/Modal.jsx';
import CampaignHeader from '../components/CampaignHeader.jsx';
import { EventCard, RefreshEvents, eventTime, useChurchEvents } from '../components/ChurchEvents.jsx';

const STATUS = {
  draft: ['chip', 'Draft'], scheduled: ['chip accent', 'Scheduled'], publishing: ['chip warn', 'Publishing…'],
  published: ['chip ok', 'Published'], partial: ['chip warn', 'Partly published'], failed: ['chip bad', 'Failed'], 'needs-you': ['chip warn', 'Needs you'],
};
const DEST = {
  pending: ['chip', 'Waiting'], publishing: ['chip warn', 'Uploading'], published: ['chip ok', 'Posted'], failed: ['chip bad', 'Failed'],
  ready: ['chip warn', 'Ready for you'], done: ['chip ok', 'Posted'],
};

export function useSocial() {
  const [state, setState] = useState({ platforms: [], accounts: [], posts: [], media: [] });
  const load = useCallback(async () => {
    const [pl, ac, po, me] = await Promise.all([
      api.get('/api/social/platforms'), api.get('/api/social/accounts'), api.get('/api/social/posts'), api.get('/api/social/media'),
    ]);
    setState({ platforms: pl.platforms, accounts: ac.accounts, posts: po.posts, media: me.media });
  }, []);
  useEffect(() => { load(); }, [load]);
  const busy = state.posts.some((p) => p.status === 'publishing' || (p.status === 'scheduled' && new Date(p.scheduledAt) - Date.now() < 60_000));
  usePoll(load, busy ? 2000 : 30000, [busy, load]);
  return { ...state, load };
}

export default function Social({ compose: initialCompose, caption: initialCaption }) {
  const s = useSocial();
  const [tab, setTab] = useState('posts');
  const [composer, setComposer] = useState(initialCompose?.design ? { design: initialCompose.design } : initialCompose?.clipId ? { media: initialCompose } : initialCompose?.projectId ? { projectId: initialCompose.projectId } : initialCaption ? { caption: initialCaption } : null);
  const needsYou = s.posts.filter((p) => p.status === 'needs-you').length;
  const plat = (id) => s.platforms.find((p) => p.id === id);
  return (
    <div className="page">
      <ToolIntro id="social" />
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h1>Social</h1>
          <span className="muted">Post and schedule to your accounts, and answer comments. Plan ahead in Calendar.</span>
        </div>
        <button className="btn primary" onClick={() => setComposer({})}>+ New post</button>
      </div>
      <div className="row between">
        <div className="seg">
          <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Posts{needsYou ? ` · ${needsYou} need you` : ''}</button>
          <button className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>Messages</button>
          <button className={tab === 'accounts' ? 'on' : ''} onClick={() => setTab('accounts')}>Accounts ({s.accounts.length})</button>
        </div>
        <span className="muted small">Scheduled posts go out while the app is open.</span>
      </div>
      {tab === 'posts' && <Posts s={s} plat={plat} onEdit={(p) => setComposer({ post: p })} onConnect={() => setTab('accounts')} onShareAgain={(p) => setComposer({ caption: p.caption, media: p.media, title: p.title, hashtags: p.hashtags })} />}
      {tab === 'accounts' && <Accounts s={s} />}
      {tab === 'messages' && <Messages s={s} plat={plat} />}
      {composer && <Composer s={s} plat={plat} init={composer} onClose={() => { setComposer(null); s.load(); }} onConnect={() => { setComposer(null); setTab('accounts'); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ posts list
function Posts({ s, plat, onEdit, onConnect, onShareAgain }) {
  const groups = [
    ['Needs you', s.posts.filter((p) => p.status === 'needs-you')],
    ['Publishing', s.posts.filter((p) => p.status === 'publishing')],
    ['Scheduled', s.posts.filter((p) => p.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))],
    ['Drafts', s.posts.filter((p) => p.status === 'draft')],
    ['Sent', s.posts.filter((p) => ['published', 'partial', 'failed'].includes(p.status)).sort((a, b) => String(b.publishedAt || b.updated).localeCompare(String(a.publishedAt || a.updated)))],
  ].filter(([, list]) => list.length);
  if (!s.posts.length) {
    return (
      <div className="glass empty">
        <h3>No posts yet</h3>
        <p>{s.accounts.length ? 'Create a post from an exported clip.' : 'Connect an account first, or make a draft to plan ahead.'}</p>
        {!s.accounts.length && <button className="btn primary" onClick={onConnect}>Connect an account</button>}
      </div>
    );
  }
  // Good posts from a while back: most people didn't see them the first time.
  const again = s.posts.filter((p) => ['published', 'partial'].includes(p.status) && p.publishedAt && Date.now() - Date.parse(p.publishedAt) > 90 * 86400000 && p.caption?.length > 40)
    .sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt))).slice(0, 4);
  return (
    <>
      {again.length > 0 && (
        <section className="glass panel stack" style={{ gap: 8 }}>
          <div className="stack" style={{ gap: 2 }}><h3 style={{ margin: 0 }}>Worth sharing again</h3><span className="muted small">Posts from three or more months ago. Most of your people didn’t see them the first time.</span></div>
          {again.map((p) => (
            <div key={p.id} className="insp-row">
              <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{p.title || p.caption.slice(0, 80)}</strong><span className="muted small">Posted {new Date(p.publishedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              <button className="btn sm" onClick={() => onShareAgain(p)}><Repeat2 size={13} />Share again</button>
            </div>
          ))}
        </section>
      )}
      {groups.map(([label, list]) => (
        <section key={label} className="stack">
          <h3>{label}</h3>
          {list.map((p) => <PostRow key={p.id} post={p} s={s} plat={plat} onEdit={onEdit} />)}
        </section>
      ))}
    </>
  );
}

function PostRow({ post, s, plat, onEdit }) {
  const [copied, setCopied] = useState(null);
  const thumb = post.media?.kind === 'image' ? post.media.thumb : s.media.find((m) => m.file === post.media?.file)?.thumb;
  const act = async (fn) => { try { await fn(); } catch (e) { alert(e.message); } s.load(); };
  const caption = (d) => {
    const p = plat(d.platform);
    const tags = (post.hashtags || []).map((h) => `#${h}`).join(' ');
    const text = d.caption ?? [post.caption, tags].filter(Boolean).join('\n\n');
    return p?.captionMax ? text.slice(0, p.captionMax) : text;
  };
  return (
    <div className="glass" style={{ padding: 14, display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 14, alignItems: 'start' }}>
      <div style={{ width: 64, aspectRatio: '9/16', borderRadius: 10, overflow: 'hidden', background: 'var(--hover)' }}>
        {thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row wrap">
          <strong>{post.title || post.caption.slice(0, 60) || 'Untitled post'}</strong>
          <span className={STATUS[post.status]?.[0]}>{STATUS[post.status]?.[1]}</span>
          {post.scheduledAt && post.status === 'scheduled' && <span className="chip">{new Date(post.scheduledAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
          {post.media?.length && <span className="chip">{fmt(post.media.length)}</span>}
        </div>
        {post.caption && <p className="muted small" style={{ whiteSpace: 'pre-wrap', maxHeight: 40, overflow: 'hidden' }}>{post.caption}</p>}
        <div className="stack" style={{ gap: 6 }}>
          {post.destinations.map((d) => {
            const a = s.accounts.find((x) => x.id === d.accountId);
            const p = plat(d.platform);
            return (
              <div key={d.accountId} className="row wrap small">
                <span className="dot" style={{ color: p?.color }} />
                <b>{a?.label || p?.name || d.platform}</b>
                <span className={DEST[d.status]?.[0]}>{d.message || DEST[d.status]?.[1]}</span>
                {d.url && <a href="#" onClick={(e) => { e.preventDefault(); openLink(d.url); }}>View ↗</a>}
                {d.error && <span style={{ color: 'var(--bad)' }}>{d.error.slice(0, 180)}</span>}
                {d.status === 'ready' && (
                  <>
                    <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(caption(d)); setCopied(d.accountId); }}>{copied === d.accountId ? 'Copied ✓' : '1. Copy caption'}</button>
                    {post.media?.file && <button className="btn sm" onClick={() => api.post('/api/social/reveal', { path: post.media.file })}>2. Show {post.media.kind === 'image' ? 'design' : 'video'}</button>}
                    {p?.uploadUrl && <button className="btn sm" onClick={() => openLink(p.uploadUrl)}>3. Open {p.name} ↗</button>}
                    <button className="btn primary sm" onClick={() => act(() => api.post(`/api/social/posts/${post.id}/done/${d.accountId}`, {}))}>Mark posted</button>
                  </>
                )}
              </div>
            );
          })}
          {!post.destinations.length && <span className="muted small">No accounts picked yet.</span>}
        </div>
      </div>
      <div className="stack">
        {['draft', 'scheduled'].includes(post.status) && <button className="btn sm" onClick={() => onEdit(post)}>Edit</button>}
        {['draft', 'scheduled'].includes(post.status) && post.destinations.length > 0 && <button className="btn primary sm" onClick={() => act(() => api.post(`/api/social/posts/${post.id}/publish`))}>Post now</button>}
        {['failed', 'partial'].includes(post.status) && post.destinations.some((d) => d.status === 'failed') && <button className="btn primary sm" onClick={() => act(() => api.post(`/api/social/posts/${post.id}/retry`))}>Retry failed</button>}
        {post.status !== 'publishing' && <button className="btn ghost sm danger" onClick={() => confirm(`Delete “${post.title || 'this post'}” from Church Studio? Anything already posted stays on the platform.`) && act(() => api.del(`/api/social/posts/${post.id}`))}>Delete</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ calendar (full month)
export function Calendar({ s, plat, onEdit, onNew }) {
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState('month'); // 'month' | 'weeks' (this week and next)
  const cal = useChurchEvents();
  const [ev, setEv] = useState(null);
  const [seasons, setSeasons] = useState([]);
  useEffect(() => { api.get('/api/seasons').then((r) => setSeasons(r.seasons)).catch(() => {}); }, []);
  const weeks = view === 'weeks';
  const month = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + (weeks ? 0 : offset)); return d; }, [offset, weeks]);
  const start = useMemo(() => {
    if (weeks) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() + offset * 14); return d; }
    const d = new Date(month); d.setDate(1 - month.getDay()); return d;
  }, [month, offset, weeks]);
  // Step by calendar days, not 24 hours, so a daylight saving change never repeats or skips a date.
  const days = Array.from({ length: weeks ? 14 : 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const go = (v) => { setView(v); setOffset(0); };
  const title = weeks
    ? `${days[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} to ${days[13].toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    : month.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const when = (p) => new Date(p.scheduledAt || p.publishedAt || p.plannedAt || p.created);
  const today = new Date().toDateString();
  const todayStart = new Date(new Date().toDateString());
  return (
    <section className="glass strong panel stack">
      <div className="row between">
        <h3>{title}</h3>
        <div className="row">
          <RefreshEvents cal={cal} />
          <button className="btn icon sm" aria-label={weeks ? 'Previous two weeks' : 'Previous month'} onClick={() => setOffset(offset - 1)}>‹</button>
          {weeks || offset
            ? <button className="btn sm" onClick={() => go('month')}>This month</button>
            : <button className="btn sm" title="Show this week and next with more room" onClick={() => go('weeks')}>This week</button>}
          <button className="btn icon sm" aria-label={weeks ? 'Next two weeks' : 'Next month'} onClick={() => setOffset(offset + 1)}>›</button>
        </div>
      </div>
      <div className={`month-grid ${weeks ? 'weeks' : ''}`}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="month-head">{d}</div>)}
        {days.map((d) => {
          const list = s.posts.filter((p) => (p.status !== 'draft' || p.plannedAt) && when(p).toDateString() === d.toDateString()).sort((a, b) => when(a) - when(b));
          const out = !weeks && d.getMonth() !== month.getMonth();
          const evMax = weeks ? 6 : 2; const postMax = weeks ? 8 : 3;
          const past = d < todayStart;
          const evs = cal.events.filter((e) => new Date(e.start).toDateString() === d.toDateString());
          return (
            <div key={d.toISOString()} className={`month-cell ${out ? 'out' : ''} ${d.toDateString() === today ? 'today' : ''}`}>
              <div className="row between">
                <span className="small num" style={{ fontWeight: 600 }}>{weeks && (d.getDate() === 1 || d === days[0]) ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : d.getDate()}</span>
                {!past && <button className="btn ghost sm" style={{ minHeight: 20, padding: '0 6px' }} aria-label={`Schedule a post on ${d.toDateString()}`} onClick={() => { const t = new Date(d); t.setHours(12, 0, 0, 0); onNew(t); }}>+</button>}
              </div>
              {seasons.filter((x) => new Date(x.date).toDateString() === d.toDateString()).map((x) => <span key={x.id} className="month-season truncate" title={x.name}>{x.name}</span>)}
              {evs.slice(0, evMax).map((e) => (
                <button key={e.id} className="month-event" onClick={() => setEv(e)} title={`${e.title} · ${eventTime(e)}`}>
                  <span className="truncate">{e.allDay ? '' : `${eventTime(e)} `}{e.title}</span>
                </button>
              ))}
              {evs.length > evMax && <span className="muted small">+{evs.length - evMax} events</span>}
              {list.slice(0, postMax).map((p) => (
                <button key={p.id} className={`month-post ${p.status === 'draft' ? 'planned' : ''}`} title={p.status === 'draft' ? `Planned: ${p.title || p.caption}` : undefined} onClick={() => ['draft', 'scheduled'].includes(p.status) && onEdit(p)} title={p.title || p.caption}>
                  <span className="row" style={{ gap: 2 }}>{p.destinations.slice(0, 4).map((x) => <span key={x.accountId} className="dot" style={{ color: plat(x.platform)?.color, width: 6, height: 6 }} />)}</span>
                  <span className="truncate">{when(p).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} {p.title || p.caption}</span>
                </button>
              ))}
              {list.length > postMax && <span className="muted small">+{list.length - postMax} more</span>}
            </div>
          );
        })}
      </div>
      <div className="row wrap" style={{ gap: 14 }}>
        {cal.linked ? <span className="row small muted"><span className="month-event-key" />Church events from {cal.source || 'your calendar'}</span>
          : <span className="small muted">Add your church calendar's iCal link in Settings › Connections to see events here.</span>}
        {s.posts.some((p) => p.status === 'draft' && p.plannedAt) && <span className="row small muted"><span className="month-planned-key" />Planned campaign posts, not scheduled yet</span>}
      </div>
      {ev && <EventCard event={ev} onClose={() => setEv(null)} onPlanPost={(e) => { const t = new Date(e.start); t.setDate(t.getDate() - 2); t.setHours(12, 0, 0, 0); onNew(t < new Date() ? new Date(Date.now() + 3600_000) : t, e); }} />}
    </section>
  );
}

// ------------------------------------------------------------------ messages (YouTube comments)
const READABLE = ['youtube', 'facebook', 'instagram', 'mastodon'];
/** One inbox for comments and mentions from every connected account that allows reading them. */
function Messages({ s, plat }) {
  const [state, setState] = useState({ loading: true });
  const [only, setOnly] = useState('all');
  const sources = s.accounts.filter((a) => READABLE.includes(a.platform));
  const load = () => { setState({ loading: true }); api.get('/api/social/messages').then((r) => setState(r)).catch((e) => setState({ error: e.message })); };
  useEffect(() => { if (sources.length) load(); else setState({}); }, [sources.length]);
  if (!sources.length) return <div className="glass empty"><MessageSquare size={40} /><h3>No message sources yet</h3><p>Connect Instagram, a Facebook Page or YouTube in Accounts. Comments from all of them gather here.</p></div>;
  const list = (state.messages || []).filter((m) => only === 'all' || m.platform === only);
  const platforms = [...new Set((state.messages || []).map((m) => m.platform))];
  return (
    <section className="glass strong panel stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="stack" style={{ gap: 2 }}><h3 style={{ margin: 0 }}>Messages</h3><span className="muted small">Comments and mentions from all your accounts, newest first.</span></div>
        <div className="row" style={{ gap: 6 }}>
          {platforms.length > 1 && <div className="seg sm"><button className={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>All</button>{platforms.map((p) => <button key={p} className={only === p ? 'on' : ''} onClick={() => setOnly(p)}>{plat(p)?.name?.split(' ')[0] || p}</button>)}</div>}
          <button className="btn sm ghost" disabled={state.loading} onClick={load}>Refresh</button>
        </div>
      </div>
      {state.loading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 60 }} />)}
      {state.error && <div className="banner bad">{state.error}</div>}
      {state.problems?.map((p) => <div key={p.account} className="banner warn small">{p.account}: {p.error}</div>)}
      {state.messages && !list.length && <p className="muted">Nothing new.</p>}
      {list.map((m) => (
        <div key={`${m.platform}-${m.id}`} className="feed-item" style={{ alignItems: 'flex-start' }}>
          {m.avatar ? <img src={m.avatar} alt="" width={32} height={32} style={{ borderRadius: '50%' }} /> : <span className="feed-icon" style={{ color: plat(m.platform)?.color }}><MessageSquare size={15} /></span>}
          <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
            <div className="row between" style={{ gap: 8 }}><strong className="truncate">{m.author}</strong><span className="muted small" style={{ flex: 'none' }}>{new Date(m.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></div>
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
            <span className="muted small truncate"><span className="dot" style={{ color: plat(m.platform)?.color, width: 6, height: 6, display: 'inline-block', marginRight: 6 }} />{m.account}{m.replies ? ` · ${m.replies} replies` : ''}</span>
          </div>
          {m.url && <button className="btn sm" onClick={() => openLink(m.url)}>Reply ↗</button>}
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ accounts
const BIG = ['instagram', 'facebook', 'youtube', 'instagram-manual'];

function Accounts({ s }) {
  const [connecting, setConnecting] = useState(null);
  // The big three first; everything else tucked under Other social media.
  const others = s.platforms.filter((p) => !BIG.includes(p.id));
  const act = async (fn) => { try { await fn(); } catch (e) { alert(e.message); } s.load(); };
  return (
    <div className="stack" style={{ gap: 18 }}>
      {s.accounts.length > 0 && (
        <section className="glass strong panel stack">
          <h3>Connected</h3>
          {s.accounts.map((a) => {
            const p = s.platforms.find((x) => x.id === a.platform);
            return (
              <div key={a.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row">
                  <span className="dot" style={{ color: p?.color, width: 10, height: 10 }} />
                  <div className="stack" style={{ gap: 0 }}>
                    <strong>{a.label}</strong>
                    <span className="muted small">{p?.name}{a.handle ? ` · ${a.handle}` : ''}{a.kind === 'manual' ? ' · guided hand-off' : ''}</span>
                  </div>
                  {a.status === 'error' ? <span className="chip bad" title={a.error}>Needs attention</span> : <span className="chip ok">{a.kind === 'manual' ? 'Ready' : 'Connected'}</span>}
                </div>
                <div className="row">
                  {a.status === 'error' && <span className="small" style={{ color: 'var(--bad)', maxWidth: 360 }}>{a.error}</span>}
                  {a.kind === 'api' && <button className="btn sm" onClick={() => act(() => api.post(`/api/social/accounts/${a.id}/verify`))}>Check</button>}
                  {a.url && <button className="btn ghost sm" onClick={() => openLink(a.url)}>Open ↗</button>}
                  <button className="btn ghost sm danger" onClick={() => confirm(`Disconnect ${a.label}? Its saved credentials are removed from this Mac.`) && act(() => api.del(`/api/social/accounts/${a.id}`))}>Disconnect</button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <section className="glass panel stack">
        <h3>Instagram, Facebook and YouTube</h3>
        <p className="muted small">Where most churches post. Connect once and post or schedule straight from this Mac. Keys are stored encrypted.</p>
        <div className="provider-grid">
          {BIG.map((id) => s.platforms.find((p) => p.id === id)).filter(Boolean).map((p) => (
            <div key={p.id} className={`provider ${connecting?.id === p.id ? 'on' : ''}`} onClick={() => (p.kind === 'api' ? setConnecting(p) : act(() => api.post('/api/social/accounts', { platform: p.id })))}>
              <div className="row"><span className="dot" style={{ color: p.color }} /><strong>{p.name}</strong></div>
              <span className="muted small">{p.kind === 'manual' ? 'Post by hand: we copy the caption and open Instagram.' : p.note || `Up to ${Math.round(p.maxSeconds / 60) || 1} min`}</span>
            </div>
          ))}
        </div>
        {connecting?.kind === 'api' && BIG.includes(connecting.id) && <ConnectForm platform={connecting} onDone={() => { setConnecting(null); s.load(); }} />}
      </section>
      <details className="glass panel other-social" open={Boolean(connecting && !BIG.includes(connecting.id))}>
        <summary><span className="stack" style={{ gap: 2 }}><strong>Other social media</strong><span className="muted small">TikTok, X, LinkedIn, Threads, Bluesky, Telegram, Discord and Mastodon.</span></span><ChevronDown size={16} /></summary>
        <div className="stack" style={{ gap: 10, paddingTop: 12 }}>
          <div className="provider-grid">
            {others.map((p) => (
              <div key={p.id} className={`provider ${connecting?.id === p.id ? 'on' : ''}`} onClick={() => (p.kind === 'api' ? setConnecting(p) : act(() => api.post('/api/social/accounts', { platform: p.id })))}>
                <div className="row"><span className="dot" style={{ color: p.color }} /><strong>{p.name}</strong></div>
                <span className="muted small">{p.kind === 'manual' ? 'Post by hand: we copy the caption, show the file and open the site.' : p.note || 'Posts directly'}</span>
              </div>
            ))}
          </div>
          {connecting?.kind === 'api' && !BIG.includes(connecting.id) && <ConnectForm platform={connecting} onDone={() => { setConnecting(null); s.load(); }} />}
        </div>
      </details>
    </div>
  );
}

function ConnectForm({ platform: p, onDone }) {
  const [creds, setCreds] = useState({});
  const [label, setLabel] = useState('');
  const [state, setState] = useState(null);
  const submit = async () => {
    setState({ busy: true });
    try {
      if (p.auth === 'oauth') {
        const { url } = await api.post('/api/social/youtube/auth', { ...creds, label });
        openLink(url);
        setState({ waiting: true });
        const before = (await api.get('/api/social/accounts')).accounts.length;
        for (let i = 0; i < 150; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          if ((await api.get('/api/social/accounts')).accounts.length > before) return onDone();
        }
        setState({ error: 'Still waiting for Google. Finish in the browser, then reopen this page.' });
      } else {
        await api.post('/api/social/accounts', { platform: p.id, label, credentials: creds });
        onDone();
      }
    } catch (e) { setState({ error: e.message }); }
  };
  return (
    <div className="keycard">
      <div className="row between"><h3>Connect {p.name}</h3><button className="btn ghost sm" onClick={() => openLink(p.link)}>Platform docs ↗</button></div>
      <ol className="small">{p.steps.map((x) => {
        const st = typeof x === 'string' ? { text: x } : x;
        return <li key={st.text}>{st.text}{st.link && <> <a href="#" onClick={(e) => { e.preventDefault(); openLink(st.link); }}>Open ↗</a></>}</li>;
      })}</ol>
      <div className="grid2">
        {p.fields.map((f) => (
          <label key={f.key} className="field">{f.label}
            <input className="input mono" type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={creds[f.key] || ''} onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })} />
          </label>
        ))}
        <label className="field">Name in Church Studio <span className="hint">Optional, e.g. “Main church page”</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={state?.busy || state?.waiting || p.fields.some((f) => !String(creds[f.key] || '').trim())} onClick={submit}>
          {p.auth === 'oauth' ? (state?.waiting ? 'Waiting for Google…' : 'Connect with Google') : state?.busy ? 'Checking…' : 'Verify & connect'}
        </button>
        <span className="muted small">{p.auth === 'oauth' ? 'Opens your browser to approve uploads.' : 'Checks the connection without posting anything.'}</span>
      </div>
      {state?.error && <div className="banner">{state.error}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ composer
function CaptionNotes({ text, platforms }) {
  const notes = checkCaption(text, platforms);
  if (!notes.length) return text.trim() ? <span className="chip ok" style={{ justifySelf: 'start' }}><span className="dot" />Caption looks good</span> : null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {notes.map((n) => <span key={n.msg} className={`small ${n.level === 'bad' ? '' : 'muted'}`} style={n.level === 'bad' ? { color: 'var(--bad)' } : undefined}>{n.level === 'bad' ? '✕' : n.level === 'warn' ? '!' : '·'} {n.msg}</span>)}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function Composer({ s, plat, init, onClose, onConnect }) {
  const { go } = useApp();
  const editing = init.post || null;
  const initialMedia = editing?.media || (init.media && s.media.find((m) => m.clipId === init.media.clipId)) || init.media || null;
  const [media, setMedia] = useState(initialMedia);
  const [title, setTitle] = useState(editing?.title ?? init.title ?? initialMedia?.title ?? '');
  const [caption, setCaption] = useState(editing?.caption ?? init.caption ?? initialMedia?.summary ?? '');
  const [tags, setTags] = useState((editing?.hashtags ?? init.hashtags ?? initialMedia?.hashtags ?? []).join(', '));
  const [picked, setPicked] = useState(new Set(editing?.destinations.map((d) => d.accountId) || []));
  const [overrides, setOverrides] = useState(Object.fromEntries((editing?.destinations || []).filter((d) => d.caption != null).map((d) => [d.accountId, d.caption])));
  const [mode, setMode] = useState(editing?.status === 'draft' && !editing.plannedAt ? 'draft' : init.when || editing?.scheduledAt || editing?.plannedAt ? 'schedule' : 'now');
  const [when, setWhen] = useState(localInput(init.when || (editing?.scheduledAt ? new Date(editing.scheduledAt) : editing?.plannedAt && new Date(editing.plannedAt) > new Date() ? new Date(editing.plannedAt) : new Date(Date.now() + 3600_000))));
  const [privacy, setPrivacy] = useState(editing?.options?.youtubePrivacy || 'public');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pickMedia, setPickMedia] = useState(!initialMedia);
  const [pickKind, setPickKind] = useState(init.design || initialMedia?.kind === 'image' ? 'designs' : 'clips');
  const [designs, setDesigns] = useState(null);
  const [fromProject, setFromProject] = useState(init.projectId || '');
  const [preparing, setPreparing] = useState(null);
  useEffect(() => { if (pickMedia && pickKind === 'designs' && !designs) api.get('/api/designs').then((r) => setDesigns(r.designs)).catch(() => setDesigns([])); }, [pickMedia, pickKind]);
  // A design becomes PNG pages in the brand library's Graphics folder, then rides along with the post.
  const chooseDesign = async (d) => {
    setPreparing(d.id); setError(null);
    try {
      const { design } = await api.get(`/api/designs/${d.id}`);
      const out = await exportDesign(design, 'png-all');
      choose({ kind: 'image', file: out.file, designId: d.id, projectId: design.source?.projectId || null, pages: design.pages.length, thumb: d.thumb, title: d.name, summary: '' });
    } catch (e) { setError(e.message); }
    setPreparing(null);
  };
  useEffect(() => { if (init.design && !media) chooseDesign(init.design); }, []);
  // A video or picture made somewhere else. Pictures are copied into the brand library so they show here.
  const fromComputer = async () => {
    setError(null);
    if (!desktop?.pickFiles) { setError('Open Church Studio on your Mac to attach files from your computer.'); return; }
    const [f] = await desktop.pickFiles({ name: 'Videos and pictures', extensions: ['mp4', 'mov', 'm4v', 'png', 'jpg', 'jpeg'], multi: false });
    if (!f) return;
    const name = f.split('/').pop();
    if (/\.(png|jpe?g)$/i.test(f)) {
      setPreparing('file');
      try {
        const r = await api.post('/api/library/import', { paths: [f], folder: 'Graphics' });
        const rel = r.rels?.[0];
        choose({ kind: 'image', file: r.files[0], pages: 1, thumb: rel ? `/library/${rel.split('/').map(encodeURIComponent).join('/')}` : null, title: name.replace(/\.[a-z0-9]+$/i, ''), summary: '' });
      } catch (e) { setError(e.message); }
      setPreparing(null);
    } else {
      choose({ file: f, title: name.replace(/\.[a-z0-9]+$/i, ''), sermon: 'From your computer', length: null, summary: '' });
    }
  };
  const projects = [...new Map(s.media.map((m) => [m.projectId, m.sermon])).entries()];
  const clipList = s.media.filter((m) => !fromProject || m.projectId === fromProject);
  const designList = (designs || []).filter((d) => !fromProject || d.source?.projectId === fromProject);
  const hashtags = tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
  const fullText = [caption.trim(), hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n');

  // Clips picked from a fresh export carry their own title/caption.
  const choose = (m) => {
    setMedia(m);
    setPickMedia(false);
    if (!title) setTitle(m.title);
    if (!caption) setCaption(m.summary || '');
    if (!tags) setTags((m.hashtags || []).join(', '));
  };

  const submit = async (m) => {
    setBusy(true);
    setError(null);
    const body = {
      mode: m, title, caption, hashtags, accountIds: [...picked], captions: overrides,
      scheduledAt: m === 'schedule' ? new Date(when).toISOString() : null,
      media: media ? (media.kind === 'image' ? { kind: 'image', file: media.file, designId: media.designId, projectId: media.projectId, pages: media.pages, thumb: media.thumb } : { file: media.file, projectId: media.projectId, clipId: media.clipId }) : null,
      options: { youtubePrivacy: privacy },
    };
    try {
      if (editing) await api.patch(`/api/social/posts/${editing.id}`, body);
      else await api.post('/api/social/posts', body);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose} width={1000} label={editing ? 'Edit post' : 'New post'}>
        <h2>{editing ? 'Edit post' : 'New post'}</h2>
        {(editing?.campaignId || init.campaignId) && <CampaignHeader campaignId={editing?.campaignId || init.campaignId} postId={editing?.id} onOpenPost={init.onOpenPost} />}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'start' }}>
          <div className="stack">
            <div className="vframe" style={{ width: 200, display: 'grid', placeItems: 'center', color: '#aab', cursor: 'pointer' }} onClick={() => setPickMedia(true)}>
              {media?.thumb ? <img src={media.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: media.kind === 'image' ? 'contain' : 'cover' }} /> : <span className="small" style={{ padding: 10, textAlign: 'center', wordBreak: 'break-word' }}>{preparing ? 'Preparing…' : media ? media.title : 'Nothing attached'}</span>}
            </div>
            <button className="btn sm" onClick={() => setPickMedia(!pickMedia)}>{media ? 'Change' : 'Attach a clip or design'}</button>
            {media && <span className="muted small">{media.kind === 'image' ? `${media.pages > 1 ? `${media.pages} pages` : 'Image'} · ${media.title || 'Design'}` : `${media.length ? `${fmt(media.length)} · ` : ''}${media.sermon || media.title}`}</span>}
          </div>
          <div className="stack">
            {pickMedia && (
              <div className="keycard stack" style={{ gap: 10 }}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <div className="seg sm">
                      <button className={pickKind === 'clips' ? 'on' : ''} onClick={() => setPickKind('clips')}>Clips</button>
                      <button className={pickKind === 'designs' ? 'on' : ''} onClick={() => setPickKind('designs')}>Designs</button>
                    </div>
                    <button className="btn sm" disabled={Boolean(preparing)} onClick={fromComputer}><Laptop size={13} />From your computer</button>
                    {init.event && <button className="btn sm primary" onClick={() => { onClose(); go({ name: 'graphics', event: init.event, eventMode: 'pick' }); }}><Shapes size={13} />Make from template</button>}
                  </div>
                  {projects.length > 1 && (
                    <select className="input" style={{ width: 'auto', maxWidth: 260 }} value={fromProject} onChange={(e) => setFromProject(e.target.value)} aria-label="From project">
                      <option value="">All projects</option>
                      {projects.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                    </select>
                  )}
                </div>
                {pickKind === 'clips' && !clipList.length && <span className="muted small">Export a clip first.</span>}
                {pickKind === 'designs' && designs && !designList.length && <span className="muted small">No designs yet{fromProject ? ' from this project' : ''}. Make one in Design.</span>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, maxHeight: 260, overflow: 'auto' }}>
                  {pickKind === 'clips' && clipList.map((m) => (
                    <button key={m.file} title={m.title} className={`media-pick ${media?.file === m.file ? 'on' : ''}`} onClick={() => choose(m)}>
                      {m.thumb && <img src={m.thumb} alt="" style={{ aspectRatio: '9/16' }} />}
                      <span className="small truncate">{m.title}</span>
                    </button>
                  ))}
                  {pickKind === 'designs' && designList.map((d) => (
                    <button key={d.id} title={d.name} className={`media-pick ${media?.designId === d.id ? 'on' : ''}`} disabled={Boolean(preparing)} onClick={() => chooseDesign(d)}>
                      {d.thumb ? <img src={d.thumb} alt="" style={{ aspectRatio: `${d.size.w}/${d.size.h}`, objectFit: 'contain' }} /> : <span className="media-pick-empty" />}
                      <span className="small truncate">{preparing === d.id ? 'Preparing…' : d.name}</span>
                    </button>
                  ))}
                </div>
                {pickKind === 'designs' && <span className="hint">Designs save as images in your brand library. Share them to accounts you post to by hand.</span>}
                {media && <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => { setMedia(null); setPickMedia(false); }}>Post with nothing attached</button>}
              </div>
            )}
            <label className="field">Title <span className="hint">Used for YouTube and for your own list</span><input className="input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field">Caption<textarea className="input" rows={4} spellCheck value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
            <CaptionNotes text={fullText} platforms={[...picked].map((id) => plat(s.accounts.find((x) => x.id === id)?.platform)).filter(Boolean)} />
            <label className="field">Hashtags <span className="hint">Comma separated</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>

            <div className="stack" style={{ gap: 6 }}>
              <div className="row between"><strong>Post to</strong>{!s.accounts.length && <button className="btn sm" onClick={onConnect}>Connect accounts</button>}</div>
              {s.accounts.map((a) => {
                const p = plat(a.platform);
                const on = picked.has(a.id);
                const text = overrides[a.id] ?? fullText;
                const over = p?.captionMax && text.length > p.captionMax;
                const warns = [];
                if (on && p?.kind === 'api' && media && media.kind !== 'image') {
                  if (media.length > p.maxSeconds) warns.push(`trimmed to ${fmt(p.maxSeconds)}`);
                  if (p.maxBytes && media.bytes > p.maxBytes) warns.push('compressed to fit');
                }
                if (on && p?.kind === 'api' && (!media || media.kind === 'image')) warns.push('needs a video');
                return (
                  <div key={a.id} className="keycard" style={{ padding: 10, gap: 6, opacity: on ? 1 : 0.75 }}>
                    <label className="row">
                      <input type="checkbox" checked={on} onChange={() => { const n = new Set(picked); if (on) n.delete(a.id); else n.add(a.id); setPicked(n); }} />
                      <span className="dot" style={{ color: p?.color }} /><b>{a.label}</b><span className="muted small">{p?.name}{p?.kind === 'manual' ? ' · hand-off' : ''}</span>
                      <span className="grow" />
                      {on && <span className={`small ${over ? '' : 'muted'}`} style={over ? { color: 'var(--bad)' } : undefined}>{text.length}/{p?.captionMax}</span>}
                      {warns.map((w) => <span key={w} className="chip warn">{w}</span>)}
                    </label>
                    {on && a.platform === 'youtube' && (
                      <label className="row small">Visibility
                        <select className="input" style={{ width: 140, height: 30 }} value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                          <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
                        </select>
                      </label>
                    )}
                    {on && (overrides[a.id] != null
                      ? <div className="stack" style={{ gap: 4 }}>
                        <textarea className="input" rows={3} value={overrides[a.id]} onChange={(e) => setOverrides({ ...overrides, [a.id]: e.target.value })} />
                        <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => { const o = { ...overrides }; delete o[a.id]; setOverrides(o); }}>Use the shared caption</button>
                      </div>
                      : <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setOverrides({ ...overrides, [a.id]: fullText })}>Customize caption for {p?.name}</button>)}
                  </div>
                );
              })}
            </div>

            <div className="row between wrap" style={{ marginTop: 6 }}>
              <div className="seg">
                <button className={mode === 'now' ? 'on' : ''} onClick={() => setMode('now')}>Post now</button>
                <button className={mode === 'schedule' ? 'on' : ''} onClick={() => setMode('schedule')}>Schedule</button>
                <button className={mode === 'draft' ? 'on' : ''} onClick={() => setMode('draft')}>Draft</button>
              </div>
              {mode === 'schedule' && <input className="input" type="datetime-local" style={{ width: 230 }} value={when} onChange={(e) => setWhen(e.target.value)} />}
              <button className="btn primary" disabled={busy || (mode !== 'draft' && !picked.size)} onClick={() => submit(mode)}>
                {busy ? 'Saving…' : mode === 'now' ? `Post to ${picked.size} account${picked.size === 1 ? '' : 's'}` : mode === 'schedule' ? 'Schedule' : 'Save draft'}
              </button>
            </div>
            {error && <div className="banner">{error}</div>}
          </div>
        </div>
    </Modal>
  );
}
