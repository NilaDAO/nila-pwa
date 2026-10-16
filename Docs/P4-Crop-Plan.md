# P4 — Crop plan in the app (Nov 7 release plan §4, PWA lane)

Branch `t1/pwa/P4` (from `t1/pwa/P1`). Behind the Privy flag like P0–P3; the live build is unchanged.

## Decisions (executive, 16 Oct; LOAN_RULES §5 "Crop plan approval, mint and gas")

- **She accepts, a leader approves (L12), she mints** every season's FoodToken with her own Polygon key (N1).
- **The node tops up her POL** for those mints, once per approved plan (oracle O11 `POST /plan/{id}/gas`).
- **CP9 shows the engine's one explanation text**; the 4-goal layout is a design gap.

## P4a — intake to accept (built)

The shell's **Crop plan** tab opens `src/plan/CropPlanFlow.jsx`:
CP3 intro → CP4 crops (from `GET /plan/catalogue`) → CP5 land role → CP6 cows → CP7 hard months →
`POST /plan/jobs` → CP8 making (polls the job every 10 s) → CP9 why → CP10 plan (areas, finance by season,
tree-discount rate, repay line) → CP11 terms (cash-flow bars, conditions, "I accept" = every area accepted on
the node) → CP12 waiting for the leader / approved / denied ("Make a new plan").

| File | Does |
|---|---|
| `src/plan/api.js` | `/plan` client; every request signed with her Stellar wallet (SEP-53 over `nila-plan\n<METHOD> <path>\n<ts>\n<sha256(body)>`, through Privy's raw-hash signer) |
| `src/plan/hooks.js` | `useLandTitles` (Polygon title ids), `useCropCatalogue`, `useCropPlan`, `usePlanJob`, `useSubmitIntake`, `useAcceptPlan`; keys `qk.oracle.*` |
| `src/plan/ui.jsx`, `CropPlanFlow.jsx` | the sheet layout and the screens |

## Design gaps (P4a)

- No map yet: a header band with the land name (the area map comes in P4c, needs the record geometry).
- CP4: catalogue crops only; no "In your record" or "Suggested" rows (no record/suggestion hooks on the node).
- CP5/CP6 answers mapped to the engine's `land_role` (main / several / food) and `cows` (0, 2, 4, 6).
- CP9: one text (`plan.explain.text`), not 4 goals.
- CP10: areas are checked in a list, not on the map; "Season 1 · <month>" header only.
- The plan uses her first Polygon land title; several titles need a picker.

## P4b — leader approval and the mint (built)

- **L12** (`src/plan/LeaderApprove.jsx`): the leader's Crop plan tab lists the plans waiting for approval
  (`GET /plan/approvals/pending`), opens one (seasons: crops, cash, vouchers, repay; totals) and approves or denies
  it (reasons "Crops do not fit her land", "Amounts too high", "Wrong areas", "Other", optional note).
- **CP12 mint** (`src/plan/mint.js`, `useMintCropShares`): once approved, "Make my crop shares" → the node tops
  up her POL (`POST /plan/{id}/gas`) → `joinBatch` where she is not a member → `mintForBatchMember` for every
  entry of `GET /plan/{id}/mint` with her own key (`signEvmTx`, broadcast to Polygon), skipping tokens she
  already holds; "Creating your crop shares n of N"; failed → "Your crop shares were not made … Try again".
- FoodToken ABI refreshed from nila-evm (P1: `fieldBusyUntil`, `sellFromBatch`, `syncFieldClaims`):
  `src/components/ABI/FoodTokenP1.json`.

Design gaps (P4b): the pending list replaces LeaderPickMember for approvals; no member names (the node has none:
"Land N"); a leader's own plan is not reachable from the leader's Crop plan tab yet; "Make my crop shares" is a
button (the board shows CP12 busy directly); L12 no longer says "sign the mint on this phone" (N1).

## Next

- **P4c:** CP1/CP2 (field record), CP13 (active plan), the map; a land picker for several titles.
- **Demo:** `/plan` on in the demo stack (LLM off), a test record and a FoodToken with standing batches on the
  fork, so the whole plan → approve → mint runs on localhost.
