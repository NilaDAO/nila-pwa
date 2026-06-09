import { useState, useRef } from 'react';

const SWIPE_THRESHOLD = 80;

/**
 * SwipeCard — swipe right to accept, swipe left to cancel.
 * t.click(t.tx_nmb, lpOpts?) = accept, t.click2() = cancel
 *
 * When t.lp is present ({ fullAmt, netAmt }) the card renders an inline
 * LP-request checkbox + amount toggle. The selected state is forwarded to
 * t.click() on swipe-right so the handler can fire the LP request.
 */
const SwipeCard = ({ t }) => {
    const [dx, setDx]  = useState(0);
    const startX       = useRef(null);
    const isDragging   = useRef(false);

    // Customizable swipe labels (defaults: Accept right / Cancel left)
    const rightLabel = t.swipeRightLabel ?? 'Accept ✓';
    const leftLabel  = t.swipeLeftLabel  ?? '✕ Cancel';
    const hintText   = t.swipeHint       ?? `${leftLabel} \u00a0·\u00a0 ${rightLabel}`;
    // When the left swipe is also a positive action (e.g. preferred path),
    // tint it green instead of red.
    const leftPositive = Boolean(t.swipeLeftPositive);

    // LP options — local state lives on the card
    const noEscrow        = t.lp?.escrowBalance === 0;
    const escrowCoversAll = t.lp && t.lp.escrowBalance >= t.lp.fullAmt;
    const [sendLP, setSendLP] = useState(!escrowCoversAll);
    const [inFull, setInFull] = useState(noEscrow);

    const onStart = (x) => {
        startX.current     = x;
        isDragging.current = false;
    };
    const onMove = (x) => {
        if (startX.current === null) return;
        const delta = x - startX.current;
        if (!isDragging.current && Math.abs(delta) < 8) return;
        isDragging.current = true;
        setDx(Math.max(-130, Math.min(130, delta)));
    };
    const onEnd = () => {
        const triggered = dx > SWIPE_THRESHOLD ? 'accept' : dx < -SWIPE_THRESHOLD ? 'cancel' : null;
        setDx(0);
        startX.current     = null;
        isDragging.current = false;
        if (triggered === 'accept') {
            const lpOpts = t.lp ? {
                sendLP,
                amount: sendLP ? (inFull ? t.lp.fullAmt : t.lp.netAmt) : 0,
            } : undefined;
            t.click(t.tx_nmb, lpOpts);
        }
        if (triggered === 'cancel' && t.click2) t.click2();
    };

    // Touch
    const onTouchStart = (e) => onStart(e.touches[0].clientX);
    const onTouchMove  = (e) => onMove(e.touches[0].clientX);
    const onTouchEnd   = onEnd;

    // Mouse (desktop)
    const mouseDown = useRef(false);
    const onMouseDown = (e) => { mouseDown.current = true; onStart(e.clientX); };
    const onMouseMove = (e) => { if (mouseDown.current) onMove(e.clientX); };
    const onMouseUp   = ()  => { mouseDown.current = false; onEnd(); };

    // right swipe → accept (green), left swipe → cancel (red)
    const acceptPct = Math.min(1, Math.max(0,  dx / SWIPE_THRESHOLD));
    const cancelPct = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));

    return (
        <div className="relative overflow-hidden">
            {/* full-width tinted bg */}
            <div className="absolute inset-0 bg-green-500" style={{ opacity: acceptPct * 0.25 }} />
            <div className={`absolute inset-0 ${leftPositive ? 'bg-green-500' : 'bg-red-500'}`} style={{ opacity: cancelPct * 0.25 }} />

            {/* fixed labels — accept on LEFT (revealed when card slides right), cancel on RIGHT */}
            <div
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ opacity: acceptPct }}
            >
                <span className="text-green dark:text-green font-bold text-xs">{rightLabel}</span>
            </div>
            <div
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ opacity: cancelPct }}
            >
                <span className={`${leftPositive ? 'text-green dark:text-green' : 'text-red dark:text-red'} font-bold text-xs`}>{leftLabel}</span>
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
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
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
                        {t.cropImg ? (
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${t.iconBg || 'bg-green'} flex-shrink-0`}>
                                <div className="w-8 h-8" style={{ WebkitMaskImage: `url(${t.img})`, maskImage: `url(${t.img})`, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskPosition: 'center', maskPosition: 'center', backgroundColor: 'black' }} />
                            </div>
                        ) : (
                            <img src={t.img} className="h-10 w-10" alt="Logo" />
                        )}
                    </div>
                </div>
                <p className="font-bold text-xs text-center dark:text-slate-100">{t.title}</p>
                {t.subtitle && <p className="text-xs text-center text-gray-400 dark:text-slate-400">{t.subtitle}</p>}

                {/* ── Inline LP request options ── */}
                {t.lp && (
                    <div className="mt-3 flex flex-col items-center gap-1"
                         onTouchStart={e => e.stopPropagation()}
                         onMouseDown={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 cursor-pointer select-none"
                             onClick={() => {
                                 if (!sendLP && escrowCoversAll) {
                                     if (!confirm('Escrow covers the full amount. Settling via LP will draw from the treasury. Continue?')) return;
                                 }
                                 setSendLP(v => { if (v) setInFull(noEscrow); return !v; });
                             }}>
                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors
                                ${sendLP
                                    ? 'bg-green border-green dark:bg-green_dark dark:border-green_dark'
                                    : 'border-gray-300 dark:border-slate-600'}`}>
                                {sendLP && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                        <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                )}
                            </div>
                            <span className="text-[11px] font-medium dark:text-slate-200">
                                Settle{' '}
                                {noEscrow
                                    ? <span>₹{t.lp.fullAmt.toLocaleString('en-IN')}</span>
                                    : <span onClick={e => { e.stopPropagation(); if (sendLP) setInFull(f => !f); }}
                                            className={sendLP ? 'underline decoration-dotted cursor-pointer' : ''}>
                                        ₹{(inFull ? t.lp.fullAmt : t.lp.netAmt).toLocaleString('en-IN')}
                                      </span>
                                }
                                {' '}cash from LP
                            </span>
                        </div>

                        {sendLP && !inFull && !noEscrow && (
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">
                                Tap to settle full amount in cash
                            </p>
                        )}
                    </div>
                )}

                <p className="text-center text-[10px] text-gray-300 dark:text-slate-600 mt-2">
                    {hintText}
                </p>
            </div>
        </div>
    );
};

export default SwipeCard;
