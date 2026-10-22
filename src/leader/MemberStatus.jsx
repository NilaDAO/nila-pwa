// G2 (board LeaderMember): one grower for the leader, a map card from G1 (#/members/<title id>). Header: back to G1,
// her farm name, settings. Her map with this season's crops; then, from what the app can already read:
// property and fields, the next crop share; Lending (what she owes, repay date) with Repay (Photo count → the desk)
// and Mark as default (fund_core.mark_default, once her loan is past due); Invested (fund_core.position) with Invest
// more (→ the desk); Redeem from the plan (her crop shares not drawn yet; Ready → L11); her record.
// DESIGN GAPs (left out, no data or no call yet): crop health, Batches (the Harvests tab), the lending chart and the
// repayment outlook, the rate on her investment, Plan next year, refreshing the record.
import { useMemo } from 'react';
import { useStellarConfig, useInvestment } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { C, FONT, R } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import AreaMap from '../plan/AreaMap';
import { areasOf } from '../plan/record';
import { currentSeason } from '../plan/ActivePlan';
import { rowsInSeason } from '../plan/PlanResult';
import { Loading } from '../register/Boot';
import { inr } from '../plan/ui';
import { useUnionMembers } from './unionMembers';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
const month = (d) => {
  const t = new Date(d); const day = t.getDate();
  return `${day <= 10 ? 'start of' : day <= 20 ? 'mid' : 'end of'} ${t.toLocaleDateString('en-GB', { month: 'short' })}`;
};
const fromLabel = (ts) => `From ${new Date(ts * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;

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
  const m = (members.data || []).find((x) => x.route === id);
  const inv = useInvestment(m?.address);
  const tx = useSorobanTx();
  const labels = useMemo(() => {
    const seasons = m?.plan?.plan?.seasons || [];
    if (!seasons.length) return {};
    const rows = rowsInSeason(seasons, currentSeason(seasons));
    return Object.fromEntries(Object.entries(rows).map(([z, r]) => [z, { text: r.name, colour: r.colour }]));
  }, [m]);
  if (members.isLoading) return <Loading />;
  const back = () => go('members');
  if (!m) {
    return (
      <MapCard header={{ title: 'Member', onBack: back, onSettings: () => go('settings') }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
        <p style={{ color: C.muted, padding: '0 14px' }}>This member is not in your union's list.</p>
      </MapCard>
    );
  }
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); members.refetch(); }} onRetry={() => tx.retry()} />;
  const now = Date.now() / 1000;
  const areas = areasOf(m.record);
  const acres = areas.reduce((a, z) => a + (z.area_m2 || 0), 0) / 4046.86;
  const open = m.shares.filter((x) => !x.drawn && x.from);
  const next = [...open].sort((a, b) => a.from - b.from)[0];
  const owed = m.loans.reduce((a, x) => a + (x.left || 0), 0);
  const loan = [...m.loans].sort((a, b) => (a.due || 9e12) - (b.due || 9e12))[0];
  const dueLoan = m.loans.find((x) => x.due && x.due < now);
  const invested = inv.data ? n(inv.data.invested) : null;
  const markDefault = () => tx.run({
    label: `Mark as default · ${m.label}`, rows: [['Owed', inr(dueLoan.left)], ['Crop share', dueLoan.crop || '—']],
    contractName: 'fund_core', fn: 'mark_default', args: [sv.address(cfg.union), sv.bytes32(dueLoan.token)],
    invalidate: [['stellar', 'unionMembers'], ['stellar', 'loans']],
  });
  const map = m.record ? <AreaMap record={m.record} labels={labels} /> : null;
  return (
    <MapCard full={false} map={map} header={{ title: m.label, onBack: back, onSettings: () => go('settings') }}
      style={{ fontFamily: FONT, color: C.text, fontSize: 14, lineHeight: 1.5 }}>
      {/* The card's 22 px side padding (MapCard takes the sheet's padding back for screens with cards of their own). */}
      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {m.record && <Row k="Property" v={`${acres.toFixed(1)} acres`} />}
        {m.record && <Row k="Fields" v={areas.length} />}
        {next && <Row k="Next crop share" v={`${next.crop} · Area ${next.area} · ${next.ready ? 'ready' : month(next.from * 1000)}`} />}
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
          {!dueLoan && <span style={{ color: C.muted }}>Possible once her repay date has passed.</span>}
        </Section>
      )}
      {m.address && (
        <Section title="Invested" right={invested == null ? '…' : `${Math.round(invested).toLocaleString('en-IN')} nIN`}>
          {/* Her actions start here only (executive decision 22 Oct: Members → G2 → action; the Cash tab is the union's money). */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn()} onClick={() => go(`cash/invest/${m.address}`)}>Photo count</button>
            <button type="button" style={btn(false)} disabled>Cash teller · soon</button>
          </div>
          <button type="button" style={{ ...btn(), flex: 'none', width: '100%' }} onClick={() => go(`cash/withdraw/${m.address}`)}>Withdraw</button>
        </Section>
      )}
      {open.length > 0 && (
        <Section title="Redeem from the plan">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {open.sort((a, b) => a.from - b.from).map((x) => (
              <li key={x.token}>
                <button type="button" disabled={!x.ready} onClick={() => go('cash/loan')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  background: C.raised, borderRadius: R.button, border: 0, padding: '10px 14px', minHeight: 56, color: C.text, fontFamily: FONT,
                  fontSize: 14, lineHeight: 1.5, textAlign: 'left', cursor: x.ready ? 'pointer' : 'default' }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, borderRadius: R.round, background: x.colour || C.muted }} />
                  <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700 }}>{x.crop}</span>
                    <span style={{ color: C.muted }}>Area {x.area}</span>
                  </span>
                  <span style={{ flexShrink: 0, height: 24, borderRadius: R.round, padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 700,
                    background: x.ready ? 'rgba(212,207,90,0.18)' : C.ink, color: x.ready ? C.accent : C.muted }}>{x.ready ? 'Ready' : fromLabel(x.from)}</span>
                </button>
              </li>
            ))}
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
