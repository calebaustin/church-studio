import { useEffect, useMemo, useState } from 'react';
import ToolIntro from '../components/ToolIntro.jsx';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown, BookOpen, ChevronDown, Clapperboard, Clock, Info, Film, Folder, FolderOpen, FolderPlus, LayoutGrid, MoreHorizontal, PenLine, Pencil,
  RotateCcw, Search, Shapes, Star, Trash2, X, Tag, Archive, Copy,
} from 'lucide-react';
import { useApp } from '../App.jsx';
import PreviewTile from '../components/PreviewTile.jsx';
import { Masonry } from '../components/Masonry.jsx';
import { api } from '../api.js';
import Popover from '../components/Popover.jsx';
import Modal, { ModalHead } from '../components/Modal.jsx';
import { useItemMenu } from '../components/ItemMenu.jsx';

export const TYPES = {
  sermon: { label: 'Sermon', plural: 'Sermons', icon: BookOpen },
  video: { label: 'Video', plural: 'Videos', icon: Clapperboard },
  clip: { label: 'Clip', plural: 'Clips', icon: Film },
  writing: { label: 'Writing', plural: 'Writing', icon: PenLine },
  design: { label: 'Design', plural: 'Designs', icon: Shapes },
};

export function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  const units = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2629800, 'month'], [31557600, 'year']];
  let n = 0; let u = 'minute';
  for (let i = units.length - 1; i >= 0; i--) if (s >= units[i][0]) { n = Math.floor(s / units[i][0]); u = units[i][1]; break; }
  return `${n} ${u}${n === 1 ? '' : 's'} ago`;
}

export function TypeBadge({ type, size = 22 }) {
  const T = TYPES[type];
  if (!T) return null;
  const I = T.icon;
  return <span className={`type-badge t-${type}`} style={{ width: size, height: size }} title={T.label}><I size={Math.round(size * 0.55)} /></span>;
}

function FolderTile({ f, on, onOpen, onDrop }) {
  const [over, setOver] = useState(false);
  return (
    <button className={`folder-tile ${on ? 'on' : ''} ${over ? 'over' : ''}`} onClick={onOpen}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const key = e.dataTransfer.getData('text/x-item'); if (key) onDrop(key); }}>
      <span className="folder-art">
        <span className="folder-back" />
        {f.previews.slice(0, 2).map((src, i) => <img key={i} src={src} alt="" className={`peek p${i}`} />)}
        <span className="folder-front">{!f.previews.length && <Folder size={18} />}</span>
      </span>
      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="row" style={{ gap: 6, minWidth: 0 }}><strong className="truncate">{f.name}</strong>{f.starred && <Star size={13} className="star-on" />}</span>
        <span className="muted small">{f.count} item{f.count === 1 ? '' : 's'}</span>
      </span>
    </button>
  );
}

function FolderTip() {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="seo-info" data-pop-trigger aria-label="About folders" title="About folders" onClick={() => setOpen(!open)}><Info size={12} /></button>
      <Popover open={open} onClose={() => setOpen(false)} width={280}>
        <div className="seo-pop">
          <strong>Folders</strong>
          <span>Group a series, an event or a season. Drag items onto a folder.</span>
          <span>A file or project can live in more than one folder at the same time, so connect it wherever it fits.</span>
        </div>
      </Popover>
    </span>
  );
}

function ItemCard({ item, folders, inFolder, onOpen, act, onMenu }) {
  const [menu, setMenu] = useState(false);
  const [sub, setSub] = useState(false);
  return (
    <div className="item-card glass" onContextMenu={item.trashed ? undefined : (e) => onMenu?.(e, item)} draggable onDragStart={(e) => { e.dataTransfer.setData('text/x-item', item.key); e.dataTransfer.effectAllowed = 'link'; }}>
      <button className={`item-cover ${item.portrait ? 'portrait' : ''}`} onClick={onOpen}>
        {item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : <PreviewTile kind={item.type} title={item.name} excerpt={item.excerpt} palette={item.palette} meta={item.meta} />}
      </button>
      <div className="item-meta">
        <div className="stack" style={{ gap: 3, minWidth: 0 }}>
          <strong className="truncate small" title={item.name}>{item.name}</strong>
          <span className="row muted" style={{ gap: 6, fontSize: 12 }}><TypeBadge type={item.type} size={18} /><span className="truncate">{item.trashed ? `Deleted ${ago(item.at)}` : `Edited ${ago(item.updated)}`}{item.used ? ` · posted ${item.used}×` : ''}</span></span>
          {item.tags?.length > 0 && <span className="row wrap" style={{ gap: 4 }}>{item.tags.slice(0, 3).map((t) => <span key={t} className="chip tag-chip">#{t}</span>)}</span>}
        </div>
        <div className="row" style={{ gap: 0, position: 'relative' }}>
          {!item.trashed && <button className={`rt-btn ${item.starred ? 'on star' : ''}`} aria-label={item.starred ? 'Unstar' : 'Star'} title={item.starred ? 'Unstar' : 'Star'} onClick={() => act('star', item)}><Star size={15} fill={item.starred ? 'currentColor' : 'none'} /></button>}
          <button className="rt-btn" data-pop-trigger aria-label="More" title="More" onClick={() => { setMenu(!menu); setSub(false); }}><MoreHorizontal size={16} /></button>
          <Popover open={menu} onClose={() => setMenu(false)} align="right" width={230}>
            <div className="pop-list">
              {item.trashed ? (
                <>
                  <button className="pop-item" onClick={() => { setMenu(false); act('restore', item); }}><span className="row" style={{ gap: 8 }}><RotateCcw size={14} />Restore</span></button>
                  <button className="pop-item danger-item" onClick={() => { setMenu(false); act('delete', item); }}><span className="row" style={{ gap: 8 }}><Trash2 size={14} />Delete forever</span></button>
                </>
              ) : sub ? (
                <>
                  <span className="cp-group-name" style={{ padding: '6px 10px 2px' }}>Add to folder</span>
                  {folders.map((f) => <button key={f.id} className="pop-item" disabled={item.folders.includes(f.id)} onClick={() => { setMenu(false); act('add', item, f.id); }}><span className="row" style={{ gap: 8 }}><Folder size={14} />{f.name}{item.folders.includes(f.id) ? ' ✓' : ''}</span></button>)}
                  <button className="pop-item" onClick={() => { setMenu(false); act('new-folder', item); }}><span className="row" style={{ gap: 8 }}><FolderPlus size={14} />New folder…</span></button>
                </>
              ) : (
                <>
                  <button className="pop-item" onClick={() => { setMenu(false); onOpen(); }}><span className="row" style={{ gap: 8 }}><FolderOpen size={14} />Open</span></button>
                  <button className="pop-item" onClick={() => setSub(true)}><span className="row" style={{ gap: 8 }}><Folder size={14} />Add to folder…</span></button>
                  <button className="pop-item" onClick={() => { setMenu(false); act('tags', item); }}><span className="row" style={{ gap: 8 }}><Tag size={14} />Tags…</span></button>
                  <button className="pop-item" onClick={() => { setMenu(false); act('archive', item); }}><span className="row" style={{ gap: 8 }}><Archive size={14} />{item.archived ? 'Take out of archive' : 'Archive'}</span></button>
                  <button className="pop-item" onClick={() => { setMenu(false); act('reveal', item); }}><span className="row" style={{ gap: 8 }}><Search size={14} />Show in Finder</span></button>
                  {inFolder && <button className="pop-item" onClick={() => { setMenu(false); act('remove', item, inFolder); }}><span className="row" style={{ gap: 8 }}><X size={14} />Remove from this folder</span></button>}
                  {(item.type === 'design' || item.type === 'writing') && <button className="pop-item danger-item" onClick={() => { setMenu(false); act('trash', item); }}><span className="row" style={{ gap: 8 }}><Trash2 size={14} />Move to trash</span></button>}
                </>
              )}
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
}

export default function AllProjects() {
  const { go, toast } = useApp();
  const [data, setData] = useState(null);
  const [view, setView] = useState({ name: 'all' }); // all | recents | starred | trash | folder
  const [type, setType] = useState('all');
  const [sort, setSortState] = useState(() => { try { return localStorage.getItem('cs-sort') || 'recent'; } catch { return 'recent'; } });
  const setSort = (v) => { setSortState(v); try { localStorage.setItem('cs-sort', v); } catch { /* fine */ } };
  const [sortOpen, setSortOpen] = useState(false);
  const [q, setQ] = useState('');
  const [moreFolders, setMoreFolders] = useState(false);
  const [naming, setNaming] = useState(null); // { id?, name, then? }
  const [tagging, setTagging] = useState(null); // the item whose tags are being edited
  const load = () => api.get('/api/finder').then(setData).catch((e) => toast({ kind: 'error', text: e.message }));
  const itemMenu = useItemMenu({ onChanged: () => load() });
  useEffect(() => { load(); }, []);

  const open = (i) => {
    if (i.trashed) return;
    if (i.type === 'sermon') go({ name: 'project', id: i.id, step: 'plan' }); // a Sermon opens on its Sermon page
    if (i.type === 'video') go({ name: 'project', id: i.id });
    if (i.type === 'clip') go({ name: 'project', id: i.projectId, clip: i.clipId });
    if (i.type === 'writing') go({ name: 'writing', project: i.id });
    if (i.type === 'design') go({ name: 'graphics', design: i.id });
  };
  const act = async (what, item, folderId) => {
    try {
      if (what === 'reveal') { await api.post('/api/finder/reveal', { key: item.key }); return; }
      if (what === 'star') await api.post('/api/finder/star', { key: item.key, on: !item.starred });
      if (what === 'tags') return setTagging(item);
      if (what === 'archive') { await api.post('/api/finder/archive', { key: item.key, on: !item.archived }); toast({ text: item.archived ? `“${item.name}” is back.` : `“${item.name}” archived. Find it under Archive, or with search.` }); }
      if (what === 'add') { await api.post(`/api/finder/folders/${folderId}/items`, { key: item.key }); toast({ text: `Added to ${data.folders.find((f) => f.id === folderId)?.name}.` }); }
      if (what === 'remove') await api.post(`/api/finder/folders/${folderId}/remove`, { key: item.key });
      if (what === 'new-folder') return setNaming({ name: '', then: item.key });
      if (what === 'trash') { await api.post('/api/finder/trash', { key: item.key }); toast({ text: `“${item.name}” moved to the trash.`, action: { label: 'Undo', run: async () => { await api.post('/api/finder/restore', { key: item.key }); load(); } } }); }
      if (what === 'restore') await api.post('/api/finder/restore', { key: item.key });
      if (what === 'delete') { if (!window.confirm(`Delete “${item.name}” for good? This can't be undone.`)) return; await api.post('/api/finder/delete', { key: item.key }); }
      load();
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const saveName = async () => {
    const name = naming.name.trim();
    if (!name) return;
    if (naming.id) await api.patch(`/api/finder/folders/${naming.id}`, { name });
    else {
      const { folder } = await api.post('/api/finder/folders', { name });
      if (naming.then) await api.post(`/api/finder/folders/${folder.id}/items`, { key: naming.then });
    }
    setNaming(null);
    load();
  };

  const folder = view.name === 'folder' ? data?.folders.find((f) => f.id === view.id) : null;
  const folderKeys = useMemo(() => (folder ? new Set(data.items.filter((i) => i.folders.includes(folder.id)).map((i) => i.key)) : null), [data, folder]);
  const ql = q.trim().toLowerCase();
  // Possible duplicates: the same kind of thing with the same name (ignoring "copy" and numbers).
  const dupeKeys = useMemo(() => {
    const groups = new Map();
    for (const i of data?.items || []) {
      const k = `${i.type}:${String(i.name).toLowerCase().replace(/\b(copy|\(\d+\)|\d+)$/g, '').replace(/[^a-z0-9]+/g, ' ').trim()}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i.key);
    }
    return new Set([...groups.values()].filter((g) => g.length > 1).flat());
  }, [data]);
  const allTags = useMemo(() => { const m = new Map(); for (const i of data?.items || []) for (const t of i.tags || []) m.set(t, (m.get(t) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [data]);
  let items = !data ? [] : view.name === 'trash' ? data.trash.map((t) => ({ ...t, trashed: true }))
    : data.items.filter((i) => (view.name === 'archive' ? i.archived : i.archived ? false : view.name === 'starred' ? i.starred : view.name === 'recents' ? Date.now() - Date.parse(i.updated || 0) < 30 * 86400_000 : view.name === 'folder' ? folderKeys.has(i.key) : view.name === 'tag' ? i.tags?.includes(view.tag) : view.name === 'dupes' ? dupeKeys.has(i.key) : true));
  items = items.filter((i) => (type === 'all' || i.type === type) && (!ql || `${i.name} ${(i.tags || []).join(' ')}`.toLowerCase().includes(ql)));
  const KIND_ORDER = ['sermon', 'video', 'clip', 'writing', 'design'];
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true });
  const byRecent = (a, b) => String(b.updated || b.at || '').localeCompare(String(a.updated || a.at || ''));
  const sorter = sort === 'name' ? byName : sort === 'kind' ? (a, b) => KIND_ORDER.indexOf(a.type) - KIND_ORDER.indexOf(b.type) || byRecent(a, b) : byRecent;
  items = [...items].sort(sorter);
  if (view.name === 'recents') items = items.slice(0, 40);
  const folders = (data?.folders || []).filter((f) => (view.name === 'starred' ? f.starred : true) && (!ql || f.name.toLowerCase().includes(ql)))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || (sort === 'name' ? byName(a, b) : String(b.updated).localeCompare(String(a.updated))));
  const showFolders = (view.name === 'all' || view.name === 'starred') && type === 'all';
  const title = { all: 'All projects', recents: 'Recents', starred: 'Starred', trash: 'Trash', archive: 'Archive', dupes: 'Possible duplicates' }[view.name] || (view.name === 'tag' ? `#${view.tag}` : folder?.name || 'Folder');
  const counts = useMemo(() => Object.fromEntries(Object.keys(TYPES).map((t) => [t, (data?.items || []).filter((i) => i.type === t).length])), [data]);

  const NavItem = ({ v, icon: I, label, count }) => (
    <button className={view.name === v ? 'on' : ''} onClick={() => setView({ name: v })}><I size={16} /><span className="grow">{label}</span>{count ? <span className="muted small num">{count}</span> : null}</button>
  );

  return (
    <div className="page finder">
      <aside className="finder-nav glass">
        <NavItem v="all" icon={LayoutGrid} label="All projects" />
        <NavItem v="recents" icon={Clock} label="Recents" />
        <NavItem v="starred" icon={Star} label="Starred" />
        <div className="row between" style={{ padding: '14px 10px 4px' }}><span className="row" style={{ gap: 4 }}><span className="eyebrow">Folders</span><FolderTip /></span>
          <button className="rt-btn" aria-label="New folder" title="New folder" onClick={() => setNaming({ name: '' })}><FolderPlus size={15} /></button></div>
        {(data?.folders || []).map((f) => (
          <button key={f.id} className={view.name === 'folder' && view.id === f.id ? 'on' : ''} onClick={() => setView({ name: 'folder', id: f.id })}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const key = e.dataTransfer.getData('text/x-item'); if (key) act('add', { key }, f.id); }}>
            <Folder size={16} /><span className="grow truncate">{f.name}</span>{f.starred && <Star size={12} className="star-on" />}
          </button>
        ))}
        {allTags.length > 0 && <span className="eyebrow" style={{ padding: '14px 10px 4px' }}>Tags</span>}
        {allTags.slice(0, 12).map(([t, n]) => (
          <button key={t} className={view.name === 'tag' && view.tag === t ? 'on' : ''} onClick={() => setView({ name: 'tag', tag: t })}><Tag size={15} /><span className="grow truncate">{t}</span><span className="muted small">{n}</span></button>
        ))}
        <div className="grow" />
        {dupeKeys.size > 0 && <NavItem v="dupes" icon={Copy} label="Possible duplicates" count={dupeKeys.size} />}
        <NavItem v="archive" icon={Archive} label="Archive" count={(data?.items || []).filter((i) => i.archived).length || undefined} />
        <NavItem v="trash" icon={Trash2} label="Trash" count={data?.trash.length} />
      </aside>

      <div className="stack" style={{ gap: 18, minWidth: 0 }}>
      <ToolIntro id="projects" />
        <div className="row between wrap">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <h1 className="truncate">{title}</h1>
            {folder && (
              <>
                <button className={`rt-btn ${folder.starred ? 'on star' : ''}`} aria-label="Star folder" title={folder.starred ? 'Unstar folder' : 'Star folder'} onClick={async () => { await api.patch(`/api/finder/folders/${folder.id}`, { starred: !folder.starred }); load(); }}><Star size={16} fill={folder.starred ? 'currentColor' : 'none'} /></button>
                <button className="rt-btn" aria-label="Rename folder" title="Rename folder" onClick={() => setNaming({ id: folder.id, name: folder.name })}><Pencil size={15} /></button>
                <button className="rt-btn" aria-label="Delete folder" title="Delete folder (keeps what's in it)" onClick={async () => { if (window.confirm(`Delete the folder “${folder.name}”? Everything in it stays in All projects.`)) { await api.del(`/api/finder/folders/${folder.id}`); setView({ name: 'all' }); load(); } }}><Trash2 size={15} /></button>
              </>
            )}
          </div>
          <div className="row wrap">
            <label className="input-affix" style={{ width: 260 }}><Search size={15} className="muted" /><input className="input" placeholder={`Search ${title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
            {view.name !== 'trash' && <button className="btn" onClick={() => setNaming({ name: '' })}><FolderPlus size={15} />New folder</button>}
            {view.name === 'trash' && data?.trash.length > 0 && <button className="btn danger" onClick={async () => { if (window.confirm(`Delete all ${data.trash.length} items in the trash for good? This can't be undone.`)) { await api.post('/api/finder/empty-trash'); load(); } }}><Trash2 size={15} />Empty trash</button>}
          </div>
        </div>

        <div className="row between wrap" style={{ gap: 10 }}>
          {view.name !== 'trash' ? (
            <div className="seg">
              <button className={type === 'all' ? 'on' : ''} onClick={() => setType('all')}>Everything</button>
              {Object.entries(TYPES).map(([k, t]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}><TypeBadge type={k} size={18} />{t.plural}{counts[k] ? <span className="muted num"> {counts[k]}</span> : null}</button>)}
            </div>
          ) : <span />}
          <div style={{ position: 'relative' }}>
            <button className="btn sm ghost" data-pop-trigger onClick={() => setSortOpen(!sortOpen)}><ArrowUpDown size={14} />{{ recent: 'Most recent', name: 'A to Z', kind: 'By kind' }[sort]}<ChevronDown size={13} /></button>
            <Popover open={sortOpen} onClose={() => setSortOpen(false)} align="right" width={190}>
              <div className="pop-list">
                {[['recent', 'Most recent'], ['name', 'A to Z'], ['kind', 'By kind']].map(([k, l]) => (
                  <button key={k} className={`pop-item ${sort === k ? 'on' : ''}`} onClick={() => { setSort(k); setSortOpen(false); }}>{l}</button>
                ))}
              </div>
            </Popover>
          </div>
        </div>

        {showFolders && folders.length > 0 && (
          <section className="stack" style={{ gap: 10 }}>
            <div className="row between"><h2>Folders</h2>{folders.length > 8 && <button className="btn ghost sm" onClick={() => setMoreFolders(!moreFolders)}>{moreFolders ? 'Show less' : 'See all'}</button>}</div>
            <div className="folder-grid">
              {folders.slice(0, moreFolders ? 999 : 8).map((f) => <FolderTile key={f.id} f={f} onOpen={() => setView({ name: 'folder', id: f.id })} onDrop={(key) => act('add', { key }, f.id)} />)}
            </div>
          </section>
        )}

        <section className="stack" style={{ gap: 10 }}>
          {showFolders && folders.length > 0 && <h2>{type === 'all' ? 'Everything' : TYPES[type].plural}</h2>}
          {!data && <Masonry className="item-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</Masonry>}
          {data && !items.length && (
            <div className="glass empty">
              {view.name === 'trash' ? <Trash2 size={36} /> : <LayoutGrid size={36} />}
              <h3>{ql ? 'Nothing matches' : view.name === 'trash' ? 'The trash is empty' : view.name === 'starred' ? 'Nothing starred yet' : folder ? 'This folder is empty' : 'Nothing here yet'}</h3>
              <p>{view.name === 'trash' ? 'Designs and writing you delete wait here until you empty the trash.' : folder ? 'Drag sermons, clips, writing and designs here, or use Add to folder on any item.' : view.name === 'starred' ? 'Star things you come back to often.' : 'Sermons, clips, writing and designs you make show up here.'}</p>
            </div>
          )}
          <Masonry className="item-grid">
            {items.map((i) => <ItemCard key={i.key} item={i} folders={data.folders} inFolder={folder?.id} onOpen={() => open(i)} act={act} onMenu={itemMenu.open} />)}
          </Masonry>
        </section>
      </div>

      {itemMenu.menu}
      {tagging && <TagEditor item={tagging} all={allTags.map(([t]) => t)} onClose={() => setTagging(null)} onSaved={() => { setTagging(null); load(); }} />}
      {naming && createPortal(
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setNaming(null)}>
          <form className="glass strong modal stack" style={{ width: 'min(420px, calc(100vw - 32px))' }} onSubmit={(e) => { e.preventDefault(); saveName(); }}>
            <h2>{naming.id ? 'Rename folder' : 'New folder'}</h2>
            <input className="input" autoFocus placeholder="Easter 2026, Summer series, Youth…" value={naming.name} onChange={(e) => setNaming({ ...naming, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null); }} />
            <div className="row"><button className="btn primary" type="submit" disabled={!naming.name.trim()}>{naming.id ? 'Rename' : 'Create folder'}</button><button className="btn ghost" type="button" onClick={() => setNaming(null)}>Cancel</button></div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Tags for one item: type and press Enter, or pick one you've used before. */
function TagEditor({ item, all, onClose, onSaved }) {
  const [tags, setTags] = useState(item.tags || []);
  const [t, setT] = useState('');
  const add = (x) => { const v = x.trim().toLowerCase().replace(/^#/, ''); if (v && !tags.includes(v)) setTags([...tags, v]); setT(''); };
  const save = async () => { await api.put('/api/finder/tags', { key: item.key, tags: t.trim() ? [...tags, t.trim()] : tags }); onSaved(); };
  const suggestions = all.filter((x) => !tags.includes(x) && (!t || x.includes(t.toLowerCase()))).slice(0, 10);
  return (
    <Modal onClose={onClose} width={480} label="Tags" footer={<><span className="hint">Tags help you find things in search and in All projects.</span><button className="btn primary" onClick={save}>Save</button></>}>
      <ModalHead title="Tags" sub={item.name} />
      <div className="row wrap" style={{ gap: 6 }}>
        {tags.map((x) => <span key={x} className="chip theme-chip">#{x}<button aria-label={`Remove ${x}`} onClick={() => setTags(tags.filter((y) => y !== x))}><X size={11} /></button></span>)}
        <input className="input" style={{ width: 200 }} value={t} autoFocus placeholder="Add a tag, like easter" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(t); } }} />
      </div>
      {suggestions.length > 0 && <div className="row wrap" style={{ gap: 6 }}><span className="small muted">Used before:</span>{suggestions.map((x) => <button key={x} className="pill-choice" onClick={() => add(x)}>#{x}</button>)}</div>}
    </Modal>
  );
}
