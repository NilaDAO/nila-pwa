/**
 * Derive a CIDv1 (raw codec, sha2-256) from a 32-byte SHA-256 digest. No npm
 * dependency — Pinata V3 pins records with this exact codec, so the CID is
 * fully determined by the on-chain hash (see plan 043).
 *
 *   CIDv1 bytes = 0x01 0x55 0x12 0x20 || <32-byte digest>
 *               = <version> <codec=raw> <multihash=sha2-256> <length=32> <hash>
 *   CID string  = "b" || base32lower(unpadded)
 */

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64) {
    throw new Error(`expected 32-byte (64 hex char) digest, got ${clean.length} chars`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base32LowerUnpadded(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < input.length; i++) {
    value = (value << 8) | input[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

export function deriveCIDv1RawSha256(hashHex: string): string {
  const digest = hexToBytes(hashHex);
  const cidBytes = new Uint8Array(36);
  cidBytes[0] = 0x01; // CIDv1
  cidBytes[1] = 0x55; // raw codec
  cidBytes[2] = 0x12; // multihash: sha2-256
  cidBytes[3] = 0x20; // length: 32
  cidBytes.set(digest, 4);
  return "b" + base32LowerUnpadded(cidBytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

/**
 * Fetch the record from an IPFS gateway by on-chain hash, verify
 * sha256(bytes) == hash, and return the parsed JSON. Throws on integrity
 * failure — no silent fallback to the self-report check.
 */
export async function fetchRecordFromIPFS(
  recordHash: string,
  gateway: string = process.env.REACT_APP_PINATA_GATEWAY || "gateway.pinata.cloud",
): Promise<any> {
  const cid = deriveCIDv1RawSha256(recordHash);
  const url = `https://${gateway}/ipfs/${cid}`;
  console.log("[ipfsCid] fetch start", { recordHash, cid, url });

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err: any) {
    console.error("[ipfsCid] fetch threw (network/CORS?)", { url, err: err?.message ?? err });
    throw err;
  }
  console.log("[ipfsCid] fetch response", { status: res.status, ok: res.ok, type: res.headers.get("content-type") });
  if (!res.ok) {
    throw new Error(`IPFS gateway ${gateway} returned HTTP ${res.status} for ${cid}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  console.log("[ipfsCid] bytes received", { length: bytes.length });

  const shaBuf = await crypto.subtle.digest("SHA-256", bytes);
  const sha = "0x" + bytesToHex(new Uint8Array(shaBuf));
  const expected = recordHash.startsWith("0x") ? recordHash.toLowerCase() : "0x" + recordHash.toLowerCase();
  console.log("[ipfsCid] integrity", { sha256: sha, expected, match: sha === expected });
  if (sha !== expected) {
    throw new Error(`integrity check failed: sha256(fetched)=${sha} on-chain=${expected}`);
  }

  let record: any;
  try {
    record = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err: any) {
    console.error("[ipfsCid] JSON.parse failed", { firstBytes: new TextDecoder().decode(bytes.slice(0, 200)), err: err?.message ?? err });
    throw err;
  }
  console.log("[ipfsCid] record parsed", { land_id: record?.land_id, schema: record?.schema, keys: Object.keys(record || {}) });
  return record;
}
