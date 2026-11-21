// An on/off switch with a small icon riding on its knob, so what it controls reads at a glance.
// The label sits to the right. Use checkboxes only for picking items from a list.
export default function Toggle({ checked, onChange, icon: Icon, label, small = false, title, style, disabled }) {
  return (
    <label className={`switch icon-switch${small ? ' small' : ''}`} title={title} style={style}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label == null ? title : undefined} />
      {Icon && <Icon size={11} strokeWidth={2.4} className="switch-knob-icon" aria-hidden="true" />}
      {label != null && <span>{label}</span>}
    </label>
  );
}
