import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Upload } from 'lucide-react';
import { api, desktop, openLink } from '../api.js';
import { useApp } from '../App.jsx';
import Modal, { ModalHead } from './Modal.jsx';

const dateInput = (d) => { const x = new Date(d); if (Number.isNaN(x.getTime())) return ''; return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const titleDate = (d) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? '' : `${x.getMonth() + 1}.${x.getDate()}.${x.getFullYear()}`; };
const fill = (pattern, p) => pattern.replace('{title}', p.title || '').replace('{preacher}', p.preacher || '').replace('{date}', p.date ? titleDate(p.date) : '')
  .replace(/\s+\|\s*$/, '').replace(/\|\s+\|/g, '|').replace(/\s{2,}/g, ' ').trim().slice(0, 100);

/**
 * Post the sermon to YouTube as its own video: just the sermon part, titled "Sermon Title | Preacher M.D.YYYY",
 * added to a playlist like "Sunday Sermons". The preacher, playlist and privacy are remembered for next week.
 */
export default function YouTubePublish({ project, onClose }) {
  const { config, trackJob, toast, go } = useApp();
  const [parts, setParts] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [form, setForm] = useState(null);
  const [customTitle, setCustomTitle] = useState(null); // set once the YouTube title is typed over
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/api/projects/${project.id}/youtube`).then((r) => {
      setParts(r);
      setForm({ title: r.title, preacher: r.preacher, date: r.date, privacy: r.privacy, playlist: r.playlist, accountId: config.youtubeSermon?.accountId || null });
    }).catch((e) => toast({ kind: 'error', text: e.message }));
    api.get('/api/social/accounts').then((r) => setAccounts(r.accounts.filter((a) => a.platform === 'youtube' && a.kind === 'api'))).catch(() => setAccounts([]));
  }, [project.id]);
  const yt = useMemo(() => (form && parts ? (customTitle ?? fill(parts.pattern, form)) : ''), [form, parts, customTitle]);
  const church = config.churchInfo || {};
  const longDate = form?.date ? new Date(form.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const [desc, setDesc] = useState(null);
  const description = desc ?? [form?.title, '', form?.preacher ? `Preached by ${form.preacher}${longDate ? ` on ${longDate}` : ''}${church.name ? ` at ${church.name}` : ''}.` : '', church.website ? `\n${church.website}` : ''].filter((x) => x !== undefined).join('\n').trim();
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const account = accounts?.find((a) => a.id === form?.accountId) || accounts?.[0];
  const post = async () => {
    setBusy(true);
    try {
      const { job } = await api.post(`/api/projects/${project.id}/youtube`, { accountId: account.id, title: yt, description, privacy: form.privacy, playlist: form.playlist, preacher: form.preacher, date: form.date, sermonTitle: form.title });
      trackJob(job);
      toast({ text: `Uploading “${yt}” to YouTube. It shows on the Sermon page when it's done.` });
      onClose();
    } catch (e) { toast({ kind: 'error', text: e.message }); setBusy(false); }
  };
  const len = project.range ? null : project.sermon ? Math.round((project.sermon.end - project.sermon.start) / 60) : null;
  return (
    <Modal onClose={onClose} width={620} label="Post the sermon to YouTube"
      footer={form && accounts?.length ? (
        <div className="row between" style={{ gap: 8 }}>
          <span className="small muted">{len ? `Just the sermon, about ${len} min.` : 'The sermon video.'}</span>
          <button className="btn primary" disabled={busy || !yt.trim()} onClick={post}><Upload size={15} />Post to YouTube</button>
        </div>
      ) : null}>
      <ModalHead title="Post to YouTube" sub="Uploads just the sermon as its own video, titled your way, and adds it to your sermons playlist." />
      {parts?.uploaded && (
        <div className="banner small row between" style={{ gap: 8 }}>
          <span>Already posted on {new Date(parts.uploaded.at).toLocaleDateString()} as “{parts.uploaded.title}”.</span>
          <button className="btn sm" onClick={() => openLink(parts.uploaded.url)}><ExternalLink size={13} />Open</button>
        </div>
      )}
      {accounts && !accounts.length && (
        <div className="keycard stack" style={{ gap: 8 }}>
          <strong>Post through YouTube's own upload page</strong>
          <span className="small muted">Church Studio opens YouTube signed in and puts the sermon in for you. The title is shown at the top of the page and the description is copied, ready to paste. Playlists are picked on YouTube's page.</span>
          {form && <input className="input" value={yt} onChange={(e) => setCustomTitle(e.target.value)} aria-label="YouTube title" />}
          <div className="row wrap" style={{ gap: 8 }}>
            {desktop?.webPost
              ? <button className="btn primary sm" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const { file } = await api.post(`/api/projects/${project.id}/youtube/file`, {});
                    const r = await desktop.webPost({ platform: 'youtube', file, caption: description, title: yt });
                    if (!r?.ok) throw new Error(r?.error || 'Couldn’t open YouTube.');
                    toast({ text: 'YouTube is open with the sermon. Paste the description with ⌘V.' });
                    onClose();
                  } catch (e) { toast({ kind: 'error', text: e.message }); setBusy(false); }
                }}><Upload size={14} />{busy ? 'Getting the sermon ready…' : 'Open YouTube with the sermon'}</button>
              : <span className="small muted">This works in the Church Studio app.</span>}
            <button className="btn ghost sm" onClick={() => { onClose(); go({ name: 'social', tab: 'accounts' }); }}>Or connect for automatic posting</button>
          </div>
        </div>
      )}
      {form && accounts?.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          {accounts.length > 1 && (
            <label className="field">Channel<select className="input" value={account.id} onChange={(e) => set({ accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.label}</option>)}</select></label>
          )}
          <div className="grid2" style={{ gap: 10 }}>
            <label className="field">Sermon title<input className="input" value={form.title} placeholder="In Remembrance" onChange={(e) => set({ title: e.target.value })} /></label>
            <label className="field">Preacher<input className="input" value={form.preacher} placeholder="Chris Parker" onChange={(e) => set({ preacher: e.target.value })} /></label>
          </div>
          <label className="field" style={{ maxWidth: 220 }}>Preached on<input className="input" type="date" value={dateInput(form.date)} onChange={(e) => set({ date: e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null })} /></label>
          <label className="field">
            <span className="row between"><span>YouTube title <span className="hint">{yt.length}/100</span></span>{customTitle != null && <button type="button" className="btn ghost sm" onClick={() => setCustomTitle(null)}>Use the usual format</button>}</span>
            <input className="input" value={yt} onChange={(e) => setCustomTitle(e.target.value)} />
            <span className="hint">Made from the sermon title, preacher and date, like “In Remembrance | Chris Parker 11.15.2026”.</span>
          </label>
          <label className="field">Description<textarea className="input" rows={4} value={description} onChange={(e) => setDesc(e.target.value)} /></label>
          <div className="row wrap" style={{ gap: 12 }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="field-label">Who can watch</span>
              <div className="seg" role="group" aria-label="Who can watch">{[['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']].map(([k, l]) => <button key={k} className={form.privacy === k ? 'on' : ''} onClick={() => set({ privacy: k })}>{l}</button>)}</div>
            </div>
            <label className="field grow">Add to playlist <span className="hint">Made if it isn't there yet. Leave empty to skip.</span><input className="input" value={form.playlist} placeholder="Sunday Sermons" onChange={(e) => set({ playlist: e.target.value })} /></label>
          </div>
        </div>
      )}
    </Modal>
  );
}
