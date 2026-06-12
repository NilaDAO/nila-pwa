/**
 * OrdersCard — union leader view of food token batches + crop pricing.
 *
 * Two sections:
 *   1. Active batch list — crop code, buyer, claimed/target qty, price, cultivation requirements
 *   2. Create new batch form (expandable)
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import {
  useFoodTokenBatches,
  CROP_CODE_NAMES,
  CROP_VARIETIES,
  CROP_UNIT,
  batchDisplayCode,
} from '../../hooks/useFoodTokenBatches.ts';
import { useUnionPrices } from '../../hooks/useUnionPrices.ts';
import { useUnionCertCounts } from '../../hooks/useUnionCertCounts.ts';
import { useContactBook } from '../../hooks/useContactBook';
import { useContract, useWallet } from '../../hooks/useWallet.ts';
import { useTx } from '../../hooks/useTx.ts';
import { useDataContext } from '../../utils/NavigationContext';
import { IndividualExchangeButton } from '../../components/UI/buttons.js';
import { cropColor, cropIconUrl } from '../../utils/cropColors.js';
import foodTokenArtifact from '../../components/ABI/FoodTokens.json';
import Spinner from '../../components/UI/spinner';

const foodTokenAbi = (foodTokenArtifact).abi ?? foodTokenArtifact;

const ONE_WEEK_S = 7 * 24 * 60 * 60;


const CERT_NAMES  = ['Fair Pay', 'Farm Identity', 'Soil & Water Care', 'Chemical Free', 'Clean Harvest'];
const CERT_IMAGES = ['/images/label-01.webp', '/images/label-04.webp', '/images/label-02.webp', '/images/label-03.webp', '/images/label-05.webp'];

const CERT_INFO = [
  {
    description: 'Confirms the farmer receives fair remuneration, works in safe conditions, and has a voice in shaping the unions policies and governance.',
    local: null,
    export: 'Fair-trade claims on EU and UK packaging. Satisfies CSDDD supply-chain due diligence and CSRD worker-welfare reporting.',
  },
  {
    description: 'Proves the crop originates from a registered geographical area on legal land, with batch segregation maintained from field to buyer.',
    local: null,
    export: 'Geographical indication (GI) claims under the GI Act and EU PDO/PGI rules. Unlocks regional premium pricing.',
  },
  {
    description: 'Confirms no deforestation, no open burning, active soil restoration, efficient water use, and maintained biodiversity. Core requirements are satellite-verified.',
    local: null,
    export: 'EUDR compliance (Dec 2026) and "sustainably sourced" or "regeneratively grown" claims under EU ECGT (Sept 2026).',
  },
  {
    description: 'Confirms the crop is grown without synthetic pesticides or fertilisers. Requires a completed conversion period, maintained buffer zones, and an external organic certificate on record.',
    local: 'Organic labelling in local retail and mandis.',
    export: 'Organic shelf placement in EU, UK, and US markets. Covers NPOP and EU Regulation 2018/848.',
  },
  {
    description: 'Confirms the crop meets grade standards, is batch-segregated and timestamped from the field, and passes crop-specific contaminant tests including aflatoxin, pesticide MRLs, and heavy metals.',
    local: 'Formal retail chains, institutional procurement, and FSSAI-regulated food businesses.',
    export: 'All EU export. Covers MRL Regulation 396/2005, FSSAI compliance, and AGMARK grade standards.',
  },
];

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
function BatchRow({ batch, isOpen, onToggle, localPriceData, onChainPriceUpdate, onArchive }) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [activeCert, setActiveCert] = useState(null);
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
    if (!isDragging.current && Math.abs(delta) < 15) return;
    isDragging.current = true;
    setDx(Math.max(0, Math.min(130, delta)));
  };
  const onEnd = () => {
    const triggered = dx > SWIPE_THRESHOLD;
    const wasDragging = isDragging.current;
    setDx(0);
    startX.current = null;
    isDragging.current = false;
    if (triggered) { setConfirming(true); return; }
  };

  const onTouchStart = (e) => onStart(e.touches[0].clientX);
  const onTouchMove  = (e) => onMove(e.touches[0].clientX);
  const onTouchEnd   = onEnd;
  const mouseDown = useRef(false);
  const onMouseDown = (e) => { mouseDown.current = true;  onStart(e.clientX); };
  const onMouseMove = (e) => { if (mouseDown.current) onMove(e.clientX); };
  const onMouseUp   = ()  => { mouseDown.current = false; onEnd(); };

  const removePct = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));

  const batchUnit         = CROP_UNIT[batch.cropCode] ?? { label: 'kg', toKg: 1 };
  const localPricePerKg   = localPriceData?.price_usdt_per_kg ?? null;
  const localPricePerUnit = localPricePerKg != null ? localPricePerKg * batchUnit.toKg : null;

  const filled = batch.targetQtyKg > 0n
    ? Math.min(1, Number(batch.claimedQtyKg) / Number(batch.targetQtyKg))
    : null;

  const priceDisplay = batch.pricePerKgUsdt > 0n
    ? `₹${Math.round((Number(batch.pricePerKgUsdt) / 1e6) * batchUnit.toKg).toLocaleString('en-IN')} /${batchUnit.label}`
    : localPricePerUnit != null
      ? `₹${localPricePerUnit.toFixed(0)} /${batchUnit.label}`
      : null;

  const dot = cropColor(batch.cropColorKey);
  const iconUrl = cropIconUrl(batch.cropColorKey);

  const startEdit = (e) => {
    e.stopPropagation();
    const onChainPerUnit = batch.pricePerKgUsdt > 0n
      ? Number(batch.pricePerKgUsdt) / 1e6 * batchUnit.toKg
      : null;
    setDraft(onChainPerUnit != null ? String(onChainPerUnit.toFixed(0)) : localPricePerUnit != null ? String(localPricePerUnit.toFixed(0)) : '');
    setEditing(true);
  };

  const handleSave = async (e) => {
    e?.stopPropagation();
    const v = parseFloat(draft);
    if (isNaN(v) || v <= 0) { setEditing(false); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await onChainPriceUpdate?.(batch.id, v / batchUnit.toKg);
      setEditing(false);
    } catch (err) {
      setSaveError(err?.reason ?? err?.message ?? 'Transaction failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative overflow-hidden border-b border-gray-100 dark:border-slate-700 last:border-0">

      {/* Confirm overlay */}
      {confirming && (
        <div className="absolute inset-0 z-20 flex items-center px-4 gap-3 bg-white dark:bg-gray-800">
          {canRemove ? (
            <>
              <span className="text-xs text-gray-600 dark:text-white flex-1">Delete batch</span>
              <button onClick={() => { setConfirming(false); onArchive?.(batch.id); }} className="px-3 py-1.5 rounded-lg border border-black dark:border-white font-bold text-xs dark:text-white">Remove</button>
              <button onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-xs text-gray-500 dark:text-slate-400">Cancel</button>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-500 dark:text-slate-400 flex-1">Unable to remove</span>
              <button onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-xs text-gray-500 dark:text-slate-400">OK</button>
            </>
          )}
        </div>
      )}

      {/* Red tint + remove label */}
      <div className="absolute inset-0 bg-red-500 pointer-events-none" style={{ opacity: removePct * 0.25 }} />
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ opacity: removePct }}>
        <span className={`font-bold text-xs ${canRemove ? 'text-white' : 'text-gray-400'}`}>
          {canRemove ? 'Remove' : 'Minted — locked'}
        </span>
      </div>

      {/* Swipeable content */}
      <div
        className="touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: isDragging.current ? 'none' : 'transform 0.25s ease', willChange: 'transform' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}   onMouseMove={onMouseMove}   onMouseUp={onMouseUp}
      >
        {/* ── Collapsed header — always visible ── */}
        <div className="py-3">
          {/* Crop + price row */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={onToggle}>
              {iconUrl ? (
                <span
                  className="w-5 h-5 flex-shrink-0"
                  style={{
                    background: dot,
                    WebkitMaskImage: `url(${iconUrl})`,
                    maskImage: `url(${iconUrl})`,
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                  }}
                />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />
              )}
              <span className="font-semibold text-sm dark:text-white whitespace-nowrap">{batch.cropName}</span>
              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono whitespace-nowrap">{batch.displayCode}</span>
            </span>
            {batch.hasOrder && (
              <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">Order</span>
            )}
            <span className="flex-1" />
            {editing ? (
              <div className="flex flex-col items-end gap-0.5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    className="w-20 text-xs border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5 dark:bg-slate-800 dark:text-white"
                    value={draft}
                    onChange={e => { setDraft(e.target.value); setSaveError(null); }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                  />
                  <span className="text-[10px] text-gray-400 dark:text-slate-500">{batchUnit.label}</span>
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 font-bold ml-1">
                    {saving ? <Spinner size="small" /> : 'Save'}
                  </button>
                  {!saving && <button onClick={() => { setEditing(false); setSaveError(null); }} className="text-[10px] text-gray-400 dark:text-slate-500 ml-0.5">✕</button>}
                </div>
                {saveError && <span className="text-[10px] text-red-500 dark:text-red-400 max-w-[160px] text-right">{saveError}</span>}
              </div>
            ) : (
              <>
                <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">{priceDisplay ?? '—'}</span>
                <button onClick={startEdit} className="text-[10px] text-blue-500 dark:text-blue-400 font-medium ml-1.5 flex-shrink-0">Update</button>
              </>
            )}
            <button
              onClick={onToggle}
              className="ml-2 p-1 text-gray-300 dark:text-slate-600 flex-shrink-0"
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 8L1 3h10z"/>
              </svg>
            </button>
          </div>

          {/* Cert row — always visible */}
          {batch.requiredCerts > 0 && (
            <div className="flex items-center gap-1.5 mt-2 pl-4" onClick={e => e.stopPropagation()}>
              {CERT_IMAGES.map((img, i) =>
                (batch.requiredCerts & (1 << i)) !== 0 ? (
                  <button
                    key={i}
                    type="button"
                    onClick={e => { e.stopPropagation(); setActiveCert(prev => prev === i ? null : i); }}
                    className={`rounded-full focus:outline-none ${activeCert === i ? 'ring-2 ring-offset-1 ring-green dark:ring-green_dark' : ''}`}
                  >
                    <img src={img} alt={CERT_NAMES[i]} className="h-6 w-6 rounded-full object-cover" />
                  </button>
                ) : null
              )}
              {activeCert !== null && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200">
                  {CERT_NAMES[activeCert]}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Expanded detail ── */}
        {isOpen && (
          <div className="pb-3">
            {/* Fill bar */}
            <div className="mb-2">
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
            {/* Variety + drop-off */}
            <div className="flex flex-col gap-0.5 text-xs mb-2">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Variety</span>
                <span className="font-bold dark:text-white">
                  {batch.varietyCode === 0
                    ? 'Any variety'
                    : (CROP_VARIETIES[batch.cropCode]?.find(v => v.code === batch.varietyCode + 1)?.name ?? `Var ${batch.varietyCode}`)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Drop-off</span>
                {/* Drop-off is not stored on-chain yet — show the default until it is */}
                <span className="font-bold dark:text-white">Grower handles delivery</span>
              </div>
            </div>

            {/* Delivery date */}
            {batch.deliveryDate > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${dot}28`, color: dot }}
              >
                {dateDisplay(batch.deliveryDate)}
              </span>
            )}

            {/* Cert callouts */}
            {batch.requiredCerts > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
                  If delivered, the union will perform:
                </p>

                {(batch.requiredCerts & (1 << 0)) !== 0 && (
                  <div className="rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">Fair Pay — Payment & conditions</p>
                    <ul className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed space-y-1">
                      <li>• Confirm each farmer is paid at or above the declared batch price</li>
                      <li>• Record working condition compliance — no hazardous conditions, no child labour</li>
                      <li>• Confirm farmer participated in at least one union governance decision this season</li>
                    </ul>
                  </div>
                )}

                {(batch.requiredCerts & (1 << 1)) !== 0 && (
                  <div className="rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">Farm Identity — Bag labeling</p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">
                      Each bag must carry a unique QR code linked to the delivering farmer's wallet address.
                    </p>
                    {batch.cropCode === 2 && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                        For sugarcane: label each processed output container at the point of processing — not individual stalks. The QR links to the farmer who delivered that consignment.
                      </p>
                    )}
                  </div>
                )}

                {(batch.requiredCerts & (1 << 2)) !== 0 && (
                  <div className="rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">Soil & Water Care — Land practices</p>
                    <ul className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed space-y-1">
                      <li>• No open burning on any field in this batch</li>
                      <li>• Soil restoration practice on record: mulching, cover crop, or equivalent</li>
                      <li>• Water use log filed for the season</li>
                    </ul>
                  </div>
                )}

                {(batch.requiredCerts & (1 << 3)) !== 0 && (
                  <div className="rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">Chemical Free — Organic verification</p>
                    <ul className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed space-y-1">
                      <li>• External organic certificate on file for each farmer in this batch</li>
                      <li>• Conversion period complete — minimum 3 years since last synthetic input</li>
                      <li>• Buffer zones maintained between organic and conventional plots</li>
                    </ul>
                  </div>
                )}

                {(batch.requiredCerts & (1 << 4)) !== 0 && (
                  <div className="rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">Clean Harvest — Required before delivery</p>
                    <ul className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed space-y-1">
                      <li>• Contaminant test per batch: aflatoxin, pesticide MRLs, heavy metals</li>
                      <li>• Grade stamp per bag (AGMARK standard)</li>
                      <li>• Harvest timestamp recorded at field level</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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

  const GROWER_SELF = '0x0000000000000000000000000000000000000000';
  const growerOption = { address: GROWER_SELF, name: 'Grower handles delivery', system: true };

  const options = useMemo(() => {
    const list = contactList.filter(c => c.address && c.address !== GROWER_SELF);
    // ensure union is always first
    const unionEntry = list.find(c => c.address?.toLowerCase() === unionAddr?.toLowerCase());
    const rest = list.filter(c => c.address?.toLowerCase() !== unionAddr?.toLowerCase());
    const ordered = unionEntry ? [unionEntry, ...rest] : list;
    return [...ordered, growerOption];
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
              {c.address !== GROWER_SELF && (
                <span className="ml-2 text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                  {c.address.slice(0, 6)}…{c.address.slice(-4)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── CertRequirementsSelect ────────────────────────────────────────────────────
function CertRequirementsSelect({ value, onChange, certCounts, memberCount }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [pending,   setPending]   = useState(null);

  const handleRowClick = (i) => {
    const next = openIndex === i ? null : i;
    setOpenIndex(next);
    if (next === null) setPending(null);
  };

  const handleCheckbox = (i, e) => {
    e.stopPropagation();
    const checked = (value & (1 << i)) !== 0;
    if (checked) {
      onChange(value & ~(1 << i));
    } else {
      setOpenIndex(i);
      setPending(i);
    }
  };

  const confirm = (i) => {
    onChange(value | (1 << i));
    setPending(null);
  };

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 dark:text-slate-400">Required certificates</p>
      <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
        {CERT_NAMES.map((name, i) => {
          const checked  = (value & (1 << i)) !== 0;
          const expanded = openIndex === i;
          const awaiting = pending === i;
          return (
            <div key={i} className="border-b border-gray-100 dark:border-slate-700 last:border-0">
              <button
                type="button"
                onClick={() => handleRowClick(i)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {}}
                  onClick={e => handleCheckbox(i, e)}
                  className="accent-green-600 dark:accent-amber-500 flex-shrink-0"
                />
                <span className={`flex-1 text-xs ${checked ? 'font-medium dark:text-white' : 'text-gray-600 dark:text-slate-300'}`}>
                  {name}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-slate-500">{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && (
                <div className="p-3 pb-3 space-y-2.5">
                  <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">
                    {CERT_INFO[i].description}
                  </p>
                  <table className="w-full text-[10px] border-separate border-spacing-y-1">
                    <tbody>
                      {CERT_INFO[i].local && (
                        <tr>
                          <td className="w-14 align-top pr-2">
                            <span className="font-semibold px-1.5 py-0.5 rounded bg-green text-gray-700 dark:bg-amber-900 dark:text-amber-300 whitespace-nowrap">Local</span>
                          </td>
                          <td className="text-gray-400 dark:text-slate-400 leading-relaxed align-top">{CERT_INFO[i].local}</td>
                        </tr>
                      )}
                      {CERT_INFO[i].export && (
                        <tr>
                          <td className="w-14 align-top pr-2">
                            <span className="font-semibold px-1.5 py-0.5 rounded bg-green text-gray-700 dark:bg-amber-900 dark:text-amber-300 whitespace-nowrap">Export</span>
                          </td>
                          <td className="text-gray-400 dark:text-slate-400 leading-relaxed align-top">{CERT_INFO[i].export}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {certCounts && (
                    <p className="text-[10px] font-medium text-green-600 dark:text-amber-400">
                      {certCounts[i]} of {memberCount} known members hold this cert
                    </p>
                  )}
                  {awaiting && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => confirm(i)}
                        className="w-1/2 py-1.5 rounded-lg border border-green dark:border-amber-600 text-white text-xs font-bold"
                      >
                        Select this certificate
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
        <label className="text-[10px] text-gray-500 dark:text-slate-400 m-3 block">
          * Only require a cert if your members can realistically obtain it — the member count above shows who currently holds each one. Certificates tell buyers what this batch can prove. Nila uses them to match your batch to the right buyer. 
        </label>
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
  const [dropOff, setDropOff]           = useState('0x0000000000000000000000000000000000000000'); // default: grower handles delivery
  const [targetKg, setTargetKg]         = useState('');
  const [delivery, setDelivery]         = useState('');
  const [priceUsdt, setPriceUsdt]       = useState('');
  const [requiredCerts, setRequiredCerts] = useState(0);
  const [buyerInfoDismissed, setBuyerInfoDismissed] = useState(false);
  const ninPrice        = Number(tokenData?.find(t => t.sym === 'nIN')?.p ?? 1);
  const collateralPrefill = priceUsdt && targetKg
    ? Math.round(Number(priceUsdt) * Number(targetKg) * 0.20)
    : 0;
  const [depositNin, setDepositNin]     = useState(0);
  const [review, setReview]             = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState('');
  const runTx                           = useTx();

  const preview      = batchDisplayCode(cropCode, varietyCode);
  const cropName     = CROP_CODE_NAMES[cropCode] ?? `Crop ${cropCode}`;
  const varietyName  = (CROP_VARIETIES[cropCode] ?? []).find(v => v.code === varietyCode)?.name ?? 'Any variety';
  const dropOffName  = dropOff === '0x0000000000000000000000000000000000000000'
                       ? 'Grower handles delivery'
                       : contactList.find(c => c.address?.toLowerCase() === dropOff?.toLowerCase())?.name
                         ?? (dropOff ? `${dropOff.slice(0,6)}…${dropOff.slice(-4)}` : 'Union');
  const unionName    = db?.union?.name ?? 'the Union';
  const memberAddrs  = useMemo(
    () => contactList.filter(c => !c.system && c.address).map(c => c.address),
    [contactList],
  );
  const { counts: certCounts, memberCount } = useUnionCertCounts(unionAddr, memberAddrs);

  const handleConfirm = async () => {
    if (!foodToken || !wallet?.address) return;
    setErr('');
    const { ethers } = await import('ethers');
    const buyerAddr   = buyer.trim() || ethers.ZeroAddress;
    const targetQtyKg = targetKg ? BigInt(Math.round(Number(targetKg) * unit.toKg)) : 0n;
    const deliveryTs  = delivery ? Math.floor(new Date(delivery).getTime() / 1000) : 0;
    const priceWei    = priceUsdt ? BigInt(Math.round((Number(priceUsdt) / unit.toKg) * 1e6)) : 0n;
    const conditions  = 3n; // COND_LAND_TITLE | COND_CROP_TYPE
    await runTx(
      () => foodToken.createBatch(
        unionAddr, cropCode, varietyCode, buyerAddr,
        targetQtyKg, deliveryTs, priceWei, conditions, requiredCerts,
      ),
      {
        onPending: () => setBusy(true),
        onSuccess: () => onCreated?.(),
        onError:   (e) => { setErr(e?.reason ?? e?.shortMessage ?? e?.message ?? 'Transaction failed'); setReview(false); },
        onSettled: () => setBusy(false),
      }
    );
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
          <Row
            label="Certificates"
            value={
              requiredCerts === 0 ? (
                <span className="text-gray-400 dark:text-slate-500">None</span>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {CERT_NAMES.map((name, i) =>
                      (requiredCerts & (1 << i)) !== 0 ? (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green text-gray-700 dark:bg-amber-900 dark:text-amber-300">
                          {name}
                        </span>
                      ) : null
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {CERT_IMAGES.map((src, i) =>
                      (requiredCerts & (1 << i)) !== 0 ? (
                        <img key={i} src={src} alt={CERT_NAMES[i]} className="w-8 h-8 object-cover rounded" />
                      ) : null
                    )}
                  </div>
                </div>
              )
            }
          />
        </div>

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
    <div data-tour="orders-form" className="pt-4 space-y-3">
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

      <div data-tour="orders-form-crop">
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

      <div data-tour="orders-form-dropoff">
        <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Drop-off point</label>
        <ContactSelect value={dropOff} onChange={setDropOff} unionAddr={unionAddr} />
      </div>

      {!buyer.trim() && !buyerInfoDismissed && (
        <div data-tour="orders-form-buyerinfo" className="rounded-xl border border-amber-200 dark:border-amber-700 bg-green/80 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-gray-800 dark:text-amber-300 space-y-1.5">
          <ul className="space-y-1 list-none">
            <li>Only fill in the target and delivery if <span className="font-semibold">{unionName}</span> will be responsible for the entire batch, including collection, quality control and any post-harvest activities. <b>Otherwise, leave blank.</b></li>
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
            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:text-white dark:[color-scheme:dark]"
            value={targetKg} onChange={e => setTargetKg(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">Delivery date</label>
          <input
            type="date"
            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:text-white dark:[color-scheme:dark]"
            value={delivery} onChange={e => setDelivery(e.target.value)}
          />
        </div>
      </div>

      <div data-tour="orders-form-price">
        <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">
          Actual local price in INR / {unit.label}*
        </label>
        <input
          type="number" placeholder="required" step="0.01"
          className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:text-white"
          value={priceUsdt} onChange={e => setPriceUsdt(e.target.value)}
        />
        <label className="text-[10px] text-gray-500 dark:text-slate-400 m-3 block">
          * Sets the reference price members see for this crop. Update it as local rates change until a buyer confirms a final price.
        </label>
      </div>

      <div data-tour="orders-form-certs">
        <CertRequirementsSelect value={requiredCerts} onChange={setRequiredCerts} certCounts={certCounts} memberCount={memberCount} />
      </div>

      <button
        data-tour="orders-form-submit"
        onClick={() => { setDepositNin(collateralPrefill); setReview(true); }}
        disabled={!foodToken || !priceUsdt}
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
  const [expandedId, setExpandedId] = useState(null);
  const { wallet } = useWallet();
  const { tokenData } = useDataContext();
  const foodTokenAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;
  const foodToken = useContract(foodTokenAddr, foodTokenAbi, wallet);

  const { data: batchSummary, isLoading, refetch } = useFoodTokenBatches(unionAddr);
  const { data: prices = [] } = useUnionPrices(unionAddr);
  const active                = batchSummary?.active ?? [];

  // Always keep one batch expanded: default to the first, and re-home the
  // selection if the currently-open batch drops out of the list.
  useEffect(() => {
    if (active.length === 0) return;
    if (!active.some(b => b.id === expandedId)) setExpandedId(active[0].id);
  }, [active, expandedId]);

  // ── Tour (mirrors UnionReserve's "Cash & Liquidity" tutorial) ───────────────
  // First run shows a centered "Take a tour" pill; after completion shrinks to
  // a "?" on the right. State persists per browser via localStorage.
  const TOUR_SEEN_KEY = 'unionOrders_tourSeen';
  const [tourSeen, setTourSeen] = useState(() => {
    try { return localStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
  });

  const startTour = useCallback(() => {
    // Capture the form's pre-tour state so we can restore it when the tour
    // closes (if the user wasn't already in the form, collapse it back).
    const wasFormOpen = showCreate;

    const allSteps = [
      {
        element: '[data-tour="orders-card"]',
        popover: {
          title: 'Buy orders & pricing',
          description: 'This is the union\'s pricing desk. Each batch defines a (un)limited batch of food assets that a members can collect by growing the crop.  ',
        },
      },
      {
        element: '[data-tour="orders-list"]',
        popover: {
          title: 'Active batches',
          description: 'Each crop batch you define provide discounts or presale opportunities for your members. Batches can be open and closed, depending on the requirements you set.',
        },
        // Expand the first batch on entry so the tour highlights the full
        // detail panel rather than just the collapsed row. flushSync forces
        // React to commit synchronously so driver.js measures the open box.
        onHighlightStarted: () => {
          const firstId = active[0]?.id;
          if (firstId != null) {
            flushSync(() => setExpandedId(firstId));
          }
        },
        onDeselected: () => {
          setExpandedId(null);
        },
      },
      {
        element: '[data-tour="orders-form"]',
        popover: {
          title: 'Open a new batch',
          description: 'Create new orders for crops when opportunities are available; ranging from input discounts to full post-harvest orders with agreed buyers. Together with Nila you monitor progress.',
        },
        // Open the form here, not at tour start. flushSync commits before
        // driver.js measures the highlight target so the just-mounted form
        // node is in the DOM when the popover positions itself.
        onHighlightStarted: () => {
          if (!showCreate) {
            flushSync(() => setShowCreate(true));
          }
        },
      },
      {
        element: '[data-tour="orders-form-crop"]',
        popover: {
          title: 'Crop & variety',
          description: 'Pick the crop (e.g. coconut, paddy) and an optional variety.',
        },
      },
      {
        element: '[data-tour="orders-form-dropoff"]',
        popover: {
          title: 'Drop-off point',
          description: 'Where members deliver the harvest. Defaults self-delivery, but you can pick any contact (e.g. a buyer\'s warehouse or a processing partner). The point will be recorded so payment is dependent on members delivering to the right place.',
        },
      },
      {
        element: '[data-tour="orders-form-buyerinfo"]',
        popover: {
          title: 'Target & delivery',
          description: 'Only fill in a target quantity and delivery date when the union takes responsibility for the whole batch — collection, quality control, and post-harvest handling. Otherwise leave them blank; the batch stays open-ended and members join as they\'re ready.',
        },
      },
      {
        element: '[data-tour="orders-form-price"]',
        popover: {
          title: 'Local price',
          description: 'The reference price members see for this crop, in INR per unit. Update it as local rates change until a buyer confirms a final price — at that point the on-chain price is locked.',
        },
      },
      {
        element: '[data-tour="orders-form-certs"]',
        popover: {
          title: 'Required certifications',
          description: 'Optional gates that members must meet to join the batch (Fair Pay, Farm Identity, Soil & Water Care, Chemical Free, Clean Harvest). The counters show how many of your members already qualify — pick the ones the buyer requires.',
        },
      },
      {
        element: '[data-tour="orders-form-submit"]',
        popover: {
          title: 'Review & post',
          description: 'When the details are right, review and deposit collateral. Members can then join the batch and start producing for it.',
        },
      },
    ];
    // Don't filter by DOM presence — the form sub-steps (orders-form-*) live
    // inside <CreateForm>, which only mounts after step 3 opens the form via
    // onHighlightStarted. Step 3's flushSync ensures the form is in the DOM
    // before driver.js measures the next step's target.
    driver({
      showProgress: true,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      steps: allSteps,
      onDestroyed: () => {
        try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch {}
        setTourSeen(true);
        // Restore form to its pre-tour state. If the user already had the
        // form open before clicking "?", leave it alone (don't blow away
        // their input).
        if (!wasFormOpen) setShowCreate(false);
      },
    }).drive();
  }, [active, showCreate]);

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

  const handleChainPriceUpdate = async (batchId, pricePerKg) => {
    if (!foodToken) throw new Error('Wallet not connected');
    const priceWei = BigInt(Math.round(pricePerKg * 1e6));
    const tx = await foodToken.setBatchPrice(batchId, priceWei);
    await tx.wait();
    refetch();
  };

  const localPriceMap = useMemo(() => {
    const m = {};
    for (const p of prices) m[p.crop_code] = p;
    return m;
  }, [prices]);

  return (
    <div className="flex flex-col w-full mb-[220px] my-6 gap-4">

      {/* ── Tour trigger: pill on first run, "?" on the right after completion ── */}
      <div className={`flex ${tourSeen ? 'justify-end pr-2' : 'justify-center'}`}>
        {tourSeen ? (
          <button
            onClick={startTour}
            aria-label="Take the tour"
            className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-white active:scale-95"
          >
            ?
          </button>
        ) : (
          <button
            onClick={startTour}
            className="text-xs px-4 py-1.5 rounded-full font-semibold bg-white dark:bg-slate-700 text-gray-700 dark:text-white border border-gray-200 dark:border-slate-600 shadow-bottom-light active:scale-95"
          >
            ✨ Take a tour
          </button>
        )}
      </div>

      <div data-tour="orders-card" className="flex flex-col w-full bg-white dark:bg-gray-800 rounded-3xl shadow-bottom overflow-hidden">
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
              <p data-tour="orders-list" className="text-sm text-gray-400 dark:text-slate-500 py-6 text-center">
                No active batches. Create one below.
              </p>
            ) : (
              <div data-tour="orders-list">
                {active.map(batch => (
                  <BatchRow
                    key={batch.id}
                    batch={batch}
                    isOpen={expandedId === batch.id}
                    onToggle={() => setExpandedId(batch.id)}
                    localPriceData={localPriceMap[batch.cropCode] ?? null}
                    onChainPriceUpdate={handleChainPriceUpdate}
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            )
          )}

          <div className="py-4">
            {!showCreate && (
              <button
                data-tour="orders-new"
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
    </div>
  );
}
