# P0 — Privy in the PWA (Nov 7 release plan §4, PWA lane)

Questions:
1. Does Privy's **Stellar** wallet sign Soroban auth entries and the SEP-10 challenge? (design open item 43)
2. Does the member sign `mintForBatchMember` on Polygon from the same login (N1)?

**Answer: yes to both — 6/6 PASS against the real Privy app on 16 Oct 2026, free plan.**

## Decisions (executive, 16 Oct — LOAN_RULES §5 "Login and Privy")

- **Login is ours: phone → Cognito → SMS code, as today** (operations' choice). The Trust registers
  a DLT sender ID and template so SNS uses the domestic route (handoffs/SMS_DLT_Registration_Prompt.md).
- **Privy is plugged in next to it on the free plan.** Privy's JWT login ("custom authentication")
  and WhatsApp need its Scale plan ($499/month): not used. Privy SMS (US/Canada only) and email: off.
- **How:** after the Cognito login the app unlocks her Polygon key as today and silently signs
  Privy's Sign-In-With-Ethereum message with it (Privy login method "External wallets", free).
  Privy logs her in and holds her **Stellar** wallet.
- **Her Polygon wallet stays her existing key:** same address, land titles and FoodTokens; no Privy
  EVM wallet (this also settles design open item 13 without a key import). A new member gets a key
  before login, as the Cognito Lambda does today.
- **Trade-off:** her Privy (Stellar) wallet is only as safe as the Cognito-held key, which is now
  also her Privy login. That is short of the TAD's "no Nila-held key material" (TAD §5.3 needs an
  update). The app signs only through `useNilaSigner()`, so Privy can be replaced.

## How it is wired

| File | Does |
|---|---|
| `src/wallet/signer.js` | `useNilaSigner()` context: `signHash(hash32)` (Stellar), `signEvmTx(tx)` (Polygon). The app imports this, never Privy |
| `src/wallet/WalletRoot.jsx` | Loads Privy lazily, **only** when `REACT_APP_PRIVY_APP_ID` is set (wraps the app in `Layout.js`) |
| `src/wallet/PrivyRoot.jsx` | `PrivyProvider` (no login UI, no Privy EVM wallet); silent SIWE login with her key; logout follows the Cognito session (and a key change); creates her Stellar wallet once |
| `src/wallet/session.js` | Session check and her key, unlocked as the app does today (`local_pk` dev override honoured); `nila:auth-changed` on login (`registerRecover.js`) and logout (`db.deleteAllItems`) |
| `src/wallet/stellarChecks.js` | The Stellar checks, using only `signHash` |
| `src/wallet/P0Check.jsx` | `/p0` page: the checks against the real Privy wallets (only when Privy is on) |
| `scripts/p0-rawhash-proof.mjs` | The same Stellar checks with a throwaway key, no Privy |
| `config-overrides.js` | Privy flag as a build-time literal; Privy's unused optional add-ons → empty modules; Buffer for stellar-sdk |

**Flag off = live build unchanged:** 3 JS files, 3.9 MB, no Privy or Stellar code in the bundle or
the service-worker precache (checked after every change). Flag on: +159 lazy chunks (~6 MB).

**Never put `REACT_APP_PRIVY_APP_ID` in `.env.local`:** CRA also reads `.env.local` in production
builds, so it would switch Privy on in `build:production`. Pass it on the command line.

## Results

### Part 1 — raw-hash proof, no Privy (`node scripts/p0-rawhash-proof.mjs`): 3/3 PASS

Soroban auth entry signed through a 32-byte-hash callback, separate sponsor pays the fee → native
SAC `transfer` SUCCESS on testnet (`405ab378…e1a4`, `b620deb6…6644`); SEP-10 server-side check PASS;
SDF test anchor issued a JWT. So a raw-hash signer covers Soroban auth entries and SEP-10.

### Part 2 — the real Privy app ("Nila", dev mode), `/p0`, headless at 390 px: 6/6 PASS

Throwaway Polygon key in IndexedDB (`local_pk`), page served on `http://localhost:5173` (allowed origin).

| # | Check | Result |
|---|---|---|
| S0 | Stellar wallet created after the silent login | PASS `GAUTBJMJ…MRYE` |
| E1 | Privy user's wallet = her Polygon key | PASS `0xb75E19b1…136B`, `did:privy:cmvaruxgj01470fjsx8wygd6b` |
| E2 | `mintForBatchMember` signed with her key, decoded, **not broadcast** | PASS |
| S1 | Soroban auth entry via Privy `signRawHash`, testnet SUCCESS | PASS tx `755b704d…80dc` (ledger 5223951) |
| S2 | SEP-10, server-side check | PASS |
| S3 | SEP-10, SDF test anchor (JWT) | PASS |

**Recovery:** the same key in two fresh browsers (a new phone) → the same Privy user
(`did:privy:cmvarw37q01230fjugnj0gtoj`) and the same Stellar wallet (`GDOS55CX…L7Z7`).

No page errors. Privy fetches a WalletConnect wallet list it does not need (harmless).

## Next

- P2 (Stellar login): sponsored Stellar account + nIN trustline for her Privy Stellar address (oracle O1), balances on A1.
- Allowed origins: add the Amplify dev URL and pwa.nila.land before a Privy build is deployed.
- Privy dev mode → production before members use it.
- SMS: the Trust's DLT registration, then the Cognito `CreateAuthOTP` Lambda publishes through SNS with entity ID, template ID and sender ID (the Lambda is only in AWS; pull it into a repo first).

Pinned: `@privy-io/react-auth` 3.46.0, `@stellar/stellar-sdk` 17.2.0, `viem` 2.56.0 (installed with
`--legacy-peer-deps`: Privy's optional Solana peers want TypeScript ≥ 5.4; CRA's 4.9.5 kept pinned).
