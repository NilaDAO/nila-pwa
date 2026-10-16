// The app's one signing interface. Import useNilaSigner from here, never Privy itself: replacing
// Privy later means replacing wallet/PrivyRoot.jsx and nothing else (executive decision, 16 Oct).
import { createContext, useContext } from 'react';

// Off unless REACT_APP_PRIVY_APP_ID is set, so the live build is unchanged.
export const privyEnabled = !!process.env.REACT_APP_PRIVY_APP_ID;

export const SignerContext = createContext(null);

/**
 * null while Privy is off; otherwise { ready, authenticated, evmAddress, stellarAddress, signHash,
 * signEvmTx, stellarAccount, stellarSetup }. stellarAccount is her Stellar account as read from
 * Horizon ({ exists, nin: { balance, authorized }, usdc, sponsor }); the app creates it by itself
 * after login (stellarSetup: { status, error, retry }).
 */
export const useNilaSigner = () => useContext(SignerContext);
