// A video's header page: its details (filled in from what Church Studio can tell, editable), then what's next.
// Publish the trimmed sermon to YouTube as its own video, make clips from it, or both.
import { useEffect, useState } from 'react';
import { ArrowRight, Check, ExternalLink, MonitorPlay, Scissors, Upload } from 'lucide-react';
import { api, fmt, media, openLink } from '../api.js';
import { useApp } from '../App.jsx';
import YouTubePublish, { fill } from './YouTubePublish.jsx';

const dateInput = (d) => { const x = new Date(d); if (!d || Number.isNaN(x.getTime())) return ''; return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const PRIVACY = { public: 'Public', unlisted: 'Unlisted', private: 'Private' };

export default function ProjectHome({ project, patch, start, setStep, busy }) {
  const { toast } = useApp();
  const [parts, setParts] = useState(null);
  const [form, setForm] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const loadParts = () => api.get(`/api/projects/${project.id}/youtube`).then((r) => {
    setParts(r);
    setForm((f) => f || { title: r.title || '', preacher: r.preacher || '', date: r.date || null, series: project.series || '' });
  }).catch(() => setParts({}));
  useEffect(() => { loadParts(); }, [project.id]);

  // Save a detail when you leave its field.
  const save = async (body) => { try { await patch(body); } catch (e) { toast({ kind: 'error', text: e.message }); } };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const transcribed = project.status === 'transcribed';
  const trimmed = Boolean(project.range);
  const len = project.media?.duration;
  const kept = project.clips.filter((c) => c.status === 'kept' || c.status === 'exported');
  const exported = project.clips.filter((c) => c.export);
  const working = busy.find((j) => ['transcribe', 'propose'].includes(j.kind));
  const ytTitle = form && parts?.pattern ? fill(parts.pattern, form) : '';

  const steps = [
    ['Transcribe', transcribed],
    ...(trimmed ? [] : [['Find the sermon', Boolean(project.sermon?.confirmed)]]),
    ['Pick clips', kept.length > 0],
    ['Edit and export', exported.length > 0],
    ['Exports', false],
  ];

  // Make clips starts the whole process: transcribe, then (once the sermon is known) find clips.
  const makeClips = async () => {
    if (working) { setStep(working.kind === 'propose' ? 'clips' : 'transcribe'); return; }
    if (!transcribed) {
      await save({ next: 'clips' });
      await start('transcribe', { cleanup: project.audioCleanup || null });
      setStep('transcribe');
    } else if (!project.sermon?.confirmed) setStep('sermon');
    else if (!project.clips.length) { await start('propose', {}); setStep('clips'); }
    else setStep('clips');
  };
  const clipsLabel = working ? 'See progress' : !transcribed ? 'Make clips' : !project.sermon?.confirmed ? 'Find the sermon' : project.clips.length ? 'Open clips' : 'Find clips';

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="glass panel project-home-head">
        {project.poster ? <img className="project-home-poster" src={media(project.id, project.poster)} alt="" /> : <span className="project-home-poster" />}
        <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
          <span className="small row" style={{ gap: 6, color: 'var(--ok)' }}><Check size={13} />{trimmed ? 'Trimmed sermon ready' : 'Video ready'}{len ? ` · ${fmt(len)}` : ''}</span>
          <h2>{form?.title || project.title}</h2>
          <span className="small muted">What's next for this {trimmed || project.isSermon ? 'sermon' : 'video'}? Do one or both.</span>
        </div>
      </section>

      <section className="glass panel stack" style={{ gap: 10 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <h3>Details</h3>
          <span className="hint">Filled in from the video where we could. Used for its YouTube title, the Sermon page and writing.</span>
        </div>
        {!form ? <div className="skeleton" style={{ height: 64 }} /> : (
          <div className="project-home-fields">
            <label className="field">Sermon title<input className="input" value={form.title} placeholder="In Remembrance" onChange={(e) => set('title', e.target.value)} onBlur={(e) => save({ sermonTitle: e.target.value })} /></label>
            <label className="field">Preacher<input className="input" value={form.preacher} placeholder="Chris Parker" onChange={(e) => set('preacher', e.target.value)} onBlur={(e) => save({ preacher: e.target.value })} /></label>
            <label className="field">Preached on<input className="input" type="date" value={dateInput(form.date)} onChange={(e) => { const d = e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null; set('date', d); save({ preachedOn: d }); }} /></label>
            <label className="field">Series <span className="hint">Optional</span><input className="input" value={form.series} placeholder="Psalms of Ascent" onChange={(e) => set('series', e.target.value)} onBlur={(e) => save({ series: e.target.value })} /></label>
          </div>
        )}
      </section>

      <div className="project-home-paths">
        <section className="glass panel stack project-home-path rec" style={{ gap: 10 }}>
          <div className="row between" style={{ gap: 8 }}>
            {parts?.uploaded ? <span className="chip ok"><Check size={11} />Posted {new Date(parts.uploaded.at).toLocaleDateString()}</span> : <span className="chip accent">Recommended</span>}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="row" style={{ gap: 8 }}><MonitorPlay size={17} />Publish trimmed video</h3>
            <span className="small muted">{trimmed || project.sermon?.confirmed ? 'Just the sermon, as its own video on your channel.' : 'The whole video for now. Find the sermon to post just that part.'}</span>
          </div>
          <dl className="project-home-facts">
            <dt>Title</dt><dd>{ytTitle || <span className="muted">Add the sermon title above</span>}</dd>
            <dt>Playlist</dt><dd>{parts?.playlist || <span className="muted">None</span>}</dd>
            <dt>Who can watch</dt><dd>{PRIVACY[parts?.privacy] || 'Public'}</dd>
          </dl>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className={`btn ${parts?.uploaded ? '' : 'primary'}`} disabled={!form} onClick={() => setPublishing(true)}><Upload size={15} />{parts?.uploaded ? 'Publish again' : 'Publish to YouTube'}</button>
            {parts?.uploaded?.url && <button className="btn ghost" onClick={() => openLink(parts.uploaded.url)}><ExternalLink size={14} />Open on YouTube</button>}
          </div>
        </section>

        <section className="glass panel stack project-home-path" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            {exported.length ? <span className="chip ok"><Check size={11} />{exported.length} clip{exported.length === 1 ? '' : 's'} exported</span>
              : kept.length ? <span className="chip accent">{kept.length} clip{kept.length === 1 ? '' : 's'} kept</span>
                : working ? <span className="chip accent">{working.kind === 'propose' ? 'Finding clips' : 'Transcribing'}{working.progress ? ` · ${Math.round(working.progress)}%` : ''}</span>
                  : <span className="chip">Not started</span>}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="row" style={{ gap: 8 }}><Scissors size={17} />Make clips</h3>
            <span className="small muted">Short captioned clips for social.</span>
          </div>
          <ol className="project-home-steps">
            {steps.map(([label, done], i) => <li key={label} className={done ? 'done' : ''}><span className="n">{done ? <Check size={11} /> : i + 1}</span>{label}</li>)}
          </ol>
          <button className={`btn ${parts?.uploaded && !kept.length ? 'primary' : ''}`} onClick={makeClips}><ArrowRight size={15} />{clipsLabel}</button>
        </section>
      </div>

      {publishing && <YouTubePublish project={project} onClose={() => { setPublishing(false); loadParts(); }} />}
    </div>
  );
}
