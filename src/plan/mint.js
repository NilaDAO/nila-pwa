// L12 → crop shares (executive decision 21 Oct, replaces N1's "she mints"): when a leader approves her plan, the
// union mints every season's FoodToken on Polygon with the LEADER's key (FoodToken P2 mintForBatchMemberByLeader);
// the tokens go to her wallet (the land title's holder) and the attester copies them to Stellar (F2). Steps, each
// safe to repeat: the node tops up the leader's POL (once per plan) → mintForBatchMemberByLeader with exactly the
// node's arguments (GET /plan/{id}/mint, which names the minting union), skipping tokens she already holds.
// `check` (her CP12 too) reads which of her crop shares are made.
import { useCallback, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { useNilaSigner } from '../wallet/signer';
import foodTokenAbi from '../components/ABI/FoodTokenP1.json';
import { usePlanClient } from './hooks';

const FOODTOKEN = process.env.REACT_APP_FOODTOKEN_ADDRESS;
const CHAIN_ID = Number(process.env.REACT_APP_CHAIN_ID) || 137;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex0x = (h) => (h && !h.startsWith('0x') ? `0x${h}` : h);

// FoodToken reverts and the node's refusals in plain words (texts as in hooks/useTx.ts, which the live
// app owns; kept here so the live file is not touched).
const REASON = {
  FieldAlreadyClaimed: 'This field still carries a food token for an earlier season. It is free again from that crop\'s harvest date.',
  EntirePropertyClaimed: 'A food token for the whole property covers this season.',
  NotCertified: 'You are not yet certified for this crop\'s batch. Ask your union leader.',
  NotLandOwner: 'This land title is not held by your wallet.',
  NoOracleRecord: 'Your field record is not published yet. Try again later.',
  BatchNotActive: 'This crop\'s batch is closed. Ask your union leader.',
  SosTooFar: 'This season starts more than a year ahead. It is made later.',
  InvalidSosDate: 'The season start date is missing.',
  NotMember: 'You are not a member of this crop\'s batch yet. Try again.',
  NotStanding: 'This crop\'s batch is not open yet. Ask your union leader.',
  InvalidCropCode: 'This crop is not registered yet. Ask your union leader.',
};
// The node's refusals (plan/mint.py), in plain words.
const NODE = [
  [/more than a year ahead/, REASON.SosTooFar],
  [/no Polygon crop code/, 'This crop is not registered yet. Ask your union leader.'],
  [/no open batch/, 'This crop\'s batch is not open yet. Ask your union leader.'],
];
// FoodToken P2 (nila-evm t1/contracts/P2-leader-mint) on top of the P1 ABI.
const P2 = [
  'function mintForBatchMemberByLeader(address union, uint256 batchId, uint32 landTitleId, uint32 harvestDate, uint256 quantity, uint128 fieldsBitmask, uint32 areaM2, uint16 farmerVarietyCode, uint32 sosDate)',
  'error NotLeaderOfBatch()',
];
const ABI = [...foodTokenAbi, ...P2];
REASON.NotLeaderOfBatch = 'Your union may not make crop shares in this crop\'s batch yet. Ask Nila.';
REASON.NotAuthorized = 'Your wallet is not a leader of this union on Polygon. Ask Nila.';
const ftIface = new ethers.Interface(ABI);
export function reasonOf(e) {
  const data = [e?.data, e?.info?.error?.data, e?.error?.data].find((d) => typeof d === 'string' && d.startsWith('0x'));
  try { const p = data && ftIface.parseError(data); if (p && REASON[p.name]) return REASON[p.name]; } catch { /* not ours */ }
  const text = typeof e === 'string' ? e : e?.message || '';
  const hit = NODE.find(([re]) => re.test(text));
  if (hit) return hit[1];
  return e?.shortMessage || e?.message || String(e);
}

export function useMintCropShares() {
  const s = useNilaSigner();
  const api = usePlanClient();
  const { provider } = useProvider();
  const [state, setState] = useState({ status: 'idle' });
  const nonceRef = useRef(null); // our own counter: ethers caches getTransactionCount for 250 ms

  const send = useCallback(async (ft, fn, args) => {   // signed by this app's own Polygon key (the leader's)
    const me = s.evmAddress;
    const data = ft.interface.encodeFunctionData(fn, args);
    const [chainNonce, fees, gas] = await Promise.all([
      provider.getTransactionCount(me, 'pending'), provider.getFeeData(),
      provider.estimateGas({ from: me, to: FOODTOKEN, data }),
    ]);
    const nonce = Math.max(chainNonce, nonceRef.current ?? 0);
    nonceRef.current = nonce + 1;
    const raw = await s.signEvmTx({ to: FOODTOKEN, data, chainId: CHAIN_ID, nonce, gasLimit: (gas * 12n) / 10n,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0, type: 2 });
    const tx = await provider.broadcastTransaction(raw);
    const r = await tx.wait();
    if (r.status !== 1) throw new Error(`${fn} reverted`);
    return r.hash;
  }, [s, provider]);

  // Her wallet: the land title's holder, as FoodToken reads it (the tokens go there).
  const holderOf = useCallback(async (ft, landId) => {
    const lt = new ethers.Contract(await ft.landTitleContract(), ['function ownerOf(uint256) view returns (address)'], provider);
    return lt.ownerOf(landId);
  }, [provider]);

  /** The leader's app, right after Approve on L12. */
  const run = useCallback(async (planId) => {
    nonceRef.current = null;
    setState({ status: 'busy', done: 0 });
    try {
      const ft = new ethers.Contract(FOODTOKEN, ABI, provider);
      const { mints, union, land_id: landId } = await api.mintList(planId);
      const ready = mints.filter((m) => m.args);
      const refused = mints.filter((m) => m.error);
      const holder = await holderOf(ft, landId);
      // POL for the mints (node, once per plan, to this leader's wallet); wait until it is there when something was sent.
      const g = await api.gas(planId).catch((e) => ({ error: e.message }));
      const gh = hex0x(g.tx_hash);
      if (gh) {
        try { for (let i = 0; i < 30 && !(await provider.getTransactionReceipt(gh)); i++) await sleep(2000); } catch { /* minting tells */ }
      }
      // One share that reverts (a field still held, a closed batch) does not stop the others.
      let done = 0;
      const failed = [];
      for (const m of ready) {
        try {
          if ((await ft.balanceOf(holder, m.token_id)) === 0n) {
            const a = m.args;
            await send(ft, 'mintForBatchMemberByLeader', [union, a.batchId, a.landTitleId, a.harvestDate, a.quantity,
              a.fieldsBitmask, a.areaM2, a.farmerVarietyCode, a.sosDate]);
          }
          done += 1;
        } catch (e) {
          failed.push({ ...m, error: reasonOf(e) });
        }
        setState({ status: 'busy', done, total: ready.length });
      }
      const notMade = [...refused.map((r) => ({ ...r, error: reasonOf(r.error) })), ...failed];
      setState({ status: notMade.length ? (done ? 'partial' : 'failed') : 'done', done, total: mints.length,
        refused: notMade, error: !done && notMade[0]?.error, gas: g });
    } catch (e) {
      console.error('[mint]', e);
      setState({ status: 'failed', error: reasonOf(e) });
    }
  }, [api, provider, send, holderOf]);

  /** Her CP12 (and the leader's L12 on reopening): which of her crop shares are made (on-chain balances). */
  const check = useCallback(async (planId) => {
    try {
      const ft = new ethers.Contract(FOODTOKEN, ABI, provider);
      const { mints, land_id: landId } = await api.mintList(planId);
      const ready = mints.filter((m) => m.args);
      const holder = await holderOf(ft, landId);
      const held = await Promise.all(ready.map((m) => ft.balanceOf(holder, m.token_id)));
      const n = held.filter((b) => b > 0n).length;
      const seen = n && n === ready.length
        ? { status: mints.length > n ? 'partial' : 'done', done: n, total: mints.length, refused: mints.filter((m) => m.error).map((r) => ({ ...r, error: reasonOf(r.error) })) }
        : { status: 'waiting', done: n, total: mints.length };
      setState((prev) => (prev.status === 'busy' ? prev : seen));   // never over a mint in progress
    } catch { setState((prev) => (prev.status === 'busy' ? prev : { status: 'waiting' })); }
  }, [api, provider, holderOf]);

  return { ...state, run, check };
}
