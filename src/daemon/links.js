// The sermon as the hub: everything made from a sermon points back to it, so one Sermon page can show it all.
// Links reuse fields the app already stores, so older work keeps its links with no migration:
//   designs  -> design.source.projectId
//   writing  -> the sermon's own draft (saved under the sermon's id), or a standalone draft's source.projectId
//   posts    -> post.sermonId, or the sermon of the clip or design attached (media.projectId)
//   campaigns-> campaign.projectId
import { getDesign, listDesigns, saveDesign } from './designs.js';
import { isStandalone, listDrafts, loadDraft, saveDraft } from './writing.js';
import { listCampaigns, setCampaignSermon } from './campaigns.js';
import * as socialStore from './social/store.js';
import { getProject, listProjects } from './projects.js';

export const postSermon = (p) => p.sermonId || p.media?.projectId || null;

/** Everything tied to one sermon. */
export async function sermonLinks(projectId) {
  const designs = (await listDesigns()).filter((d) => d.source?.projectId === projectId)
    .map((d) => ({ id: d.id, title: d.name, thumb: d.thumb || null, sub: d.kind || 'Design', updated: d.updated }));
  const drafts = [];
  const own = await loadDraft(projectId).catch(() => null);
  if (own) drafts.push({ id: projectId, title: own.title || 'Writing from this sermon', sub: 'Blog, email, guide and captions', own: true, updated: own.saved || own.generated });
  for (const d of await listDrafts()) {
    if (!isStandalone(d.id)) continue;
    const full = await loadDraft(d.id).catch(() => null);
    if (full?.source?.projectId === projectId) drafts.push({ id: d.id, title: d.title, sub: d.source === 'newsletter' ? 'Newsletter' : 'Writing', updated: d.updated });
  }
  const posts = (await socialStore.listPosts()).filter((p) => postSermon(p) === projectId)
    .map((p) => ({ id: p.id, title: p.title || (p.caption || '').slice(0, 60) || 'Post', sub: p.status, when: p.scheduledAt || p.plannedAt || p.publishedAt || null, thumb: p.media?.thumb || null }));
  const campaigns = (await listCampaigns()).filter((c) => c.projectId === projectId)
    .map((c) => ({ id: c.id, title: c.name, sub: `${c.steps.length} posts`, when: c.date }));
  return { designs, writing: drafts, posts, campaigns };
}

/** Tie one item to a sermon, or untie it (projectId null). kind: design | writing | post | campaign. */
export async function setLink(kind, id, projectId) {
  if (projectId && !(await getProject(projectId).catch(() => null))) throw new Error('That sermon is gone.');
  if (kind === 'design') {
    const d = await getDesign(id);
    await saveDesign(id, { ...d, source: { ...(d.source || {}), projectId: projectId || null } });
  } else if (kind === 'writing') {
    if (!isStandalone(id)) throw new Error('This writing belongs to its own sermon.');
    const d = await loadDraft(id);
    if (!d) throw new Error('That writing is gone.');
    await saveDraft(id, { ...d, source: { ...(d.source || {}), projectId: projectId || null } });
  } else if (kind === 'post') {
    await socialStore.updatePost(id, (p) => ({ ...p, sermonId: projectId || null }));
  } else if (kind === 'campaign') {
    await setCampaignSermon(id, projectId);
  } else throw new Error('Unknown kind');
  return { ok: true };
}

/** Things that could be tied to a sermon but aren't yet, for the "Link something" picker. */
export async function linkCandidates() {
  const designs = (await listDesigns()).filter((d) => !d.source?.projectId).map((d) => ({ kind: 'design', id: d.id, title: d.name, thumb: d.thumb || null, sub: d.kind || 'Design' }));
  const writing = [];
  for (const d of await listDrafts()) {
    if (!isStandalone(d.id)) continue;
    const full = await loadDraft(d.id).catch(() => null);
    if (!full?.source?.projectId) writing.push({ kind: 'writing', id: d.id, title: d.title, sub: 'Writing' });
  }
  const posts = (await socialStore.listPosts()).filter((p) => !postSermon(p)).map((p) => ({ kind: 'post', id: p.id, title: p.title || (p.caption || '').slice(0, 60) || 'Post', sub: p.status }));
  const campaigns = (await listCampaigns()).filter((c) => !c.projectId).map((c) => ({ kind: 'campaign', id: c.id, title: c.name, sub: 'Campaign' }));
  return [...designs, ...writing, ...posts, ...campaigns];
}

/** Sermons to pick from: transcribed, newest first. */
export async function sermonChoices() {
  return (await listProjects()).filter((p) => p.status === 'transcribed').map((p) => ({ id: p.id, title: p.title, date: p.created, thumb: p.thumbnail || null }));
}

/** Which sermon an item is tied to (for the pickers). */
export async function linkOf(kind, id) {
  if (kind === 'design') return (await getDesign(id).catch(() => null))?.source?.projectId || null;
  if (kind === 'writing') return isStandalone(id) ? (await loadDraft(id).catch(() => null))?.source?.projectId || null : id;
  if (kind === 'post') { const p = await socialStore.getPost(id); return p ? postSermon(p) : null; }
  if (kind === 'campaign') return (await listCampaigns()).find((c) => c.id === id)?.projectId || null;
  return null;
}
