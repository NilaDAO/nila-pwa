import { useState, useCallback } from 'react';

/**
 * Tracks physical INR cash received from LPs that is sitting at the union
 * but not yet disbursed to a borrower.
 *
 * Storage: localStorage keyed by union address.
 * Each entry = { orderId (string), amount (number, ₹), ts (epoch ms) }
 *
 * - addCash(orderId, amount)   → LP delivered cash, union confirmed
 * - consumeCash(amount)        → cash-out used some/all LP cash
 * - clearAll()                 → manual reset
 */
const STORAGE_KEY = (union) => `lp_cash_on_hand_${union?.toLowerCase()}`;

function readEntries(union) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(union));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function writeEntries(union, entries) {
  try {
    localStorage.setItem(STORAGE_KEY(union), JSON.stringify(entries));
  } catch { /* quota */ }
}

export function useLPCashOnHand(unionAddr) {
  const [entries, setEntries] = useState(() => readEntries(unionAddr));

  const total = entries.reduce((s, e) => s + e.amount, 0);

  const addCash = useCallback((orderId, amount) => {
    setEntries((prev) => {
      // deduplicate by orderId
      if (prev.some((e) => e.orderId === String(orderId))) return prev;
      const next = [...prev, { orderId: String(orderId), amount, ts: Date.now() }];
      writeEntries(unionAddr, next);
      return next;
    });
  }, [unionAddr]);

  const consumeCash = useCallback((amount) => {
    setEntries((prev) => {
      let remaining = amount;
      const next = [];
      for (const e of prev) {
        if (remaining <= 0) { next.push(e); continue; }
        if (e.amount <= remaining) {
          remaining -= e.amount;
          // consumed entirely
        } else {
          next.push({ ...e, amount: e.amount - remaining });
          remaining = 0;
        }
      }
      writeEntries(unionAddr, next);
      return next;
    });
  }, [unionAddr]);

  const clearAll = useCallback(() => {
    writeEntries(unionAddr, []);
    setEntries([]);
  }, [unionAddr]);

  return { entries, total, addCash, consumeCash, clearAll };
}
