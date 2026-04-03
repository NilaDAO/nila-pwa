import { useState, useRef } from 'react';

const SWIPE_THRESHOLD = 80;

/**
 * SwipeCard — swipe right to accept, swipe left to cancel.
 * t.click(t.tx_nmb) = accept, t.click2() = cancel
 */
const SwipeCard = ({ t }) => {
    const [dx, setDx]  = useState(0);
    const startX       = useRef(null);
    const isDragging   = useRef(false);

    const onTouchStart = (e) => {
        startX.current     = e.touches[0].clientX;
        isDragging.current = false;
    };

    const onTouchMove = (e) => {
        if (startX.current === null) return;
        const delta = e.touches[0].clientX - startX.current;
        if (!isDragging.current && Math.abs(delta) < 8) return;
        isDragging.current = true;
        setDx(Math.max(-130, Math.min(130, delta)));
    };

    const onTouchEnd = () => {
        const triggered = dx > SWIPE_THRESHOLD ? 'accept' : dx < -SWIPE_THRESHOLD ? 'cancel' : null;
        setDx(0);
        startX.current     = null;
        isDragging.current = false;
        if (triggered === 'accept') t.click(t.tx_nmb);
        if (triggered === 'cancel') t.click2();
    };

    // right swipe → accept (green), left swipe → cancel (red)
    const acceptPct = Math.min(1, Math.max(0,  dx / SWIPE_THRESHOLD));
    const cancelPct = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));

    return (
        <div className="relative overflow-hidden">
            {/* full-width tinted bg */}
            <div className="absolute inset-0 bg-green-500" style={{ opacity: acceptPct * 0.25 }} />
            <div className="absolute inset-0 bg-red-500"   style={{ opacity: cancelPct * 0.25 }} />

            {/* fixed labels — accept on LEFT (revealed when card slides right), cancel on RIGHT */}
            <div
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ opacity: acceptPct }}
            >
                <span className="text-green dark:text-green font-bold text-sm">Accept ✓</span>
            </div>
            <div
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ opacity: cancelPct }}
            >
                <span className="text-red dark:text-red font-bold text-sm">✕ Cancel</span>
            </div>

            {/* draggable content */}
            <div
                className="relative px-4 pt-3 pb-2 touch-pan-y"
                style={{
                    transform: `translateX(${dx}px)`,
                    transition: isDragging.current ? 'none' : 'transform 0.25s ease',
                    willChange: 'transform',
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
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
                <p className="font-bold text-xs text-center dark:text-slate-100">{t.title}</p>
                <p className="text-xs text-center text-gray-400 dark:text-slate-400">{t.subtitle}</p>
                <p className="text-center text-[10px] text-gray-300 dark:text-slate-600 mt-2">
                    ✕ cancel &nbsp;·&nbsp; accept ✓
                </p>
            </div>
        </div>
    );
};

export default SwipeCard;
