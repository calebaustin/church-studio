import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, Check, ChevronDown, Clapperboard, ExternalLink, FileText, Headphones, Layers, Link2, Megaphone, Minus, PenLine, Plus, Search, Send, Shapes, Sparkles, X } from 'lucide-react';
import { api, fmt, media, openLink } from '../api.js';
import { useApp } from '../App.jsx';
import Modal, { ModalHead } from './Modal.jsx';

const GROUPS = [['Video', Clapperboard], ['Words', PenLine], ['Design', Shapes], ['Audio', Headphones], ['Share', Send]];

const KIND_ICON = { design: Shapes, writing: PenLine, post: Send, campaign: Megaphone };
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');

/**
 * The Sermon page: the sermon at a glance, its plan (what's made, what's next, one click to make each), and
 * everything tied to it, with a way to tie more. The sermon is the hub that holds it all together.
 */
export default function ContentPlan({ project, setStep, onChange }) {
  const { go, toast, trackJob, onJobFinished, config, saveConfig, ai } = useApp();
  const [linking, setLinking] = useState(false);
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
  const sm = plan.sermon || {};
  const L = plan.links || { designs: [], writing: [], posts: [], campaigns: [] };
  const clips = project.clips.filter((c) => c.status === 'kept' || c.status === 'exported' || c.export);
  const unlink = async (kind, id) => { await api.put('/api/links', { kind, id, projectId: null }); load(); toast({ text: 'No longer tied to this sermon.' }); };
  const openItem = (kind, it) => {
    if (kind === 'design') return go({ name: 'graphics', design: it.id });
    if (kind === 'writing') return go({ name: 'writing', project: it.id });
    if (kind === 'post') return go({ name: 'social' });
    return go({ name: 'calendar', tab: 'campaigns' });
  };
  const tied = [['design', 'Designs', L.designs], ['writing', 'Writing', L.writing], ['post', 'Posts', L.posts], ['campaign', 'Campaigns', L.campaigns]];
  const count = clips.length + L.designs.length + L.writing.length + L.posts.length + L.campaigns.length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="glass strong panel sermon-hero">
        <div className="stack" style={{ gap: 10, minWidth: 0 }}>
          <span className="eyebrow row" style={{ gap: 6 }}><BookOpen size={13} />Sermon</span>
          {sm.bigIdea ? <p className="sermon-idea">“{sm.bigIdea.replace(/^[“"]|[”"]$/g, '')}”</p> : <h2 style={{ margin: 0 }}>{project.title}</h2>}
          <span className="muted small row wrap" style={{ gap: 6 }}>
            {day(sm.date)}{sm.duration ? ` · ${fmt(sm.duration)}` : ''}{project.series ? ` · ${project.series} series` : ''}{sm.stories ? ` · ${sm.stories} stor${sm.stories === 1 ? 'y' : 'ies'}` : ''}
          </span>
          {sm.refs?.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {sm.refs.map((r) => <button key={r.ref} className="chip-btn" title="Open the transcript where this is read" onClick={() => go({ name: 'project', id: project.id, step: 'text', t: r.start })}><BookOpen size={12} />{r.ref}</button>)}
            </div>
          )}
          {sm.points?.length > 0 && <ol className="sermon-points">{sm.points.map((p) => <li key={p}>{p}</li>)}</ol>}
          {sm.themes?.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{sm.themes.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setStep(project.status === 'transcribed' ? 'text' : 'transcribe')}><FileText size={13} />Transcript</button>
            {sm.watch && <button className="btn sm ghost" onClick={() => openLink(sm.watch)}><ExternalLink size={13} />Watch</button>}
          </div>
        </div>
        <label className="field small sermon-series"><span className="row" style={{ gap: 6 }}><Layers size={13} />Series</span>
          <input className="input" value={series} placeholder="Like Rooted" onChange={(e) => setSeries(e.target.value)}
            onBlur={async () => { if (series !== (project.series || '')) { await api.patch(`/api/projects/${project.id}`, { series }); onChange?.(); toast({ text: series ? `Added to the “${series}” series.` : 'Removed from its series.' }); } }} />
        </label>
      </section>
      <section className="glass strong panel plan-head">
        <span className="plan-ring" style={{ '--p': pct }} aria-hidden="true"><strong className="num">{done}</strong><span>of {total}</span></span>
        <div className="stack grow" style={{ gap: 4, minWidth: 0 }}>
          <span className="eyebrow">Sermon plan</span>
          <h2 style={{ margin: 0 }}>One sermon, {total} ways to share it</h2>
          <span className="muted small">{done === 0 ? 'Start anywhere. Every piece links back to this sermon. Set aside any that don\'t fit your church.' : done >= total ? 'Everything is made. Well done.' : `${total - done} more pieces you could make from this message.`}</span>
        </div>

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
      <section className="glass panel stack" style={{ gap: 12 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <span className="stack" style={{ gap: 0 }}>
            <span className="eyebrow row" style={{ gap: 6 }}><Link2 size={13} />Tied to this sermon · {count}</span>
            <span className="muted small">Everything made from this sermon, in one place. Tie anything else here too.</span>
          </span>
          <button className="btn sm" onClick={() => setLinking(true)}><Plus size={13} />Link something</button>
        </div>
        {clips.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted row" style={{ gap: 6 }}><Clapperboard size={13} />Clips</span>
            <div className="tied-grid">
              {clips.map((c) => (
                <button key={c.id} className="tied-card" onClick={() => go({ name: 'project', id: project.id, clip: c.id })}>
                  {c.export?.thumb ? <img src={media(project.id, c.export.thumb)} alt="" /> : <span className="tied-ico"><Clapperboard size={16} /></span>}
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{c.title}</strong><span className="tiny muted">{c.export ? 'Exported' : 'Kept'} · {Math.round(c.end - c.start)}s</span></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {tied.map(([kind, label, list]) => list.length > 0 && (
          <div key={kind} className="stack" style={{ gap: 6 }}>
            <span className="small muted row" style={{ gap: 6 }}>{(() => { const I = KIND_ICON[kind]; return <I size={13} />; })()}{label}</span>
            <div className="tied-grid">
              {list.map((it) => (
                <div key={it.id} className="tied-card-wrap">
                  <button className="tied-card" onClick={() => openItem(kind, it)}>
                    {it.thumb ? <img src={it.thumb} alt="" /> : <span className="tied-ico">{(() => { const I = KIND_ICON[kind]; return <I size={16} />; })()}</span>}
                    <span className="stack" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{it.title}</strong><span className="tiny muted truncate">{it.sub}{it.when ? ` · ${day(it.when)}` : ''}</span></span>
                  </button>
                  {!it.own && <button className="rt-btn tied-x" aria-label={`Untie ${it.title}`} title="Untie from this sermon" onClick={() => unlink(kind, it.id)}><X size={12} /></button>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {count === 0 && <p className="muted small" style={{ margin: 0 }}>Nothing yet. Make something from the plan above, or link a design, a piece of writing, a post or a campaign you've already made.</p>}
      </section>
      {linking && <LinkPicker projectId={project.id} title={project.title} onClose={() => setLinking(false)} onDone={() => { setLinking(false); load(); }} />}
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

/** Tie something you've already made to this sermon. */
function LinkPicker({ projectId, title, onClose, onDone }) {
  const { toast } = useApp();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/api/links/candidates').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  const shown = (items || []).filter((i) => !q || `${i.title} ${i.sub}`.toLowerCase().includes(q.toLowerCase()));
  const link = async (i) => {
    await api.put('/api/links', { kind: i.kind, id: i.id, projectId });
    setItems((list) => list.filter((x) => !(x.kind === i.kind && x.id === i.id)));
    toast({ text: `${i.title} is tied to ${title}.` });
  };
  return (
    <Modal label="Link to this sermon" width={560} onClose={onDone}>
      <ModalHead title="Link something to this sermon" sub="Designs, writing, posts and campaigns that aren't tied to a sermon yet." />
      <label className="field" style={{ marginTop: 12 }}><span className="row" style={{ gap: 6 }}><Search size={13} />Find</span>
        <input className="input" autoFocus value={q} placeholder="Search by name" onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="stack link-list" style={{ gap: 4, marginTop: 8 }}>
        {!items && <span className="muted small">Loading…</span>}
        {items && !shown.length && <span className="muted small">Nothing left to link{q ? ' with that name' : ''}.</span>}
        {shown.map((i) => {
          const I = KIND_ICON[i.kind] || FileText;
          return (
            <div key={`${i.kind}${i.id}`} className="link-row">
              {i.thumb ? <img src={i.thumb} alt="" /> : <span className="tied-ico"><I size={15} /></span>}
              <span className="stack" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{i.title}</strong><span className="tiny muted">{i.sub}</span></span>
              <button className="btn sm" onClick={() => link(i)}><Link2 size={13} />Link</button>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn primary" onClick={onDone}>Done</button></div>
    </Modal>
  );
}
