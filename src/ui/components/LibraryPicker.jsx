import { useEffect, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { api, desktop } from '../api.js';
import Modal from './Modal.jsx';

/** Pick an image from the brand library. Used by Graphics and the clip editor. */
export default function LibraryPicker({ onPick, onClose, folder: startFolder = 'All', title = 'Pick from your brand library' }) {
  const [lib, setLib] = useState(null);
  const [folder, setFolder] = useState(startFolder);
  const load = () => api.get('/api/library').then(setLib);
  useEffect(() => { load(); }, []);
  const items = (lib?.items || []).filter((i) => i.kind === 'image' && (folder === 'All' || i.folder === folder));
  return (
    <Modal onClose={onClose} width={820} label={title}>
      <div className="row between wrap">
        <h2>{title}</h2>
        <div className="row">
          {desktop?.pickFiles && <button className="btn sm" onClick={async () => { const paths = await desktop.pickFiles(); if (paths.length) { await api.post('/api/library/import', { paths, folder: folder === 'All' ? 'Photos' : folder }); load(); } }}><Plus size={14} />Add files</button>}
          <button className="btn sm ghost" onClick={() => api.post('/api/library/open', {})}><FolderOpen size={14} />Open folder</button>
        </div>
      </div>
      <div className="seg">{['All', ...(lib?.folders || []).filter((f) => f !== 'Writing')].map((f) => <button key={f} className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>{f}</button>)}</div>
      {!lib && <div className="lib-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />)}</div>}
      {lib && !items.length && <div className="empty"><p>No images here yet. Drop files into the folder in Finder, or press Add files.</p></div>}
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
