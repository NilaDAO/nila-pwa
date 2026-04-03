import { useQuery } from "@tanstack/react-query";
import { useProvider } from "./useWallet.ts";

// fetcher function
async function fetchPolygonTxs(address,chain) {
  if (!address) return []
  const apiKey = process.env.REACT_APP_ETHERSCAN_KEY  
  const url = `https://api.etherscan.io/v2/api
    ?chainid=${chain}
    &module=account
    &action=tokentx
    &address=${address}
    &startblock=0
    &endblock=latest
    &page=1
    &offset=25
    &sort=desc
    &apikey=${apiKey}`.replace(/\s+/g, '')

  console.log('url', url, address);
  const res = await fetch(url)
  const { status, result } = await res.json()
  if (status !== '1') throw new Error('Failed to fetch txs')
  return result // array of tx objects
}

async function fetchBlockNumber(provider) {
    const block = provider.getBlockNumber()
    return block
}

export function useLatestBlock() {
    const { provider } = useProvider();

    return useQuery({
        queryKey: ['latestBlock'],
        enabled: false, // NOT ENABLED
        refetchInterval: 1000 * 3, // poll every 30s if you want updates
        refetchOnWindowFocus: true,
        queryFn: async () => fetchBlockNumber(provider)
    })
}

export function usePolygonIndexer(address,chain) {
  return useQuery({
    queryKey: ['polygonTxs', address],
    enabled: !!address, // explicit
    staleTime: 1000 * 10, // 10 seconds cache
    refetchOnWindowFocus: true,
    queryFn: async () => fetchPolygonTxs(address,chain)
  }
  )
}
