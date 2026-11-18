import { Check, X } from 'lucide-react';
import { useApp } from '../App.jsx';

/**
 * A setup checklist card. Hides itself when every step is done or when the person closes it
 * with the X (remembered per workspace in config.dismissed).
 */
export default function SetupChecklist({ id, eyebrow = 'Getting started', title, steps }) {
  const { config, saveConfig } = useApp();
  if (config.dismissed?.[id]) return null;
  const done = steps.filter((s) => s.ok).length;
  if (done === steps.length) return null;
  return (
    <section className="glass panel stack setup-card" style={{ gap: 12 }}>
      <button className="setup-close" aria-label="Hide this checklist" title="Hide this checklist"
        onClick={() => saveConfig({ dismissed: { ...(config.dismissed || {}), [id]: true } })}><X size={16} /></button>
      <div className="stack" style={{ gap: 2, paddingRight: 36 }}>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{typeof title === 'function' ? title(done, steps.length) : title}</h2>
      </div>
      <div className="meter" aria-hidden="true"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <div className="checklist">
        {steps.map((s) => (
          <div key={s.label} className={`check-row ${s.ok ? 'done' : ''}`}>
            <span className="check">{s.ok && <Check size={15} />}</span>
            <div className="stack" style={{ gap: 0 }}><strong className="label">{s.label}</strong><span className="muted small">{s.help}</span></div>
            {!s.ok && s.action && <button className="btn sm" onClick={s.action}>{s.cta}</button>}
          </div>
        ))}
      </div>
    </section>
  );
}
