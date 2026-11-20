// Campaigns: a set of posts that work together toward one moment, like an event, a sermon or a series.
// Each step is a draft post with a planned date and a caption to start from. Attach a design or clip,
// pick accounts and schedule each one when it's ready. Repeat a campaign for a recurring event.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './tools.js';
import { loadConfig } from './config.js';
import { getProject } from './projects.js';
import { loadDraft } from './writing.js';
import * as socialStore from './social/store.js';
import * as social from './social/hub.js';

const STORE = path.join(DATA_DIR, 'campaigns.json');
const load = async () => { try { return existsSync(STORE) ? JSON.parse(await readFile(STORE, 'utf8')) : []; } catch { return []; } };
const save = async (all) => { await mkdir(DATA_DIR, { recursive: true }); await writeFile(STORE, JSON.stringify(all, null, 2)); };

const longDay = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const shortDay = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** The steps each kind of campaign starts with. offset is in days from the anchor date. */
export const PLANS = {
  event: [
    { key: 'save', label: 'Save the date', offset: -21, asset: 'flyer' },
    { key: 'invite', label: 'Details and invite', offset: -10, asset: 'flyer' },
    { key: 'week', label: 'One week out', offset: -7, asset: 'countdown' },
    { key: 'soon', label: '3 days to go', offset: -3, asset: 'countdown' },
    { key: 'tomorrow', label: 'Tomorrow', offset: -1, asset: 'countdown' },
    { key: 'today', label: 'Today', offset: 0, asset: 'countdown' },
    { key: 'thanks', label: 'Thank you and photos', offset: 1, asset: 'photo' },
  ],
  sermon: [
    { key: 'preview', label: 'This Sunday', offset: -2, asset: 'design' },
    { key: 'recap', label: 'Sunday recap', offset: 1, asset: 'design' },
    { key: 'clip', label: 'A moment from the message', offset: 2, asset: 'clip' },
    { key: 'quote', label: 'Quote graphic', offset: 3, asset: 'design' },
    { key: 'question', label: 'A question to think about', offset: 4, asset: 'design' },
    { key: 'clip2', label: 'Another clip', offset: 5, asset: 'clip' },
  ],
  custom: [
    { key: 'announce', label: 'Announce it', offset: -7, asset: 'design' },
    { key: 'remind', label: 'Reminder', offset: -1, asset: 'design' },
    { key: 'day', label: 'The day', offset: 0, asset: 'design' },
  ],
};

/** A caption to start from. Brackets mark what to fill in, like in Writing. */
function caption(key, ctx) {
  const { title, when, place, link, church, summary, quote, question } = ctx;
  const at = when ? `${longDay(when)}${ctx.allDay ? '' : ` at ${timeOf(when)}`}` : '[date and time]';
  const where = place ? ` at ${place}` : '';
  const more = link ? `\n\nDetails: ${link}` : '';
  const T = {
    save: `Save the date! ${title} is ${at}${where}. Mark your calendar and bring a friend.`,
    invite: `${title}\n${at}${where}\n\n${summary || '[A sentence or two about what to expect.]'} Everyone is welcome.${more}`,
    week: `One week until ${title}! ${at}${where}. Who are you bringing?${more}`,
    soon: `Just 3 days until ${title}. We’re praying for everyone who will be there.${more}`,
    tomorrow: `Tomorrow: ${title}${ctx.allDay || !when ? '' : ` at ${timeOf(when)}`}${where}. We can’t wait to see you.`,
    today: `Today’s the day! ${title}${ctx.allDay || !when ? '' : ` at ${timeOf(when)}`}${where}. Come as you are.`,
    thanks: `Thank you to everyone who came to ${title}. [A highlight or a thank-you to the team.] Here are a few photos.`,
    preview: `This Sunday at ${church || 'church'}: “${title}”. [One line about the message.] See you there.`,
    recap: `Sunday’s message: “${title}”. ${summary || '[The main point in a sentence.]'} Watch the whole message: [link]`,
    clip: `A moment from Sunday’s message, “${title}”. Watch the whole message: [link]`,
    quote: `“${quote || '[A line from the message]'}”\n\nFrom “${title}”`,
    question: `A question to think about this week: ${question || '[A question from the message]'}\n\nShare your answer below.`,
    clip2: `One more from “${title}”. Who needs to hear this today?`,
    announce: `${title} is coming ${when ? shortDay(when) : '[date]'}. [What it is and who it’s for.]${more}`,
    remind: `Tomorrow: ${title}. [Time and place.]${more}`,
    day: `Today: ${title}. [Time and place.] See you there.`,
  };
  return T[key] || `${title}`;
}

export async function listCampaigns() {
  const all = await load();
  const posts = await socialStore.listPosts();
  return all.map((c) => ({ ...c, steps: c.steps.map((s) => ({ ...s, post: posts.find((p) => p.id === s.postId) || null })) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Suggested steps, before anything is saved. body: { kind, event, projectId, name, date, hour } */
export async function draftCampaign(body) {
  const cfg = await loadConfig();
  const kind = PLANS[body.kind] ? body.kind : 'custom';
  let ctx = { church: cfg.churchInfo?.name || '' };
  let anchor = body.date ? new Date(body.date) : new Date(Date.now() + 14 * 86400000);
  let name = body.name || '';
  if (kind === 'event' && body.event) {
    const e = body.event;
    anchor = new Date(e.start);
    ctx = { ...ctx, title: e.title, when: anchor, allDay: e.allDay, place: e.location || '', link: e.link || '', summary: e.summary || '' };
    name = name || e.title;
  } else if (kind === 'sermon' && body.projectId) {
    const p = await getProject(body.projectId);
    if (!p) throw new Error('That project is missing.');
    const d = await loadDraft(body.projectId).catch(() => null);
    const kept = p.clips.find((c) => c.summary);
    // A sermon is usually brought in after it's preached: anchor on that Sunday (the latest one on or before).
    const made = new Date(p.created);
    anchor = body.date ? new Date(body.date) : new Date(made.getFullYear(), made.getMonth(), made.getDate() - made.getDay());
    const q = String(d?.group || '').match(/^\s*\d+[.)]\s+(.{12,180}\?)/m)?.[1];
    ctx = { ...ctx, title: p.title, when: anchor, summary: kept?.summary || '', quote: (d?.quotes || [])[0] || kept?.hook || '', question: q || '' };
    name = name || p.title;
  } else {
    ctx = { ...ctx, title: name || 'Our next big day', when: anchor, allDay: true };
  }
  const hour = Number.isFinite(body.hour) ? body.hour : 9;
  const steps = PLANS[kind].map((s) => {
    const at = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + s.offset, hour, 0, 0);
    return { id: randomUUID().slice(0, 8), key: s.key, label: s.label, offset: s.offset, asset: s.asset, at: at.toISOString(), caption: caption(s.key, ctx), on: at > new Date() };
  });
  return { kind, name: name || 'New campaign', date: anchor.toISOString(), event: body.event || null, projectId: body.projectId || null, steps };
}

/** Save a campaign and make a draft post for each chosen step. */
export async function createCampaign(c) {
  const id = randomUUID().slice(0, 10);
  const steps = [];
  for (const s of (c.steps || []).filter((x) => x.on)) {
    const post = await social.createPost({ mode: 'draft', title: `${c.name} · ${s.label}`, caption: s.caption, hashtags: [], accountIds: c.accountIds || [], campaignId: id, plannedAt: s.at, step: s.label });
    steps.push({ id: s.id, key: s.key, label: s.label, offset: s.offset, asset: s.asset, at: s.at, postId: post.id });
  }
  const camp = { id, name: c.name, kind: c.kind, date: c.date, event: c.event || null, projectId: c.projectId || null, hour: c.hour ?? 9, created: new Date().toISOString(), steps };
  const all = await load(); all.push(camp); await save(all);
  return camp;
}

/** The same campaign for the next time the event comes around: every step moves with the new date. */
export async function repeatCampaign(id, { date, name }) {
  const all = await load();
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error('Campaign not found');
  const anchor = new Date(date);
  if (Number.isNaN(anchor.getTime())) throw new Error('Pick the new date.');
  const posts = await socialStore.listPosts();
  const oldDay = new Date(c.date);
  const swap = (text) => String(text || '').replaceAll(longDay(oldDay), longDay(anchor)).replaceAll(shortDay(oldDay), shortDay(anchor));
  const steps = c.steps.map((s) => {
    const old = new Date(s.at);
    const at = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + s.offset, old.getHours(), old.getMinutes());
    const prev = posts.find((p) => p.id === s.postId);
    return { id: randomUUID().slice(0, 8), key: s.key, label: s.label, offset: s.offset, asset: s.asset, at: at.toISOString(), caption: swap(prev?.caption), media: prev?.media || null, on: at > new Date() };
  });
  const made = await createCampaign({ name: name || c.name, kind: c.kind, date: anchor.toISOString(), event: c.event ? { ...c.event, start: anchor.toISOString() } : null, projectId: c.projectId, hour: c.hour, steps });
  // Designs and clips from last time come along, so only what changed needs a touch.
  for (const s of made.steps) {
    const src = steps.find((x) => x.id === s.id);
    if (src?.media) await social.editPost(s.postId, { media: { ...src.media } }).catch(() => {});
  }
  return made;
}

export async function deleteCampaign(id, { removeDrafts = true } = {}) {
  const all = await load();
  const c = all.find((x) => x.id === id);
  if (!c) return { ok: true };
  if (removeDrafts) {
    const posts = await socialStore.listPosts();
    for (const s of c.steps) { const p = posts.find((x) => x.id === s.postId); if (p?.status === 'draft') await socialStore.removePost(p.id); }
  }
  await save(all.filter((x) => x.id !== id));
  return { ok: true };
}

/** Tie a campaign to a sermon (or untie it with null). */
export async function setCampaignSermon(id, projectId) {
  const all = await load();
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error('Campaign not found');
  c.projectId = projectId || null;
  await save(all);
  return c;
}
