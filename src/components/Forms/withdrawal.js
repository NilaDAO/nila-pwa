import { useState, useEffect } from 'react';
import { formatUnits } from 'ethers';
import { useDataContext, useViewModeContext } from '../../utils/NavigationContext';
import { useSendTokens, useFxPool, } from "../../hooks/useWallet.ts";
import { ClaimButton, SlideToggle, IndividualExchangeButton } from '../UI/buttons';
import QR from "../UI/qrCode.js";
import { PencilSquareIcon } from '@heroicons/react/24/solid';

const FEE = 0.998; // 0.2% fee

const Confirm_N = ({ amount,setConfirm,handleSend,db,type}) => (
    <div className="flex flex-col w-auto max-w-[98vw] p-6 items-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-center mt-6">
      { !type ?
      <div className="flex flex-col w-[98vw] p-6 justify-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full mt-6 ">
        <div className='flex flex-col w-[70%] self-center'>
          <QR digitalAddress={db['address']} />
          <p className='self-center m-3 text-xs dark:text-white' onClick={() => setConfirm(false)}>change amount</p>
        </div>
      </div>
      :
      <>
      <p className="font-bold text-sm dark:text-white m-12">You receive</p>
      <div className='flex flex-row'>
        <p className='font-bold dark:text-white text-3xl'>{(amount * FEE).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 1 })}/- INR</p>
        <PencilSquareIcon className='w-6 h-6 dark:text-white -mt-3' onClick={() => setConfirm(false)}/>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-400 mx-4 mb-8">{(amount * ((1/FEE)-1)).toFixed(2)}/- nIN handling fee.</p>
      <ClaimButton disabled={amount <= 0} handleClick={() => handleSend()} title={'Swap'}/>
      </>
      }
    </div>
)

const Confirm_U = ({ amount, setConfirm, handleUSend, txtype }) => {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const { quoteRedeem } = useFxPool();

  useEffect(() => {
    let active = true;
    if (!txtype || !quoteRedeem || amount <= 0) return;
    setLoading(true);
    setErr(null);
    (async () => {
      try {

        console.log('amount res', amount);

        const res = await quoteRedeem(amount);
        console.log('quoteRedeem res', res);
        if (!active) return;
        // quoteRedeem returns tuple: [usdtOut, feeUsdt, compUsdt, epochRate, currentRate, diffBps, userGained]
        const usdtOut = res?.usdtOut ?? res?.[0] ?? 0n;
        const feeUsdt = res?.feeUsdt ?? res?.[1] ?? 0n;
        setQuote({
          usdtOut: Number(formatUnits(usdtOut, 6)),
          feeUsdt: Number(formatUnits(feeUsdt, 6)),
        });
      } catch (e) {
        if (!active) return;
        console.error('quoteRedeem failed', e);
        setErr('Unable to fetch quote');
        setQuote(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [amount, txtype, quoteRedeem]);

  const usdLabel = quote ? `${quote.usdtOut.toLocaleString('en-IN', {  maximumFractionDigits: 2})} USDt` : `${(amount * FEE).toLocaleString('en-IN')} USDt`;

  return (
    <div className="flex flex-col w-auto max-w-[98vw] p-6 items-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-center mt-6">
      { txtype ?
      <>
      <p className="font-bold text-sm dark:text-white m-12">You receive</p>
      <div className='flex flex-row'>
        <p className='font-bold dark:text-white text-3xl'>
          {loading ? 'Calculating…' : usdLabel}
        </p>
        <PencilSquareIcon className='w-6 h-6 dark:text-white -mt-3' onClick={() => setConfirm(false)}/>
      </div>
      {err && <p className="text-xs text-red-500 mx-4 mb-2">{err}</p>}
      {!err && quote && <p className="text-xs text-gray-400 dark:text-slate-400 mx-4 mb-2">Fee: {quote.feeUsdt.toLocaleString('en-IN')} USDt</p>}
      <ClaimButton disabled={amount <= 0 || loading} handleClick={() => handleUSend()} title={'Swap'}/>
      </>
      :
      <>
      <p className="font-bold text-sm dark:text-white m-12">You receive</p>
      <div className='flex flex-row'>
        <p className='font-bold dark:text-white text-3xl'>{(amount * FEE).toLocaleString('en-IN')}/- nIN</p>
        <PencilSquareIcon className='w-6 h-6 dark:text-white -mt-3' onClick={() => setConfirm(false)}/>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-400 mx-4 mb-8">{(amount * ((1/FEE)-1)).toFixed(2)}/- nIN handling fee.</p>
      <ClaimButton disabled={amount <= 0} handleClick={() => handleUSend()} title={'Swap'}/>
      </>
      }
    </div>
  );
}

const BankTransfer = ({methods,method}) => (
      <>
      <p className="flex font-bold dark:text-white justify-center mb-6">{methods[method - 1].name}</p>
      <div className="flex flex-col w-auto max-w-[98vw] items-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-center p-4">
          <p className="text-sm dark:text-white">Sorry.</p>
          <p className="text-sm dark:text-white">Direct bank transfers are</p>
          <p className="text-sm dark:text-white">not available </p>
          <p className="text-sm dark:text-white">for now.</p>
      </div>
      </>
  )

const ExchangeCrypto = ({methods,method,db,unionName,handleInputNAmount,handleInputUAmount,handleSend,handleUSend,handleSetNMax,handleSetUMax,setConfirm,type,_confirm,amount,n_balance,u_balance,n_initialBalance,u_initialBalance,txtype}) => (
      <>
      { type ?
      <>
        { _confirm ?          
         <Confirm_U amount={amount} setConfirm={setConfirm} handleUSend={handleUSend} txtype={txtype} db={db} />
          :
        <div className="flex flex-col w-auto max-w-[95vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4 my-6">
          <p className="font-bold text-center dark:text-white text-sm mt-12">How much nIN to swap?</p>
          <p className="text-center dark:text-slate-400 text-xs">Balance: {(Number(n_balance)).toLocaleString('en-IN')} nIN</p>
          <div className="flex flex-row justify-evenly my-6">
              <p className='flex font-bold text-3xl whitespace-nowrap items-center dark:text-white px-4'>{(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
              <div className='flex flex-row'>
                <IndividualExchangeButton disabled_add={n_balance <= 0 ? true : false} disabled_remove={n_balance >= n_initialBalance ? true : false} handleTx={(e) => handleInputNAmount(e)} title={''} texts={{ 'plus': 'add','minus': 'remove'}}/>
                <p className={`flex text-sm items-end px-1 dark:text-white ${(n_balance <= 0 || amount === n_initialBalance) && 'opacity-40'}`} onClick={handleSetNMax}>max</p>
              </div>
          </div>
          <ClaimButton disabled={amount <= 0} handleClick={() => setConfirm(true)} title={'Set'}/>
        </div>
      }
      </>
      :
      <>
        { _confirm ? 
          <Confirm_U amount={amount} setConfirm={setConfirm} handleUSend={handleUSend} txtype={txtype} db={db} />
          :
        <div className="flex flex-col w-auto max-w-[98vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4 mt-6">
          <p className="font-bold text-center dark:text-white text-sm mt-12">How much nIN to receive?</p>
          <p className="text-center dark:text-slate-400 text-xs">Balance: {(Number(u_balance)).toLocaleString('en-IN', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })} USDt</p>
          <div className="flex flex-row justify-evenly my-6">
              <p className='flex font-bold text-3xl items-center dark:text-white px-4'>{(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
              <div className='flex flex-row'>
                <IndividualExchangeButton disabled_add={false} disabled_remove={false} handleTx={(e) => handleInputUAmount(e)} title={''} texts={{ 'plus': 'add','minus': 'remove'}}/>
                <p className={`flex text-sm items-end px-1 dark:text-white ${(u_balance <= 0 || amount === u_initialBalance) && 'opacity-40'}`} onClick={handleSetUMax}>max</p>
              </div>
          </div>
          <ClaimButton disabled={amount <= 0} handleClick={() => setConfirm(true)} title={'Set'}/>
        </div>
        }
      </>
      }
      </>
  )

const CashToUnion = ({methods,method,db,unionName,ShowReceipt,tag,handleOpenForm,handleInputNAmount,handleSend,handleSetNMax,setConfirm,type,_confirm,amount,n_balance,n_initialBalance,txtype}) => (
      <>
      { type ?
      <>
        { _confirm ? 
          <>        
          { tag ? <ShowReceipt tag={tag} handleOpenForm={handleOpenForm}/> : <Confirm_N amount={amount} setConfirm={setConfirm} handleSend={handleSend} type={type} db={db} />}
          </>
          :
        <div className="flex flex-col w-auto max-w-[95vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4 my-6">
          <p className="font-bold text-center dark:text-white text-sm mt-12">How much cash to receive?</p>
          <p className="text-center dark:text-slate-400 text-xs">Balance: {(Number(n_balance)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} nIN</p>
          <div className="flex flex-row justify-evenly my-6">
              <p className='flex font-bold text-3xl whitespace-nowrap items-center dark:text-white px-4'>{(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
              <div className='flex flex-row'>
              <IndividualExchangeButton disabled_add={n_balance <= 0 ? true : false} disabled_remove={n_balance >= n_initialBalance ? true : false} handleTx={(e) => handleInputNAmount(e)} title={''} texts={{ 'plus': 'add','minus': 'remove'}}/>
              <p className={`flex text-sm items-end dark:text-white ${(n_balance <= 0 || amount === n_initialBalance) && 'opacity-40'}`} onClick={handleSetNMax}>max</p>
              </div>
          </div>
          <ClaimButton disabled={amount <= 0} handleClick={() => setConfirm(true)} title={'Set'}/>
        </div>
      }
      </>
      :
      <>
        { _confirm ? 
          <>
          <Confirm_N amount={amount} setConfirm={setConfirm} handleSend={handleSend} txtype={txtype} db={db} />
          <p className="text-center dark:text-slate-400 my-6">❗Let {unionName} scan this QR code.</p>
          </>
          :
        <div className="flex flex-col w-auto max-w-[98vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4 mt-6">
          <p className="font-bold text-center dark:text-white text-sm mt-12">How much cash did you bring?</p>
          <p className="text-center dark:text-slate-400 text-xs">To generate a payment QR</p>
          <div className="flex flex-row justify-evenly my-6">
              <p className='flex font-bold text-3xl items-center dark:text-white px-4'>{(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
              <div className='flex flex-row'>
                <IndividualExchangeButton disabled_add={false} disabled_remove={false} handleTx={(e) => handleInputNAmount(e)} title={''} texts={{ 'plus': 'add','minus': 'remove'}}/>
              </div>
          </div>
          <ClaimButton disabled={amount <= 0} handleClick={() => setConfirm(true)} title={'Set'}/>
        </div>
        }
      </>
      }
      </>
  )


const ShowReceipt = ({tag,handleOpenForm}) => {
  return (
    <div className="flex flex-col w-auto max-w-[98vw] items-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-center p-4 mt-6">
      <p className='font-bold text-lg'>{tag}</p>
      <p className='flex dark:text-white text-xs my-3 mx-6'>Show the tag as proof of your payment.</p>
      <p onClick={() => handleOpenForm('receipts')} className='dark:text-white' >show receipts</p>
    </div>
)}

const Withdraw = ({handleOpenForm }) => {
  const { db, tokenData }                   = useDataContext()
  const { setTokenview }                    = useViewModeContext();
  const { sendTokens }                      = useSendTokens();
  const { mintNin, redeemNin }              = useFxPool();
  const [ tag, setTag ]                     = useState(null)
  const [ method, setMethod ]               = useState()
  const [ type, setType ]                   = useState(true)   // true = add nIN from USDt, false = redeem to USDt
  const [ swipeStartX, setSwipeStartX ]     = useState(null)
  const [ txtype, setTxType ]               = useState(true)   // mirrors type for fx pool direction
  const [ _confirm, setConfirm ]            = useState(false)
  const exchangeRate                        = tokenData.find((t) => t.sym === 'nIN').p
  const n_initialBalance                    = Number(tokenData.find((t) => t.sym === 'nIN').bal)
  const u_initialBalance                    = Number(tokenData.find((t) => t.sym === 'USDT').bal)
  const [ n_balance, setNBalance ]          = useState(n_initialBalance)
  const [ u_balance, setUBalance ]          = useState(u_initialBalance)
  const [ amount, setAmount ]               = useState(0)
  const unionName                           = db?.union?.name

  const methods = [
    { name: 'Cash to union', alt: 'Cash from union', desc: 'Your union can send or receive nIN for you. Bring the amount to their office and let them scan your QR.',  note: 'In person, the union might charge a fee',type: 'union' },
    { name: 'UPI / Bank transfer',  alt: 'UPI / Bank transfer', desc: 'Top up by connecting to a UPI payment provider', note: 'Easy but with fees and an identity check',  type: 'union' },
    { name: 'Exchange nIN to USD tether', alt: 'Exchange USDt to nIN', desc: 'Swap USDt for nIN, instantly and for near-zero fees.', note: 'For advanced users', type: 'union' },

  ]

  console.log('type', type)

  const handleInputNAmount = (action) => {
    const isAdd = action === 0 || action === 'add';
    const isRemove = action === 1 || action === 'remove';
    const STEP = 100; // uniform step to avoid surprise jumps
    const step = (action === 'add' || action === 'remove') ? STEP * 10 : STEP;

    setAmount((prevAmount) => {
      let delta = step;
      setNBalance((prevBalance) => {
        if (isAdd) {
          delta = Math.min(step, prevBalance);
          return prevBalance - delta;
        }
        // remove
        delta = Math.min(step, prevAmount);
        return Math.min(n_initialBalance, prevBalance + delta);
      });
      return isAdd ? prevAmount + delta : Math.max(0, prevAmount - delta);
    });
  };

  const handleInputUAmount = (action) => {
    const isAdd = action === 0 || action === 'add';
    const isRemove = action === 1 || action === 'remove';
    const STEP = 100; // nIN step; convert via exchangeRate
    const step = (action === 'add' || action === 'remove') ? STEP * 10 : STEP;

    setAmount((prevAmount) => {
      let deltaNin = step;
      setUBalance((prevBalance) => {
        if (isAdd) {
          // buy nIN with USDt; limit by available USDt converted to nIN
          deltaNin = Math.min(STEP, prevBalance / exchangeRate);
          return prevBalance - deltaNin * exchangeRate;
        }
        // remove/sell: add back USDt based on nIN being removed
        deltaNin = Math.min(STEP, prevAmount);
        return Math.min(u_initialBalance, prevBalance + deltaNin * exchangeRate);
      });
      return isAdd ? prevAmount + deltaNin : Math.max(0, prevAmount - deltaNin);
    });
  };

  const handleSetNMax = () => {
    if (n_balance <= 0) return;
    setAmount(n_initialBalance);
    setNBalance(0);
  };

  const handleSetUMax = () => {
    if (u_balance <= 0) return;
    setAmount(u_initialBalance / exchangeRate );
    setUBalance(0);
  };

  const handleToggle = () => {
    setType((prev) => !prev);
  }

  const handleToggleSwipeSlider = () => {
    setType((prev) => !prev);
    setConfirm(false);
    setAmount(0);
    setNBalance(n_initialBalance);
    setUBalance(u_initialBalance);
    setTxType(!txtype);
  }

  const handleSwipeStart = (e) => {
    if (!e.touches?.length) return;
    setSwipeStartX(e.touches[0].clientX);
  };

  const handleSwipeEnd = (e) => {
    if (swipeStartX === null || !e.changedTouches?.length) return;
    const deltaX = e.changedTouches[0].clientX - swipeStartX;
    const threshold = 40;
    if (deltaX < -threshold && !type) {
      handleToggleSwipeSlider(); // swipe left to add (type true)
    } else if (deltaX > threshold && type) {
      handleToggleSwipeSlider(); // swipe right to take (type false)
    }
    setSwipeStartX(null);
  };

  const handleSend = async () => {
    const unionAddr = db['union']['address']
    console.log('send to union addr', unionAddr)
    // generate a code 
    if (confirm(`Are you sure you want send ${(amount).toLocaleString('en-IN')} nIN to ${unionName}`)) {
      await sendTokens(unionAddr,amount)
    }
    // set payment history to see if payment has been fulfilled
    setTokenview(false)
    handleOpenForm('receipts')
  };

  const handleUSend = async () => {
    if (txtype) {
      await redeemNin(amount)
    } else {
      // withdrawal always sends tokens to power address for UPI payment
      const amountInUSDt = amount * exchangeRate
      await mintNin(amountInUSDt)
    }
    // set payment history to see if payment has been fulfilled
    setTokenview(false)
    handleOpenForm('receipts')
  };

  return (
    <>
      { !method &&
      <>
        <p className="flex font-bold dark:text-white mb-6">Select a method</p>
        { methods.map((method, index) => (
          <div key={index} onClick={() => setMethod(index + 1)} className={`flex flex-col dark:text-white bg-gray-200 dark:bg-slate-800 w-[90%] rounded-3xl p-8 m-2`} >
            <p className='font-bold'>{method.name}</p>
            <p className='text-xs dark:text-slate-400'>{method.desc}</p>
            <i className='flex text-xs dark:text-slate-400 mt-2 justify-end'>{method.note}</i>
          </div>
          ))}
        <div className='h-4'/>
      </>
      }
      { method &&
      <>
      <p className="flex font-bold dark:text-white justify-center mb-3">{type ? methods[method - 1].name : methods[method - 1].alt}</p>
      <span className="flex justify-center w-full my-6">
        <SlideToggle isOn={type} handleToggle={handleToggle} onTitle={'Add'} offTitle={'Take'} />
      </span>
      <div className={'w-full'} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
         {method == 1 && <CashToUnion methods={methods} method={method} db={db} unionName={unionName} ShowReceipt={ShowReceipt} tag={tag} handleOpenForm={handleOpenForm} handleInputNAmount={handleInputNAmount} setConfirm={setConfirm} handleSend={handleSend} handleSetNMax={handleSetNMax} type={type} _confirm={_confirm} amount={amount} n_balance={n_balance}  n_initialBalance={n_initialBalance} txtype={txtype} />}
        { method == 2 && <BankTransfer methods={methods} method={method} />}
        { method == 3 && <ExchangeCrypto methods={methods} method={method} db={db} unionName={unionName} handleInputNAmount={handleInputNAmount} handleInputUAmount={handleInputUAmount} setConfirm={setConfirm} handleUSend={handleUSend} handleSetNMax={handleSetNMax} handleSetUMax={handleSetUMax} type={type} _confirm={_confirm} amount={amount} n_balance={n_balance} u_balance={u_balance}  n_initialBalance={n_initialBalance} u_initialBalance={u_initialBalance} txtype={txtype} />}
      </div>
      { !_confirm && <p className='self-center mx-3 my-6 text-xs dark:text-white' onClick={() => setMethod(false)}>change method</p>}
        </>
      }
      { tag && <ShowReceipt tag={tag} handleOpenForm={handleOpenForm}/> }
      { _confirm && method === 1 && db['union'] && db['union']['transfer'] &&
          <div className="flex flex-col items-center mx-12 mb-6 h-full justify-center">
            <br/><p className="text-xs dark:text-slate-400">Nila disclaims all liability for any disputes, delays, or losses arising from cash transfers between the Union and its members, which are solely the responsibility of the parties involved.</p>
          </div>
      }
    </>
    );
  };

export default Withdraw
