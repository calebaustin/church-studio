// OPTIONAL AI helper. Off by default (llmProvider = "none"). When on, it only re-ranks and
// re-titles candidates the offline heuristic already found, so a failure never blocks the
// pipeline: we fall back to the heuristic picks and show a warning.
import Anthropic from '@anthropic-ai/sdk';
import { fmtTime } from './text.js';

const SYSTEM = `You help a church media team pick short vertical clips (Reels, Shorts, TikTok) from a sermon.
A good clip: a viewer who has seen nothing else understands it in the first two seconds, it stands on its own
(no "as I said earlier"), it delivers a payoff (a truth, a story's point, an application), and it ends on a complete thought.
Stay faithful to what the preacher actually said; never invent quotes or theology. Titles are short and honest, not clickbait.`;

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
          score: { type: 'integer', description: '0-100; 90+ is rare' },
          title: { type: 'string', description: 'Max 70 characters' },
          summary: { type: 'string', description: '1-2 sentence post caption' },
          hook: { type: 'string', description: '3-7 word on-screen hook' },
          hashtags: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string', description: 'One sentence on why it works' },
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

const PROVIDERS = { anthropic: askAnthropic, openai: askOpenAI, gemini: askGemini, ollama: askOllama };
export const PROVIDER_NAMES = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama' };

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
  return { provider: cfg.llmProvider, name: PROVIDER_NAMES[cfg.llmProvider] || null, ready, degraded, active: ready && !degraded, reason: degraded ? status.reason : null, notice: status.notice };
}
/** Run an AI call; on a usage problem, note it and return the fallback instead of failing. */
export async function withFallback(cfg, fn, fallback) {
  if (!aiStatus(cfg).active) return { value: await fallback(), local: true };
  try { return { value: await fn(), local: false }; } catch (e) {
    if (!isUsageError(e)) throw e;
    markUsageProblem(cfg, e);
    return { value: await fallback(), local: true, notice: status.notice };
  }
}

export function providerReady(cfg) {
  const p = cfg.llmProvider;
  if (!p || p === 'none') return false;
  if (p === 'ollama') return true;
  return Boolean(cfg[`${p}ApiKey`]);
}

/** Re-rank heuristic candidates. `cands` carry `.text`; returns the clips with AI fields merged in. */
export async function rerank(cfg, cands, { title, count }) {
  const ask = PROVIDERS[cfg.llmProvider];
  if (!ask) throw new Error(`Unknown AI provider "${cfg.llmProvider}"`);
  const out = await ask(cfg, prompt(cands, title, count));
  const seen = new Set();
  return (out.clips || [])
    .filter((p) => Number.isInteger(p.index) && cands[p.index] && !seen.has(p.index) && seen.add(p.index))
    .slice(0, count)
    .map((p) => {
      const { text, ...c } = cands[p.index];
      return {
        ...c,
        score: Math.max(0, Math.min(100, Math.round(p.score))),
        title: String(p.title).slice(0, 90),
        summary: p.summary, hook: p.hook,
        hashtags: (p.hashtags || []).map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 6),
        reasons: [p.reason, ...c.reasons].filter(Boolean),
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
export async function complete(cfg, system, user) {
  const p = cfg.llmProvider;
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
