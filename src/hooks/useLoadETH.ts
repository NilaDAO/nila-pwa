import { useQuery }  from "@tanstack/react-query";
import { ethers, formatUnits } from "ethers";
import { useProvider, useBasicProvider } from "./useWallet.ts";
import MulticallAbi  from "../components/ABI/MultiCall3.json";
import nilaGrantAbi  from '../components/ABI/NilaGrant.json';
import landTitleArtifact  from '../components/ABI/NilaLandTitleWithName.json';
const landTitleAbi = (landTitleArtifact as any).abi ?? landTitleArtifact;
import erc20ABI  from '../components/ABI/genericErc20.json';
import priceFeedAbi from '../components/ABI/USDCPriceFeed.json';
import foodTokensArtifact from '../components/ABI/FoodTokens.json';
const foodTokenAbi = (foodTokensArtifact as any).abi ?? foodTokensArtifact;
import { FetchThumb } from '../components/Forms/farmName.js';
import { readItem, setDBitem } from '../utils/db';
import { parseCompactMeta, getCenter, ringsAreaMeters2 } from '../utils/fetch_landTitleMeta.ts';
import { decodeMetadataUri } from '../utils/decodeMetadataUri.ts';
import { useDataContext } from "../utils/NavigationContext.js";

const nilaGrantContract = String(process.env.REACT_APP_GRANT_ADDRESS)
const foodTokenContract = process.env.REACT_APP_FOODTOKEN_ADDRESS || ''
const USDCpriceFeedAddress = '0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16';
const USDTpriceFeedAddress = '0x0A6513e40db6EB1b165753AD52E80663aeA50545'; // update to real USDT feed when available
const INRpriceFeedAddress  = '0xDA0F8Df6F5dB15b346f4B8D1156722027E194E60'; // Chainlink USD/INR feed
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const inrFeedCache: { value: number | null; fetchedAt: number } = { value: null, fetchedAt: 0 };


const MAIN_POLYGON_TOKENS = [
  { addr: String(process.env.REACT_APP_NIN_MAIN), abi: erc20ABI, decimals: 18, key: "NILA" },
  { addr: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", abi: erc20ABI, decimals: 6,  key: "USDT" },
];
// Local Hardhat chain (chainId 31337) — addresses from .env.local
const LOCAL_TOKENS = [
  { addr: String(process.env.REACT_APP_NIN_MAIN),  abi: erc20ABI, decimals: 18, key: "NILA" },
  { addr: String(process.env.REACT_APP_USDT_MAIN || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"), abi: erc20ABI, decimals: 6, key: "USDT" },
].filter(t => t.addr && t.addr !== 'undefined');

const LOOKUP_TABLE : any = {
    "0": {
        "crop": "Paddy",
        "varieties": {
            "0": "CO51",
            "1": "ADT 43",
            "2": "TRY 3",
            "3": "BPT 5204"
        }
    },
    "1": {
        "crop": "Groundnut",
        "varieties": {
            "0": "TMV 7",
            "1": "TMV 13",
            "2": "VRI 2",
            "3": "VRI 3",
            "4": "VRI 6"
        }
    },
    "2": {
        "crop": "Sugarcane",
        "varieties": {
            "0": "CO 86032",
            "1": "COC 24",
            "2": "COC 671",
            "3": "CO 62175",
            "4": "CoG 94077",
            "5": "CoG 6",
            "6": "Co 86032 (10‑12 mnths)",
            "7": "CoSi (SC)6",
            "8": "TNAU SC Si 7",
            "9": "TNAU SC Si 8",
            "10": "COC 25"
        }
    },
    "3": {
        "crop": "Banana",
        "varieties": {
            "0": "Grand Naine",
            "1": "Poovan",
            "2": "Nendran",
            "3": "Rasthali",
            "4": "Monthan",
            "5": "Ney Poovan"
        }
    },
    "4": {
        "crop": "Potato",
        "varieties": {
            "0": "Kufri Jyoti",
            "1": "Kufri Super",
            "2": "Kufri Surya",
            "3": "Kufri Swarna"
        }
    },
    "5": {
        "crop": "Onion",
        "varieties": {
            "0": "CO 3",
            "1": "CO (On) 5",
            "2": "Arka Kalyan",
            "3": "Agrifound Dark Red"
        }
    }
}

/**
 * how to fetch erc1155 token naming
 * we store ids and field ids in local storage, 
 * when not available, 
 * we use indexer and predict pixels based on activity 
 */

export type Bal    = { type: string, id: number, sym: string; bal: number, p: number, cropCode?: number, varietyCode?: number };
export type Land    = { sym: string; bal: number, p: number, metadata: number[][], id: string };
export type Enabled = { enabled: boolean }

export function useErc20Balances(chain: string, address: string, enabled: Enabled, landTitleId?: number) {
  const { provider } = useProvider();
  const { basicprovider }: any = useBasicProvider();
  const rpc = provider ?? basicprovider;
  const DAILYMS = 24 * 60 * 60 * 1000;

  return useQuery({
    enabled: enabled.enabled && !!address,
    queryKey: ["balances", chain, address, landTitleId ?? null],
    staleTime: DAILYMS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: DAILYMS,
    refetchIntervalInBackground: true,
    retry: 3,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 8000),
    networkMode: 'always',
    queryFn: async () => {
      try {
        const mc         = new ethers.Contract("0xcA11bde05977b3631167028862bE2a173976CA11", MulticallAbi, rpc);
        const erc20Iface = new ethers.Interface(erc20ABI);
        const foodIface  = new ethers.Interface(foodTokenAbi);

        // ── ERC-20 calls ──────────────────────────────────────────────────────
        let erc20Calls: [string, string][] = [];
        if (chain === '31337') {
          erc20Calls = LOCAL_TOKENS.flatMap(t => [
            [t.addr, erc20Iface.encodeFunctionData("symbol")],
            [t.addr, erc20Iface.encodeFunctionData("balanceOf", [address])],
          ]);
        } else if (chain === '137') {
          erc20Calls = MAIN_POLYGON_TOKENS.flatMap(t => [
            [t.addr, erc20Iface.encodeFunctionData("symbol")],
            [t.addr, erc20Iface.encodeFunctionData("balanceOf", [address])],
          ]);
        }

        // ── Food tokens: getLandTitleTokens → getToken + balanceOf ────────────
        async function fetchFoodTokens(): Promise<Bal[]> {
          if (!foodTokenContract || !address) return [];
          try {
            // Resolve land title ID: use prop if provided, else look it up on-chain
            let ltId = landTitleId;
            if (!ltId) {
              const lt = new ethers.Contract(String(process.env.REACT_APP_LAND_TITLE_MAIN), landTitleAbi, rpc);
              const bal = await lt.balanceOf(address);
              if (bal === 0n) { console.log('[food] no land title'); return []; }
              ltId = Number(await lt.tokenOfOwnerByIndex(address, 0));
            }
            console.log('[food] landTitleId resolved:', ltId, 'contract:', foodTokenContract);
            const foodContract = new ethers.Contract(foodTokenContract, foodTokenAbi, rpc);
            // Array.from: ethers v6 returns a read-only Result object; we need a mutable copy
            const tokenIds: bigint[] = Array.from(await foodContract.getLandTitleTokens(ltId));
            console.log('[food] tokenIds for ltId', ltId, ':', tokenIds.map(String));
            if (tokenIds.length === 0) return [];

            const innerCalls = tokenIds.flatMap(id => [
              { target: foodTokenContract, callData: foodIface.encodeFunctionData("getToken",   [id]) },
              { target: foodTokenContract, callData: foodIface.encodeFunctionData("balanceOf",  [address, id]) },
            ]);
            const [, foodData] = await mc.aggregate.staticCall(innerCalls);

            const items: Bal[] = [];
            tokenIds.forEach((id, i) => {
              const tok  = foodIface.decodeFunctionResult("getToken",  foodData[i * 2])[0];
              const balN = foodIface.decodeFunctionResult("balanceOf", foodData[i * 2 + 1])[0] as bigint;
              if (balN === 0n) return;

              const cropCode    = Number(tok.cropCode    ?? tok[2]);
              const varietyCode = Number(tok.varietyCode ?? tok[3]);
              const cropEntry   = (LOOKUP_TABLE as any)[cropCode];
              const cropName    = cropEntry?.crop ?? `Crop ${cropCode}`;
              const varName     = cropEntry?.varieties?.[varietyCode] ?? `Var ${varietyCode}`;

              items.push({ type: 'ERC1155', id: Number(id), sym: `${cropName}-${varName}`, bal: Number(balN), p: 0, cropCode, varietyCode });
            });
            return items;
          } catch (e) {
            console.warn('[balance] food token fetch failed:', e);
            return [];
          }
        }

        // ── Phase 1: parallel network calls ──────────────────────────────────
        const erc20Promise = erc20Calls.length > 0
          ? mc.aggregate.staticCall(erc20Calls)
          : Promise.resolve([0n, [] as string[]]);

        const [[, erc20Data], foodItems] = await Promise.all([
          erc20Promise,
          fetchFoodTokens(),
        ]);

        // ── Phase 2: price feeds (parallel) ──────────────────────────────────
        const _mainnetRpc = process.env.REACT_APP_RPC_MAINNET || process.env.REACT_APP_RPC_ALCHEMY || '';
        const priceFeedProvider: ethers.Provider = new ethers.JsonRpcProvider(_mainnetRpc);

        async function getUsdcPrice() {
          try {
            const r = await new ethers.Contract(USDCpriceFeedAddress, priceFeedAbi, priceFeedProvider).latestRoundData();
            return Number(r.answer) / 1e8;
          } catch { return 1; }
        }
        async function getUsdtPrice() {
          try {
            const r = await new ethers.Contract(USDTpriceFeedAddress, priceFeedAbi, priceFeedProvider).latestRoundData();
            return Number(r.answer) / 1e8;
          } catch { return 1; }
        }
        async function getINRprice() {
          if (Number.isFinite(inrFeedCache.value) && (Date.now() - inrFeedCache.fetchedAt) < ONE_DAY_MS) {
            return inrFeedCache.value as number;
          }
          try {
            const r     = await new ethers.Contract(INRpriceFeedAddress, priceFeedAbi, priceFeedProvider).latestRoundData();
            const price = Number(r.answer) / 1e8;
            inrFeedCache.value     = price;
            inrFeedCache.fetchedAt = Date.now();
            return price;
          } catch {
            return Number.isFinite(inrFeedCache.value) ? inrFeedCache.value as number : 1;
          }
        }

        const [inrPrice, usdcPrice, usdtPrice] = await Promise.all([getINRprice(), getUsdcPrice(), getUsdtPrice()]);

        // ── Decode ERC-20 ─────────────────────────────────────────────────────
        const decoded: Bal[] = [];
        const TOKENBOOK = chain === '31337' ? LOCAL_TOKENS : MAIN_POLYGON_TOKENS;
        let idx = 0;

        for (const t of TOKENBOOK) {
          const raw_sym = erc20Iface.decodeFunctionResult("symbol",    erc20Data[idx++])[0] as string;
          const sym     = raw_sym === "NILA" ? "nIN" : raw_sym === "USDT0" ? "USDT" : raw_sym;
          const raw     = erc20Iface.decodeFunctionResult("balanceOf", erc20Data[idx++])[0] as bigint;
          const price   = sym === "nIN" ? inrPrice : sym === "USDC" ? usdcPrice : sym === "USDT" ? usdtPrice : 1;
          decoded.push({ type: "ERC20", id: 0, sym, bal: parseFloat(formatUnits(raw, t.decimals)), p: price });
        }

        decoded.push(...foodItems);
        console.log('[balance] ERC20 + food', decoded);
        return decoded;
      } catch (e) {
        console.log('[balance] error', e);
        return [];
      }
    }
  });
}

export function useGrantInfo(
  chain: string,
  address: string,
  unionAddress: string,
  foodtokens: number,
  enabled: boolean,
) {
  const { provider } = useProvider()

  const EMPTY = {
    pending: 0,
    initialClaim: false,
    months: [] as number[],
    amounts: [] as number[],
    alreadyClaimed: true,
  };

  return useQuery({
    queryKey: ['grant', chain, address],
    enabled: Boolean(enabled), // explicit
    retry: 0,   
    staleTime: 24 * 60 * 60 * 1000, // 24 h
    refetchOnMount: false,  // avoid this one called to often. 
    queryFn: async () => {
      const food = foodtokens - 1
      let rewards = 0
      const code = await provider!.getCode(nilaGrantContract);
      const blocktimestamp : any = await provider!.getBlock("latest");
      if (code === '0x') return EMPTY;

      const grant   = new ethers.Contract(nilaGrantContract, nilaGrantAbi, provider);
      const nowMth  = blocktimestamp.timestamp / 2629743; // block's "month"
      const _nowMth =  Math.floor(nowMth)
      console.log('nowMth', nowMth)

      // we only need to know the events when the user clicks certgrid, so we use viewer getGrantData to
      // periodically check month and recalc reward if month has changed.
      console.log('address',address)

      const data = await grant.getGrantData(address,unionAddress,food)
      const contractMonth =  Number(data[2])
      console.log('contractMonth',contractMonth)
      console.log('_nowMth',_nowMth)
      if (contractMonth !== _nowMth){
        // recalculate rewards
        rewards = await grant.calculateRewards(address,unionAddress,food)
      }

      console.log('pendingRaw', rewards, data)

      const GRANT = {
        pending: Number(rewards) / 1e18,
        currentMonth: nowMth,
        currentUnix: blocktimestamp.timestamp,
        currentBlock: blocktimestamp.number,
        initialClaim: data[0] === 0n,
        months: [] as number[],
        amounts: [] as number[],
        claims: [] as number[],
        alreadyClaimed: contractMonth === _nowMth,
      }

      return GRANT
  }
  });
}

export function useLandTitle(
  chain: string,
  address: string,
  enabled: boolean,
  pendingMint: boolean = false
) {
  const { provider } = useProvider();
  const { db, setDb }    = useDataContext() 
  
  // helpers to fetch API and write to db
  const StoreName = async (onchainname: any) => {
      await setDBitem('farmname',onchainname,'Init')
  }

  return useQuery({
    queryKey: ['land', chain, address],     // <- address in the key
    enabled: enabled,
    staleTime: pendingMint ? 0 : 30 * 24 * 60 * 60 * 1000,    // 30 days unless pending mint
    refetchInterval: pendingMint ? 15_000 : false,
    refetchOnWindowFocus: pendingMint,
    queryFn: async () => {
      try {
        const landTitleAddress = String(process.env.REACT_APP_LAND_TITLE_MAIN)
        console.log('landTitleAddress', landTitleAddress, 'isAddress', ethers.isAddress(landTitleAddress));
        const land      = new ethers.Contract(landTitleAddress, landTitleAbi, provider);
        const bal       = await land.balanceOf(address);
        console.log('land bal', bal);
        if (bal === 0n) return { hasLand: false };

        const id      = await land.tokenOfOwnerByIndex(address!, 0);
        const uri     = await land.tokenURI(id);
        const meta    = await decodeMetadataUri(uri);

        console.log('land meta', meta);

        const classifyPolygon = (a:any) => {
            return Array.isArray(a[0])
          };

        // set farm name we got from metadata
        StoreName(meta.farm)
        // only perform this if meta has v (version 1 or more)
        const { outlineRings, fieldRings, centroid, bbox } = parseCompactMeta(meta);
        const area_m2 = Number(ringsAreaMeters2(outlineRings).toFixed(2));
        console.log('outlineRings', outlineRings)
        console.log('fieldRings', fieldRings)
        console.log('centroid', centroid)
        console.log('area_m2', area_m2)
        console.log('bbox', bbox)

        // set the LAND object
        const LAND  = { 
          sym: 'LAND', 
          bal: 1, 
          p: 36_000, 
          metadata: {
            'v': meta.v,
            'outline': outlineRings,
            'mp': classifyPolygon(meta.out), // true = MultiPolygon, false = Polygon
            'fields': fieldRings,
            'field_features': {
              type: 'FeatureCollection',
              features: fieldRings.map((f: any, idx: number) => ({
                type: 'Feature',
                id: idx + 1,
                properties: { name: f.name || `Field ${idx + 1}` },
                geometry: {
                  type: 'Polygon',
                  coordinates: [f.coordinates.map((pt: any) => [pt.lng, pt.lat])],
                },
              })),
            },
            'centroid': centroid,
            'bbox': bbox,
            'farm': meta.farm,
            'area_m2': area_m2 }, 
          id: id.toString() 
        };

          
        if (!db['thumb']) {
            // load the thumbnail image of map cards silently
            await FetchThumb(LAND).then(res => {
              setDb('thumb',res,'FarmData')
            })
        }
        return { hasLand: true, LAND };

      } catch (err) {
        console.log("land fetch error", err);
        return { hasLand: false };
      }
  }});
}
