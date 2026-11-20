// The helper chat: a small button in the corner whenever an AI helper is on. It opens a chat that holds
// what you're working on at the top (a design, a clip, a piece of writing, a campaign) and offers
// Helper Passes for it. Answers stream in; options from a pass can be used right on the page.
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Copy, Sparkles, Square, Wand2, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import { mdToHtml } from '../markdown.js';

const NAMES = { apple: 'Apple Intelligence', cshelper: 'CS Helper', anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', ollama: 'Ollama' };

export default function HelperBubble({ ai }) {
  const { route, helperFocus, helperApply, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null); // 'chat' | pass id
  const abort = useRef(null);
  const list = useRef(null);
  const input = useRef(null);
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
        if (prev && prev.label !== c.label) setMsgs((m) => (m.length ? [...m, { role: 'note', content: `Now looking at ${c.label}` }] : m));
        return c;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [open, on, focusKey]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (!on) return null;

  const send = async (text) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    setDraft('');
    const history = [...msgs.filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.options)), { role: 'user', content: q }];
    setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', streaming: true }]);
    setBusy('chat');
    const ac = new AbortController(); abort.current = ac;
    const patch = (fn) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    try {
      const res = await fetch('/api/helper/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ focus, messages: history.map(({ role, content }) => ({ role, content })) }), signal: ac.signal });
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
          if (o.done) patch((x) => ({ ...x, content: o.text || x.content, streaming: false }));
          if (o.error) patch((x) => ({ ...x, content: o.error, error: true, streaming: false }));
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') patch((x) => ({ ...x, content: e.message, error: true }));
    } finally {
      patch((x) => ({ ...x, streaming: false }));
      setBusy(null); abort.current = null;
    }
  };

  const pass = async (p) => {
    if (busy) return;
    setBusy(p.id);
    setMsgs((m) => [...m, { role: 'user', content: p.label, pass: true }]);
    try {
      const r = await api.post('/api/helper/pass', { focus, pass: p.id });
      setMsgs((m) => [...m, { role: 'assistant', content: '', options: r.options, apply: r.apply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: e.message, error: true }]);
    } finally { setBusy(null); }
  };

  const use = (field, value) => {
    const r = helperApply?.current?.(field, value);
    if (typeof r === 'string') toast({ text: r });
    else if (r) toast({ text: 'Added. Undo takes it back.' });
    else toast({ text: 'Copy it instead: this page can\'t take that one.' });
  };
  const copy = async (v) => { await navigator.clipboard.writeText(v); toast({ text: 'Copied.' }); };
  const canApply = (field) => Boolean(field && helperApply?.current);

  return (
    <>
      <button className={`helper-fab ${open ? 'open' : ''}`} aria-label={open ? 'Close the helper' : 'Ask the helper'} title={`Helper · ${NAMES[ai.provider] || ''}`} onClick={() => setOpen(!open)}>
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>
      {open && (
        <section className="helper-panel glass floating" role="dialog" aria-label="Helper">
          <header className="helper-head">
            <div className="row between" style={{ gap: 8 }}>
              <strong className="row" style={{ gap: 6 }}><Sparkles size={15} />Helper</strong>
              <span className="muted tiny">{NAMES[ai.provider]}{ai.provider === 'apple' || ai.provider === 'cshelper' ? ' · on this Mac' : ' · online'}</span>
            </div>
            {ctx?.chips?.length > 0 && <div className="helper-chips">{ctx.chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>}
          </header>
          <div className="helper-list" ref={list}>
            {!msgs.length && (
              <div className="helper-empty">
                <p className="muted small">Ask about what you're working on. I know your church's calendar, sermons, voice and brand from Church Studio.</p>
              </div>
            )}
            {msgs.map((m, i) => (
              m.role === 'note' ? <div key={i} className="helper-note tiny muted">{m.content}</div>
                : (
                  <div key={i} className={`helper-msg ${m.role} ${m.error ? 'error' : ''} ${m.pass ? 'pass' : ''}`}>
                    {m.options ? (
                      <div className="helper-options">
                        {m.options.map((o) => (
                          <div key={o} className="helper-option">
                            <span>{o}</span>
                            <span className="row" style={{ gap: 4 }}>
                              {canApply(m.apply) && <button className="btn sm" onClick={() => use(m.apply, o)}><Check size={13} />Use</button>}
                              <button className="btn sm ghost icon" aria-label="Copy" title="Copy" onClick={() => copy(o)}><Copy size={13} /></button>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : m.role === 'assistant'
                      ? <div className="helper-md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content || '') + (m.streaming ? '<span class="helper-caret"></span>' : '') }} />
                      : m.pass ? <span className="row" style={{ gap: 6 }}><Wand2 size={13} />{m.content}</span> : m.content}
                  </div>
                )
            ))}
            {busy && busy !== 'chat' && <div className="helper-msg assistant"><span className="helper-dots"><i /><i /><i /></span></div>}
          </div>
          {ctx?.passes?.length > 0 && (
            <div className="helper-passes" aria-label="Helper passes">
              {ctx.passes.map((p) => <button key={p.id} className="chip-btn" disabled={Boolean(busy)} onClick={() => pass(p)}><Wand2 size={12} />{p.label}</button>)}
            </div>
          )}
          <form className="helper-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea ref={input} rows={1} value={draft} placeholder="Ask for help or ideas…" onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {busy === 'chat'
              ? <button type="button" className="btn icon sm" aria-label="Stop" title="Stop" onClick={() => abort.current?.abort()}><Square size={13} /></button>
              : <button type="submit" className="btn icon sm primary" aria-label="Send" title="Send" disabled={!draft.trim() || Boolean(busy)}><ArrowUp size={15} /></button>}
          </form>
        </section>
      )}
    </>
  );
}
