import { useState, useEffect } from "react";
import { useDataContext, useViewModeContext } from "../../utils/NavigationContext";
import QRScanner from "../../components/UI/qrScan.js";
import SendDigital from "../../components/Forms/sendDigital.js";
import { useSendTokens } from "../../hooks/useWallet.ts";
import { useContactBook } from "../../hooks/useContactBook";
import { ClaimButton, SlideToggle, IndividualExchangeButton } from "../../components/UI/buttons";
import ContactPicker from "../../components/UI/ContactPicker";

const NILA_PRICE = process.env.REACT_APP_NILA_PRICE

export const AssetsSend = ({ type }) => {
    const { db,tokenData }        = useDataContext()
    const initialBalance          = tokenData.find((t) => t.sym === 'nIN').bal;
    const [ balance, setBalance ] = useState(initialBalance);
    const { setCardView } = useViewModeContext()
    const [ _type, setType ] = useState(!type)
    const [ amount, setAmount ] = useState(0)
    const [ sendTo, setSendTo ] = useState()
    const { sendTokens } = useSendTokens();
    const { contactList, addContact } = useContactBook();

    useEffect(() => {
      setCardView('tokenview')
      }, []);


    const handleScanResults = (address) => {
      if (!address) return;
      setSendTo({ address, name: 'scanned', chain: db['chain'] })
    }

     const handleAmountToSend = (e) => {
        console.log('e', e)
        // first condition max elements
        if (e === 'add'){
            setAmount(amount + 1000)
            setBalance(prev => prev - 1000);
        } else if (e === 'remove'){
            setAmount(amount - 1000)
            setBalance(prev => prev + 1000);
        } else if (balance >= 1 && !e){ 
            setAmount(amount + 100)
            setBalance(prev => prev - 100);
        } else if (balance < 1 && !e) {
            setAmount(amount + balance)
            setBalance(prev => prev - balance);
        } // remove
        else if (amount >= 1 && e){
            setAmount(amount - 100)
            setBalance(prev => prev + 100);
        } else {
            setAmount(0)
            setBalance(initialBalance);
        }
    }

    const handleSelectContactBook = (address) => {
        setSendTo(address)
    }

    return (
        <div className="flex flex-col">
            {/* If sell, show QR scanner and stored addresses dropdown, if buy render QR */}
            { _type && !sendTo? 
                <SendDigital db={db} />
            : !sendTo ?
            <>
                <QRScanner sendTo={handleScanResults}/>
                <ContactPicker contactList={contactList} onSelect={handleSelectContactBook} selected={sendTo} addContact={addContact} />
                <div className="mx-12">
                    <p className="py-4">Select a address from your contact book or scan the receive QR of another Nila user. </p>
                </div>
            </>
            : 
            <div className='rounded-b-3xl bg-gray-200 dark:bg-gray-800 px-6 justify-between'>
                <p className="font-bold text-sm">Balance: {Number(balance * NILA_PRICE).toFixed(1)} nIN</p>
                <div className="flex flex-row justify-between">
                    <p className='flex font-bold text-3xl items-center'>{(amount * NILA_PRICE).toLocaleString('en-IN')} nIN</p>
                    <IndividualExchangeButton disabled_add={balance <= 0 ? true : false} disabled_remove={balance >= initialBalance ? true : false} handleTx={(e) => handleAmountToSend(e)} title={'what is here?'} texts={{ 'plus': 'add','minus': 'remove'}}/>
                </div>    
                {/*<EnterAmount handleSetFunds={handleSetFunds} sendTo={sendTo} setSendTo={setSendTo} />*/}
            </div>
            }
            <div className="flex m-6 justify-center">
            { sendTo ?
                <ClaimButton disabled={amount > 0 ? false : true} handleClick={() => sendTokens(sendTo.address,amount)} title={'Send'}/>   
                :
                <SlideToggle isOn={!_type} handleToggle={() => setType(!_type)} onTitle={'Receive'} offTitle={'Send'} />
            }
            </div>
        </div>
    )
}
