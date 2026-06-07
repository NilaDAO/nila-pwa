import { useState, useEffect } from 'react'
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useNavContext, useViewModeContext, useDataContext } from '../../utils/NavigationContext';
import useTouch from "../../hooks/useTouch";
import { useWeightedRates } from '../../hooks/useWeightedRates.js';
import { motion } from 'framer-motion';
import { cropColor, phenoColor, cropIconUrl, normalizeCropType } from '../../utils/cropColors.js';
import { CROP_UNIT, CROP_CODE_NAMES, useFoodTokenBatches } from '../../hooks/useFoodTokenBatches.ts';
import { sameCropFamily } from '../../utils/foodToken.ts';

const infoText = 'Your cap rate dictates your borrowing terms and grant size: the lower your cap rate, the larger the loan you can access at a lower interest rate. To jump-start your liquidity in union funds, Nila offers grants to eligible newcomers.' 
const SHRINK_PERC = 0.3
const FIXED_APR_TO_PERIODICALLY              = 3.2072 // when we use foodtokens, we can use a crop type specific constant

const PHENO = {
    "bud": "terminal buds",
    "leaf": "leaf development",
    "shoot": "shoot/branch development",
    "inflorescence": "inflorescence",
    "flow": "flowering",
    "fruit_dev": "fruit development",
    "fruit_mat": "fruit maturity",
    "senesc": "senescence/dormancy",
    "unknown": "no-data"
    }

const STATUS = {
  'ACTIVE_GOOD': "Healthy",    // unknown
  'maize': "#0e1cda",    // fallow
  'unused': "#979797",    // unused
  'active': "#D4CF5A"    // active
}

export const DebtCard = ({d, cardShrink}) => {    
    const { ix }          = useNavContext();  
    const { db }          = useDataContext();
    const { isCollapsed } = useTouch()
    const PENDING_LOAN    = d.drawdownTs === 0n

    /**
     * Card summerized the open or closed loan the user has
     * open loan
            - show principal + interest
            - status
            - repay
     * closed loan (already sold crops)
            - underwritten by Union of x%, depending on credibility
            - lower price/quintal
            - lower risk, lower rate percentage
     */

    const premature = d && d.dueDate === 0

    /**
     * Elements:
     * Collected amount for a loan
     * Deadline and total interest at deadline.
     * Button to accept 
     * You have been selected because ...
     * Highlight area of property to be selected
     * Required certificate
     * Tab insurance fee (on/off or mandatory)
     *  
     */

    return (
        <div className="flex flex-col h-full w-full items-start pt-4 justify-start">
            { cardShrink < SHRINK_PERC && (ix || isCollapsed) && 
            <>
            { !d ? 
                <>
                <h1 className="font-bold">Borrow on your own terms</h1>
                <p className="text-gray-800 text-sm py-1">Or get funds to grow what a trader demands.</p>
                </>
            : d.type === 'DEFAULTED' ? 
                <>
                <h1 className="font-bold mx-4 text-sm dark:text-white">⚠️ Urgent: Please go to {db.union?.rep} to resolve your case.</h1>
                </>
            : PENDING_LOAN ? 
                <>
                <h1 className="font-bold text-lg">Wait for the union to accept.</h1>
                </>
            : premature ?
                <>
                <h1 className="font-bold text-lg">{(d.outstanding).toFixed(0).toLocaleString('en-IN')}/- nIN</h1>
                <p className="text-gray-800 font-bold text-sm pt-1">
                    Rate: {(d.rateBP / FIXED_APR_TO_PERIODICALLY / 100).toFixed(2)}%{" "}
                    <i className='font-normal'>({d.rateBP / 100}% annual)</i>
                </p>
                </>
            :
                <>
                <h1 className="font-bold text-lg">{(d.outstanding).toFixed(0).toLocaleString('en-IN')}/- nIN</h1>
                <p className="text-gray-800 font-bold text-sm pt-1">
                Rate: {(d.rateBP / FIXED_APR_TO_PERIODICALLY / 100).toFixed(2)}%{" "}
                <i className='font-normal'>({d.rateBP / 100}% annual)</i>
                </p>                
                </>
            }
            </>
            }
        </div>
        )
    }
    
export const InvestmentCard = ({CAP, sums, cardShrink, inArrays }) => {
    const [ info, setInfo]  = useState(false);
    const { tokenview }     = useViewModeContext()
    const { isCollapsed }   = useTouch()
    const { db, debts }     = useDataContext();
    const { ix }            = useNavContext();
    const { rateByPair }    = useWeightedRates(null, sums, db?.union?.address);
    const qc                = useQueryClient();
    const fundsFetching     = useIsFetching({ queryKey: ['fundsData'] });
    const isRefetching      = fundsFetching > 0;

    const handleReload = (e) => {
        e.stopPropagation();
        qc.invalidateQueries({ queryKey: ['fundsData'] });
    }

    const totalInvestedByUser = sums ? sums.total_investedByUser : 0
    const nmbFunds            = sums ? sums.funds.length : 0
    const memberOff           = db && db['union'] && db['union']['name'] && db['union']['name'].split(' ')[0]
    const defaultPenalty      = inArrays ? 0.01 : 1
    const weightedAnnualRate  = (() => {
        const funds = Array.isArray(sums?.funds) ? sums.funds : [];
        const union = String(db?.union?.address || '').toLowerCase();
        const weighted = funds.reduce((acc, fund) => {
            const invested = Number(fund?.principal || 0);
            const fundId = String(fund?.fund_id || '').toLowerCase();
            const apiRate = Number(rateByPair?.[`${union}-${fundId}`]);
            const floor = Number(fund?.baseRateBP || 0);
            const ratePercent = Number.isFinite(apiRate) && apiRate >= floor ? apiRate : floor;
            if (!Number.isFinite(invested) || invested <= 0) return acc;
            if (!Number.isFinite(ratePercent) || ratePercent <= 0) return acc;

            acc.invested += invested;
            acc.rate += invested * (ratePercent / 100);
            return acc;
        }, { invested: 0, rate: 0 });

        if (weighted.invested <= 0) return 0.06;
        return weighted.rate / weighted.invested;
    })();
    const NOI                 = Math.max(1,totalInvestedByUser * weightedAnnualRate * defaultPenalty)
    CAP.current               = 36000 / NOI // cap sets possibilities to borrow

    useEffect(() => {
        let timer;
        if (info) {
            timer = setTimeout(() => {
            setInfo(false);
            }, 20000);
        }
        return () => clearTimeout(timer);
    }, [info]);

    const handleInfoReset = (event) => {
        event.stopPropagation();
        setInfo(!info)
    }
    
    const measureCap = (cap) => {
        switch (true) {
            case cap < 1:
                return ''
            case cap < 15:
                return 'Eligible'
            case cap < 50:
                return 'Qualified'
            case cap < 100:
                return 'Accepted'
            case cap < 1000:
                return 'Limited'
            default:
                return 'Denied'
        }
    }

    return (
        <div className={`h-full w-full ${tokenview && 'hidden'} pt-4`}>
            { !info ?
                <div>
                    { cardShrink < SHRINK_PERC && (ix || isCollapsed) &&
                    <div>
                        <table className="w-full flex flex-row justify-between">
                            <tbody>
                                <tr className='flex flex-col flex-grow'>
                                    
                                    <td className="text-left text-xs flex items-center gap-1">
                                        <span className="text-[10px] text-gray-400 dark:text-slate-900">{isRefetching ? 'refetching' : 'You invested'}</span>
                                    </td>
                                    <td className={`text-left font-bold text-lg mb-3 ${isRefetching ? 'animate-pulse' : ''}`}>nIN {totalInvestedByUser.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/-</td>
                                </tr>
                            </tbody>
                            <tbody>
                                <tr className='text-xs'>
                                    <td>{NOI?.toFixed(0)}/- Gross yearly return</td>
                                </tr>
                                <tr className='flex flex-row text-xs'>
                                    <td><b>{CAP.current?.toFixed(0) }</b>{` Cap (${measureCap(CAP.current)})`}</td>
                                    <td><InformationCircleIcon onClick={handleInfoReset} className='w-4 h-4'/></td>
                                </tr>
                                { db && db['union'] ?
                                <>
                                    <tr className='text-xs'>
                                        <td className='wrap'>Member:{db['union'] && memberOff}...</td>
                                    </tr>
                                    <tr className='text-xs'>
                                        <td>{nmbFunds} Fund{nmbFunds > 1 ? 's' : ''} available.</td>
                                    </tr>
                                </>
                                :
                                <tr className='text-xs'>
                                    <td>Join a union.</td>
                                </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                    }
                </div>
            :
                <p className="text-xs" onClick={handleInfoReset}>{infoText}</p>
            }
        </div>
        )
    }

export const CultivationCard = ({ dominant, cardIndex = 0 }) => {
    const { tokenview } = useViewModeContext();
    const { db, tokenData } = useDataContext();
    const [url, setUrl] = useState(null);
    const flipBackground = cardIndex % 2 === 1;

    const rawCrop = typeof dominant?.crop_type === 'string'
      ? dominant.crop_type
      : (dominant?.crop_type?.dominant?.label || dominant?.crop_type?.label || dominant?.activity || 'Cultivation');
    // Strip variety/subtype suffix (sugarcane_plant → sugarcane, sugarcane_ratoon → sugarcane).
    const cropLabel = normalizeCropType(rawCrop) ?? rawCrop;
    const cropHex  = cropColor(cropLabel);
    const yieldKgPerAcre = dominant?.yield_kg_per_acre || 0;
    const areaM2 = Number(dominant?.area_m2);

    // ── Crop image (top-left) ─────────────────────────────────────────────────
    const cropCodeNum = Number(
      Object.entries(CROP_CODE_NAMES).find(([, name]) => sameCropFamily(name, cropLabel))?.[0] ?? -1
    );

    // ── Field state ───────────────────────────────────────────────────────────
    // State 4: food-token only (no active satellite cycle)
    // State 3: active cycle + food token → show alerts
    // State 2: active cycle, no food token → show "join batch" if one matches
    // Match the food token to THIS card — by zone first (once new-codec tokens carry a real
    // fieldNumber), then by crop. Previously this grabbed the FIRST food token for every card,
    // so unrelated cards (maize, green_gram) showed the sugarcane token's batch + value.
    const cardZoneNum = (() => {
      const m = String(dominant?.zone_id ?? '').match(/(\d+)/);
      return m ? Number(m[1]) : null;
    })();
    const liveFts = (tokenData ?? []).filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0);
    const ft =
      (cardZoneNum != null ? liveFts.find(t => t.fieldNumber === cardZoneNum) : null) ||
      liveFts.find(t => t.cropCode === cropCodeNum) ||
      null;
    const isState4 = dominant?.cluster_id?.startsWith('foodtoken-');
    const fieldState = isState4 ? 4 : ft ? 3 : 2;

    // ── State-2: batch matching ───────────────────────────────────────────────
    // useFoodTokenBatches returns a useQuery result; the active list lives on
    // `data.active` (see assetsList / staticCards / Wallet / OrdersCard usage).
    const { data: batchSummary } = useFoodTokenBatches(db?.union?.address);
    const activeBatches = batchSummary?.active ?? [];
    const suggestedBatch = fieldState === 2 && cropCodeNum >= 0
      ? activeBatches.find(b => b.cropCode === cropCodeNum) ?? null
      : null;

    // ── Food-token batch + value (states 3 & 4) ──────────────────────────────
    // Matches the "part of batch #N" label used in staticCards.js and the
    // value derivation used in assetsList (price from the matching batch,
    // not ft.p which is 0 for fresh tokens). Variety wildcard (varietyCode=0)
    // mirrors assetsList:134.
    const ftBatch = ft
      ? activeBatches.find(b =>
          b.cropCode === ft.cropCode &&
          (b.varietyCode === 0 || b.varietyCode === ft.varietyCode)
        )
      : null;
    const ftBatchId = ftBatch?.id ?? null;
    // pricePerKgUsdt is a bigint with 6 decimals; ft.bal is already unit-
    // denominated (kg or whatever CROP_UNIT specifies). Value uses the same
    // pricePerKg * t.bal formula as assetsList:displayPrice path.
    const ftPricePerKgUsdt = ftBatch?.pricePerKgUsdt
      ? Number(ftBatch.pricePerKgUsdt) / 1e6
      : 0;
    const ftValueINR = ftPricePerKgUsdt > 0 && ft
      ? ftPricePerKgUsdt * ft.bal
      : 0;

    console.log('[CultivationCard]', {
      cardIndex,
      cluster_id: dominant?.cluster_id,
      cropLabel,
      fieldState,
      tokenview,
      ft: ft ? { cropCode: ft.cropCode, varietyCode: ft.varietyCode, bal: ft.bal, p: ft.p, sym: ft.sym, type: ft.type } : null,
      batchSummaryLoaded: !!batchSummary,
      activeBatchesCount: activeBatches.length,
      activeBatchCropCodes: activeBatches.map(b => b.cropCode),
      unionAddr: db?.union?.address,
      ftBatch: ftBatch ? { id: ftBatch.id, cropCode: ftBatch.cropCode, varietyCode: ftBatch.varietyCode, pricePerKgUsdt: String(ftBatch.pricePerKgUsdt) } : null,
      ftBatchId,
      ftPricePerKgUsdt,
      ftValueINR,
    });

    // ── State-3: urgency alerts + yield mismatch ──────────────────────────────
    const adviceBlob = [dominant?.health_description, dominant?.water_advice, dominant?.fertilizer_advice, dominant?.weeding_advice].filter(Boolean).join(' ');
    const burnDetected = /\bburn\b/i.test(adviceBlob) || dominant?.health === 'poor';

    const urgencyAlerts = [];
    if (burnDetected)
      urgencyAlerts.push({ type: 'burn',       icon: '🔥', title: 'Burn risk',    body: dominant?.health_description });
    if (dominant?.water_advice)
      urgencyAlerts.push({ type: 'water',      icon: '💧', title: 'Water',        body: dominant.water_advice });
    if (dominant?.fertilizer_advice)
      urgencyAlerts.push({ type: 'fertilizer', icon: '🌱', title: 'Fertilizer',   body: dominant.fertilizer_advice });
    if (dominant?.weeding_advice)
      urgencyAlerts.push({ type: 'weed',       icon: '🌿', title: 'Weed control', body: dominant.weeding_advice });

    const ftUnit = ft ? (CROP_UNIT[ft.cropCode] ?? { label: 'kg', toKg: 1 }) : null;
    const areaAcres = Number.isFinite(areaM2) ? (areaM2 / 4046.86) * 0.85 : 0;
    const expectedKg = yieldKgPerAcre > 0 && areaAcres > 0 ? yieldKgPerAcre * areaAcres : null;
    const tokenKg = ft?.bal ?? null;
    const yieldDrift = expectedKg != null && tokenKg > 0 ? Math.abs(expectedKg - tokenKg) / tokenKg : null;
    const yieldAlert = yieldDrift != null && yieldDrift > 0.15;

    useEffect(() => {
        if (!db?.thumb) { setUrl(null); return; }
        const objectUrl = URL.createObjectURL(db.thumb);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [db?.thumb]);

    return (
        <>
            {!tokenview &&
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none" style={{ boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.25)' }}>
              {url && (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${url})`, backgroundSize: '120%', transform: flipBackground ? 'scale(-1, -1)' : 'none' }}
                />
              )}
              <div
                className={`absolute inset-0 ${url ? 'dark:bg-black/40' : ''}`}
                style={!url ? { backgroundColor: cropHex, opacity: 0.85 } : undefined}
              />


              {/* Right panel — state-specific */}
              <div className="absolute right-0 top-0 bottom-0 w-1/2 z-10 m-3 flex flex-col items-end justify-between gap-1.5 p-3 rounded-2xl bg-black/25">

                {ft ? (
                  <div className="flex flex-col items-end gap-1 leading-tight">
                    {ftValueINR > 0 && (
                      <span className="text-xl font-bold text-white leading-tight">
                        ₹{ftValueINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {ftBatchId != null && (
                      <span
                        className="text-[11px] font-semibold text-white px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: cropHex }}
                      >
                        part of batch #{ftBatchId}
                      </span>
                    )}
                  </div>
                ) : <span />}

                <div className="flex flex-col items-end gap-1.5">


                {fieldState === 3 && (
                  <>
                    {urgencyAlerts.map((a, i) => (
                      <div key={i} className={`rounded-lg px-2 py-1 flex items-start gap-1 ${a.type === 'burn' ? 'bg-red/80' : 'bg-amber-500/80'}`}>
                        <span className="text-[10px] leading-tight">{a.icon}</span>
                        <span className="text-[10px] font-semibold text-white leading-tight">{a.title}</span>
                      </div>
                    ))}
                    {yieldAlert && (
                      <div className="rounded-lg px-2 py-1 flex items-end gap-1">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold text-white leading-tight">Yield update</span>
                          <span className="text-[9px] text-blue-100 leading-tight">
                            est {(expectedKg / ftUnit.toKg).toLocaleString('en-IN', { maximumFractionDigits: 0 })} vs {(tokenKg / ftUnit.toKg).toLocaleString('en-IN', { maximumFractionDigits: 0 })} {ftUnit.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {fieldState === 4 && (
                  <div className="rounded-lg px-2 py-1.5 bg-gray-800/70 flex items-center gap-1.5">
                    <span className="relative inline-flex w-2.5 h-2.5 flex-shrink-0">
                      <span className="absolute inset-0 rounded-full bg-gray-400 opacity-60 animate-ping" />
                      <span className="relative w-2.5 h-2.5 rounded-full bg-gray-300" />
                    </span>
                    <span className="text-[10px] text-gray-200 font-medium leading-tight">Record updating</span>
                  </div>
                )}
                </div>

              </div>
            </div>
            }
        </>
    );
    };
    
export const AssetCard = ({ cardShrink }) => {
    const qc = useQueryClient();
    const { tokenview } = useViewModeContext();
    const { tokenData } = useDataContext();
    const balancesFetching = useIsFetching({ queryKey: ['balances'] });
    const batchFetching    = useIsFetching({ queryKey: ['foodTokenBatches'] });
    const isRefetching     = balancesFetching > 0 || batchFetching > 0;

    const totalUsd = tokenData?.reduce((sum, t) => sum + (t.bal * t.p), 0) ?? 0;

    const handleReload = (e) => {
        e.stopPropagation();
        qc.invalidateQueries({ queryKey: ['balances'] });
        qc.invalidateQueries({ queryKey: ['foodTokenBatches'] });
    }
    
    return (
        <>
            {!tokenview && cardShrink < SHRINK_PERC &&
            <div className="flex flex-col h-full items-end p-2">
                <div className="flex items-center gap-1">
                    <p className="text-gray-400 text-sm px-1">{isRefetching ? 'refetching' : 'total balance'}</p>
                    <button
                        type="button"
                        onClick={handleReload}
                        className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                        aria-label="Refresh balances"
                    >
                        <ArrowPathIcon className={`h-4 w-4 text-gray-500 dark:text-gray-200 ${isRefetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <h1 className={`font-bold text-xl dark:text-white ${isRefetching ? 'animate-pulse' : ''}`}>{(totalUsd * 1/tokenData[0]?.p)?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}/-</h1>
                <p className={`text-gray-400 text-xs px-1 ${isRefetching ? 'animate-pulse' : ''}`}>{totalUsd.toLocaleString('en-IN',{ style: 'currency', currency: 'USD', maximumFractionDigits: 1 })},-</p>
            </div>
            }
        </>
    );
    };

export const MapCard = ({ db }) => {
    const [url, setUrl] = useState(null);
    
    useEffect(() => {
        if (!db?.thumb) return;
        const o = URL.createObjectURL(db.thumb);
        setUrl(o);
        return () => URL.revokeObjectURL(o);
    }, [db]);
    
    if (!url) return null;
    
    return (
        <div
        className="absolute inset-0 rounded-3xl bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: `url(${url})`, backgroundSize: "120%" }}>
        </div>
    );
    };

// ── Cash & Liquidity card summary ─────────────────────────────────────────────
// Shown in the card stack for union leaders who also act as LPs.
// treasury/available pulled from useUnionCashReserve; lpPending is a count of
// open LP positions (CashOffers or RedeemOrders where lp === wallet.address).
export const CashLiquidityCard = ({ treasury = 0n, available = 0n, lpPending = 0, cardShrink }) => {
    const { ix }          = useNavContext();
    const { isCollapsed } = useTouch();
    const pct = treasury > 0n ? Number(available) / Number(treasury) : 1;
    const availableInr = Number(available / 10n ** 18n).toLocaleString('en-IN');
    const treasuryInr  = Number(treasury / 10n ** 18n).toLocaleString('en-IN');

    return (
        <div className="flex flex-col h-full w-full pt-4">
            { cardShrink < SHRINK_PERC && (ix || isCollapsed) &&
            <div>
                <table className="w-full flex flex-row justify-between">
                    <tbody>
                        <tr className="flex flex-col flex-grow">
                            <td className="text-[10px] text-gray-400 dark:text-slate-400">Available to cash-in</td>
                            <td className="text-left font-bold text-lg mb-3 dark:text-white">₹{availableInr}</td>
                        </tr>
                    </tbody>
                    <tbody>
                        <tr className="text-xs dark:text-slate-300">
                            <td>Treasury ₹{treasuryInr}</td>
                        </tr>
                        <tr className="text-xs dark:text-slate-300">
                            <td className={ pct < 0.2 ? 'text-green dark:text-amber-400' : pct < 0.5 ? 'text-amber dark:text-amber-300' : undefined }>
                                {Math.round(pct * 100)}% headroom
                            </td>
                        </tr>
                        {lpPending > 0 && (
                            <tr className="text-xs font-bold text-blue-500 dark:text-blue-500">
                                <td>{lpPending} LP position{lpPending > 1 ? 's' : ''} open</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            }
        </div>
    );
};

// ── Orders & Pricing summary card ─────────────────────────────────────────────
// Compact summary shown in the card stack. Full detail opens in Topic (ix=7).
export const OrdersSummaryCard = ({ activeBatches = [], cardShrink, onRefresh }) => {
    const { ix }          = useNavContext();
    const { isCollapsed } = useTouch();
    const isFetching      = useIsFetching({ queryKey: ['foodTokenBatches'] }) > 0;

    const handleRefresh = (e) => {
        e.stopPropagation();
        onRefresh?.();
    };

    // Aggregate per crop: total claimedQtyKg and best price across batches
    const cropRows = Object.values(
        activeBatches.reduce((acc, b) => {
            const key = b.cropCode;
            if (!acc[key]) acc[key] = { cropCode: key, claimedKg: 0, pricePerKgUsdt: 0 };
            acc[key].claimedKg += Number(b.claimedQtyKg ?? 0n);
            if (Number(b.pricePerKgUsdt) > acc[key].pricePerKgUsdt)
                acc[key].pricePerKgUsdt = Number(b.pricePerKgUsdt);
            return acc;
        }, {})
    ).filter(r => r.claimedKg > 0);

    // Price is stored as USDT/kg with 6 decimals; display as ₹ (consistent with AssetsView)
    const totalValueInr = cropRows.reduce((s, r) => {
        if (!r.pricePerKgUsdt) return s;
        return s + r.claimedKg * r.pricePerKgUsdt / 1e6;
    }, 0);

    return (
        <div className="flex flex-col h-full w-full pt-4">
            { cardShrink < SHRINK_PERC && (ix || isCollapsed) &&
            <div className="flex flex-row justify-between items-start w-full">
                {/* Left: total value */}
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">est. value</span>
                    <span className="font-bold text-lg text-gray-900 dark:text-white">
                        {totalValueInr > 0
                            ? `₹${totalValueInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                            : '—'
                        }
                    </span>
                </div>

                {/* Right: per-crop rows + refresh */}
                <div className="flex flex-col items-end gap-0.5">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 mt-0.5"
                        aria-label="Refresh orders"
                    >
                        <ArrowPathIcon className={`h-3.5 w-3.5 text-gray-400 dark:text-gray-500 ${isFetching ? 'animate-spin' : ''}`} />
                    </button>
                    {cropRows.map(r => {
                        const unit = CROP_UNIT[r.cropCode] ?? { label: 'kg', toKg: 1 };
                        const qty  = r.claimedKg / unit.toKg;
                        const name = (CROP_CODE_NAMES[r.cropCode] ?? `Crop ${r.cropCode}`).toLowerCase();
                        return (
                            <span key={r.cropCode} className="text-xs text-gray-600 dark:text-gray-300">
                                {name} · {qty % 1 === 0 ? qty.toLocaleString('en-IN') : qty.toFixed(1)} {unit.label}
                            </span>
                        );
                    })}
                </div>
            </div>
            }
        </div>
    );
};

export const Card = ({
    i,
    type,
    title,
    titleDot,
    titleIconCrop,
    titleAction,           // optional { label, onClick } shown next to the title
    children,
    onClick,
    isCollapsed,
    listLength,
    cardShrink = 0,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    isDragging,
}) => {
    const { tokenview } = useViewModeContext();
    const { ix } = useNavContext();

    // === shrink math ===
    // Tailwind h-52 ≈ 208px
    const BASE = 178;   // px
    const MIN  = 80;   // px (how small it can get)
    const p    = Math.max(0, Math.min(1, cardShrink));
    const height = cardShrink <= 0.5 || tokenview ? Math.round(BASE - (BASE - MIN) * p) : 0;

    // determine stacked based on the div height and the number of active cards
    const stackAmount = listLength > 5 ? 56 : 60

    // add top padding as it collapses to hide anything sliding underneath the rounded top
    const padTop = Math.round(4 * p);
    
    const COLOR = {
        ASSETS: 'bg-white dark:bg-gray-700',
        BORROW: 'bg-red dark:bg-red_dark',
        DEFAULTED: 'bg-gray-100 dark:bg-gray-700 border-2 dark:border-slate-400',
        INVEST: 'bg-green dark:bg-green_dark',
        MAP: 'bg-darkgrey',
        CASH_LIQUIDITY: 'bg-indigo-50 dark:bg-slate-700',
        ORDERS: 'bg-gray-300 dark:bg-slate-800',
    }
    const variants = {
        stacked: (custom) => ({
          y: custom.index * 190,
          zIndex: custom.index,
        }),
        unstacked: (custom) => ({
          y: custom.index * stackAmount,
          zIndex: listLength - custom.index,
        }),
      };

    const handleCardTouchStart = (e) => {
        if (type !== 'ASSETS' || !onTouchStart) return;
        e.stopPropagation();
        onTouchStart(e);
    };
    const handleCardTouchMove = (e) => {
        if (type !== 'ASSETS' || !onTouchMove) return;
        e.stopPropagation();
        onTouchMove(e);
    };
    const handleCardTouchEnd = (e) => {
        if (type !== 'ASSETS' || !onTouchEnd) return;
        e.stopPropagation();
        onTouchEnd(e);
    };

    return (
    <motion.div
        className={`
            absolute 
            w-full 
            ${!tokenview ? 
                cardShrink <= 0.5 ? 
                    `rounded-3xl shadow-bottom ${COLOR[type]}` : 
                    'rounded-b-3xl bg-white dark:bg-darkgrey' : 
                    'bg-white dark:bg-darkgrey'
                } 
            overflow-hidden
        `}  // no fixed h-52; clip edges
        onClick={onClick}
        initial="stacked"
        variants={variants}
        custom={{ index: i }}
        animate={isCollapsed ? 'unstacked' : 'stacked'}
        transition={isDragging && type === 'ASSETS' ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
        style={{
            // only drive height when not in tokenview (matches your previous logic)
            height: tokenview ? undefined : `${height}px`,
            paddingTop: `${padTop}px`,
            willChange: 'height, padding-top, transform',
        }}
        onTouchStart={handleCardTouchStart}
        onTouchMove={handleCardTouchMove}
        onTouchEnd={handleCardTouchEnd}
        >   
        { !tokenview &&
        <div
            className={`relative flex h-full flex-col rounded-3xl content-end justify-end p-4 bg-cover bg-center overflow-hidden`}
        >
        {children}
        <h3 className={`
            font-bold
            text-xs
            flex items-center gap-1
            ${type == 'BORROW' || type == 'INVEST' && `dark:text-black ${cardShrink >= 0.5 && 'dark:text-slate-400' }`}
            ${type == 'ASSETS' && 'dark:text-white'}
            ${type == 'DEFAULTED' && 'dark:text-slate-400'}
            ${type == 'MAP' && 'text-white z-10 dark:text-white'}
            ${type == 'CASH_LIQUIDITY' && 'dark:text-white'}
            ${type == 'ORDERS' && 'text-gray-800 dark:text-white z-10'}
            `}>
            {titleDot && (titleIconCrop
              ? <div className="w-5 h-5 mb-1 flex-shrink-0" style={{
                  WebkitMaskImage: `url(${cropIconUrl(titleIconCrop)})`,
                  maskImage: `url(${cropIconUrl(titleIconCrop)})`,
                  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain', maskSize: 'contain',
                  WebkitMaskPosition: 'center', maskPosition: 'center',
                  backgroundColor: titleDot,
                }} />
              : <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: titleDot }} />
            )}
            {title}
            {titleAction?.label && (
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); titleAction.onClick?.(); }}
                className="ml-2 text-[10px] text-blue-500 dark:text-blue-400 flex-shrink-0"
              >
                {titleAction.label}
              </button>
            )}
        </h3>
        </div>
        }
    </motion.div>
)};
