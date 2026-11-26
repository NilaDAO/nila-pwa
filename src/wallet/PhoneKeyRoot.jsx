// Plan 053: the signer of an assist-mode member whose key is on her own phone (wallet/phoneKey.js), next to PrivyRoot.
// No Privy, no Cognito: her account (a smart account of the account deployer) follows from the key, unless a recovery put
// the key on another account (found through the indexer's signer_set events). She holds no XLM and sends nothing
// herself: her help QR (kind 2, or kind 4 with her signed set_union while the account is not made or names no union)
// lets a leader's app act for her; her own node calls are signed with the key (plan/api.js signedCall).
// No Polygon wallet: screens that need one (evmAddress) or a G key (senderAddress) get undefined.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SignerContext } from './signer';
import { findAccountByKey, indexerUrl, loadOrMakeKey, signBytes, signPayload } from './phoneKey';
import { PHONE_KEY_TEXTS as T } from './phoneKeyTexts';
import { useStellarConfig } from '../stellar/hooks';
import { accountOfKey } from '../stellar/account';
import { isDeployed, readContract, sv } from '../stellar/soroban';
import RecoverLink, { linkCode, recoveredAccount, spkiId } from './RecoverLink';
import { BootLoading } from '../register/Boot';
import RegFrame from '../register/RegFrame';

const NIN_DECIMALS = 7;
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const noEvm = async () => { throw new Error('no Polygon wallet on this phone'); };

export default function PhoneKeyRoot({ children }) {
  const { data: cfg } = useStellarConfig();
  const [key, setKey] = useState();
  const [error, setError] = useState();
  useEffect(() => { loadOrMakeKey().then(setKey).catch((e) => { console.error('[phonekey] no key', e); setError(e.message); }); }, []);

  // Plan 054 §5: this key as the node knows a device key (SPKI, base64url): a recovery link registers it, and the
  // member's account the link named is kept for it (RecoverLink).
  const [kid, setKid] = useState();
  const [tick, setTick] = useState(0);
  useEffect(() => { if (key) spkiId(key.pair).then(setKid).catch(() => setKid('')); }, [key]);
  const linked = useCallback(() => setTick((x) => x + 1), []);

  // Her account: the one the key makes, or (not made yet) the one a recovery put this key on: the account the
  // recovery link named, else the indexer's signer_set events.
  const derived = useMemo(() => (cfg && key ? accountOfKey(cfg, key.pub) : undefined), [cfg, key]);
  const found = useQuery({
    queryKey: ['phonekey', 'account', derived, kid, tick], enabled: !!derived && kid !== undefined, staleTime: Infinity, retry: 1,
    queryFn: async () => {
      if (await isDeployed(cfg, derived)) return derived;
      if (recoveredAccount(kid)) return recoveredAccount(kid);
      const base = indexerUrl(cfg);
      return (base && await findAccountByKey(base, hex(key.pub)).catch((e) => { console.warn('[phonekey] indexer', e); return undefined; }))
        || derived;
    },
  });
  const account = found.data || (found.isError ? derived : undefined);

  // As PrivyRoot's stellarAccount for a smart account: made or not, union, nIN.
  const state = useQuery({
    queryKey: ['phonekey', 'state', account], enabled: !!cfg && !!account, staleTime: 15_000,
    queryFn: async () => {
      const deployed = await isDeployed(cfg, account);
      if (!deployed) return { exists: true, deployed, union: null, nin: { balance: 0, authorized: false }, decimals: NIN_DECIMALS };
      const [bal, auth, union] = await Promise.all([
        readContract(cfg, 'nin', 'balance', [sv.address(account)]).catch(() => null),
        readContract(cfg, 'nin', 'authorized', [sv.address(account)]).catch(() => false),
        readContract(cfg, account, 'union', []).then((u) => u || null).catch(() => undefined)]);
      return { exists: true, deployed, union, decimals: NIN_DECIMALS,
        nin: { balance: bal === null ? null : Number(BigInt(bal ?? 0)) / 10 ** NIN_DECIMALS, balanceFailed: bal === null, authorized: !!auth } };
    },
  });

  const pairRef = useRef();
  pairRef.current = key?.pair;
  const signHash = useCallback(async (payload) => {
    if (!pairRef.current) throw new Error('no key on this phone yet');
    return signPayload(pairRef.current, payload);
  }, []);
  const signMessage = useCallback(async (bytes) => {
    if (!pairRef.current) throw new Error('no key on this phone yet');
    return signBytes(pairRef.current, bytes);
  }, []);

  const ready = !!key && !!account;
  const value = useMemo(() => ({
    ready,
    authenticated: true,
    error,
    kind: 'P256',
    publicKey: key?.pub,
    stellarAddress: ready ? account : undefined,
    senderAddress: undefined,
    evmAddress: undefined,
    signHash,
    signMessage,
    signEvmTx: noEvm,
    signEvmMessage: noEvm,
    stellarAccount: state.data,
    stellarAccountFailed: (state.isError && !state.data) || !!state.data?.nin?.balanceFailed,
    // She sends nothing herself: the leader's app makes and joins her account from her help QR.
    stellarSetup: { status: 'success', run: () => {}, runAsync: async () => {}, joinUnion: async () => false },
  }), [ready, error, key, account, signHash, signMessage, state.data, state.isError]);

  let screen = children;
  if (error) screen = <RegFrame><p style={{ margin: 0, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>{T.noKey}</p></RegFrame>;
  else if (key && kid && linkCode()) screen = <RecoverLink stellar={kid} phoneKey={key.pair} onDone={linked} />;
  else if (!ready) screen = <BootLoading />;
  return <SignerContext.Provider value={value}>{screen}</SignerContext.Provider>;
}
