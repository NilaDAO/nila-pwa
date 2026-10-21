// "Does she hold a land title?" for the new app: her Polygon titles (today's app, the move) and her titles on Stellar
// (a title written on Stellar only — the demo since 21 Oct, executive decision). A Polygon title mirrored on Stellar is
// the same title, so the count is the larger of the two, never the sum. undefined while either is still loading.
import { useLegacyBalances } from '../move/hooks';
import { useStellarTitleCount } from '../stellar/hooks';

export function useTitleCount(evm, stellarAddress) {
  const legacy = useLegacyBalances(evm);
  const st = useStellarTitleCount(stellarAddress);
  // A failed read counts as none (a new wallet has none; the mint refuses a second title anyway).
  const polygon = legacy.data ? legacy.data.titles : legacy.isError ? 0 : undefined;
  const stellar = !stellarAddress ? 0 : st.data != null ? st.data : st.isError ? 0 : undefined;
  const count = polygon === undefined || stellar === undefined ? undefined : Math.max(polygon, stellar);
  return { count, polygon, stellar, loading: count === undefined, legacy };
}

/** Query keys to refresh once a title may have arrived (R14). */
export const TITLE_KEYS = [['polygon', 'legacy'], ['stellar', 'titles']];
