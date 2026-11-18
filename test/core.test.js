// Pure logic: caption parsing, sermon detection, export sizing, cuts, cue framing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { json3Words } from '../src/daemon/youtube.js';
import { detectSermon } from '../src/daemon/sermon.js';
import { exportSettings, keepSegments } from '../src/daemon/render.js';
import { cueX, sampleTrack, easeInOut } from '../src/ui/framing.js';

test('json3 captions become timed words; [Music] tags are dropped', () => {
  const words = json3Words({ events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: '[Music]' }] },
    { tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: 'turn' }, { utf8: ' with', tOffsetMs: 300 }, { utf8: ' me', tOffsetMs: 600 }] },
  ] });
  assert.deepEqual(words.map((w) => w.w), ['turn', 'with', 'me']);
  assert.equal(words[1].start, 5.3);
});

test('sermon detection finds the long talk section after songs', () => {
  const words = [];
  const song = 'holy holy holy you are holy we lift your name on high'.split(' ');
  for (let t = 0; t < 600; t += 1.2) words.push({ w: song[Math.round(t / 1.2) % song.length], start: t, end: t + 0.6 });
  const vocab = 'grace is something you receive and God sees you today so what would change this week if believed that love hope faith story father son mercy truth people church walk light'.split(' ');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 600, i = 0; t < 2400; t += 0.4, i++) words.push({ w: vocab[Math.floor(rnd() * vocab.length)] + (i % 9 === 8 ? '.' : ''), start: t, end: t + 0.35 });
  const s = detectSermon(words, 2500);
  assert.ok(s.start >= 560 && s.start <= 640, `start ${s.start}`);
  assert.ok(s.end >= 2350, `end ${s.end}`);
});

test('export presets map to sizes and sensible bitrates', () => {
  assert.deepEqual([exportSettings({}).width, exportSettings({}).height], [1080, 1920]);
  const sq = exportSettings({ preset: 'square', resolution: '720' });
  assert.deepEqual([sq.width, sq.height], [720, 720]);
  const wide = exportSettings({ preset: 'landscape', codec: 'hevc' });
  assert.equal(wide.codec, 'hevc');
  assert.ok(wide.mbps < exportSettings({ preset: 'landscape' }).mbps);
});

test('cut words and tightened pauses become keep segments', () => {
  const words = [{ w: 'a', start: 10, end: 10.5 }, { w: 'um', start: 10.6, end: 11 }, { w: 'b', start: 13, end: 13.5 }];
  const keep = keepSegments(words, { start: 10, end: 14, cutWords: [1], tightenPauses: true });
  const total = keep.reduce((a, [s, e]) => a + e - s, 0);
  assert.ok(total < 2.5, `kept ${total}s`);
  assert.equal(keepSegments(words, { start: 10, end: 14, cutWords: [] }), null);
});

test('cue framing cuts and glides like the renderer', () => {
  const cues = [{ t: 0, x: 0.3 }, { t: 2, x: 0.7, move: 'glide', dur: 2 }, { t: 6, x: 0.4, move: 'cut' }];
  assert.equal(cueX(cues, 1), 0.3);
  assert.ok(Math.abs(cueX(cues, 3) - 0.5) < 1e-9); // halfway through an eased glide
  assert.equal(cueX(cues, 5), 0.7);
  assert.equal(cueX(cues, 6.1), 0.4);
  assert.equal(easeInOut(0), 0);
  assert.equal(sampleTrack([0, 1], 1, 0.25), 0.25);
});
