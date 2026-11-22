import { useState } from 'react';
import { ArrowDown, ArrowUp, Columns2, Film, Plus, Rows2, X } from 'lucide-react';
import { api, desktop } from '../api.js';
import { useApp } from '../App.jsx';
import Modal, { ModalHead } from './Modal.jsx';

const LAYOUTS = [
  ['sequence', 'One after another', 'Like a Reel made of a few clips', Film],
  ['side', 'Side by side', 'Two people talking, each on their own camera', Columns2],
  ['stack', 'Top and bottom', 'The same conversation, laid out for a vertical video', Rows2],
];
const SHAPES = [['vertical', 'Vertical 9:16'], ['square', 'Square'], ['wide', 'Wide 16:9']];
const name = (p) => String(p).split('/').pop();

/**
 * Put a few videos together into one, then edit it like any other video. A sequence plays them in order;
 * side by side and top and bottom play them at the same time, with a start offset to line up two cameras.
 */
export default function CombineVideos({ onClose }) {
  const { trackJob, toast } = useApp();
  const [files, setFiles] = useState([]); // { path, trim }
  const [layout, setLayout] = useState('sequence');
  const [shape, setShape] = useState('vertical');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const paths = await desktop?.pickFiles?.({ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] });
    if (paths?.length) setFiles((f) => [...f, ...paths.map((p) => ({ path: p, trim: 0 }))].slice(0, 12));
  };
  const move = (i, d) => setFiles((f) => { const n = [...f]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const together = layout !== 'sequence';
  const tooMany = together && files.length > 4;
  const go = async () => {
    setBusy(true);
    try {
      const { job } = await api.post('/api/projects/combine', { files, layout, shape, title });
      trackJob(job);
      toast({ text: 'Putting your videos together. It opens when it’s ready.' });
      onClose();
    } catch (e) { toast({ kind: 'error', text: e.message }); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} width={620} label="Combine videos"
      footer={<div className="row between" style={{ gap: 8 }}><span className="small muted">{files.length < 2 ? 'Add at least two videos.' : tooMany ? 'Side by side and top and bottom take up to 4 videos.' : `${files.length} videos`}</span><button className="btn primary" disabled={busy || files.length < 2 || tooMany} onClick={go}>Combine</button></div>}>
      <ModalHead title="Combine videos" sub="Put a few videos together, then caption, clip and export it like any other video." />
      <div className="combine-layouts">
        {LAYOUTS.map(([id, label, hint, I]) => (
          <button key={id} className={`combine-layout ${layout === id ? 'on' : ''}`} aria-pressed={layout === id} onClick={() => setLayout(id)}>
            <I size={20} /><strong className="small">{label}</strong><span className="small muted">{hint}</span>
          </button>
        ))}
      </div>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="seg" role="group" aria-label="Shape">{SHAPES.map(([id, label]) => <button key={id} className={shape === id ? 'on' : ''} onClick={() => setShape(id)}>{label}</button>)}</div>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {files.map((f, i) => (
          <div key={`${f.path}-${i}`} className="combine-file">
            <span className="combine-n">{i + 1}</span>
            <span className="grow truncate small" title={f.path}>{name(f.path)}</span>
            <label className="row small muted" style={{ gap: 6 }} title={together ? 'Skip this many seconds at the start, to line it up with the others' : 'Skip this many seconds at the start'}>
              {together ? 'Line up: skip' : 'Skip'}
              <input className="input combine-trim" type="number" min="0" step="0.1" value={f.trim} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, trim: Number(e.target.value) || 0 } : x)))} />s
            </label>
            <button className="rt-btn" disabled={i === 0} aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
            <button className="rt-btn" disabled={i === files.length - 1} aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
            <button className="rt-btn" aria-label={`Remove ${name(f.path)}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        {desktop?.pickFiles ? <button className="btn" onClick={add}><Plus size={14} />{files.length ? 'Add more videos' : 'Add videos'}</button>
          : <span className="small muted">Open the Church Studio app to pick videos from this Mac.</span>}
      </div>
    </Modal>
  );
}
