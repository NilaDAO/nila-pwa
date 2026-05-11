import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UnionPrice {
  crop_code: number;
  price_inr_per_kg: number;
  updated_at: number;
}

const BASE = process.env.REACT_APP_API_BASE_URL ?? '';

export function useUnionPrices(unionAddr?: string) {
  return useQuery<UnionPrice[]>({
    queryKey: ['unionPrices', unionAddr],
    enabled: !!unionAddr,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`${BASE}/union/${unionAddr}/prices`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.prices ?? []) as UnionPrice[];
    },
  });
}

export function useSetUnionPrice(unionAddr?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ crop_code, price_inr_per_kg }: { crop_code: number; price_inr_per_kg: number }) => {
      const res = await fetch(`${BASE}/union/${unionAddr}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop_code, price_inr_per_kg }),
      });
      if (!res.ok) throw new Error('Failed to save price');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unionPrices', unionAddr] });
    },
  });
}
