import { useEffect, useMemo, useState } from 'react';
import { Copy, FileDown, PenLine, Sparkles, Wand2, Check, RefreshCw, Undo2, Link2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import { seoChecks } from '../seo.js';
import { mdToHtml } from '../markdown.js';
import RichEditor from '../components/RichEditor.jsx';
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
        <button type="button" className="btn ghost sm" data-pop-trigger onClick={(e) => { e.preventDefault(); onOpen?.(); setOpen(!open); }}><Sparkles size={13} />Suggest</button>
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

const KINDS = [
  ['blog', 'Blog post'],
  ['email', 'Email summary'],
  ['group', 'Small group guide'],
  ['social', 'Social captions'],
];

function Checks({ title, score, list }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between"><strong>{title}</strong><span className={`chip ${score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'bad'}`}>{score}/100</span></div>
      {list.map((c) => (
        <div key={c.label} className="row small" style={{ alignItems: 'flex-start' }}>
          <span className="dot" style={{ color: c.status === 'good' ? 'var(--ok)' : c.status === 'ok' ? 'var(--warn)' : 'var(--bad)', marginTop: 6 }} />
          <div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.label}</span>{c.status !== 'good' && c.note && <span className="muted">{c.note}</span>}</div>
        </div>
      ))}
    </div>
  );
}

export default function Writing() {
  const { toast, config, go } = useApp();
  const [projects, setProjects] = useState(null);
  const [pid, setPid] = useState(null);
  const [draft, setDraft] = useState(null);
  const [kind, setKind] = useState('blog');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ideas, setIdeas] = useState(null);
  const [angle, setAngle] = useState('teaching');
  const [useAi, setUseAi] = useState(false);
  const [undoBlog, setUndoBlog] = useState(null);

  useEffect(() => {
    api.get('/api/projects').then(({ projects: ps }) => {
      const ready = ps.filter((p) => p.status === 'transcribed');
      setProjects(ready);
      if (ready[0]) setPid(ready[0].id);
    });
  }, []);
  useEffect(() => { if (pid) api.get(`/api/writing/${pid}`).then((r) => { setDraft(r.draft); setDirty(false); setIdeas(null); setUndoBlog(null); setAngle(r.draft?.angle || 'teaching'); }); }, [pid]);
  const loadIdeas = (kp = draft?.keyphrase) => api.post(`/api/writing/${pid}/suggest`, { keyphrase: kp }).then(setIdeas).catch(() => setIdeas({ titles: [], keyphrases: [], metas: [] }));
  const rewrite = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/writing/${pid}/rewrite`, { title: draft.title, keyphrase: draft.keyphrase, slug: draft.slug, metaDescription: draft.metaDescription, angle, ai: useAi });
      setUndoBlog(draft.blog);
      set({ blog: r.text, angle });
      toast({ text: `Rewritten as “${ANGLES.find((a) => a[0] === angle)[1]}”. Read it over, then save.` });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };

  const generate = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/writing/${pid}/generate`); setDraft(r.draft); setDirty(false); toast({ text: 'Drafts written from the sermon. Fill in the [bracketed] spots.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const save = async () => { await api.put(`/api/writing/${pid}`, draft); setDirty(false); toast({ text: 'Draft saved.' }); };
  const set = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const polish = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/writing/${pid}/polish`, { kind, text: draft[kind] }); set({ [kind]: r.text }); toast({ text: 'Polished. Read it over before using it.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const copy = async (asHtml) => {
    const text = draft[kind];
    if (asHtml && window.ClipboardItem) {
      const html = mdToHtml(text);
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else await navigator.clipboard.writeText(text);
    toast({ text: asHtml ? 'Copied with formatting. Paste into your website or email tool.' : 'Copied.' });
  };
  const checks = useMemo(() => (draft && kind === 'blog' ? seoChecks(draft.blog, { keyphrase: draft.keyphrase, title: draft.title, meta: draft.metaDescription, slug: draft.slug }) : null), [draft, kind]);
  const placeholders = draft ? (draft[kind].match(/\[[A-Z][^\]]*\]/g) || []).length : 0;

  if (projects && !projects.length) {
    return (
      <div className="page">
        <h1>Writing</h1>
        <div className="glass empty"><PenLine size={40} /><h3>Transcribe a sermon first</h3><p>Blog posts, emails and small group guides are written from the sermon's own words.</p><button className="btn primary" onClick={() => go({ name: 'library' })}>Go to Sermons</button></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row between wrap">
        <div className="stack" style={{ gap: 2 }}>
          <h1>Writing</h1>
          <span className="muted">Turn a sermon into a blog post, email, small group guide and captions.</span>
        </div>
        <div className="row">
          <select className="input" style={{ width: 'auto', maxWidth: 320 }} value={pid || ''} onChange={(e) => setPid(e.target.value)} aria-label="Sermon">
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button className="btn primary" disabled={!pid || busy} onClick={generate}><Wand2 size={15} />{draft ? 'Write again' : 'Write drafts'}</button>
        </div>
      </div>

      {!draft && pid && (
        <div className="glass empty"><PenLine size={40} /><h3>No drafts for this sermon yet</h3><p>Press Write drafts. Everything comes from the sermon's words; you fill in the details.</p></div>
      )}

      {draft && (
        <>
          <div className="row between wrap">
            <div className="seg">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
            <div className="row wrap">
              {placeholders > 0 && <span className="chip warn">{placeholders} spot{placeholders > 1 ? 's' : ''} to fill in</span>}
              <button className="btn sm" onClick={() => copy(false)}><Copy size={13} />Copy</button>
              <button className="btn sm" onClick={() => copy(true)}><Copy size={13} />Copy formatted</button>
              <button className="btn sm" onClick={() => api.post(`/api/writing/${pid}/save-file`, { name: `${draft.title} - ${KINDS.find((k) => k[0] === kind)[1]}`, text: draft[kind] })}><FileDown size={13} />Save to library</button>
              {config.llmProvider !== 'none' && <button className="btn sm" disabled={busy} onClick={polish}><Sparkles size={13} />Polish with AI</button>}
              <button className={`btn sm ${dirty ? 'accent' : ''}`} disabled={!dirty} onClick={save}><Check size={13} />{dirty ? 'Save' : 'Saved'}</button>
            </div>
          </div>
          <div className="editor" style={{ gridTemplateColumns: kind === 'blog' ? 'minmax(0, 1fr) 320px' : '1fr' }}>
            <div className="stack" style={{ gap: 16, minWidth: 0 }}>
              {kind === 'blog' && (
                <section className="glass panel stack" style={{ gap: 14 }}>
                  <div className="row between wrap">
                    <h3 style={{ margin: 0 }}>Post settings</h3>
                    <span className="muted small">Pick from the sermon or type your own. Then rewrite the post around them.</span>
                  </div>
                  <div className="token-grid">
                    <SuggestField label="Title" hint={`${draft.title.length}/65`} value={draft.title} onChange={(v) => set({ title: v })} onOpen={() => loadIdeas()} items={ideas?.titles} />
                    <SuggestField label="Focus keyphrase" value={draft.keyphrase} onChange={(v) => { set({ keyphrase: v }); }} onOpen={() => loadIdeas()} items={ideas?.keyphrases} />
                    <label className="field">
                      <span className="row between" style={{ gap: 8 }}>
                        <span>Web address</span>
                        <button type="button" className="btn ghost sm" onClick={() => set({ slug: slugify(draft.title) })}><Link2 size={13} />Match title</button>
                      </span>
                      <div className="input-affix"><span className="muted">/</span><input className="input" value={draft.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} /></div>
                    </label>
                    <SuggestField label="Meta description" hint={`${draft.metaDescription.length}/156`} multiline value={draft.metaDescription} onChange={(v) => set({ metaDescription: v })} onOpen={() => loadIdeas()} items={ideas?.metas} />
                  </div>
                  <hr className="hairline" />
                  <div className="stack" style={{ gap: 10 }}>
                    <span className="field-label">Angle</span>
                    <div className="angle-row">
                      {ANGLES.map(([k, l]) => <button key={k} type="button" className={`pill-choice ${angle === k ? 'on' : ''}`} onClick={() => setAngle(k)}>{l}</button>)}
                    </div>
                    <div className="row wrap">
                      <button className="btn primary" disabled={busy} onClick={rewrite}><RefreshCw size={15} />Rewrite post</button>
                      {config.llmProvider !== 'none' && (
                        <label className="switch small"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />Use AI helper</label>
                      )}
                      {undoBlog && <button className="btn ghost sm" onClick={() => { set({ blog: undoBlog }); setUndoBlog(null); }}><Undo2 size={13} />Undo rewrite</button>}
                    </div>
                  </div>
                </section>
              )}
              <section className="glass strong panel rt-panel">
                <RichEditor key={kind} value={draft[kind]} onChange={(v) => set({ [kind]: v })} />
              </section>
            </div>
            {kind === 'blog' && checks && (
              <aside className="glass panel stack sticky-col" style={{ gap: 16 }}>
                <Checks title="Search" score={checks.seoScore} list={checks.seo} />
                <hr className="hairline" />
                <Checks title="Readability" score={checks.readScore} list={checks.read} />
                <span className="muted small num">{checks.words} words</span>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
