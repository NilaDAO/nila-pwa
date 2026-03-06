import { useState, useRef, memo } from 'react';
import { ClaimButton } from '../../components/UI/buttons';
import { useFilterTasks } from '../../hooks/useFilterTasks';

const TaskMessage = ({ LAND, CAP,inArrays}) => {
    const [ index, setIndex ] = useState(0);
    const { data, isPending } = useFilterTasks(LAND, CAP);
    const scrollerRef         = useRef(null);
    
    const onScroll = () => {
        const el = scrollerRef.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        if (i !== index) setIndex(i);
    };
    
    if (isPending) {
        return (
            <div className="flex flex-col justify-center m-6">
                <p className="font-bold text-xs text-center dark:text-white">loading tasks..</p>
            </div>
        )
    }

    return (
        <div className={`flex justify-center mx-6`}>
            { !isPending && data && data.length > 0 ? 
            <div
                ref={scrollerRef}
                onScroll={onScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth my-6 w-full [-ms-overflow-style:none] [scrollbar-width:none]"
                style={{ scrollbarWidth: 'none' }}
            >
                { data.map((t, k) => (
                    <div key={t.i ?? k} className="snap-start shrink-0 w-full px-6" style={{ scrollSnapAlign: 'start' }}>
                        <div className="flex justify-center mb-2">
                          <div className="relative flex items-center justify-center h-12 w-12">
                            {t.pending && (
                              <>
                                <div className="absolute inset-0 border-4 border-transparent border-t-green/75 rounded-full animate-spin" />
                                <div className="absolute inset-0 border-4 border-transparent border-r-green/75 rounded-full animate-spin delay-150" />
                                <div className="absolute inset-0 border-4 border-transparent border-l-green/75 rounded-full animate-spin delay-450" />
                              </>
                            )}
                            <img src={t.img} className="h-10 w-10" alt="Logo" />
                          </div>
                        </div>
                        <div className='flex flex-row justify-center'>
                            <div className="mr-1" >
                                <p className="font-bold text-xs my-1 dark:text-slate-100">{t.title}</p>
                                <p onClick={() => 'subclick' in t && t.subclick(t.sub_tx_nmb)} className="text-xs dark:text-slate-400 text-gray-400">{t.subtitle}</p>
                            </div>
                            {t.btn ? (
                              <ClaimButton
                                disabled={(inArrays && t.i === 2) ? true : false}
                                handleClick={() => t.click(t.tx_nmb)}
                                title={t.btn}
                              />
                            ) : null}
                        </div>
                        
                    </div>
                ))}
            </div>
            : 
            <div className="flex flex-col justify-center m-6">
                <p className="font-bold text-xs dark:text-white">All tasks completed.</p>
                <p className="text-xs text-gray-400">We will notify you when more tasks are available.</p>   
            </div>
            }
        </div>
    )
}

export default TaskMessage
