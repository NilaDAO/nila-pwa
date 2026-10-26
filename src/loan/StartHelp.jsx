// The leader scans a member's help QR (executive decision 26 Oct: the one QR at the office, every mode) and starts the
// 5-minute session on the member's account (nila-account start_session, the member's signed QR as its authorization).
// `member`: when the leader is on that member already (G2, L11), a QR of anyone else is refused. `onStarted(member)`.
import { useState } from 'react';
import CameraView from '../shell/CameraView';
import { readSessionQr, setSession } from '../stellar/session';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { C } from '../shell/tokens';
import DeskCard from '../shell/DeskCard';
import { muted } from '../plan/ui';
import { Address, xdr } from '@stellar/stellar-sdk';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { invokeContract, server } from '../stellar/soroban';
import { signerVal } from '../stellar/account';
import { useKeypadMembers } from '../keypad/hooks';

/** A keypad member's account exists before its first session (26 Oct): made at L14 #sent, or here if the leader went
 *  straight on to the field points. Anyone may create it through the union's factory; the node only pays the fee. */
async function ensureAccount(cfg, s, account, keypads) {
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(account).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
  if (((await server(cfg).getLedgerEntries(key)).entries || []).length) return;
  const m = (keypads || []).find((x) => x.account === account);
  const hex = m && (m.first_signer || m.signer);
  if (!hex) throw new Error('This member\'s account does not exist yet. The member opens the app once, then try again.');
  await invokeContract({ cfg, source: s.senderAddress, signHash: s.signHash, contractName: 'account_factory', fn: 'create',
    args: [signerVal(Uint8Array.from(hex.match(/../g).map((x) => parseInt(x, 16))))] });
}

export default function StartHelp({ member, label, onBack, onStarted }) {
  const tx = useSorobanTx();
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const keypads = useKeypadMembers().data;
  const [error, setError] = useState();
  const [tries, setTries] = useState(0);
  const read = async (t) => {
    let q;
    try { q = readSessionQr(t); } catch (e) { setError(e.message); setTries((x) => x + 1); return; }
    if (member && q.member !== member) { setError("This is another member's help QR."); setTries((x) => x + 1); return; }
    setError(undefined);
    try { await ensureAccount(cfg, s, q.member, keypads); } catch (e) { setError(e.message); setTries((x) => x + 1); return; }
    const out = await tx.run({ label: `Help ${label || 'the member'}`, rows: [['For', '5 minutes']], contractName: q.member, fn: 'start_session',
      args: q.args, auth: [q.entry], invalidate: [] });
    if (out) { setSession(q.member, Number(out.result || 0) || Math.floor(Date.now() / 1000) + 300); tx.reset(); onStarted(q.member); }
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  return (
    <DeskCard title={label ? `Help · ${label}` : 'Scan her QR'} onBack={onBack}>
      <CameraView key={tries} mode="qr" onText={read} />
      <p style={muted}>Scan the help QR on the member's phone. You can then act for the member for 5 minutes.</p>
      {error && <p style={{ color: C.coral }}>{error}</p>}
    </DeskCard>
  );
}
