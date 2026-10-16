// Her login is ours: phone → Cognito → SMS code, as today. Privy is plugged in next to it and is
// signed in silently with her own Polygon key (Sign-In With Ethereum), the key Cognito already
// keeps for her (executive decision, 16 Oct — LOAN_RULES §5). Privy's JWT login needs its Scale plan.
import { ethers } from 'ethers';
import { readAllItems } from '../utils/db';
import { decryptPrivateKey, handleGetEncryptedPrivateKey } from '../utils/getEncryptedKey';

export const AUTH_EVENT = 'nila:auth-changed';

export const hasSession = async () => {
  const db = await readAllItems('Init');
  return !!(db.refresh_token || db.local_pk);
};

/** Her Polygon key as an ethers Wallet, unlocked the same way the app does it; undefined if not available. */
export const getLocalEvmWallet = async () => {
  try {
    const db = await readAllItems('Init');
    // Local dev override (nila local inject-wallet): the raw key, no Cognito.
    const pk = db.local_pk || (db.salt && await decryptPrivateKey(await handleGetEncryptedPrivateKey(db), db.salt));
    return pk ? new ethers.Wallet(pk) : undefined;
  } catch (e) {
    console.error('[privy] her Polygon key is not available', e);
    return undefined;
  }
};

/** Her wallet's chain as Cognito keeps it (custom:chain): '137' = a Polygon wallet; null if none stored. */
export const getChain = async () => {
  try {
    return (await readAllItems('Init')).chain ?? null;
  } catch {
    return null;
  }
};

// Called by the login flow once the Cognito tokens are stored, and on logout.
export const announceAuthChange = () => window.dispatchEvent(new Event(AUTH_EVENT));
