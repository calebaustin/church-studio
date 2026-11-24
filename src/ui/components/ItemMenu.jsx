import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, FileX2, Folder, FolderInput, FolderPlus, Megaphone, PencilLine, Search, Trash2 } from 'lucide-react';
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
const LIB_FOLDERS = ['Photos', 'Logos', 'Graphics', 'Icons', 'Brand', 'Writing', 'Audio'];
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

/**
 * Right-click actions for any file or project: Rename, Move to and Link to campaign, then Show in Finder,
 * Delete project and Delete source file. `open(event, { key, name, type })` shows the menu at the pointer.
 * A Brand library file is { type: 'file', rel, name, folder }. `onChanged(what)` runs after a change.
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

function Row({ icon: I, children, danger, disabled, hint, onClick }) {
  return <button type="button" role="menuitem" className={`pop-item ${danger ? 'danger-item' : ''}`} disabled={disabled} onClick={onClick}><span className="row" style={{ gap: 8 }}><I size={14} />{children}</span>{hint && <span className="pop-hint">{hint}</span>}</button>;
}
function Back({ title, onClick }) {
  return <button type="button" className="pop-item item-menu-back" onClick={onClick}><span className="row" style={{ gap: 8 }}><ArrowLeft size={14} /><strong className="small">{title}</strong></span></button>;
}

function ItemMenu({ at, onClose, onChanged }) {
  const { toast } = useApp();
  const { item } = at;
  const isFile = item.type === 'file';
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [view, setView] = useState('main'); // main | rename | move | campaign
  const [text, setText] = useState('');
  const [newFolder, setNewFolder] = useState(null); // the new folder's name while it's typed
  const [folders, setFolders] = useState(null);
  const [camps, setCamps] = useState(null);
  const [source, setSource] = useState(undefined); // undefined while checking, null when there's none
  const del = DELETE[item.type];

  useEffect(() => {
    let live = true;
    if (isFile) setSource(item.name);
    else if (['video', 'sermon', 'clip'].includes(item.type)) api.post('/api/finder/source', { key: item.key }).then((r) => live && setSource(r.file)).catch(() => live && setSource(null));
    else setSource(null);
    return () => { live = false; };
  }, [item.key, item.rel]);
  useEffect(() => {
    if (view === 'move' && !isFile && !folders) api.get('/api/finder/folder-list').then((r) => setFolders(r.folders)).catch(() => setFolders([]));
    if (view === 'campaign' && !camps) api.get('/api/campaigns').then((r) => setCamps(r.campaigns)).catch(() => setCamps([]));
  }, [view]);

  // At the pointer, kept inside the window, and kept in place as the menu changes size.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth; const h = el.offsetHeight;
    setPos({ left: Math.max(EDGE, Math.min(at.x, window.innerWidth - EDGE - w)), top: Math.max(EDGE, Math.min(at.y, window.innerHeight - EDGE - h)) });
  }, [at.x, at.y, view, source, folders, camps, newFolder !== null]);

  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (view !== 'main') setView('main'); else onClose(); } };
    const away = () => onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('contextmenu', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('contextmenu', down); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', away); window.removeEventListener('resize', away); };
  }, [onClose, view]);

  const run = async (fn) => { onClose(); try { await fn(); } catch (e) { toast({ kind: 'error', text: e.message }); } };
  const rename = () => run(async () => {
    const name = text.trim();
    if (!name || name === item.name) return;
    if (isFile) await api.post('/api/library/rename', { rel: item.rel, name });
    else await api.post('/api/finder/rename', { key: item.key, name });
    toast({ text: `Renamed to “${name}”.` });
    onChanged?.('renamed');
  });
  const moveTo = (folderId, name) => run(async () => {
    if (isFile) await api.post('/api/library/move', { rel: item.rel, folder: name });
    else await api.post('/api/finder/move', { key: item.key, folderId });
    toast({ text: `Moved “${item.name}” to ${name}.` });
    onChanged?.('moved');
  });
  const makeFolder = () => run(async () => {
    const name = (newFolder || '').trim();
    if (!name) return;
    const { folder } = await api.post('/api/finder/folders', { name });
    await api.post('/api/finder/move', { key: item.key, folderId: folder.id });
    toast({ text: `Made the folder ${name} and moved “${item.name}” into it.` });
    onChanged?.('moved');
  });
  const linkTo = (c) => run(async () => {
    await api.post(`/api/campaigns/${c.id}/items`, { key: item.key, rel: item.rel, name: item.name, type: item.type });
    toast({ text: `Linked “${item.name}” to the ${c.name} campaign.` });
    onChanged?.('linked');
  });
  const reveal = () => run(() => (isFile ? api.post('/api/library/reveal', { rel: item.rel }) : api.post('/api/finder/reveal', { key: item.key })));
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
    const what = item.type === 'clip' ? 'exported video' : isFile ? 'file' : 'video file';
    const after = isFile ? 'Designs that use it will show a gap where it was.'
      : `The ${item.type === 'clip' ? 'clip and its edits stay, and you can export it again' : 'project, transcript and clips stay, and you can add the video back later'}.`;
    if (!window.confirm(`Are you sure? This erases “${source}” from your computer. It doesn't go to the Trash and can't be undone.\n\n${after}`)) return;
    const { removed } = isFile ? await api.post('/api/library/erase', { rel: item.rel }) : await api.post('/api/finder/delete-source', { key: item.key });
    toast({ text: `Erased the ${what} ${removed}.` });
    onChanged?.('source');
  });


  let body;
  if (view === 'rename') {
    body = (
      <form className="stack" style={{ gap: 6, padding: 4 }} onSubmit={(e) => { e.preventDefault(); rename(); }}>
        <span className="small muted">Rename</span>
        <input className="input" autoFocus value={text} onFocus={(e) => e.target.select()} onChange={(e) => setText(e.target.value)} />
        <span className="row" style={{ gap: 6 }}><button className="btn sm primary">Save</button><button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button></span>
      </form>
    );
  } else if (view === 'move') {
    body = (
      <div className="pop-list">
        <Back title="Move to" onClick={() => setView('main')} />
        <hr className="pop-sep" />
        {isFile ? LIB_FOLDERS.map((f) => <Row key={f} icon={item.folder === f ? Check : Folder} disabled={item.folder === f} onClick={() => moveTo(null, f)}>{f}</Row>) : (
          <>
            {folders === null && <span className="pop-empty">Loading folders…</span>}
            {folders?.length === 0 && <span className="pop-empty">No folders yet. Make the first one.</span>}
            {(folders || []).map((f) => <Row key={f.id} icon={(item.folders || []).includes(f.id) ? Check : Folder} hint={String(f.count)} onClick={() => moveTo(f.id, f.name)}>{f.name}</Row>)}
            <hr className="pop-sep" />
            {newFolder === null ? <Row icon={FolderPlus} onClick={() => setNewFolder('')}>New folder…</Row> : (
              <form className="stack" style={{ gap: 6, padding: 4 }} onSubmit={(e) => { e.preventDefault(); makeFolder(); }}>
                <input className="input" autoFocus placeholder="Folder name, like Advent" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
                <span className="row" style={{ gap: 6 }}><button className="btn sm primary" disabled={!newFolder.trim()}>Make and move</button><button type="button" className="btn sm ghost" onClick={() => setNewFolder(null)}>Cancel</button></span>
              </form>
            )}
          </>
        )}
      </div>
    );
  } else if (view === 'campaign') {
    body = (
      <div className="pop-list">
        <Back title="Link to campaign" onClick={() => setView('main')} />
        <hr className="pop-sep" />
        {camps === null && <span className="pop-empty">Loading campaigns…</span>}
        {camps?.length === 0 && <span className="pop-empty">No campaigns yet. Start one in Social › Campaigns.</span>}
        {(camps || []).map((c) => {
          const linked = (c.items || []).some((x) => x.key === (item.key || `file:${item.rel}`));
          return <Row key={c.id} icon={linked ? Check : Megaphone} disabled={linked} hint={day(c.date)} onClick={() => linkTo(c)}>{c.name}</Row>;
        })}
      </div>
    );
  } else {
    body = (
      <div className="pop-list">
        <Row icon={PencilLine} onClick={() => { setText(item.name || ''); setView('rename'); }}>Rename…</Row>
        <Row icon={FolderInput} onClick={() => setView('move')}>Move to…</Row>
        <Row icon={Megaphone} onClick={() => setView('campaign')}>Link to campaign…</Row>
        <hr className="pop-sep" />
        <Row icon={Search} onClick={reveal}>Show in Finder</Row>
        {del && <Row icon={Trash2} danger onClick={remove}>{del.label}</Row>}
        {source && <Row icon={FileX2} danger onClick={eraseSource}>Delete source file</Row>}
      </div>
    );
  }

  return createPortal(
    <div ref={ref} className="pop item-menu" role="menu" onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
      {body}
    </div>,
    document.body,
  );
}
