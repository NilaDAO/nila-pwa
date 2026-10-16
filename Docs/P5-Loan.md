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
| oracle O12 | `GET /plan/approvals/approved` (L11 list) and leader-call sponsoring |

## Design gaps

- The Scan tab is shown to every member (the design: assisted mode only), so a self-mode member can scan the
  request. No member names on the node ("Land N", "Your union leader", "her").
- L11 does not show the union checks (cash on hand, stock, union limit) or the `#short` LP offer yet.
- C6 photo count (`/inr/scan-bulk`) is not wired: the leader types the counted amount; the receipt hash is a hash
  of leader, member, purpose, amount and time. No N11 board.
- A3 (her investment page with withdraw: `request_unbond_junior` / `claim_junior`) and cash-out (A7/A7b,
  `request_cash_out`, leader `pay_out`) are **P5c**.
- New hooks not in the design yet: `useSorobanTx` (in the design), `checkRequest`/`makeRequest` (design
  `useIssueRequest`/`useConfirmRequest`), `useInvestment` (in the design).
