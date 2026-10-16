// Privy, wrapped so the rest of the app never imports it: the app signs through useNilaSigner()
// (wallet/signer.js). Loaded lazily by WalletRoot only when REACT_APP_PRIVY_APP_ID is set.
// No Privy login UI and no email: Privy accepts only our Cognito ID token (cognitoJwt.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PrivyProvider, usePrivy, useSignTransaction, useSubscribeToJwtAuthWithFlag, useWallets,
} from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { polygon } from 'viem/chains';
import { AUTH_EVENT, getCognitoIdToken, hasCognitoSession } from './cognitoJwt';
import { SignerContext } from './signer';

const APP_ID = process.env.REACT_APP_PRIVY_APP_ID;

const toHex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.slice(2).match(/../g), (x) => parseInt(x, 16));

function useCognitoFlag() {
  const [state, setState] = useState({ isLoading: true, isAuthenticated: false });
  useEffect(() => {
    let live = true;
    const check = () => hasCognitoSession().then((ok) => live && setState({ isLoading: false, isAuthenticated: ok }));
    check();
    window.addEventListener(AUTH_EVENT, check);
    return () => { live = false; window.removeEventListener(AUTH_EVENT, check); };
  }, []);
  return state;
}

function SignerBridge({ children }) {
  const { isLoading, isAuthenticated } = useCognitoFlag();
  useSubscribeToJwtAuthWithFlag({ isLoading, isAuthenticated, getExternalJwt: getCognitoIdToken });

  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();

  const evm = wallets.find((w) => w.walletClientType === 'privy');
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

  // Polygon: returns the signed raw tx; the caller broadcasts it.
  const signEvmTx = useCallback(async (tx) => {
    if (!evm) throw new Error('no Polygon wallet yet');
    const { signature } = await signTransaction(tx, { address: evm.address, uiOptions: { showWalletUIs: false } });
    return signature;
  }, [evm, signTransaction]);

  const value = useMemo(() => ({
    ready: ready && authenticated && !!evm && !!stellar,
    authenticated,
    evmAddress: evm?.address,
    stellarAddress: stellar?.address,
    signHash,
    signEvmTx,
  }), [ready, authenticated, evm, stellar, signHash, signEvmTx]);

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export default function PrivyRoot({ children }) {
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        defaultChain: polygon,
        supportedChains: [polygon],
        embeddedWallets: { ethereum: { createOnLogin: 'all-users' }, showWalletUIs: false },
      }}
    >
      <SignerBridge>{children}</SignerBridge>
    </PrivyProvider>
  );
}
