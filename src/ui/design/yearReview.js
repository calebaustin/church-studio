// Year in review: a story set of the year's numbers, in the church's brand. Opens in Design to edit.
import { onColor, page, shape, text, uid } from './model.js';

const n = (v) => Number(v || 0).toLocaleString('en-US');

/** stats from /api/inspiration/year; ctx = { c: colors, h, b }, church name and logo path. */
export function yearReviewDoc(stats, ctx, { church = '', logo = '' } = {}) {
  const [primary, accent, dark, light] = ctx.c;
  const H = (p) => text({ font: ctx.h, weight: 800, ...p });
  const B = (p) => text({ font: ctx.b, weight: 500, size: 48, lh: 1.35, ...p });
  const onDark = onColor(dark); const onPrimary = onColor(primary);
  const pages = [];
  const big = (bg, fg, eyebrow, number, line, sub) => page({ bg: { type: 'solid', color: bg, darken: 0 }, items: [
    B({ text: eyebrow.toUpperCase(), size: 38, weight: 700, letter: 8, x: 0.5, y: 0.26, color: fg, opacity: 0.8 }),
    H({ text: number, size: 300, x: 0.5, y: 0.44, color: fg }),
    H({ text: line, size: 84, x: 0.5, y: 0.6, w: 0.82, color: fg }),
    ...(sub ? [B({ text: sub, size: 44, x: 0.5, y: 0.72, w: 0.8, color: fg, opacity: 0.85 })] : []),
  ] });

  // Cover
  pages.push(page({ bg: { type: 'mesh', seed: 2026, darken: 0.3 }, items: [
    ...(logo ? [{ id: uid(), type: 'image', rel: logo, x: 0.5, y: 0.2, w: 0.26, opacity: 1 }] : []),
    B({ text: 'OUR YEAR', size: 44, weight: 700, letter: 12, x: 0.5, y: 0.38, opacity: 0.9 }),
    H({ text: String(stats.year), size: 280, x: 0.5, y: 0.5 }),
    B({ text: church ? `at ${church}` : 'in review', size: 56, x: 0.5, y: 0.63, w: 0.8, opacity: 0.9 }),
    B({ text: 'Tap to see what God did through us', size: 36, x: 0.5, y: 0.88, opacity: 0.75 }),
  ], notes: 'Cover' }));

  if (stats.sermons) pages.push(big(dark, onDark, 'Every Sunday', n(stats.sermons), stats.sermons === 1 ? 'message preached' : 'messages preached', stats.minutes >= 60 ? `About ${n(Math.round(stats.minutes / 60))} hours of teaching` : null));
  if (stats.topBooks?.length) {
    pages.push(page({ bg: { type: 'solid', color: light, darken: 0 }, items: [
      B({ text: 'WE SPENT THE MOST TIME IN', size: 38, weight: 700, letter: 6, x: 0.5, y: 0.28, color: dark, opacity: 0.8 }),
      H({ text: stats.topBooks[0].book, size: 150, x: 0.5, y: 0.42, w: 0.86, color: primary }),
      ...(stats.topBooks.length > 1 ? [B({ text: `Then ${stats.topBooks.slice(1).map((b) => b.book).join(' and ')}`, size: 52, x: 0.5, y: 0.56, w: 0.8, color: dark })] : []),
      shape({ x: 0.5, y: 0.68, w: 0.12, h: 0.004, fill: accent }),
      B({ text: '“Your word is a lamp to my feet.” Psalm 119:105', size: 40, x: 0.5, y: 0.76, w: 0.78, color: dark, opacity: 0.8 }),
    ] }));
  }
  if (stats.topTopics?.length) {
    pages.push(page({ bg: { type: 'solid', color: primary, darken: 0 }, items: [
      B({ text: 'WE KEPT COMING BACK TO', size: 38, weight: 700, letter: 6, x: 0.5, y: 0.26, color: onPrimary, opacity: 0.85 }),
      ...stats.topTopics.map((t, i) => H({ text: t.label, size: 96, x: 0.5, y: 0.42 + i * 0.12, w: 0.86, color: onPrimary })),
    ] }));
  }
  const made = [[stats.clips, 'video clips'], [stats.designs, 'designs'], [stats.writing, 'pieces of writing'], [stats.posts, 'posts shared']].filter(([v]) => v);
  if (made.length) {
    pages.push(page({ bg: { type: 'mesh', seed: 77, darken: 0.35 }, items: [
      B({ text: 'TO HELP MORE PEOPLE HEAR IT, WE MADE', size: 36, weight: 700, letter: 4, x: 0.5, y: 0.22, w: 0.84, opacity: 0.9 }),
      ...made.map(([v, l], i) => H({ text: `${n(v)} ${l}`, size: 96, x: 0.5, y: 0.38 + i * 0.13, w: 0.86 })),
    ] }));
  }
  if (stats.busiestMonth || stats.bestStreak > 1) {
    pages.push(page({ bg: { type: 'solid', color: dark, darken: 0 }, items: [
      ...(stats.busiestMonth ? [B({ text: 'OUR BUSIEST MONTH', size: 38, weight: 700, letter: 6, x: 0.5, y: 0.3, color: onDark, opacity: 0.8 }), H({ text: stats.busiestMonth, size: 150, x: 0.5, y: 0.41, color: accent })] : []),
      ...(stats.bestStreak > 1 ? [B({ text: 'LONGEST STREAK', size: 38, weight: 700, letter: 6, x: 0.5, y: 0.6, color: onDark, opacity: 0.8 }), H({ text: `${stats.bestStreak} weeks in a row`, size: 110, x: 0.5, y: 0.7, w: 0.86, color: onDark })] : []),
    ] }));
  }
  pages.push(page({ bg: { type: 'mesh', seed: 314, darken: 0.3 }, items: [
    H({ text: 'Thank you for a faithful year.', size: 110, x: 0.5, y: 0.4, w: 0.84 }),
    B({ text: `Here’s to ${stats.year + 1}.`, size: 60, x: 0.5, y: 0.56 }),
    B({ text: '“Let us not grow weary of doing good.” Galatians 6:9', size: 40, x: 0.5, y: 0.82, w: 0.8, opacity: 0.85 }),
  ] }));

  return { id: uid(), name: `${stats.year} year in review`, kind: 'story', size: { w: 1080, h: 1920 }, palette: ctx.c, tint: { color: '#FF9A62', amount: 0 }, pages };
}
