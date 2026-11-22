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
  const [asking, setAsking] = useState(null); // the step showing "Done?" before it is checked off by hand
  if (config.dismissed?.[id]) return null;
  // A step can be checked off by hand when it was done another way the app didn't notice.
  const marked = config.checked || {};
  steps = steps.map((s) => ({ ...s, ok: s.ok || Boolean(marked[`${id}:${s.label}`]) }));
  const markDone = (s) => { saveConfig({ checked: { ...marked, [`${id}:${s.label}`]: true } }); setAsking(null); };
  const done = steps.filter((s) => s.ok).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.ok);
  const setOpen = (v) => { setOpenState(v); saveConfig({ dismissed: { ...(config.dismissed || {}), [openKey]: v } }); };
  const Row = (s) => (
    <div key={s.label} className={`check-row ${s.ok ? 'done' : ''}`}>
      {s.ok ? <span className="check"><Check size={15} /></span> : (
        <button type="button" className={`check check-btn${asking === s.label ? ' asking' : ''}`} aria-label={asking === s.label ? `Mark “${s.label}” done` : `Already did “${s.label}”? Check it off`}
          title={asking === s.label ? 'Click again to check it off' : 'Already done? Check it off'}
          onClick={() => (asking === s.label ? markDone(s) : setAsking(s.label))} onBlur={() => setAsking((a) => (a === s.label ? null : a))}>
          <Check size={13} className="check-hint" />
          {asking === s.label && <span className="check-ask" role="status">Done?</span>}
        </button>
      )}
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
