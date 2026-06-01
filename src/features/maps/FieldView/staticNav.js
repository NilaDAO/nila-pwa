import { useEffect, useCallback } from 'react';
import Maps from './staticMaps';
import { useDataContext, useViewModeContext } from '../../../utils/NavigationContext';
import { XCircleIcon } from '@heroicons/react/24/solid';
import { setMetaThemeColor } from '../../../utils/metaTheme';

const StaticMapNav = ({LAND, onFeatureClick}) => {
  const { fieldActivity, setFieldActivity } = useDataContext();
  const { setCardView } = useViewModeContext();
  const metadata = LAND?.current?.LAND?.metadata || LAND?.current?.metadata;

  useEffect(() => {
      setMetaThemeColor('#121212');
      return () => setMetaThemeColor('#121212');
    }, []);

  const handleClose = useCallback(() => {
    // Reset: restore the full feature set (saved before filtering), keep the
    // card panned down to mapview, and bump a counter so the map re-fits to
    // the parcel.
    setFieldActivity(prev => {
      if (!prev) return prev;
      const restored = prev._featuresBefore;
      const restoreFeatures = prev._featuresBefore ?? prev._selectBeforeFeatures;
      const next = {
        ...prev,
        viewmode: false,
        selectMode: false,
        selectedZoneId: null,
        selectedFieldName: null,
        // only refit when actually restoring a zone-click snapshot
        ...(restoreFeatures?.length ? { mapRefitNonce: (prev.mapRefitNonce ?? 0) + 1 } : {}),
      };
      if (restoreFeatures?.length) {
        next.features = restoreFeatures;
        next.geojson = { type: 'FeatureCollection', features: restoreFeatures };
        next.featurelength = restoreFeatures.length;
        delete next._featuresBefore;
        delete next._selectBeforeFeatures;
      }
      return next;
    });
    setCardView('mapview');
  }, [setFieldActivity, setCardView]);

  // Portfolio mode: clear selected property (go back to list), re-fit map to all
  const handlePortfolioBack = useCallback(() => {
    setFieldActivity(prev => prev ? { ...prev, portfolioSelected: null } : prev);
  }, [setFieldActivity]);

  const hasSelection = fieldActivity?.selectMode &&
    (fieldActivity.features || []).some(f => f.properties?.selected);

  const handleConfirmSelection = useCallback(() => {
    setFieldActivity(prev => {
      if (!prev) return prev;
      const restored = prev._selectBeforeFeatures;
      const next = { ...prev, selectMode: false };
      if (restored?.length) {
        next.features = restored;
        next.geojson = { type: 'FeatureCollection', features: restored };
        next.featurelength = restored.length;
        delete next._selectBeforeFeatures;
      }
      return next;
    });
  }, [setFieldActivity]);

  return (
      <>
        {(metadata || fieldActivity?.portfolioMode) && <Maps metadata={metadata} fieldActivity={fieldActivity} onFeatureClick={onFeatureClick}/>}
        {fieldActivity?.viewmode && !fieldActivity?.selectMode &&
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center w-full z-20">
           <div className="pointer-events-auto relative flex flex-col items-center justify-center">
            <XCircleIcon onClick={handleClose} className='h-20 w-20 text-white' />
           </div>
        </div>
        }
        {fieldActivity?.portfolioMode && fieldActivity?.portfolioSelected &&
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
  
