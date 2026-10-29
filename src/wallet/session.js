// Her login is ours: phone → Cognito → SMS code, as today. Privy is plugged in next to it.
// Key backup (executive decision 29 Oct, handoffs/Claude_Code_Prompt_Key_Backup_Deletion.md): Privy holds both of the
// member's keys and the Privy login is a passkey. Until the member's one-time migration, Cognito still keeps the
// Polygon key (encrypted) and Privy is signed in silently with it (Sign-In With Ethereum, 16 Oct); after it, Cognito
// keeps no key and this file reads none. Cognito stays the gateway: it proves the number.
import { ethers } from 'ethers';
import { deleteAllItems, deleteItem, readAllItems } from '../utils/db';
import { decryptPrivateKey, freshAccessToken, handleGetEncryptedPrivateKey } from '../utils/getEncryptedKey';

export const AUTH_EVENT = 'nila:auth-changed';

export const hasSession = async () => {
  const db = await readAllItems('Init');
  return !!(db.refresh_token || db.local_pk);
};

/** The member's Polygon key backup: { wallet } (an ethers Wallet, unlocked the way the app always did it) while
 *  Cognito still keeps the key, { none: true } once it keeps none (migrated to Privy, or a new member), undefined
 *  when it could not be read. Only the one-time migration and the not-yet-migrated login use the wallet. */
export const getKeyBackup = async () => {
  try {
    const db = await readAllItems('Init');
    // Local dev override (nila local inject-wallet): the raw key, no Cognito.
    if (db.local_pk) return { wallet: new ethers.Wallet(db.local_pk) };
    const enc = await handleGetEncryptedPrivateKey(db);
    if (enc === null) return { none: true };
    const pk = db.salt && enc && await decryptPrivateKey(enc, db.salt);
    return pk ? { wallet: new ethers.Wallet(pk) } : undefined;
  } catch (e) {
    console.error('[privy] the Polygon key is not available', e);
    // The login itself is gone (26 Oct): Cognito refuses the session even after a token refresh (the user was removed,
    // or the refresh token revoked). Clear the stored session and start at the login, once per tab (no reload loop).
    if (/NotAuthorized/.test(`${e?.name} ${e?.code} ${e?.__type}`)) {
      try {
        if (!sessionStorage.getItem('nila.deadSession')) {
          sessionStorage.setItem('nila.deadSession', '1');
          await deleteAllItems();
          window.location.reload();
        }
      } catch { /* storage blocked: the app stays where it is */ }
    }
    return undefined;
  }
};

/** After the migration (or a new member's wallet is reported): no salt or raw key stays on this phone. */
export const forgetLocalKey = async () => {
  await deleteItem('salt', 'Init');
  await deleteItem('local_pk', 'Init');
};

/** The Polygon address Cognito keeps for her (custom:address, stored at login); null if none (a new member). */
export const getStoredAddress = async () => {
  try {
    return (await readAllItems('Init')).address || null;
  } catch {
    return null;
  }
};

/** A Cognito access token for the node's key calls (K2). */
export const getCognitoToken = async () => freshAccessToken(await readAllItems('Init'));

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
