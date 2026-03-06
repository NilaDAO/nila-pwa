import { useState } from 'react';
import { useDataContext, useNavContext} from '../../utils/NavigationContext.js';
import { IndividualExchangeButton, ClaimButton } from '../../components/UI/buttons.js';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import useTouch from '../../hooks/useTouch.js';
import { useRepayGeneric } from '../../hooks/useLoadFunds.ts';
import { motion } from 'framer-motion';
import { setDBitem } from '../../utils/db';

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

const DebtsActive = ({ debt }) => {
    const { handleToggleView }                                   = useTouch() 
    const { repaygeneric }                                       = useRepayGeneric()
    const { db, debts, setDebts }                                = useDataContext();
    const { setCardIx }                                          = useNavContext();
    const [ outstanding, setOutstanding ]                        = useState(debt?.outstanding)
    const [ amount, setAmount ]                                  = useState(0)
    const [ directLoanForm, setDirectLoanForm ]                  = useState(false)
    const MONTHLY_DUE                                            = (debt?.rateBP * 0.0001 / 12) * debt?.outstanding
    const PENDING_LOAN                                           = debt.drawdownTs === 0n
    const handleForceLoadUnionState = async () => {
        window.location.reload(true);
    }

    const handleRefreshLoanStatus = () => {
        if (!debt?.loanID) return;
        const newDebtsArray = debts.filter((d) => d.loanID !== debt.loanID);
        setDebts(newDebtsArray);
        setDBitem('debts', newDebtsArray, 'Init');
        window.location.reload(true);
    }

    const handleRepayOrCancel = () => {
        if (PENDING_LOAN){
            if (confirm('Are you sure to cancel your loan petition?')){
                const newDebtsArray = debts.filter((d) => d.loanID !== debt.loanID)
                setDebts(newDebtsArray)
                setCardIx(false)
                setDBitem('debts',newDebtsArray,'Init') // tiny helper to create|update db
                handleToggleView({ ix: null })
            }
        } else {
            setDirectLoanForm(true)
        }


    }

    const setMax = () => {
        setOutstanding(0)
        setAmount(debt?.outstanding)
    }

    const handleInputInvestment = (e) => {
        // first condition max elements
        if (e === 'add'){
            setAmount(prev => prev + 1000)
            setOutstanding(prev => prev - 1000);
        } else if (e === 'remove'){
            setAmount(prev => prev - 1000)
            setOutstanding(prev => prev + 1000);
        } else if (outstanding >= 1 && !e){ 
            setAmount(amount + 100)
            setOutstanding(prev => prev - 100);
        } else if (outstanding < 1 && !e) {
            setAmount(amount + outstanding)
            setOutstanding(prev => prev - outstanding);
        } // remove
        else if (amount >= 1 && e){
            setAmount(amount - 100)
            setOutstanding(prev => prev + 100);

        } else {
            setAmount(0)
            setOutstanding(debt.outstanding);
        }
    }

    return (
        <>
        { debt.type === 'DEFAULTED' ? 
            <div className='mb-[220px]'>     
                <motion.div className="flex flex-col bg-gray-100 dark:bg-darkgrey justify-between -mt-8 py-6 my-12 w-full rounded-3xl shadow-bottom-light" 
                    animate={{ height: directLoanForm ? 'auto' : '36' }}>
                    <div className='flex flex-col mx-6 p-4 dark:text-white justify-center'>
                        <p className='font-bold py-3 text-sm'>To maintain the stability of the fund, {db['union']['name']} has adjusted the value of each union share. Here's what you can do to restore the balance:</p>
                        <ul>
                            <li className='py-1 text-xs dark:text-slate-400'>* Your CAP has been raised, meaning you'll need to increase your investment before taking a new loan.</li>
                            <li className='py-1 text-xs dark:text-slate-400'>* Grants will restart once your membership is restored.</li>
                            <li className='py-1 text-xs dark:text-slate-400'>* New loans will be reviewed by the union.</li>
                            <li className='py-1 text-xs dark:text-slate-400'>* Negotiate a new rate that fits your situation.</li>
                            <li className='py-1 text-xs dark:text-slate-400'>* Agree to a restructuring plan and pay what you can in monthly installments.</li>
                        </ul>
                    </div>
                </motion.div>
                <motion.div className="flex flex-col bg-darkgrey justify-between -mt-8 py-6 w-full rounded-3xl shadow-bottom-light"
                    animate={{ height: directLoanForm ? 'auto' : '36' }}
                >
                <div className='flex flex-row justify-between p-4'>
                    <div className='flex flex-col text-white justify-center'>
                        <p className='font-bold p-1'>Phase: restructuring</p>
                    </div>
                    { !directLoanForm && <ClaimButton color='white' disabled={false} handleClick={handleRepayOrCancel} title='Setup installments' />} 
                </div>
                { directLoanForm && 
                        <div className='flex flex-col text-white justify-between p-6'>
                            <hr className="w-full border-t border-gray-500 dark:border-slate-800 mb-4" />
                            <p className="font-bold text-sm">Please enter the maximum you are able to pay per month</p>
                            <div className="flex flex-row justify-between p-4">
                                <p className='flex font-bold text-3xl items-center py-4'>{(amount).toLocaleString('en-IN')} nIN</p>
                                <div className='flex flex-row'>
                                    <IndividualExchangeButton disabled_add={outstanding <= 0 ? true : false} disabled_remove={outstanding >= debt.outstanding ? true : false} handleTx={(e) => handleInputInvestment(e)} title={'what is here?'} texts={{ 'plus': 'add','minus': 'remove'}}/>
                                    <p className={`flex text-sm items-end px-1 ${outstanding <= 0 && 'opacity-40'}`} onClick={() => setMax()}>max</p>
                                </div>
                            </div>                        
                            <p className="font-bold text-sm">Outstanding: {(outstanding).toLocaleString('en-IN')} nIN</p>
                        </div>
                }
                { amount > 0 && <ClaimButton color='white' disabled={false} handleClick={() => repaygeneric(debt,amount)} title={'setup installments'} />} 

            </motion.div>
            </div> 
            : 
          <div>
            {PENDING_LOAN && <div className='mb-16'><ClaimButton color='white' disabled={false} handleClick={handleRefreshLoanStatus} title={'check status'} /></div>}
            <motion.div className="flex flex-col bg-darkgrey justify-between -mt-8 py-6 my-12 w-full rounded-3xl shadow-bottom-light"
                animate={{ height: directLoanForm ? 'auto' : '36' }}
            >
                <div className='flex flex-row justify-between p-4'>
                    <div className='flex flex-col text-white justify-center'>
                        <p className='font-bold p-1'>{debt.dueDate === 0 ? `Monthly increase: ${MONTHLY_DUE.toFixed(0)} nIN`: PENDING_LOAN ? 'Wait for a decision' :'Monthly increase: 0 nIN'}</p>
                        <p className='p-1 text-xs text-gray-200 dark:text-slate-400'>{debt.dueDate ? '⚠️ The loan will not bear additional interest.' :   PENDING_LOAN ? '⚠️ You do not pay any interest while loans are pending.':'⚠️ As long as we do not detect a harvest, the total amount will increase.'}</p>
                    </div>
                </div>
            </motion.div>
            <motion.div className="flex flex-col bg-darkgrey justify-between -mt-8 py-6 w-full rounded-3xl shadow-bottom-light"
                animate={{ height: directLoanForm ? 'auto' : '36' }}
            >
                <div className='flex flex-row justify-between p-4'>
                    <div className='flex flex-col text-white justify-center'>
                        <p className='font-bold p-1'>{debt.dueDate === 0 ? 'Phase: Holding' : PENDING_LOAN ? 'Wait for a decision' : 'Phase: repayment'}</p>
                        <p className='p-1 text-xs max-w-48'>{PENDING_LOAN ? 'Low rate loans can be given under specific circumstances. Ask your union for details.' : !debt.dueDate ? 'No need to do anything, but you can repay.' : 'repayment required'}</p>
                    </div>
                    { !directLoanForm && <div className='flex flex-col gap-2'>
                        <ClaimButton color='white' disabled={false} handleClick={handleRepayOrCancel} title={PENDING_LOAN ? 'cancel' : 'repay'} />
                    </div>} 
                </div>
                { directLoanForm && 
                        <div className='flex flex-col text-white justify-between p-4'>
                        <hr className="w-full border-t border-gray-500 dark:border-slate-800 my-4" />
                        <p className="font-bold text-sm">Outstanding: {(outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                        <div className="flex flex-row justify-between p-4">
                            <p className='flex font-bold text-3xl items-center py-4'>{(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                            <div className='flex flex-row'>
                                <IndividualExchangeButton disabled_add={outstanding <= 0 ? true : false} disabled_remove={outstanding >= debt.outstanding ? true : false} handleTx={(e) => handleInputInvestment(e)} title={'what is here?'} texts={{ 'plus': 'add','minus': 'remove'}}/>
                                <p className={`flex text-sm items-end px-1 ${outstanding <= 0 && 'opacity-40'}`} onClick={() => setMax()}>max</p>
                            </div>
                        </div>                        
                        </div>
                }
                { amount > 0 && <ClaimButton color='white' disabled={false} handleClick={() => repaygeneric(debt,amount)} title={'pay back'} />} 

            </motion.div>
            <div onClick={handleForceLoadUnionState} className='flex pt-6 flex-col items-center'>
                <ArrowPathIcon className="w-8 h-8 dark:text-slate-400"/>
                <p className='dark:text-slate-400'>reload.</p>
            </div>
            </div>
        }
        </>
      );
    };
    
export default DebtsActive;
