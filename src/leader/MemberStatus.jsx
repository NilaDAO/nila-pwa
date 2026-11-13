// G2 (board LeaderMember): one grower for the leader, a map card from G1 (#/members/<title id>). Header: back to G1,
// her farm name, settings. Her map with this season's crops; then, from what the app can already read:
// property and fields (the title's fields); Lending (what she owes, repay date) with Repay (Photo count → the desk)
// and Mark as default (fund_core.mark_default, once her loan is past due); Invested (fund_core.position) with Invest
// more (→ the desk); Redeem from the plan (her crop agreements not drawn yet; Ready → L11); her record.
// DESIGN GAPs (left out, no data or no call yet): crop health, Batches (the Harvests tab), the lending chart and the
// repayment outlook, the rate on her investment, Plan next year, refreshing the record.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ConfirmCard, Text, useUnionInfo } from '../shell/SettingsParts';
import PhoneField, { phoneOk, phoneValue } from '../register/PhoneField';
import { useStellarConfig, useInvestment } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePendingApprovals, usePlanClient } from '../plan/hooks';
import { C, FONT, R } from '../shell/tokens';
import { ChevronIcon, FileIcon, TrashIcon, WarnIcon } from '../shell/icons';
import MapCard from '../shell/MapCard';
import { Steps } from '../shell/MessageSlider';
import Segmented from '../shell/Segmented';   // the numbered steps of the Assets slider cards (13 Nov)
import AreaMap from '../plan/AreaMap';
import { unionCentre } from './unionMap';
import { areaM2 } from '../plan/mapTap';
import { areasOf } from '../plan/record';
import { rowsInSeason } from '../plan/PlanResult';
import { SEASON, areaNames } from '../loan/MyShares';
import { SkeletonRows } from '../shell/Skeleton';
import { inr } from '../plan/ui';
import { markJoined, useLoanDues, useUnionMembers, useUnionShares } from './unionMembers';
import { useNilaSigner } from '../wallet/signer';
import { keypadClient } from '../keypad/api';
import { shareOfToken } from '../machine/hooks';
import PhotoCount from '../loan/PhotoCount';
import { recordCash } from '../loan/CashDesk';
import { overRoom, useDeskRoom } from '../loan/deskRoom';
import { AssetScreen, Card, QrCircle, Secondary, Stepper } from '../loan/AssetParts';
import WithdrawStart from '../loan/WithdrawStart';
import StartHelp from '../loan/StartHelp';
import { PersonalName } from '../union/UnionCards';
import { useSessionUntil } from '../stellar/session';
import { markRecover, useInviteLink, useKeypadMembers, useRecoverPhone } from '../keypad/hooks';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
const month = (d) => {
  const t = new Date(d); const day = t.getDate();
  return `${day <= 10 ? 'start of' : day <= 20 ? 'mid' : 'end of'} ${t.toLocaleDateString('en-GB', { month: 'short' })}`;
};
const fromLabel = (ts) => `From ${new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

// A crop agreement's state: Planned (from <month>), Ready (Take up → L11), Financed / Overdue from her open loan, Repaid
// once drawn and no loan is open any more. Harvested / Sold need the harvest and sales data (later).
function stateOf(x, loans) {
  const loan = loans.find((l) => l.token === x.token);
  // Taken up and before its last draw date (27 Oct): machine hours can still be added.
  const more = !!loan && !loan.overdue && (!x.final || Date.now() / 1000 <= x.final);
  if (loan) return loan.overdue ? { label: 'Overdue', bg: 'rgba(230,146,131,0.18)', fg: C.coral } : { label: 'Financed', bg: C.ink, fg: C.muted, more };
  if (x.drawn) return { label: 'Repaid', bg: C.ink, fg: C.text };
  if (x.lapsed) return { label: 'Not used · lapsed', bg: C.ink, fg: C.muted };   // past its last draw date (25 Oct)
  if (x.ready) return { take: true };
  return { label: fromLabel(x.from), bg: C.ink, fg: C.muted };
}

function Row({ k, v, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right', color: tone || C.text }}>{v}</span>
    </div>
  );
}
const Section = ({ title, right, children }) => (
  <section style={{ borderTop: `1px solid ${C.raised}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {(title || right) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        {right && <span style={{ fontWeight: 700 }}>{right}</span>}
      </div>
    )}
    {children}
  </section>
);
const btn = (enabled = true) => ({ flex: 1, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontFamily: FONT,
  fontSize: 14, fontWeight: 700, opacity: enabled ? 1 : 0.5, cursor: enabled ? 'pointer' : 'default' });

export default function MemberStatus({ id, go }) {
  const api = usePlanClient();
  const members = useUnionMembers(api);
  const desk = useDeskRoom();
  const { data: cfg } = useStellarConfig();
  const found = (members.data || []).find((x) => x.route === id);
  // While a member's G2 is open the list is asked every 20 s (only changed rows): crop agreements just made show soon (26 Oct).
  const refetchMembers = members.refetch;
  useEffect(() => { const t = setInterval(() => refetchMembers(), 20_000); return () => clearInterval(t); }, [refetchMembers]);
  // Her crop agreements from the members list (25 Oct); hers are read on-chain again whenever her G2 opens.
  const shares = useUnionShares(api, { fresh: found?.key });
  // Her plan (what grows on each area today): one call for her plan only, not one per member.
  const planId = shares.data?.[found?.address]?.planId;
  // Self mode (5 Nov): an ID-checked member (fx_pool.id_checked) makes her crop plan in her own app; G2 offers none.
  const pendingPlans = usePendingApprovals();
  const idChecked = useQuery({ queryKey: ['stellar', 'idChecked', found?.address], enabled: !!cfg && !!found?.address,
    staleTime: 5 * 60_000, queryFn: () => readContract(cfg, 'fx_pool', 'id_checked', [sv.address(found.address)]).catch(() => false) });
  const plan = useQuery({ queryKey: ['plan', 'byId', planId], enabled: !!api && !!planId, staleTime: 5 * 60_000,
    queryFn: () => api.plan(planId) });
  // The refresh icon (27 Oct): the members list, this member's crop agreements on-chain and the plan again; it turns meanwhile.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([members.refetch(), shares.refetch(), planId ? plan.refetch() : null]); } finally { setRefreshing(false); }
  };
  // Her open loans: the node's list, plus any drawn share it does not hold yet (read from the share on-chain).
  const loans = useMemo(() => {
    if (!found) return undefined;
    // What is left and overdue come from her shares on-chain where read (the node's list carries the cash drawn only).
    const chain = Object.fromEntries((shares.data?.[found.address]?.shares || []).filter((x) => x.loan).map((x) => [x.token, x.loan]));
    const extra = Object.values(chain).filter((x) => !found.loans.some((l) => l.token === x.token));
    return [...found.loans.map((l) => (chain[l.token] ? { ...l, ...chain[l.token] } : l)), ...extra];
  }, [found, shares.data]);
  const dues = useLoanDues(loans);
  const m = useMemo(() => {
    if (!found) return found;
    const mine = shares.data?.[found.address] || {};
    return { ...found, plan: plan.data, shares: mine.shares || [],
      loans: loans.map((l) => ({ ...l, due: dues.data?.[l.token] || 0, ...((mine.shares || []).find((x) => x.token === l.token) ? { crop: mine.shares.find((x) => x.token === l.token).crop } : {}) })) };
  }, [found, loans, shares.data, dues.data, plan.data]);
  const inv = useInvestment(m?.address);
  const tx = useSorobanTx();
  // Invest runs in place (22 Oct): the button row turns into Photo count | Cash teller; Photo count opens the C6 count
  // with her. Withdraw (24 Oct) opens Pay out cash: the leader hands over the cash and scans her signed QR; with no
  // withdrawal on its way it starts one (26 Oct, A1: the request QR, the member's signed answer).
  const s = useNilaSigner();
  const [act, setAct] = useState();          // 'invest': the row shows the count choice
  const [step, setStep] = useState();        // 'count' (C6)
  const [noPhotos, setNoPhotos] = useState(false);
  const [bring, setBring] = useState(0);     // Invest (7 Nov): Bring cash to the office, the amount she invests
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);   // Sync with phone: its own QR screen (13 Nov)
  const [helpError, setHelpError] = useState();
  const helpUntil = useSessionUntil(m?.address);
  const labels = useMemo(() => {
    // Only what grows on an area today (sown, not harvested), as on A5; an area with nothing in the ground stays plain.
    // A financed share grows too (23 Oct): its draw is the start, whatever the plan's sowing date says.
    const seasons = m?.plan?.plan?.seasons || [];
    const today = new Date();
    const out = {};
    seasons.forEach((_, i) => Object.entries(rowsInSeason(seasons, i)).forEach(([z, r]) => {
      if (r.sow && new Date(r.sow) <= today && (!r.harvest || new Date(r.harvest) >= today)) out[z] = { text: r.name, colour: r.colour };
    }));
    (m?.shares || []).filter((x) => x.loan).forEach((x) => x.zones.forEach((z) => { out[z] = { text: x.crop, colour: x.colour }; }));
    return out;
  }, [m]);
  // Still loading, or only the list kept on this phone while the fresh one loads (a new member is not in it yet,
  // 23 Oct): the skeleton, never "not in your union's list".
  if (members.isLoading || (!found && (members.isFetching || members.isPlaceholderData))) {
    return (
      <MapCard map={<span />} header={{ title: '', onBack: () => go('members'), onSettings: () => go('settings') }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
        <SkeletonRows rows={4} />
      </MapCard>
    );
  }
  const back = () => go('members');
  if (!m) {
    return (
      <MapCard map={<span />} header={{ title: 'Member', onBack: back, onSettings: () => go('settings') }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
        <p style={{ color: C.muted, padding: '0 14px' }}>This member is not in your union's list.</p>
      </MapCard>
    );
  }
  if (step === 'count') {
    // Invest (7 Nov): the amount set under Bring cash to the office is invested; the rest of the count is change.
    return <PhotoCount name={`Invest · ${m.label}`} target={bring} verb="Invest" desk={desk.data}
      onBack={() => setStep()} onDone={async (c) => {
        setStep();
        if (!(await recordCash({ tx, leader: s.stellarAddress, cfg, purpose: 'invest', who: m.address, total: c.total, s3Keys: c.s3Keys, amount: bring }))) setNoPhotos(true);
      }} />;
  }
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); setStep(); members.refetch(); }} onRetry={() => tx.retry()} />;
  // Withdraw (26 Oct, A1): with a withdrawal on its way or ready, Pay out cash collects it; otherwise the leader starts
  // one and the member answers the request on their phone.
  const p = inv.data;
  const withdrawing = !!p && (BigInt(p.pending_shares ?? 0) > 0n || BigInt(p.claimable_shares ?? 0) > 0n);
  const free = p ? Math.max(0, n(p.free) - (BigInt(p.locked ?? 0) > 0n ? 1 : 0)) : 0;
  // Help (A2, 26 Oct): the member's help QR starts a 5-minute session in which this leader acts for the member.
  // No generic Help button (26 Oct): an action that needs the member's consent asks for the member's QR itself, then
  // goes on (withdraw, pay out); one scan covers 5 minutes of them.
  // Sync with phone (13 Nov; was an inline white card): a full QR screen like the app's other QRs.
  if (syncing) return <LiteDataQr m={m} inv={inv} onClose={() => setSyncing(false)} />;
  if (scanning) {
    return <StartHelp member={m.address} label={`${scanning.what} · ${m.label}`} onBack={() => setScanning(false)}
      onStarted={() => { const then = scanning.then; setScanning(false); then(); }} />;
  }
  const withQr = (what, then) => () => (helpUntil > Date.now() / 1000 + 10 ? then() : setScanning({ what, then }));
  const payOut = () => tx.run({
    label: `Pay out the withdrawal · ${m.label}`, rows: [['Member', m.label]],
    contractName: 'fund_core', fn: 'claim_junior_cash', session: m.address,
    args: [sv.address(cfg.union), sv.address(m.address), sv.address(s.stellarAddress), sv.i128(0n)],
    invalidate: [['stellar', 'investment'], ['stellar', 'unionCash']],
  });
  if (step === 'withdraw') {
    return <WithdrawStart cfg={cfg} member={m.address} label={m.label} free={free} tx={tx} onBack={() => setStep()}
      map={m.record ? <AreaMap record={m.record} /> : <span />} />;
  }
  const now = Date.now() / 1000;
  // The land from its field record, else (record not built yet, 28 Oct) from the title's own fields, as the Assets map.
  const areas = areasOf(m.record);
  const fields = m.record ? m.record.meta?.geometry?.field_features?.features || [] : m.fields || [];
  const acres = (m.record ? areas.reduce((a, z) => a + (z.area_m2 || 0), 0) : fields.reduce((a, f) => a + areaM2(f.geometry), 0)) / 4046.86;
  const hasLand = !!m.record || fields.length > 0;
  // A crop agreement's areas by their field names (13 Nov; "Area 1 + 2 + 3 + 5" said nothing to the leader), each
  // field once, as the crop plan screens; "Area n" only for an area without a name.
  const zoneName = Object.fromEntries((m.record?.zones || []).filter((z) => z.name).map((z) => [z.zone_id, z.name]));
  const fieldsOf = (x) => {
    const nos = String(x.area ?? '').split(' + ');
    return x.zones.length ? areaNames(x.zones.map((z, i) => zoneName[z] || `Area ${nos.length === x.zones.length ? nos[i] : (areas.findIndex((y) => y.zone_id === z) + 1 || '')}`.trim())) : `Area ${x.area}`;
  };
  const owed = m.loans.reduce((a, x) => a + (x.left || 0), 0);
  const loan = [...m.loans].sort((a, b) => (a.due || 9e12) - (b.due || 9e12))[0];
  const dueLoan = m.loans.find((x) => x.due && x.due < now);
  const invested = inv.data ? n(inv.data.invested) : null;
  const markDefault = () => tx.run({
    label: `Mark as default · ${m.label}`, rows: [['Owed', inr(dueLoan.left)], ['Crop agreement', dueLoan.crop || '—']],
    contractName: 'fund_core', fn: 'mark_default', args: [sv.address(cfg.union), sv.bytes32(dueLoan.token)],
    invalidate: [['stellar', 'unionMembers'], ['stellar', 'unionShares'], ['stellar', 'loans']],
  });
  // Her fields only (23 Oct): until her record is in, no map at all, never the leader's own fields.
  // Map taps (24 Oct rule): her property again → back to the list (only her property is on G2's map).
  // No record yet: the title's fields, as the Assets map (28 Oct).
  const map = m.record ? <AreaMap record={m.record} labels={labels} onSelect={() => go('members')} />
    // Before the record (13 Nov): the title's fields with their names, not "Area n".
    : fields.length ? <AreaMap record={{ zones: fields.map((f, i) => ({ zone_id: f.id || `f${i}`, geometry: f.geometry, ...(f.name ? { name: f.name } : {}) })) }} onSelect={() => go('members')} />
      // No land (13 Nov: e.g. her title removed): the union's land, as the crop plan's no-title map.
      : <AreaMap record={null} center={unionCentre(members.data)} />;
  const myLands = new Set([m.titleId, ...(m.lands || [])].filter((x) => x != null).map(String));
  const waiting = (pendingPlans.data?.plans || []).find((p) => myLands.has(String(p.land_id)));
  const planBtn = <button type="button" style={{ ...btn(), flex: 'none', width: '100%' }} onClick={() => go(`memberplan/${m.route}`)}>Make or open the crop plan</button>;
  return (
    <MapCard full={false} map={map} header={{ title: m.label, onBack: back, onSettings: () => go('settings'), busy: refreshing,
      onRefresh: refresh }}
      style={{ fontFamily: FONT, color: C.text, fontSize: 14, lineHeight: 1.5 }}>
      {/* The card's 22 px side padding (MapCard takes the sheet's padding back for screens with cards of their own). */}
      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* A recovery under way shows here, under her name, not in the Account group (4 Nov). */}
        {m.address && <PhoneStatus address={m.address} />}
        {hasLand && <Row k="Property" v={`${acres.toFixed(1)} acres`} />}
        {/* Fields: the fields her title was minted with (L3/L4), from the title's record (meta.geometry.field_features);
            the record's areas are only for the crops on the map. "—" when the record lists none. */}
        {hasLand && <Row k="Fields" v={fields.length || '—'} />}
        {/* The leaders' contact book (1 Nov): the member's full name, beside the public farm name in the header. */}
        {m.address && <PersonalName address={m.address} phone={m.phone} />}
        {/* Moved by the operator (7 Nov): her account holds her title and investment but does not name the union yet; one
            scan of her help QR sends her signed set_union (StartHelp), which also turns on her recovery. */}
        {m.joined === false && (
          <JoinSteps m={m} onScan={() => setScanning({ what: 'Join the union', then: () => { markJoined(m.address); refetchMembers(); } })} />
        )}
        {!m.record && <Row k="Status" v={m.note || (m.titleId || m.lands?.length ? 'Land title made · field record being built' : 'No land title yet')} />}
        {/* A member without a land title (13 Nov: e.g. hers was removed): a new one. A keypad member: the leader takes her
            points again; the leader's own row: the leader's own points; a smartphone member: L14, the leader scans her QR. */}
        {!m.titleId && !m.lands?.length && (m.keypadId || m.formerTitle != null) && (
          <button type="button" style={{ ...btn(), flex: 'none', width: '100%', background: C.accent, color: C.ink }}
            onClick={() => go(m.keypadId ? `tasks/member/${m.keypadId}/points` : m.address && m.address === s?.stellarAddress ? 'crop/register' : 'tasks/member')}>Make a new land title</button>
        )}
      </div>
      {/* Not joined yet (13 Nov): only the steps to join her; the rest of G2 waits until she has joined. */}
      {m.joined !== false && (<>
      {waiting && (
        // Her plan waits for a leader's approval (L12): here as in the task list, also for a self-mode member (5 Nov).
        <Section title="Crop plan" right="Waiting for approval">
          <button type="button" style={{ ...btn(), flex: 'none', width: '100%' }} onClick={() => go(`approvals/${waiting.id}`)}>Approve crop plan</button>
        </Section>
      )}
      {!waiting && m.recordHash && !m.shares.length && idChecked.isSuccess && !idChecked.data && (
        // The member's crop plan (26 Oct): made with the member without a session; the member's QR accepts it at the end.
        <Section title="Crop plan" right={helpUntil ? `QR scanned · until ${new Date(helpUntil * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}>
          {planBtn}
          {helpError && <span style={{ color: C.coral }}>{helpError}</span>}
        </Section>
      )}
      {m.loans.length > 0 && (
        <Section title="Lending" right={`${inr(owed)} owed now`}>
          {loan?.due ? <Row k="Repay" v={`${inr(loan.left)} · ${month(loan.due * 1000)}`} tone={loan.overdue ? C.coral : undefined} /> : null}
        </Section>
      )}
      {m.loans.length > 0 && (
        <Section title="Repay">
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn(!!m.address)} disabled={!m.address} onClick={() => go(`cash/repay/${m.address}`)}>Photo count</button>
            <button type="button" style={btn(false)} disabled>Cash teller · soon</button>
          </div>
          <button type="button" style={{ ...btn(!!dueLoan && tx.ready), flex: 'none', width: '100%' }} disabled={!dueLoan || !tx.ready} onClick={markDefault}>
            Mark as default
          </button>
          {!dueLoan && <span style={{ color: C.muted }}>Possible once the repay date has passed.</span>}
        </Section>
      )}
      </>)}
      {/* Invested shows also before the member has joined (13 Nov): the amount only; the actions after joining. */}
      {m.address && (
        <Section title="Invested" right={invested == null ? '…' : `${Math.round(invested).toLocaleString('en-IN')} nIN`}>
          {/* Her actions start here only (executive decision 22 Oct: Members → G2 → action; the Cash tab is the union's money).
              Nothing invested: Invest only; else Invest more and Withdraw. Invest opens the count choice. */}
          {m.joined === false ? null : !act ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btn()} onClick={() => { setAct('invest'); setNoPhotos(false); }}>{invested > 0 ? 'Invest more' : 'Invest'}</button>
              {invested > 0 && <button type="button" style={btn(withdrawing || free >= 1)} disabled={!withdrawing && free < 1}
                onClick={withdrawing ? withQr('Pay out the withdrawal', payOut) : withQr('Withdraw', () => setStep('withdraw'))}>{withdrawing ? 'Pay out withdrawal' : 'Withdraw'}</button>}
            </div>
          ) : (
            <>
              {/* Invest (7 Nov): the amount first, as on her A7 Invest; the count then needs at least this much. */}
              <span style={{ color: C.muted }}>Bring cash to the office</span>
              <Stepper value={bring} set={setBring} min={0} unit="₹" label="Rupees to invest" />
              {desk.data && bring > desk.data.room && <span style={{ color: C.coral }}>{overRoom(desk.data, bring)}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn(bring >= 1)} disabled={bring < 1 || (desk.data && bring > desk.data.room)} onClick={() => setStep('count')}>Photo count</button>
                <button type="button" style={btn(false)} disabled>Cash teller · soon</button>
              </div>
            </>
          )}
          {act && (
            <button type="button" onClick={() => { setAct(); setBring(0); }} style={{ alignSelf: 'center', border: 0, background: 'transparent', color: C.muted,
              fontFamily: FONT, fontSize: 14, cursor: 'pointer', padding: 4 }}>
              Cancel
            </button>
          )}
          {noPhotos && <span style={{ color: C.coral }}>The photos were not saved, so the cash was not recorded. Count again.</span>}
        </Section>
      )}
      {m.joined !== false && (<>
      {shares.isLoading && <Section title="Crop agreements"><SkeletonRows rows={2} /></Section>}
      {m.shares.length > 0 && (
        <Section title="Crop agreements">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...m.shares].sort((a, b) => a.from - b.from).map((x) => {
              const st = stateOf(x, m.loans);
              return (
                <li key={x.token} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: R.button,
                  padding: '10px 14px', minHeight: 56 }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, borderRadius: R.round, background: x.colour || C.muted }} />
                  <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{x.crop}</span>
                    <span style={{ color: C.muted }}>{fieldsOf(x)}{x.slot ? ` · ${SEASON[x.slot]} ${new Date(x.from * 1000).getFullYear()}` : ''}</span>
                  </span>
                  {st.more && (
                    <button type="button" onClick={() => go(`loan/${x.planId || m.plan?.id}_${x.token}`)} style={{ flexShrink: 0, height: 32, borderRadius: R.button, border: 0, padding: '0 12px',
                      background: C.raised, color: C.text, boxShadow: `inset 0 0 0 1px ${C.muted}`, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Add machine work</button>
                  )}
                  {st.take ? (
                    <button type="button" onClick={() => go(`loan/${x.planId || m.plan?.id}_${x.token}`)} style={{ flexShrink: 0, height: 32, borderRadius: R.button, border: 0, padding: '0 12px',
                      background: C.accent, color: C.ink, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Get the cash</button>
                  ) : (
                    <span style={{ flexShrink: 0, height: 24, borderRadius: R.round, padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: 12,
                      fontWeight: 700, background: st.bg, color: st.fg }}>{st.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {/* With crop agreements the plan is reached below them (26 Oct). */}
          {m.recordHash && planBtn}
          {helpError && <span style={{ color: C.coral }}>{helpError}</span>}
        </Section>
      )}
      <Account m={m} inv={inv} go={go} onSync={() => setSyncing(true)} />
      </>)}
      </div>
    </MapCard>
  );
}

/** Not joined yet (moved by the operator, 7 Nov; steps 13 Nov): her account holds her title but does not name the union.
 *  The leader picks her phone and follows the steps; the last one is the scan of her QR, which sends her signed
 *  set_union. A keypad phone needs internet only while Nila lite installs. */
function JoinSteps({ m, onScan }) {
  const [phone, setPhone] = useState('smart');      // 'smart' | 'keypad'
  const [moving, setMoving] = useState(false);
  const scan = <button type="button" style={{ ...btn(), flex: 'none', width: '100%' }} onClick={onScan}>Scan the QR</button>;
  const steps = phone === 'smart'
    ? ['The member opens the Nila app and recovers the account.', 'The member taps the scan icon at the bottom: the QR shows.', <>Scan the QR. Done: the member has joined.{scan}</>]
    : ['The phone needs internet only while Nila lite installs.',
      <>Send the SMS.<button type="button" style={{ ...btn(), flex: 'none', width: '100%' }} onClick={() => setMoving(true)}>Move</button></>,
      'The member opens the SMS and taps QR in the bottom right corner.', <>Scan the QR. Done: the member has joined.{scan}</>];
  // A G2 section (13 Nov), not a card: the phone switch, then numbered steps with the action in its step.
  return (
    <Section title="Join the union" right="Not joined yet">
      {/* The phone switch as Cash ahead's All | Half (13 Nov). */}
      <Segmented label="The member's phone" value={phone} onChange={setPhone} options={[['smart', 'Smartphone'], ['keypad', 'Keypad phone']]} />
      <Steps items={steps} />
      {moving && <MoveToKeypad address={m.address} name={m.name || m.label} phone={m.phone} onClose={() => setMoving(false)} />}
    </Section>
  );
}

const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Her keypad row and recovery state (2 Nov): `applies` when the node knows her or her account is a smart account. */
function useRecovery(address) {
  const list = useKeypadMembers();
  const k = (list.data || []).find((x) => x.account && x.account === address);
  const r = k?.recovery?.state;
  const l = k?.link || {};
  return { k, r, keypad: k?.phone_type === 'keypad', applies: !!list.data && (!!k || /^C/.test(address || '')),
    waiting: r !== 'needed' && r !== 'pending' && l.live && !l.used };
}

/** What needs attention on G2 itself (executive decision 4 Nov), under her name: a recovery waiting out the union's
 *  wait, an SMS link not opened yet, or a recovery the leader's app must finish (tap: the same call as before). */
function PhoneStatus({ address }) {
  const qc = useQueryClient();
  const { k, r, waiting } = useRecovery(address);
  const rec = useRecoverPhone(k?.id);
  if (r === 'pending') return <Row k="Phone" v={`Phone recovery · works from ${when(k.recovery.at)}`} />;
  if (waiting) return <Row k="Phone" v="SMS sent · waiting for the new phone" />;
  if (r !== 'needed') return null;
  return (
    <>
      <button type="button" disabled={rec.isPending} onClick={() => rec.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: ['oracle', 'keypad', 'members'] }) })}
        style={{ ...rowStyle, cursor: rec.isPending ? 'default' : 'pointer' }}>
        <WarnIcon color={C.gold} />
        <span style={{ flexGrow: 1, fontWeight: 700 }}>{rec.isPending ? 'Recovering…' : 'Recover the member\'s account'}</span>
        <ChevronIcon color={C.text} />
      </button>
      {rec.error && <Text style={{ color: C.coral }}>{rec.error.message}</Text>}
    </>
  );
}

// The app's interactive row (A1's Row): surface-raised, radius-field 12, 18 px gold icon, bold title, chevron.
const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: R.button, padding: '12px 16px',
  minHeight: 48, width: '100%', border: 0, color: C.text, textAlign: 'left', fontSize: 14, lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer' };

/** G2 ends with "Account" (Carst 4 Nov): one row of Recover and Move (secondary buttons sharing the row) and a square
 *  delete button, each opening the same confirm card as before, then her record. Recover is disabled while a recovery
 *  waits out the union's wait or the app must finish it (its status under her name says which). */
function Account({ m, inv, go, onSync }) {
  const [card, setCard] = useState();       // 'recover' | 'keypad' | 'remove' | 'delete' | 'record'
  const rcv = useRecovery(m.address);
  const titleId = m.titleId || [...(m.lands || [])][0];
  const p = inv.data;
  const investment = p ? n(p.invested) + n(p.pending_shares) + n(p.claimable_shares) : null;
  const why = m.shares.length ? 'The member has crop agreements.'
    : investment == null ? (inv.isError ? 'The investment could not be read.' : 'Reading the investment…')
      : investment > 0 ? 'The member has an investment: pay it out first.' : null;
  const recoverOk = rcv.r !== 'pending' && rcv.r !== 'needed';
  const move = rcv.applies && !rcv.keypad && /^C/.test(m.address || '');
  const lite = rcv.keypad && !!m.address;   // her data as a QR for Nila lite (13 Nov, test of the offline refresh)
  // No land title but a keypad row (13 Nov: e.g. hers was removed): the bin deletes her for good.
  const gone = !titleId && (!!m.keypadId || m.formerTitle != null);   // 13 Nov: also a smartphone member whose title was burned
  if (!rcv.applies && !titleId && !m.recordHash && !gone) return null;
  const close = () => setCard();
  return (
    <Section title="Account">
      {(rcv.applies || titleId || gone || m.recordHash) && (
        <div style={{ display: 'flex', gap: 8 }}>
          {rcv.applies && <button type="button" style={btn(recoverOk)} disabled={!recoverOk} onClick={() => setCard('recover')}>Recover</button>}
          {move && <button type="button" style={btn()} onClick={() => setCard('keypad')}>Move</button>}
          {/* "Sync with phone" (13 Nov; was "Her data as QR"): what it does for her, not how. */}
          {lite && <button type="button" style={btn()} onClick={onSync}>Sync with phone</button>}
          {/* Her record as a square button before the bin (13 Nov; was a "Record" row): the hash is for checking, not
              reading, so it opens in a card with Copy. Disabled without a record. */}
          <button type="button" aria-label="Field record" disabled={!m.recordHash} onClick={() => setCard('record')}
            style={{ ...square(!!m.recordHash), marginLeft: 'auto' }}>
            <FileIcon color={C.text} />
          </button>
          {(titleId || gone) && (
            <button type="button" aria-label={gone ? 'Delete member' : 'Remove member'} onClick={() => setCard(gone ? 'delete' : 'remove')}
              style={square()}>
              <TrashIcon color={C.coral} />
            </button>
          )}
        </div>
      )}
      {card === 'record' && <RecordCard hash={m.recordHash} onClose={close} />}
      {card === 'recover' && <RecoverCard address={m.address} name={m.name || m.label} rcv={rcv} onClose={close} />}
      {card === 'keypad' && <MoveToKeypad address={m.address} name={m.name || m.label} phone={m.phone} onClose={close} />}
      {card === 'remove' && <RemoveMember m={m} why={why} titleId={titleId} go={go} onClose={close} />}
      {card === 'delete' && <DeleteMember m={m} go={go} onClose={close} />}
    </Section>
  );
}

// Account's square icon buttons (13 Nov): the record and the bin share one size.
const square = (enabled = true) => ({ ...btn(enabled), flex: 'none', width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' });

/** The field record (13 Nov): the full hash, selectable and wrapping, with Copy; one tap shows "Copied" briefly. */
function RecordCard({ hash, onClose }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(hash).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); };
  return (
    <ConfirmCard title="Field record" cancel="Close" ok={done ? 'Copied' : 'Copy'} onCancel={onClose} onOk={copy}>
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.5, color: C.text,
        wordBreak: 'break-all', userSelect: 'text', WebkitUserSelect: 'text' }}>{hash}</span>
    </ConfirmCard>
  );
}

/* Nila lite data QR, format v2 (13 Nov). Text `NILA:D2:` + base45 (RFC 9285 alphabet: the QR uses alphanumeric mode)
 * of bytes; `v` = unsigned LEB128 varint, fields in this order, no names:
 *   v version (2) · v made at, unix minutes · 6 bytes: last 6 characters of her account, ASCII · v owed ₹ · v invested ₹
 *   · v agreement count · per agreement: v crop family · v state (0 not open yet, 1 ready, 2 financed, 3 overdue,
 *     4 repaid, 5 lapsed) · v left to repay ₹ · v repay by, days since 2020-01-01 (0 none) · v machine vouchers left,
 *     centi tractor acres (0 none).
 * Crop family = the FoodToken crop code ÷ 1000, read from the token id (machinery's shareOfToken), so it matches the
 * crop_calendar contract by construction; the decoder is readLeaderQr in public/lite/lite.js (its LITE_CROPS names). */
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const DAY0 = 1577836800;   // 2020-01-01 UTC
function varint(out, v) {
  let x = Math.max(0, Math.floor(Number(v) || 0));
  do { const b = x % 128; x = Math.floor(x / 128); out.push(x > 0 ? b + 128 : b); } while (x > 0);
}
function base45(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const v = bytes[i] * 256 + bytes[i + 1];
      s += B45[v % 45] + B45[Math.floor(v / 45) % 45] + B45[Math.floor(v / 2025)];
    } else s += B45[bytes[i] % 45] + B45[Math.floor(bytes[i] / 45)];
  }
  return s;
}
/** { at (unix s), account, owed, invested, rows: [{ family, state, left, due (unix s), centi }] } → the QR text. */
export function liteDataText({ at, account, owed, invested, rows }) {
  const out = [];
  varint(out, 2); varint(out, Math.floor(at / 60));
  const tail = String(account || '').slice(-6).padStart(6, ' ');
  for (let i = 0; i < 6; i++) out.push(tail.charCodeAt(i) & 127);
  varint(out, owed); varint(out, invested); varint(out, rows.length);
  rows.forEach((r) => { varint(out, r.family); varint(out, r.state); varint(out, r.left);
    varint(out, r.due > DAY0 ? Math.floor((r.due - DAY0) / 86400) : 0); varint(out, r.centi); });
  return `NILA:D2:${base45(out)}`;
}

/** Her data for Nila lite as a QR (13 Nov, test): a keypad phone without internet scans it from the leader's screen
 *  (Nila lite → Update from your leader) and shows it "as of" now. Only a summary, small enough for a weak camera:
 *  what she owes, invested, and per crop agreement its state, what is left and when, machine work left. Format v2
 *  above; her phone takes only a QR with her account's tail. Read-only on her phone: it changes nothing on-chain. */
function LiteDataQr({ m, inv, onClose }) {
  const [img, setImg] = useState();
  const { data: cfg } = useStellarConfig();
  const invested = inv.data ? Math.round(n(inv.data.invested)) : 0;
  const owed = m.loans.reduce((a, l) => a + Math.max(0, Math.round(l.left || 0)), 0);
  // Machine vouchers left per drawn agreement (machinery.voucher, as useVouchers in her own app), read once here.
  const drawn = m.shares.filter((x) => x.drawn).map((x) => x.token);
  const vouchers = useQuery({ queryKey: ['stellar', 'g2Vouchers', cfg?.union, m.address, drawn.join(',')],
    enabled: !!cfg?.contracts?.machinery && drawn.length > 0, staleTime: 30_000,
    queryFn: async () => Object.fromEntries(await Promise.all(drawn.map(async (t) => {
      const v = await readContract(cfg, 'machinery', 'voucher', [sv.address(cfg.union), sv.bytes32(t)]).catch(() => null);
      return [t, v && !v.void && v.member === m.address ? Math.max(0, Number(v.units) - Number(v.used)) : 0];
    }))) });
  const rows = [...m.shares].sort((a, b) => a.from - b.from).map((x) => {
    const loan = m.loans.find((l) => l.token === x.token);
    const state = loan ? (loan.overdue ? 3 : 2) : x.drawn ? 4 : x.lapsed ? 5 : x.ready ? 1 : 0;
    return { family: shareOfToken(x.token).family, state, left: loan ? Math.max(0, Math.round(loan.left || 0)) : 0,
      due: loan?.due || 0, centi: vouchers.data?.[x.token] || 0 };
  });
  const text = useMemo(() => liteDataText({ at: Date.now() / 1000, account: m.address, owed, invested, rows }),
    [m.address, owed, invested, JSON.stringify(rows)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !vouchers.isLoading;
  useEffect(() => {
    if (!ready) return;
    QRCode.toDataURL(text, { margin: 2, errorCorrectionLevel: 'L', width: 400 }).then(setImg).catch(() => setImg(undefined));
  }, [text, ready]);
  // Laid out as DeskQr (13 Nov): the QR in the white circle in its card, the lines under it, Close at the bottom.
  return (
    <AssetScreen title="Sync with phone" onBack={onClose}>
      <Card label="Sync with phone">
        <QrCircle img={ready ? img : undefined} alt="Sync with phone: QR for Nila lite" />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, textAlign: 'center' }}>On the member's phone: Nila lite → Update from your leader → scan this.</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, textAlign: 'center', color: C.muted }}>Owed {inr(owed)} · invested {inr(invested)}</p>
        {ready && <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: C.muted }}>{text.length} characters</p>}
        <Secondary onClick={onClose}>Close</Secondary>
      </Card>
    </AssetScreen>
  );
}

/** A lost phone (2 Nov); one recovery path for every member (executive decision 4 Nov, LOAN_RULES "One
 *  recovery path"): "Recover on another number" sends the SMS link to the number the leader enters (a keypad member's
 *  stored one by default). Keypad: POST /keypad/members/{id}/link {phone}; smartphone: POST /keypad/recoveries from her
 *  account (her row is made then). The new phone opens it and registers its key (a smartphone after signing up with
 *  that number), and this leader's app then recovers the account by itself (KeypadAccounts; no second confirm; the
 *  node's SMS key co-signs); G2's status row does it too if another phone sent the link. The new phone works after the
 *  wait. A smartphone member whose code still reaches her just logs in (Privy restores her key). */
function RecoverCard({ address, name, rcv, onClose }) {
  const qc = useQueryClient();
  const union = useUnionInfo();
  const send = useInviteLink();
  const { k, keypad } = rcv;
  const [num, setNum] = useState(keypad ? k.phone || '+91' : '+91');
  const go = () => send.mutate(keypad ? { again: k.id, phone: phoneValue(num) }
    : { recoverTo: address, phone: phoneValue(num), name: k?.name || name, unionName: union.name, leaderName: union.rep },
  { onSuccess: (m) => { markRecover(m.id); onClose(); qc.invalidateQueries({ queryKey: ['oracle', 'keypad', 'members'] }); } });
  return (
    <ConfirmCard title="Recover on another number" ok={send.isPending ? 'Sending…' : 'Send SMS'} okDisabled={send.isPending || !phoneOk(num)}
      onCancel={onClose} onOk={go}
      warn={`Send a link by SMS to this number? Once the member opens it on the new phone${keypad ? '' : ' and signs up there with this number'}, the member's account is recovered to it after the union's wait.`}>
      <PhoneField id="g2-recover-phone" value={num} onChange={setNum} />
      {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
    </ConfirmCard>
  );
}

/** Every member starts on a smartphone (2 Nov). A member with a JioPhone is moved here: the leader confirms Send SMS
 *  to the member's number; the keypad phone opens the link and makes its key, and this leader's app recovers the account
 *  to it (as Lost phone). The account keeps its address, land title, investment and Polygon pair. */
function MoveToKeypad({ address, name, phone, onClose }) {
  const qc = useQueryClient();
  const union = useUnionInfo();
  const send = useInviteLink();
  const [num, setNum] = useState(phone || '+91');
  const go = () => send.mutate({ name, phone: phoneValue(num), phoneType: 'keypad', unionName: union.name, leaderName: union.rep, account: address },
    { onSuccess: (m) => { markRecover(m.id); onClose(); qc.invalidateQueries({ queryKey: ['oracle', 'keypad', 'members'] }); } });
  return (
    <ConfirmCard title="Move to a keypad phone" ok={send.isPending ? 'Sending…' : 'Send SMS'} okDisabled={send.isPending || !phoneOk(num)}
      onCancel={onClose} onOk={go}
      warn="Send a link by SMS to the keypad phone? Once the member opens it there, the member's account moves to that phone and the smartphone no longer signs.">
      <PhoneField id="g2-keypad-phone" value={num} onChange={setNum} />
      {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
    </ConfirmCard>
  );
}

/** G2 Remove member (executive decision 28 Oct; the look of Settings → Reset account): the node burns the member's land
 *  title on Stellar, which ends the membership. Only with no crop agreement and no investment; nIN, USDC and vouchers stay
 *  in the member's wallet. The confirm says what it does, or why it cannot be done now (`why`). */
/** A member without a land title deleted for good (13 Nov): her row and links on the node; her account stays on-chain. */
function DeleteMember({ m, go, onClose }) {
  const s = useNilaSigner();
  const api = usePlanClient();
  const qc = useQueryClient();
  const del = useMutation({
    // A keypad member by her keypad row; a smartphone member (13 Nov) by her account in the node's former members.
    mutationFn: () => (m.keypadId ? keypadClient(s).remove(m.keypadId) : api.removeFormer(m.address)),
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['stellar', 'unionMembers'] }); go('members'); },
  });
  return (
    <ConfirmCard title="Delete member" ok={del.isPending ? 'Deleting…' : 'Delete'} okStyle={{ background: C.coral }} okDisabled={del.isPending}
      onCancel={onClose} onOk={() => del.mutate()}
      warn={`Delete ${m.label} from the union's list for good? This cannot be undone. The number can be added again as a new member.`}>
      {del.error && <Text style={{ color: C.coral }}>{del.error.message}</Text>}
    </ConfirmCard>
  );
}

function RemoveMember({ m, why, titleId, go, onClose }) {
  const api = usePlanClient();
  const qc = useQueryClient();
  const rm = useMutation({
    mutationFn: () => api.removeMember(titleId),
    // 13 Nov: her titles too, so the leader's own crop plan and assets drop a removed own title at once.
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['stellar', 'unionMembers'] }); qc.invalidateQueries({ queryKey: ['polygon', 'titles'] }); qc.invalidateQueries({ queryKey: ['stellar', 'titles'] }); go('members'); },
  });
  return why ? (
    <ConfirmCard title="Remove member" ok="OK" onCancel={onClose} onOk={onClose}
      warn={`${why} A member can be removed only with no crop agreement and no investment.`} />
  ) : (
    <ConfirmCard title="Remove member" ok={rm.isPending ? 'Removing…' : 'Remove'} okStyle={{ background: C.coral }} okDisabled={rm.isPending}
      onCancel={onClose} onOk={() => rm.mutate()}
      warn={`Remove ${m.label} from the union? The land title ${titleId} is burned, which ends the membership; this cannot be undone. nIN, USDC and vouchers stay in the member's wallet. To join again the member needs a new land title.`}>
      {/* The node's refusal (a 409's detail, 4 Nov) on the card itself. */}
      {rm.error && <Text style={{ color: C.coral }}>{rm.error.message}</Text>}
    </ConfirmCard>
  );
}
