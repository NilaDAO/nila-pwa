# P11 — field borders (L1–L4, R5–R7, R14)

Executive decision 20 Oct (LOAN_RULES §5 "Field borders (L2a–L4)"). The node's border job is O16
(`nila-sensing/docs/stellar/O16.md`); every call is signed with the caller's Stellar wallet, like /plan.

## Boards built

| Board | Screen | Data |
|---|---|---|
| L1 LeaderBorders | Tasks → To do: "Check field borders · {name} · N fields" (urgent dot when ready) | `useBorderJobs` → `GET /border/jobs` |
| L2a LeaderBorderFetch | "Finding field borders" / "Drawing field N again" (`#retry-fN`), rows Drawing / Drawing again / Waiting | `useBorderJob` (polls 5 s while drawing) |
| L2 LeaderBorderPlan | "{N} fields · best match", "Tap a field to check it", rows with acres, Mint land title off | job `plan`, `fields[].shapes` |
| L3 LeaderBorderCheck | "Field N", thumbnails (Best, then "x.xx ac"), Area, "2 points in this field" (from `holds`), "Field C changes too" (from preview), None fit, Accept | `useBorderDecision` → `/decide`, `/preview` |
| L4 LeaderBorderDone | "{N} fields · all accepted", "Total x.xx acres", rows tappable back to L3, Mint land title, then minting / minted | `useMintLandTitle` → `/mint`; job `mint.status` |
| R5 / R6 SendLocation | "Send your field location", "Walk to your first field" / "Walk to the center of your next field", Send my location / Send another location, All my fields have a point | `navigator.geolocation` (accuracy shown); `useSendFieldPoints` → `POST /border/points` |
| R7 SendLocationOffline | "You are offline…", "Saved, not sent yet · N points", Save this location; sends once online | point queue in `localStorage` (`nila.border.points`) |
| R14 RegDone | "Your union will mint your land title" / "Please wait for your union to finish."; "Your land title is ready" once minted | `useMyBorderJob` → `GET /border/mine` |

Routes: leader `#/tasks/border/<job>[/<field>]` (the job's state picks L2a / L2 / L4; a field opens L3).
Member: A1's Land title row opens `#/land` when she holds no title.
Map: `src/border/BorderMap.jsx`, Leaflet via the AreaMap loader (`useLeaflet`), pan and zoom; dashed = to check,
accent = being checked, solid white = accepted; numbered pins on her (moved) points.

## Gaps

- No member names in the app: the farm name, else a short address, stands in (as on L5).
- The boards have no farm-name input; the title mint needs a name, so R6 asks for an optional one (DESIGN GAP).
- L2a polls every 5 s instead of the design's 30 s, and no NT2 push yet (O16 has none).
- Satellite tiles are not cached per member on the leader's phone (the browser cache only).
- L3's thumbnails draw the outline only, without the satellite tile behind it.
- F14 (keypad) is not built; R5–R7 are the app-side points only.
