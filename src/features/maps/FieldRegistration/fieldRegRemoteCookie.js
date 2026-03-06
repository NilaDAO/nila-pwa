import { useFieldRegContext } from '../../../utils/FieldRegContext';

export const useHandleOffsiteTrackingCookie = () => {
    const { updateFieldReg } = useFieldRegContext();
  
    return () => {
      console.log("OFFSITE COOKIE SET");
      const date = new Date();
      date.setTime(date.getTime() + (1 * 24 * 60 * 60 * 1000));
      document.cookie = "offsite=1; expires=" + date.toUTCString() + "; path=/";
      updateFieldReg({ track: false, flow: 2, remote: true, messages: 20 });
    };
  };