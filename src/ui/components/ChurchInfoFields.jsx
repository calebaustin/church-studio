import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';

const FIELDS = [
  ['name', 'Church name', 'Grace Community Church'],
  ['times', 'Service times', 'Sundays at 9 and 11am'],
  ['address', 'Address', '123 Main St, Peachtree City, GA'],
  ['website', 'Website', 'gracecommunity.org'],
  ['phone', 'Phone', '(770) 555-0100'],
  ['email', 'Email', 'hello@gracecommunity.org'],
];

/** Church name, times, address and contact. Saves as you type (after a short pause). */
export default function ChurchInfoFields() {
  const { config, saveConfig } = useApp();
  const [info, setInfo] = useState(config.churchInfo || {});
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (k, v) => {
    const next = { ...info, [k]: v };
    setInfo(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveConfig({ churchInfo: next }), 600);
  };
  return (
    <div className="token-grid">
      {FIELDS.map(([k, label, ph]) => (
        <label key={k} className="field">{label}<input className="input" value={info[k] || ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></label>
      ))}
    </div>
  );
}
