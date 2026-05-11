/**
 * OrdersCard — union leader view of food token batches + crop pricing.
 *
 * Two sections:
 *   1. Active batch list — crop code, buyer, claimed/target qty, price, cultivation requirements
 *   2. Create new batch form (expandable)
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  useFoodTokenBatches,
  CROP_CODE_NAMES,
  CROP_VARIETIES,
  CROP_UNIT,
  FIELD_REQUIREMENTS,
  isBitSet,
  buildConditions,
  batchDisplayCode,
} from '../../hooks/useFoodTokenBatches.ts';
import { useUnionPrices, useSetUnionPrice } from '../../hooks/useUnionPrices.ts';
import { useContactBook } from '../../hooks/useContactBook';
import { useContract, useWallet } from '../../hooks/useWallet.ts';
import { useDataContext } from '../../utils/NavigationContext';
import { IndividualExchangeButton } from '../../components/UI/buttons.js';
import { cropColor } from '../../utils/cropColors.js';
import foodTokenArtifact from '../../components/ABI/FoodTokens.json';
import Spinner from '../../components/UI/spinner';

const foodTokenAbi = (foodTokenArtifact).abi ?? foodTokenArtifact;

const ONE_WEEK_S = 7 * 24 * 60 * 60;

const ALWAYS_REQUIRED = FIELD_REQUIREMENTS.filter(r => r.alwaysRequired);
const OPTIONAL_REQS   = FIELD_REQUIREMENTS.filter(r => !r.alwaysRequired);
const OPTIONAL_GROUPS  = [...new Set(OPTIONAL_REQS.map(r => r.group))];

// ── helpers ──────────────────────────────────────────────────────────────────
function kgDisplay(kg) {
  if (!kg && kg !== 0n) return '—';
  const n = Number(kg);
  return n >= 1000 ? `${(n / 1000).toFixed(1)}t` : `${n} kg`;
}

function dateDisplay(unix) {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── BatchRow ──────────────────────────────────────────────────────────────────
function BatchRow({ batch, localPriceData, onPriceChange, onArchive }) {
  const { tokenData } = useDataContext();
  const ninPrice = Number(tokenData?.find(t => t.sym === 'nIN')?.p ?? 1);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState('');
  const [showReqs, setShowReqs] = useState(false);
  const [dx, setDx]             = useState(0);
  const [confirming, setConfirming] = useState(false);
  const startX                  = useRef(null);
  const isDragging              = useRef(false);
  const canRemove               = batch.claimedQtyKg === 0n;
  const SWIPE_THRESHOLD         = 80;

  const onStart = (x) => { startX.current = x; isDragging.current = false; };
  const onMove  = (x) => {
    if (startX.current === null) return;
    const delta = x - startX.current;
    if (!isDragging.current && Math.abs(delta) < 8) return;
    isDragging.current = true;
    setDx(Math.max(0, Math.min(130, delta))); // right-only
  };
  const onEnd = () => {
    const triggered = dx > SWIPE_THRESHOLD;
    setDx(0);
    startX.current = null;
    isDragging.current = false;
    if (triggered) setConfirming(true);
  };

  const onTouchStart = (e) => onStart(e.touches[0].clientX);
  const onTouchMove  = (e) => onMove(e.touches[0].clientX);
  const onTouchEnd   = onEnd;

  const mouseDown = useRef(false);
  const onMouseDown = (e) => { mouseDown.current = true;  onStart(e.clientX); };
  const onMouseMove = (e) => { if (mouseDown.current) onMove(e.clientX); };
  const onMouseUp   = ()  => { mouseDown.current = false; onEnd(); };

  const removePct = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));

  const batchUnit   = CROP_UNIT[batch.cropCode] ?? { label: 'kg', toKg: 1 };
  // localPrice is stored per-kg internally; convert to per-unit for display/edit
  const localPricePerKg   = localPriceData?.price_inr_per_kg ?? null;
  const localPricePerUnit = localPricePerKg != null ? localPricePerKg * batchUnit.toKg : null;
  const now = Math.floor(Date.now() / 1000);
  const isOutdated = localPriceData?.updated_at != null && (now - localPriceData.updated_at) > ONE_WEEK_S;

  const filled = batch.targetQtyKg > 0n
    ? Math.min(1, Number(batch.claimedQtyKg) / Number(batch.targetQtyKg))
    : null;

  const priceDisplay = batch.hasOrder && batch.pricePerKgUsdt > 0n
    ? `${Math.round((Number(batch.pricePerKgUsdt) / 1e6 / ninPrice) * batchUnit.toKg).toLocaleString('en-IN')} nIN/${batchUnit.label}`
    : localPricePerUnit != null
      ? `${localPricePerUnit.toFixed(0)} nIN/${batchUnit.label}`
      : null;

  const dot = cropColor(batch.cropColorKey);

  const handleSave = () => {
    const v = parseFloat(draft);
    // draft is per-unit; save back as per-kg
    if (!isNaN(v) && v > 0) onPriceChange(batch.cropCode, v / batchUnit.toKg);
    setEditing(false);
  };

  const activeOptional = OPTIONAL_REQS.filter(r => isBitSet(batch.conditions, r.bit));
  const hasAnyReqs = batch.conditions > 0n;

  return (
    <div className="relative overflow-hidden border-b border-gray-100 dark:border-slate-700 last:border-0">

      {/* Confirm overlay — shown after swipe completes */}
      {confirming && (
        <div className="absolute inset-0 z-20 flex items-center px-4 gap-3 bg-white dark:bg-gray-800">
          {canRemove ? (
            <>
              <span className="text-xs text-gray-600 dark:text-slate-300 flex-1">Remove?</span>
              <button
                onClick={() => { setConfirming(false); onArchive?.(batch.id); }}
                className="px-3 py-1.5 rounded-lg border border-black dark:border-white font-bold text-xs text-blackt dark:text-white"
              >Yes</button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-xs text-gray-500 dark:text-slate-400"
              >Cancel</button>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-500 dark:text-slate-400 flex-1">Food assets minted — cannot remove</span>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-xs text-gray-500 dark:text-slate-400"
              >OK</button>
            </>
          )}
        </div>
      )}

      {/* Red tint revealed on swipe */}
      <div className="absolute inset-0 bg-red-500 pointer-events-none" style={{ opacity: removePct * 0.25 }} />

      {/* Label fixed on left */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ opacity: removePct }}>
        <span className={`font-bold text-xs ${canRemove ? 'text-red' : 'text-gray-400'}`}>
          {canRemove ? 'Remove' : 'Minted — locked'}
        </span>
      </div>

      {/* Row content — slides right on swipe */}
      <div
        className="py-3 touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: isDragging.current ? 'none' : 'transform 0.25s ease', willChange: 'transform' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
      {/* Row header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />
          <span className="font-semibold text-sm dark:text-white">{batch.cropName}</span>
          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">{batch.displayCode}</span>
          {batch.hasOrder && (
            <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
              Order
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {batch.hasOrder ? batch.buyerName : 'Open'}
        </span>
      </div>

      {/* Size bar — always shown; full width when no target (continuous programme) */}
      <div className="mb-1.5">
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">
          <span>{kgDisplay(batch.claimedQtyKg)} claimed</span>
          <span>{batch.targetQtyKg > 0n ? `of ${kgDisplay(batch.targetQtyKg)}` : 'continuous'}</span>
        </div>
        <div className="h-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: batch.targetQtyKg > 0n ? `${Math.round((filled ?? 0) * 100)}%` : '100%', background: dot }}
          />
        </div>
      </div>

      {/* Price + delivery */}
      <div className="flex items-center justify-between">
        <div>
          {!batch.hasOrder ? (
            editing ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-20 text-xs border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5 dark:bg-slate-800 dark:text-white"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                />
                <span className="text-xs text-gray-400 dark:text-slate-500">nIN/{batchUnit.label}</span>
                <button onClick={handleSave} className="text-xs text-blue-500 dark:text-blue-400 font-bold ml-1">Save</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setDraft(localPricePerUnit != null ? String(localPricePerUnit.toFixed(0)) : ''); setEditing(true); }}
                  className="text-xs text-gray-500 dark:text-slate-400 underline-offset-2 underline"
                >
                  {priceDisplay ?? 'Set local price →'}
                </button>
                {isOutdated && (
                  <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">outdated</span>
                )}
              </div>
            )
          ) : (
            <span className="text-xs text-gray-600 dark:text-slate-300">{priceDisplay ?? '—'}</span>
          )}
        </div>
        {batch.deliveryDate > 0 && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${dot}28`, color: dot }}
          >
            {dateDisplay(batch.deliveryDate)}
          </span>
        )}
      </div>

      {/* Cultivation requirements — immutable after batch creation */}
      {hasAnyReqs && (
        <div className="mt-2">
          <button
            className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500"
            onClick={() => setShowReqs(v => !v)}
          >
            <span>Cultivation requirements</span>
            <span className="text-[9px]">{showReqs ? '▲' : '▼'}</span>
          </button>
          {showReqs && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[...ALWAYS_REQUIRED, ...activeOptional].map(r => (
                <span
                  key={r.bit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  <button
                    type="button"
                    onClick={() => alert(`${r.label}\n\n${r.hard ? '🔒 Hard requirement' : '📋 Soft requirement (self-declared)'}\n${r.satellite ? '🛰 Uses satellite overflight data (Sentinel-2/S1)' : '📵 No satellite data'}\n\n${r.description}`)}
                    className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center shrink-0 opacity-70 hover:opacity-100 font-bold text-[9px] leading-none"
                    aria-label={`Info: ${r.label}`}
                  >
                    i
                  </button>
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      </div>{/* end row content */}
    </div>
  );
}

// ── CropSelect ────────────────────────────────────────────────────────────────
function CropSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedName = CROP_CODE_NAMES[value] ?? 'Select crop';

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 dark:bg-slate-800 dark:text-white flex items-center justify-between"
      >
        <span>{selectedName}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10z"/>
        </svg>
      </button>
      {open && (
        <ul className="absolute z-50 w-full mt-1 max-h-52 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 shadow-lg">
          {Object.entries(CROP_CODE_NAMES).map(([code, name]) => (
            <li
              key={code}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-white ${Number(code) === value ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}`}
              onMouseDown={() => { onChange(Number(code)); setOpen(false); }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── VarSelect ─────────────────────────────────────────────────────────────────
function VarSelect({ cropCode, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const varieties = CROP_VARIETIES[cropCode] ?? [{ code: 0, name: 'Any variety' }];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedName = varieties.find(v => v.code === value)?.name ?? 'Any variety';

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 dark:bg-slate-800 dark:text-white flex items-center justify-between"
      >
        <span>{selectedName}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10z"/>
        </svg>
      </button>
      {open && (
        <ul className="absolute z-50 w-full mt-1 max-h-52 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 shadow-lg">
          {varieties.map(v => (
            <li
              key={v.code}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-white ${v.code === value ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}`}
              onMouseDown={() => { onChange(v.code); setOpen(false); }}
            >
              {v.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ContactSelect ─────────────────────────────────────────────────────────────
function ContactSelect({ value, onChange, unionAddr }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { contactList } = useContactBook({ enabled: false });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = useMemo(() => {
    const list = contactList.filter(c => c.address && c.address !== '0x0000000000000000000000000000000000000000');
    // ensure union is always first
    const unionEntry = list.find(c => c.address?.toLowerCase() === unionAddr?.toLowerCase());
    const rest = list.filter(c => c.address?.toLowerCase() !== unionAddr?.toLowerCase());
    return unionEntry ? [unionEntry, ...rest] : list;
  }, [contactList, unionAddr]);

  const selectedName = options.find(c => c.address?.toLowerCase() === value?.toLowerCase())?.name
    ?? (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Select drop-off point');

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 dark:bg-slate-800 dark:text-white flex items-center justify-between"
      >
        <span className="truncate">{selectedName}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0 ml-2" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10z"/>
        </svg>
      </button>
      {open && (
        <ul className="absolute z-50 w-full mt-1 max-h-52 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 shadow-lg">
          {options.map(c => (
            <li
              key={c.address}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-white ${c.address?.toLowerCase() === value?.toLowerCase() ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}`}
              onMouseDown={() => { onChange(c.address); setOpen(false); }}
            >
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                {c.address.slice(0, 6)}…{c.address.slice(-4)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── RequirementsDropdown ──────────────────────────────────────────────────────
function RequirementsDropdown({ selected, onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = (bit) => {
    const next = new Set(selected);
    next.has(bit) ? next.delete(bit) : next.add(bit);
    onChange([...next]);
  };

  const remove = (bit) => onChange(selected.filter(b => b !== bit));

  const selectedReqs = OPTIONAL_REQS.filter(r => selected.includes(r.bit));

  return (
    <div className="space-y-3">
      <label className="text-xs text-gray-500 dark:text-slate-400 block">
        Cultivation requirements
      </label>

      {/* All active requirement pills: always-required + selected optionals */}
      <div className="flex flex-wrap gap-2">
        {ALWAYS_REQUIRED.map(r => (
          <span
            key={r.bit}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-[10px] font-medium bg-green text-gray-700 dark:bg-amber-900 dark:text-amber-300"
          >
            {r.label}
          </span>
        ))}
        {selectedReqs.map(r => (
          <span
            key={r.bit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium bg-green text-gray-700 dark:bg-amber-900 dark:text-amber-300"
          >
            <button
              type="button"
              onClick={() => alert(`${r.label}\n\n${r.hard ? '🔒 Hard requirement' : '📋 Soft requirement (self-declared)'}\n${r.satellite ? '🛰 Uses satellite overflight data (Sentinel-2/S1)' : '📵 No satellite data'}\n\n${r.description}`)}
              className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center shrink-0 opacity-70 hover:opacity-100 font-bold text-[9px] leading-none"
              aria-label={`Info: ${r.label}`}
            >
              i
            </button>
            {r.label}
            <button
              type="button"
              onClick={() => remove(r.bit)}
              className="leading-none opacity-60 hover:opacity-100 font-bold"
              aria-label={`Remove ${r.label}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Add a requirement dropdown */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 dark:bg-slate-800 dark:text-white text-left"
      >
        <span className="text-gray-500 dark:text-slate-400">Add a requirement…</span>
        <span className="text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
          {OPTIONAL_GROUPS.map(group => (
            <div key={group}>
              <div className="px-2 py-1 bg-gray-50 dark:bg-slate-700 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide sticky top-0">
                {group}
              </div>
              {OPTIONAL_REQS.filter(r => r.group === group).map(r => (
                <label
                  key={r.bit}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(r.bit)}
                    onChange={() => toggle(r.bit)}
                    className="accent-amber-500 flex-shrink-0"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CreateForm ────────────────────────────────────────────────────────────────
function CreateForm({ unionAddr, onCreated, onClose }) {
  const { wallet } = useWallet();
  const { db, tokenData } = useDataContext();
  const { contactList } = useContactBook({ enabled: false });
  const foodTokenAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;
  const foodToken = useContract(foodTokenAddr, foodTokenAbi, wallet);

  const [cropCode, setCropCode]         = useState(0);
  const [varietyCode, setVarietyCode]   = useState(0);
  const unit = CROP_UNIT[cropCode] ?? { label: 'kg', toKg: 1 };
  const handleCropChange = (code) => { setCropCode(code); setVarietyCode(0); setTargetKg(''); setPriceUsdt(''); };

  const [buyer, setBuyer]               = useState('');
  const [dropOff, setDropOff]           = useState(unionAddr ?? '');
  const [targetKg, setTargetKg]         = useState('');
  const [delivery, setDelivery]         = useState('');
  const [priceUsdt, setPriceUsdt]       = useState('');
  const [optionalBits, setOptionalBits] = useState([]);
  const [buyerInfoDismissed, setBuyerInfoDismissed] = useState(false);
  const ninPrice        = Number(tokenData?.find(t => t.sym === 'nIN')?.p ?? 1);
  const collateralPrefill = priceUsdt && targetKg
    ? Math.round(Number(priceUsdt) * Number(targetKg) * 0.20)
    : 0;
  const [depositNin, setDepositNin]     = useState(0);
  const [review, setReview]             = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState('');

  const preview      = batchDisplayCode(cropCode, varietyCode);
  const cropName     = CROP_CODE_NAMES[cropCode] ?? `Crop ${cropCode}`;
  const varietyName  = (CROP_VARIETIES[cropCode] ?? []).find(v => v.code === varietyCode)?.name ?? 'Any variety';
  const dropOffName  = contactList.find(c => c.address?.toLowerCase() === dropOff?.toLowerCase())?.name
                       ?? (dropOff ? `${dropOff.slice(0,6)}…${dropOff.slice(-4)}` : 'Union');
  const unionName    = db?.union?.name ?? 'the Union';
  const selectedReqs = OPTIONAL_REQS.filter(r => optionalBits.includes(r.bit));

  const handleConfirm = async () => {
    if (!foodToken || !wallet?.address) return;
    setErr('');
    setBusy(true);
    try {
      const { ethers } = await import('ethers');
      const callerAsUnion = wallet.address;
      const buyerAddr   = buyer.trim() || ethers.ZeroAddress;
      const targetQtyKg = targetKg ? BigInt(Math.round(Number(targetKg) * unit.toKg)) : 0n;
      const deliveryTs  = delivery ? Math.floor(new Date(delivery).getTime() / 1000) : 0;
      const priceWei    = priceUsdt ? BigInt(Math.round(Number(priceUsdt) * ninPrice * 1e6)) : 0n;
      const conditions  = buildConditions(optionalBits);

      const tx = await foodToken.createBatch(
        callerAsUnion, cropCode, varietyCode, buyerAddr,
        targetQtyKg, deliveryTs, priceWei, conditions,
      );
      await tx.wait();
      onCreated?.();
    } catch (e) {
      setErr(e?.reason ?? e?.message ?? 'Transaction failed');
      setReview(false);
    } finally {
      setBusy(false);
    }
  };

  // ── Review screen ────────────────────────────────────────────────────────────
  if (review) {
    return (
      <div className="pt-4 space-y-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
          Confirm batch
        </p>

        <div className="space-y-2 text-xs">
          <Row label="Crop"       value={`${cropName} · ${varietyName}`} />
          <Row label="Batch code" value={<span>{preview}</span>} />
          <Row label="Drop-off"   value={dropOffName} />
          {buyer.trim() && <Row label="Buyer" value={`${buyer.slice(0,6)}…${buyer.slice(-4)}`} mono />}
          {!buyer.trim() && <Row label="Programme" value="Open" />}
          {targetKg && <Row label={`Target`} value={`${targetKg} ${unit.label}`} />}
          {delivery  && <Row label="Delivery" value={new Date(delivery).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} />}
          {priceUsdt && <Row label={`Price / ${unit.label}`} value={`${Number(priceUsdt).toLocaleString('en-IN')} nIN`} />}
        </div>

        {(ALWAYS_REQUIRED.length > 0 || selectedReqs.length > 0) && (
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-1.5">Requirements</p>
            <div className="flex flex-wrap gap-1.5">
              {ALWAYS_REQUIRED.map(r => (
                <span key={r.bit} className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                  {r.label}
                </span>
              ))}
              {selectedReqs.map(r => (
                <span key={r.bit} className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {targetKg && delivery && (() => {
          const ninBalance = Number(tokenData?.find(t => t.sym === 'nIN')?.bal ?? 0);
          return (
          <div className="flex flex-col w-auto max-w-[95vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full my-2">
            <p className="font-bold text-left dark:text-white text-sm mt-12">Deposit Collateral</p>
            <p className="text-left dark:text-slate-400 text-xs">
              Balance: {Math.max(0, ninBalance - depositNin).toLocaleString('en-IN')} nIN
            </p>
            <div className="flex flex-row justify-evenly my-6">
              <p className="flex font-bold text-3xl whitespace-nowrap items-center dark:text-white px-4">
                {depositNin.toLocaleString('en-IN')} nIN
              </p>
              <div className="flex flex-row">
                <IndividualExchangeButton
                  disabled_add={depositNin >= ninBalance}
                  disabled_remove={depositNin <= 0}
                  handleTx={(type) => setDepositNin(prev => Math.max(0, Math.min(ninBalance, type === 0 ? prev + 100 : prev - 100)))}
                  texts={{ plus: 'add', minus: 'remove' }}
                />
                <p
                  className={`flex text-sm items-end px-1 dark:text-white ${depositNin === collateralPrefill && 'opacity-40'}`}
                  onClick={() => setDepositNin(collateralPrefill)}
                >reset</p>
              </div>
            </div>
          </div>
          );
        })()}

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { setReview(false); setErr(''); }}
            disabled={busy}
            className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-slate-600 text-sm text-gray-600 dark:text-slate-300 disabled:opacity-40"
          >
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !foodToken || (targetKg && delivery && depositNin <= 0)}
            className="flex-1 py-2 rounded-xl bg-amber-500 dark:bg-amber-600 text-white text-sm font-bold disabled:opacity-40"
          >
            {busy ? 'Creating…' : (targetKg && delivery ? 'Deposit & Confirm' : 'Confirm')}
          </button>
        </div>
      </div>
    );
  }

  // ── Form screen ──────────────────────────────────────────────────────────────
  return (
    <div className="pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
          New batch
        </p>
        <button onClick={onClose} className="text-gray-400 dark:text-slate-500 active:scale-90" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div>
        <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Crop</label>
        <CropSelect value={cropCode} onChange={handleCropChange} />
      </div>

      <div>
        <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Variety</label>
        <VarSelect cropCode={cropCode} value={varietyCode} onChange={setVarietyCode} />
      </div>

      <p className="text-[10px] text-gray-400 dark:text-slate-500 font-mono -mt-1">
        Batch code: <span className="text-gray-600 dark:text-slate-300">{preview}</span>
      </p>

      <div>
        <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Drop-off point</label>
        <ContactSelect value={dropOff} onChange={setDropOff} unionAddr={unionAddr} />
      </div>

      {!buyer.trim() && !buyerInfoDismissed && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-green/80 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-gray-800 dark:text-amber-300 space-y-1.5">
          <ul className="space-y-1 list-none">
            <li>Only fill in the target and delivery if <span className="font-semibold">{unionName}</span> is responsible for the entire batch, including collection, quality control and any post-harvest activities. <b>Otherwise, leave black.</b></li>
          </ul>
          <button
            type="button"
            onClick={() => { setBuyerInfoDismissed(true); setTargetKg(''); setDelivery(''); }}
            className="text-black dark:text-amber-400 underline text-[10px] mt-0.5"
          >
            Got it, leave blank
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Target ({unit.label})</label>
          <input
            type="number" placeholder="optional"
            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:text-white"
            value={targetKg} onChange={e => setTargetKg(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Delivery date</label>
          <input
            type="date"
            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:text-white"
            value={delivery} onChange={e => setDelivery(e.target.value)}
          />
        </div>
      </div>

      {targetKg && delivery && (
        <div>
          <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">
            Price / {unit.label} (nIN) <span className="text-red-400">*</span>
          </label>
          <input
            type="number" placeholder="e.g. 25.00" step="0.01"
            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:text-white"
            value={priceUsdt} onChange={e => setPriceUsdt(e.target.value)}
          />
        </div>
      )}

      <RequirementsDropdown selected={optionalBits} onChange={setOptionalBits} />

      <button
        onClick={() => { setDepositNin(collateralPrefill); setReview(true); }}
        disabled={!foodToken || (targetKg && delivery && !priceUsdt)}
        className="w-full py-2 rounded-xl bg-green dark:bg-amber-600 text-black dark:text-white text-sm font-bold disabled:opacity-40"
      >
        {targetKg && delivery ? 'Deposit Collateral →' : 'Review batch →'}
      </button>
    </div>
  );
}

// ── Row helper for review screen ──────────────────────────────────────────────
function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-slate-700 last:border-0">
      <span className="text-gray-400 dark:text-slate-500 shrink-0">{label}</span>
      <span className={`text-right dark:text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

// ── OrdersCard (main) ─────────────────────────────────────────────────────────
export default function OrdersCard({ unionAddr }) {
  const [showCreate, setShowCreate] = useState(false);
  const { wallet } = useWallet();
  const foodTokenAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;
  const foodToken = useContract(foodTokenAddr, foodTokenAbi, wallet);

  const { data: batchSummary, isLoading, refetch } = useFoodTokenBatches(unionAddr);
  const { data: prices = [] } = useUnionPrices(unionAddr);
  const { mutate: setPrice }  = useSetUnionPrice(unionAddr);
  const active                = batchSummary?.active ?? [];

  const handleArchive = async (batchId) => {
    if (!foodToken) return;
    try {
      const tx = await foodToken.archiveBatch(batchId);
      await tx.wait();
      refetch();
    } catch (e) {
      console.error('archiveBatch failed:', e?.reason ?? e?.message);
    }
  };

  const localPriceMap = useMemo(() => {
    const m = {};
    for (const p of prices) m[p.crop_code] = p;
    return m;
  }, [prices]);

  return (
    <div className="flex flex-col w-full mb-[220px] my-6 bg-white dark:bg-gray-800 rounded-3xl shadow-bottom overflow-hidden">
      <div className="px-6 pt-6 pb-2">
        <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">
          Manage buy orders, delivery dates and set local prices.
        </p>
      </div>

      <div className="px-6">
        {!showCreate && (
          isLoading ? (
            <div className="flex justify-center py-8"><Spinner size="small" /></div>
          ) : active.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-6 text-center">
              No active batches. Create one below.
            </p>
          ) : (
            <div>
              {active.map(batch => (
                <BatchRow
                  key={batch.id}
                  batch={batch}
                  localPriceData={localPriceMap[batch.cropCode] ?? null}
                  onPriceChange={(code, price) => setPrice({ crop_code: code, price_inr_per_kg: price })}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )
        )}

        <div className="py-4">
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-2 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 text-sm text-gray-500 dark:text-slate-400 font-medium"
            >
              + New batch
            </button>
          )}
          {showCreate && (
            <CreateForm
              unionAddr={unionAddr}
              onCreated={() => { setShowCreate(false); refetch(); }}
              onClose={() => setShowCreate(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
