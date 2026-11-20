import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard, Copy, GalleryHorizontalEnd, Heart, LayoutGrid, MonitorPlay, NotebookPen, Presentation, Printer,
  Scaling, Search, Smartphone, Sparkles, Trash2, Home as HomeIcon, Wand2, X, BookOpen, Plus, PenTool, Film, Laptop, CalendarClock,
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { Masonry } from '../components/Masonry.jsx';
import { api } from '../api.js';
import Modal, { ModalHead } from '../components/Modal.jsx';
import DesignEditor from '../design/DesignEditor.jsx';
import { useChurchEvents } from '../components/ChurchEvents.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { KINDS, SIZE_PRESETS, TEMPLATES as BASE_TEMPLATES, blankPage, copyForDate, fillChurch, countdownPages, loadAssets, page as newPage, renderPage, scripturePage, uid } from '../design/model.js';
import { PACKS as PACKS1, PACK_TEMPLATES } from '../design/packs.js';
import { PACKS2, PACK2_TEMPLATES, inBrandColors } from '../design/packs2.js';

// Every template pack: the newer plug-and-play packs first.
export const PACKS = { ...PACKS2, ...PACKS1 };
import { buildDeck, parseNotes } from '../design/deckBuilder.js';

// Event-ready templates fill in an event's details by themselves.
const EVENT_READY = new Set(['post-event', 'flyer-event', ...Object.keys(PACKS1).map((k) => `${k}-event`)]);
export const TEMPLATES = [...PACK2_TEMPLATES, ...BASE_TEMPLATES.map((t) => (EVENT_READY.has(t.id) ? { ...t, event: true } : t)), ...PACK_TEMPLATES.map((t) => (EVENT_READY.has(t.id) ? { ...t, event: true, photos: 1 } : t))];

export { cohesive } from '../design/model.js';

// Tile colors come from the app theme (tone-1 to tone-6 in styles.css), so they follow the user's colors.
// The Design bar: a few categories, each opening the kinds of design inside it.
// Tile colors come from the app theme (tone-1 to tone-6 in styles.css), so they follow the user's colors.
const CATEGORIES = [
  ['design', 'Design', PenTool, 5, [['design', 'Blank design', 'A square canvas to start your own way', PenTool], ['presentation', 'Presentation', 'Slides you can present', Presentation], ['deck', 'Slide deck maker', 'A full deck from a few answers', Wand2], ['scripture', 'Scripture graphic', 'A verse in your brand look', BookOpen], ['sermon', 'From a sermon', 'Slides, carousels and stories from its words', Sparkles], ['import', 'Bring in your own', 'A design from Canva, Photoshop or anywhere', Laptop]]],
  ['video', 'Video', Film, 6, [['videocard', 'Clip intro and end cards', 'For the start or end of a clip', Film], ['thumbnail', 'YouTube thumbnail', 'A cover for your video', MonitorPlay]]],
  ['social', 'Social', Heart, 2, [['post', 'Social post', 'Quote cards, events, verses', Heart], ['story', 'Story', 'Instagram and Facebook stories', Smartphone], ['carousel', 'Carousel', 'Swipeable posts and recaps', GalleryHorizontalEnd], ['event', 'For an event', 'Pick a church event and a template', CalendarClock]]],
  ['print', 'Print', Printer, 3, [['flyer', 'Flyer', 'Letter size, print or share', Printer], ['notes', 'Sermon notes', 'Fill-in-the-blank handouts', NotebookPen], ['print-sizes', 'Posters and more', 'Half letter, 11x17, 18x24', Scaling]]],
  ['custom', 'Custom', Scaling, 0, null],
];
const SERMON_OUTPUTS = [
  ['deck-sermon', 'Sermon slides', 'Title, passages, main points, quotes and next steps'],
  ['car-recap', 'Recap carousel', 'A cover, one page per point, and a call to watch'],
  ['car-quotes', 'Quote carousel', 'The most shareable lines, one per page'],
  ['story-recap', 'Story set', 'Three or four story pages'],
  ['notes-blanks', 'Fill-in notes', 'A handout with blanks for each point'],
  ['thumb-sermon', 'Thumbnail', 'A YouTube cover with the title'],
];

export function useBrandCtx() {
  const { config } = useApp();
  // One object while the brand stays the same, so template previews don't redraw for nothing.
  return useMemo(() => {
    const c = [...(config.brandColors || [])];
    const fallback = ['#2B7F5F', '#D9A441', '#1B2440', '#F4EFE6', '#8FB8A8'];
    while (c.length < 5) c.push(fallback[c.length]);
    const f = config.brandFonts || { heading: 'Montserrat', body: 'Montserrat' };
    return { c: c.slice(0, 5), h: f.heading, b: f.body, o: null, church: config.churchInfo || {}, logo: config.appLogo || null };
  }, [config.brandColors, config.brandFonts, config.churchInfo, config.appLogo]);
}

/** A new design: blank, or from a template, with church details filled in. brand: use the church's colors. */
export function newDoc(kind, tpl, ctx, size, { brand = false } = {}) {
  const k = KINDS[kind];
  const packColors = tpl?.pack ? PACKS[tpl.pack].c : null;
  let pages = tpl ? fillChurch(tpl.build(ctx), ctx.church) : [blankPage(kind, ctx)];
  if (brand && packColors) pages = inBrandColors(pages, packColors, ctx.c);
  return {
    id: uid(), name: tpl ? (ctx.ev?.title ? `${ctx.ev.title} · ${tpl.name}` : tpl.name) : `Untitled ${k.label.toLowerCase()}`, kind,
    size: size || { w: k.w, h: k.h }, palette: packColors && !brand ? [...packColors] : ctx.c, tint: { color: '#FF9A62', amount: 0 },
    pages, source: ctx.ev ? { event: ctx.ev.title } : undefined,
  };
}

export function TemplateThumb({ tpl, ctx, brand = false }) {
  const ref = useRef(null);
  const doc = useMemo(() => newDoc(tpl.kind, tpl, ctx, undefined, { brand }), [tpl, ctx, brand]);
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
  return { title: e.title, when: [day, time].filter(Boolean).join(' · '), day, time, place: e.location?.split(',')[0] || '', summary: e.summary || '', link: e.link || null,
    month: d.toLocaleDateString([], { month: 'short' }).toUpperCase(), num: String(d.getDate()), weekday: d.toLocaleDateString([], { weekday: 'long' }),
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
  const [redate, setRedate] = useState(null); // a design to copy for a new date
  const [pickFor, setPickFor] = useState(null); // a calendar event to pick a template for
  const [cat, setCat] = useState(null); // the open category in the Design bar
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
    if (eventMode === 'pick') { setPickFor(event); return; }
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
    if (k === 'import') return setModal('import');
    if (k === 'print-sizes') return setModal('custom');
    if (k === 'event') return setModal('events');
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
        {CATEGORIES.map(([id, label, Icon, tone, subs]) => (
          <button key={id} className={`dz-tile ${cat === id ? 'on' : ''}`} aria-expanded={subs ? cat === id : undefined} onClick={() => (subs ? setCat(cat === id ? null : id) : setModal('custom'))}>
            <span className={`dz-tile-icon ${tone ? `tone tone-${tone}` : 'plain'}`}><Icon size={24} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {cat && (
        <div className="dz-subs">
          {CATEGORIES.find((c) => c[0] === cat)[4].map(([k, label, about, Icon]) => (
            <button key={k} className="cn-card" onClick={() => pick(k)}>
              <span className="cn-icon tone tone-1"><Icon size={17} /></span>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}><strong className="small">{label}</strong><span className="muted" style={{ fontSize: 12 }}>{about}</span></span>
            </button>
          ))}
        </div>
      )}

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
                    <button className="rt-btn" title="Copy for a new date" aria-label="Copy for a new date" onClick={() => setRedate(d)}><CalendarClock size={14} /></button>
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
      {modal === 'events' && <PickEvent onClose={() => setModal(null)} onPick={(e) => { setModal(null); setPickFor(e); }} />}
      {pickFor && <EventTemplates event={pickFor} ctx={ctx} onClose={() => setPickFor(null)} onPick={(doc) => { setPickFor(null); create({ ...doc, firstPhoto: true }); }} />}
      {redate && <Redate design={redate} onClose={() => setRedate(null)} onDone={(id, changed) => { setRedate(null); load(); toast({ text: changed ? `Copy made with ${changed} date${changed === 1 ? '' : 's'} updated. Check the times too.` : 'Copy made. No dates were found in its text, so check it over.', action: { label: 'Open', run: () => setOpen(id) } }); }} />}
      {modal === 'import' && (
        <LibraryPicker title="Bring in your own design" folder="Graphics" onClose={() => setModal(null)} onPick={async (i) => {
          setModal(null);
          // Keep the picture's own shape: the design is the same size, with the picture filling it.
          const im = await new Promise((res) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => res(null); x.src = i.url; });
          const k = im ? Math.min(1, 4000 / Math.max(im.naturalWidth, im.naturalHeight)) : 1;
          const size = im?.naturalWidth ? { w: Math.round(im.naturalWidth * k), h: Math.round(im.naturalHeight * k) } : { w: 1080, h: 1080 };
          const d = newDoc('custom', null, ctx, size);
          d.name = i.name.replace(/\.[a-z0-9]+$/i, '');
          d.pages = [newPage({ bg: { type: 'image', image: i.rel, darken: 0 }, items: [] })];
          create(d);
        }} />
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
          {[['deck', Wand2, 'Slide deck maker', 'Answer a few questions, get a full deck', 3], ['scripture', BookOpen, 'Scripture graphic', 'A verse in your brand look', 2], ['sermon', Sparkles, 'From a sermon', 'Slides, carousels and stories from its words', 1], ['import', Laptop, 'Bring in your own', 'A design from Canva, Photoshop or anywhere, ready to resize, add to or post', 4]].map(([m, Icon, t, d, tone]) => (
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

/** Pick which upcoming church event a design is for. */
function PickEvent({ onClose, onPick }) {
  const cal = useChurchEvents();
  const upcoming = (cal.events || []).filter((e) => new Date(e.end || e.start) >= new Date()).slice(0, 30);
  return (
    <Modal label="Pick an event" onClose={onClose} width={520}>
      <ModalHead title="Which event is it for?" sub="Templates fill in its name, day, time and place." />
      {!cal.linked && <div className="keycard small muted">Link your church calendar in Settings › Connections to see events here.</div>}
      {cal.linked && !upcoming.length && <span className="muted small">No upcoming events.</span>}
      <div className="stack" style={{ gap: 6 }}>
        {upcoming.map((e) => (
          <button key={e.id} className="insp-row" style={{ border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => onPick(e)}>
            <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{e.title}</strong><span className="muted small">{new Date(e.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{e.location ? ` · ${e.location.split(',')[0]}` : ''}</span></div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Pick a template for a church event. Every option already shows the event's details. */
function EventTemplates({ event, ctx, onClose, onPick }) {
  const ev = useMemo(() => eventForDesign(event), [event]);
  const ectx = useMemo(() => ({ ...ctx, ev }), [ctx, ev]);
  const [kind, setKind] = useState('post');
  const [brand, setBrand] = useState(false);
  const list = TEMPLATES.filter((t) => t.event && (kind === 'all' || t.kind === kind));
  return (
    <Modal label="Make from template" onClose={onClose} width={980}
      footer={<><span className="hint">Pick one, add a photo, and it’s ready. You can change anything after.</span><label className="switch small"><input type="checkbox" checked={brand} onChange={(e) => setBrand(e.target.checked)} />Use my brand colors</label></>}>
      <ModalHead title={`A design for ${event.title}`} sub={ev.when + (ev.place ? ` · ${ev.place}` : '')} />
      <div className="seg" style={{ justifySelf: 'start' }}>
        {[['post', 'Posts'], ['story', 'Stories'], ['flyer', 'Flyers'], ['all', 'All']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <div className="evt-grid">
        {list.map((t) => (
          <button key={t.id} className="dz-card glass dz-tpl" onClick={() => onPick(newDoc(t.kind, t, ectx, undefined, { brand }))}>
            <span className="dz-card-cover"><TemplateThumb tpl={t} ctx={ectx} brand={brand} /></span>
            <span className="dz-card-meta"><span className="stack" style={{ gap: 0 }}><strong className="small">{PACKS[t.pack]?.name || 'Classic'}</strong><span className="muted" style={{ fontSize: 12 }}>{KINDS[t.kind].label}{t.photos ? ' · 1 photo' : ''}</span></span></span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Copy a design for the next time an event comes around, with every date in its text moved. */
function Redate({ design, onClose, onDone }) {
  const next = new Date(); next.setDate(next.getDate() + 7);
  const [date, setDate] = useState(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const { design: full } = await api.get(`/api/designs/${design.id}`);
    const { doc, changed } = copyForDate(full, new Date(`${date}T12:00`));
    await api.put(`/api/designs/${doc.id}`, doc);
    onDone(doc.id, changed);
  };
  return (
    <Modal label="Copy for a new date" onClose={onClose} width={440}
      footer={<><span className="hint">Dates like “Sunday, Nov 22” or “11/22” are rewritten.</span><button className="btn primary" disabled={busy || !date} onClick={go}><Copy size={14} />Make copy</button></>}>
      <ModalHead title="Copy for a new date" sub={design.name} />
      <label className="field">New date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    </Modal>
  );
}

function CustomSize({ onClose, onCreate }) {
  const [w, setW] = useState(1080); const [h, setH] = useState(1080);
  const ok = w >= 100 && h >= 100 && w <= 6000 && h <= 6000;
  const preset = SIZE_PRESETS.find(([, a, b]) => a === w && b === h);
  // The preview keeps the real shape inside a fixed box.
  const box = 200; const k = ok ? Math.min(box / w, box / h) : 0;
  const inches = w % 75 === 0 && h % 75 === 0 && (w >= 600 || h >= 600) ? ` · ${(w / 150).toFixed(2).replace(/\.?0+$/, '')} x ${(h / 150).toFixed(2).replace(/\.?0+$/, '')} in printed` : '';
  return (
    <Modal label="Custom size" onClose={onClose} width={640}
      footer={<><span className="hint">Any size from 100 to 6000 pixels.</span><button className="btn primary" disabled={!ok} onClick={() => onCreate({ w, h })}><Plus size={14} />Create {w}×{h}</button></>}>
      <ModalHead title="Custom size" />
      <div className="size-pick">
        <div className="stack" style={{ gap: 14, minWidth: 0 }}>
          <div className="angle-row">{SIZE_PRESETS.map(([l, a, b]) => <button key={l} className={`pill-choice ${w === a && h === b ? 'on' : ''}`} onClick={() => { setW(a); setH(b); }}>{l}</button>)}</div>
          <div className="token-grid">
            <label className="field">Width (px)<input className="input num" type="number" value={w} onChange={(e) => setW(Number(e.target.value))} /></label>
            <label className="field">Height (px)<input className="input num" type="number" value={h} onChange={(e) => setH(Number(e.target.value))} /></label>
          </div>
          <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => { setW(h); setH(w); }}>Swap width and height</button>
        </div>
        <div className="size-preview" aria-live="polite">
          <div className="size-stage">{ok && <div className="size-canvas" style={{ width: w * k, height: h * k }}><span className="num small">{w}×{h}</span></div>}</div>
          <strong className="small">{preset ? preset[0] : w === h ? 'Square' : w > h ? 'Wide' : 'Tall'}</strong>
          <span className="muted small">{ok ? `${(w / h).toFixed(2)} : 1${inches}` : 'Pick a size'}</span>
        </div>
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
