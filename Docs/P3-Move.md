# P3 — Transition to Stellar mode: the move M1–M4 (Nov 7 release plan §4, PWA lane)

Branch `t1/pwa/P3` (from `t1/pwa/P2`). Off unless `REACT_APP_PRIVY_APP_ID` is set; with the flag off the build
is unchanged (3 JS files, 3.9 MB, no Privy, Stellar or move code; checked 16 Oct).

## Decisions (executive, 16 Oct; LOAN_RULES §5 "The move")

- Polygon nIN is **attested on Stellar and burned on Polygon** (oracle O10, contracts C8).
- An **open Polygon loan blocks the move** until it is repaid in the old app.
- **No reset**: after the chain switch the app reloads in place and opens on Stellar.
- `custom:chain` = **`stellar`**. Existing FoodTokens are not moved; titles are attested once she is
  paired (her account setup) and her union is vouched (the leaders' list, O1c).

## What it does

`StellarGate` (lazy, flag on) wraps the wallet: a Polygon wallet (`chain` = 137) sees only the move, full
screen; a moved wallet (`stellar`) opens on an interim Stellar home until P1's bottom bar and A1 replace it.

"Move my wallet" (`useMoveWallet`), each step safe to repeat, progress in localStorage (`nila.move`),
M4 "Try again" resumes at the failed step:
1. Her sponsored Stellar account and wallet pair (`stellarSetup.runAsync`, P2).
2. If she holds Polygon nIN: her Polygon key signs the move request → `POST /stellar/move/nin`. The oracle
   burns and mints later, once her title is attested; the home shows where it is (`GET /stellar/move/{polygon}`).
3. `custom:chain` = `stellar` in Cognito with her access/refresh token (no admin fallback), then in IndexedDB.

| File | Does |
|---|---|
| `src/move/hooks.js` | `useLegacyBalances` (Polygon title count, nIN, USDT), `useMoveProgress`, `useMoveWallet`, `useOpenPolygonLoans` |
| `src/move/api.js` | the move request (message must match the node's `move_message`) and its status |
| `src/move/MoveFlow.jsx` | M1, M1b (offline), M2, M3, M4, and the repay-first state |
| `src/move/StellarGate.jsx`, `StellarHome.jsx` | Stellar mode routing; interim home |
| `src/App.js`, `src/Layout.js` | lazy gate around the wallet; `/p3` check route (flag on only) |
| `src/wallet/PrivyRoot.jsx` | `stellarSetup.runAsync`, `signEvmMessage` |

## Tested (16 Oct)

Flag-on build, headless at 390 px, throwaway Polygon key, local node on testnet (`APP_ENV=local`):
`/p3` shows M1 with live Polygon reads (title 0, nIN 0); "Move my wallet" made her sponsored Stellar account
(node: `/stellar/account` + submit 200), skipped the nIN step (0), and step 3 failed without a Cognito session
→ M4 with `{"step":2}` saved, so "Try again" resumes at step 3.

**Not tested yet:** the Cognito chain switch and the full app boot in Stellar mode (needs a Cognito test
user: Amplify dev), and a move with Polygon nIN (needs BURNER_ROLE on a fork + C8 on testnet).

## Design gaps (for the design brief)

- M1: "Crop shares" row removed (existing FoodTokens are not moved, 15 Oct); the "open your wallet again"
  note removed (no reset). New state: "Repay your loan first. Then you can move your wallet." (no board).
- M3: no reset, so no "Recover wallet" and no "new code on WhatsApp": "Your land title and nIN are waiting."
  + Continue, with a note that her nIN arrives after the union confirms her title.
- Interim Stellar home: no board (P1's A1 replaces it).
- `useMoveWallet` signs with "member + Nila (+ attester)" in the design; the attester now acts later (O10).

## Security note found in passing

`src/utils/cognito_helpers.js` builds its Cognito client with an IAM key from `REACT_APP_NILAAPP_AWS` /
`REACT_APP_NILAAPP_SECRET`, and `updateUserChain` falls back to `AdminUpdateUserAttributes` with it. Checked
16 Oct: `.env.production` does not set that key, so the live bundle carries none; never set it in an env file a
build reads. P3 never takes the admin path (no phone passed).
