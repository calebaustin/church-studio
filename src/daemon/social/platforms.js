// Platform catalog for the Social hub. `api` platforms upload the video directly from this Mac;
// `manual` platforms get a guided hand-off (caption copied, file shown, upload page opened) because
// their APIs need an approved developer app or a public video URL. Setup steps are written for this
// app. Limits are conservative so uploads succeed.

const MB = 1024 * 1024;

export const PLATFORMS = [
  {
    id: 'youtube', name: 'YouTube Shorts', kind: 'api', color: '#FF0033',
    captionMax: 5000, titleMax: 100, maxBytes: 250 * MB, maxSeconds: 180,
    note: 'Vertical videos up to 3 minutes are published as Shorts.',
    auth: 'oauth',
    fields: [
      { key: 'clientId', label: 'OAuth client ID', secret: false },
      { key: 'clientSecret', label: 'OAuth client secret', secret: true },
    ],
    steps: [
      { text: 'Create a Google Cloud project (any name works).', link: 'https://console.cloud.google.com/projectcreate' },
      { text: 'Turn on the YouTube Data API v3.', link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' },
      { text: 'Set up the consent screen: an app name and your email, Audience: External, and add your Google account as a test user.', link: 'https://console.cloud.google.com/auth/branding' },
      { text: 'Create a client of type “Desktop app”, then copy its ID and secret here.', link: 'https://console.cloud.google.com/auth/clients/create' },
      'Press Connect, pick your channel, and allow uploads.',
    ],
    link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
  {
    id: 'facebook', name: 'Facebook Page (Reels)', kind: 'api', color: '#0866FF',
    captionMax: 2200, maxBytes: 1024 * MB, maxSeconds: 90,
    note: 'Posts the clip as a Reel on a Facebook Page you manage.',
    fields: [
      { key: 'pageId', label: 'Page ID', secret: false },
      { key: 'pageToken', label: 'Page access token', secret: true },
    ],
    steps: [
      { text: 'Create a Meta app (type Business) and add “Facebook Login for Business”.', link: 'https://developers.facebook.com/apps/creation/' },
      { text: 'In Graph API Explorer, pick your app and add: pages_show_list, pages_read_engagement, pages_manage_posts, publish_video.', link: 'https://developers.facebook.com/tools/explorer/' },
      { text: 'Generate a token, then choose your Page under “User or Page” to get a Page token.', link: 'https://developers.facebook.com/tools/explorer/' },
      { text: 'Make it long-lived: paste it in the Access Token Debugger and press “Extend access token”.', link: 'https://developers.facebook.com/tools/debug/accesstoken/' },
      { text: 'Find your Page ID under About > Page transparency on your Page.', link: 'https://www.facebook.com/pages/?category=your_pages' },
    ],
    link: 'https://developers.facebook.com/tools/explorer/',
  },
  {
    id: 'instagram', name: 'Instagram (Reels)', kind: 'api', color: '#E1306C',
    captionMax: 2200, maxBytes: 300 * MB, maxSeconds: 90,
    note: 'Needs a Business or Creator account linked to a Facebook Page.',
    fields: [
      { key: 'igUserId', label: 'Instagram business account ID', secret: false },
      { key: 'accessToken', label: 'Access token', secret: true },
    ],
    steps: [
      { text: 'Switch Instagram to a Professional account and link it to your Facebook Page.', link: 'https://help.instagram.com/502981923235522' },
      { text: 'In Graph API Explorer add: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement.', link: 'https://developers.facebook.com/tools/explorer/' },
      { text: 'Generate a token and extend it in the Access Token Debugger.', link: 'https://developers.facebook.com/tools/debug/accesstoken/' },
      { text: 'Run me/accounts?fields=instagram_business_account in Graph API Explorer to get the account ID.', link: 'https://developers.facebook.com/tools/explorer/?method=GET&path=me%2Faccounts%3Ffields%3Dinstagram_business_account' },
    ],
    link: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  },
  {
    id: 'telegram', name: 'Telegram channel', kind: 'api', color: '#229ED9',
    captionMax: 1024, maxBytes: 49 * MB, maxSeconds: 3600,
    note: 'Great for a church announcements channel.',
    fields: [
      { key: 'chatId', label: 'Channel @username or ID (-100…)', secret: false },
      { key: 'botToken', label: 'Bot token', secret: true },
    ],
    steps: [
      { text: 'Message @BotFather, send /newbot, and copy the bot token.', link: 'https://t.me/BotFather' },
      { text: 'Add the bot to your channel as an admin with “Post messages”.', link: 'https://core.telegram.org/bots/features#bot-administrators' },
      { text: 'Use the channel’s @username. For a private channel, open it on Telegram Web and use the number after #, with -100 in front.', link: 'https://web.telegram.org/k/' },
    ],
    link: 'https://core.telegram.org/bots/tutorial',
  },
  {
    id: 'discord', name: 'Discord channel', kind: 'api', color: '#5865F2',
    captionMax: 2000, maxBytes: 9.5 * MB, maxSeconds: 3600,
    note: 'Posts through a channel webhook. Larger clips are compressed to fit Discord’s 10 MB limit.',
    fields: [{ key: 'webhook', label: 'Webhook URL', secret: true }],
    steps: [
      { text: 'In your server: Server Settings > Integrations > Webhooks > New Webhook.', link: 'https://support.discord.com/hc/en-us/articles/228383668' },
      { text: 'Pick the channel, name it, then press “Copy Webhook URL” and paste it here.' },
    ],
    link: 'https://support.discord.com/hc/en-us/articles/228383668',
  },
  {
    id: 'mastodon', name: 'Mastodon', kind: 'api', color: '#6364FF',
    captionMax: 500, maxBytes: 39 * MB, maxSeconds: 600,
    fields: [
      { key: 'instance', label: 'Server (e.g. https://mastodon.social)', secret: false },
      { key: 'token', label: 'Access token', secret: true },
    ],
    steps: [
      { text: 'On your server: Preferences > Development > New application.', link: 'https://mastodon.social/settings/applications/new' },
      { text: 'Keep read:accounts, write:media and write:statuses. Save, open it, and copy “Your access token”.' },
    ],
    link: 'https://docs.joinmastodon.org/client/token/',
  },
  // ---- guided hand-off (no direct API from a local app without an approved developer app)
  { id: 'tiktok', name: 'TikTok', kind: 'manual', color: '#111111', captionMax: 2200, uploadUrl: 'https://www.tiktok.com/tiktokstudio/upload',
    note: 'TikTok only allows direct posting from audited developer apps, so the app hands it off: caption copied, file shown, upload page opened.' },
  { id: 'instagram-manual', name: 'Instagram (manual)', kind: 'manual', color: '#E1306C', captionMax: 2200, uploadUrl: 'https://www.instagram.com/',
    note: 'Use this if you don’t want to set up the Meta API. Easiest from your phone: AirDrop the file.' },
  { id: 'x', name: 'X (Twitter)', kind: 'manual', color: '#111111', captionMax: 280, uploadUrl: 'https://x.com/compose/post',
    note: 'X charges for API posting, so posts are handed off.' },
  { id: 'threads', name: 'Threads', kind: 'manual', color: '#111111', captionMax: 500, uploadUrl: 'https://www.threads.com/' },
  { id: 'linkedin', name: 'LinkedIn', kind: 'manual', color: '#0A66C2', captionMax: 3000, uploadUrl: 'https://www.linkedin.com/feed/?shareActive=true' },
  { id: 'bluesky', name: 'Bluesky', kind: 'manual', color: '#1185FE', captionMax: 300, uploadUrl: 'https://bsky.app/' },
];

export const platform = (id) => PLATFORMS.find((p) => p.id === id);

/** Caption for one destination: override or shared caption + hashtags, trimmed to the limit. */
export function captionFor(post, dest, p) {
  const base = (dest.caption ?? post.caption ?? '').trim();
  const tags = (post.hashtags || []).map((h) => `#${String(h).replace(/[#\s]+/g, '')}`).filter((h) => h.length > 1).join(' ');
  let text = dest.caption != null ? base : [base, tags].filter(Boolean).join('\n\n');
  if (p?.captionMax && text.length > p.captionMax) text = `${text.slice(0, p.captionMax - 1).replace(/\s+\S*$/, '')}…`;
  return text;
}
