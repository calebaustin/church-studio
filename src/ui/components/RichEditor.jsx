import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Bold, ChevronDown, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, Quote, Redo2,
  RemoveFormatting, Strikethrough, Undo2, Unlink,
} from 'lucide-react';
import { htmlToMd, mdToHtml } from '../markdown.js';
import Popover from './Popover.jsx';

const STYLES = [
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['p', 'Body'],
  ['blockquote', 'Quote'],
];

function Tool({ icon: Icon, label, on, onClick, disabled }) {
  return (
    <button type="button" className={`rt-btn ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on || undefined}
      disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon size={16} strokeWidth={2.1} />
    </button>
  );
}

/**
 * Formatted editor over Markdown. `value` and `onChange` are Markdown; the person edits the
 * formatted text, or switches to Markdown to check or fix the source.
 */
export default function RichEditor({ value, onChange, minHeight = '56vh' }) {
  const [mode, setMode] = useState('rich');
  const ref = useRef(null);
  const last = useRef(null);
  const saved = useRef(null);
  const [state, setState] = useState({});
  const [stylesOpen, setStylesOpen] = useState(false);
  const [link, setLink] = useState(null); // {url}

  // Load Markdown into the editor when it changes from outside (new draft, rewrite, Markdown edits).
  useLayoutEffect(() => {
    if (mode !== 'rich' || !ref.current) return;
    if (value !== last.current) { ref.current.innerHTML = mdToHtml(value || ''); last.current = value; }
  }, [value, mode]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    const md = htmlToMd(ref.current);
    last.current = md;
    onChange(md);
  }, [onChange]);

  const refresh = useCallback(() => {
    const sel = document.getSelection();
    if (!ref.current || !sel?.rangeCount || !ref.current.contains(sel.anchorNode)) return;
    let block = 'p';
    for (let n = sel.anchorNode; n && n !== ref.current; n = n.parentNode) {
      const t = n.nodeName?.toLowerCase();
      if (/^h[1-3]$/.test(t) || t === 'blockquote') { block = t; break; }
      if (t === 'li') { block = 'li'; }
    }
    const inLink = (() => { for (let n = sel.anchorNode; n && n !== ref.current; n = n.parentNode) if (n.nodeName === 'A') return n; return null; })();
    setState({
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
      strike: document.queryCommandState('strikeThrough'),
      ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'),
      block, link: inLink,
    });
  }, []);
  useEffect(() => {
    document.addEventListener('selectionchange', refresh);
    return () => document.removeEventListener('selectionchange', refresh);
  }, [refresh]);

  const exec = (cmd, arg) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
    refresh();
  };
  const setBlock = (tag) => {
    setStylesOpen(false);
    if (state.ul) exec('insertUnorderedList');
    if (state.ol) exec('insertOrderedList');
    exec('formatBlock', tag === state.block && tag === 'blockquote' ? 'p' : tag);
  };

  const keepSelection = () => {
    const sel = document.getSelection();
    saved.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  };
  const openLink = () => {
    keepSelection();
    setLink({ url: state.link?.getAttribute('href') || 'https://' });
  };
  const applyLink = () => {
    const url = link.url.trim();
    setLink(null);
    ref.current?.focus();
    const sel = document.getSelection();
    if (saved.current) { sel.removeAllRanges(); sel.addRange(saved.current); }
    if (!/^(https?:\/\/|mailto:)\S+\.\S+/.test(url) && !/^mailto:\S+@\S+/.test(url)) return;
    if (sel.isCollapsed && !state.link) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '%22')}">${url.replace(/</g, '&lt;')}</a>`);
    else document.execCommand('createLink', false, url);
    emit();
  };

  const onKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink(); }
    if (e.key === 'Tab' && (state.ul || state.ol)) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); }
  };
  const onPaste = (e) => {
    // Paste as plain text so outside styles never sneak in. Markdown pasted here becomes formatting.
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (/^(#{1,3} |> |- |\d+\. )|\*\*.+\*\*/m.test(text)) document.execCommand('insertHTML', false, mdToHtml(text));
    else document.execCommand('insertText', false, text);
    emit();
  };

  const current = STYLES.find(([t]) => t === state.block)?.[1] || (state.block === 'li' ? 'List' : 'Body');
  const rich = mode === 'rich';

  return (
    <div className="rt">
      <div className="rt-bar" role="toolbar" aria-label="Formatting">
        <div className="rt-group" style={{ position: 'relative' }}>
          <button type="button" className="rt-style" data-pop-trigger disabled={!rich} onMouseDown={(e) => e.preventDefault()} onClick={() => setStylesOpen(!stylesOpen)}>
            {current}<ChevronDown size={14} />
          </button>
          <Popover open={stylesOpen} onClose={() => setStylesOpen(false)} width={210}>
            <div className="pop-list">
              {STYLES.map(([tag, label]) => (
                <button key={tag} type="button" className={`pop-item rt-style-${tag} ${state.block === tag ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock(tag)}>{label}</button>
              ))}
            </div>
          </Popover>
        </div>
        <span className="rt-sep" />
        <div className="rt-group">
          <Tool icon={Bold} label="Bold (⌘B)" on={state.bold} disabled={!rich} onClick={() => exec('bold')} />
          <Tool icon={Italic} label="Italic (⌘I)" on={state.italic} disabled={!rich} onClick={() => exec('italic')} />
          <Tool icon={Strikethrough} label="Strikethrough" on={state.strike} disabled={!rich} onClick={() => exec('strikeThrough')} />
          <div style={{ position: 'relative' }}>
            <Tool icon={Link2} label="Link (⌘K)" on={Boolean(state.link)} disabled={!rich} onClick={openLink} />
            <Popover open={Boolean(link)} onClose={() => setLink(null)} width={320}>
              <form className="row" style={{ gap: 6, padding: 4 }} onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
                <input className="input" autoFocus value={link?.url || ''} onChange={(e) => setLink({ url: e.target.value })} aria-label="Web address" />
                <button className="btn sm primary" type="submit">Add</button>
              </form>
            </Popover>
          </div>
          {state.link && <Tool icon={Unlink} label="Remove link" disabled={!rich} onClick={() => { const r = document.createRange(); r.selectNodeContents(state.link); const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); exec('unlink'); }} />}
        </div>
        <span className="rt-sep" />
        <div className="rt-group">
          <Tool icon={List} label="Bulleted list" on={state.ul} disabled={!rich} onClick={() => exec('insertUnorderedList')} />
          <Tool icon={ListOrdered} label="Numbered list" on={state.ol} disabled={!rich} onClick={() => exec('insertOrderedList')} />
          <Tool icon={Quote} label="Quote" on={state.block === 'blockquote'} disabled={!rich} onClick={() => setBlock('blockquote')} />
          <Tool icon={IndentDecrease} label="Outdent (Shift Tab)" disabled={!rich} onClick={() => exec('outdent')} />
          <Tool icon={IndentIncrease} label="Indent (Tab)" disabled={!rich} onClick={() => exec('indent')} />
        </div>
        <span className="rt-sep" />
        <div className="rt-group">
          <Tool icon={RemoveFormatting} label="Clear formatting" disabled={!rich} onClick={() => { exec('removeFormat'); exec('formatBlock', 'p'); }} />
          <Tool icon={Undo2} label="Undo (⌘Z)" disabled={!rich} onClick={() => exec('undo')} />
          <Tool icon={Redo2} label="Redo (⇧⌘Z)" disabled={!rich} onClick={() => exec('redo')} />
        </div>
        <div className="grow" />
        <div className="seg sm" role="tablist" aria-label="View">
          <button type="button" className={rich ? 'on' : ''} onClick={() => setMode('rich')}>Formatted</button>
          <button type="button" className={!rich ? 'on' : ''} onClick={() => { last.current = null; setMode('md'); }}>Markdown</button>
        </div>
      </div>
      {rich ? (
        <div
          ref={ref}
          className="prose rt-doc"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          style={{ minHeight }}
          onInput={emit}
          onKeyDown={onKeyDown}
          onKeyUp={refresh}
          onMouseUp={refresh}
          onPaste={onPaste}
          role="textbox"
          aria-multiline="true"
          aria-label="Draft"
        />
      ) : (
        <textarea className="rt-md mono" spellCheck style={{ minHeight }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Markdown" />
      )}
    </div>
  );
}
