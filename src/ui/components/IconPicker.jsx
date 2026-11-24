import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';
import ColorField from './ColorField.jsx';

const STYLES = [['', 'Any'], ['line', 'Line'], ['solid', 'Solid'], ['duotone', 'Two-tone']];

/**
 * Search over 25,000 icons and shapes from open-source sets, offline. Picking one saves it to the brand library
 * as an SVG in the color chosen here, and every color in it can be changed later in Design. onPick({ rel, name }).
 */
export default function IconPicker({ onClose, onPick, colors = [] }) {
  const [q, setQ] = useState('');
  const [style, setStyle] = useState('');
  const [set, setSet] = useState('');
  const [sets, setSets] = useState([]);
  const [list, setList] = useState(null);
  const [color, setColor] = useState(colors[2] || colors[0] || '#1B2440');
  const [busy, setBusy] = useState(null);
  const t = useRef(null);
  useEffect(() => { api.get('/api/icons/sets').then((r) => setSets(r.sets)).catch(() => {}); }, []);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const p = new URLSearchParams({ q, style, set });
      api.get(`/api/icons/search?${p}`).then((r) => setList(r.icons)).catch(() => setList([]));
    }, q ? 160 : 0);
    return () => clearTimeout(t.current);
  }, [q, style, set]);
  const pick = async (ic) => {
    setBusy(ic.id);
    try { const r = await api.post('/api/icons/save', { id: ic.id, color }); onPick({ ...r, name: ic.name }); } catch { setBusy(null); }
  };
  return (
    <Modal onClose={onClose} width={760} label="Icons and shapes">
      <ModalHead title="Icons and shapes" sub="Over 25,000, from open-source sets, ready offline. Every color can be changed after you add one." />
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="input-affix grow" style={{ minWidth: 220 }}><Search size={14} className="muted" /><input className="input" autoFocus placeholder="Search, like cross, dove, calendar or arrow" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ColorField value={color} swatches={colors} onChange={setColor} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="seg" role="group" aria-label="Style">{STYLES.map(([k, l]) => <button key={k} className={style === k ? 'on' : ''} onClick={() => setStyle(k)}>{l}</button>)}</div>
        <div className="seg" role="group" aria-label="Icon set">
          <button className={!set ? 'on' : ''} onClick={() => setSet('')}>All sets</button>
          {sets.map((s) => <button key={s.prefix} className={set === s.prefix ? 'on' : ''} onClick={() => setSet(s.prefix)}>{s.name.replace(/ Icons?$/, '')}</button>)}
        </div>
      </div>
      {!list ? <div className="skeleton" style={{ height: 320 }} /> : !list.length ? <p className="muted">Nothing matches. Try a simpler word, like “book” instead of “Bible study”.</p> : (
        <div className="icon-grid" role="list">
          {list.map((ic) => (
            <button key={ic.id} type="button" role="listitem" className={`icon-cell ${busy === ic.id ? 'busy' : ''}`} title={`${ic.name} · ${ic.set}`} aria-label={`${ic.name}, ${ic.style}, ${ic.set}`} disabled={Boolean(busy)} onClick={() => pick(ic)}>
              {/* Bundled open-source icon artwork, drawn in the picked color. */}
              <svg viewBox={`0 0 ${ic.w} ${ic.h}`} style={{ color }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ic.body }} />
              <span className="icon-name truncate">{ic.name}</span>
            </button>
          ))}
        </div>
      )}
      <span className="hint">Icons from Tabler, Lucide, Phosphor and Material Design Icons, shared under open licenses. See Settings › Thank you.</span>
    </Modal>
  );
}
