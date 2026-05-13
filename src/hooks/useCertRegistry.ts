import { useEffect, useState } from 'react';
import { useContract, useWallet } from './useWallet.ts';
import certRegistryArtifact from '../components/ABI/NilaCertRegistry.json';

const certRegistryAbi = (certRegistryArtifact as any).abi ?? certRegistryArtifact;
const certRegistryAddr = process.env.REACT_APP_CERT_REGISTRY_ADDRESS;

export const CERT_NAMES = [
  'Fair Trade',
  'Origin',
  'Regenerative',
  'Organic',
  'Quality & Safety',
] as const;

export type CertStatus = 'valid' | 'expiring' | 'expired' | 'missing';

export interface FarmerCert {
  index: number;
  name: string;
  status: CertStatus;
  expiresAt: number; // unix seconds, 0 if not issued
}

const WARN_THRESHOLD_S = 90 * 24 * 60 * 60; // 90 days

function deriveCertStatus(active: boolean, expiresAt: number): CertStatus {
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt === 0) return 'missing';
  if (!active && expiresAt < now) return 'expired';
  if (active && expiresAt - now < WARN_THRESHOLD_S) return 'expiring';
  if (active) return 'valid';
  return 'missing';
}

/**
 * Read cert status for a farmer from NilaCertRegistry.
 * Returns all 5 cert statuses regardless of batch requirements.
 * Use requiredMask to filter to only what a batch needs.
 *
 * @param farmerAddress  The farmer's wallet address
 * @param requiredMask   uint8 bitmask of required cert indices (from batch.requiredCerts)
 */
export function useCertRegistry(farmerAddress?: string, requiredMask?: number) {
  const { provider } = useWallet();
  const registry = useContract(certRegistryAddr, certRegistryAbi, provider);

  const [certs, setCerts] = useState<FarmerCert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!registry || !farmerAddress) {
      setCerts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [activeArr, expiresArr]: [boolean[], bigint[]] =
          await registry.certStatusOf(farmerAddress);

        if (cancelled) return;

        const result: FarmerCert[] = CERT_NAMES.map((name, i) => ({
          index: i,
          name,
          status: deriveCertStatus(activeArr[i], Number(expiresArr[i])),
          expiresAt: Number(expiresArr[i]),
        }));

        setCerts(result);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load certs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [registry, farmerAddress]);

  // Filter to only the required certs for the given batch
  const requiredCerts = certs.filter((_, i) =>
    requiredMask != null ? (requiredMask & (1 << i)) !== 0 : true
  );

  const metCount  = requiredCerts.filter(c => c.status === 'valid' || c.status === 'expiring').length;
  const allMet    = requiredCerts.length > 0 && metCount === requiredCerts.length;

  return { certs, requiredCerts, metCount, allMet, loading, error };
}
