import React, { useState,useEffect } from 'react';
import { useDataContext, useNavContext,useViewModeContext } from '../src/utils/NavigationContext';
import { ClaimButton,IndividualExchangeButton } from '../src/components/UI/buttons';
import Spinner from '../src/components/UI/spinner';
import useTouch from '../src/hooks/useTouch';

const YEAR_IN_SECONDS = 365 * 86400

const DebtList = () => {
    const { tokenData,demands,setTxIndex, setTxDetails} = useDataContext();
    const { setTokenview} = useViewModeContext();
    const { handleTouchStart, handleTouchEnd} = useTouch()   
    const { setIx, cardIx } = useNavContext();
    const [paybackAmount, setPaybackAmount] = useState(0);
    const initialBalance = Number(tokenData.find((t) => t.sym === 'NILA').bal)

    const details = demands && demands[cardIx]
    const premature = details && details.data.total_staked <= 10 ? false : true
    const NILA_price = Number(process.env.REACT_APP_NILA_PRICE) 

    useEffect(() => {
        setPaybackAmount(details && details.data.total_staked)
    }, []); 

    const getLoanInFiatWithInterest = () => {
        const base = details.data.total_staked
        const rate = details.data.apr
        const timegap = details.data.timegap
        const interest = (base * rate * timegap) / (YEAR_IN_SECONDS * 10000)
        return ((details.data.total_staked * NILA_price) + (interest * NILA_price)).toFixed(0)
    }

    const handleRepayDebt = () => {
        setTxIndex('repay')
        setTokenview(true)
        setIx(6)
        setTxDetails({
            'amount': paybackAmount,
            'demandId': details.data.id,
        })
    }

    const handleAcceptDebt = () => { 
        setTxIndex('debt')
        setTokenview(true)
        setIx(6)
        setTxDetails({
            'demandId': details.data.id,
        })
    }

    const handleFunds = (e) => {
        if (e === 1){
            // partial
            setPaybackAmount(prev => prev - 1 < 1 ? 0 : prev - 1)
        } else {
            // max
            setPaybackAmount(Math.min(details.data.total_staked,initialBalance))
        }
    }

    return (
            <div 
                className="flex flex-col bg-white rounded-3xl w-full pb-[220px] py-4 my-6"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            > 
            { !details ?
            <div className='flex flex-col p-4'>
                <h3 className="font-bold text-sm py-4">Under construction</h3>
                <p className='text-sm'>Borrow instant based on your cap rate. Select a union fund and decide your own interest rate</p> 

            </div>
            :
            (premature && !details.confirmed) ? 
            <div className="flex flex-col text-black px-4 pb-6 bg-white rounded-br-3xl rounded-bl-3xl shadow-bottom">
                <ClaimButton disabled={false} handleClick={handleAcceptDebt} title={'Accept'}/>
                <div key="amount" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">Amount to grow:</h3>
                    <p className='text-sm'>You commit to deliver {details.data.amount} {details.data.nominator} {details.data.crop}.</p> 
                    <h3 className='font-bold p-4'>{details.data.amount} {details.data.nominator}</h3>
                </div>
                <div key="deadline" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">Deadline</h3>
                    <p className='text-sm'>The {details.data.amount} quintal {details.data.crop} should be delivered before: </p> 
                    <h3 className='font-bold p-4'>{details.data.deadline.toLocaleDateString('us-EN', { day: "numeric",month: 'long', year: 'numeric' })}</h3>
                </div>
                <div key="interest" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">Interest</h3>
                    <p className='text-sm'>The interest rate is set to {details.data.apr/100}%</p> 
                    <h3 className='font-bold px-4 pt-4'>Total cost: {getLoanInFiatWithInterest(details)} nIN </h3>
                    <p className='text-xs text-gray-800 pl-4'>based on repayment one month after the deadline.</p> 


                </div>
                <div key="certs" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">Certificates</h3>
                    <p className='text-sm'>No certificates are required for this cultivation.</p> 
                </div>
                <div key="insurance" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">Insurance</h3>
                    <p className='text-sm'>There is no insurance available for this debt. If possible, insure this cultivation at an external provider.</p>                
                </div>
                <div key="monitoring" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">3 Milestones</h3>
                    <ul className="list-disc pl-5">
                        <li className="py-1" >Tillering: Early flowering or tillering shows that cultivation has officially kicked off.</li>
                        <li className="py-1">Biomass growth:  The amount of grown vegetation lets us estimate if {details.data.amount} {details.data.nominator} is feasible.</li>
                        <li className="py-1">Pod/Filling: Observing mature growth helps confirm if the deadline is being met.</li>
                    </ul>                
                </div>
                <div key="noncompliance" className='flex flex-col p-4'>
                    <h3 className="font-bold text-sm py-4">Compliance</h3>
                    <p className='text-sm'>If milestones aren’t reached within the expected timeframe (due to intent or due to weather conditions), then:</p>                
                    <ul className="list-disc p-5">
                        <li className="py-1" >Your assets - and any invested rewards - will be frozen until the required signals are detected.</li>
                        <li className="py-1" >Your union leader will contact you to discuss the next steps.</li>
                        <li className="py-1" >In case of further delinquency, frozen assets can be sold to disburse creditors.</li>
                    </ul>                
                </div>
            </div>
            : ( details.confirmed) ? 
              <>
                <div key="amount" className='flex flex-col p-4'>
                <p className="font-bold text-sm">Your Balance: {Number(initialBalance * NILA_price).toFixed(0)} nIN</p>
                </div>
                <div className='flex flex-col bg-gray-200 p-6 justify-between'>
                    <div>
                        <p className='flex items-center'>Pay back your debt</p>
                        <p className='flex font-bold text-3xl  items-center py-4'>{(paybackAmount * process.env.REACT_APP_NILA_PRICE).toFixed(0)} nIN</p>
                        <p className='flex text-xs items-center'>{paybackAmount < 1 ? 'Amount has to be larger then 1 USD' : ''}</p>

                    </div>
                    <IndividualExchangeButton disabled_add={paybackAmount === details.data.total_staked ? true : false} disabled_remove={false} handleTx={(e) => handleFunds(e)} title={''} texts={{ 'plus': 'max','minus': 'partial'}}/>
                </div>
                <ClaimButton disabled={paybackAmount < 1 ? true : false} handleClick={handleRepayDebt} title={'Repay'}/>
              </> 
            : 
            <div className='flex flex-col h-full py-4'>
              <h3 className="font-bold text-sm px-4 pt-4">Please wait while we are collecting funds to give you an offer.</h3>
              <p className='text-sm px-4 pt-4 pb-48'>This can take several days.</p>
              <Spinner />
            </div> 
            }
            </div> 
          
      );
    };
    
export default DebtList;
