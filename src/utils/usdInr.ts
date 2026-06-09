import { ethers } from 'ethers';
import priceFeedAbi from '../components/ABI/USDCPriceFeed.json';

// Chainlink USD/INR feed (Polygon) — same feed useLoadETH reads for balances.
// answer / 1e8 is USD-per-INR (price of ₹1 ≈ $0.0105), so we INVERT it to get
// ₹-per-USD (~95). Cached for a day; price feeds are read off the mainnet RPC
// even on local chains.
const INR_FEED = '0xDA0F8Df6F5dB15b346f4B8D1156722027E194E60';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const cache: { value: number | null; at: number } = { value: null, at: 0 };

export async function getUsdInr(): Promise<number> {
  if (cache.value && Date.now() - cache.at < ONE_DAY_MS) return cache.value;
  try {
    const rpc = process.env.REACT_APP_RPC_MAINNET || process.env.REACT_APP_RPC_ALCHEMY || '';
    const provider = new ethers.JsonRpcProvider(rpc);
    const r = await new ethers.Contract(INR_FEED, priceFeedAbi as any, provider).latestRoundData();
    const usdPerInr = Number(r.answer) / 1e8;          // ₹1 in USD (~0.0105)
    if (Number.isFinite(usdPerInr) && usdPerInr > 0) {
      const inrPerUsd = 1 / usdPerInr;                 // ₹ per USD (~95)
      cache.value = inrPerUsd;
      cache.at = Date.now();
      return inrPerUsd;
    }
  } catch {
    /* fall through to cached/0 */
  }
  return cache.value ?? 0;
}
