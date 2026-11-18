// Markdown <-> HTML for the Writing editor. Markdown stays the saved format (it pastes cleanly
// into websites and email tools); the editor shows the formatted version.
// Supports: # ## ### headings, paragraphs, > quotes, - and 1. lists (nested by two spaces),
// **bold**, *italic*, ~~strike~~, [links](url), and [ADD: ...] fill-in spots.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(((?:\/library\/|https?:|data:image\/)[^)\s]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\[((?:ADD|[A-Z][A-Z ]{2,})[^\]]*)\](?!\()/g, '<mark class="fill">[$1]</mark>');
}

export function mdToHtml(md = '') {
  const out = [];
  const stack = []; // open lists: {tag, depth}
  const closeTo = (depth) => { while (stack.length && stack.at(-1).depth >= depth) out.push(`</li></${stack.pop().tag}>`); };
  let quote = [];
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${mdToHtml(quote.join('\n'))}</blockquote>`); quote = []; } };
  for (const raw of String(md).split('\n')) {
    if (/^>\s?/.test(raw)) { closeTo(0); quote.push(raw.replace(/^>\s?/, '')); continue; }
    flushQuote();
    let m;
    if ((m = raw.match(/^(\s*)(-|\*|\d+\.)\s+(.*)/))) {
      const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2) + 1;
      const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
      const top = stack.at(-1);
      if (!top || depth > top.depth) { out.push(`<${tag}>`); stack.push({ tag, depth }); }
      else {
        closeTo(depth + 1);
        if (stack.at(-1)?.tag !== tag) { closeTo(depth); out.push(`<${tag}>`); stack.push({ tag, depth }); } else out.push('</li>');
      }
      out.push(`<li>${inline(m[3])}`);
      continue;
    }
    closeTo(0);
    if ((m = raw.match(/^(#{1,3})\s+(.*)/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (raw.trim()) out.push(`<p>${inline(raw)}</p>`);
  }
  flushQuote();
  closeTo(0);
  return out.join('');
}

/** Formatted HTML (from the editor) back to Markdown. */
export function htmlToMd(root) {
  const lines = [];
  const text = (node) => {
    let s = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { s += n.nodeValue.replace(/ /g, ' ').replace(/\s+/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      const inner = text(n);
      const wrap = (mark) => {
        const m = inner.match(/^(\s*)(.*?)(\s*)$/s);
        return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
      };
      if (tag === 'strong' || tag === 'b') s += wrap('**');
      else if (tag === 'em' || tag === 'i') s += wrap('*');
      else if (tag === 's' || tag === 'strike' || tag === 'del') s += wrap('~~');
      else if (tag === 'a' && n.getAttribute('href')) s += `[${inner}](${n.getAttribute('href')})`;
      else if (tag === 'br') s += '\n';
      else if (tag === 'img' && n.getAttribute('src')) s += `![${(n.getAttribute('alt') || '').replace(/[[\]]/g, '')}](${n.getAttribute('src')})`;
      else if (tag === 'span' && /font-weight:\s*(bold|[6-9]00)/.test(n.getAttribute('style') || '')) s += wrap('**');
      else if (tag === 'span' && /font-style:\s*italic/.test(n.getAttribute('style') || '')) s += wrap('*');
      else s += inner;
    }
    return s;
  };
  const list = (el, prefix, depth) => {
    let k = 1;
    const ordered = el.tagName.toLowerCase() === 'ol';
    for (const li of el.children) {
      if (/^(ul|ol)$/i.test(li.tagName)) { list(li, prefix, depth + 1); continue; }
      const own = document.createElement('div');
      const nested = [];
      for (const c of li.childNodes) {
        if (c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName)) nested.push(c);
        else own.appendChild(c.cloneNode(true));
      }
      lines.push(`${prefix}${'  '.repeat(depth)}${ordered ? `${k++}.` : '-'} ${text(own).trim()}`);
      for (const sub of nested) list(sub, prefix, depth + 1);
    }
  };
  const hasBlock = (n) => [...n.children].some((c) => /^(p|div|ul|ol|h[1-6]|blockquote)$/i.test(c.tagName));
  const block = (node, prefix = '', depth = 0) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (t) lines.push(prefix + t); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { lines.push(`${prefix}${'#'.repeat(Math.min(3, Number(tag[1])))} ${text(n).trim()}`); lines.push(prefix.trimEnd()); }
      else if (tag === 'blockquote') {
        if (hasBlock(n)) block(n, `${prefix}> `, depth);
        else for (const part of text(n).trim().split('\n')) lines.push(`${prefix}> ${part}`);
        lines.push(prefix.trimEnd());
      }
      else if (tag === 'ul' || tag === 'ol') { list(n, prefix, depth); if (depth === 0) lines.push(prefix.trimEnd()); }
      else if (tag === 'p' || tag === 'div') {
        if (n.querySelector(':scope > p, :scope > div, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3, :scope > blockquote')) { block(n, prefix, depth); continue; }
        const t = text(n).trim();
        if (t) { for (const part of t.split('\n')) lines.push(prefix + part); lines.push(prefix.trimEnd()); }
      } else {
        const t = text(n).trim();
        if (t) { lines.push(prefix + t); lines.push(prefix.trimEnd()); }
      }
    }
  };
  block(root);
  // Drop empty quote lines at the end of a quote, and collapse blank runs.
  const tidy = lines.filter((l, k) => !(l === '>' && !(lines[k + 1] || '').startsWith('>')));
  return tidy.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Plain text (for previews and checks). */
export const mdToText = (md = '') => md.replace(/^#{1,3}\s+/gm, '').replace(/^>\s?/gm, '').replace(/\*\*|~~|(^|\s)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
