// OPTIONAL AI helper. Off by default (llmProvider = "none"). When on, it only re-ranks and
// re-titles candidates the offline heuristic already found, so a failure never blocks the
// pipeline: we fall back to the heuristic picks and show a warning.
import Anthropic from '@anthropic-ai/sdk';
import { fmtTime } from './text.js';
import { appleAsk, appleKnown, csHelperReadySync, llamaChat } from './localai.js';

/** The two helpers that run on this Mac: no key, no internet. */
export const LOCAL_PROVIDERS = ['apple', 'cshelper'];
const tooLong = (e) => /exceededContextWindowSize|context window|context size|too long/i.test(String(e?.message || e));

/** Pull the first JSON object out of a reply (small local models sometimes add a sentence around it). */
function looseJson(text) {
  const t = String(text).replace(/```(?:json)?/g, '');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The AI helper did not return a usable answer.');
  return JSON.parse(t.slice(a, b + 1));
}

const SYSTEM = `You help a church media team pick short vertical clips (Reels, Shorts, TikTok) from a sermon, class or talk.
Judge each candidate like a video editor, on four things:
1. Hook: the first line pulls a viewer in with no other context.
2. Stands alone: someone who saw nothing else can follow it (no "as I said earlier").
3. Payoff: it lands on a clear, memorable takeaway or closing line.
4. Feeling: a story with a point, a relatable or funny moment, or rhythm and contrast ("simple made sacred") make it worth sharing.
A personal story or illustration that lands its point, or a relatable moment, usually beats dense teaching.
Use the whole score range: 90+ is rare and exceptional, most good clips are 60 to 85, weak ones are under 50.
Stay faithful to what the speaker said; never invent quotes or theology.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clips'],
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'score', 'title', 'summary', 'hook', 'hashtags', 'reason'],
        properties: {
          index: { type: 'integer', description: 'Candidate index from the list' },
          score: { type: 'integer', description: '0-100. 90+ is rare. Most good clips 60-85.' },
          title: { type: 'string', description: 'A specific headline for the idea, under 60 characters, not a quote. Like: Thanksgiving: People You Like and People You Have To' },
          summary: { type: 'string', description: '1-2 sentence post caption' },
          hook: { type: 'string', description: '3-7 word on-screen hook' },
          hashtags: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string', description: 'Why this clip works, naming its own story, line or idea. One or two sentences. Never generic.' },
        },
      },
    },
  },
};

function prompt(cands, title, count) {
  const list = cands.map((c, i) => `[${i}] (${fmtTime(c.start)}–${fmtTime(c.end)}, ${Math.round(c.end - c.start)}s) ${c.text}`).join('\n\n');
  return `Sermon: ${title}\n\nCandidate clips:\n\n${list}\n\nReturn the best ${count} candidates, best first. Use each candidate's index. Hashtags without '#'.`;
}

async function askAnthropic(cfg, text) {
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  const res = await client.beta.messages.create({
    model: cfg.anthropicModel,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  const block = res.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Claude returned no text.');
  return JSON.parse(block.text);
}

async function askOpenAI(cfg, text) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.openaiApiKey}` },
    body: JSON.stringify({
      model: cfg.openaiModel,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
      response_format: { type: 'json_schema', json_schema: { name: 'clips', strict: true, schema: SCHEMA } },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return JSON.parse((await r.json()).choices[0].message.content);
}

async function askGemini(cfg, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.geminiModel)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return JSON.parse((await r.json()).candidates[0].content.parts[0].text);
}

async function askOllama(cfg, text) {
  const r = await fetch(`${cfg.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.ollamaModel, stream: false, format: SCHEMA,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
      options: { temperature: 0.2, num_ctx: 16384 },
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}. Is Ollama running and the model pulled?`);
  return JSON.parse((await r.json()).message.content);
}

async function askApple(cfg, text) {
  const shape = '{"clips":[{"index":0,"score":80,"title":"...","summary":"...","hook":"...","hashtags":["..."],"reason":"..."}]}';
  return looseJson(await appleAsk({ system: SYSTEM, prompt: `${text}\n\nAnswer with JSON only, exactly in this shape: ${shape}`, temperature: 0.2 }));
}
async function askLlama(cfg, text, signal) {
  return llamaChat({ system: SYSTEM, messages: [{ role: 'user', content: text }], schema: SCHEMA, temperature: 0.2, maxTokens: 1400, signal });
}

const PROVIDERS = { anthropic: askAnthropic, openai: askOpenAI, gemini: askGemini, ollama: askOllama, apple: askApple, cshelper: askLlama };
export const PROVIDER_NAMES = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama', apple: 'Apple Intelligence', cshelper: 'CS Helper' };

// ---- status: "Working with Claude" until a usage problem, then "Working locally" for an hour.
const status = { degradedUntil: 0, reason: null, notice: null };
/** Usage, quota, billing, key or rate-limit problems (not bugs in our request). */
export function isUsageError(e) {
  const code = e?.status ?? e?.statusCode;
  const msg = String(e?.message || e);
  return [401, 402, 403, 429, 529].includes(code) || /\b(401|402|403|429|529)\b|quota|rate.?limit|usage|credit|billing|insufficient|exceeded|overloaded|invalid.?api.?key|authentication|not running/i.test(msg);
}
export function markUsageProblem(cfg, e) {
  const name = PROVIDER_NAMES[cfg.llmProvider] || 'The AI helper';
  status.degradedUntil = Date.now() + 60 * 60_000;
  status.reason = String(e?.message || e).slice(0, 200);
  status.notice = { id: Date.now(), text: `${name} hit a usage limit or key problem, so Church Studio is working locally for now. Everything still works.` };
}
export function resetAiStatus() { status.degradedUntil = 0; status.reason = null; }
export function aiStatus(cfg) {
  const ready = providerReady(cfg);
  const degraded = ready && Date.now() < status.degradedUntil;
  return { provider: cfg.llmProvider, name: PROVIDER_NAMES[cfg.llmProvider] || null, ready, degraded, active: ready && !degraded, reason: degraded ? status.reason : null, notice: status.notice, appleAvailable: appleKnown().available };
}
/** Run an AI call; on a usage problem, note it and return the fallback instead of failing. */
export async function withFallback(cfg, fn, fallback) {
  if (!aiStatus(cfg).active) return { value: await fallback(), local: true };
  try { return { value: await fn(), local: false }; } catch (e) {
    // Too much for a small on-device model: do this one locally, without marking the helper as down.
    if (tooLong(e)) return { value: await fallback(), local: true };
    if (!isUsageError(e)) throw e;
    markUsageProblem(cfg, e);
    return { value: await fallback(), local: true, notice: status.notice };
  }
}

export function providerReady(cfg) {
  const p = cfg.llmProvider;
  if (!p || p === 'none') return false;
  if (p === 'ollama') return true;
  if (p === 'apple') return appleKnown().available;
  if (p === 'cshelper') return csHelperReadySync();
  return Boolean(cfg[`${p}ApiKey`]);
}

const GENERIC = /a truth, a story|delivers a payoff \(|stays faithful|not clickbait|short and honest|strong candidate|stands on its own and|complete thought\.?$/i;
/** Re-rank heuristic candidates. `cands` carry `.text`; returns the clips with AI fields merged in. */
export async function rerank(cfg, cands, { title, count, signal }) {
  const ask = PROVIDERS[cfg.llmProvider];
  if (!ask) throw new Error(`Unknown AI provider "${cfg.llmProvider}"`);
  // On-device models have small memories: send the strongest candidates, trimmed. Indexes still match.
  const p = cfg.llmProvider;
  // A clip lives or dies on its first and last lines, so a trimmed candidate keeps both ends and drops the middle.
  const ends = (t, n) => { if (t.length <= n) return t; const head = Math.round(n * 0.55); return `${t.slice(0, head).replace(/\s+\S*$/, '')} … ${t.slice(-(n - head)).replace(/^\S*\s+/, '')}`; };
  const shown = p === 'apple' ? cands.slice(0, 10).map((c) => ({ ...c, text: ends(c.text, 420) }))
    : p === 'cshelper' ? cands.slice(0, 24).map((c) => ({ ...c, text: ends(c.text, 760) })) : cands;
  const out = await ask(cfg, prompt(shown, title, count), signal);
  const seen = new Set();
  // Small local models sometimes score 1-10 instead of 0-100: put those on the same scale.
  const raw = (out.clips || []).map((x) => Number(x.score) || 0);
  const scale = raw.length && Math.max(...raw) <= 10 ? 10 : 1;
  // A hook is a few words on screen. If the model wrote a whole sentence, keep the app's own short hook.
  const shortHook = (h, fallback) => { const w = String(h || '').trim().split(/\s+/).filter(Boolean); return w.length && w.length <= 8 ? String(h).trim() : fallback || w.slice(0, 7).join(' ').replace(/[,;:]$/, ''); };
  return (out.clips || [])
    .filter((p) => Number.isInteger(p.index) && cands[p.index] && !seen.has(p.index) && seen.add(p.index))
    .slice(0, count)
    .map((p) => {
      const { text, ...c } = cands[p.index];
      return {
        ...c,
        score: Math.max(0, Math.min(100, Math.round((Number(p.score) || 0) * scale))),
        title: String(p.title).slice(0, 90),
        summary: p.summary, hook: shortHook(p.hook, c.hook),
        hashtags: (p.hashtags || []).map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 6),
        // A reason that only repeats the instructions says nothing about this clip: keep the app's own instead.
        reasons: [GENERIC.test(String(p.reason || '')) ? null : String(p.reason || '').trim(), ...c.reasons].filter(Boolean),
        source: cfg.llmProvider,
      };
    });
}

/** Settings "Test" button: a tiny request that proves the key/server works. */
export async function testProvider(cfg) {
  const cands = [{ start: 0, end: 30, text: 'Grace is not something you earn. It is something you receive.', reasons: [] }];
  const r = await rerank(cfg, cands, { title: 'Test', count: 1 });
  return { ok: r.length > 0, sample: r[0]?.title };
}

/** Plain text completion for writing help. Same providers and keys as clip ranking. */
/**
 * A JSON answer that matches a schema. CS Helper is held to the schema as it writes; other helpers are asked
 * for JSON and the first object in the reply is used.
 */
export async function completeJSON(cfg, system, user, schema, { signal, maxTokens = 900 } = {}) {
  if (cfg.llmProvider === 'cshelper') {
    // A cut-off or garbled answer gets one more try, a little cooler.
    try { return await llamaChat({ system, messages: [{ role: 'user', content: user }], schema, maxTokens, temperature: 0.3, signal }); } catch (e) {
      if (signal?.aborted || !(e instanceof SyntaxError)) throw e;
      return llamaChat({ system, messages: [{ role: 'user', content: user }], schema, maxTokens, temperature: 0.15, signal });
    }
  }
  const keys = Object.keys(schema.properties || {}).join(', ');
  const text = await complete(cfg, system, `${user}\n\nAnswer with only a JSON object with these keys: ${keys}.`);
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The helper did not answer in the expected form.');
  return JSON.parse(m[0]);
}

export async function complete(cfg, system, user) {
  const p = cfg.llmProvider;
  if (p === 'apple') return appleAsk({ system, prompt: user, temperature: 0.4 });
  if (p === 'cshelper') return llamaChat({ system, messages: [{ role: 'user', content: user }], maxTokens: 1800, temperature: 0.4 });
  if (p === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
    const res = await client.beta.messages.create({
      model: cfg.anthropicModel, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium' }, system, messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  if (p === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.openaiApiKey}` },
      body: JSON.stringify({ model: cfg.openaiModel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices[0].message.content.trim();
  }
  if (p === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.geminiModel)}:generateContent`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.geminiApiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).candidates[0].content.parts.map((x) => x.text).join('').trim();
  }
  if (p === 'ollama') {
    const r = await fetch(`${cfg.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.ollamaModel, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], options: { num_ctx: 16384 } }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}. Is Ollama running?`);
    return (await r.json()).message.content.trim();
  }
  throw new Error('Pick an AI helper in Settings first.');
}

/**
 * Describe a picture in one or two sentences for alt text. image: { data (base64), mediaType }.
 * Works with Claude, OpenAI, Gemini, and Ollama models that can see pictures.
 */
export async function describeImage(cfg, image, prompt) {
  const p = cfg.llmProvider;
  if (LOCAL_PROVIDERS.includes(p)) throw new Error(`${PROVIDER_NAMES[p]} can't look at pictures yet. Write the description yourself, or use an External AI for this.`);
  const ask = prompt || 'Write alt text for this picture from a church: one or two plain sentences that say what is shown, for someone who can’t see it. No "image of" or "picture of". Then, on a new line starting with "Tags:", give up to six short comma-separated tags.';
  if (p === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
    const res = await client.messages.create({
      model: cfg.anthropicModel, max_tokens: 1000,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text: ask }] }],
    });
    if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  if (p === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.openaiApiKey}` },
      body: JSON.stringify({ model: cfg.openaiModel, messages: [{ role: 'user', content: [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } }] }] }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices[0].message.content.trim();
  }
  if (p === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.geminiModel)}:generateContent`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.geminiApiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: image.mediaType, data: image.data } }, { text: ask }] }] }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).candidates[0].content.parts.map((x) => x.text).join('').trim();
  }
  if (p === 'ollama') {
    const r = await fetch(`${cfg.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.ollamaModel, stream: false, messages: [{ role: 'user', content: ask, images: [image.data] }] }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}. Pick a model that can see pictures, like llava or qwen2.5vl.`);
    return (await r.json()).message.content.trim();
  }
  throw new Error('Turn on an AI helper in Settings to suggest alt text.');
}

/**
 * A conversation for the helper chat. messages: [{ role: 'user'|'assistant', content }].
 * onDelta(text) gets the answer as it's written (local helpers and Claude stream; others arrive at once).
 */
export async function chat(cfg, { system, messages, onDelta, signal }) {
  const p = cfg.llmProvider;
  if (p === 'apple') {
    // Apple's on-device model keeps its own short memory per session; hand it the recent turns as text.
    const history = messages.slice(0, -1).slice(-6).map((m) => `${m.role === 'user' ? 'They asked' : 'You answered'}: ${m.content}`).join('\n\n');
    const last = messages[messages.length - 1].content;
    return appleAsk({ system, prompt: history ? `Earlier in this chat:\n${history}\n\nNow they ask: ${last}` : last, onDelta, signal, temperature: 0.6 });
  }
  if (p === 'cshelper') return llamaChat({ system, messages: messages.slice(-10), onDelta, signal, temperature: 0.6, maxTokens: 1000 });
  if (p === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
    const stream = client.messages.stream({ model: cfg.anthropicModel, max_tokens: 4000, system, messages: messages.slice(-12) }, { signal });
    stream.on('text', (t) => onDelta?.(t));
    const res = await stream.finalMessage();
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }
  // OpenAI, Gemini, Ollama: one answer, sent whole.
  const flat = messages.slice(-10).map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n\n');
  const text = await complete(cfg, system, flat);
  onDelta?.(text);
  return text;
}
