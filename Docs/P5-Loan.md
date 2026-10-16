# P5 — accept a loan and the cash desk (Nov 7 release plan §4, PWA lane)

Branch `t1/pwa/P5` (from `snapshot/2026-10-08`). Behind the Privy flag; the live build is unchanged.

## Decisions (executive, 16 Oct; LOAN_RULES §5 "Accept a loan and the cash desk")

- The node sponsors the leader's cash-desk calls too (`cash_scan_mint`, `pay_out`; oracle O12); leaders need no XLM.
- The loan request QR is signed by the leader's Stellar wallet and checked on her phone (signature, signer is a
  leader of her union, 48 h expiry); N10 shows only the signed values; Confirm / Cancel; one loan per food token.
- Cash (seed included) and machine hours only; no seed stepper.
- Her food tokens: the approved plan's mint list + `fund_core.food_token`.
- Member calls are her own transactions, fee-bumped by the node; the junior withdrawal waits 14 days (contract).

## Built

| File | Does |
|---|---|
| `src/stellar/soroban.js` | build → simulate (`prepareTransaction`) → sign with her Privy wallet → `POST /stellar/feebump` → poll the RPC; reads by simulation; scval helpers |
| `src/stellar/TxStatus.jsx` | `useSorobanTx` and N1 pending / N2 confirmed (closes in 5 s) / N3 failed + Try again |
| `src/loan/request.js` | the signed request: canonical text, SEP-53 signature, QR `nila:loan:…`, checks on her phone |
| `src/loan/LoanScreens.jsx` | **L11** (leader: pick an approved plan → a Ready crop share → Cash and Machine hours steppers → "Show QR to her") → **L9** QR + 6-digit number; **A1b Scan** (camera via html5-qrcode, or type the code) → **N10** (You get ₹X · cash + hours · For crop · Area · Repay about) → `fund_core.draw_loan` |
| `src/loan/CashDesk.jsx` | leader **Cash** tab: Crop share request, **Invest** (her wallet + counted cash → `cash_scan_mint` INVEST), **Repay** (an open loan → `cash_scan_mint` REPAY) |
| `src/shell/WalletQr.jsx` | **A1a** her wallet QR (for the leader) |
| `src/stellar/hooks.js` | `useInvestment` (`fund_core.position`); A1 shows "nIN invested" and adds it to the total |
| `src/loan/Investment.jsx` | **A3** (P5c): invested, earned, locked; withdraw her free part (`request_unbond_junior`, shares = amount × RAY / index), 14 days, then `claim_junior` |
| `src/loan/CashOut.jsx` | **A7 → A7b** (P5c): nIN amount → `fx_pool.request_cash_out` under the hash of a one-time 9-digit code (7 days; the code stays on her phone) → QR + digits; leader **Pay out a cash-out** → `fx_pool.pay_out` (sponsored) |
| oracle O12 | `GET /plan/approvals/approved` (L11 list) and leader-call sponsoring |

## Changes after the first build (executive decision, 16 Oct)

- **Self mode sends its own transactions:** the Scan tab is shown in assisted mode only. A self-mode member takes
  up a Ready crop share herself: A1 "Crop shares" → her share → Cash and Machine hours → "Get cash and vouchers"
  → confirm (N10 wording) → `draw_loan` signed on her phone (`src/loan/MyShares.jsx`). In assisted mode the row
  says "Ready · ask your leader" and the leader's QR + her scan (N10) is the path.
- **Union checks on L11 and the take-up** (`src/loan/unionChecks.js`), as the board's three rows:
  - Loan limit of the union: `max_loan` and the junior money free to lend — a **hard cap** on the cash stepper.
  - Seed and machine stock: free senior money ÷ the prepaid part per hour — a **hard cap** on the hours stepper.
  - Cash on hand: cash at hand + the union treasury — a **warning** when short (the LP offer comes with the LP lane).
- **Photo count (C6, board LeaderPhotoCount):** the leader's Invest / Repay go through C6: total scanned, the target
  ("she brought" / "of ₹X"), a row per note (removable), the round camera, "Full amount counted." / "₹X still to count.
  She can also repay part now.", "Invest ₹X" / "Repay ₹X". Counting uses the node's `POST /inr/scan-bulk` (the
  same API and model as today's app); the receipt hash is sha256 of the stored photo keys.

## Design gaps

- No member names on the node ("Land N", "Your union leader", "her").
- The take-up screen for a self-mode member has no board of its own (L11 + N10 in one).
- L11's `#short` LP offer is not built (LP lane).
- No N11 board (the transaction screens show the result).
- A3 has no rate arrow (Q5), no "In a year", no Photo count / Cash teller on her side; the cash-out has no leader
  name and no reclaim button after expiry; the leader types her cash-out code (no camera on Pay out).
- New hooks not in the design: `useUnionChecks`, `useMyShares` (her crop shares; the design's `useCropShares`),
  `checkRequest`/`makeRequest` (design `useIssueRequest`/`useConfirmRequest`).
