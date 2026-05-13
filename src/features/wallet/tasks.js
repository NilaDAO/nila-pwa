import { useState, useRef } from 'react';
import { ClaimButton } from '../../components/UI/buttons';
import { useFilterTasks } from '../../hooks/useFilterTasks';
import SwipeCard from '../../components/UI/SwipeCard';
import Spinner from '../../components/UI/spinner';

const TaskMessage = ({ LAND, CAP, inArrays }) => {
    const [ index, setIndex ] = useState(0);
    const { data, isPending, upstreamLoading } = useFilterTasks(LAND, CAP);
    const scrollerRef         = useRef(null);

    const onScroll = () => {
        const el = scrollerRef.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        if (i !== index) setIndex(i);
    };

    // Treat first-load AND any upstream hook still streaming as "loading" so we
    // don't flash "All tasks completed" while data is on the way.
    const loading = isPending || upstreamLoading;
    // Fixed min-height matches the tallest task card (a SwipeCard with the
    // inline LP-options block ≈ 226px including the scroller's my-6). Loading,
    // empty, and all task variants share the slot so the surrounding card
    // never shifts on state transitions.
    const SLOT_CLASSES = "flex justify-center mx-6 min-h-[230px]";

    if (loading) {
        return (
            <div className={SLOT_CLASSES}>
                <Spinner size="small" />
            </div>
        )
    }

    return (
        <div className={SLOT_CLASSES}>
            { data && data.length > 0 ?
            <div
                ref={scrollerRef}
                onScroll={onScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth my-6 w-full [-ms-overflow-style:none] [scrollbar-width:none]"
                style={{ scrollbarWidth: 'none' }}
            >
                { data.map((t, k) => (
                    <div key={t.i ?? k} className="snap-start shrink-0 w-full px-6" style={{ scrollSnapAlign: 'start' }}>
                        { (t.btn2 || t.swipeable) ? (
                            <SwipeCard t={t} />
                        ) : (
                            <>
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
                                        {t.subtitle && <p onClick={() => 'subclick' in t && t.subclick(t.sub_tx_nmb)} className="text-xs dark:text-slate-400 text-gray-400">{t.subtitle}</p>}
                                    </div>
                                    {t.btn && (
                                      <div className="flex flex-col gap-1">
                                        <ClaimButton
                                          disabled={(inArrays && t.i === 2) ? true : false}
                                          handleClick={() => t.click(t.tx_nmb)}
                                          title={t.btn}
                                        />
                                      </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            :
            <div className="flex flex-col items-center justify-center my-6">
                <p className="font-bold text-xs dark:text-white">All tasks completed.</p>
                <p className="text-xs text-gray-400">We will notify you when more tasks are available.</p>
            </div>
            }
        </div>
    )
}

export default TaskMessage
