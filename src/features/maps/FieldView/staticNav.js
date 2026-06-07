import { useEffect, useCallback } from 'react';
import Maps from './staticMaps';
import { useDataContext, useViewModeContext } from '../../../utils/NavigationContext';
import { XCircleIcon } from '@heroicons/react/24/solid';
import { setMetaThemeColor } from '../../../utils/metaTheme';

const StaticMapNav = ({LAND, onFeatureClick, cardShrink = 0}) => {
  const { fieldActivity, setFieldActivity, view, setView } = useDataContext();
  const { setCardView } = useViewModeContext();
  const metadata = LAND?.current?.LAND?.metadata || LAND?.current?.metadata;
  const hideOverlay = cardShrink > 0 || !!fieldActivity?.cardLifted;

  useEffect(() => {
      setMetaThemeColor('#121212');
      return () => setMetaThemeColor('#121212');
    }, []);

  // Plan 044 §5.2 — "back" is just view.mode = 'overview'. The features
  // recompute via featuresFor; there is no snapshot to restore.
  const handleClose = useCallback(() => {
    setView(prev => ({ ...prev, mode: 'overview', focus: null, focusZone: null, focusName: null, selected: [] }));
    setCardView('mapview');
  }, [setView, setCardView]);

  // Portfolio mode: clear selected property (go back to list), re-fit map to all
  const handlePortfolioBack = useCallback(() => {
    setFieldActivity(prev => prev ? { ...prev, portfolioSelected: null } : prev);
  }, [setFieldActivity]);

  const hasSelection = view?.mode === 'select' && (view?.selected?.length ?? 0) > 0;

  const handleConfirmSelection = useCallback(() => {
    // Selection is consumed by the join-batch form (form.selectedClusters);
    // leaving select mode is just a view change.
    setView(prev => ({ ...prev, mode: 'overview' }));
  }, [setView]);

  return (
      <>
        {(metadata || fieldActivity?.portfolioMode) && <Maps metadata={metadata} fieldActivity={fieldActivity} onFeatureClick={onFeatureClick}/>}
        {view?.mode === 'zone' && !hideOverlay &&
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center w-full z-20">
           <div className="pointer-events-auto relative flex flex-col items-center justify-center">
            <XCircleIcon onClick={handleClose} className='h-20 w-20 text-white' />
           </div>
        </div>
        }
        {fieldActivity?.portfolioMode && fieldActivity?.portfolioSelected && !hideOverlay &&
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center w-full z-20">
          <div className="pointer-events-auto relative flex flex-col items-center justify-center">
            <XCircleIcon onClick={handlePortfolioBack} className='h-20 w-20 text-white' />
          </div>
        </div>
        }
        {hasSelection && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0">
            <button
              onClick={handleConfirmSelection}
              className="pointer-events-auto px-6 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-gray-800 text-sm font-bold active:scale-95 shadow-lg"
            >
              Confirm selection
            </button>
          </div>
        )}
      </>
    )
  }

export default StaticMapNav
  
