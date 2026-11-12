// A5 (board MemberAssetLand): her land title over the map of her areas — the title and its id, water on her land,
// and burning the title (2 Nov: POST /stellar/titles/burn, the holder; 4 Nov, G4: a Polygon title goes to 0x…dEaD first). DESIGN GAPs (no hook yet, so not shown or not
// active): marking a well or bore (A5a, useWaterSources / useSaveWaterSources), farm improvements (useImprovements,
// useImprovementInterest), the trees row (useTreeCheck, TreeMap).
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { ConfirmCard } from './SettingsParts';
import { useNilaSigner } from '../wallet/signer';
import { useStellarTitles } from '../stellar/hooks';
import { useLandTitles, usePlanClient, useTitleName } from '../plan/hooks';
import { useFieldRecord } from '../plan/record';
import AreaMap from '../plan/AreaMap';
import { unionCentre } from '../leader/unionMap';
import { useUnionMembers } from '../leader/unionMembers';
import { fieldsMap, useTitleFields } from '../plan/titleFields';
import { areaM2, tapRule } from '../plan/mapTap';
import { Sheet } from '../plan/ui';
import { Loading } from '../register/Boot';
import { IdentityRow } from '../leader/LeaderSettings';
import { useBorderClient, useMyBorderJob } from '../border/hooks';
import { C, R } from './tokens';

const LAND_TITLE = process.env.REACT_APP_LAND_TITLE_MAIN;
const CHAIN_ID = Number(process.env.REACT_APP_CHAIN_ID) || 137;
const DEAD = '0x000000000000000000000000000000000000dEaD';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex0x = (h) => (h && !h.startsWith('0x') ? `0x${h}` : h);

const line = { height: 1, background: C.raised, border: 0, margin: '16px 0' };
const h2 = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, margin: 0 };
const muted = { color: C.muted, fontSize: 14, lineHeight: 1.5, margin: 0 };
const btn = { width: '100%', height: 44, border: 0, borderRadius: R.button, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

/** bar / onSwipe (map-central trial): the ‹ asset › bar on top of the card, and a swipe on the card that steps it. */
export default function LandTitle({ onBack, bar, onSwipe, leader = false }) {
  const s = useNilaSigner();
  const titles = useLandTitles(s?.evmAddress);
  const stellarTitles = useStellarTitles(s);
  const onPolygon = (titles.data || []).length > 0;
  const stellarTitle = !onPolygon ? stellarTitles.data?.[0] : undefined;
  const landId = onPolygon ? titles.data[0] : stellarTitle?.title_id;
  const count = onPolygon ? titles.data.length : (stellarTitles.data || []).length;
  const field = useFieldRecord(landId, s?.evmAddress, stellarTitle ? stellarTitle.record_hash || '' : undefined);
  const planApi = usePlanClient();
  const unionMembers = useUnionMembers(count === 0 ? planApi : null);   // only for the no-title map's centre
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
  const { provider } = useProvider();
  const [step, setStep] = useState('');
  // G4 (executive decision 4 Nov): a Polygon title is sent to 0x…dEaD from her own Polygon wallet first — the node tops
  // up just enough POL (burn/gas), her wallet sends transferFrom, the receipt is waited for — then the node removes it
  // on Stellar with that transfer's hash. A Stellar-only title: the node's burn alone, as before (2 Nov).
  const burn = useMutation({
    mutationFn: async () => {
      const { titleBurnClient } = await import('../plan/api');
      const api = titleBurnClient(s);
      if (!onPolygon) { setStep('Removing it on Stellar…'); return api.burn({ title_id: Number(landId) }); }
      // The node's routes take the Stellar title only ({ title_id }, nila-sensing b66daaa); it finds the Polygon token itself.
      const st = stellarTitles.data?.[0];
      if (!st) throw new Error('Your land title is not on Stellar yet. Ask your union leader.');
      const ids = { title_id: Number(st.title_id) };
      setStep('Sending your land title to the burn address…');
      const g = await api.burnGas(ids);
      const gh = hex0x(g?.tx_hash);
      if (gh) { for (let i = 0; i < 30 && !(await provider.getTransactionReceipt(gh).catch(() => null)); i++) await sleep(2000); }
      const me = s.evmAddress;
      const data = new ethers.Interface(['function transferFrom(address from, address to, uint256 tokenId)'])
        .encodeFunctionData('transferFrom', [me, DEAD, landId]);
      const [nonce, fees, gas] = await Promise.all([provider.getTransactionCount(me, 'pending'), provider.getFeeData(),
        provider.estimateGas({ from: me, to: LAND_TITLE, data })]);
      const raw = await s.signEvmTx({ to: LAND_TITLE, data, chainId: CHAIN_ID, nonce, gasLimit: (gas * 12n) / 10n,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0, type: 2 });
      const r = await (await provider.broadcastTransaction(raw)).wait();
      if (r.status !== 1) throw new Error('The land title could not be sent to the burn address.');
      setStep('Removing it on Stellar…');
      return api.burn(ids, r.hash);
    },
    onSettled: () => setStep(''),
    onSuccess: () => {
      setAsk(false);
      qc.invalidateQueries({ queryKey: ['stellar', 'titleList'] });
      qc.invalidateQueries({ queryKey: ['polygon', 'titles'] });
      window.location.hash = '#/assets';
    },
  });
  // Land check (4 Nov, LOAN_RULES "Land check before more than ₹1 lakh"): read once per visit (no polling); "I placed
  // the sheet" is her signed POST, only the title's holder.
  const border = useBorderClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const check = useQuery({ queryKey: ['oracle', 'border', 'landCheck', landId], enabled: !!border && landId != null,
    queryFn: () => border.landCheck(landId) });
  const placed = useMutation({
    mutationFn: () => border.sheetPlaced(landId),
    onSuccess: (d) => { qc.setQueryData(['oracle', 'border', 'landCheck', landId], d); setSheetOpen(false); },
  });
  // A leader without a title (burned it, 12 Nov): the mint button in place of Burn, as on the Crop plan's no-title
  // card — her field points already with the union open that border job, else a new title starts (L2a–L4).
  const myJob = useMyBorderJob();
  const openJob = myJob.data && myJob.data.status !== 'failed' && myJob.data.status !== 'minted' ? myJob.data : null;
  const onTap = tapRule(picked, { open: setPicked, back: () => setPicked(null) });
  // S1 until her title and its record are read (every wait is S1, 21 Oct); the card sits on the map like CP2.
  if (titles.isLoading || (!onPolygon && !stellarTitles.isFetched) || field.isLoading) return <Loading />;
  const map = shape.record ? <AreaMap record={shape.record} labels={shape.labels} selected={picked} onSelect={onTap}
    fitBottom={bar ? Math.round(window.innerHeight / 2) + 72 : undefined} />
    // No land title yet (4 Nov): the satellite map on the union's land behind the card, as the Crop plan (28 Oct).
    : <AreaMap record={null} center={unionCentre(unionMembers.data)} />;
  if (sheetOpen) {
    // The removed R8 SheetStep's wording (git 301ac35), now on her land title.
    return (
      <Sheet map={map} onBack={() => setSheetOpen(false)} bar={bar} onSwipe={onSwipe}>
        <section aria-label="Land check" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={h2}>Place a plastic sheet in one of your fields</h2>
          <p style={muted}>Lay a white or light-coloured plastic sheet flat on the ground inside one of your fields. It must be plastic and not see-through. Weigh the corners down with stones so it stays in place. Leave it until the land check shows done; the next clear satellite image will show it.</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ color: C.muted }}>Size</span><span style={{ fontWeight: 700 }}>at least 4 m × 4 m</span>
          </div>
          <p style={muted}>Needed before your open cash passes ₹1 lakh.</p>
          <button type="button" onClick={() => placed.mutate()} disabled={placed.isPending || !border}
            style={{ ...btn, background: C.accent, color: C.ink, cursor: 'pointer' }}>
            {placed.isPending ? 'Sending…' : 'I placed the sheet'}
          </button>
          {placed.error && <p style={{ ...muted, color: C.coral }}>{placed.error.message}</p>}
        </section>
      </Sheet>
    );
  }
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
      {landId != null && (() => {
        const st = check.data?.status;
        const done = st === 'leader_gps' || st === 'sheet_found';
        const sub = st === 'leader_gps' ? 'Checked: your leader took your fields on site'
          : st === 'sheet_found' ? 'Checked: the sheet was seen'
            : st === 'sheet_pending' ? `Waiting for a clear satellite image (sheet placed ${check.data.placed_at})`
              : 'Needed before your open cash passes ₹1 lakh';
        return <IdentityRow title="Land check" checked={done} sub={sub} todo={st === 'sheet_pending' ? 'Waiting' : 'Not checked'}
          onClick={done || st === 'sheet_pending' ? undefined : () => setSheetOpen(true)} />;
      })()}
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
      {/* A5 Burn my land title (R68, executive decision 2 Nov; Polygon titles too since 4 Nov, G4: sent to 0x…dEaD); the
          node checks no crop share and no investment. Membership ends; a leader stays a leader (roles). Without a title a
          leader gets the mint button instead (12 Nov); a member's leader mints hers (3 Nov), so she sees neither. */}
      {landId == null ? (leader && (
        <button type="button" onClick={() => { window.location.hash = openJob ? `#/tasks/border/${openJob.id}` : '#/crop/register'; }}
          style={{ ...btn, background: C.accent, color: C.ink, cursor: 'pointer' }}>
          {openJob ? (openJob.status === 'ready' ? 'Check borders and mint' : 'See my fields') : 'Mint a new land title'}
        </button>
      )) : (
        <button type="button" onClick={() => setAsk(true)}
          style={{ ...btn, background: C.raised, color: C.coral, cursor: 'pointer' }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          Burn my land title
        </button>
      )}
      {ask && (
        <ConfirmCard title="Burn my land title" ok={burn.isPending ? 'Burning…' : 'Burn'} okStyle={{ background: C.coral }} okDisabled={burn.isPending}
          onCancel={() => setAsk(false)} onOk={() => burn.mutate()}
          warn={`Burn land title ${landId}? This ends your membership of the union and cannot be undone. nIN, USDC and vouchers stay in your wallet. To join again you need a new land title (Crop plan). Not possible while you have a crop share or an investment.`}>
          {step && <p style={muted}>{step}</p>}
          {burn.error && <p style={{ ...muted, color: C.coral }}>{burn.error.message}</p>}
        </ConfirmCard>
      )}
    </Sheet>
  );
}
