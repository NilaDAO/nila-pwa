import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from 'react';
import { useDataContext, useNavContext } from '../utils/NavigationContext';
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

export function useFilterTasks(LAND, CAP) {
  const { db, tokenData, setTxDetails, setTxIndex } = useDataContext();
  const { setIx }                    = useNavContext();
  const { provider }                 = useProvider();
  const queryClient                  = useQueryClient();
  const isLeader                     = Boolean(db?.union?.leader);
  const { resolveName }              = useContactBook();
  const { data: polBalance }         = usePolBalance(db?.address, provider);
  const { data: loansData, isFetched: loansFetched } = useActiveLoans(db?.union?.address, isLeader);
  const { data: reserveData }        = useUnionCashReserve(isLeader ? db?.union?.address : undefined);
  const { profile: lpProfile }       = useLPProfile({ enabled: LAND?.current?.hasLand === false });
  const isLP = Boolean(lpProfile?.isLP);
  const { data: getOffers  = [] }    = useGlobalOpenRedeemOrders();
  const { data: giveOffers = [] }    = useGlobalOpenCashOffers();
  const { topUpGas }                 = useTopUpGas();
  const { switchToMain }             = useSwitchMain();
  const { acceptLoan }               = useAcceptLoan();
  const { removeLoan }               = useRemoveLoan();
  const { handleToggleView }         = useTouch();
  const { lpFillRedeemOrder, commitCashRequest } = useFxPool();
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

  const filteredTransferables = loansData?.allItems?.filter(l => !l.fastDraw && !l.drawdownTs) ?? [];
  const hasTransferables = filteredTransferables.length > 0;

  // compute readiness OUTSIDE queryFn so we can gate with `enabled`
  const tokenDataReady = Array.isArray(tokenData);
  const landReady = Boolean(LAND?.current) && typeof LAND.current?.hasLand === 'boolean';
  const capReady = typeof CAP?.current === 'number' && Number.isFinite(CAP.current);
  const accountReady = Boolean(db?.address);
  const loansReady = !isLeader || loansFetched;

  const ready =
    tokenDataReady &&
    landReady &&
    capReady &&
    accountReady &&
    loansReady;
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const handleAcceptLoan = async (union,id,borrower,amount) => {
    if (confirm(`Are you sure to accept the loan of ${amount} nIN to ${borrower}`)) {
      await acceptLoan(union, id);
    }
  }

  const handleCancelLoan = async (union, id, borrower) => {
    if (confirm(`Cancel the loan request from ${borrower}?`)) {
      await removeLoan(union, id);
      await fetch(`${process.env.REACT_APP_API_BASE_URL}/filter_events/loan/${union}/${id}`, {
        method: 'DELETE',
      });
    }
  }

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
  const hasUrgentEscrow = pendingDisburse.some(e => e.deadline - now < 86400);
  const hasOpenUnbond   = scheduledExits.some(e => e.pastMin);
  const treasuryLow     = treasury > 0n && Number(available) / Number(treasury) < 0.2;

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
      hasOpenUnbond,
      treasuryLow,
      isLP,
      getOffers.length,
      giveOffers.length,
      pendingDeliveries.length,
      filledCashOffers.length,
    ],
    staleTime: 5 * 60 * 1000,
    enabled: ready, // only run when inputs are ready
    queryFn: async () => {
      if (!ready) return [];
      const MINCAP       = Number(process.env.REACT_APP_MIN_CAP ?? 100);
      const chainSync    = (Number(process.env.REACT_APP_CHAIN_ID) || 137) == Number(db?.union?.chain);
      const fallowFields = !!db?.reloadActivity?.act?.features?.some(f => {
        const activity = f?.properties?.activity;
        if (typeof activity === 'string') return activity === 'fallow';
        const cls = f?.properties?.class;
        return cls === 0 || cls === 1;
      });
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

      const taskList = [
        { i: 0, 
          active: !chainSync, 
          img: "images/sat.svg", 
          tx_nmb: 0, 
          click: () => switchToMain(), 
          title: `${db?.union?.name} has moved to Polygon mainnet.`, 
          subtitle: 'Make the switch too.',
          btn: 'Switch',
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
         },
        { i: 5, 
          active: fallowFields, 
          img: "images/paddy.png", 
          tx_nmb: { ix: 2, i: 0 }, 
          click: handleToggleView, 
          title: `Start a new cultivation`, 
          subtitle: `Get up to 1L support to grow on fallow and unused fields.`,
          btn: 'Grow'
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
            const label = resolveName(d.borrower);
            return {
              i: i + 7,
              active: isLeader && hasTransferables,
              img: 'images/label-06.webp',
              click: () => handleAcceptLoan(d.union, d.id, label, d.amount),
              title: `${label} requests a loan.`,
              subtitle: `${d.amount} nIN.`,
              btn: 'Accept',
              btn2: 'Cancel',
              click2: () => handleCancelLoan(d.union, d.id, label),
            };
          }) || []),
        // Leader treasury urgency tasks
        { i: 100,
          active: isLeader && hasUrgentEscrow,
          img: 'images/label-06.webp',
          tx_nmb: { ix: 6 },
          click: handleToggleView,
          title: 'Loan draw expiring today.',
          subtitle: 'Open Cash Out to disburse before the escrow expires.',
          btn: 'Cash Out',
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
        ...(isLP ? getOffers.map((o, idx) => {
          const usdtDisplay = o.usdtAmount > 0n
            ? `$${(Number(o.usdtAmount) / 1e6).toFixed(2)} USDT`
            : 'USDT';
          return {
            i: 200 + idx,
            active: true,
            img: 'images/label-06.webp',
            tx_nmb: 0,
            click: () => lpFillRedeemOrder(o.id),
            title: `Collect ₹${Number(o.inrValue ?? 0).toLocaleString()} cash`,
            subtitle: `Deposit ${usdtDisplay} · pick up cash from union`,
            btn: 'Fill',
          };
        }) : []),
        // LP: one task per give-cash offer (LP brings INR cash, receives USDT locked by union)
        ...(isLP ? giveOffers.map((o, idx) => {
          const usdtDisplay = o.usdtAmount > 0n
            ? `$${(Number(o.usdtAmount) / 1e6).toFixed(2)} USDT`
            : 'USDT';
          return {
            i: 300 + idx,
            active: true,
            img: 'images/label-06.webp',
            tx_nmb: 0,
            click: () => commitCashRequest(o.id),
            title: `Earn ${usdtDisplay}`,
            subtitle: `Bring ₹${Number(o.inrValue ?? 0).toLocaleString()} cash to member`,
            btn: 'Fill',
          };
        }) : []),
        // Union leader: count bills + confirm for LP-filled CashOffers (union has cash, LP deposited USDT)
        ...(isLeader ? filledCashOffers.map((o, idx) => ({
          i: 500 + idx,
          active: true,
          img: 'images/label-06.webp',
          tx_nmb: 0,
          click: () => { setTxDetails({ offerId: o.id, inrValue: o.inrValue }); setTxIndex('cashOffer-confirm'); setIx(5); },
          title: `LP collected — hand over ₹${Number(o.inrValue).toLocaleString('en-IN')} cash`,
          subtitle: `Count bills · confirm to release USDT to LP`,
          btn: 'Count Bills',
        })) : []),
        // Union leader: count bills + confirm for LP-committed RedeemOrders
        ...(isLeader ? pendingDeliveries.map((o, idx) => ({
          i: 400 + idx,
          active: true,
          img: 'images/label-06.webp',
          tx_nmb: 0,
          click: () => { setTxDetails({ orderId: o.id }); setTxIndex('redeem'); setIx(5); },
          title: `LP delivered ₹${Number(o.inrValue).toLocaleString('en-IN')} cash`,
          subtitle: `Count bills · confirm to release $${(Number(o.usdtLocked) / 1e6).toFixed(2)} USDT to LP`,
          btn: 'Count Bills',
        })) : []),
        { i: 102,
          active: isLeader && treasuryLow,
          img: 'images/label-06.webp',
          tx_nmb: { ix: 6 },
          click: handleToggleView,
          title: 'Treasury liquidity low.',
          subtitle: 'Post a Cash Offer to get USDT from an LP.',
          btn: 'View',
        },
      ];

      const active = taskList.filter(t => t.active);
      
      // Always place chain-switch task (i=0) and land task (i=2) first if active, then shuffle the rest
      const pinned = active.filter(t => t.i === 0 || t.i === 2);
      const others = active.filter(t => t.i !== 0 && t.i !== 2);
      const highlighted_task = [...pinned, ...shuffle(others)];
      return highlighted_task; // ✅ return the list
    },
  });
  return query; // return the whole query object
}

