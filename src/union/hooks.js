// The union's signers, its 2-of-3 calls (3-of-5 until 6 Nov) and the leaders' contact book (executive decision 1 Nov), from the node
// (nila-sensing app/routers/union_book.py). Every call is signed like /plan; the contact book is opened on the phone.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { signedCall } from '../plan/api';
import { fingerprint, loadCache, loadKey, newKey, open, saveCache, saveKey, seal, tagOf } from './book';

const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromHex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));

function useCall() {
  const s = useNilaSigner();
  return useMemo(() => (s?.signHash && (s.senderAddress || s.stellarAddress) ? signedCall(s) : null), [s]);
}

/** The key this phone signs with (the leader's own G key): what the union account lists as a signer. */
export function useMyKey() {
  const s = useNilaSigner();
  return s?.senderAddress || s?.stellarAddress || null;
}

export function useUnionSigners() {
  const call = useCall();
  return useQuery({ queryKey: ['union', 'signers'], enabled: !!call, staleTime: 60_000, queryFn: () => call('GET', '/stellar/union/signers') });
}

// ---------- the contact book ----------

/** { state, names, nodeFp, myFp }: state 'none' (no key anywhere: make one), 'scan' (the union has a key, this phone
 *  not), 'mismatch' (this phone's key is not the union's), 'ok'. names: Map address → { name, phone }. */
export function useContactBook() {
  const call = useCall();
  const { data: cfg } = useStellarConfig();
  const union = cfg?.union;
  return useQuery({
    queryKey: ['union', 'book', union], enabled: !!call && !!union, staleTime: 60_000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const key = loadKey(union);
      const myFp = key ? await fingerprint(key) : null;
      const cached = loadCache(union);
      const since = cached && cached.fp === myFp ? cached.seq : 0;
      const r = await call('GET', `/stellar/union/book?since=${since}`);
      const nodeFp = r.key_fp || null;
      const state = !nodeFp ? (key ? 'unsent' : 'none') : !key ? 'scan' : nodeFp !== myFp ? 'mismatch' : 'ok';
      const entries = since && cached ? { ...cached.entries } : {};
      if (state === 'ok') {
        for (const e of r.entries || []) {
          if (!e.box) { delete entries[e.tag]; continue; }
          try { entries[e.tag] = await open(key, e.box); } catch { /* another key's entry: left out */ }
        }
        saveCache(union, { fp: myFp, seq: r.seq, entries });
      }
      const names = new Map(state === 'ok' ? Object.values(entries).map((x) => [x.address, { name: x.name, phone: x.phone }]) : []);
      return { state, names, nodeFp, myFp, union };
    },
  });
}

/** The full name a leader gave this address, or ''. */
export function usePersonalName(address) {
  const book = useContactBook();
  return (address && book.data?.names.get(address)?.name) || '';
}

export function useBookActions() {
  const call = useCall();
  const qc = useQueryClient();
  const { data: cfg } = useStellarConfig();
  const union = cfg?.union;
  const done = () => qc.invalidateQueries({ queryKey: ['union', 'book'] });
  // Make the union key (no leader has one yet), or take a scanned one: kept on this phone, its fingerprint on the node.
  const useKey = useMutation({
    mutationFn: async (raw) => {
      const key = raw || newKey();
      const fp = await fingerprint(key);
      const r = await call('GET', '/stellar/union/book?since=1000000000000');
      if (r.key_fp && r.key_fp !== fp) throw new Error('This is not the union key. Scan it again from another leader.');
      if (!r.key_fp) await call('POST', '/stellar/union/book/key', { fp });
      saveKey(union, key);
      return fp;
    },
    onSuccess: done,
  });
  // Tag an address with a full name (and phone); an empty name removes the tag.
  const setName = useMutation({
    mutationFn: async ({ address, name, phone }) => {
      const key = loadKey(union);
      if (!key) throw new Error('No union key on this phone.');
      const tag = await tagOf(key, address);
      const box = name?.trim() ? await seal(key, { address, name: name.trim(), phone: phone?.trim() || '' }) : null;
      return call('POST', '/stellar/union/book', { fp: await fingerprint(key), entries: [{ tag, box }] });
    },
    onSuccess: done,
  });
  return { useKey, setName };
}

// ---------- the union's 2-of-3 calls ----------

export function useProposals() {
  const call = useCall();
  return useQuery({ queryKey: ['union', 'proposals'], enabled: !!call, staleTime: 15_000, refetchInterval: 30_000,
    queryFn: async () => (await call('GET', '/stellar/union/proposals')).proposals || [] });
}

export function useProposalActions() {
  const call = useCall();
  const s = useNilaSigner();
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ['union', 'proposals'] });
    qc.invalidateQueries({ queryKey: ['stellar', 'rates'] });
  };
  // The proposer signs straight away: one of the two signatures.
  const signOne = async (p) => {
    const sig = await s.signHash(fromHex(p.hash));
    return call('POST', `/stellar/union/proposals/${p.id}/sign`, { signature: b64(sig) });
  };
  const propose = useMutation({
    mutationFn: async ({ contract, fn, args }) => signOne(await call('POST', '/stellar/union/proposals', { contract, fn, args })),
    onSuccess: done,
  });
  // A change of signers (2 Nov): replace one signer's key by the new signer's (a key or a leader's account, as its QR).
  const proposeSigners = useMutation({
    // A leader adding a new union's first signers is no signer yet: the proposal waits for the union's own key.
    mutationFn: async ({ remove, add, sign = true }) => {
      const p = await call('POST', '/stellar/union/proposals/signers', { remove: remove || '', add });
      return sign ? signOne(p) : p;
    },
    onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ['union', 'signers'] }); },
  });
  const sign = useMutation({ mutationFn: signOne, onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ['union', 'signers'] }); } });
  const withdraw = useMutation({ mutationFn: (p) => call('POST', `/stellar/union/proposals/${p.id}/withdraw`), onSuccess: done });
  return { propose, proposeSigners, sign, withdraw };
}
