import { useState, useEffect } from 'react'
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useNavContext, useViewModeContext, useDataContext } from '../../utils/NavigationContext';
import useTouch from "../../hooks/useTouch";
import { useWeightedRates } from '../../hooks/useWeightedRates.js';
import { motion } from 'framer-motion';
import { cropColor, phenoColor } from '../../utils/cropColors.js';
import { CROP_IMG } from '../../hooks/useFilterTasks';
import { CROP_UNIT, CROP_CODE_NAMES } from '../../hooks/useFoodTokenBatches.ts';

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
    const [ crop, setCrop ] = useState();
    const { tokenview } = useViewModeContext();
    const { db } = useDataContext();
    const { handleToggleView } = useTouch();
    const [url, setUrl] = useState(null);
    const flipBackground = cardIndex % 2 === 1;
    const cropLabel = typeof dominant?.crop_type === 'string'
      ? dominant.crop_type
      : (dominant?.crop_type?.dominant?.label || dominant?.crop_type?.label || dominant?.activity || 'Cultivation');
    const status = dominant?.signals?.status || 'unknown';
    const pheno = typeof dominant?.stage === 'string'
      ? dominant.stage
      : (dominant?.phenology?.stage?.dominant?.stage || 'unknown');
    const cropHex  = cropColor(cropLabel);
    const phenoHex = phenoColor(pheno);
    const yieldIndex = dominant?.yield_index ?? dominant?.yield?.mean_kg_ha ?? 0;
    const yieldTotalKg = dominant?.yield_total_kg || 0;
    const yieldKgPerAcre = dominant?.yield_kg_per_acre || 0;
    const areaM2 = Number(dominant?.area_m2);

    const DeclareCropType = () => (
        <div>
            <input 
                type="text"
                placeholder={cropLabel == 'other' || cropLabel == 'unknown' ? 'what is growing here?' : `are you growing ${cropLabel}?`}
                value={cropLabel == 'other' || cropLabel == 'unknown' ? crop || '' : cropLabel} 
                onChange = {(e) => setCrop(e.target.value)}
                className="text-sm bg-transparent focus:ring-2 focus:ring-green"
            />
        </div>
    )

    const yieldcat = (param) => {
        if (param < 0.2) return 'lower 20%';
        if (param < 0.5) return 'lower 50%';
        if (param < 0.8) return 'top 20%';
        if (param <= 1) return 'best of class';
        return 'unknown';
    }

    useEffect(() => {
        if (!db?.thumb) {
            setUrl(null);
            return;
        }
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
                    style={{
                        backgroundImage: `url(${url})`,
                        backgroundSize: "120%",
                        transform: flipBackground ? 'scale(-1, -1)' : 'none',
                    }}
                />
            )}
            <div
                className={`absolute inset-0 ${url ? 'dark:bg-black/40' : ''}`}
                style={!url ? { backgroundColor: cropHex, opacity: 0.85 } : undefined}
            />
            <table className="relative z-10 flex flex-row h-full justify-end px-4 pt-9 text-white">
                <tbody>
                    <tr className='text-xs flex flex-col items-end'>
                        <td className="text-xs text-gray-100">Status: {STATUS[status] || status}</td>
                        <td className="text-xs text-gray-100 flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: phenoHex }} />
                            {PHENO[pheno] || pheno}
                        </td>
                        <td className="text-xs text-gray-100">
                            Area: {Number.isFinite(areaM2) ? `${areaM2.toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²` : 'n/a'}
                        </td>
                        <td className="text-xs text-gray-100">
                            Yield: {yieldTotalKg > 0
                              ? `${yieldTotalKg.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kg (${yieldcat(yieldIndex)})`
                              : yieldcat(yieldIndex)}
                        </td>
                    </tr>
                </tbody>
            </table>
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
    const isRefetching = balancesFetching > 0;
    const t = tokenData?.reduce((sum, t) => sum + (t.bal * t.p), 0);
    const total = t ? t : 0 // helper if app is offline for some case (we dont cache balance)
    // (t.p * 1/extendedList[1].p)
    const handleReload = (e) => {
        e.stopPropagation();
        qc.invalidateQueries({ queryKey: ['balances'] });
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
                <h1 className={`font-bold text-xl dark:text-white ${isRefetching ? 'animate-pulse' : ''}`}>{(total * 1/tokenData[0]?.p)?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}/-</h1>
                <p className={`text-gray-400 text-xs px-1 ${isRefetching ? 'animate-pulse' : ''}`}>{total.toLocaleString('en-IN',{ style: 'currency', currency: 'USD', maximumFractionDigits: 1 })},-</p>
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
            text-sm
            flex items-center gap-1
            ${type == 'BORROW' || type == 'INVEST' && `dark:text-black ${cardShrink >= 0.5 && 'dark:text-slate-400' }`}
            ${type == 'ASSETS' && 'dark:text-slate-400'}
            ${type == 'DEFAULTED' && 'dark:text-slate-400'}
            ${type == 'MAP' && 'text-white z-10 dark:text-white'}
            ${type == 'CASH_LIQUIDITY' && 'dark:text-slate-400'}
            ${type == 'ORDERS' && 'text-gray-800 dark:text-white z-10'}
            `}>
            {titleDot && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: titleDot }} />}
            {title}
        </h3>
        </div>
        }
    </motion.div>
)};
