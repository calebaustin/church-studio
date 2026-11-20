// A friendly hello the first time someone opens a tool: what it's for, a few steps, and buttons to try
// something right away. "Got it" puts it away for good.
import { CalendarDays, Clapperboard, FolderHeart, LayoutGrid, PenLine, Send, Shapes, X } from 'lucide-react';
import { useApp } from '../App.jsx';

// Buttons either go somewhere ({ go }) or press a button on this screen by its label ({ press }).
const INTROS = {
  library: { icon: Clapperboard, tone: 1, title: 'This is Videos', body: 'Turn Sunday’s sermon, or any recording, into captioned clips you can post.',
    steps: ['Bring in a video from YouTube or this Mac.', 'Transcribe it, right here on your Mac.', 'Pick the best moments and export them as clips.'],
    actions: [['Pick from your channel', { press: 'Pick from a channel' }], ['Open a file from this Mac', { press: 'From a file' }]] },
  calendar: { icon: CalendarDays, tone: 2, title: 'This is your Calendar', body: 'Church events, posts you’ve planned, campaigns, and ideas for what’s next, all in one place.',
    steps: ['Link your church calendar so events show up.', 'Click an event to make a graphic or plan posts.', 'Open Inspiration for ideas and the seasons ahead.'],
    actions: [['Link a calendar', { go: { name: 'settings', section: 'connections' } }], ['Start a campaign', { press: 'Campaigns' }], ['See Inspiration', { press: 'Inspiration' }]] },
  social: { icon: Send, tone: 3, title: 'This is Social', body: 'Post and schedule to your accounts, and read comments in one place.',
    steps: ['Connect an account, or post by hand to any site.', 'Attach a clip or design and write a caption.', 'Post now or pick a time.'],
    actions: [['Connect an account', { press: 'Accounts' }], ['New post', { press: '+ New post' }]] },
  writing: { icon: PenLine, tone: 4, title: 'This is Writing', body: 'Blog posts, emails, newsletters and small group guides, in your church’s voice.',
    steps: ['Start blank, from a sermon, an event or a newsletter.', 'Fill in the [bracketed] spots.', 'Copy it formatted for your website or email tool.'],
    actions: [['Blank post', { press: 'Blank post' }], ['Newsletter', { press: 'Newsletter' }]] },
  graphics: { icon: Shapes, tone: 5, title: 'This is Design', body: 'Graphics, stories, flyers and slides with your church’s name, colors and fonts already in them.',
    steps: ['Press Create new, or pick a kind of design.', 'Choose a template. Your details fill in.', 'Add a photo, then export or plan a post.'],
    actions: [['Create new', { press: 'Create new' }], ['Browse templates', { press: 'Templates' }]] },
  assets: { icon: FolderHeart, tone: 6, title: 'This is your Brand library', body: 'Your logo, colors, fonts, photos and voice. Every tool starts from these.',
    steps: ['Add your logo, or pull it from your website.', 'Pick your colors and fonts.', 'Add photos with a few words so you can find them later.'],
    actions: [['Set up from website', { press: 'Set up from website' }], ['Add files', { press: 'Add files' }]] },
  projects: { icon: LayoutGrid, tone: 1, title: 'This is All projects', body: 'Every sermon, clip, piece of writing and design you’ve made.',
    steps: ['Star what you come back to, and make folders.', 'Tag things, or archive what you’re done with.', 'Press ⌘K anywhere to search everything.'], actions: [] },
};

export const introSeen = (config, id) => Boolean(config.toolIntros?.[id]) || !INTROS[id];

export default function ToolIntro({ id }) {
  const { config, saveConfig, go } = useApp();
  const intro = INTROS[id];
  if (!intro || config.toolIntros?.[id]) return null;
  const done = () => saveConfig({ toolIntros: { ...(config.toolIntros || {}), [id]: true } });
  const act = async (a) => {
    await done();
    if (a.go) return go(a.go);
    // Press the matching button on this screen, after the intro has made room.
    setTimeout(() => {
      const b = [...document.querySelectorAll('.main button')].find((x) => x.textContent.trim().startsWith(a.press));
      if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.click(); }
    }, 60);
  };
  const Icon = intro.icon;
  return (
    <section className="glass strong panel tool-intro" aria-label={intro.title}>
      <button className="modal-x" aria-label="Got it" title="Got it" onClick={done}><X size={16} /></button>
      <span className={`cn-icon tone tone-${intro.tone}`} style={{ width: 44, height: 44, borderRadius: 14 }}><Icon size={22} /></span>
      <div className="stack" style={{ gap: 8, minWidth: 0 }}>
        <div className="stack" style={{ gap: 2 }}><h2 style={{ margin: 0 }}>{intro.title}</h2><span className="muted">{intro.body}</span></div>
        <ol className="tool-intro-steps">{intro.steps.map((x) => <li key={x}>{x}</li>)}</ol>
        <div className="row wrap" style={{ gap: 6 }}>
          {intro.actions.map(([label, a], i) => <button key={label} className={`btn sm ${i === 0 ? 'primary' : ''}`} onClick={() => act(a)}>{label}</button>)}
          <button className="btn sm ghost" onClick={done}>Got it</button>
        </div>
      </div>
    </section>
  );
}
