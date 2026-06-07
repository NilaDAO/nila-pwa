/**
 * Plan 044 §5.2 — single source of truth for food-token decoding and
 * crop-family matching. Before this, the bit/zone math and the
 * "sugarcane ~ sugarcane_ratoon" family check were duplicated (with
 * independent off-by-one risk) across useLoadETH.ts, staticCards.js and
 * staticMaps.js. Everything food-token-shaped imports from here now.
 *
 * Canonical tokenId layout (see FoodTokenUpgradeable.sol / deploy-local.js):
 *   [255:224] landTitleId   (32 bits)
 *   [223:204] cropCode       (20 bits: family*1000 + variety)
 *   [203:172] sosTs          (32 bits: full unix timestamp)
 *   [171:148] areaM2         (24 bits)
 *   [147:20]  fieldsBitmask  (128 bits)
 * fieldsBitmask: bit 0 = entire property; zone zN → bit (N+1).
 */
import { CROP_CODE_NAMES, CROP_VARIETIES } from "../hooks/useFoodTokenBatches.ts";
import { normalizeCropType } from "./cropColors.js";

export type FoodTokenId = {
  landTitleId: number;
  cropCode: number;
  varietyCode: number;
  /** 0 = entire property; otherwise the zone index of the lowest set bit. */
  fieldNumber: number;
  /** 128-bit zone bitmask as a decimal string. */
  fieldsBitmask: string;
  areaM2: number;
  sosTs: number;
  sosYear: number;
};

/** Decode the packed identity of a food-token id. No contract call needed. */
export function unpackFoodTokenId(tokenId: bigint): FoodTokenId {
  const combined = Number((tokenId >> 204n) & 0xfffffn); // family*1000 + variety
  const sosTs = Number((tokenId >> 172n) & 0xffffffffn); // full unix ts
  const mask = (tokenId >> 20n) & ((1n << 128n) - 1n);

  // Display field #: 0 = entire property; else the zone index (lowest set bit − 1).
  let fieldNumber = 0;
  if (!(mask & 1n)) {
    let p = 1n;
    while (p < 128n && !((mask >> p) & 1n)) p++;
    fieldNumber = Number(p) - 1;
  }

  return {
    landTitleId: Number(tokenId >> 224n),
    cropCode: Math.floor(combined / 1000), // crop family → CROP_CODE_NAMES
    varietyCode: combined % 1000,
    fieldNumber,
    fieldsBitmask: mask.toString(),
    areaM2: Number((tokenId >> 148n) & 0xffffffn),
    sosTs,
    sosYear: sosTs ? new Date(sosTs * 1000).getUTCFullYear() : 0,
  };
}

/**
 * Zone ids covered by a fieldsBitmask. Returns ['*'] when bit 0 is set
 * (entire property). Accepts the decimal-string mask stored on token items.
 */
export function zoneIdsFromBitmask(fieldsBitmask: string | bigint | null | undefined): string[] {
  let mask = 0n;
  try {
    mask = BigInt(fieldsBitmask ?? "0");
  } catch {
    mask = 0n;
  }
  if ((mask & 1n) === 1n) return ["*"]; // entire property
  const out: string[] = [];
  for (let p = 1n; p < 128n; p++) {
    if (((mask >> p) & 1n) === 1n) out.push("z" + (p - 1n).toString());
  }
  return out;
}

/** Human-readable crop family name for a cropCode (lowercased, '' if unknown). */
export function cropName(cropCode: number | null | undefined): string {
  if (cropCode == null) return "";
  return (CROP_CODE_NAMES[cropCode] ?? "").toLowerCase();
}

/** Human-readable variety name for a (cropCode, varietyCode) pair. */
export function varietyName(cropCode: number, varietyCode: number): string {
  return (
    CROP_VARIETIES[cropCode]?.find((v) => v.code === varietyCode)?.name ??
    `Var ${varietyCode}`
  );
}

/**
 * True when two crop_type strings belong to the same family — i.e. the
 * satellite crop matches the food-token crop. Normalizes oracle subtype
 * qualifiers (sugarcane_ratoon → sugarcane) and tolerates prefix variants.
 */
export function sameCropFamily(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeCropType(String(a || "").toLowerCase());
  const y = normalizeCropType(String(b || "").toLowerCase());
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** Held food tokens: ERC1155 items with a positive balance. */
export function heldFoodTokens(tokenData: any[] | null | undefined): any[] {
  return (tokenData ?? []).filter((t) => t?.type === "ERC1155" && (t.bal ?? 0) > 0);
}
