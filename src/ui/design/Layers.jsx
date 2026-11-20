// The layers on a page, front to back. Click one to select it; drag to change what's in front.
import { useState } from 'react';
import { Eraser, GripVertical, Image as ImageIcon, QrCode, Shapes, Trash2, Type } from 'lucide-react';

const ICON = { text: Type, shape: Shapes, image: ImageIcon, qr: QrCode };
export const label = (it) => {
  if (it.type === 'text') return it.text.replace(/\s+/g, ' ').slice(0, 32) || 'Text';
  if (it.type === 'image') return (it.rel || 'Image').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  if (it.type === 'qr') return 'QR code';
  if (it.erase) return `Eraser${it.depth > 0 ? ` (${it.depth} under it)` : ''}`;
  if (it.frame || it.photo) return it.photo ? 'Photo' : 'Photo spot';
  return { rect: 'Rectangle', ellipse: 'Circle', hexagon: 'Hexagon', arch: 'Arch', blob: 'Blob', wave: 'Wavy frame', scallop: 'Badge', burst: 'Starburst', window: 'Window card', iphone: 'iPhone', macbook: 'MacBook' }[it.shape] || 'Shape';
};

export default function Layers({ items, sel, onSelect, onMove, onDelete }) {
  const [drag, setDrag] = useState(null); // index being dragged (in page order)
  const [over, setOver] = useState(null);
  const n = items.length;
  // Shown front first, so the top of the list is what's on top of the page.
  const rows = items.map((it, i) => ({ it, i })).reverse();
  if (!n) return <div className="stack" style={{ gap: 4 }}><span className="eyebrow">Layers</span><span className="muted small">Nothing on this page yet.</span></div>;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="eyebrow">Layers · front to back</span>
      <div className="layers" role="list">
        {rows.map(({ it, i }) => {
          const Icon = it.erase ? Eraser : ICON[it.type] || Shapes;
          return (
            <div key={it.id} role="listitem" draggable
              className={`layer ${it.id === sel ? 'on' : ''} ${over === i && drag !== i ? 'over' : ''}`}
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (drag != null && drag !== i) onMove(drag, i); setDrag(null); setOver(null); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onClick={() => onSelect(it.id)}>
              <GripVertical size={13} className="muted" aria-hidden="true" />
              <span className="layer-icon">{it.type === 'text' ? <span style={{ color: it.color, fontWeight: 800 }}>T</span> : it.type === 'shape' && !it.photo && !it.erase ? <i style={{ background: it.fill || '#ccc' }} /> : <Icon size={13} />}</span>
              <span className="small truncate grow">{label(it)}</span>
              <button className="rt-btn layer-del" aria-label={`Delete ${label(it)}`} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(it.id); }}><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
