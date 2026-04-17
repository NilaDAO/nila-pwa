import { useState, useEffect } from 'react'
import InvestmentList from './investmentsList.js';
import DebtListed from './debtsListed.js';
import { ClaimButton } from '../../components/UI/buttons.js';
import { useDataContext, useNavContext, useViewModeContext } from '../../utils/NavigationContext';
import { useLoadFundsData, useWithdrawGeneric } from '../../hooks/useLoadFunds.ts';
import { usePreviewUnbond } from '../../hooks/useInvest.ts';
import Spinner from '../../components/UI/spinner';

const Investments = ({LAND, CAP, funds, sums}) => {
    const { db, unionFunds, tokenData }                                                             = useDataContext();
    const { prevIx }                                                                                = useNavContext();
    const { navRef, setTokenview, tokenview, setCardView }                                          = useViewModeContext();
    const ready                                                                                     = true //!!funds.length > 0 && !!db.address
    const { data: investmentdata,isLoading: InvL, isError: InvE, isPending: InvP, Error: InvError } = useLoadFundsData(db?.union?.address,funds, db.address);
    const [ loadStage, setLoadStages]                                                               = useState('loading funds')
    const [ fundSelected, setFundSelected ]                                                         = useState(0)
    const [ loading, setLoading]                                                                    = useState(true);
    const [ tab, setTab]                                                                            = useState(navRef.current.assetTab) // ref only on remount of component
    const [ yieldUnbond, setYieldUnbond ]                                                          = useState(null)  // result of previewUnbond for yield card
    
    const names          = unionFunds?.map(f => f[4] + ' ' + f[1])
    const pending        = sums?.total_rewards
    // pick the first fund that has a sums entry to drive the yield card
    const s0             = sums?.funds?.[0] ?? null
    const d0             = investmentdata?.[0] ?? null
    const loanType0      = d0?.tokens?.[0]?.loanType ?? null
    const SENIORITY      = s0?.junior > 1 ? 0 : 1
    const activeYieldUnbond = Boolean(Number(yieldUnbond?.requestTs)) && yieldUnbond?.pendingPrincipalSnap > 0

    const { preview }         = usePreviewUnbond(db?.union?.address)
    const { withdrawgeneric } = useWithdrawGeneric(db?.union?.address, s0, s0?.tokens?.[0])

    useEffect(() => {
        if(!unionFunds || unionFunds && unionFunds.length === 0){
            setLoadStages(db['union'] ? 'Your union does not have any funds yet.' : 'Join a union to invest in funds.')
            setLoadStages(db['union'] ? 'Your union does not have any funds. Change union or ask your union for further details.' : 'Join a union to apply for a loan.')
            return;
        }
        if(!InvL && !InvE && !InvP && sums){
            setLoading(false)
        }
        if(InvError){
            console.log('error', InvError)
            setLoadStages('Something has gone wrong. Please try again later.')
        }
    }, [InvL,InvE, investmentdata, tokenData]);

    // load unbond state for the yield card whenever fund data is ready
    useEffect(() => {
        if (!loanType0 || !db?.address || !s0) return;
        (async () => {
            const res = await preview(loanType0, s0, db.address, SENIORITY)
            setYieldUnbond(res)
        })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loanType0, db?.address, SENIORITY])

    const handleSetTab = (bool) => {
        setTab(bool)
        navRef.current.assetTab = bool
    }

    const handleTokenView = (elements) => {
        setCardView('transactionview')
        setTokenview(true);
        setFundSelected(elements)
        prevIx.current = 1
    }

    const size = 72

    return (
        <div className={`flex flex-col rounded-3xl w-full mb-[220px] pb-6`}>
            {loading ?
                <div className='flex h-1/2 justify-center'>
                    <Spinner stages={loadStage} size={'small'} />
                </div>
                :
                <div className={`flex flex-col w-full mb-[220px]`}>
                    <div className={`flex bg-white py-9 rounded-tl-3xl rounded-tr-3xl dark:bg-opacity-0 ${tokenview ? 'hidden' : ''} justify-around p-4`}>
                        <h3 onClick={() => handleSetTab(true)} className={`font-bold ${!tab ? 'text-gray-400 dark:text-slate-400' : 'dark:text-white'} text-sm`}>Funds</h3>
                        <h3 onClick={() => handleSetTab(false)} className={`font-bold ${tab ? 'text-gray-400 dark:text-slate-400' : 'dark:text-white'} text-sm`}>Borrow</h3>
                    </div>
                    { tab ?
                    <>
                    <div className={`flex flex-col ${tokenview || !tab ? 'hidden' : ''} ${pending > 0.01 ? 'bg-gray-200 dark:bg-slate-800' : 'bg-gray-400 dark:bg-slate-800'} justify-between py-6 mb-6 w-full rounded-3xl shadow-bottom-light`}>
                        <div className='flex flex-row justify-between items-center p-4'>
                            <div className={`flex flex-col justify-center text-black dark:text-white`}>
                                <p className='font-bold p-1'>Pending earnings:</p>
                                <p className='p-1 text-xs'>{!pending ? 'Invest to earn interest' : pending > 0.01 ? `${pending.toLocaleString('en-IN', { maximumFractionDigits: 4})} nIN` : '~0 nIN (too small to claim)'}</p>
                                { activeYieldUnbond &&
                                    <p className='p-1 text-xs opacity-60'>Unbonding {(yieldUnbond?.pendingPrincipalSnap ?? 0).toFixed(2)} nIN</p>
                                }
                            </div>
                            <ClaimButton disabled={pending > 0.01 && !activeYieldUnbond ? false : true} handleClick={() => withdrawgeneric(pending, SENIORITY)} title={activeYieldUnbond ? 'Unbonding' : 'Claim'} />
                        </div>
                    </div>
                    <InvestmentList LAND={LAND} names={names} sums={sums} handleTokenView={handleTokenView} data={investmentdata} fundSelected={fundSelected} />
                    </>
                    :
                    <DebtListed LAND={LAND} CAP={CAP} />
                    }
                </div>
            }
        </div>
    )
}

export default Investments
