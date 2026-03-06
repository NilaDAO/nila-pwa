import { useEffect, useCallback } from 'react';
import Maps from './staticMaps';
import { useDataContext } from '../../../utils/NavigationContext';
import { XCircleIcon } from '@heroicons/react/24/solid';
import { setMetaThemeColor } from '../../../utils/metaTheme';

const StaticMapNav = ({LAND, onFeatureClick}) => {
  const { fieldActivity, setFieldActivity, db } = useDataContext();
  const metadata = LAND?.current?.LAND?.metadata || LAND?.current?.metadata;

  useEffect(() => {
      setMetaThemeColor('#121212');
      return () => setMetaThemeColor('#121212');
    }, []);

  const handleClose = useCallback(() => {
    const cached = db?.reloadActivity?.act;
    if (cached) {
      setFieldActivity({ ...cached, viewmode: false });
    } else {
      setFieldActivity(prev => prev ? { ...prev, viewmode: false } : prev);
    }
  }, [db, setFieldActivity]);

  return (
      <>
        {metadata && <Maps metadata={metadata} fieldActivity={fieldActivity} onFeatureClick={onFeatureClick}/>}
        {fieldActivity?.viewmode &&
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center w-full z-20">
           <div className="pointer-events-auto relative flex flex-col items-center justify-center">
            <XCircleIcon onClick={handleClose} className='h-20 w-20 text-white' />
           </div>
        </div>
        }
      </>
    )
  }

export default StaticMapNav
  
