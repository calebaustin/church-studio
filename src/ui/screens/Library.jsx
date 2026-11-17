import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, desktop, fmt, media } from '../api.js';

export default function Library() {
  const { go, trackJob, onJobFinished, config } = useApp();
  const [projects, setProjects] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(false);

  const load = () => api.get('/api/projects').then((r) => setProjects(r.projects));
  useEffect(() => { load(); }, []);
  useEffect(() => onJobFinished((j) => {
    if (['download', 'import'].includes(j.kind)) load();
    if (j.status === 'done' && j.result?.projectId && j.kind === 'import') go({ name: 'project', id: j.result.projectId });
  }), [onJobFinished]);

  const add = async (body) => {
    setError(null);
    try {
      const { job } = await api.post('/api/projects', body);
      trackJob(job);
      setUrl('');
      setPicker(false);
      setTimeout(load, 1500);
    } catch (e) { setError(e.message); }
  };
  const openFile = async () => {
    const file = await desktop?.pickVideo();
    if (file) add({ file });
  };

  return (
    <div className="page">
      <section className="glass strong hero">
        <div>
          <h1>Turn Sunday's sermon into clips worth sharing.</h1>
          <p>Pick a service from your channel. We'll find the sermon, suggest the strongest moments, and export
            vertical videos with live captions — all on this Mac.</p>
        </div>
        <div className="dropzone">
          <button className="btn primary" style={{ height: 46, fontSize: 15 }} onClick={() => setPicker(true)}>
            Pick from {config.youtubeChannel ? 'your channel' : 'a channel'}
          </button>
          <div className="row">
            <input className="input" placeholder="…or paste a YouTube link" value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && add({ url: url.trim() })} />
            <button className="btn" disabled={!url.trim()} onClick={() => add({ url: url.trim() })}>Add</button>
          </div>
          {desktop?.pickVideo && <button className="btn ghost" onClick={openFile}>Open a video file from this Mac…</button>}
          {error && <div className="banner">{error}</div>}
        </div>
      </section>

      <div className="row between">
        <h2>Your sermons</h2>
        <span className="muted small">{projects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      {projects && !projects.length && (
        <div className="glass empty">
          <h3>No sermons yet</h3>
          <p>Pick one from your channel above to get started.</p>
        </div>
      )}
      <div className="projects">
        {projects?.map((p) => (
          <div key={p.id} className="glass card" onClick={() => go({ name: 'project', id: p.id })}>
            <div style={{ padding: 8 }}>
              <div className="thumb">
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : p.status !== 'downloading' ? <img src={media(p.id, 'poster.jpg')} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : 'Downloading…'}
              </div>
            </div>
            <div className="body">
              <div className="title">{p.title}</div>
              <div className="row wrap">
                <StatusChip status={p.status} />
                {p.duration && <span className="chip">{fmt(p.duration)}</span>}
                {p.clips > 0 && <span className="chip accent">{p.clips} clips</span>}
                {p.exported > 0 && <span className="chip ok">{p.exported} exported</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {picker && <ChannelPicker onClose={() => setPicker(false)} onAdd={(v) => add({ url: v.url, title: v.title })} />}
    </div>
  );
}

export function StatusChip({ status }) {
  const map = {
    new: ['chip', 'New'], downloading: ['chip warn', 'Downloading'], ready: ['chip accent', 'Ready to transcribe'], transcribed: ['chip ok', 'Transcribed'],
  };
  const [cls, label] = map[status] || ['chip', status];
  return <span className={cls}>{label}</span>;
}

function ChannelPicker({ onClose, onAdd }) {
  const { config, go } = useApp();
  const [state, setState] = useState({ loading: true });
  const [q, setQ] = useState('');
  const load = (refresh) => {
    setState({ loading: true });
    api.get(`/api/youtube/channel${refresh ? '?refresh=1' : ''}`)
      .then((r) => setState({ items: r.items }))
      .catch((e) => setState({ error: e.message }));
  };
  useEffect(() => { if (config.youtubeChannel) load(false); else setState({ error: 'none' }); }, []);
  const items = state.items?.filter((v) => v.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="scrim" onClick={onClose}>
      <div className="glass strong modal stack" style={{ width: 'min(860px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Pick a service or sermon</h2>
          <div className="row">
            {state.items && <button className="btn ghost sm" onClick={() => load(true)}>Refresh</button>}
            <button className="btn ghost sm" onClick={onClose}>Close</button>
          </div>
        </div>
        {state.error === 'none' ? (
          <div className="empty">
            <p>Add your church's YouTube channel first.</p>
            <button className="btn primary" onClick={() => go({ name: 'settings', section: 'youtube' })}>Open Settings</button>
          </div>
        ) : state.error ? <div className="banner">{state.error}</div> : null}
        {state.loading && <p className="muted">Reading your channel with yt-dlp…</p>}
        {items && (
          <>
            <input className="input" placeholder="Search titles" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="channel-list">
              {items.map((v) => (
                <div key={v.id} className="channel-item">
                  <img src={v.thumb} alt="" />
                  <div className="stack" style={{ gap: 4 }}>
                    <strong>{v.title}</strong>
                    <div className="row">
                      {v.duration && <span className="chip">{fmt(v.duration)}</span>}
                      {v.live && <span className="chip accent">Livestream</span>}
                    </div>
                  </div>
                  <button className="btn primary sm" onClick={() => onAdd(v)}>Add</button>
                </div>
              ))}
              {!items.length && <p className="muted">No matching videos.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
