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

async function fromNode(hash) {
  const r = await fetch(`${API}/gis/record-by-hash/${hash}`);
  if (!r.ok) throw new Error(`record ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const sha = `0x${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (sha !== hash.toLowerCase()) throw new Error('record does not match its hash');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** { hash, record } once published; { hash: null } while the oracle is still making it (CP1). */
export function useFieldRecord(landId, owner) {
  const { provider } = useProvider();
  return useQuery({
    queryKey: ['ipfs', 'record', landId, owner],
    enabled: !!provider && landId != null && !!owner,
    staleTime: 10 * 60_000,
    refetchInterval: (q) => (q.state.data && !q.state.data.hash ? 60_000 : false),
    queryFn: async () => {
      const c = new ethers.Contract(process.env.REACT_APP_LAND_TITLE_MAIN, TITLE_ABI, provider);
      if ((await c.getCommitment(landId)) === ZERO) return { hash: null };
      const hash = (await c.getRecordHash.staticCall(landId, { from: owner })).toLowerCase();
      if (hash === ZERO) return { hash: null };
      const record = await fromNode(hash).catch(() => fetchRecordFromIPFS(hash));
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
