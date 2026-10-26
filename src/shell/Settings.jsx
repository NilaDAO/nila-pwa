// A11 — member settings (board Settings; states #assist / #assisted, #machine, #onhold). Your credit union,
// notifications, how she uses Nila (assisted mode, nila.mode as R13), Become an LP (only with a land title in the union
// and an anchor, → K1), her machine when she owns one (A13's machine: prices, hours, the hold switch,
// machinery.set_hold), account and reset.
// DESIGN GAPs: Change union has no flow (one union); "Registered · date · leader" has no source (no indexer, no names on
// the node), left out; the hold reason "Other" has no free text (the contract keeps a reason number only); one theme.
import MapCard from './MapCard';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { useLpStatus } from '../anchor/hooks';
import { HOLD_REASONS, typeName, useMyMachine, useRates } from '../machine/hooks';
import { inr } from '../plan/ui';
import { AccountCard, Card, CardButton, ConfirmCard, NotificationsCard, ResetCard, Row, SwitchRow, Text, UnionCard, useUnionInfo } from './SettingsParts';
import { C, FONT } from './tokens';
import { assisted } from '../loan/MyShares';


/** "How you use Nila": the tab bar follows nila.mode, so the app opens again with the new mode. */
function ModeCard() {
  const u = useUnionInfo();
  const on = assisted();
  const name = (u.rep || '').replace(/^(Mrs?|Ms)\.\s*/, '') || 'Your union leader';
  const flip = () => { try { localStorage.setItem('nila.mode', on ? 'self' : 'assist'); } catch { return; } window.location.reload(); };
  return (
    <Card title="How you use Nila">
      <SwitchRow title="Union leader helps me" on={on} onClick={flip}
        sub={on ? `${name} does the steps. You look and press Confirm.` : 'Off: you send, spend and register yourself.'} />
    </Card>
  );
}

export function LpCard({ onIdCheck, onOffers }) {
  const lp = useLpStatus();
  const { data: cfg } = useStellarConfig();
  if (!cfg?.anchor_url || !lp.data?.member) return null;
  const ready = lp.data.lp && lp.data.trustline;
  return (
    <Card title={lp.data.lp ? 'You are an LP' : 'Become an LP'}>
      <Text>Bring or collect cash at the union office for USDC. You earn 1% on each swap.</Text>
      <CardButton onClick={ready ? onOffers : onIdCheck}>{ready ? 'Cash offers' : 'Check my identity'}</CardButton>
    </Card>
  );
}

/** "Your machine" (#machine), only for a machine owner; "Available for jobs" puts it on hold with a reason (#onhold). */
function MachineCard() {
  const s = useNilaSigner();
  const me = s?.stellarAddress;
  const { data: cfg } = useStellarConfig();
  const machine = useMyMachine(me);
  const rates = useRates();
  const share = useQuery({
    queryKey: ['stellar', 'prepayShare', cfg?.union], enabled: !!cfg?.contracts?.machinery, staleTime: 300_000,
    queryFn: () => readContract(cfg, 'machinery', 'prepay_share', [sv.address(cfg.union)]),
  });
  const tx = useSorobanTx();
  const [ask, setAsk] = useState(false);
  const [why, setWhy] = useState(1);
  const m = machine.data;
  if (!m) return null;
  const rate = rates.data?.find((r) => r.type === m.machine_type);
  const bp = Number(share.data ?? 0);
  const atJob = rate ? rate.parts.diesel + (rate.parts.driver * bp) / 10_000 : null;
  const driverShare = bp === 5000 ? "half the driver's pay" : bp === 10_000 ? "the driver's pay" : bp ? `${bp / 100}% of the driver's pay` : null;
  const hold = (on, reason) => tx.run({
    label: on ? 'Put on hold' : 'Available again', rows: on ? [['Reason', HOLD_REASONS[reason]]] : [],
    contractName: 'machinery', fn: 'set_hold', args: [sv.address(me), sv.u64(m.id), sv.bool(on), sv.u32(on ? reason : 0)],
    invalidate: [['stellar', 'machines'], ['stellar', 'machine']],
  });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  const on = m.confirmed && !m.on_hold;
  return (
    <Card title="Your machine">
      <Row k="Machine" v={typeName(m.machine_type)} />
      <Row k="Price an hour" v={rate ? inr(rate.total) : '—'} />
      <Row k="At the job" v={atJob != null ? inr(atJob) : '—'} />
      <Row k="After the farmer repays" v={atJob != null ? inr(rate.total - atJob) : '—'} />
      <Row k="Hours a week" v={`${m.hours_per_week} · you drive`} />
      <Text style={{ padding: '4px 0 8px 0' }}>
        {driverShare ? `Diesel and ${driverShare} are paid at the job` : 'Diesel is paid at the job'}; the rest after the farmer repays. You drive it yourself, keep it working and pay the repairs.
      </Text>
      <SwitchRow title="Available for jobs" on={on} disabled={!m.confirmed || !tx.ready}
        sub={!m.confirmed ? 'Confirm it first on Your machine.' : m.on_hold ? `On hold · ${HOLD_REASONS[m.hold_reason] || 'Other'}` : 'Members can use it.'}
        subColor={m.confirmed && m.on_hold ? C.coral : undefined}
        onClick={() => (m.on_hold ? hold(false) : setAsk(true))} />
      {ask && (
        <ConfirmCard title="Why is it on hold?" ok="Put on hold" onCancel={() => setAsk(false)} onOk={() => { setAsk(false); hold(true, why); }}>
          <div role="radiogroup" aria-label="Why is it on hold?" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(HOLD_REASONS).map(([k, name]) => {
              const sel = Number(k) === why;
              return (
                <button key={k} type="button" role="radio" aria-checked={sel} onClick={() => setWhy(Number(k))} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48,
                  border: 0, borderRadius: 12, padding: '12px 16px', fontFamily: 'inherit', color: C.text, cursor: 'pointer', textAlign: 'left', fontSize: 14, lineHeight: 1.5,
                  background: sel ? C.raised : C.ink, boxShadow: `inset 0 0 0 1px ${C.raised}` }}>
                  <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 9999, boxSizing: 'border-box', border: `2px solid ${sel ? C.accent : '#475569'}`,
                    background: sel ? `radial-gradient(${C.accent} 0 4px, transparent 5px)` : 'transparent' }} />
                  <span style={{ flexGrow: 1 }}>{name}</span>
                </button>
              );
            })}
          </div>
          <Text>Members cannot use it until you switch it back on. Your union sees why.</Text>
        </ConfirmCard>
      )}
    </Card>
  );
}

export default function Settings({ onBack, onIdCheck, onOffers }) {
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }} header={{ title: 'Settings', onBack, settings: false }}>
      <UnionCard />
      <NotificationsCard />
      <ModeCard />
      <LpCard onIdCheck={onIdCheck} onOffers={onOffers} />
      <MachineCard />
      <AccountCard />
      <ResetCard />
    </MapCard>
  );
}
