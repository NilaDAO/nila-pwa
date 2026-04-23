import { useMemo } from "react";
import { useQuery, useQueryClient }  from "@tanstack/react-query";
import { ethers, toBeHex, zeroPadValue, getBytes, decodeBytes32String,ContractTransactionResponse } from "ethers";
import { useTx } from "./useTx.ts";
import { useProvider, useBasicProvider, useWallet, useContract } from "./useWallet.ts";
import useTouch from "./useTouch";
import MulticallAbi  from "../components/ABI/MultiCall3.json";
import NilaNINV2Artifact from '../components/ABI/NilaNINV2.json';
const nilaTokenAbi = NilaNINV2Artifact.abi;
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
const genericFundViewerAbi = genericFundViewerArtifact.abi;
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
const genericFundCoreAbi = genericFundCoreArtifact.abi;
import { useDataContext, useNavContext, useViewModeContext } from "../utils/NavigationContext.js";
import { setDBitem } from '../utils/db';
import { loadGenericFundData } from '../utils/loadfund_helpers.ts';

/**
 * Hook to fetch data for multiple fund contracts in one multicall:
 * @param provider ethers provider
 * @param funds    array of fund contract addresses
 * @param investor address of the investor/user
 */

const genericFundViewerAddress: string = process.env.REACT_APP_VIEWER_MAIN!;
const genericFundCoreAddress: string = process.env.REACT_APP_CORE_MAIN!;
const genericRolesAddress: string = process.env.REACT_APP_ROLES_MAIN!;
const tokenAddress: string = process.env.REACT_APP_NIN_MAIN!;

console.log('[nila:contracts]', {
  rpc:       process.env.REACT_APP_RPC,
  api:       process.env.REACT_APP_API_BASE_URL,
  nin:       process.env.REACT_APP_NIN_MAIN,
  fxPool:    process.env.REACT_APP_FX_POOL_MAIN,
  core:      process.env.REACT_APP_CORE_MAIN,
  viewer:    process.env.REACT_APP_VIEWER_MAIN,
  landTitle: process.env.REACT_APP_LAND_TITLE_MAIN,
  roles:     process.env.REACT_APP_ROLES_MAIN,
});

const PAYBACK_PERIOD = 1814400 // 3 weeks
const decimals = 18

const PERMIT_TYPES = { Permit: [
  { name: 'owner',    type: 'address' },
  { name: 'spender',  type: 'address' },
  { name: 'value',    type: 'uint256' },
  { name: 'nonce',    type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]};

async function signPermit(wallet: ethers.Signer, spender: string, value: bigint, nonce: bigint, deadline: number) {
  const chainId = (await wallet.provider!.getNetwork()).chainId;
  const verifyingContract = tokenAddress;
  const domain = { name: 'Nila Note', version: '1', chainId, verifyingContract };
  const permitValue = { owner: await wallet.getAddress(), spender, value, nonce, deadline };
  return ethers.Signature.from(await (wallet as ethers.Wallet).signTypedData(domain, PERMIT_TYPES, permitValue));
}

export const RAY = 10n ** 27n;

export class SoftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SoftError";
  }
}

export const minBigInt = (a: bigint, b: bigint) => (a < b ? a : b);

export function toUnixSeconds(ts: bigint | number | string): bigint {
  return typeof ts === 'bigint' ? ts : BigInt(ts);
}

export function toUnixSecondsNumber(ts: bigint | number | string): number {
  const sec = toUnixSeconds(ts);
  if (sec > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Unix seconds too large for Number');
  }
  return Number(sec);
}

export const asBytes32 = (h: string) => {
    const x = h.startsWith("0x") ? h : `0x${h}`;
    const len = getBytes(x).length;
    if (len !== 32) throw new Error(`bytes32 expected (got ${len} bytes): ${x}`);
    return x;
  };

export type Hex = `0x${string}`;

export type GenericTokenData = {
  token: string;
  type: string;
  name: string;
  totals: { funds: number; lent: number };
  investor: { principal: number; junior: number, senior: number, seniorPendingSnap: number, pending: number, j_pending: number, s_pending: number; pendingWithdrawal: number; isFrozen: boolean };
  indexes: { junior: number, senior: number };
  entryIndexes: { junior: number, senior: number };
  loanType: string;
  headroom: number,
  requiredReserve: number,
  idleCash: number,
  juniorCash: number,
  seniorPrincipal: number,
  claimableReserved: number,
  previewRateBP: number,
  baseRateBP: number,
  bucketThresholdPct: number,
};

export type FundSpecific = {
    address: string;
    fund_id: string;
    fund_type: string;
    junior: number;
    senior: number;
    seniorPendingSnap: number;
    indexes: { junior: number, senior: number };
    entryIndexes?: { junior: number, senior: number };
    requiredReserve: number,
    previewRateBP: number,
    juniorCash: number,
    tokens: string[];
    principal: number;
    principal_raw: number;
    pending: number;
    pending_raw: number;
};

export type LoanEvent = {
  id: string,
  borrower: string,
  fund: string,
  displayName: string,
  amount: string,
  active: boolean,
  rateBP: number,
  maturityTs: number,
  drawdownTs: number,
  milestone: number,
  withincarryover: boolean
}

export type ActiveDebtObj = {
    union: string,      // address
    type: string,
    loanID: string,
    loanType: string,
    principal: number,     // uint256
    principalRepaid: number, // uint256
    outstanding: number,   // uint256
    rateBP: number,        // uint16 -> bigint in ethers v6
    harvestDate: number,
    dueDate: number,       // uint40 -> bigint
    closed: boolean,       // bool
    defaulted: boolean,    // bool
    borrower: string,      // address
    milestone: number,
    milestoneDigest: string, //bytes32
    digestTs: number,
    drawdownTs: number
};

export type Unions = [string,string[],string[],string]

export type GenericFundData = {
  fund: string;
  type: string; // 'INPUT' | 'PLANTING'
  tokens: GenericTokenData[];
};

export type DebtData = {
  token: string;
  name: string;
  debtor: { 
    principal: number; 
    repaid: number; 
    outstanding: number; 
    interestBP: number; 
    dueDate: number; 
    isFrozen: boolean };
};

export type LoanVoucherGeneric = {
  borrower:     string;
  loanId:       number;
  loanType:     string;
  chosenAmount: number;
  chosenRate:   number;
  fastDraw:     boolean;
  _fastDraw:    boolean;
  maturityTs:   number;
  maxAmount:    number;
  minRateBP:    number;
  paramsHash:   string;
  raw_maxAmount: string;   // Wei string from API — must NOT be coerced to number
  sig:          string;
  union:        string;
  escrowId:     number;    // cash-scan escrow id (0 = none)
  sosDate:      number;    // start-of-season unix timestamp (0 = none)
  nonce:        number;    // per-borrower replay-protection nonce
};

export type FundDebtData = {
  fund: string;
  tokens: DebtData[];
};

export type Enabled = { 
  enabled: boolean 
}

export function useUnionGenericFunds( unionAddress: string, enabled: Enabled) {
    const { provider }     = useProvider();
    const { db, setDebts } = useDataContext();

    return useQuery({
      queryKey: ["unionGenericFunds", genericFundCoreAddress, unionAddress],
      staleTime: 300_000,
      refetchOnWindowFocus: false, 
      refetchOnReconnect: true,
      retry: 3,
      retryDelay: (i) => Math.min(1000 * 2 ** i, 8000),
      networkMode: 'always', 
      enabled: enabled.enabled && !!provider && !!db?.address,
      queryFn: async () => {
        if (!provider || !db?.address) return [];
        const viewer = new ethers.Contract(genericFundViewerAddress, genericFundViewerAbi, provider);
        const mc = new ethers.Contract('0xcA11bde05977b3631167028862bE2a173976CA11',MulticallAbi,provider)
        const viewerIface = new ethers.Interface(genericFundViewerAbi);
        // call viewer get to load union fundtypes
        const raw_union: Unions = await viewer.getUnion(unionAddress)
        const raw_funds = raw_union[1]
        const funds = raw_funds.map((r,i)=> [unionAddress,decodeBytes32String(r),r,false,raw_union[0],raw_union[2][i]])// add a retired flag

        // for each fund type, check for loan ids
        const _ids = await viewer.getLoansByBorrower(unionAddress,db.address)
        const ids: string[] = [..._ids];
        const debts: ActiveDebtObj[] = [];
        
        console.log('ids..', ids)

        const calls: [string, string][] = ids.map((id) => 
          [genericFundViewerAddress,viewerIface.encodeFunctionData("getBorrowerInfo", [unionAddress, id])]
        );
        
        // If your Multicall has aggregate() -> (blockNumber, returnData)
        const [, ret]: [bigint, string[]] = await mc.aggregate.staticCall(calls);
        let i = 0;

        // 3) decode + shape for UI
        try {
          ret.forEach((data, j) => {
            let {
              borrower,
              loanType,
              principal,
              principalRepaid,
              rateBP,
              dueDate, // is maturityTs
              closed,
              defaulted,
              outstanding,
              milestone,
              milestoneDigest,
              digestTs,
              drawdownTs
            } = viewerIface.decodeFunctionResult("getBorrowerInfo", data) as unknown as ActiveDebtObj;
            // skip already closed/liquidated/defaulted loans
            if (closed) return [];

            console.log('LOAN:',borrower,
              loanType,
              principal,
              principalRepaid,
              rateBP,
              dueDate, // is maturityTs
              closed,
              defaulted,
              outstanding,
              milestone,
              milestoneDigest,
              digestTs, // should be updated to timestamp (non zero) once union leader calls AcceptLoan
              drawdownTs
            )

            // WHEN WE USE NEW FUNDTYPE ENCODE FUNCTION
            loanType = decodeBytes32String(loanType)
            
            // translate a block timestamp to a human readible estimated date
            const harvested = toUnixSecondsNumber(dueDate) * 1000
            const deadline = harvested && harvested + (PAYBACK_PERIOD * 1000) // IN MS
            
            console.log('debt principal:', principal, ethers.formatUnits(principal, decimals))
            console.log('debt outstanding:', outstanding, ethers.formatUnits(outstanding, decimals))
            debts.push({
              union: unionAddress,
              type: defaulted ? 'DEFAULTED' : '-',
              loanID: ids[j],
              loanType,      // hex bytes32 (you can map to a display name separately)
              principal: Number(ethers.formatUnits(principal, decimals)),
              principalRepaid: Number(ethers.formatUnits(principalRepaid, decimals)),
              outstanding: Number(ethers.formatUnits(outstanding, decimals)),
              rateBP: Number(rateBP),
              harvestDate: harvested,         // unix seconds
              dueDate: deadline,               // unix seconds
              closed,
              defaulted,
              borrower,
              milestone,
              milestoneDigest,
              digestTs,
              drawdownTs
            });
          });
        } catch (e) {
            console.error('err', e)
        }
        console.log('debts', debts)
        setDBitem("debts", debts, "Init");
        setDebts(debts);
        return funds;
      },
      }
    );
  }

export function useLoadFundsData(unionAddress: string, f: any[], investor: string) {
    const { provider } = useProvider();
    const hasFunds = Array.isArray(f) && f.length > 0;
    // Stabilise queryKey: derive a primitive key from fund addresses so a new
    // array reference with the same funds doesn't bust the cache.
    const fundsKey = useMemo(() => (f ?? []).map((x: any) => x?.[0] ?? '').join(','), [f]);

    return useQuery({
      queryKey: ['fundsData', unionAddress, fundsKey, investor],
      staleTime: 300_000,            // 5 min — on-chain data changes infrequently
      enabled: !!provider && !!investor && hasFunds,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 3,
      retryDelay: (i) => Math.min(1000 * 2 ** i, 8000),
      networkMode: 'always',
      queryFn: async () => {
        if (!provider || !investor) return [] as GenericFundData[];
        
        const data: GenericFundData[] = [];
        for (const fund of f) {
          const d = await loadGenericFundData(unionAddress,fund, provider, investor, fund?.[2]);
          if (d?.length) data.push(d[0]);
        }
        return data;
      },
      initialData: [] as GenericFundData[],
      initialDataUpdatedAt: 0,         // marks initialData as already stale → triggers immediate fetch
    });
  }
  
export function useInvestGeneric(
    unionAddress: string,
    initialBalance: number,
    fund_type: string,
  ) {
    const runTx                        = useTx()
    const { wallet }                   = useWallet()
    const { setTokenview, setCardView } = useViewModeContext();  
    const core             = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const token            = useContract(tokenAddress, nilaTokenAbi, wallet)
    const qc               = useQueryClient()
  
    const investgeneric = (rawAmount: string, hasLand: boolean = false) =>
      runTx(
        async () => {
          console.log('core', core)
          console.log('token', token)
          console.log('initialBalance', initialBalance)
          console.log('investgeneric', rawAmount, tokenAddress, genericFundCoreAddress)
          console.log('fund_id', fund_type)

          if (!core || !token || !wallet) throw new Error('Wallet or contracts not ready')
          
          console.log('initialBalance', initialBalance)
          console.log('rawAmount', rawAmount)
          const amt = ethers.parseUnits(rawAmount, decimals)
          const init = ethers.parseUnits(String(initialBalance), decimals)
          console.log('amt', amt, init)
          console.log('init', init)
          
          // in case of full withdrawal, sometimes amnt is more then actually available
          const TakeMin = minBigInt(init,amt) - 10000n // make sure to allow some dust
          console.log('TakeMin', TakeMin)

          // 1) approve allowance
          const approveTx = await token.approve(genericFundCoreAddress, TakeMin);
          await approveTx.wait();

          // 2) set the 0x00000 address for external investors
          const unionAddr = unionAddress ? unionAddress : '0x0000000000000000000000000000000000000000'

          console.log('unionAddr', unionAddr, fund_type, TakeMin)
          // Explicitly advance nonce past the approve tx — avoids stale nonce cache on local Hardhat
          const depositNonce = approveTx.nonce + 1;
          // check if this user has a land title (junior or senior (also verified onchain))
          // 3) do the invest
          if (hasLand){
            return core.depositJunior(unionAddr, fund_type, TakeMin, wallet.address, { nonce: depositNonce })
          } else {
            return core.depositSenior(unionAddr, TakeMin, { nonce: depositNonce })
          }
        },
        {
          onSuccess: () => {
            // reset the card data
            setTokenview(false)
            setCardView('default')
            // refresh balances/fund data
            qc.invalidateQueries({ queryKey: ['balances', wallet?.address] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
            qc.invalidateQueries({ queryKey: ['debtData'] })
          }
        }
      )
  
    return { investgeneric }
  }

export function useWithdrawGeneric(
    unionAddress: string,
    s: FundSpecific ,
    tokenAddress: string
  ) {
    const runTx                        = useTx()
    const { setTokenview, setCardView } = useViewModeContext();  
    const { wallet }       = useWallet()
    const core             = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const qc               = useQueryClient()
  
    const withdrawgeneric = (rawAmount: string, seniority: number, getCash: boolean = false ) =>
      runTx(
        async () => {
          console.log('wallet', wallet)
          if (!core || !wallet) throw new Error('Wallet or contract not ready')
          
          console.log('rawAmount', rawAmount)
          // parse human amount into on-chain units
          const amt = ethers.parseUnits(String(rawAmount), decimals)
          // unbonding requests shares, not tokens nomination

          console.log('seniority', seniority)
          console.log('s', s)
          console.log('amt', Number(ethers.formatUnits(amt, decimals)))

          // withdraw SENIOR or JUNIOR
          if (seniority){
            const inv  = await core.getInvestorSenior(unionAddress, wallet.address);
            const mkt  = await core.getSeniorMarket(unionAddress); // or core.getSeniorMarket if you expose it
            console.log('mkt', mkt)
            console.log('inv', inv)

            console.log("inv unpacked", inv.shares, inv.pending)
            const availableShares = BigInt(inv.shares) - BigInt(inv.pending);

            const to_shares = amt * RAY / BigInt(s.indexes.senior)
            const rawShares = to_shares < availableShares ? to_shares : availableShares
            const safeShares = rawShares > 10000n ? rawShares - 10000n : rawShares
            console.log('requestUnbondSenior', safeShares)

            return core.requestUnbondSenior(unionAddress, safeShares)
          } else {
            const inv  = await core.getInvestorJunior(unionAddress, s.fund_id, wallet.address);
            const mkt  = await core.getJuniorMarket(unionAddress, s.fund_id); // or core.getSeniorMarket if you expose it
            console.log('mkt', mkt)
            console.log('inv', inv)

            const availableShares = Number(inv.shares) - Number(inv.pending);

            const to_shares = amt * RAY / BigInt(s.indexes.junior)
            const min = Math.min(Number(to_shares), Number(availableShares))
            console.log('requestUnbondJunior', min)

            const fund_id = s.fund_id
            return core.requestUnbondJunior(unionAddress,fund_id, BigInt(min))
          }
        },
        {
          onSuccess: async () => {
            // Store cash preference in IndexedDB for the union to see
            if (getCash && !seniority) {
              try {
                const { setDBitem } = await import('../utils/db');
                await setDBitem({
                  id: `unbond_${wallet!.address}`,
                  investor: wallet!.address,
                  union: unionAddress,
                  getCash: true,
                  ts: Math.floor(Date.now() / 1000),
                }, 'UnbondPreferences');
              } catch (_) { /* non-blocking */ }
            }
            setTokenview(false)
            setCardView('default')
            qc.invalidateQueries({ queryKey: ['balances'] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
          }
        }
      )

    return { withdrawgeneric }
  }

export function useWithdrawClaimGeneric(
    unionAddress: string,
    s: FundSpecific ,
    tokenAddress: string
  ) {
    const runTx                        = useTx()
    const { setTokenview, setCardView } = useViewModeContext();  
    const { wallet }       = useWallet()
    const core             = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const qc               = useQueryClient()
  
    const withdrawclaimgeneric = (shares: string, seniority: number ) =>
      runTx(
        async () => {
          if (!core || !wallet) throw new Error('Wallet or contract not ready')

          console.log('tokens', shares)
          const _raw = Number(shares) * 100
          console.log('seniority', seniority)
          const amt = ethers.parseUnits(String(_raw), decimals)

          // withdraw SENIOR or JUNIOR
          if (seniority){
            return core.claimSenior(unionAddress, 0) // 0 = claim all claimable shares
          } else {
            // If investor flagged "get cash", approve FxPool BEFORE claiming.
            // Approve first — if it fails, claim doesn't proceed.
            const { readItem } = await import('../utils/db');
            const prefs = await readItem(`unbond_${wallet.address}`, 'UnbondPreferences').catch(() => null);
            if (prefs?.getCash) {
              const fxPoolAddr = process.env.REACT_APP_FX_POOL_MAIN;
              if (fxPoolAddr) {
                const ninAddr = process.env.REACT_APP_NIN_MAIN!;
                const nin = new ethers.Contract(ninAddr, ['function approve(address,uint256) returns (bool)'], wallet);
                const claimAmount = amt * BigInt(s.indexes.junior) / RAY; // shares → nIN
                console.log('Pre-approving FxPool for cash withdrawal:', ethers.formatEther(claimAmount));
                await (await nin.approve(fxPoolAddr, claimAmount)).wait();
                console.log('FxPool approved ✅');
              }
            }

            console.log('amt', amt,  BigInt(s.indexes.junior))
            const to_shares = amt * RAY / BigInt(s.indexes.junior)
            console.log('shares', to_shares)
            const fund_id = s.fund_id
            return core.claimJunior(unionAddress,fund_id, to_shares)
          }
        },
        {
          onSuccess: () => {
            // update the fund summary
            setTokenview(false)
            setCardView('default')
            // refresh your fund data
            qc.invalidateQueries({ queryKey: ['balances'] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
          }
        }
      )

    return { withdrawclaimgeneric }
  }

export function useTransfer() {
    const runTx                = useTx()
    const { wallet }           = useWallet()
    const core                 = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const { debts, setDebts }  = useDataContext()
    const { handleToggleView } = useTouch()
    const qc                   = useQueryClient()

    const transfer = (V: LoanVoucherGeneric) =>
      runTx(
        async () => {
          if (!core || !wallet) throw new Error('Wallet or contract not ready')
          // INPUTFUND contract expects voucher.loanId, but it has voucher.loanID. UPDATE IN CONTRACT!
          const {borrower,loanId,loanType,chosenAmount,chosenRate,maturityTs,maxAmount,minRateBP,paramsHash,sig,union} = V

          /*
          TRANSFER IS INCOMPLETE: 
            - DOES NOT CHECK SIGNATURE ON VOUCHER
            - DOES NOT CHECK INTEREST PAID (ALSO )
            - 
          */

          console.log('chosenRate',chosenRate,Number(chosenRate.toFixed(0)))
          const loanIdBytes32 = zeroPadValue(toBeHex(BigInt(loanId)), 32);
          //const loanType32   = asBytes32(V.loanType);
          //const paramsHash32 = asBytes32(V.paramsHash);
          //const parsedAmount = ethers.parseUnits(String(chosenAmount / 100),16)

          // check loan struct (FOR TESTING)
          //const loan = core.loans(union,loanIdBytes32 )
          //console.log('loan struct', loan)
          // call to transfer or rollover the loan
          return core.transferLoan(
            union,
            loanIdBytes32,
            borrower,          // must be 0x-prefixed 32-byte hex
            Number(chosenRate.toFixed(0)),  // uint16
            0,  // uint40 (seconds)
          );
        },
        {
          onError: (err: any) => {
            console.error("transferLoan failed:", err);
          },    
          onSuccess: () => {
            // transfer doesnt happen on the borrowers phone, so we cant call update. Instead we only change state.
            handleToggleView({ ix: 0, i: 0  }) // WE are not directing to the specific debt card, debts.length - 1 ??? (just assume only 1 loan)
          }
        }
      )
  
    return { transfer }
  }

export function useBorrowGeneric(
    fundAddress:  string,
    fundName: string
  ) {
    const runTx                = useTx()
    const { wallet }           = useWallet()
    const core                 = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const { debts, setDebts }  = useDataContext()
    const { handleToggleView } = useTouch()
    const qc                   = useQueryClient()
   
    const borrowGeneric = (V: LoanVoucherGeneric) =>
      runTx(
        async () => {
          if (!core || !wallet) throw new Error('Wallet or contracts not ready')
          console.log('voucher:', V)

          const {borrower,chosenAmount,chosenRate,loanId,loanType,maturityTs,minRateBP,paramsHash,raw_maxAmount,sig,union,escrowId,sosDate,nonce} = V
          const fastDraw = V.fastDraw ?? V._fastDraw

          const to0x = (h: string) => h.startsWith("0x") ? h : `0x${h}`;

          // SOP: loanId is a plain integer → zero-pad to bytes32
          const loanIdBytes32 = zeroPadValue(toBeHex(BigInt(loanId)), 32);
          // SOP: paramsHash and loanType → bytes32, add 0x prefix if missing
          const loanType32   = asBytes32(loanType);
          const paramsHash32 = asBytes32(paramsHash);
          const rate = Number(chosenRate.toFixed(0))

          // Sign burn permit: allows FxPool to burn farmer's nIN at cash collection time.
          // Deadline uses collectDeadline from ReserveCfg (set per union by leader/oracle).
          const token = new ethers.Contract(tokenAddress, nilaTokenAbi, wallet);
          const viewer = new ethers.Contract(genericFundViewerAddress, genericFundViewerAbi, wallet);
          const permitNonce = await token.nonces(wallet.address);
          const collectDeadlineSecs = Number(await viewer.getUnionCollectDeadline(union));
          const burnDeadline = Math.floor(Date.now() / 1000) + collectDeadlineSecs;
          const fxPoolAddr = process.env.REACT_APP_FX_POOL_MAIN!;
          const burnSig = await signPermit(wallet, fxPoolAddr, BigInt(chosenAmount), permitNonce, burnDeadline);

          // call to draw a loan
          return core.drawLoanWithVoucher(
            union,
            loanIdBytes32,
            loanType32,            // bytes32
            BigInt(chosenAmount),  // uint128
            rate,                  // uint16
            Number(maturityTs),    // uint40 (seconds)
            paramsHash32,          // bytes32
            to0x(sig),             // bytes
            BigInt(raw_maxAmount), // uint256 — SOP: use raw_maxAmount (Wei string), never normalize
            minRateBP,             // uint16
            fastDraw,              // bool
            escrowId ?? 0,         // uint256
            sosDate ?? 0,          // uint40
            nonce,                 // uint256
            burnDeadline,          // uint256 — exact deadline signed in burn permit
            burnSig.v, burnSig.r, burnSig.s  // EIP-2612 permit for FxPool burn at collection
          );
        },
        {
          onError: (err: any) => {
            console.error("drawLoanWithVoucher failed:", err);
          },    
          onSuccess: () => {
            console.log('voucher', V)
            console.log('fundAddress', fundAddress)
            console.log('fundName', fundName)
            const loanType32    = asBytes32(V.loanType);
            const amt           = Number(ethers.formatUnits(V.chosenAmount, decimals))
            const loanType      = decodeBytes32String(loanType32)
            const loanIdBytes32 = zeroPadValue(toBeHex(BigInt(V.loanId)), 32);

            // setDebt and create or update item
            const debtItem = { 
              borrower: V.borrower,
              closed: false,
              defaulted: false,
              dueDate: 0,
              harvestDate: 0,
              loanID: loanIdBytes32,  // 
              loanType: loanType,
              milestone: 0n,
              milestoneDigest: '',
              outstanding: amt,
              principal: amt,
              principalRepaid: 0,
              rateBP: V.minRateBP,
              type: (V.fastDraw ?? V._fastDraw) ? 'GENERIC' : 'PENDING',
              union: V.union,
              digestTs: (V.fastDraw ?? V._fastDraw) ? 1n : 0n // matched getBorrowerInfo on useLoan
            }
            console.log('debtItem', debtItem)
            console.log('debtx', debts)

            setDBitem('debts',[...debts,debtItem],'Init') // tiny helper to create|update db
            setDebts((prev: any) => [...prev, debtItem])
            handleToggleView({ ix: 3, i: 0  }) // WE are not directing to the specific debt card, debts.length - 1 ??? (just assume only 1 loan)
            // refresh balances/fund data
            qc.invalidateQueries({ queryKey: ['balances'] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
            qc.invalidateQueries({ queryKey: ['unionGenericFunds']})
          }
        }
      )
  
    return { borrowGeneric }
  }

export function useIsLeader(options: { address?: string; chain?: string | number } = {}) {    
    const { db }          = useDataContext();
    const isLeaderABI     = [ "function isLeader(address unionAddr, address acct) view returns (bool)"];
    const chainId         = Number(options.chain) || Number(process.env.REACT_APP_CHAIN_ID) || 137;
    const rpcUrl          = chainId === 137 ? process.env.REACT_APP_RPC_ALCHEMY! : process.env.REACT_APP_RPC!;
    const provider        = useMemo(() => {
      if (!rpcUrl) {
        console.error('🚨 No RPC URL configured');
        return undefined;
      }
      return new ethers.JsonRpcProvider(rpcUrl);
    }, [rpcUrl]);
    const roles           = useContract(genericRolesAddress, isLeaderABI, provider)
    const fallbackAddress = options.address ?? db?.address;
    
    const isLeader = async (union: string, acct = fallbackAddress) => {
        console.log('isLeader check for union:', union, 'and acct:', acct);
        if (!roles || !acct) return;
        const isLeaderResult = await roles.isLeader(union, acct);
        return isLeaderResult;
      }
    return { isLeader }
}

export function useAcceptLoan() {
    const runTx                = useTx()
    const { wallet }           = useWallet()
    const core                 = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const { debts, setDebts }  = useDataContext()
    const { handleToggleView } = useTouch()
    const qc                   = useQueryClient()

    const acceptLoan = (union: string, loanId: string) =>
      runTx(
        async () => {
          if (!core || !wallet) throw new Error('Wallet or contract not ready')

          console.log('attributes', union, loanId)
          // call to accept a loan
          return core.AcceptLoan(
            union,
            loanId,
            0
          );
        },
        {
          onError: (err: any) => {
            console.error("transferLoan failed:", err);
          },    
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['transferableLoans'], refetchType: 'all' })
            qc.invalidateQueries({ queryKey: ['activeLoans'] })
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['unionCashReserve'] })
            handleToggleView({ ix: 0, i: 0  })
          }
        }
      )
  
    return { acceptLoan }
}

export function useRepayGeneric() {

    const runTx                = useTx()
    const { wallet }           = useWallet()
    const { debts, setDebts }  = useDataContext()
    const { handleToggleView } = useTouch()
    const { setCardIx }        = useNavContext();
    const core                 = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const coreIface            = new ethers.Interface(genericFundCoreAbi);
    const qc                   = useQueryClient()
    let full : Boolean
        
    const repaygeneric = (debt: ActiveDebtObj, rawAmount: string) =>
      runTx(
        async () => {
          if (!wallet || !core) throw new Error('Wallet or contract not ready')

          const token = new ethers.Contract(tokenAddress, nilaTokenAbi, wallet);
          const tokenDecimals = await token.decimals();

          // 1) set loan id
          const loanID = debt['loanID']
          const union = debt['union']
          console.error("rawAmount", rawAmount, 'outstanding', debt.outstanding);
          const amtRaw = ethers.parseUnits(rawAmount.toString(), tokenDecimals);
          // clamp to outstanding
          const outstandingRaw = ethers.parseUnits(debt.outstanding.toString(), tokenDecimals);
          const repayAmt = amtRaw > outstandingRaw ? outstandingRaw : amtRaw;
          // const buffer = ethers.parseUnits('1', tokenDecimals); // small extra to avoid rounding shortfalls
          // const allowanceNeeded = repayAmt + buffer;

          const balance = await token.balanceOf(wallet.address);
          if (balance < repayAmt) throw new Error('Insufficient balance to repay this amount');

          // approve allowance for repayment
          const approveTx = await token.approve(genericFundCoreAddress, repayAmt);
          await approveTx.wait();
          const repayNonce = approveTx.nonce + 1;

          // 4) simulate call to know if we tag fully repaid
          try {
            full = await core.repayLoan.staticCall(union, loanID, repayAmt);
            console.error("full:", full);
          } catch (err: any) {
            const data = err?.data || err?.error?.data;
            try {
              const parsed = data ? coreIface.parseError(data) : null;
              console.error("repay staticCall failed:", parsed?.name || err?.shortMessage || err?.reason || err);
            } catch {
              console.error("repay staticCall failed (raw):", err?.shortMessage || err?.reason || err);
            }
            throw err;
          }
         
          // 5) (partial) repay the loan
          try {
            return await core.repayLoan(union,loanID,repayAmt, { nonce: repayNonce })
          } catch (err: any) {
            const data = err?.data || err?.error?.data;
            try {
              const parsed = data ? coreIface.parseError(data) : null;
              console.error("repay tx failed:", parsed?.name || err?.shortMessage || err?.reason || err);
            } catch {
              // fallback: log selector to map against ABI errors
              const selector = typeof data === 'string' && data.startsWith('0x') ? data.slice(0,10) : '';
              console.error("repay tx failed (raw):", selector || err?.shortMessage || err?.reason || err);
            }
            throw err;
          }
        },
        {
          onError: (err: any) => {
            // (match your contract’s custom error)
            console.error("repay failed:", err);
          },    
          onSuccess: (receipt : any) => {
            if (!receipt || !core) return
            const loanID = debt['loanID']
            
            if (full){
              const newDebtsArray = debts.filter((d: any) => d.loanID !== loanID)
              console.log('newDebtsArray',newDebtsArray)
              setDebts(newDebtsArray)
              setCardIx(false)
              setDBitem('debts',newDebtsArray,'Init') // tiny helper to create|update db
              handleToggleView({ ix: null })
            } else {
              // update state with the 
              const outstanding = debt['outstanding']
              const principalRepaid = debt['principalRepaid']

              console.log('newDebtsArray',debt,rawAmount, debts)
              const newOutstanding : number = Number(outstanding) - Number(rawAmount)
              const newPrincipalRepaid: number = Number(principalRepaid) - Number(rawAmount)
              const updatedDebts = debts.map((l : any )=> l.loanID === loanID ? { ...l, outstanding: newOutstanding, principalRepaid: newPrincipalRepaid } : l)
              console.log('updatedDebts',updatedDebts)
              setDBitem('debts',updatedDebts,'Init') // tiny helper to create|update db
              setDebts(updatedDebts)
            }
            // refresh your balances & fund data
            qc.invalidateQueries({ queryKey: ['balances'] })
            qc.invalidateQueries({ queryKey: ['unionGenericFunds'] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
          }
        }
      )
  
    return { repaygeneric }
  }

export function useRemoveLoan() {
    const runTx                = useTx()
    const { wallet }           = useWallet()
    const { debts, setDebts }  = useDataContext()
    const { handleToggleView } = useTouch()
    const { setCardIx }        = useNavContext()
    const core                 = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const qc                   = useQueryClient()

    const removeLoan = (union: string, loanId: string) =>
      runTx(
        async () => {
          if (!core || !wallet) throw new Error('Wallet or contract not ready')
          return core.removeLoan(union, loanId)
        },
        {
          onError: (err: any) => {
            console.error('removeLoan failed:', err)
          },
          onSuccess: () => {
            const newDebtsArray = debts.filter((d: any) => d.loanID !== loanId)
            setDebts(newDebtsArray)
            setCardIx(false)
            setDBitem('debts', newDebtsArray, 'Init')
            handleToggleView({ ix: null })
            qc.invalidateQueries({ queryKey: ['unionGenericFunds'] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
            qc.invalidateQueries({ queryKey: ['transferableLoans'], refetchType: 'all' })
            qc.invalidateQueries({ queryKey: ['activeLoans'] })
            qc.invalidateQueries({ queryKey: ['tasks'] })
          }
        }
      )

    return { removeLoan }
}

export function useUnionTreasury() {
  const runTx  = useTx();
  const { wallet } = useWallet();
  const qc     = useQueryClient();
  const core   = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet);
  const token  = useContract(tokenAddress, nilaTokenAbi, wallet);

  const deposit = (unionAddr: string, amountWei: bigint) =>
    runTx(async () => {
      if (!core || !token || !wallet) throw new Error('Wallet or contracts not ready');
      const approveTx = await token.approve(genericFundCoreAddress, amountWei);
      await approveTx.wait();
      return core.withdrawUnionTreasury(unionAddr, amountWei, false, true, { nonce: approveTx.nonce + 1 });
    }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] }),
    });

  const withdraw = (unionAddr: string, amountWei: bigint, fromRainy = false) =>
    runTx(async () => {
      if (!core) throw new Error('Contract not ready');
      return core.withdrawUnionTreasury(unionAddr, amountWei, fromRainy, false);
    }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] }),
    });

  return { deposit, withdraw };
}
