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
accept it.", "Areas too small to plan", "Change my plan" + its text, the cash-cap line, "Not followed", and the tree-discount line "n points off the rate (x%) · trees registered" (the
board says "1% off when you repay"; LOAN_RULES §5 and the engine take points off the rate, so the board is the one
to correct). Board names
(Rosalie, Lakshmi) are replaced by "Your leader" / "She" / "Land N" (no names on the node). `useLandTitles`
(ids of her Polygon titles) stands for the spec's `useLandTitle`. Shares refused for "SOS more than a year
ahead" are made later; the gas top-up is once per plan, so a later mint may need POL again (open).

## P4c — field record, the map, the active plan (built)

- **`useFieldRecord`** (`src/plan/record.js`): the record hash from her land title (`getRecordHash`, free for the
  owner), the bytes from the node (`GET /gis/record-by-hash`) or an IPFS gateway, accepted only when sha256
  matches. **CP1** "Getting your field record · This can take up to an hour." until published (checks every
  minute); **CP2** "Your field record · <from> to <to> · n cultivations on m areas" → "Make my crop plan".
- **`AreaMap`** (`src/plan/AreaMap.jsx`): her areas from `record.zones[].geometry` on Esri World Imagery (Leaflet
  loaded at runtime, as the record viewer does; no new dependency), "Area n" by zone order, or the first
  season's crop and yield in the crop's colour once there is a plan. The land name is `meta.farm_name`.
- **CP13** (`src/plan/ActivePlan.jsx`): after the shares are made — season shown, "To do now", "Coming up"
  (plant, machine jobs, harvest, repay with amount), "Your plan" (plan year, season n of 3), "Update my plan" /
  "Plan next year" (→ change).
- Demo: the crop-plan check now starts at CP2 and ends on CP13 (nila-integrations E4).

**Design gaps (P4c):** CP2 has no "Main issues" (the oracle detects none yet, design Q20) and no "Add your trees
and water sources" row (A5 not built); CP13 has no "Done" chips or "Done · n" (no activity-done store, Q26), no
mismatch card (open-cp/3–4), no farm improvements (not in the record or plan) and no "Sell" steps (not in the
plan); the map is not tappable (CP10 area check, merge and split stay in the list); "Nothing this month.".
CP2 also lacks "(beta)" and the assisted block ("How your crop plan is made" · Visit your leader · Confirm it
with a scan · "Show my QR code"); CP13 lacks the assisted line "Ask your leader to update your plan.".

**Review fixes (P4c, nila-reviewer PASS WITH NOTES):** map labels are text nodes (crop names come from the
node, never as HTML); Leaflet 1.9.4 with Subresource Integrity and `crossOrigin`, and the map waits until the
script has really loaded; Esri attribution kept; "Area n" numbered the same way on CP10, the map and CP13;
CP1 shows one plain line on a failed fetch and keeps trying every minute; CP13 keeps the catalogue's crop
names, words machine jobs as the board does ("Weed maize"), adds "about n kg" to harvests and "Oct to Feb
finance" to repayments. **Deviation from the spec:** `useFieldRecord` is keyed by land and owner with a
10-minute staleTime (the spec: by hash, never stale), because it reads the hash itself. The record viewer
(live code) still loads Leaflet without SRI; left untouched here.

**Open:** "Update my plan" on an already-minted plan makes a new version; minting it again may meet
`FieldAlreadyClaimed` for the fields of the old tokens (until their harvest is reported) — to settle with the
member-review and re-plan rules (open-cp/5–8).

## Next

- A land picker for several titles; tappable areas on CP10; Done / mismatch / improvements once their data exists.
- **Demo:** `/plan` on in the demo stack (LLM off), a test record and a FoodToken with standing batches on the
  fork, so the whole plan → approve → mint runs on localhost.

## Last draw date and lapse (executive decision 25 Oct)

A crop share can be used from its attestation until its **last draw date** (`final_date`, the last day the crop may
still be sown in its season); there is no "from" date any more. Unused past it, the share lapses (anyone may lapse it on
Stellar) and the oracle burns its Polygon FoodToken, so its fields are free again.

- CP10/CP11 table: the column "Available from" is **"Use it by"** (the season's latest last draw date); the repay line
  says "each 21 days after its harvest" (no calendar date).
- CP13: "Receive cash" carries "use it by <date>"; "Repay ₹X" shows "after harvest" in place of a month, with
  "21 days after your harvest" under it.
- A1 / A4a: a share past its last date reads **"Not used · lapsed"**; A4a shows "Use it by" (or "Last day was") and
  "Too late for this cycle. Its fields are freed for a new plan."
- L11 and the leader's one scan: a share past its last date is refused with "Too late for this cycle".
- `readFoodTokens` reads each token's `FoodTokenFinal` entry beside its `FoodToken` entry (one batch).

DESIGN GAPs: none of these texts is on a board — "Use it by", "Last day was", "Not used · lapsed", "Too late for this
cycle…", "21 days after your harvest", "each 21 days after its harvest".

## Extend my plan (executive decision 25 Oct, "extend, not update")

A plan always runs one year ahead: the three cycles after the one under way. CP13's button is **"Extend my plan · N
seasons"** (N = the cycles missing; "Your plan covers the next three seasons" when none). It replaces "Update my plan" /
"Plan next year": an approved plan is never rerun (the node refuses /revise on it).

- Extend → POST /plan/{id}/extend → a plan job → the extension, a plan of its own with only the new cycles, runs through
  the usual screens: CP9 why → CP10/CP11 accept → CP12 waiting for the leader → L12 approve → the union mints.
- Active: CP13 and the crop share list read the land's chain (GET /plan/land/{id}/chain): the approved plan and its
  extensions as one plan (`mergedPlan`), "Season N of M" across them. `useMyShares` reads every plan's mint list.
- A share whose sowing is more than a year ahead is deferred by the node's mint list ("made later") and does not hold
  the active plan up; a leader makes it later from L12 once it is within a year.

DESIGN GAPs: no board for the extension (the plan screens are reused as they are), for "Extend my plan · N seasons",
"Your plan covers the next three seasons", "Planned <from> to <to>", or for telling the leader that a deferred crop share
can now be made.
