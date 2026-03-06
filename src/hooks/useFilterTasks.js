import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import { ethers } from 'ethers';
import { useCollectGrant } from './useCollectGrant.ts';
import { useAcceptLoan } from './useLoadFunds.ts';
import { useSwitchMain, useTopUpGas, useProvider} from './useWallet.ts';
import useTouch from './useTouch';
import { subscribeUser } from '../features/apis/pushManager';

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
  const { db, tokenData, grantData } = useDataContext();
  const { provider }                 = useProvider();
  const queryClient                  = useQueryClient();
  const isLeader                     = Boolean(db?.union?.leader);
  const { data: polBalance }         = usePolBalance(db?.address, provider);
  const { data: loansResp, isFetched: loansFetched } = useTransferableLoans(
    db?.union?.address,
    isLeader
  );

  const { collectGrant }             = useCollectGrant();
  const { topUpGas }                 = useTopUpGas();
  const { switchToMain }             = useSwitchMain();
  const { acceptLoan }               = useAcceptLoan();
  const { handleToggleView }         = useTouch();
  const getNotificationPermission = () => {
    if (typeof window === 'undefined') return 'default';
    const override = localStorage.getItem('notificationPermissionOverride');
    if (override) return override;
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  };
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);

  const filteredTransferables = loansResp?.items?.filter(l => !l.fastDraw && !l.drawdownTs) ?? [];
  const hasTransferables = filteredTransferables.length > 0;

  // compute readiness OUTSIDE queryFn so we can gate with `enabled`
  const tokenDataReady = Array.isArray(tokenData);
  const grantReady = grantData && typeof grantData.alreadyClaimed === 'boolean' &&  typeof grantData.initialClaim === 'boolean';
  const landReady = Boolean(LAND?.current) && typeof LAND.current?.hasLand === 'boolean';
  const capReady = typeof CAP?.current === 'number' && Number.isFinite(CAP.current);
  const accountReady = Boolean(db?.address) && Boolean(db?.chain);
  const loansReady = !isLeader || loansFetched;

  const ready =
    tokenDataReady &&
    grantReady &&
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

  const query = useQuery({
    queryKey: [
      'tasks',
      tokenDataReady ? tokenData.length : 0,
      grantReady ? grantData.alreadyClaimed : null,
      landReady ? LAND.current.hasLand : null,
      capReady ? CAP.current : null,
      db?.chain ?? null,
      db?.union?.chain ?? null,
      db?.union?.address ?? null,
      loansFetched ? filteredTransferables.length : null,
      notificationPermission,
      tokenDataReady ? tokenData.find(i => i?.sym === 'LAND')?.bal ?? 0 : null,
      typeof polBalance === 'number' ? polBalance < 0.2 : null,
    ],
    staleTime: 5 * 60 * 1000,
    enabled: ready, // only run when inputs are ready
    queryFn: async () => {
      if (!ready) return [];
      const foodtokens   = tokenData ? tokenData.filter(b => b.type === 'ERC1155').length + 1 : 0;
      const month        = new Date().toLocaleDateString('en-US', { month: 'long' });
      const MINCAP       = Number(process.env.REACT_APP_MIN_CAP ?? 100);
      const chainSync    = db?.chain == db?.union?.chain; // losy comparison string vs number
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
        { i: 1, 
          active: !tokenData?.some(i => i.sym === 'nIN' && i.bal > 0) && !grantData.initialClaim, 
          img: "images/label-06.webp", 
          tx_nmb: 0, 
          click: () => collectGrant(), 
          title: 'Claim your first grant.', 
          subtitle: 'Grants reward you for being active.',
          btn: 'Claim',
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
        { i: 3, 
          active: LAND?.current?.hasLand && grantData && grantData.alreadyClaimed == false, 
          img: "images/label-06.webp", 
          tx_nmb: 0, 
          click: () => collectGrant(db.address, db.union.address, foodtokens), 
          title: `Well done, you earned ${(grantData.pending * 100).toFixed(0)} nIN.`, 
          subtitle: `See how we calculate the ${month} reward.`, subclick: handleToggleView, sub_tx_nmb: { ix: 0, i: 43 },
          btn: 'Collect',
        },
        { i: 4, 
          active: Number(CAP?.current) > MINCAP, 
          img: "images/label-06.webp", 
          tx_nmb: { ix: 1, i: 0 }, 
          click: handleToggleView, 
          title: `Invest to reach the minimal loan cap`, 
          subtitle: `You need at least ${MINCAP} nIN to be eligible.`,
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
        ...(filteredTransferables.map((d, i) => ({
            i: i + 7, 
            active: isLeader && hasTransferables, 
            img: 'images/label-06.webp', 
            click: () => handleAcceptLoan(d.union, d.id, d.borrowerLabel ? d.borrowerLabel : d.borrower.slice(-15) , d.amount),
            title: `${d.borrowerLabel ? d.borrowerLabel : d.borrower.slice(-15)} requests a loan.`, 
            subtitle: `${d.amount} nIN.`,
            btn: 'Accept'
          })) || []), 
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

export const useTransferableLoans = (union, enabled) =>
  useQuery({
    queryKey: ['transferableLoans', union],
    queryFn: async () => {
      const url = `${process.env.REACT_APP_API_BASE_URL}/filter_events/transferableLoans`;
      console.log('fetching transferableLoans:', url, 'enabled', );
      const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: union })
    });
    if (!res.ok) throw new Error('transferableLoans failed');
    const json = await res.json();

    const knownAddressBook = {
      '0xaf7030023cf86611ffc5a71798a0f7022210f2b3': 'Carst',
      '0xaf48a2282fd8a3ccb52d17ef08fe5db7d346dbb7': 'Anand',
    };

    const resolveAddress = (addr) => {
      if (!addr) return addr;
      const match = knownAddressBook[addr.toLowerCase()];
      if (match) return match;
      if (union && union.toLowerCase() === addr.toLowerCase()) return 'Union';

      return `${addr.slice(0,6)}...${addr.slice(-4)}`;
    };

    const parseAmount = (raw) => {
      try {
        return Number(ethers.formatUnits(raw ?? '0', 18));
      } catch (e) {
        const fallback = Number(raw);
        return Number.isFinite(fallback) ? fallback : 0;
      }
    };

    const items = Array.isArray(json.items)
      ? json.items.map((i) => ({
          id: i.loan_id ?? i.id,
          borrower: i.borrower,
          borrowerLabel: resolveAddress(i.borrower),
          fund: i.fund,
          activity_stage: i.activity_stage,
          activity_checked_at: i.activity_checked_at,
          activity_stage_id: i.activity_stage_id,
          displayName: i.display_name ?? resolveAddress(i.borrower),
          active: Boolean(i.active),
          amount: parseAmount(i.amount),
          rateBP: Number(i.rate_bp ?? i.rateBP ?? 0),
          maturityTs: i.maturity_ts,
          drawdownTs: i.drawdown_ts,
          milestone: i.milestone,
          milestoneDigest: i.milestone_digest,
          withincarryover: i.withincarryover ?? i.within_carryover ?? null,
          txHash: i.tx_hash,
          union: i.union_addr ?? union,
          fastDraw: Boolean(i.fast_draw ?? i.fastDraw ?? false),
        }))
      : [];

    return { ...json, items }; // { union, refresh, count, items }
    },
    enabled: enabled && !!union,
    staleTime: 60 * 60 * 1000
  });
