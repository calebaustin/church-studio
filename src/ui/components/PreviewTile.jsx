// A real preview for things that don't have a picture yet, instead of an empty gray box:
//   writing  -> a little page: the title and the first lines of text
//   sermons and videos (audio only, or no cover yet) -> a tile in the theme's colors with the title
//   designs  -> the design's own colors with its name
import { BookOpen, CalendarDays, Clapperboard, FileText, Mic, PenLine, Shapes } from 'lucide-react';

export default function PreviewTile({ kind, title, excerpt, palette, meta, source }) {
  if (kind === 'writing') {
    const Icon = source === 'event' ? CalendarDays : source === 'blank' ? PenLine : FileText;
    return (
      <span className="pv pv-page" aria-hidden="true">
        <span className="pv-page-sheet">
          <Icon size={13} className="pv-page-ico" />
          <strong>{title}</strong>
          {excerpt ? <span>{excerpt}</span> : <><i /><i /><i style={{ width: '60%' }} /></>}
        </span>
      </span>
    );
  }
  if (kind === 'design') {
    const colors = (palette || []).filter(Boolean).slice(0, 5);
    return (
      <span className="pv pv-design" aria-hidden="true" style={{ background: colors[0] ? `linear-gradient(135deg, ${colors[0]}, ${colors[1] || colors[0]})` : undefined }}>
        <span className="pv-swatches">{colors.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
        <span className="pv-design-name"><Shapes size={13} />{title}</span>
      </span>
    );
  }
  // Sermons and videos.
  const Icon = kind === 'sermon' ? BookOpen : kind === 'audio' ? Mic : Clapperboard;
  return (
    <span className={`pv pv-media ${kind === 'sermon' ? 'sermon' : ''}`} aria-hidden="true">
      <Icon size={18} />
      <strong>{title}</strong>
      {meta && <span>{meta}</span>}
    </span>
  );
}
