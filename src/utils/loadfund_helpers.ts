import { BigNumberish, ethers } from "ethers";
import MulticallAbi  from "../components/ABI/MultiCall3.json";
import genericFundViewerAbi from '../components/ABI/genericFundViewer.json';
import genericFundCoreAbi from '../components/ABI/genericFundCore.json';
import type { GenericFundData } from '../hooks/useLoadFunds.ts';

// helper to format UNIX → "Month, Year"
export const converseDate = (unix: number) => {
const d = new Date(unix * 1000)
return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * track adjustments
 *  - pendingPrincipalSnap in next getInvestorSenior and getInvestorJunior (should show pending claim...)
 *  - getLiquidityBuffer should not longer fail due to moduleCashByUnion or update issue proxy or imp,.
 *  - claimYield - not tested or implemented.
 *  - added location to createUnion and getUnion
 */

const genericFundViewerAddress: string = process.env.REACT_APP_VIEWER_MAIN!;
const genericFundCoreAddress: string = process.env.REACT_APP_CORE_MAIN!;
const RAY = 10n ** 27n;

export const loadGenericFundData = async (unionAddress: string,fund: string, provider: ethers.Provider, investor: string, type: string) => {
    
    // 1) Fetch per-fund token lists
    const decimals = 18
    const loanType = fund[2] // bytes32 (hex string)
    const displayName = fund[4] + ' ' + fund[1] // bytes32 (hex string)
    const fundAddress = fund[0]
    const mc = new ethers.Contract('0xcA11bde05977b3631167028862bE2a173976CA11',MulticallAbi,provider)

    const coreIface   = new ethers.Interface(genericFundCoreAbi);
    const viewerIface = new ethers.Interface(genericFundViewerAbi);
    
    if (!unionAddress || !fundAddress || !investor) {
        console.warn('[loadGenericFundData] missing params', { unionAddress, fundAddress, investor });
        return [];
    }

    // ---- single-loanType (JUNIOR) + one SENIOR row ----
    const calls: [string, string][] = [
        // JUNIOR (this loanType)
        [genericFundViewerAddress, viewerIface.encodeFunctionData("getFundTotalsByTranche", [0, unionAddress, loanType])],
        [genericFundCoreAddress,   coreIface.encodeFunctionData("getInvestorJunior", [unionAddress, loanType, investor])],
        [genericFundViewerAddress, viewerIface.encodeFunctionData("getLiquidityBuffer", [unionAddress, loanType])],
        [genericFundViewerAddress, viewerIface.encodeFunctionData("previewRateBP", [unionAddress, ethers.parseUnits("1", decimals)])],

        // SENIOR (union-scoped)
        [genericFundViewerAddress, viewerIface.encodeFunctionData("getFundTotalsByTranche", [1, unionAddress, ethers.ZeroHash])],
        [genericFundCoreAddress,   coreIface.encodeFunctionData("getInvestorSenior", [unionAddress, investor])],

        // Maturity coverage pieces
        [genericFundViewerAddress,   viewerIface.encodeFunctionData("getMaturityCoverageForUnion", [unionAddress])],
    ];
    let ret: string[];
    try {
        const [, _ret]: [boolean[], string[]] = await mc.aggregate.staticCall(calls);
        ret = _ret;
    } catch (err) {
        // probe individual calls to see which fails
        const labels = [
            'getFundTotals junior',
            'getInvestorJunior',
            'getLiquidityBuffer',
            'previewRateBP',
            'getFundTotals senior',
            'getInvestorSenior',
            'getMaturityCoverageForUnion',
        ];
        for (let idx = 0; idx < calls.length; idx++) {
            try {
                const [addr, data] = calls[idx];
                await mc.aggregate.staticCall([[addr, data]]);
                console.log('[loadGenericFundData] call ok', labels[idx]);
            } catch (e) {
                console.error('[loadGenericFundData] call failed', labels[idx], e);
            }
        }
        throw err;
    }
    let i = 0;
    // ---- decode ----
    // JUNIOR 
    const [JuniorDeposits, JuniorBorrows, JuniorIndex] = viewerIface.decodeFunctionResult("getFundTotalsByTranche", ret[i++]);
    const [jInv] = coreIface.decodeFunctionResult("getInvestorJunior", ret[i++]); // (shares, locked, pending)
    const lb = viewerIface.decodeFunctionResult("getLiquidityBuffer", ret[i++]); 
    const prRaw = viewerIface.decodeFunctionResult("previewRateBP", ret[i++]);      // uint16
    const pr = Number(prRaw) / 100; 
    const j_unclaimed = jInv.unclaimed
    const entry = jInv.entryIndex
    // SENIOR 
    const [SeniorDeposits, SeniorBorrows,SeniorIndex] = viewerIface.decodeFunctionResult("getFundTotalsByTranche", ret[i++]);
    const [sInv] = coreIface.decodeFunctionResult("getInvestorSenior", ret[i++]); // (shares, locked, pending)
    const [maturedBudget] = viewerIface.decodeFunctionResult("getMaturityCoverageForUnion", ret[i++]);
    const s_unclaimed = sInv.unclaimed
   
    const Deposits = JuniorDeposits + SeniorDeposits
    const Lent = JuniorBorrows + SeniorBorrows // Senior is 0
    const j_shares    = jInv.shares;  
    const s_shares    = sInv.shares;  
    // shares to principal token price
    const j_principal = BigInt(j_shares) * JuniorIndex / RAY
    const j_entryPrincipal = BigInt(j_shares * (JuniorIndex - entry)) / RAY
    const s_principal = BigInt(s_shares) * SeniorIndex / RAY
    const s_entryPrincipal = BigInt(s_shares * (SeniorIndex - entry)) / RAY

    const totalShares = j_shares + s_shares
    const principal = j_principal + s_principal
    // pending interest (rewards_sum in fundAnalytics)
    const j_pending = Number(j_unclaimed) + Math.max(0, Number(j_entryPrincipal))
    const s_pending = Number(s_unclaimed) + Math.max(0, Number(s_entryPrincipal))
    const totalPending = j_pending + s_pending
    // pending withdrawal: shares requested for unbond → convert to token value
    const j_pendingWithdrawal = BigInt(jInv.pending) * JuniorIndex / RAY
    const s_pendingWithdrawal = BigInt(sInv.pending) * SeniorIndex / RAY
    const pendingWithdrawal = j_pendingWithdrawal + s_pendingWithdrawal
    const fundMap: Record<string, GenericFundData> = {};

    const obj = {
        token: '',
        type: "GENERIC",
        name: displayName,
        totals: {
            funds: Number(ethers.formatUnits(Deposits, decimals)),
            lent:  Number(ethers.formatUnits(Lent,  decimals)),
        },
        investor: {
            principal: Number(ethers.formatUnits(principal, decimals)),
            junior: Number(ethers.formatUnits(j_principal, decimals)),
            senior: Number(ethers.formatUnits(s_principal, decimals)),
            j_pending: Number(ethers.formatUnits(BigInt(j_pending), decimals)),
            s_pending: Number(ethers.formatUnits(BigInt(s_pending), decimals)),
            pending: Number(ethers.formatUnits(BigInt(totalPending), decimals)),
            pendingWithdrawal: Number(ethers.formatUnits(pendingWithdrawal, decimals)),
            isFrozen:  false,
        },
        indexes: {
            junior: Number(JuniorIndex),
            senior: Number(SeniorIndex),
        },
        loanType,
        maturedBudget: Number(maturedBudget),
        headroom: Number(ethers.formatUnits(lb.headroom, decimals)),
        requiredReserve: Number(ethers.formatUnits(lb.requiredReserve, decimals)),
        previewRateBP: Number(pr),
    };

    // initialize the fund bucket
    fundMap[fundAddress] = {
        fund: fundAddress,
        type: "GENERIC",
        tokens: [obj],
    };

    const result = Object.values(fundMap) as GenericFundData[];
    console.log('[loadGenericFundData] result', result);
    return result; 
}
