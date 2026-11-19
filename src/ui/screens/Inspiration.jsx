// Inspiration: what your church has been saying, what it hasn't said in a while, what's coming up,
// and ideas for the blog. All worked out on this Mac.
import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, ExternalLink, Lightbulb, PenLine, RefreshCw, Rss, Send, Shapes, Sparkles, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, openLink } from '../api.js';
import { yearReviewDoc } from '../design/yearReview.js';
import { Masonry } from '../components/Masonry.jsx';

const PERIODS = [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All time']];
const KIND = { sermon: 'sermon', writing: 'writing', post: 'post', blog: 'blog post' };
const day = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export default function Inspiration() {
  const { go, toast, config } = useApp();
  const [period, setPeriod] = useState('quarter');
  const [data, setData] = useState(null);
  const [blogUrl, setBlogUrl] = useState(config.churchInfo?.website || '');
  const [syncing, setSyncing] = useState(false);
  const [making, setMaking] = useState(false);
  const load = () => api.get(`/api/inspiration?period=${period}`).then(setData).catch(() => setData(null));
  useEffect(() => { setData(null); load(); }, [period]);

  const writeAbout = async (title) => {
    const { id } = await api.post('/api/writing', { type: 'blank', title });
    go({ name: 'writing', project: id });
  };
  const syncBlog = async (url) => {
    setSyncing(true);
    try { const r = await api.post('/api/blog/sync', url ? { url } : {}); toast({ text: r.added ? `Found ${r.added} new post${r.added === 1 ? '' : 's'} on your blog.` : 'Your blog is up to date.' }); await load(); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setSyncing(false);
  };
  const yearReview = async () => {
    setMaking(true);
    try {
      const now = new Date();
      const year = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear(); // January and February look back
      const stats = await api.get(`/api/inspiration/year?year=${year}`);
      const c = [...(config.brandColors || [])]; const fb = ['#2B7F5F', '#D9A441', '#1B2440', '#F4EFE6', '#8FB8A8']; while (c.length < 5) c.push(fb[c.length]);
      const f = config.brandFonts || { heading: 'Montserrat', body: 'Montserrat' };
      const doc = yearReviewDoc(stats, { c, h: f.heading, b: f.body }, { church: config.churchInfo?.name || '', logo: config.appLogo || '' });
      await api.put(`/api/designs/${doc.id}`, doc);
      go({ name: 'graphics', design: doc.id });
    } catch (e) { toast({ kind: 'error', text: e.message }); setMaking(false); }
  };

  const c = data?.counts;
  const empty = data && !c.total;
  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h1>Inspiration</h1>
          <span className="muted">What your church has been saying, what it hasn’t said in a while, and what’s coming up.</span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
          <button className="btn" disabled={making} onClick={yearReview}><Sparkles size={15} />{making ? 'Making it…' : 'Year in review'}</button>
        </div>
      </div>

      {!data && <div className="insp-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</div>}

      {data && (
        <>
          <section className="glass strong panel stack" style={{ gap: 12 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <h2 className="row" style={{ gap: 8 }}><Lightbulb size={20} />What you’ve been saying</h2>
              {!empty && <span className="muted small">From {[c.sermons && `${c.sermons} sermon${c.sermons === 1 ? '' : 's'}`, c.blog && `${c.blog} blog post${c.blog === 1 ? '' : 's'}`, c.writing && `${c.writing} piece${c.writing === 1 ? '' : 's'} of writing`, c.posts && `${c.posts} social post${c.posts === 1 ? '' : 's'}`].filter(Boolean).join(', ')}</span>}
            </div>
            {empty ? (
              <p className="muted" style={{ margin: 0 }}>Nothing from this stretch yet. Transcribe a sermon, connect your blog below, or pick a longer time.</p>
            ) : (
              <div className="word-cloud">
                {data.words.map((w, i) => <span key={w.word} className="word-chip" style={{ fontSize: `${Math.max(13, 26 - i * 0.6)}px`, opacity: Math.max(0.55, 1 - i * 0.02) }} title={`In ${w.pieces} pieces`}>{w.word}</span>)}
              </div>
            )}
          </section>

          <Masonry className="insp-grid">
            <section className="glass panel stack" style={{ gap: 10 }}>
              <h2>Blind spots</h2>
              <span className="muted small">Topics most churches come back to that haven’t come up {period === 'all' ? 'yet' : `this ${period}`}.</span>
              {empty && <span className="muted small">These show up once there’s something to look at.</span>}
              {!empty && !data.blindSpots.length && <span className="small">You’ve covered every topic on the list. Well done.</span>}
              {!empty && data.blindSpots.map((t) => (
                <div key={t.id} className="insp-row">
                  <div className="stack grow" style={{ gap: 0, minWidth: 0 }}>
                    <strong className="small">{t.label}</strong>
                    <span className="muted small truncate">{t.last ? `Last: ${day(t.last.date)}, in a ${KIND[t.last.kind]} “${t.last.title}”` : 'Not mentioned yet'}</span>
                  </div>
                  <button className="btn sm" onClick={() => writeAbout(t.label)}><PenLine size={13} />Write</button>
                </div>
              ))}
            </section>

            <section className="glass panel stack" style={{ gap: 10 }}>
              <h2>Coming up</h2>
              <span className="muted small">Church seasons in the next three months. Start about three weeks ahead.</span>
              {data.seasons.slice(0, 5).map((s) => (
                <div key={s.id + s.date} className="insp-season">
                  <div className="insp-date"><strong>{new Date(s.date).toLocaleDateString('en-US', { day: 'numeric' })}</strong><span>{new Date(s.date).toLocaleDateString('en-US', { month: 'short' })}</span></div>
                  <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}><strong className="small">{s.name}</strong><span className={`chip ${s.days <= 21 ? 'warn' : ''}`}>{s.days === 0 ? 'Today' : s.days === 1 ? 'Tomorrow' : `In ${s.days} days`}</span></span>
                    <span className="muted small">{s.idea}</span>
                    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                      <button className="btn sm" onClick={() => go({ name: 'graphics' })}><Shapes size={13} />Design</button>
                      <button className="btn sm" onClick={() => writeAbout(s.name)}><PenLine size={13} />Write</button>
                      <button className="btn sm" onClick={() => go({ name: 'social' })}><CalendarDays size={13} />Plan posts</button>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <BlogPanel data={data} blogUrl={blogUrl} setBlogUrl={setBlogUrl} syncing={syncing} syncBlog={syncBlog} writeAbout={writeAbout} reload={load} />

            <section className="glass panel stack" style={{ gap: 10 }}>
              <h2 className="row" style={{ gap: 8 }}><BookOpen size={18} />Scripture balance</h2>
              {!data.scripture.total ? <span className="muted small">Scripture references show up here as sermons and writing mention them.</span> : (
                <>
                  <div className="balance" aria-label={`${data.scripture.ot} Old Testament, ${data.scripture.nt} New Testament`}>
                    <span style={{ flex: data.scripture.ot || 0.0001 }} className="ot" /><span style={{ flex: data.scripture.nt || 0.0001 }} className="nt" />
                  </div>
                  <div className="row between small"><span>Old Testament · {data.scripture.ot}</span><span>New Testament · {data.scripture.nt}</span></div>
                  <span className="muted small">{data.scripture.gospels} from the Gospels.{data.scripture.ot === 0 ? ' The Old Testament hasn’t come up in this stretch.' : ''}</span>
                  <div className="row wrap" style={{ gap: 6 }}>{data.scripture.books.map((b) => <span key={b.book} className="chip">{b.book} · {b.n}</span>)}</div>
                </>
              )}
            </section>
          </Masonry>

          <section className="glass panel stack" style={{ gap: 10 }}>
            <h2>Topics you return to</h2>
            <div className="topic-bars">
              {data.topics.filter((t) => t.hits).sort((a, b) => b.hits - a.hits).slice(0, 12).map((t) => (
                <div key={t.id} className="topic-bar"><span className="small truncate">{t.label}</span><span className="bar"><i style={{ width: `${Math.round(t.share * 100)}%` }} /></span><span className="small muted num">{t.hits}</span></div>
              ))}
              {!data.topics.some((t) => t.hits) && <span className="muted small">Nothing to show for this stretch yet.</span>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function BlogPanel({ data, blogUrl, setBlogUrl, syncing, syncBlog, writeAbout, reload }) {
  const { go } = useApp();
  const b = data.blog;
  if (!b) {
    return (
      <section className="glass panel stack" style={{ gap: 10 }}>
        <h2 className="row" style={{ gap: 8 }}><Rss size={18} />Your blog</h2>
        <span className="muted small">Connect your blog to see how often you post, what it’s about, and ideas for the next post. Church Studio reads its public feed.</span>
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (blogUrl.trim()) syncBlog(blogUrl); }}>
          <input className="input grow" value={blogUrl} placeholder="yourchurch.org/blog" onChange={(e) => setBlogUrl(e.target.value)} />
          <button className="btn primary" disabled={syncing || !blogUrl.trim()}><Rss size={14} />{syncing ? 'Reading…' : 'Connect'}</button>
        </form>
      </section>
    );
  }
  const max = Math.max(1, ...b.months.map((m) => m.n));
  return (
    <section className="glass panel stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 6 }}>
        <h2 className="row" style={{ gap: 8 }}><Rss size={18} />Your blog</h2>
        <div className="row" style={{ gap: 4 }}>
          <button className="rt-btn" title="Check for new posts" aria-label="Check for new posts" disabled={syncing} onClick={() => syncBlog()}><RefreshCw size={14} className={syncing ? 'spin' : ''} /></button>
          <button className="rt-btn" title="Disconnect blog" aria-label="Disconnect blog" onClick={async () => { await api.post('/api/blog/forget', {}); reload(); }}><X size={14} /></button>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 0 }}><strong className="num" style={{ fontSize: 22 }}>{b.perMonth}</strong><span className="muted small">posts a month</span></div>
        <div className="stack" style={{ gap: 0 }}><strong className="num" style={{ fontSize: 22 }}>{b.daysSince ?? '–'}</strong><span className="muted small">days since the last</span></div>
        <div className="stack" style={{ gap: 0 }}><strong className="num" style={{ fontSize: 22 }}>{b.total}</strong><span className="muted small">posts saved</span></div>
      </div>
      <div className="spark" aria-label="Posts per month for the last year">{b.months.map((m) => <span key={m.key} title={`${m.label}: ${m.n}`} style={{ height: `${Math.max(4, (m.n / max) * 100)}%` }} className={m.n ? '' : 'none'} />)}</div>
      <span className="eyebrow">Ideas for the next post</span>
      {data.ideas.unblogged.slice(0, 3).map((s) => (
        <div key={s.id} className="insp-row">
          <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">Recap “{s.title}”</strong><span className="muted small">Sermon from {day(s.date)} without a blog post yet</span></div>
          <button className="btn sm" onClick={() => go({ name: 'writing', project: s.id, kind: 'blog' })}><PenLine size={13} />Write</button>
        </div>
      ))}
      {data.blindSpots.slice(0, 2).map((t) => (
        <div key={t.id} className="insp-row">
          <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small">A post about {t.label.toLowerCase()}</strong><span className="muted small">It hasn’t come up lately</span></div>
          <button className="btn sm" onClick={() => writeAbout(t.label)}><PenLine size={13} />Write</button>
        </div>
      ))}
      {data.ideas.evergreen.slice(0, 2).map((p) => (
        <div key={p.link} className="insp-row">
          <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">Share again: {p.title}</strong><span className="muted small">From {day(p.date)}. Still worth reading.</span></div>
          <button className="btn sm" onClick={() => go({ name: 'social', caption: `${p.title}\n\n${p.link}` })}><Send size={13} />Post</button>
        </div>
      ))}
      <span className="eyebrow">Recent posts</span>
      {b.recent.slice(0, 4).map((p) => (
        <button key={p.link} className="insp-link" onClick={() => openLink(p.link)}><span className="small truncate grow">{p.title}</span><span className="muted small">{day(p.date)}</span><ExternalLink size={12} /></button>
      ))}
    </section>
  );
}
