// Jumpstart: set Church Studio up from the church website in a minute, or move settings between
// Macs and teammates with a small zip. Everything here can be skipped.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Download, FolderOpen, Globe, Rocket, Upload } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, desktop } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';
import ColorField from './ColorField.jsx';
import { useFamilies } from './FontMenu.jsx';
import { TEMPLATES, renderPage, loadAssets, uid } from '../design/model.js';

/** The My App card. */
export default function JumpstartCard() {
  const [open, setOpen] = useState(null); // 'web' | 'export' | 'import'
  return (
    <section className="glass strong panel stack" id="jumpstart">
      <div className="row" style={{ gap: 10 }}>
        <span className="feed-icon tone tone-2" style={{ color: '#fff' }}><Rocket size={16} /></span>
        <div className="stack grow" style={{ gap: 0 }}><h2 style={{ margin: 0 }}>Jumpstart</h2><span className="muted small">Set up in a minute, or bring your settings to another Mac or teammate.</span></div>
      </div>
      <button className="feed-item" onClick={() => setOpen('web')}>
        <span className="feed-icon"><Globe size={16} /></span>
        <div className="stack grow" style={{ gap: 0 }}><strong>Set up from your website</strong><span className="muted small">Pull your logo, colors, fonts, contact info and voice.</span></div>
        <ArrowRight size={15} className="muted" />
      </button>
      <button className="feed-item" onClick={() => setOpen('export')}>
        <span className="feed-icon"><Download size={16} /></span>
        <div className="stack grow" style={{ gap: 0 }}><strong>Export settings</strong><span className="muted small">Brand kit, voice, church info, links and themes in one small file.</span></div>
        <ArrowRight size={15} className="muted" />
      </button>
      <button className="feed-item" onClick={() => setOpen('import')}>
        <span className="feed-icon"><Upload size={16} /></span>
        <div className="stack grow" style={{ gap: 0 }}><strong>Import settings</strong><span className="muted small">Open a Jumpstart file someone shared with you.</span></div>
        <ArrowRight size={15} className="muted" />
      </button>
      <span className="hint">Projects and videos stay on this Mac. Passwords and keys are never included.</span>
      {open === 'web' && <WebsiteSetup onClose={() => setOpen(null)} />}
      {open === 'export' && <ExportSettings onClose={() => setOpen(null)} />}
      {open === 'import' && <ImportSettings onClose={() => setOpen(null)} />}
    </section>
  );
}

// ------------------------------------------------------------------ from the website
/** The logo's main color: the most common colorful pixel, ignoring near white, black and gray. */
async function logoAccent(dataUrl) {
  const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = dataUrl; });
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
  let px; try { px = g.getImageData(0, 0, 64, 64).data; } catch { return null; }
  const tally = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const [r, gg, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b);
    if (a < 200 || mx < 40 || mx - mn < 50) continue;
    const key = [r, gg, b].map((v) => Math.round(v / 24) * 24).join(',');
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
  if (!top || top[1] < 30) return null;
  return `#${top[0].split(',').map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
const close = (a, b) => [1, 3, 5].reduce((s, i) => s + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0) < 90;
const isQuestion = (t) => /\?\s*$/.test(t);

const FIRST = [['videos', 'Video clips', 'library'], ['social', 'Social posts', 'social'], ['writing', 'Blogs and emails', 'writing'], ['design', 'Graphics and slides', 'graphics']];

export function WebsiteSetup({ onClose, stayHere = false }) {
  const { config, saveConfig, go, toast, refreshLogo, reloadConfig } = useApp();
  const families = useFamilies();
  const [step, setStep] = useState('ask'); // ask | scan | review
  const [site, setSite] = useState(config.churchInfo?.website || '');
  const [yt, setYt] = useState(config.youtubeChannel || '');
  const [first, setFirst] = useState('videos');
  const [found, setFound] = useState(null);
  const [error, setError] = useState(null);
  const [keep, setKeep] = useState({ church: true, colors: true, fonts: true, logo: 0, social: true, voice: true, youtube: true });
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setError(null); setStep('scan');
    try {
      const { found: f } = await api.post('/api/jumpstart/scan', { website: site });
      // Fonts the site uses that are on this Mac. Others fall back to what's picked now.
      const has = (n) => families.find((x) => x.value.toLowerCase() === String(n || '').toLowerCase() || x.value.toLowerCase() === String(n || '').toLowerCase().replace(/[-\s](book|regular|light|bold|ssm a)$/i, ''));
      const heading = has(f.fonts.heading)?.value || f.fonts.all.map(has).find(Boolean)?.value || null;
      const body = has(f.fonts.body)?.value || heading;
      // The logo usually holds the truest brand color: lead with it.
      const accent = f.logos[0] ? await logoAccent(f.logos[0].dataUrl) : null;
      let colors = f.colors;
      // Slots: 0 primary, 1 secondary, 2 text (dark), 3 background (light), 4 accent. Only the color slots move.
      if (accent) {
        const slots = [colors[0], colors[1], colors[4]];
        const at = slots.findIndex((x) => close(x, accent));
        const lead = at >= 0 ? [slots[at], ...slots.filter((_, i) => i !== at)] : [accent, slots[0], slots[1]];
        colors = [lead[0], lead[1], colors[2], colors[3], lead[2]];
      }
      setFound({ ...f, colors, youtube: yt.trim(), fontsOnMac: { heading, body }, fontsWanted: f.fonts });
      setKeep((k) => ({ ...k, logo: f.logos.length ? 0 : null, fonts: Boolean(heading) }));
      setStep('review');
    } catch (e) { setError(e.message); setStep('ask'); }
  };
  const useThese = async () => {
    setBusy(true);
    try {
      const payload = { ...found, fonts: found.fontsOnMac?.heading ? found.fontsOnMac : { heading: null } };
      await api.post('/api/jumpstart/apply', { found: payload, keep });
      await saveConfig({ jumpstart: { at: new Date().toISOString(), website: found.website, first } });
      await reloadConfig?.(); refreshLogo?.();
      toast({ text: 'Church Studio looks like your church now.', celebrate: true });
      onClose();
      if (!stayHere) go({ name: FIRST.find(([k]) => k === first)?.[2] || 'home' });
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose} width={step === 'review' ? 1040 : 560} label="Set up from your website"
      footer={step === 'review' ? (
        <>
          <button className="btn ghost" onClick={() => setStep('ask')}>Back</button>
          <div className="row"><span className="hint">You can change any of this later in Brand library.</span><button className="btn primary" disabled={busy} onClick={useThese}><Check size={15} />{busy ? 'Saving…' : 'Use these'}</button></div>
        </>
      ) : null}>
      {step !== 'review' && (
        <>
          <ModalHead title="Set up from your website" sub="Three quick questions. Church Studio reads your site and shows your brand at work before anything is saved." />
          <label className="field">1. Your church website<input className="input" autoFocus value={site} placeholder="yourchurch.org" onChange={(e) => setSite(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && site.trim() && scan()} /></label>
          <label className="field">2. Your YouTube channel <span className="hint">Optional. A link or @handle.</span><input className="input" value={yt} placeholder="@yourchurch" onChange={(e) => setYt(e.target.value)} /></label>
          <div className="stack" style={{ gap: 6 }}>
            <span className="field-label">3. What do you want to make first?</span>
            <div className="row wrap" style={{ gap: 6 }}>{FIRST.map(([k, l]) => <button key={k} className={`pill-choice ${first === k ? 'on' : ''}`} onClick={() => setFirst(k)}>{l}</button>)}</div>
          </div>
          {error && <div className="banner bad">{error}</div>}
          <div className="row between">
            <button className="btn ghost" onClick={onClose}>Skip for now</button>
            <button className="btn primary" disabled={!site.trim() || step === 'scan'} onClick={scan}><Globe size={15} />{step === 'scan' ? 'Reading your site…' : 'Pull what I can'}</button>
          </div>
          {step === 'scan' && <span className="hint">This takes a few seconds. Only your website is visited.</span>}
        </>
      )}
      {step === 'review' && found && <Review found={found} setFound={setFound} keep={keep} setKeep={setKeep} />}
    </Modal>
  );
}

function Review({ found, setFound, keep, setKeep }) {
  const ci = found.churchInfo;
  const setCi = (patch) => setFound({ ...found, churchInfo: { ...ci, ...patch }, name: patch.name ?? found.name });
  const tick = (k) => <input type="checkbox" checked={Boolean(keep[k]) || keep[k] === 0} onChange={(e) => setKeep({ ...keep, [k]: e.target.checked ? (k === 'logo' ? 0 : true) : (k === 'logo' ? null : false) })} />;
  const fontNote = found.fontsWanted?.heading && found.fontsOnMac?.heading !== found.fontsWanted.heading
    ? `Your site uses ${found.fontsWanted.heading}. ${found.fontsOnMac?.heading ? `Using ${found.fontsOnMac.heading}, which is on this Mac.` : 'It isn’t on this Mac, so your current fonts stay. Install it, then pick it in Brand library.'}`
    : null;
  return (
    <div className="js-review">
      <div className="stack" style={{ gap: 14, minWidth: 0 }}>
        <ModalHead title={`Here's ${found.name || 'your church'}`} sub="Uncheck anything that's off. Edit as you like." />
        <div className="js-block">
          <label className="row small js-label">{tick('logo')}Logo</label>
          {found.logos.length ? (
            <div className="row wrap" style={{ gap: 8 }}>
              {found.logos.map((l, i) => (
                <button key={l.url} className={`js-logo ${keep.logo === i ? 'on' : ''}`} onClick={() => setKeep({ ...keep, logo: i })} title={`From the ${l.from}`}><img src={l.dataUrl} alt="" /></button>
              ))}
            </div>
          ) : <span className="muted small">No logo found. Add one in Brand library.</span>}
        </div>
        <div className="js-block">
          <label className="row small js-label">{tick('colors')}Colors</label>
          <div className="row wrap" style={{ gap: 8 }}>
            {found.colors.map((c, i) => <ColorField key={i} label="" size={32} value={c} onChange={(v) => setFound({ ...found, colors: found.colors.map((x, j) => (j === i ? v : x)) })} />)}
          </div>
        </div>
        <div className="js-block">
          <label className="row small js-label">{tick('fonts')}Fonts</label>
          <span className="small">{found.fontsOnMac?.heading ? `${found.fontsOnMac.heading}${found.fontsOnMac.body && found.fontsOnMac.body !== found.fontsOnMac.heading ? ` and ${found.fontsOnMac.body}` : ''}` : 'None found on this Mac'}</span>
          {fontNote && <span className="hint">{fontNote}</span>}
        </div>
        <div className="js-block">
          <label className="row small js-label">{tick('church')}Church info</label>
          <div className="token-grid">
            <label className="field small">Name<input className="input" value={ci.name || ''} onChange={(e) => setCi({ name: e.target.value })} /></label>
            <label className="field small">Phone<input className="input" value={ci.phone || ''} onChange={(e) => setCi({ phone: e.target.value })} /></label>
            <label className="field small">Email<input className="input" value={ci.email || ''} onChange={(e) => setCi({ email: e.target.value })} /></label>
            <label className="field small">Service times<input className="input" value={ci.times || ''} placeholder="Sundays at 9 and 11 AM" onChange={(e) => setCi({ times: e.target.value })} /></label>
          </div>
          <label className="field small">Address<input className="input" value={ci.address || ''} onChange={(e) => setCi({ address: e.target.value })} /></label>
        </div>
        {(Object.keys(found.social).length > 0 || found.youtube) && (
          <div className="js-block">
            <label className="row small js-label">{tick('social')}Links</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {found.youtube && <span className="chip">YouTube · {found.youtube}</span>}
              {Object.entries(found.social).map(([k, u]) => <span key={k} className="chip" title={u}>{k[0].toUpperCase() + k.slice(1)}</span>)}
            </div>
          </div>
        )}
        <div className="js-block">
          <label className="row small js-label">{tick('voice')}Voice</label>
          {found.voice.mission ? <p className="small" style={{ margin: 0 }}>“{found.voice.mission.slice(0, 220)}{found.voice.mission.length > 220 ? '…' : ''}”</p> : <span className="muted small">No mission statement found. Website copy will still help drafts sound like you.</span>}
          {found.voice.themes.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{found.voice.themes.map((t) => <span key={t} className="chip accent">{t}</span>)}</div>}
        </div>
      </div>
      <BrandAtWork found={found} keep={keep} />
    </div>
  );
}

/** A quick look at their brand on a post, a clip and an email footer. */
function BrandAtWork({ found, keep }) {
  const { config } = useApp();
  const colors = keep.colors ? found.colors : (config.brandColors || found.colors);
  const fonts = keep.fonts && found.fontsOnMac?.heading ? found.fontsOnMac : (config.brandFonts || { heading: 'Montserrat', body: 'Montserrat' });
  const logo = keep.logo != null ? found.logos[keep.logo] : null;
  const ci = keep.church ? found.churchInfo : (config.churchInfo || {});
  const line = (found.voice.mission.split(/(?<=[.!?])\s/)[0] || '').trim();
  const quote = line.length > 30 && line.length < 160 && !isQuestion(line) ? line : 'Grace is not something you earn. It is something you receive.';
  const ref = useRef(null);
  const cache = useRef({});
  const doc = useMemo(() => {
    const ctx = { c: colors, h: fonts.heading, b: fonts.body, o: { quotes: [quote.slice(0, 160)] } };
    const pages = TEMPLATES.find((t) => t.id === 'post-quote').build(ctx);
    if (logo) pages[0].items.push({ id: uid(), type: 'image', rel: 'jumpstart-logo', x: 0.5, y: 0.13, w: 0.16, opacity: 1 });
    pages[0].items = pages[0].items.map((it) => (it.text === 'Pastor Name · Sunday message' ? { ...it, text: ci.name || 'Sunday message' } : it));
    return { id: 'preview', size: { w: 1080, h: 1350 }, palette: colors, tint: { color: '#FF9A62', amount: 0 }, pages };
  }, [colors.join(), fonts.heading, fonts.body, logo?.url, ci.name, quote]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (logo) cache.current['jumpstart-logo'] = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = logo.dataUrl; });
      else delete cache.current['jumpstart-logo'];
      await document.fonts.ready;
      await loadAssets(doc.pages[0], cache.current);
      if (live && ref.current) renderPage(ref.current, doc, doc.pages[0], 300 / 1080, cache.current);
    })();
    return () => { live = false; };
  }, [doc]);
  const hf = `'${fonts.heading}', var(--font-sans)`;
  return (
    <div className="js-preview stack" style={{ gap: 10 }}>
      <span className="eyebrow">Your brand at work</span>
      <div className="js-preview-row">
        <figure className="js-fig"><canvas ref={ref} style={{ width: '100%', aspectRatio: '1080/1350', borderRadius: 10 }} /><figcaption>Social post</figcaption></figure>
        <figure className="js-fig">
          <div className="js-clip" style={{ background: `radial-gradient(80% 60% at 20% 20%, ${colors[0]}, transparent), radial-gradient(70% 60% at 80% 70%, ${colors[1]}, transparent), ${colors[2]}` }}>
            {logo && <img src={logo.dataUrl} alt="" className="js-clip-logo" />}
            <span className="js-clip-cap" style={{ fontFamily: hf }}>You are <span style={{ background: colors[1], color: '#fff' }}>loved</span> here</span>
            <span className="js-clip-pop" style={{ boxShadow: `inset 4px 0 0 ${colors[1]}` }}>{ci.name || 'Your church'}{ci.times ? <small>{ci.times}</small> : null}</span>
          </div>
          <figcaption>Clip with captions</figcaption>
        </figure>
      </div>
      <figure className="js-fig">
        <div className="js-mail" style={{ borderTop: `4px solid ${colors[0]}` }}>
          <div className="row" style={{ gap: 10 }}>
            {logo && <img src={logo.dataUrl} alt="" style={{ height: 34, maxWidth: 90, objectFit: 'contain' }} />}
            <strong style={{ fontFamily: hf, color: 'var(--ink)' }}>{ci.name || 'Your church'}</strong>
          </div>
          <span className="small muted">{[ci.address, ci.times].filter(Boolean).join(' · ') || 'Address and service times'}</span>
          <span className="small" style={{ color: colors[0] }}>{[ci.phone, ci.email, (ci.website || '').replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</span>
        </div>
        <figcaption>Email and printed footer</figcaption>
      </figure>
    </div>
  );
}

// ------------------------------------------------------------------ settings file
function ExportSettings({ onClose }) {
  const { toast } = useApp();
  const [parts, setParts] = useState(null);
  const [ws, setWs] = useState(null);
  const [pick, setPick] = useState(new Set());
  const [pickWs, setPickWs] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => {
    api.get('/api/jumpstart/parts').then((r) => { setParts(r.parts); setPick(new Set(r.parts.map((p) => p.id))); });
    api.get('/api/workspaces').then((r) => { setWs(r); setPickWs(new Set([r.active])); });
  }, []);
  const flip = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  const go = async () => {
    setBusy(true);
    try { setDone(await api.post('/api/jumpstart/export', { workspaces: [...pickWs], parts: [...pick] })); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  if (done) {
    return (
      <Modal onClose={onClose} width={560} label="Settings exported">
        <ModalHead title="Your Jumpstart file is ready" sub={`${done.name} is in your Downloads folder.`} />
        <ol className="js-steps">
          <li><strong>Send the file</strong><span className="muted small">AirDrop, email, Messages, Google Drive or Dropbox all work.</span></li>
          <li><strong>On the other Mac, open Church Studio</strong><span className="muted small">Go to My App, then Jumpstart.</span></li>
          <li><strong>Choose Import settings and pick the file</strong><span className="muted small">They choose what to bring in, into their workspace or a new one.</span></li>
        </ol>
        <div className="row between">
          <span className="hint">Projects, videos, passwords and keys are not in the file.</span>
          <div className="row"><button className="btn" onClick={() => api.post('/api/jumpstart/reveal', { file: done.file })}><FolderOpen size={14} />Show in Finder</button><button className="btn primary" onClick={onClose}>Done</button></div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={onClose} width={620} label="Export settings"
      footer={<><span className="hint">Saves a small .zip to Downloads.</span><button className="btn primary" disabled={busy || !pick.size || !pickWs.size} onClick={go}><Download size={15} />{busy ? 'Making the file…' : 'Export'}</button></>}>
      <ModalHead title="Export settings" sub="Pick what to share. Great for a second Mac or a new teammate." />
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">What to include</span>
        {(parts || []).map((p) => (
          <label key={p.id} className="js-check"><input type="checkbox" checked={pick.has(p.id)} onChange={() => flip(pick, setPick, p.id)} /><span className="stack" style={{ gap: 0 }}><strong className="small">{p.label}</strong><span className="muted small">{p.about}</span></span></label>
        ))}
      </div>
      {ws?.list.length > 1 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Workspaces</span>
          {ws.list.map((w) => (
            <label key={w.id} className="js-check"><input type="checkbox" checked={pickWs.has(w.id)} onChange={() => flip(pickWs, setPickWs, w.id)} /><strong className="small">{w.name}{w.id === ws.active ? ' (open now)' : ''}</strong></label>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ImportSettings({ onClose }) {
  const { toast, reloadConfig, refreshLogo, reloadThemes } = useApp();
  const [file, setFile] = useState('');
  const [pkg, setPkg] = useState(null);
  const [plan, setPlan] = useState({});
  const [parts, setParts] = useState(new Set());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const read = async (f) => {
    setError(null); setFile(f);
    try {
      const r = await api.post('/api/jumpstart/read', { file: f });
      setPkg(r); setParts(new Set(r.parts.map((p) => p.id)));
      setPlan(Object.fromEntries(r.workspaces.map((w) => [w.index, w.index === 0 ? 'current' : 'new'])));
    } catch (e) { setError(e.message); setPkg(null); }
  };
  const choose = async () => { const [f] = (await desktop?.pickFiles?.({ name: 'Jumpstart file', extensions: ['zip'], multi: false })) || []; if (f) read(f); };
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/jumpstart/import', { file, parts: [...parts], plan: Object.entries(plan).filter(([, t]) => t !== 'skip').map(([index, target]) => ({ index: Number(index), target })) });
      await reloadConfig?.(); reloadThemes?.(); refreshLogo?.();
      setDone(r);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  if (done) {
    const fresh = done.done.filter((d) => d.target === 'new');
    return (
      <Modal onClose={onClose} width={520} label="Settings imported">
        <ModalHead title="Settings brought in" sub={done.done.map((d) => (d.target === 'new' ? `New workspace: ${d.name}` : `Added to ${d.name}`)).join(' · ')} />
        <div className="row between">
          <span className="hint">{fresh.length ? 'Switch workspaces in My App when you’re ready.' : 'Your brand kit and settings are updated.'}</span>
          <div className="row">
            {fresh.length > 0 && <button className="btn" onClick={async () => { await api.post(`/api/workspaces/${fresh[0].id}/switch`); toast({ text: 'Switching workspace…' }); setTimeout(() => window.location.reload(), 2500); }}>Switch to {fresh[0].name}</button>}
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={onClose} width={620} label="Import settings"
      footer={pkg ? <><span className="hint">Nothing you made is replaced. Logos and samples are added.</span><button className="btn primary" disabled={busy || !parts.size} onClick={go}><Upload size={15} />{busy ? 'Importing…' : 'Import'}</button></> : null}>
      <ModalHead title="Import settings" sub="Open a Church Studio Jumpstart file." />
      <div className="row wrap" style={{ gap: 8 }}>
        {desktop?.pickFiles && <button className="btn" onClick={choose}><FolderOpen size={14} />Choose file</button>}
        <input className="input grow" style={{ minWidth: 220 }} value={file} placeholder="Or paste the file's path" onChange={(e) => setFile(e.target.value)} onBlur={(e) => e.target.value && e.target.value !== pkg?.file && read(e.target.value)} />
      </div>
      {error && <div className="banner bad">{error}</div>}
      {pkg && (
        <>
          <span className="muted small">Made {new Date(pkg.made).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Bring in</span>
            {pkg.parts.map((p) => (
              <label key={p.id} className="js-check"><input type="checkbox" checked={parts.has(p.id)} onChange={() => { const n = new Set(parts); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setParts(n); }} /><span className="stack" style={{ gap: 0 }}><strong className="small">{p.label}</strong><span className="muted small">{p.about}</span></span></label>
            ))}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Put it in</span>
            {pkg.workspaces.map((w) => (
              <div key={w.index} className="js-check between">
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span className="row" style={{ gap: 2 }}>{w.colors.slice(0, 4).map((c) => <i key={c} className="js-dot" style={{ background: c }} />)}</span>
                  <strong className="small truncate">{w.name}</strong>
                  <span className="muted small">{w.logos} logo{w.logos === 1 ? '' : 's'}</span>
                </span>
                <div className="seg sm">
                  {[['current', 'This workspace'], ['new', 'New workspace'], ...(pkg.workspaces.length > 1 ? [['skip', 'Skip']] : [])].map(([k, l]) => <button key={k} className={plan[w.index] === k ? 'on' : ''} onClick={() => setPlan({ ...plan, [w.index]: k })}>{l}</button>)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
