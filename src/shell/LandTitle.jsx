// A5 (board MemberAssetLand): her land title over the map of her areas — the title and its id, water on her land,
// and burning the title. DESIGN GAPs (no hook yet, so not shown or not active): marking a well or bore (A5a,
// useWaterSources / useSaveWaterSources), farm improvements (useImprovements, useImprovementInterest), the trees row
// (useTreeCheck, TreeMap) and burning the title (useBurnLandTitle).
import { useNilaSigner } from '../wallet/signer';
import { useStellarTitles } from '../stellar/hooks';
import { useLandTitles, useTitleName } from '../plan/hooks';
import { useFieldRecord } from '../plan/record';
import AreaMap from '../plan/AreaMap';
import { Sheet } from '../plan/ui';
import { Loading } from '../register/Boot';
import { C, R } from './tokens';

const line = { height: 1, background: C.raised, border: 0, margin: '16px 0' };
const h2 = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, margin: 0 };
const muted = { color: C.muted, fontSize: 14, lineHeight: 1.5, margin: 0 };
const btn = { width: '100%', height: 44, border: 0, borderRadius: R.button, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

export default function LandTitle({ onBack }) {
  const s = useNilaSigner();
  const titles = useLandTitles(s?.evmAddress);
  const stellarTitles = useStellarTitles(s);
  const onPolygon = (titles.data || []).length > 0;
  const stellarTitle = !onPolygon ? stellarTitles.data?.[0] : undefined;
  const landId = onPolygon ? titles.data[0] : stellarTitle?.title_id;
  const count = onPolygon ? titles.data.length : (stellarTitles.data || []).length;
  const field = useFieldRecord(landId, s?.evmAddress, stellarTitle ? stellarTitle.record_hash || '' : undefined);
  const record = field.data?.record;
  const farm = useTitleName(landId, onPolygon, stellarTitle);
  // S1 until her title and its record are read (every wait is S1, 21 Oct); the card sits on the map like CP2.
  if (titles.isLoading || (!onPolygon && !stellarTitles.isFetched) || field.isLoading) return <Loading />;
  const map = record ? <AreaMap record={record} /> : null;
  return (
    <Sheet map={map} onBack={onBack}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Land title</span>
          <span style={{ color: C.muted }}>{landId != null ? [farm, `id ${landId}`, `on ${onPolygon ? 'Polygon' : 'Stellar'}`].filter(Boolean).join(' · ') : 'No land title yet'}</span>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{count}</span>
          <span style={{ color: C.muted }}>—</span>
        </span>
      </div>
      <hr style={line} />
      <section aria-label="Water on your land" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={h2}>Water on your land</h2>
        <p style={muted}>No well or bore marked yet. Your crop plan and the water improvements need it.</p>
        {/* DESIGN GAP: A5a (MemberWellForm) is not built, so the button does nothing yet. */}
        <button type="button" disabled aria-disabled="true" style={{ ...btn, background: C.accent, color: C.ink, opacity: 0.5, cursor: 'default' }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
          Mark a well or bore
        </button>
      </section>
      <hr style={line} />
      {/* DESIGN GAP: burning the title (useBurnLandTitle, with the board's confirm) is not built. */}
      <button type="button" disabled aria-disabled="true" style={{ ...btn, background: C.raised, color: C.coral, opacity: 0.5, cursor: 'default' }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        Burn my land title
      </button>
    </Sheet>
  );
}
