# K0 — Privy import and passkey spike (handoffs/Claude_Code_Prompt_Key_Backup_Deletion.md)

29 Oct 2026. Privy dev app "Nila" (`cmvapfogt005l0ejr3b8m2kz3`, free plan, passkeys switched on 29 Oct), `@privy-io/react-auth` 3.46.0. The test page ran on `http://localhost:5173` in headless Chromium with a virtual passkey authenticator. Throwaway keys only; nothing was broadcast. **11 of 13 checks pass; both failures are the same one: the SIWE login cannot be removed.**

## Results

| # | Check | Result |
|---|---|---|
| — | SIWE login with her key (today's login); Stellar wallet created | PASS |
| a1 | Link a passkey to that user | PASS |
| b2 | Import her key into Privy: same address, `imported=true` | PASS |
| a2 | Passkey-only login lands on the same user | PASS |
| b3 | Privy signs on Polygon with the imported key | PASS |
| c1, c2 | Stellar wallet unchanged; Privy still signs on Stellar | PASS |
| x1, x2 | The same passkey in a fresh browser (a new phone with a synced passkey): same user, both wallets, Privy signs | PASS |
| b1 | Unlink the SIWE wallet | **FAIL: `cannot_unlink_sole_account`**, in the SDK and in the server API alike. Passkeys do not count as an account for this rule |
| b4 | The old key alone no longer logs in to her user | **FAIL**, a consequence of b1 |
| b5 | The member removes the SIWE login herself at her next login (passkey-only session, fresh browser) | **FAIL: the same `cannot_unlink_sole_account`**. The rule counts accounts, whatever the session |

## What it means

- Privy holds both chains' keys on the free plan, at the same address, behind a passkey, and a synced passkey restores both wallets on a new phone. B is real, and C works.
- **Residual risk:** her old key stays a valid Privy login. C therefore depends on destroying every copy of that key: the Cognito attributes, the Lambda's CloudWatch logs, and the app's local storage. After that only Privy holds it.
- Asked Privy (email of 29 Oct) whether a passkey can count as the remaining account.
- K1 order: SIWE once → link passkey → import the key → delete every copy (keep the SIWE link until Privy answers).
- Android key hashes are not needed. They are for native Android apps. A PWA passkey uses the web domain, and these checks passed without them. Production needs pwa.nila.land among the allowed origins.

## Left in the dev app

Test users (throwaway keys; delete when convenient): `did:privy:cmvtg4x8n00e70fkzr1holv0w`, `did:privy:cmvtg7h2s01n30gjp1z4s3dkz`, `did:privy:cmvtge27101uy0gjp406hq3bz`, `did:privy:cmvtgeu7p01js0gl31rqotbhu`, `did:privy:cmvtgg86000n90hi4yxont0fp`.
