import { useState, useEffect } from 'react';
import { WalletIcon, MapPinIcon } from '@heroicons/react/20/solid'
import { useDataContext, useNavContext, useTxContext } from '../../utils/NavigationContext'
import RippleEffect from './RippleEffect';

const Tabs = ({ handleOpenForm, toggleScreen }) => {
  const [shortbuttons, setShortButtons] = useState([]);
  const { stage } = useTxContext()
  const { db } = useDataContext();
  const { ix } = useNavContext();

  const keyToNameMap = {'union': 'join a Union','withdrawal': 'Add / Take Cash','cashCounter': 'Cash Counter'} //,,'refin': 'refinance existing loans','backup': 'backup wallet'

  const handleBack = () => {
    toggleScreen({ ix: null })
  }

  const shortButtonsVisible = (ix === null) && !stage;

  useEffect(() => {
    let keys = ['union','withdrawal'].filter((key) => !db[key])
    // leader keys
    if (db.union?.leader){
      // append keys to tabs list
      const leaderkeys = ['cashCounter']
      keys = [...keys, ...leaderkeys ]
    }

    const validKeys = keys
      .filter((key) => !db[key]) // Only keep keys with true values
      .filter((key) => keyToNameMap[key]).map((key) => [keyToNameMap[key],key]); // Replace with readable names
    setShortButtons(validKeys);
  }, [db]);

  return (
      <>
      { shortButtonsVisible && (
        <div
          className="fixed inset-x-0 z-40"
          style={{ bottom: 'calc(48px + env(safe-area-inset-bottom))' }}
        >
          <div className="w-full overflow-x-auto my-1 pb-1">
            <div className="flex gap-4 px-1 whitespace-nowrap">
              { /* index + 2, index 0 and 1 are for land asset and grant tx */ } 
              {shortbuttons.map((txt, index) => ( 
                <button key={index} onClick={() => handleOpenForm(txt[1])} className="flex-shrink-0 mx-1 dark:bg-slate-400 bg-gray-200 text-sm font-bold rounded-3xl py-2 no-wrap px-5">{txt[0]}</button>
              ))}
            </div>  
          </div>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-50 dark:bg-darkgrey bg-white backdrop-blur border-t dark:border-slate-800 border-slate-200 h-12 pb-[env(safe-area-inset-bottom)] flex flex-row">
          <RippleEffect>
            <button className={`p-3 ${ix !== 2 ? 'text-black dark:text-slate-400' : 'text-slate-800'}`} onClick={handleBack}><WalletIcon className="h-7 w-7" /></button>
          </RippleEffect>
          { /* <button className={`flex flex-col items-center text-slate-300`} onClick={() => toggleScreen(null)} ><ChatBubbleOvalLeftEllipsisIcon className="h-6 w-6 m-1" /><h3 className="text-sm">tasks</h3></button> */ }
          <RippleEffect>
              <button className={`p-3 ${ix === 2 ? 'text-black dark:text-slate-400' : 'text-slate-800'}`}  onClick={()=> toggleScreen({ ix: 2, i: null})} ><MapPinIcon className="h-7 w-7" /></button>
          </RippleEffect>
      </div>
      </>
  )
}

export default Tabs
