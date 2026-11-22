import { useEffect, useState } from 'react';
import { Check, Scissors } from 'lucide-react';
import Toggle from './Toggle.jsx';
import { api } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';

const libUrl = (rel) => `/library/${rel.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Cut people or things out of a picture: Church Studio finds each subject, you click the ones to keep, and it
 * saves them on a see-through background next to the original (the original stays). onSaved({ rel }).
 */
export default function SubjectCutout({ rel, onClose, onSaved }) {
  const [found, setFound] = useState(null); // { subjects: [{ index, box, mask }] }
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [crop, setCrop] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.post('/api/library/subjects', { rel }).then((r) => { setFound(r); setPicked(new Set(r.subjects.map((s) => s.index))); }).catch((e) => setError(e.message));
  }, [rel]);
  const toggle = (i) => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const save = async () => {
    setBusy(true);
    try { const r = await api.post('/api/library/cutout', { rel, picks: [...picked], crop }); onSaved?.(r); } catch (e) { setError(e.message); setBusy(false); }
  };
  const subjects = found?.subjects || [];
  return (
    <Modal onClose={onClose} width={760} label="Cut out subjects"
      footer={<div className="row between" style={{ gap: 8 }}>
        <Toggle checked={crop} onChange={(e) => setCrop(e.target.checked)} icon={Scissors} label="Trim to the subjects" small />
        <button className="btn primary" disabled={busy || !picked.size} onClick={save}><Scissors size={15} />{busy ? 'Cutting out…' : `Cut out ${picked.size === subjects.length && subjects.length > 1 ? 'all' : picked.size || ''}`.trim()}</button>
      </div>}>
      <ModalHead title="Cut out subjects" sub="Click the people or things to keep. They're saved on a see-through background next to the original." />
      {error && <div className="banner bad">{error}</div>}
      {!found && !error && <div className="skeleton" style={{ height: 360 }} aria-label="Finding the subjects…" />}
      {found && !subjects.length && <p className="muted">No clear subject in this picture. Pictures of people, pets or objects against a background work best.</p>}
      {subjects.length > 0 && (
        <>
          <div className="cutout-stage"><div className="cutout-frame">
            <img src={libUrl(rel)} alt="" />
            {/* Each subject, tinted where it is: picked ones in the accent color. */}
            {subjects.map((s) => (
              <span key={s.index} className={`cutout-mask ${picked.has(s.index) ? 'on' : ''}`} style={{ WebkitMaskImage: `url(${s.mask})`, maskImage: `url(${s.mask})` }} aria-hidden="true" />
            ))}
            {subjects.map((s, k) => (
              <button key={`b${s.index}`} type="button" className={`cutout-hit ${picked.has(s.index) ? 'on' : ''}`} aria-pressed={picked.has(s.index)} aria-label={`Subject ${k + 1}`}
                style={{ left: `${s.box[0] * 100}%`, top: `${s.box[1] * 100}%`, width: `${s.box[2] * 100}%`, height: `${s.box[3] * 100}%` }} onClick={() => toggle(s.index)}>
                <span className="cutout-tag">{picked.has(s.index) && <Check size={11} />}{k + 1}</span>
              </button>
            ))}
          </div></div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small muted">{subjects.length} subject{subjects.length === 1 ? '' : 's'} found.</span>
            {subjects.length > 1 && <button className="btn ghost sm" onClick={() => setPicked(new Set(subjects.map((s) => s.index)))}>Pick all</button>}
            {subjects.length > 1 && <button className="btn ghost sm" onClick={() => setPicked(new Set())}>Clear</button>}
          </div>
        </>
      )}
    </Modal>
  );
}
