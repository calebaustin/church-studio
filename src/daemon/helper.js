// The AI helper's view of Church Studio: what it knows about this church, what's on the page you're
// working on, and the "Helper Passes" it can run there. Every helper (Apple Intelligence, CS Helper, or
// an External AI) gets the same strict rules and the same facts, trimmed to what that model can hold.
//
// It only ever sees facts gathered here from this Mac. It never browses or makes things up.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './tools.js';
import { loadConfig } from './config.js';
import { cachedEvents } from './calendar.js';
import { listCampaigns } from './campaigns.js';
import { getDesign, listDesigns } from './designs.js';
import { getProject, getTranscript, listProjects } from './projects.js';
import { loadVoice } from './voice.js';
import { listDrafts, loadDraft } from './writing.js';
import { gapReport, sermonIndex } from './insights.js';
import { listChannel } from './youtube.js';
import { lookup, refsIn, topicWords, TRANSLATION, versesAbout } from './bible.js';
import { toSentences } from './text.js';
import { stat } from 'node:fs/promises';
import { file as projectFile } from './projects.js';
import { chat, complete, PROVIDER_NAMES } from './ai.js';
import { appleAsk, llamaChat } from './localai.js';
import { listLibrary } from './library.js';
import { loadNotes } from './photos.js';

// ------------------------------------------------------------------ brand pictures
const nameOf = (rel) => rel.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
async function brandImages() {
  const lib = await listLibrary().catch(() => ({ items: [] }));
  const notes = await loadNotes().catch(() => ({}));
  return lib.items.filter((i) => i.kind === 'image' && ['Photos', 'Logos', 'Graphics'].includes(i.folder))
    .map((i) => ({ rel: i.rel, url: i.url, folder: i.folder, name: nameOf(i.rel), alt: notes[i.rel]?.alt || '', tags: notes[i.rel]?.tags || [] }));
}
/** Brand pictures that fit some words best (by their description and tags), photos before logos. */
function rankImages(images, words) {
  const want = new Set(String(words).toLowerCase().match(/[a-z]{4,}/g) || []);
  const score = (im) => [...`${im.name} ${im.alt} ${im.tags.join(' ')}`.toLowerCase().matchAll(/[a-z]{4,}/g)].filter((m) => want.has(m[0])).length * 2 + (im.folder === 'Photos' ? 1 : 0);
  return [...images].sort((a, b) => score(b) - score(a));
}

// How much each helper can read at once (characters of facts, leaving room for the answer).
const BUDGET = { apple: 4200, cshelper: 11000 };
const budgetFor = (p) => BUDGET[p] || 24000;
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const day = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const time = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

let indexCache = { at: 0, value: null };
async function themes() {
  if (Date.now() - indexCache.at < 10 * 60_000) return indexCache.value;
  const v = await sermonIndex().catch(() => null);
  indexCache = { at: Date.now(), value: v };
  return v;
}

/** What the helper knows about this church, in short plain lines, most important first. */
export async function churchFacts(cfg, budget) {
  const ci = cfg.churchInfo || {};
  const out = [];
  const add = (title, lines) => { const l = lines.filter(Boolean); if (l.length) out.push(`${title}:\n${l.map((x) => `- ${x}`).join('\n')}`); };
  add('Church', [
    ci.name && `Name: ${ci.name}`, ci.pastor && `Minister: ${ci.pastor}`, ci.times && `Service times: ${ci.times}`,
    ci.address && `Address: ${ci.address}`, ci.website && `Website: ${ci.website}`, ci.phone && `Phone: ${ci.phone}`,
  ]);
  const roles = ['Primary', 'Secondary', 'Text', 'Background', 'Accent'];
  add('Brand', [
    cfg.brandColors?.length && `Colors: ${cfg.brandColors.map((c, i) => `${roles[i] || 'Extra'} ${c}`).join(', ')}`,
    cfg.brandFonts && `Fonts: ${cfg.brandFonts.heading} for headings, ${cfg.brandFonts.body} for body text`,
  ]);
  const v = await loadVoice().catch(() => null);
  if (v) add('Voice', [v.mission && `Mission: ${clip(v.mission, 400)}`, v.themes?.length && `Themes they return to: ${v.themes.slice(0, 8).join('; ')}`, v.samples?.[0] && `How they write: "${clip(v.samples[0].text, budget < 6000 ? 260 : 700)}"`]);
  const now = Date.now();
  const { events } = await cachedEvents();
  add('Coming up on the church calendar', (events || []).filter((e) => Date.parse(e.start) >= now - 3600_000 && Date.parse(e.start) < now + 35 * 86400_000)
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, budget < 6000 ? 5 : 10)
    .map((e) => `${e.title}, ${day(e.start)}${e.allDay ? '' : ` at ${time(e.start)}`}${e.location ? `, ${e.location}` : ''}${e.summary ? `. ${clip(e.summary, 120)}` : ''}`));
  const camps = (await listCampaigns().catch(() => [])).filter((c) => Date.parse(c.date) > now - 7 * 86400_000).slice(0, 4);
  add('Campaigns', camps.map((c) => `${c.name} (${Date.parse(c.date) < now ? 'was' : 'for'} ${day(c.date)}): ${c.steps.length} posts, ${c.steps.filter((s) => s.post && s.post.status !== 'draft').length} posted`));
  const projects = (await listProjects().catch(() => [])).filter((p) => p.status === 'transcribed').slice(0, budget < 6000 ? 4 : 8);
  add('Recent sermons and videos', projects.map((p) => `${p.title} (${day(p.created)}), ${p.clips} clips`));
  const idx = await themes();
  if (idx?.themes?.length) add('Themes across their sermons', [idx.themes.slice(0, 10).map((t) => t.theme).join(', ')]);
  if (idx?.scripture?.length) add('Bible books and verses their minister has preached', idx.scripture.slice(0, budget < 6000 ? 4 : 8).map((b) => `${b.book}: ${[...new Set(b.refs.map((r) => r.ref))].slice(0, 5).join(', ')}`));
  if (idx?.series?.length) add('Sermon series', idx.series.slice(0, 4).map((s) => `${s.name}: ${s.sermons.length} sermons`));
  const designs = (await listDesigns().catch(() => [])).slice(0, budget < 6000 ? 3 : 6);
  add('Recent designs', designs.map((d) => d.name));
  const drafts = (await listDrafts().catch(() => [])).slice(0, budget < 6000 ? 3 : 6);
  add('Recent writing', drafts.map((d) => d.title));
  return out.join('\n\n');
}

function wordsBetween(t, a, b) {
  return (t?.words || []).filter((w) => w.start >= a - 0.05 && w.end <= b + 0.05).map((w) => w.w).join(' ');
}

/**
 * What's on the page right now. focus: { kind, id, clipId, part, selectedText }.
 * Returns { label, chips, text, passes } where chips are the short tags shown at the top of the chat.
 */
export async function focusOf(focus = {}, budget = 8000) {
  const k = focus.kind;
  const deep = budget >= 6000;
  try {
    if (k === 'design' && focus.id) {
      const d = await getDesign(focus.id);
      const texts = (d.pages || []).flatMap((p) => (p.items || []).filter((i) => i.type === 'text').map((i) => i.text)).filter(Boolean);
      const campId = d.source?.campaignId;
      const camp = campId ? (await listCampaigns()).find((c) => c.id === campId) : null;
      const pics = rankImages(await brandImages(), `${d.name} ${texts.join(' ')}`).slice(0, deep ? 12 : 6);
      const sel = focus.selected;
      const lines = [`Design "${d.name}" (${d.kind || 'graphic'}, ${d.size?.w}×${d.size?.h}, ${d.pages?.length || 1} page${d.pages?.length > 1 ? 's' : ''}).`,
        texts.length && `Text on it now: ${texts.map((t) => `"${clip(t, 90)}"`).join(' / ')}`,
        sel ? `Selected right now: ${sel.label}${sel.text ? ` reading "${clip(sel.text, 120)}"` : ''}. When they say "this" or "it", they mean this.` : 'Nothing is selected, so "this" means the whole design.',
        pics.length && `Pictures in their Brand library (when you suggest one, use its exact name): ${pics.map((im) => `"${im.name}"${im.alt ? ` (${clip(im.alt, 70)})` : ''}`).join('; ')}`,
        camp && `Part of the campaign "${camp.name}" for ${day(camp.date)}${camp.event ? `: ${camp.event.title}${camp.event.location ? ` at ${camp.event.location}` : ''}` : ''}.`];
      return { label: d.name, chips: [`Design: ${d.name}`, camp && `Campaign: ${camp.name}`].filter(Boolean), text: lines.filter(Boolean).join('\n'), passes: PASS_LIST.design };
    }
    if ((k === 'clip' || k === 'project') && focus.id) {
      const p = await getProject(focus.id);
      const t = await getTranscript(focus.id).catch(() => null);
      if (k === 'clip') {
        const c = p.clips.find((x) => x.id === focus.clipId) || p.clips[0];
        if (c) {
          const said = clip(wordsBetween(t, c.start, c.end), deep ? 2400 : 1100);
          const lines = [`Clip "${c.title}" from the sermon "${p.title}", ${Math.round(c.end - c.start)} seconds.`,
            c.hook && `On-screen hook now: "${c.hook}"`, c.summary && `Post caption now: "${clip(c.summary, 200)}"`,
            said && `What's said in the clip: "${said}"`];
          return { label: c.title, chips: [`Clip: ${c.title}`, `Sermon: ${p.title}`], text: lines.filter(Boolean).join('\n'), passes: PASS_LIST.clip };
        }
      }
      const r = p.sermon?.range || t?.range;
      const body = t ? wordsBetween(t, r?.start ?? 0, r?.end ?? 1e9) : '';
      const lines = [`Sermon/video "${p.title}"${p.series ? ` in the series "${p.series}"` : ''}.`,
        p.clips?.length && `Clips so far: ${p.clips.slice(0, 8).map((c) => `"${c.title}"`).join(', ')}`,
        body && `From the transcript: "${clip(body, deep ? 3800 : 1500)}"`];
      return { label: p.title, chips: [`Sermon: ${p.title}`], text: lines.filter(Boolean).join('\n'), passes: PASS_LIST.project };
    }
    if (k === 'writing' && focus.id) {
      const d = await loadDraft(focus.id);
      if (d) {
        const part = focus.part && d[focus.part] ? focus.part : ['blog', 'newsletter', 'email', 'group', 'social'].find((x) => d[x]);
        const lines = [`Writing "${d.title}"${part ? `, working on the ${part === 'group' ? 'small group guide' : part}` : ''}.`,
          part && `Current text: "${clip(d[part], deep ? 3600 : 1400)}"`, focus.selectedText && `Selected: "${clip(focus.selectedText, 300)}"`];
        return { label: d.title, chips: [`Writing: ${d.title}`], text: lines.filter(Boolean).join('\n'), passes: PASS_LIST.writing };
      }
    }
    if (k === 'campaign' && focus.id) {
      const c = (await listCampaigns()).find((x) => x.id === focus.id);
      if (c) {
        const lines = [`Campaign "${c.name}" for ${day(c.date)}${c.event ? `: ${c.event.title}${c.event.location ? ` at ${c.event.location}` : ''}` : ''}.`,
          `Posts: ${c.steps.map((s) => `${s.label} on ${day(s.at)}${s.post?.caption ? ` ("${clip(s.post.caption, 80)}")` : ''}`).join('; ')}`];
        return { label: c.name, chips: [`Campaign: ${c.name}`], text: lines.join('\n'), passes: PASS_LIST.campaign };
      }
    }
  } catch { /* the item was deleted or isn't saved yet: fall through to the screen */ }
  const SCREENS = { home: 'the Dashboard', library: 'Videos', calendar: 'the Calendar', social: 'Social', writing: 'Writing', graphics: 'Design', assets: 'the Brand library', projects: 'All projects', settings: 'Settings', me: 'My App' };
  const where = SCREENS[focus.screen] || 'Church Studio';
  return { label: where, chips: [`On ${where.replace(/^the /, '')}`], text: `They are on ${where}.`, passes: PASS_LIST[focus.screen] || PASS_LIST.home };
}

// ------------------------------------------------------------------ rules
export function rules(provider, cfg) {
  const church = cfg.churchInfo?.name || 'this church';
  return `You are the Church Studio Helper, built into Church Studio, the Mac app ${church} uses for sermon clips, writing, designs, social posts and campaigns.
Rules you always keep:
- Only help with ${church}'s media and communication work inside Church Studio. If asked about anything else, say in one sentence that you can only help with Church Studio work, then suggest one thing from the facts below (an upcoming event, a recent sermon or a campaign). Never offer to make anything about the off-topic subject.
- Use only the facts below. Never invent events, dates, times, names, numbers, quotes or Bible references. If something isn't in the facts, say you don't see it, and point to where in Church Studio it can be added.
- Call the preacher "the minister", or use their name if you know it.
- Stay faithful to what the preacher actually said. Don't add theology or claims of your own.
- Keep answers under 120 words unless they ask for more. Be warm and practical, in plain words. Use a short list for options, never more than 4 items, and don't repeat yourself.
- When the facts give a day, time or place, write it out. Never leave a placeholder like [Date] for something you know.
- Only mention events, campaigns and sermons that appear in the facts. Never add a placeholder or "to be determined" item.
- Church Studio's tools: Videos (turn sermons into clips), Calendar (church events and campaigns), Social (write, schedule and post), Writing (blogs, emails, newsletters, small group guides), Design (graphics, stories, slides) and the Brand library (logo, colors, fonts, photos, voice). Name the right one when it helps.
- Write in ${church}'s voice when you write anything they'll post or send.
- If they say "this" or "it", they mean what is selected (see below), or the whole piece if nothing is. If it's still unclear what they mean, ask one short question before you answer.
- When you suggest a sermon, event, design or picture, use its exact name from the facts so they can open it.
- Don't give doctrinal opinions or tell anyone what to believe. If they ask a question of belief, don't answer it yourself. If "What their minister said on this" appears below, point them to that sermon and share a short phrase of what the minister said there, in the minister's words. If it doesn't appear, say kindly that's a question for their minister.
- For writing, you may suggest Bible references that fit a topic (references only, like Psalm 23:1). Choose from "Verses you can suggest" and the verses their minister has preached when they're given. Never quote verse wording yourself; Church Studio adds the exact wording.
- When they ask how to do something or where a setting is, answer with the exact place from the guide below, like "Settings › Church info".

HOW CHURCH STUDIO IS LAID OUT
- Videos: bring in a sermon from YouTube or this Mac, transcribe it, find clips, edit (Words & trim, Title & hook, Captions, Framing, Pop-ups, Graphics, Sound) and export.
- Calendar: church events, plus the Campaigns and Inspiration tabs. Church calendar links are added in Settings › Connections.
- Social: connect accounts, write, schedule and post; read comments in Messages.
- Writing: blog posts, emails, newsletters, small group guides and devotionals.
- Design: graphics, stories, flyers and slides from templates; Plan a post from any design.
- Brand library: Brand kit (logo, colors, fonts), Voice (mission, themes, writing samples) and Files (photos).
- Settings: Your tools, Connections, YouTube channel, AI helper, Transcription & clips, Exports, App theme, Caption themes, Church info (name, minister, service times, address, website), Helper programs, Backups and sharing, Updates, Send feedback.`;
}

async function systemFor(cfg, focus) {
  const budget = budgetFor(cfg.llmProvider);
  const f = await focusOf(focus, budget);
  const facts = await churchFacts(cfg, budget);
  const trimmed = facts.length > budget * 0.6 ? `${facts.slice(0, budget * 0.6)}…` : facts;
  return { system: `${rules(cfg.llmProvider, cfg)}\n\nWHAT YOU KNOW ABOUT ${String(cfg.churchInfo?.name || 'THE CHURCH').toUpperCase()}\n${trimmed}\n\nWHAT THEY'RE WORKING ON NOW\n${f.text}`, focus: f };
}

/** The chat. Streams the answer through onDelta(text) or onReplace(full). */
export async function helperChat({ focus, messages, onDelta, signal }) {
  const cfg = await loadConfig();
  if (!cfg.llmProvider || cfg.llmProvider === 'none') throw new Error('Turn on an AI helper in Settings first.');
  let { system } = await systemFor(cfg, focus);
  const clean0 = (messages || []).filter((m) => m?.role === 'user');
  const lastQ = String(clean0[clean0.length - 1]?.content || '');
  let moments = [];
  if (isBeliefQuestion(lastQ)) {
    moments = await sermonMoments(lastQ);
    if (!moments.length) {
      const text = 'That\'s a question for your minister, so I won\'t answer it myself. I didn\'t find it in your saved sermon transcripts. If your minister preaches on it, I can point you to that spot, and help you write about it in your church\'s words.';
      onDelta?.(text);
      return { text, refs: [], actions: [] };
    }
    system += '\n\nThis is a question of belief. Don\'t answer it yourself. Say their minister spoke about it, and share a short phrase of what was said, in the minister\'s words. Then offer to help write about it.';
    if (moments.length) system += `\n\nWHAT THEIR MINISTER SAID ON THIS (from saved sermon transcripts)\n${moments.map((m) => `- In "${m.title}" at ${clock(m.start)}: "${clip(m.text, 320)}"`).join('\n')}`;
  }
  if (/\b(verses?|scriptures?|bible|passages?)\b/i.test(lastQ)) {
    const vs = versesAbout(topicWords(lastQ), cfg.llmProvider === 'apple' ? 6 : 10);
    if (vs.length) system += `\n\nVERSES YOU CAN SUGGEST (they use the words asked about)\n${vs.map((v) => v.ref).join('; ')}`;
  }
  const clean = (messages || []).filter((m) => m && ['user', 'assistant'].includes(m.role) && String(m.content || '').trim()).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw new Error('Ask a question first.');
  let text = await chat(cfg, { system, messages: clean, onDelta, signal });
  // When it declines, small models sometimes invent a feature to point at. Finish the reply ourselves with
  // something real from this church's calendar or sermons.
  if (/^\W*I can only help with Church Studio/i.test(text)) text = `I can only help with Church Studio work. ${await realSuggestion()}`;
  text = groundVerses(text);
  const refs = findRefs(text, await catalog(), focus);
  // The sermon moments, as pills that open the transcript right at that spot.
  for (const m of moments) refs.push({ type: 'moment', id: `${m.projectId}@${Math.round(m.start)}`, title: `${m.title} · ${clock(m.start)}`, go: { name: 'project', id: m.projectId, step: 'text', t: m.start } });
  return { text, refs, actions: followUps(refs, focus) };
}

// ------------------------------------------------------------------ links in answers
// Everything an answer can point at, so names in the reply become pills that open the item.
let catCache = { at: 0, value: null };
async function catalog() {
  if (Date.now() - catCache.at < 30_000) return catCache.value;
  const now = Date.now();
  const { events } = await cachedEvents();
  const out = [
    ...(events || []).filter((e) => Date.parse(e.start) > now - 30 * 86400_000).map((e) => ({ type: 'event', id: e.id, title: e.title, event: e, when: day(e.start) })),
    ...(await listProjects().catch(() => [])).map((p) => ({ type: 'sermon', id: p.id, title: p.title })),
    ...(await listDesigns().catch(() => [])).map((d) => ({ type: 'design', id: d.id, title: d.name })),
    ...(await listDrafts().catch(() => [])).map((d) => ({ type: 'writing', id: d.id, title: d.title })),
    ...(await listCampaigns().catch(() => [])).map((c) => ({ type: 'campaign', id: c.id, title: c.name })),
    ...(await brandImages()).map((im) => ({ type: 'file', id: im.rel, title: im.name, url: im.url })),
  ].filter((x) => x.title && x.title.trim().length >= 4);
  catCache = { at: Date.now(), value: out };
  return out;
}
// Places in the app the helper can point to. Single words match only when capitalized like a tool name.
const PLACES = [
  ['Church info', { name: 'settings', section: 'church' }], ['Connections', { name: 'settings', section: 'connections' }],
  ['YouTube channel', { name: 'settings', section: 'youtube' }], ['AI helper', { name: 'settings', section: 'ai' }],
  ['Transcription & clips', { name: 'settings', section: 'clips' }], ['Exports', { name: 'settings', section: 'export' }],
  ['App theme', { name: 'settings', section: 'app-theme' }], ['Caption themes', { name: 'settings', section: 'video-themes' }],
  ['Helper programs', { name: 'settings', section: 'tools' }], ['Backups and sharing', { name: 'settings', section: 'backups' }],
  ['Your tools', { name: 'settings', section: 'menu' }], ['Send feedback', { name: 'settings', section: 'feedback' }],
  ['Brand kit', { name: 'assets', section: 'kit' }], ['Brand library', { name: 'assets' }], ['Voice', { name: 'assets', section: 'voice' }],
  ['Campaigns', { name: 'calendar', tab: 'campaigns' }], ['Inspiration', { name: 'inspiration' }], ['Calendar', { name: 'calendar' }],
  ['Videos', { name: 'library' }], ['Social', { name: 'social' }], ['Writing', { name: 'writing' }], ['Design', { name: 'graphics' }],
  ['My App', { name: 'me' }],
];
function findPlaces(text) {
  const out = [];
  for (const [title, go] of PLACES) {
    const re = new RegExp(`(^|[^A-Za-z])(${title.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')})(?![A-Za-z])`, title.includes(' ') ? 'i' : '');
    const m = re.exec(text);
    if (!m) continue;
    // A single capitalized word at the very start of a sentence is just a word.
    if (!title.includes(' ') && (m.index === 0 || /[.!?]\s*$/.test(text.slice(0, m.index + m[1].length)))) continue;
    out.push({ type: 'place', id: title, title, go, at: m.index + m[1].length });
  }
  return out;
}
const norm = (t) => String(t).toLowerCase().replace(/[“”"‘’']/g, '').replace(/\s+/g, ' ');
function findRefs(text, cat, focus) {
  const hay = norm(text);
  const seen = new Set(); const hits = [];
  for (const x of cat) {
    const t = norm(x.title);
    const at = hay.indexOf(t);
    if (at < 0 || seen.has(`${x.type}:${x.id}`)) continue;
    // Skip a one-word title that's just a common word inside the sentence.
    if (!/\s/.test(t) && t.length < 6) continue;
    seen.add(`${x.type}:${x.id}`); hits.push({ ...x, at });
  }
  // Longest names first win when one name sits inside another.
  hits.sort((a, b) => b.title.length - a.title.length);
  const kept = hits.filter((h, i) => !hits.slice(0, i).some((o) => o.at <= h.at && o.at + o.title.length >= h.at + h.title.length));
  const places = findPlaces(text).filter((p) => !kept.some((k) => p.at >= k.at && p.at < k.at + k.title.length));
  return [...kept, ...places].sort((a, b) => a.at - b.at).slice(0, 10).map(({ at, ...r }) => ({ ...r, here: focus?.kind === 'design' && r.type === 'file' }));
}
/** A few next steps that connect what the answer talked about. */
function followUps(refs, focus) {
  const ev = refs.find((r) => r.type === 'event');
  const ser = refs.find((r) => r.type === 'sermon') || (focus?.kind === 'project' || focus?.kind === 'clip' ? { id: focus.id } : null);
  const out = [];
  if (ev) out.push({ label: ser ? `Start a campaign for ${ev.title} with this sermon` : `Start a campaign for ${ev.title}`, go: { name: 'calendar', campaign: { event: ev.event, ...(ser ? { projectId: ser.id } : {}) } } });
  if (ev) out.push({ label: `Make a graphic for ${ev.title}`, go: { name: 'graphics', event: ev.event, eventMode: 'pick' } });
  const sermon = refs.find((r) => r.type === 'sermon');
  if (sermon) out.push({ label: 'Open the transcript', go: { name: 'project', id: sermon.id, step: 'text' } });
  const pic = refs.find((r) => r.type === 'file');
  if (pic && focus?.kind === 'design') out.push({ label: `Add ${pic.title} to this design`, apply: { field: 'image', value: pic.id } });
  return out.slice(0, 3);
}

async function realSuggestion() {
  const now = Date.now();
  const { events } = await cachedEvents();
  const next = (events || []).filter((e) => Date.parse(e.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next) return `Want some ideas for promoting ${next.title} on ${day(next.start)}?`;
  const p = (await listProjects().catch(() => [])).find((x) => x.status === 'transcribed');
  if (p) return `Want some clip or post ideas from "${p.title}"?`;
  return 'Want some ideas for what to make this week?';
}

export async function helperContext(focus) {
  const cfg = await loadConfig();
  const f = await focusOf(focus, budgetFor(cfg.llmProvider));
  return { label: f.label, chips: f.chips, passes: f.passes.map(({ id, label, apply }) => ({ id, label, apply: Boolean(apply) })), provider: cfg.llmProvider, name: PROVIDER_NAMES[cfg.llmProvider] || null, imagePrompts: await imagePrompts(cfg, focus) };
}

/** With Apple Intelligence on, ready-made Image Playground prompts for the design that's open. */
async function imagePrompts(cfg, focus) {
  if (cfg.llmProvider !== 'apple' || focus?.kind !== 'design' || !focus.id) return [];
  const d = await getDesign(focus.id).catch(() => null);
  if (!d) return [];
  const texts = (d.pages || []).flatMap((pg) => (pg.items || []).filter((i) => i.type === 'text' && i.text)).sort((a, b) => (b.size || 0) - (a.size || 0)).map((i) => i.text.replace(/\s+/g, ' ').trim());
  // The headline: the biggest real words on the page (not a number, date, time, web address or "Join us").
  const real = (t) => t.split(' ').length >= 2 && t.split(' ').length <= 8 && /[a-z]{3,}/i.test(t) && !/@|https?:|\.com|\b(am|pm)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d|^join us$/i.test(t);
  const main = clip(texts.find(real) || String(d.name).split(' · ')[0], 60);
  const out = [];
  if (focus.selected?.rel) out.push({ label: 'Restyle the selected picture', prompt: '', source: focus.selected.rel });
  out.push({ label: `An illustration of ${main}`, prompt: `An illustration of ${main}` });
  out.push({ label: `A warm, welcoming scene for ${main}`, prompt: `A warm, welcoming scene for ${main}` });
  out.push({ label: 'Something of my own…', prompt: '', own: true });
  return out;
}

// ------------------------------------------------------------------ Helper Passes
// A pass asks for a few options of one kind; the page can apply the one they pick (apply: the field).
const PASS_LIST = {
  clip: [
    { id: 'hooks', label: 'Hook ideas', apply: 'hook', maxWords: 8, ask: 'Write 4 on-screen hooks for this clip, 3 to 7 words each, true to what is said. Make people want to keep watching, without clickbait.' },
    { id: 'titles', label: 'Title ideas', apply: 'title', ask: 'Write 4 short, honest titles for this clip, under 60 characters each.' },
    { id: 'caption', label: 'Post caption', apply: 'summary', ask: 'Write 2 post captions for this clip, 1 or 2 sentences each, in the church\'s voice. No hashtags.' },
  ],
  project: [
    { id: 'angles', label: 'Clip ideas', ask: 'Name 4 moments from this sermon that would make strong short clips, each with a one-line reason. Quote a few words so they can find each one.' },
    { id: 'big-idea', label: 'The big idea', ask: 'Give 3 ways to say this sermon\'s main point in one sentence, for a caption or a slide.' },
  ],
  design: [
    { id: 'headline', label: 'Headline ideas', apply: 'text', maxWords: 6, ask: 'Write 4 short headlines for this design, 2 to 5 words each, short enough to read at a glance on a graphic. Use only facts from the design, the campaign and the calendar. Don\'t start with the church name.' },
    { id: 'caption', label: 'Caption for posting', ask: 'Write 2 captions to post with this design, 1 to 3 sentences each, with the key details (what, when, where) from the facts.' },
    { id: 'photos', label: 'Pick a photo', apply: 'image', pictures: true, ask: 'Pick the 3 pictures from their Brand library that would suit this design best. Answer with their exact names.' },
  ],
  writing: [
    { id: 'titles', label: 'Title ideas', apply: 'title', ask: 'Write 4 titles for this piece, under 65 characters each.' },
    { id: 'opening', label: 'Opening lines', ask: 'Write 3 warm opening lines for this piece, one sentence each, in the church\'s voice.' },
    { id: 'tighten', label: 'Tighten it', ask: 'Suggest 3 specific edits that would make this piece clearer and shorter. Quote the words to change and give the new words.' },
  ],
  campaign: [
    { id: 'captions', label: 'Caption ideas', ask: 'Write one short caption for each post in this campaign, in order, using only facts from the campaign and calendar.' },
    { id: 'next', label: 'What to add', ask: 'Suggest 3 more posts that would help this campaign, each with a day and a one-line idea.' },
  ],
  graphics: [{ id: 'make', label: 'What to design', ask: 'Look at what\'s coming up and recent sermons, and suggest 3 designs to make next, each with a one-line idea for the headline.' }],
  calendar: [{ id: 'plan', label: 'Plan this month', ask: 'Look at what\'s coming up and suggest which 3 events most need posts, and when to start promoting each.' }],
  social: [{ id: 'ideas', label: 'Post ideas', ask: 'Suggest 4 posts for this week based on what\'s coming up and recent sermons, each in one line.' }],
  home: [{ id: 'week', label: 'What to do this week', ask: 'Based on the calendar, recent sermons and campaigns, suggest the 3 most useful things to make this week, in one line each.' }],
};

export async function runPass({ focus, pass }) {
  const cfg = await loadConfig();
  if (!cfg.llmProvider || cfg.llmProvider === 'none') throw new Error('Turn on an AI helper in Settings first.');
  const { system, focus: f } = await systemFor(cfg, focus);
  const p = f.passes.find((x) => x.id === pass);
  if (!p) throw new Error('That helper pass isn\'t available here.');
  const shape = 'Answer with JSON only: {"options":["...","..."]}. Each option is plain text, ready to use, without numbering or quotes around it.';
  const prompt = `${p.ask} Give exactly the number asked for, each one different.\n\n${shape}`;
  let options;
  const parse = (txt) => {
    const t = String(txt).replace(/```(?:json)?/g, '');
    const a = t.indexOf('{'); const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { const o = JSON.parse(t.slice(a, b + 1)); if (Array.isArray(o.options)) return o.options; } catch { /* fall to lines */ } }
    return t.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 2);
  };
  if (p.pictures) {
    const d = await getDesign(focus.id).catch(() => null);
    const words = d ? `${d.name} ${(d.pages || []).flatMap((pg) => (pg.items || []).filter((i) => i.type === 'text').map((i) => i.text)).join(' ')}` : '';
    const all = await brandImages();
    const photos = all.filter((im) => im.folder !== 'Logos');
    const pics = rankImages(photos.length ? photos : all, words);
    if (!pics.length) throw new Error('Your Brand library has no photos yet. Add some in the Brand library first.');
    let names = [];
    try { names = parse(cfg.llmProvider === 'cshelper' ? (await llamaChat({ system, messages: [{ role: 'user', content: prompt }], temperature: 0.3, maxTokens: 300 })) : cfg.llmProvider === 'apple' ? await appleAsk({ system, prompt, temperature: 0.3 }) : await complete(cfg, system, prompt)); } catch { /* fall back to the best matches */ }
    const picked = names.map((n) => pics.find((im) => norm(n).includes(norm(im.name)))).filter(Boolean);
    const list = [...new Set([...picked, ...pics])].slice(0, 4);
    return { pass: p.id, label: p.label, apply: 'image', options: list.map((im) => ({ label: im.name, value: im.rel, thumb: im.url, note: im.alt || null })) };
  }
  if (cfg.llmProvider === 'cshelper') {
    const o = await llamaChat({ system, messages: [{ role: 'user', content: p.ask }], schema: { type: 'object', required: ['options'], properties: { options: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 } } }, temperature: 0.7, maxTokens: 900 });
    options = o.options;
  } else if (cfg.llmProvider === 'apple') {
    options = parse(await appleAsk({ system, prompt, temperature: 0.7 }));
  } else {
    options = parse(await complete(cfg, system, prompt));
  }
  options = (options || []).map((o) => String(o).replace(/^["“]|["”]$/g, '').trim()).filter(Boolean);
  // Short-form passes: keep options that fit; if none do, trim the shortest few.
  if (p.maxWords) {
    const fit = options.filter((o) => o.split(/\s+/).length <= p.maxWords);
    options = fit.length ? fit : options.sort((a, b) => a.length - b.length).slice(0, 3).map((o) => o.split(/\s+/).slice(0, p.maxWords).join(' '));
  }
  options = [...new Set(options)].slice(0, 6);
  if (!options.length) throw new Error('The helper didn\'t come up with anything. Try again.');
  return { pass: p.id, label: p.label, apply: p.apply || null, options };
}

// ------------------------------------------------------------------ chat history
// Kept per workspace in data/helper-chats.json: the newest 40 chats, each named by its first question.
const CHATS = () => path.join(DATA_DIR, 'helper-chats.json');
async function readChats() { try { return JSON.parse(await readFile(CHATS(), 'utf8')); } catch { return []; } }
export async function listChats() {
  return (await readChats()).map(({ messages, ...c }) => ({ ...c, count: messages.filter((m) => m.role === 'user').length }));
}
export async function getChat(id) { return (await readChats()).find((c) => c.id === id) || null; }
export async function saveChat(chat) {
  const all = await readChats();
  const msgs = (chat.messages || []).filter((m) => ['user', 'assistant', 'note'].includes(m.role)).slice(-80)
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 8000), ...(m.options ? { options: m.options, apply: m.apply || null } : {}), ...(m.refs ? { refs: m.refs } : {}), ...(m.actions ? { actions: m.actions } : {}), ...(m.pass ? { pass: true } : {}), ...(m.error ? { error: true } : {}) }));
  const firstQ = msgs.find((m) => m.role === 'user' && !m.pass)?.content || msgs.find((m) => m.role === 'user')?.content || 'New chat';
  const prev = all.find((c) => c.id === chat.id);
  const c = {
    id: chat.id || `c-${Date.now().toString(36)}`,
    title: String(chat.title || prev?.title || clip(firstQ, 60)).trim(),
    label: String(chat.label || prev?.label || '').slice(0, 120),
    created: prev?.created || new Date().toISOString(),
    updated: new Date().toISOString(),
    messages: msgs,
  };
  const next = [c, ...all.filter((x) => x.id !== c.id)].slice(0, 40);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CHATS(), JSON.stringify(next, null, 1));
  return { id: c.id, title: c.title, label: c.label, updated: c.updated };
}
export async function deleteChat(id) {
  const all = await readChats();
  await writeFile(CHATS(), JSON.stringify(all.filter((c) => c.id !== id), null, 1));
}

// ------------------------------------------------------------------ "Wondering what to work on today?"
// Starting points come straight from this church's data, so they're always real. The helper (if on)
// just writes a friendly line or two around them.
export async function whatToday() {
  const cfg = await loadConfig();
  const now = Date.now();
  const picks = [];
  const { events } = await cachedEvents();
  const camps = await listCampaigns().catch(() => []);
  const planned = new Set(camps.map((c) => c.event?.id).filter(Boolean));
  const soon = (events || []).filter((e) => Date.parse(e.start) > now && Date.parse(e.start) < now + 21 * 86400_000 && !planned.has(e.id)).sort((a, b) => a.start.localeCompare(b.start));
  for (const e of soon.slice(0, 2)) picks.push({ why: `${e.title} is ${day(e.start)} and has no posts planned yet.`, label: `Start a campaign for ${e.title}`, go: { name: 'calendar', campaign: { event: e } } });
  const projects = (await listProjects().catch(() => [])).filter((p) => p.status === 'transcribed');
  const fresh = projects[0];
  if (fresh && !fresh.clips) picks.push({ why: `"${fresh.title}" is transcribed but has no clips yet.`, label: `Find clips in ${fresh.title}`, go: { name: 'project', id: fresh.id, step: 'clips' } });
  else if (fresh && fresh.clips > fresh.exported) picks.push({ why: `"${fresh.title}" has ${fresh.clips - fresh.exported} clips not exported yet.`, label: `Finish clips from ${fresh.title}`, go: { name: 'project', id: fresh.id, step: 'edit' } });
  const gaps = (await gapReport().catch(() => ({ rows: [] }))).rows.filter((r) => r.missing?.length).slice(0, 1);
  for (const g of gaps) picks.push({ why: `"${g.title}" could still become ${g.missing.slice(0, 2).join(' and ').toLowerCase()}.`, label: `Open the content plan for ${g.title}`, go: { name: 'project', id: g.id, step: 'plan' } });
  if (cfg.youtubeChannel) {
    try {
      const items = await Promise.race([listChannel(cfg.youtubeChannel, { limit: 5 }), new Promise((_, r) => setTimeout(() => r(new Error('slow')), 6000))]);
      const have = new Set(projects.map((p) => p.youtubeId).filter(Boolean));
      const v = (items || []).find((x) => x.id && !have.has(x.id));
      if (v) picks.push({ why: `Your channel has a new video, "${v.title}", that isn't in Church Studio yet.`, label: 'Bring in your latest service', go: { name: 'library', pick: true } });
    } catch { /* offline or slow: skip */ }
  }
  if (!picks.length) picks.push({ why: 'Nothing is waiting on you right now.', label: 'Look at Inspiration for ideas', go: { name: 'inspiration' } });
  const top = picks.slice(0, 4);
  let text = `Here's where I'd start today:\n\n${top.map((p) => `- ${p.why}`).join('\n')}`;
  if (cfg.llmProvider && cfg.llmProvider !== 'none') {
    try {
      const sys = `${rules(cfg.llmProvider, cfg)}\nWrite one or two warm, short sentences that introduce these starting points for today. Don't list them again and don't add new ones.`;
      const intro = cfg.llmProvider === 'apple' ? await appleAsk({ system: sys, prompt: top.map((p) => p.why).join('\n'), temperature: 0.6 })
        : cfg.llmProvider === 'cshelper' ? await llamaChat({ system: sys, messages: [{ role: 'user', content: top.map((p) => p.why).join('\n') }], temperature: 0.6, maxTokens: 120 })
          : await complete(cfg, sys, top.map((p) => p.why).join('\n'));
      const short = (String(intro || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).slice(0, 2).join(' ').trim();
      if (short && !/^\W*I can only help/i.test(short)) text = `${short}\n\n${top.map((p) => `- ${p.why}`).join('\n')}`;
    } catch { /* the plain version is fine */ }
  }
  const refs = findRefs(text, await catalog(), {});
  return { text, refs, actions: top.map(({ label, go }) => ({ label, go })) };
}

// ------------------------------------------------------------------ Bible references
// Small models remember references well but misquote the wording. Keep real references, drop ones that don't
// exist, remove any wording the model wrote, and add the exact wording from the World English Bible.
export function groundVerses(text) {
  const found = new Map();
  const lines = String(text).split('\n').map((line) => {
    const refs = refsIn(line);
    if (!refs.length) return line;
    let out = line.replace(/\s*[-–—:]?\s*["“][^"”]{6,}["”]\s*/g, ' ');
    let bad = 0;
    for (const r of refs) {
      const v = lookup(r.book, r.chapter, r.from, r.to);
      if (v) found.set(v.ref, v); else { bad++; out = out.replace(r.raw, '').replace(/\s{2,}/g, ' '); }
    }
    // A list line that was only a made-up reference goes away.
    if (bad && !refsIn(out).length && /^\s*(?:[-*•]|\d+[.)])\s*[\W]*$/.test(out)) return null;
    return out.replace(/\s+([.,;])/g, '$1').trimEnd();
  }).filter((l) => l !== null);
  let out = lines.join('\n');
  if (!found.size) return out;
  const list = [...found.values()].slice(0, 6).map((v) => `- **${v.ref}**: “${v.text}”`).join('\n');
  return `${out}\n\n${list}\n\n*Wording from the ${TRANSLATION} (public domain). Check it against your church's translation.*`;
}

// ------------------------------------------------------------------ what the minister said
// Questions of belief aren't the helper's to answer. If a saved sermon covered it, point to that spot.
const BELIEF = /\b(salvation|saved|bapti[sz]\w*|sin|sins|sinful|heaven|hell|grace|faith|believe|belief|trinity|communion|lord'?s supper|holy spirit|resurrection|marriage|divorce|tith\w*|forgiv\w*|repent\w*|eternal|judgment|second coming|rapture|predestin\w*|prayer|pray|worship|scripture|doctrine|gospel|church membership|creation|evolution|abortion|sexuality|gay|homosexual\w*|alcohol|drinking|instrument\w*|speaking in tongues|gifts of the spirit)\b/i;
export function isBeliefQuestion(q) {
  if (!BELIEF.test(q)) return false;
  return /\?|\b(is it|is there|are we|do we|does god|does the bible|what does|should (we|i|christians)|can (we|i|christians)|required|necessary|okay to|ok to|allowed|believe about|teach about|stance|view on|position on)\b/i.test(q);
}
const clock = (t) => { const s = Math.max(0, Math.round(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const stem = (w) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');
const sentCache = new Map(); // projectId -> { mtime, sentences }
async function sentencesOf(id) {
  const f = projectFile(id, 'transcript.json');
  const st = await stat(f).catch(() => null);
  if (!st) return [];
  const c = sentCache.get(id);
  if (c && c.mtime === st.mtimeMs) return c.sentences;
  const t = await getTranscript(id).catch(() => null);
  const sentences = t?.words?.length ? toSentences(t.words) : [];
  sentCache.set(id, { mtime: st.mtimeMs, sentences });
  return sentences;
}
const QSTOP = new Set(['what', 'does', 'bible', 'say', 'about', 'should', 'would', 'could', 'christian', 'christians', 'believe', 'church', 'there', 'their', 'that', 'this', 'with', 'have', 'from', 'your', 'teach', 'think', 'okay', 'allowed', 'required', 'necessary']);
/** The best passages across saved sermons for a question: up to 3, at least two of its words. */
export async function sermonMoments(question, n = 3) {
  const terms = [...new Set((question.toLowerCase().match(/[a-z']{4,}/g) || []).filter((w) => !QSTOP.has(w)).map(stem))];
  if (!terms.length) return [];
  const hits = [];
  for (const p of (await listProjects().catch(() => [])).filter((x) => x.status === 'transcribed')) {
    const sents = await sentencesOf(p.id);
    for (let i = 0; i < sents.length; i++) {
      const win = sents.slice(i, i + 3);
      const words = new Set(win.flatMap((x) => (x.text.toLowerCase().match(/[a-z']{3,}/g) || []).map(stem)));
      const got = terms.filter((t) => words.has(t));
      const need = Math.min(2, terms.length);
      if (got.length < need) continue;
      // Start at the first sentence that actually says it.
      const has = (x) => terms.some((t) => (x.text.toLowerCase().match(/[a-z']{3,}/g) || []).map(stem).includes(t));
      const from = win.findIndex(has);
      const part = win.slice(Math.max(0, from));
      hits.push({ projectId: p.id, title: p.title, start: part[0].start, end: part[part.length - 1].end, text: part.map((x) => x.text).join(' '), score: got.length * 10 - i / 1000 });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const out = [];
  for (const h of hits) {
    const same = (o) => { const A = new Set(o.text.toLowerCase().match(/[a-z']+/g)); const B = new Set(h.text.toLowerCase().match(/[a-z']+/g)); return [...B].filter((w) => A.has(w)).length / Math.max(1, Math.min(A.size, B.size)) > 0.8; };
    if (out.some((o) => (o.projectId === h.projectId && Math.abs(o.start - h.start) < 60) || same(o))) continue;
    out.push(h); if (out.length >= n) break;
  }
  return out;
}
