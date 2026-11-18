import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, Image as ImageIcon, Film, FileText, Shapes, Eye, X, Wand2, Palette, Heart, Trash2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, desktop } from '../api.js';
import ColorField from '../components/ColorField.jsx';
import FontMenu, { useFamilies } from '../components/FontMenu.jsx';
import SetupChecklist from '../components/SetupChecklist.jsx';

/** Main colors in an image (a logo): bucket pixels, skip transparent ones, keep distinct colors. */
async function colorsFrom(url, n = 4) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); const k = Math.min(1, 160 / Math.max(img.width, img.height));
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const tally = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const key = [px[i] >> 4, px[i + 1] >> 4, px[i + 2] >> 4].join(',');
    const t = tally.get(key) || { n: 0, r: 0, g: 0, b: 0 }; t.n++; t.r += px[i]; t.g += px[i + 1]; t.b += px[i + 2]; tally.set(key, t);
  }
  const out = [];
  for (const t of [...tally.values()].sort((a, b) => b.n - a.n)) {
    const rgb = [t.r / t.n, t.g / t.n, t.b / t.n];
    if (out.some((o) => Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2]) < 60)) continue;
    out.push(rgb);
    if (out.length >= n) break;
  }
  return out.map((v) => `#${v.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`.toUpperCase());
}

function BrandKit({ lib }) {
  const { config, saveConfig, toast } = useApp();
  const families = useFamilies();
  const colors = config.brandColors || [];
  const fonts = config.brandFonts || { heading: 'Montserrat', body: 'Montserrat' };
  const setColors = (list) => saveConfig({ brandColors: list, brandColorsSet: true });
  const logo = (lib?.items || []).find((i) => i.folder === 'Logos' && i.kind === 'image');
  return (
    <section id="brand-kit" className="glass panel stack" style={{ gap: 16 }}>
      <div className="row between wrap">
        <div className="stack" style={{ gap: 2 }}><h2>Brand kit</h2><span className="muted small">Graphics, slides and captions start with these.</span></div>
        {logo && <button className="btn sm" onClick={async () => { const c = await colorsFrom(logo.url).catch(() => []); if (c.length) { setColors([...new Set([...c, ...colors])].slice(0, 8)); toast({ text: `Added ${c.length} colors from ${logo.name}.` }); } }}><Wand2 size={13} />Colors from my logo</button>}
      </div>
      <div className="brand-kit">
        <div className="stack" style={{ gap: 8 }}>
          <span className="field-label">Colors</span>
          <div className="row wrap" style={{ gap: 10 }}>
            {colors.map((c, i) => (
              <span key={`${i}-${c}`} className="kit-color">
                <ColorField value={c} size={46} onChange={(v) => setColors(colors.map((x, j) => (j === i ? v : x)))} />
                <button className="kit-x" aria-label={`Remove ${c}`} onClick={() => setColors(colors.filter((_, j) => j !== i))}><X size={11} /></button>
                <span className="mono muted" style={{ fontSize: 11 }}>{c}</span>
              </span>
            ))}
            {colors.length < 8 && <button className="kit-add" aria-label="Add a color" onClick={() => setColors([...colors, '#888888'])}><Plus size={18} /></button>}
          </div>
        </div>
        <div className="token-grid">
          <FontMenu label="Heading font" value={fonts.heading} options={families} onChange={(v) => saveConfig({ brandFonts: { ...fonts, heading: v }, brandFontsSet: true })} />
          <FontMenu label="Body font" value={fonts.body} options={families} onChange={(v) => saveConfig({ brandFonts: { ...fonts, body: v }, brandFontsSet: true })} />
        </div>
        <div className="kit-sample" style={{ background: colors[0] || 'var(--accent)' }}>
          <strong style={{ fontFamily: `'${fonts.heading}'`, color: colors[3] || '#fff' }}>Sunday is coming</strong>
          <span style={{ fontFamily: `'${fonts.body}'`, color: colors[3] || '#fff', opacity: 0.9 }}>Join us at 10am. Everyone is welcome.</span>
          <span className="kit-chip" style={{ background: colors[1] || '#fff', color: colors[2] || '#111' }}>Plan a visit</span>
        </div>
      </div>
    </section>
  );
}

const ICON = { image: ImageIcon, video: Film, doc: FileText };

export default function BrandLibrary({ section }) {
  useEffect(() => {
    if (!section) return undefined;
    let n = 0;
    const t = setInterval(() => { const el = document.getElementById(`brand-${section}`); if (el || ++n > 20) { clearInterval(t); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 150);
    return () => clearInterval(t);
  }, [section]);
  const { go, onJobFinished } = useApp();
  const [lib, setLib] = useState(null);
  const [folder, setFolder] = useState('All');
  const [q, setQ] = useState('');
  const load = () => api.get('/api/library').then(setLib);
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);
  useEffect(() => onJobFinished(() => load()), [onJobFinished]);
  const items = (lib?.items || []).filter((i) => (folder === 'All' || i.folder === folder) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const counts = Object.fromEntries((lib?.folders || []).map((f) => [f, (lib?.items || []).filter((i) => i.folder === f).length]));
  const { config } = useApp();
  const addTo = async (target) => { if (!desktop?.pickFiles) return api.post('/api/library/open', { folder: target }); const paths = await desktop.pickFiles(); if (paths.length) { await api.post('/api/library/import', { paths, folder: target }); load(); } };
  const kit = () => document.getElementById('brand-kit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="page">
      <div className="row between wrap">
        <div className="stack" style={{ gap: 2 }}>
          <h1>Brand library</h1>
          <span className="muted">Photos, logos and graphics you reuse. It's a normal folder, so you can add files in Finder too.</span>
        </div>
        <div className="row">
          {desktop?.pickFiles && <button className="btn" onClick={async () => { const paths = await desktop.pickFiles(); if (paths.length) { await api.post('/api/library/import', { paths, folder: folder === 'All' || folder === 'Writing' ? 'Photos' : folder }); load(); } }}><Plus size={15} />Add files</button>}
          <button className="btn primary" onClick={() => api.post('/api/library/open', { folder: folder === 'All' ? null : folder })}><FolderOpen size={15} />Open in Finder</button>
        </div>
      </div>
      <div className="row between wrap">
        <div className="seg">{['All', ...(lib?.folders || [])].map((f) => <button key={f} className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>{f}{f !== 'All' && counts[f] ? ` · ${counts[f]}` : ''}</button>)}</div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {lib && (
        <SetupChecklist id="brand-setup" eyebrow="Set up your brand" title={(done, total) => (done === 0 ? 'A few building blocks' : `${done} of ${total} done`)} steps={[
          { label: 'Add your logo', help: 'A PNG with a clear background works best.', ok: (counts.Logos || 0) >= 1, action: () => addTo('Logos'), cta: 'Add logo' },
          { label: 'Add a light version', help: 'A white or one-color logo for dark backgrounds and video.', ok: (counts.Logos || 0) >= 2, action: () => addTo('Logos'), cta: 'Add' },
          { label: 'Set your brand colors', help: 'Pull them from your logo or pick your own.', ok: Boolean(config.brandColorsSet), action: kit, cta: 'Set colors' },
          { label: 'Pick your fonts', help: 'One for headings, one for body text.', ok: Boolean(config.brandFontsSet), action: kit, cta: 'Pick fonts' },
          { label: 'Add your church info', help: 'Name, service times and address for printed guides.', ok: Boolean(config.churchInfo?.name), action: () => go({ name: 'settings', section: 'church' }), cta: 'Add info' },
          { label: 'Add a few photos', help: 'Your building, your people, worship. Three or more.', ok: (counts.Photos || 0) >= 3, action: () => addTo('Photos'), cta: 'Add photos' },
          { label: 'Make your first graphic', help: 'A quote card from Sunday is a good start.', ok: (counts.Graphics || 0) >= 1, action: () => go({ name: 'graphics' }), cta: 'Make one' },
        ]} />
      )}
      {lib && <BrandKit lib={lib} />}
      <BrandVoice />
      {lib && <span className="muted small truncate" title={lib.root}>{lib.root.replace(/^\/Users\/[^/]+/, '~')}</span>}
      {!lib && <div className="lib-grid big">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />)}</div>}
      {lib && !items.length && (
        <div className="glass empty">
          <FolderOpen size={40} />
          <h3>{q ? 'No files match' : 'Nothing here yet'}</h3>
          <p>Add photos, logos and brand files. Graphics you make here land in the Graphics folder.</p>
          <div className="row"><button className="btn primary" onClick={() => api.post('/api/library/open', {})}>Open in Finder</button><button className="btn" onClick={() => go({ name: 'graphics' })}><Shapes size={14} />Make a graphic</button></div>
        </div>
      )}
      <div className="lib-grid big">
        {items.map((i) => {
          const I = ICON[i.kind];
          return (
            <div key={i.rel} className="glass lib-card">
              <div className="lib-thumb">{i.kind === 'image' ? <img src={i.url} alt="" loading="lazy" /> : <I size={36} />}</div>
              <div className="stack" style={{ gap: 4, padding: '8px 10px 10px' }}>
                <strong className="truncate small" title={i.name}>{i.name}</strong>
                <span className="muted small">{i.folder} · {i.bytes > 1048576 ? `${(i.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(i.bytes / 1024))} KB`}</span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn icon sm" title="Show in Finder" aria-label="Show in Finder" onClick={() => api.post('/api/library/reveal', { rel: i.rel })}><Eye size={14} /></button>
                  {i.kind === 'image' && <button className="btn sm" onClick={() => go({ name: 'graphics', image: i.rel })}><Shapes size={13} />Use in a graphic</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Brand voice: the church's own words, so drafts sound like the church. */
function BrandVoice() {
  const { toast } = useApp();
  const [v, setV] = useState(null);
  const [theme, setTheme] = useState('');
  const [adding, setAdding] = useState(null); // { title, text }
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.get('/api/brand-voice').then((r) => setV(r.voice)).catch(() => setV({ mission: '', website: '', themes: [], samples: [] })); }, []);
  const put = async (patch) => { const r = await api.put('/api/brand-voice', patch); setV(r.voice); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  if (!v) return null;
  const addTheme = () => { const t = theme.trim(); if (!t || v.themes.includes(t)) return; put({ themes: [...v.themes, t] }); setTheme(''); };
  const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
  return (
    <section id="brand-voice" className="glass panel stack" style={{ gap: 16 }}>
      <div className="row between wrap">
        <div className="stack" style={{ gap: 2 }}><h2>Brand voice</h2><span className="muted small">Your church's own words. Writing gets a voice score, and new drafts lean toward these themes.</span></div>
        {saved && <span className="chip ok">Saved</span>}
      </div>
      <div className="voice-grid">
        <label className="field">Mission statement
          <textarea className="input" rows={3} defaultValue={v.mission} placeholder="We exist to…" onBlur={(e) => e.target.value !== v.mission && put({ mission: e.target.value })} />
        </label>
        <label className="field">Core copy from your website <span className="hint">Paste your About page or welcome text.</span>
          <textarea className="input" rows={3} defaultValue={v.website} placeholder="Welcome to…" onBlur={(e) => e.target.value !== v.website && put({ website: e.target.value })} />
        </label>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="field-label">Central ideas and themes</span>
        <span className="hint">A few phrases that say who you are, like "grace for everyone" or "rooted in our neighborhood". They show up naturally in drafts and in the voice score.</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {v.themes.map((t) => (
            <span key={t} className="chip theme-chip">{t}<button aria-label={`Remove ${t}`} onClick={() => put({ themes: v.themes.filter((x) => x !== t) })}><X size={11} /></button></span>
          ))}
          {v.themes.length < 12 && (
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); addTheme(); }}>
              <input className="input" style={{ width: 220 }} value={theme} placeholder="Add a theme" onChange={(e) => setTheme(e.target.value)} />
              <button className="btn sm" disabled={!theme.trim()}><Plus size={13} />Add</button>
            </form>
          )}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row between wrap">
          <span className="field-label">Writing samples · {v.samples.length}</span>
          {!adding && <button className="btn sm" onClick={() => setAdding({ title: '', text: '' })}><Plus size={13} />Share a writing sample</button>}
        </div>
        <span className="hint">Past blog posts, newsletters or welcome emails you love. Finished blogs can be added from Writing with "Save to brand voice".</span>
        {adding && (
          <div className="keycard stack" style={{ gap: 8 }}>
            <input className="input" value={adding.title} placeholder="Title (optional)" onChange={(e) => setAdding({ ...adding, title: e.target.value })} />
            <textarea className="input" rows={6} value={adding.text} placeholder="Paste the text here" onChange={(e) => setAdding({ ...adding, text: e.target.value })} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" disabled={words(adding.text) < 30} onClick={async () => {
                try { await api.post('/api/brand-voice/samples', adding); const r = await api.get('/api/brand-voice'); setV(r.voice); setAdding(null); toast({ text: 'Sample added to your brand voice.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
              }}><Heart size={13} />Add sample</button>
              <button className="btn ghost sm" onClick={() => setAdding(null)}>Cancel</button>
              <span className="hint">{words(adding.text)} words{words(adding.text) < 30 ? ' (at least 30)' : ''}</span>
            </div>
          </div>
        )}
        {v.samples.map((smp) => (
          <div key={smp.id} className="tool-row">
            <span className="type-badge" style={{ width: 30, height: 30, '--t': 'var(--tone-4)' }}><FileText size={14} /></span>
            <div className="stack grow" style={{ gap: 0, minWidth: 0 }}>
              <strong className="small truncate">{smp.title || 'Untitled'}</strong>
              <span className="small muted truncate">{words(smp.text)} words · {smp.source === 'writing' ? 'From Writing' : 'Pasted'} · {new Date(smp.added).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            </div>
            <button className="rt-btn" aria-label={`Remove ${smp.title}`} title="Remove" onClick={async () => { const r = await api.del(`/api/brand-voice/samples/${smp.id}`); setV(r.voice); }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
