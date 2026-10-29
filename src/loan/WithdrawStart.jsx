// G2 → Withdraw for a member the leader is helping (A2, 26 Oct): in the session the leader starts the withdrawal for
// the member (fund_core.request_unbond_junior, the member's account approved by the leader); the cash is collected
// after 14 days. The shares are fixed from the member's free part read just before, less 1 nIN while a loan is open
// (as A3), so the call does not fail on interest that accrues meanwhile.
import { useState } from 'react';
import { readContract, sv } from '../stellar/soroban';
import { inr, Primary } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { Card, KV, Stepper } from './AssetParts';

const RAY = 10n ** 27n;
const ONE_NIN = 10_000_000n;

export default function WithdrawStart({ cfg, member, label, free, tx, map, onBack }) {
  const [amount, setAmount] = useState(Math.floor(free));
  const [error, setError] = useState();
  const a = Math.min(amount, Math.floor(free));
  const go = async () => {
    setError(undefined);
    try {
      const u = [sv.address(cfg.union), sv.address(member)];
      const [pos, m] = await Promise.all([readContract(cfg, 'fund_core', 'position', u),
        readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)])]);
      const freeNow = BigInt(pos.free) - (BigInt(pos.locked) > 0n ? ONE_NIN : 0n);
      const want = BigInt(a) * ONE_NIN;
      const take = want < freeNow ? want : freeNow;
      if (take <= 0n) throw new Error('Nothing of this investment is free to withdraw.');
      tx.run({
        label: `Withdrawal · ${label}`, rows: [['Withdraw', inr(Number(take / ONE_NIN))], ['Cash ready', 'in 14 days']],
        contractName: 'fund_core', fn: 'request_unbond_junior', session: member,
        args: [...u, sv.i128((take * RAY) / BigInt(m.index))], invalidate: [['stellar', 'investment']],
      });
    } catch (e) { setError(e.message); }
  };
  return (
    <MapCard map={map} header={{ title: 'Start a withdrawal', onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label="Start a withdrawal" style={{ gap: 12 }}>
        <KV k="Member" v={label} />
        <KV k="Free to withdraw" v={inr(Math.floor(free))} />
        <Stepper value={a} set={setAmount} max={Math.floor(free)} unit="₹" label="Amount" />
        <span style={{ color: C.muted, fontSize: 14 }}>Read the amount to the member. The cash can be collected after 14 days.</span>
        {error && <span style={{ color: C.coral }}>{error}</span>}
        <Primary disabled={a <= 0 || !tx.ready} onClick={go}>Start the withdrawal</Primary>
      </Card>
    </MapCard>
  );
}
