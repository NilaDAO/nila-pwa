// Her login is ours (Cognito, code by WhatsApp); Privy only holds the wallets and trusts the
// Cognito ID token through "JWT-based auth" (executive decision, 16 Oct — LOAN_RULES §5).
// Privy dashboard: JWT auth on, JWKS = the user pool's /.well-known/jwks.json, user id claim `sub`.
import { jwtDecode } from 'jwt-decode';
import { readItem, updateItem } from '../utils/db';
import { refreshSession } from '../utils/cognito_helpers';

export const AUTH_EVENT = 'nila:auth-changed';

const fresh = (token) => {
  try {
    return Date.now() < jwtDecode(token).exp * 1000 - 60_000;
  } catch {
    return false;
  }
};

export const hasCognitoSession = async () => !!(await readItem('refresh_token', 'Init'))?.value;

// Never throws: Privy logs her out on a throw.
export const getCognitoIdToken = async () => {
  try {
    const cached = (await readItem('id_token', 'Init'))?.value;
    if (cached && fresh(cached)) return cached;
    const refresh = (await readItem('refresh_token', 'Init'))?.value;
    if (!refresh) return undefined;
    const r = await refreshSession(refresh);
    if (!r?.IdToken) return undefined;
    await updateItem({ id: 'id_token', value: r.IdToken }, 'Init');
    if (r.AccessToken) await updateItem({ id: 'jwt_token', value: r.AccessToken }, 'Init');
    return r.IdToken;
  } catch (e) {
    console.error('[privy] no Cognito ID token', e);
    return undefined;
  }
};

// Called by the login flow once the Cognito tokens are stored, and on logout.
export const announceAuthChange = () => window.dispatchEvent(new Event(AUTH_EVENT));
