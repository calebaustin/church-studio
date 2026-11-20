import { useState } from 'react';
import { Sparkles, Copy, Check } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';

const libUrl = (rel) => `/library/${rel.split('/').map(encodeURIComponent).join('/')}`;

/** Alt text and tags for one picture. Helps people using screen readers, and makes photos easy to find. */
export default function PhotoNotes({ item, note, onClose, onSaved }) {
  const { config } = useApp();
  const [alt, setAlt] = useState(note?.alt || '');
  const [tags, setTags] = useState((note?.tags || []).join(', '));
  const [busy, setBusy] = useState(null); // 'suggest' | 'save'
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const aiOn = config.llmProvider && config.llmProvider !== 'none';
  const suggest = async () => {
    setBusy('suggest'); setError(null);
    try { const r = await api.post('/api/library/notes/suggest', { rel: item.rel }); setAlt(r.alt); if (r.tags?.length) setTags([...new Set([...tags.split(',').map((t) => t.trim()).filter(Boolean), ...r.tags])].join(', ')); } catch (e) { setError(e.message); }
    setBusy(null);
  };
  const save = async () => {
    setBusy('save');
    const r = await api.put('/api/library/notes', { rel: item.rel, alt, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
    onSaved?.(r.note);
  };
  return (
    <Modal onClose={onClose} width={640} label="Alt text"
      footer={<><span className="hint">Paste the alt text wherever you post this picture.</span><button className="btn primary" disabled={busy === 'save'} onClick={save}>Save</button></>}>
      <ModalHead title="Alt text and tags" sub={item.name} />
      <div className="notes-grid">
        <div className="notes-thumb"><img src={libUrl(item.rel)} alt={alt || ''} /></div>
        <div className="stack" style={{ gap: 10 }}>
          <label className="field">Alt text <span className="hint">One or two sentences about what’s in the picture.</span>
            <textarea className="input" rows={4} value={alt} placeholder="Families sharing a meal at tables on the church lawn." onChange={(e) => setAlt(e.target.value)} />
          </label>
          <div className="row wrap" style={{ gap: 6 }}>
            {aiOn && <button className="btn sm" disabled={busy === 'suggest'} onClick={suggest}><Sparkles size={13} />{busy === 'suggest' ? 'Looking…' : 'Suggest'}</button>}
            {alt && <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(alt); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>}
            {!aiOn && <span className="hint">Turn on an AI helper in Settings to get suggestions.</span>}
          </div>
          <label className="field">Tags <span className="hint">Comma separated. Used when you search.</span>
            <input className="input" value={tags} placeholder="easter, kids, worship" onChange={(e) => setTags(e.target.value)} />
          </label>
          {error && <div className="banner bad">{error}</div>}
        </div>
      </div>
    </Modal>
  );
}

/**
 * After adding a batch of pictures (an event, a branding shoot): one quick question so they're
 * searchable later. Tags and a short description go on every picture in the batch.
 */
export function TagBatch({ items, onClose, onSaved }) {
  const [about, setAbout] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const list = tags.split(',').map((t) => t.trim()).filter(Boolean);
    for (const it of items) await api.put('/api/library/notes', { rel: it.rel, alt: about.trim() || undefined, tags: list });
    onSaved?.();
  };
  return (
    <Modal onClose={onClose} width={620} label="Tag these pictures"
      footer={<><button className="btn ghost" onClick={onClose}>Skip</button><button className="btn primary" disabled={busy || (!about.trim() && !tags.trim())} onClick={save}>Save to {items.length} picture{items.length === 1 ? '' : 's'}</button></>}>
      <ModalHead title={`What are ${items.length === 1 ? 'this' : 'these'}?`} sub="A few words now makes them easy to find later in search." />
      <div className="batch-thumbs">{items.slice(0, 12).map((it) => <img key={it.rel} src={libUrl(it.rel)} alt="" />)}{items.length > 12 && <span className="muted small">+{items.length - 12}</span>}</div>
      <label className="field">Describe them <span className="hint">Used as alt text. You can edit each one later.</span>
        <input className="input" autoFocus value={about} placeholder="Easter Sunday 2026, families on the front lawn" onChange={(e) => setAbout(e.target.value)} />
      </label>
      <label className="field">Tags <span className="hint">Comma separated</span>
        <input className="input" value={tags} placeholder="easter, kids, outdoor, 2026" onChange={(e) => setTags(e.target.value)} />
      </label>
    </Modal>
  );
}
