import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import FarmNameForm from './farmName';
import { useReloadDB } from '../../utils/reloadDb';
import MemberUnion from './memberUnion';
import CashCounter from "./CashCounter";
import Contribute from "./Contribute";
import SendDigital from "./sendDigital";
import SendReceiveAssets from "./sendReceiveAssets";
import Receipts from "./receipts";
import AllTasks from "./taskList";
import { CashOutForm } from "./CashOutForm.js";
import { RedeemForm } from "./RedeemForm.js";
import { CashOfferConfirmForm } from "./CashOfferConfirmForm.js";
import { useDataContext,useNavContext,useViewModeContext } from '../../utils/NavigationContext';
import DragSheet from '../UI/DragSheet';

const Forms = ({LAND, CAP, handleOpenForm}) => {
    const { db, txIndex }               = useDataContext()
    const qc                            = useQueryClient();
    const { setTokenview, setCardView } = useViewModeContext()
    const { setIx }                     = useNavContext()
    const reloadDB                      = useReloadDB()

    const TITLES = {
        'union': 'Member Union',
        'sendDigital': 'Scan to copy your wallet address',
        'farmname': 'Your Farm name',
        'sendReceiveAssets': 'Send/Receive Assets',
        'cashIn': 'Cash In',
        'cashCounter': 'Cash Counter',
        'contribute': 'Contributions',
        'receipts': 'History',
        'tasks': 'All Tasks',
        'cashOut': 'Cash Out',
        'redeem': 'Redeem — Give Cash',
        'cashOffer-confirm': 'Hand Over Cash',
    }

    useEffect(() => {
      setCardView('transactionview')
      }, []);

    const handleSetNotifications = () => {
        qc.invalidateQueries({ queryKey: ["unionFunds"] })
        setIx(null)
        setTokenview(false)
        reloadDB()
    }

    return (
        <>
        <h3 className={`font-bold dark:text-white p-4`}>{TITLES[txIndex]}</h3>
        <DragSheet forceWhite={txIndex === 'sendDigital'}>
            <div className="flex flex-col justify-center pb-24 items-center w-full">
                { txIndex == 'union' ?
                        <MemberUnion handleSetNotifications={handleSetNotifications} />
                : txIndex == 'sendDigital' ?
                        <SendDigital db={db} />
                : txIndex == 'farmname' ?
                        <FarmNameForm LAND={LAND} />
                : txIndex == 'sendReceiveAssets' ?
                        <SendReceiveAssets handleOpenForm={handleOpenForm}/>
                : txIndex == 'cashIn' ?
                        <CashCounter handleOpenForm={handleOpenForm}/>
                : txIndex == 'cashCounter' ?
                        <CashCounter handleOpenForm={handleOpenForm}/>
                : txIndex == 'contribute' ?
                        <Contribute handleOpenForm={handleOpenForm}/>
                : txIndex == 'receipts' ?
                        <Receipts />
                : txIndex == 'tasks' ?
                        <AllTasks LAND={LAND} CAP={CAP} />
                : txIndex == 'cashOut' ?
                        <CashOutForm handleOpenForm={handleOpenForm} />
                : txIndex == 'redeem' ?
                        <RedeemForm handleOpenForm={handleOpenForm} />
                : txIndex == 'cashOffer-confirm' ?
                        <CashOfferConfirmForm handleOpenForm={handleOpenForm} />
                : <div>NOT YET IMPLEMENTED</div>
                }
            </div>
        </DragSheet>
        </>
    )
}

export default Forms
