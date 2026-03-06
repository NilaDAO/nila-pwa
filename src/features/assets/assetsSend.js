import { useState, useEffect } from "react";
import { useDataContext, useViewModeContext } from "../../utils/NavigationContext";
import QRScanner from "../../components/UI/qrScan.js";
import SendDigital from "../../components/Forms/sendDigital.js";
import { useSendTokens } from "../../hooks/useWallet.ts";
import { ClaimButton, SlideToggle, IndividualExchangeButton } from "../../components/UI/buttons";

const NILA_PRICE = process.env.REACT_APP_NILA_PRICE

const ContactBook = ({data, onSelect, selected}) => {
    // on each scan, we add a new contact to the list.

    // NOT YET IMPLENTED
    return (
    <div className="m-12">
        <div className="px-2 py-6">Your contacts:</div>
        <div className="h-[100px] overflow-y-auto ">
            {data.map((item, index) => (
            <div 
                key={index}
                onClick={() => onSelect(index)}
                className={`px-2 py-4 border-b last:border-none cursor-pointer transition-colors ${
                    selected && selected.address === item.address
                      ? "bg-gray-400"
                      : index % 2 === 0
                      ? "bg-gray-100"
                      : ""
                  }`}>
                <span className="font-semibold">{item.name}</span> - {item.address.substring(0,7) + '...'}
            </div>
            ))}
        </div>
    </div>
    )
}

export const AssetsSend = ({ type }) => {
    const { db,tokenData }        = useDataContext()
    const initialBalance          = tokenData.find((t) => t.sym === 'nIN').bal;
    const [ balance, setBalance ] = useState(initialBalance);
    const { setCardView } = useViewModeContext()
    const [ _type, setType ] = useState(!type)
    const [ amount, setAmount ] = useState(0)
    const [ sendTo, setSendTo ] = useState()
    const { sendTokens } = useSendTokens();

    useEffect(() => {
      setCardView('tokenview')
      }, []);

    const contactdata = db['union'] ? [
        { 'name' : db?.union.rep, 'address':  db?.union.address, 'chain': db['chain']},
        { 'name' : 'Anand', 'address': '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7', 'chain': db['chain']},
    ] : [] //{ 'name' : '', 'address': '', 'chain': 0}

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

    const handleSelectContactBook = (index) => {
        setSendTo(contactdata[index]?.address)
    }

    return (
        <div className="flex flex-col">
            {/* If sell, show QR scanner and stored addresses dropdown, if buy render QR */}
            { _type && !sendTo? 
                <SendDigital db={db} />
            : !sendTo ?
            <>
                <QRScanner sendTo={handleScanResults}/>
                <ContactBook data={contactdata} onSelect={handleSelectContactBook} selected={sendTo} />
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
