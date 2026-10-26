// G2 (board LeaderMember): one grower for the leader, a map card from G1 (#/members/<title id>). Header: back to G1,
// her farm name, settings. Her map with this season's crops; then, from what the app can already read:
// property and fields (the title's fields), the next crop share; Lending (what she owes, repay date) with Repay (Photo count → the desk)
// and Mark as default (fund_core.mark_default, once her loan is past due); Invested (fund_core.position) with Invest
// more (→ the desk); Redeem from the plan (her crop shares not drawn yet; Ready → L11); her record.
// DESIGN GAPs (left out, no data or no call yet): crop health, Batches (the Harvests tab), the lending chart and the
// repayment outlook, the rate on her investment, Plan next year, refreshing the record.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig, useInvestment } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { C, FONT, R } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import AreaMap from '../plan/AreaMap';
import { areasOf } from '../plan/record';
import { rowsInSeason } from '../plan/PlanResult';
import { SEASON } from '../loan/MyShares';
import { SkeletonRows } from '../shell/Skeleton';
import { inr } from '../plan/ui';
import { useLoanDues, useUnionMembers, useUnionShares } from './unionMembers';
import { useNilaSigner } from '../wallet/signer';
import PhotoCount from '../loan/PhotoCount';
import { recordCash } from '../loan/CashDesk';
import WithdrawStart from '../loan/WithdrawStart';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
const month = (d) => {
  const t = new Date(d); const day = t.getDate();
  return `${day <= 10 ? 'start of' : day <= 20 ? 'mid' : 'end of'} ${t.toLocaleDateString('en-GB', { month: 'short' })}`;
};
const fromLabel = (ts) => `From ${new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

// A crop share's state: Planned (from <month>), Ready (Take up → L11), Financed / Overdue from her open loan, Repaid
// once drawn and no loan is open any more. Harvested / Sold need the harvest and sales data (later).
function stateOf(x, loans) {
  const loan = loans.find((l) => l.token === x.token);
  if (loan) return loan.overdue ? { label: 'Overdue', bg: 'rgba(230,146,131,0.18)', fg: C.coral } : { label: 'Financed', bg: C.ink, fg: C.muted };
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
  const { data: cfg } = useStellarConfig();
  const found = (members.data || []).find((x) => x.route === id);
  // Her crop shares from the members list (25 Oct); hers are read on-chain again whenever her G2 opens.
  const shares = useUnionShares(api, { fresh: found?.key });
  // Her plan (what grows on each area today): one call for her plan only, not one per member.
  const planId = shares.data?.[found?.address]?.planId;
  const plan = useQuery({ queryKey: ['plan', 'byId', planId], enabled: !!api && !!planId, staleTime: 5 * 60_000,
    queryFn: () => api.plan(planId) });
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
    return <PhotoCount name={`Invest · ${m.label}`} target={0} verb="Invest"
      onBack={() => setStep()} onDone={async (c) => {
        setStep();
        if (!(await recordCash({ tx, leader: s.stellarAddress, cfg, purpose: 'invest', who: m.address, total: c.total, s3Keys: c.s3Keys }))) setNoPhotos(true);
      }} />;
  }
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); setStep(); members.refetch(); }} onRetry={() => tx.retry()} />;
  // Withdraw (26 Oct, A1): with a withdrawal on its way or ready, Pay out cash collects it; otherwise the leader starts
  // one and the member answers the request on their phone.
  const p = inv.data;
  const withdrawing = !!p && (BigInt(p.pending_shares ?? 0) > 0n || BigInt(p.claimable_shares ?? 0) > 0n);
  const free = p ? Math.max(0, n(p.free) - (BigInt(p.locked ?? 0) > 0n ? 1 : 0)) : 0;
  if (step === 'withdraw') {
    return <WithdrawStart cfg={cfg} member={m.address} label={m.label} free={free} tx={tx} onBack={() => setStep()}
      map={m.record ? <AreaMap record={m.record} /> : <span />} />;
  }
  const now = Date.now() / 1000;
  const areas = areasOf(m.record);
  const fields = m.record?.meta?.geometry?.field_features?.features || [];
  const acres = areas.reduce((a, z) => a + (z.area_m2 || 0), 0) / 4046.86;
  // Not drawn and not lapsed (25 Oct: no from date any more, attested with its last draw date), soonest last date first.
  const open = m.shares.filter((x) => !x.drawn && !x.lapsed);
  const next = [...open].sort((a, b) => (a.final || a.from) - (b.final || b.from))[0];
  const owed = m.loans.reduce((a, x) => a + (x.left || 0), 0);
  const loan = [...m.loans].sort((a, b) => (a.due || 9e12) - (b.due || 9e12))[0];
  const dueLoan = m.loans.find((x) => x.due && x.due < now);
  const invested = inv.data ? n(inv.data.invested) : null;
  const markDefault = () => tx.run({
    label: `Mark as default · ${m.label}`, rows: [['Owed', inr(dueLoan.left)], ['Crop share', dueLoan.crop || '—']],
    contractName: 'fund_core', fn: 'mark_default', args: [sv.address(cfg.union), sv.bytes32(dueLoan.token)],
    invalidate: [['stellar', 'unionMembers'], ['stellar', 'unionShares'], ['stellar', 'loans']],
  });
  // Her fields only (23 Oct): until her record is in, no map at all, never the leader's own fields.
  // Map taps (24 Oct rule): her property again → back to the list (only her property is on G2's map).
  const map = m.record ? <AreaMap record={m.record} labels={labels} onSelect={() => go('members')} /> : <span />;
  return (
    <MapCard full={false} map={map} header={{ title: m.label, onBack: back, onSettings: () => go('settings') }}
      style={{ fontFamily: FONT, color: C.text, fontSize: 14, lineHeight: 1.5 }}>
      {/* The card's 22 px side padding (MapCard takes the sheet's padding back for screens with cards of their own). */}
      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {m.record && <Row k="Property" v={`${acres.toFixed(1)} acres`} />}
        {/* Fields: the fields her title was minted with (L3/L4), from the title's record (meta.geometry.field_features);
            the record's areas are only for the crops on the map. "—" when the record lists none. */}
        {m.record && <Row k="Fields" v={fields.length || '—'} />}
        {next && <Row k="Next crop share" v={`${next.crop} · Area ${next.area} · ${next.ready ? `ready${next.final ? `, use by ${month(next.final * 1000)}` : ''}` : month(next.from * 1000)}`} />}
        {!m.record && <Row k="Status" v={m.note || 'No land title yet'} />}
      </div>
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
      {m.address && (
        <Section title="Invested" right={invested == null ? '…' : `${Math.round(invested).toLocaleString('en-IN')} nIN`}>
          {/* Her actions start here only (executive decision 22 Oct: Members → G2 → action; the Cash tab is the union's money).
              Nothing invested: Invest only; else Invest more and Withdraw. Invest opens the count choice. */}
          {!act ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btn()} onClick={() => { setAct('invest'); setNoPhotos(false); }}>{invested > 0 ? 'Invest more' : 'Invest'}</button>
              {invested > 0 && <button type="button" style={btn(withdrawing || free >= 1)} disabled={!withdrawing && free < 1}
                onClick={() => (withdrawing ? go('cash/payout') : setStep('withdraw'))}>{withdrawing ? 'Pay out withdrawal' : 'Withdraw'}</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btn()} onClick={() => setStep('count')}>Photo count</button>
              <button type="button" style={btn(false)} disabled>Cash teller · soon</button>
            </div>
          )}
          {act && (
            <button type="button" onClick={() => setAct()} style={{ alignSelf: 'center', border: 0, background: 'transparent', color: C.muted,
              fontFamily: FONT, fontSize: 14, cursor: 'pointer', padding: 4 }}>
              Cancel
            </button>
          )}
          {noPhotos && <span style={{ color: C.coral }}>The photos were not saved, so the cash was not recorded. Count again.</span>}
        </Section>
      )}
      {shares.isLoading && <Section title="Crop shares"><SkeletonRows rows={2} /></Section>}
      {m.shares.length > 0 && (
        <Section title="Crop shares">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...m.shares].sort((a, b) => a.from - b.from).map((x) => {
              const st = stateOf(x, m.loans);
              return (
                <li key={x.token} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: R.button,
                  padding: '10px 14px', minHeight: 56 }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, borderRadius: R.round, background: x.colour || C.muted }} />
                  <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{x.crop}</span>
                    <span style={{ color: C.muted }}>Area {x.area}{x.slot ? ` · ${SEASON[x.slot]} ${new Date(x.from * 1000).getFullYear()}` : ''}</span>
                  </span>
                  {st.take ? (
                    <button type="button" onClick={() => go(`loan/${x.planId || m.plan?.id}_${x.token}`)} style={{ flexShrink: 0, height: 32, borderRadius: R.button, border: 0, padding: '0 12px',
                      background: C.accent, color: C.ink, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Take up</button>
                  ) : (
                    <span style={{ flexShrink: 0, height: 24, borderRadius: R.round, padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: 12,
                      fontWeight: 700, background: st.bg, color: st.fg }}>{st.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {m.recordHash && (
        <Section>
          <Row k="Record" v={<span style={{ color: C.accent }}>{`${m.recordHash.slice(0, 8)}…${m.recordHash.slice(-6)}`}</span>} />
        </Section>
      )}
      </div>
    </MapCard>
  );
}
