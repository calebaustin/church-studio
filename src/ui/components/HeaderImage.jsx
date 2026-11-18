import { useEffect, useState } from 'react';
import { Clapperboard, ImagePlus, Palette, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import ColorField from './ColorField.jsx';
import LibraryPicker from './LibraryPicker.jsx';
import Modal from './Modal.jsx';

const libUrl = (rel) => `/library/${rel.split('/').map(encodeURIComponent).join('/')}`;

/** Sermon stills: frames from strong moments in the sermon video, to use as a header. */
function StillPicker({ pid, onPick, onClose }) {
  const [stills, setStills] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/api/projects/${pid}/stills`).then((r) => setStills(r.stills)).catch((e) => { setErr(e.message); setStills([]); }); }, [pid]);
  const use = async (s) => {
    setBusy(s.t);
    try { const r = await api.post(`/api/projects/${pid}/stills`, { t: s.t }); onPick(r); } catch (e) { setErr(e.message); setBusy(null); }
  };
  return (
    <Modal onClose={onClose} width={760} label="Pick a still from the sermon">
      <div className="stack" style={{ gap: 2 }}><h2>A still from the sermon</h2><span className="muted small">Frames from strong moments in the message. The one you pick is saved to Photos in your brand library.</span></div>
      {err && <div className="banner bad">{err}</div>}
      {!stills && <div className="still-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '16/9' }} />)}</div>}
      {stills && !stills.length && !err && <p className="muted">No stills available. Is the video still downloaded?</p>}
      <div className="still-grid">
        {stills?.map((s) => (
          <button key={s.t} className="still" disabled={busy != null} onClick={() => use(s)}>
            <img src={s.url} alt="" />
            <span className="num">{Math.floor(s.t / 60)}:{String(Math.floor(s.t % 60)).padStart(2, '0')}{busy === s.t ? ' · saving…' : ''}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Header image for a writing draft. value: { rel, style: 'full' | 'blur' | 'color', color }.
 * Guides can be full width, a blurred photo band or a solid color band; blog posts and emails use full width.
 */
export default function HeaderImage({ pid, value, onChange, title, styles = ['full'], brandColors = [] }) {
  const [pick, setPick] = useState(null); // 'library' | 'still'
  const v = value || null;
  const style = v?.style || 'full';
  const url = v?.rel ? libUrl(v.rel) : null;
  const choose = (rel) => { onChange({ ...(v || {}), rel, style: v?.style || styles[0] }); setPick(null); };
  return (
    <section className="glass panel stack" style={{ gap: 12 }}>
      <div className="row between wrap">
        <h3 style={{ margin: 0 }}>Header</h3>
        {styles.length > 1 && (
          <div className="seg sm">
            {[['full', 'Full width'], ['blur', 'Blurred'], ['color', 'Color']].filter(([k]) => styles.includes(k)).map(([k, l]) => (
              <button key={k} className={(v ? style : '') === k ? 'on' : ''} onClick={() => onChange({ ...(v || {}), style: k, color: v?.color || brandColors[0] || '#2B7F5F' })}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {v && (url || style === 'color') ? (
        <div className={`hdr-preview ${style}`} style={style === 'color' ? { background: v.color || brandColors[0] } : undefined}>
          {url && style !== 'color' && <img src={url} alt="" />}
          {style !== 'full' && <strong className="hdr-title">{title}</strong>}
        </div>
      ) : (
        <div className="hdr-empty"><ImagePlus size={22} /><span>Add a photo, a graphic, or a still from the sermon video.</span></div>
      )}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => setPick('library')}><ImagePlus size={13} />{url ? 'Change' : 'From library'}</button>
        {pid && <button className="btn sm" onClick={() => setPick('still')}><Clapperboard size={13} />Sermon still</button>}
        {style === 'color' && v && <ColorField label="Band color" value={v.color || brandColors[0] || '#2B7F5F'} onChange={(c) => onChange({ ...v, color: c })} swatches={brandColors} />}
        {v && <button className="btn ghost sm danger" onClick={() => onChange(null)}><Trash2 size={13} />Remove</button>}
        {styles.includes('color') && !v && <button className="btn ghost sm" onClick={() => onChange({ style: 'color', color: brandColors[0] || '#2B7F5F' })}><Palette size={13} />Color band</button>}
      </div>
      {pick === 'library' && <LibraryPicker title="Pick a header image" onClose={() => setPick(null)} onPick={(i) => choose(i.rel)} />}
      {pick === 'still' && <StillPicker pid={pid} onClose={() => setPick(null)} onPick={(r) => choose(r.rel)} />}
    </section>
  );
}
