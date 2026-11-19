// The content plan for one sermon: everything that can be made from it, and what's already made.
// One source, many pieces: clips, writing, designs, audio and posts, all linked back to the sermon.
import { getProject } from './projects.js';
import { loadConfig } from './config.js';
import { loadDraft } from './writing.js';
import { listDesigns } from './designs.js';
import * as socialStore from './social/store.js';

export async function contentPlan(projectId) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Not found');
  const draft = await loadDraft(projectId).catch(() => null);
  const designs = (await listDesigns()).filter((d) => d.source?.projectId === projectId);
  const posts = (await socialStore.listPosts()).filter((p) => p.media?.projectId === projectId);
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
  return {
    project: { id: project.id, title: project.title, thumbnail: project.thumbnail, series: project.series || null, refs: draft?.refs || [] },
    // Pieces set aside in the content plan stay listed as ideas but don't count.
    pieces, ...(() => { const on = pieces.filter((p) => !off.has(p.id)); return { done: on.filter((p) => p.done).length, total: on.length }; })(),
    designs: designs.map((d) => ({ id: d.id, name: d.name, thumb: d.thumb, template: d.source?.template })),
    podcasts: project.podcasts || [],
  };
}
