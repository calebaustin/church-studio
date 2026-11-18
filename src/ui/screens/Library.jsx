import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Check, MonitorPlay, FolderOpen, Link2, Clapperboard, AudioLines, FileAudio } from 'lucide-react';
import CleanAudioDialog from '../components/CleanAudioDialog.jsx';
import { api, desktop, fmt, media } from '../api.js';
import Modal from '../components/Modal.jsx';
import AddVideo from '../components/AddVideo.jsx';
import SetupChecklist from '../components/SetupChecklist.jsx';

export default function Library({ openPicker = false }) {
  const { go, trackJob, onJobFinished, config } = useApp();
  const [projects, setProjects] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(openPicker);
  const [adding, setAdding] = useState(null); // { url, title } being looked at before download
  const [cleaning, setCleaning] = useState(false);

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
    const file = await (desktop?.pickMedia || desktop?.pickVideo)?.();
    if (file) add({ file });
  };

  return (
    <div className="page">
      <section className="glass strong hero">
        <div>
          <h1>Turn Sunday's sermon into clips worth sharing.</h1>
          <p>Pick a service. Get captioned vertical clips of the best moments.</p>
        </div>
        <div className="dropzone">
          <button className="btn primary lg" onClick={() => setPicker(true)}>
            <MonitorPlay size={18} />Pick from {config.youtubeChannel ? 'your channel' : 'a channel'}
          </button>
          <div className="row">
            <input className="input" placeholder="…or paste a YouTube link" value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && setAdding({ url: url.trim() })} />
            <button className="btn" disabled={!url.trim()} onClick={() => setAdding({ url: url.trim() })}><Link2 size={14} />Add link</button>
          </div>
          {desktop?.pickVideo && (
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn" onClick={openFile}><FileAudio size={15} />Transcribe a file from this Mac</button>
              <button className="btn ghost" onClick={() => setCleaning(true)}><AudioLines size={15} />Clean up a recording</button>
            </div>
          )}
          {desktop?.pickVideo && <span className="hint">Audio or video: a class, a podcast, a recording from your phone.</span>}
          {error && <div className="banner">{error}</div>}
        </div>
      </section>

      <GettingStarted projects={projects} onPick={() => setPicker(true)} />
      <div className="row between">
        <h2>Your sermons</h2>
        <span className="muted small">{projects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      {projects && !projects.length && (
        <div className="glass empty">
          <Clapperboard size={40} />
          <h3>No sermons yet</h3>
          <p>Pick a service to get started.</p>
          <button className="btn primary" onClick={() => setPicker(true)}>Pick from your channel</button>
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
      {picker && <ChannelPicker onClose={() => setPicker(false)} onAdd={(v) => { setPicker(false); setAdding({ url: v.url, title: v.title }); }} />}
      {cleaning && <CleanAudioDialog onClose={() => setCleaning(false)} />}
      {adding && <AddVideo url={adding.url} title={adding.title} onClose={() => setAdding(null)} onAdd={(body) => { setAdding(null); add(body); }} />}
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
    <Modal onClose={onClose} width={900} label="Pick a service or sermon">
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
        {state.loading && <div className="stack">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 112 }} />)}</div>}
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
    </Modal>
  );
}

/** Getting-started checklist (guide §6.12). Hides itself once everything is done. */
function GettingStarted({ projects, onPick }) {
  const { config, go } = useApp();
  const [social, setSocial] = useState(null);
  useEffect(() => { api.get('/api/social/accounts').then((r) => setSocial(r.accounts.length)).catch(() => setSocial(0)); }, []);
  if (!projects || social == null) return null;
  const transcribed = projects.some((p) => p.status === 'transcribed');
  const exported = projects.some((p) => p.exported > 0);
  const steps = [
    ['Add your YouTube channel', 'So your services are one click away.', Boolean(config.youtubeChannel), () => go({ name: 'settings', section: 'youtube' }), 'Add channel'],
    ['Bring in a sermon', 'Pick a service from your channel, paste a link, or open a file.', projects.length > 0, onPick, 'Pick one'],
    ['Transcribe it', 'Open the sermon and press Transcribe.', transcribed, projects[0] ? () => go({ name: 'project', id: projects[0].id }) : null, 'Open'],
    ['Export your first clip', 'Keep a suggested clip, tweak it, export.', exported, projects[0] ? () => go({ name: 'project', id: projects[0].id }) : null, 'Open'],
    ['Connect a social account', 'Post or schedule clips without leaving the app.', social > 0, () => go({ name: 'social' }), 'Connect'],
  ];
  return (
    <SetupChecklist id="getting-started" title={(done, total) => (done === 0 ? 'Five quick steps to your first clip' : `${done} of ${total} done`)}
      steps={steps.map(([label, help, ok, action, cta]) => ({ label, help, ok, action, cta }))} />
  );
}
