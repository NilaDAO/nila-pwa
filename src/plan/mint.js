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
      if (g.tx_hash) { for (let i = 0; i < 30 && !(await provider.getTransactionReceipt(g.tx_hash)); i++) await sleep(2000); }
      for (const batch of [...new Set(ready.map((m) => m.args.batchId))]) {
        const [status] = await ft.batchMembers(batch, me);
        if (Number(status) === 0) await send(ft, 'joinBatch', [batch]);
      }
      let done = 0;
      for (const m of ready) {
        if ((await ft.balanceOf(me, m.token_id)) === 0n) {
          const a = m.args;
          await send(ft, 'mintForBatchMember', [a.batchId, a.landTitleId, a.harvestDate, a.quantity,
            a.fieldsBitmask, a.areaM2, a.farmerVarietyCode, a.sosDate]);
        }
        setState({ status: 'busy', done: ++done, total: ready.length });
      }
      setState({ status: refused.length ? 'partial' : 'done', done, total: ready.length, refused, gas: g });
    } catch (e) {
      console.error('[mint]', e);
      setState({ status: 'failed', error: e.shortMessage || e.message });
    }
  }, [s, api, provider, send]);

  return { ...state, run };
}
