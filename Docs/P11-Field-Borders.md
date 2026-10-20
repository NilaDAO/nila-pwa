# P11 — field borders (L1–L4) and registration (R5–R10, R13, R14)

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
| R7 SendLocationOffline | "You are offline…", "Saved, not sent yet · N points", Save this location; sent once online (from R14) | point queue in `localStorage`, per account (`nila.border.points.<polygon address>`) |
| R8 SheetVerify | "Place a plastic sheet in one of your fields", Size / Leave it in place, I placed the sheet, I can do this later → confirm card (Cancel / Accept) | her choice kept on the phone (`nila.reg.<address>`) — see gaps |
| R9 RegUnion | "Select a union", today's one union with its leader, Save, Filter on my region, the footer text | union address from `/stellar/config`; sent with her points |
| R13 RegAssist | "Who uses the app?", I do it myself / My union leader helps me, Save | `localStorage` `nila.mode` (`self` / `assist`) |
| R10 RegNotify | "Your union would like to send you updates.", Enable / Skip → confirm card | `subscribeUser` (existing push code, `/utils/save-subscription`) |
| R14 RegDone | "Your union will mint your land title" / "Please wait for your union to finish." | sends the saved points with the union (`useSendFieldPoints` → `POST /border/points`), then `useMyBorderJob` → `GET /border/mine`; ends when her Polygon wallet holds a title (`useLegacyBalances`) → crop plan |

Routes: leader `#/tasks/border/<job>[/<field>]` (the job's state picks L2a / L2 / L4; a field opens L3).
Member (notes reg-recover): after the login (R1–R4, the existing Cognito login, not rebuilt), a member whose
Polygon wallet holds no land title gets the registration flow instead of the shell, without the tab bar:
R5–R7 → R8 → R9 → R13 → R10 → R14 (`src/register/Registration.jsx`; the step is kept per account in
`nila.reg.<address>`). An open or minted border job (from any phone) goes straight to R14; a failed one lets her
start again from R5. Once her title is on Polygon the shell opens on the crop plan (CP1).
Map: `src/border/BorderMap.jsx`, Leaflet via the AreaMap loader (`useLeaflet`), pan and zoom; dashed = to check,
accent = being checked, solid white = accepted; numbered pins on her (moved) points.

## Gaps

- No member names in the app: the farm name, else a short address, stands in (as on L5).
- The boards have no farm-name input; the title mint needs a name, so R6 asks for an optional one (DESIGN GAP).
- L2a polls every 5 s instead of the design's 30 s, and no NT2 push yet (O16 has none).
- Satellite tiles are not cached per member on the leader's phone (the browser cache only).
- L3's thumbnails draw the outline only, without the satellite tile behind it.
- F14 (keypad) is not built; R5–R7 are the app-side points only.
- R8: nothing detects the sheet on the Stellar path. The old app's `POST /detect_marker/` only reads the pending
  mint row (`db/signatures`), it detects no sheet; no endpoint was invented. Her choice ('placed' / 'later') stays on
  the phone; nothing is unavailable because of it yet.
- R9 lists today's one union: its address from `/stellar/config`, its name and leader from the app (the node has no
  union names); 'Filter on my region' does nothing with one union. The node accepts only today's union (O16).
- Points are sent at R14, not at "All my fields have a point" as the border spec has it (the job is queued on the
  last point), because the union is only chosen at R9.
- Recover (R1 'Recover wallet': ask only what is missing, skip R5–R8 and R14) is not built here; a wallet with a
  title goes straight to the shell.
- R14 shows "Your points are sent when you are online." while offline, and a failed job's error with "Send your
  field location again." / Try again — texts not on the board.
- Texts not on any board (DESIGN GAP):
  - L2a rows "Accepted" and "Left out".
  - L4 "Minting the land title. She gets a notification when it is ready.", "Land title minted.", "Name of the
    land" (when she gave no farm name), the mint error line.
  - A failed job: "{error} She sends her field location again. Back to tasks".
  - R6 "Points"; "Point N saved · accuracy ±X m"; "Name of your farm (optional)"; the GPS error lines; "Finding
    your location…".
  - R8 "Cancel" / "Accept" card: from the board; R10's card title and text: from the board.
