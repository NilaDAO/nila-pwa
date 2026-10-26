// Keypad member hooks (P8, L14). DESIGN GAP: the design proposes useInviteLink (Q53, names not confirmed yet); built
// under that name, with useKeypadMember for L14 #sent. Query keys qk.oracle.keypad.
import { useEffect, useMemo, useRef } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { invokeContract, isDeployed } from '../stellar/soroban';
import { signerVal } from '../stellar/account';
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

/** Keypad accounts (26 Oct): a keypad member's smart account is created by the leader's app as soon as the member's
 *  phone is set up (its key is made when the SMS link is opened, so it cannot be made at Add a member). Runs while a
 *  leader's app is open, from the keypad members list it already polls; each account is checked once on this phone. */
export function KeypadAccounts() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const keypads = useKeypadMembers().data;
  const busy = useRef(false);
  useEffect(() => {
    if (!cfg || !s?.ready || busy.current || !keypads) return;
    const done = (a) => { try { return localStorage.getItem(`nila.keypad.made.${a}`) === '1'; } catch { return false; } };
    const todo = keypads.filter((m) => m.phone_type === 'keypad' && m.device && m.account && (m.first_signer || m.signer) && !done(m.account));
    if (!todo.length) return;
    busy.current = true;
    (async () => {
      for (const m of todo) {
        try {
          if (!(await isDeployed(cfg, m.account))) {
            const hex = m.first_signer || m.signer;
            await invokeContract({ cfg, source: s.senderAddress, signHash: s.signHash, contractName: 'account_factory', fn: 'create',
              args: [signerVal(Uint8Array.from(hex.match(/../g).map((x) => parseInt(x, 16))))] });
          }
          try { localStorage.setItem(`nila.keypad.made.${m.account}`, '1'); } catch { /* checked again next time */ }
        } catch (e) { console.error('[keypad] account not created', m.account, e); }
      }
      busy.current = false;
    })();
  }, [keypads, cfg, s]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
