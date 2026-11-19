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
