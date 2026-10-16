// The app's one signing interface. Import useNilaSigner from here, never Privy itself: replacing
// Privy later means replacing wallet/PrivyRoot.jsx and nothing else (executive decision, 16 Oct).
import { createContext, useContext } from 'react';

// Off unless REACT_APP_PRIVY_APP_ID is set, so the live build is unchanged.
export const privyEnabled = !!process.env.REACT_APP_PRIVY_APP_ID;

export const SignerContext = createContext(null);

/** null while Privy is off; otherwise { ready, authenticated, evmAddress, stellarAddress, signHash, signEvmTx }. */
export const useNilaSigner = () => useContext(SignerContext);
