# P0 — Privy in the PWA (Nov 7 release plan §4, PWA lane)

Questions:
1. Does Privy's **Stellar** wallet sign Soroban auth entries and the SEP-10 challenge? (design open item 43)
2. Does Privy's **EVM** wallet sign `mintForBatchMember` (N1)?

## Decisions (executive, 16 Oct — LOAN_RULES §5)

- **Login is ours, not Privy's: SMS through Cognito, as today** (operations' choice, 16 Oct; it
  replaces the WhatsApp choice of the same morning). Privy only holds the wallets and trusts our
  Cognito **ID token** (Privy "JWT-based auth"). No Privy login UI, **no email login**, no Privy Scale plan.
- **Keys:** Cognito no longer stores or recovers keys for Privy wallets — Privy does. The encrypted-key
  code (the Cognito Lambda, copy in `src/misc/lambda_handlers.js`; `getEncryptedKey.js`) is **kept**
  for when we go off Privy.
- **Privy is for now.** The app signs only through `useNilaSigner()` (`src/wallet/signer.js`):
  `signHash(hash32)` for Stellar, `signEvmTx(tx)` for Polygon. Replacing Privy means replacing
  `src/wallet/PrivyRoot.jsx` and nothing else. Keys can be exported from Privy.

## How it is wired

| File | Does |
|---|---|
| `src/wallet/signer.js` | `useNilaSigner()` context; the app imports this, never Privy |
| `src/wallet/WalletRoot.jsx` | Loads Privy lazily, **only** when `REACT_APP_PRIVY_APP_ID` is set (wraps the app in `Layout.js`) |
| `src/wallet/PrivyRoot.jsx` | `PrivyProvider` (no login methods), syncs the Cognito session (`useSubscribeToJwtAuthWithFlag`), creates her Stellar wallet once, exposes `signHash` / `signEvmTx` |
| `src/wallet/cognitoJwt.js` | Cognito ID token for Privy: cached in IndexedDB `Init/id_token`, refreshed with the stored refresh token; `nila:auth-changed` event on login (`registerRecover.js`) and logout (`db.deleteAllItems`) |
| `src/wallet/stellarChecks.js` | The Stellar checks, using only `signHash` |
| `src/wallet/P0Check.jsx` | `/p0` page: the checks against her real Privy wallets (only when Privy is on) |
| `scripts/p0-rawhash-proof.mjs` | The same Stellar checks with a throwaway key, no Privy |
| `config-overrides.js` | Privy flag as a build-time literal; Privy's unused optional add-ons → empty modules; Buffer for stellar-sdk |

**Flag off = live build unchanged:** 3 JS files, 3.9 MB, same as the snapshot baseline; no Privy or
Stellar code in the bundle or the service-worker precache. Flag on: +159 lazy chunks (~6 MB), loaded
only by a Privy build.

**Never put `REACT_APP_PRIVY_APP_ID` in `.env.local`:** CRA also reads `.env.local` in production
builds, so it would switch Privy on in `build:production`. Pass it on the command line.

## Results

### Part 1 — raw-hash proof, no Privy (`node scripts/p0-rawhash-proof.mjs`): **3/3 PASS** (16 Oct, run twice)

| Check | The 32-byte hash | Proof |
|---|---|---|
| Soroban auth entry | `sha256(HashIdPreimage)` from `authorizeEntry`'s callback; a separate sponsor key pays the fee | native XLM SAC `transfer` **SUCCESS on testnet** (tx `405ab378…e1a4`, again `b620deb6…6644`) |
| SEP-10, server-side check | challenge tx hash | `WebAuth.verifyChallengeTxSigners` accepts her signature |
| SEP-10, SDF test anchor | challenge tx hash | `testanchor.stellar.org` issues a JWT |

So a raw-hash signer covers Soroban auth entries and SEP-10, not only envelopes (open item 43: yes).

### Part 2 — the real Privy wallets (`/p0`): pending

Smoke test (headless, `/p0` with Privy on): Privy loads and talks to the app (`auth.privy.io` 200),
no app errors; the only failed request is Privy's own WalletConnect wallet list (unused).

Needs, in the Privy dashboard (app "Nila"):
1. **JWT-based auth on:** JWKS URL `https://cognito-idp.ap-south-1.amazonaws.com/<user pool id>/.well-known/jwks.json`, user id claim `sub`.
2. **Email login off** (it is on today) — not used.
3. The PWA's origin in allowed origins (dev: the `npm start` origin; later pwa.nila.land / the Amplify dev URL).

Then log in to the app as usual, open `/p0`, press S0–S3 and E1–E2, and paste the log here.

| # | Check | Result |
|---|---|---|
| S0 | Stellar wallet made after login | |
| S1 | Soroban auth entry via Privy `signRawHash`, testnet SUCCESS | |
| S2 | SEP-10, server-side check | |
| S3 | SEP-10, SDF test anchor | |
| E1 | Polygon wallet made after login | |
| E2 | `mintForBatchMember` signed silently, decoded, **not broadcast** | |

Still open after P0: the Cognito Lambda stops generating and storing a key for members who get
Privy wallets (code kept, switched off per member); importing her existing Polygon key into Privy
(open item 13, M1).

Pinned: `@privy-io/react-auth` 3.46.0, `@stellar/stellar-sdk` 17.2.0, `viem` 2.56.0 (installed with
`--legacy-peer-deps`: Privy's optional Solana peers want TypeScript ≥ 5.4, CRA has 4.9.5, kept pinned).
