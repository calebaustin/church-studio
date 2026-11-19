import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { isOn } from '../tools.js';

// Rotating idea cards in the sidebar, for the tools this church has turned on.
const CARDS = [
  { tool: 'library', title: 'New service up?', body: "Grab this week's sermon from your channel.", cta: 'Pick a sermon', to: { name: 'library', pick: true } },
  { tool: 'writing', title: 'Turn Sunday into a blog', body: "The transcript already holds most of the post.", cta: 'Start writing', to: { name: 'writing' } },
  { tool: 'graphics', title: 'Quote of the week', body: 'One strong line from Sunday makes a great post.', cta: 'Make a quote card', to: { name: 'graphics' } },
  { tool: 'calendar', title: 'Plan the week', body: 'Line up a post a day before Sunday comes back around.', cta: 'Open the calendar', to: { name: 'calendar' } },
  { tool: 'graphics', title: 'Slides for Sunday?', body: 'Start a sermon deck from a template or your notes.', cta: 'Make slides', to: { name: 'graphics' } },
  { tool: 'library', title: 'Got a class recording?', body: 'Open any audio or video file and get a transcript.', cta: 'Transcribe a file', to: { name: 'library' } },
  { tool: 'assets', title: 'Sound like you', body: 'Add your mission and a few themes to your brand voice.', cta: 'Brand voice', to: { name: 'assets', section: 'voice' } },
  { tool: 'writing', title: 'Event coming up?', body: 'Write a post and email straight from your calendar.', cta: 'Write about it', to: { name: 'writing' } },
  { tool: 'library', title: 'Noisy recording?', body: 'Clean up a loud room or a far-away mic in one step.', cta: 'Clean up audio', to: { name: 'library' } },
];
const EVERY = 90_000;

const HIDE_KEY = 'cs-sidecard-hidden-until';
const hiddenUntil = () => { try { return Number(localStorage.getItem(HIDE_KEY) || 0); } catch { return 0; } };

export default function SideCards() {
  const { config, go } = useApp();
  const list = useMemo(() => CARDS.filter((c) => isOn(config, c.tool)), [config?.toolsOff]);
  const [i, setI] = useState(() => { try { return Number(localStorage.getItem('cs-sidecard') || 0); } catch { return 0; } });
  const [shown, setShown] = useState(true); // false while fading out
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now());
  useEffect(() => {
    // Fade out, change the idea, fade back in.
    const t = setInterval(() => { if (document.hidden) return; setShown(false); setTimeout(() => { setI((n) => n + 1); setShown(true); }, 420); }, EVERY);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { try { localStorage.setItem('cs-sidecard', String((i + 1) % 1000)); } catch { /* fine */ } }, [i]);
  useEffect(() => {
    if (!hidden) return undefined;
    const t = setInterval(() => { if (hiddenUntil() <= Date.now()) setHidden(false); }, 60_000);
    return () => clearInterval(t);
  }, [hidden]);
  if (!list.length || hidden) return null;
  const c = list[i % list.length];
  const dismiss = () => { try { localStorage.setItem(HIDE_KEY, String(Date.now() + 3600_000)); } catch { /* fine */ } setHidden(true); };
  return (
    <div className={`side-card ${shown ? 'in' : 'out'}`}>
      <button className="side-card-x" aria-label="Hide ideas for an hour" title="Hide ideas for an hour" onClick={dismiss}><X size={13} /></button>
      <strong>{c.title}</strong>
      <span className="small" style={{ opacity: 0.75 }}>{c.body}</span>
      <button className="btn accent sm" onClick={() => go(c.to)}>{c.cta}<ArrowRight size={13} /></button>
    </div>
  );
}
