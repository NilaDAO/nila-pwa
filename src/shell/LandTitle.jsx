// A5 (board MemberAssetLand): her land title over the map of her areas — the title and its id, water on her land,
// and burning the title (2 Nov: POST /stellar/titles/burn, the holder). DESIGN GAPs (no hook yet, so not shown or not
// active): marking a well or bore (A5a, useWaterSources / useSaveWaterSources), farm improvements (useImprovements,
// useImprovementInterest), the trees row (useTreeCheck, TreeMap).
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmCard } from './SettingsParts';
import { useNilaSigner } from '../wallet/signer';
import { useStellarTitles } from '../stellar/hooks';
import { useLandTitles, useTitleName } from '../plan/hooks';
import { useFieldRecord } from '../plan/record';
import AreaMap from '../plan/AreaMap';
import { fieldsMap, useTitleFields } from '../plan/titleFields';
import { areaM2, tapRule } from '../plan/mapTap';
import { Sheet } from '../plan/ui';
import { Loading } from '../register/Boot';
import { C, R } from './tokens';

const line = { height: 1, background: C.raised, border: 0, margin: '16px 0' };
const h2 = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, margin: 0 };
const muted = { color: C.muted, fontSize: 14, lineHeight: 1.5, margin: 0 };
const btn = { width: '100%', height: 44, border: 0, borderRadius: R.button, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

/** bar / onSwipe (map-central trial): the ‹ asset › bar on top of the card, and a swipe on the card that steps it. */
export default function LandTitle({ onBack, bar, onSwipe }) {
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
  // The title's fields (24 Oct): from the land title NFT's metadata, else the record's fields or areas.
  const tf = useTitleFields(landId, onPolygon, stellarTitle, record);
  const shape = useMemo(() => fieldsMap(tf), [tf]);
  // Map taps (24 Oct rule): a field opens its details in the card; the same field again → the title view; another
  // field → its details.
  const [picked, setPicked] = useState(null);
  const [ask, setAsk] = useState(false);
  const qc = useQueryClient();
  const burn = useMutation({
    mutationFn: async () => {
      const { signedCall } = await import('../plan/api');
      return signedCall(s)('POST', '/stellar/titles/burn', { title_id: Number(landId) });
    },
    onSuccess: () => { setAsk(false); qc.invalidateQueries({ queryKey: ['stellar', 'titleList'] }); window.location.hash = '#/assets'; },
  });
  const onTap = tapRule(picked, { open: setPicked, back: () => setPicked(null) });
  // S1 until her title and its record are read (every wait is S1, 21 Oct); the card sits on the map like CP2.
  if (titles.isLoading || (!onPolygon && !stellarTitles.isFetched) || field.isLoading) return <Loading />;
  const map = shape.record ? <AreaMap record={shape.record} labels={shape.labels} selected={picked} onSelect={onTap}
    fitBottom={bar ? Math.round(window.innerHeight / 2) + 72 : undefined} /> : null;
  const f = picked && tf?.fields.find((y) => y.id === picked);
  if (f) {
    const m2 = areaM2(f.geometry);
    return (
      <Sheet map={map} onBack={() => setPicked(null)} bar={bar} onSwipe={onSwipe}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{f.name}</span>
            <span style={{ color: C.muted }}>Field {tf.fields.indexOf(f) + 1} of {tf.fields.length}{farm ? ` · ${farm}` : ''}</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{(m2 / 4046.86).toFixed(2)} acres</span>
            <span style={{ color: C.muted }}>{Math.round(m2).toLocaleString('en-IN')} m²</span>
          </span>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet map={map} onBack={onBack} bar={bar} onSwipe={onSwipe}>
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
      {/* A5 Burn my land title (R68, executive decision 2 Nov): a Stellar title only (Polygon has no burn); the node checks
          no crop share and no investment. Membership ends; a leader stays a leader (roles). */}
      <button type="button" onClick={() => setAsk(true)} disabled={!stellarTitle}
        style={{ ...btn, background: C.raised, color: C.coral, opacity: stellarTitle ? 1 : 0.5, cursor: stellarTitle ? 'pointer' : 'default' }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        Burn my land title
      </button>
      {burn.error && <p style={{ ...muted, color: C.coral, marginTop: 8 }}>{burn.error.message}</p>}
      {ask && (
        <ConfirmCard title="Burn my land title" ok={burn.isPending ? 'Burning…' : 'Burn'} okStyle={{ background: C.coral }} okDisabled={burn.isPending}
          onCancel={() => setAsk(false)} onOk={() => burn.mutate()}
          warn={`Burn land title ${landId}? This ends your membership of the union and cannot be undone. nIN, USDC and vouchers stay in your wallet. To join again you need a new land title (Crop plan). Not possible while you have a crop share or an investment.`} />
      )}
    </Sheet>
  );
}
