import { useEffect, useState } from 'react';
import { useContract, useWallet } from './useWallet.ts';
import certRegistryArtifact from '../components/ABI/NilaCertRegistry.json';

const certRegistryAbi = (certRegistryArtifact as any).abi ?? certRegistryArtifact;
const certRegistryAddr = process.env.REACT_APP_CERT_REGISTRY_ADDRESS;

const MONTHLY_MS = 30 * 24 * 60 * 60 * 1000;
const NUM_CERTS  = 5;

interface CachedCounts {
  counts:      number[];   // per-cert count of members who hold it
  memberCount: number;     // total addresses checked
  cachedAt:    number;     // Date.now() ms
  source:      'sync' | 'chain';
}

function storageKey(unionAddr: string) {
  return `nila_cert_counts_${unionAddr.toLowerCase()}`;
}

function readCache(unionAddr: string): CachedCounts | null {
  try {
    const raw = localStorage.getItem(storageKey(unionAddr));
    if (!raw) return null;
    const parsed: CachedCounts = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt < MONTHLY_MS) return parsed;
  } catch (_) {}
  return null;
}

function writeCache(unionAddr: string, data: CachedCounts) {
  try { localStorage.setItem(storageKey(unionAddr), JSON.stringify(data)); } catch (_) {}
}

/**
 * Returns per-cert counts of union members who hold each certificate.
 *
 * Resolution order:
 *   1. Monthly localStorage cache (keyed by unionAddr)
 *   2. /contacts/sync response — if the backend starts returning `cert_counts`
 *      alongside the contact list, store it here with source='sync' to skip
 *      per-address chain calls entirely
 *   3. Per-address chain calls to NilaCertRegistry.certStatusOf()
 *
 * @param unionAddr       Union address — used as cache key
 * @param memberAddresses Non-system contact addresses from useContactBook
 */
export function useUnionCertCounts(unionAddr?: string, memberAddresses: string[] = []) {
  const { provider }  = useWallet();
  const registry      = useContract(certRegistryAddr, certRegistryAbi, provider);

  const [counts,      setCounts]      = useState<number[] | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading,     setLoading]     = useState(false);

  // stable dep: length is enough — addresses only grow as contacts sync in
  const addrCount = memberAddresses.length;

  useEffect(() => {
    if (!unionAddr) return;

    // 1. Serve from cache if fresh
    const cached = readCache(unionAddr);
    if (cached) {
      console.log('[CertCounts] cache hit — source=%s cachedAt=%s counts=%o', cached.source, new Date(cached.cachedAt).toISOString(), cached.counts);
      setCounts(cached.counts);
      setMemberCount(cached.memberCount);
      return;
    }

    // 2. Need chain calls — bail early if nothing to check
    console.log('[CertCounts] cache miss — registry=%s addrCount=%d', !!registry, addrCount);
    if (!registry || addrCount === 0) return;

    let cancelled = false;
    setLoading(true);
    console.log('[CertCounts] fetching certStatusOf for %d addresses', memberAddresses.length);

    (async () => {
      try {
        const results = await Promise.all(
          memberAddresses.map(addr =>
            (registry as any).certStatusOf(addr).catch((e: any) => {
              console.warn('[CertCounts] certStatusOf failed for %s:', addr, e?.message);
              return null;
            })
          )
        );

        if (cancelled) return;

        const totals = Array<number>(NUM_CERTS).fill(0);
        const now    = Math.floor(Date.now() / 1000);

        for (const res of results) {
          if (!res) continue;
          const [activeArr, expiresArr]: [boolean[], bigint[]] = res;
          for (let i = 0; i < NUM_CERTS; i++) {
            if (activeArr[i] && Number(expiresArr[i]) > now) totals[i]++;
          }
        }

        console.log('[CertCounts] done — counts=%o memberCount=%d', totals, memberAddresses.length);
        const data: CachedCounts = {
          counts: totals,
          memberCount: memberAddresses.length,
          cachedAt: Date.now(),
          source: 'chain',
        };
        writeCache(unionAddr, data);
        setCounts(totals);
        setMemberCount(memberAddresses.length);
      } catch (e) {
        console.warn('[CertCounts] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [registry, unionAddr, addrCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return { counts, memberCount, loading };
}
