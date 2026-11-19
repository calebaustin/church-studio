// Export a design: PNG pages, a PDF, or a PowerPoint file (each slide is the drawn page,
// with speaker notes). Files are saved into the brand library's Graphics folder.
import { api } from '../api.js';
import { pageDataUrl } from './model.js';

const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

export async function exportDesign(doc, format, { pageIndex = 0, onProgress } = {}) {
  const cache = {};
  const pages = format === 'png-one' ? [doc.pages[pageIndex]] : doc.pages;
  const name = doc.name || 'Design';
  if (format === 'png-one' || format === 'png-all') {
    const files = [];
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      files.push({ name: pages.length > 1 ? `${name} ${String(i + 1).padStart(2, '0')}` : name, dataUrl: await pageDataUrl(doc, pages[i], 1, cache) });
    }
    return api.post('/api/designs/export', { name: format === 'png-one' && doc.pages.length > 1 ? `${name} ${pageIndex + 1}` : name, files });
  }
  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf');
    const { w, h } = doc.size;
    const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      if (i) pdf.addPage([w, h], w >= h ? 'landscape' : 'portrait');
      pdf.addImage(await pageDataUrl(doc, pages[i], 1, cache, 'image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    }
    return api.post('/api/designs/export', { name, files: [{ name, ext: 'pdf', dataUrl: await blobToDataUrl(pdf.output('blob')) }] });
  }
  if (format === 'pdf-print') {
    // For a print shop: 300 dpi, 1/8 inch bleed on every side, and crop marks. Designs are laid out at
    // 150 pixels per inch (a letter flyer is 1275 x 1650), so that's the printed size.
    const { jsPDF } = await import('jspdf');
    const tw = doc.size.w / 150; const th = doc.size.h / 150;
    const bleed = 0.125; const mark = 0.375;
    const pw = tw + 2 * (bleed + mark); const ph = th + 2 * (bleed + mark);
    const pdf = new jsPDF({ orientation: pw >= ph ? 'landscape' : 'portrait', unit: 'in', format: [pw, ph] });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      if (i) pdf.addPage([pw, ph], pw >= ph ? 'landscape' : 'portrait');
      const img = await pageDataUrl(doc, pages[i], 2, cache, 'image/jpeg', 0.95);
      // Stretch the artwork a hair past the trim so the edges print all the way to the cut.
      pdf.addImage(img, 'JPEG', mark, mark, tw + 2 * bleed, th + 2 * bleed);
      pdf.setLineWidth(0.006); pdf.setDrawColor(0, 0, 0);
      const x0 = mark + bleed; const y0 = mark + bleed; const x1 = x0 + tw; const y1 = y0 + th; const L = mark - 0.06;
      for (const [x, y, dx, dy] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]]) {
        pdf.line(x, y + dy * bleed, x, y + dy * (bleed + L));
        pdf.line(x + dx * bleed, y, x + dx * (bleed + L), y);
      }
    }
    const tag = `${name} (print, ${tw.toFixed(2).replace(/\.?0+$/, '')}x${th.toFixed(2).replace(/\.?0+$/, '')} in)`;
    return api.post('/api/designs/export', { name: tag, files: [{ name: tag, ext: 'pdf', dataUrl: await blobToDataUrl(pdf.output('blob')) }] });
  }
  if (format === 'pptx') {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const pptx = new PptxGenJS();
    const width = 13.333; const height = +(width * (doc.size.h / doc.size.w)).toFixed(3);
    pptx.defineLayout({ name: 'DESIGN', width, height });
    pptx.layout = 'DESIGN';
    pptx.title = name;
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const slide = pptx.addSlide();
      slide.addImage({ data: await pageDataUrl(doc, pages[i], 1, cache), x: 0, y: 0, w: width, h: height });
      if (pages[i].notes) slide.addNotes(pages[i].notes);
    }
    const blob = await pptx.write({ outputType: 'blob' });
    return api.post('/api/designs/export', { name, files: [{ name, ext: 'pptx', dataUrl: await blobToDataUrl(blob) }] });
  }
  throw new Error('Unknown format');
}
