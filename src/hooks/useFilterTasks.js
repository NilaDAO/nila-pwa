import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from 'react';
import { useDataContext, useViewModeContext } from '../utils/NavigationContext';
import { ethers } from 'ethers';
import { useActiveLoans } from './useActiveLoans';
import { useContactBook } from './useContactBook';
import { useAcceptLoan, useRemoveLoan } from './useLoadFunds.ts';
import { useSwitchMain, useTopUpGas, useProvider} from './useWallet.ts';
import useTouch from './useTouch';
import { subscribeUser } from '../features/apis/pushManager';
import { useUnionCashReserve } from './useUnionCashReserve.ts';
import { useGlobalOpenRedeemOrders, useGlobalOpenCashOffers, usePendingCashDeliveries, usePendingFilledCashOffers } from './useCashOffer.ts';
import { useLPProfile } from './useLPProfile';
import { useFxPool } from './useWallet.ts';
import { useLoadFundsData } from './useLoadFunds.ts';
import { useCertRegistry } from './useCertRegistry.ts';

export function usePolBalance(address, provider) {
  return useQuery({
    queryKey: ['polBalance', address],
    queryFn: async () => {
      const raw = await provider.getBalance(address);
      return Number(ethers.formatEther(raw));
    },
    enabled: Boolean(provider && address),
    staleTime: 2 * 60 * 1000,
  });
}

export const CERT_IMG = [
  '/images/label-01.webp',
  '/images/label-04.webp',
  '/images/label-02.webp',
  '/images/label-03.webp',
  '/images/label-05.webp',
];

export const CROP_IMG = {
  0: 'images/paddy.png',
  1: 'images/groundnut.png',
  2: 'images/sugarcane.png',
  3: 'images/label-06.webp',
  4: 'images/label-06.webp',
  5: 'images/label-06.webp',
  6: 'images/sesame.png',
  7: 'images/cassava.png',
};

export function useFilterTasks(LAND, CAP) {
  const { db, tokenData, unionFunds, fieldActivity, setFieldActivity } = useDataContext();
  const { navRef } = useViewModeContext();
  const { provider }                 = useProvider();
  const queryClient                  = useQueryClient();
  const isLeader                     = Boolean(db?.union?.leader);
  const { resolveName }              = useContactBook({ enabled: false });
  const { data: polBalance }         = usePolBalance(db?.address, provider);
  const { data: loansData, isFetched: loansFetched } = useActiveLoans(db?.union?.address, false);
  const { data: reserveData, isPending: reservePending } = useUnionCashReserve(isLeader ? db?.union?.address : undefined);
  const { profile: lpProfile, isPending: lpProfilePending } = useLPProfile();
  const isLP = Boolean(lpProfile?.isLP);
  const { data: getOffers  = [], isPending: getOffersPending  } = useGlobalOpenRedeemOrders();
  const { data: giveOffers = [], isPending: giveOffersPending } = useGlobalOpenCashOffers();
  const { topUpGas }                 = useTopUpGas();
  const { switchToMain }             = useSwitchMain();
  const { acceptLoan }               = useAcceptLoan();
  const { removeLoan }               = useRemoveLoan();
  const { handleToggleView }         = useTouch();
  const { lpFillRedeemOrder, commitCashRequest, redeemFarmerNin, postRedeemOrder, postCashOffer, confirmCashOfferDelivered, confirmCashDelivery, cancelRedeemOrder } = useFxPool();
  const { data: fundsData = [] } = useLoadFundsData(
    db?.union?.address ?? '',
    unionFunds ?? [],
    db?.address ?? ''
  );
  const { data: pendingDeliveries = [] } = usePendingCashDeliveries(
    isLeader ? db?.union?.address : undefined
  );
  const { data: filledCashOffers = [] } = usePendingFilledCashOffers(
    isLeader ? db?.union?.address : undefined
  );
  const getNotificationPermission = () => {
    if (typeof window === 'undefined') return 'default';
    const override = localStorage.getItem('notificationPermissionOverride');
    if (override) return override;
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  };
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);

  const [dismissedLoans, setDismissedLoans] = useState(new Set());
  const filteredTransferables = loansData?.allItems?.filter(l => !l.fastDraw && !l.drawdownTs && l.txHash && !dismissedLoans.has(l.id)) ?? [];
  const hasTransferables = filteredTransferables.length > 0;

  // Local-only dismissals for LP offers (swipe-left removes the row from this
  // user's task list without touching on-chain state).
  const [dismissedGetOffers,  setDismissedGetOffers]  = useState(new Set());
  const [dismissedGiveOffers, setDismissedGiveOffers] = useState(new Set());

  // Split matching batches into those the farmer can join immediately vs. those needing a cert.
  const allSuggestedBatches = fieldActivity?.suggestedBatches
    ?? (fieldActivity?.suggestedBatch ? [fieldActivity.suggestedBatch] : []);
  const openBatch  = allSuggestedBatches.find(b => (b.requiredCerts ?? 0) === 0) ?? null;
  const certBatch  = allSuggestedBatches.find(b => (b.requiredCerts ?? 0) > 0)  ?? null;
  const batchRequiredMask = certBatch?.requiredCerts ?? 0;
  const { allMet: certsAllMet, requiredCerts: batchRequiredCertsList, loading: certLoading } = useCertRegistry(db?.address, batchRequiredMask);

  // compute readiness OUTSIDE queryFn so we can gate with `enabled`
  const tokenDataReady = Array.isArray(tokenData);
  const landReady = Boolean(LAND?.current) && typeof LAND.current?.hasLand === 'boolean';
  const capReady = typeof CAP?.current === 'number' && Number.isFinite(CAP.current);
  const accountReady = Boolean(db?.address);
  const loansReady = true; // loans deferred to Cash & Liquidity tab — don't block task list

  const ready =
    tokenDataReady &&
    landReady &&
    capReady &&
    accountReady &&
    loansReady;

  // Upstream signals that contribute to the task list. While any of these is
  // still loading, the composed list is incomplete and we should keep the task
  // area in a loading state instead of flashing "All tasks completed".
  const upstreamLoading =
    lpProfilePending ||
    getOffersPending ||
    giveOffersPending ||
    certLoading ||
    (isLeader && reservePending);
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Total escrow nIN the union holds (human-readable)
  const escrowBalance = useMemo(() => {
    const raw = reserveData?.activeEscrowNin;
    if (!raw) return 0;
    return Number(ethers.formatUnits(raw, 18));
  }, [reserveData]);

  const handleAcceptLoan = async (union, id, borrower, borrowerAddr, amount, lpOpts) => {
    if (!confirm(`Accept the loan of ${Math.round(amount).toLocaleString('en-IN')} nIN to ${borrower}?`)) return;
    setDismissedLoans(prev => new Set(prev).add(id));
    await acceptLoan(union, id);

    if (lpOpts?.sendLP && lpOpts.amount > 0) {
      try {
        const amountRaw = ethers.parseUnits(String(lpOpts.amount), 18);
        const usdtOut = await redeemFarmerNin(borrowerAddr, amountRaw);
        await postRedeemOrder(union, borrowerAddr, BigInt(lpOpts.amount), usdtOut, amountRaw, 100);
        queryClient.invalidateQueries({ queryKey: ['globalOpenCashOffers'] });
        queryClient.invalidateQueries({ queryKey: ['globalOpenRedeemOrders'] });
      } catch (e) { console.error('LP offer creation failed:', e); }
    }
  };

  const handleCancelLoan = async (union, id, borrower, txHash) => {
    if (confirm(`Cancel the loan request from ${borrower}?`)) {
      setDismissedLoans(prev => new Set(prev).add(id));
      if (txHash) await removeLoan(union, id);
      await fetch(`${process.env.REACT_APP_API_BASE_URL}/filter_events/loan/${union}/${id}`, {
        method: 'DELETE',
      });
    }
  };

  // Mirrors UnionReserve.handleSettle: posts a CashOffer at 1% LP fee per escrow.
  // The leader settles via an LP provider, not directly from the treasury.
  const handleSettleExpiringEscrows = async (escrows) => {
    if (!escrows?.length || !db?.union?.address) return;
    const totalInr = Number(
      escrows.reduce((s, e) => s + (e?.ninAmount != null ? BigInt(e.ninAmount) : 0n), 0n) / 10n ** 18n
    );
    const msg =
      `Post a CashOffer for ₹${totalInr.toLocaleString('en-IN')} at 1% LP fee?\n\n` +
      `An LP provider will deliver the cash on the union's behalf.`;
    if (!confirm(msg)) return;
    for (const e of escrows) {
      try {
        await postCashOffer(db.union.address, e.escrowId, 100); // 100 BP = 1%
      } catch (err) {
        console.error('postCashOffer failed:', err);
        break;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['unionCashReserve'] });
    queryClient.invalidateQueries({ queryKey: ['unionOpenCashOffersList'] });
  };

  const handleEnableNotifications = async () => {
    const res = await subscribeUser(db?.address);
    if (res === 0) {
      localStorage.removeItem('notificationPermissionOverride');
      setNotificationPermission('granted');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      alert('Notifications enabled. We will notify you when your land title is minted.');
      return;
    }
    if (res === 2) {
      localStorage.setItem('notificationPermissionOverride', 'denied');
      setNotificationPermission('denied');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      alert('Notifications are blocked. Enable them from browser settings to receive updates.');
      return;
    }
    setNotificationPermission(getNotificationPermission());
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    alert('Unable to enable notifications right now. Please try again.');
  }

  // Extract leader treasury signals for queryKey + task generation
  const now = Math.floor(Date.now() / 1000);
  const pendingDisburse = reserveData?.pendingDisburse ?? [];
  const scheduledExits  = reserveData?.scheduledExits  ?? [];
  const treasury        = reserveData?.treasury        ?? 0n;
  const available       = reserveData?.available       ?? 0n;
  // Group pending escrows into a 4h bucket anchored on the earliest deadline
  // and drive the settlement task from that bucket only. pendingDisburse is
  // sorted asc by deadline (useUnionCashReserve). Mirrors the Countdown in
  // UnionReserve.js:735-758. The task card triggers at <1d to match the bar's
  // red-flash threshold (Countdown isWarning = remaining < 86400).
  const BUCKET_WINDOW = 4 * 3600;
  const earliestDeadline = pendingDisburse[0]?.deadline ?? null;
  const settleBucket = earliestDeadline === null
    ? []
    : pendingDisburse.filter(e => e.deadline - earliestDeadline < BUCKET_WINDOW);
  const hasUrgentEscrow = earliestDeadline !== null && (earliestDeadline - now) < 86400;
  let urgentInr = 0;
  try {
    const sumRaw = settleBucket.reduce(
      (s, e) => s + (e?.ninAmount != null ? BigInt(e.ninAmount) : 0n),
      0n
    );
    urgentInr = Number(sumRaw / 10n ** 18n);
  } catch (err) {
    console.error('urgentInr calc failed:', err);
  }
  const hasOpenUnbond   = scheduledExits.some(e => e.pastMin);
  const treasuryLow     = treasury > 0n && Number(available) / Number(treasury) < 0.2;

  // Total available-to-borrow across all union funds. Mirrors the per-fund
  // "Available" line on the Investment card (investmentsList.js):
  //   Math.max(0, idleCash - requiredReserve)
  // requiredReserve includes claimable + safety bump (10%), so this is the real lendable cash.
  const totalAvailable = (fundsData ?? []).reduce(
    (s, f) => s + Math.max(
      0,
      Number(f?.tokens?.[0]?.idleCash ?? 0) - Number(f?.tokens?.[0]?.requiredReserve ?? 0)
    ),
    0
  );
  const hasBorrowRoom = totalAvailable >= urgentInr && urgentInr > 0;

  const query = useQuery({
    queryKey: [
      'tasks',
      tokenDataReady ? tokenData.length : 0,
      landReady ? LAND.current.hasLand : null,
      capReady ? CAP.current : null,
      Number(process.env.REACT_APP_CHAIN_ID) || 137,
      db?.union?.chain ?? null,
      db?.union?.address ?? null,
      loansFetched ? filteredTransferables.length : null,
      notificationPermission,
      tokenDataReady ? tokenData.find(i => i?.sym === 'LAND')?.bal ?? 0 : null,
      typeof polBalance === 'number' ? polBalance < 0.2 : null,
      hasUrgentEscrow,
      urgentInr,
      hasBorrowRoom,
      hasOpenUnbond,
      treasuryLow,
      escrowBalance,
      isLP,
      getOffers.length,
      dismissedGetOffers.size,
      giveOffers.length,
      dismissedGiveOffers.size,
      pendingDeliveries.length,
      filledCashOffers.length,
      fieldActivity?.activeCycle?.length ?? 0,
      openBatch?.id ?? null,
      certBatch?.id ?? null,
      !!fieldActivity?.dormant,
      batchRequiredMask,
      certsAllMet,
    ],
    // useFilterTasks is a pure derivation over upstream hooks — no network call.
    // Treat the composed list as never-stale: when an upstream signal changes the
    // queryKey shifts and the queryFn re-runs anyway. placeholderData keeps the
    // previous list visible across key changes so we don't flash "loading tasks..".
    staleTime: Infinity,
    gcTime: Infinity,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: ready, // only run when inputs are ready
    queryFn: async () => {
      if (!ready) return [];
      const MINCAP       = Number(process.env.REACT_APP_MIN_CAP ?? 100);
      const chainSync    = (Number(process.env.REACT_APP_CHAIN_ID) || 137) == Number(db?.union?.chain);
      const fallowFields = !!fieldActivity?.dormant;
      const topUpGasFlag = Boolean(localStorage.getItem('TopUpGas'));
      const hasLandToken = tokenData?.some(t => t?.sym === 'LAND' && Number(t?.bal || 0) > 0);
      const pendingLandMeta = db?.reload?.land?.metadata;
      const landMintPending = !hasLandToken && !LAND?.current?.hasLand && Boolean(
        db?.reload?.land?.pendingMint ||
        pendingLandMeta
      );
      const notificationsGranted = notificationPermission === 'granted';
      const baseNin = 40;
      const POL_or_Flag = (typeof polBalance === 'number' && polBalance < 0.2) || topUpGasFlag;
      const hasActiveCycle = Boolean(fieldActivity?.activeCycle?.length);
      const missingCerts = batchRequiredCertsList.filter(c => c.status !== 'valid' && c.status !== 'expiring');

      const taskList = [
        { i: 0,
          active: !chainSync,
          img: "images/sat.svg",
          tx_nmb: 0,
          click: () => switchToMain(),
          title: `${db?.union?.name} has moved to Polygon mainnet.`,
          subtitle: 'Make the switch too.',
          btn: 'Switch',
          swipeable: true,
          swipeRightLabel: 'Switch ✓',
          swipeHint: 'Swipe to switch',
        },
        { i: 2,
          active: !hasLandToken && !LAND?.current?.hasLand,
          img: "images/LAND.png", 
          tx_nmb: landMintPending ? 0 : { ix: 2, i: 0 },
          click: landMintPending ? handleEnableNotifications : handleToggleView,
          pending: landMintPending,
          title: landMintPending ? 'Pending land title mint.' : 'Claim your free land asset.',
          subtitle: landMintPending
            ? (notificationsGranted
              ? 'We will notify you when the title has been minted.'
              : 'Let us notify you when the title has been minted.')
            : 'A land title can get you loans, grants and more.',
          btn: landMintPending && notificationsGranted ? null : (landMintPending ? 'Enable' : 'Claim'),
         },
        { i: 4,
          active: Number(CAP?.current) > MINCAP,
          img: "images/label-06.webp",
          tx_nmb: { ix: 1, i: 0 },
          click: handleToggleView,
          title: `Invest to reach the minimal loan cap`,
          subtitle: `Invest more nIN to unlock borrowing.`,
          btn: 'Invest',
          swipeable: true,
          swipeRightLabel: 'Invest ✓',
          swipeHint: 'Swipe to invest',
        },
        { i: 5,
          active: fallowFields,
          img: "images/paddy.png",
          tx_nmb: { ix: 2, i: 0 },
          click: () => { setFieldActivity(prev => prev ? { ...prev, pendingCropForm: true } : prev); handleToggleView({ ix: 2, i: 0 }); },
          title: `Start a new cultivation`,
          subtitle: `Get up to 1L support to grow on fallow and unused fields.`,
          btn: 'Grow',
          swipeable: true,
          swipeRightLabel: 'Grow ✓',
          swipeHint: 'Swipe to grow',
        },
        // Show buy 
        { i: 6, 
          active: POL_or_Flag, 
          img: "images/80002.png", 
          tx_nmb: { ix: 2, i: 0 }, 
          click: () => topUpGas(baseNin), 
          title: 'You are low on transaction fees', 
          subtitle: 'Nila keeps you in control, for that each action cost a small fee. Top-up 40 nIN to keep things moving smoothly.',
          btn: 'Send',
        },
        // Loan acceptance by union leaders
        ...(filteredTransferables.map((d, i) => {
            const label   = resolveName(d.borrower);
            const fullAmt = Math.round(d.amount);
            // Only the first pending loan can use the escrow; the rest must settle in full.
            const avail   = i === 0 ? escrowBalance : 0;
            const netAmt  = Math.max(0, Math.round(d.amount - avail));
            return {
              i: i + 7,
              active: isLeader && hasTransferables,
              img: 'images/label-06.webp',
              click: (_, lpOpts) => handleAcceptLoan(d.union, d.id, label, d.borrower, d.amount, lpOpts),
              title: `${label} requests a ₹${fullAmt.toLocaleString('en-IN')} loan.`,
              subtitle: null,
              btn: 'Accept',
              btn2: 'Cancel',
              click2: () => handleCancelLoan(d.union, d.id, label, d.txHash),
              lp: { fullAmt, netAmt, escrowBalance: avail },
            };
          }) || []),
        // Leader treasury urgency tasks
        { i: 100,
          active: isLeader && hasUrgentEscrow,
          img: 'images/NILA.png',
          tx_nmb: { ix: 6 },
          title: hasBorrowRoom
            ? `Cash-out ₹${urgentInr.toLocaleString('en-IN')} today`
            : `Settle ₹${urgentInr.toLocaleString('en-IN')} cash today`,
          subtitle: hasBorrowRoom
            ? 'Find a borrower and cash-out today.'
            : 'Settle the cash with an LP provider today.',
          // Swipe right → settle from treasury, swipe left → open cash-out form
          click:  () => handleSettleExpiringEscrows(settleBucket),
          click2: () => handleToggleView({ ix: 6 }),
          btn:  'Settle',
          btn2: 'Cash Out',
          swipeRightLabel: 'Settle ✓',
          swipeLeftLabel:  'Cash Out ✓',
          swipeLeftPositive: true,
        },
        { i: 101,
          active: isLeader && hasOpenUnbond,
          img: 'images/label-06.webp',
          tx_nmb: { ix: 6 },
          click: handleToggleView,
          title: 'Member ready to claim cash.',
          subtitle: 'Open Cash Out to post a Redeem Order.',
          btn: 'Cash Out',
        },
        // LP: one task per get-cash offer (LP deposits USDT, picks up INR cash from union)
        ...(isLP ? getOffers
          .filter(o => !dismissedGetOffers.has(o.id))
          .map((o, idx) => {
            const inr  = Number(o.inrValue ?? 0);
            const usdt = o.usdtAmount > 0n ? Number(o.usdtAmount) / 1e6 : 0;
            const rate = usdt > 0 ? (inr / usdt).toFixed(2) : '—';
            return {
              i: 200 + idx,
              active: true,
              img: 'images/USDT0.png',
              tx_nmb: 0,
              // Swipe right → fill, swipe left → dismiss locally
              click:  () => lpFillRedeemOrder(o.id),
              click2: () => setDismissedGetOffers(prev => new Set(prev).add(o.id)),
              title: `Collect ₹${inr.toLocaleString('en-IN')} cash`,
              subtitle: `Get $${usdt.toFixed(2)} · ₹${rate}/$`,
              btn:  'Fill',
              btn2: 'Not interested',
              swipeRightLabel: 'Fill ✓',
              swipeLeftLabel:  '✕ Not interested',
            };
          }) : []),
        // LP: one task per give-cash offer (LP brings INR cash, receives USDT locked by union)
        ...(isLP ? giveOffers
          .filter(o => !dismissedGiveOffers.has(o.id))
          .map((o, idx) => {
            const inr  = Number(o.inrValue ?? 0);
            const feeInr = Math.round(inr * (o.feeBP ?? 100) / 10000);
            return {
              i: 300 + idx,
              active: true,
              img: 'images/USDT0.png',
              tx_nmb: 0,
              // Swipe right → fill, swipe left → dismiss locally
              click:  () => commitCashRequest(o.id),
              click2: () => setDismissedGiveOffers(prev => new Set(prev).add(o.id)),
              title: `Bring ₹${inr.toLocaleString('en-IN')} cash to ${resolveName(o.union)}`,
              subtitle: `Earn ₹${feeInr.toLocaleString('en-IN')} fee (${(o.feeBP ?? 100) / 100}%) holding $${(Number(o.usdtAmount) / 1e6).toFixed(2)}`,
              btn:  'Fill',
              btn2: 'Not interested',
              swipeRightLabel: 'Fill ✓',
              swipeLeftLabel:  '✕ Not interested',
            };
          }) : []),
        // Union leader: LP filled a CashOffer (deposited USDT) — swipe to accept
        ...(isLeader ? filledCashOffers.map((o, idx) => {
          const lpName = resolveName(o.lp);
          const inr    = Number(o.inrValue);
          const feeInr = Math.round(inr * (o.feeBP ?? 100) / 10000);
          return {
            i: 500 + idx,
            active: true,
            img: 'images/USDT0.png',
            tx_nmb: 0,
            click: async () => {
              if (!confirm(`Accept ${lpName} collecting ₹${inr.toLocaleString('en-IN')} cash?`)) return;
              try {
                await confirmCashOfferDelivered(o.id);
                queryClient.invalidateQueries({ queryKey: ['pendingFilledCashOffers'] });
                queryClient.invalidateQueries({ queryKey: ['unionCashReserve'] });
              } catch (err) { console.error('confirmCashOfferDelivered failed:', err); }
            },
            title: `${lpName} is collecting ₹${inr.toLocaleString('en-IN')} cash.`,
            subtitle: `For a ₹${feeInr.toLocaleString('en-IN')} fee.`,
            btn: 'Accept',
            swipeRightLabel: 'Accept ✓',
          };
        }) : []),
        // Union leader: LP committed to a RedeemOrder — swipe to accept or deny
        ...(isLeader ? pendingDeliveries.map((o, idx) => {
          const lpName = resolveName(o.lp);
          const inr    = Number(o.inrValue);
          const feeInr = Math.round(inr * (o.feeBP ?? 100) / 10000);
          return {
            i: 400 + idx,
            active: true,
            img: 'images/USDT0.png',
            tx_nmb: 0,
            click: async () => {
              if (!confirm(`Accept ₹${inr.toLocaleString('en-IN')} cash delivery from ${lpName}?`)) return;
              try {
                await confirmCashDelivery(o.id);
                queryClient.invalidateQueries({ queryKey: ['pendingCashDeliveries'] });
                queryClient.invalidateQueries({ queryKey: ['unionCashReserve'] });
              } catch (err) { console.error('confirmCashDelivery failed:', err); }
            },
            click2: async () => {
              if (!confirm(`Deny ${lpName}? This cancels the order.`)) return;
              try {
                await cancelRedeemOrder(o.id);
                queryClient.invalidateQueries({ queryKey: ['pendingCashDeliveries'] });
                queryClient.invalidateQueries({ queryKey: ['unionCashReserve'] });
              } catch (err) { console.error('cancelRedeemOrder failed:', err); }
            },
            title: `${lpName} is delivering ₹${inr.toLocaleString('en-IN')} cash.`,
            subtitle: `For a ₹${feeInr.toLocaleString('en-IN')} fee.`,
            btn: 'Accept',
            btn2: 'Deny',
            swipeRightLabel: 'Accept ✓',
            swipeLeftLabel: '✕ Deny',
          };
        }) : []),
        { i: 102,
          active: isLeader && treasuryLow,
          img: 'images/label-06.webp',
          tx_nmb: { ix: 6 },
          click: handleToggleView,
          title: 'Treasury liquidity low.',
          subtitle: 'Post a Cash Offer to get USDT from an LP.',
          btn: 'View',
        },
        // Batch match: open batch (no cert requirement) → swipe right to join
        { i: 600,
          active: hasActiveCycle && openBatch !== null && !tokenData?.some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && t.cropCode === openBatch?.cropCode),
          img: CROP_IMG[openBatch?.cropCode] ?? 'images/paddy.png',
          tx_nmb: { ix: 2, i: 0 },
          click: () => { setFieldActivity(prev => prev ? { ...prev, pendingJoin: true } : prev); handleToggleView({ ix: 2, i: 0 }); },
          btn2: true,
          swipeRightLabel: 'Join batch →',
          swipeLeftLabel: (() => { const b = openBatch; return `✕ I'm not growing ${b?.cropName?.toLowerCase() ?? 'this crop'}`; })(),
          click2: () => { setFieldActivity(prev => prev ? { ...prev, pendingCropForm: true } : prev); handleToggleView({ ix: 2, i: 0 }); },
          title: (() => {
            const b = openBatch;
            if (!b) return 'Batch open for your crop.';
            const crop = b.cropName?.toLowerCase();
            if (b.deliveryDate > 0 && b.targetQtyKg > 0n) return `Join the ${crop} growing programme.`;
            return `Get a loan up to 1L`;
          })(),
          subtitle: (() => {
            const b = openBatch;
            if (!b) return null;
            const unit = b.cropCode === 2 || b.cropCode === 7 ? 'MT' : b.cropCode === 6 ? 'kg' : 'quintal';
            const div  = b.cropCode === 2 || b.cropCode === 7 ? 1000 : b.cropCode === 6 ? 1 : 100;
            const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            if (b.hasOrder) {
              const parts = [];
              if (b.pricePerKgUsdt > 0n) parts.push(`$${(Number(b.pricePerKgUsdt) / 1e6).toFixed(2)}/${unit}`);
              if (b.deliveryDate > 0)    parts.push(`deliver by ${fmtDate(b.deliveryDate)}`);
              return parts.join(' · ') || 'Union handles delivery and logistics.';
            }
            if (b.deliveryDate > 0 && b.targetQtyKg > 0n) {
              return `${Number(b.targetQtyKg) / div} ${unit} target · deliver by ${fmtDate(b.deliveryDate)}`;
            }
            return `Join and confirm your ${b.cropName?.toLowerCase()} planting`;
          })(),
        },
        // Cert-required batch: farmer is missing the required cert → prompt to apply.
        { i: 601,
          active: hasActiveCycle && certBatch !== null && !certsAllMet,
          img: missingCerts[0]?.index != null ? CERT_IMG[missingCerts[0].index] : (CROP_IMG[certBatch?.cropCode] ?? 'images/paddy.png'),
          tx_nmb: { ix: 0 },
          click: () => { navRef.current.assetTab = false; handleToggleView({ ix: 0 }); },
          title: `${db?.union?.name} needs farmers with a ${missingCerts[0]?.name} certification.`,
          subtitle: 'Start the application',
          btn: 'Apply',
          swipeable: true,
          swipeRightLabel: 'Apply ✓',
          swipeHint: 'Swipe to apply',
        },
        // Cert-required batch: farmer already holds all required certs → join directly.
        { i: 602,
          active: hasActiveCycle && certBatch !== null && certsAllMet && !tokenData?.some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && t.cropCode === certBatch?.cropCode),
          img: CROP_IMG[certBatch?.cropCode] ?? 'images/paddy.png',
          tx_nmb: { ix: 2, i: 0 },
          click: () => { setFieldActivity(prev => prev ? { ...prev, pendingJoin: true } : prev); handleToggleView({ ix: 2, i: 0 }); },
          btn2: true,
          swipeRightLabel: 'Join batch →',
          swipeLeftLabel: (() => { const b = certBatch; return `✕ I'm not growing ${b?.cropName?.toLowerCase() ?? 'this crop'}`; })(),
          click2: () => { setFieldActivity(prev => prev ? { ...prev, pendingCropForm: true } : prev); handleToggleView({ ix: 2, i: 0 }); },
          title: (() => {
            const b = certBatch;
            if (!b) return 'Certified batch open for your crop.';
            return `You qualify for the ${b.cropName?.toLowerCase()} certified batch.`;
          })(),
          subtitle: (() => {
            const b = certBatch;
            if (!b) return null;
            const unit = b.cropCode === 2 || b.cropCode === 7 ? 'MT' : b.cropCode === 6 ? 'kg' : 'quintal';
            const div  = b.cropCode === 2 || b.cropCode === 7 ? 1000 : b.cropCode === 6 ? 1 : 100;
            const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            if (b.hasOrder) {
              const parts = [];
              if (b.pricePerKgUsdt > 0n) parts.push(`$${(Number(b.pricePerKgUsdt) / 1e6).toFixed(2)}/${unit}`);
              if (b.deliveryDate > 0)    parts.push(`deliver by ${fmtDate(b.deliveryDate)}`);
              return parts.join(' · ') || 'Union handles delivery and logistics.';
            }
            if (b.deliveryDate > 0 && b.targetQtyKg > 0n) {
              return `${Number(b.targetQtyKg) / div} ${unit} target · deliver by ${fmtDate(b.deliveryDate)}`;
            }
            return `Join and confirm your ${b.cropName?.toLowerCase()} planting`;
          })(),
        },
      ];

      const active = taskList.filter(t => t.active);
      
      // Pin chain-switch (i=0), land (i=2), and loan tasks (i=7+) first in order, shuffle the rest
      const isLoan = (t) => t.i >= 7 && t.i < 100;
      const pinned = active.filter(t => t.i === 0 || t.i === 2 || isLoan(t));
      const others = active.filter(t => t.i !== 0 && t.i !== 2 && !isLoan(t));
      const highlighted_task = [...pinned, ...shuffle(others)];
      return highlighted_task; // ✅ return the list
    },
  });
  // Surface upstream loading alongside the query result so the UI can keep the
  // task area in a loading state while data is still streaming in (avoids the
  // "All tasks completed" flash on hard reloads).
  return { ...query, upstreamLoading };
}

