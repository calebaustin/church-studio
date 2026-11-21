import { useEffect, useMemo, useRef, useState } from 'react';
import Toggle from '../components/Toggle.jsx';
import ToolIntro from '../components/ToolIntro.jsx';
import { ArrowLeft, CalendarDays, Copy, FileDown, FileText, Heart, PenLine, Plus, Sparkles, Wand2, Check, RefreshCw, Undo2, Link2, Info, Printer, Mail, Users, ChevronDown } from 'lucide-react';
import Modal, { ModalHead } from '../components/Modal.jsx';
import { Masonry } from '../components/Masonry.jsx';
import { useChurchEvents } from '../components/ChurchEvents.jsx';
import HeaderImage from '../components/HeaderImage.jsx';
import PrintDialog from '../components/PrintDialog.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { useApp, useHelperFocus } from '../App.jsx';
import { api } from '../api.js';
import { seoChecks } from '../seo.js';
import { mdToHtml } from '../markdown.js';
import { emailHtml } from '../emailHtml.js';
import RichEditor from '../components/RichEditor.jsx';
import SermonPicker from '../components/SermonPicker.jsx';
import PreviewTile from '../components/PreviewTile.jsx';
import Popover, { PopList } from '../components/Popover.jsx';

const ANGLES = [
  ['teaching', 'Main points'],
  ['story', 'Story first'],
  ['steps', 'Practical steps'],
  ['questions', 'Questions answered'],
  ['devotional', 'Short devotional'],
  ['newcomer', 'For newcomers'],
];
const slugify = (t) => t.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** A field with a "Suggest" menu of choices taken from the sermon. */
function SuggestField({ label, hint, value, onChange, items, onOpen, multiline, placeholder }) {
  const [open, setOpen] = useState(false);
  return (
    <label className="field" style={{ position: 'relative' }}>
      <span className="row between" style={{ gap: 8 }}>
        <span>{label} {hint && <span className="hint num">{hint}</span>}</span>
        {onOpen && <button type="button" className="btn ghost sm" data-pop-trigger onClick={(e) => { e.preventDefault(); onOpen(); setOpen(!open); }}><Sparkles size={13} />Suggest</button>}
      </span>
      {multiline
        ? <textarea className="input" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
      <Popover open={open} onClose={() => setOpen(false)} align="right" width={420}>
        <PopList items={items} onPick={(v) => { onChange(v); setOpen(false); }} empty="Finding ideas…" />
      </Popover>
    </label>
  );
}

// Mirrors AUDIENCES in src/daemon/writing.js.
const AUDIENCE_LIST = [
  ['newcomers', 'Guests and newcomers', 'Plain words for someone new to church, with a warm welcome.'],
  ['kids', 'Kids', 'Short sentences and simple words a child can follow.'],
  ['students', 'Students', 'Shorter and more direct, for middle and high school.'],
  ['volunteers', 'Volunteers and leaders', 'Clear and practical, ending with what you need from them.'],
  ['short', 'A short version', 'Two or three sentences for social media or a text.'],
];

const KINDS = [
  ['newsletter', 'Newsletter'],
  ['blog', 'Blog post'],
  ['email', 'Email summary'],
  ['group', 'Discussion guide'],
  ['devotional', 'Devotional'],
  ['social', 'Social captions'],
];

function SeoInfo() {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="seo-info" data-pop-trigger aria-label="What is good SEO?" title="What is good SEO?" onClick={() => setOpen(!open)}><Info size={13} /></button>
      <Popover open={open} onClose={() => setOpen(false)} width={340}>
        <div className="seo-pop">
          <strong>What is good SEO?</strong>
          <span>Search engines show the pages that most clearly answer what someone is looking for. Using one focus keyphrase in your title, first paragraph, a heading and the web address tells Google what your post is about, and the meta description is the preview people read before they click.</span>
          <span>Clear, readable posts keep visitors on the page, which search engines notice and reward.</span>
          <span>Every sermon you publish this way is another page people nearby can find when they search for hope, answers or a church to visit, and over time that builds your church's presence online.</span>
        </div>
      </Popover>
    </span>
  );
}

function Checks({ title, score, list, info }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between"><span className="row" style={{ gap: 6 }}><strong>{title}</strong>{info}</span><span className={`chip ${score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'bad'}`}>{score}/100</span></div>
      {list.map((c) => (
        <div key={c.label} className="row small" style={{ alignItems: 'flex-start' }}>
          <span className="dot" style={{ color: c.status === 'good' ? 'var(--ok)' : c.status === 'ok' ? 'var(--warn)' : 'var(--bad)', marginTop: 6 }} />
          <div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.label}</span>{c.status !== 'good' && c.note && <span className="muted">{c.note}</span>}</div>
        </div>
      ))}
    </div>
  );
}

export default function Writing({ project: startProject, kind: startKind }) {
  const [openId, setOpenId] = useState(startProject || null);
  if (!openId) return <WritingHome onOpen={setOpenId} />;
  return <WritingEditor key={openId} pid={openId} startKind={openId === startProject ? startKind : null} onBack={() => setOpenId(null)} />;
}

function WritingEditor({ pid, onBack, startKind }) {
  const { toast, config, go, showNext, aiWorking } = useApp();
  const [project, setProject] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState(startKind || 'blog');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ideas, setIdeas] = useState(null);
  const [angle, setAngle] = useState('teaching');
  const [useAi, setUseAi] = useState(false);
  const [undoBlog, setUndoBlog] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [trashed, setTrashed] = useState(false);
  const [imgPick, setImgPick] = useState(null); // resolve() for the editor's image button
  const standalone = pid.startsWith('w-');
  const [devoDays, setDevoDays] = useState(5);

  useEffect(() => { if (!standalone) api.get(`/api/projects/${pid}`).then((r) => setProject(r.project)).catch(() => setProject(null)); }, [pid]);
  useEffect(() => { api.get(`/api/writing/${pid}`).then((r) => { setDraft(r.draft); setTrashed(Boolean(r.trashed)); setDirty(false); setIdeas(null); setUndoBlog(null); setAngle(r.draft?.angle || 'teaching'); if (!startKind && r.draft?.source?.type === 'newsletter') setKind('newsletter'); setLoaded(true); }); }, [pid]);
  const loadIdeas = (kp = draft?.keyphrase) => api.post(`/api/writing/${pid}/suggest`, { keyphrase: kp }).then(setIdeas).catch(() => setIdeas({ titles: [], keyphrases: [], metas: [] }));
  const rewrite = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/writing/${pid}/rewrite`, { title: draft.title, keyphrase: draft.keyphrase, slug: draft.slug, metaDescription: draft.metaDescription, angle, ai: useAi });
      setUndoBlog(draft.blog);
      set({ blog: r.text, angle });
      toast({ text: r.notice || `Rewritten as “${ANGLES.find((a) => a[0] === angle)[1]}”. Read it over, then save.` });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };

  const generate = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/writing/${pid}/generate`); setDraft(r.draft); setDirty(false); toast({ text: 'Drafts written from the sermon. Fill in the [bracketed] spots.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const saveToVoice = async () => {
    try { await api.post('/api/brand-voice/samples', { title: draft.title, text: draft.blog, source: 'writing' }); toast({ text: 'Saved to your brand voice. Future drafts learn from it.' }); }
    catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const save = async () => { await api.put(`/api/writing/${pid}`, draft); setDirty(false); toast({ text: 'Draft saved.', celebrate: true }); };
  const set = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  // The helper chat sees this piece; a picked title lands in the title field.
  useHelperFocus(draft ? { kind: 'writing', id: pid, part: kind } : null, (field, value) => {
    if (field !== 'title') return false;
    set({ title: value });
    return true;
  });
  const polish = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/writing/${pid}/polish`, { kind, text: draft[kind] }); set({ [kind]: r.text }); toast({ text: r.notice || 'Polished. Read it over before using it.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const header = draft?.headers?.[kind] || null;
  const setHeader = (h) => set({ headers: { ...(draft.headers || {}), [kind]: h } });
  // Images go along as data, so they paste into email and website tools.
  const inlineImages = async (html) => {
    const srcs = [...new Set([...html.matchAll(/src="(\/library\/[^"]+)"/g)].map((m) => m[1]))];
    for (const src of srcs) {
      const blob = await fetch(src).then((r) => r.blob());
      const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      html = html.split(`src="${src}"`).join(`src="${data}"`);
    }
    return html;
  };
  const copy = async (asHtml) => {
    const text = draft[kind];
    if (asHtml && window.ClipboardItem && (kind === 'newsletter' || kind === 'email')) {
      // Email-ready: brand colors and fonts, every style inline, links as buttons.
      const logo = config.appLogo ? await inlineImages(`src="/library/${config.appLogo.split('/').map(encodeURIComponent).join('/')}"`).then((x) => x.slice(5, -1)) : null;
      const html = await inlineImages(emailHtml(text, { colors: config.brandColors, heading: config.brandFonts?.heading, body: config.brandFonts?.body, logo }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      toast({ text: 'Copied, ready for email. Paste it into Mailchimp, Flocknote or any email tool.' });
      return;
    }
    if (asHtml && window.ClipboardItem) {
      const top = header?.rel && header.style !== 'color' ? `<p><img src="/library/${header.rel.split('/').map(encodeURIComponent).join('/')}" alt="" style="max-width:100%"></p>` : '';
      const html = await inlineImages(top + mdToHtml(text));
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else await navigator.clipboard.writeText(text);
    toast({ text: asHtml ? 'Copied with formatting. Paste into your website or email tool.' : 'Copied.' });
  };
  const [rewriteMenu, setRewriteMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [rewritten, setRewritten] = useState(null); // { audience, text, local, busy }
  const rewriteForAudience = async (audience) => {
    setRewritten({ audience, text: '', busy: true });
    try { const r = await api.post('/api/writing/rewrite', { text: draft[kind], audience }); setRewritten({ audience, text: r.text, local: r.local }); } catch (e) { setRewritten(null); toast({ kind: 'error', text: e.message }); }
  };
  const checks = useMemo(() => (draft && kind === 'blog' ? seoChecks(draft.blog, { keyphrase: draft.keyphrase, title: draft.title, meta: draft.metaDescription, slug: draft.slug }) : null), [draft, kind]);
  const placeholders = draft ? ((draft[kind] || '').match(/\[[A-Z][^\]]*\]/g) || []).length : 0;

  return (
    <div className="page">
      <div className="row between wrap">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <button className="btn ghost sm" onClick={async () => { if (dirty && !window.confirm('Leave without saving your changes?')) return; onBack(); }}><ArrowLeft size={15} />Writing</button>
          <div className="stack" style={{ gap: 0, minWidth: 0 }}>
            <h1 className="truncate" style={{ fontSize: 26 }}>{draft?.title || project?.title || 'Writing'}</h1>
            <span className="muted small truncate">{standalone ? draft?.source?.type === 'newsletter' ? 'Newsletter' : (draft?.source?.type === 'event' ? `About an event${draft.source.event?.start ? ` on ${new Date(draft.source.event.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}` : 'Your own writing') : `From “${project?.title || 'a sermon'}”`}</span>
          </div>
        </div>
        {!standalone && <button className="btn primary" disabled={busy} onClick={generate}><Wand2 size={15} />{draft ? 'Write again' : 'Write drafts'}</button>}
      </div>

      {!draft && loaded && (
        <div className="glass empty"><PenLine size={40} /><h3>No drafts for this sermon yet</h3><p>Press Write drafts. Everything comes from the sermon's words; you fill in the details.</p></div>
      )}

      {draft && trashed && (
        <div className="banner"><Info size={16} />This writing is in the trash.<button className="btn sm" onClick={async () => { await api.post('/api/finder/restore', { key: `writing:${pid}` }); setTrashed(false); }}>Restore</button></div>
      )}
      {draft && (
        <>
          <div className="row between wrap">
            <div className="seg">{KINDS.filter(([k]) => (k !== 'newsletter' || draft.newsletter != null) && !(draft.source?.type === 'newsletter' && ['blog', 'email', 'group', 'devotional'].includes(k) && !draft[k]) && !(standalone && (k === 'group' || k === 'devotional') && !draft[k])).map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
            <div className="row wrap">
              {placeholders > 0 && <span className="chip warn">{placeholders} spot{placeholders > 1 ? 's' : ''} to fill in</span>}
              <button className="btn sm" onClick={() => copy(true)}><Copy size={13} />Copy formatted</button>
              <div style={{ position: 'relative' }}>
                <button className="btn sm" data-pop-trigger onClick={() => setRewriteMenu(!rewriteMenu)}><Users size={13} />Rewrite for…</button>
                <Popover open={rewriteMenu} onClose={() => setRewriteMenu(false)} align="right" width={300}>
                  <PopList items={AUDIENCE_LIST.map(([id, label, about]) => ({ label, hint: about, value: id }))} onPick={(id) => { setRewriteMenu(false); rewriteForAudience(id); }} />
                </Popover>
              </div>
              <div style={{ position: 'relative' }}>
                <button className="btn sm" data-pop-trigger onClick={() => setMoreMenu(!moreMenu)}>More<ChevronDown size={13} /></button>
                <Popover open={moreMenu} onClose={() => setMoreMenu(false)} align="right" width={240}>
                  <PopList onPick={(v) => { setMoreMenu(false); v(); }} items={[
                    { label: 'Copy plain text', value: () => copy(false) },
                    ...(kind !== 'social' ? [{ label: 'Print or PDF', value: () => setPrinting(true) }] : []),
                    { label: 'Save a copy to the brand library', value: () => api.post(`/api/writing/${pid}/save-file`, { name: `${draft.title} - ${KINDS.find((k) => k[0] === kind)[1]}`, text: draft[kind] }) },
                    ...(config.llmProvider !== 'none' ? [{ label: 'Polish with AI', hint: 'Smoother wording, same facts', value: polish }] : []),
                    ...(kind === 'blog' ? [{ label: 'Save to brand voice', hint: 'Helps future drafts sound like you', value: saveToVoice }] : []),
                  ]} />
                </Popover>
              </div>
              <button className="btn sm primary" onClick={async () => { if (dirty) await save(); showNext({ kind: 'writing', title: draft.title, text: draft.blog, caption: draft.metaDescription || draft.title, projectId: standalone ? null : pid }); }}><Check size={13} />Done</button>
              <button className={`btn sm ${dirty ? 'accent' : ''}`} disabled={!dirty} onClick={save}><Check size={13} />{dirty ? 'Save' : 'Saved'}</button>
            </div>
          </div>
          {standalone && (
            <div className="writing-sermon"><SermonPicker compact value={draft.source?.projectId || null} onChange={(v) => set({ source: { ...(draft.source || {}), projectId: v } })} /></div>
          )}
          <div className="editor" style={{ gridTemplateColumns: kind === 'blog' ? 'minmax(0, 1fr) 320px' : '1fr' }}>
            <div className="stack" style={{ gap: 16, minWidth: 0 }}>
              {kind === 'blog' && (
                <section className="glass panel stack" style={{ gap: 14 }}>
                  <div className="row between wrap">
                    <h3 style={{ margin: 0 }}>Post settings</h3>
                    <span className="muted small">{standalone ? 'Title, keyphrase and description for search.' : 'Pick from the sermon or type your own. Then rewrite the post around them.'}</span>
                  </div>
                  <div className="token-grid">
                    <SuggestField label="Title" hint={`${draft.title.length}/65`} value={draft.title} onChange={(v) => set({ title: v })} onOpen={standalone ? undefined : () => loadIdeas()} items={ideas?.titles} />
                    <SuggestField label="Focus keyphrase" value={draft.keyphrase} onChange={(v) => { set({ keyphrase: v }); }} onOpen={standalone ? undefined : () => loadIdeas()} items={ideas?.keyphrases} />
                    <label className="field">
                      <span className="row between" style={{ gap: 8 }}>
                        <span>Web address</span>
                        <button type="button" className="btn ghost sm" onClick={() => set({ slug: slugify(draft.title) })}><Link2 size={13} />Match title</button>
                      </span>
                      <div className="input-affix"><span className="muted">/</span><input className="input" value={draft.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} /></div>
                    </label>
                    <SuggestField label="Meta description" hint={`${draft.metaDescription.length}/156`} multiline value={draft.metaDescription} onChange={(v) => set({ metaDescription: v })} onOpen={standalone ? undefined : () => loadIdeas()} items={ideas?.metas} />
                  </div>
                  {!standalone && <><hr className="hairline" />
                  <div className="stack" style={{ gap: 10 }}>
                    <span className="field-label">Angle</span>
                    <div className="angle-row">
                      {ANGLES.map(([k, l]) => <button key={k} type="button" className={`pill-choice ${angle === k ? 'on' : ''}`} onClick={() => setAngle(k)}>{l}</button>)}
                    </div>
                    <div className="row wrap">
                      <button className="btn primary" disabled={busy} onClick={rewrite}><RefreshCw size={15} />Rewrite post</button>
                      {config.llmProvider !== 'none' && (
                        <Toggle checked={useAi} onChange={(e) => setUseAi(e.target.checked)} icon={Sparkles} label="AI helper" small />
                      )}
                      {undoBlog && <button className="btn ghost sm" onClick={() => { set({ blog: undoBlog }); setUndoBlog(null); }}><Undo2 size={13} />Undo rewrite</button>}
                    </div>
                  </div></>}
                </section>
              )}
              {kind !== 'social' && (
                <HeaderImage pid={standalone || !project?.media?.width ? null : pid} value={header} onChange={setHeader} brandColors={config.brandColors || []}
                  title={kind === 'blog' ? draft.title : ((draft[kind] || '').match(/^#\s+(.*)/m)?.[1] || draft.title).replace(/^(Small group guide|\d-day devotional):\s*/i, '')}
                  styles={kind === 'group' ? ['full', 'blur', 'color'] : ['full']} />
              )}
              {kind === 'devotional' && !standalone && (
                <section className="glass panel row between wrap" style={{ gap: 10 }}>
                  <div className="stack" style={{ gap: 1 }}><strong>Devotional series</strong><span className="small muted">One reading a day, walking through the sermon in order.</span></div>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="seg sm">{[3, 5, 7].map((d) => <button key={d} className={devoDays === d ? 'on' : ''} onClick={() => setDevoDays(d)}>{d} days</button>)}</div>
                    <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api.post(`/api/writing/${pid}/devotional`, { days: devoDays }); set({ devotional: r.text }); toast({ text: `Written as a ${devoDays}-day devotional.` }); } catch (e) { toast({ kind: 'error', text: e.message }); } setBusy(false); }}><RefreshCw size={13} />{draft.devotional ? 'Rewrite' : 'Write it'}</button>
                  </div>
                </section>
              )}
              <section className={`glass strong panel rt-panel ${busy || aiWorking === 'writing' ? 'ai-wave' : ''}`} aria-busy={busy || undefined}>
                <RichEditor key={kind} value={draft[kind] || ''} onChange={(v) => set({ [kind]: v })}
                  onPickImage={kind === 'social' ? undefined : () => new Promise((resolve) => setImgPick(() => resolve))} />
              </section>
            </div>
            {kind === 'blog' && checks && (
              <aside className="glass panel stack sticky-col" style={{ gap: 16 }}>
                <Checks title="Search" score={checks.seoScore} list={checks.seo} info={<SeoInfo />} />
                <hr className="hairline" />
                <Checks title="Readability" score={checks.readScore} list={checks.read} />
                <hr className="hairline" />
                <VoiceChecks text={draft.blog} />
                <span className="muted small num">{checks.words} words</span>
              </aside>
            )}
          </div>
          {rewritten && (
        <Modal onClose={() => setRewritten(null)} width={720} label="Rewrite for an audience"
          footer={<>
            <span className="hint">{rewritten.local ? 'Rewritten with plain-language rules on this Mac. An AI helper does a fuller rewrite.' : 'Rewritten by your AI helper. Check the facts before you share it.'}</span>
            <div className="row">
              <button className="btn" disabled={rewritten.busy} onClick={async () => { await navigator.clipboard.writeText(rewritten.text); toast({ text: 'Copied.' }); }}><Copy size={13} />Copy</button>
              <button className="btn primary" disabled={rewritten.busy} onClick={() => { const before = draft[kind]; const k = kind; set({ [k]: rewritten.text }); setRewritten(null); toast({ text: 'Rewritten.', action: { label: 'Undo', run: () => set({ [k]: before }) } }); }}>Use this</button>
            </div>
          </>}>
          <ModalHead title={`For ${AUDIENCE_LIST.find(([id]) => id === rewritten.audience)?.[1].toLowerCase()}`} sub={AUDIENCE_LIST.find(([id]) => id === rewritten.audience)?.[2]} />
          {rewritten.busy ? <div className="ai-wave-box ai-wave" style={{ height: 220 }} aria-label="Rewriting…" /> : <textarea className="input" rows={14} value={rewritten.text} onChange={(e) => setRewritten({ ...rewritten, text: e.target.value })} />}
        </Modal>
      )}
      {printing && <PrintDialog pid={pid} kind={kind} kindLabel={KINDS.find((k) => k[0] === kind)[1]} draft={draft} header={header} onClose={() => setPrinting(false)} />}
          {imgPick && (
            <LibraryPicker title="Add an image" onClose={() => { imgPick(null); setImgPick(null); }}
              onPick={(i) => { imgPick({ url: `/library/${i.rel.split('/').map(encodeURIComponent).join('/')}`, alt: i.name.replace(/\.[a-z]+$/i, '') }); setImgPick(null); }} />
          )}
        </>
      )}
    </div>
  );
}

/** "Sounds like you": how close this draft is to the church's brand voice. */
function VoiceChecks({ text }) {
  const { go } = useApp();
  const [r, setR] = useState(null);
  const t = useRef(null);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => api.post('/api/brand-voice/score', { text }).then(setR).catch(() => {}), 700);
    return () => clearTimeout(t.current);
  }, [text]);
  if (!r) return null;
  if (!r.ready) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <strong>Brand voice</strong>
        <span className="small muted">Add your mission, a few themes or some past writing, and you'll see how each draft sounds next to your church's voice.</span>
        <button className="btn sm" onClick={() => go({ name: 'assets', section: 'voice' })}><Heart size={13} />Set up brand voice</button>
      </div>
    );
  }
  if (r.short) return <div className="stack" style={{ gap: 4 }}><strong>Brand voice</strong><span className="small muted">Write a little more to see how it sounds.</span></div>;
  return <Checks title="Brand voice" score={r.score} list={r.checks} />;
}

const SOURCE_LABEL = { sermon: 'From a sermon', event: 'About an event', blank: 'Your own writing', newsletter: 'Newsletter' };
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

/** Writing home: start from a transcript, a blank page or an event, and find past writing. */
function WritingHome({ onOpen }) {
  const { toast, go } = useApp();
  const [drafts, setDrafts] = useState(null);
  const [sermons, setSermons] = useState(null);
  const [pickSermon, setPickSermon] = useState(false);
  const [pickEvent, setPickEvent] = useState(false);
  const cal = useChurchEvents();
  useEffect(() => {
    api.get('/api/writing').then((r) => setDrafts(r.drafts)).catch(() => setDrafts([]));
    api.get('/api/projects').then((r) => setSermons(r.projects.filter((p) => p.status === 'transcribed'))).catch(() => setSermons([]));
  }, []);
  const create = async (body) => {
    try { const r = await api.post('/api/writing', body); onOpen(r.id); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const upcoming = cal.events.filter((e) => new Date(e.end || e.start) >= new Date()).slice(0, 30);
  return (
    <div className="page">
      <ToolIntro id="writing" />
      <div className="stack" style={{ gap: 2 }}>
        <h1>Writing</h1>
        <span className="muted">Turn a transcript into a blog, or write your own.</span>
      </div>
      <div className="start-grid">
        <button className="start-tile glass" onClick={() => create({ type: 'blank' })}>
          <span className="type-badge" style={{ width: 40, height: 40, '--t': 'var(--tone-2)' }}><Plus size={19} /></span>
          <strong>Blank post</strong><span className="small muted">Start from a clean page with the same editor, SEO and brand voice checks.</span>
        </button>
        <button className="start-tile glass" onClick={() => setPickSermon(true)}>
          <span className="type-badge" style={{ width: 40, height: 40, '--t': 'var(--tone-1)' }}><FileText size={19} /></span>
          <strong>From a transcript</strong><span className="small muted">A blog post, email, small group guide and captions, written from the sermon's own words.</span>
        </button>
        <button className="start-tile glass" onClick={() => create({ type: 'newsletter' })}>
          <span className="type-badge" style={{ width: 40, height: 40, '--t': 'var(--tone-4)' }}><Mail size={19} /></span>
          <strong>Newsletter</strong><span className="small muted">This week’s message, what’s coming up from your calendar, and ways to get involved. Copies ready for any email tool.</span>
        </button>
        <button className="start-tile glass" onClick={() => setPickEvent(true)}>
          <span className="type-badge" style={{ width: 40, height: 40, '--t': 'var(--tone-3)' }}><CalendarDays size={19} /></span>
          <strong>About an event</strong><span className="small muted">Pick something from your church calendar and get a post, email and caption to finish.</span>
        </button>
      </div>

      <div className="row between"><h2>Your writing</h2>{drafts?.length > 0 && <span className="muted small">{drafts.length} saved</span>}</div>
      {drafts && !drafts.length && <div className="glass empty"><PenLine size={36} /><h3>Nothing written yet</h3><p>Start from a transcript, a blank page or an event above.</p></div>}
      <Masonry className="item-grid">
        {(drafts || []).map((d) => (
          <div key={d.id} className="item-card glass">
            <button className="item-cover" onClick={() => onOpen(d.id)}>
              {d.header ? <img src={`/library/${d.header.split('/').map(encodeURIComponent).join('/')}`} alt="" /> : <PreviewTile kind="writing" title={d.title} excerpt={d.excerpt} source={d.source} />}
            </button>
            <div className="item-meta">
              <div className="stack" style={{ gap: 3 }}>
                <strong className="truncate small" title={d.title}>{d.title}</strong>
                <span className="muted truncate" style={{ fontSize: 12 }}>{d.sermon ? `From “${d.sermon}”` : SOURCE_LABEL[d.source]} · {ago(d.updated)}</span>
              </div>
            </div>
          </div>
        ))}
      </Masonry>

      {pickSermon && (
        <Modal onClose={() => setPickSermon(false)} width={520} label="Pick a transcript">
          <ModalHead title="Pick a transcript" sub="Drafts are written from its words. You fill in the [bracketed] spots." />
          {sermons && !sermons.length && <div className="stack" style={{ gap: 8 }}><span className="muted">Transcribe a video or recording first.</span><button className="btn sm" onClick={() => go({ name: 'library' })}>Go to Videos</button></div>}
          <div className="pop-list" style={{ maxHeight: 360 }}>
            {(sermons || []).map((p) => <button key={p.id} className="pop-item" onClick={() => { setPickSermon(false); onOpen(p.id); }}>{p.title}</button>)}
          </div>
        </Modal>
      )}
      {pickEvent && (
        <Modal onClose={() => setPickEvent(false)} width={520} label="Pick an event">
          <ModalHead title="Write about an event" sub="Choose an upcoming event from your church calendar." />
          {!cal.linked && <div className="stack" style={{ gap: 8 }}><span className="muted">Add your church calendar's iCal link first.</span><button className="btn sm" onClick={() => go({ name: 'settings', section: 'connections' })}>Open Connections</button></div>}
          {cal.linked && !upcoming.length && <span className="muted">No upcoming events found.</span>}
          <div className="pop-list" style={{ maxHeight: 380 }}>
            {upcoming.map((e) => (
              <button key={e.id} className="pop-item" onClick={() => { setPickEvent(false); create({ type: 'event', event: e }); }}>
                {e.title}<span className="pop-hint">{new Date(e.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{e.allDay ? '' : ` · ${new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</span>
              </button>
            ))}
          </div>
          {cal.linked && <button className="btn ghost sm" onClick={() => { setPickEvent(false); create({ type: 'blank' }); }}>Not on the calendar? Start blank</button>}
        </Modal>
      )}
    </div>
  );
}
