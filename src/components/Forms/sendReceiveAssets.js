import { useState, useMemo, useEffect } from 'react';
import { useDataContext, useViewModeContext } from '../../utils/NavigationContext.js';
import { useSendTokens } from "../../hooks/useWallet.ts";
import { ClaimButton, SlideToggle, IndividualExchangeButton } from '../UI/buttons.js';
import QR from "../UI/qrCode";
import QRScanner from "../UI/qrScan.js";

const FEE = 0.998; // 0.2% fee

export const ContactBook = ({data, onSelect, selected}) => {
    // on each scan, we add a new contact to the list.
    // NOT YET IMPLENTED

    return (
    <div className="flex flex-col my-6 items-center">
        <div className="px-2 py-6 dark:text-white">Select a contact:</div>
        <div className="overflow-y-auto ">
            {data.map((item, index) => (
            <div 
                key={index}
                onClick={() => onSelect(index)}
                className={`py-4 px-2 border-b dark:border-slate-400 last:border-none cursor-pointer transition-colors ${
                    selected && selected.address === item.address
                      ? "bg-gray-400 dark:bg-slate-800"
                      : index % 2 === 0
                      ? "bg-gray-200 dark:bg-slate-800"
                      : ""
                  }`}>
                <span className="font-semibold dark:text-white">{item.name}</span> 
                <span className="font-semibold dark:text-white">- {item.address.substring(0,7) + '...'}</span>
            </div>
            ))}
        </div>
    </div>
    )
}

const QrCode = ({ amount,setConfirm,db}) => (
    <div className="flex flex-col w-[98vw] p-6 justify-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full ">
      <div className='flex flex-col w-[70%] self-center'>
        <QR digitalAddress={db['address']} />
        <p className='self-center m-3 dark:text-white text-xs' onClick={() => setConfirm(false)}>change amount</p>
      </div>
    </div>
)

const SendOrAddAmount = ({
  sendTo,
  amount,
  balance,
  initialBalance,
  symbol,
  onInput,
  onMax,
  setConfirm,
  setSendTo,
  handleSend,
}) => (
  <div className="flex flex-col w-auto max-w-[98vw] p-3 items-center bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-center p-4">
    {sendTo?.amount <= initialBalance ? (
      <>
        <p className="font-bold text-2xl dark:text-white mt-6">
          {(sendTo.amount * FEE).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {symbol}
        </p>
        <p className="font-bold text-xs dark:text-slate-400">to</p>
        <p className="flex font-bold justify-center text-2xl dark:text-white mb-6">
          {sendTo.name ?? `${sendTo.address?.slice(0, 10)}..`}
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-400 mx-4">
          {(sendTo.amount * ((1 / FEE) - 1))?.toFixed(2)}/- handling fee.
        </p>
        <ClaimButton disabled={sendTo.amount <= 0} handleClick={handleSend} title="Send" />
        <p className="w-6 h-6 mt-1 dark:text-white" onClick={() => setConfirm(false)}>
          edit
        </p>
      </>
    ) : (
      <>
        <p
          className="font-bold text-center text-sm dark:text-white mt-12 cursor-pointer"
          onClick={onMax}
          title="Use full balance"
        >
          Balance: {Number(balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })} {symbol}
        </p>
        <div className="flex flex-row justify-between m-6">
          <p className="flex font-bold text-3xl whitespace-nowrap items-center dark:text-white px-4">
            {amount.toLocaleString('en-IN')} {symbol}
          </p>
          <div className="flex">
            <IndividualExchangeButton
              disabled_add={balance <= 0}
              disabled_remove={balance >= initialBalance}
              handleTx={onInput}
              title={''}
              texts={{ plus: 'add', minus: 'remove' }}
            />
            <p
              className={`flex text-sm items-end dark:text-white ${(balance <= 0 || amount === initialBalance) && 'opacity-40'}`}
              onClick={onMax}
            >
              max
            </p>
          </div>
        </div>
        <ClaimButton
          disabled={amount <= 0}
          handleClick={() => setSendTo((prev) => ({ ...prev, amount }))}
          title="Set"
        />
      </>
    )}
  </div>
);

// amount adjuster reused from withdrawal logic
const useAmountAdjuster = (initial, step = 100) => {
  const [amount, setAmount] = useState(0);
  const [balance, setBalance] = useState(initial);

  useEffect(() => {
    setAmount(0);
    setBalance(initial);
  }, [initial]);

  const handleInput = (action) => {
    const isAdd = action === 0 || action === 'add';
    const STEP = step;
    const stepSize = (action === 'add' || action === 'remove') ? STEP * 10 : STEP;

    setAmount((prevAmount) => {
      let delta = stepSize;
      setBalance((prevBalance) => {
        if (isAdd) {
          delta = Math.min(stepSize, prevBalance);
          return prevBalance - delta;
        }
        // remove
        delta = Math.min(stepSize, prevAmount);
        return Math.min(initial, prevBalance + delta);
      });
      return isAdd ? prevAmount + delta : Math.max(0, prevAmount - delta);
    });
  };

  const handleMax = () => {
    if (balance <= 0) return;
    setAmount(initial);
    setBalance(0);
  };

  const reset = () => {
    setAmount(0);
    setBalance(initial);
  };

  return { amount, balance, handleInput, handleMax, reset };
};

const SendReceiveAssets = ({handleOpenForm }) => {
  const { db, tokenData, selectedAsset }          = useDataContext()
  const { setTokenview }                          = useViewModeContext();
  const { sendTokens }                            = useSendTokens();
  const [ send_contact_acc, setSendContactAcc ]   = useState('scan')
  const [ sendTo, setSendTo ]                     = useState()
  const [ type, setType ]                         = useState(true)
  const [ _confirm, setConfirm ]                  = useState(false)

  const activeAsset                               = useMemo(() => {
    if (selectedAsset) return selectedAsset;
    if (Array.isArray(tokenData) && tokenData.length) {
      return tokenData.find((t) => t.sym === 'nIN') || tokenData[0];
    }
    return { sym: 'nIN', bal: 0 };
  }, [selectedAsset, tokenData]);

  const symbol                                             = (activeAsset?.sym || 'nIN');
  const initialBalance                                     = Number(activeAsset?.bal ?? 0);
  const stepSize                                           = symbol.includes('USD') ? 1 : 100;
  const { amount, balance, handleInput, handleMax, reset } = useAmountAdjuster(initialBalance, stepSize);
  
  const contactdata = db['union'] ? [
      { 'name' : db?.union.rep, 'address':  db?.union.address, 'chain': db['chain']},
      { 'name' : 'Anand', 'address': '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7', 'chain': db['chain']},
      { 'name' : 'Carst', 'address': '0xaf7030023CF86611FfC5a71798a0f7022210F2b3', 'chain': db['chain']},
  ] : [] //{ 'name' : '', 'address': '', 'chain': 0}

  const handleSend = async () => {
    // generate a code 
    const receiver = sendTo.hasOwnProperty('name') ? sendTo.name : sendTo.address
    if (confirm(`Are you sure you want send ${sendTo.amount.toLocaleString('en-IN')} ${symbol} to ${receiver}`)) {
      // withdrawal always sends tokens to power address for UPI payment
      console.log('sending to', sendTo, symbol)
      await sendTokens(sendTo.address,sendTo.amount,symbol)
      // set payment history to see if payment has been fulfilled
      setTokenview(false)
      handleOpenForm('receipts')
    }
  };

  const handleScanResults = (address) => {
    if (!address) return;
    setSendTo({ address, name: 'scanned' })
    setConfirm(true)
  }

  const handleSelectContactBook = (index) => {
    setSendTo({ address: contactdata[index]?.address, name: contactdata[index]?.name })
    setConfirm(true)
  }

  const handleToggleSlider = () => {
    setType((prev) => !prev);
    setConfirm(false);
    reset();
  }

  const [swipeStartX, setSwipeStartX] = useState(null);

  const handleSwipeStart = (e) => {
    if (!e.touches?.length) return;
    setSwipeStartX(e.touches[0].clientX);
  };
  const handleSwipeEnd = (e) => {
    if (swipeStartX === null || !e.changedTouches?.length) return;
    const deltaX = e.changedTouches[0].clientX - swipeStartX;
    const threshold = 40;
    if (deltaX < -threshold && !type) {
      handleToggleSlider(); // swipe left to receive
    } else if (deltaX > threshold && type) {
      handleToggleSlider(); // swipe right to send
    }
    setSwipeStartX(null);
  };

  return (
    <>
      {/* TOGGLE SEND|RECEIVE */}
      <p className="flex font-bold dark:text-white mb-6">{type ? `How much ${symbol} to send`: `How much ${symbol} to receive`}</p>
      { type ?
        <p className="flex mb-6 dark:text-slate-400">Scan a QR or select from contacts.</p>
        :
        <p className="flex mb-6 dark:text-slate-400">Set a amount and scan QR.</p>
      }
      <SlideToggle isOn={type} handleToggle={handleToggleSlider} onTitle={'Receive'} offTitle={'Send'} />
      {/* SEND */}
      <div className="flex flex-col items-center my-6 h-full justify-center" onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      { type ? 
        <>
        { _confirm 
          ? 
          <>
          <SendOrAddAmount
            sendTo={sendTo}
            amount={amount}
            balance={balance}
            initialBalance={initialBalance}
            symbol={symbol}
            onInput={handleInput}
            onMax={handleMax}
            setConfirm={setConfirm}
            setSendTo={setSendTo}
            handleSend={handleSend}
          /> 
         { sendTo.amount > initialBalance && <p className='flex font-bold self-center px-12 pt-12'>⚠️ {sendTo.address.substring(0,5)} requested {sendTo.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/- nIN. You dont have that liquidity. Enter a different amount.</p> } 
          </>
          :
          <>
          <div className="flex flex-col w-auto max-w-[98vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4">
              {send_contact_acc === 'scan' ? 
              <QRScanner sendTo={handleScanResults}/>
              :
              <ContactBook data={contactdata} onSelect={handleSelectContactBook} selected={sendTo} />
              }
            </div>
            <ClaimButton disabled={false} color={'white'} handleClick={() => setSendContactAcc(send_contact_acc === 'scan' ? 'book' : 'scan')} title={send_contact_acc === 'scan' ? 'select from contact book' : 'scan a qr'} />
          </>
        }
        </>
        :
        <>
        {/* RECEIVE */}
        { _confirm ? 
          <QrCode amount={amount} setConfirm={() => setConfirm(false)} handleSend={handleSend} db={db} />
        :
        <div className="flex flex-col w-auto max-w-[98vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4 mt-6">
          <p className="font-bold text-center dark:text-white text-sm mt-12">Set amount to receive</p>
          <div className="flex flex-row justify-evenly my-6">
              <p className='flex font-bold text-3xl whitespace-nowrap dark:text-white items-center px-4'>{amount.toLocaleString('en-IN')} {symbol}</p>
              <div className='flex'>
                <IndividualExchangeButton disabled_add={false} disabled_remove={false} handleTx={handleInput} title={''} texts={{ 'plus': 'add','minus': 'remove'}}/>
              </div>
          </div>
          <ClaimButton disabled={amount <= 0} handleClick={() => setConfirm(true)} title={'Set'}/>
        </div>
        }
        </>
      }
      </div>
      
      { _confirm && db['union'] && db['union']['transfer'] &&
          <div className="flex flex-col items-center mx-12 mb-6 h-full justify-center">
            <br/><p className="text-xs dark:text-slate-400">Nila disclaims all liability for any disputes, delays, or losses arising from digital transfers, always verify if the address you are sending to/from is correct.</p>
          </div>
      }
    </>
    );
  };

export default SendReceiveAssets
