import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clapperboard, FileText, Headphones, Layers, Minus, PenLine, Plus, Send, Shapes } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Modal, { ModalHead } from './Modal.jsx';

const GROUPS = [['Video', Clapperboard], ['Words', PenLine], ['Design', Shapes], ['Audio', Headphones], ['Share', Send]];

/** One sermon, many pieces: what's made, what's next, one click to make each. */
export default function ContentPlan({ project, setStep, onChange }) {
  const { go, toast, trackJob, onJobFinished, config, saveConfig } = useApp();
  const [plan, setPlan] = useState(null);
  const [showIdeas, setShowIdeas] = useState(false);
  const [podcast, setPodcast] = useState(false);
  const [series, setSeries] = useState(project.series || '');
  const load = () => api.get(`/api/projects/${project.id}/plan`).then(setPlan).catch(() => {});
  useEffect(() => { load(); }, [project.id]);
  useEffect(() => onJobFinished((j) => { if (j.projectId === project.id) load(); }), [onJobFinished]);
  if (!plan) return <div className="skeleton" style={{ height: 320 }} />;
  const make = (p) => {
    if (p.id === 'transcript') return setStep(project.status === 'transcribed' ? 'text' : 'transcribe');
    if (p.id === 'clips') return setStep(project.clips.some((c) => c.status === 'kept' || c.status === 'exported') ? 'edit' : 'clips');
    if (['blog', 'email', 'group', 'devotional', 'social'].includes(p.id)) return go({ name: 'writing', project: project.id, kind: p.id });
    if (p.designId) return go({ name: 'graphics', design: p.designId });
    if (p.group === 'Design') return go({ name: 'graphics', make: { projectId: project.id, template: p.id === 'quote' ? 'post-quote' : p.id } });
    if (p.id === 'podcast') return setPodcast(true);
    if (p.id === 'posts') return go({ name: 'calendar', campaign: { projectId: project.id } });
    return null;
  };
  // Pieces someone sets aside stay as ideas but leave the ring, so it only counts what they care about.
  const hidden = new Set(config.planHidden || []);
  const shown = plan.pieces.filter((p) => !hidden.has(p.id));
  const ideas = plan.pieces.filter((p) => hidden.has(p.id));
  const total = shown.length;
  const done = shown.filter((p) => p.done).length;
  const setAside = (p, off) => saveConfig({ planHidden: off ? [...hidden, p.id] : [...hidden].filter((x) => x !== p.id) });
  const pct = done / Math.max(1, total);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="glass strong panel plan-head">
        <span className="plan-ring" style={{ '--p': pct }} aria-hidden="true"><strong className="num">{done}</strong><span>of {total}</span></span>
        <div className="stack grow" style={{ gap: 4, minWidth: 0 }}>
          <span className="eyebrow">Content plan</span>
          <h2 style={{ margin: 0 }}>One sermon, {total} ways to share it</h2>
          <span className="muted small">{done === 0 ? 'Start anywhere. Every piece links back to this sermon. Set aside any that don\'t fit your church.' : done >= total ? 'Everything is made. Well done.' : `${total - done} more pieces you could make from this message.`}</span>
        </div>
        <label className="field small" style={{ width: 220 }}><span className="row" style={{ gap: 6 }}><Layers size={13} />Series</span>
          <input className="input" value={series} placeholder="Like Rooted" onChange={(e) => setSeries(e.target.value)}
            onBlur={async () => { if (series !== (project.series || '')) { await api.patch(`/api/projects/${project.id}`, { series }); onChange?.(); toast({ text: series ? `Added to the “${series}” series.` : 'Removed from its series.' }); } }} />
        </label>
      </section>
      <div className="plan-grid">
        {GROUPS.map(([g, Icon]) => {
          const list = shown.filter((p) => p.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="glass panel stack" style={{ gap: 6 }}>
              <span className="eyebrow row" style={{ gap: 6 }}><Icon size={13} />{g}</span>
              {list.map((p) => (
                <div key={p.id} className={`plan-row ${p.done ? 'done' : ''}`}>
                  <button className="plan-main" onClick={() => make(p)}>
                    <span className="plan-check">{p.done && <Check size={13} />}</span>
                    <span className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong>{p.label}</strong>{p.note && <span className="small muted truncate">{p.note}</span>}</span>
                    <span className="plan-go">{p.done ? 'Open' : 'Make'}</span>
                  </button>
                  <button className="rt-btn plan-hide" aria-label={`Set aside ${p.label}`} title="Set aside. It stays below as an idea and leaves the count." onClick={() => setAside(p, true)}><Minus size={14} /></button>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {ideas.length > 0 && (
        <section className="glass panel stack" style={{ gap: 6 }}>
          <button className="row between plan-ideas-head" aria-expanded={showIdeas} onClick={() => setShowIdeas(!showIdeas)}>
            <span className="eyebrow">Set aside · {ideas.length}</span>
            <span className="row small muted" style={{ gap: 4 }}>{showIdeas ? 'Hide' : 'Show'} ideas<ChevronDown size={14} style={{ transform: showIdeas ? 'rotate(180deg)' : 'none', transition: 'transform var(--fast) var(--ease)' }} /></span>
          </button>
          {showIdeas && ideas.map((p) => (
            <div key={p.id} className="plan-row idea">
              <button className="plan-main" onClick={() => make(p)}>
                <span className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong>{p.label}</strong><span className="small muted">{p.group}{p.note ? ` · ${p.note}` : ''}</span></span>
                <span className="plan-go">Make</span>
              </button>
              <button className="btn sm" onClick={() => setAside(p, false)}><Plus size={13} />Add back</button>
            </div>
          ))}
        </section>
      )}
      {plan.project.refs?.length > 0 && (
        <section className="glass panel row wrap" style={{ gap: 8 }}>
          <span className="eyebrow row" style={{ gap: 6 }}><FileText size={13} />Scripture in this message</span>
          {plan.project.refs.map((r) => <span key={r} className="chip">{r}</span>)}
        </section>
      )}
      {podcast && <PodcastDialog project={project} onClose={() => setPodcast(false)} onStart={(job) => { trackJob(job); setPodcast(false); toast({ text: 'Making your episode. It goes to Downloads with show notes.' }); }} />}
    </div>
  );
}

/** Podcast episode: intro and outro music from the brand library's Audio folder. */
function PodcastDialog({ project, onClose, onStart }) {
  const { toast, go } = useApp();
  const [audio, setAudio] = useState(null);
  const [o, setO] = useState({ intro: '', outro: '', format: 'mp3', whole: !project.sermon?.confirmed, title: project.title });
  useEffect(() => { api.get('/api/library').then((l) => setAudio(l.items.filter((i) => i.folder === 'Audio'))).catch(() => setAudio([])); }, []);
  const start = async () => {
    try { const { job } = await api.post(`/api/projects/${project.id}/podcast`, { ...o, intro: o.intro || null, outro: o.outro || null }); onStart(job); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  return (
    <Modal onClose={onClose} width={520} label="Podcast episode">
      <ModalHead title="Podcast episode" sub="The sermon's audio, cleaned up and leveled for podcasts, with your logo as cover art and show notes." />
      <label className="field">Episode title<input className="input" value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} /></label>
      {audio && !audio.length && (
        <div className="keycard small row between wrap" style={{ gap: 8 }}>
          <span className="muted">Add intro or outro music to the Audio folder in your brand library to use it here.</span>
          <button className="btn sm" onClick={() => { onClose(); go({ name: 'assets' }); }}>Brand library</button>
        </div>
      )}
      {audio?.length > 0 && (
        <div className="token-grid">
          <label className="field">Intro music<select className="input" value={o.intro} onChange={(e) => setO({ ...o, intro: e.target.value })}><option value="">None</option>{audio.map((a) => <option key={a.rel} value={a.rel}>{a.name}</option>)}</select></label>
          <label className="field">Outro music<select className="input" value={o.outro} onChange={(e) => setO({ ...o, outro: e.target.value })}><option value="">None</option>{audio.map((a) => <option key={a.rel} value={a.rel}>{a.name}</option>)}</select></label>
        </div>
      )}
      <div className="row wrap" style={{ gap: 12 }}>
        <div className="seg sm">{[['mp3', 'MP3'], ['m4a', 'M4A']].map(([k, l]) => <button key={k} className={o.format === k ? 'on' : ''} onClick={() => setO({ ...o, format: k })}>{l}</button>)}</div>
        {project.sermon?.confirmed && <label className="switch small"><input type="checkbox" checked={!o.whole} onChange={(e) => setO({ ...o, whole: !e.target.checked })} />Sermon only</label>}
      </div>
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="hint">Saved to Downloads with a show notes file.</span>
        <button className="btn primary" onClick={start}><Headphones size={14} />Make episode</button>
      </div>
    </Modal>
  );
}
