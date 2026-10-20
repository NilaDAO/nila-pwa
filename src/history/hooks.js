// A12 history (board History): her transactions on Stellar (Horizon: her account's operations, the contract call
// named in words, the nIN / USDC it moved) and on Polygon (the old app's Etherscan reads: token transfers, land
// titles, FoodTokens). One list, newest first. P11.
import { useQuery } from '@tanstack/react-query';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { useStellarConfig } from '../stellar/hooks';

const n = (v) => Number(v);

// Contract calls in words (her side). Amounts come from the operation's asset balance changes.
const CALLS = {
  draw_loan: ['Crop share taken', 'From your union'],
  repay_loan: ['Loan repaid', 'Cash at union office'],
  cash_scan_mint: ['Cash at union office', 'Recorded by your leader'],
  request_cash_out: ['Cash out', 'At the union office'],
  pay_out: ['Cashed out at the union office', ''],
  reclaim_cash_out: ['Cash-out taken back', 'Your nIN back'],
  request_unbond_junior: ['Withdrawal started', 'Union investment'],
  claim_junior: ['Withdrawal paid', 'Union investment'],
  open_code: ['Machine code made', 'Machinery voucher'],
  cancel_code: ['Machine code cancelled', 'Machinery voucher'],
  claim: ['Machine job', 'Machinery voucher'],
  collect_dues: ['Machine dues collected', 'From your union'],
  confirm_machine: ['Machine confirmed', 'Your machine'],
  set_hold: ['Machine on hold changed', 'Your machine'],
  register_machine: ['Machine registered', 'By your leader'],
  close_unused: ['Voucher released', 'Machinery voucher'],
  accept: ['LP offer accepted', 'Cash offers'],
  confirm: ['LP swap done', 'At the union office'],
  post_offer: ['LP offer posted', 'Cash offers'],
  cancel_offer: ['LP offer cancelled', 'Cash offers'],
  mint_moved: ['From the old app', 'Your nIN moved to Stellar'],
  withdraw_union_treasury: ['Treasury withdrawal', 'Union treasury'],
  leader_deposit_treasury: ['Treasury deposit', 'Union treasury'],
};

function callName(op) {
  try {
    const p = op.parameters || [];
    const fn = p[1] && scValToNative(xdr.ScVal.fromXDR(p[1].value, 'base64'));
    return typeof fn === 'string' ? fn : String(fn || '');
  } catch { return ''; }
}

async function stellarRows(cfg, me) {
  const r = await fetch(`${cfg.horizon_url}/accounts/${me}/operations?order=desc&limit=100&join=transactions`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Horizon ${r.status}`);
  const [ninCode, ninIssuer] = cfg.nin_asset.split(':');
  const [usdcCode, usdcIssuer] = (cfg.usdc_asset || ':').split(':');
  const rows = [];
  for (const op of (await r.json())._embedded.records) {
    if (op.transaction_successful === false) continue;
    const at = new Date(op.created_at).getTime() / 1000;
    if (op.type === 'create_account' || op.type === 'begin_sponsoring_future_reserves' || op.type === 'end_sponsoring_future_reserves') {
      if (op.type === 'create_account' && op.account === me) rows.push({ id: op.id, at, title: 'Your Nila account', sub: 'Made for you', chain: 'stellar' });
      continue;
    }
    if (op.type === 'change_trust') {
      if (op.asset_code === usdcCode) rows.push({ id: op.id, at, title: 'USDC account opened', sub: 'For cash offers', chain: 'stellar' });
      continue;
    }
    if (op.type !== 'invoke_host_function') continue;
    const fn = callName(op);
    const [title, sub] = CALLS[fn] || [fn.replace(/_/g, ' ') || 'Contract call', ''];
    // Her nIN / USDC moved by the call (SAC balance changes).
    let nin = 0; let usdc = 0;
    for (const c of op.asset_balance_changes || []) {
      const sign = c.to === me ? 1 : c.from === me ? -1 : 0;
      if (!sign) continue;
      if (c.asset_code === ninCode && c.asset_issuer === ninIssuer) nin += sign * n(c.amount);
      if (c.asset_code === usdcCode && c.asset_issuer === usdcIssuer) usdc += sign * n(c.amount);
    }
    const amount = nin ? `${nin > 0 ? '+' : '−'}${Math.abs(nin).toLocaleString('en-IN')} nIN`
      : usdc ? `${usdc > 0 ? '+' : '−'}${Math.abs(usdc).toFixed(2)} USDC` : '';
    rows.push({ id: op.id, at, title, sub, amount, chain: 'stellar', hash: op.transaction_hash });
  }
  return rows;
}

const ETHERSCAN = 'https://api.etherscan.io/v2/api';
async function polygonRows(evm, chainId) {
  const key = process.env.REACT_APP_ETHERSCAN_KEY;
  if (!evm || !key || Number(chainId) !== 137) return { rows: [], note: 'Polygon history is shown in the live app only.' };
  const get = async (action) => {
    const r = await fetch(`${ETHERSCAN}?chainid=137&module=account&action=${action}&address=${evm}&page=1&offset=50&sort=desc&apikey=${key}`);
    const j = await r.json().catch(() => ({}));
    return j.status === '1' ? j.result : [];
  };
  const me = evm.toLowerCase();
  const [erc20, nft, sft] = await Promise.all([get('tokentx'), get('tokennfttx'), get('token1155tx')]);
  const rows = [];
  for (const t of erc20) {
    const v = Number(t.value) / 10 ** Number(t.tokenDecimal || 18);
    const inn = t.to.toLowerCase() === me;
    rows.push({ id: `p20-${t.hash}-${t.logIndex}`, at: Number(t.timeStamp), title: inn ? `Received ${t.tokenSymbol}` : `Sent ${t.tokenSymbol}`, sub: 'Polygon',
      amount: `${inn ? '+' : '−'}${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${t.tokenSymbol}`, chain: 'polygon', hash: t.hash });
  }
  for (const t of nft) {
    const inn = t.to.toLowerCase() === me;
    rows.push({ id: `p721-${t.hash}-${t.tokenID}`, at: Number(t.timeStamp), title: inn ? 'Land title received' : 'Land title sent', sub: `id ${t.tokenID}`, amount: inn ? '+1' : '−1', chain: 'polygon', hash: t.hash });
  }
  for (const t of sft) {
    const inn = t.to.toLowerCase() === me;
    rows.push({ id: `p1155-${t.hash}-${t.tokenID}`, at: Number(t.timeStamp), title: inn ? 'Crop share made' : 'Crop share moved', sub: 'FoodToken', amount: `${inn ? '+' : '−'}${t.tokenValue}`, chain: 'polygon', hash: t.hash });
  }
  return { rows, note: null };
}

/** Her history on both chains, newest first. */
export function useHistory(stellarAddress, evmAddress) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['history', stellarAddress, evmAddress], enabled: !!cfg && !!stellarAddress, staleTime: 30_000,
    queryFn: async () => {
      const [st, pg] = await Promise.all([
        stellarRows(cfg, stellarAddress).catch((e) => { throw e; }),
        polygonRows(evmAddress, process.env.REACT_APP_CHAIN_ID || 137).catch(() => ({ rows: [], note: 'Polygon history could not be read.' })),
      ]);
      return { rows: [...st, ...pg.rows].sort((a, b) => b.at - a.at), note: pg.note };
    },
  });
}
