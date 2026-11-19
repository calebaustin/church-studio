import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, MapPin, RefreshCw, Send, Shapes, Megaphone } from 'lucide-react';
import { api, openLink } from '../api.js';
import { useApp } from '../App.jsx';
import Modal, { ModalHead } from './Modal.jsx';

/** Church calendar events (Planning Center or a calendar link), cached and refreshed weekly. */
export function useChurchEvents() {
  const { config, toast } = useApp();
  const [data, setData] = useState({ events: [], fetched: null });
  const [busy, setBusy] = useState(false);
  const linked = Boolean(config.calendarFeeds?.length || config.calendarIcal);
  useEffect(() => { if (linked) api.get('/api/calendar/events').then(setData).catch(() => {}); }, [linked]);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setData(await api.post('/api/calendar/refresh')); toast({ text: 'Church events are up to date.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  }, [toast]);
  return { ...data, linked, refresh, busy };
}

export function RefreshEvents({ cal }) {
  if (!cal.linked) return null;
  const when = cal.fetched ? new Date(cal.fetched).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'never';
  return (
    <button className="rt-btn" disabled={cal.busy} onClick={cal.refresh} title={`Refresh church events (last updated ${when}). They also update every Monday.`} aria-label="Refresh church events">
      <RefreshCw size={15} className={cal.busy ? 'spin' : ''} />
    </button>
  );
}

export const eventTime = (e) => (e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));

/** One event, and what to make from it. */
export function EventCard({ event, onClose, onPlanPost }) {
  const { go } = useApp();
  const d = new Date(event.start);
  return (
    <Modal onClose={onClose} width={480} label={event.title}>
      <ModalHead title={event.title} onClose={onClose} />
      <div className="stack" style={{ gap: 6 }}>
        <span className="row small"><CalendarDays size={14} />{d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · {eventTime(event)}</span>
        {event.location && <span className="row small"><MapPin size={14} />{event.location}</span>}
        {event.summary && <p className="muted small" style={{ margin: '4px 0 0' }}>{event.summary}</p>}
        <span className="hint">From {event.source}</span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary sm" onClick={() => { onClose(); go({ name: 'graphics', event }); }}><Shapes size={14} />Make a graphic</button>
        <button className="btn sm" onClick={() => { onClose(); go({ name: 'graphics', event, eventMode: 'flyer' }); }}>Flyer</button>
        <button className="btn sm" onClick={() => { onClose(); go({ name: 'graphics', event, eventMode: 'countdown' }); }}>Countdown</button>
        {onPlanPost && <button className="btn sm" onClick={() => { onClose(); onPlanPost(event); }}><Send size={14} />Plan a post</button>}
        <button className="btn sm" onClick={() => { onClose(); go({ name: 'social', campaign: { event } }); }}><Megaphone size={14} />Plan a campaign</button>
        {event.link && <button className="btn ghost sm" onClick={() => openLink(event.link)}><ExternalLink size={14} />Open event page</button>}
      </div>
    </Modal>
  );
}
