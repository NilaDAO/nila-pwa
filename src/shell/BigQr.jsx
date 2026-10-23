// A QR as big as the screen allows (23 Oct): it spans the screen's width (its own white margin, 2 modules, is the
// quiet zone), inscribed in a white circle that runs off the screen's sides (clipped there). `caption` sits in the
// circle under the QR, clear of its quiet zone. The whole circle shows where the screen is tall enough with `below`
// px of page under and around it (header, card padding, buttons, tab bar). Used by her crop share QR and L9.
import { C, R } from './tokens';

export default function BigQr({ img, alt, caption, onClick, below = 290 }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', height: `clamp(100vw + 96px, 100dvh - ${below}px, 100vw * 1.42)`, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100vw * 1.42)', aspectRatio: '1 / 1',
        borderRadius: R.round, background: '#fff' }} />
      <Tag type={onClick ? 'button' : undefined} aria-label={onClick ? alt : undefined} onClick={onClick} style={{ position: 'absolute', left: 0,
        top: 'calc(50% - 50vw)', width: '100vw', aspectRatio: '1', padding: 0, border: 0, background: 'none', cursor: onClick ? 'pointer' : 'default' }}>
        {img && <img src={img} alt={alt} style={{ display: 'block', width: '100%', aspectRatio: '1' }} />}
      </Tag>
      {caption && (
        <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 50vw + 4px)', transform: 'translateX(-50%)', width: '62vw',
          color: C.ink, fontSize: 14, lineHeight: 1.4, textAlign: 'center' }}>{caption}</div>
      )}
    </div>
  );
}
