// Leader side of the LP offers (LP positions, executive decision 31 Oct): Pay out cash posts a Bring (usePost; C4's
// LetCollect and L11's PostBring, never mounted, removed 4 Nov, G17); A1b #leader scans an LP's code and confirms
// (fx_pool.confirm moves the USDC as fixed at accept). The node sponsors post_offer, confirm and cancel_offer for a leader of the union (O14). Offers
// run 48 h (≤ 7 days in fx_pool). On a Bring the leader counts the LP's rupees (less the 2% fee when it ends the LP's
// position, whole rupees) with the C6 photo count before confirming.
// DESIGN GAP: LP names ("LP Suresh K.") are shown as short wallet addresses. Her code is signed by her Stellar
// key (offer id + time, 10 min): the scan checks it is the LP who accepted (the offer id alone is public).
import DeskCard from '../shell/DeskCard';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import CameraView from '../shell/CameraView';
import { Secondary } from '../loan/AssetParts';
import PhotoCount from '../loan/PhotoCount';
import { Choice, Primary, inr, muted } from '../plan/ui';
import { C } from '../shell/tokens';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { CODE_TTL, U, codeHash, usdcOf } from './hooks';
import { BRING } from './sep';

// No fixed period (31 Oct): an offer stays open until an LP accepts it or a leader cancels it.
export const OPEN_END = 18446744073709551615n;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');

export function usePost() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const post = (kind, amount) => tx.run({
    label: kind === BRING ? `Ask LPs to bring ${inr(amount)}` : `Let an LP take ${inr(amount)}`,
    rows: [['Amount', inr(amount)], ['Open', 'Until an LP takes it up, or you cancel']],
    contractName: 'fx_pool', fn: 'post_offer',
    args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.u32(kind), sv.i128(BigInt(amount) * BigInt(U)),
      sv.u64(OPEN_END)],
    invalidate: [['stellar', 'offers']],
  });
  return { tx, post };
}

/** A1b #leader for an LP code: scan, check the offer, confirm the cash. */
export function ScanLp({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [id, setId] = useState();
  const [bad, setBad] = useState();
  const o = useQuery({ queryKey: ['stellar', 'offer', id], enabled: !!cfg && id != null,
    queryFn: () => readContract(cfg, 'fx_pool', 'offer', [sv.u64(id)]) });
  const [proof, setProof] = useState();   // { ts, sig } from her code
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState(null);   // rupees counted on C6 for a Bring
  const kind = Number(o.data?.kind);
  const inrAmt = o.data ? Number(BigInt(o.data.inr) / BigInt(U)) : 0;
  // A Bring: the LP hands over the amount less the close fee fixed at accept (offer.from_offshore, whole rupees).
  const fee = o.data ? Number(BigInt(o.data.from_offshore || 0) / BigInt(U)) : 0;
  const hand = kind === BRING ? inrAmt - fee : inrAmt;
  // The code is hers: signed by the LP who accepted this offer, less than 10 minutes ago.
  const mine = useQuery({ queryKey: ['anchor', 'codeCheck', id, proof?.ts, o.data?.lp], enabled: !!proof && !!o.data?.lp,
    queryFn: async () => {
      if (Math.abs(Date.now() / 1000 - proof.ts) > CODE_TTL) return false;
      try {
        // A smart account (C…) signs with its current signer key (an LP's is Ed25519: a smartphone), read on-chain.
        let key = o.data.lp;
        if (/^C/.test(key)) {
          const sg = await readContract(cfg, key, 'signer');
          if (!Array.isArray(sg) || sg[0] !== 'Ed25519') return false;
          key = StrKey.encodeEd25519PublicKey(Buffer.from(sg[1]));
        }
        return Keypair.fromPublicKey(key).verify(Buffer.from(await codeHash(id, proof.ts)), Buffer.from(proof.sig, 'hex'));
      } catch { return false; }
    } });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  const read = (t) => {
    const m = /^nila:offer:(\d+):(\d+):([0-9a-f]{128})$/.exec(t.trim());
    if (!m) { setBad('This is not an LP code.'); return; }
    setBad(undefined); setId(Number(m[1])); setProof({ ts: Number(m[2]), sig: m[3] });
  };
  const again = () => { setId(undefined); setProof(undefined); setBad(undefined); setTyped(''); setCounted(null); };
  if (counting) {
    return <PhotoCount name="LP brings cash" target={hand} verb="Counted" limit={false} onBack={() => setCounting(false)}
      onDone={({ total }) => { setCounted(total); setCounting(false); }} />;
  }
  const live = o.data && Number(o.data.expires) > Date.now() / 1000;
  const ok = o.data && Number(o.data.state) === 1 && o.data.union === cfg.union && live && mine.data === true;
  const why = !o.data ? '' : !live ? 'expired' : ['not accepted by an LP yet', '', 'done already', 'cancelled', 'expired'][Number(o.data.state)] || 'not open';
  return (
    <DeskCard title="Scan an LP code" onBack={onBack}>
      {id == null && !typing && <CameraView mode="qr" onText={read} />}
      {id == null && typing && (
        <>
          <textarea aria-label="The LP code" value={typed} onChange={(e) => setTyped(e.target.value)} rows={4}
            style={{ width: '100%', borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: 12, boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13 }} />
          <Primary disabled={!typed.trim()} onClick={() => read(typed)}>Check the code</Primary>
        </>
      )}
      {/* A secondary button (25 Oct). The typed code is the LP's full code (about 160 characters, 10 minutes valid). */}
      {id == null && <Secondary onClick={() => setTyping((t) => !t)}>{typing ? 'Use the camera' : 'Type the code instead'}</Secondary>}
      {bad && <p style={{ color: C.coral }}>{bad}</p>}
      {id != null && o.isLoading && <p style={muted}>…</p>}
      {o.data === null && <p style={{ color: C.coral }}>No such offer.</p>}
      {o.data && Number(o.data.state) !== 1 && <p style={{ color: C.coral }}>This offer is {why}.</p>}
      {o.data && Number(o.data.state) === 1 && !live && <p style={{ color: C.coral }}>This offer has expired.</p>}
      {o.data && Number(o.data.state) === 1 && live && mine.data === false && <p style={{ color: C.coral }}>This code is not from the LP who accepted the offer, or it is older than 10 minutes. Ask the LP to open their code again.</p>}
      {id != null && !ok && <Secondary onClick={again}>Scan again</Secondary>}
      {ok && (
        <>
          <Choice sub={`LP ${short(o.data.lp)} · ${usdcOf(o.data.usdc)} USDC`}>{kind === BRING ? `The LP brings ${inr(inrAmt)}` : `The LP takes ${inr(inrAmt)}`}</Choice>
          <p style={muted}>{kind === BRING ? `Count the cash the LP hands over: ${inr(hand)}${fee ? ` (${inr(inrAmt)} less the LP's fee)` : ''}. Confirming moves the USDC to the LP.`
            : 'Hand over the cash. Confirming locks the LP\'s USDC with the union.'}</p>
          {kind === BRING && counted == null && <Primary disabled={!tx.ready} onClick={() => setCounting(true)}>Count the cash</Primary>}
          {kind === BRING && counted != null && counted < hand && <p style={{ color: C.coral }}>Counted {inr(counted)} of {inr(hand)}: count again before you confirm.</p>}
          {(kind !== BRING || (counted != null && counted >= hand)) && <Primary disabled={!tx.ready} onClick={() => tx.run({
            label: kind === BRING ? `Got ${inr(hand)} from the LP` : `Gave ${inr(inrAmt)} to the LP`,
            rows: [['LP', short(o.data.lp)], ['USDC', usdcOf(o.data.usdc)]],
            contractName: 'fx_pool', fn: 'confirm', args: [sv.address(s.stellarAddress), sv.u64(id)], invalidate: [['stellar', 'offers'], ['stellar', 'cashAtHand'], ['stellar', 'bringRoom']],
          })}>{kind === BRING ? `I got ${inr(hand)}` : `I gave ${inr(inrAmt)}`}</Primary>}
          {kind === BRING && counted != null && counted < hand && <button type="button" onClick={() => setCounting(true)} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>Count again</button>}
        </>
      )}
    </DeskCard>
  );
}
