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

/** A lost keypad phone (executive decision 2 Nov): once the new phone has opened the newest SMS link, the leader asks
 *  the node for the recovery and signs its payload hash with the leader's own key; the node adds the SMS key and sends
 *  recover_by_sms. The account works with the new phone after the union's wait. */
export function useRecoverPhone(id) {
  const api = useKeypadClient();
  const s = useNilaSigner();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { hash } = await api.recoverAsk(id);
      const sig = await s.signHash(Uint8Array.from(hash.match(/../g), (x) => parseInt(x, 16)));
      return api.recoverSign(id, btoa(String.fromCharCode(...new Uint8Array(sig))));
    },
    onSuccess: (m) => qc.setQueryData(qkKeypad.member(id), m),
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
/** A lost phone (2 Nov): the leader who sends the new SMS link from G2 has decided the recovery; this phone remembers it
 *  and recovers the account as soon as the new phone has opened the link (KeypadAccounts below), with no second tap. */
const RECOVER = (id) => `nila.keypad.recover.${id}`;
export function markRecover(id) { try { localStorage.setItem(RECOVER(id), '1'); } catch { /* the G2 button still works */ } }
const wantsRecover = (id) => { try { return localStorage.getItem(RECOVER(id)) === '1'; } catch { return false; } };

export function KeypadAccounts() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const keypads = useKeypadMembers().data;
  const api = useKeypadClient();
  const qc = useQueryClient();
  const busy = useRef(false);
  const recovering = useRef(false);
  useEffect(() => {
    if (!api || !s?.signHash || recovering.current || !keypads) return;
    const todo = keypads.filter((m) => m.recovery?.state === 'needed' && wantsRecover(m.id));
    if (!todo.length) return;
    recovering.current = true;
    (async () => {
      for (const m of todo) {
        try {
          const { hash } = await api.recoverAsk(m.id);
          const sig = await s.signHash(Uint8Array.from(hash.match(/../g), (x) => parseInt(x, 16)));
          await api.recoverSign(m.id, btoa(String.fromCharCode(...new Uint8Array(sig))));
          try { localStorage.removeItem(RECOVER(m.id)); } catch { /* recovery pending: not asked again */ }
        } catch (e) { console.error('[keypad] recovery not sent', m.id, e); }
      }
      recovering.current = false;
      qc.invalidateQueries({ queryKey: ['oracle', 'keypad', 'members'] });
    })();
  }, [keypads, api, s]); // eslint-disable-line react-hooks/exhaustive-deps
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
