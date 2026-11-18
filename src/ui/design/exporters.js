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
