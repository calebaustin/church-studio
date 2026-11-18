import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard, Copy, GalleryHorizontalEnd, Heart, LayoutGrid, MonitorPlay, NotebookPen, Presentation, Printer,
  Scaling, Search, Smartphone, Sparkles, Trash2, Home as HomeIcon, X,
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Masonry } from '../components/Masonry.jsx';
import { api } from '../api.js';
import Modal, { ModalHead } from '../components/Modal.jsx';
import DesignEditor from '../design/DesignEditor.jsx';
import { KINDS, SIZE_PRESETS, TEMPLATES as BASE_TEMPLATES, blankPage, loadAssets, page as newPage, renderPage, uid } from '../design/model.js';
import { PACKS, PACK_TEMPLATES } from '../design/packs.js';

const TEMPLATES = [...BASE_TEMPLATES, ...PACK_TEMPLATES];

export { cohesive } from '../design/model.js';

// Tile colors come from the app theme (tone-1 to tone-6 in styles.css), so they follow the user's colors.
const TILES = [
  ['presentation', Presentation, 1],
  ['post', Heart, 2],
  ['carousel', GalleryHorizontalEnd, 3],
  ['story', Smartphone, 4],
  ['thumbnail', MonitorPlay, 5],
  ['flyer', Printer, 6],
  ['notes', NotebookPen, 4],
  ['sermon', Sparkles, 1],
  ['custom', Scaling, 0],
];
const SERMON_OUTPUTS = [
  ['deck-sermon', 'Sermon slides', 'Title, passages, main points, quotes and next steps'],
  ['car-recap', 'Recap carousel', 'A cover, one page per point, and a call to watch'],
  ['car-quotes', 'Quote carousel', 'The most shareable lines, one per page'],
  ['story-recap', 'Story set', 'Three or four story pages'],
  ['notes-blanks', 'Fill-in notes', 'A handout with blanks for each point'],
  ['thumb-sermon', 'Thumbnail', 'A YouTube cover with the title'],
];

function useBrandCtx() {
  const { config } = useApp();
  const c = [...(config.brandColors || [])];
  const fallback = ['#2B7F5F', '#D9A441', '#1B2440', '#F4EFE6', '#8FB8A8'];
  while (c.length < 5) c.push(fallback[c.length]);
  const f = config.brandFonts || { heading: 'Montserrat', body: 'Montserrat' };
  return { c: c.slice(0, 5), h: f.heading, b: f.body, o: null };
}

function newDoc(kind, tpl, ctx, size) {
  const k = KINDS[kind];
  return {
    id: uid(), name: tpl ? tpl.name : `Untitled ${k.label.toLowerCase()}`, kind,
    size: size || { w: k.w, h: k.h }, palette: tpl?.pack ? [...PACKS[tpl.pack].c] : ctx.c, tint: { color: '#FF9A62', amount: 0 },
    pages: tpl ? tpl.build(ctx) : [blankPage(kind, ctx)],
  };
}

function TemplateThumb({ tpl, ctx }) {
  const ref = useRef(null);
  const doc = useMemo(() => newDoc(tpl.kind, tpl, ctx), [tpl, ctx]);
  useEffect(() => {
    let live = true;
    (async () => {
      await document.fonts.ready;
      await loadAssets(doc.pages[0], TemplateThumb.cache);
      if (live && ref.current) renderPage(ref.current, doc, doc.pages[0], 440 / doc.size.w, TemplateThumb.cache);
    })();
    return () => { live = false; };
  }, [doc]);
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${doc.size.w}/${doc.size.h}` }} />;
}
TemplateThumb.cache = {};

/** What an event looks like on a graphic: "Sunday, Nov 22 · 6 PM". */
export function eventForDesign(e) {
  const d = new Date(e.start);
  const day = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const time = e.allDay ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const days = Math.ceil((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86400000);
  return { title: e.title, when: [day, time].filter(Boolean).join(' · '), place: e.location?.split(',')[0] || '', summary: e.summary || '', link: e.link || null,
    countdown: days > 1 ? `${days} DAYS TO GO` : days === 1 ? 'TOMORROW' : 'TODAY' };
}

export default function Graphics({ image, design, event }) {
  const { toast } = useApp();
  const ctx = useBrandCtx();
  const [open, setOpen] = useState(design || null);
  const [designs, setDesigns] = useState(null);
  const [tab, setTab] = useState('home');
  const [kind, setKind] = useState(null);
  const [pack, setPack] = useState(null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // 'sermon' | 'custom'
  const load = () => api.get('/api/designs').then((r) => setDesigns(r.designs)).catch(() => setDesigns([]));
  useEffect(() => { if (!open) load(); }, [open]);

  const create = async (doc) => { await api.put(`/api/designs/${doc.id}`, doc); setOpen(doc.id); };
  // From the brand library: a post with that photo behind it.
  useEffect(() => {
    if (!image) return;
    const d = newDoc('post', null, ctx);
    d.name = 'Photo post';
    d.pages = [newPage({ bg: { type: 'image', image, darken: 0.3 }, items: [] })];
    create(d);
  }, [image]);

  // From a church calendar event: an event post with its name, time and place filled in.
  useEffect(() => {
    if (!event) return;
    const d = newDoc('post', TEMPLATES.find((t) => t.id === 'post-event'), { ...ctx, ev: eventForDesign(event) });
    d.name = event.title;
    create(d);
  }, [event]);

  if (open) return <DesignEditor id={open} onClose={() => setOpen(null)} />;

  const ql = q.trim().toLowerCase();
  const tpls = TEMPLATES.filter((t) => (!kind || t.kind === kind) && (!pack || t.pack === pack) && (!ql || `${t.name} ${KINDS[t.kind].label}`.toLowerCase().includes(ql)));
  const mine = (designs || []).filter((d) => !ql || d.name.toLowerCase().includes(ql));
  const pick = (k) => {
    if (k === 'sermon') return setModal('sermon');
    if (k === 'custom') return setModal('custom');
    setKind(kind === k ? null : k); setTab('templates');
  };

  return (
    <div className="page">
      <section className="dz-hero">
        <div className="dz-hero-bg" style={{ '--c1': ctx.c[0], '--c2': ctx.c[1], '--c3': ctx.c[4] || ctx.c[2] }}><i /><i /><i /></div>
        <h1>What will you design today?</h1>
        <div className="seg dz-hero-tabs">
          <button className={tab === 'home' ? 'on' : ''} onClick={() => { setTab('home'); setKind(null); }}><HomeIcon size={14} />Home</button>
          <button className={tab === 'templates' ? 'on' : ''} onClick={() => setTab('templates')}><LayoutGrid size={14} />Templates</button>
        </div>
        <label className="dz-search">
          <Search size={18} />
          <input placeholder="Search templates and your designs" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) setTab('templates'); }} />
        </label>
      </section>

      <div className="dz-tiles">
        {TILES.map(([k, Icon, grad]) => (
          <button key={k} className={`dz-tile ${kind === k ? 'on' : ''}`} onClick={() => pick(k)}>
            <span className={`dz-tile-icon ${grad ? `tone tone-${grad}` : 'plain'}`}><Icon size={24} /></span>
            <span>{k === 'sermon' ? 'From a sermon' : KINDS[k].label}</span>
          </button>
        ))}
      </div>

      {tab === 'home' && !ql && (
        <section className="stack" style={{ gap: 12 }}>
          <div className="row between"><h2>Your designs</h2>{designs?.length > 0 && <span className="muted small">{designs.length} saved</span>}</div>
          {designs && !designs.length && (
            <div className="glass empty">
              <Clapperboard size={40} />
              <h3>Nothing designed yet</h3>
              <p>Pick a kind of design above, or start from a sermon to get slides, carousels and stories made from its words.</p>
              <button className="btn primary" onClick={() => setModal('sermon')}><Sparkles size={15} />Start from a sermon</button>
            </div>
          )}
          <Masonry className="dz-grid-cards">
            {mine.map((d) => (
              <div key={d.id} className="dz-card glass">
                <button className="dz-card-cover" onClick={() => setOpen(d.id)} style={{ aspectRatio: `${d.size.w}/${d.size.h}` }}>
                  {d.thumb ? <img src={d.thumb} alt="" /> : <span className="muted">No preview</span>}
                </button>
                <div className="dz-card-meta">
                  <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <strong className="truncate small">{d.name}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>{KINDS[d.kind]?.label}{d.pages > 1 ? ` · ${d.pages} pages` : ''}</span>
                  </div>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="rt-btn" title="Make a copy" aria-label="Make a copy" onClick={async () => { const { design } = await api.get(`/api/designs/${d.id}`); await api.put(`/api/designs/${uid()}`, { ...design, name: `${design.name} copy` }); load(); }}><Copy size={14} /></button>
                    <button className="rt-btn" title="Move to trash" aria-label="Move to trash" onClick={async () => { await api.post('/api/finder/trash', { key: `design:${d.id}` }); load(); toast({ text: `“${d.name}” moved to the trash.`, action: { label: 'Undo', run: async () => { await api.post('/api/finder/restore', { key: `design:${d.id}` }); load(); } } }); }}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </Masonry>
        </section>
      )}

      <section className="stack" style={{ gap: 12 }}>
        <div className="row between wrap">
          <h2>{kind ? `${KINDS[kind].label} templates` : ql ? 'Results' : 'Templates'}</h2>
          {kind && <span className="muted small">{KINDS[kind].hint} · {KINDS[kind].w}×{KINDS[kind].h}</span>}
        </div>
        <div className="row wrap" style={{ gap: 6 }} role="radiogroup" aria-label="Template pack">
          <button className={`pill-choice ${!pack ? 'on' : ''}`} onClick={() => setPack(null)}>All styles</button>
          {Object.entries(PACKS).map(([id, P]) => (
            <button key={id} className={`pill-choice pack-chip ${pack === id ? 'on' : ''}`} title={P.about} onClick={() => { setPack(pack === id ? null : id); setTab('templates'); }}>
              <span className="pack-dots">{P.c.slice(0, 3).map((c) => <i key={c} style={{ background: c }} />)}</span>{P.name}
            </button>
          ))}
        </div>
        {pack && <span className="hint">{PACKS[pack].about} No stock photos: click a photo spot to add your own, or make it a solid shape.</span>}
        <Masonry className="dz-grid-cards">
          {kind && (
            <button className="dz-card glass dz-blank" onClick={() => create(newDoc(kind, null, ctx))}>
              <span className="dz-blank-box" style={{ aspectRatio: `${KINDS[kind].w}/${KINDS[kind].h}` }}>+</span>
              <strong className="small">Blank {KINDS[kind].label.toLowerCase()}</strong>
            </button>
          )}
          {tpls.map((t) => (
            <button key={t.id} className="dz-card glass dz-tpl" onClick={() => create(newDoc(t.kind, t, ctx))}>
              <span className="dz-card-cover"><TemplateThumb tpl={t} ctx={ctx} /></span>
              <span className="dz-card-meta"><span className="stack" style={{ gap: 0 }}><strong className="small">{t.name}</strong><span className="muted" style={{ fontSize: 12 }}>{KINDS[t.kind].label}{t.pack ? ` · ${PACKS[t.pack].name} pack` : ''}</span></span></span>
            </button>
          ))}
          {ql && mine.map((d) => (
            <button key={d.id} className="dz-card glass" onClick={() => setOpen(d.id)}>
              <span className="dz-card-cover">{d.thumb && <img src={d.thumb} alt="" />}</span>
              <span className="dz-card-meta"><strong className="small truncate">{d.name}</strong></span>
            </button>
          ))}
        </Masonry>
        {!tpls.length && !(ql && mine.length) && <span className="muted">Nothing matches “{q}”.</span>}
      </section>

      {modal === 'sermon' && <FromSermon ctx={ctx} onClose={() => setModal(null)} onCreate={(doc) => { setModal(null); create(doc); }} />}
      {modal === 'custom' && <CustomSize onClose={() => setModal(null)} onCreate={(size) => { setModal(null); const d = newDoc('custom', null, ctx, size); d.name = `Untitled ${size.w}×${size.h}`; create(d); }} />}
    </div>
  );
}


function FromSermon({ ctx, onClose, onCreate }) {
  const [projects, setProjects] = useState(null);
  const [pid, setPid] = useState(null);
  const [out, setOut] = useState('deck-sermon');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get('/api/projects').then(({ projects: ps }) => { const r = ps.filter((p) => p.status === 'transcribed'); setProjects(r); setPid(r[0]?.id || null); }); }, []);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const { outline } = await api.get(`/api/outline/${pid}`);
      const tpl = TEMPLATES.find((t) => t.id === out);
      const d = newDoc(tpl.kind, tpl, { ...ctx, o: outline });
      d.name = `${outline.title} · ${tpl.name}`;
      onCreate(d);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal label="Start from a sermon" onClose={onClose} width={620}>
      <ModalHead title="Start from a sermon" onClose={onClose} />
      {projects && !projects.length && <p className="muted">Transcribe a sermon first. Designs are built from its words.</p>}
      {projects?.length > 0 && (
        <div className="stack" style={{ gap: 14 }}>
          <label className="field">Sermon<select className="input" value={pid || ''} onChange={(e) => setPid(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
          <div className="choices">
            {SERMON_OUTPUTS.map(([k, l, d]) => (
              <button key={k} className={`choice ${out === k ? 'on' : ''}`} onClick={() => setOut(k)}>
                <span className="t">{l}</span><span className="d">{d}</span>
              </button>
            ))}
          </div>
          {err && <div className="banner bad">{err}</div>}
          <div className="row"><button className="btn primary" disabled={!pid || busy} onClick={go}><Sparkles size={15} />{busy ? 'Building…' : 'Build it'}</button><span className="muted small">You can change everything after.</span></div>
        </div>
      )}
    </Modal>
  );
}

function CustomSize({ onClose, onCreate }) {
  const [w, setW] = useState(1080); const [h, setH] = useState(1080);
  const ok = w >= 100 && h >= 100 && w <= 6000 && h <= 6000;
  return (
    <Modal label="Custom size" onClose={onClose} width={480}>
      <ModalHead title="Custom size" onClose={onClose} />
      <div className="stack" style={{ gap: 14 }}>
        <div className="angle-row">{SIZE_PRESETS.map(([l, a, b]) => <button key={l} className={`pill-choice ${w === a && h === b ? 'on' : ''}`} onClick={() => { setW(a); setH(b); }}>{l}</button>)}</div>
        <div className="token-grid">
          <label className="field">Width (px)<input className="input num" type="number" value={w} onChange={(e) => setW(Number(e.target.value))} /></label>
          <label className="field">Height (px)<input className="input num" type="number" value={h} onChange={(e) => setH(Number(e.target.value))} /></label>
        </div>
        <button className="btn primary" disabled={!ok} onClick={() => onCreate({ w, h })}>Create design</button>
      </div>
    </Modal>
  );
}
