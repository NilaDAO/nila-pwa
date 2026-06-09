import { useQuery } from '@tanstack/react-query';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const FIVE_MIN = 5 * 60_000;

export interface DonationProgram {
  id: string;
  type: string | null;           // "QF" → show quadratic-funding match estimate + example
  name: string;
  blurb: string;
  image: string | null;          // hero image URL
  goal: string | null;           // what the round funds
  donationMethod: string | null; // how giving works
  recipient: string;             // USDT recipient, resolved for this union's chain
  upiVpa: string | null;         // UPI payee address for the ₹ rail
  upiName: string | null;        // UPI payee display name
  logo: string | null;
  // anonymous quadratic-funding counter
  unionTotalInr: number;         // = raisedInr (kept for the summary card)
  raisedInr: number;             // Σ cᵢ
  contributors: number;          // n
  sqrtSum: number;               // Σ √cᵢ — drives the match estimate
  matchingPoolInr: number | null;
  currentMatchInr: number;       // (Σ√cᵢ)² − Σcᵢ, capped at the pool
}

/** Whether this union's leader has turned the donate card on. Gates the card in
 *  Wallet alongside a non-empty program list. */
export function useDonationsEnabled(union?: { address?: string }) {
  const unionAddr = union?.address;
  return useQuery<boolean>({
    queryKey: ['donationsEnabled', unionAddr ?? null],
    enabled: !!API_BASE_URL && !!unionAddr,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/donations/settings?union=${unionAddr}`);
        if (!res.ok) return false;
        const body = await res.json();
        return !!body?.enabled;
      } catch {
        return false;
      }
    },
  });
}

/** Leader turns the donate card on/off for their union. */
export async function setDonationsEnabled(union: string, enabled: boolean): Promise<void> {
  if (!API_BASE_URL || !union) return;
  try {
    await fetch(`${API_BASE_URL}/donations/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ union, enabled }),
    });
  } catch {
    /* fire-and-forget */
  }
}

/** Anonymously add a ₹ amount to the (union, program) counter. The backend only
 *  ever sums rupees — the PWA converts USDT→₹ before calling this. */
export async function recordDonation(union: string, programId: string, amountInr: number): Promise<void> {
  if (!API_BASE_URL || !union || !(amountInr > 0)) return;
  try {
    await fetch(`${API_BASE_URL}/donations/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ union, program_id: programId, amount_inr: amountInr }),
    });
  } catch {
    /* fire-and-forget */
  }
}

/**
 * Active donation programs for the member's union/location. All gating (union
 * allowlist, open/close window, geofence) is applied server-side by
 * NilaSensingAgent's GET /donations — the caller just renders the Donate card
 * when the returned list is non-empty. Programs are the remote source of truth;
 * this query only caches them transiently.
 */
export function useDonationPrograms(union?: {
  address?: string;
  chain?: number | string;
  location?: [number, number];
}) {
  const unionAddr = union?.address;
  const chain = union?.chain;
  const [lat, lng] = union?.location ?? [];

  return useQuery<DonationProgram[]>({
    queryKey: ['donationPrograms', unionAddr ?? null, chain ?? null],
    enabled: !!API_BASE_URL && !!unionAddr,
    staleTime: FIVE_MIN,
    gcTime: FIVE_MIN,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (unionAddr) params.set('union', unionAddr);
      if (chain != null) params.set('chain', String(chain));
      if (lat != null && lng != null) { params.set('lat', String(lat)); params.set('lng', String(lng)); }
      try {
        const res = await fetch(`${API_BASE_URL}/donations?${params.toString()}`);
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body?.programs) ? body.programs : [];
      } catch {
        return [];
      }
    },
  });
}
