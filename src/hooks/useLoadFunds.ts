import { useMemo } from "react";
import { useQuery, useQueryClient }  from "@tanstack/react-query";
import { ethers, toBeHex, zeroPadValue, getBytes, decodeBytes32String,ContractTransactionResponse } from "ethers";
import { useTx } from "./useTx.ts";
import { useProvider, useBasicProvider, useWallet, useContract } from "./useWallet.ts";
import useTouch from "./useTouch";
import MulticallAbi  from "../components/ABI/MultiCall3.json";
import nilaTokenAbi from '../components/ABI/NilaToken.json';
import genericFundViewerAbi from '../components/ABI/genericFundViewer.json';
import genericFundCoreAbi from '../components/ABI/genericFundCore.json';
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
const PAYBACK_PERIOD = 1814400 // 3 weeks
const decimals = 18

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
  investor: { principal: number; junior: number, senior: number,pending: number, j_pending: number, s_pending: number; pendingWithdrawal: number; isFrozen: boolean };
  indexes: { junior: number, senior: number };
  loanType: string;
  maturedBudget: number,
  headroom: number,
  requiredReserve: number,
  previewRateBP: number,
};

export type FundSpecific = {
    address: string;
    fund_id: string;
    fund_type: string;
    junior: number;
    senior: number;
    indexes: { junior: number, senior: number };
    requiredReserve: number,
    previewRateBP: number,
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
        if (debts.length > 0) {
          setDBitem("debts", debts, "Init");
          setDebts(debts);
        }
        return funds;
      },
      }
    );
  }

export function useLoadFundsData(unionAddress: string, f: any[], investor: string) {
    const { provider } = useProvider();
    const hasFunds = Array.isArray(f) && f.length > 0;

    return useQuery({
      queryKey: ['fundsData', unionAddress, f, investor],
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
          console.log('loadGenericFundData CALLED!', fund);
          const d = await loadGenericFundData(unionAddress,fund, provider, investor, fund?.[2]);
          console.log('loaded fund data', d);
          if (d?.length) data.push(d[0]);
        }
        return data;
      },
      initialData: [] as GenericFundData[],
    });
  }
  
export function useInvestGeneric(
    unionAddress: string,
    initialBalance: number,
    fund_type: string,
  ) {
    const runTx            = useTx()
    const { wallet }       = useWallet()
    const { setTokenview } = useViewModeContext();  
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

          // 1) ensure allowance
          const current = await token.allowance(wallet.address, genericFundCoreAddress)

          if (current < amt) {
            const ap = await token.approve(genericFundCoreAddress, TakeMin)
            await ap.wait()
          }
          // 2) set the 0x00000 address for external investors
          const unionAddr = unionAddress ? unionAddress : '0x0000000000000000000000000000000000000000'
        
          console.log('unionAddr', unionAddr, fund_type, TakeMin)
          // check if this user has a land title (junior or senior (also verified onchain)) 
          // 3) do the invest
          if (hasLand){
            return core.depositJunior(unionAddr, fund_type, TakeMin)
          } else {
            return core.depositSenior(unionAddr, TakeMin)
          }
        },
        {
          onSuccess: () => {
            // reset the card data
            setTokenview(false)
            // refresh balances/fund data
            qc.invalidateQueries({ queryKey: ['balances', wallet?.address] })
            qc.invalidateQueries({ queryKey: ['fundsData'] }) 
            qc.invalidateQueries({ queryKey: ['debtData'] }) 
          }
        }
      )
  
    return { investgeneric }
  }

export function useClaimYield(
    unionAddress: string,
  ) {
    const runTx            = useTx()
    const { setTokenview } = useViewModeContext();  
    const { wallet }       = useWallet()
    const core             = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const qc               = useQueryClient()
  
    const claimYield = (funds: GenericFundData[]) =>
      runTx(
        async (): Promise<ContractTransactionResponse> => {
          if (!core || !wallet) throw new Error('Wallet or contract not ready')

          let lastTx: ContractTransactionResponse | undefined;

            for (const f of funds) {
              if (f.type === 'INPUT') continue
              const t = f.tokens?.[0];
              if (!t) continue;
              console.log('t', t)
              const loanType32 = asBytes32(t.loanType);
              const jPending = t.investor?.j_pending ?? 0;
              const sPending = t.investor?.s_pending ?? 0;
              const tranches = [[jPending,0n], [sPending,1n]].filter((T) => T[0] > 0)

              for (const tranche of tranches) {
                  const amt = ethers.parseUnits(String(tranche[0]), 18)
                  console.log('amt', tranche[1], unionAddress, loanType32, amt)
                  const tx = await core.claimYield(tranche[1], unionAddress, loanType32, amt);
                  await tx.wait(); // ensure mined before next
                  lastTx = tx;
                }
            }
          if (!lastTx) throw new Error("No claims to execute");
          return lastTx; // runTx can still call .wait() if it wants
        },
        {
          onError: (err: any) => {
            // (match your contract’s custom error)
            console.error("claim failed:", err);
          },    
          onSuccess: () => {
            // update the fund summary
            setTokenview(false)
            // refresh your fund data
            qc.invalidateQueries({ queryKey: ['balances'] })
            qc.invalidateQueries({ queryKey: ['fundsData'] }) 
          }
        }
      )
  
    return { claimYield }
  }

export function useWithdrawGeneric(
    unionAddress: string,
    s: FundSpecific ,
    tokenAddress: string
  ) {
    const runTx            = useTx()
    const { setTokenview } = useViewModeContext();  
    const { wallet }       = useWallet()
    const core             = useContract(genericFundCoreAddress, genericFundCoreAbi, wallet)
    const qc               = useQueryClient()
  
    const withdrawgeneric = (rawAmount: string, seniority: number ) =>
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

            console.log('inv unpacked', inv.shares, inv.pending, inv.unclaimed)
            const availableShares = Number(inv.shares) - Number(inv.pending) - Number(inv.unclaimed);
            //if (availableShares <= 0) {
            //  console.log('return message')
            //    throw new SoftError("You’ve already requested unbond for all your senior shares. The remaining amount is likely unclaimed interest.");
            //}
            //console.log('availableShares', availableShares)

            const to_shares = amt * RAY / BigInt(s.indexes.senior)
            const min = Math.min(Number(to_shares), Number(availableShares))
            console.log('requestUnbondSenior', min)

            //const senior_available = ethers.parseUnits(String(s.senior), decimals)
            // in case of full withdrawal, sometimes amnt is more then actually deposited
            //const TakeMin = minBigInt(senior_available,amt) - 10000n // make sure to allow some dust
            //console.log('TakeMin', TakeMin)
            return core.requestUnbondSenior(unionAddress, BigInt(min))
          } else {
            const inv  = await core.getInvestorJunior(unionAddress, s.fund_id, wallet.address);
            const mkt  = await core.getJuniorMarket(unionAddress, s.fund_id); // or core.getSeniorMarket if you expose it
            console.log('mkt', mkt)
            console.log('inv', inv)

            const availableShares = Number(inv.shares) - Number(inv.pending) - Number(inv.unclaimed);
            //if (availableShares <= 0) {
            //  console.log('availableShares', availableShares)
            //  throw new SoftError("You’ve already requested unbond for all your senior shares. The remaining amount is likely unclaimed interest.");
            //}
            //console.log('availableShares', availableShares)

            const to_shares = amt * RAY / BigInt(s.indexes.junior)
            const min = Math.min(Number(to_shares), Number(availableShares))
            console.log('requestUnbondJunior', min)

            const fund_id = s.fund_id
            return core.requestUnbondJunior(unionAddress,fund_id, BigInt(min))
          }
        },
        {
          onSuccess: () => {
            // update the fund summary
            setTokenview(false)
            // refresh your fund data
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
    const runTx            = useTx()
    const { setTokenview } = useViewModeContext();  
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
            return core.claimSenior(unionAddress, amt)
          } else {
            console.log('amt', amt,  BigInt(s.indexes.junior))
            const to_shares = amt * RAY / BigInt(s.indexes.junior)
            console.log('shares', to_shares)
            // always first claimYield. 
            ///rewards = core.claimYield()
            const fund_id = s.fund_id
            return core.claimJunior(unionAddress,fund_id, to_shares)
          }
        },
        {
          onSuccess: () => {
            // update the fund summary
            setTokenview(false)
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
    const coreIface            = new ethers.Interface(genericFundCoreAbi);
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

          const {borrower,chosenAmount,chosenRate,loanId,loanType,maturityTs,minRateBP,paramsHash,raw_maxAmount,sig,union} = V
          const fastDraw = V.fastDraw ?? V._fastDraw

          const to0x = (h: string) => h.startsWith("0x") ? h : `0x${h}`;

          // SOP: loanId is a plain integer → zero-pad to bytes32
          const loanIdBytes32 = zeroPadValue(toBeHex(BigInt(loanId)), 32);
          // SOP: paramsHash and loanType → bytes32, add 0x prefix if missing
          const loanType32   = asBytes32(loanType);
          const paramsHash32 = asBytes32(paramsHash);
          const rate = Number(chosenRate.toFixed(0))

          console.log('union', union)
          console.log('loanIdBytes32', loanIdBytes32)
          console.log('loanType32', loanType32)
          console.log('BigInt(chosenAmount)', BigInt(chosenAmount))
          console.log('rate', rate)
          console.log(' Number(maturityTs)',  Number(maturityTs))
          console.log('paramsHash32', paramsHash32)
          console.log('to0x(sig)', to0x(sig))
          console.log('BigInt(raw_maxAmount)', BigInt(raw_maxAmount))
          console.log('minRateBP', minRateBP)
          console.log('fastDraw', fastDraw)

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
            fastDraw               // bool
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
    const chainId         = Number(options.chain ?? db?.chain);
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
    const coreIface            = new ethers.Interface(genericFundCoreAbi);
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
            loanId
          );
        },
        {
          onError: (err: any) => {
            console.error("transferLoan failed:", err);
          },    
          onSuccess: () => {
            handleToggleView({ ix: 0, i: 0  }) //
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

          const current = await token?.allowance(wallet.address, genericFundCoreAddress)
          console.error("allowance current:", current);
          console.error("allowance required:", repayAmt); 

          const balance = await token.balanceOf(wallet.address);
          if (balance < repayAmt) throw new Error('Insufficient balance to repay this amount');

          if (current < repayAmt) {
            const ap = await token?.approve(genericFundCoreAddress, ethers.MaxUint256)
            await ap.wait()
            const updated = await token?.allowance(wallet.address, genericFundCoreAddress)
            console.error("allowance after approve:", updated);
          }

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
            return await core.repayLoan(union,loanID,repayAmt)
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
