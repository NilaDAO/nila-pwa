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

## Review fixes (nila-reviewer FAIL, 16 Oct)

- **Mint:** the gas tx hash is normalised to `0x…` and its wait can never fail the run; one share that reverts
  (a field still held, a closed batch) no longer stops the others: it is listed with a plain reason and "Try
  again" retries only what is missing; FoodToken reverts and the node's refusals in plain words (texts as in
  `hooks/useTx.ts`, copied so the live file is untouched); an approved plan whose shares are on her wallet
  opens on "made".
- **Shown now:** the part of the input cost above the ₹10,000 cash cap (CP10 and L12, coral), the tree-discount
  row (CP10), the plan year (L12), refused member changes ("Not followed …").
- **Her changes:** CP10 "Change my plan" → a note (≤1000) → `POST /plan/{id}/revise` → a new version (crop
  changes on the map come with P4c).
- After accept the plan is read-only ("See my plan" no longer offers "Accept the plan").
- Named hooks: `usePendingApprovals`, `useApprovePlan`, `useRevisePlan` (keys in `qkPlan`).
- Oracle O11: a leader who accepted cannot approve and she must have accepted herself; gas hash `0x`, claim freed
  on a failed send, one lock; no RPC URL in errors.

## More design gaps (not on any board)

"Your plan is approved", "Make your crop shares now. Nila pays the network fee.", "Make my crop shares", "Your
crop shares are made", "n of N crop shares made", "No land title yet" + "Your crop plan starts when your land
title is ready.", "Waiting for your approval", "No plans are waiting.", "Accept the plan", "Check each area and
accept it.", "Areas too small to plan", "Change my plan" + its text, the cash-cap line, "Not followed". Board names
(Rosalie, Lakshmi) are replaced by "Your leader" / "She" / "Land N" (no names on the node). `useLandTitles`
(ids of her Polygon titles) stands for the spec's `useLandTitle`. Shares refused for "SOS more than a year
ahead" are made later; the gas top-up is once per plan, so a later mint may need POL again (open).

## Next

- **P4c:** CP1/CP2 (field record), CP13 (active plan), the map; a land picker for several titles.
- **Demo:** `/plan` on in the demo stack (LLM off), a test record and a FoodToken with standing batches on the
  fork, so the whole plan → approve → mint runs on localhost.
