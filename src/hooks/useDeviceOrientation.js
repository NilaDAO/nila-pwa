import { useState, useEffect } from 'react';

const useDeviceOrientation = () => {
  const [orientation, setOrientation] = useState({
    alpha: null,
    beta: null,
    gamma: null,
  });
  const [permissionGranted, setPermissionGranted] = useState(false);

  const requestPermission = () => {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            setPermissionGranted(true);
          }
        })
        .catch(console.error);
    } else {
      // handle regular non iOS 13+ devices
      setPermissionGranted(true);
    }
  };

  useEffect(() => {
    if (permissionGranted) {
      const handleOrientation = (event) => {
        setOrientation({
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma,
        });
      };

      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientation);
      } else {
        console.log('Device orientation not supported');
      }

      return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
      };
    }
  }, [permissionGranted]);

  return {
    orientation,
    requestPermission,
    permissionGranted
  };
};

export default useDeviceOrientation;