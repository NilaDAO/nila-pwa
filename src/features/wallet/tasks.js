import { useState, useRef, useEffect } from 'react';
import { ClaimButton } from '../../components/UI/buttons';
import { useFilterTasks } from '../../hooks/useFilterTasks';
import SwipeCard from '../../components/UI/SwipeCard';
import Spinner from '../../components/UI/spinner';

// Below this slot height the roomy layout (icon-on-top, wrapped title,
// subtitle, swipe hint) no longer fits — the card stack above claims space
// first (it's flex-shrink-0), so a busy stack can squeeze this slot down to
// its 120px floor. Compact mode swaps to a smaller icon-left row so content
// stays legible instead of being clipped.
const COMPACT_HEIGHT = 190;

const TaskMessage = ({ LAND, CAP, inArrays }) => {
    const [ index, setIndex ] = useState(0);
    const { data, isPending, upstreamLoading } = useFilterTasks(LAND, CAP);
    const scrollerRef         = useRef(null);
    const slotRef             = useRef(null);
    const [ compact, setCompact ] = useState(false);

    useEffect(() => {
        const el = slotRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => {
            setCompact(entry.contentRect.height < COMPACT_HEIGHT);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const onScroll = () => {
        const el = scrollerRef.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        if (i !== index) setIndex(i);
    };

    // Treat first-load AND any upstream hook still streaming as "loading" so we
    // don't flash "All tasks completed" while data is on the way.
    const loading = isPending || upstreamLoading;
    // The card stack (below) gets priority for space — it's sized to its own
    // content and never shrinks. TaskMessage takes whatever's left in the
    // flex column, down to a small floor (never fully squashed to 0), and
    // scrolls internally if its content doesn't fit in what's left.
    const SLOT_CLASSES = "flex justify-center mx-6 flex-1 min-h-[120px] overflow-y-auto";

    if (loading) {
        return (
            <div ref={slotRef} className={SLOT_CLASSES}>
                <Spinner size="small" />
            </div>
        )
    }

    return (
        <div ref={slotRef} className={SLOT_CLASSES}>
            { data && data.length > 0 ?
            <div
                ref={scrollerRef}
                onScroll={onScroll}
                className={`flex overflow-x-auto snap-x snap-mandatory scroll-smooth w-full [-ms-overflow-style:none] [scrollbar-width:none] ${compact ? 'my-2' : 'my-6'}`}
                style={{ scrollbarWidth: 'none' }}
            >
                { data.map((t, k) => (
                    <div key={t.i ?? k} className="snap-start shrink-0 w-full h-full overflow-y-auto px-6" style={{ scrollSnapAlign: 'start' }}>
                        { (t.btn2 || t.swipeable) ? (
                            <SwipeCard t={t} compact={compact} />
                        ) : compact ? (
                            <div className="flex flex-row items-center gap-3">
                                <div className="relative flex items-center justify-center h-8 w-8 flex-shrink-0">
                                    {t.pending && (
                                      <>
                                        <div className="absolute inset-0 border-2 border-transparent border-t-green/75 rounded-full animate-spin" />
                                        <div className="absolute inset-0 border-2 border-transparent border-r-green/75 rounded-full animate-spin delay-150" />
                                        <div className="absolute inset-0 border-2 border-transparent border-l-green/75 rounded-full animate-spin delay-450" />
                                      </>
                                    )}
                                    {t.cropImg ? (
                                      <div className={`h-7 w-7 rounded-full flex items-center justify-center ${t.iconBg || 'bg-green'} flex-shrink-0`}>
                                        <div className="w-5 h-5" style={{ WebkitMaskImage: `url(${t.img})`, maskImage: `url(${t.img})`, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskPosition: 'center', maskPosition: 'center', backgroundColor: 'black' }} />
                                      </div>
                                    ) : (
                                      <img src={t.img} className="h-7 w-7" alt="Logo" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-xs truncate dark:text-slate-100">{t.title}</p>
                                    {t.subtitle && <p onClick={() => 'subclick' in t && t.subclick(t.sub_tx_nmb)} className="text-xs truncate dark:text-slate-400 text-gray-400">{t.subtitle}</p>}
                                </div>
                                {t.btn && (
                                  <ClaimButton
                                    disabled={(inArrays && t.i === 2) ? true : false}
                                    handleClick={() => t.click(t.tx_nmb)}
                                    title={t.btn}
                                  />
                                )}
                            </div>
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
                                    {t.cropImg ? (
                                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${t.iconBg || 'bg-green'} flex-shrink-0`}>
                                        <div className="w-8 h-8" style={{ WebkitMaskImage: `url(${t.img})`, maskImage: `url(${t.img})`, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskPosition: 'center', maskPosition: 'center', backgroundColor: 'black' }} />
                                      </div>
                                    ) : (
                                      <img src={t.img} className="h-10 w-10" alt="Logo" />
                                    )}
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
