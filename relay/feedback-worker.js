// Feedback relay for Church Studio (a Cloudflare Worker).
// The app posts { kind, stars, text, name, version } here; the worker files it as a GitHub issue,
// so people can leave feedback without a GitHub account. Deploy once, then put its URL in
// package.json as "feedbackUrl".
//
// Setup:
//   1. npm create cloudflare@latest feedback-relay (choose "Hello World" Worker), replace its code with this file.
//   2. npx wrangler secret put GITHUB_TOKEN   (a fine-grained token with Issues: read and write on the repo)
//   3. Set REPO below, then: npx wrangler deploy
const REPO = 'calebaustin/church-studio';
const LIMIT = 5; // per IP per hour

const seen = new Map();
export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('Church Studio feedback relay', { status: 200 });
    const ip = req.headers.get('cf-connecting-ip') || 'x';
    const hour = Math.floor(Date.now() / 3600000);
    const k = `${ip}:${hour}`;
    seen.set(k, (seen.get(k) || 0) + 1);
    if (seen.get(k) > LIMIT) return new Response('Too many', { status: 429 });
    let b;
    try { b = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
    const text = String(b.text || '').slice(0, 4000);
    const stars = Math.max(0, Math.min(5, Number(b.stars) || 0));
    if (!text.trim() && !stars) return new Response('Empty', { status: 400 });
    const kind = b.kind === 'connection' ? 'connection' : 'feedback';
    const title = kind === 'connection' ? `Connection request: ${text.split('\n')[0].slice(0, 60)}` : `${stars ? `${'★'.repeat(stars)} ` : ''}Feedback`;
    const body = `${stars ? `Rating: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}\n\n` : ''}${text}\n\n---\nSent from Church Studio ${String(b.version || '').slice(0, 20)}${b.name ? ` · ${String(b.name).slice(0, 80)}` : ''}`;
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'church-studio-relay' },
      body: JSON.stringify({ title, body, labels: [kind] }),
    });
    return new Response(r.ok ? 'ok' : 'GitHub error', { status: r.ok ? 200 : 502 });
  },
};
