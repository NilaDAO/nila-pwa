import { useMemo, useCallback, useEffect, useState } from 'react';
import { ethers } from "ethers";
import { useDataContext } from "../utils/NavigationContext";
import { useDecryptKey } from "./useDecryptKey.ts";
import { useQueryClient } from "@tanstack/react-query";
import nilaTokenAbi from '../components/ABI/NilaToken.json';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';
const nilaFxPoolAbi = (nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact;
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
const genericFundCoreAbi = (genericFundCoreArtifact as any).abi ?? genericFundCoreArtifact;
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
const genericFundViewerAbi = (genericFundViewerArtifact as any).abi ?? genericFundViewerArtifact;
import { useTx } from "./useTx.ts";
import { InterfaceAbi, Contract, BaseContract } from "ethers";
import { updateUserChain } from "../utils/cognito_helpers.js";
import { deleteAllItems, deleteItem, setDBitem } from "../utils/db";
import { useHardReload } from '../hooks/useHardReload.js';

/**
 * `useWallet` – create & memoise a read‑write Ethers v6 `Wallet` + its `provider`.
 * Pass the **hex‑string private key** and the RPC URL (defaults to Polygon Amoy).
 * Returns `{ provider, wallet }` – either can be `undefined` when the PK/url is missing
 * so call‑sites can early‑bail gracefully.
 */
export function useSwitchMain() {
  const { db } = useDataContext();
  const qc         = useQueryClient();
  const hardReload = useHardReload();

  const handleLogout = () => {
      // remove all storages, incl SW Cache, reload app
      document.cookie = "offsite=; Max-Age=0; path=/;";
      deleteAllItems()
      hardReload()
  }

  // Switch app state to mainnet: update Cognito, persist locally, clear caches.
  const switchToMain = async () => {
    const accessToken  = db?.jwt_token;
    const refreshToken = db?.refresh_token;
    const phone        = db?.phone;
    const nextChain    = db?.union.chain; // move to Polygon mainnet
    if (!accessToken && !refreshToken && !phone) throw new Error("Missing credentials for Cognito update");
    await updateUserChain({
      accessToken,
      refreshToken,
      chainId: String(nextChain),
      phoneNumber: phone,
    }).catch((err: any) => {
      console.error("Failed to update chain in Cognito", err);
      throw err;
    });
    
    // ------- soft reload (does not subsidy) -------
    /*
    await Promise.all([
      deleteItem("union_fund_sums", "Init"),
      deleteItem("farmname", "Init"),
      deleteItem("reloadUnion", "Init"),
      deleteItem("reload", "Init"),
      deleteItem("debts", "Init"),
      deleteItem("thumb", "Init"),
    ]);
    await setDBitem("chain", nextChain, "Init");
    console.log("set chain in DB to", nextChain);
    
    qc.invalidateQueries();
    qc.removeQueries({ queryKey: ["land"], exact: false });
    qc.removeQueries({ queryKey: ["sums"], exact: false }); // useSummary
    window.location.reload();
    */
    // ------- hard reload (include subsidy) -------
    handleLogout()
  };

  return { switchToMain } as const;
}

export function useSendTokens() {

  const erc20Abi = useMemo(
      () => [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function transfer(address to, uint256 amount) returns (bool)",
      ],
      []
    );
  const MAIN_POLYGON_TOKENS = [
    { addr: process.env.REACT_APP_NIN_MAIN!, abi: erc20Abi, decimals: 18, key: "NILA" },
    { addr: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", abi: erc20Abi, decimals: 6,  key: "USDT" },
  ];
  
  const runTx      = useTx();           // uses useTx inside
  const { wallet } = useWallet();
  const qc         = useQueryClient();
  const nin = useContract( MAIN_POLYGON_TOKENS[0].addr, erc20Abi, wallet);
  const usdt = useContract( MAIN_POLYGON_TOKENS[1].addr, erc20Abi, wallet);
  
  /** fire the transfer */
  const sendTokens = async (to: string, amt: number, asset: string = 'nIN') => {
    if (!wallet)            throw new Error("Wallet not ready");
    if (!amt || amt <= 0)   throw new Error("Enter a positive amount");
    if (!ethers.isAddress(to)) throw new Error("Bad address");
    let token
    let big : BigInt
    if (asset.toUpperCase() === 'NIN'){
      token = nin
      big = ethers.parseUnits(amt.toString(), 18);
    } else if (asset.toUpperCase() === 'USDT') {
      token = usdt
      big = ethers.parseUnits(amt.toString(), 6);
    } else {
      throw new Error("Invalid asset");
    }

    console.log("sendTokens", to, big.toString(), asset);
    await runTx(() => token!.transfer(to, big), {
      onSuccess: (receipt : any) => {
        qc.invalidateQueries({ queryKey: ["balances"] })
        const tag = receipt?.hash ? receipt.hash.slice(-20) : undefined;
        return tag;
      }
    });
  };

  return { sendTokens } as const;
}

type FxOptions = {
  address?: string;
  ninDecimals?: number;
  usdtDecimals?: number;
  usdtAddress?: string;
  ninAddress?: string;
};

/**
 * Swap between USDt and nIN via the FX pool.
 * - send USDt → `mintNin`
 * - send nIN  → `redeemNin`
 */
const _API_BASE = process.env.REACT_APP_API_BASE_URL;

function _notifyLPs(unionAddr: string, offerType: 'cash_offer' | 'redeem_order', inrValue: bigint, offerId: bigint) {
  fetch(`${_API_BASE}/lp/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ union_addr: unionAddr, offer_type: offerType, inr_value: Number(inrValue), offer_id: Number(offerId) }),
  }).catch(() => {});
}

export function useFxPool(opts: FxOptions = {}) {
  const { wallet } = useWallet();
  const runTx      = useTx();
  const qc         = useQueryClient();
  const fxAddress   = opts.address ?? process.env.REACT_APP_FX_POOL_MAIN;
  const ninDecimals = opts.ninDecimals ?? 18;
  const usdtDecimals = opts.usdtDecimals ?? 6;
  const [usdtAddress, setUsdtAddress] = useState(opts.usdtAddress ?? process.env.REACT_APP_USDT_ADDRESS);
  const [ninAddress, setNinAddress] = useState(opts.ninAddress ?? process.env.REACT_APP_NIN_MAIN);

  const fxPool = useContract(fxAddress, nilaFxPoolAbi, wallet);
  const viewerAddress = process.env.REACT_APP_VIEWER_MAIN;
  const viewer = useContract(viewerAddress, genericFundViewerAbi, wallet);
  const erc20Abi = useMemo(
    () => [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
    ],
    []
  );
  const usdt = useContract(usdtAddress, erc20Abi, wallet);
  const nin = useContract(ninAddress, erc20Abi, wallet);

  // fetch NIN address from the pool if not provided
  useEffect(() => {
    if (ninAddress || !fxPool) return;
    (async () => {
      try {
        const addr = await fxPool.nin();
        if (ethers.isAddress(addr)) setNinAddress(addr);
      } catch (err) {
        console.warn("Failed to fetch NIN address from fx pool", err);
      }
    })();
  }, [ninAddress, fxPool]);

  useEffect(() => {
    if (usdtAddress || !fxPool) return;
    (async () => {
      try {
        const addr = await fxPool.usdt();
        if (ethers.isAddress(addr)) setUsdtAddress(addr);
      } catch (err) {
        console.warn("Failed to fetch USDT address from fx pool", err);
      }
    })();
  }, [usdtAddress, fxPool]);

  const ensureNinAllowance = useCallback(
  async (needed: bigint) => {
    if (!wallet || !nin || !fxAddress) throw new Error("NIN contract or wallet not ready");
    const allowance: bigint = await nin.allowance(wallet.address, fxAddress);
    if (allowance >= needed) return;
    await runTx(() => nin.approve(fxAddress, needed), {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
      },
    });
  },
  [nin, wallet, fxAddress, runTx, qc]
  );

  const ensureUsdtAllowance = useCallback(
    async (needed: bigint) => {
      if (!wallet || !usdt || !fxAddress) throw new Error("USDT contract or wallet not ready");
      const allowance: bigint = await usdt.allowance(wallet.address, fxAddress);
      if (allowance >= needed) return;
      await runTx(() => usdt.approve(fxAddress, needed), {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["balances"] });
        },
      });
    },
    [usdt, wallet, fxAddress, runTx, qc]
  );

  const mintNin = useCallback(async (usdtAmount: number) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    if (!fxAddress) throw new Error("FX pool address missing");
    if (!usdt) throw new Error("USDT contract not ready");
    if (!usdtAmount || usdtAmount <= 0) throw new Error("Enter a positive amount");
    console.log("usdt send: ", usdtAmount);
    // avoid floating point tails (e.g. 0.28301999999999) by clamping to allowed decimals
    const amt = ethers.parseUnits(usdtAmount.toFixed(usdtDecimals), usdtDecimals);
    await ensureUsdtAllowance(amt);
    return runTx(async () => {
      // staticcall first to ensure it won't revert
      await fxPool.mintNin.staticCall(amt);
      return fxPool.mintNin(amt);
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
      },
      onError: (err: any) => {
        console.error("mint NIN failed:", err);
      },    
    });
  }, [fxPool, wallet, fxAddress, usdtDecimals, runTx, qc, usdt, ensureUsdtAllowance]);

  const redeemNin = useCallback(async (ninAmount: number) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    if (!fxAddress) throw new Error("FX pool address missing");
    if (!ninAmount || ninAmount <= 0) throw new Error("Enter a positive amount");
    const amt = ethers.parseUnits(ninAmount.toString(), ninDecimals);
    await ensureNinAllowance(amt);
    return runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      await fxPool.redeemNin.staticCall(amt);
      return fxPool.redeemNin(amt, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
      },
      onError: (err: any) => {
        console.error("redeem NIN failed:", err);
      },    
    });
  }, [fxPool, wallet, fxAddress, ninDecimals, runTx, qc]);

  const quoteRedeem = useCallback(async (ninAmount: number) => {
    if (!fxPool) throw new Error("FX pool not ready");
    const amt = ethers.parseUnits(ninAmount.toString(), ninDecimals);
    return fxPool.previewRedeem(amt);
  }, [fxPool, ninDecimals]);

  // ScanPurpose enum: 0 = INVEST (give/contribute), 1 = REPAY, 2 = DISBURSE
  // Returns escrowId parsed from CashScanMint event so caller can chain AcceptLoan.
  const cashScanMint = useCallback(async (
    unionAddr: string,
    loanType: string,
    inrValue: number,
    scanHash: string,
    purpose: 0 | 1 | 2,
    loanId: string,
    member: string,
    escrowIdToResolve: bigint = 0n,
  ): Promise<bigint> => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    // inrValue is a raw integer (e.g. 500 for ₹500) — contract scales by 1e18 internally.
    const rawInrValue = BigInt(Math.round(inrValue));
    const loanTypeBytes = ethers.encodeBytes32String(loanType);
    const fxIface = new ethers.Interface((nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact);
    let escrowId = 0n;
    await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      await fxPool.cashScanMint.staticCall(unionAddr, loanTypeBytes, rawInrValue, scanHash, purpose, loanId, member, escrowIdToResolve);
      return fxPool.cashScanMint(unionAddr, loanTypeBytes, rawInrValue, scanHash, purpose, loanId, member, escrowIdToResolve, { nonce });
    }, {
      onSuccess: (receipt: any) => {
        for (const log of receipt?.logs ?? []) {
          try {
            const parsed = fxIface.parseLog(log);
            if (parsed?.name === 'CashScanMint') escrowId = parsed.args.escrowId;
          } catch {}
        }
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["unionGenericFunds"] });
        qc.invalidateQueries({ queryKey: ["fundsData"] });
      },
      onError: (err: any) => { console.error("cashScanMint failed:", err); },
    });
    return escrowId;
  }, [fxPool, wallet, runTx, qc]);

  // Returns the most recent active (status=0) escrowId for a union, or 0n if none.
  // Scans the last 50 escrows backwards.
  const getActiveEscrowForUnion = useCallback(async (
    unionAddr: string,
  ): Promise<bigint> => {
    if (!fxPool) throw new Error("FX pool not ready");
    const nextId: bigint = await fxPool.nextEscrowId();
    const start = nextId > 50n ? nextId - 50n : 0n;
    for (let id = nextId - 1n; id >= start; id--) {
      try {
        const escrow = await fxPool.escrows(id);
        if (
          escrow.union?.toLowerCase() === unionAddr.toLowerCase() &&
          Number(escrow.status) === 0
        ) {
          return id;
        }
      } catch {}
    }
    return 0n;
  }, [fxPool]);

  // Accept a pending loan — disburses nIN to borrower and resolves cash escrow.
  const acceptLoan = useCallback(async (
    unionAddr: string,
    loanId: string,
    escrowId: bigint,
  ) => {
    const coreAddr = process.env.REACT_APP_CORE_MAIN!;
    if (!wallet) throw new Error("Wallet not ready");
    const core = new ethers.Contract(coreAddr, genericFundCoreAbi, wallet);
    return runTx(async () => {
      // Fetch nonce inside exec so it's as fresh as possible, bypassing any wallet cache.
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      await core.AcceptLoan.staticCall(unionAddr, loanId, escrowId);
      return core.AcceptLoan(unionAddr, loanId, escrowId, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["unionGenericFunds"] });
      },
      onError: (err: any) => { console.error("AcceptLoan failed:", err); },
    });
  }, [wallet, runTx, qc]);

  // Step 1: burn farmer's nIN — USDT stays in pool. FxPool has BURNER_ROLE — no allowance needed.
  const redeemFarmerNin = useCallback(async (
    farmer: string,
    ninAmount: bigint,
  ): Promise<bigint> => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    let usdtOut = 0n;
    let txError: unknown = null;
    await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      // staticCall returns usdtOut — capture before sending the real tx
      usdtOut = await fxPool.redeemFarmerNin.staticCall(farmer, ninAmount) as bigint;
      return fxPool.redeemFarmerNin(farmer, ninAmount, { nonce });
    }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["balances"] }); },
      onError: (err: any) => { txError = err; console.error("redeemFarmerNin failed:", err); },
    });
    if (txError) throw txError;
    return usdtOut;
  }, [fxPool, wallet, runTx, qc]);

  // Step 2: record earmarked USDT + locked nIN as a cash request — USDT stays in pool, no allowance needed.
  // CS027: ninAmount added — the nIN locked by redeemFarmerNin, stored for deferred burn on delivery/cancel.
  const postRedeemOrder = useCallback(async (
    unionAddr: string,
    farmer: string,
    inrValue: bigint,
    usdtAmount: bigint,
    ninAmount: bigint,
    feeBP: number,
  ): Promise<bigint> => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    let orderId = 0n;
    let txError: unknown = null;
    const fxIface = new ethers.Interface((nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact);
    await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      await fxPool.postRedeemOrder.staticCall(unionAddr, farmer, inrValue, usdtAmount, ninAmount, feeBP);
      return fxPool.postRedeemOrder(unionAddr, farmer, inrValue, usdtAmount, ninAmount, feeBP, { nonce });
    }, {
      onSuccess: (receipt: any) => {
        for (const log of receipt?.logs ?? []) {
          try {
            const parsed = fxIface.parseLog(log);
            if (parsed?.name === 'RedeemOrderPosted') orderId = parsed.args.orderId;
          } catch {}
        }
        _notifyLPs(unionAddr, 'redeem_order', inrValue, orderId);
        qc.invalidateQueries({ queryKey: ["balances"] });
      },
      onError: (err: any) => { txError = err; console.error("postRedeemOrder failed:", err); },
    });
    if (txError) throw txError;
    return orderId;
  }, [fxPool, wallet, runTx, qc]);

  // LP commits to bring cash — registers address on-chain, no USDT needed.
  const commitCashRequest = useCallback(async (orderId: bigint) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    return runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      await fxPool.commitCashRequest.staticCall(orderId);
      return fxPool.commitCashRequest(orderId, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["globalOpenCashOffers"] });
        qc.invalidateQueries({ queryKey: ["globalOpenRedeemOrders"] });
        qc.invalidateQueries({ queryKey: ["pendingCashDeliveries"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
      },
      onError: (err: any) => { console.error("commitCashRequest failed:", err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // Step 3: union counts bills, confirms delivery → USDT released to LP.
  const confirmCashDelivery = useCallback(async (orderId: bigint) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    return runTx(async () => {
      await fxPool.confirmCashDelivery.staticCall(orderId);
      return fxPool.confirmCashDelivery(orderId);
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["pendingCashDeliveries"] });
      },
      onError: (err: any) => { console.error("confirmCashDelivery failed:", err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // Post a CashOffer: union offers INR cash (backed by escrow) for USDT from LP.
  const postCashOffer = useCallback(async (
    unionAddr: string,
    escrowId: bigint,
    feeBP: number,
  ): Promise<bigint> => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    let offerId = 0n;
    const fxIface = new ethers.Interface((nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact);
    await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      await fxPool.postCashOffer.staticCall(unionAddr, escrowId, feeBP);
      return fxPool.postCashOffer(unionAddr, escrowId, feeBP, { nonce });
    }, {
      onSuccess: (receipt: any) => {
        let inrValue = 0n;
        for (const log of receipt?.logs ?? []) {
          try {
            const parsed = fxIface.parseLog(log);
            if (parsed?.name === 'CashOfferPosted') {
              offerId = parsed.args.offerId;
              inrValue = parsed.args.inrValue;
            }
          } catch {}
        }
        _notifyLPs(unionAddr, 'cash_offer', inrValue, offerId);
        qc.invalidateQueries({ queryKey: ["balances"] });
      },
      onError: (err: any) => { console.error("postCashOffer failed:", err); },
    });
    return offerId;
  }, [fxPool, wallet, runTx, qc]);

  // LP fills a RedeemOrder (PWA) = contract CashOffer.
  // LP deposits USDT on-chain; union delivers ₹ cash to LP off-chain.
  // LP's return is the physical INR cash (no nIN minted).
  const lpFillRedeemOrder = useCallback(async (offerId: bigint) => {
    if (!fxPool || !wallet) throw new Error('FX pool or wallet not ready');
    const offer = await fxPool.cashOffers(offerId);
    const escrow = await fxPool.escrows(offer.escrowId);
    // Same formula as resolveEscrowUsdt: usdtAmount = ninAmount * 1e8 / mintRate / 1e12
    const usdtAmount = (escrow.ninAmount * 10n ** 8n) / escrow.mintRate / 10n ** 12n;
    await ensureUsdtAllowance(usdtAmount);
    return runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send('eth_getTransactionCount', [wallet.address, 'pending']);
      await fxPool.fillCashOffer.staticCall(offerId);
      return fxPool.fillCashOffer(offerId, { nonce });
    }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['balances'] }); },
      onError: (err: any) => { console.error('lpFillRedeemOrder failed:', err); },
    });
  }, [fxPool, wallet, runTx, qc, ensureUsdtAllowance]);

  // LP commits to bring cash to union — alias for commitCashRequest, kept for OfferList compat.
  const lpFillCashOffer = useCallback(async (orderId: bigint) => {
    if (!fxPool || !wallet) throw new Error('FX pool or wallet not ready');
    return runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send('eth_getTransactionCount', [wallet.address, 'pending']);
      await fxPool.commitCashRequest.staticCall(orderId);
      return fxPool.commitCashRequest(orderId, { nonce });
    }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['globalOpenCashOffers'] }); },
      onError: (err: any) => { console.error('lpFillCashOffer failed:', err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // Union cancels an open RedeemOrder (status=0) before any LP fills it.
  // Contract returns locked USDT to the union.
  const cancelRedeemOrder = useCallback(async (orderId: bigint) => {
    if (!fxPool || !wallet) throw new Error('FX pool or wallet not ready');
    return runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send('eth_getTransactionCount', [wallet.address, 'pending']);
      await fxPool.cancelRedeemOrder.staticCall(orderId);
      return fxPool.cancelRedeemOrder(orderId, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['balances'] });
        qc.invalidateQueries({ queryKey: ['unionOpenRedeemOrdersList'] });
        qc.invalidateQueries({ queryKey: ['globalOpenCashOffers'] });
        qc.invalidateQueries({ queryKey: ['openCashOffers'] });
      },
      onError: (err: any) => { console.error('cancelRedeemOrder failed:', err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // Union cancels an open CashOffer (status=0) before any LP fills it.
  // No tokens move — postCashOffer never locked anything; the underlying
  // CashEscrow stays active and can be re-offered or allowed to expire.
  // Contract function lands with plan 019 Phase 1b.
  const cancelCashOffer = useCallback(async (offerId: bigint) => {
    if (!fxPool || !wallet) throw new Error('FX pool or wallet not ready');
    return runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send('eth_getTransactionCount', [wallet.address, 'pending']);
      await fxPool.cancelCashOffer.staticCall(offerId);
      return fxPool.cancelCashOffer(offerId, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['unionOpenCashOffersList'] });
        qc.invalidateQueries({ queryKey: ['globalOpenRedeemOrders'] });
        qc.invalidateQueries({ queryKey: ['openCashOffers'] });
      },
      onError: (err: any) => { console.error('cancelCashOffer failed:', err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // LP reclaims USDT from a filled RedeemOrder (PWA) = contract CashOffer,
  // if union failed to deliver ₹ cash within the deadline.
  const lpReclaimRedeemOrder = useCallback(async (offerId: bigint) => {
    if (!fxPool || !wallet) throw new Error('FX pool or wallet not ready');
    return runTx(async () => {
      await fxPool.reclaimCashOfferUsdt.staticCall(offerId);
      return fxPool.reclaimCashOfferUsdt(offerId);
    }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['balances'] }); },
      onError: (err: any) => { console.error('lpReclaimRedeemOrder failed:', err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // Union confirms cash delivered to LP → offer complete.
  const confirmCashOfferDelivered = useCallback(async (offerId: bigint) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    return runTx(async () => {
      // DEBUG: the contract's require(o.union == msg.sender && o.status == 1, "invalid")
      // doesn't say which half failed — log both sides so a revert is diagnosable
      // without guessing. Remove once the stuck-offer issue is understood.
      try {
        const o = await fxPool.cashOffers(offerId);
        console.log("[confirmCashOfferDelivered] offer", offerId.toString(), {
          "o.union": o.union,
          "wallet.address": wallet.address,
          addressMatches: (o.union as string).toLowerCase() === wallet.address.toLowerCase(),
          "o.status": Number(o.status),
          statusIsFilled: Number(o.status) === 1,
        });
      } catch (e) { console.warn("[confirmCashOfferDelivered] debug read failed:", e); }
      await fxPool.confirmCashOfferDelivered.staticCall(offerId);
      return fxPool.confirmCashOfferDelivered(offerId);
    }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["balances"] }); },
      onError: (err: any) => { console.error("confirmCashOfferDelivered failed:", err); },
    });
  }, [fxPool, wallet, runTx, qc]);

  // Partially or fully resolve an active escrow (direct cash-out path for union operators).
  const resolveEscrowCash = useCallback(async (escrowId: bigint, amount: bigint, unionAddr: string) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    const receipt = await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      return fxPool.resolveEscrowCash(escrowId, amount, unionAddr, { nonce });
    }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["unionCashReserve"] }); },
      onError: (err: any) => { console.error("resolveEscrowCash failed:", err); },
    });
    if (!receipt) throw new Error("resolveEscrowCash did not confirm");
    return receipt;
  }, [fxPool, wallet, runTx, qc]);

  // Read a member's nIN token balance (used by CashOutForm to cap payout at what the wallet holds).
  const getNinBalance = useCallback(async (addr: string): Promise<bigint> => {
    if (!nin) throw new Error("NIN contract not ready");
    return nin.balanceOf(addr) as Promise<bigint>;
  }, [nin]);

  // Read the nIN allowance granted to a spender (used by CashOutForm to cap payout at the permit amount).
  const getNinAllowance = useCallback(async (owner: string, spender: string): Promise<bigint> => {
    if (!nin) throw new Error("NIN contract not ready");
    return nin.allowance(owner, spender) as Promise<bigint>;
  }, [nin]);

  // CS016: Atomic cash-out — burn farmer nIN + drain escrows in one tx (no partial-completion window).
  const burnAndDrainEscrows = useCallback(async (farmer: string, burnAmount: bigint, escrowIds: bigint[], amounts: bigint[]) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    const receipt = await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      return fxPool.burnAndDrainEscrows(farmer, burnAmount, escrowIds, amounts, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["unionGenericFunds"] });
        qc.invalidateQueries({ queryKey: ["unionCashReserve"] });
      },
      onError: (err: any) => { console.error("burnAndDrainEscrows failed:", err); },
    });
    if (!receipt) throw new Error("burnAndDrainEscrows did not confirm");
    return receipt;
  }, [fxPool, wallet, runTx, qc]);

  // Union burns nIN held by a member (cash-out: member surrenders nIN, leader hands physical INR).
  const burnFarmerNin = useCallback(async (farmer: string, amount: bigint) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    const receipt = await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      return fxPool.burnFarmerNin(farmer, amount, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["unionGenericFunds"] });
      },
      onError: (err: any) => { console.error("burnFarmerNin failed:", err); },
    });
    // runTx swallows errors via onError — re-throw so callers can sequence txs safely
    if (!receipt) throw new Error("burnFarmerNin did not confirm");
    return receipt;
  }, [fxPool, wallet, runTx, qc]);

  // --- Three-layer reactive accounting ---

  // Read three-layer health for a union: usdtDeposited, usdtPromised, cashEscrowNin, healthRatio.
  const systemHealth = useCallback(async (unionAddr: string, loanType: string) => {
    if (!viewer || !fxAddress) throw new Error("Viewer or FX pool address not ready");
    const [usdtDeposited, usdtPromised, cashEscrowNin, healthRatio] =
      await viewer.systemHealth(fxAddress, unionAddr, loanType);
    return { usdtDeposited, usdtPromised, cashEscrowNin, healthRatio };
  }, [viewer, fxAddress]);

  // FIFO deposit: union deposits USDT, protocol routes to oldest active escrows.
  const depositUsdtFifo = useCallback(async (unionAddr: string, usdtAmount: bigint) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    await ensureUsdtAllowance(usdtAmount);
    const receipt = await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      return fxPool.depositUsdt(unionAddr, usdtAmount, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["unionCashReserve"] });
        qc.invalidateQueries({ queryKey: ["balances"] });
      },
      onError: (err: any) => { console.error("depositUsdt failed:", err); },
    });
    if (!receipt) throw new Error("depositUsdt did not confirm");
    return receipt;
  }, [fxPool, wallet, runTx, qc, ensureUsdtAllowance]);

  // Junior cash withdrawal: investor fills a CashOffer with nIN (consent = approve + call).
  const fillCashOfferWithNin = useCallback(async (offerId: bigint, ninAmount: bigint) => {
    if (!fxPool || !wallet) throw new Error("FX pool or wallet not ready");
    await ensureNinAllowance(ninAmount);
    const receipt = await runTx(async () => {
      const nonce = await (wallet.provider as ethers.JsonRpcProvider).send("eth_getTransactionCount", [wallet.address, "pending"]);
      return fxPool.fillCashOfferWithNin(offerId, { nonce });
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["unionCashReserve"] });
      },
      onError: (err: any) => { console.error("fillCashOfferWithNin failed:", err); },
    });
    if (!receipt) throw new Error("fillCashOfferWithNin did not confirm");
    return receipt;
  }, [fxPool, wallet, runTx, qc, ensureNinAllowance]);

  return {
    fxPool,
    mintNin,
    redeemNin,
    quoteRedeem,
    cashScanMint,
    resolveEscrowCash,
    getActiveEscrowForUnion,
    acceptLoan,
    getNinBalance,
    getNinAllowance,
    burnFarmerNin,
    burnAndDrainEscrows,
    redeemFarmerNin,
    postRedeemOrder,
    commitCashRequest,
    confirmCashDelivery,
    postCashOffer,
    confirmCashOfferDelivered,
    lpFillRedeemOrder,
    lpFillCashOffer,
    lpReclaimRedeemOrder,
    cancelRedeemOrder,
    cancelCashOffer,
    systemHealth,
    depositUsdtFifo,
    fillCashOfferWithNin,
  } as const;
  
}

export function useTopUpGas() {
  const { wallet } = useWallet();
  const runTx      = useTx();
  const qc         = useQueryClient();
  const ninAddress = process.env.REACT_APP_NIN_MAIN!;
  const to         = process.env.REACT_APP_POWER!;
  const nin        = useContract(ninAddress, nilaTokenAbi, wallet);

  /** fire the transfer */
  const topUpGas = async (amt: number) => {
    if (!wallet)            throw new Error("Wallet not ready");
    if (!amt || amt <= 0)   throw new Error("Enter a positive amount");
    if (!ethers.isAddress(ninAddress)) throw new Error("Bad nIN address");
    const big = ethers.parseUnits(amt.toString(), 18);
    console.log("topUpGas", big.toString());
    // change this to the POLSWAP contract call 
    await runTx(() => nin!.transfer(to, big), {
      onSuccess: (receipt : any) => {
        qc.invalidateQueries({ queryKey: ["balances"] })
        const tag = receipt?.hash ? receipt.hash.slice(-20) : undefined;
        return tag;
      }
    });
  }   

  return { topUpGas } as const;
} 

export function useBasicProvider() {
  const chainId = Number(process.env.REACT_APP_CHAIN_ID) || 137;
  const rpcUrl = chainId === 137 ? process.env.REACT_APP_RPC_ALCHEMY! : process.env.REACT_APP_RPC!;
  // simply set the provider
  return useMemo(() => {
    if (!rpcUrl) {
      console.error('🚨 No RPC URL configured');
      return { basicprovider: undefined } as const;
    }
    return { basicprovider: new ethers.JsonRpcProvider(rpcUrl) } as const;
  }, [rpcUrl]);
}

export function useProvider() {
  const chainId = Number(process.env.REACT_APP_CHAIN_ID) || 137;
  const rpcUrl = chainId === 137 ? process.env.REACT_APP_RPC_ALCHEMY! : process.env.REACT_APP_RPC!;
  // simply set the provider
  return useMemo(() => {
    if (!rpcUrl) {
      console.error('🚨 No RPC URL configured');
      return { provider: undefined } as const;
    }
    return { provider: new ethers.JsonRpcProvider(rpcUrl) } as const;
  }, [rpcUrl]);
}

export function useWallet() {
  const { db } = useDataContext();
  const address = db?.address;
  const salt = db?.salt;
  const chainId = Number(process.env.REACT_APP_CHAIN_ID) || 137;
  const rpcUrl = chainId === 137 ? process.env.REACT_APP_RPC_ALCHEMY! : process.env.REACT_APP_RPC!;

  const { data: pk } = useDecryptKey(db,address, salt);
  return useMemo(() => {
    if (!pk) return { provider: undefined, wallet: undefined } as const;
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(pk, provider);
      return { provider, wallet } as const;
    } catch (err) {
      console.error("useWallet error", err);
      return { provider: undefined, wallet: undefined } as const;
    }
  }, [pk, rpcUrl]);
}

export function useContract<C extends BaseContract = Contract>(
  address?: string,
  abi?: InterfaceAbi,
  signerOrProvider?: ethers.Signer | ethers.Provider,
): C | undefined {
  return useMemo(() => {
    if (!address || !abi || !signerOrProvider) return undefined;
    if (!ethers.isAddress(address)) {
      console.warn("useContract: invalid address", address);
      return undefined;
    }
    try {
      return new ethers.Contract(address, abi, signerOrProvider) as unknown as C;
    } catch (err) {
      console.error("useContract error", err);
      return undefined;
    }
  }, [address, abi, signerOrProvider]);
}
