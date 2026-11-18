import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { TOOLS } from '../tools.js';

/**
 * Turn tools on or off and drag them into order. value = { order, off }.
 * `reorder` false shows only the switches (used in the welcome window).
 */
export default function ToolPicker({ order, off, onChange, reorder = true }) {
  const base = (order || []).filter((id) => TOOLS.some((t) => t.id === id));
  const ids = [...base, ...TOOLS.map((t) => t.id).filter((id) => !base.includes(id))];
  const [dragging, setDragging] = useState(null);
  const offSet = new Set(off || []);
  const move = (from, to) => { if (to < 0 || to >= ids.length) return; const next = [...ids]; const [x] = next.splice(from, 1); next.splice(to, 0, x); onChange({ order: next, off: [...offSet] }); };
  const toggle = (id) => { const s = new Set(offSet); if (s.has(id)) s.delete(id); else s.add(id); onChange({ order: ids, off: [...s] }); };
  return (
    <div className="tool-list" role="list">
      {ids.map((id, k) => {
        const t = TOOLS.find((x) => x.id === id);
        const on = !offSet.has(id);
        return (
          <div key={id} role="listitem" className={`tool-row ${on ? '' : 'off'} ${dragging === k ? 'dragging' : ''}`}
            draggable={reorder} onDragStart={() => setDragging(k)} onDragEnd={() => setDragging(null)}
            onDragOver={(e) => { e.preventDefault(); if (dragging != null && dragging !== k) { move(dragging, k); setDragging(k); } }}>
            {reorder && <GripVertical size={16} className="muted grip" aria-hidden="true" />}
            <span className="type-badge" style={{ width: 34, height: 34, '--t': `var(--tone-${(k % 6) + 1})` }}><t.icon size={17} /></span>
            <div className="stack grow" style={{ gap: 1 }}>
              <strong>{reorder ? t.label : t.work}</strong>
              <span className="small muted">{t.about}</span>
            </div>
            {reorder && (
              <div className="row" style={{ gap: 2 }}>
                <button className="rt-btn" aria-label={`Move ${t.label} up`} disabled={k === 0} onClick={() => move(k, k - 1)}><ArrowUp size={14} /></button>
                <button className="rt-btn" aria-label={`Move ${t.label} down`} disabled={k === ids.length - 1} onClick={() => move(k, k + 1)}><ArrowDown size={14} /></button>
              </div>
            )}
            <label className="switch"><input type="checkbox" checked={on} onChange={() => toggle(id)} aria-label={`${on ? 'Turn off' : 'Turn on'} ${t.label}`} /></label>
          </div>
        );
      })}
    </div>
  );
}
