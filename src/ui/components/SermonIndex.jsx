import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, Hash, Layers, MessageSquareQuote, Scissors, Search, TriangleAlert } from 'lucide-react';
import { api, fmt } from '../api.js';
import { useApp } from '../App.jsx';

const TABS = [['stories', 'Illustrations', MessageSquareQuote], ['scripture', 'Scripture', BookOpen], ['themes', 'Themes', Hash], ['series', 'Series', Layers], ['gaps', 'Content gaps', TriangleAlert]];

/** Everything preached, searchable: scripture, stories, recurring themes, series and what's not shared yet. */
export default function SermonIndex() {
  const { go, toast } = useApp();
  const [data, setData] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [tab, setTab] = useState('stories');
  const [sort, setSort] = useState('grade'); // best first, or most recent
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/api/index').then(setData).catch(() => setData({ count: 0, scripture: [], stories: [], themes: [], series: [] })); }, []);
  useEffect(() => { if (tab === 'gaps' && !gaps) api.get('/api/gaps').then(setGaps).catch(() => setGaps({ rows: [] })); }, [tab]);
  const ql = q.trim().toLowerCase();
  const stories = useMemo(() => (data?.stories || []).filter((s) => !ql || s.text.toLowerCase().includes(ql) || s.title.toLowerCase().includes(ql))
    .sort((a, b) => (sort === 'grade' ? (b.grade || 0) - (a.grade || 0) : String(b.date || '').localeCompare(String(a.date || '')) || a.start - b.start)), [data, ql, sort]);
  const clipAt = async (s) => {
    const { clip } = await api.post(`/api/projects/${s.projectId}/clips`, { start: Math.max(0, s.start - 1), end: s.start + 45, title: s.text.split(' ').slice(0, 6).join(' ') });
    go({ name: 'project', id: s.projectId, clip: clip.id });
  };
  if (!data) return <div className="skeleton" style={{ height: 240 }} />;
  if (!data.count) return <div className="glass empty"><BookOpen size={36} /><h3>Nothing to index yet</h3><p>Transcribe a sermon and its scripture, stories and themes show up here.</p></div>;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="tabs" style={{ margin: 0, borderBottom: 0 }}>
          {TABS.map(([k, l, I]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={14} />{l}</button>)}
        </div>
        {tab === 'stories' && <div className="seg sm" role="radiogroup" aria-label="Sort illustrations">{[['grade', 'Best first'], ['recent', 'Most recent']].map(([v, l]) => <button key={v} role="radio" aria-checked={sort === v} className={sort === v ? 'on' : ''} onClick={() => setSort(v)}>{l}</button>)}</div>}
        {tab === 'stories' && <label className="link-field" style={{ maxWidth: 280 }}><Search size={14} className="muted" /><input placeholder="Search stories" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
        {tab === 'gaps' && <button className="btn sm" onClick={async () => { const r = await api.post('/api/gaps/save'); toast({ text: 'Report saved to Downloads.', action: { label: 'Show', run: () => api.post('/api/reveal', { path: r.file }) } }); }}><Download size={13} />Save report</button>}
      </div>

      {tab === 'scripture' && (
        <div className="index-grid">
          {data.scripture.map((b) => (
            <section key={b.book} className="glass panel stack" style={{ gap: 6 }}>
              <div className="row between"><strong>{b.book}</strong><span className="chip">{b.refs.length}</span></div>
              {b.refs.slice(0, 12).map((r, k) => (
                <button key={k} className="index-row" onClick={() => go({ name: 'project', id: r.projectId, step: 'text' })}>
                  <strong className="small">{r.ref}</strong><span className="small muted truncate">{r.title} · {fmt(r.start)}</span>
                </button>
              ))}
            </section>
          ))}
          {!data.scripture.length && <span className="muted">No scripture references found yet.</span>}
        </div>
      )}

      {tab === 'stories' && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">Stories, examples and illustrations from your sermons. Turn one into a clip, or find one you told before.</span>
          {stories.slice(0, 60).map((s, k) => (
            <section key={k} className="glass panel story-row">
              {s.grade != null && <span className={`score story-grade ${s.grade >= 80 ? 'hi' : s.grade >= 60 ? 'mid' : ''}`} title="How vivid and complete this story reads">{s.grade}</span>}
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <p style={{ margin: 0, lineHeight: 1.55 }}>{s.text}</p>
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className="small muted">{s.title} · {fmt(s.start)}</span>
                <button className="btn sm" onClick={() => clipAt(s)}><Scissors size={13} />Make a clip</button>
              </div>
              </div>
            </section>
          ))}
          {!stories.length && <span className="muted">No stories found{ql ? ' for that search' : ''}.</span>}
        </div>
      )}

      {tab === 'themes' && (
        <section className="glass panel stack" style={{ gap: 10 }}>
          <span className="small muted">Topics that come up across your sermons. The more sermons, the bigger the word.</span>
          <div className="theme-cloud">
            {data.themes.map((t) => <span key={t.theme} className="theme-word" style={{ '--w': Math.min(5, t.sermons.length) }} title={t.sermons.map((x) => x.title).join(', ')}>{t.theme}<sup>{t.sermons.length}</sup></span>)}
          </div>
        </section>
      )}

      {tab === 'series' && (
        <div className="index-grid">
          {data.series.map((g) => (
            <section key={g.name} className="glass panel stack" style={{ gap: 6 }}>
              <div className="row between"><strong>{g.name}</strong>{!g.set && <span className="chip warn">Suggested</span>}</div>
              {g.sermons.map((s) => (
                <div key={s.id} className="row between" style={{ gap: 6 }}>
                  <button className="index-row" onClick={() => go({ name: 'project', id: s.id, step: 'plan' })}><span className="small truncate">{s.title}</span></button>
                  {!s.set && <button className="btn ghost sm" onClick={async () => { await api.patch(`/api/projects/${s.id}`, { series: g.name }); setData(await api.get('/api/index')); }}>Add</button>}
                </div>
              ))}
            </section>
          ))}
          {!data.series.length && <span className="muted">No series yet. Set a series on a sermon's Sermon page, or name sermons like "Rooted, Part 2" and they'll be grouped here.</span>}
        </div>
      )}

      {tab === 'gaps' && (
        <section className="glass panel stack" style={{ gap: 6 }}>
          <span className="small muted">Sermons that haven't been turned into other formats yet. Save the report to share with your preacher.</span>
          {!gaps && <div className="skeleton" style={{ height: 120 }} />}
          {gaps?.rows.map((r) => (
            <button key={r.id} className="index-row gap-row" onClick={() => go({ name: 'project', id: r.id, step: 'plan' })}>
              <span className="plan-ring sm" style={{ '--p': r.done / Math.max(1, r.total) }}><strong className="num">{r.done}</strong></span>
              <span className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="truncate">{r.title}</strong><span className="small muted truncate">{r.missing.length ? `Still to make: ${r.missing.slice(0, 5).join(', ')}${r.missing.length > 5 ? '…' : ''}` : 'Everything made'}</span></span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
