import { useMemo, useCallback, useEffect, useState } from 'react';
import { ethers } from "ethers";
import { useDataContext } from "../utils/NavigationContext";
import { useDecryptKey } from "./useDecryptKey.ts";
import { useQueryClient } from "@tanstack/react-query";
import nilaTokenAbi from '../components/ABI/NilaToken.json';
import nilaFxPoolAbi from '../components/ABI/NilaFxPool.json';
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
    { addr: "0xD1F49598E42D30Cd900Ea86244485ca0647d31C7", abi: erc20Abi, decimals: 18, key: "NILA" }, // NILA to nIN
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
  const erc20Abi = useMemo(
    () => [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
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
      // staticcall first to ensure it won't revert
      await fxPool.redeemNin.staticCall(amt);
      return fxPool.redeemNin(amt);
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
    return fxPool.quoteRedeem(amt);
  }, [fxPool, ninDecimals]);

  return { fxPool, mintNin, redeemNin, quoteRedeem } as const;
  
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
  // this provider uses the free polygon-rpc.com RPC
  const { db } = useDataContext();
  const chainId = Number(db?.chain);
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
  const { db } = useDataContext();
  const chainId = Number(db?.chain);
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
  const chainId = Number(db?.chain);
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
