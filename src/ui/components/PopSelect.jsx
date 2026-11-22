import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import Popover from './Popover.jsx';

/**
 * A themed dropdown: the choice on the left, a short note on the right (like how long it takes).
 * options: [{ value, label, info }]
 */
export default function PopSelect({ value, onChange, options, label, width = '100%' }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div className="stack" style={{ gap: 6, position: 'relative', width }}>
      {label && <span className="field-label">{label}</span>}
      <button type="button" className="font-trigger pop-select" data-pop-trigger aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="truncate">{current?.label}</span>
        {current?.info && <span className="pop-select-info truncate">{current.info}</span>}
        <ChevronDown size={15} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={340}>
        <div className="pop-list" role="listbox">
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={`pop-item pop-select-row ${o.value === value ? 'on' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
              <span className="row" style={{ gap: 6 }}>{o.value === value ? <Check size={13} /> : <span style={{ width: 13 }} />}<strong className="small">{o.label}</strong></span>
              {o.info && <span className="pop-hint">{o.info}</span>}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
