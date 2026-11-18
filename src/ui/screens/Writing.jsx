import { useEffect, useMemo, useState } from 'react';
import { Copy, FileDown, PenLine, Sparkles, Wand2, Check } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import { seoChecks } from '../seo.js';

const KINDS = [
  ['blog', 'Blog post'],
  ['email', 'Email summary'],
  ['group', 'Small group guide'],
  ['social', 'Social captions'],
];

/** Tiny Markdown to HTML for preview and copy-as-HTML (headings, quotes, lists, bold, links). */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  let list = null;
  for (const raw of md.split('\n')) {
    const line = raw.replace(/^>\s?/, '');
    const quote = raw.startsWith('>');
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { if (list) { out.push(`</${list}>`); list = null; } out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^(-|\d+\.)\s+(.*)/))) {
      const tag = m[1] === '-' ? 'ul' : 'ol';
      if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}${quote ? ' class="takeaways"' : ''}>`); list = tag; }
      out.push(`<li>${inline(m[2])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list}>`); list = null; }
    if (line.trim()) out.push(quote ? `<blockquote>${inline(line)}</blockquote>` : `<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('\n');
}

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
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get('/api/projects').then(({ projects: ps }) => {
      const ready = ps.filter((p) => p.status === 'transcribed');
      setProjects(ready);
      if (ready[0]) setPid(ready[0].id);
    });
  }, []);
  useEffect(() => { if (pid) api.get(`/api/writing/${pid}`).then((r) => { setDraft(r.draft); setDirty(false); }); }, [pid]);

  const generate = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/writing/${pid}/generate`); setDraft(r.draft); setDirty(false); toast({ text: 'Drafts written from the sermon. Fill in the [bracketed] spots.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const save = async () => { await api.put(`/api/writing/${pid}`, draft); setDirty(false); toast({ text: 'Draft saved.' }); };
  const set = (p) => { setDraft({ ...draft, ...p }); setDirty(true); };
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
              <button className="btn sm" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
              <button className="btn sm" onClick={() => copy(false)}><Copy size={13} />Copy</button>
              <button className="btn sm" onClick={() => copy(true)}><Copy size={13} />Copy formatted</button>
              <button className="btn sm" onClick={() => api.post(`/api/writing/${pid}/save-file`, { name: `${draft.title} - ${KINDS.find((k) => k[0] === kind)[1]}`, text: draft[kind] })}><FileDown size={13} />Save to library</button>
              {config.llmProvider !== 'none' && <button className="btn sm" disabled={busy} onClick={polish}><Sparkles size={13} />Polish with AI</button>}
              <button className={`btn sm ${dirty ? 'accent' : ''}`} disabled={!dirty} onClick={save}><Check size={13} />{dirty ? 'Save' : 'Saved'}</button>
            </div>
          </div>
          <div className="editor" style={{ gridTemplateColumns: kind === 'blog' ? 'minmax(0, 1fr) 320px' : '1fr' }}>
            <section className="glass strong panel stack" style={{ gap: 12 }}>
              {kind === 'blog' && (
                <div className="token-grid">
                  <label className="field">Title<input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} /></label>
                  <label className="field">Focus keyphrase<input className="input" value={draft.keyphrase} onChange={(e) => set({ keyphrase: e.target.value })} /></label>
                  <label className="field">Web address (slug)<input className="input" value={draft.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} /></label>
                  <label className="field">Meta description <span className="hint num">{draft.metaDescription.length}/156</span><input className="input" value={draft.metaDescription} onChange={(e) => set({ metaDescription: e.target.value })} /></label>
                </div>
              )}
              {preview
                ? <div className="prose" dangerouslySetInnerHTML={{ __html: mdToHtml(draft[kind]) }} />
                : <textarea className="input" spellCheck style={{ minHeight: '56vh', fontSize: 15, lineHeight: 1.6 }} value={draft[kind]} onChange={(e) => set({ [kind]: e.target.value })} />}
            </section>
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
