// DEVIATION from the spec (data/DataHooksRead.md: qk.ipfs.record(hash), never stale per hash, hash from
// useRecordAccess): keyed by land and owner with a 10-minute staleTime, because the hash is read here
// (useRecordHash.ts does the same but pulls in the old app's wallet and paid-read path).
// Her field record (design useFieldRecord): the record hash from her land title (free for the owner),
// then the record bytes — from the node (GET /gis/record-by-hash, exact bytes) or an IPFS gateway —
// accepted only when sha256(bytes) equals the hash. Never stale for a hash.
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { fetchRecordFromIPFS } from '../utils/ipfsCid.ts';

const API = process.env.REACT_APP_API_BASE_URL;
const TITLE_ABI = ['function getCommitment(uint256) view returns (bytes32)',
  'function getRecordHash(uint256) returns (bytes32)'];
const ZERO = `0x${'0'.repeat(64)}`;

export async function fromNode(hash) {
  const r = await fetch(`${API}/gis/record-by-hash/${hash}`);
  if (!r.ok) throw new Error(`record ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const sha = `0x${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (sha !== hash.toLowerCase()) throw new Error('record does not match its hash');
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Field records kept on the leader's phone (map-centred lane, 23 Oct): a record never changes for its hash, so each
// is fetched once and kept in IndexedDB, keyed by the hash (full outlines, no simplification). Any IndexedDB failure
// (private mode, no space) falls back to the node.
const IDB = { db: 'nila-records', store: 'records' };
function idb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(IDB.db, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idbGet = (db, k) => new Promise((resolve) => {
  try { const r = db.transaction(IDB.store).objectStore(IDB.store).get(k); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); } catch { resolve(undefined); }
});
const idbPut = (db, k, v) => { try { db.transaction(IDB.store, 'readwrite').objectStore(IDB.store).put(v, k); } catch { /* full */ } };
let dbp;
/** fromNode, kept on this phone by record hash. */
export async function fromNodeCached(hash) {
  const k = String(hash).toLowerCase();
  const db = await (dbp ||= idb().catch(() => null));
  const kept = db ? await idbGet(db, k) : undefined;
  if (kept) return kept;
  const rec = await fromNode(hash);
  if (db) idbPut(db, k, rec);
  return rec;
}

/** { hash, record } once published; { hash: null } while the oracle is still making it (CP1).
 *  stellarHash: for a title that exists on Stellar only (the demo, 21 Oct) the record hash comes from the Stellar title
 *  (node GET /stellar/titles) instead of Polygon; '' / null while it is being made. */
export function useFieldRecord(landId, owner, stellarHash) {
  const { provider } = useProvider();
  const onStellar = stellarHash !== undefined;
  return useQuery({
    queryKey: ['ipfs', 'record', landId, owner, onStellar ? stellarHash || '' : null],
    enabled: landId != null && (onStellar || (!!provider && !!owner)),
    staleTime: 10 * 60_000,
    // While it is being made, or after a failed fetch: look again every minute.
    // Asked again soon while the record is on its way (a new title gets its record hash seconds after the title).
    refetchInterval: (q) => ((q.state.data && !q.state.data.hash) || q.state.error ? 5_000 : false),
    queryFn: async () => {
      if (onStellar) {
        if (!stellarHash) return { hash: null };
        return { hash: stellarHash.toLowerCase(), record: await fromNode(stellarHash.toLowerCase()) };
      }
      const c = new ethers.Contract(process.env.REACT_APP_LAND_TITLE_MAIN, TITLE_ABI, provider);
      if ((await c.getCommitment(landId)) === ZERO) return { hash: null };
      const hash = (await c.getRecordHash.staticCall(landId, { from: owner })).toLowerCase();
      if (hash === ZERO) return { hash: null };
      const record = await fromNode(hash).catch((e) => {
        console.warn('[record] node:', e.message, '— trying IPFS');
        return fetchRecordFromIPFS(hash);
      });
      return { hash, record };
    },
  });
}

/** Areas in a fixed order: "Area n" is the n-th zone by zone id (z0 → Area 1). */
export const areasOf = (record) => [...(record?.zones || [])]
  .sort((a, b) => String(a.zone_id).localeCompare(String(b.zone_id), undefined, { numeric: true }));

/** CP2 summary: period, cultivations, areas. */
export function summarize(record) {
  const cycles = Array.isArray(record?.cycles) ? record.cycles : Object.values(record?.cycles || {});
  const starts = cycles.map((c) => c.sos).filter(Boolean).sort();
  const ends = cycles.map((c) => c.eos).filter(Boolean).sort();
  const last = record?.meta?.last_scene_date || ends[ends.length - 1];
  const fmt = (d) => d && new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return { from: fmt(starts[0]), to: fmt(last), cultivations: cycles.length, areas: areasOf(record).length };
}
