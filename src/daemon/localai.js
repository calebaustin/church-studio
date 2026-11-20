// The two AI helpers that run on this Mac with no internet and no account:
//
// - Apple Intelligence: the Foundation Models built into macOS 26+, reached through our small Swift
//   bridge (native/apple-ai, built into bin/cs-apple-ai). Nothing to download.
// - CS Helper: Meta's Llama 3.2 3B, downloaded once into Church Studio's own folder and run with
//   llama.cpp's llama-server (MIT). It starts when needed and stops after a few quiet minutes, so the
//   app stays cool while idle.
//
// Both only ever see what Church Studio hands them (see helper.js); neither reaches the internet.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BASE, RESOURCES, ROOT, tool } from './tools.js';

// ------------------------------------------------------------------ Apple Intelligence
let apple = { checked: 0, available: false, reason: 'Not checked yet.' };

function bridge(req, { onLine, signal } = {}) {
  return new Promise((resolve, reject) => {
    const bin = tool('cs-apple-ai');
    if (!existsSync(bin)) return reject(new Error('Apple Intelligence needs macOS 26 on a Mac with Apple silicon.'));
    const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'], signal });
    let buf = ''; const lines = [];
    p.stdout.on('data', (c) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        try { const o = JSON.parse(line); lines.push(o); onLine?.(o); } catch { /* ignore partial */ }
      }
    });
    p.on('error', (e) => reject(e.name === 'AbortError' ? new Error('Stopped.') : e));
    p.on('close', () => {
      const err = lines.find((o) => o.error);
      if (err) return reject(new Error(err.error));
      resolve(lines);
    });
    p.stdin.end(JSON.stringify(req));
  });
}

/** Is Apple Intelligence on and ready on this Mac? Cached for ten minutes. */
export async function appleStatus(force = false) {
  if (!force && Date.now() - apple.checked < 10 * 60_000) return apple;
  try {
    const [r] = await bridge({ op: 'status' });
    apple = { checked: Date.now(), available: Boolean(r?.available), reason: r?.reason || null };
  } catch (e) {
    apple = { checked: Date.now(), available: false, reason: e.message };
  }
  return apple;
}
export const appleKnown = () => apple;

/** Ask Apple Intelligence. With onDelta, text streams in as it's written. Returns the full text. */
export async function appleAsk({ system, prompt, onDelta, temperature = 0.5, maxTokens, signal }) {
  let text = '';
  await bridge({ op: 'ask', system, prompt, temperature, stream: true, maxTokens }, {
    signal,
    onLine: (o) => {
      if (o.delta) { text += o.delta; onDelta?.(o.delta); }
      if (o.replace != null) { text = o.replace; onDelta?.(null, text); }
    },
  });
  return text.trim();
}

// ------------------------------------------------------------------ CS Helper (Llama 3.2 3B)
export const CS_MODEL = {
  name: 'Llama 3.2 3B Instruct',
  file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  bytes: 2_019_377_696,
  license: 'https://www.llama.com/llama3_2/license/',
  policy: 'https://www.llama.com/llama3_2/use-policy/',
};
// Shared by every workspace, so a second brand doesn't download it again.
// llama-server and its libraries sit together in bin/llama (packaged) or build/bin/llama (dev).
function llamaBin() {
  const c = [RESOURCES && path.join(RESOURCES, 'bin', 'llama', 'llama-server'), path.join(ROOT, 'build', 'bin', 'llama', 'llama-server'), tool('llama-server')].filter(Boolean);
  return c.find((x) => existsSync(x)) || c[c.length - 1];
}

export const MODELS_DIR = path.join(BASE, 'models');
const modelPath = () => path.join(MODELS_DIR, CS_MODEL.file);

export async function csHelperStatus() {
  const engine = llamaBin();
  const hasEngine = existsSync(engine);
  let size = 0;
  try { size = (await stat(modelPath())).size; } catch { /* not downloaded */ }
  const model = size > CS_MODEL.bytes * 0.95;
  let partial = 0;
  try { partial = (await stat(`${modelPath()}.part`)).size; } catch { /* none */ }
  return { model, partial: model ? 0 : partial, size, engine: hasEngine, ready: model && hasEngine, bytes: CS_MODEL.bytes, name: CS_MODEL.name, running: Boolean(server.proc), license: CS_MODEL.license, policy: CS_MODEL.policy };
}
export const csHelperReadySync = () => existsSync(modelPath()) && existsSync(llamaBin());

/** Download the model (a job): resumable into a .part file, renamed when complete. */
export async function downloadCsModel(ctx) {
  await mkdir(MODELS_DIR, { recursive: true });
  const part = `${modelPath()}.part`;
  let have = 0;
  try { have = (await stat(part)).size; } catch { /* fresh */ }
  const r = await fetch(CS_MODEL.url, { headers: { 'user-agent': 'Church-Studio', ...(have ? { range: `bytes=${have}-` } : {}) }, signal: ctx.signal });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}). Check your internet connection and try again.`);
  if (have && r.status !== 206) have = 0; // server ignored the resume: start over
  const total = CS_MODEL.bytes;
  let got = have;
  const body = Readable.fromWeb(r.body);
  body.on('data', (c) => { got += c.length; ctx.progress(Math.min(99, (got / total) * 100), `Downloading CS Helper… ${(got / 1e9).toFixed(2)} of ${(total / 1e9).toFixed(1)} GB`); });
  await pipeline(body, createWriteStream(part, { flags: have ? 'a' : 'w' }));
  const st = await stat(part);
  if (st.size < total * 0.95) throw new Error('The download stopped early. Press Download again to pick up where it left off.');
  await rename(part, modelPath());
  ctx.progress(100, 'CS Helper is ready');
  return { bytes: st.size };
}

export async function deleteCsModel() {
  await stopServer();
  await rm(modelPath(), { force: true });
  await rm(`${modelPath()}.part`, { force: true });
}

// llama-server runs only while it's being used.
const server = { proc: null, port: 0, starting: null, idle: null };
const IDLE_MS = 5 * 60_000;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function startServer() {
  if (server.proc) return server.port;
  if (server.starting) return server.starting;
  server.starting = (async () => {
    if (!existsSync(modelPath())) throw new Error('Download CS Helper first, in Settings › AI helper.');
    const bin = llamaBin();
    if (!existsSync(bin)) throw new Error('The CS Helper engine is missing from this copy of Church Studio. Update to the latest version.');
    const port = await freePort();
    const proc = spawn(bin, ['-m', modelPath(), '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '8192', '-ngl', '99', '--threads', '4', '--log-disable'], { stdio: 'ignore' });
    proc.on('exit', () => { if (server.proc === proc) { server.proc = null; server.port = 0; } });
    server.proc = proc; server.port = port;
    for (let i = 0; i < 120; i++) { // up to 60s to load the model the first time
      try { const h = await fetch(`http://127.0.0.1:${port}/health`); if (h.ok) return port; } catch { /* still loading */ }
      if (!server.proc) throw new Error('CS Helper could not start.');
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('CS Helper took too long to start.');
  })();
  try { return await server.starting; } finally { server.starting = null; }
}

export async function stopServer() {
  clearTimeout(server.idle);
  if (server.proc) { server.proc.kill(); server.proc = null; server.port = 0; }
}
process.on('exit', () => { try { server.proc?.kill(); } catch { /* gone */ } });

function touch() {
  clearTimeout(server.idle);
  server.idle = setTimeout(stopServer, IDLE_MS);
  server.idle.unref?.();
}

/**
 * Chat with CS Helper. messages: [{ role, content }]. With onDelta the answer streams. With schema the
 * answer is constrained to that JSON shape (llama.cpp grammar), and the parsed object is returned.
 */
export async function llamaChat({ system, messages, onDelta, schema, temperature = 0.5, maxTokens = 900, signal }) {
  const port = await startServer();
  touch();
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: system }, ...messages],
      temperature, max_tokens: maxTokens, stream: Boolean(onDelta) && !schema,
      ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`CS Helper ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (!onDelta || schema) {
    const text = (await r.json()).choices[0].message.content.trim();
    touch();
    return schema ? JSON.parse(text) : text;
  }
  let text = ''; let buf = '';
  for await (const chunk of r.body) {
    buf += Buffer.from(chunk).toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try { const d = JSON.parse(data).choices?.[0]?.delta?.content; if (d) { text += d; onDelta(d); } } catch { /* partial */ }
    }
  }
  touch();
  return text.trim();
}
