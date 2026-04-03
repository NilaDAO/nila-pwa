import { useState, useEffect, useCallback } from 'react';
import { useDataContext,useViewModeContext } from '../../utils/NavigationContext.js';
import { IndividualExchangeButton, ClaimButton } from '../../components/UI/buttons.js';
import { useInvestGeneric, useWithdrawGeneric, useWithdrawClaimGeneric } from '../../hooks/useLoadFunds.ts';
import { usePreviewUnbond } from '../../hooks/useInvest.ts';
import { useWeightedRates } from '../../hooks/useWeightedRates.js';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { CountdownCircleWithdraw } from '../../components/UI/counter.js'
/**
 * Investment List V2. 
 * List of funds of member union (multiple unions possible?), 
 *    read_txs: 
 *        - read all contracts by union address
 *        - get user investments by contract address
 *    write_txs: 
 *        - availableFunds (read created contracts by union address), 
 *        - claimInterest, 
 *        - Invest, 
 *        - Withdraw,
 *        -  Governance (not implemented)
 *    load: lazy load when opening card?
 *      - call contracts by union address
 *      - for each contract, call userInvestments
 * @param {*} param0 
 * @returns 
 */

const InvestmentList = ({ LAND, handleTokenView, data, fundSelected, names, sums}) => {
    const [ amount, setAmount ]                         = useState(0)
    const [ accept, setAccept ]                         = useState(true);
    const { tokenData, db }                             = useDataContext();
    const { navRef,tokenview,setTokenview,setCardView } = useViewModeContext();  
    const [ tab, setTab]                                = useState(navRef.current.assetTab) // ref only on remount of component
    const [ hasMaturing, setMaturing ]                  = useState()
    const initialBalance                                = tokenData && tokenData.find((t) => t.sym === 'nIN')?.bal;
    const [ balance, setBalance ]                       = useState(initialBalance);
    const hasSums                                       = sums && Array.isArray(sums.funds) && sums.funds.length > fundSelected;
    const s                                             = hasSums ? sums.funds[fundSelected] : null;
    const d                                             = data?.[fundSelected]
    const fund_address                                  = s?.address
    const fund_type                                     = s?.fund_id // ONLY NILA FOR NOW.
    const token_address                                 = s?.tokens?.[0] // ONLY NILA FOR NOW.
    const isUnionLeader                                 = Boolean(db?.union?.leader)
    const hasLandTitle                                  = Boolean(LAND?.current?.hasLand)
    const [ investPool, setInvestPool ]                 = useState(hasLandTitle ? 'junior' : 'senior')
    const SENIORITY                                     = s?.junior > 1 ? 0 : 1  // allow for some dust to be left in the junior bucket
    const investInJunior                                = isUnionLeader ? investPool === 'junior' : hasLandTitle
    const activeWithdrawal                              = Boolean(Number(hasMaturing?.requestTs)) && hasMaturing?.pendingPrincipalSnap > 0
    const { preview }                                   = usePreviewUnbond(db?.union?.address)
    const { investgeneric }                             = useInvestGeneric(db?.union?.address,initialBalance,fund_type)
    const { withdrawgeneric }                           = useWithdrawGeneric(db?.union?.address,s, token_address)
    const { withdrawclaimgeneric }                      = useWithdrawClaimGeneric(db?.union?.address,s, token_address)
    const [readyToClaim, setReadyToClaim]               = useState(false);
    const [checkingLiq, setCheckingLiq]                 = useState(false);
    const remainingSec                                  = hasMaturing ? Math.max(0, Number(hasMaturing.minWindowTs) - hasMaturing.chainNowSec) : 0;
    const { rateByPair }                                = useWeightedRates(data, sums, db?.union?.address);

    const getRatePercent = (fund, idx) => {
        const union = String(db?.union?.address || '').toLowerCase();
        const fundId = String(fund?.tokens?.[0]?.loanType || sums?.funds?.[idx]?.fund_id || '').toLowerCase();
        const key = `${union}-${fundId}`;
        const apiRate = rateByPair?.[key];
        if (Number.isFinite(apiRate)) return apiRate;
        const fallback = Number(fund?.tokens?.[0]?.previewRateBP ?? 0);
        return Number.isFinite(fallback) ? fallback : 0;
    };

    useEffect(() => {
        if (hasMaturing?.pastMin) setReadyToClaim(true);
    }, [hasMaturing?.pastMin]);

    useEffect(() => {
        setInvestPool(hasLandTitle ? 'junior' : 'senior');
    }, [hasLandTitle]);

    const handleCountdownDone = useCallback(() => setReadyToClaim(true), []);

    const LIQRISK = 1.25
    const size = 80
    const isFrozen = sums?.isFrozen
    
    useEffect(() => {
        const loanType = d?.tokens?.[0]?.loanType;
        const addr = db?.address;
        if (!loanType || !addr || !s) return;

        (async () => {
            const res = await preview(loanType, s, addr, SENIORITY);
            setMaturing(res)
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [d?.tokens?.[0]?.loanType, db?.address, SENIORITY, s?.senior, s?.junior]);

    const handleSetTab = (bool) => {
        setTab(bool) // state required as ref won't rerender on tab change.
        setAmount(0)
        setBalance(initialBalance)
    }
    const setMax = (e) => {
        if (tab){
            setBalance(0)
            setAmount(e)
        } else {
            setBalance(e)
            setAmount(e)
        }
    }

    const HandleUnbondClaim = () => (
        <div onClick={() => withdrawclaimgeneric(hasMaturing.pending,SENIORITY)} style={{ width: size, height: size }} className="flex flex-col rounded-full bg-white text-black font-bold flex items-center justify-center select-none" >
            CLAIM
        </div>
    )

    const handleInputInvestment = (action) => {
        console.log('handleInputInvestment', action)
        const isAdd = action === 0 || action === 'add';
        const isRemove = action === 1 || action === 'remove';
        const STEP = 100; // base step to align with withdrawal form
        const step = (action === 'add' || action === 'remove') ? STEP * 10 : STEP;

        if (!isAdd && !isRemove) return;

        setAmount((prevAmount) => {
            let delta = step;
            setBalance((prevBalance) => {
                if (isAdd) {
                    delta = Math.min(step, prevBalance);
                    return prevBalance - delta;
                }
                delta = Math.min(step, prevAmount);
                return Math.min(initialBalance, prevBalance + delta);
            });
            return isAdd ? prevAmount + delta : Math.max(0, prevAmount - delta);
        });
    }

    const handleForceLoadUnionState = async () => {
        window.location.reload(true);
    }

    const handleBackToList = () => {
        setTokenview(false)
        setCardView('default')
    }

    const handleFundStatus = () => {
        const lowLiq = (attr.total_funds / Math.max(attr.total_lend,1)) < LIQRISK
        // we give a warning if 80% of funds is lended.
        return lowLiq
    }

    const handleWithdrawalPeriodWarning = (amount) => {
        // covered by idle, 
        return amount <= attr.invested ? '14 days' : 'more than 3 weeks'
    }

    if ((!s || !d)) {
        return (
            <div className="flex justify-center items-center py-10 text-sm dark:text-slate-300">
                Loading fund details...
            </div>
        );
    }

    const attr = tokenview && {
        frozen: sums.isFrozen,
        type: s.fund_type,
        disabled: false,
        rate: getRatePercent(d, fundSelected),
        invested: s.principal - (hasMaturing ? hasMaturing?.pendingPrincipalSnap : 0),
        junior_raw: s.junior,
        senior_raw: s.senior,
        funds: s.totals,
        lend: s.lent,
    }    
 
    const info = {
        GENERIC: 'Note: Growth Funds use a dynamic rate based on the available funds. Look at the APR history to see the progression of this fund.',
        PLANTING: 'Note: Planting funds finance new cultivations; rates adjust based on available capital.',
    }
    
    const subtitle = {
        GENERIC:"Earn by funding early stage cultivations.",
        PLANTING:"Earn by funding early stage cultivations."
    }

    const imageData = {
        GENERIC:"/images/planting_seeds.jpg",
        PLANTING:"/images/planting_seeds.jpg"
    }

    return (
        <>
        { tokenview ? 
            <div>
                <div className='bg-green dark:bg-green_dark rounded-t-3xl'>
                    <img className={'rounded-t-3xl opacity-70'} onClick={handleBackToList} src={imageData[attr.type]} alt={'inputfund'}/>
                </div>
                <div className='bg-gray-200 dark:bg-gray-700 pb-6 rounded-3xl'>
                    { activeWithdrawal && (() => {
                        const coveredByIdle  = Boolean(hasMaturing?.coveredByIdle);
                        const juniorLiquidityShort = coveredByIdle && (s?.juniorCash ?? 0) < (hasMaturing?.pendingPrincipalSnap ?? 0);
                        const covered        = coveredByIdle && !juniorLiquidityShort;
                        const canClaimNow         = readyToClaim && covered;
                        const liquidityShort      = !coveredByIdle || juniorLiquidityShort;
                        return (
                        <div className='bg-gray-200 dark:bg-gray-700'>
                            <div className='flex flex-col relative z-20 -my-6 mx-3 rounded-xl bg-green dark:bg-green_dark shadow-2xl overflow-hidden'>
                                <div className='flex flex-row justify-evenly p-3'>
                                    <div className='flex flex-col justify-center'>
                                        <p className='font-bold'>{canClaimNow ? 'Shares unbonded' : 'Unbonding your shares'}</p>
                                        <p className='text-xs'>amount: {(hasMaturing?.pendingPrincipalSnap).toFixed(2)} nIN</p>
                                                    </div>
                                    <div className='text-xs flex flex-col items-center justify-center'>
                                        { canClaimNow
                                            ? <HandleUnbondClaim />
                                            : covered
                                                ? <CountdownCircleWithdraw remainingSec={remainingSec} size={size} onDone={handleCountdownDone} />
                                                : (
                                                    <div style={{ width: size, height: size }} className='flex flex-col items-center justify-center rounded-full bg-white bg-opacity-20 text-white text-center gap-0.5'>
                                                        { checkingLiq
                                                            ? <div className='w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin' />
                                                            : <>
                                                                <span className='text-lg font-bold leading-none'>~3</span>
                                                                <span className='text-xs leading-none'>weeks</span>
                                                              </>
                                                        }
                                                    </div>
                                                )
                                        }
                                    </div>
                                </div>
                                { liquidityShort && (
                                    <div className='bg-amber-600 dark:bg-amber-700 px-12 py-6 flex flex-col gap-2'>
                                        <p className='text-xs text-white font-semibold'>
                                            { juniorLiquidityShort
                                                ? '⚠ Window open but blocked — the pool has funds, but not enough in the junior tranche to pay out right now. Contact your union.'
                                                : hasMaturing?.pastMin
                                                    ? '⚠ Window open but blocked — new borrowing restricted until loan repayments arrive'
                                                    : 'New borrowing restricted — waiting for loan repayments before payout can proceed'
                                            }
                                        </p>
                                        <button
                                            onClick={async () => {
                                                setCheckingLiq(true);
                                                const [res] = await Promise.all([
                                                    preview(d?.tokens?.[0]?.loanType, s, db?.address, SENIORITY),
                                                    new Promise(r => setTimeout(r, 5000)),
                                                ]);
                                                if (res) setMaturing(res);
                                                setCheckingLiq(false);
                                            }}
                                            className='text-xs text-white font-bold border border-white border-opacity-50 rounded-lg px-2 py-2 self-start active:scale-95'
                                        >
                                            Check again
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                    })()}
                    <h3 className='font-bold z-10 px-6 text-center text-xl bg-gray-200 dark:text-white dark:bg-gray-700 pt-12' >{names[fundSelected]}</h3>
                    <p className='font-bold text-center bg-gray-200 dark:text-slate-400 dark:bg-gray-700 pt-12'>Currently earning {Number(attr.rate || 0).toFixed(2)}% APY</p>
                    {handleFundStatus() && <p className='text-center bg-gray-200 dark:text-slate-400 dark:bg-gray-700 text-red pb-12 pt-1'>This fund has low liquidity!</p>}
                </div>
                <div className={`flex justify-around px-4 mt-12`}>
                    <h3 onClick={() => handleSetTab(true)} className={`font-bold ${!tab ? 'text-gray-400 dark:text-slate-400' : 'dark:text-white'} text-sm`}>Invest</h3>
                    <h3 onClick={() => handleSetTab(false)} className={`font-bold ${tab ? 'text-gray-400 dark:text-slate-400' : 'dark:text-white'} text-sm`}>Withdraw</h3>
                </div>
                { (() => {
                    const token       = d?.tokens?.[0];
                    const juniorCash  = token?.juniorCash      ?? 0;
                    const seniorPrinc = token?.seniorPrincipal ?? 0;
                    const threshPct   = token?.bucketThresholdPct ?? 10;
                    const juniorFloor = seniorPrinc * threshPct / 100;
                    const currentPct  = seniorPrinc > 0 ? (juniorCash / seniorPrinc * 100) : null;
                    const ratioOk     = juniorCash >= juniorFloor;
                    return (
                        <div className='flex items-center justify-between mx-0 mt-4 rounded-2xl bg-white dark:bg-gray-800 px-4 py-3'>
                            <p className={`text-xs font-bold ${ratioOk ? 'text-black dark:text-white' : 'text-black dark:text-white'}`}>
                                Junior / Senior Ratio{currentPct !== null ? `: ${currentPct.toFixed(1)}%` : ''}
                            </p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ratioOk ? 'text-green dark:text-green' : 'text-red dark:text-red'}`}>
                                {ratioOk ? `✓ ≥ ${threshPct.toFixed(0)}%` : `✗ Below ${threshPct.toFixed(0)}%`}
                            </span>
                        </div>
                    );
                })() }
                <div className='flex flex-col w-full mt-5 rounded-3xl bg-gray-200 dark:bg-gray-700 p-6 justify-between'>
                    
                    { !tab &&
                    <>
                        { /* WITHDRAW */ }
                        { attr.frozen && !typeof attr.frozen === "undefined" ?
                        <>
                        <div className='flex flex-row justify-between pb-4 text-center'>
                            <p className='flex font-bold text-red pt-3 items-center'>{}You are borrowing.</p>
                            <ClaimButton disabled={true} title={'Withdraw All'}/> 
                        </div>
                        <p className='flex pt-3 text-xs items-center'>You are unable to withdraw during the lending phase, but you can claim your interest and you continue to earn on your investment.</p>
                        </>
                        :
                        <>
                        <div className='flex flex-col justify-between'>
                            <div className='flex pt-3 font-bold dark:text-white'>
                                <p>You have invested: &nbsp;<s>{amount > 0 && attr.invested.toFixed(0)}</s>&nbsp; {(attr.invested - amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                            </div>
                            <div className="flex flex-row justify-between py-4">
                                <p className='flex font-bold dark:text-white text-3xl items-center py-4'>{amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                                <div className='flex flex-row'>
                                   <IndividualExchangeButton disabled_add={amount >= attr.invested} disabled_remove={amount <= 0} handleTx={(e) => handleInputInvestment(e)} title={attr.buttonTitle} texts={{ 'plus': 'add','minus': 'remove'}}/>
                                   <p className={`flex text-sm items-end px-1 dark:text-white ${attr.invested <= 0 && 'opacity-40'}`} onClick={() => setMax(attr.invested)}>max</p>
                                </div>
                            </div>
                            <p className='flex text-xs py-3 dark:text-slate-400'>⚠️ Withdrawal from this fund will take {handleWithdrawalPeriodWarning(amount)}.</p>
                        </div>
                        { isFrozen && <p className='flex text-xs py-3 dark:text-white'> ❌ To withdraw, pay off any debts first.</p> }
                        </>
                        }
                    </>
                    }
                    { tab &&
                    <>
                    { /* INVEST */ }
                    <div className='flex pt-3 font-bold dark:text-white items-center'>You have invested: &nbsp;<s>{amount > 0 && attr.invested.toFixed(0)}</s>&nbsp; {(attr.invested + amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</div>
                    <p className="flex pt-3 dark:text-white justify-between">Balance: {Number(balance).toFixed(1)} nIN</p>
                    <div className="flex flex-row justify-between py-4">
                        <p className='flex font-bold text-3xl dark:text-white items-center py-4'>{amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                        <div className='flex flex-row'>
                            <IndividualExchangeButton disabled_add={balance <= 0 ? true : false} disabled_remove={balance >= initialBalance ? true : false} handleTx={(e) => handleInputInvestment(e)} title={attr.buttonTitle} texts={{ 'plus': 'add','minus': 'remove'}}/>
                            <p className={`flex text-sm items-end px-1 dark:text-white ${(balance <= 0 || amount === balance) && 'opacity-40'}`} onClick={() => setMax(initialBalance)}>max</p>
                        </div>
                    </div>
                    {isUnionLeader && (
                    <>
                    <p className="text-xs font-bold tracking-wide text-gray-500 dark:text-slate-300">Select a Pool</p>
                    <div className="flex items-center justify-start pt-3">
                        <div className="flex rounded-full bg-gray-300 dark:bg-slate-600 p-1 text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => setInvestPool('junior')}
                                className={`px-3 py-1 rounded-full ${investPool === 'junior' ? 'bg-slate-400 dark:bg-slate-400 text-black dark:text-white' : 'text-gray-600 dark:text-slate-300'}`}
                            >
                                Junior
                            </button>
                            <button
                                type="button"
                                onClick={() => setInvestPool('senior')}
                                className={`px-3 py-1 rounded-full ${investPool === 'senior' ? 'bg-slate-400 dark:bg-slate-400 text-black dark:text-white' : 'text-gray-600 dark:text-slate-300'}`}
                            >
                                Senior
                            </button>
                        </div>
                    </div>
                    </>
                    )}
                    </>
                    }

                </div>
                { tab &&
                <>
                { /*
                <div className="flex p-8">
                    <input checked={!accept} onChange={() => setAccept(!accept)} type="checkbox" className="w-6 h-6 accent-black border-gray-300 rounded" />
                    <div className="pl-3">I understand I can loose my principal if borrowers are unable to pay back funds. I understand that my Union will try to reimburse me, but that this is not always guaranteed.</div>
                </div>
                */ }     
                <div className="flex p-8 dark:text-slate-400">
                    <input checked={!accept} onChange={() => setAccept(!accept)} type="checkbox" className="w-6 h-6 accent-black dark:accent-green_dark border-gray-300 rounded" />
                    <div className="pl-3">I understand this investment is for the {investInJunior ? 'JUNIOR pool. When members default on a loan, junior shares will be FIRST to reduce in value.' : 'SENIOR pool. Only when the junior base is depleted, will loan defaults reduce the value of my shares.'}</div>
                </div>                     
                <ClaimButton disabled={accept ? true : false} handleClick={() => investgeneric(amount.toString(), investInJunior)} title={'Invest'}/> 
                </>
                } 
                { !tab &&
                <div className='flex flex-col justify-evenly text-center'>
                <div className="flex p-8 dark:text-slate-400">
                    <input checked={true} readOnly type="checkbox" className="w-4 h-4 my-1 accent-black dark:accent-green_dark border-gray-300 rounded" />
                    <div className="pl-3 text-left">This will automatically withdraw all your pending earnings!</div>
                </div>                      
                <ClaimButton disabled={attr.invested > 0 && !isFrozen ? false : true } handleClick={() => withdrawgeneric(amount,SENIORITY)} title='Withdraw' /> 
                </div>                } 
                <div key="info" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4 dark:text-white">Info</h3>
                    <p className='text-sm dark:text-slate-400'>{info[attr.type] || info.GENERIC}</p>
                </div>
            </div> 
            : 
          <div>
            { data && data.map((d,index) => (
                <div key={index}>
                    <div onClick={() => handleTokenView(index)} className={`flex flex-col justify-between bg-white dark:bg-gray-700 mb-6 w-full rounded-3xl shadow-bottom-light`}>
                    <div className='flex flex-col justify-between'>
                        <div className='bg-green dark:bg-green_dark rounded-t-3xl'>
                            <img className={'rounded-t-3xl opacity-70'} src={imageData[d.type] || imageData.GENERIC} alt={'fund'}/>
                        </div>
                        <div>
                            <div className="flex flex-row p-4">
                                <div className="flex flex-col">
                                    <p className={`font-bold text-black dark:text-white`}>{names[index]}</p>
                                    <p className="text-gray-400 mb-3 dark:text-white">{subtitle[d.type] || subtitle.GENERIC}</p>
                                    <p className="text-gray-400 dark:text-slate-400">Total: {sums.funds[index].totals.toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                                    <p className="text-gray-400 dark:text-slate-400">Available: {Math.max(0, sums.funds[index].idleCash - sums.funds[index].claimableReserved).toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                                </div>
                            </div>
                            <div className="flex flex-row justify-end p-4">
                                <p className={`flex font-bold text-black items-center dark:text-slate-400`}>INVEST TO EARN ~{Number(getRatePercent(d, index) || 0).toFixed(2)}%</p>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            ))}
            {<div className='flex justify-center p-4'>{data.length === 0 && 'Your union does not have any funds yet.'}</div>}
            <div onClick={handleForceLoadUnionState} className='flex pt-6 flex-col items-center'>
                <ArrowPathIcon className="w-8 h-8 dark:text-slate-400"/>
                <p className='dark:text-slate-400'>reload.</p>
            </div>
            </div>
        }
        </>
      );
    };
    
export default InvestmentList;
