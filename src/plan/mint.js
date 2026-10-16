// CP12 "Creating your crop shares" (P4b): after the leader approved her plan, her app mints every
// season's FoodToken with her own Polygon key (N1, executive decision 16 Oct). Steps, each safe to
// repeat: the node tops up her POL (once per plan) → joinBatch where she is not a member yet →
// mintForBatchMember with exactly the node's arguments (GET /plan/{id}/mint), skipping tokens she holds.
import { useCallback, useState } from 'react';
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
};
const ftIface = new ethers.Interface(foodTokenAbi);
export function reasonOf(e) {
  const data = [e?.data, e?.info?.error?.data, e?.error?.data].find((d) => typeof d === 'string' && d.startsWith('0x'));
  try { const p = data && ftIface.parseError(data); if (p && REASON[p.name]) return REASON[p.name]; } catch { /* not ours */ }
  if (/more than a year ahead/.test(e?.message || e || '')) return REASON.SosTooFar;
  return e?.shortMessage || e?.message || String(e);
}

export function useMintCropShares() {
  const s = useNilaSigner();
  const api = usePlanClient();
  const { provider } = useProvider();
  const [state, setState] = useState({ status: 'idle' });

  const send = useCallback(async (ft, fn, args) => {
    const me = s.evmAddress;
    const data = ft.interface.encodeFunctionData(fn, args);
    const [nonce, fees, gas] = await Promise.all([
      provider.getTransactionCount(me, 'pending'), provider.getFeeData(),
      provider.estimateGas({ from: me, to: FOODTOKEN, data }),
    ]);
    const raw = await s.signEvmTx({ to: FOODTOKEN, data, chainId: CHAIN_ID, nonce, gasLimit: (gas * 12n) / 10n,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0, type: 2 });
    const tx = await provider.broadcastTransaction(raw);
    const r = await tx.wait();
    if (r.status !== 1) throw new Error(`${fn} reverted`);
    return r.hash;
  }, [s, provider]);

  const run = useCallback(async (planId) => {
    setState({ status: 'busy', done: 0 });
    try {
      const me = s.evmAddress;
      const ft = new ethers.Contract(FOODTOKEN, foodTokenAbi, provider);
      const { mints } = await api.mintList(planId);
      const ready = mints.filter((m) => m.args);
      const refused = mints.filter((m) => m.error);
      // POL for the mints (node, once per plan); wait until it is there when something was sent.
      const g = await api.gas(planId).catch((e) => ({ error: e.message }));
      const gh = hex0x(g.tx_hash);
      if (gh) {
        try { for (let i = 0; i < 30 && !(await provider.getTransactionReceipt(gh)); i++) await sleep(2000); } catch { /* minting tells */ }
      }
      for (const batch of [...new Set(ready.map((m) => m.args.batchId))]) {
        const [status] = await ft.batchMembers(batch, me);
        if (Number(status) === 0) await send(ft, 'joinBatch', [batch]);
      }
      // One share that reverts (a field still held, a closed batch) does not stop the others.
      let done = 0;
      const failed = [];
      for (const m of ready) {
        try {
          if ((await ft.balanceOf(me, m.token_id)) === 0n) {
            const a = m.args;
            await send(ft, 'mintForBatchMember', [a.batchId, a.landTitleId, a.harvestDate, a.quantity,
              a.fieldsBitmask, a.areaM2, a.farmerVarietyCode, a.sosDate]);
          }
          done += 1;
        } catch (e) {
          failed.push({ ...m, error: reasonOf(e) });
        }
        setState({ status: 'busy', done, total: ready.length });
      }
      const notMade = [...refused.map((r) => ({ ...r, error: reasonOf(r.error) })), ...failed];
      setState({ status: notMade.length ? (done ? 'partial' : 'failed') : 'done', done, total: ready.length,
        refused: notMade, error: !done && notMade[0]?.error, gas: g });
    } catch (e) {
      console.error('[mint]', e);
      setState({ status: 'failed', error: reasonOf(e) });
    }
  }, [s, api, provider, send]);

  /** On opening an approved plan: are all its crop shares made already (on-chain balances)? */
  const check = useCallback(async (planId) => {
    try {
      const ft = new ethers.Contract(FOODTOKEN, foodTokenAbi, provider);
      const { mints } = await api.mintList(planId);
      const ready = mints.filter((m) => m.args);
      const held = await Promise.all(ready.map((m) => ft.balanceOf(s.evmAddress, m.token_id)));
      const n = held.filter((b) => b > 0n).length;
      if (n && n === ready.length) setState({ status: mints.length > n ? 'partial' : 'done', done: n, total: ready.length, refused: mints.filter((m) => m.error).map((r) => ({ ...r, error: reasonOf(r.error) })) });
    } catch { /* stay on "Make my crop shares" */ }
  }, [api, provider, s]);

  return { ...state, run, check };
}
