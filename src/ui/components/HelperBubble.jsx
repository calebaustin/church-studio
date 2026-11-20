// The helper chat: a small button in the corner whenever an AI helper is on. It opens a chat that holds
// what you're working on at the top (a design, a clip, a piece of writing, a campaign) and offers
// Helper Passes for it. Answers stream in. Names of your things in an answer become pills that open them,
// and a few next steps appear under it. Chats are saved: start a new one, or open an old one by its name.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, CalendarDays, Check, Clapperboard, Copy, FileText, History, Image as ImageIcon, Megaphone, Plus, Shapes, Sparkles, Square, Trash2, Wand2, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import { mdToHtml } from '../markdown.js';

const NAMES = { apple: 'Apple Intelligence', cshelper: 'CS Helper', anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', ollama: 'Ollama' };
const REF_ICON = { event: CalendarDays, sermon: Clapperboard, design: Shapes, writing: FileText, campaign: Megaphone, file: ImageIcon };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
/** Where a pill goes. */
function routeFor(r) {
  if (r.type === 'event') return { name: 'calendar' };
  if (r.type === 'sermon') return { name: 'project', id: r.id, step: 'text' };
  if (r.type === 'design') return { name: 'graphics', design: r.id };
  if (r.type === 'writing') return { name: 'writing', project: r.id };
  if (r.type === 'campaign') return { name: 'calendar', tab: 'campaigns' };
  return { name: 'assets' };
}
/** The answer as HTML, with each named item turned into a pill button (first mention only). */
function withPills(md, refs = []) {
  let html = mdToHtml(md || '');
  const inline = new Set();
  refs.forEach((r, i) => {
    const t = esc(r.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(&quot;|“)?(${t})(&quot;|”)?`, 'i');
    if (re.test(html)) { html = html.replace(re, (_m, _a, name) => `<button type="button" class="helper-ref" data-ref="${i}">${name}</button>`); inline.add(i); }
  });
  return { html, inline };
}

export default function HelperBubble({ ai }) {
  const { route, go, helperFocus, helperApply, toast, setAiWorking } = useApp();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('chat'); // chat | history
  const [ctx, setCtx] = useState(null);
  const [chat, setChat] = useState({ id: null, title: null, messages: [] });
  const [history, setHistory] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null); // 'chat' | pass id
  const abort = useRef(null);
  const list = useRef(null);
  const input = useRef(null);
  const chatId = useRef(null); chatId.current = chat.id;
  const msgs = chat.messages;
  const setMsgs = (fn) => setChat((c) => ({ ...c, messages: typeof fn === 'function' ? fn(c.messages) : fn }));
  const on = Boolean(ai?.ready && ai.provider && ai.provider !== 'none');
  const focus = helperFocus || { screen: route.name };
  const focusKey = JSON.stringify(focus);

  // Keep the jobs tray out of the button's way.
  useEffect(() => {
    if (on) document.documentElement.dataset.helper = 'on'; else delete document.documentElement.dataset.helper;
    return () => { delete document.documentElement.dataset.helper; };
  }, [on]);

  // What's on the page, for the header and the passes.
  useEffect(() => {
    if (!open || !on) return;
    let live = true;
    api.post('/api/helper/context', { focus }).then((c) => {
      if (!live) return;
      setCtx((prev) => {
        if (prev && prev.label !== c.label) setMsgs((m) => (m.length && m[m.length - 1].role !== 'note' ? [...m, { role: 'note', content: `Now looking at ${c.label}` }] : m));
        return c;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [open, on, focusKey]);

  useEffect(() => { if (view === 'chat') list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, view]);
  useEffect(() => { if (open && view === 'chat') setTimeout(() => input.current?.focus(), 60); }, [open, view]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!on) return null;

  const save = async (messages) => {
    try {
      const r = await api.put('/api/helper/chats', { id: chatId.current, label: ctx?.label || '', messages });
      setChat((c) => ({ ...c, id: r.chat.id, title: r.chat.title }));
    } catch { /* history is a nicety */ }
  };
  const newChat = () => { abort.current?.abort(); setChat({ id: null, title: null, messages: [] }); setView('chat'); };
  const openHistory = async () => { setView('history'); setHistory(null); try { setHistory((await api.get('/api/helper/chats')).chats); } catch { setHistory([]); } };
  const openChat = async (id) => { try { const r = await api.get(`/api/helper/chats/${id}`); setChat({ id: r.chat.id, title: r.chat.title, messages: r.chat.messages }); setView('chat'); } catch (e) { toast({ kind: 'error', text: e.message }); } };
  const removeChat = async (id) => { await api.del(`/api/helper/chats/${id}`); setHistory((h) => h.filter((c) => c.id !== id)); if (chat.id === id) newChat(); };

  const send = async (text) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    setDraft('');
    const sendable = [...msgs.filter((m) => (m.role === 'user' && !m.pass) || (m.role === 'assistant' && !m.options && !m.error)), { role: 'user', content: q }];
    const start = [...msgs, { role: 'user', content: q }];
    setMsgs([...start, { role: 'assistant', content: '', streaming: true }]);
    setBusy('chat');
    const ac = new AbortController(); abort.current = ac;
    let final = null;
    const patch = (fn) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    try {
      const res = await fetch('/api/helper/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ focus, messages: sendable.map(({ role, content }) => ({ role, content })) }), signal: ac.signal });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const o = JSON.parse(line);
          if (o.delta) patch((x) => ({ ...x, content: x.content + o.delta }));
          if (o.replace != null) patch((x) => ({ ...x, content: o.replace }));
          if (o.done) { final = { role: 'assistant', content: o.text, refs: o.refs || [], actions: o.actions || [] }; patch(() => final); }
          if (o.error) { final = { role: 'assistant', content: o.error, error: true }; patch(() => final); }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') { final = { role: 'assistant', content: e.message, error: true }; patch(() => final); }
    } finally {
      patch((x) => ({ ...x, streaming: false }));
      setBusy(null); abort.current = null;
    }
    if (final) save([...start, final]);
  };

  const pass = async (p) => {
    if (busy) return;
    setBusy(p.id);
    setAiWorking?.(focus.kind || null);
    const start = [...msgs, { role: 'user', content: p.label, pass: true }];
    setMsgs(start);
    let reply;
    try {
      const r = await api.post('/api/helper/pass', { focus, pass: p.id });
      reply = { role: 'assistant', content: '', options: r.options, apply: r.apply };
    } catch (e) {
      reply = { role: 'assistant', content: e.message, error: true };
    } finally { setBusy(null); setAiWorking?.(null); }
    setMsgs([...start, reply]);
    save([...start, reply]);
  };

  const apply = (field, value) => {
    const r = helperApply?.current?.(field, value);
    if (typeof r === 'string') toast({ text: r });
    else if (r) toast({ text: 'Added. Undo takes it back.' });
    else toast({ text: 'Copy it instead: this page can’t take that one.' });
  };
  const copy = async (v) => { await navigator.clipboard.writeText(v); toast({ text: 'Copied.' }); };
  const canApply = (field) => Boolean(field && helperApply?.current);
  const openRef = (r) => { if (r.type === 'file' && focus.kind === 'design' && canApply('image')) apply('image', r.id); else go(routeFor(r)); };
  const runAction = (a) => { if (a.apply) apply(a.apply.field, a.apply.value); else if (a.go) go(a.go); };

  return (
    <>
      <button className={`helper-fab ${open ? 'open' : ''}`} aria-label={open ? 'Close the helper' : 'Ask the helper'} title={`Helper · ${NAMES[ai.provider] || ''}`} onClick={() => setOpen(!open)}>
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>
      {open && (
        <section className="helper-panel glass floating" role="dialog" aria-label="Helper">
          <header className="helper-head">
            <div className="helper-titlebar">
              {view === 'history'
                ? <button className="btn icon sm ghost" aria-label="Back to the chat" title="Back to the chat" onClick={() => setView('chat')}><ArrowLeft size={15} /></button>
                : <button className="btn icon sm ghost" aria-label="Your chats" title="Your chats" onClick={openHistory}><History size={15} /></button>}
              <span className="stack helper-title">
                <strong className="truncate">{view === 'history' ? 'Your chats' : chat.title || 'New chat'}</strong>
                <span className="tiny muted truncate">{NAMES[ai.provider]}{ai.provider === 'apple' || ai.provider === 'cshelper' ? ' · on this Mac' : ' · online'}</span>
              </span>
              <button className="btn sm ghost" title="Start a new chat" onClick={newChat}><Plus size={14} />New chat</button>
            </div>
            {view === 'chat' && ctx?.chips?.length > 0 && <div className="helper-chips">{ctx.chips.map((c) => <span key={c} className="chip" title={c}>{c}</span>)}</div>}
          </header>

          {view === 'history' ? (
            <div className="helper-list helper-history">
              {!history && <span className="muted small">Loading…</span>}
              {history && !history.length && <p className="muted small">No saved chats yet. Each chat is saved here, named by its first question.</p>}
              {history?.map((c) => (
                <div key={c.id} className={`helper-chat-row ${c.id === chat.id ? 'on' : ''}`}>
                  <button className="helper-chat-open" onClick={() => openChat(c.id)}>
                    <strong className="small truncate">{c.title}</strong>
                    <span className="tiny muted truncate">{c.label ? `${c.label} · ` : ''}{ago(c.updated)}</span>
                  </button>
                  <button className="btn icon sm ghost" aria-label={`Delete ${c.title}`} title="Delete this chat" onClick={() => removeChat(c.id)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="helper-list" ref={list} onClick={(e) => {
              const b = e.target.closest('.helper-ref[data-ref]'); if (!b) return;
              const m = msgs[Number(b.closest('[data-msg]')?.dataset.msg)];
              const r = m?.refs?.[Number(b.dataset.ref)];
              if (r) openRef(r);
            }}>
              {!msgs.length && (
                <div className="helper-empty">
                  <p className="muted small">Ask about what you're working on. I know your church's calendar, sermons, voice and brand from Church Studio.</p>
                </div>
              )}
              {msgs.map((m, i) => {
                if (m.role === 'note') return <div key={i} className="helper-note tiny muted">{m.content}</div>;
                if (m.role === 'user') return <div key={i} className={`helper-msg user ${m.pass ? 'pass' : ''}`}>{m.pass ? <span className="row" style={{ gap: 6 }}><Wand2 size={13} />{m.content}</span> : m.content}</div>;
                if (m.options) {
                  return (
                    <div key={i} className="helper-msg assistant">
                      <div className="helper-options">
                        {m.options.map((o) => {
                          const v = typeof o === 'string' ? o : o.value;
                          const label = typeof o === 'string' ? o : o.label;
                          return (
                            <div key={v} className={`helper-option ${o.thumb ? 'pic' : ''}`}>
                              {o.thumb && <img src={o.thumb} alt="" />}
                              <span className="stack" style={{ gap: 1, minWidth: 0 }}><span className={o.thumb ? 'small truncate' : ''}>{label}</span>{o.note && <span className="tiny muted truncate">{o.note}</span>}</span>
                              <span className="row" style={{ gap: 4 }}>
                                {canApply(m.apply) && <button className="btn sm" onClick={() => apply(m.apply, v)}><Check size={13} />{m.apply === 'image' ? 'Add' : 'Use'}</button>}
                                {!o.thumb && <button className="btn sm ghost icon" aria-label="Copy" title="Copy" onClick={() => copy(v)}><Copy size={13} /></button>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                const { html, inline } = withPills(m.content, m.refs);
                const extra = (m.refs || []).filter((_, k) => !inline.has(k));
                return (
                  <div key={i} className="helper-turn" data-msg={i}>
                    <div className={`helper-msg assistant ${m.error ? 'error' : ''}`}>
                      <div className="helper-md" dangerouslySetInnerHTML={{ __html: html + (m.streaming ? '<span class="helper-caret"></span>' : '') }} />
                    </div>
                    {extra.length > 0 && (
                      <div className="helper-refrow">
                        {extra.map((r) => { const Icon = REF_ICON[r.type] || FileText; return <button key={`${r.type}${r.id}`} className="helper-ref" onClick={() => openRef(r)}><Icon size={12} />{r.title}</button>; })}
                      </div>
                    )}
                    {m.actions?.length > 0 && (
                      <div className="helper-actions">
                        {m.actions.map((a) => <button key={a.label} className="chip-btn accent" onClick={() => runAction(a)}><Sparkles size={12} />{a.label}</button>)}
                      </div>
                    )}
                  </div>
                );
              })}
              {busy && busy !== 'chat' && <div className="helper-msg assistant"><span className="helper-dots"><i /><i /><i /></span></div>}
            </div>
          )}

          {view === 'chat' && ctx?.passes?.length > 0 && (
            <div className="helper-passes" aria-label="Helper passes">
              {ctx.passes.map((p) => <button key={p.id} className="chip-btn" disabled={Boolean(busy)} onClick={() => pass(p)}><Wand2 size={12} />{p.label}</button>)}
            </div>
          )}
          {view === 'chat' && (
            <form className="helper-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <textarea ref={input} rows={1} value={draft} placeholder="Ask for help or ideas…" onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              {busy === 'chat'
                ? <button type="button" className="btn icon sm" aria-label="Stop" title="Stop" onClick={() => abort.current?.abort()}><Square size={13} /></button>
                : <button type="submit" className="btn icon sm primary" aria-label="Send" title="Send" disabled={!draft.trim() || Boolean(busy)}><ArrowUp size={15} /></button>}
            </form>
          )}
        </section>
      )}
    </>
  );
}
