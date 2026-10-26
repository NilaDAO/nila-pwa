// Keypad member hooks (P8, L14). DESIGN GAP: the design proposes useInviteLink (Q53, names not confirmed yet); built
// under that name, with useKeypadMember for L14 #sent. Query keys qk.oracle.keypad.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { keypadClient } from './api';

export const qkKeypad = {
  member: (id) => ['oracle', 'keypad', 'member', id],
};

function useKeypadClient() {
  const s = useNilaSigner();
  return useMemo(() => (s?.stellarAddress && s?.signHash ? keypadClient(s) : null), [s]);
}

/** L14: add her and text the app link; `again` sends a new link (the old one stops working). */
export function useInviteLink() {
  const api = useKeypadClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v) => (v.again ? api.sendAgain(v.again) : api.add(v)),
    onSuccess: (m) => qc.setQueryData(qkKeypad.member(m.id), m),
  });
}

/** L14 #sent: her progress (link, consent, device key, fields; no PIN), polled while the leader waits with her. */
export function useKeypadMember(id) {
  const api = useKeypadClient();
  return useQuery({ queryKey: qkKeypad.member(id), enabled: !!api && !!id, queryFn: () => api.member(id), refetchInterval: 5_000 });
}

/** L1 To do (26 Oct): the union's keypad members, for the rows "Take field points" and "Set up the phone". */
export function useKeypadMembers() {
  const api = useKeypadClient();
  return useQuery({ queryKey: ['oracle', 'keypad', 'members'], enabled: !!api, queryFn: () => api.list().then((x) => x.members || []), refetchInterval: 30_000 });
}

export { useKeypadClient };
