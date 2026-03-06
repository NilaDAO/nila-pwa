import { useCallback } from 'react';
import axios from 'axios';
import { useDataContext } from '../utils/NavigationContext';

const API = process.env.REACT_APP_API_BASE_URL;

const useInventoryCheck = (updateBillStatus) => {
  const { db } = useDataContext();
  const unionId = db?.union?.address;

  const checkSerial = useCallback(async (serialNumber) => {
    if (!unionId) return;

    if (!navigator.onLine) {
      updateBillStatus(serialNumber, 'pending');
      return;
    }

    try {
      const { data } = await axios.post(`${API}/inventory/check`, {
        serialNumber,
        unionId,
      });
      updateBillStatus(serialNumber, data.known ? 'known' : 'unknown');
    } catch (err) {
      console.error('Inventory check failed:', err);
      updateBillStatus(serialNumber, 'pending');
    }
  }, [unionId, updateBillStatus]);

  return { checkSerial };
};

export default useInventoryCheck;
