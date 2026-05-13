import { useQuery } from '@tanstack/react-query';
import { useContract, useWallet } from './useWallet.ts';
import { useContactBook } from './useContactBook';
import foodTokenArtifact from '../components/ABI/FoodTokens.json';
import { ethers } from 'ethers';

const foodTokenAbi = (foodTokenArtifact as any).abi ?? foodTokenArtifact;

// cropCode → human-readable name (matches deploy-local.js setCropType order)
export const CROP_CODE_NAMES: Record<number, string> = {
  0: 'Paddy',
  1: 'Groundnut',
  2: 'Sugarcane',
  3: 'Banana',
  4: 'Potato',
  5: 'Onion',
  6: 'Sesame',
  7: 'Cassava',
};

// Measurement unit per crop. toKg: multiplier to convert user-entered units → kg for on-chain storage.
export const CROP_UNIT: Record<number, { label: string; toKg: number }> = {
  0: { label: 'quintal', toKg: 100  },  // Paddy
  1: { label: 'quintal', toKg: 100  },  // Groundnut
  2: { label: 'MT',      toKg: 1000 },  // Sugarcane
  3: { label: 'quintal', toKg: 100  },  // Banana
  4: { label: 'quintal', toKg: 100  },  // Potato
  5: { label: 'quintal', toKg: 100  },  // Onion
  6: { label: 'kg',      toKg: 1    },  // Sesame
  7: { label: 'MT',      toKg: 1000 },  // Cassava
};

// varietyCode 0 = "any variety" (valid for all crops)
export const CROP_VARIETIES: Record<number, Array<{ code: number; name: string }>> = {
  0: [ // Paddy
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'IR-20' },
    { code: 2, name: 'ADT-36' },
    { code: 3, name: 'ADT-43' },
    { code: 4, name: 'CO-51' },
    { code: 5, name: 'Ponni' },
    { code: 6, name: 'Sona Masuri' },
    { code: 7, name: 'Basmati' },
  ],
  1: [ // Groundnut
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'TMV-2' },
    { code: 2, name: 'CO-3' },
    { code: 3, name: 'VRI-2' },
    { code: 4, name: 'Dharani (K-134)' },
  ],
  2: [ // Sugarcane
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'CO-86032' },
    { code: 2, name: 'CO-0238' },
    { code: 3, name: 'CO-419' },
    { code: 4, name: 'CO-671' },
  ],
  3: [ // Banana
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'Nendran' },
    { code: 2, name: 'Poovan' },
    { code: 3, name: 'Grand Naine' },
    { code: 4, name: 'Robusta' },
  ],
  4: [ // Potato
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'Kufri Jyoti' },
    { code: 2, name: 'Kufri Sindhuri' },
    { code: 3, name: 'Kufri Bahar' },
  ],
  5: [ // Onion
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'Nasik Red' },
    { code: 2, name: 'Bellary Red' },
    { code: 3, name: 'Arka Kalyan' },
  ],
  6: [ // Sesame
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'CO-1' },
    { code: 2, name: 'VRI-1' },
    { code: 3, name: 'TMV-3' },
  ],
  7: [ // Cassava
    { code: 0, name: 'Any variety' },
    { code: 1, name: 'H-165' },
    { code: 2, name: 'M-4' },
    { code: 3, name: 'CO-1' },
  ],
};

// cropCode → cropColors key (lowercase, matches cropColors.js keys)
export const CROP_CODE_COLOR_KEY: Record<number, string> = {
  0: 'paddy',
  1: 'groundnut',
  2: 'sugarcane',
  3: 'banana',
  4: 'potato',
  5: 'onion',
  6: 'sesame',
  7: 'cassava',
};

/** Display code: cropCode.padStart(3,'0') + varietyCode.padStart(3,'0')
 *  e.g. cropCode=0, varietyCode=0  → "000000" (paddy, any variety)
 *       cropCode=0, varietyCode=1  → "000001" (paddy variety x)
 *       cropCode=2, varietyCode=0  → "002000" (sugarcane, any variety)
 */
export function batchDisplayCode(cropCode: number, varietyCode: number): string {
  return String(cropCode).padStart(3, '0') + String(varietyCode).padStart(3, '0');
}

// ─── Cultivation requirements ────────────────────────────────────────────────
//
// Bit assignment is PERMANENT — never reuse a bit once published.
// Bits 0-1 are hardcoded as always-required (COND_LAND_TITLE / COND_CROP_TYPE).
// Optional requirements start at bit 2.
//
// uint256 in Solidity supports up to 256 bits.
// JS: use bigint arithmetic (1n << BigInt(bit)) for bits >= 32.

export interface FieldRequirement {
  key: string;
  bit: number;
  label: string;
  description: string;      // shown in info alert
  hard: boolean;            // true = independently verified; false = self-declared
  satellite: boolean;       // true = verified/measured via Sentinel-2 or S1
  group?: string;
  alwaysRequired?: boolean;
}

export const FIELD_REQUIREMENTS: FieldRequirement[] = [
  // Always required — bits 0-1, mirrored by COND_* constants in the contract
  { key: 'hasLandTitle',  bit: 0, label: 'Land-title NFT registered', hard: true,  satellite: false, description: 'Farmer must hold the land-title NFT for the registered plot. Verified on-chain.',                                                     alwaysRequired: true },
  { key: 'hasCropType',   bit: 1, label: 'Crop type registered',      hard: true,  satellite: false, description: 'Crop type must be registered on the land-title NFT. Verified on-chain.',                                                               alwaysRequired: true },

  // Bits 2-5 retired

  // Land & origin
  { key: 'isNonDeforested',    bit:  6, label: 'No deforestation since cut-off',        hard: true,  satellite: true,  description: 'Plot must show no forest loss since the 2020 EU cut-off date. Verified via Sentinel-2 annual land-cover change detection.',   group: 'Land & origin' },
  { key: 'isOnLegalLand',      bit:  7, label: 'Not on protected land',                 hard: true,  satellite: true,  description: 'Plot boundary must not overlap any protected-area polygon. Cross-checked against WDPA via Sentinel scene geolocation.',         group: 'Land & origin' },

  // Bits 8-9 retired

  // Crop & cycle
  { key: 'hasVarietyDeclared', bit: 10, label: 'Cultivar variety registered',           hard: false, satellite: false, description: 'Farmer declares the cultivar variety at planting. Self-reported; not independently verified.',                                    group: 'Crop & cycle' },
  { key: 'hasYieldForecast',   bit: 13, label: 'Yield forecast registered',             hard: false, satellite: true,  description: 'Expected yield entered at planting. Cross-checked against NDVI trajectory from Sentinel-2 to flag outliers, but not hard-blocked.', group: 'Crop & cycle' },

  // Bits 11-12 retired

  // Practice & inputs
  { key: 'usesApprovedInputs', bit: 14, label: 'Uses only approved inputs',             hard: false, satellite: false, description: 'Farmer declares use of approved fertilisers and pesticides only. Self-reported.',                                                   group: 'Practice & inputs' },
  { key: 'hasPesticideLog',    bit: 15, label: 'Pesticide applications logged',         hard: false, satellite: false, description: 'All pesticide applications must be logged in the field record. Self-reported; union spot-checks.',                                    group: 'Practice & inputs' },
  { key: 'isOrganic',          bit: 16, label: 'Organic-certified status',              hard: true,  satellite: false, description: 'Farmer must hold a valid organic certification. Hard requirement — certificate hash stored on-chain.',                                group: 'Practice & inputs' },
  { key: 'hasWaterSource',     bit: 17, label: 'Water source declared',                 hard: false, satellite: true,  description: 'Irrigation or rain-fed source declared. Sentinel-1 SAR soil-moisture series used to cross-check declared water regime.',              group: 'Practice & inputs' },
  { key: 'usesStableRotation', bit: 18, label: 'Follows crop rotation plan',            hard: false, satellite: true,  description: 'Multi-season rotation plan declared. Historical Sentinel-2 NDVI time series checked for plausible crop alternation.',                group: 'Practice & inputs' },

  // Social & decent income
  { key: 'hasDecentIncomeBaseline', bit: 19, label: 'Decent-income baseline recorded', hard: false, satellite: false, description: 'Living-wage baseline for the household recorded in the union register. Self-reported.',                                               group: 'Social & decent income' },
  { key: 'hasFairLabour',           bit: 21, label: 'No child or forced labour',        hard: false, satellite: false, description: 'Farmer declares compliance with ILO child- and forced-labour conventions. Union-attested.',                                           group: 'Social & decent income' },
  { key: 'isWomenLed',              bit: 22, label: 'Female cooperative member',        hard: false, satellite: false, description: 'Primary cooperative member is female. Checked against membership register.',                                                          group: 'Social & decent income' },
  { key: 'isInclusiveCommunity',    bit: 23, label: 'Non-discriminatory community',     hard: false, satellite: false, description: 'Farmer participates in a cooperative that has signed the non-discrimination charter. Union-attested.',                                 group: 'Social & decent income' },

  // Bits 20, 24 retired

  // Financial & operational
  { key: 'hasCreditStanding',      bit: 25, label: 'In good loan standing',             hard: true,  satellite: false, description: 'No open overdue loans on-chain. Verified automatically at mint time against GenericFundCore loan state.',                            group: 'Financial & operational' },
  { key: 'hasSignedPremiumSplit',  bit: 26, label: 'Premium-split agreement signed',    hard: false, satellite: false, description: 'Farmer has signed the premium-split agreement with the union. Stored as a signature hash off-chain.',                                 group: 'Financial & operational' },
  { key: 'isWithinLogisticsRange', bit: 27, label: 'Within logistics range',            hard: true,  satellite: true,  description: 'Plot centroid must be within the union\'s declared logistics radius. Verified via Sentinel scene geolocation at registration.',       group: 'Financial & operational' },
  { key: 'hasPostHarvestStorage',  bit: 28, label: 'Post-harvest storage available',    hard: false, satellite: false, description: 'Farmer declares access to post-harvest storage (own facility or cooperative store). Self-reported.',                                  group: 'Financial & operational' },

  // Buyer-match
  { key: 'acceptsEndUseRestriction', bit: 29, label: 'End-use restriction agreed',      hard: false, satellite: false, description: 'Farmer accepts that produce may only be sold to the named end-use category (e.g. food-grade, not feed). Buyer-specified.',            group: 'Buyer-match' },
  { key: 'acceptsPriceCorridor',     bit: 30, label: 'Price corridor accepted',         hard: false, satellite: false, description: 'Farmer accepts the min/max price corridor set by the buyer for this batch.',                                                          group: 'Buyer-match' },
  { key: 'meetsQualitySpec',         bit: 31, label: 'Quality spec achievable',         hard: false, satellite: true,  description: 'Farmer declares the plot can achieve the buyer\'s quality specification. NDVI health score used as a soft proxy check.',              group: 'Buyer-match' },
  { key: 'meetsDeliveryWindow',      bit: 32, label: 'Delivery window achievable',      hard: false, satellite: true,  description: 'Farmer confirms the harvest can meet the delivery window. Sentinel-2 EOS prediction cross-checks declared harvest date.',              group: 'Buyer-match' },
  { key: 'acceptsClaimLanguage',     bit: 33, label: 'Claim language consented',        hard: false, satellite: false, description: 'Farmer consents to the on-pack or commercial claim language (e.g. "sustainably sourced"). Buyer-specified.',                          group: 'Buyer-match' },

  // Sesame-specific
  { key: 'isEtoFree', bit: 34, label: 'Ethylene-oxide free declaration',                hard: false, satellite: false, description: 'Farmer declares no ethylene-oxide treatment at any post-harvest stage. Required for EU sesame exports. Self-reported.',               group: 'Sesame-specific' },

  // Sugarcane-specific
  { key: 'isNoPostHarvestBurn', bit: 35, label: 'No post-harvest trash burning',        hard: false, satellite: true,  description: 'Farmer commits to not burning sugarcane trash after harvest. Sentinel-2 fire-radiative-power overflight used to flag violations.',    group: 'Sugarcane-specific' },
  { key: 'practicesMulching',   bit: 37, label: 'Practices trash mulching',             hard: false, satellite: false, description: 'Farmer commits to retaining and mulching sugarcane trash in the inter-row. Self-reported; improves soil carbon.',                      group: 'Sugarcane-specific' },
  { key: 'limitedRatooning',    bit: 38, label: 'Ratooning limited (≤2 cycles)',        hard: false, satellite: true,  description: 'Farmer limits ratoon crop cycles to 2 before replanting. Multi-season Sentinel-2 NDVI trajectory used to count ratoon cycles.',       group: 'Sugarcane-specific' },

  // Bit 36 retired (Mill destination — moved to drop-off point field on batch)
];

/** Always-required bits — combined mask, always OR'd in at createBatch. */
export const ALWAYS_REQUIRED_MASK = 3n; // COND_LAND_TITLE | COND_CROP_TYPE

/** Bit helpers — use bigint throughout (JS bitwise ops cap at 32 bits). */
export const bitMask  = (bit: number): bigint => 1n << BigInt(bit);
export const isBitSet = (conditions: bigint, bit: number): boolean =>
  (conditions & bitMask(bit)) !== 0n;

/** Build a conditions bigint from an array of bit positions. Always includes bits 0-1. */
export const buildConditions = (optionalBits: number[]): bigint =>
  optionalBits.reduce((acc, bit) => acc | bitMask(bit), ALWAYS_REQUIRED_MASK);

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface BatchSummary {
  active: Batch[];
  totalClaimedQt: number;    // total claimed qty across active batches, in quintals (÷100)
  totalClaimedUsdt: number;  // USDT value of claimed qty (order batches with on-chain price only)
  cropBreakdown: string;     // e.g. "sugarcane, sesame (2x)"
}

export interface Batch {
  id: number;
  union: string;
  cropCode: number;
  varietyCode: number;
  displayCode: string;       // e.g. "000001" = paddy variety x
  cropName: string;
  cropColorKey: string;
  active: boolean;
  conditions: bigint;        // uint256 bitmask — test with isBitSet(conditions, bit)
  buyer: string;             // address(0) = standing/open programme
  buyerName: string;         // resolved via contact book
  hasOrder: boolean;         // buyer !== address(0)
  targetQtyKg: bigint;
  claimedQtyKg: bigint;
  deliveryDate: number;      // unix ts, 0 = no delivery date
  pricePerKgUsdt: bigint;    // 6 decimals (USDT), 0 = no on-chain price
  requiredCerts: number;     // uint8 bitmask — bit 0=FairTrade … bit 4=Q&S
}

// Batch struct field order (for positional fallback):
//   union_(0), cropCode(1), varietyCode(2), active(3), conditions(4),
//   buyer(5), targetQtyKg(6), claimedQtyKg(7), deliveryDate(8), pricePerKgUsdt(9), status(10),
//   requiredCerts(11)

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFoodTokenBatches(unionAddr?: string) {
  const { wallet } = useWallet();
  const foodTokenAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;
  const foodToken = useContract(foodTokenAddr, foodTokenAbi, wallet);
  const { resolveName } = useContactBook({ enabled: false });

  return useQuery<BatchSummary>({
    queryKey: ['foodTokenBatches', unionAddr, foodTokenAddr],
    enabled: !!unionAddr && !!foodToken,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const nextId: bigint = await foodToken!.nextBatchId();
      console.log('[useFoodTokenBatches] nextId:', Number(nextId), 'unionAddr:', unionAddr);
      if (nextId === 0n) return { active: [], totalClaimedQt: 0, totalClaimedUsdt: 0, cropBreakdown: '' };

      const batches: Batch[] = [];
      const ZERO_ADDR = ethers.ZeroAddress.toLowerCase();

      const ids = Array.from({ length: Number(nextId) }, (_, i) => i + 1);
      const results = await Promise.all(
        ids.map(id =>
          foodToken!.getBatch(id).catch((e: any) => {
            console.warn('[useFoodTokenBatches] getBatch', id, 'failed:', e?.message);
            return null;
          })
        )
      );

      for (let i = 0; i < ids.length; i++) {
        const raw = results[i];
        if (!raw) continue;

        const batchUnion = (raw.union_ ?? raw[0] ?? '').toLowerCase();
        if (batchUnion !== unionAddr!.toLowerCase()) {
          console.log('[useFoodTokenBatches] batch', ids[i], 'skipped — union mismatch:', batchUnion, '!==', unionAddr!.toLowerCase());
          continue;
        }

        const cropCode    = Number(raw.cropCode    ?? raw[1]);
        const varietyCode = Number(raw.varietyCode ?? raw[2]);
        const active      = Boolean(raw.active     ?? raw[3]);
        const conditions  = BigInt(raw.conditions  ?? raw[4]);
        const buyer       = (raw.buyer             ?? raw[5]) as string;
        const buyerLow    = buyer.toLowerCase();
        const hasOrder    = buyerLow !== ZERO_ADDR;

        const claimedQtyKg = (raw.claimedQtyKg ?? raw[7]) as bigint;
        console.log('[useFoodTokenBatches] batch', ids[i], 'claimedQtyKg:', Number(claimedQtyKg), 'active:', active);
        batches.push({
          id:             ids[i],
          union:          batchUnion,
          cropCode,
          varietyCode,
          displayCode:    batchDisplayCode(cropCode, varietyCode),
          cropName:       CROP_CODE_NAMES[cropCode] ?? `Crop ${cropCode}`,
          cropColorKey:   CROP_CODE_COLOR_KEY[cropCode] ?? 'unknown',
          active,
          conditions,
          buyer,
          buyerName:      hasOrder ? resolveName(buyer) : 'Open programme',
          hasOrder,
          targetQtyKg:    (raw.targetQtyKg    ?? raw[6]) as bigint,
          claimedQtyKg,
          deliveryDate:   Number(raw.deliveryDate    ?? raw[8]),
          pricePerKgUsdt: (raw.pricePerKgUsdt  ?? raw[9]) as bigint,
          requiredCerts:  Number(raw.requiredCerts   ?? raw[11] ?? 0),
        });
      }

      const active = batches.filter(b => b.active);

      const totalClaimedQt = active.reduce((s, b) => s + Number(b.claimedQtyKg) / 100, 0);
      console.log('[useFoodTokenBatches] result — activeBatches:', active.length, 'totalClaimedQt:', totalClaimedQt);

      const totalClaimedUsdt = active.reduce((s, b) => {
        if (!b.hasOrder || b.pricePerKgUsdt === 0n) return s;
        return s + Number(b.claimedQtyKg) * Number(b.pricePerKgUsdt) / 1e6;
      }, 0);

      const cropCounts = active.reduce((m: Record<string, number>, b) => {
        const k = b.cropName.toLowerCase();
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {});
      const cropBreakdown = Object.entries(cropCounts)
        .map(([name, n]) => n > 1 ? `${name} (${n}x)` : name)
        .join(', ');

      return { active, totalClaimedQt, totalClaimedUsdt, cropBreakdown };
    },
  });
}
