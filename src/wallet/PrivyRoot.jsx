// Privy, wrapped so the rest of the app never imports it: the app signs through useNilaSigner()
// (wallet/signer.js). Loaded lazily by WalletRoot only when REACT_APP_PRIVY_APP_ID is set.
//
// Login stays ours (phone → Cognito → SMS). Privy is plugged in next to it: once her Cognito
// session is there, the app signs Privy's Sign-In-With-Ethereum message with her own Polygon key
// (no screen, no code) and Privy logs her in. Privy then holds her Stellar wallet. Her Polygon
// wallet stays the key she already has, so her address, land titles and FoodTokens do not move
// (design open item 13). No Privy login UI, no email, no Privy SMS.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrivyProvider, useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { polygon } from 'viem/chains';
import { AUTH_EVENT, getChain, getLocalEvmWallet, hasSession } from './session';
import { SignerContext } from './signer';
import { useAccount, useSetupAccount } from '../stellar/hooks';

const APP_ID = process.env.REACT_APP_PRIVY_APP_ID;

const toHex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.slice(2).match(/../g), (x) => parseInt(x, 16));

/** The Polygon (Ethereum) wallets linked to the Privy user. Not `user.wallet`: once her Stellar wallet is
 *  made, Privy may report that one there, which looked like another login and logged her out. */
const linkedEvm = (user) => (user?.linkedAccounts || [])
  .filter((a) => a.type === 'wallet' && a.chainType === 'ethereum' && a.address)
  .map((a) => a.address.toLowerCase());

// New or existing Privy user (LOAN_RULES §5, 20 Oct "New or existing after the code (R4)"): decided at the login
// after the code and kept per wallet on the phone, so a reload during registration keeps the same path.
const newKey = (a) => `nila.privyNew.${(a || '').toLowerCase()}`;
const readNew = (a) => { try { const v = localStorage.getItem(newKey(a)); return v === '1' ? true : v === '0' ? false : undefined; } catch { return undefined; } };
const writeNew = (a, v) => { try { localStorage.setItem(newKey(a), v ? '1' : '0'); } catch { /* kept in memory only */ } };

function useSession() {
  const [session, setSession] = useState({ loading: true, active: false });
  useEffect(() => {
    let live = true;
    const check = () => hasSession().then((active) => live && setSession({ loading: false, active }));
    check();
    window.addEventListener(AUTH_EVENT, check);
    return () => { live = false; window.removeEventListener(AUTH_EVENT, check); };
  }, []);
  return session;
}

function SignerBridge({ children }) {
  const session = useSession();
  const { ready, authenticated, user, logout } = usePrivy();
  const loginFor = useRef(null);                         // the Polygon address our silent login is for
  const [privyNew, setPrivyNew] = useState();
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe({
    onComplete: ({ isNewUser }) => {
      if (!loginFor.current) return;
      writeNew(loginFor.current, !!isNewUser);
      setPrivyNew(!!isNewUser);
    },
  });
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const [evmWallet, setEvmWallet] = useState();
  const [error, setError] = useState();

  // Her Polygon key, unlocked as the app does today, and her wallet's chain.
  const [chain, setChain] = useState();
  useEffect(() => {
    if (session.loading) return;
    if (!session.active) { setEvmWallet(undefined); setChain(undefined); return; }
    getLocalEvmWallet().then(setEvmWallet);
    getChain().then(setChain);
  }, [session]);

  // Silent Privy login with her key; logout follows the Cognito session.
  const busy = useRef(false);
  useEffect(() => {
    if (!ready || busy.current) return;
    const evm = linkedEvm(user);
    if (authenticated && (!session.active || (evmWallet && evm.length && !evm.includes(evmWallet.address.toLowerCase())))) {
      busy.current = true;
      logout().finally(() => { busy.current = false; });
      return;
    }
    if (authenticated || !evmWallet) return;
    busy.current = true;
    loginFor.current = evmWallet.address;
    (async () => {
      const message = await generateSiweMessage({ address: evmWallet.address, chainId: `eip155:${polygon.id}` });
      const signature = await evmWallet.signMessage(message);
      const u = await loginWithSiwe({ message, signature });
      // onComplete normally said it; if not, a user made in the last two minutes is a new one.
      if (readNew(evmWallet.address) === undefined) {
        const made = u?.createdAt ? new Date(u.createdAt).getTime() : 0;
        const fresh = made > 0 && Date.now() - made < 120_000;
        writeNew(evmWallet.address, fresh); setPrivyNew(fresh);
      }
      setError(undefined);
    })()
      .catch((e) => { console.error('[privy] silent login failed', e); setError(e.message); })
      .finally(() => { busy.current = false; });
  }, [ready, authenticated, user, session, evmWallet, generateSiweMessage, loginWithSiwe, logout]);

  useEffect(() => {
    if (!evmWallet) { setPrivyNew(undefined); return; }
    const v = readNew(evmWallet.address);
    if (v !== undefined) { setPrivyNew(v); return; }
    // Logged in to Privy without our login just now (a session already on this phone): an existing user.
    if (ready && authenticated && !busy.current && linkedEvm(user).includes(evmWallet.address.toLowerCase())) {
      writeNew(evmWallet.address, false); setPrivyNew(false);
    }
  }, [evmWallet, ready, authenticated, user]);

  const stellar = user?.linkedAccounts?.find((a) => a.type === 'wallet' && a.chainType === 'stellar');

  // Every member has both wallets (LOAN_RULES §5, 15 Oct): make her Stellar wallet once.
  const creating = useRef(false);
  useEffect(() => {
    if (!authenticated || stellar || creating.current) return;
    creating.current = true;
    createWallet({ chainType: 'stellar' })
      .catch((e) => console.error('[privy] Stellar wallet not created', e))
      .finally(() => { creating.current = false; });
  }, [authenticated, stellar, createWallet]);

  // Stellar: a 64-byte ed25519 signature over a 32-byte hash (Soroban auth entry payload or
  // tx hash). P0 showed this covers Soroban auth entries and SEP-10.
  const signHash = useCallback(async (hash) => {
    if (!stellar) throw new Error('no Stellar wallet yet');
    const { signature } = await signRawHash({ address: stellar.address, chainType: 'stellar', hash: toHex(hash) });
    const sig = fromHex(signature);
    if (sig.length !== 64) throw new Error(`signature is ${sig.length} bytes, expected 64`);
    return sig;
  }, [stellar, signRawHash]);

  // Polygon: her own key signs, as today. Returns the signed raw tx; the caller broadcasts it.
  const signEvmTx = useCallback(async (tx) => {
    if (!evmWallet) throw new Error('no Polygon key');
    return evmWallet.signTransaction(tx);
  }, [evmWallet]);

  // Both wallets belong to the same login: her current Polygon key is linked to the Privy user
  // (during a key change the old user is still there for a moment).
  const sameLogin = !!evmWallet && linkedEvm(user).includes(evmWallet.address.toLowerCase());
  const signersReady = ready && authenticated && sameLogin && !!stellar;

  // Her Stellar account (P2): the node sponsors it; it needs no land title (titles stay on Polygon).
  // Made by itself at login for a new wallet (R4). A Polygon wallet ('137') waits for the move:
  // M1 step 1 calls the same setup (design R4: "Polygon wallet found → M1").
  const account = useAccount(signersReady ? stellar.address : undefined);
  const { status: setupStatus, error: setupError, mutate: runSetup, mutateAsync: runSetupAsync } =
    useSetupAccount({ stellarAddress: stellar?.address, evmWallet, signHash });
  const autoSetup = chain !== undefined && chain !== '137';  // undefined: not read yet
  const tried = useRef();
  useEffect(() => {
    // Also for her existing account without this network's nIN trustline (22 Oct): the setup adds it, sponsored.
    const missing = account.data?.exists === false || (account.data?.exists && account.data.nin === null);
    if (!signersReady || !autoSetup || !missing || tried.current === stellar.address) return;
    tried.current = stellar.address;
    runSetup(undefined, { onError: (e) => console.error('[privy] Stellar account setup failed', e) });
  }, [signersReady, autoSetup, account.data, stellar, runSetup]);

  const value = useMemo(() => ({
    ready: signersReady,
    authenticated,
    error,
    privyUserId: user?.id,
    // true: Privy made her user at this login (→ R5); false: it existed (→ R9); undefined: not known yet.
    privyNew,
    privyEvmAddress: linkedEvm(user)[0],
    evmAddress: evmWallet?.address,
    stellarAddress: stellar?.address,
    signHash,
    signEvmTx,
    // { exists, nin: { balance, authorized }, usdc, sponsor } once read; undefined before.
    stellarAccount: account.data,
    // run: the move (M1 step 1) and the retry button call it; no second run while one is pending.
    stellarSetup: {
      status: setupStatus, error: setupError?.message,
      run: () => setupStatus !== 'pending' && runSetup(),
      runAsync: () => runSetupAsync(),
    },
    // Her Polygon key signs a text message (EIP-191), e.g. the move request.
    signEvmMessage: (msg) => {
      if (!evmWallet) throw new Error('no Polygon key');
      return evmWallet.signMessage(msg);
    },
  }), [signersReady, authenticated, error, user, privyNew, evmWallet, stellar, signHash, signEvmTx, account.data,
    setupStatus, setupError, runSetup, runSetupAsync]);

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export default function PrivyRoot({ children }) {
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        defaultChain: polygon,
        supportedChains: [polygon],
        // No Privy Polygon wallet: her own key is her Polygon wallet.
        embeddedWallets: { ethereum: { createOnLogin: 'off' }, showWalletUIs: false },
      }}
    >
      <SignerBridge>{children}</SignerBridge>
    </PrivyProvider>
  );
}
