import { useEffect, useState } from 'react';
import ConnectionsHub from '../components/ConnectionsHub.jsx';
import Modal, { ModalHead } from '../components/Modal.jsx';
import { Lightbulb, Plus, ArrowRight, Check, Layers, MonitorPlay, Palette, Target, Send, Sparkles, FolderHeart, Search , Link2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import Activity from '../components/Activity.jsx';
import JumpstartCard from '../components/Jumpstart.jsx';

/** Ideas sourced from what the app can do, personalized with topics from the user's sermons. */
function ideasFor(topics, sermons) {
  const t = topics[0] || 'grace';
  const s = sermons[0];
  return [
    { title: `Quote card about “${t}”`, about: 'A strong line from Sunday on a branded background.', go: { name: 'graphics' }, tool: 'Design' },
    s && { title: `Recap blog for “${s.title.slice(0, 40)}”`, about: 'Written from the sermon, with an SEO check.', go: { name: 'writing' }, tool: 'Writing' },
    s && { title: 'Small group questions', about: 'Discussion guide from this week’s message.', go: { name: 'writing' }, tool: 'Writing' },
    { title: 'Three-stack reel', about: 'The full shot three times. Great for wide stage cameras.', go: { name: 'library' }, tool: 'Clips' },
    { title: 'Announcement with a QR code', about: 'Event or giving link people can scan.', go: { name: 'graphics' }, tool: 'Design' },
    { title: 'Weekly email summary', about: 'Three takeaways and a link to watch.', go: { name: 'writing' }, tool: 'Writing' },
    { title: 'Schedule the week', about: 'Plan a clip a day on the calendar.', go: { name: 'calendar' }, tool: 'Calendar' },
  ].filter(Boolean);
}

export default function MyApp({ section } = {}) {
  useEffect(() => { if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400); }, [section]);
  const { config, saveConfig, themes, go, toast } = useApp();
  const [ideas, setIdeas] = useState(null);
  const [ws, setWs] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [lib, setLib] = useState(null);
  const [newName, setNewName] = useState('');
  const [connecting, setConnecting] = useState(section === 'connections');
  useEffect(() => {
    api.get('/api/ideas').then(setIdeas).catch(() => setIdeas({ topics: [], sermons: [] }));
    api.get('/api/workspaces').then(setWs);
    api.get('/api/social/accounts').then((r) => setAccounts(r.accounts));
    api.get('/api/library').then(setLib).catch(() => {});
  }, []);
  const theme = themes.app.find((t) => t.id === config.appTheme);
  const dark = themes.app.find((t) => t.id === config.appThemeDark);
  const caption = themes.video.find((t) => t.id === config.videoTheme);
  const current = ws?.list.find((w) => w.id === ws.active);

  const create = async () => {
    try {
      const { workspace } = await api.post('/api/workspaces', { name: newName });
      setNewName('');
      setWs(await api.get('/api/workspaces'));
      toast({ text: `Created “${workspace.name}”.`, action: { label: 'Switch to it', run: () => switchTo(workspace.id) } });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const switchTo = async (id) => {
    await api.post(`/api/workspaces/${id}/switch`);
    toast({ text: 'Switching workspace…' });
    setTimeout(() => window.location.reload(), 2500);
  };

  const rows = [
    [MonitorPlay, 'YouTube channel', config.youtubeChannel || 'Not added', () => go({ name: 'settings', section: 'youtube' })],
    [Palette, 'App theme', `${theme?.name || 'Default'} · ${dark?.name || 'Default'} at night · ${config.appearance === 'system' ? 'matches your Mac' : config.appearance}`, () => go({ name: 'settings', section: 'app-theme' })],
    [Layers, 'Caption theme', caption?.name || 'Default', () => go({ name: 'settings', section: 'video-themes' })],
    [Target, 'Weekly goal', `${config.weeklyGoal || 5} clips`, () => go({ name: 'home' })],
    [Link2, 'Connections', 'Social pages and sign-ins, calendar and automatic posting', () => setConnecting(true)],
    [Sparkles, 'AI helper', ({ none: 'Off', apple: 'Apple Intelligence', cshelper: 'CS Helper', anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', ollama: 'Ollama' })[config.llmProvider || 'none'] || 'Off', () => go({ name: 'settings', section: 'ai' })],
    [FolderHeart, 'Brand library', lib ? `${lib.items.length} files` : '…', () => go({ name: 'assets' })],
  ];

  return (
    <div className="page">
      <div className="stack" style={{ gap: 2 }}>
        <span className="eyebrow">{current ? `Workspace: ${current.name}` : 'Workspace'}</span>
        <div className="row between wrap" style={{ gap: 10 }}>
          <h1>My App</h1>
          <button className="btn" onClick={() => setConnecting(true)}><Link2 size={15} />Connections</button>
        </div>
        <span className="muted">Your settings at a glance, and ideas for what to make next.</span>
      </div>
      {connecting && (
        <Modal onClose={() => setConnecting(false)} width={860} label="Connections">
          <ModalHead title="Connections" sub="Your social pages and sign-ins, your church calendar and automatic posting, in one place. Social › Accounts shows the same." />
          <ConnectionsHub apiAccounts={
            <section className="glass panel row between wrap" style={{ gap: 10 }}>
              <div className="stack" style={{ gap: 2 }}><strong>Automatic posting</strong><span className="small muted">{accounts?.length ? accounts.map((a) => a.label).join(', ') : 'Accounts that post on a schedule through each site’s own connection.'}</span></div>
              <button className="btn sm" onClick={() => { setConnecting(false); go({ name: 'social', tab: 'accounts' }); }}>Manage in Social</button>
            </section>
          } />
        </Modal>
      )}

      <div className="myapp-cols">
        <div className="stack">
        <section className="glass strong panel stack">
          <h2>Your setup</h2>
          {rows.map(([I, label, value, onClick]) => (
            <button key={label} className="feed-item" onClick={onClick}>
              <span className="feed-icon"><I size={16} /></span>
              <div className="stack grow" style={{ gap: 0 }}><strong>{label}</strong><span className="muted small truncate">{value}</span></div>
              <ArrowRight size={15} className="muted" />
            </button>
          ))}
        </section>

        <JumpstartCard />

        <section className="glass strong panel stack">
          <div className="row between"><h2>Workspaces</h2><span className="muted small">One per brand or ministry</span></div>
          <p className="muted small">Each workspace keeps its own channel, sermons, themes, social accounts and brand library.</p>
          {ws?.list.map((w) => (
            <div key={w.id} className="feed-item">
              <span className="feed-icon"><Layers size={16} /></span>
              <div className="stack grow" style={{ gap: 0 }}><strong>{w.name}</strong><span className="muted small">{w.id === ws.active ? 'Open now' : 'Not open'}</span></div>
              {w.id === ws.active ? <span className="chip ok"><Check size={12} />Current</span> : <button className="btn sm" onClick={() => switchTo(w.id)}>Switch</button>}
            </div>
          ))}
          <div className="row">
            <input className="input" placeholder="New workspace name, like Youth Ministry" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create()} />
            <button className="btn" disabled={!newName.trim()} onClick={create}><Plus size={14} />Add</button>
          </div>
          <span className="hint">Switching restarts the app engine. It takes a couple of seconds.</span>
        </section>
        </div>

        <div className="stack">
          <section className="glass panel row between wrap" style={{ gap: 12 }}>
            <div className="stack" style={{ gap: 2 }}><strong>Welcome walkthrough</strong><span className="muted small">See the welcome again, with the website jumpstart.</span></div>
            <button className="btn sm" onClick={async () => { await saveConfig({ onboarded: false }); go({ name: 'home' }); }}><Sparkles size={14} />Start the walkthrough</button>
          </section>
          <Activity />
        </div>
      </div>

      <section className="stack">
        <div className="row between"><h2 className="row" style={{ gap: 8 }}><Lightbulb size={20} />Ideas for you</h2></div>
        {ideas?.topics?.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="muted small row" style={{ gap: 4 }}><Search size={13} />Topics from your sermons:</span>
            {ideas.topics.map((t) => <span key={t} className="chip accent">{t}</span>)}
          </div>
        )}
        <div className="channel-grid">
          {!ideas && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
          {ideas && ideasFor(ideas.topics || [], ideas.sermons || []).map((i) => (
            <button key={i.title} className="glass idea" onClick={() => go(i.go)}>
              <span className="chip">{i.tool}</span>
              <strong>{i.title}</strong>
              <span className="muted small">{i.about}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
