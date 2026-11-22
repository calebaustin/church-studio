import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileX2, PencilLine, Search, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { EDGE } from './Popover.jsx';

// What "delete" means for each kind of item, in plain words.
const DELETE = {
  video: { label: 'Delete project', ask: (n) => `Delete “${n}”? Its video, transcript, clips and exports are removed from this Mac. This can't be undone.` },
  sermon: { label: 'Delete project', ask: (n) => `Delete “${n}”? Its Sermon page, video, transcript, clips and exports are removed from this Mac. This can't be undone.` },
  clip: { label: 'Delete clip', ask: (n) => `Delete the clip “${n}” and its exported video? This can't be undone.` },
  design: { label: 'Move to trash', trash: true },
  writing: { label: 'Move to trash', trash: true },
  file: { label: 'Move to Trash', macTrash: true }, // a Brand library file: to the Mac's Trash, so it can be put back
};

/**
 * Right-click actions for any file or project: Rename, then Show in Finder, Delete project and Delete source file.
 * `open(event, { key, name, type })` shows the menu at the pointer. A Brand library file is { type: 'file', rel, name }. `onChanged(what)` runs after a change
 * ('renamed', 'deleted', 'trashed' or 'source').
 */
export function useItemMenu({ onChanged } = {}) {
  const [at, setAt] = useState(null); // { x, y, item }
  const open = useCallback((e, item) => {
    if (!item?.key && !item?.rel) return;
    e.preventDefault(); e.stopPropagation();
    setAt({ x: e.clientX, y: e.clientY, item });
  }, []);
  const menu = at ? <ItemMenu at={at} onClose={() => setAt(null)} onChanged={onChanged} /> : null;
  return { open, menu };
}

function ItemMenu({ at, onClose, onChanged }) {
  const { toast } = useApp();
  const { item } = at;
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [naming, setNaming] = useState(null);
  const [source, setSource] = useState(undefined); // undefined while checking, null when there's none
  const del = DELETE[item.type];

  useEffect(() => {
    let live = true;
    if (item.type === 'file') setSource(item.name);
    else if (['video', 'sermon', 'clip'].includes(item.type)) api.post('/api/finder/source', { key: item.key }).then((r) => live && setSource(r.file)).catch(() => live && setSource(null));
    else setSource(null);
    return () => { live = false; };
  }, [item.key, item.rel]);

  // At the pointer, kept inside the window.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth; const h = el.offsetHeight;
    setPos({ left: Math.max(EDGE, Math.min(at.x, window.innerWidth - EDGE - w)), top: Math.max(EDGE, Math.min(at.y, window.innerHeight - EDGE - h)) });
  }, [at.x, at.y, naming, source]);

  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const away = () => onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('contextmenu', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('contextmenu', down); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', away); window.removeEventListener('resize', away); };
  }, [onClose]);

  const run = async (fn) => { onClose(); try { await fn(); } catch (e) { toast({ kind: 'error', text: e.message }); } };
  const rename = () => run(async () => {
    const name = naming.trim();
    if (!name || name === item.name) return;
    if (item.type === 'file') await api.post('/api/library/rename', { rel: item.rel, name });
    else await api.post('/api/finder/rename', { key: item.key, name });
    toast({ text: `Renamed to “${name}”.` });
    onChanged?.('renamed');
  });
  const reveal = () => run(() => (item.type === 'file' ? api.post('/api/library/reveal', { rel: item.rel }) : api.post('/api/finder/reveal', { key: item.key })));
  const remove = () => run(async () => {
    if (del.macTrash) {
      await api.post('/api/library/trash', { rel: item.rel });
      toast({ text: `“${item.name}” moved to the Trash. You can put it back from the Trash in Finder.` });
      return onChanged?.('trashed');
    }
    if (del.trash) {
      await api.post('/api/finder/trash', { key: item.key });
      toast({ text: `“${item.name}” moved to the trash.`, action: { label: 'Undo', run: async () => { await api.post('/api/finder/restore', { key: item.key }); onChanged?.('restored'); } } });
      return onChanged?.('trashed');
    }
    if (!window.confirm(del.ask(item.name))) return;
    await api.post('/api/finder/delete-item', { key: item.key });
    toast({ text: `“${item.name}” deleted.` });
    onChanged?.('deleted');
  });
  const eraseSource = () => run(async () => {
    const what = item.type === 'clip' ? 'exported video' : item.type === 'file' ? 'file' : 'video file';
    if (!window.confirm(`Are you sure? This erases “${source}” from your computer. It doesn't go to the Trash and can't be undone.\n\n${item.type === 'file' ? 'Designs that use it will show a gap where it was.' : `The ${item.type === 'clip' ? 'clip and its edits stay, and you can export it again' : 'project, transcript and clips stay, and you can add the video back later'}.`}`)) return;
    const { removed } = item.type === 'file' ? await api.post('/api/library/erase', { rel: item.rel }) : await api.post('/api/finder/delete-source', { key: item.key });
    toast({ text: `Erased the ${what} ${removed}.` });
    onChanged?.('source');
  });

  return createPortal(
    <div ref={ref} className="pop item-menu" role="menu" onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
      {naming !== null ? (
        <form className="stack" style={{ gap: 6, padding: 4 }} onSubmit={(e) => { e.preventDefault(); rename(); }}>
          <span className="small muted">Rename</span>
          <input className="input" autoFocus value={naming} onFocus={(e) => e.target.select()} onChange={(e) => setNaming(e.target.value)} />
          <span className="row" style={{ gap: 6 }}><button className="btn sm primary">Save</button><button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button></span>
        </form>
      ) : (
        <div className="pop-list">
          <button role="menuitem" className="pop-item" onClick={() => setNaming(item.name || '')}><span className="row" style={{ gap: 8 }}><PencilLine size={14} />Rename…</span></button>
          <hr className="pop-sep" />
          <button role="menuitem" className="pop-item" onClick={reveal}><span className="row" style={{ gap: 8 }}><Search size={14} />Show in Finder</span></button>
          {del && <button role="menuitem" className="pop-item danger-item" onClick={remove}><span className="row" style={{ gap: 8 }}><Trash2 size={14} />{del.label}</span></button>}
          {source && <button role="menuitem" className="pop-item danger-item" onClick={eraseSource}><span className="row" style={{ gap: 8 }}><FileX2 size={14} />Delete source file</span></button>}
        </div>
      )}
    </div>,
    document.body,
  );
}
