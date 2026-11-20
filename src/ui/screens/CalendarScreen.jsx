// Calendar: church events, planned and scheduled posts, campaigns, and inspiration for what's next.
// It's bigger than social media, so it has its own place.
import ToolIntro from '../components/ToolIntro.jsx';
import { useState } from 'react';
import { CalendarDays, Lightbulb, Megaphone } from 'lucide-react';
import { Calendar, Composer, useSocial } from './Social.jsx';
import Campaigns from '../components/Campaigns.jsx';
import Inspiration from './Inspiration.jsx';
import { useApp } from '../App.jsx';

const TABS = [['calendar', 'Calendar', CalendarDays], ['campaigns', 'Campaigns', Megaphone], ['inspiration', 'Inspiration', Lightbulb]];

export default function CalendarScreen({ tab: startTab, campaign }) {
  const { go } = useApp();
  const s = useSocial();
  const [tab, setTab] = useState(campaign ? 'campaigns' : startTab || 'calendar');
  const [composer, setComposer] = useState(null);
  const plat = (id) => s.platforms.find((p) => p.id === id);
  return (
    <div className="page">
      <ToolIntro id="calendar" />
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h1>Calendar</h1>
          <span className="muted">Church events, posts you’ve planned, campaigns, and ideas for what’s next.</span>
        </div>
        <button className="btn primary" onClick={() => setComposer({})}>+ New post</button>
      </div>
      <div className="seg" style={{ justifySelf: 'start' }}>
        {TABS.map(([k, l, Icon]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={14} />{l}</button>)}
      </div>
      {tab === 'calendar' && <Calendar s={s} plat={plat} onEdit={(p) => setComposer({ post: p })} onNew={(d, e) => setComposer({ when: d, event: e || null })} />}
      {tab === 'campaigns' && <Campaigns s={s} start={campaign} onEdit={(p) => setComposer({ post: p })} />}
      {tab === 'inspiration' && <Inspiration embedded />}
      {composer && <Composer s={s} plat={plat} init={composer} onClose={() => { setComposer(null); s.load(); }} onConnect={() => { setComposer(null); go({ name: 'social' }); }} />}
    </div>
  );
}
