import { useState, useRef, useCallback } from 'react';
import { useNavContext, useViewModeContext } from '../utils/NavigationContext';
import { useHardReload } from './useHardReload.js';

// swipe to close/open cards

const useTouch = () => {
    const MAX_PULL = 45;
    const startYRef = useRef(0);
    const [pullY, setPullY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const { navRef,tokenview,setTokenview,cardView,setCardView} = useViewModeContext()
    const {ix,setIx, setCardIx,prevIx} = useNavContext()
    const hardReload = useHardReload();

    const handleTouchStart = useCallback((e) => {
        startYRef.current = e.touches[0].clientY;
        setIsDragging(true);
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (!e.touches?.length) return;
        const delta = e.touches[0].clientY - startYRef.current;
        if (delta <= 0) {
            setPullY(prev => prev !== 0 ? 0 : prev);
            return;
        }
        setPullY(Math.min(MAX_PULL, Math.round(delta)));
    }, []);

    const handleTouchEnd = useCallback((e) => {
        const endY = e.changedTouches[0].clientY;
        const startY = startYRef.current;
        if (pullY >= MAX_PULL) {
            hardReload();
            setPullY(0);
            setIsDragging(false);
            return;
        }
        if (endY - startY > 25 && !tokenview) { // remove touch on views (funds/assets), that would make scroll very hard
            if (ix === 2 && cardView === 'default') {
                setCardView('mapview');
                setPullY(0);
                setIsDragging(false);
                return;
            }
            setIsCollapsed(true)
            setIx(null)
            setTokenview(false)
            setPullY(0);
            setIsDragging(false);
            return
        }
        if (startY - endY > 50) {
            setIsCollapsed(false)
        }
        setPullY(0);
        setIsDragging(false);
    }, [pullY, tokenview, cardView, ix, hardReload, setIx, setTokenview, setCardView]);

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
        handleCollapse,
        isCollapsed,
        pullY,
        isDragging,
    };
  };

export default useTouch
