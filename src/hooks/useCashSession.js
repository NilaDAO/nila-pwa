import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import {
  deriveSessionKey,
  persistSession,
  restoreSession,
  clearSessionStorage,
} from '../utils/cashCounterHelpers';

const EXPIRY_MS = 30 * 60 * 1000;

/**
 * scanGroups: one entry per scan session (one bulk photo or one single-scan run).
 * Each group has:
 *   { id, type: 'bulk'|'single', bills: [{serialNumber, denomination, ...}],
 *     total, label, confidence, timestamp }
 *
 * scannedBills: flat array derived from all groups (for backwards compat with swap logic).
 */

function buildGroupLabel(bills) {
  // Summarise denomination breakdown: "₹500 × 3  ₹100 × 2"
  const counts = {};
  for (const b of bills) {
    counts[b.denomination] = (counts[b.denomination] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([d, c]) => `₹${Number(d).toLocaleString('en-IN')} × ${c}`)
    .join('  ');
}

const useCashSession = () => {
  const { db } = useDataContext();
  const [mode, setMode] = useState('DEPOSIT');
  const [scanGroups, setScanGroups] = useState([]);
  const lastActivity = useRef(Date.now());
  const keyRef = useRef(null);

  // derive encryption key once; restore from localStorage
  useEffect(() => {
    if (db?.address) {
      keyRef.current = deriveSessionKey(db.address);
      const restored = restoreSession(keyRef.current);
      if (restored?.bills?.groups?.length) {
        setScanGroups(restored.bills.groups);
        lastActivity.current = restored.lastActivity || Date.now();
      }
    }
  }, [db?.address]);

  // auto-expire every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > EXPIRY_MS && scanGroups.length > 0) {
        setScanGroups([]);
        clearSessionStorage();
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [scanGroups.length]);

  // ── derived flat list ──────────────────────────────────────────────────
  const scannedBills = scanGroups.flatMap(g => g.bills);
  const runningTotal = scannedBills.reduce((sum, b) => sum + Number(b.denomination), 0);

  // ── persist helper ─────────────────────────────────────────────────────
  const persist = useCallback((groups) => {
    lastActivity.current = Date.now();
    if (keyRef.current) persistSession({ groups, lastActivity: lastActivity.current }, keyRef.current);
  }, []);

  // ── add a single bill (creates or appends to a 'single' group) ─────────
  const addBill = useCallback((bill) => {
    setScanGroups((prev) => {
      // Dedup by serialNumber across all groups
      const allSerials = prev.flatMap(g => g.bills.map(b => b.serialNumber));
      if (allSerials.includes(bill.serialNumber)) return prev;

      const { imageDataUrl, ...rest } = bill;
      const billEntry = { ...rest, timestamp: Date.now(), inventoryStatus: 'unchecked' };

      // Find an open single group (last group if it is type 'single')
      const last = prev[prev.length - 1];
      let next;
      if (last?.type === 'single') {
        const updatedGroup = {
          ...last,
          bills: [...last.bills, billEntry],
          total: last.total + Number(bill.denomination),
          label: buildGroupLabel([...last.bills, billEntry]),
        };
        next = [...prev.slice(0, -1), updatedGroup];
      } else {
        const newGroup = {
          id: `single_${Date.now()}`,
          type: 'single',
          bills: [billEntry],
          total: Number(bill.denomination),
          label: buildGroupLabel([billEntry]),
          confidence: null,
          timestamp: Date.now(),
        };
        next = [...prev, newGroup];
      }
      persist(next);
      return next;
    });
  }, [persist]);

  // ── add a bulk scan result as its own group ────────────────────────────
  const addBulkGroup = useCallback(({ items: rawItems, s3Key, confidence, reasoning }) => {
    setScanGroups((prev) => {
      const entries = [];
      for (const { denomination, type, count } of rawItems) {
        for (let i = 0; i < count; i++) {
          entries.push({
            serialNumber: `bulk_${denomination}_${type || 'note'}_${Date.now()}_${i}`,
            denomination,
            type: type || 'note',
            side: 'front',
            timestamp: Date.now(),
            inventoryStatus: 'unchecked',
            llmScanned: true,
          });
        }
      }
      if (!entries.length) return prev;
      const group = {
        id: `bulk_${Date.now()}`,
        type: 'bulk',
        bills: entries,
        total: entries.reduce((s, b) => s + Number(b.denomination), 0),
        label: buildGroupLabel(entries),
        confidence: confidence ?? null,
        reasoning: reasoning ?? null,
        s3Key: s3Key ?? null,
        timestamp: Date.now(),
      };
      const next = [...prev, group];
      persist(next);
      return next;
    });
  }, [persist]);

  // ── remove an entire scan group ────────────────────────────────────────
  const removeScanGroup = useCallback((groupId) => {
    setScanGroups((prev) => {
      const next = prev.filter(g => g.id !== groupId);
      persist(next);
      return next;
    });
  }, [persist]);

  // ── remove a single bill by serialNumber ──────────────────────────────
  const removeBill = useCallback((serialNumber) => {
    setScanGroups((prev) => {
      const next = prev
        .map(g => ({
          ...g,
          bills: g.bills.filter(b => b.serialNumber !== serialNumber),
        }))
        .filter(g => g.bills.length > 0)
        .map(g => ({ ...g, total: g.bills.reduce((s, b) => s + b.denomination, 0), label: buildGroupLabel(g.bills) }));
      persist(next);
      return next;
    });
  }, [persist]);

  const updateBillStatus = useCallback((serialNumber, status) => {
    setScanGroups((prev) => {
      const next = prev.map(g => ({
        ...g,
        bills: g.bills.map(b => b.serialNumber === serialNumber ? { ...b, inventoryStatus: status } : b),
      }));
      persist(next);
      return next;
    });
  }, [persist]);

  const clearSession = useCallback(() => {
    setScanGroups([]);
    clearSessionStorage();
  }, []);

  // ── legacy addBulkResult (kept for backwards compat) ───────────────────
  const addBulkResult = useCallback((items) => {
    addBulkGroup({ items });
  }, [addBulkGroup]);

  return {
    mode,
    setMode,
    scanGroups,
    scannedBills,
    runningTotal,
    addBill,
    addBulkGroup,
    addBulkResult,
    removeScanGroup,
    removeBill,
    updateBillStatus,
    clearSession,
  };
};

export default useCashSession;
