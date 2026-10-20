# The leader app is the member app, extended (P11, 20 Oct 2026)

Executive decision 20 Oct, and the design says the same (nila-design notes `leader-missing` and line 383 of
`page-member.md`): "The leader app is the member app, extended: no redesigned forms. Tabs: Crop plan (CP13 with the
leader tab bar), Assets (A1 with the leader tab bar = A1L) … L1: one list with To do, Your own and Start a task …
A leader is also a member … She cannot use assisted mode."

## Member features: could a leader reach them before this change?

| Member feature | Member app | Leader, before | Leader, now |
|---|---|---|---|
| Registration R5–R14 when she has no land title | Shell gate | **No** (gate was `!leader`) | Yes — same gate (new Privy user, no title); never with a title |
| Her land title row | A1 | Yes (A1L 'Yours') | Yes |
| Her crop plan CP1–CP13 | Crop plan tab | **No** — the tab showed the union's plans to approve (L12 list) | Yes — Crop plan tab = her own plan (CP13 #leader) |
| Her crop shares (A4) and taking one up (TakeUp) | A1 rows | **No** — `ShareRows` hidden for a leader | Yes — in A1L 'Yours' |
| Her nIN, cash-out (A2/A7) | A1 → cashout | Yes | Yes |
| Her investment (A3) | A1 → invested | Yes | Yes |
| Her vouchers (A8), her machine (A13) | A1 rows | Yes | Yes |
| LP: USDC row, cash offers (K1, A11) | A1, Settings, Tasks | Yes (A1 USDC row, LS 'I am also an LP') | Yes, also in L1 'Your own' |
| History A12 | header | Yes (her own) | Yes |
| Settings | A11 member rows | LS (has LP, reset account) | unchanged |
| Accept a loan request (L9 → N10, Scan) | Scan (assisted only) / scan route | route exists | unchanged |
| Her nIN move note (M2) | A1 note | **No** (move query off for leaders: a leader's chain stays Polygon until the union's old loans close, LOAN_RULES 16 Oct) | unchanged — by rule |

## What the leader app adds on top
Union rows and the cash / LP slides in A1L; Members (G1); Cash (C1–C6); Harvests; L1 To do (field borders, plans to
approve, crop share requests, settle cash, LPs here, paybacks) and Start a task; L2–L4, L5, L11, L12, L13; LS.

## Changes
- `src/shell/Shell.jsx`: Crop plan tab = `CropPlanFlow` for everyone; the union's plans to approve (L12) are a task
  view `approvals` (opened from L1 To do, no tab active); the registration gate applies to a leader too.
- `src/leader/hooks.js`: 'Approve crop plan' tasks open `approvals`.
- `src/shell/A1.jsx`: her crop share rows also in A1L 'Yours'.
- `src/leader/LeaderTasks.jsx`: L1 'Your own' section (her LP cash offers when she is an LP).

## Design gaps
- L1 'Your own' has no drawn rows beyond the principle; today only the LP cash offers fit. Her crop share and plan
  to-dos live on Crop plan / Assets as for a member.
- The L12 list has no tab of its own in the design (it is a task screen); `approvals` is a task route.
- No leader access to the member Scan tab (assisted only, notes line 570): a leader cannot accept her own loan
  request by scanning — she would need another leader's L9. Not decided in the design.
