// Whether a wallet leads its union (28 Oct): the one check. The Polygon RolesRegistry is the truth; the Init union
// record (written at R9 and on recovery) only stands in while the chain has not answered yet.
// Was: four places (StellarGate, R9, recovery, useIsLeader), each with its own retry loop around a hook that answered
// undefined until its contract loaded, so a leader could open the member app.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { setDBitem } from '../utils/db';

const ROLES = process.env.REACT_APP_ROLES_MAIN;
const ABI = ['function isLeader(address unionAddr, address acct) view returns (bool)'];
const rpc = () => (Number(process.env.REACT_APP_CHAIN_ID || 137) === 137 ? process.env.REACT_APP_RPC_ALCHEMY : process.env.REACT_APP_RPC);
let roles;
const contract = () => {
  if (!roles) roles = new ethers.Contract(ROLES, ABI, new ethers.JsonRpcProvider(rpc()));
  return roles;
};

/** true / false from the RolesRegistry; tries `tries` times half a second apart, then throws. */
export async function checkLeader(union, address, tries = 6) {
  if (!union || !address || !ROLES) return false;
  let last;
  for (let i = 0; i < tries; i++) {
    try { return Boolean(await contract().isLeader(union, address)); } catch (e) { last = e; }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw last;
}

/**
 * The leader flag for the app. union: the union's Polygon address; cached: the Init record's flag (or undefined).
 * → { leader: true | false | undefined (not known yet) }. A chain answer that differs from the record is written back.
 * The chain not answering at all counts as the record's flag, else not a leader (the member app; never stuck).
 */
export function useLeader(union, address, cached, saveRecord) {
  const q = useQuery({
    queryKey: ['roles', 'isLeader', (union || '').toLowerCase(), (address || '').toLowerCase()],
    queryFn: () => checkLeader(union, address),
    enabled: !!union && !!address,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const chain = q.data;
  useEffect(() => {
    if (chain !== undefined && cached !== chain && saveRecord) saveRecord(chain).catch(() => {});
  }, [chain, cached]); // eslint-disable-line react-hooks/exhaustive-deps
  if (chain !== undefined) return { leader: chain };
  if (cached !== undefined) return { leader: Boolean(cached) };
  if (q.isError || !union || !address) return { leader: false };
  return { leader: undefined };
}

/** Writes the leader flag into the Init union record, keeping the rest of it. */
export const writeLeaderFlag = (record) => (leader) => setDBitem('union', { ...(record || {}), leader }, 'Init');
