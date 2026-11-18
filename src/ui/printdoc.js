// Printable versions of writing drafts: a full letter page (small group guides get the sermon
// outline down the left third) or a half page (5.5 x 8.5 in, 0.25 in margins) printed twice on a
// landscape letter sheet to cut in half. Church logo and info go in the footer.
import { mdToHtml } from './markdown.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lum = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

function headerHtml(title, header, eyebrow) {
  const t = `<div class="h-text">${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(title)}</h1></div>`;
  if (!header?.url && header?.style !== 'color') return `<header class="hd plain">${t}</header>`;
  if (header.style === 'color') return `<header class="hd color" style="background:${esc(header.color)};color:${lum(header.color) > 0.6 ? '#111' : '#fff'}">${t}</header>`;
  if (header.style === 'blur') return `<header class="hd blur"><img class="bg" src="${esc(header.url)}" alt=""><div class="shade"></div>${t}</header>`;
  return `<header class="hd full"><img src="${esc(header.url)}" alt=""></header><div class="title-under">${t}</div>`;
}

function footerHtml(church, logoUrl) {
  const c = church || {};
  const line1 = [c.name, c.times].filter(Boolean).map(esc).join(' · ');
  const line2 = [c.address, c.website, c.phone, c.email].filter(Boolean).map(esc).join(' · ');
  if (!logoUrl && !line1 && !line2) return '';
  return `<footer class="ft">${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ''}<div>${line1 ? `<strong>${line1}</strong>` : ''}${line2 ? `<span>${line2}</span>` : ''}</div></footer>`;
}

function outlineHtml(o, accent) {
  if (!o) return '';
  return `<aside class="side" style="--a:${esc(accent)}">
    <div class="eyebrow">This week's message</div>
    <h2>${esc(o.title)}</h2>
    ${o.refs?.length ? `<div class="lbl">Scripture</div><ul class="refs">${o.refs.slice(0, 4).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${o.points?.length ? `<div class="lbl">Outline</div><ol>${o.points.slice(0, 5).map((p) => `<li>${esc(p.heading)}</li>`).join('')}</ol>` : ''}
    <div class="lbl">Notes</div><div class="lines">${'<i></i>'.repeat(7)}</div>
  </aside>`;
}

export function buildPrintHtml({ kind, md, title, header, outline, church, logoUrl, brand, layout, origin }) {
  const accent = brand?.colors?.[0] || '#2B7F5F';
  const hf = brand?.heading || 'Montserrat'; const bf = brand?.body || 'Montserrat';
  // The title lives in the header, so drop the draft's own first heading.
  const body = mdToHtml(String(md || '').replace(/^#\s+.*\n+/, '').replace(/^\*\*Subject:\*\*.*\n(\*\*Preview:\*\*.*\n)?\n?/, ''))
    .replace(/src="\/library\//g, `src="${origin}/library/`);
  const eyebrow = { group: 'Small group guide', blog: '', email: '', social: '' }[kind] || '';
  const cleanTitle = String(title || '').replace(/^Small group guide:\s*/i, '');
  const withSide = kind === 'group' && outline;
  const page = (half) => `<div class="pg ${half ? 'half' : 'full'}">
      ${headerHtml(cleanTitle, header, eyebrow)}
      <div class="main ${withSide && !half ? 'two' : ''}">
        ${withSide && !half ? outlineHtml(outline, accent) : ''}
        <article class="doc">${body}</article>
      </div>
      ${footerHtml(church, logoUrl)}
    </div>`;
  const half = layout === 'half';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(cleanTitle)}</title><style>
  @page { size: letter ${half ? 'landscape' : 'portrait'}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: '${bf}', -apple-system, 'Helvetica Neue', sans-serif; color: #1c2024; }
  .sheet { width: ${half ? '11in' : '8.5in'}; height: ${half ? '8.5in' : '11in'}; display: flex; position: relative; overflow: hidden; }
  .pg { display: flex; flex-direction: column; overflow: hidden; font-size: var(--fs, 11pt); line-height: 1.45; }
  .pg.full { width: 8.5in; height: 11in; padding: 0.5in; }
  .pg.half { width: 5.5in; height: 8.5in; padding: 0.25in; }
  .cut { position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px dashed #b8bec6; }
  .hd { position: relative; border-radius: 10px; overflow: hidden; margin-bottom: 0.18in; flex: none; }
  .hd.full img { display: block; width: 100%; height: ${half ? '1.35in' : '2.2in'}; object-fit: cover; }
  .hd.blur, .hd.color { min-height: ${half ? '1.15in' : '1.7in'}; display: flex; align-items: flex-end; padding: 0.2in 0.22in; color: #fff; }
  .hd.blur .bg { position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); object-fit: cover; filter: blur(14px) saturate(1.1); }
  .hd.blur .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.6)); }
  .hd .h-text { position: relative; }
  .hd.plain { margin-bottom: 0.12in; }
  .title-under { margin-bottom: 0.12in; }
  h1 { font-family: '${hf}', sans-serif; font-size: 2.1em; line-height: 1.1; margin: 0; font-weight: 800; }
  .eyebrow { font-size: .72em; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .85; margin-bottom: 4px; color: inherit; }
  .hd.plain .eyebrow, .title-under .eyebrow, .side .eyebrow { color: ${accent}; }
  .main { flex: 1; min-height: 0; overflow: hidden; }
  .main.two { display: grid; grid-template-columns: 33% 1fr; gap: 0.25in; }
  .side { background: color-mix(in srgb, var(--a) 9%, #fff); border-radius: 10px; padding: 0.18in; font-size: .9em; }
  .side h2 { font-family: '${hf}', sans-serif; font-size: 1.25em; margin: 2px 0 10px; line-height: 1.2; }
  .side .lbl { font-size: .72em; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6b7280; margin: 12px 0 4px; }
  .side ul, .side ol { margin: 0; padding-left: 1.2em; } .side li { margin: 3px 0; }
  .side .lines i { display: block; height: 0.28in; border-bottom: 1px solid color-mix(in srgb, var(--a) 30%, #fff); }
  .doc h1 { font-size: 1.6em; } .doc h2 { font-family: '${hf}', sans-serif; font-size: 1.25em; margin: 0.9em 0 0.3em; }
  .doc h3 { font-size: 1.05em; margin: .8em 0 .2em; }
  .doc p { margin: 0 0 0.55em; } .doc ol, .doc ul { margin: 0 0 0.6em; padding-left: 1.3em; } .doc li { margin: 0.28em 0; }
  .doc blockquote { margin: 0 0 .7em; padding: .4em .8em; border-left: 3px solid ${accent}; background: color-mix(in srgb, ${accent} 8%, #fff); border-radius: 0 8px 8px 0; }
  .doc img { max-width: 100%; border-radius: 8px; margin: .3em 0; }
  .doc a { color: inherit; }
  .doc mark { background: #fff3c4; border-radius: 3px; padding: 0 2px; }
  .doc > :first-child { margin-top: 0; }
  .ft { flex: none; display: flex; align-items: center; gap: 10px; padding-top: 0.12in; margin-top: 0.12in; border-top: 1px solid #e3e6ea; font-size: .72em; color: #4b5563; }
  .ft img { height: 0.38in; max-width: 1.4in; object-fit: contain; }
  .ft div { display: grid; gap: 1px; } .ft strong { color: #1c2024; }
  </style></head><body>
  <div class="sheet">${half ? `${page(true)}${page(true)}<div class="cut"></div>` : page(false)}</div>
  <script>
  (async () => {
    await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    await document.fonts.ready;
    // Shrink the type until each page's text fits, down to a readable minimum.
    for (const pg of document.querySelectorAll('.pg')) {
      const main = pg.querySelector('.main');
      let fs = ${half ? 10 : 11};
      pg.style.setProperty('--fs', fs + 'pt');
      while (main.scrollHeight > main.clientHeight + 1 && fs > ${half ? 6.5 : 8}) { fs -= 0.25; pg.style.setProperty('--fs', fs + 'pt'); }
    }
    window.__ready = true;
  })();
  </script></body></html>`;
}

/** Same fitting as the page's own script, run from the app for the preview (its inline script is blocked there). */
export async function fitPrintDoc(doc, half) {
  if (!doc) return;
  await Promise.all([...doc.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  await doc.fonts?.ready;
  for (const pg of doc.querySelectorAll('.pg')) {
    const main = pg.querySelector('.main');
    let fs = half ? 10 : 11;
    pg.style.setProperty('--fs', `${fs}pt`);
    while (main.scrollHeight > main.clientHeight + 1 && fs > (half ? 6.5 : 8)) { fs -= 0.25; pg.style.setProperty('--fs', `${fs}pt`); }
  }
}
