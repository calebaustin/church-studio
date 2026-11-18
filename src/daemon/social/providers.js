// Direct video publishing from this Mac. Each provider:
//   verify(creds)                       -> { name, handle?, url? }   (no test post is made)
//   publish({ creds, file, caption, title, post, log }) -> { url, remoteId, credentials? }
// `credentials` is returned when tokens were refreshed and must be re-saved.
// API flows follow each platform's public docs; Postiz (AGPL) and LightPost (MIT) were used only as
// references for which endpoints exist — no code was copied from Postiz.
import { openAsBlob, statSync } from 'node:fs';
import path from 'node:path';

const GRAPH = 'v25.0';
const UA = 'SermonClips/0.1 (local desktop app)';

class ProviderError extends Error {}

async function json(res, platform) {
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok || data.ok === false || data.error) {
    const msg = data.error?.message || data.error_description || data.description || data.message
      || (typeof data.error === 'string' ? data.error : '') || data.raw || res.statusText;
    const err = new ProviderError(`${platform}: ${msg} (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const req = (url, opts = {}) => fetch(url, { ...opts, headers: { 'user-agent': UA, ...(opts.headers || {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function videoBlob(file) {
  return openAsBlob(file, { type: 'video/mp4' });
}

// ------------------------------------------------------------------ Telegram
const telegram = {
  async verify({ botToken, chatId }) {
    if (!/^\d+:[\w-]{20,}$/.test(botToken || '')) throw new ProviderError('That bot token doesn’t look right (it looks like 123456:ABC…).');
    const base = `https://api.telegram.org/bot${botToken}`;
    const me = await json(await req(`${base}/getMe`), 'Telegram');
    const chat = await json(await req(`${base}/getChat?chat_id=${encodeURIComponent(chatId)}`), 'Telegram');
    const member = await json(await req(`${base}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${me.result.id}`), 'Telegram');
    if (!['administrator', 'creator'].includes(member.result.status) || member.result.can_post_messages === false) {
      throw new ProviderError(`Telegram: @${me.result.username} needs to be an admin of “${chat.result.title}” with “Post messages”.`);
    }
    return { name: chat.result.title, handle: chat.result.username ? `@${chat.result.username}` : String(chat.result.id), url: chat.result.username ? `https://t.me/${chat.result.username}` : null };
  },
  async publish({ creds, file, caption, post }) {
    const form = new FormData();
    form.set('chat_id', creds.chatId);
    form.set('caption', caption);
    form.set('supports_streaming', 'true');
    if (post.media?.width) { form.set('width', String(post.media.width)); form.set('height', String(post.media.height)); }
    form.set('video', await videoBlob(file), path.basename(file));
    const r = await json(await req(`https://api.telegram.org/bot${creds.botToken}/sendVideo`, { method: 'POST', body: form }), 'Telegram');
    const m = r.result;
    const handle = m.chat.username;
    const url = handle ? `https://t.me/${handle}/${m.message_id}` : `https://t.me/c/${String(m.chat.id).replace(/^-100/, '')}/${m.message_id}`;
    return { url, remoteId: String(m.message_id) };
  },
};

// ------------------------------------------------------------------ Discord (webhook)
function discordUrl(webhook) {
  const m = String(webhook || '').trim().match(/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([\w-]+)\/?$/);
  if (!m) throw new ProviderError('That isn’t a Discord webhook URL (https://discord.com/api/webhooks/…).');
  return `https://discord.com/api/v10/webhooks/${m[1]}/${m[2]}`;
}
const discord = {
  async verify({ webhook }) {
    const w = await json(await req(discordUrl(webhook)), 'Discord');
    return { name: `#${w.channel_id} · ${w.name}`, handle: w.name, url: w.guild_id ? `https://discord.com/channels/${w.guild_id}/${w.channel_id}` : null, extra: { guildId: w.guild_id, channelId: w.channel_id } };
  },
  async publish({ creds, file, caption }) {
    const form = new FormData();
    form.set('payload_json', JSON.stringify({ content: caption, allowed_mentions: { parse: [] } }));
    form.set('files[0]', await videoBlob(file), path.basename(file).replace(/[^\w.-]+/g, '_'));
    const r = await json(await req(`${discordUrl(creds.webhook)}?wait=true`, { method: 'POST', body: form }), 'Discord');
    const v = await discord.verify(creds).catch(() => ({}));
    return { url: v.extra?.guildId ? `https://discord.com/channels/${v.extra.guildId}/${r.channel_id}/${r.id}` : null, remoteId: r.id };
  },
};

// ------------------------------------------------------------------ Mastodon
function instance(u) {
  const url = new URL(/^https?:\/\//.test(u || '') ? u : `https://${u}`);
  if (url.protocol !== 'https:') throw new ProviderError('Mastodon server must use https.');
  return url.origin;
}
const mastodon = {
  async verify({ instance: i, token }) {
    const me = await json(await req(`${instance(i)}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${token}` } }), 'Mastodon');
    return { name: me.display_name || me.username, handle: `@${me.acct}@${new URL(instance(i)).host}`, url: me.url };
  },
  async publish({ creds, file, caption, log }) {
    const base = instance(creds.instance);
    const auth = { authorization: `Bearer ${creds.token}` };
    const form = new FormData();
    form.set('file', await videoBlob(file), path.basename(file));
    let media = await json(await req(`${base}/api/v2/media`, { method: 'POST', headers: auth, body: form }), 'Mastodon');
    for (let i = 0; !media.url && i < 90; i++) { // video is processed asynchronously
      log?.('Mastodon is processing the video…');
      await sleep(2000);
      media = await json(await req(`${base}/api/v1/media/${media.id}`, { headers: auth }), 'Mastodon');
    }
    const status = await json(await req(`${base}/api/v1/statuses`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: caption, media_ids: [media.id], visibility: 'public' }),
    }), 'Mastodon');
    return { url: status.url, remoteId: status.id };
  },
};

// ------------------------------------------------------------------ YouTube (OAuth, resumable upload)
export async function googleToken(creds) {
  if (creds.accessToken && creds.expiresAt > Date.now() + 60_000) return { creds, token: creds.accessToken, refreshed: false };
  if (!creds.refreshToken) throw new ProviderError('YouTube isn’t connected yet. Press Connect.');
  const r = await json(await req('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: 'refresh_token' }),
  }), 'YouTube');
  const next = { ...creds, accessToken: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
  return { creds: next, token: r.access_token, refreshed: true };
}
const youtube = {
  async verify(creds) {
    const { token, creds: next, refreshed } = await googleToken(creds);
    const r = await json(await req('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${token}` } }), 'YouTube');
    const ch = r.items?.[0];
    if (!ch) throw new ProviderError('YouTube: this Google account has no channel.');
    return { name: ch.snippet.title, handle: ch.snippet.customUrl || ch.id, url: `https://www.youtube.com/channel/${ch.id}`, credentials: refreshed ? next : undefined };
  },
  async publish({ creds, file, caption, title, post }) {
    const { token, creds: next, refreshed } = await googleToken(creds);
    const size = statSync(file).size;
    const description = /#shorts\b/i.test(caption) ? caption : `${caption}\n\n#Shorts`.trim();
    const meta = {
      snippet: { title: (title || 'Sermon clip').slice(0, 100), description: description.slice(0, 5000), tags: (post.hashtags || []).slice(0, 15), categoryId: '29' },
      status: { privacyStatus: post.options?.youtubePrivacy || 'public', selfDeclaredMadeForKids: false },
    };
    const init = await req('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(size), 'x-upload-content-type': 'video/mp4' },
      body: JSON.stringify(meta),
    });
    if (!init.ok) await json(init, 'YouTube');
    const uploadUrl = init.headers.get('location');
    const done = await json(await req(uploadUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: await videoBlob(file) }), 'YouTube');
    return { url: `https://youtube.com/shorts/${done.id}`, remoteId: done.id, credentials: refreshed ? next : undefined };
  },
};

// ------------------------------------------------------------------ Facebook Page Reels
const facebook = {
  async verify({ pageId, pageToken }) {
    const p = await json(await req(`https://graph.facebook.com/${GRAPH}/${encodeURIComponent(pageId)}?fields=name,link&access_token=${encodeURIComponent(pageToken)}`), 'Facebook');
    return { name: p.name, handle: pageId, url: p.link };
  },
  async publish({ creds, file, caption, log }) {
    const { pageId, pageToken } = creds;
    const g = `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(pageId)}/video_reels`;
    const start = await json(await req(g, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ upload_phase: 'start', access_token: pageToken }) }), 'Facebook');
    const size = statSync(file).size;
    await json(await req(`https://rupload.facebook.com/video-upload/${GRAPH}/${start.video_id}`, {
      method: 'POST', headers: { authorization: `OAuth ${pageToken}`, offset: '0', file_size: String(size) }, body: await videoBlob(file),
    }), 'Facebook');
    log?.('Publishing the Reel…');
    await json(await req(g, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: caption, access_token: pageToken }),
    }), 'Facebook');
    return { url: `https://www.facebook.com/reel/${start.video_id}`, remoteId: start.video_id };
  },
};

// ------------------------------------------------------------------ Instagram Reels (resumable upload, no public URL needed)
const instagram = {
  async verify({ igUserId, accessToken }) {
    const u = await json(await req(`https://graph.facebook.com/${GRAPH}/${encodeURIComponent(igUserId)}?fields=username,name&access_token=${encodeURIComponent(accessToken)}`), 'Instagram');
    return { name: u.name || u.username, handle: `@${u.username}`, url: `https://www.instagram.com/${u.username}/` };
  },
  async publish({ creds, file, caption, log }) {
    const { igUserId, accessToken } = creds;
    const base = `https://graph.facebook.com/${GRAPH}`;
    const container = await json(await req(`${base}/${encodeURIComponent(igUserId)}/media`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: true, access_token: accessToken }),
    }), 'Instagram');
    await json(await req(`https://rupload.facebook.com/ig-api-upload/${GRAPH}/${container.id}`, {
      method: 'POST', headers: { authorization: `OAuth ${accessToken}`, offset: '0', file_size: String(statSync(file).size) }, body: await videoBlob(file),
    }), 'Instagram');
    for (let i = 0; i < 120; i++) {
      const s = await json(await req(`${base}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`), 'Instagram');
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ProviderError(`Instagram couldn’t process the video: ${s.status || s.status_code}`);
      log?.('Instagram is processing the video…');
      await sleep(3000);
    }
    const pub = await json(await req(`${base}/${encodeURIComponent(igUserId)}/media_publish`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
    }), 'Instagram');
    const link = await json(await req(`${base}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`), 'Instagram').catch(() => ({}));
    return { url: link.permalink || null, remoteId: pub.id };
  },
};

export const PROVIDERS = { telegram, discord, mastodon, youtube, facebook, instagram };
export { ProviderError };
