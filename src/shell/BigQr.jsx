// A QR as big as the screen allows (23 Oct): a white circle as large as fits the screen's height (with `below` px of
// page under and around it: header, card padding, rows, buttons, tab bar), never clipped at its top or bottom; when it
// is wider than the screen it runs off the sides (clipped there). The QR is inscribed in the circle (its own white
// margin, 2 modules, is the quiet zone). `caption` sits in the circle under the QR, clear of its quiet zone. Used by
// her crop share QR, L9 and her voucher code (A8a).
import { C, R } from './tokens';

export default function BigQr({ img, alt, caption, onClick, below = 290 }) {
  const Tag = onClick ? 'button' : 'div';
  const d = `min(100vw * 1.42, 100dvh - ${below}px)`;   // the circle's diameter
  return (
    <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', height: `calc(${d})`, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: `calc(${d})`, height: `calc(${d})`,
        borderRadius: R.round, background: '#fff' }} />
      <Tag type={onClick ? 'button' : undefined} aria-label={onClick ? alt : undefined} onClick={onClick} style={{ position: 'absolute', left: '50%',
        top: '50%', transform: 'translate(-50%, -50%)', width: `calc((${d}) / 1.42)`, aspectRatio: '1', padding: 0, border: 0, background: 'none',
        cursor: onClick ? 'pointer' : 'default' }}>
        {img && <img src={img} alt={alt} style={{ display: 'block', width: '100%', aspectRatio: '1' }} />}
      </Tag>
      {caption && (
        <div style={{ position: 'absolute', left: '50%', top: `calc(50% + (${d}) / 2.84 + 4px)`, transform: 'translateX(-50%)', width: `calc((${d}) / 2)`,
          color: C.ink, fontSize: 14, lineHeight: 1.4, textAlign: 'center' }}>{caption}</div>
      )}
    </div>
  );
}
