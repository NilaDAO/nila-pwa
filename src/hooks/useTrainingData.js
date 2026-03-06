import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useDataContext } from '../utils/NavigationContext';

const API = process.env.REACT_APP_API_BASE_URL;
const DB_NAME = 'nilaTrainingData';
const STORE_NAME = 'captures';
const DB_VERSION = 1;

const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const addToStore = async (record) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getAllFromStore = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const deleteFromStore = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const countInStore = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const useTrainingData = () => {
  const { db } = useDataContext();
  const [pendingCount, setPendingCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await countInStore();
      setPendingCount(count);
    } catch { /* indexedDB unavailable */ }
  }, []);

  // refresh count on mount
  useEffect(() => { refreshCount(); }, [refreshCount]);

  // queue a captured bill image + labels into IndexedDB
  const queueCapture = useCallback(async (bill) => {
    // bill: { serialNumber, denomination, side, imageDataUrl }
    const record = {
      serialNumber: bill.serialNumber,
      denomination: bill.denomination,
      side: bill.side,
      imageDataUrl: bill.imageDataUrl,
      unionId: db?.union?.address || null,
      capturedAt: Date.now(),
    };
    try {
      await addToStore(record);
      await refreshCount();
    } catch (err) {
      console.error('Failed to queue training capture:', err);
    }
  }, [db?.union?.address, refreshCount]);

  // upload queued captures to backend one at a time
  const uploadPending = useCallback(async () => {
    if (uploadingRef.current || !navigator.onLine) return;
    uploadingRef.current = true;
    setIsUploading(true);

    try {
      const records = await getAllFromStore();
      for (const rec of records) {
        try {
          await axios.post(`${API}/training/capture`, {
            serialNumber: rec.serialNumber,
            denomination: rec.denomination,
            side: rec.side,
            imageDataUrl: rec.imageDataUrl,
            unionId: rec.unionId,
            capturedAt: rec.capturedAt,
          });
          await deleteFromStore(rec.id);
          await refreshCount();
        } catch (err) {
          console.error('Training upload failed for record', rec.id, err);
          break; // stop on first failure, retry later
        }
      }
    } catch (err) {
      console.error('Training upload batch failed:', err);
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  }, [refreshCount]);

  // auto-upload when coming online
  useEffect(() => {
    const handleOnline = () => uploadPending();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [uploadPending]);

  return { queueCapture, uploadPending, pendingCount, isUploading };
};

export default useTrainingData;
