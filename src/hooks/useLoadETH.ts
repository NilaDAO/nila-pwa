import { useQuery }  from "@tanstack/react-query";
import { ethers, formatUnits } from "ethers";
import { useProvider, useBasicProvider } from "./useWallet.ts";
import MulticallAbi  from "../components/ABI/MultiCall3.json";
import nilaGrantAbi  from '../components/ABI/NilaGrant.json';
import foodTokensAbi  from '../components/ABI/FoodTokens.json';
import landTitleAbi  from '../components/ABI/NilaLandTitleWithName.json'; //NilaLandTitleWithName
import erc20ABI  from '../components/ABI/genericErc20.json';
import erc1155ABI  from '../components/ABI/genericErc1155.json';
import priceFeedAbi from '../components/ABI/USDCPriceFeed.json';
import { FetchThumb } from '../components/Forms/farmName.js';
import { readItem, setDBitem } from '../utils/db';
import { fetchErc1155MintsChunked } from '../utils/fetch_erc1155_chunked.tsx';
import { parseCompactMeta, getCenter, ringsAreaMeters2 } from '../utils/fetch_landTitleMeta.ts';
import { decodeMetadataUri } from '../utils/decodeMetadataUri.ts';
import { useDataContext } from "../utils/NavigationContext.js";

const nilaGrantContract = String(process.env.REACT_APP_GRANT_ADDRESS)
const foodTokenContract = '0x27C4115d77ECA4f300fB34060b1719A3d1159709'
const USDCpriceFeedAddress = '0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16';
const USDTpriceFeedAddress = '0x0A6513e40db6EB1b165753AD52E80663aeA50545'; // update to real USDT feed when available
const INRpriceFeedAddress  = '0xDA0F8Df6F5dB15b346f4B8D1156722027E194E60'; // Chainlink USD/INR feed
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const inrFeedCache: { value: number | null; fetchedAt: number } = { value: null, fetchedAt: 0 };

const AMOY_TOKENS = [
  { addr: "0x10D11eDD572ccb54D6D59f07521eA071Ed1C326E", abi: erc20ABI, decimals: 18, key: "NILA" }, // NILA to nIN
  { addr: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582", abi: erc20ABI, decimals: 6,  key: "USDC" },
];
const MAIN_POLYGON_TOKENS = [
  { addr: "0xD1F49598E42D30Cd900Ea86244485ca0647d31C7", abi: erc20ABI, decimals: 18, key: "NILA" }, // NILA to nIN
  { addr: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", abi: erc20ABI, decimals: 6,  key: "USDT" },
];

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

export type Bal    = { type: string, id: number, sym: string; bal: number, p: number };
export type Land    = { sym: string; bal: number, p: number, metadata: number[][], id: string };
export type Enabled = { enabled: boolean }

export function useErc20Balances(chain: string, address: string, enabled: Enabled) {
  // prefer the same RPC used for txs; fall back to the public/basic RPC if missing
  const { provider } = useProvider();
  const { basicprovider }: any = useBasicProvider();
  const rpc = provider ?? basicprovider;
  const DAILYMS = 24 * 60 * 60 * 1000;

  // --- fetch CropMinted IDs (stores as strings) ---
  async function fetchCropMints(latest: number): Promise<bigint[]> {
    // 0) constants / inputs
    const FOOD_1155_ADDRESS = foodTokenContract; // your existing address
    const FOOD_DEPLOY_BLOCK = /* put the known creation block here */ undefined as unknown as number;
    // If you don’t know it, leave undefined and rely on savedCursor or “last 3 months” fallback below.

    // 1) get saved cursor
    const saved = await readItem("1155-latestblock", "FarmData");
    const savedCursor: number | undefined =
      typeof saved?.value === "number" ? saved.value : undefined;

    // 2) “last resort” fallback start if no cursor (≈ 3 months window)
    const yr = 13_705_217;
    const blocksPerDay = 43_200; // ~2s blocks on Polygon
    const fallbackStart = Math.max(0, latest - blocksPerDay);

    // 3) run the chunked fetch
    const ownedIds = await fetchErc1155MintsChunked({
      basicprovider,
      contract: FOOD_1155_ADDRESS,
      toAddr: address,             // filter to your wallet (faster, fewer logs)
      latest,
      savedCursor,                 // resume where we left off
      deployBlock: FOOD_DEPLOY_BLOCK, // if known; else omit
      maxWindow: 500,             // safe default for Polygon/Amoy
      maxRetries: 3,
      onCheckpoint: async (processedTo) => {
        // persist progress each successful chunk so we never re-scan huge ranges
        await setDBitem("1155-latestblock", processedTo, "FarmData");
      },
    });

    // 4) if there was NO saved cursor, also ensure we at least processed from fallback
    if (!savedCursor) {
      // for first run where deployBlock is unknown, we implicitly scanned from fallbackStart
      await setDBitem("1155-latestblock", Math.max(fallbackStart, latest), "FarmData");
    }

    // 5) cache the IDs as strings (keep key consistent with reads!)
    const idsAsStrings = ownedIds.map(String);
    // persist under both the new and legacy keys so other call-sites don’t rescan
    await Promise.all([
      setDBitem("1155-ids", idsAsStrings, "FarmData"),
      setDBitem("cropIds", idsAsStrings, "FarmData"),
    ]);

    return ownedIds;
  }

  return useQuery({
    enabled: enabled.enabled && !!address,
    queryKey: ["balances", chain, address],
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
        const decoded: Bal[] = [];

        const mc = new ethers.Contract(
          "0xcA11bde05977b3631167028862bE2a173976CA11", // Multicall3
          MulticallAbi,
          rpc
        );
        console.log("rpc", rpc)
        const erc20Iface   = new ethers.Interface(erc20ABI);
        const erc1155Iface = new ethers.Interface(erc1155ABI);

        // ----------------- build ERC-20 calls -----------------
        let erc20Calls: [string, string][] = [];
        if (chain === '80002') {
          erc20Calls = AMOY_TOKENS.flatMap(t => ([
            [t.addr, erc20Iface.encodeFunctionData("symbol")],
            [t.addr, erc20Iface.encodeFunctionData("balanceOf", [address])]
          ]));
        } else if (chain === '137') {
          erc20Calls = MAIN_POLYGON_TOKENS.flatMap(t => ([
            [t.addr, erc20Iface.encodeFunctionData("symbol")],
            [t.addr, erc20Iface.encodeFunctionData("balanceOf", [address])]
          ]));
        }

        // ----------------- resolve ERC-1155 IDs -----------------
        const latest = await rpc.getBlockNumber();

        // prefer the newer cached key; fall back to legacy key if present
        const storedIds = await readItem("1155-ids", "FarmData");
        const legacyIds = !storedIds?.value ? await readItem("cropIds", "FarmData") : undefined;
        const rawIds = Array.isArray(storedIds?.value)
          ? storedIds.value
          : Array.isArray(legacyIds?.value)
          ? legacyIds.value
          : undefined;

        const ids: bigint[] = rawIds
          ? rawIds.map((v: string | bigint) => (typeof v === "string" ? BigInt(v) : v))
          : await fetchCropMints(latest);

        const erc1155Calls: [string, string][] = ids.map(id => [
          foodTokenContract,
          erc1155Iface.encodeFunctionData("balanceOf", [address, id]) // bigint OK (BigNumberish)
        ]);

        // ----------------- multicall -----------------
        const calls = [...erc20Calls, ...erc1155Calls];
        const [, returnData] = await mc.aggregate.staticCall(calls);

        // ----------------- helpers -----------------
        async function getUsdcPrice(p: ethers.Provider) {
          try {
            const feed = new ethers.Contract(USDCpriceFeedAddress, priceFeedAbi, p);
            const round = await feed.latestRoundData();
            return (Number(round.answer) / 1e8)
          } catch (e) {
            console.warn('USDC price feed unavailable, falling back to 1', e);
            return 1;
          }
        }
        
        async function getUsdtPrice(p: ethers.Provider) {
          try {
            const feed = new ethers.Contract(USDTpriceFeedAddress, priceFeedAbi, p);
            const round = await feed.latestRoundData();
            return (Number(round.answer) / 1e8)
          } catch (e) {
            console.warn('USDT price feed unavailable, falling back to 1', e);
            return 1;
          }
        }

        async function getINRprice(p: ethers.Provider) {
          // INR/USD updates daily; avoid hitting this feed on each balances poll.
          if (
            Number.isFinite(inrFeedCache.value) &&
            (Date.now() - inrFeedCache.fetchedAt) < ONE_DAY_MS
          ) {
            return inrFeedCache.value as number;
          }
          try {
            const feed = new ethers.Contract(INRpriceFeedAddress, priceFeedAbi, p);
            const round = await feed.latestRoundData();
            const price = Number(round.answer) / 1e8;
            inrFeedCache.value = price;
            inrFeedCache.fetchedAt = Date.now();
            return price;
          } catch (e) {
            console.warn('INR price feed unavailable, falling back to 1', e);
            if (Number.isFinite(inrFeedCache.value)) return inrFeedCache.value as number;
            return 1;
          }
        }

        // ----------------- decode ERC-20 -----------------
        let i = 0;
        const TOKENBOOK = chain === '80002' ? AMOY_TOKENS : MAIN_POLYGON_TOKENS;

        for (const t of TOKENBOOK) {
          const raw_sym = erc20Iface.decodeFunctionResult("symbol",    returnData[i++])[0] as string;
          const sym = raw_sym === "NILA" ? "nIN" : raw_sym === "USDT0" ? "USDT" : raw_sym;
          const raw = erc20Iface.decodeFunctionResult("balanceOf", returnData[i++])[0] as bigint;
          const price = sym === "nIN" ? await getINRprice(rpc) // use Nila as nIN 
                     : sym === "USDC" ? await getUsdcPrice(rpc)
                     : sym === "USDT" ? await getUsdtPrice(rpc)
                     : 1;
          decoded.push({
            type: "ERC20",
            id: 0,
            sym,
            bal: parseFloat(formatUnits(raw, t.decimals)), // use config decimals
            p: price
          });
        }

        // ----------------- decode ERC-1155 -----------------
        const start1155 = erc20Calls.length;
        ids.forEach((id, idx) => {
          const raw = erc1155Iface.decodeFunctionResult(
            "balanceOf",
            returnData[start1155 + idx]
          )[0] as bigint;

          console.log('raw', raw, id, idx)

          if (raw === 0n) return; // drop empties

          // unpack (crop<<80 | variety<<64 | landTitle<<32 | date)
          const crop      = Number((id >> 80n) & 0xffffn);
          const variety   = Number((id >> 64n) & 0xffffn);
          const landTitle = Number((id >> 32n) & 0xffffffffn);
          const date      = Number(id & 0xffffffffn);

          const look_crop = LOOKUP_TABLE[crop].crop;
          const look_var  = LOOKUP_TABLE[crop].varieties[variety];
          const d = new Date(date * 1000);
          const label = `${look_crop}-${look_var}-${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;

          decoded.push({
            type: "ERC1155",
            id: Number(id),          // if you care about >2^53, store as string instead
            sym: label,
            bal: Number(raw),        // 1 unit = 1 kg
            p: 0
          });
        });
        console.log('decoded ERC20 + ERC1155', decoded)
        return decoded;
      } catch (e) {
        console.log("balances error", e);
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
      const nowMth  = blocktimestamp.timestamp / 2629743; // block’s “month”
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
