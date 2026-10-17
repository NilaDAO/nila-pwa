// Her crop shares (A1 group "Crop shares", board MemberAssets-ley3) and, in self mode, taking one up
// herself (executive decision, 16 Oct: a self-mode member sends her own transactions; the Scan tab and the
// leader's QR are for assisted mode). She picks cash and machine hours within the union's hard limits,
// confirms (N10 wording) and signs fund_core.draw_loan; the leader hands over the cash at the office.
// DESIGN GAP: the take-up screen (her own L11/N10 in one) has no board of its own.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { useCropPlan, useLandTitles, usePlanClient } from '../plan/hooks';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { capsFor, checkRows, useUnionChecks } from './unionChecks';

const FLAG_DRAWN = 8;
const assisted = () => { try { return localStorage.getItem('nila.mode') === 'assist'; } catch { return false; } };

/** Her shares: her approved plan's mint list + each token's state on Stellar. */
export function useMyShares() {
  const s = useNilaSigner();
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const titles = useLandTitles(s?.evmAddress);
  const plan = useCropPlan(titles.data?.[0]);
  const p = plan.data;
  return useQuery({
    queryKey: ['oracle', 'myShares', p?.id], enabled: !!api && !!cfg && p?.approval?.decision === 'approve',
    staleTime: 30_000,
    queryFn: async () => {
      const { mints } = await api.mintList(p.id);
      const zones = Object.keys(p.plan.proposal).sort();
      return Promise.all(mints.filter((m) => m.token_id).map(async (m) => {
        const ft = await readContract(cfg, 'fund_core', 'food_token', [sv.address(cfg.union), sv.bytes32(tokenHex(m.token_id))]).catch(() => null);
        const share = (p.plan.shares || []).find((x) => x.key === m.share) || {};
        const drawn = !!ft && (Number(ft.loan?.flags ?? 0) & FLAG_DRAWN);
        const ready = !!ft && !drawn && Number(ft.from_date) * 1000 <= Date.now();
        return { ...m, share, ft, drawn, ready, area: zones.indexOf(m.zone) + 1, plan: p };
      }));
    },
  });
}

export function shareTag(x) {
  if (!x.ft) return 'Planned';
  if (x.drawn) return 'Financed';
  if (x.ready) return 'Ready';
  return `From ${new Date(Number(x.ft.from_date) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function Stepper({ label, value, set, step, max, fmt }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" aria-label={`Less ${label}`} style={b} onClick={() => set(Math.max(0, value - step))}>−</button>
        <span style={{ minWidth: 72, textAlign: 'center', fontWeight: 700 }}>{fmt(value)}</span>
        <button type="button" aria-label={`More ${label}`} style={b} onClick={() => set(Math.min(max, value + step))}>+</button>
      </span>
    </div>
  );
}

export function TakeUp({ token, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const shares = useMyShares();
  const checks = useUnionChecks(s?.stellarAddress);
  const tx = useSorobanTx();
  const x = shares.data?.find((y) => y.token_id === token);
  const [cash, setCash] = useState();
  const [hours, setHours] = useState();
  const [sure, setSure] = useState(false);
  if (!x) return <Sheet landName="Nila" title="Your crop share" onBack={onBack}><p style={muted}>…</p></Sheet>;
  const caps = capsFor(checks.data, x.ft);
  const blocked = checks.data?.blocked || [];
  const c = cash ?? Math.min(caps.cash, Math.round(x.share.loan_amount || 0));
  const h = hours ?? Math.min(caps.hours, Math.round(x.share.hours || 0));
  const rows = checkRows(checks.data, c, h, caps);
  const over = c > caps.cash || h > caps.hours;
  const draw = () => tx.run({
    label: `Crop share ${x.crop}`, rows: [['You get', inr(c)], ['For', `${x.crop} · Area ${x.area}`]],
    contractName: 'fund_core', fn: 'draw_loan',
    args: [sv.address(cfg.union), sv.address(s.stellarAddress), sv.bytes32(tokenHex(x.token_id)), sv.i128(BigInt(Math.round(c)) * 10_000_000n), sv.u32(h)],
    invalidate: [['oracle', 'myShares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
  });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  if (sure) {
    return (
      <Sheet landName="Nila" title="Confirm your crop share" onBack={() => setSure(false)}>
        <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>You get {inr(c)}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Made of {inr(c)} cash{h ? ` + ${h} machine hours` : ''}</p>
        <p style={{ textAlign: 'center' }}>For {x.crop} · Area {x.area}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Repay 3 weeks after harvest</p>
        <p style={{ color: C.gold, textAlign: 'center' }}>Get the cash from your leader at the union office.</p>
        <Primary disabled={!tx.ready} onClick={draw}>Confirm</Primary>
      </Sheet>
    );
  }
  return (
    <Sheet landName="Nila" title={x.crop} onBack={onBack}>
      <p style={{ ...muted, textAlign: 'center' }}>Area {x.area} · {shareTag(x)}</p>
      <Stepper label="Cash" value={c} set={setCash} step={100} max={caps.cash} fmt={inr} />
      <Stepper label="Machine hours" value={h} set={setHours} step={1} max={caps.hours} fmt={(v) => `${v} h`} />
      {checks.isLoading && <p style={muted}>Checking the union…</p>}
      {checks.isError && <p style={{ color: C.coral }}>Could not read the union. Try again.</p>}
      {blocked.map((b) => <p key={b} style={{ color: C.coral }}>{b.replace(/^She needs/, 'You need').replace(/^She has/, 'You have')}</p>)}
      {rows.map(([k, v, bad]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '4px 0' }}>
          <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, color: bad ? C.coral : C.text }}>{v}</span>
        </div>
      ))}
      {rows[0]?.[2] && <p style={{ ...muted, color: C.coral }}>Not enough cash at the office for this yet. Ask your leader.</p>}
      <Primary disabled={!checks.data || blocked.length > 0 || (!c && !h) || over} onClick={() => setSure(true)}>Get cash and vouchers</Primary>
    </Sheet>
  );
}

/** The A1 rows. In assisted mode a Ready share says to ask the leader. */
export function ShareRows({ onOpen }) {
  const shares = useMyShares();
  if (!shares.data?.length) return null;
  return (
    <>
      <span style={{ fontWeight: 700, color: C.muted }}>Crop shares</span>
      {shares.data.map((x) => (
        <button key={x.token_id} type="button" onClick={() => x.ready && !assisted() && onOpen(x.token_id)} style={{
          display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: 12, padding: '12px 16px', width: '100%', border: 0, color: C.text, textAlign: 'left', fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <b>{x.crop}</b>
            <span style={{ color: C.muted }}>Area {x.area}</span>
            <span style={{ color: x.ready ? C.accent : C.muted, fontWeight: 700 }}>{x.ready && assisted() ? 'Ready · ask your leader' : shareTag(x)}</span>
          </span>
          <span style={{ fontWeight: 700 }}>{x.share.loan_amount ? inr(x.share.loan_amount) : `${x.share.hours} h`}</span>
        </button>
      ))}
    </>
  );
}
