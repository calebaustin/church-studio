import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard, Copy, GalleryHorizontalEnd, Heart, LayoutGrid, MonitorPlay, NotebookPen, Presentation, Printer,
  Scaling, Search, Smartphone, Sparkles, Trash2, Home as HomeIcon, Wand2, X, BookOpen, Plus, PenTool, Film,
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Masonry } from '../components/Masonry.jsx';
import { api } from '../api.js';
import Modal, { ModalHead } from '../components/Modal.jsx';
import DesignEditor from '../design/DesignEditor.jsx';
import { KINDS, SIZE_PRESETS, TEMPLATES as BASE_TEMPLATES, blankPage, countdownPages, loadAssets, page as newPage, renderPage, scripturePage, uid } from '../design/model.js';
import { PACKS, PACK_TEMPLATES } from '../design/packs.js';
import { buildDeck, parseNotes } from '../design/deckBuilder.js';

const TEMPLATES = [...BASE_TEMPLATES, ...PACK_TEMPLATES];

export { cohesive } from '../design/model.js';

// Tile colors come from the app theme (tone-1 to tone-6 in styles.css), so they follow the user's colors.
const TILES = [
  ['design', PenTool, 5],
  ['videocard', Film, 6],
  ['deck', Wand2, 3],
  ['scripture', BookOpen, 2],
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

export default function Graphics({ image, design, event, eventMode, quote, make }) {
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
    const ev = eventForDesign(event);
    let d;
    if (eventMode === 'flyer') { d = newDoc('flyer', TEMPLATES.find((t) => t.id === 'flyer-event'), { ...ctx, ev }); d.name = `${event.title} · Flyer`; }
    else if (eventMode === 'countdown') { d = newDoc('story', null, ctx); d.pages = countdownPages(ctx, ev); d.name = `${event.title} · Countdown`; }
    else { d = newDoc('post', TEMPLATES.find((t) => t.id === 'post-event'), { ...ctx, ev }); d.name = event.title; }
    create(d);
  }, [event]);

  // From a sermon's content plan: a design built from its outline, linked back to the sermon.
  useEffect(() => {
    if (!make?.projectId) return;
    api.get(`/api/outline/${make.projectId}`).then(({ outline }) => {
      const tpl = TEMPLATES.find((t) => t.id === make.template) || TEMPLATES.find((t) => t.id === 'post-quote');
      const d = newDoc(tpl.kind, tpl, { ...ctx, o: outline });
      d.name = `${outline.title} · ${tpl.name}`;
      d.source = { projectId: make.projectId, template: tpl.id };
      create(d);
    }).catch((e) => toast({ kind: 'error', text: e.message }));
  }, [make?.projectId, make?.template]);

  // From a transcript selection: a quote card.
  useEffect(() => {
    if (!quote) return;
    const d = newDoc('post', TEMPLATES.find((t) => t.id === 'post-quote'), { ...ctx, o: { quotes: [quote.length > 220 ? `${quote.slice(0, 217)}…` : quote] } });
    d.name = quote.split(' ').slice(0, 5).join(' ');
    create(d);
  }, [quote]);

  if (open) return <DesignEditor id={open} onClose={() => setOpen(null)} />;

  const ql = q.trim().toLowerCase();
  const tpls = TEMPLATES.filter((t) => (!kind || t.kind === kind) && (!pack || t.pack === pack) && (!ql || `${t.name} ${KINDS[t.kind].label}`.toLowerCase().includes(ql)));
  const mine = (designs || []).filter((d) => !ql || d.name.toLowerCase().includes(ql));
  const pick = (k) => {
    if (k === 'sermon') return setModal('sermon');
    if (k === 'deck') return setModal('deck');
    if (k === 'scripture') return setModal('scripture');
    if (k === 'custom') return setModal('custom');
    if (k === 'design') return create(newDoc('design', null, ctx));
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
        <button className="dz-tile dz-create" onClick={() => setModal('new')}>
          <span className="dz-tile-icon create"><Plus size={28} /></span>
          <span>Create new</span>
        </button>
        {TILES.map(([k, Icon, grad]) => (
          <button key={k} className={`dz-tile ${kind === k ? 'on' : ''}`} onClick={() => pick(k)}>
            <span className={`dz-tile-icon ${grad ? `tone tone-${grad}` : 'plain'}`}><Icon size={24} /></span>
            <span>{k === 'sermon' ? 'From a sermon' : k === 'deck' ? 'Slide deck maker' : k === 'scripture' ? 'Scripture graphic' : k === 'videocard' ? 'Video cards' : KINDS[k].label}</span>
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

      {modal === 'scripture' && <ScriptureMaker ctx={ctx} onClose={() => setModal(null)} onCreate={(doc) => { setModal(null); create(doc); }} />}
      {modal === 'deck' && <DeckMaker ctx={ctx} onClose={() => setModal(null)} onCreate={(doc) => { setModal(null); create(doc); }} />}
      {modal === 'sermon' && <FromSermon ctx={ctx} onClose={() => setModal(null)} onCreate={(doc) => { setModal(null); create(doc); }} />}
      {modal === 'new' && (
        <CreateNew ctx={ctx} onClose={() => setModal(null)}
          onBlank={(k) => { setModal(null); create(newDoc(k, null, ctx)); }}
          onTemplate={(t) => { setModal(null); create(newDoc(t.kind, t, ctx)); }}
          onBrowse={(k) => { setModal(null); setKind(k); setTab('templates'); }}
          onMaker={(m) => setModal(m)}
          onSize={(size) => { setModal(null); const d = newDoc('custom', null, ctx, size); d.name = `Untitled ${size.w}×${size.h}`; create(d); }} />
      )}
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
      d.source = { projectId: pid, template: tpl.id };
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

const KIND_ICON = { design: PenTool, videocard: Film, presentation: Presentation, post: Heart, carousel: GalleryHorizontalEnd, story: Smartphone, thumbnail: MonitorPlay, flyer: Printer, notes: NotebookPen };
const KIND_TONE = { design: 5, videocard: 6, presentation: 1, post: 2, carousel: 3, story: 4, thumbnail: 5, flyer: 6, notes: 4 };

/** Everything you can make in one place: a type, a guided maker, a video card or any size. */
function CreateNew({ ctx, onClose, onBlank, onTemplate, onBrowse, onMaker, onSize }) {
  const [w, setW] = useState(1080); const [h, setH] = useState(1080);
  const ok = w >= 100 && h >= 100 && w <= 6000 && h <= 6000;
  const cards = ['intro-vertical', 'outro-vertical', 'intro-wide'].map((id) => TEMPLATES.find((t) => t.id === id)).filter(Boolean);
  const count = (k) => TEMPLATES.filter((t) => t.kind === k).length;
  return (
    <Modal label="Create new" onClose={onClose} width={860}>
      <ModalHead title="Create new" sub="Start blank, use a guided maker, or pick any size." />
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Guided makers</span>
        <div className="cn-grid">
          {[['deck', Wand2, 'Slide deck maker', 'Answer a few questions, get a full deck', 3], ['scripture', BookOpen, 'Scripture graphic', 'A verse in your brand look', 2], ['sermon', Sparkles, 'From a sermon', 'Slides, carousels and stories from its words', 1]].map(([m, Icon, t, d, tone]) => (
            <button key={m} className="cn-card" onClick={() => onMaker(m)}>
              <span className={`cn-icon tone tone-${tone}`}><Icon size={18} /></span>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}><strong className="small">{t}</strong><span className="muted" style={{ fontSize: 12 }}>{d}</span></span>
            </button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Clip intro and end cards</span>
        <div className="cn-grid">
          {cards.map((t) => (
            <button key={t.id} className="cn-card tall" onClick={() => onTemplate(t)}>
              <span className="cn-thumb" style={{ aspectRatio: `${KINDS[t.kind].w}/${KINDS[t.kind].h}` }}><TemplateThumb tpl={t} ctx={ctx} /></span>
              <strong className="small">{t.name}</strong>
            </button>
          ))}
        </div>
        <span className="hint">Save one, then pick it in a clip's Graphics tab to show at the start or end.</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Start blank</span>
        <div className="cn-grid">
          {Object.entries(KINDS).filter(([k]) => k !== 'custom').map(([k, K]) => {
            const Icon = KIND_ICON[k] || Scaling;
            return (
              <div key={k} className="cn-card">
                <span className={`cn-icon tone tone-${KIND_TONE[k] || 1}`}><Icon size={18} /></span>
                <button className="cn-main" onClick={() => onBlank(k)}>
                  <strong className="small">{K.label}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{K.w}×{K.h}</span>
                </button>
                {count(k) > 0 && <button className="btn ghost sm" onClick={() => onBrowse(k)}>{count(k)} templates</button>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Any size</span>
        <div className="angle-row">{SIZE_PRESETS.map(([l, a, b]) => <button key={l} className={`pill-choice ${w === a && h === b ? 'on' : ''}`} onClick={() => { setW(a); setH(b); }}>{l}</button>)}</div>
        <div className="row wrap" style={{ gap: 10, alignItems: 'end' }}>
          <label className="field" style={{ width: 130 }}>Width (px)<input className="input num" type="number" value={w} onChange={(e) => setW(Number(e.target.value))} /></label>
          <label className="field" style={{ width: 130 }}>Height (px)<input className="input num" type="number" value={h} onChange={(e) => setH(Number(e.target.value))} /></label>
          <button className="btn primary" disabled={!ok} onClick={() => onSize({ w, h })}><Plus size={14} />Create {w}×{h}</button>
        </div>
        {!ok && <span className="hint">Sizes run from 100 to 6000 pixels.</span>}
      </div>
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

/** Slide deck maker: a few questions, then a full deck from your notes or a sermon. */
function DeckMaker({ ctx, onClose, onCreate }) {
  const [sermons, setSermons] = useState([]);
  const [a, setA] = useState({ kind: 'sermon', projectId: '', title: '', subtitle: '', passages: '', format: 'hybrid', questions: true, notes: '', start: 'notes' });
  const [busy, setBusy] = useState(false);
  const set = (p) => setA((x) => ({ ...x, ...p }));
  useEffect(() => { api.get('/api/projects').then(({ projects }) => setSermons(projects.filter((p) => p.status === 'transcribed'))).catch(() => {}); }, []);
  const readFile = async (f) => { if (f) set({ notes: await f.text(), start: 'notes' }); };
  const make = async () => {
    setBusy(true);
    let outline = null;
    if (a.projectId && a.start === 'sermon') outline = await api.get(`/api/outline/${a.projectId}`).then((r) => r.outline).catch(() => null);
    const passages = a.passages.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const d = newDoc('presentation', null, ctx);
    d.pages = buildDeck({ ...a, notes: a.start === 'notes' ? a.notes : '', passages, outline, title: a.title || outline?.title || (a.kind === 'class' ? 'Class title' : 'Sermon title') }, ctx);
    d.name = a.title || outline?.title || 'New slide deck';
    if (a.projectId && a.start === 'sermon') d.source = { projectId: a.projectId, template: 'deck-sermon' };
    onCreate(d);
  };
  const found = a.notes ? parseNotes(a.notes) : null;
  return (
    <Modal label="Slide deck maker" onClose={onClose} width={660}>
      <ModalHead title="Slide deck maker" sub="Answer a few questions and get a full deck to polish." />
      <div className="seg">{[['sermon', 'Sermon'], ['class', 'Class or study']].map(([k, l]) => <button key={k} className={a.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>{l}</button>)}</div>
      <div className="token-grid">
        <label className="field">Title<input className="input" value={a.title} placeholder={a.kind === 'class' ? 'Romans, week 3' : 'Rooted'} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="field">Speaker or date <span className="hint">Optional</span><input className="input" value={a.subtitle} placeholder="Pastor Name · Nov 23" onChange={(e) => set({ subtitle: e.target.value })} /></label>
      </div>
      <label className="field">Key passages <span className="hint">Separate with commas</span><input className="input" value={a.passages} placeholder="Colossians 2:6-7, Psalm 1:3" onChange={(e) => set({ passages: e.target.value })} /></label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">How much on each slide?</span>
        <div className="choices">
          {[['headlines', 'Headlines only', 'Big, simple. You say the rest.'], ['hybrid', 'Hybrid', 'A headline and one key line.'], ['bullets', 'Full bullets', 'Every point on screen.']].map(([k, t, d]) => (
            <button key={k} className={`choice ${a.format === k ? 'on' : ''}`} onClick={() => set({ format: k })}><span className="t"><span className="radio" />{t}</span><span className="d">{d}</span></button>
          ))}
        </div>
        <label className="switch small"><input type="checkbox" checked={a.questions} onChange={(e) => set({ questions: e.target.checked })} />Include discussion questions on screen</label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">Build it from</span>
        <div className="seg sm">
          <button className={a.start === 'notes' ? 'on' : ''} onClick={() => set({ start: 'notes' })}>My notes</button>
          {sermons.length > 0 && <button className={a.start === 'sermon' ? 'on' : ''} onClick={() => set({ start: 'sermon', projectId: a.projectId || sermons[0].id })}>A transcribed sermon</button>}
          <button className={a.start === 'blank' ? 'on' : ''} onClick={() => set({ start: 'blank' })}>One slide at a time</button>
        </div>
        {a.start === 'notes' && (
          <>
            <textarea className="input" rows={7} value={a.notes} onChange={(e) => set({ notes: e.target.value })}
              placeholder={'Paste your notes. Headings become slides, lines under them become points.\n\n1. Roots grow in hidden places\n- What happens in private shapes what we carry in public\n2. You cannot rush a root\nWhat would change if you trusted the slow work?'} />
            <div className="row between wrap" style={{ gap: 8 }}>
              <label className="btn sm ghost" style={{ cursor: 'pointer' }}><input type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(e) => readFile(e.target.files?.[0])} />Open a notes file</label>
              {found && <span className="hint">{found.sections.length} slides, {found.questions.length} questions, {found.refs.length} passages found</span>}
            </div>
          </>
        )}
        {a.start === 'sermon' && (
          <select className="input" value={a.projectId} onChange={(e) => set({ projectId: e.target.value })}>{sermons.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        )}
        {a.start === 'blank' && <span className="hint">You'll get a title slide, your passages and three point slides to fill in.</span>}
      </div>
      <div className="row between" style={{ marginTop: 6 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={make}><Wand2 size={15} />{busy ? 'Building…' : 'Build the deck'}</button>
      </div>
    </Modal>
  );
}

/** Scripture graphic: the reference is written the standard way, and the verse is laid out to fit. */
function ScriptureMaker({ ctx, onClose, onCreate }) {
  const [ref, setRef] = useState('');
  const [verse, setVerse] = useState('');
  const [tr, setTr] = useState('');
  const [look, setLook] = useState('calm');
  const [size, setSize] = useState('post');
  const [clean, setClean] = useState(null);
  const tidy = async () => { if (!ref.trim()) return; const r = await api.post('/api/scripture/normalize', { text: ref }).catch(() => null); if (r?.refs?.[0]) { setClean(r.refs[0]); setRef(r.refs[0]); } };
  const make = () => {
    const kind = size === 'story' ? 'story' : size === 'slide' ? 'presentation' : 'post';
    const d = newDoc(kind, null, ctx);
    if (size === 'square') d.size = { w: 1080, h: 1080 };
    d.pages = [scripturePage(ctx, { ref, verse, translation: tr }, look)];
    d.name = ref ? `${ref} · Scripture` : 'Scripture graphic';
    onCreate(d);
  };
  return (
    <Modal label="Scripture graphic" onClose={onClose} width={560}>
      <ModalHead title="Scripture graphic" sub="Type the reference any way you like. It's written the standard way for you." />
      <div className="token-grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <label className="field">Reference<input className="input" value={ref} placeholder="first corinthians 10 16" onChange={(e) => { setRef(e.target.value); setClean(null); }} onBlur={tidy} /></label>
        <label className="field">Translation <span className="hint">Optional</span><input className="input" value={tr} placeholder="ESV" onChange={(e) => setTr(e.target.value)} /></label>
      </div>
      {clean && <span className="hint">Written as {clean}</span>}
      <label className="field">Verse<textarea className="input" rows={4} value={verse} placeholder="Paste the verse from your Bible app" onChange={(e) => setVerse(e.target.value)} /></label>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="seg sm">{[['calm', 'Light'], ['bold', 'Bold']].map(([k, l]) => <button key={k} className={look === k ? 'on' : ''} onClick={() => setLook(k)}>{l}</button>)}</div>
        <div className="seg sm">{[['post', 'Post'], ['square', 'Square'], ['story', 'Story'], ['slide', 'Slide']].map(([k, l]) => <button key={k} className={size === k ? 'on' : ''} onClick={() => setSize(k)}>{l}</button>)}</div>
      </div>
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="hint">Uses your brand colors and fonts.</span>
        <button className="btn primary" disabled={!ref.trim()} onClick={make}><BookOpen size={14} />Make it</button>
      </div>
    </Modal>
  );
}
