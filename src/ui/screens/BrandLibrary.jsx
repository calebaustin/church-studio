import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Image as ImageIcon, Film, FileText, Shapes, Eye } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, desktop } from '../api.js';

const ICON = { image: ImageIcon, video: Film, doc: FileText };

export default function BrandLibrary() {
  const { go, onJobFinished } = useApp();
  const [lib, setLib] = useState(null);
  const [folder, setFolder] = useState('All');
  const [q, setQ] = useState('');
  const load = () => api.get('/api/library').then(setLib);
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);
  useEffect(() => onJobFinished(() => load()), [onJobFinished]);
  const items = (lib?.items || []).filter((i) => (folder === 'All' || i.folder === folder) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const counts = Object.fromEntries((lib?.folders || []).map((f) => [f, (lib?.items || []).filter((i) => i.folder === f).length]));
  return (
    <div className="page">
      <div className="row between wrap">
        <div className="stack" style={{ gap: 2 }}>
          <h1>Brand library</h1>
          <span className="muted">Photos, logos and graphics you reuse. It's a normal folder, so you can add files in Finder too.</span>
        </div>
        <div className="row">
          {desktop?.pickFiles && <button className="btn" onClick={async () => { const paths = await desktop.pickFiles(); if (paths.length) { await api.post('/api/library/import', { paths, folder: folder === 'All' || folder === 'Writing' ? 'Photos' : folder }); load(); } }}><Plus size={15} />Add files</button>}
          <button className="btn primary" onClick={() => api.post('/api/library/open', { folder: folder === 'All' ? null : folder })}><FolderOpen size={15} />Open in Finder</button>
        </div>
      </div>
      <div className="row between wrap">
        <div className="seg">{['All', ...(lib?.folders || [])].map((f) => <button key={f} className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>{f}{f !== 'All' && counts[f] ? ` · ${counts[f]}` : ''}</button>)}</div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {lib && <span className="muted small truncate" title={lib.root}>{lib.root.replace(/^\/Users\/[^/]+/, '~')}</span>}
      {!lib && <div className="lib-grid big">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />)}</div>}
      {lib && !items.length && (
        <div className="glass empty">
          <FolderOpen size={40} />
          <h3>{q ? 'No files match' : 'Nothing here yet'}</h3>
          <p>Add photos, logos and brand files. Graphics you make here land in the Graphics folder.</p>
          <div className="row"><button className="btn primary" onClick={() => api.post('/api/library/open', {})}>Open in Finder</button><button className="btn" onClick={() => go({ name: 'graphics' })}><Shapes size={14} />Make a graphic</button></div>
        </div>
      )}
      <div className="lib-grid big">
        {items.map((i) => {
          const I = ICON[i.kind];
          return (
            <div key={i.rel} className="glass lib-card">
              <div className="lib-thumb">{i.kind === 'image' ? <img src={i.url} alt="" loading="lazy" /> : <I size={36} />}</div>
              <div className="stack" style={{ gap: 4, padding: '8px 10px 10px' }}>
                <strong className="truncate small" title={i.name}>{i.name}</strong>
                <span className="muted small">{i.folder} · {i.bytes > 1048576 ? `${(i.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(i.bytes / 1024))} KB`}</span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn icon sm" title="Show in Finder" aria-label="Show in Finder" onClick={() => api.post('/api/library/reveal', { rel: i.rel })}><Eye size={14} /></button>
                  {i.kind === 'image' && <button className="btn sm" onClick={() => go({ name: 'graphics', image: i.rel })}><Shapes size={13} />Use in a graphic</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
