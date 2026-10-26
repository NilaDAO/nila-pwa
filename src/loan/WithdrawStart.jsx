// G2 → Withdraw (A1, 26 Oct): the leader starts a member's withdrawal (assist and keypad mode; a member on their own
// phone may also start it on A3). The leader sets the amount, the app shows the request QR, the member's phone answers
// with a signed QR and the leader's app submits fund_core.request_unbond_junior; the cash is collected after 14 days
// (Pay out cash). The shares are fixed when the request is made, from the member's free part read just before, less
// 1 nIN while a loan is open (as A3), so the call does not fail on interest that accrues meanwhile.
import { useState } from 'react';
import { readContract, sv } from '../stellar/soroban';
import { inr } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { Primary } from '../plan/ui';
import { Card, KV, Stepper } from './AssetParts';
import { callOf, makeTask } from './taskCode';
import { TaskRequest } from './TaskScreens';

const RAY = 10n ** 27n;
const ONE_NIN = 10_000_000n;

export default function WithdrawStart({ cfg, member, label, free, tx, map, onBack }) {
  const [amount, setAmount] = useState(Math.floor(free));
  const [task, setTask] = useState();
  const [error, setError] = useState();
  const a = Math.min(amount, Math.floor(free));
  const make = async () => {
    setError(undefined);
    try {
      const u = [sv.address(cfg.union), sv.address(member)];
      const [pos, m] = await Promise.all([readContract(cfg, 'fund_core', 'position', u),
        readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)])]);
      const freeNow = BigInt(pos.free) - (BigInt(pos.locked) > 0n ? ONE_NIN : 0n);
      const want = BigInt(a) * ONE_NIN;
      const take = want < freeNow ? want : freeNow;
      if (take <= 0n) throw new Error('Nothing of this investment is free to withdraw.');
      setTask({ ...(await makeTask(cfg, { task: 'U', member, shares: String((take * RAY) / BigInt(m.index)) })), rupees: Number(take / ONE_NIN) });
    } catch (e) { setError(e.message); }
  };
  if (task) {
    const c = callOf(cfg, task);
    return (
      <TaskRequest cfg={cfg} task={task} title="Start a withdrawal" map={map} onBack={() => setTask(undefined)}
        rows={[['Member', label], ['Withdraw', inr(task.rupees)], ['Cash ready', 'in 14 days']]}
        onSigned={(entry) => tx.run({
          label: `Withdrawal · ${label}`, rows: [['Withdraw', inr(task.rupees)], ['Cash ready', 'in 14 days']],
          contractName: c.contract, fn: c.fn, args: c.args, auth: [entry], invalidate: [['stellar', 'investment']],
        })} />
    );
  }
  return (
    <MapCard map={map} header={{ title: 'Start a withdrawal', onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label="Start a withdrawal" style={{ gap: 12 }}>
        <KV k="Member" v={label} />
        <KV k="Free to withdraw" v={inr(Math.floor(free))} />
        <Stepper value={a} set={setAmount} max={Math.floor(free)} unit="₹" label="Amount" />
        <span style={{ color: C.muted, fontSize: 14 }}>The member confirms on their phone; the cash can be collected after 14 days.</span>
        {error && <span style={{ color: C.coral }}>{error}</span>}
        <Primary disabled={a <= 0} onClick={make}>Show the request</Primary>
      </Card>
    </MapCard>
  );
}
