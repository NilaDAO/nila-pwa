import { memo } from 'react';
import { useFilterTasks } from '../../hooks/useFilterTasks';
import { ClaimButton } from '../../components/UI/buttons';
import Spinner from '../UI/spinner';
import SwipeCard from '../UI/SwipeCard';

const AllTasks = ({ LAND, CAP }) => {
    const { data, isPending } = useFilterTasks(LAND, CAP);

    if (isPending) {
        return (
            <div className="flex flex-col items-center justify-center m-6">
                <Spinner size={'small'} />
                <p className="font-bold dark:text-white">loading tasks..</p>
            </div>
        )
    }

    return (
        <div className={`flex justify-center mx-6`}>
            { !isPending && data && data.length > 0 ?
            <div className="flex flex-col w-full" style={{ scrollbarWidth: 'none' }}>
                { data.map((t, k) => (
                    (t.btn2 || t.swipeable) ? (
                        <div key={t.i ?? k} className={`${k && 'border-t-2'} py-3 border-gray-200 dark:border-slate-600`}>
                            <SwipeCard t={t} />
                        </div>
                    ) : (
                        <div key={t.i ?? k} className={`flex flex-row ${k && 'border-t-2'} py-9 border-gray-200 dark:border-slate-600 min-h-24`}>
                            <div className="flex justify-center w-1/4 m-2">
                              <div className="relative flex items-center justify-center h-9 w-9 mx-6">
                                {t.pending && (
                                  <>
                                    <div className="absolute inset-0 border-4 border-transparent border-t-green/75 rounded-full animate-spin" />
                                    <div className="absolute inset-0 border-4 border-transparent border-r-green/75 rounded-full animate-spin delay-150" />
                                    <div className="absolute inset-0 border-4 border-transparent border-l-green/75 rounded-full animate-spin delay-450" />
                                  </>
                                )}
                                <img src={t.img} className="h-7 w-7" alt="Logo" />
                              </div>
                            </div>
                            <div className='flex flex-row justify-evenly w-3/4'>
                                <div className='mr-2'>
                                    <p className="font-bold text-xs dark:text-slate-100">{t.title}</p>
                                    <p onClick={() => 'subclick' in t && t.subclick(t.sub_tx_nmb)} className="text-xs dark:text-slate-400 text-gray-400">{t.subtitle}</p>
                                </div>
                                {t.btn && (
                                  <div className="flex flex-col gap-1">
                                    <ClaimButton disabled={false} handleClick={() => t.click(t.tx_nmb)} title={t.btn}/>
                                  </div>
                                )}
                            </div>
                        </div>
                    )
                ))}
            </div>
            :
            <div className="flex flex-col justify-center m-6">
                <p className="font-bold text-xs dark:text-white">All tasks completed.</p>
                <p className="text-xs text-gray-400">We will notify you when more come available.</p>
            </div>
            }
        </div>
    )
}

export default memo(AllTasks)
