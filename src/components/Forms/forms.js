import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import FarmNameForm from './farmName';
import { useReloadDB } from '../../utils/reloadDb';
import MemberUnion from './memberUnion';
import Withdraw from "./withdrawal";
import CashCounter from "./CashCounter";
import SendDigital from "./sendDigital";
import SendReceiveAssets from "./sendReceiveAssets";
import Receipts from "./receipts";
import AllTasks from "./taskList";
import { useDataContext,useNavContext,useViewModeContext } from '../../utils/NavigationContext';
import { motion, useDragControls } from 'framer-motion';
import useTouch from '../../hooks/useTouch.js';

const Forms = ({LAND, CAP, handleOpenForm}) => {
    const { db, txIndex }                       = useDataContext() 
    const qc                                    = useQueryClient();
    const { setTokenview, setCardView }         = useViewModeContext()
    const { setIx }                             = useNavContext() 
    const { handleTouchStart, handleTouchEnd }  = useTouch()
    const reloadDB                              = useReloadDB() 
    const controls                              = useDragControls();

    const TITLES = {
        'union': 'Member Union',
        'sendDigital': 'Scan to copy your wallet address',
        'farmname': 'Your Farm name',
        'sendReceiveAssets': 'Send/Receive Assets',
        'withdrawal': 'Swap nIN',
        'cashCounter': 'Cash Counter',
        'receipts': 'History',
        'tasks': 'All Tasks'
    }
        
    useEffect(() => {
      setCardView('transactionview')
      }, []);

    const handleSetNotifications = (name) => {
        qc.invalidateQueries({ queryKey: ["unionFunds"] })
        setIx(null)
        setTokenview(false)
        reloadDB()
    }
    

    return (
        <>
        <h3 className={`font-bold dark:text-white p-4`}>{TITLES[txIndex]}</h3>
        <motion.div 
                initial={{ y: -300}}
                animate={{y: 0 }}
                drag="y"
                dragConstraints={{ top: -15, bottom: 15 }}
                dragListener={false}              // 👈 disable global drag start
                dragControls={controls}           // 👈 enable manual drag handle
                dragElastic={0.12}
                transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 }}
                className={`bg-white dark:bg-gray-700 rounded-3xl w-full rounded-tr-3xl rounded-tl-3xl shadow-top mb-[220px]`}
        > 
        <div
          onPointerDown={(e) => controls.start(e)}  // 👈 only this starts drag
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="relative h-32 w-full select-none cursor-grab active:cursor-grabbing"
        >
         <p className="mx-auto my-6 h-1 w-16 rounded-full bg-slate-300 dark:bg-slate-500" />
        </div>
        {/* Scrollable content area */}
        <div
          className="relative z-0 flex flex-col justify-center -my-24 pb-24 items-center overflow-y-auto touch-pan-y"
          onTouchStart={(e) => e.stopPropagation()}  // 👈 prevent drag from stealing scroll
          onTouchEnd={(e) => e.stopPropagation()}
        >
            { txIndex == 'union' ?
                    <MemberUnion handleSetNotifications={handleSetNotifications} />
            : txIndex == 'sendDigital' ?
                    <SendDigital db={db} />
            : txIndex == 'farmname' ?
                    <FarmNameForm LAND={LAND} />
            : txIndex == 'sendReceiveAssets' ?
                    <SendReceiveAssets handleOpenForm={handleOpenForm}/>
            : txIndex == 'withdrawal' ?
                    <Withdraw handleOpenForm={handleOpenForm}/>
            : txIndex == 'cashCounter' ?
                    <CashCounter handleOpenForm={handleOpenForm}/>
            : txIndex == 'receipts' ?
                    <Receipts />
            : txIndex == 'tasks' ?
                    <AllTasks LAND={LAND} CAP={CAP} />
            : <div>NOT YET IMPLEMENTED</div>
            }
        </div>
        </motion.div>
        </>
    )
}

export default Forms
