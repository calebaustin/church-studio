// Social hub engine with a mock provider: no network, temp data dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.SC_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'sc-social-'));
import { execFileSync } from 'node:child_process';
// A 12 s, ~18 MB vertical test clip (bigger than Discord's limit, so fitting is exercised).
const VIDEO = process.env.SC_TEST_VIDEO || path.join(process.env.SC_DATA_DIR, 'clip.mp4');
if (!process.env.SC_TEST_VIDEO) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=f=440',
    '-t', '12', '-c:v', 'libx264', '-b:v', '12M', '-minrate', '12M', '-bufsize', '12M', '-c:a', 'aac', '-shortest', VIDEO],
  { env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` } });
}
const { PROVIDERS } = await import('../src/daemon/social/providers.js');
const hub = await import('../src/daemon/social/hub.js');
const store = await import('../src/daemon/social/store.js');
const { captionFor, platform } = await import('../src/daemon/social/platforms.js');

const calls = [];
let failNext = false;
PROVIDERS.discord = {
  verify: async () => ({ name: '#clips', handle: 'clips' }),
  publish: async ({ file, caption }) => {
    calls.push({ bytes: statSync(file).size, caption });
    if (failNext) { failNext = false; throw new Error('mock outage'); }
    return { url: 'https://discord.test/1', remoteId: '1' };
  },
};
const waitFor = async (fn, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('timeout');
};

test('caption: hashtags appended and trimmed to platform limit', () => {
  const p = platform('x');
  const c = captionFor({ caption: 'a '.repeat(300), hashtags: ['faith', '#grace'] }, { caption: null }, p);
  assert.ok(c.length <= 280);
  assert.equal(captionFor({ caption: 'Hi', hashtags: ['faith', 'grace'] }, { caption: null }, p), 'Hi\n\n#faith #grace');
  assert.equal(captionFor({ caption: 'Hi', hashtags: ['x'] }, { caption: 'Custom' }, p), 'Custom');
});

test('credentials are encrypted at rest', async () => {
  const a = await hub.connectAccount({ platform: 'discord', credentials: { webhook: 'secret-hook-value' } });
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(path.join(process.env.SC_DATA_DIR, 'social', 'accounts.json'), 'utf8');
  assert.ok(!raw.includes('secret-hook-value'));
  assert.equal((await store.getAccount(a.id, { withCredentials: true })).credentials.webhook, 'secret-hook-value');
});

test('publish now: big clip is fitted under Discord limit; manual dest becomes ready', { skip: !VIDEO }, async () => {
  const [disc] = await store.listAccounts();
  const tiktok = await hub.connectAccount({ platform: 'tiktok' });
  const post = await hub.createPost({ mode: 'now', title: 'T', caption: 'Grace', hashtags: ['faith'], media: { file: VIDEO }, accountIds: [disc.id, tiktok.id] });
  const done = await waitFor(async () => { const p = await store.getPost(post.id); return p.status !== 'publishing' && p; });
  assert.equal(done.status, 'needs-you');
  assert.ok(calls[0].bytes < platform('discord').maxBytes, `fitted to ${calls[0].bytes}`);
  assert.ok(statSync(VIDEO).size > platform('discord').maxBytes);
  const after = await hub.markManualDone(post.id, tiktok.id, 'https://tiktok.test/1');
  assert.equal(after.status, 'published');
});

test('scheduled post goes out on its own; failures can be retried', { skip: !VIDEO }, async () => {
  const [disc] = (await store.listAccounts()).filter((a) => a.platform === 'discord');
  failNext = true;
  const post = await hub.createPost({ mode: 'schedule', scheduledAt: new Date(Date.now() + 1500).toISOString(), caption: 'Later', media: { file: VIDEO }, accountIds: [disc.id] });
  assert.equal(post.status, 'scheduled');
  await hub.startScheduler();
  const failed = await waitFor(async () => { const p = await store.getPost(post.id); return p.status === 'failed' && p; }, 40000);
  assert.match(failed.destinations[0].error, /mock outage/);
  await hub.retryPost(post.id);
  const ok = await waitFor(async () => { const p = await store.getPost(post.id); return p.status === 'published' && p; });
  assert.equal(ok.destinations[0].url, 'https://discord.test/1');
});
