// The campaign at a glance, shown on any post or design that belongs to one: the details people copy
// most (name, day, time, place, link, website), and every post in the campaign with this one marked.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, Megaphone } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';

const day = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const STATUS = { draft: 'To do', scheduled: 'Scheduled', published: 'Posted', partial: 'Partly posted', 'needs-you': 'Needs you', failed: 'Failed', publishing: 'Posting' };

export default function CampaignHeader({ campaignId, postId, onOpenPost, compact = false }) {
  const { config } = useApp();
  const [c, setC] = useState(null);
  const [open, setOpen] = useState(!compact);
  const [copied, setCopied] = useState(null);
  useEffect(() => { if (campaignId) api.get('/api/campaigns').then((r) => setC(r.campaigns.find((x) => x.id === campaignId) || null)).catch(() => {}); }, [campaignId]);
  if (!campaignId || !c) return null;
  const e = c.event;
  const when = e?.start ? new Date(e.start) : new Date(c.date);
  const church = config.churchInfo || {};
  const facts = [
    ['Name', e?.title || c.name],
    ['Day', when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })],
    e?.start && !e.allDay && ['Time', when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })],
    e?.location && ['Place', e.location],
    e?.link && ['Link', e.link],
    church.website && ['Website', church.website],
    ['Hashtag', `#${(e?.title || c.name).replace(/[^A-Za-z0-9]+/g, '')}`],
  ].filter(Boolean);
  const copy = async (k, v) => { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1200); };
  const at = c.steps.findIndex((s) => s.postId === postId);
  return (
    <section className="camp-head">
      <button className="camp-head-top" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="cn-icon tone tone-2" style={{ width: 30, height: 30, borderRadius: 9 }}><Megaphone size={15} /></span>
        <span className="stack grow" style={{ gap: 0, minWidth: 0, textAlign: 'left' }}>
          <span className="eyebrow">Campaign{at >= 0 ? ` · post ${at + 1} of ${c.steps.length}` : ''}</span>
          <strong className="small truncate">{c.name} · {day(when)}</strong>
        </span>
        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--fast) var(--ease)' }} />
      </button>
      {open && (
        <>
          <div className="camp-facts">
            {facts.map(([k, v]) => (
              <button key={k} className="camp-fact" title={`Copy ${k.toLowerCase()}`} onClick={() => copy(k, v)}>
                <span className="muted" style={{ fontSize: 11 }}>{k}</span>
                <span className="small truncate">{v}</span>
                {copied === k ? <Check size={12} /> : <Copy size={12} className="muted" />}
              </button>
            ))}
          </div>
          <div className="camp-strip" aria-label="Posts in this campaign">
            {c.steps.map((s, i) => {
              const here = s.postId === postId;
              const st = s.post?.status;
              return (
                <button key={s.id} className={`camp-chip ${here ? 'here' : ''} ${st && st !== 'draft' ? 'done' : ''}`} disabled={here || !onOpenPost || !s.post} onClick={() => onOpenPost?.(s.post)} title={s.post?.caption || ''}>
                  <span className="num" style={{ fontSize: 11 }}>{i + 1}</span>
                  <span className="stack" style={{ gap: 0, minWidth: 0, textAlign: 'left' }}>
                    <strong style={{ fontSize: 12 }} className="truncate">{s.label}</strong>
                    <span className="muted" style={{ fontSize: 11 }}>{day(s.post?.scheduledAt || s.at)} · {here ? 'This one' : STATUS[st] || 'To do'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
