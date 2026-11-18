// The tools in the sidebar. People turn off what they don't use and put the rest in their order.
// Dashboard and Settings is always there; everything else can be hidden or moved.
import { Clapperboard, FolderHeart, LayoutGrid, PenLine, Send, Shapes } from 'lucide-react';

export const TOOLS = [
  { id: 'projects', label: 'All projects', icon: LayoutGrid, work: 'Find anything', about: 'Every sermon, clip, draft and design in one place, with folders.' },
  { id: 'library', label: 'Videos', icon: Clapperboard, work: 'Videos, clips and transcripts', about: 'Download or open a recording, transcribe it and make captioned clips.' },
  { id: 'social', label: 'Social', icon: Send, work: 'Social media', about: 'Plan, schedule and post to your accounts, with a calendar.' },
  { id: 'writing', label: 'Writing', icon: PenLine, work: 'Writing', about: 'Blog posts, emails and small group guides from a sermon.' },
  { id: 'graphics', label: 'Graphics', icon: Shapes, work: 'Graphics and slides', about: 'Posts, stories, flyers and slide decks you can present.' },
  { id: 'assets', label: 'Brand library', icon: FolderHeart, work: 'Brand library', about: 'Logos, photos, colors and fonts that every tool uses.' },
];

/** Tools in the person's order, with the hidden ones left out. */
export function enabledTools(config) {
  const off = new Set(config?.toolsOff || []);
  const order = config?.toolOrder?.length ? config.toolOrder : TOOLS.map((t) => t.id);
  const known = new Map(TOOLS.map((t) => [t.id, t]));
  const ids = [...order.filter((id) => known.has(id)), ...TOOLS.map((t) => t.id).filter((id) => !order.includes(id))];
  return ids.filter((id) => !off.has(id)).map((id) => known.get(id));
}
export const isOn = (config, id) => !(config?.toolsOff || []).includes(id);
