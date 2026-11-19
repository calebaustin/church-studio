// Campaigns in Social: plan a run of posts toward an event, a sermon or anything else, then fill in
// each post with a design or clip and schedule it. Repeat a campaign for the next time.
import { useEffect, useState } from 'react';
import { CalendarDays, Check, Clapperboard, Copy, Image as ImageIcon, Megaphone, Plus, Repeat, Shapes, Trash2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';
import { useChurchEvents } from './ChurchEvents.jsx';

const day = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const time = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const dateInput = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const STATE = { draft: ['chip', 'To do'], scheduled: ['chip accent', 'Scheduled'], published: ['chip ok', 'Posted'], 'needs-you': ['chip warn', 'Needs you'], partial: ['chip warn', 'Partly posted'], failed: ['chip bad', 'Failed'], publishing: ['chip warn', 'Posting'] };

export default function Campaigns({ s, onEdit, start }) {
  const [list, setList] = useState(null);
  const [making, setMaking] = useState(start || null);
  const [repeat, setRepeat] = useState(null);
  const load = () => api.get('/api/campaigns').then((r) => setList(r.campaigns)).catch(() => setList([]));
  useEffect(() => { load(); }, [s.posts]);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="muted">A campaign is a set of posts that build toward one moment, each with a caption to start from.</span>
        <button className="btn primary" onClick={() => setMaking({})}><Megaphone size={15} />New campaign</button>
      </div>
      {list && !list.length && (
        <div className="glass empty">
          <Megaphone size={36} />
          <h3>No campaigns yet</h3>
          <p>Plan posts for an event, a sermon or a series. Church Studio drafts each post and puts it on the calendar.</p>
          <button className="btn primary" onClick={() => setMaking({})}><Plus size={15} />Start one</button>
        </div>
      )}
      {(list || []).map((c) => <CampaignCard key={c.id} c={c} onEdit={onEdit} onRepeat={() => setRepeat(c)} reload={load} />)}
      {making && <NewCampaign start={making} accounts={s.accounts} onClose={() => setMaking(null)} onMade={() => { setMaking(null); s.load(); load(); }} />}
      {repeat && <RepeatCampaign c={repeat} onClose={() => setRepeat(null)} onMade={() => { setRepeat(null); s.load(); load(); }} />}
    </div>
  );
}

function CampaignCard({ c, onEdit, onRepeat, reload }) {
  const { go, toast } = useApp();
  const done = c.steps.filter((x) => x.post && x.post.status !== 'draft').length;
  const asset = (st) => {
    if (st.asset === 'flyer' && c.event) return go({ name: 'graphics', event: c.event, eventMode: 'flyer' });
    if (st.asset === 'countdown' && c.event) return go({ name: 'graphics', event: c.event, eventMode: 'countdown' });
    if (st.asset === 'clip' && c.projectId) return go({ name: 'project', id: c.projectId, step: 'edit' });
    if (st.asset === 'photo') return go({ name: 'assets' });
    if (c.projectId) return go({ name: 'graphics', make: { projectId: c.projectId, template: st.key === 'quote' ? 'post-quote' : 'story-recap' } });
    return go({ name: 'graphics' });
  };
  const ICON = { flyer: Shapes, countdown: Shapes, design: Shapes, clip: Clapperboard, photo: ImageIcon };
  return (
    <section className="glass panel stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="eyebrow">{c.kind === 'event' ? 'Event' : c.kind === 'sermon' ? 'Sermon' : 'Campaign'} · {day(c.date)}</span>
          <h2 style={{ margin: 0 }} className="truncate">{c.name}</h2>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="chip">{done} of {c.steps.length} scheduled or posted</span>
          <button className="btn sm" onClick={onRepeat}><Repeat size={13} />Repeat</button>
          <button className="rt-btn" title="Delete campaign and its unscheduled drafts" aria-label="Delete campaign" onClick={async () => { await api.del(`/api/campaigns/${c.id}`); toast({ text: `“${c.name}” deleted. Scheduled posts stay on the calendar.` }); reload(); }}><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="camp-steps">
        {c.steps.map((st) => {
          const p = st.post;
          const [cls, label] = STATE[p?.status] || ['chip', 'Missing'];
          const Icon = ICON[st.asset] || Shapes;
          const past = new Date(st.at) < new Date() && p?.status === 'draft';
          return (
            <div key={st.id} className={`camp-step ${p && p.status !== 'draft' ? 'done' : ''}`}>
              <div className="camp-when"><strong>{day(p?.scheduledAt || st.at)}</strong><span className="muted small">{time(p?.scheduledAt || st.at)}</span></div>
              <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="row" style={{ gap: 6 }}><strong className="small">{st.label}</strong><span className={cls}>{past ? 'Date passed' : label}</span>{p?.media && <span className="chip ok"><Check size={11} />{p.media.kind === 'image' ? 'Design' : 'Clip'}</span>}</span>
                <span className="muted small camp-cap">{p?.caption || ''}</span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {p?.status === 'draft' && !p.media && <button className="btn sm ghost" title={`Make the ${st.asset}`} onClick={() => asset(st)}><Icon size={13} />{st.asset === 'clip' ? 'Clip' : st.asset === 'photo' ? 'Photos' : 'Design'}</button>}
                {p && <button className="btn sm" onClick={() => onEdit(p)}>{p.status === 'draft' ? 'Finish' : 'Open'}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewCampaign({ start, accounts, onClose, onMade }) {
  const { toast } = useApp();
  const cal = useChurchEvents();
  const [kind, setKind] = useState(start.event ? 'event' : start.projectId ? 'sermon' : start.kind || 'event');
  const [event, setEvent] = useState(start.event || null);
  const [projectId, setProjectId] = useState(start.projectId || '');
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(dateInput(Date.now() + 14 * 86400000));
  const [hour, setHour] = useState(9);
  const [plan, setPlan] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/projects').then((r) => setProjects(r.projects.filter((p) => p.status === 'transcribed'))).catch(() => {}); }, []);
  const ready = kind === 'event' ? Boolean(event) : kind === 'sermon' ? Boolean(projectId) : Boolean(name.trim());
  useEffect(() => {
    if (!ready) { setPlan(null); return; }
    const body = { kind, hour, ...(kind === 'event' ? { event } : kind === 'sermon' ? { projectId } : { name, date: new Date(`${date}T12:00`).toISOString() }) };
    api.post('/api/campaigns/draft', body).then(setPlan).catch((e) => toast({ kind: 'error', text: e.message }));
  }, [kind, event?.id, projectId, name, date, hour, ready]);
  const upcoming = (cal.events || []).filter((e) => new Date(e.start) > new Date()).slice(0, 20);
  const setStep = (id, patch) => setPlan({ ...plan, steps: plan.steps.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const make = async () => {
    setBusy(true);
    try {
      await api.post('/api/campaigns', { ...plan, name: name.trim() || plan.name, hour, accountIds: [...picked] });
      const n = plan.steps.filter((x) => x.on).length;
      toast({ text: `Campaign made. ${n === 1 ? '1 draft is' : `${n} drafts are`} on your calendar.`, celebrate: true });
      onMade();
    } catch (e) { toast({ kind: 'error', text: e.message }); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} width={900} label="New campaign"
      footer={<><span className="hint">Each post starts as a draft. Add a design or clip, then schedule it.</span><button className="btn primary" disabled={!plan || busy || !plan.steps.some((x) => x.on)} onClick={make}><Megaphone size={15} />{busy ? 'Making…' : `Make ${plan ? plan.steps.filter((x) => x.on).length : ''} posts`}</button></>}>
      <ModalHead title="New campaign" sub="Pick what it’s for. Church Studio suggests the posts and writes a first caption for each." />
      <div className="seg">{[['event', 'A church event'], ['sermon', 'A sermon'], ['custom', 'Something else']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      {kind === 'event' && (
        cal.linked ? (
          <label className="field">Event
            <select className="input" value={event?.id || ''} onChange={(e) => setEvent(upcoming.find((x) => x.id === e.target.value) || null)}>
              <option value="">Pick an upcoming event</option>
              {upcoming.map((e) => <option key={e.id} value={e.id}>{e.title} · {day(e.start)}</option>)}
            </select>
          </label>
        ) : <div className="keycard small muted">Link your church calendar in Settings › Connections to pick events here, or choose Something else.</div>
      )}
      {kind === 'sermon' && (
        <label className="field">Sermon
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Pick a transcribed sermon</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
      )}
      {kind === 'custom' && (
        <div className="token-grid">
          <label className="field">Name<input className="input" value={name} placeholder="Like Giving Tuesday or VBS sign-ups" onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">The big day<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
      )}
      {plan && (
        <>
          <div className="row wrap" style={{ gap: 12 }}>
            {kind !== 'custom' && <label className="field" style={{ minWidth: 260 }}>Campaign name<input className="input" value={name} placeholder={plan.name} onChange={(e) => setName(e.target.value)} /></label>}
            <label className="field">Post time<select className="input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>{[7, 8, 9, 10, 11, 12, 15, 17, 18, 19, 20].map((h) => <option key={h} value={h}>{h > 12 ? h - 12 : h}:00 {h >= 12 ? 'PM' : 'AM'}</option>)}</select></label>
          </div>
          {accounts.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="field-label">Post to</span>
              <div className="row wrap" style={{ gap: 6 }}>{accounts.map((a) => <label key={a.id} className="pill-choice" style={{ cursor: 'pointer' }}><input type="checkbox" checked={picked.has(a.id)} onChange={() => { const n = new Set(picked); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setPicked(n); }} style={{ marginRight: 6 }} />{a.label}</label>)}</div>
            </div>
          )}
          <span className="eyebrow">Posts</span>
          <div className="camp-steps">
            {plan.steps.map((st) => (
              <div key={st.id} className={`camp-step edit ${st.on ? '' : 'off'}`}>
                <input type="checkbox" checked={st.on} aria-label={`Include ${st.label}`} onChange={(e) => setStep(st.id, { on: e.target.checked })} />
                <div className="camp-when"><strong>{day(st.at)}</strong><span className="muted small">{st.offset === 0 ? 'The day' : st.offset < 0 ? `${-st.offset} day${st.offset === -1 ? '' : 's'} before` : `${st.offset} day${st.offset === 1 ? '' : 's'} after`}</span></div>
                <div className="stack grow" style={{ gap: 4, minWidth: 0 }}>
                  <strong className="small">{st.label}</strong>
                  <textarea className="input" rows={2} value={st.caption} onChange={(e) => setStep(st.id, { caption: e.target.value })} aria-label={`${st.label} caption`} />
                </div>
              </div>
            ))}
          </div>
          {plan.steps.some((x) => !x.on && new Date(x.at) < new Date()) && <span className="hint">Posts whose date has passed start unchecked.</span>}
        </>
      )}
    </Modal>
  );
}

function RepeatCampaign({ c, onClose, onMade }) {
  const { toast } = useApp();
  const next = new Date(c.date); next.setDate(next.getDate() + (c.kind === 'event' ? 28 : 7));
  const [date, setDate] = useState(dateInput(next));
  const [name, setName] = useState(c.name);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.post(`/api/campaigns/${c.id}/repeat`, { date: new Date(`${date}T${String(new Date(c.date).getHours()).padStart(2, '0')}:${String(new Date(c.date).getMinutes()).padStart(2, '0')}`).toISOString(), name }); toast({ text: 'Campaign repeated. Captions, designs and clips came along. Use Copy for a new date in Design to update dates on graphics.' }); onMade(); } catch (e) { toast({ kind: 'error', text: e.message }); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} width={480} label="Repeat campaign"
      footer={<><span className="hint">Every post moves with the new date.</span><button className="btn primary" disabled={busy} onClick={go}><Copy size={14} />Repeat</button></>}>
      <ModalHead title="Repeat for next time" sub="Great for monthly events, a yearly VBS or a sermon series." />
      <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span className="row" style={{ gap: 6 }}><CalendarDays size={13} />New date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    </Modal>
  );
}
