// A12 history (board History): her own history, member and leader (the union's sync list is not used). One list,
// newest first, de-duplicated by transaction hash. Three sources (22 Oct):
//  1. Horizon: her account's operations (her own calls, fee-bumped or not), the nIN / USDC each moved.
//  2. Soroban RPC getEvents on the Nila contracts: what others did for her (node-sponsored calls, her title on Stellar,
//     crop shares attested, vouchers, cash counted, cash-outs paid), matched on her address, her crop-share token ids
//     and her title ids. RPC keeps about 7 days of events, so older rows come from Horizon only (an indexer would
//     keep them all).
//  3. Polygon logs (eth_getLogs on the app's RPC, no Etherscan key): FoodToken TransferSingle / TransferBatch and
//     land-title Transfer to or from her Polygon wallet. On the demo fork (31337) from the fork block; elsewhere a
//     recent window only (free RPCs limit the block range; an indexer would cover all of it). The live build's
//     Etherscan reads stay when its key is set.
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { useStellarConfig } from '../stellar/hooks';
import { tokenHex } from '../stellar/soroban';
import { useMyShares } from '../loan/MyShares';

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
  claim_junior_cash: ['Collected at the office', 'Union investment, in cash'],
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
  deposit_usdc_treasury: ['Treasury deposit', 'USDC into the union treasury'],
};

// Horizon's parameters: [contract, function name, ...the call's arguments].
function params(op) {
  try { return (op.parameters || []).map((x) => scValToNative(xdr.ScVal.fromXDR(x.value, 'base64'))); } catch { return []; }
}
function callName(op) {
  const fn = params(op)[1];
  return typeof fn === 'string' ? fn : String(fn || '');
}

// Amounts the call names when no nIN / USDC of hers moved (board A12: every row has its amount): cash counted at the
// office in rupees (nIN 7 decimals), machine hours. Argument positions from nila-soroban (fx_pool, machinery, fund_core); a[0] is the contract, a[1] the function.
const U = 10_000_000;
const rupees = (v) => `₹${(Number(v) / U).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
function amountFromArgs(fn, a) {
  try {
    if (fn === 'cash_scan_mint') return rupees(a[6]);                      // (leader, union, purpose, member, amount, …)
    if (fn === 'claim') return `+${Number(a[7])} h`;                         // (owner, machine, union, token, max_hours, hours)
    if (fn === 'draw_loan' && Number(a[6])) return `+${Number(a[6])} h`;     // (union, member, token, cash, hours)
    if (fn === 'repay_loan') return `−${rupees(a[4])}`;                      // (union, token, amount)
  } catch { /* an argument the app does not know: no amount */ }
  return '';
}

// Horizon knows plain G… accounts only: her calls are sent by her key (the sender), while her nIN / USDC sit on her
// smart account (C…), so a balance change to or from either is hers.
async function stellarRows(cfg, sender, account) {
  if (!sender?.startsWith('G')) return [];
  const r = await fetch(`${cfg.horizon_url}/accounts/${sender}/operations?order=desc&limit=100&join=transactions`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Horizon ${r.status}`);
  const [ninCode, ninIssuer] = cfg.nin_asset.split(':');
  const [usdcCode, usdcIssuer] = (cfg.usdc_asset || ':').split(':');
  const rows = [];
  for (const op of (await r.json())._embedded.records) {
    if (op.transaction_successful === false) continue;
    const at = new Date(op.created_at).getTime() / 1000;
    // a12-spec: account set-up, trustlines and fee wrappers are hidden.
    if (op.type !== 'invoke_host_function') continue;
    const fn = callName(op);
    const [title, sub] = CALLS[fn] || [fn.replace(/_/g, ' ') || 'Contract call', ''];
    // Her nIN / USDC moved by the call (SAC balance changes).
    let nin = 0; let usdc = 0;
    for (const c of op.asset_balance_changes || []) {
      const mine = (a) => a === sender || a === account;
      const sign = mine(c.to) ? 1 : mine(c.from) ? -1 : 0;
      if (!sign) continue;
      if (c.asset_code === ninCode && c.asset_issuer === ninIssuer) nin += sign * n(c.amount);
      if (c.asset_code === usdcCode && c.asset_issuer === usdcIssuer) usdc += sign * n(c.amount);
    }
    const amount = nin ? `${nin > 0 ? '+' : '−'}${Math.abs(nin).toLocaleString('en-IN')} nIN`
      : usdc ? `${usdc > 0 ? '+' : '−'}${Math.abs(usdc).toFixed(2)} USDC` : amountFromArgs(fn, params(op));
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

// ---- 2. Soroban events ----
const LEDGERS_PER_CALL = 10_000;   // the RPC scans at most this many ledgers per getEvents
const RETENTION = 120_000;         // about 7 days of ledgers (testnet and mainnet RPC retention)

async function rpcCall(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}
const native = (b64) => { try { return scValToNative(xdr.ScVal.fromXDR(b64, 'base64')); } catch { return undefined; } };
const hexOf = (v) => (v && typeof v === 'object' && v.length !== undefined ? Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('') : '');

async function nilaEvents(cfg) {
  const ids = ['fund_core', 'fx_pool', 'machinery', 'land_title'].map((k) => cfg.contracts?.[k]).filter(Boolean);
  if (!ids.length || !cfg.rpc_url) return [];
  const { sequence: latest } = await rpcCall(cfg.rpc_url, 'getLatestLedger', {});
  const chunks = [];
  for (let start = latest - RETENTION; start <= latest; start += LEDGERS_PER_CALL) chunks.push(start);
  const pages = await Promise.all(chunks.map(async (start) => {
    const out = [];
    let cursor = null;
    for (let i = 0; i < 5; i += 1) {
      const res = await rpcCall(cfg.rpc_url, 'getEvents', cursor
        ? { filters: [{ type: 'contract', contractIds: ids }], pagination: { limit: 1000, cursor } }
        : { startLedger: Math.max(1, start), endLedger: Math.min(latest + 1, start + LEDGERS_PER_CALL), filters: [{ type: 'contract', contractIds: ids }], pagination: { limit: 1000 } })
        .catch(() => null);   // a window before the RPC's oldest ledger, or a busy RPC: that window is left out
      if (!res) break;
      out.push(...res.events);
      if (res.events.length < 1000) break;
      cursor = res.cursor;
    }
    return out;
  }));
  return pages.flat().map((e) => {
    const topics = (e.topic || []).map(native);
    const v = native(e.value) || {};
    return { name: String(topics[0] || ''), topics, v, at: new Date(e.ledgerClosedAt).getTime() / 1000, hash: e.txHash, id: e.id };
  });
}

const nin = (v) => (Number(v) / U).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const PURPOSE = ['Invested in your union', 'Loan repaid', 'Recovery paid', 'Treasury deposit'];

/** Her rows among the Nila events: her address in a topic or the data, or her crop shares / titles. */
function eventRows(events, me, shareLabel) {
  const mine = new Set([me]);
  const titles = new Set();
  for (const e of events) if (e.name === 'title_set' && e.v.holder === me) titles.add(String(e.topics[1]));
  const rows = [];
  const shown = new Set();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const tok = e.topics[2] && typeof e.topics[2] === 'object' ? hexOf(e.topics[2]) : '';
    const share = tok && shareLabel(tok);
    const has = (x) => mine.has(x);
    const row = (title, sub, amount) => rows.push({ id: `ev-${e.id}`, at: e.at, title, sub, amount, chain: 'stellar', hash: e.hash });
    switch (e.name) {
      // The first time her title is set (a later set of the same title, e.g. a new record, is not a new title).
      case 'title_set': if (has(e.v.holder) && !shown.has(String(e.topics[1]))) { shown.add(String(e.topics[1])); row('Land title on Stellar', `id ${e.topics[1]}`, '+1'); } break;
      case 'title_burned': if (has(e.v.holder) || titles.has(String(e.topics[1]))) row('Land title burned', `id ${e.topics[1]}`, '−1'); break;
      case 'food_token_attested': if (has(e.v.member) || share) row(share ? `Crop share ready · ${share}` : 'Crop share ready', 'From your union', `₹${nin(e.v.amount)}`); break;
      case 'loan_drawn': if (has(e.v.borrower) || share) row(share ? `Crop share taken · ${share}` : 'Crop share taken', 'Cash at union office', `+₹${nin(e.v.cash)}`); break;
      case 'loan_repaid': if (share) row(`Loan repaid · ${share}`, 'Cash at union office', `−₹${nin(BigInt(e.v.principal_paid || 0) + BigInt(e.v.interest_paid || 0))}`); break;
      case 'loan_overdue': if (share) row(`Repayment overdue · ${share}`, 'Your crop share', ''); break;
      // Vouchers in centi tractor hours, hours worked in hundredths of an hour (23 Oct).
      case 'voucher_granted': if (has(e.v.member) || share) row('Machinery voucher', 'From your union', `+${(Number(e.v.units ?? e.v.hours) / 100).toFixed(1)} tractor ac`); break;
      case 'voucher_claimed':
        if (has(e.v.owner)) row('Machine job done', 'Your machine', e.v.acres != null ? `+${(Number(e.v.acres) / 100).toFixed(2)} ac` : `+${(Number(e.v.hours) / 100).toFixed(1)} h`);
        else if (share) row(`Machine job · ${share}`, 'Machinery voucher', `−${(Number(e.v.units ?? e.v.hours) / 100).toFixed(1)} tractor ac`);
        break;
      case 'dues_collected': if (has(e.topics[2])) row('Machine dues collected', 'From your union', `+₹${nin(e.v.amount)}`); break;
      case 'machine_registered': if (has(e.v.owner)) row('Machine registered', 'By your leader', '+1'); break;
      case 'deposit': if (has(e.topics[1])) row('Invested in your union', 'Union investment', `+${nin(e.v.amount)} nIN`); break;
      case 'unbond_requested': if (has(e.topics[1])) row('Withdrawal started', 'Union investment', `−${nin(e.v.principal_snap)} nIN`); break;
      // 22 Oct, desk only: a member's claim is paid in cash at the office (cash flag; cash_settled = rupees handed out).
      case 'claimed': if (has(e.topics[1])) {
        if (e.v.cash) row(`Collected ₹${nin(e.v.cash_settled ?? e.v.amount)} at the office`, 'Union investment, in cash', '');
        else row('Withdrawal paid', 'Union investment', `+${nin(e.v.amount)} nIN`);
      } break;
      case 'cash_scanned': if (has(e.topics[2])) row(PURPOSE[Number(e.v.purpose)] || 'Cash counted', 'Cash at union office', `₹${nin(e.v.amount)}`); break;
      case 'cash_out_requested': if (has(e.topics[2])) row('Cash out', 'At the union office', `−${nin(e.v.amount)} nIN`); break;
      case 'cash_out_paid': if (has(e.topics[2])) row('Cashed out at the union office', '', `₹${nin(e.v.amount)}`); break;
      case 'cash_out_reclaimed': if (has(e.topics[2])) row('Cash-out taken back', 'Your nIN back', `+${nin(e.v.amount)} nIN`); break;
      case 'nin_moved': if (has(e.topics[2])) row('From the old app', 'Your nIN moved to Stellar', `+${nin(e.v.amount)} nIN`); break;
      default: break;
    }
  }
  return rows;
}

// ---- 3. Polygon logs ----
const TRANSFER_SINGLE = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const TRANSFER_BATCH = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb';
const TRANSFER_721 = ethers.id('Transfer(address,address,uint256)');
const POLYGON_WINDOW = 50_000;    // blocks, outside the fork (about a day on Polygon)
const BLOCKS_PER_CALL = 5_000;

async function polygonLogRows(evm, shareLabel) {
  const chainId = Number(process.env.REACT_APP_CHAIN_ID) || 137;
  const url = chainId === 137 ? process.env.REACT_APP_RPC_ALCHEMY : process.env.REACT_APP_RPC;
  const ft = process.env.REACT_APP_FOODTOKEN_ADDRESS;
  const lt = process.env.REACT_APP_LAND_TITLE_MAIN;
  if (!evm || !url || !ft) return [];
  const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
  const latest = await p.getBlockNumber();
  let from = latest - POLYGON_WINDOW;
  if (chainId === 31337) {
    const md = await p.send('hardhat_metadata', []).catch(() => null);
    from = (md?.forkedNetwork?.forkBlockNumber ?? from) + 1;
  }
  const me = ethers.zeroPadValue(evm.toLowerCase(), 32);
  const filters = [
    { address: ft, topics: [[TRANSFER_SINGLE, TRANSFER_BATCH], null, null, me] },
    { address: ft, topics: [[TRANSFER_SINGLE, TRANSFER_BATCH], null, me] },
    ...(lt ? [{ address: lt, topics: [TRANSFER_721, null, me] }, { address: lt, topics: [TRANSFER_721, me] }] : []),
  ];
  const windows = [];
  for (let b = from; b <= latest; b += BLOCKS_PER_CALL) windows.push([b, Math.min(latest, b + BLOCKS_PER_CALL - 1)]);
  const logs = (await Promise.all(windows.flatMap(([a, b]) => filters.map((f) => p.getLogs({ ...f, fromBlock: a, toBlock: b }).catch(() => []))))).flat();
  const seen = new Set();
  const uniq = logs.filter((l) => { const k = `${l.transactionHash}-${l.index}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const times = {};
  await Promise.all([...new Set(uniq.map((l) => l.blockNumber))].map(async (bn) => { times[bn] = (await p.getBlock(bn).catch(() => null))?.timestamp || 0; }));
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const rows = [];
  for (const l of uniq) {
    const to = ethers.dataSlice(l.topics[l.topics[0] === TRANSFER_721 ? 2 : 3], 12).toLowerCase();
    const inn = to === evm.toLowerCase();
    if (l.topics[0] === TRANSFER_721) {
      const id = BigInt(l.topics[3]).toString();
      rows.push({ id: `pl-${l.transactionHash}-${l.index}`, at: times[l.blockNumber], title: inn ? 'Land title received' : 'Land title sent', sub: `id ${id}`, amount: inn ? '+1' : '−1', chain: 'polygon', hash: l.transactionHash });
      continue;
    }
    const pairs = l.topics[0] === TRANSFER_SINGLE
      ? [coder.decode(['uint256', 'uint256'], l.data)]
      : (() => { const [ids, vals] = coder.decode(['uint256[]', 'uint256[]'], l.data); return ids.map((id, i) => [id, vals[i]]); })();
    pairs.forEach(([id, value], i) => {
      const label = shareLabel(tokenHex(id.toString()));
      // A FoodToken's units are the expected harvest in kg.
      rows.push({ id: `pl-${l.transactionHash}-${l.index}-${i}`, at: times[l.blockNumber], title: `${inn ? 'Crop share made' : 'Crop share moved'}${label ? ` · ${label}` : ''}`,
        sub: inn ? 'Minted by your union' : 'Polygon', amount: `${inn ? '+' : '−'}${Number(value).toLocaleString('en-IN')} kg`, chain: 'polygon', hash: l.transactionHash });
    });
  }
  return rows;
}

/** Her history (member and leader), newest first. */
export function useHistory(stellarAddress, evmAddress, senderAddress) {
  const { data: cfg } = useStellarConfig();
  const shares = useMyShares();
  // Her crop shares by token id (64 hex): "Sesame Area 1", put in the row's title (Today rows show only the time).
  const labels = {};
  for (const x of shares.data || []) labels[tokenHex(x.token_id)] = `${(x.crop || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} Area ${x.area}`;
  const shareLabel = (hex) => labels[String(hex).replace(/^0x/, '').toLowerCase().padStart(64, '0')] || '';
  const ready = !shares.isLoading;
  return useQuery({
    queryKey: ['history', stellarAddress, senderAddress, evmAddress, Object.keys(labels).length], enabled: !!cfg && !!stellarAddress && ready, staleTime: 30_000,
    queryFn: async () => {
      const [st, ev, pg, pl] = await Promise.all([
        // Each source fails on its own: a read that fails hides only its rows.
        stellarRows(cfg, senderAddress, stellarAddress).catch(() => []),
        nilaEvents(cfg).catch(() => []),
        polygonRows(evmAddress, process.env.REACT_APP_CHAIN_ID || 137).catch(() => ({ rows: [], note: null })),
        polygonLogRows(evmAddress, shareLabel).catch(() => []),
      ]);
      // De-duplicated by transaction: a call of her own is her Horizon row; the events of other transactions are added
      // (one transaction can carry several of hers, e.g. crop shares attested together).
      const byHash = new Set(st.map((r) => r.hash).filter(Boolean));
      const evRows = eventRows(ev, stellarAddress, shareLabel).filter((r) => !byHash.has(r.hash));
      const pgHashes = new Set(pg.rows.map((r) => r.hash));
      const rows = [...st, ...evRows, ...pg.rows, ...pl.filter((r) => !pgHashes.has(r.hash))];
      return { rows: rows.sort((a, b) => b.at - a.at), note: pg.note };
    },
  });
}
