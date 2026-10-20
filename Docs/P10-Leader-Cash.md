# P10 — the leader's cash boards (20 Oct)

Release plan P10 (executive decision 20 Oct); LOAN_RULES §5 20 Oct: leader treasury deposit and withdraw (C10, O15),
the union's loan list (O15, event search), no waiting cash-outs list on C4. Backends: nila-soroban C10
(`fund_core.leader_deposit_treasury`), nila-sensing O15 (treasury calls sponsored, `GET /stellar/union/loans`,
`POST /stellar/union/search`).

| Board | Where | Does |
|---|---|---|
| A1L | Assets (leader) | cash and LP slides (cash at hand with the 7-day deadline and bar, "Lend out or settle"; LP requests with "Here" / "Waiting", "Accept ₹X from …"); Union rows: treasury ("₹X free to cash in", Lending open / On hold), Cash (time left) |
| C1 / C2 | Cash tab | treasury, earnings pending, the reconcile chip: the node's loan list against the chain's junior borrows; "₹X not accounted for" → one wider event search per tap (24 h, week, month, 6 months), then "Ask Nila support" |
| C3 | Funds → Adjust | deposit her own nIN into the treasury (C10) or withdraw to her wallet (max = available to cash in); both sponsored by the node |
| Lending | Cash tab | open / on hold (overdue count), member contributions, in circulation (% of treasury), interest pending, available to cash in, union USDC (LP and senior) |
| C4 | Cash card | time left (live countdown of the earliest escrow), "After the deadline: Treasury covers it", Let an LP collect it (max = cash at hand less open Collects), the LP cards (Here → Scan code) |
| C6 on a Bring | Scan an LP code | the leader counts the LP's rupees before "I got ₹X" |
| LS | Settings (leader) | union address (copy), network, the signers note, voucher prices (machinery rates), LP section, wallet, version, reset account |

## Design gaps (interim, in the code)

- "Member contributions" (junior cash + borrows) and the union fund (that plus the senior pool) have no formula in
  the design.
- Interest pending: accrued and unpaid plus simple interest since the last accrual, per loan of the node's list;
  earnings pending: the union's cut of it as fund_core pays it (interest × (treasury + rainy fee bp) / 10,000).
- The reconcile chip compares the node list's outstanding cash principal with fund_core's junior `total_borrows`
  (the loans' part of the fund), not the whole fund total the board names; a gap the node's history cannot cover
  (`store_gap`) ends the search with "Ask Nila support".
- Hooks and keys: `useUnionCash` (`['stellar','unionCash']`) and `useUnionBook` (`['stellar','unionBook']`) stand for
  the design's useUnionFund / useCashAtHand / useUnionCropShares / useLoanEvents; `useTreasuryAdjust` is inline in C3.
- LP offers are cancelled from the C4 LP cards (two taps); the earlier "Let an LP collect it" screen (LetCollect) is
  replaced by the board's Cash card.
- No waiting cash-outs list (decided); LP names are short addresses; "Take a tour" not built.
- The cash tasks the design puts on L1 (crop share request, invest, repay, pay out, register a machine, scan an LP
  code) are listed under the board's cards until L1 exists.
- A9 (the leader's own USDC, send / swap) is not built: Stellar has no leader swap.
- LS: no signers list (no on-chain list), no contact-book union key (Q17, new encryption work), no "Propose new
  factors", seed prices, notifications or theme rows; the leader K1 is not built. Also left out: Representative,
  Union name and Change union, Farm name, Currency, Phone number (no source on Stellar yet). Network sits in the union
  card. The Reset confirm drops "and a new WhatsApp code" (login is SMS through Cognito, LOAN_RULES §5). The Voucher
  prices text is reworded to what is shown (machine rates only).
- C1: "Union fund" instead of the fund's name (not on-chain); "N shares overdue" has no "In Tasks ›" link (no L1);
  an extra "Union USDC" row (LP and senior USDC, R24) — the board has no place for it and A9 is not built.
- A1L's member slides (repay, invest, withdrawal) and the Tasks badge come with their own steps.
