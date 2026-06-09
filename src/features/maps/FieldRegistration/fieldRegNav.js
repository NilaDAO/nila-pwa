import React from 'react'
import { ArrowDownCircleIcon, ArrowUpCircleIcon, NoSymbolIcon, MapPinIcon, ArrowPathIcon } from '@heroicons/react/20/solid'
import { TimerCircle } from '../../../components/UI/counter';
import { useFieldRegController } from './FieldRegController';
import { useFieldRegContext } from '../../../utils/FieldRegContext'
import { useHandleOffsiteTrackingCookie } from './fieldRegRemoteCookie';
import Maps from './fieldRegMaps';

const InitiateRegistration = ({ handleDeleteApprovedFields }) => {
  const { fieldReg, updateFieldReg } = useFieldRegContext()

  return (
  <div className="pointer-events-auto relative flex flex-col items-center justify-center w-48 h-48" >
              <div onClick={() => updateFieldReg({ track: true, flow: 1 })} className="relative flex items-center justify-center w-32 h-32 aspect-square">
              { fieldReg.track &&
                <>
                <div className="absolute inset-3 border-2 border-transparent border-t-black dark:border-t-white rounded-full animate-spin"></div>
                <div className="absolute inset-3 border-2 border-transparent border-r-black dark:border-r-white rounded-full animate-spin delay-150"></div>
                <div className="absolute inset-3 border-2 border-transparent border-l-black dark:border-l-white rounded-full animate-spin delay-450"></div>
                </>
              }
              <ArrowUpCircleIcon className='dark:text-white h-24 w-24'/>
              </div>
              <p onClick={() => updateFieldReg({ track: true, flow: 1 })} className='dark:text-white font-bold p-2'>tab to {fieldReg.approvedFields.length > 0 ? 'continue' : 'start'}</p>
              {fieldReg.approvedFields.length > 0 && <p className='dark:text-white p-1 text-xs' onClick={handleDeleteApprovedFields}>restart with a new property</p>}
  </div> 
  )
}

const APIOffline = () => (
  <>
    <div className="pointer-events-auto relative flex flex-col items-center justify-center w-32 h-32 aspect-square z-30">
      <div className="absolute inset-3 border-2 border-transparent border-t-black dark:border-t-white rounded-full animate-spin"></div>
      <div className="absolute inset-3 border-2 border-transparent border-r-black dark:border-r-white rounded-full animate-spin delay-150"></div>
      <div className="absolute inset-3 border-2 border-transparent border-l-black dark:border-l-white rounded-full animate-spin delay-450"></div>
      <NoSymbolIcon className='h-24 w-24 dark:text-white'/>
    </div>
    <p className='font-bold dark:text-white text-xs p-2'>API offline. please try again later.</p>
  </>
)

const ObjectVerification = () => (
  <>
    <div className="pointer-events-auto relative flex flex-col items-center justify-center w-32 h-32 aspect-square z-30">
      <div className="absolute inset-3 border-2 border-transparent border-t-black dark:border-t-white rounded-full animate-spin"></div>
      <div className="absolute inset-3 border-2 border-transparent border-r-black dark:border-r-white rounded-full animate-spin delay-150"></div>
      <div className="absolute inset-3 border-2 border-transparent border-l-black dark:border-l-white rounded-full animate-spin delay-450"></div>
      <NoSymbolIcon className='h-24 w-24 dark:text-white'/>
    </div>
    <p className='font-bold dark:text-white text-xs p-2'>Place a plastic sheet in your fields.</p>
  </>
)

const AllowGeoLocationAccess = ({ getCurrentPosition }) => {
  return (
    <>
      <div onClick={() => getCurrentPosition()} className="pointer-events-auto relative flex flex-col items-center justify-center w-32 h-32 aspect-square z-30">
        <div className="absolute inset-3 border-2 border-transparent border-t-black dark:border-t-white rounded-full animate-spin"></div>
        <div className="absolute inset-3 border-2 border-transparent border-r-black dark:border-r-white rounded-full animate-spin delay-150"></div>
        <div className="absolute inset-3 border-2 border-transparent border-l-black dark:border-l-white rounded-full animate-spin delay-450"></div>
        <img src="/images/noloc.svg" className='h-24 w-24 dark:text-white' alt="NoLocationAccess" />
      </div>
      <p className='font-bold dark:text-white text-center text-xs p-2'>Tab the icon or access browser settings to permit location sharing.</p>
    </>
)}

const GeoLocationAccess = ({ getCurrentPosition }) => {
  const [retrying, setRetrying] = React.useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await getCurrentPosition();
    } finally {
      setTimeout(() => setRetrying(false), 2400);
    }
  };

  return (
    <>
      <div onClick={handleRetry} className="pointer-events-auto relative flex flex-col items-center justify-center w-32 h-32 aspect-square z-30">
        <div className="absolute inset-3 border-2 border-transparent border-t-black dark:border-t-white rounded-full animate-spin"></div>
        <div className="absolute inset-3 border-2 border-transparent border-r-black dark:border-r-white rounded-full animate-spin delay-150"></div>
        <div className="absolute inset-3 border-2 border-transparent border-l-black dark:border-l-white rounded-full animate-spin delay-450"></div>
        <div className="relative">
          {retrying ? (
            <ArrowPathIcon className="h-16 w-16 text-white animate-spin" />
          ) : (
              <MapPinIcon className="h-16 w-16 text-white" />
          )}
        </div>
      </div>
      <p className='font-bold dark:text-white text-center text-xs p-2 mx-12'>{retrying ? 'Calling up your position...' : 'Location unavailable. Move to open sky and tap to retry.'}</p>
    </>
)}

const GPSDataAvailable = () => {
  const { fieldReg, updateFieldReg } = useFieldRegContext()
  const handleAddCookie = useHandleOffsiteTrackingCookie();
  // accuracy is tested when > 3 positions, last 2 accuracy of less then 30.
  const collectingPositions = fieldReg.track && fieldReg.positions.length <= 5

  const handleReset = () => {
    updateFieldReg({ track: false, flow: 0 })
  }
  
  return (
    <>
    <div onClick={!collectingPositions ? handleAddCookie : handleReset} className="pointer-events-auto relative flex flex-col items-center justify-center w-32 h-32 aspect-square z-30">
      <div className="absolute inset-3 border-2 border-transparent border-t-black dark:border-t-white rounded-full animate-spin"></div>
      <div className="absolute inset-3 border-2 border-transparent border-r-black dark:border-r-white rounded-full animate-spin delay-150"></div>
      <div className="absolute inset-3 border-2 border-transparent border-l-black dark:border-l-white rounded-full animate-spin delay-450"></div>
      {!collectingPositions ? <img src="/images/sat.svg" className='w-24 h-24' />: <ArrowUpCircleIcon className='h-24 w-24'/>}
    </div>
    {!collectingPositions && 
      <>
      <p onClick={handleAddCookie} className='font-bold dark:text-white p-2'>Wait or tab to enable remote bordering.</p>
      <p className='py-1 mx-3 dark:text-white text-xs'>Proof ownership with a plastic sheet within 11 days.</p>
      </>
      }
    </>
  )
}

const ShowAll = () => (
  <>
    <div className="pointer-events-auto relative flex flex-col items-center justify-center h-24 w-24 z-30">
      <ArrowDownCircleIcon className='text-white h-24 w-24'/>
    </div>
  </>
)

const RequestBorders = ({ timerRef, flow, panMode, updateFieldReg }) => (
  <div className="pointer-events-auto relative flex flex-col items-center justify-center w-32 h-32 z-30">
    { (flow >= 2 && flow <= 6) && 
    <div onClick={() => updateFieldReg({ flow : 3})} className={`flex ${flow === 4 ? 'animate-bounce' : ''} items-center justify-center w-24 h-24`}>
        { (flow === 4 || flow === 6) ? 
        <>
          <>
          <div className="absolute inset-3 border-2 border-transparent border-t-white rounded-full animate-spin"></div>
          <div className="absolute inset-3 border-2 border-transparent border-r-white rounded-full animate-spin delay-150"></div>
          <div className="absolute inset-3 border-2 border-transparent border-l-white rounded-full animate-spin delay-450"></div>
          </> 
          <TimerCircle timerRef={timerRef} className={`h-24 w-24 ${flow === 4 || flow === 6 ? '' : 'animate-bounce'} ${navigator.onLine ? 'text-white':'text-black'}`}/>
        </>
          : (flow === 2 || flow === 3) && !panMode && 
        <ArrowDownCircleIcon className={`h-24 w-24 animate-bounce text-white`}/>
    }
    </ div>
    }
  </div>
)

const FieldRegNav = ({enableOffsite}) => {
    const { fieldReg, updateFieldReg, updateMapCenter } = useFieldRegContext()
    const { regFlow } = useFieldRegController();
    const { timerRef, geoPerm, handleDeleteApprovedFields, getCurrentPosition } = regFlow;
    const { flow, apiOnline, polygons,remote,panMode,alts, positions } = fieldReg

    const waitingForPoints = flow >= 1 && flow < 10 && fieldReg.positions.length === 0;
    const noGpsData = flow >= 1 && flow < 10 && positions.length === 0;
    
    return (
      <>
        { /* Render maps based on if mobile has data, set offsite based on cookie */}
        { ((flow >= 2 && flow < 11) && navigator.onLine) && (<Maps onMapLoad={updateMapCenter} parentFlow={flow} enableOffsite={enableOffsite} />)}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center w-full z-20">
            { (flow === 0 && apiOnline && geoPerm) ? // apiOnline initiate registration
            <InitiateRegistration handleDeleteApprovedFields={handleDeleteApprovedFields} />
            : (flow === 0 && !apiOnline) ? // API offline
            <APIOffline />
            : (flow === 0 && !geoPerm) ? // allow location access
            <AllowGeoLocationAccess getCurrentPosition={getCurrentPosition} />
            : noGpsData ? // active flow but no GPS readings yet
            <GeoLocationAccess getCurrentPosition={getCurrentPosition} />
            : flow === 1 ? // 
            <GPSDataAvailable remote={remote} />
            : flow === 11 ? // no GPS or data -> unlock off-site maps, verify using plastic sheet
            <ObjectVerification />
            : flow >= 10 ? // verification complete -> don't show request arrows anymore
            null
            : // tracking, waiting for user to request point
             <>
            { alts && alts.length > 0 ? 
            <ShowAll remote={remote} />
            :
            <RequestBorders timerRef={timerRef} panMode={panMode} flow={flow} updateFieldReg={updateFieldReg} polygons={polygons}  />
            }
            </>
            }
        </div>
      </>
    )
  }

export default FieldRegNav
  
