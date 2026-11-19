// Email-ready HTML: a newsletter or email in the church's brand, with every style inline so it pastes
// into Mailchimp, Constant Contact, Flocknote, Gmail or any email tool and looks the same.
import { mdToHtml } from './markdown.js';

const lum = (hex) => { const h = String(hex || '#000').replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

export function emailHtml(md, { colors = [], heading = 'Georgia', body = 'Helvetica', logo = null } = {}) {
  const primary = colors[0] || '#2B7F5F';
  const ink = '#1B2033';
  const btnText = lum(primary) > 0.55 ? '#111418' : '#FFFFFF';
  const font = `'${body}', Helvetica, Arial, sans-serif`;
  const hfont = `'${heading}', Georgia, serif`;
  let html = mdToHtml(md)
    .replace(/<mark class="fill">([^<]*)<\/mark>/g, '<span style="background:#FFF3B0">$1</span>')
    .replace(/<h1>/g, `<h1 style="font-family:${hfont};font-size:30px;line-height:1.2;color:${ink};margin:0 0 16px">`)
    .replace(/<h2>/g, `<h2 style="font-family:${hfont};font-size:21px;line-height:1.3;color:${primary};margin:28px 0 8px">`)
    .replace(/<h3>/g, `<h3 style="font-family:${hfont};font-size:17px;color:${ink};margin:20px 0 6px">`)
    .replace(/<p>/g, `<p style="font-family:${font};font-size:16px;line-height:1.6;color:${ink};margin:0 0 14px">`)
    .replace(/<ul>/g, `<ul style="font-family:${font};font-size:16px;line-height:1.6;color:${ink};margin:0 0 14px;padding-left:20px">`)
    .replace(/<ol>/g, `<ol style="font-family:${font};font-size:16px;line-height:1.6;color:${ink};margin:0 0 14px;padding-left:20px">`)
    .replace(/<blockquote>/g, `<blockquote style="margin:0 0 14px;padding:4px 0 4px 16px;border-left:4px solid ${primary};font-style:italic">`)
    .replace(/<hr\s*\/?>/g, '<hr style="border:0;border-top:1px solid #E3E5EA;margin:28px 0">')
    .replace(/<img /g, '<img style="max-width:100%;height:auto;border-radius:8px;display:block" ');
  // A paragraph that is only a link becomes a button.
  html = html.replace(/<p style="[^"]*">\s*<a href="([^"]+)">([^<]+)<\/a>\s*<\/p>/g,
    `<p style="margin:6px 0 18px"><a href="$1" style="display:inline-block;background:${primary};color:${btnText};font-family:${font};font-size:15px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">$2</a></p>`);
  html = html.replace(/<a href=/g, `<a style="color:${primary}" href=`).replace(/<a style="color:[^"]+" href="([^"]+)" style=/g, '<a href="$1" style=');
  const top = logo ? `<tr><td style="padding:28px 32px 0" align="center"><img src="${logo}" alt="" style="max-height:64px;max-width:220px;height:auto"></td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F7;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;border-top:6px solid ${primary}">
${top}<tr><td style="padding:28px 32px 32px">${html}</td></tr></table></td></tr></table>`;
}
