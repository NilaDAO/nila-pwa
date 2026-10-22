// Segmented control (component book Comp06ToggleRadioSegmentItem, "Segmented control"): an ink track with a 1 px
// surface-raised inner line, padding 2, radius 12; items 40 high, radius 10; the active item surface-raised with white
// text, the others text-muted. Settings: width 'fill' (items share the width) or 'hug' (right-aligned).
import { C, FONT } from './tokens';

/** options: [[value, label], …] */
export default function Segmented({ options, value, onChange, label, width = 'fill' }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 0, padding: 2, borderRadius: 12, background: C.ink,
      boxShadow: `inset 0 0 0 1px ${C.raised}`, alignSelf: width === 'hug' ? 'flex-end' : 'stretch' }}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          style={{ flex: width === 'fill' ? 1 : '0 0 auto', height: 40, padding: '0 16px', border: 0, borderRadius: 10, cursor: 'pointer',
            fontFamily: FONT, fontSize: 14, fontWeight: 700, background: value === v ? C.raised : 'transparent', color: value === v ? C.text : C.muted }}>
          {text}
        </button>
      ))}
    </div>
  );
}
