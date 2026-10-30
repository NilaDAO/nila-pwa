// Privy, wrapped so the rest of the app never imports it: the app signs through useNilaSigner()
// (wallet/signer.js). Loaded lazily by WalletRoot only when REACT_APP_PRIVY_APP_ID is set.
//
// Login stays ours (phone → Cognito → SMS). Privy is plugged in next to it.
// Key backup (executive decision 29 Oct, handoffs/Claude_Code_Prompt_Key_Backup_Deletion.md K1): Privy holds both of
// the member's keys, the Privy login is a passkey, and Nila keeps no key:
// - Not migrated yet (Cognito still keeps the encrypted Polygon key): the app signs Privy's Sign-In-With-Ethereum
//   message with that key (no screen) as before. With the migration on (REACT_APP_KEY_MIGRATION=1) and nothing on
//   Polygon holding it back (a Polygon wallet or leader, an open Polygon loan, Polygon nIN), the member then makes a
//   passkey, Privy imports the key (same address), the node deletes the Cognito copy (K2) and the phone forgets its salt.
//   The SIWE login stays linked: Privy refuses to unlink it while a passkey is the only other login (K0).
// - Migrated, or a new member (Cognito keeps no key): the passkey logs in to Privy; a new member's Privy user gets a
//   Privy Polygon wallet, reported to the node, which records it as the member's address (K2).
// Polygon signs with the Privy wallet once there is one; with the member's own key only until the migration.
// Her address, land titles and FoodTokens do not move. No Privy login UI, no email, no Privy SMS.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PrivyProvider, useImportWallet, useLinkWithPasskey, useLoginWithPasskey, useLoginWithSiwe, usePrivy, useSignMessage,
  useSignTransaction, useSignupWithPasskey,
} from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { polygon } from 'viem/chains';
import { AUTH_EVENT, forgetLocalKey, getChain, getCognitoToken, getKeyBackup, getStoredAddress, hasSession } from './session';
import { SignerContext } from './signer';
import { reportPrivyWallet } from './keyApi';
import { KeyMigration, PasskeyLogin } from './KeyScreens';
import { useLegacyBalances, useOpenPolygonLoans } from '../move/hooks';
import { readAllItems } from '../utils/db';
import { useAccount, useSetupAccount, useStellarConfig } from '../stellar/hooks';
import { accountOf } from '../stellar/account';

const APP_ID = process.env.REACT_APP_PRIVY_APP_ID;
// The one-time key migration (K1): off until the node (K2) and the Lambda (K3) ship with it.
const MIGRATION_ON = process.env.REACT_APP_KEY_MIGRATION === '1';
const NO_UI = { uiOptions: { showWalletUIs: false } };

const toHex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.slice(2).match(/../g), (x) => parseInt(x, 16));

/** The Polygon (Ethereum) wallets linked to the Privy user. Not `user.wallet`: once her Stellar wallet is
 *  made, Privy may report that one there, which looked like another login and logged her out. */
const linkedEvm = (user) => (user?.linkedAccounts || [])
  .filter((a) => a.type === 'wallet' && a.chainType === 'ethereum' && a.address)
  .map((a) => a.address.toLowerCase());

/** The Privy embedded Polygon wallet (imported at the migration, or made for a new member); undefined if none. */
const embeddedEvm = (user) => (user?.linkedAccounts || [])
  .find((a) => a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType === 'privy' && a.address);

// A lost phone (K1 recovery): this phone made a new Privy user for the member's number, so the member's account waits
// for two leaders. Kept per Cognito address on the phone.
const lostKey = (a) => `nila.recovering.${(a || '').toLowerCase()}`;
export const readRecovering = (a) => { try { return !!a && localStorage.getItem(lostKey(a)) === '1'; } catch { return false; } };
const writeRecovering = (a, v) => { try { if (v) localStorage.setItem(lostKey(a), '1'); else localStorage.removeItem(lostKey(a)); } catch { /* memory only */ } };

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
  const { createWallet: createEvmWallet, getAccessToken } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const { signMessage: privySignMessage } = useSignMessage();
  const { signTransaction: privySignTransaction } = useSignTransaction();
  const { importWallet } = useImportWallet();
  const { linkWithPasskey } = useLinkWithPasskey();
  const passkeyDone = { onComplete: ({ isNewUser }) => setPrivyNew(!!isNewUser) };
  const { loginWithPasskey } = useLoginWithPasskey(passkeyDone);
  const { signupWithPasskey } = useSignupWithPasskey(passkeyDone);
  const [backup, setBackup] = useState();               // { wallet } | { none: true } | undefined (session.js)
  const evmWallet = backup?.wallet;                      // her own key: only before the migration
  const [error, setError] = useState();

  // Her key backup as Cognito keeps it, the address it names, and her wallet's chain.
  const [chain, setChain] = useState();
  const [storedAddress, setStoredAddress] = useState();
  useEffect(() => {
    if (session.loading) return;
    if (!session.active) { setBackup(undefined); setChain(undefined); setStoredAddress(undefined); return; }
    getKeyBackup().then(setBackup);
    getChain().then(setChain);
    getStoredAddress().then(setStoredAddress);
  }, [session]);
  const embedded = embeddedEvm(user);

  // Silent Privy login with her key; logout follows the Cognito session.
  const busy = useRef(false);
  // After a failed login, wait before the next try (26 Oct): every re-render tried again at once, and a rate-limited
  // wallet (Privy 429) stayed limited. 1 minute after a failure, 5 after a 429; a timer makes the one retry.
  const retryAt = useRef(0);
  const [, setRetryTick] = useState(0);
  useEffect(() => {
    if (!ready || busy.current || Date.now() < retryAt.current) return;
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
      .catch((e) => {
        console.error('[privy] silent login failed', e);
        setError(e.message);
        const wait = /429|too many requests/i.test(`${e?.message} ${e?.cause?.message || ''}`) ? 300_000 : 60_000;
        retryAt.current = Date.now() + wait;
        setTimeout(() => setRetryTick((x) => x + 1), wait + 100);
      })
      .finally(() => { busy.current = false; });
  }, [ready, authenticated, user, session, evmWallet, generateSiweMessage, loginWithSiwe, logout]);

  useEffect(() => {
    if (!evmWallet) { if (!backup?.none) setPrivyNew(undefined); return; }
    const v = readNew(evmWallet.address);
    if (v !== undefined) { setPrivyNew(v); return; }
    // Logged in to Privy without our login just now (a session already on this phone): an existing user.
    if (ready && authenticated && !busy.current && linkedEvm(user).includes(evmWallet.address.toLowerCase())) {
      writeNew(evmWallet.address, false); setPrivyNew(false);
    }
  }, [evmWallet, backup, ready, authenticated, user]);

  // ---------- passkey login (Cognito keeps no key: migrated, or a new member) ----------
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState();
  const [noPasskey, setNoPasskey] = useState(false);
  const [confirmLost, setConfirmLost] = useState(false);
  // A failed unlock is ambiguous (a cancelled prompt and a phone without the passkey look the same to the app), so the
  // lost-phone path shows only after two failed unlocks, never on a network error (review 29 Oct).
  const failedUnlocks = useRef(0);
  const recovering = readRecovering(storedAddress);
  const passkeyMode = ready && !authenticated && session.active && backup?.none
    ? (storedAddress && !recovering ? 'login' : 'signup') : null;
  const runKey = (fn) => async () => {
    if (keyBusy) return;
    setKeyBusy(true); setKeyError(undefined);
    try { await fn(); } catch (e) {
      console.error('[privy] key step failed', e);
      if (/network|fetch|timeout|offline/i.test(e?.message || '')) setKeyError('No connection. Try again.');
      else if (passkeyMode === 'login' && ++failedUnlocks.current >= 2) setNoPasskey(true);
      else setKeyError('That did not work. Try again.');
    } finally { setKeyBusy(false); }
  };
  const passkeyGo = runKey(() => (passkeyMode === 'login' ? loginWithPasskey() : signupWithPasskey()));
  // A lost phone: a new Privy user (new keys) on this phone; two leaders move the member's account to it (K1 recovery).
  // New keys only after the member confirms it (review 29 Oct).
  const passkeyLost = runKey(async () => { writeRecovering(storedAddress, true); setConfirmLost(false); await signupWithPasskey(); });

  // A new member (or a recovering phone): Privy makes the Polygon wallet; Nila generates none.
  const makingEvm = useRef(false);
  useEffect(() => {
    if (!authenticated || !backup?.none || embedded || makingEvm.current) return;
    makingEvm.current = true;
    createEvmWallet().catch((e) => console.error('[privy] Polygon wallet not created', e))
      .finally(() => { makingEvm.current = false; });
  }, [authenticated, backup, embedded, createEvmWallet]);

  // Tell the node (K2): after the migration (it deletes the Cognito copy), or a new member's wallet (it records the
  // address). Not for a recovering phone: its new address is not the member's until two leaders have moved the account.
  const reported = useRef();
  const report = useCallback(async (address) => {
    await reportPrivyWallet({ cognitoToken: await getCognitoToken(), privyToken: await getAccessToken(), address });
    await forgetLocalKey();
    const db = await readAllItems('Init');
    setStoredAddress(db.address || address);
    setBackup({ none: true });
  }, [getAccessToken]);
  const migrated = !!embedded && !!evmWallet && embedded.address.toLowerCase() === evmWallet.address.toLowerCase();
  useEffect(() => {
    if (!authenticated || !embedded || reported.current === embedded.address) return;
    const newMember = backup?.none && !storedAddress && !recovering;
    if (!migrated && !newMember) return;
    reported.current = embedded.address;
    report(embedded.address).catch((e) => { console.error('[key] report failed', e); reported.current = undefined; });
  }, [authenticated, embedded, migrated, backup, storedAddress, recovering, report]);

  // The one-time migration: a passkey, then Privy imports her key (the same address).
  const migrate = runKey(async () => {
    if (!(user?.linkedAccounts || []).some((a) => a.type === 'passkey')) await linkWithPasskey({ name: 'Nila' });
    const w = await importWallet({ privateKey: evmWallet.privateKey });
    if (w?.address?.toLowerCase() !== evmWallet.address.toLowerCase()) throw new Error('imported address differs');
  });

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
    // Privy signs inside its hidden frame; right after a reload it may not be loaded yet ("wallet proxy not
    // initialized", 29 Oct: the help QR is made at once). Wait for it, up to about 15 seconds.
    let signature;
    for (let i = 0; ; i++) {
      try {
        ({ signature } = await signRawHash({ address: stellar.address, chainType: 'stellar', hash: toHex(hash) }));
        break;
      } catch (e) {
        if (!/proxy not initiali[sz]ed/i.test(e?.message || '') || i >= 30) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const sig = fromHex(signature);
    if (sig.length !== 64) throw new Error(`signature is ${sig.length} bytes, expected 64`);
    return sig;
  }, [stellar, signRawHash]);

  // Polygon: the Privy wallet signs once there is one; the member's own key only before the migration.
  // { address, signMessage(text), signTransaction(tx) → signed raw tx (the caller broadcasts it) }.
  const evm = useMemo(() => {
    if (embedded) {
      const opts = { ...NO_UI, address: embedded.address };
      return {
        address: embedded.address,
        signMessage: async (message) => (await privySignMessage({ message }, opts)).signature,
        signTransaction: async (tx) => (await privySignTransaction(tx, opts)).signature,
      };
    }
    return evmWallet;
  }, [embedded, evmWallet, privySignMessage, privySignTransaction]);
  const signEvmTx = useCallback(async (tx) => {
    if (!evm) throw new Error('no Polygon wallet');
    return evm.signTransaction(tx);
  }, [evm]);

  // Both wallets belong to the same login: her Polygon wallet is linked to the Privy user
  // (during a key change the old user is still there for a moment).
  const sameLogin = !!evm && linkedEvm(user).includes(evm.address.toLowerCase());
  const signersReady = ready && authenticated && sameLogin && !!stellar;

  // Her Stellar account (P2): the node sponsors it; it needs no land title (titles stay on Polygon).
  // Made by itself at login for a new wallet (R4). A Polygon wallet ('137') waits for the move:
  // M1 step 1 calls the same setup (design R4: "Polygon wallet found → M1").
  // Smart accounts (26 Oct): her account is a contract of the union's factory at an address that follows from her
  // Privy key; the key's own plain account (sponsored, 0 XLM) sends her calls, the node fee-bumps them.
  const { data: cfg } = useStellarConfig();
  const smart = stellar && cfg?.contracts?.account_factory ? accountOf(cfg, stellar.address) : stellar?.address;
  const account = useAccount(signersReady ? stellar.address : undefined, signersReady ? smart : undefined);
  const { status: setupStatus, error: setupError, mutate: runSetup, mutateAsync: runSetupAsync } =
    useSetupAccount({ stellarAddress: stellar?.address, account: smart, evmWallet: evm, signHash });
  const autoSetup = chain !== undefined && chain !== '137';  // undefined: not read yet
  const tried = useRef();
  useEffect(() => {
    // Also for her existing account without this network's nIN trustline (22 Oct): the setup adds it, sponsored.
    const missing = account.data?.exists === false || (account.data?.exists && account.data.nin === null)
      || account.data?.deployed === false;
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
    evmAddress: evm?.address,
    // A lost phone: this phone's new keys wait for two leaders to move the member's account here (K1 recovery).
    recovering: recovering && !!embedded && embedded.address.toLowerCase() !== (storedAddress || '').toLowerCase(),
    memberAddress: storedAddress,
    // Her account (the smart account: titles, shares, investment, roles); senderAddress sends her transactions.
    stellarAddress: smart,
    senderAddress: stellar?.address,
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
      if (!evm) throw new Error('no Polygon wallet');
      return evm.signMessage(msg);
    },
  }), [signersReady, authenticated, error, user, privyNew, evm, recovering, embedded, storedAddress, stellar, smart,
    signHash, signEvmTx, account.data, setupStatus, setupError, runSetup, runSetupAsync]);

  let screen = children;
  if (passkeyMode) {
    screen = <PasskeyLogin mode={passkeyMode} busy={keyBusy} error={keyError} noPasskey={noPasskey}
      onGo={passkeyGo} confirming={confirmLost} onLost={() => setConfirmLost(true)} onConfirmLost={passkeyLost}
      onBack={() => setConfirmLost(false)} />;
  } else if (MIGRATION_ON && authenticated && evmWallet && !embedded) {
    screen = <MigrationGate chain={chain} evm={evmWallet.address} busy={keyBusy} error={keyError} onGo={migrate}>
      {children}</MigrationGate>;
  }
  return <SignerContext.Provider value={value}>{screen}</SignerContext.Provider>;
}

/** The migration screen, only when nothing on Polygon holds it back: a Polygon wallet (chain '137', a leader
 *  whose union still has old loans), an open Polygon loan or Polygon nIN (they migrate once it is closed). Until
 *  that is known, or while it holds, the app runs as before. */
function MigrationGate({ chain, evm, busy, error, onGo, children }) {
  const [union, setUnion] = useState();
  useEffect(() => { readAllItems('Init').then((db) => setUnion(db.union?.address)).catch(() => {}); }, []);
  const legacy = useLegacyBalances(evm);
  const loans = useOpenPolygonLoans(evm, union);
  const free = chain !== undefined && chain !== null && chain !== '137'
    && legacy.data && legacy.data.nin < 1 && loans.known && loans.open.length === 0;
  return free ? <KeyMigration busy={busy} error={error} onGo={onGo} /> : children;
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
