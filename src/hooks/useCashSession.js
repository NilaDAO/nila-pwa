import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import {
  deriveSessionKey,
  persistSession,
  restoreSession,
  clearSessionStorage,
} from '../utils/cashCounterHelpers';

const MAX_BILLS = 20;
const EXPIRY_MS = 30 * 60 * 1000;

const useCashSession = () => {
  const { db } = useDataContext();
  const [mode, setMode] = useState('DEPOSIT');
  const [scannedBills, setScannedBills] = useState([]);
  const lastActivity = useRef(Date.now());
  const keyRef = useRef(null);

  // derive encryption key once
  useEffect(() => {
    if (db?.address) {
      keyRef.current = deriveSessionKey(db.address);
      const restored = restoreSession(keyRef.current);
      if (restored?.bills?.length) {
        setScannedBills(restored.bills);
        lastActivity.current = restored.lastActivity || Date.now();
      }
    }
  }, [db?.address]);

  // auto-expire check every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > EXPIRY_MS && scannedBills.length > 0) {
        setScannedBills([]);
        clearSessionStorage();
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [scannedBills.length]);

  const runningTotal = scannedBills.reduce((sum, b) => sum + b.denomination, 0);

  const addBill = useCallback((bill) => {
    // bill: { serialNumber, denomination, side, imageDataUrl }
    setScannedBills((prev) => {
      if (prev.length >= MAX_BILLS) return prev;
      if (prev.some((b) => b.serialNumber === bill.serialNumber)) return prev;
      // don't persist imageDataUrl to localStorage (too large for AES)
      const { imageDataUrl, ...rest } = bill;
      const next = [
        ...prev,
        {
          ...rest,
          timestamp: Date.now(),
          inventoryStatus: 'unchecked',
        },
      ];
      lastActivity.current = Date.now();
      if (keyRef.current) persistSession(next, keyRef.current);
      return next;
    });
  }, []);

  const updateBillStatus = useCallback((serialNumber, status) => {
    setScannedBills((prev) => {
      const next = prev.map((b) =>
        b.serialNumber === serialNumber ? { ...b, inventoryStatus: status } : b
      );
      if (keyRef.current) persistSession(next, keyRef.current);
      return next;
    });
  }, []);

  const removeBill = useCallback((serialNumber) => {
    setScannedBills((prev) => {
      const next = prev.filter((b) => b.serialNumber !== serialNumber);
      if (keyRef.current) persistSession(next, keyRef.current);
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setScannedBills([]);
    clearSessionStorage();
  }, []);

  return {
    mode,
    setMode,
    scannedBills,
    runningTotal,
    addBill,
    removeBill,
    updateBillStatus,
    clearSession,
  };
};

export default useCashSession;
