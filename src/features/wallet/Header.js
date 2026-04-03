import { ArrowLeftIcon, Cog8ToothIcon, QrCodeIcon } from '@heroicons/react/20/solid'
import { ClockIcon, DocumentIcon } from '@heroicons/react/24/outline'
import { useDataContext, useNavContext, useViewModeContext } from '../../utils/NavigationContext'

const Header = ({version, cardShrink}) => {
    const { txIndex, setTxIndex } = useDataContext();
    const { tokenview, setTokenview, setCardView } = useViewModeContext();
    const { ix,setIx,prevIx } = useNavContext();

    const handleSettings = () => {
        setCardView('transactionview')
        setTokenview(true) // set to true to remove touch swipe
        setIx((prev) => {
            // make sure ref doesnt update when ix > 3
            prevIx.current = prev
            return 4;
        })
    }

    const TITLES = {
        'union': 'Member Union',
        'sendDigital': 'Scan to copy your wallet address',
        'farmname': 'Add your Farm Name',
        'sendReceiveAssets': 'Send/Receive Assets',
        'withdrawal': 'Cash swap',
        'cashCounter': 'Cash Counter',
        'transfer': 'Transfer Loans',
        'receipts': 'History',
        'tasks': 'All Tasks'
    }

    const cards = {
        0: 'Assets and Certificates',
        1: 'Invest and Borrow',
        2: '',
        3: 'Loan Restructuring',
        4: 'Settings',
        5: TITLES[txIndex],
    }

    const handleBack = () => {
        /**
         * rules: 
         * if tv, use previx
         * if not tv, use null
         * tv can be set after tx or action
         */
        if (tokenview){
            setCardView('default')
            setTokenview(false)
            setIx(prevIx.current)
        } 
        if (!tokenview && ix > 0){
            setIx(null)
        }
    }

    const handleSuperteam = () => {
        setTokenview(!tokenview)
        setIx((prev) => {
            prevIx.current = prev
            return 4;
        })
    }

    const handleAllTasks = () => {
        setCardView('transactionview')
        setIx((prev) => {
            prevIx.current = prev
            return 5;
        })
        setTxIndex('tasks')
    }
    const handlePaymentHistory = () => {
        setCardView('transactionview')
        setIx((prev) => {
            prevIx.current = prev
            return 5;
        })
        setTxIndex('receipts')
    }

    const handleScanQR = () => {
        setCardView('transactionview')
        setTokenview(true)
        setIx((prev) => {
            prevIx.current = prev
            return 5;
        })
        setTxIndex('sendDigital')
    }

    return (
        <div style={{ zIndex: 1 }} className='flex sticky top-0 justify-between text-white w-full'>
            { version === 0 ?
                <>
                { /* set different button states: QR/History/back/close/none */}
                { (tokenview || ix > 0) && <div onClick={handleBack} className="rounded-full h-10 w-10 m-2 dark:bg-slate-400 bg-gray-300" ><ArrowLeftIcon className='text-black h-6 m-2'/></div>}
                { (!tokenview && ix === null ) &&
                    <div onClick={handleScanQR} className="rounded-full h-10 w-10 m-2 dark:bg-slate-400 bg-gray-300" >
                        <QrCodeIcon className='text-black h-6 m-2'/>
                    </div> }
                { (ix === 0 && !tokenview) && <div onClick={handlePaymentHistory} className="rounded-full h-10 w-10 m-2 dark:bg-slate-400 bg-gray-300" ><ClockIcon className='text-black h-6 m-2'/></div>}
                { (ix === null) && <div onClick={handleAllTasks} className="flex flex-grow text-xs mx-6 justify-center items-center rounded-full m-2 dark:text-slate-400 dark:bg-slate-800 font-bold text-darkgrey bg-gray-100 mx-2" ><DocumentIcon className='h-3 w-3 mr-1' />All Tasks</div>}
                { (ix === undefined) && <h3 className='font-Chains h-8 w-8 text-xl m-3'>a</h3>}
                { cardShrink >= 0.5 && <div className="flex font-bold text-black dark:text-white m-5 items-center">{cards[ix]}</div>}
                </>
            :<div className='h-11 w-11' /> }
            { version !== 0 && <div className={`flex z-0 justify-center w-screen`}>
                <h3 onClick={version === 0 ? handleSuperteam : null} className="font-bold text-base m-3">nila</h3>
            </div> }
            { version === 0 ?
                 <div onClick={handleSettings} className="rounded-full h-10 w-10 m-2 dark:bg-slate-400 bg-gray-300" to={"settings"}>
                    <Cog8ToothIcon className='text-black h-6 m-2'/>
                </div>: <div className='h-11 w-11' />}
        </div>
    )
}

export default Header