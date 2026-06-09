import { useQuery } from '@tanstack/react-query';
import { useContract, useWallet } from './useWallet.ts';
import { CROP_CODE_NAMES } from './useFoodTokenBatches.ts';
import foodTokenArtifact from '../components/ABI/FoodTokens.json';

const foodTokenAbi = (foodTokenArtifact as any).abi ?? foodTokenArtifact;
const FOOD_TOKEN_ADDRESS = process.env.REACT_APP_FOODTOKEN_ADDRESS;
const FIVE_MIN = 5 * 60_000;

export interface UnionPrice {
  crop_code: number;
  price_usdt_per_kg: number;  // canonical batch pricePerKgUsdt / 1e6
  batch_id: string;
}

export function useUnionPrices(_unionAddr?: string) {
  const { wallet } = useWallet();
  const foodToken = useContract(FOOD_TOKEN_ADDRESS, foodTokenAbi, wallet);
  const cropCodes = Object.keys(CROP_CODE_NAMES).map(Number);

  return useQuery<UnionPrice[]>({
    queryKey: ['unionPrices', 'onchain'],
    enabled: !!foodToken,
    staleTime: FIVE_MIN,
    gcTime: FIVE_MIN,
    queryFn: async () => {
      const results: UnionPrice[] = [];
      for (const cropCode of cropCodes) {
        try {
          const batchId: bigint = await foodToken!.canonicalBatch(cropCode);
          if (batchId === 0n) continue;
          const batch = await foodToken!.getBatch(batchId);
          if (!batch.active || batch.pricePerKgUsdt === 0n) continue;
          results.push({
            crop_code: cropCode,
            price_usdt_per_kg: Number(batch.pricePerKgUsdt) / 1e6,
            batch_id: batchId.toString(),
          });
        } catch {
          // crop not registered on this network
        }
      }
      return results;
    },
  });
}
