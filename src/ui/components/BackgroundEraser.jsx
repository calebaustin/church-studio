import { useEffect, useRef, useState } from 'react';
import Toggle from './Toggle.jsx';
import { Eraser, Crop } from 'lucide-react';
import { api } from '../api.js';
import { erase, loadImage } from '../eraseBackground.js';
import Modal, { ModalHead } from './Modal.jsx';

const libUrl = (rel) => `/library/${rel.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Clear a plain background off a brand library picture. Saves a new PNG next to the original,
 * so the original is never lost. onSaved({ rel }) gets the new file.
 */
export default function BackgroundEraser({ rel, onClose, onSaved }) {
  const [img, setImg] = useState(null);
  const [error, setError] = useState(null);
  const [o, setO] = useState({ tolerance: 0.16, mode: 'edges', trim: true });
  const [on, setOn] = useState('checker'); // preview background
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef(null);
  const name = rel.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  const folder = rel.split('/')[0];

  useEffect(() => { loadImage(libUrl(rel)).then(setImg).catch((e) => setError(e.message)); }, [rel]);
  useEffect(() => {
    if (!img || !preview.current) return undefined;
    const t = setTimeout(() => {
      const r = erase(img, { ...o, max: 720 });
      const c = preview.current;
      if (!c) return;
      c.width = r.canvas.width; c.height = r.canvas.height;
      c.getContext('2d').drawImage(r.canvas, 0, 0);
      setInfo({ bg: r.bg, cleared: r.cleared });
    }, 60);
    return () => clearTimeout(t);
  }, [img, o]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = erase(img, o);
      const out = await api.post('/api/library/save', { folder: ['Logos', 'Photos', 'Graphics', 'Brand'].includes(folder) ? folder : 'Photos', name: `${name} (no background)`, dataUrl: r.canvas.toDataURL('image/png') });
      onSaved?.(out);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose} width={760} label="Erase background"
      footer={<><span className="hint">Saves a new copy. Your original stays as it is.</span><button className="btn primary" disabled={!img || busy} onClick={save}><Eraser size={15} />{busy ? 'Saving…' : 'Save copy'}</button></>}>
      <ModalHead title="Erase background" sub="Clears a plain background, like white behind a logo. Works best on solid colors." />
      {error && <div className="banner bad">{error}</div>}
      <div className="eraser-grid">
        <figure className="eraser-fig">
          <div className="eraser-stage">{img && <img src={img.src} alt="Before" />}</div>
          <figcaption>Before</figcaption>
        </figure>
        <figure className="eraser-fig">
          <div className={`eraser-stage ${on}`}><canvas ref={preview} /></div>
          <figcaption>After{info?.bg ? ` · cleared ${info.bg}` : ''}</figcaption>
        </figure>
      </div>
      <div className="token-grid">
        <label className="field">Strength · {Math.round(o.tolerance * 100)}
          <input type="range" min="0.03" max="0.45" step="0.01" value={o.tolerance} onChange={(e) => setO({ ...o, tolerance: Number(e.target.value) })} />
          <span className="hint">Raise it if a halo is left. Lower it if parts of the picture disappear.</span>
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="field-label">Clear</span>
          <div className="seg sm">
            <button className={o.mode === 'edges' ? 'on' : ''} onClick={() => setO({ ...o, mode: 'edges' })}>Around the outside</button>
            <button className={o.mode === 'everywhere' ? 'on' : ''} onClick={() => setO({ ...o, mode: 'everywhere' })}>Inside letters too</button>
          </div>
          <Toggle checked={o.trim} onChange={(e) => setO({ ...o, trim: e.target.checked })} icon={Crop} label="Trim the empty edges" small />
        </div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="small muted">Check it on</span>
        <div className="seg sm">{[['checker', 'See-through'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => <button key={k} className={on === k ? 'on' : ''} onClick={() => setOn(k)}>{l}</button>)}</div>
        {info && info.cleared < 0.02 && <span className="small" style={{ color: 'var(--warn)' }}>Not much was cleared. Try more strength, or this picture may not have a plain background.</span>}
      </div>
    </Modal>
  );
}
