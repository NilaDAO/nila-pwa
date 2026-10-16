# P2 — Stellar login (Nov 7 release plan §4, PWA lane)

Branch `t1/pwa/P2` (from `t1/pwa/P0`). Off unless `REACT_APP_PRIVY_APP_ID` is set: with the flag off the
build is unchanged (3 JS files, 3.9 MB, no Privy or Stellar code; checked 16 Oct).

## What it does

After the Cognito login and the silent Privy login (P0), the app makes her **sponsored Stellar account**
by itself, with no screen: at login for a new wallet (R4), and the move (M1 step 1, P3) calls the same
setup. It needs **no land title**: titles stay on Polygon and the attester only attests them on Stellar
(oracle O1b, `t1/oracle/O1b`).

1. `GET /stellar/config` (node): network, Horizon, nIN asset, union, contract ids. No Stellar build settings.
2. Horizon: does her account exist? If yes, nothing to do.
3. `POST /stellar/account {member}` → the sponsored tx (create account + nIN trustline only, R9).
4. She signs its hash with her Privy Stellar wallet (`signHash`); her Polygon key signs the wallet pair
   (`Nila: my Stellar account / network / stellar / polygon`).
5. `POST /stellar/account/submit {xdr, polygon, polygon_sig}` → the sponsor co-signs and submits; the
   node records the pair, and the attester attests her Polygon titles, now and minted later.
6. Poll Horizon until the account is there; `qk.stellar.account` is refreshed.

| File | Does |
|---|---|
| `src/stellar/api.js` | node endpoints, Horizon read, the pair message |
| `src/stellar/hooks.js` | `useStellarConfig`, `useAccount(addr)` (exists, nIN balance + authorised, USDC, sponsor; fresh 15 s), `useSetupAccount` |
| `src/stellar/keys.js` | `qk.stellar.*` query keys (design data/DataHooksRead.md) |
| `src/wallet/PrivyRoot.jsx` | runs the setup once per Stellar address after login; `useNilaSigner()` now also gives `stellarAccount` and `stellarSetup {status, error, retry}` |
| `src/wallet/P0Check.jsx` | `/p0` shows the Stellar account panel |

The Stellar code is imported only from the lazy Privy chunk. Screens read the account through
`useNilaSigner()`, so they never import stellar-sdk.

## Test (16 Oct, testnet)

Local node (`APP_ENV=local`: no periodic jobs, no S3 upload) on the C3 testnet contracts with a throwaway
friendbot sponsor; flag-on build; headless browser at 390 px with a throwaway Polygon key:
`/p0` → "Stellar account: exists · nIN 0 (trustline unauthorised) · sponsor GB5O7MXX…". The node recorded
the pair (`stellar_links`) and one account row in the sponsor's account cap (1.5 XLM reserves + fee).
No page errors.

## Not in P2

- **A1 balances on screen:** `useNilaSigner().stellarAccount` carries them; the A1 board itself is built
  with the bottom bar (P1). nIN shows 0 between payouts (the trustline stays unauthorised, R10).
- **The move (M1–M4):** P3. Leaders' accounts: same setup (they hold no title either).
- **Failure screen:** a failed setup keeps `stellarSetup.error` and a `retry`; the design has no board
  for it yet (design gap, PWA open list).
