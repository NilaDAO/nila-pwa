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
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useWallet, useContract } from "./useWallet.ts";
import { runTx } from "../utils/runTx.ts";
import { setDBitem, readItem } from "../utils/db.js";
import { fetchRecordFromIPFS } from "../utils/ipfsCid.ts";

import landTitleArtifact from "../components/ABI/NilaLandTitleWithName.json";

const landTitleAbi = (landTitleArtifact as any).abi ?? landTitleArtifact;
const LAND_TITLE_ADDR = process.env.REACT_APP_LAND_TITLE_MAIN!;
const NIN_ADDR = process.env.REACT_APP_NIN_MAIN!;

const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const DB_STORE = "FarmData";

// Cross-instance sync: when one useRecordHash instance patches its record
// (e.g. user crop correction in staticCards), other instances of the hook
// mounted with the same tid (e.g. the one in Wallet.js that drives
// CultivationCard + map fill via `dominant`) need to pick up the change.
const PATCH_EVENT = "nila:record-patched";

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
  /** Current wallet's nIN balance (wei) — only read when fee > 0 (non-owner
   * path); null while unknown/not applicable. Lets callers warn "not enough
   * nIN" before the user attempts a fetch that would only fail on-chain
   * with an opaque transferFrom revert (2026-08-25). */
  ninBalance: bigint | null;
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
    ninBalance: null,
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
      // Anyone can view — quoteViewFee returns 0 (owner), 1 nIN (whitelisted), or viewFeeNin (public)
      const fee: bigint = await landTitle.quoteViewFee(tid, wallet.address);
      // Only relevant on the fee-paying path — an owner never needs it, and
      // skipping the read there avoids an extra RPC call on the common case.
      let ninBalance: bigint | null = null;
      if (fee > 0n && nin) {
        try {
          ninBalance = await nin.balanceOf(wallet.address);
        } catch { /* best-effort — button falls back to the post-attempt error path */ }
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
      setState((s) => ({ ...s, isOwner, isApproved, fee, claimableFees, ninBalance }));
    } catch (err: any) {
      console.warn("[useRecordHash] checkAccess error:", err.message);
    }
  }, [landTitle, wallet, tid]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // ── Locally patch the cached record (e.g. user crop correction) ──
  // Updates state immediately and writes the patched record back into the
  // same IndexedDB entry so the change survives reload. The on-chain
  // commitment is untouched; if it later changes upstream the normal stale
  // path will overwrite the patch on the next fetch.
  //
  // Read current state via a ref so the side effects (setDBitem + window
  // dispatchEvent) live OUTSIDE the setState updater — otherwise the dispatch
  // synchronously triggers another instance's setState during the calling
  // component's update, which React warns about ("Cannot update a component
  // while rendering a different component").
  const stateRef = useRef(state);
  stateRef.current = state;

  const patchRecord = useCallback(
    (updater: (prev: any) => any) => {
      const s = stateRef.current;
      if (!s.record) return;
      const next = updater(s.record);
      if (!next || next === s.record) return;
      // Guarded update: only commit if state hasn't already moved past the
      // record we read from the ref.
      setState((prev) => (prev.record === s.record ? { ...prev, record: next } : prev));
      if (tid != null) {
        const cacheKey = `recordHash_${tid}`;
        setDBitem(
          cacheKey,
          { commitment: s.commitment, recordHash: s.recordHash, record: next },
          DB_STORE,
        ).catch((err) => console.warn("[useRecordHash] patch cache failed:", err));
        // Notify every other useRecordHash instance bound to the same tid
        // so dominant/features in fieldActivity (built off Wallet's record)
        // pick up the change without waiting for a remount + cache reload.
        window.dispatchEvent(
          new CustomEvent(PATCH_EVENT, { detail: { tid: tid.toString(), record: next } }),
        );
      }
    },
    [tid],
  );

  // Listen for patches dispatched by other instances for the same tid.
  useEffect(() => {
    if (tid == null) return;
    const key = tid.toString();
    const onPatch = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.tid !== key || !detail.record) return;
      setState((s) => (s.record === detail.record ? s : { ...s, record: detail.record }));
    };
    window.addEventListener(PATCH_EVENT, onPatch);
    return () => window.removeEventListener(PATCH_EVENT, onPatch);
  }, [tid]);

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
    console.log("[useRecordHash] fetchRecord called", { tid, wallet: wallet?.address, hasLandTitle: !!landTitle });
    if (!landTitle || !wallet || tid == null) {
      console.warn("[useRecordHash] preconditions not met", { tid, hasWallet: !!wallet, hasLandTitle: !!landTitle });
      setState((s) => ({ ...s, error: "Wallet or contract not ready" }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // 1. Check IndexedDB cache first — skip all chain calls if fresh.
      // setDBitem wraps writes as { id, value: <payload> } (the FarmData store
      // uses keyPath: 'id'), so the real payload lives at cached.value.
      const cacheKey = `recordHash_${tid}`;
      const cached = await readItem(cacheKey, DB_STORE);
      const cachedVal = cached?.value;
      console.log("[useRecordHash] cache lookup", { cacheKey, hit: !!cachedVal?.record, stale: cachedVal?.stale });
      if (cachedVal?.record && cachedVal?.commitment) {
        setState((s) => ({
          ...s,
          record: cachedVal.record,
          recordHash: cachedVal.recordHash,
          commitment: cachedVal.commitment,
          loading: false,
        }));
        // Background: check if commitment changed
        readCommitment().then((live) => {
          if (live && live !== cachedVal.commitment) {
            console.log("[useRecordHash] commitment changed — will refresh next load");
            setDBitem(cacheKey, { ...cachedVal, stale: true }, DB_STORE);
          }
        });
        if (!cachedVal.stale) {
          console.log("[useRecordHash] returning cached record");
          return;
        }
      }

      // 2. Read commitment from chain
      const commitment = await readCommitment();
      console.log("[useRecordHash] commitment from chain", { commitment });
      setState((s) => ({ ...s, commitment }));

      // 3. Get the actual hash via the gated function
      const owner: string = await landTitle.ownerOf(tid);
      const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();
      console.log("[useRecordHash] ownership", { owner, isOwner });

      let recordHash: string;
      if (isOwner) {
        recordHash = await landTitle.getRecordHash.staticCall(tid);
        console.log("[useRecordHash] hash (owner path)", { recordHash });
      } else {
        const fee: bigint = await landTitle.quoteViewFee(tid, wallet.address);
        console.log("[useRecordHash] viewFee", { fee: fee.toString() });
        if (fee > 0n) {
          await ensureAllowance(fee);
        }
        recordHash = await landTitle.getRecordHash.staticCall(tid);
        console.log("[useRecordHash] hash (viewer path, static)", { recordHash });
        await runTx(() => landTitle.getRecordHash(tid));
        console.log("[useRecordHash] viewFee paid on chain");
      }

      if (!recordHash || recordHash === ethers.ZeroHash) {
        console.warn("[useRecordHash] no record hash set", { recordHash });
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

      // 4+5. Fetch the record from Pinata/IPFS by CID derived from the on-chain hash.
      let record: any;
      try {
        record = await fetchRecordFromIPFS(recordHash);
      } catch (err: any) {
        console.error("[useRecordHash] record fetch failed", { recordHash, err: err?.message ?? err });
        // Keep the cached record on screen — a failed refresh must not blank the UI.
        // Only surface an error when we have nothing cached to fall back to.
        const fallback = cachedVal?.record ?? null;
        setState((s) => ({
          ...s,
          recordHash,
          commitment,
          record: fallback ?? s.record ?? null,
          loading: false,
          error: fallback ? null : (err?.message || "Failed to fetch record"),
        }));
        return;
      }

      // 6. Cache in IndexedDB
      console.log("[useRecordHash] caching record + setting state", { land_id: record?.land_id });
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
    patchRecord,
  };
}
