import { useEffect, useMemo, useState } from 'react';
import { FileDown, Printer, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, desktop } from '../api.js';
import { buildPrintHtml, fitPrintDoc } from '../printdoc.js';
import Modal from './Modal.jsx';

/**
 * Print or save a writing draft as a PDF. Full page (letter) or half page: two 5.5 x 8.5 in copies
 * on one landscape sheet, to cut in half. Logo and church info go in the footer.
 */
export default function PrintDialog({ pid, kind, kindLabel, draft, header, onClose }) {
  const { config, toast } = useApp();
  const [layout, setLayout] = useState('full');
  const [outline, setOutline] = useState(null);
  const [logo, setLogo] = useState(undefined);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (kind === 'group') api.get(`/api/outline/${pid}`).then((r) => setOutline(r.outline)).catch(() => setOutline(null));
    api.get('/api/library').then((l) => setLogo(l.items.find((i) => i.folder === 'Logos' && i.kind === 'image')?.url || null)).catch(() => setLogo(null));
  }, [pid, kind]);
  const origin = window.location.origin;
  const html = useMemo(() => buildPrintHtml({
    kind, md: draft[kind], title: kind === 'blog' ? draft.title : (draft[kind].match(/^#\s+(.*)/m)?.[1] || draft.title),
    header: header ? { ...header, url: header.rel ? `${origin}/library/${header.rel.split('/').map(encodeURIComponent).join('/')}` : null } : null,
    outline, church: config.churchInfo, logoUrl: logo ? `${origin}${logo}` : null,
    brand: { colors: config.brandColors, heading: config.brandFonts?.heading, body: config.brandFonts?.body }, layout, origin,
  }), [kind, draft, header, outline, config, logo, layout, origin]);
  const half = layout === 'half';
  const hasInfo = Object.values(config.churchInfo || {}).some(Boolean);

  const save = async () => {
    setBusy('pdf');
    try {
      if (!desktop?.printDoc) throw new Error('Saving a PDF works in the Church Studio app. Use Print here instead.');
      const r = await desktop.printDoc({ html, landscape: half, action: 'pdf' });
      const name = `${draft.title} - ${kindLabel}${half ? ' (half page)' : ''}`;
      const s = await api.post('/api/designs/export', { folder: 'Writing', name, files: [{ name, ext: 'pdf', dataUrl: `data:application/pdf;base64,${r.pdf}` }] });
      toast({ text: 'PDF saved to Writing in your brand library.', action: { label: 'Show', run: () => api.post('/api/library/reveal', { rel: s.rel }) } });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(null);
  };
  const print = async () => {
    setBusy('print');
    try {
      if (desktop?.printDoc) await desktop.printDoc({ html, landscape: half, action: 'print' });
      else {
        const f = document.createElement('iframe');
        Object.assign(f.style, { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 });
        document.body.appendChild(f);
        f.srcdoc = html;
        await new Promise((r) => { f.onload = r; });
        await fitPrintDoc(f.contentDocument, half);
        f.contentWindow.print();
        setTimeout(() => f.remove(), 60_000);
      }
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(null);
  };
  // Preview: the real page at scale.
  const w = half ? 11 : 8.5; const h = half ? 8.5 : 11;
  const scale = half ? 0.62 : 0.5;
  return (
    <Modal onClose={onClose} width={half ? 820 : 640} label="Print or save as PDF">
      <h2>Print or PDF</h2>
      <div className="row between wrap">
        <div className="seg sm">
          <button className={!half ? 'on' : ''} onClick={() => setLayout('full')}>Full page</button>
          <button className={half ? 'on' : ''} onClick={() => setLayout('half')}>Half page, 2 per sheet</button>
        </div>
        <span className="muted small">{half ? '5.5 × 8.5 in with ¼ in margins. Cut along the dashed line.' : kind === 'group' ? 'Letter size. The sermon outline runs down the left third.' : 'Letter size.'}</span>
      </div>
      <div className="print-stage">
        <div style={{ width: `${w * 96 * scale}px`, height: `${h * 96 * scale}px`, overflow: 'hidden' }}>
          <iframe title="Print preview" className="print-frame" srcDoc={html} sandbox="allow-same-origin allow-modals" onLoad={(e) => fitPrintDoc(e.currentTarget.contentDocument, half)}
            style={{ width: `${w}in`, height: `${h}in`, transform: `scale(${scale})`, transformOrigin: '0 0' }} />
        </div>
      </div>
      {!hasInfo && <span className="muted small">Tip: add your church's name and address in Settings › Church info, and a logo in your brand library, to show them in the footer.</span>}
      <div className="row">
        <button className="btn primary" disabled={Boolean(busy)} onClick={save}><FileDown size={15} />{busy === 'pdf' ? 'Saving…' : 'Save PDF'}</button>
        <button className="btn" disabled={Boolean(busy)} onClick={print}><Printer size={15} />Print</button>
      </div>
    </Modal>
  );
}
