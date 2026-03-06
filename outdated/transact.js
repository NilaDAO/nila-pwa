import React, { useState, useEffect } from "react";
import { Buffer } from 'buffer';
import { ClaimButton } from '../src/components/UI/buttons';
import { mintNFT, collectGrant,invest,debt,repay,loadUnionState,claimInterest,send } from '../src/utils/token_apis';
import { decryptPrivateKey, handleGetEncryptedPrivateKey } from '../src/features/registration/getEncryptedKey';
import { useDataContext, useNavContext, useViewModeContext } from '../src/utils/NavigationContext';
import useTouch from '../src/hooks/useTouch';

import Forms from '../src/components/Forms/forms';


const Transactions = ({LAND, handleOpenForm}) => {
    const [message, setMessage] = useState();
    const [pending, setPending] = useState(0);
    const [accept, setAccept] = useState(true);
    const { db, tokens,setTxIndex,txIndex,txdetails,setDemands, setSelected,setTokens} = useDataContext() 
    const { tokenview,setTokenview, setCardView} = useViewModeContext() 
    const { setIx } = useNavContext() 
    const { handleTouchStart, handleTouchEnd} = useTouch()

    useEffect(() => {
      setCardView('transactionview')

      if (txIndex === 'signing'){
        setPending((prevState) => prevState + 1)
        setMessage(`Creating land title for ${db['farmname']}. Please wait.`) 
        const response = handleSignMint()
        if(!response){
          setPending((prevState) => prevState - 1)
        } else {
          console.log('sign and mint called')
        }
      }
      }, []);


    const handleSignMint = async () => {
      /**
       * decrypt PK after request with session token or refreshed session token
      */
      const salt = db['salt'];
      const encryptedPrivateKey = await handleGetEncryptedPrivateKey(db)
      const pk = await decryptPrivateKey(encryptedPrivateKey,salt)

      /**
       * sign and mint land title.
      */
      const chain = db['chain'];
      const toAddress = db['address'];
      const metadata = txdetails['outline']
      const metadata_json = JSON.stringify(metadata)

      const metadataBase64 = Buffer.from(metadata_json, 'utf-8').toString('base64');
      const metadata_uri = `data:application/json;base64,${metadataBase64}`

      //set signature and name to be added to token
      const signature_hex = txdetails['sign']
      const farmname = db['farmname'] ? db['farmname'] : txdetails['name']

      const result = await mintNFT(pk,toAddress,chain,signature_hex,metadata_uri,farmname);
      if (result.response == undefined){
        console.log('lets wait a bit longer', result.response)
        setMessage('Waiting for confirmation...') 
      }
      else if (result.response == 'success'){
        setPending((prevState) => prevState - 1)
        console.log('farmname', db['farmname'] ,txdetails['name'])
        setMessage('Congratulations! Your land title has been created!') 
        setCardView('default')
        loadETHTokens(db['chain'],db['address'])
        .then((tokendata) => {
          setCardView('default')
          setTokens(tokendata)
          setTokenview(!tokenview)
          setIx(null)
          LAND.current = {'metadata' : tokendata[0].metadata, 'value': tokendata[0].price}
        })
      } else if (result.response == 'INSUFFICIENT_FUNDS') {
        setMessage('Transaction cost are high. Please try again later. To mint, You do NOT have to be at your fields. If the issue persists, contact your union leader.') 
      } else if (result.response == 'CALL_EXCEPTION') {
        setMessage(JSON.stringify(result)) 
      }  
      else {
        setMessage(result.response) 
      }
    }

    const PendingLogo = () => (
      <div className={`${pending <= 1 ? 'animate-bounce' : ''} relative py-4 flex items-center justify-center w-28 h-28`}>
        { pending > 0 ? 
        <>
          <div className="absolute inset-0 border-8 border-transparent border-t-black rounded-full animate-spin"></div>
          <div className="absolute inset-0 border-8 border-transparent border-r-black rounded-full animate-spin delay-150"></div>
          <div className="absolute inset-0 border-8 border-transparent border-l-black rounded-full animate-spin delay-450"></div> 
        </>
        :
        <h1 className='text-center text-9xl m-3 z-10 mb-9 font-Chains'>a</h1> }
      </div>
    )

    const handleBackWhenOffline = () => {
      setTokenview(!tokenview)
      setIx(null)
    }

    return (
      <div 
          style={{ zIndex: 1 }} className="flex flex-col justify-center w-full from-white to-slate-100"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
      >
          <div className="flex flex-col h-full z-0 items-center mt-6">
            { (txIndex >= 0 && txIndex < 2 || txIndex === 'signing') && <PendingLogo onClick={() => setIx(null)} /> }
            { (txIndex === 1 && navigator.onLine) ? // land title
            <>
            <ClaimButton disabled={accept} handleClick={() => setTxIndex('signing')} title={'Sign and receive'}/> 
            <TermsConditions TC={TC} />
            <div className="flex p-8">
              <input onClick={() => setAccept(!accept)} type="checkbox" className="w-6 h-6 accent-black border-gray-300 rounded" />
              <div className="flex font-bold px-3">Accept</div>
            </div>
            </>
            : (txIndex === 'signing' && navigator.onLine) ? // ? 
            <div>
              <div className="flex font-bold p-4 flex-wrap">{message}</div>
            </div>
            : (txIndex <= 1 && !navigator.onLine) ? // schedule transaction because offline
              <div className="flex flex-col w-full justify-center">
                <div className="mx-12">
                  <p className="py-4">You are offline.</p>
                  <p> Scheduling Transaction (not implemented)</p>
                  <ClaimButton disabled={false} handleClick={handleBackWhenOffline} title={'Back'}/> 
                </div>
              </div>
            :
            <Forms LAND={LAND} />
            }
          </div>
      </div>
    )
}

export default Transactions