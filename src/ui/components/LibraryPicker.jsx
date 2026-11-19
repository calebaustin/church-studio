import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Laptop, Search } from 'lucide-react';
import { api, desktop } from '../api.js';
import Modal from './Modal.jsx';

const readAsDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/**
 * Pick a picture from the brand library, or bring one in from this computer (made in Canva,
 * Photoshop, Affinity or anything else). Used by Design, the clip editor and Writing.
 * A picture brought in is saved to the brand library first, then picked.
 */
export default function LibraryPicker({ onPick, onClose, folder: startFolder = 'All', title = 'Pick from your brand library' }) {
  const [lib, setLib] = useState(null);
  const [folder, setFolder] = useState(startFolder);
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const load = () => api.get('/api/library').then(setLib);
  useEffect(() => { load(); }, []);
  const target = folder === 'All' || folder === 'Writing' ? (startFolder === 'Logos' ? 'Logos' : 'Photos') : folder;
  const items = (lib?.items || []).filter((i) => i.kind === 'image' && (folder === 'All' || i.folder === folder) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));

  // Bring files in, then pick the first one so it lands where it was wanted.
  const finish = async (rels) => {
    const fresh = await api.get('/api/library');
    setLib(fresh);
    const first = fresh.items.find((i) => i.rel === rels[0]);
    if (first) onPick(first);
  };
  const fromComputer = async () => {
    setError(null);
    if (desktop?.pickFiles) {
      const paths = await desktop.pickFiles({ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic'], multi: false });
      if (!paths.length) return;
      setBusy(true);
      try { const r = await api.post('/api/library/import', { paths, folder: target }); await finish(r.rels || []); } catch (e) { setError(e.message); }
      setBusy(false);
    } else input.current?.click();
  };
  const fromFiles = async (files) => {
    const pics = [...files].filter((f) => /^image\/(png|jpeg)$/.test(f.type));
    if (!pics.length) { setError(files.length ? 'Drop a PNG or JPEG here, or use From your computer for other kinds.' : null); return; }
    setBusy(true); setError(null);
    try {
      const rels = [];
      for (const f of pics) rels.push((await api.post('/api/library/save', { folder: target, name: f.name.replace(/\.[a-z0-9]+$/i, ''), dataUrl: await readAsDataUrl(f) })).rel);
      await finish(rels);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <Modal onClose={onClose} width={860} label={title}>
      <div className={`picker-drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); fromFiles(e.dataTransfer.files); }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <h2>{title}</h2>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary sm" disabled={busy} onClick={fromComputer}><Laptop size={14} />{busy ? 'Adding…' : 'From your computer'}</button>
            <button className="btn sm ghost" onClick={() => api.post('/api/library/open', {})}><FolderOpen size={14} />Open folder</button>
          </div>
        </div>
        <span className="hint">Made it somewhere else, like Canva or Photoshop? Bring it in from your computer or drop it here. It’s saved to your brand library too.</span>
        <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { fromFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <div className="banner bad">{error}</div>}
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="seg">{['All', ...(lib?.folders || []).filter((f) => f !== 'Writing')].map((f) => <button key={f} className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>{f}</button>)}</div>
        <label className="search-mini"><Search size={14} /><input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {!lib && <div className="lib-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />)}</div>}
      {lib && !items.length && <div className="empty"><p>{q ? 'Nothing matches.' : 'No pictures here yet. Bring one in from your computer.'}</p></div>}
      <div className="lib-grid">
        {items.map((i) => (
          <button key={i.rel} className="lib-item" onClick={() => onPick(i)} title={i.name}>
            <img src={i.url} alt="" loading="lazy" />
            <span className="truncate">{i.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
