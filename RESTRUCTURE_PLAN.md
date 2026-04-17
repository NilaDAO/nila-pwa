# Nila PWA — Complete Structural Rebuild Plan

**Goal**: Rebuild the exact same app (identical UI/UX) with a radically simpler React architecture.
**Scope**: Structure, state management, file organization, hook design. NO design/styling/feature changes.

---

## Executive Summary

The current codebase has ~25K lines across 138 files. After 5 rounds of iterative analysis, the core problems are:

1. **DataContext is a god object** — 15 useState values, imported by 39 files, duplicates what React Query already caches
2. **4 context providers that shouldn't exist** — Navigation state should be URL routing, transaction state should be a store, view mode should be derived/URL params
3. **37 custom hooks where ~12 would suffice** — Most are just React Query wrappers with business logic mixed in
4. **Monolithic files** — UnionReserve.js (1072 LOC), useLoadFunds.ts (944 LOC), CashOutForm.js (745 LOC), useWallet.ts (736 LOC), buttons.js (715 LOC)
5. **No separation between data fetching, business logic, and presentation**

The rebuild eliminates all 5 React contexts, replaces them with React Router + Zustand + React Query's own cache, splits monolithic files into focused modules, and introduces a clean layered architecture.

**Estimated reduction**: ~25K LOC → ~16-18K LOC (30-35% reduction) with identical functionality.

---

## PART 1: Kill All 5 Context Providers

This is the single highest-impact change. Currently the app nests 8 levels of providers in Layout.js. After the rebuild: just QueryClientProvider + Router.

### 1A. Eliminate DataContext (currently 15 useState values, 39 files import it)

**Current state** (NavigationContext.js lines 83-127):
```js
// DataProvider holds:
tokenData, grantData, unionFunds, debts, selected, db, stats,
selectedAsset, txIndex, txdetails, fieldActivity, keyMalformed
```

**The problem**: Every one of these is ALREADY fetched by a React Query hook (useErc20Balances, useGrantInfo, useUnionGenericFunds, etc.) and then COPIED into DataContext via setState in App.js. This is pure duplication — React Query already caches and shares this data.

**The fix**: Delete DataContext entirely. Each piece of data gets its own home:

| Current DataContext field | New location | Why |
|---|---|---|
| `tokenData` | React Query cache via `useErc20Balances()` | Already fetched by RQ, just use it directly |
| `grantData` | React Query cache via `useGrantInfo()` | Same — remove the copy step |
| `unionFunds` | React Query cache via `useUnionGenericFunds()` | Same |
| `debts` | React Query cache via `useActiveLoans()` | Same |
| `db` | New Zustand `authStore` | Loaded once from IndexedDB at boot, rarely changes |
| `stats` | React Query cache (derive from tokenData) | Computed value, not independent state |
| `fieldActivity` | React Query cache via `useActivityMapping()` | Same pattern |
| `selected` | Zustand `uiStore` | UI selection state |
| `selectedAsset` | Zustand `uiStore` or URL param `?asset=X` | UI selection state |
| `txIndex`, `txdetails` | Zustand `uiStore` | UI state |
| `keyMalformed` | Zustand `authStore` | Auth state |

**Migration for every file that imports `useDataContext()`:**
Replace `const { tokenData } = useDataContext()` with `const { data: tokenData } = useErc20Balances(address)`.
React Query deduplicates — 20 components calling the same query = 1 network request.

### 1B. Eliminate NavContext → Use React Router

**Current state**: `ix` is a number (0-6) stored in NavContext. Components check `ix === PAGES.ASSETS` etc.

**The fix**: Use React Router URL paths. The app already has Router in Layout.js but only uses it for `/diag`.

```
Current ix value → New URL route
PAGES.ASSETS (0) → /assets
PAGES.LENDING (1) → /lending
PAGES.DEBT (2) → /debts
PAGES.MAP (3) → /map
PAGES.SETTINGS (4) → /settings
PAGES.TXNS (6) → /transactions
(forms) → /forms/:formType
(union reserve) → /reserve
(null - home) → /
```

Replace all `setIx(PAGES.ASSETS)` calls with `navigate('/assets')`.
Replace all `ix === PAGES.ASSETS` checks with route matching or `useLocation()`.
`cardIx` and `prevIx` move to Zustand `uiStore` (they control card carousel position, not page routing).

### 1C. Eliminate ViewModeContext → Zustand uiStore

**Current state**: `cardView` ('default'|'mapview'|'transactionview'), `tokenview`, `navRef`

**The fix**: All of these are UI state. Move to the same Zustand `uiStore`:
```ts
// stores/uiStore.ts
interface UIState {
  cardView: 'default' | 'mapview' | 'transactionview';
  tokenview: any;
  assetTab: boolean;
  clusterFocus: any;
  cardIx: number | null;
  selectedAsset: any;
  selected: boolean;
  txIndex: number;
  txdetails: any;
}
```

### 1D. Eliminate TxContext → Zustand txStore

**Current state**: 6 useState values + 1 ref for transaction lifecycle.

**The fix**: Perfect fit for a Zustand store with actions:
```ts
// stores/txStore.ts
interface TxState {
  stage: false | 'approval' | 'approved' | 'pending' | 'success' | 'error';
  message?: string;
  hash?: string;
  url?: string;
  submittedAt?: number;
  // Actions
  startTx: (message: string) => void;
  approveTx: () => void;
  submitTx: (hash: string, url: string) => void;
  completeTx: () => void;
  failTx: (message: string) => void;
  resetTx: () => void;
}
```

The current useEffect that clears fields when stage goes to false becomes a `resetTx()` action. No provider needed — any component imports `useTxStore()` directly.

### 1E. Eliminate FieldRegContext → Zustand fieldRegStore

**Current state** (FieldRegContext.js): Single object with 16 nested properties, updated via `updateFieldReg()`.

**The fix**: Zustand store with named actions instead of generic updater:
```ts
// stores/fieldRegStore.ts
interface FieldRegState {
  positions: any[];
  polygons: any[];
  results: any;
  property: any;
  // ... (keep all 16 fields)
  // Named actions instead of generic updateFieldReg()
  addPosition: (pos: any) => void;
  setPolygons: (polys: any[]) => void;
  setVerificationMode: (mode: boolean) => void;
  resetFieldReg: () => void;
  // etc.
}
```

### 1F. New Layout.js (after all context elimination)

```tsx
// FROM: 8 levels of nesting
<QueryClientProvider>
  <Router>
    <DataProvider>
      <TxProvider>
        <NavigationProvider>
          <ViewModeProvider>
            <ErrorBoundary>
              <Routes>

// TO: 3 levels of nesting
<QueryClientProvider>
  <Router>
    <ErrorBoundary>
      <Routes>
```

Zustand stores need NO providers. React Query needs its provider. Router needs its provider. That's it.

---

## PART 2: Restructure the Hook Layer

### Current Problem

37 custom hooks, many doing 3 jobs at once (data fetching + business logic + state management). The worst offenders:

- `useLoadFunds.ts` (944 LOC): Types + multicall logic + query hooks + mutation hooks + utility functions
- `useWallet.ts` (736 LOC): Provider creation + contract factories + 15 transaction functions in useFxPool
- `useFilterTasks.js` (515 LOC): Consumes 20+ hooks, builds task list in 285-line queryFn
- `useLoadETH.ts` (507 LOC): Crop lookup tables + multicall + type definitions

### New Architecture: queries/ + mutations/ + lib/ + hooks/

**Principle**: Separate what you READ (queries) from what you WRITE (mutations) from pure logic (lib) from React glue (hooks).

#### 2A. Create `src/queries/` — React Query hook wrappers (read-only)

Each file exports thin hooks that call `useQuery` with a query function:

```
src/queries/
├── tokens.ts        # useTokenBalances(address) — replaces useErc20Balances + useLoadETH
├── grants.ts        # useGrants(address) — replaces useGrantInfo  
├── funds.ts         # useUnionFunds(unionAddr), useFundData(unionAddr, funds) — replaces useLoadFundsData + useUnionGenericFunds
├── loans.ts         # useActiveLoans(unionAddr), useMemberLoans(addr) — consolidates useActiveLoans + useMemberLoans
├── land.ts          # useLandTitles(address), useCerts(address) — replaces useLandTitle + useLoadCerts
├── cash.ts          # useCashOffers(offerId), useRedeemOrders(), useOpenOffers(addr) — replaces useCashOffer + useRedeemOrder
├── reserve.ts       # useUnionReserve(addr) — replaces useUnionCashReserve
├── contacts.ts      # useContacts(unionAddr) — replaces useContactBook (read part)
├── lp.ts            # useLPProfile(addr), useLPCashOnHand(union) — consolidates
└── summary.ts       # useSummary(addr) — replaces useSummary
```

**Key rule**: Query files contain NO business logic. Just `useQuery(key, fetchFn, options)`. The `fetchFn` calls pure functions from `lib/`.

#### 2B. Create `src/mutations/` — React Query mutation wrappers (write operations)

Each file exports hooks that call `useMutation`:

```
src/mutations/
├── swap.ts          # useMintNin(), useRedeemNin(), useQuoteRedeem()
├── escrow.ts        # useCashScanMint(), useAcceptLoan(), useRedeemFarmerNin()
├── offers.ts        # usePostCashOffer(), useLpFillRedeemOrder(), useConfirmDelivery()
├── orders.ts        # usePostRedeemOrder(), useCommitCashRequest(), useCancelRedeemOrder()
├── invest.ts        # useInvestGeneric(), useWithdrawGeneric(), useClaimInterest()
├── land.ts          # useMintLandTitle()
├── grants.ts        # useCollectGrant()
├── tokens.ts        # useSendTokens()
├── contacts.ts      # useAddContact(), useRemoveContact() — replaces write side of useContactBook
└── loans.ts         # useAcceptLoan(), useCancelLoan(), useSettleEscrows()
```

Each mutation hook: (1) calls the transaction function from `lib/`, (2) updates txStore, (3) invalidates relevant query keys.

#### 2C. Create `src/lib/` — Pure functions (no React, no hooks)

This is where ALL business logic lives. Zero React imports. Fully testable.

```
src/lib/
├── wallet.ts        # createProvider(rpcUrl), createWallet(key, provider) — pure factory functions
├── contracts.ts     # getContract(name, signerOrProvider) — central contract registry
├── multicall.ts     # batchCall(provider, calls[]) — generic multicall utility
├── permits.ts       # signPermit(wallet, domain, types, value) — extracted from useLoadFunds
├── db.ts            # openDb(), getStore(), putStore() — IndexedDB wrapper (keep existing)
├── cognito.ts       # updateUserChain(), getJwt() — auth helpers (keep existing)
├── crypto.ts        # decryptKey(encrypted, password) — extracted from useDecryptKey
├── format.ts        # formatInr(value), formatToken(bigint, decimals), tsLabel(ts)
├── prices.ts        # getPriceForToken(sym, tokenData) — eliminates repeated lookup pattern
├── analytics.ts     # totalFunds(), weightedRates() — extracted from FundsAnalytics.ts
├── tasks.ts         # buildTaskList(data) — extracted from useFilterTasks 285-line queryFn
├── billDetection.ts # (keep existing billEdgeDetection.js)
└── colors.ts        # cropColor(), phenoColor() — keep existing
```

**Key insight**: `useWallet.ts` currently has `useFxPool()` exporting 15 callbacks. These become pure functions in `lib/contracts.ts` that take `(wallet, provider, addresses)` as arguments. The mutation hooks in `mutations/` call these pure functions. This alone eliminates 736 lines of hook code and replaces it with ~300 lines of pure functions + ~200 lines of thin mutation hooks.

#### 2D. Slim down `src/hooks/` — Only for React-specific logic

After extracting queries, mutations, and lib, hooks/ shrinks to things that genuinely need React lifecycle:

```
src/hooks/
├── useBootstrap.ts      # Extracted from App.js — PWA install detection, IndexedDB init, network check
├── useTasks.ts          # Thin wrapper: calls buildTaskList() from lib/tasks.ts via useQuery
├── useCashSession.ts    # Keep — manages localStorage-backed scanning session with auto-expiry
├── usePosition.ts       # Keep — wraps navigator.geolocation.watchPosition with lifecycle cleanup
├── useTouch.ts          # Keep — touch/swipe gesture handlers tied to DOM events
├── usePolling.ts        # Simplified generic polling hook (decouple from FieldRegContext)
└── useAppHeight.ts      # Extracted from Layout.js — window resize handler for --app-height
```

**37 hooks → 7 hooks + 10 query files + 10 mutation files + 13 lib files**

The total file count is similar, but each file has ONE responsibility. Average file size drops from ~200 LOC to ~80 LOC.

---

## PART 3: Restructure Components & Pages

### 3A. New file structure

```
src/
├── app/
│   ├── App.tsx              # Slim boot shell — uses useBootstrap() hook
│   ├── Layout.tsx           # QueryClientProvider + Router + ErrorBoundary (3 levels, not 8)
│   ├── routes.tsx           # All route definitions in one place
│   └── entry.tsx            # index.js — PWA install capture
│
├── pages/                   # One file per route (replaces features/)
│   ├── HomePage.tsx         # Card carousel (extracted from Wallet.js)
│   ├── AssetsPage.tsx       # Merges features/assets/assets.js + assetsList.js
│   ├── LendingPage.tsx      # Merges features/lending/investments.js + investmentsList.js
│   ├── DebtsPage.tsx        # features/lending/debtsActive.js + debtsListed.js
│   ├── MapPage/
│   │   ├── MapPage.tsx
│   │   ├── FieldRegistration.tsx   # Merges FieldRegController + fieldRegMaps + fieldRegNav + fieldRegCards
│   │   └── FieldView.tsx           # Merges staticMaps + staticNav + staticCards
│   ├── SettingsPage.tsx
│   ├── ReservePage/
│   │   ├── ReservePage.tsx         # Layout shell (replaces 1072-line UnionReserve.js)
│   │   ├── TreasuryPanel.tsx       # Treasury summary section (~200 LOC)
│   │   ├── LPRequestsPanel.tsx     # Pending deliveries + open offers (~200 LOC)
│   │   └── ActiveLoansPanel.tsx    # Loan list + sync (~200 LOC)
│   ├── RegisterPage.tsx            # features/registration/registerRecover.js
│   └── DiagPage.tsx                # features/registration/pwa_diagnosis.jsx
│
├── components/
│   ├── cards/
│   │   ├── CardShell.tsx           # Shared animated card wrapper with shrink logic
│   │   ├── AssetCard.tsx           # Extracted from Cards.js
│   │   ├── DebtCard.tsx
│   │   ├── InvestmentCard.tsx
│   │   ├── MapCard.tsx
│   │   ├── CultivationCard.tsx
│   │   └── CashLiquidityCard.tsx
│   │
│   ├── forms/
│   │   ├── CashOutForm/            # Split 745 LOC into step components
│   │   │   ├── CashOutForm.tsx     # Step router + state machine
│   │   │   ├── ScanQrStep.tsx
│   │   │   ├── ReviewLoanStep.tsx
│   │   │   ├── ScanBillsStep.tsx
│   │   │   └── ConfirmStep.tsx
│   │   ├── CashCounter.tsx
│   │   ├── BillScanner.tsx
│   │   ├── BulkBillScanner.tsx
│   │   ├── BillList.tsx
│   │   ├── ContributeForm.tsx
│   │   ├── TransferForm.tsx
│   │   ├── WithdrawalForm.tsx
│   │   ├── RedeemForm.tsx
│   │   ├── SendReceiveAssets.tsx
│   │   ├── FarmNameForm.tsx
│   │   ├── MemberUnionForm.tsx
│   │   └── BulkInvestForm.tsx
│   │
│   ├── ui/
│   │   ├── Button.tsx              # Single button with variants (replaces 715-line buttons.js)
│   │   ├── PhoneInput.tsx          # Extracted from buttons.js MobilePhoneInput
│   │   ├── PinInput.tsx            # Extracted from buttons.js PinCodeInput
│   │   ├── QrScanner.tsx           # Extracted from components/UI/qrScan.js
│   │   ├── QrCode.tsx
│   │   ├── Spinner.tsx
│   │   ├── DragSheet.tsx
│   │   ├── SwipeCard.tsx
│   │   ├── ContactPicker.tsx
│   │   ├── NameGate.tsx
│   │   ├── ErrorScreen.tsx
│   │   └── Counter.tsx
│   │
│   └── layout/
│       ├── Header.tsx
│       ├── Tabs.tsx                # Tab bar — uses useLocation() instead of ix
│       ├── CardCarousel.tsx        # Extracted from Wallet.js Topic component
│       └── TxProgress.tsx          # Transaction progress overlay
│
├── stores/                         # Zustand stores (replace all 5 contexts)
│   ├── authStore.ts                # db, keyMalformed, wallet address
│   ├── txStore.ts                  # Transaction lifecycle state
│   ├── uiStore.ts                  # cardView, tokenview, selectedAsset, cardIx, etc.
│   └── fieldRegStore.ts            # Field registration state (16 properties)
│
├── queries/                        # React Query read hooks
│   ├── tokens.ts
│   ├── grants.ts
│   ├── funds.ts
│   ├── loans.ts
│   ├── land.ts
│   ├── cash.ts
│   ├── reserve.ts
│   ├── contacts.ts
│   ├── lp.ts
│   └── summary.ts
│
├── mutations/                      # React Query write hooks
│   ├── swap.ts
│   ├── escrow.ts
│   ├── offers.ts
│   ├── orders.ts
│   ├── invest.ts
│   ├── land.ts
│   ├── grants.ts
│   ├── tokens.ts
│   ├── contacts.ts
│   └── loans.ts
│
├── lib/                            # Pure functions (no React)
│   ├── wallet.ts
│   ├── contracts.ts
│   ├── multicall.ts
│   ├── permits.ts
│   ├── db.ts
│   ├── cognito.ts
│   ├── crypto.ts
│   ├── format.ts
│   ├── prices.ts
│   ├── analytics.ts
│   ├── tasks.ts
│   ├── billDetection.ts
│   └── colors.ts
│
├── hooks/                          # Only React-lifecycle hooks
│   ├── useBootstrap.ts
│   ├── useTasks.ts
│   ├── useCashSession.ts
│   ├── usePosition.ts
│   ├── useTouch.ts
│   ├── usePolling.ts
│   └── useAppHeight.ts
│
├── types/                          # ALL types centralized
│   ├── index.ts                    # Re-exports everything
│   ├── tokens.ts                   # GenericTokenData, Bal, Enabled
│   ├── funds.ts                    # GenericFundData, FundSpecific, FundDebtData, FundConditions
│   ├── loans.ts                    # ActiveDebtObj, LoanVoucherGeneric, LoanEvent, DebtData
│   ├── land.ts                     # Land title types
│   ├── cash.ts                     # CashOffer, RedeemOrder, PendingDisburse, ScheduledExit
│   └── common.ts                   # Hex, Address, etc.
│
├── config/                         # Centralized configuration
│   ├── contracts.ts                # ALL contract addresses + ABI imports
│   ├── chains.ts                   # Chain IDs, RPC URLs
│   └── constants.ts                # PAGES enum (for any remaining references), magic numbers
│
├── data/                           # Static data files
│   ├── crops.json                  # LOOKUP_TABLE extracted from useLoadETH.ts
│   ├── fund_conditions.ts          # From misc/fund_loan_conditions.ts
│   └── abis/                       # All 18 ABI JSON files (moved from components/ABI/)
│
└── styles/
    ├── index.css
    ├── spinner.css
    ├── phone_input.css
    ├── qrScan.css
    └── ripple_effect.css
```

### 3B. Specific Component Transformations

#### Wallet.js (478 LOC) → HomePage.tsx (~120 LOC) + CardCarousel.tsx (~100 LOC)

**Current problems**:
- Builds card array in render (not memoized)
- Contains internal `Topic` component (should be its own file)
- Uses `ix` ternary chain for page routing (fragile)
- 11 hook dependencies

**New approach**:
- `HomePage.tsx` renders `<CardCarousel>` + `<Outlet>` (React Router nested route)
- `CardCarousel.tsx` is the extracted Topic component, receives memoized card list
- Page routing handled by React Router — no more `ix === PAGES.ASSETS ? <Assets/> : ...`
- Card array computed with `useMemo` based on query data

#### Cards.js (553 LOC) → 6 card files + CardShell.tsx

**Current problems**:
- 6 components in one file
- Each card reimplements shrink logic independently
- Constants scattered at file scope

**New approach**:
- `CardShell.tsx` provides shared framer-motion animated wrapper with `cardShrink` prop
- Each card file contains ONLY its unique content
- Shared constants in `config/constants.ts`

#### buttons.js (715 LOC) → Button.tsx + PhoneInput.tsx + PinInput.tsx

**Current problems**:
- 8 button components + 3 nested sub-components in one file
- MobilePhoneInput and PinCodeInput are input components, not buttons
- No shared button base

**New approach**:
- `Button.tsx`: Single component with `variant` prop ('collapse' | 'exchange' | 'claim' | 'pending' | 'input')
- `PhoneInput.tsx`: Standalone phone number input
- `PinInput.tsx`: Standalone PIN code input with paste handling
- Individual exchange +/- buttons become internal to the forms that use them

#### CashOutForm.js (745 LOC) → CashOutForm/ directory

**Current problems**:
- 9-state step machine with no formal state machine
- 6 async handlers with duplicated try/catch/finally patterns
- 415 lines of JSX with AnimatePresence

**New approach**:
- `CashOutForm.tsx`: Step router using a `step` state + switch/case rendering
- Each step is its own component file (ScanQrStep, ReviewLoanStep, ScanBillsStep, ConfirmStep)
- Async handlers become mutation hooks from `mutations/`
- Step transitions become explicit: `goToStep('review-loan')`

#### UnionReserve.js (1072 LOC) → ReservePage/ directory

**Current problems**:
- Largest single component (1072 lines)
- 17 hook dependencies
- 111 lines of driver.js tour embedded
- EOS cache management embedded
- 472 lines of JSX

**New approach**:
- `ReservePage.tsx`: Layout shell (~100 LOC) composing 3 panels
- `TreasuryPanel.tsx`: Treasury summary, cash breakdown, scheduled exits (~200 LOC)
- `LPRequestsPanel.tsx`: Pending deliveries, open offers (~200 LOC)  
- `ActiveLoansPanel.tsx`: Loan list, deep sync, EOS data (~200 LOC)
- Tour logic extracted to `hooks/useTour.ts` or inline with driver.js (separate concern)
- EOS caching becomes a query in `queries/loans.ts`

#### App.js (336 LOC) → App.tsx (~80 LOC) + useBootstrap.ts (~200 LOC)

**Current problems**:
- Monolithic bootstrap() callback (145 lines, 9-level nesting)
- 13 useState declarations
- Multiple state machines (bootStage, loadStages, installCheckDone)
- Service worker messaging mixed with data init

**New approach**:
- `useBootstrap()` hook encapsulates: PWA detection, IndexedDB loading, network check, data initialization
- Returns `{ stage, isReady, isInstalling, isRegistering }`
- App.tsx becomes a simple router guard: if registering → RegisterPage, if ready → HomePage, etc.
- SW version check extracted to `lib/serviceWorker.ts`

---

## PART 4: Centralize Configuration

### 4A. Contract Registry (replaces scattered env var access)

**Current problem**: Every hook reads `process.env.REACT_APP_*` directly. Contract addresses defined in useLoadFunds.ts AND loadfund_helpers.ts AND useInvest.ts (duplicated).

**New approach** — `config/contracts.ts`:
```ts
export const CONTRACTS = {
  NILA_TOKEN: { address: import.meta.env.VITE_NILA_TOKEN, abi: nilaTokenAbi },
  NILA_GRANT: { address: import.meta.env.VITE_NILA_GRANT, abi: nilaGrantAbi },
  FX_POOL: { address: import.meta.env.VITE_FX_POOL, abi: nilaFxPoolAbi },
  MULTICALL3: { address: import.meta.env.VITE_MULTICALL3, abi: multicall3Abi },
  FUND_FACTORY: { address: import.meta.env.VITE_FUND_FACTORY, abi: fundFactoryAbi },
  GENERIC_FUND_CORE: { address: import.meta.env.VITE_FUND_CORE, abi: genericFundCoreAbi },
  GENERIC_FUND_VIEWER: { address: import.meta.env.VITE_FUND_VIEWER, abi: genericFundViewerAbi },
  // ... all 18 contracts
} as const;

export function getContract(name: keyof typeof CONTRACTS, signerOrProvider: Signer | Provider) {
  const { address, abi } = CONTRACTS[name];
  return new Contract(address, abi, signerOrProvider);
}
```

Every file that needs a contract calls `getContract('FX_POOL', wallet)` instead of importing ABIs and reading env vars.

### 4B. Centralize Types (replaces scattered definitions)

**Current problem**: `Enabled` type defined in BOTH useLoadFunds.ts and useLoadETH.ts. 10+ types in useLoadFunds.ts alone. No shared type file.

**New approach** — `types/` directory:
- Move ALL type/interface definitions out of hooks
- Single import path: `import { GenericFundData, ActiveDebtObj } from '@/types'`
- Eliminates duplicate `Enabled` and other repeated types

### 4C. Move ABIs to data/abis/ (from components/ABI/)

ABIs are data, not components. Move from `components/ABI/*.json` to `data/abis/*.json`. Import through `config/contracts.ts` only.

### 4D. Extract static data

- `LOOKUP_TABLE` (crop varieties, ~65 lines) from useLoadETH.ts → `data/crops.json`
- Fund loan conditions from misc/ → `data/fund_conditions.ts`
- Crop lookup from misc/ → `data/crops.json` (merge)

---

## PART 5: Eliminate Duplicated Patterns

### 5A. Price lookup (repeated 5+ times in FundsAnalytics.ts)

**Current**: `const price = tokenData.find(td => td.sym === t.name)?.p ?? 1;` — repeated in 5 places.

**New**: `lib/prices.ts` exports `getPrice(sym: string, tokenData: GenericTokenData[]): number`

### 5B. Nonce fetching (repeated 6 times in useWallet.ts)

**Current**: Manual `wallet.getNonce()` before every transaction in useFxPool.

**New**: `lib/wallet.ts` exports `withNonce(wallet, txFn)` wrapper. Or better: let ethers handle nonce automatically (it does this by default in v6 when you don't specify nonce).

### 5C. Query invalidation (repeated in every mutation)

**Current**: Every transaction handler manually calls `qc.invalidateQueries()` with different keys.

**New**: Mutation hooks in `mutations/` define `onSuccess` callbacks that invalidate relevant keys. Standardized pattern:
```ts
export function useMintNin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args) => mintNin(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    }
  });
}
```

### 5D. Card shrink logic (repeated in every card component)

**Current**: Each card checks `cardShrink < SHRINK_PERC && (ix || isCollapsed)` independently.

**New**: `CardShell.tsx` handles all shrink animation logic. Child cards just render their content.

### 5E. Transaction try/catch/finally pattern (repeated in 6+ async handlers)

**Current**: Every async handler in CashOutForm, UnionReserve, etc. follows:
```js
try { setLoading(true); await tx(); setStep('next') }
catch(e) { setError(e.message) }
finally { setLoading(false) }
```

**New**: Mutation hooks handle loading/error state automatically via `useMutation`. Components use `mutation.isPending`, `mutation.error` directly.

---

## PART 6: Migration Strategy (Build Order)

Execute in this order to minimize breakage at each step:

### Phase 1: Foundation (no UI changes)
1. **Create `types/`** — Extract all type definitions from hooks. Update imports.
2. **Create `config/contracts.ts`** — Centralize all ABIs + addresses. Update imports.
3. **Create `config/constants.ts`** — Move PAGES enum, SHRINK_PERC, magic numbers.
4. **Create `data/`** — Move ABIs, crop lookup table, fund conditions.
5. **Create `lib/`** — Extract pure functions from hooks (wallet, multicall, permits, format, prices, crypto, analytics).

### Phase 2: State Management Swap
6. **Install Zustand** — `npm install zustand`
7. **Create `stores/authStore.ts`** — Move db, keyMalformed, wallet address from DataContext.
8. **Create `stores/txStore.ts`** — Replace TxContext entirely. Update all `useTxContext()` calls.
9. **Create `stores/uiStore.ts`** — Replace ViewModeContext + NavContext card/view state. Update all consumers.
10. **Create `stores/fieldRegStore.ts`** — Replace FieldRegContext. Update all consumers.
11. **Delete NavigationContext.js** — Remove all 5 context providers + their Provider components from Layout.js.

### Phase 3: Data Layer
12. **Create `queries/`** — Convert each data-fetching hook to a React Query wrapper.
13. **Create `mutations/`** — Extract write operations from useWallet/useFxPool/useLoadFunds.
14. **Delete DataContext usage** — Replace all `useDataContext().tokenData` with `useTokenBalances()` etc.
15. **Slim down `hooks/`** — Delete hooks that are now fully replaced by queries/ + mutations/ + lib/.

### Phase 4: Routing
16. **Add routes to Layout.tsx** — Define all URL routes.
17. **Replace ix-based navigation** — Replace `setIx(PAGES.ASSETS)` with `navigate('/assets')` throughout.
18. **Update Tabs component** — Use `useLocation()` instead of NavContext.
19. **Delete PAGES enum usage** — URL paths are the new page identifiers.

### Phase 5: Component Restructure
20. **Split Cards.js** → 6 card files + CardShell.tsx
21. **Split buttons.js** → Button.tsx + PhoneInput.tsx + PinInput.tsx
22. **Split Wallet.js** → HomePage.tsx + CardCarousel.tsx
23. **Split UnionReserve.js** → ReservePage/ with 3 panel components
24. **Split CashOutForm.js** → CashOutForm/ directory with step components
25. **Extract useBootstrap** from App.js
26. **Reorganize features/ → pages/** — Flatten the feature folder structure

### Phase 6: Cleanup
27. **Delete empty/unused files** — Remove all original hooks that have been fully migrated
28. **Update all import paths** — Ensure clean, consistent imports (consider path aliases)
29. **Run TypeScript strict mode** — Add types to remaining .js files, rename to .tsx
30. **Verify identical UI** — Compare screenshots before/after at every route

---

## PART 7: Quantified Impact

### File Count
| Layer | Before | After |
|-------|--------|-------|
| Contexts | 2 files, 5 providers | 0 |
| Stores | 0 | 4 files |
| Hooks | 37 files (~6.5K LOC) | 7 files (~800 LOC) |
| Queries | 0 | 10 files (~1.2K LOC) |
| Mutations | 0 | 10 files (~1.5K LOC) |
| Lib | 19 utils (~2.2K LOC) | 13 files (~1.8K LOC) |
| Types | Scattered | 7 files (~400 LOC) |
| Config | 0 | 3 files (~200 LOC) |
| Pages | 39 feature files | ~15 page files |
| Components | 53 files | ~35 files |

### Lines of Code (estimated)
| Category | Before | After | Reduction |
|----------|--------|-------|-----------|
| State management | ~500 LOC (contexts) | ~300 LOC (stores) | 40% |
| Hooks | ~6,500 LOC | ~800 LOC | 88% |
| Queries + Mutations | (in hooks) | ~2,700 LOC | (extracted) |
| Lib/Utils | ~2,200 LOC | ~1,800 LOC | 18% |
| Components | ~5,100 LOC | ~3,500 LOC | 31% |
| Pages/Features | ~5,500 LOC | ~4,000 LOC | 27% |
| Types | (scattered) | ~400 LOC | (consolidated) |
| Config | 0 | ~200 LOC | (new) |
| **Total** | **~24,800 LOC** | **~16,700 LOC** | **~33%** |

### Architectural Wins
- Provider nesting: **8 levels → 3 levels**
- Max hook dependencies per component: **20+ → 5-6**
- Largest single file: **1,072 LOC → ~200 LOC**
- Average file size: **~180 LOC → ~80 LOC**
- Testable pure functions: **~10% → ~60%** of business logic
- Re-render surface: **Every DataContext consumer (39 files) re-renders on ANY state change → Zustand selectors + React Query only re-render on relevant data changes**

---

## Appendix: Files to Delete After Migration

These files are fully replaced by the new architecture:

```
DELETE src/utils/NavigationContext.js        → replaced by stores/ + React Router
DELETE src/utils/FieldRegContext.js          → replaced by stores/fieldRegStore.ts
DELETE src/hooks/useWallet.ts               → replaced by lib/wallet.ts + lib/contracts.ts + mutations/swap.ts + mutations/escrow.ts + mutations/offers.ts
DELETE src/hooks/useLoadFunds.ts            → replaced by queries/funds.ts + mutations/invest.ts + types/funds.ts + lib/permits.ts
DELETE src/hooks/useLoadETH.ts              → replaced by queries/tokens.ts + data/crops.json
DELETE src/hooks/useFilterTasks.js          → replaced by hooks/useTasks.ts + lib/tasks.ts
DELETE src/hooks/useTx.ts                   → replaced by stores/txStore.ts + lib/errors.ts
DELETE src/hooks/useDecryptKey.ts           → replaced by lib/crypto.ts
DELETE src/hooks/useHardReload.js           → replaced by lib/wallet.ts (reload function)
DELETE src/hooks/useActiveLoans.js          → replaced by queries/loans.ts
DELETE src/hooks/useCashOffer.ts            → replaced by queries/cash.ts
DELETE src/hooks/useUnionCashReserve.ts     → replaced by queries/reserve.ts
DELETE src/hooks/useContactBook.js          → replaced by queries/contacts.ts + mutations/contacts.ts
DELETE src/hooks/useInvest.ts               → replaced by mutations/invest.ts
DELETE src/hooks/useCollectGrant.ts         → replaced by mutations/grants.ts
DELETE src/hooks/useRedeemOrder.ts          → replaced by mutations/orders.ts
DELETE src/hooks/useMintLandTitle.ts        → replaced by mutations/land.ts
DELETE src/hooks/useCashSwap.js             → replaced by mutations/swap.ts
DELETE src/hooks/useCashScan.ts             → inlined or simplified
DELETE src/hooks/useVerifyFlow.js           → simplified into page component
DELETE src/hooks/useRegFlow.js              → simplified into page component
DELETE src/hooks/useDirectLendingFlow.js    → simplified into page component
DELETE src/hooks/useLoadCerts.js            → replaced by queries/land.ts
DELETE src/hooks/useActivityMapping.js      → replaced by queries/tokens.ts (activity section)
DELETE src/hooks/useSummary.js              → replaced by queries/summary.ts
DELETE src/hooks/useWeightedRates.js        → replaced by lib/analytics.ts
DELETE src/hooks/useLPCashOnHand.js         → replaced by queries/lp.ts
DELETE src/hooks/useLPProfile.js            → replaced by queries/lp.ts
DELETE src/hooks/useChainIndexer.js         → replaced by queries/tokens.ts
DELETE src/hooks/useTrainingData.js         → evaluate if still used; likely remove
DELETE src/hooks/useInventoryCheck.js       → inline into consuming component
DELETE src/hooks/useDeviceOrientation.js    → inline into consuming component
DELETE src/utils/FundsAnalytics.ts          → replaced by lib/analytics.ts
DELETE src/utils/token_api_helper.js        → replaced by lib/format.ts + relevant query
DELETE src/utils/loadfund_helpers.ts        → replaced by lib/ functions
DELETE src/utils/fetch_erc1155_chunked.tsx  → replaced by lib/multicall.ts
DELETE src/utils/fetch_landTitleMeta.ts     → replaced by lib/ functions
DELETE src/utils/cashCounterHelpers.js      → replaced by lib/ functions
DELETE src/utils/buildFieldsFromGroups.js   → replaced by lib/ function
DELETE src/utils/cropColors.js              → replaced by lib/colors.ts
DELETE src/utils/getEncryptedKey.js         → replaced by lib/crypto.ts
DELETE src/utils/runTx.ts                   → replaced by stores/txStore.ts actions
DELETE src/utils/metaTheme.js              → inlined (14 LOC)
DELETE src/utils/reloadDb.js              → inlined (10 LOC)
DELETE src/utils/decodeMetadataUri.ts      → moved to lib/
DELETE src/components/UI/buttons.js         → replaced by ui/Button.tsx + PhoneInput.tsx + PinInput.tsx
DELETE src/components/Forms/forms.js        → replaced by React Router form routes
DELETE src/features/wallet/Cards.js         → replaced by cards/ directory (6 files)
```

---

## Appendix: New Dependencies

```json
{
  "dependencies": {
    "zustand": "^4.5.0"  // Only new dependency needed
  }
}
```

No other new dependencies required. The rebuild uses React Router (already installed), React Query (already installed), and Zustand (new, ~2KB gzipped).

Consider also migrating from `react-app-rewired` + CRA to Vite during this rebuild (already partially configured based on env var naming), but this is optional and orthogonal to the structural changes.
