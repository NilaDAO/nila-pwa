// The leader's desk screens as a map card (24 Oct, map-centred app): scan her QR, invest/repay, pay out, the LP scan.
// The header row (back, title, settings), then one rounded card over the map, as A1a and G2.
import MapCard from './MapCard';
import { C, FONT, R, SHADOW } from './tokens';

export default function DeskCard({ title, onBack, children }) {
  return (
    <MapCard header={{ title, onBack, onSettings: () => { window.location.hash = '#/settings'; } }}
      style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      <section aria-label={title} style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: '18px 22px 22px',
        display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
        {children}
      </section>
    </MapCard>
  );
}
