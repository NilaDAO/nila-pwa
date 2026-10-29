// The static demo build only (REACT_APP_DEMO_STATIC=1, src/demo/shim.js): stands in for PrivyRoot, with no Privy.
// Her Polygon key is unlocked as usual (the shim's Cognito stand-in hands out the demo wallet); her Stellar address
// comes from the demo fixtures. Signatures are zeros: every call they would go with is answered by the shim, and
// her own transactions return a canned success (stellar/soroban.js, plan/mint.js).
import { useEffect, useMemo, useState } from 'react';
import { AUTH_EVENT, getLocalEvmWallet, hasSession } from './session';
import { SignerContext } from './signer';
import { useAccount } from '../stellar/hooks';
import { stellarOf } from '../demo/shim';

export default function StaticRoot({ children }) {
  const [evmWallet, setEvmWallet] = useState();
  const [stellar, setStellar] = useState();
  useEffect(() => {
    const check = async () => {
      const w = (await hasSession()) ? await getLocalEvmWallet() : undefined;
      setEvmWallet(w);
      setStellar(w ? await stellarOf(w.address) : undefined);
    };
    check();
    window.addEventListener(AUTH_EVENT, check);
    return () => window.removeEventListener(AUTH_EVENT, check);
  }, []);
  const ready = !!evmWallet && !!stellar;
  const account = useAccount(ready ? stellar : undefined);
  const value = useMemo(() => ({
    ready,
    authenticated: ready,
    privyUserId: ready ? 'demo' : undefined,
    privyNew: evmWallet ? false : undefined,
    privyEvmAddress: evmWallet?.address.toLowerCase(),
    evmAddress: evmWallet?.address,
    stellarAddress: stellar,
    signHash: async () => new Uint8Array(64),
    signEvmTx: async () => '0x',
    stellarAccount: account.data,
    stellarSetup: { status: 'success', run: () => {}, runAsync: async () => {} },
    signEvmMessage: async () => `0x${'0'.repeat(130)}`,
  }), [ready, evmWallet, stellar, account.data]);
  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}
