/**
 * CS023 — useRecordHash: gated property data via NilaLandTitle NFT.
 *
 * Reads the on-chain commitment (free) for change detection, then calls the
 * gated getRecordHash() to obtain the actual hash (free for owner, nIN fee
 * for approved viewers).  Fetches record.json from the backend by hash and
 * verifies integrity client-side.
 *
 * Usage:
 *   const { record, commitment, loading, error, fetchRecord } = useRecordHash(tokenId);
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useWallet, useContract } from "./useWallet";
import { runTx } from "../utils/runTx";
import { setDBitem, readItem } from "../utils/db";
import axios from "axios";

import landTitleArtifact from "../components/ABI/NilaLandTitleWithName.json";

const landTitleAbi = (landTitleArtifact as any).abi ?? landTitleArtifact;
const LAND_TITLE_ADDR = process.env.REACT_APP_LAND_TITLE_MAIN!;
const NIN_ADDR = process.env.REACT_APP_NIN_MAIN!;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const DB_STORE = "FarmData";

type RecordHashState = {
  /** The full record.json object, or null if not yet fetched. */
  record: any | null;
  /** The on-chain commitment (public, changes when record updates). */
  commitment: string | null;
  /** The actual record hash (only available after gated read). */
  recordHash: string | null;
  /** Fee in nIN (wei) the current user would pay.  0 = owner, null = unknown. */
  fee: bigint | null;
  /** Whether a fetch is in progress. */
  loading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** True if the current wallet is the token owner (reads free). */
  isOwner: boolean;
  /** True if the current wallet is an approved viewer. */
  isApproved: boolean;
};

/**
 * SHA-256 of a string, returned as 0x-prefixed hex.
 * Used to verify the backend response matches the on-chain hash.
 */
async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Canonical JSON for hash verification — must match the backend's
 * _canonical_blob() which excludes report_hash and report_hash_bytes32.
 */
function canonicalBlob(record: any): string {
  const { report_hash, report_hash_bytes32, ...rest } = record;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function useRecordHash(tokenId: number | string | null) {
  const { wallet, provider } = useWallet();
  const signerOrProvider = wallet ?? provider;

  const landTitle = useContract(LAND_TITLE_ADDR, landTitleAbi, signerOrProvider);
  const nin = useContract(NIN_ADDR, erc20Abi, wallet);

  const [state, setState] = useState<RecordHashState>({
    record: null,
    commitment: null,
    recordHash: null,
    fee: null,
    loading: false,
    error: null,
    isOwner: false,
    isApproved: false,
  });

  const tid = tokenId != null ? BigInt(tokenId) : null;

  // ── Read commitment (free view call) ──────────────────────

  const readCommitment = useCallback(async () => {
    if (!landTitle || tid == null) return null;
    try {
      const c: string = await landTitle.getCommitment(tid);
      return c === ethers.ZeroHash ? null : c;
    } catch {
      return null;
    }
  }, [landTitle, tid]);

  // ── Check ownership + approval + fee ──────────────────────

  const checkAccess = useCallback(async () => {
    if (!landTitle || !wallet || tid == null) return;
    try {
      const owner: string = await landTitle.ownerOf(tid);
      const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();
      const isApproved = isOwner || (await landTitle.viewerApproved(wallet.address));
      let fee: bigint | null = null;
      if (isOwner) {
        fee = 0n;
      } else if (isApproved) {
        fee = await landTitle.quoteViewFee(tid, wallet.address);
      }
      setState((s) => ({ ...s, isOwner, isApproved, fee }));
    } catch (err: any) {
      console.warn("[useRecordHash] checkAccess error:", err.message);
    }
  }, [landTitle, wallet, tid]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // ── Ensure nIN allowance for the fee ──────────────────────

  const ensureAllowance = useCallback(
    async (needed: bigint) => {
      if (!wallet || !nin || needed === 0n) return;
      const allowance: bigint = await nin.allowance(wallet.address, LAND_TITLE_ADDR);
      if (allowance >= needed) return;
      await runTx(() => nin.approve(LAND_TITLE_ADDR, needed));
    },
    [nin, wallet]
  );

  // ── Main fetch: commitment → getRecordHash → backend → verify

  const fetchRecord = useCallback(async () => {
    if (!landTitle || !wallet || tid == null) {
      setState((s) => ({ ...s, error: "Wallet or contract not ready" }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // 1. Read commitment (free)
      const commitment = await readCommitment();
      setState((s) => ({ ...s, commitment }));

      // 2. Check IndexedDB cache — skip chain call if commitment unchanged
      const cacheKey = `recordHash_${tid}`;
      const cached = await readItem(cacheKey, DB_STORE);
      if (cached?.commitment === commitment && cached?.record) {
        setState((s) => ({
          ...s,
          record: cached.record,
          recordHash: cached.recordHash,
          commitment,
          loading: false,
        }));
        return;
      }

      // 3. Get the actual hash via the gated function
      const owner: string = await landTitle.ownerOf(tid);
      const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();

      let recordHash: string;
      if (isOwner) {
        // Owner: free read via staticCall (no tx, no gas)
        recordHash = await landTitle.getRecordHash.staticCall(tid);
      } else {
        // Approved viewer: pay nIN fee (state-changing tx)
        const fee: bigint = await landTitle.quoteViewFee(tid, wallet.address);
        if (fee > 0n) {
          await ensureAllowance(fee);
        }
        // Send the actual tx and read the return value via staticCall first
        // to get the hash, then send the real tx for the payment.
        recordHash = await landTitle.getRecordHash.staticCall(tid);
        await runTx(() => landTitle.getRecordHash(tid));
      }

      if (!recordHash || recordHash === ethers.ZeroHash) {
        setState((s) => ({
          ...s,
          recordHash: null,
          record: null,
          commitment,
          loading: false,
          error: "No record hash set for this property",
        }));
        return;
      }

      // 4. Fetch record.json from backend by hash
      const { data: record } = await axios.get(
        `${API_BASE_URL}/gis/record-by-hash/${recordHash}`
      );

      // 5. Verify integrity: SHA-256 of canonical JSON must match on-chain hash
      const blob = canonicalBlob(record);
      const computedHash = await sha256Hex(blob);
      if (computedHash !== recordHash) {
        console.warn(
          `[useRecordHash] integrity mismatch: computed=${computedHash} on-chain=${recordHash}`
        );
        setState((s) => ({
          ...s,
          record,
          recordHash,
          commitment,
          loading: false,
          error: "Record integrity check failed — data may have been tampered with",
        }));
        return;
      }

      // 6. Cache in IndexedDB
      await setDBitem(cacheKey, { commitment, recordHash, record }, DB_STORE);

      setState((s) => ({
        ...s,
        record,
        recordHash,
        commitment,
        loading: false,
        error: null,
      }));
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Failed to fetch record";
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, [landTitle, wallet, tid, readCommitment, ensureAllowance]);

  return {
    ...state,
    fetchRecord,
    checkAccess,
  };
}
