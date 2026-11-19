import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { useApp } from '../App.jsx';

/**
 * A setup checklist card. Folded by default: it shows progress and just the next step, with a
 * button to see every step. Hides itself when every step is done or when the person closes it
 * with the X (remembered per workspace in config.dismissed). Open or folded is remembered too.
 */
export default function SetupChecklist({ id, eyebrow = 'Getting started', title, steps }) {
  const { config, saveConfig } = useApp();
  const openKey = `${id}:open`;
  const [open, setOpenState] = useState(Boolean(config.dismissed?.[openKey]));
  if (config.dismissed?.[id]) return null;
  const done = steps.filter((s) => s.ok).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.ok);
  const setOpen = (v) => { setOpenState(v); saveConfig({ dismissed: { ...(config.dismissed || {}), [openKey]: v } }); };
  const Row = (s) => (
    <div key={s.label} className={`check-row ${s.ok ? 'done' : ''}`}>
      <span className="check">{s.ok && <Check size={15} />}</span>
      <div className="stack" style={{ gap: 0 }}><strong className="label">{s.label}</strong><span className="muted small">{s.help}</span></div>
      {!s.ok && s.action && <button className="btn sm" onClick={s.action}>{s.cta}</button>}
    </div>
  );
  return (
    <section className={`glass panel stack setup-card ${open ? '' : 'folded'}`} style={{ gap: open ? 12 : 10 }}>
      <div className="setup-tools">
        <button className="setup-close" style={{ position: 'static' }} aria-expanded={open} aria-label={open ? 'Show only the next step' : 'Show every step'} title={open ? 'Fold' : 'Show every step'} onClick={() => setOpen(!open)}>
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--fast) var(--ease)' }} />
        </button>
        <button className="setup-close" style={{ position: 'static' }} aria-label="Hide this checklist" title="Hide this checklist"
          onClick={() => saveConfig({ dismissed: { ...(config.dismissed || {}), [id]: true } })}><X size={16} /></button>
      </div>
      <div className="row" style={{ gap: 12, paddingRight: 76 }}>
        <div className="stack grow" style={{ gap: 2 }}>
          <span className="eyebrow">{eyebrow} · {done} of {steps.length}</span>
          {open && <h2>{typeof title === 'function' ? title(done, steps.length) : title}</h2>}
        </div>
      </div>
      <div className="meter" aria-hidden="true"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <div className="checklist">{open ? steps.map(Row) : Row({ ...next, label: `Next: ${next.label}` })}</div>
    </section>
  );
}
