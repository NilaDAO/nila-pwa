import { useEffect, useCallback } from 'react';
import Maps from './staticMaps';
import { useDataContext } from '../../../utils/NavigationContext';
import { XCircleIcon } from '@heroicons/react/24/solid';
import { setMetaThemeColor } from '../../../utils/metaTheme';

const StaticMapNav = ({LAND, onFeatureClick}) => {
  const { fieldActivity, setFieldActivity } = useDataContext();
  const metadata = LAND?.current?.LAND?.metadata || LAND?.current?.metadata;

  useEffect(() => {
      setMetaThemeColor('#121212');
      return () => setMetaThemeColor('#121212');
    }, []);

  const handleClose = useCallback(() => {
    setFieldActivity(prev => prev ? { ...prev, viewmode: false } : prev);
  }, [setFieldActivity]);

  const hasSelection = fieldActivity?.selectMode &&
    (fieldActivity.features || []).some(f => f.properties?.selected);

  const handleConfirmSelection = useCallback(() => {
    setFieldActivity(prev => prev ? { ...prev, selectMode: false } : prev);
  }, [setFieldActivity]);

  return (
      <>
        {metadata && <Maps metadata={metadata} fieldActivity={fieldActivity} onFeatureClick={onFeatureClick}/>}
        {fieldActivity?.viewmode && !fieldActivity?.selectMode &&
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center w-full z-20">
           <div className="pointer-events-auto relative flex flex-col items-center justify-center">
            <XCircleIcon onClick={handleClose} className='h-20 w-20 text-white' />
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
  
