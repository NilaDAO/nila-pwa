# Cash Counter Module — SOP

## 1. Purpose

The Cash Counter replaces the legacy Transfer Loan (`transfer.js`) and Bulk Deposit (`bulkInvest.js`) leader-only forms with a single camera-based bill scanning workflow. A union leader scans physical INR banknotes, the app tallies serial numbers and denominations, and then mints or burns nIN tokens on-chain with a Merkle-anchored serial list.

**Leader-only feature** — gated by `db.union?.leader === true` in `tabs.js`.

---

## 2. User Flow

```
[Leader opens Cash Counter]
        |
   DEPOSIT / PAYOUT toggle
        |
   [Tap to scan bills]
        |
   Camera opens (rear-facing, 1280x720)
        |
   Hold bill to guide rectangle
        |
   ┌──────────────────────────────────────────────┐
   │  COLOR DETECTION (instant, ~1ms)             │
   │  → denomination from bill color (HSL match)  │
   │                                              │
   │  OCR (Tesseract.js / or backend API)         │
   │  → serial number from bill text              │
   └──────────────────────────────────────────────┘
        |
   Vibration buzz (100ms) + green flash
   Bill auto-added to tally
        |
   [Next bill...] (repeat, max 20 per session)
        |
   [Done scanning]
        |
   Review tally (LiveCounter: count, total, denomination breakdown)
        |
   [Clear all] — optional reset
        |
   [Mint X nIN] or [Burn X nIN] button
        |
   Confirmation prompt → Merkle tree built → API call → on-chain tx
        |
   Session cleared → navigate to receipts
```

---

## 3. Architecture

### 3.1 File Map

| File | Role |
|------|------|
| `src/features/wallet/tabs.js` | Leader-only gate (`db.union?.leader`) |
| `src/components/Forms/forms.js` | Routes `txIndex === 'cashCounter'` to component |
| `src/components/Forms/CashCounter.js` | Orchestrator — mode toggle, wires scanner/counter/swap |
| `src/components/Forms/BillScanner.js` | Camera viewfinder, frame capture loop, scan UX |
| `src/components/Forms/LiveCounter.js` | Running tally, denomination breakdown, inventory warnings |
| `src/components/Forms/SwapButton.js` | Mint/Burn action button wrapping `ClaimButton` |
| `src/hooks/useBillOCR.js` | OCR engine — preprocessing + Tesseract.js (or future backend) |
| `src/hooks/useCashSession.js` | Bill state, dedup, persistence (AES-encrypted localStorage) |
| `src/hooks/useInventoryCheck.js` | PAYOUT-only: validates serials against backend inventory |
| `src/hooks/useCashSwap.js` | Merkle tree + API call + on-chain mintNin/redeemNin |
| `src/utils/cashCounterHelpers.js` | Pure functions: serial extraction, color detection, session crypto |

### 3.2 Data Flow

```
BillScanner
  └─ useBillOCR.recognizeBill(video, canvas)
       ├─ COLOR → detectDenominationFromColor() → denomination
       └─ OCR   → extractSerialFromText()       → serial
       └─ returns { serial, denomination }

CashCounter
  └─ handleBillScanned(serial, denomination)
       ├─ useCashSession.addBill() → persists to encrypted localStorage
       └─ useInventoryCheck.checkSerial() → POST /inventory/check (PAYOUT only)

SwapButton
  └─ useCashSwap.executeSwap(mode, bills, total)
       ├─ Builds Merkle tree from serials (keccak256)
       ├─ POST /swap/mint or /swap/burn
       └─ useFxPool().mintNin() or redeemNin()
```

---

## 4. Denomination Detection — Color-Based

INR Mahatma Gandhi New Series bills have distinct dominant colors. We sample the average HSL (Hue-Saturation-Lightness) of the camera crop and match against known profiles. This runs entirely client-side in ~1ms.

### 4.1 Color Profiles

| Denomination | Color | Hue Range | Saturation Range |
|-------------|-------|-----------|-----------------|
| ₹10 | Chocolate brown | 15–40° | 20–55% |
| ₹20 | Greenish yellow | 40–75° | 20–65% |
| ₹50 | Fluorescent blue | 190–240° | 20–75% |
| ₹100 | Lavender | 240–310° | 10–55% |
| ₹200 | Bright orange | 10–25° | 40–85% |
| ₹500 | Stone grey-green | 80–180° | 5–40% |
| ₹2000 | Magenta/pink | 310–360° (wraps to 0–10°) | 25–80% |

### 4.2 Known Risks

- **₹10 vs ₹200 overlap**: Both sit in hue 10–40°. Disambiguated by saturation (₹200 is more vivid, ₹10 is muted). Fragile under warm/yellow artificial lighting.
- **₹500 low saturation**: Stone grey can be confused with a grey surface or shadow.
- **Dirty/old bills**: Faded colors shift hue ranges. May need per-deployment calibration.
- **Combined with OCR**: If OCR text also finds a denomination number (e.g. "500"), it overrides color detection. Color is the fallback.

---

## 5. Serial Number OCR — Current State & Decision

### 5.1 What We Tried (Client-Side Tesseract.js)

| Attempt | Approach | Result |
|---------|----------|--------|
| 1 | Tesseract.js, full frame, PSM 6, grayscale+contrast | Garbage output. "Image too small to scale!!" errors. |
| 2 | Crop 80%x30%, scale to 800px, PSM 6 | Serial found in raw text (`7PR 898919`) but at 11% confidence, buried in noise (`GANDH`, `GOVERNOR`, etc). |
| 3 | Multi-strategy serial extraction from noisy text | Improved extraction from garbage, but hit rate still low. |
| 4 | Strip masking (left 35% + right 35%, exclude center Gandhi) | Less noise, but still unreliable. |
| 5 | Adaptive binarization + density-based graphic erasure | Better preprocessing, but fundamental Tesseract.js limitation remains. |

**Root cause**: Tesseract.js (WASM port) is not trained on INR currency fonts and struggles with real-world phone camera input (angle, motion blur, variable focus, bill wear). Desktop Tesseract with Python/OpenCV preprocessing achieves ~96% accuracy per research papers, but that full pipeline cannot run in a browser.

### 5.2 Options Going Forward

| Option | OCR | Denomination | Offline? | Accuracy | Latency | Complexity |
|--------|-----|-------------|----------|----------|---------|------------|
| **A. Color-only (no serial)** | None — generate UUID per bill | Color detection | Yes | Denomination: ~80%. Serial: N/A | Instant | Low |
| **B. Color + backend OCR** | POST image → Google Vision API / AWS Textract on server | Color (local) + OCR text (server) | No | >95% serial, >95% denom | 200–500ms | Medium |
| **C. Color + Tesseract (current)** | Tesseract.js in browser | Color (local) + OCR text (local) | Yes | ~20–40% serial, ~70% denom | 1000–2000ms | High |
| **D. Color + photo capture** | Snap still photo → server OCR | Color (local) + OCR (server) | No | >95% | 300–800ms | Medium |
| **E. Hybrid: color locally, queue photos for server OCR** | Color instant, serial async | Color (local) | Partial | Denom: instant. Serial: eventual | Instant UX, async serial | Medium |

### 5.3 Recommendation

**Option E (Hybrid)** gives the best UX for rural/offline deployment:

1. **Immediate**: Color detection → denomination → buzz → tally. User doesn't wait.
2. **Background**: Capture a JPEG of the bill, store locally in IndexedDB.
3. **When online**: POST queued images to backend → Google Vision / Textract → extract serial → update bill records.
4. **Merkle tree**: Built from serials when available, or from bill UUIDs as placeholder. Serials are patched into the tree when server OCR completes.

This means the leader can scan 20 bills in 30 seconds (denomination-only, fully offline). Serials get resolved async when connectivity is available. The on-chain Merkle root can be updated via a "finalize" step once all serials are confirmed.

**Tradeoff**: Serials are not immediately available. If serial-level dedup is critical at scan time, Option B or D is required. If dedup can happen server-side after sync, Option E wins.

### 5.4 If Staying Fully Local (Option A or C)

If the deployment cannot depend on internet at all:

- **Drop serial OCR entirely.** Generate a client-side bill ID (e.g. `bill_<timestamp>_<index>`).
- **Color for denomination** is sufficient for tallying.
- **Capture photos** and store locally for later audit.
- **On-chain Merkle tree** uses bill IDs, not serial numbers.
- **Accept** that this prevents serial-level dedup and anti-counterfeiting until backend sync.

---

## 6. Session Management

- **Encrypted persistence**: `crypto-js/aes` — bills stored in localStorage, keyed by leader wallet address + session timestamp.
- **Max 20 bills** per session (SOP limit). Silently rejects bill #21.
- **30-minute auto-expiry**. Checked every 60 seconds.
- **Dedup**: Same serial (or bill ID) cannot be added twice in one session.
- **Clear all**: Prompts confirmation, wipes localStorage + sessionStorage.

---

## 7. On-Chain Swap

### 7.1 DEPOSIT (Mint nIN)

1. Leader scans farmer's cash bills
2. Builds Merkle tree: `hash = keccak256(serial)` for each bill
3. POST `/swap/mint` → `{ unionId, recipientAddress, amount, serials, merkleRoot }`
4. Calls `useFxPool().mintNin(amount)`
5. On success: clear session → navigate to receipts

### 7.2 PAYOUT (Burn nIN)

1. Leader scans bills being paid out
2. Each bill checked against inventory (POST `/inventory/check`)
3. Bills marked `known`, `unknown`, or `pending`
4. Builds Merkle tree, POST `/swap/burn` → `{ unionId, amount, serials, merkleRoot, unknownSerials }`
5. Calls `useFxPool().redeemNin(amount)`
6. On success: clear session → navigate to receipts

---

## 8. Preprocessing Pipeline (Current Tesseract Path)

If keeping Tesseract.js (Option C), the current pipeline is:

```
Video frame (720x1280 typical on phone)
    │
    ▼
Crop guide region (center 80% width × 20% height)
    │
    ▼
COLOR DETECTION on raw pixels → denomination (HSL match)
    │
    ▼
Split into LEFT 35% strip + RIGHT 35% strip
(excludes center 30%: Gandhi portrait, Ashoka pillar, RBI seal)
    │
    ▼
Scale each strip to 480px width
    │
    ▼
Join strips side-by-side → single canvas
    │
    ▼
BINARIZE: adaptive threshold (integral image + Sauvola-like local mean × 0.85)
→ pure black text on white background
    │
    ▼
ERASE DENSE BLOCKS: scan 24×24px blocks, white-out any with >30% black pixels
→ removes remaining portraits, seals, microprint patterns
    │
    ▼
TESSERACT.JS: PSM 7 (single text line), whitelist [0-9A-Z ]
    │
    ▼
extractSerialFromText(): 3-strategy pattern search
    │
    ▼
{ serial, denomination }
```

### 8.1 Why This Pipeline Exists

| Step | Problem it solves |
|------|------------------|
| Strip masking | Gandhi's face and decorative patterns produce >50% of OCR garbage |
| Binarization | Tesseract needs hard B&W, not soft grayscale. Camera images have gradients, shadows, reflections |
| Dense block erasure | After binarization, seals/patterns become dense black clusters. Text is sparse. Density thresholding distinguishes them |
| PSM 7 | Serial is a single line of text. Block mode (PSM 6) tries to find paragraphs and gets confused |
| Whitelist | INR serials are alphanumeric. Blocking other characters reduces false matches |
| Multi-strategy extraction | OCR output is noisy. The serial may be split across tokens, concatenated with garbage, or partially misread. Three strategies cover common failure modes |

### 8.2 Why It Still Doesn't Work Well

1. **Tesseract.js WASM is not trained on INR currency fonts.** The LSTM model is trained on general English text, not the specific font used on Indian banknotes.
2. **Phone camera input is inherently noisy**: motion blur, auto-focus hunting, angled capture, variable lighting.
3. **Bill texture**: Security features (color-shifting ink, microprint, watermark mesh) create texture noise that survives binarization.
4. **Speed**: Even with a small canvas (480px strips), Tesseract.js takes 1000–2000ms per frame. Users expect <200ms response.
5. **No text localization**: We use geometric crop regions assuming bill orientation. If the user holds the bill at an angle, the serial may be outside the crop.

---

## 9. Known Issues & TODOs

| Priority | Issue | Location | Status |
|----------|-------|----------|--------|
| P0 | Serial OCR accuracy too low (~20-40%) | `useBillOCR.js` | **Blocked** — needs architecture decision (see Section 5) |
| P1 | Debug overlay still in production code | `BillScanner.js:196` | Remove before release |
| P1 | Color profile calibration needed with real bills | `cashCounterHelpers.js:94-104` | Needs field testing |
| P2 | No timeout on Tesseract recognize call | `useBillOCR.js` | Add AbortController or manual timeout |
| P2 | No timeout on API calls | `useInventoryCheck.js`, `useCashSwap.js` | Add axios timeout |
| P2 | MAX_BILLS (20) exceeded silently | `useCashSession.js` | Show user warning |
| P3 | No retry logic for inventory checks | `useInventoryCheck.js` | Queue for retry on reconnect |
| P3 | Partial swap failure handling | `useCashSwap.js` | If API succeeds but on-chain fails, session is in limbo |

---

## 10. Dependencies

| Package | Purpose | Loaded |
|---------|---------|--------|
| `tesseract.js` | Browser OCR engine (WASM) | Lazy — dynamic import, webpack chunk `tesseract` (4.79KB loader) |
| `merkletreejs` | Merkle tree for serial anchoring | Lazy — dynamic import, webpack chunk `merkle` (94B loader) |
| `keccak256` | Hash function for Merkle leaves | Lazy — loaded with merkletreejs |
| `crypto-js/aes` | Session encryption | Eager — imported in cashCounterHelpers |
| `framer-motion` | LiveCounter animations | Eager — already used elsewhere in app |
| `axios` | API calls | Eager — already used elsewhere in app |

---

## 11. Configuration Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `FRAME_INTERVAL_MS` | 1200 | BillScanner.js | ms between OCR frames |
| `FLASH_DURATION_MS` | 900 | BillScanner.js | Green flash display time |
| `STRIP_WIDTH` | 480 | useBillOCR.js | Target px width for OCR strips |
| `DENSITY_BLOCK` | 24 | useBillOCR.js | Block size for density check |
| `DENSITY_THRESHOLD` | 0.3 | useBillOCR.js | Max black pixel ratio before erasure |
| `OCR_TARGET_WIDTH` | 640 | (removed, replaced by STRIP_WIDTH) | — |
| `MAX_BILLS` | 20 | useCashSession.js | Bills per session |
| `EXPIRY_MS` | 1,800,000 | useCashSession.js | Session auto-expire (30 min) |
| `DENOMINATIONS` | [10,20,50,100,200,500,2000] | cashCounterHelpers.js | Valid INR denominations |

---

## 12. Testing Checklist

- [ ] Leader-only gate: non-leader cannot see Cash Counter tab
- [ ] Camera permission prompt appears on first scan
- [ ] Camera denied state shows helpful message
- [ ] Color detection: test with each denomination (₹10, ₹20, ₹50, ₹100, ₹200, ₹500)
- [ ] Vibration feedback on successful scan
- [ ] Dedup: same bill scanned twice is rejected
- [ ] Max 20 bills enforced
- [ ] Clear all prompts confirmation and resets
- [ ] Mode toggle disabled while scanning
- [ ] Session persists across page refresh (within 30 min)
- [ ] Session expires after 30 min idle
- [ ] DEPOSIT: mint flow completes end-to-end
- [ ] PAYOUT: burn flow completes end-to-end
- [ ] PAYOUT: inventory check marks bills as known/unknown/pending
- [ ] Offline: color detection works without internet
- [ ] Offline: session persistence works without internet
