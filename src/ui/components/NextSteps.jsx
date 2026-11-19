import { useState } from 'react';
import { CalendarClock, CheckCircle2, Clapperboard, FolderOpen, Heart, LayoutGrid, PenLine, Printer, Quote, ScissorsLineDashed, Send, Shapes } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { isOn } from '../tools.js';
import { nextNote } from '../encourage.js';
import Modal from './Modal.jsx';

/**
 * "What's next?" after finishing something: ways to reuse what was just made in the other tools.
 * info: { kind: 'clip' | 'writing' | 'design', title, ... }
 */
export default function NextSteps({ info, onClose }) {
  const { go, config, toast } = useApp();
  const [note] = useState(() => nextNote());
  const to = (r) => { onClose(); go(r); };
  const on = (t) => isOn(config, t);
  let head; let ideas = [];
  if (info.kind === 'clip') {
    head = { title: 'Your clip is ready', sub: info.title, thumb: info.thumb };
    ideas = [
      on('social') && [Send, 'Post or schedule it', 'Pick your accounts and a time.', () => to({ name: 'social', compose: { projectId: info.projectId, clipId: info.clipId } })],
      on('writing') && [PenLine, 'Write a blog from this sermon', 'The transcript is already there.', () => to({ name: 'writing', project: info.projectId })],
      on('graphics') && [Quote, 'Make a quote graphic', 'Turn the clip’s best line into a post.', () => to({ name: 'graphics', quote: info.quote || info.title })],
      on('graphics') && [LayoutGrid, 'Design a carousel', 'Sermon points as swipeable slides.', () => to({ name: 'graphics' })],
      on('library') && [ScissorsLineDashed, 'Cut more clips', 'Get more out of the same video.', () => to({ name: 'project', id: info.projectId, step: 'clips' })],
    ];
  } else if (info.kind === 'writing') {
    head = { title: 'Nice writing', sub: info.title };
    ideas = [
      on('social') && [Send, 'Share it on social', 'Start a post with the summary.', () => to({ name: 'social', caption: info.caption || info.title })],
      on('graphics') && [Quote, 'Make a quote graphic', 'Pull one line into a branded post.', () => to({ name: 'graphics', quote: info.quote || info.title })],
      [Printer, 'Print or save a PDF', 'Use the Print or PDF button in Writing.', onClose],
      [Heart, 'Save it to your brand voice', 'Future drafts learn from it.', async () => { try { await api.post('/api/brand-voice/samples', { title: info.title, text: info.text, source: 'writing' }); toast({ text: 'Saved to your brand voice.' }); } catch (e) { toast({ kind: 'error', text: e.message }); } onClose(); }],
      info.projectId && on('library') && [Clapperboard, 'Make clips from the same sermon', 'Short videos to go with the post.', () => to({ name: 'project', id: info.projectId })],
    ];
  } else {
    head = { title: 'Your design is saved', sub: info.title, thumb: info.thumb };
    ideas = [
      on('social') && [CalendarClock, 'Schedule a post', 'Pick a day on your calendar.', () => to({ name: 'social' })],
      [FolderOpen, 'Show it in Finder', 'It’s in Graphics in your brand library.', () => { api.post('/api/library/reveal', { rel: info.rel }); onClose(); }],
      on('library') && [Clapperboard, 'Use it in a clip', 'As an end card or a corner logo.', () => to({ name: 'library' })],
      on('graphics') && [Shapes, 'Make a matching story', 'Same look, sized for stories.', () => to({ name: 'graphics' })],
      on('writing') && [PenLine, 'Write about it', 'A post or email to go with it.', () => to({ name: 'writing' })],
    ];
  }
  ideas = ideas.filter(Boolean).slice(0, 5);
  return (
    <Modal onClose={onClose} width={560} label="What's next">
      <div className="row" style={{ gap: 14 }}>
        {head.thumb ? <img className="next-thumb" src={head.thumb} alt="" /> : <span className="type-badge" style={{ width: 46, height: 46, '--t': 'var(--ok)' }}><CheckCircle2 size={22} /></span>}
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{head.title}</h2>
          {head.sub && <span className="muted small truncate">{head.sub}</span>}
        </div>
      </div>
      <span className="eyebrow">What's next? Get more out of it</span>
      <div className="stack" style={{ gap: 6 }}>
        {ideas.map(([Icon, title, sub, run]) => (
          <button key={title} className="make-action" onClick={run}>
            <span className="row" style={{ gap: 10 }}><span className="feed-icon"><Icon size={15} /></span><span className="stack" style={{ gap: 0 }}><strong>{title}</strong><span className="small muted">{sub}</span></span></span>
          </button>
        ))}
      </div>
      <p className="next-note">{note}</p>
      <button className="btn ghost sm" onClick={onClose}>Done for now</button>
    </Modal>
  );
}
