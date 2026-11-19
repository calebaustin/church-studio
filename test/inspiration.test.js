// Inspiration: reading blog feeds and working out church season dates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/daemon/blog.js';
import { upcomingSeasons } from '../src/daemon/inspiration.js';

test('reads RSS items, strips HTML and the WordPress footer', () => {
  const xml = `<rss><channel><item><title>Rooted &amp; Growing</title><link>https://x.org/rooted</link>
    <pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate><category><![CDATA[Sermons]]></category>
    <content:encoded><![CDATA[<p>Grace changes <b>everything</b>.</p><p>The post Rooted appeared first on Grace Church.</p>]]></content:encoded></item></channel></rss>`;
  const [p] = parseFeed(xml);
  assert.equal(p.title, 'Rooted & Growing');
  assert.equal(p.link, 'https://x.org/rooted');
  assert.equal(p.date.slice(0, 10), '2026-11-15');
  assert.deepEqual(p.categories, ['Sermons']);
  assert.equal(p.text, 'Grace changes everything .');
});

test('reads Atom entries', () => {
  const xml = `<feed><entry><title>Hope</title><link href="https://x.org/hope"/><updated>2026-10-01T00:00:00Z</updated><summary>Hope is coming.</summary></entry></feed>`;
  const [p] = parseFeed(xml);
  assert.equal(p.link, 'https://x.org/hope');
  assert.equal(p.summary, 'Hope is coming.');
});

test('church seasons land on the right dates', () => {
  const s = upcomingSeasons(new Date(2026, 10, 19), 400);
  const on = (id, y) => s.find((x) => x.id === id && new Date(x.date).getFullYear() === y);
  const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
  assert.equal(ymd(on('advent', 2026).date), '2026-11-29');
  assert.equal(ymd(on('easter', 2027).date), '2027-3-28');
  assert.equal(ymd(on('ash', 2027).date), '2027-2-10');
  assert.equal(ymd(on('pentecost', 2027).date), '2027-5-16');
  assert.equal(ymd(on('thanks', 2026).date), '2026-11-26');
});
