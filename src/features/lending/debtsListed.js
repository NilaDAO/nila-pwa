import { useState, useRef, useMemo } from 'react';
import { useDataContext,useViewModeContext } from '../../utils/NavigationContext.js';
import { RateSlider, ClaimButton, DropdownButton,AmountInput } from '../../components/UI/buttons.js';
import { ArrowPathIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import useTouch from '../../hooks/useTouch.js';
import { ethers } from "ethers";
import useLendingFlow from '../../hooks/useDirectLendingFlow.js'
import { useBorrowGeneric } from '../../hooks/useLoadFunds.ts';
import { motion } from 'framer-motion';
import { LoanConditions } from '../../misc/fund_loan_conditions.ts';

/**
 * Debt List V2. 
 * List of trade demands of local and global traders/suppliers), 
 *    read_txs: 
 *        - read all contracts by union address
 *        - fetch trades
 *        - fetch user debt positions
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
const DebtListed = ({ LAND, CAP}) => {
    const [ fund, setFund ]                                      = useState()
    const { handleToggleView }                                   = useTouch() 
    const { handleIssueVoucher }                                 = useLendingFlow()
    const { unionFunds, debts, setDebts }                        = useDataContext();
    const { borrowGeneric }                                      = useBorrowGeneric(fund?.fundAddress,fund?.fundName)
    const { tokenview }                                          = useViewModeContext();
    const [ presets, setPresets ]                                = useState({amount: 10000, rate: 1924})
    const [ amount, setAmount ]                                  = useState(10000)  
    const [ openIdx, setOpenIdx ]                                = useState(null)
    const [ conditions, setConditions ]                          = useState([])
    const [ notEligable, setNotEligable ]                        = useState(false)
    const [ APIOffline, setAPIOffline]                           = useState(false)
    const [ amountConfirmed, setAmountConfirmed ]                = useState(false)
    const [ rateConfirmed, setRateConfirmed ]                    = useState(false)
    const [ voucherRefetching, setVoucherRefetching ]            = useState(false)
    const [ voucherFastDraw, setVoucherFastDraw ]                = useState(true)
    const [ rate, setRate ]                                      = useState()
    const [ accept, setAccept ]                                  = useState(false)
    const [ directLoanForm, setDirectLoanForm ]                  = useState(false)
    const cap                                                    = CAP?.current    
    const MINCAP                                                 = (process.env.REACT_APP_MIN_CAP / (debts.length + 1)**2)
    const V                                                      = useRef()
    const FIXED_APR_TO_PERIODICALLY                              = 1 // when we use foodtokens, we can use a crop type specific constant
    const FIXED_APR_TO_PERIODICALLY_DEGREES                      = 0.01 // when we use foodtokens, we can use a crop type specific constant
    const landMeta                                               = LAND?.current?.LAND?.metadata || LAND?.current?.metadata
    const landAreaM2                                             = Number(landMeta?.area_m2 || 0)
    const hasLandAsset                                           = Boolean(LAND?.current?.hasLand)
    const hasPendingLandMint                                     = !hasLandAsset && Boolean(landMeta)

    const FUNDCONDITIONS = useMemo(() => {
        return LoanConditions(Number(MINCAP), landAreaM2);
    }, [MINCAP, landAreaM2]);

    const handleVerifyUser = async (f, chosenRateBP) => {
        if (!amount || amount <= 0) {
            setNotEligable(true);
            return;
        }
        // set spinner
        const input = fund
        setFund(false)
        const amountWei = ethers.parseUnits(String(amount),18)
        console.log('amountWei',amountWei)
        console.log('fund', LAND,CAP, amount)
        const voucher = await handleIssueVoucher(input,LAND,CAP, amountWei, chosenRateBP)
        console.log('voucher', voucher)
        setFund(input)

        // if no voucher is returned, we set the API offline and not eligible.
        if (!voucher) {
            setAPIOffline(true)
            setNotEligable(false)
        } // if a voucher is returned, we check the conditions.
        else if (voucher && voucher.conditions.every(x => x[1])){
            console.log('voucher conditions', voucher)
            setConditions(false)
            V.current = voucher
            setVoucherFastDraw(voucher.voucher?.fastDraw ?? voucher.voucher?._fastDraw ?? true)
            const headroom = voucher.voucher?.normalized_maxAmount
            const rate_perc = voucher.voucher?.minRateBP / 100 / FIXED_APR_TO_PERIODICALLY || voucher.voucher?.interestBP / 100 / FIXED_APR_TO_PERIODICALLY
            console.log('headroom,rate_perc ', headroom,rate_perc )
            setPresets({headroom: headroom, rate: rate_perc})
            // only reset the rate slider to the model minimum on the first fetch (no chosenRateBP);
            // on a re-fetch the user already confirmed their rate, preserve it
            if (chosenRateBP == null) setRate(rate_perc)
            if (amount > headroom){
                setAmount(headroom)
            }
            setNotEligable(false)
        } // if the voucher is returned but not all conditions are met, we set the conditions and not eligible.
        else {
            setConditions(voucher.conditions)
            setNotEligable(true)
        }
    }

    const handleSetAmountConfirmed = (val) => {
        setAmountConfirmed(val)
        setAmount(amount)
        setRate()
        setFund()
        setConditions([])
    }

    const handleSetFund = (f) => {
        console.log('f', f)
        // based on type (not yet available). we set a preset condition set.
        const type = f[5] || f[2]
        const fund = {
            type: type,
            loanType: f[2],
            amount: amount,
            conditions: FUNDCONDITIONS[type] || [],
            fundAddress: f[0],
            fundName: f[1],
            tokenAddress: '0x10D11eDD572ccb54D6D59f07521eA071Ed1C326E', // ONLY NILA
            contractname: f?.contractname
        }
        setAPIOffline(false)
        setFund(fund)
        setConditions(FUNDCONDITIONS[type] || [])
        setNotEligable(false)
    }

    const handleForceLoadUnionState = async () => {
        window.location.reload(true);
    }

    const handleBorrowOrPending = (V) => {
        // add choosen amount and rate, format values in voucher
        const _V = V.current.voucher
        _V['sig'] = V.current.signature
        _V['chosenAmount'] = ethers.parseUnits(String(amount),18)
        _V['chosenRate'] = rate * 100 * FIXED_APR_TO_PERIODICALLY
        _V['maturityTs'] = 0

        borrowGeneric(_V)
    }
    
    const measureRate = (rate,pre) => {
        switch (true) {
            case rate < pre:
                return '⚠️ Current Funding conditions make borrowing at this rate unlikely.'
            case rate >= pre && rate <= pre + 3:
                return '🎉 This we think is a fair rate.'
            case rate > pre + 3:
                return 'Your loan will likely get approved soon.'
            default:
                return 'Slide to set a rate.'
        }
    }

    const FUNDINFO = {
        "PLANTING":`The ${fund?.fundName || ''} fund finances new cultivations on already cleaned or recently planted fields. To pay for labor costs, machinery and seeds.`,
        "GENERIC":`The ${fund?.fundName || ''} fund finances new cultivations marked on the map. To pay for labor costs, machinery and seeds.`
    }

    console.log('conditions', conditions)

    return (
        <>
            <motion.div 
                className="flex flex-col bg-gray-400 dark:bg-gray-700 justify-between py-6 w-full rounded-3xl shadow-bottom-light"
                animate={{ height: directLoanForm ? 'auto' : '36' }}
            >
                <div className='flex flex-row justify-between p-4'>
                    <div className='flex flex-col dark:text-white justify-center'>
                        <p className='font-bold p-1'>Apply for a loan:</p>
                        { !directLoanForm &&
                        <p className='p-1 mr-6 text-xs'>{
                            hasPendingLandMint ? 'Pending land title mint.'
                            : !hasLandAsset ? 'First claim your land asset.' 
                            : !cap ? 'Check availability' 
                            : cap <= Number(MINCAP) ? 'You are eligible' 
                            : debts.length >= 1 ? `Your cap is too low for more than ${debts.length} debt positions`: 'First lower your cap by investing.'}</p>
                        }
                    </div>
                    { !directLoanForm && <ClaimButton color='white' disabled={hasPendingLandMint || cap > Number(MINCAP)} handleClick={!hasLandAsset ? () => handleToggleView({ix: 2}) : () => setDirectLoanForm(true)} title={hasPendingLandMint ? 'pending' : !hasLandAsset ? 'claim': !cap ? 'check' : cap <=  Number(MINCAP) ? 'apply' : 'unavailable'} />} 
                </div>
                { directLoanForm && 
                <div className='flex flex-col dark:text-white justify-between p-4'>
                    { /* Form to apply for an Instant Loan Steps: 
                                * if cap < 50 ? INSTANT LOAN OFFER?
                                * select fund, 
                                * set amount
                                * set rate
                                * request data (active cultivation multisig)
                                * return feedback (increase rate, decrease amount, no liquidity available)
                    */ }
                    { /* <h3 className='p-1 pt-3 font-bold'>Instant loans: <i>{cap < 100 ? 'Instant' : 'Unavailable: Low cap-rate'}</i></h3> */}
                    { /*<p className='p-1 pb-3 text-xs' >{cap < 100 ? 'The amount will be deposited directly to your wallet.' : 'Any amount will mainly be financed locally. Your union needs to sign first.' }</p> */ } 
                    <hr className="w-full border-t border-gray-500 dark:border-slate-800 my-4" />
                    <h3 className='p-1 font-bold'>Set amount to borrow:</h3>
                    { !amountConfirmed ? 
                        <AmountInput value={amount} color='white' initial={presets?.amount} onSet={() => handleSetAmountConfirmed(true)} onChange={(e) => setAmount(!e ? 0 : e)} />
                    :
                    <>
                    <div className='flex flex-row justify-between my-4 px-4'>
                        <div className='flex flex-row'>
                        <p>{`nIN ${Number(amount)?.toLocaleString('en-IN', {  maximumFractionDigits: 0})}/-`}</p>
                        <CheckIcon className={`mx-3 h-5 w-5 ${amount > presets?.amount ? ' text-red' : 'text-green'}`} />
                        </div>
                        <p onClick={() => handleSetAmountConfirmed(false)} className='mx-3 h-5 w-5'>edit</p>
                    </div>
                    <hr className="w-full border-t border-gray-500 dark:border-slate-800 my-4" />
                    <h3 className='p-1 font-bold mb-4'>Please select a fund:</h3>
                    <DropdownButton options={unionFunds} onSelect={(f) => handleSetFund(f)} color='white' />
                    
                    { conditions ?
                        <div className='flex flex-col py-8 justify-between'>
                            { fund &&
                            <>
                            <p className='py-3 text-xs'>{FUNDINFO[fund.type] || FUNDINFO.GENERIC}</p>
                            <p className='font-bold py-3'>Conditions and limitations:</p>

                            <ul>
                            { conditions.map((f,i) => (
                                <div key={i} onClick={() => setOpenIdx(openIdx === i ? null : i)} className='flex text-xs justify-end py-1 pr-1 flex-row'>
                                    <div className='flex flex-col text-end'>
                                        <span>- {f[0]}</span>
                                        {openIdx === i && (
                                            <p className={`p-2 my-2 w-full font-bold ${f[1] ? 'text-emerald-800 dark:text-green': 'text-rose-700 dark:text-red'}`}>{f[3]}</p>
                                        )}
                                    </div>
                                    <CheckIcon className='mx-3 h-5 w-5 text-emerald-800 dark:text-green' hidden={!f[1]} />
                                    <XMarkIcon className='mx-3 h-5 w-5 dark:text-red text-rose-700' hidden={f[1]} />
                                </div>
                            ))}
                            </ul>
                            </>
                            }
                        </div>
                        :
                        <>
                        <hr className="w-full border-t border-gray-500 mb-4" />
                        <h3 className='p-1 font-bold'>Conditions:</h3>
                        <div className='flex flex-row p-4'><span>All approved</span><CheckIcon className='mx-3 h-5 w-5 text-emerald-800 dark:text-green' /></div>
                        </>
                    }
                    { notEligable || APIOffline ? 
                        <div className='flex flex-col py-8 justify-between'>
                            { notEligable && <div className='flex flex-row'><XMarkIcon className='h-11 w-11 text-red mr-3' /><p className='text-xs font-bold'>Not eligible yet. Tap a condition to see what's missing, or try a different fund.</p></div>}
                            { APIOffline && <div className='flex flex-row'><XMarkIcon className='h-5 w-5 text-red' /><p className='text-xs font-bold'>The API is offline, try again later.</p></div>}
                        </div>
                        :
                        <>
                        { conditions &&
                        <ClaimButton color='white' disabled={notEligable || conditions?.length === 0 || !fund} handleClick={() => handleVerifyUser(fund)} title={'Verify'} /> 
                        }
                        </>
                    }
                    </>
                    }
                    { !conditions && 
                    <>
                        <hr className="w-full border-t border-gray-500 dark:border-slate-800 text-black my-4" />
                        { amountConfirmed &&
                        <>
                        <h3 className='p-1 mb-3 font-bold'>Set rate:</h3>
                        <div className='relative z-20 mx-4 rounded-xl bg-gray-200/10 dark:bg-gray-400/10 px-4 py-6 my-3 shadow-2xl backdrop-blur'>
                            <p className='font-bold'>Monthly increase: {(((rate * FIXED_APR_TO_PERIODICALLY_DEGREES) / 12) * amount).toLocaleString('en-IN', {  maximumFractionDigits: 2})} nIN</p>
                            <i className='text-xs dark:text-white'> (APR: ~{(rate * FIXED_APR_TO_PERIODICALLY).toLocaleString('en-IN', {  maximumFractionDigits: 2})}%)</i>
                        </div>
                        
                        { !rateConfirmed ?
                        <div className='flex flex-col items-center'>
                            <p className='text-xs p-1 pb-6'>Rate limits fluctuate, always check fund liquidity!</p>
                            <RateSlider type={'percentage'} decimals={1} initial={rate} onSet={async () => { setRateConfirmed(true); if (rate < presets.rate) { setVoucherRefetching(true); await handleVerifyUser(fund, Math.round(rate * 100 * FIXED_APR_TO_PERIODICALLY)); setVoucherRefetching(false); } }} max={20} onChange={v => setRate(v)} />
                            <p className='text-xs dark:text-white p-1 pt-3 pb-9 px-6'>{measureRate(rate,presets.rate)}</p>
                        </div>
                        :
                        <div className='flex flex-row justify-between my-4 px-4'>
                            <div className='flex flex-row'>
                            <p>{`${rate.toFixed(2)}%`}</p>
                            <CheckIcon className={`mx-3 h-5 w-5 ${rate < presets.rate ? 'dark:text-red text-rose-700' : 'text-emerald-800 dark:text-green'}`} />
                            </div>
                            <p onClick={() => setRateConfirmed(false)} className='mx-3 h-5 w-5'>edit</p>
                        </div>
                        }
                        { rateConfirmed && 
                            <>
                            <hr className="w-full border-t border-gray-500 dark:border-slate-800 text-black my-4" />
                            <h3 className='p-1 mt-3 font-bold'>Please accept payback schedule:</h3>
                            <div className="flex flex-row py-8 px-1">
                                <input checked={accept} onChange={() => setAccept(!accept)} type="checkbox" className="w-6 h-6 accent-white dark:accent-green_dark border-gray-300 rounded" />
                                <div className="pl-3">
                                    <p>Loans have to be paid back:</p>
                                    <li>in nIN.</li>
                                    <li>latest 3 weeks after harvest.</li>
                                </div>
                            </div>  
                            </>            
                        }
                        <ClaimButton color='white' disabled={voucherRefetching || !(rateConfirmed && accept)} handleClick={() => handleBorrowOrPending(V)} title={voucherRefetching ? 'Renewing offer...' : voucherFastDraw ? 'Get an instant loan' : 'Ask the union to accept.'} />
                        </>
                        }
                    </>
                    }
                </div>
                }
            </motion.div>
            <div onClick={handleForceLoadUnionState} className='flex pt-6 flex-col items-center'>
                <ArrowPathIcon className="w-8 h-8 dark:text-slate-400"/>
                <p className='dark:text-slate-400'>reload.</p>
            </div>
        </>
      );
    };
    
export default DebtListed;
