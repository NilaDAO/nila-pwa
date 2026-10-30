// The node's key call (K2, key backup 29 Oct). After the member's Polygon key is imported into Privy (migration), or a
// new member's Privy Polygon wallet is made, the app tells the node. The node checks through Privy's server API that
// the Privy user holds that embedded Polygon wallet, then deletes the Cognito key backup (migration) or records the
// address as custom:address (a new member). Idempotent: calling it again changes nothing.
// Both logins are sent: Cognito's (whose attributes) and Privy's (whose wallet). No key or signature is sent.
const API = process.env.REACT_APP_API_BASE_URL;

export async function reportPrivyWallet({ cognitoToken, privyToken, address }) {
  const r = await fetch(`${API}/keys/privy-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cognitoToken}`, 'X-Privy-Token': privyToken },
    body: JSON.stringify({ address }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || `key report ${r.status}`);
  return body;                                            // { address, deleted: bool, recorded: bool }
}
