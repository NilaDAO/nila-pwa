import { BigNumberish, ethers } from "ethers";
import MulticallAbi  from "../components/ABI/MultiCall3.json";
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
const genericFundViewerAbi = genericFundViewerArtifact.abi;
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
const genericFundCoreAbi = genericFundCoreArtifact.abi;
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

    console.log('[loadGenericFundData] env addresses', {
        genericFundViewerAddress,
        genericFundCoreAddress,
        unionAddress,
        fundAddress,
        investor,
        loanType,
    });

    // ---- single-loanType (JUNIOR) + one SENIOR row ----
    const labels = [
        'getFundTotals junior',
        'getInvestorJunior',
        'getLiquidityBuffer',
        'previewRateBP',
        'getFundTotals senior',
        'getInvestorSenior',
        'getJuniorMarket',
        'bucketTresholds',
    ];
    const calls: [string, string][] = [
        // JUNIOR (this loanType)
        [genericFundViewerAddress, viewerIface.encodeFunctionData("getFundTotalsByTranche", [0, unionAddress, loanType])],
        [genericFundCoreAddress,   coreIface.encodeFunctionData("getInvestorJunior", [unionAddress, loanType, investor])],
        [genericFundViewerAddress, viewerIface.encodeFunctionData("getLiquidityBuffer", [unionAddress, loanType])],
        [genericFundViewerAddress, viewerIface.encodeFunctionData("previewRateBP", [unionAddress, ethers.parseUnits("1", decimals)])],

        // SENIOR (union-scoped)
        [genericFundViewerAddress, viewerIface.encodeFunctionData("getFundTotalsByTranche", [1, unionAddress, ethers.ZeroHash])],
        [genericFundCoreAddress,   coreIface.encodeFunctionData("getInvestorSenior", [unionAddress, investor])],

        // Junior market cash — separate from idleCash (jr+sr) so we can warn on InsufficientCash
        [genericFundCoreAddress,   coreIface.encodeFunctionData("getJuniorMarket", [unionAddress, loanType])],

        // Junior/senior ratio threshold set by union (WAD, e.g. 0.1e18 = 10%)
        [genericFundCoreAddress,   coreIface.encodeFunctionData("bucketTresholds", [unionAddress, loanType])],
    ];

    console.log('[loadGenericFundData] calls', calls.map(([addr, data], idx) => ({
        label: labels[idx], to: addr, data: data.slice(0, 10) + '…'
    })));

    let ret: string[];
    try {
        const [, _ret]: [boolean[], string[]] = await mc.aggregate.staticCall(calls);
        ret = _ret;
        console.log('[loadGenericFundData] raw ret', ret.map((r, idx) => ({ label: labels[idx], bytes: r.slice(0, 66) + '…' })));
    } catch (err) {
        console.error('[loadGenericFundData] aggregate failed:', err);
        // probe individual calls to see which fails
        for (let idx = 0; idx < calls.length; idx++) {
            try {
                const [addr, data] = calls[idx];
                const [, singleRet] = await mc.aggregate.staticCall([[addr, data]]);
                console.log('[loadGenericFundData] call ok', labels[idx], 'raw:', singleRet[0]?.slice(0, 66));
            } catch (e: any) {
                console.error('[loadGenericFundData] call failed', labels[idx], {
                    to: calls[idx][0],
                    data: calls[idx][1].slice(0, 10),
                    error: e?.message,
                    reason: e?.reason,
                    data_returned: e?.data,
                });
            }
        }
        throw err;
    }
    let i = 0;
    // ---- decode ----
    // JUNIOR
    console.log('[loadGenericFundData] decoding getFundTotalsByTranche junior, raw:', ret[i]?.slice(0, 66));
    const [JuniorDeposits, JuniorBorrows, JuniorIndex] = viewerIface.decodeFunctionResult("getFundTotalsByTranche", ret[i++]);
    console.log('[loadGenericFundData] JuniorDeposits', JuniorDeposits, 'JuniorBorrows', JuniorBorrows, 'JuniorIndex', JuniorIndex);
    console.log('[loadGenericFundData] decoding getInvestorJunior, raw:', ret[i]?.slice(0, 66));
    const [jInv] = coreIface.decodeFunctionResult("getInvestorJunior", ret[i++]); // (shares, locked, pending)
    console.log('[loadGenericFundData] jInv', jInv);
    const lb = viewerIface.decodeFunctionResult("getLiquidityBuffer", ret[i++]);
    const prRaw = viewerIface.decodeFunctionResult("previewRateBP", ret[i++]);      // uint16
    const pr = Number(prRaw) / 100;
    const j_entryIndex = jInv.entryIndex
    // SENIOR
    console.log('[loadGenericFundData] decoding getFundTotalsByTranche senior, raw:', ret[i]?.slice(0, 66));
    const [SeniorDeposits, SeniorBorrows,SeniorIndex] = viewerIface.decodeFunctionResult("getFundTotalsByTranche", ret[i++]);
    console.log('[loadGenericFundData] decoding getInvestorSenior, raw:', ret[i]?.slice(0, 66));
    const [sInv] = coreIface.decodeFunctionResult("getInvestorSenior", ret[i++]); // (shares, locked, pending)
    console.log('[loadGenericFundData] sInv', sInv);
    const s_entryIndex = sInv.entryIndex
    const [jMarket] = coreIface.decodeFunctionResult("getJuniorMarket", ret[i++]);
    const juniorMarketCash = jMarket.cash as bigint;
    const [thresholdWad] = coreIface.decodeFunctionResult("bucketTresholds", ret[i++]);
    // WAD (1e18) → percentage: 0.1e18 → 10
    const bucketThresholdPct = Number(thresholdWad) / 1e16;

    const Deposits = JuniorDeposits + SeniorDeposits
    const Lent = JuniorBorrows + SeniorBorrows // Senior is 0
    const j_shares    = jInv.shares;
    const s_shares    = sInv.shares;
    // shares to principal token price
    const j_principal = BigInt(j_shares) * JuniorIndex / RAY
    const s_principal = BigInt(s_shares) * SeniorIndex / RAY
    // yield computed client-side: shares × (currentIndex - entryIndex) / RAY
    const j_yield = JuniorIndex > j_entryIndex ? BigInt(j_shares) * (BigInt(JuniorIndex) - BigInt(j_entryIndex)) / RAY : 0n
    const s_yield = SeniorIndex > s_entryIndex ? BigInt(s_shares) * (BigInt(SeniorIndex) - BigInt(s_entryIndex)) / RAY : 0n

    const totalShares = j_shares + s_shares
    const principal = j_principal + s_principal
    // pending interest expressed as token units
    const j_pending = j_yield
    const s_pending = s_yield
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
            seniorPendingSnap: Number(ethers.formatUnits(sInv.pendingPrincipalSnap, decimals)),
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
        headroom: Number(ethers.formatUnits(lb.headroom, decimals)),
        requiredReserve: Number(ethers.formatUnits(lb.requiredReserve, decimals)),
        idleCash: Number(ethers.formatUnits(lb.idleCashForType, decimals)),
        juniorCash: Number(ethers.formatUnits(juniorMarketCash, decimals)),
        seniorPrincipal: Number(ethers.formatUnits(SeniorDeposits, decimals)),
        claimableReserved: Number(ethers.formatUnits(lb.claimableReserved, decimals)),
        previewRateBP: Number(pr),
        bucketThresholdPct,
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
