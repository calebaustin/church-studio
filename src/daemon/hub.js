// The content plan for one sermon: everything that can be made from it, and what's already made.
// One source, many pieces: clips, writing, designs, audio and posts, all linked back to the sermon.
import { getProject } from './projects.js';
import { loadConfig } from './config.js';
import { loadDraft, outline, savedDigest } from './writing.js';
import { forProject } from './insights.js';
import { postSermon, sermonLinks } from './links.js';
import { listDesigns } from './designs.js';
import * as socialStore from './social/store.js';

// "This week, we can apply this by praying daily." -> "Pray daily." style: the plain action, short.
const step = (t) => {
  let x = String(t || '').trim().replace(/^this week,?\s*/i, '').replace(/^(we|you|believers|christians|they)( can| should| could)? apply this( principle| truth| lesson)? by\s+/i, '');
  if (!x) return '';
  x = x.replace(/^./, (c) => c.toUpperCase());
  return x.length > 150 ? `${x.slice(0, 147).replace(/[\s,;:]+\S*$/, '')}…` : x;
};

export async function contentPlan(projectId) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Not found');
  const draft = await loadDraft(projectId).catch(() => null);
  const designs = (await listDesigns()).filter((d) => d.source?.projectId === projectId);
  const posts = (await socialStore.listPosts()).filter((p) => postSermon(p) === projectId);
  const kept = project.clips.filter((c) => c.status === 'kept' || c.status === 'exported');
  const exported = project.clips.filter((c) => c.export);
  const hasWords = (k) => Boolean(draft?.[k] && String(draft[k]).replace(/\[[^\]]*\]/g, '').trim().length > 40);
  const design = (tpl) => designs.find((d) => d.source?.template === tpl) || null;
  const video = Boolean(project.media?.width);
  const off = new Set((await loadConfig()).planHidden || []);
  const pieces = [
    { id: 'transcript', group: 'Words', label: 'Transcript', done: project.status === 'transcribed', note: project.status === 'transcribed' ? 'Ready to read and share' : 'Transcribe first' },
    video && { id: 'clips', group: 'Video', label: 'Short clips', done: exported.length >= 3, note: `${exported.length} exported, ${kept.length} kept`, count: exported.length },
    { id: 'blog', group: 'Words', label: 'Blog post', done: hasWords('blog') },
    { id: 'email', group: 'Words', label: 'Email summary', done: hasWords('email') },
    { id: 'group', group: 'Words', label: 'Discussion guide', done: hasWords('group') },
    { id: 'devotional', group: 'Words', label: 'Devotional', done: hasWords('devotional') },
    { id: 'social', group: 'Words', label: 'Social captions', done: hasWords('social') },
    { id: 'quote', group: 'Design', label: 'Quote graphic', done: Boolean(design('post-quote')), designId: design('post-quote')?.id },
    { id: 'car-recap', group: 'Design', label: 'Recap carousel', done: Boolean(design('car-recap')), designId: design('car-recap')?.id },
    { id: 'story-recap', group: 'Design', label: 'Story set', done: Boolean(design('story-recap')), designId: design('story-recap')?.id },
    { id: 'deck-sermon', group: 'Design', label: 'Sermon slides', done: Boolean(design('deck-sermon')), designId: design('deck-sermon')?.id },
    { id: 'notes-blanks', group: 'Design', label: 'Fill-in notes', done: Boolean(design('notes-blanks')), designId: design('notes-blanks')?.id },
    video && { id: 'thumb-sermon', group: 'Design', label: 'YouTube thumbnail', done: Boolean(design('thumb-sermon')), designId: design('thumb-sermon')?.id },
    { id: 'podcast', group: 'Audio', label: 'Podcast episode', done: Boolean(project.podcasts?.length), note: project.podcasts?.[0] ? `Made ${new Date(project.podcasts[0].at).toLocaleDateString()}` : '' },
    { id: 'posts', group: 'Share', label: 'Posts scheduled or shared', done: posts.length > 0, note: `${posts.length} post${posts.length === 1 ? '' : 's'}`, count: posts.length },
  ].filter(Boolean).map((p) => (off.has(p.id) ? { ...p, aside: true } : p));
  // The sermon at a glance, for the top of the Sermon page.
  const facts = project.status === 'transcribed' ? await forProject(projectId).catch(() => null) : null;
  const sum = project.status === 'transcribed' ? await outline(projectId).catch(() => null) : null;
  // With a helper's digest, the main points and next steps are its short claims, not lines lifted from the talk.
  const digest = project.status === 'transcribed' ? await savedDigest(projectId) : null;
  const refs = [];
  for (const r of facts?.refs || []) if (!refs.some((x) => x.ref === r.ref)) refs.push(r);
  const sermon = {
    date: project.created, duration: project.media?.duration ?? null, watch: project.sourceUrl || null, poster: project.poster || null,
    refs: refs.slice(0, 8), themes: (facts?.themes || []).slice(0, 8), stories: facts?.stories?.length || 0,
    bigIdea: sum?.quotes?.[0] || null,
    points: digest ? digest.map((d) => d.point).filter(Boolean).slice(0, 5) : (sum?.points || []).slice(0, 4).map((p) => p.heading).filter(Boolean),
    steps: digest ? [...new Set(digest.map((d) => step(d.apply)).filter(Boolean))].slice(0, 3) : (sum?.steps || []).slice(0, 2),
    digest: Boolean(digest),
  };
  return {
    project: { id: project.id, title: project.title, thumbnail: project.thumbnail, series: project.series || null, refs: draft?.refs || [] },
    sermon, links: await sermonLinks(projectId),
    // Pieces set aside in the content plan stay listed as ideas but don't count.
    pieces, ...(() => { const on = pieces.filter((p) => !off.has(p.id)); return { done: on.filter((p) => p.done).length, total: on.length }; })(),
    designs: designs.map((d) => ({ id: d.id, name: d.name, thumb: d.thumb, template: d.source?.template })),
    podcasts: project.podcasts || [],
  };
}
