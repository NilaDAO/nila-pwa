import { useState, useEffect } from 'react';
import { WalletIcon, MapPinIcon } from '@heroicons/react/20/solid'
import { useDataContext, useNavContext, useTxContext } from '../../utils/NavigationContext'
import RippleEffect from './RippleEffect';

const Tabs = ({ handleOpenForm, toggleScreen }) => {
  const [shortbuttons, setShortButtons] = useState([]);
  const { stage } = useTxContext()
  const { db } = useDataContext();
  const { ix } = useNavContext();

  const handleBack = () => {
    toggleScreen({ ix: null })
  }

  const shortButtonsVisible = (ix === null) && !stage;

  useEffect(() => {
    // Non-leader shortcuts: show 'union' if not joined, 'withdrawal' if no withdrawal yet
    let buttons = [];
    if (!db.union) buttons.push(['join a Union', 'union']);

    // Leader shortcuts: fixed Cash In / Cash Out forms — always available.
    // Urgency signals (expiring escrows, open unbond windows, low treasury)
    // surface as tasks in useFilterTasks, not here.
    if (db.union?.leader) {
      buttons = [...buttons, ['Cash In', 'cashIn'], ['Cash Out', 'cashOut']];
    }

    setShortButtons(buttons);
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
              {shortbuttons.map((btn, index) => (
                <button
                  key={index}
                  onClick={() => handleOpenForm(btn[1])}
                  className="flex-shrink-0 mx-1 dark:bg-slate-400 bg-gray-200 text-sm font-bold rounded-3xl py-2 no-wrap px-5"
                >
                  {btn[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-50 dark:bg-darkgrey bg-white backdrop-blur border-t dark:border-slate-800 border-slate-200 h-12 pb-[env(safe-area-inset-bottom)] flex flex-row">
          <RippleEffect>
            <button className={`p-3 ${ix !== 2 ? 'text-black dark:text-slate-400' : 'text-slate-800'}`} onClick={handleBack}><WalletIcon className="h-7 w-7" /></button>
          </RippleEffect>
          <RippleEffect>
              <button className={`p-3 ${ix === 2 ? 'text-black dark:text-slate-400' : 'text-slate-800'}`}  onClick={()=> toggleScreen({ ix: 2, i: null})} ><MapPinIcon className="h-7 w-7" /></button>
          </RippleEffect>
      </div>
      </>
  )
}

export default Tabs
