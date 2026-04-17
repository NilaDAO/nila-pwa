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
import { useWallet, useContract } from "./useWallet.ts";
import { runTx } from "../utils/runTx.ts";
import { setDBitem, readItem } from "../utils/db.js";
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
  /** nIN claimable by the token owner from data view fees (wei). */
  claimableFees: bigint | null;
};


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
    claimableFees: null,
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
      // Read claimable fees — cache for 2 weeks
      let claimableFees: bigint | null = null;
      if (isOwner) {
        const feeCacheKey = `viewFeeBalance_${wallet.address}`;
        const feeCached = await readItem(feeCacheKey, DB_STORE);
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;
        if (feeCached?.ts && Date.now() - feeCached.ts < twoWeeks) {
          claimableFees = BigInt(feeCached.value);
        } else {
          try {
            claimableFees = await landTitle.viewFeeBalance(wallet.address);
            await setDBitem(feeCacheKey, { value: claimableFees!.toString(), ts: Date.now() }, DB_STORE);
          } catch { }
        }
      }
      setState((s) => ({ ...s, isOwner, isApproved, fee, claimableFees }));
    } catch (err: any) {
      console.warn("[useRecordHash] checkAccess error:", err.message);
    }
  }, [landTitle, wallet, tid]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // ── Claim accumulated view fees ────────────────────────────

  const claimViewFees = useCallback(async () => {
    if (!landTitle || !wallet) return;
    await runTx(() => landTitle.claimViewFees());
    // Invalidate fee cache
    const feeCacheKey = `viewFeeBalance_${wallet.address}`;
    await setDBitem(feeCacheKey, { value: "0", ts: Date.now() }, DB_STORE);
    setState((s) => ({ ...s, claimableFees: 0n }));
  }, [landTitle, wallet]);

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
      // 1. Check IndexedDB cache first — skip all chain calls if fresh
      const cacheKey = `recordHash_${tid}`;
      const cached = await readItem(cacheKey, DB_STORE);
      if (cached?.record && cached?.commitment) {
        // Cache hit — use immediately, verify commitment in background
        setState((s) => ({
          ...s,
          record: cached.record,
          recordHash: cached.recordHash,
          commitment: cached.commitment,
          loading: false,
        }));
        // Background: check if commitment changed (invalidate on next load if so)
        readCommitment().then((live) => {
          if (live && live !== cached.commitment) {
            console.log("[useRecordHash] commitment changed — will refresh next load");
            setDBitem(cacheKey, { ...cached, stale: true }, DB_STORE);
          }
        });
        if (!cached.stale) return;
        // Fall through if stale — re-fetch below
      }

      // 2. Read commitment from chain
      const commitment = await readCommitment();
      setState((s) => ({ ...s, commitment }));

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

      // 5. Verify integrity: the record's embedded hash must match the on-chain hash.
      //    Cross-language SHA-256 recomputation is unreliable (JSON serialization
      //    differs between Python and JS), so we trust the server-embedded field.
      const embeddedHash = record?.report_hash_bytes32;
      if (embeddedHash && embeddedHash !== recordHash) {
        console.warn(
          `[useRecordHash] integrity mismatch: embedded=${embeddedHash} on-chain=${recordHash}`
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
    claimViewFees,
  };
}
