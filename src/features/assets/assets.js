import { useState } from 'react';
import { useViewModeContext, useNavContext } from '../../utils/NavigationContext';
import CertGrid from '../assets/certGrid';
import AssetList from './assetsList';

const Assets = ({LAND,handleOpenForm}) => {
    const { navRef,tokenview,setTokenview,setCardView } = useViewModeContext();
    const { ix, prevIx } = useNavContext();
    const [ data, setData ] = useState({ tab: true });
    const [ tab, setTab] = useState(navRef.current.assetTab) // ref only on remount of component

    const handleTokenView = (elements) => {
        prevIx.current = ix;
        setData(elements)
        setTokenview(true);
        setCardView('transactionview')
    }

    const handleSetTab = (bool) => {
        setTab(bool) // state required as ref won't rerender on tab change.
        navRef.current.assetTab = bool
    }
    /**
     * Assets is the parent component for the asset module: 
        * Lists assets and certificates
        * Loads assets and cert NFTs.   
        *       
     * global state is required to remove card on tokenview! 
     * 
     * Image list should be based on transactions recorded, available certificates and monthly grants.
     * 3 categories (1: current grant period, 2: labels, 3: past grants, append in this order)
     * 
     */
    
    return (      
        <div className={`flex flex-col`}> 
            {/* pb 220px is because transitionY messes with scroll, so without the page wouldnt scroll to bottom*/}
            <div className={`flex ${tokenview ? 'hidden' : ''} justify-around p-4 mb-4`}>
                <h3 onClick={() => handleSetTab(true)} className={`font-bold ${!tab ? 'text-gray-400 dark:text-slate-400' : 'dark:text-white'} text-sm`}>Assets</h3>
                <h3 onClick={() => handleSetTab(false)} className={`font-bold ${tab ? 'text-gray-400 dark:text-slate-400' : 'dark:text-white'} text-sm`}>Certificates</h3>
            </div>
            { tab ?
            <div className={tokenview ? '' : 'bg-white dark:bg-gray-700 rounded-3xl w-full mb-[220px] py-6 shadow-bottom'}>
                <AssetList LAND={LAND} data={data} handleTokenView={handleTokenView} handleOpenForm={handleOpenForm} />
            </div>
            :
            <div className='bg-white dark:bg-gray-700 rounded-3xl w-full mb-[220px] py-6 rounded-br-3xl rounded-bl-3xl shadow-bottom'>
                <CertGrid data={data} handleTokenView={handleTokenView} />
            </div>
            }
    </div>
    )
}

export default Assets
