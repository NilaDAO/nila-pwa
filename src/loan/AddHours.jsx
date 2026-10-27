// More machine hours on her own crop share, already taken up (executive decision 27 Oct; self mode: assisted members
// get them from their leader in a session, G2 → L11). Until the share's last draw date, while its loan is open: one
// row per machine type the union has (confirmed machines), in whole hours at the union's rate; the voucher grows by
// their value in tractor hours (fund_core.draw_loan again with cash 0). Owed from today, with interest.
// DESIGN GAP: no board; built on L11's machine rows.
import { useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { TRACTOR, th, typeName, unitsOf, useMachines, useRates } from '../machine/hooks';

export default function AddHours({ token, name, map, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const rates = useRates();
  const machines = useMachines();
  const [mach, setMach] = useState({});
  const rateOf = (t) => rates.data?.find((r) => r.type === Number(t))?.total || 0;
  const tractorRate = rateOf(TRACTOR);
  const types = [...new Set((machines.data || []).filter((m) => m.confirmed).map((m) => m.machine_type))].filter((t) => t > 0).sort((a, b) => a - b);
  const value = Object.entries(mach).reduce((a, [t, h]) => a + h * rateOf(t), 0);
  const units = tractorRate > 0 ? unitsOf(1, value, tractorRate) : 0;
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700, flexShrink: 0, cursor: 'pointer' };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  return (
    <Sheet map={map} title="Add machine hours" onBack={onBack}>
      <p style={{ ...muted, marginTop: 0 }}>{name}. The hours are owed from today, with interest, like the vouchers you took with it.</p>
      {(rates.isLoading || machines.isLoading) && <p style={muted}>…</p>}
      {!machines.isLoading && types.length === 0 && <p style={muted}>Your union has no machines registered yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {types.map((t) => {
          const h = mach[t] || 0;
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flexGrow: 1, color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{typeName(t)}{rateOf(t) ? ` · ${inr(rateOf(t))}/h` : ''}</span>
              <button type="button" aria-label={`Fewer ${typeName(t)} hours`} style={b} onClick={() => setMach((m) => ({ ...m, [t]: Math.max(0, h - 1) }))}>−</button>
              <span style={{ width: 56, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{h} h</span>
              <button type="button" aria-label={`More ${typeName(t)} hours`} style={b} onClick={() => setMach((m) => ({ ...m, [t]: h + 1 }))}>+</button>
            </div>
          );
        })}
      </div>
      {units > 0 && <p style={{ fontSize: 14 }}>≈ {th(units)} tractor hours · {inr(value)} more owed</p>}
      <Primary disabled={!units || !tx.ready || !cfg} onClick={() => tx.run({
        label: `More machine hours · ${name}`, rows: [['Machine vouchers', `${th(units)} tractor hours`], ['Owed', inr(value)]],
        contractName: 'fund_core', fn: 'draw_loan',
        args: [sv.address(cfg.union), sv.address(s.stellarAddress), sv.bytes32(tokenHex(token)), sv.i128(0n), sv.u32(units)],
        invalidate: [['oracle', 'myShares'], ['stellar', 'vouchers'], ['stellar', 'voucherBook', token], ['stellar', 'investment']],
      })}>Add the hours</Primary>
    </Sheet>
  );
}
