import { useState, useRef, useCallback } from 'react';
import { useNavContext, useViewModeContext, useDataContext, DEFAULT_VIEW } from '../utils/NavigationContext';

// swipe to close/open cards

const useTouch = () => {
    const startYRef = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const { navRef,tokenview,setTokenview,cardView,setCardView} = useViewModeContext()
    const {ix,setIx, setCardIx,prevIx} = useNavContext()
    const { setView } = useDataContext()

    const handleTouchStart = useCallback((e) => {
        startYRef.current = e.touches[0].clientY;
        setIsDragging(true);
    }, []);

    const handleTouchMove = useCallback(() => {
        // swipe gesture is evaluated on touch end — no per-move state
    }, []);

    const handleTouchEnd = useCallback((e) => {
        const endY = e.changedTouches[0].clientY;
        const startY = startYRef.current;
        if (endY - startY > 25 && !tokenview) { // remove touch on views (funds/assets), that would make scroll very hard
            if (ix === 2 && cardView === 'default') {
                setCardView('mapview');
                setIsDragging(false);
                return;
            }
            setIsCollapsed(true)
            setIx(null)
            setTokenview(false)
            setIsDragging(false);
            return
        }
        if (startY - endY > 50) {
            setIsCollapsed(false)
        }
        setIsDragging(false);
    }, [tokenview, cardView, ix, setIx, setTokenview, setCardView]);

    const handleToggleView = useCallback((index) => {
        // back to home
        if (index.ix === null || ix === index.ix) {
            setIx(null)
            setCardIx(null)
            setTokenview(false)
            setCardView('default')
            prevIx.current = null
            return
        }
        // set cardview: mapview for map, default for everything else
        if (index.ix === 2){
            setCardView('mapview')
        } else {
            setCardView('default')
        }
        if (index.i === 3){
            // shortcut to certificates
            navRef.current.assetTab = false
        }
        setIx(index.ix)
        setCardIx(index.hasOwnProperty('i') ? index.i : null)
        if (index.ix <= 3){
            prevIx.current = index
        }
    }, [ix, setIx, setCardIx, setTokenview, setCardView, navRef, prevIx]);

    // Plan 044 §5.4 — the one entry point. Every caller that opens the field
    // map (cultivation card, tab button, asset "view field") routes through
    // this so the view state + nav history are always consistent.
    const enterFieldView = useCallback(({ mode = 'overview', focus = null, focusZone = null, focusName = null, i = null } = {}) => {
        setView({ ...DEFAULT_VIEW, mode, focus, focusZone, focusName });
        setCardView('mapview');
        setIx(2);
        setCardIx(i);
        prevIx.current = { ix: 2, i };
    }, [setView, setCardView, setIx, setCardIx, prevIx]);

    const handleCollapse = useCallback((ix) => {
        if (ix === 5){
            setIx(null)
            setIsCollapsed(true)
            setTokenview(false)
            return;
        }
        setIx(null)
        setIsCollapsed(!isCollapsed)
        setTokenview(tokenview ? !tokenview : tokenview)
    }, [ix, isCollapsed, tokenview, setIx, setTokenview]);

    return {
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        handleToggleView,
        enterFieldView,
        handleCollapse,
        isCollapsed,
        isDragging,
    };
  };

export default useTouch
