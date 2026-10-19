# P9 — LPs and the anchor in the app (19 Oct)

Release plan §3b; LOAN_RULES §5 (12 Oct LP and anchor; 19 Oct: anchor in `nila-anchor`, K1 by hand, LPs hold
USDC). Contracts C5b + C9/C9b (fx_pool `quote`, the anchor's signed accept), oracle O14 (sponsored leader
calls, LP USDC trustline, expiry beat), anchor A0.

| Screen | Board | Where | Does |
|---|---|---|---|
| A11 | Settings "Become an LP" | Settings | only for a member with a title in the union and when the node names an anchor (`anchor_url`); "Check my identity" → K1, or "Cash offers" once she is an LP |
| K1 | IdCheck #lp (-needs, -checking, -accepted) | `#/idcheck` | SEP-10 (her Privy Stellar key signs the checked challenge), consent, SEP-12 fields and selfie; PROCESSING until the trust's operator decides; accepted → her USDC trustline (node-sponsored, checked before she signs) → A2 |
| A2 | Tasks "Cash offers" + #lp-bring/#lp-collect dialogs | `#/offers`, Tasks for an LP | open offers of the union with today's price (`fx_pool.quote`); Accept = SEP-38 firm quote → SEP-24 at the anchor (in the app) → the anchor signs → `fx_pool.accept(…, usdc, valid_until, sig)` fee-bumped |
| A7b | MemberAssetTractorScrolled #lp-bring/#lp-collect | after Accept, and from A2 | her code as QR, `nila:offer:<id>:<time>:<sig>` signed by her Stellar key (made again every 9 min), rows, then "USDC reached your wallet" / "The union took … USDC" when the offer is done |
| A1 | MemberAssets | Assets | a USDC row once she has the trustline (lp-open/2) |
| L11 #short | LeaderRedeem #short | Cash → Crop share request | the gap is shown and "Ask LPs to bring ₹gap" posts a Bring (48 h) |
| C4 | LeaderCashSettle #settle | Cash → Let an LP collect it | amount (Max = cash at hand, ≤ ₹10,000), LP fee, USDC into the union, posts a Collect (48 h); the union's open offers with Cancel |
| A1b #leader | MemberWalletQR #leader | Cash → Scan an LP code | scans her code, checks it is signed by the LP who accepted (≤ 10 min old), shows the offer, "I got ₹…" / "I gave ₹…" → `fx_pool.confirm` |

## Design gaps (interim, marked in the code)

- No names on the node: LPs as short addresses, "Union office" without the leader's name.
- K1: no "We send ₹1 to your bank account" (no penny-drop vendor yet), no acceptance date; the leader K1 is not built.
- A7b: the board's "Cancel" is "Done" and only goes back (an LP cannot cancel an accepted offer; it lapses at expiry).
- L11 #short: the board has the note only; the code adds "Ask LPs to bring ₹gap" (no board for posting) and says
  "the USDC of the union" (fx_pool pays a Bring from the union's pool, not from that crop share).
- C4 #settle: "Into the union treasury" shows rupees and USDC; the open offers are a plain list with Cancel (two taps)
  instead of the board's LP cards with "Scan code" / "Give cash" (the scan is Cash → Scan an LP code). Max is the
  cash at hand less open Collect offers.
- K1: a "Start" step (her SEP-10 signature) before the form; REJECTED and "Waiting for the network" have no board;
  "Get cash offers" instead of "Get offers from <union>".
- Tasks: the LP sees the "Cash offers" sheet (title "Cash offers"), not the full Tasks board.
- Hooks: the design's useKyc, useQuote, useAnchorTx, useAcceptOffer, useCashRequests, useScanCode, useSettleCash are not
  built as named; the screens use useLpStatus, useUnionOffers, useOfferQuote (fx_pool `quote`), useUsdcTrustline,
  useSep10Token and call the SEP client (`anchor/sep.js`) directly. Keys: `['stellar','lp'|'offers'|'quote']`,
  `['anchor','k1'|'sep24'|'info'|'code']`.
- The Bring scan confirms the rupees by the leader's word (no C6 photo count for an LP's cash).
- Offers run 48 h (fx_pool allows up to 7 days); A7 cash-out does not post a Bring when the office is short (lp-open/1).
- Tasks shows only the cash offers (the other A2 rows come later).
