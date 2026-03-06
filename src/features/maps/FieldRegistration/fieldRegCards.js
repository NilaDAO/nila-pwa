import React, { memo, useState } from 'react'
import { useFieldRegContext } from '../../../utils/FieldRegContext'
import { useDataContext } from '../../../utils/NavigationContext';
import FarmNameForm from '../../../components/Forms/farmName';
import { useFieldRegController } from './FieldRegController';
import useVerifyFlow from '../../../hooks/useVerifyFlow';
import { ClaimButton, EnableNotifications } from '../../../components/UI/buttons';
import { TrashIcon } from '@heroicons/react/24/outline';
import { ViewfinderCircleIcon } from '@heroicons/react/24/solid';
import { useHandleOffsiteTrackingCookie } from './fieldRegRemoteCookie';

const messages = [
    'Walk as close to the center of the field.',
    'Walk as close to the center of the field, tab to request borders.',
    'Finding your GPS location...',
    'Just a bit more time, finding your exact spot...',
    /*4*/ 'All set, we found you! Lets draw borders...',
    'The line is busy but your request is scheduled to start soon.',
    'Ok, first draft is in. Is the field bordered correctly?',
    'No problem, lets wait for the final results.',
    'Ok here is the result. Does it match the field border?',
    'We already mapped this field. Request again or move on?',
    /*10*/ 'Ok, please change to a position in the middle of your field and try again.',
    'Done. Lets move to the next field and tab to request borders.',
    'Uff. Something went wrong. Please try again.',
    'Done. Walk to your next field or generate your land title.',
    'Verifying data to confirm land access. One moment.',
    'Signed! Please check the outline, add a name and accept the conditions. Then generate your title.',
    'Please wait one second.',
    'More proof required to establish use rights or ownership.', //17
    'Great thank you. We will let you know when we detected the marker.',//18
    'We havent detected your sheet yet. Make sure its visible and inside the marked property.',//19
    'Drag the arrow to the center of the field, tab to request borders.',//20
    'Hold tight—this area hasn’t been mapped yet. Please hold on while we process the area.',//21
    'No marker detected. Turn on notifications so we let you know once it has been detected.',//22
    'Agreed. We will notify you when we detected the marker.',//23
    'Great, the marker has been detected. Give your property a name and generate your land title.',//24
    'Great thank you. Enable notifications so we can let you know when we detected the marker.',//25
    'Ok in that case, please check back in regularly.',//26
    'Stopped. Tap to request borders again.',//27
    'Double check your property, then generate your land title for free.',//28
]

export const InputList = () => {
  const { fieldReg , updateFieldReg } = useFieldRegContext()
  const {flow, approvedFields } = fieldReg

  const handleInputChange = (index, event) => {
    const newInputs = [...approvedFields];
    newInputs[index].name = event.target.value;
    updateFieldReg({ approvedFields: newInputs });
  };

  const handleRemoveInput = (index) => {
    if (confirm('Are you sure you want to remove this field?')) {
      const newInputs = approvedFields.filter((_, i) => i !== index);
      updateFieldReg({ approvedFields: newInputs });
    }
  };

  return (
    <>
    <h3 className={`font-bold p-8`}>Fields:</h3>
    { flow < 10 ? <span className="text-sm text-gray-400 px-8">Name each field for your own reference</span> : <></>}
    <div className="p-4">
      { approvedFields.map((field, index) => (
        <div key={index}>
          <div key={index} className="flex flex-row text-black items-center px-1">
            <input
              type="text"
              id={`fieldname_${index}`}
              placeholder='add name'
              value={field.name}
              onChange={(e) => handleInputChange(index, e)}
              className="h-9 text-sm px-3 m-3 font-bold w-full text-gray-900 bg-slate-100 dark:text-white dark:bg-slate-700 border border-slate-400 rounded-lg" 
            />
            <ViewfinderCircleIcon onClick={() => updateFieldReg({ polygons: field.shape, panMode: index + 1 })} className="h-8 w-8 dark:text-white px-1" />
            <TrashIcon onClick={() => handleRemoveInput(index)} className="h-8 w-8 dark:text-white px-1" />
          </div>
        </div>
    ))}
    </div>
    </>
  );
};

export const ObjectVerification = () => {
  const { fieldReg } = useFieldRegContext()
  const { flow, remote } = fieldReg

  return (
    <div className="flex flex-col p-8">
      { flow === 11 &&
      <>
      <p className="font-regular py-2">{remote ? 'Remote bordering requires additional proof of use/ownership.':'The walked path did not show enough evidence of on-site access.'}</p>
      <p className="font-regular py-2">To complete your land verification, please place some ag-plastic (sheet of minimum 4x3 meter) in the middle of one of your fields. Fix it so it doesnt blow away.</p>
      <p className="font-regular py-2">Our system uses satellites to detect the marker remotely, within a maximum of 11 days. Once we confirm its presence, you can generate your land title.</p>
      <p className="font-regular py-2">Make sure the sheet is clearly visible from above — no trees or shadows blocking it.</p>
      </>
      }
    </div>
  )
};

const FieldReg_cards = ({ LAND }) => {
    const { regFlow }                                                             = useFieldRegController();
    const { handleTryAgain, handleCorrect, handleDeleteApprovedFields, handleStopPolling, geoPerm }   = regFlow;
    const { db }                                                                   = useDataContext();  
    const { handleVerify, handleGenerateLandTitle, handleObjectPlaced, handleBackToBordering } = useVerifyFlow(LAND)
    const { fieldReg, updateFieldReg }                                             = useFieldRegContext()
    const [ notificationPermission, setNotificationPermission ]                    = useState(Notification.permission);
    const handleAddCookie                                                          = useHandleOffsiteTrackingCookie();
    const { approvedFields, flow, positions, panMode, marker, property, tcAccept, alts } = fieldReg

    console.log('message set', fieldReg.messages)

    const handleNotificationPermission = (status) => {
      setNotificationPermission(status);
      updateFieldReg({ messages: 26 })
    }

    const handleSwitchToRemote = () => {
      if (confirm('Switch to remote bordering? Just a heads-up—you’ll need to verify you own the fields using a plastic sheet, which takes more effort.')) {
        handleAddCookie()
      }
    }

    const getClaimButtonProps = () => {
      const canSubmitPostVerify = Boolean(
        property.name &&
        tcAccept &&
        (flow === 10 || (flow > 11 && marker))
      );

      const disabled = !(
        (approvedFields.length > 0 && flow < 10) || // verify button when registering fields
        (canSubmitPostVerify && flow >= 10) ||
        (flow === 11) // confirm sheets have been placed
      );
    
      const handleClick = flow < 10
        ? handleVerify
        : flow === 11
          ? handleObjectPlaced
          : handleGenerateLandTitle;

      const title = flow <= 9
        ? "Verify your property"
        : flow === 11
          ? "Confirm"
          : "Generate land title";
    
      return { disabled, handleClick, title };
    };
    
    return (
        <div className={`pointer-events-auto flex flex-col bg-white dark:bg-gray-700 dark:text-white rounded-3xl w-full mb-[220px] py-4 my-6 rounded-bx-3xl shadow-bottom`}> 
            { flow === 0 ?
            <div className="flex flex-row justify-evenly p-8">
                <h3 className={`font-bold p-4`}>{approvedFields.length > 0 ? `You have ${approvedFields.length} fields registered.` : 'Walk to your first field...'}</h3>
                <img src="/images/ampelmann.png" className="h-8 w-8 mt-3" alt="Ampelmann" />
            </div>
            : flow === 1 ? 
            <div className="flex flex-row justify-evenly">
                { geoPerm ?
                <div className="flex flex-col justify-evenly p-8">
                    <h3 className={`font-bold pt-8`}>Weak GPS Signal, try rotating your phone...</h3>
                    { navigator.onLine ? 
                    <div>
                        <p className='text-xs'>Accuracy: {positions.at(-1) ? Math.ceil(positions.at(-1).acc) : 300} meter</p>
                    </div>
                    :
                    <p className='text-xs'>You are not online</p>
                    }
                </div>
                :
                <h3 className={`font-bold p-8`}>Please allow location access...</h3>
                }
            </div>
            : flow >= 2 &&
            <div className="flex flex-col my-4">
                { panMode && <h3 className={`font-bold px-8`}>{approvedFields[panMode - 1].name}</h3>}
                { !panMode && <h3 className={`font-bold p-8`}>{messages[fieldReg.messages]}</h3>}
                { /* validate fields */}
                {  flow < 10 && !panMode && (flow === 5 || alts.length > 0) &&
                    <>
                    <div className="flex flex-row justify-evenly pb-4">
                        <ClaimButton disabled={false} handleClick={handleTryAgain} title='Try again'/> 
                        <ClaimButton disabled={false} handleClick={handleCorrect} title='Looks good'/> 
                    </div>
                    </>
                }    
                { flow === 4 && !panMode &&
                    <div className="flex flex-row justify-evenly pb-4">
                        <ClaimButton disabled={false} handleClick={handleStopPolling} title='Stop' />
                    </div>
                }
            </div>
            }
            { approvedFields.length != 0 && flow >= 2 ? 
                <>
                {flow === 11 ? <ObjectVerification /> : (flow <= 9 && !panMode) ? <InputList /> : (flow > 9 && !panMode) && <FarmNameForm /> }
                <div className="flex flex-row justify-evenly pb-4">
                    { panMode && <ClaimButton disabled={false} handleClick={()=> updateFieldReg({ panMode: null, polygons: [] })} title={'back'}/> }
                    { (flow === 10 || flow === 11) && <ClaimButton disabled={approvedFields.length > 0 ? false: true} handleClick={() => handleBackToBordering()} title={'Edit'}/> }
                    { (flow === 12 && notificationPermission === 'default') ? <EnableNotifications onAdd={(status) => handleNotificationPermission(status)} address={db.address}/>
                      :
                      !panMode && <ClaimButton {...getClaimButtonProps() }/> 
                    }
                </div>                
                { flow === 11 && <div className={"flex text-xs flex-row justify-evenly pb-8"} onClick={handleDeleteApprovedFields} >Remove all fields. Let's try on-site again.</div> }
                </> 
                : <></> 
            }
            { !fieldReg.remote && flow < 10 && flow > 0 && <div onClick={handleSwitchToRemote} className='px-8 text-xs'>switch to remote bordering</div>}
        </div>
    )
  }

export default memo(FieldReg_cards) 
