// "From sermon": tie a design, a piece of writing or a post to a sermon, so it shows on that Sermon page.
// Controlled: the editor keeps the value and saves it the way it saves everything else.
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { api } from '../api.js';

let cache = null;
export default function SermonPicker({ value, onChange, label = 'From sermon', compact = false }) {
  const [list, setList] = useState(cache);
  useEffect(() => { if (!cache) api.get('/api/links/sermons').then((r) => { cache = r.sermons; setList(r.sermons); setTimeout(() => { cache = null; }, 60_000); }).catch(() => setList([])); }, []);
  return (
    <label className={`field ${compact ? 'small' : ''}`}>
      <span className="row" style={{ gap: 6 }}><BookOpen size={13} />{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not tied to a sermon</option>
        {(list || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        {value && list && !list.some((s) => s.id === value) && <option value={value}>A sermon not transcribed yet</option>}
      </select>
    </label>
  );
}
