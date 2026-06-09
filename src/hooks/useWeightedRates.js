import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const isBytes32 = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
const pairKey = (union, fund) => `${String(union || '').toLowerCase()}-${String(fund || '').toLowerCase()}`;

async function fetchWeightedRates(baseUrl, pairs) {
  if (!pairs?.length) return { count: 0, items: [] };
  const body = { items: pairs, include_history: true };

  let r = await fetch(`${baseUrl}/stats/weighted-rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  console.log('weightedRate parsed', data);
  return data;
}

export function useWeightedRates(data, sums, unionAddress) {
  const pairs = useMemo(() => {
    if (!unionAddress) return [];

    const fromData = Array.isArray(data)
      ? data.map((fund, idx) => fund?.tokens?.[0]?.loanType || sums?.funds?.[idx]?.fund_id)
      : [];
    const fromSums = Array.isArray(sums?.funds)
      ? sums.funds.map((fund) => fund?.fund_id)
      : [];

    const seen = new Set();
    const funds = [...fromData, ...fromSums]
      .filter((fund) => isBytes32(fund))
      .map((fund) => String(fund).toLowerCase())
      .filter((fund) => {
        if (seen.has(fund)) return false;
        seen.add(fund);
        return true;
      })
      .sort();

    return funds.map((fund) => ({ union: unionAddress, fund }));
  }, [data, sums?.funds, unionAddress]);

  const query = useQuery({
    queryKey: ['weightedRate', 'v2', unionAddress, pairs.map((p) => p.fund).join('|')],
    enabled: Boolean(API_BASE_URL && pairs.length > 0),
    staleTime: WEEK_MS,
    gcTime: WEEK_MS,
    refetchInterval: WEEK_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: () => fetchWeightedRates(API_BASE_URL, pairs),
  });

  const { rateByPair, historyByPair } = useMemo(() => {
    const rates = {};
    const history = {};
    for (const item of query.data?.items || []) {
      if (!item?.fund) continue;
      const key = pairKey(item.union, item.fund);
      const bp = Number(item?.weighted_rate_bp);
      if (item?.found && Number.isFinite(bp)) {
        rates[key] = bp / 100;
      }
      if (Array.isArray(item?.history)) {
        history[key] = item.history
          .map((h) => ({
            updatedAt: h.updated_at,
            ratePct: Number(h.weighted_rate_bp) / 100,
            loanCount: h.loan_count,
            totalAmount: h.total_amount,
            dormantCashAmount: h.dormant_cash_amount,
          }))
          .filter((h) => Number.isFinite(h.ratePct));
      }
    }
    return { rateByPair: rates, historyByPair: history };
  }, [query.data]);

  return { ...query, rateByPair, historyByPair, pairs };
}
