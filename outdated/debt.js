import { useState,useEffect } from 'react'
import DebtListed from '../src/features/lending/debtsListed.js';
import DebtsActive from '../src/features/lending/debtsActive.js';
import { useNavContext, useDataContext } from '../src/utils/NavigationContext.js';
import Spinner from '../src/components/UI/spinner.js';
import { useUnionFunds } from '../src/hooks/useLoadFunds.ts';

const Debt = ({LAND, CAP}) => {
    const { db, unionFunds, debts }   = useDataContext();
    const { cardIx }                  = useNavContext();
    const [ loading, setLoading]      = useState(true);
    const [ loadStage, setLoadStages] = useState('loading funds')

    // Fetch hooks
    const ready = true
    
    // fetch and store in state and db (do not return)
    const { isLoading,isError,isPending,Error } = useUnionFunds(db?.union?.address, { enabled: ready });
    
    // temporary array untill we call trading offers
    const data = []

    useEffect(() => {
        if(!unionFunds || unionFunds && unionFunds.length === 0) {
            setLoadStages(db['union'] ? 'Your union does not have any funds. Change union or ask your union for further details.' : 'Join a union to apply for a loan.')
            return;
        }
        if(!ready || !isLoading && !isError && !isPending){
            setLoading(false)
        }
        if(isError){
            console.error('ERROR', Error)
            setLoadStages('Something has gone wrong. Please try again later.')
        }
    }, [isLoading,isError,ready]);

    return (      
        <div className={`flex flex-col rounded-3xl w-full mb-[220px] pb-6`}> 
            {loading ? 
            <div className='flex h-1/2 justify-center'>
                <Spinner stages={loadStage} />
            </div>
            : 
            <div>
            { cardIx === false ?
                <DebtListed LAND={LAND} CAP={CAP} data={!ready ? [] : data} />
                :
                <DebtsActive debt={debts[cardIx]}/>
            }
            </div>
            }
        </div>
            )
}

export default Debt