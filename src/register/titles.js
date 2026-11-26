// "Does she hold a land title?" for the new app: her Polygon titles (today's app, the move) and her titles on Stellar
// (a title written on Stellar only — the demo since 21 Oct, executive decision). A Polygon title mirrored on Stellar is
// the same title, so the count is the larger of the two, never the sum. undefined while either is still loading.
import { useLegacyBalances } from '../move/hooks';
import { useStellarTitleCount } from '../stellar/hooks';

export function useTitleCount(evm, stellarAddress) {
  const legacy = useLegacyBalances(evm);
  const st = useStellarTitleCount(stellarAddress);
  // No Polygon wallet in this session (7 Nov: a moved member signed in with Privy only): the Polygon read never
  // starts, so it counts as none and her Stellar titles decide; waiting for it left her on the loader for good.
  const polygon = !evm ? 0 : legacy.data ? legacy.data.titles : undefined;
  const stellar = !stellarAddress ? 0 : st.data != null ? st.data : undefined;
  // A failed read is never "none" (SCF T2 row 25, 19 Nov; was: counted as 0, which could send a title holder to
  // registration). A title on the other chain is enough; otherwise the count stays unknown and `failed` names the chain.
  const failed = [!!evm && polygon === undefined && legacy.isError && 'polygon',
    !!stellarAddress && stellar === undefined && st.isError && 'stellar'].filter(Boolean);
  const pending = (polygon === undefined && !failed.includes('polygon')) || (stellar === undefined && !failed.includes('stellar'));
  const known = [polygon, stellar].filter((v) => v !== undefined);
  const count = pending ? undefined : known.some((v) => v >= 1) ? Math.max(...known) : failed.length ? undefined : 0;
  const retry = () => { if (failed.includes('polygon')) legacy.refetch?.(); if (failed.includes('stellar')) st.refetch?.(); };
  return { count, polygon, stellar, loading: count === undefined, failed: count === undefined ? failed : [], pendingOther: pending, retry, legacy };
}

/** Query keys to refresh once a title may have arrived (R14). */
export const TITLE_KEYS = [['polygon', 'legacy'], ['stellar', 'titles'], ['stellar', 'titleList'], ['polygon', 'titles']];
