import { useEffect,useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation, scroll } from 'framer-motion';
import useTouch from "../../hooks/useTouch";
import { FieldRegProvider } from '../../utils/FieldRegContext';
import { FieldRegControllerProvider } from '../maps/FieldRegistration/FieldRegController';
import { useDataContext, useNavContext, useViewModeContext, useTxContext} from '../../utils/NavigationContext';
import { cropColor, zoneColor, normalizeCropType } from '../../utils/cropColors.js';
import { mergeZonesWithSubzones } from '../../utils/recordZones.js';

// Ray-cast point-in-polygon for tagging subzones with their containing zone.
// Used as a fallback when feature properties don't already carry zone_id.
const _pointInRing = (pt, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1]))
      && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const _featureCentroid = (feature) => {
  const coords = feature?.geometry?.coordinates;
  if (!coords) return null;
  // Polygon: coords[0] is outer ring [[lon,lat],...]
  const ring = feature.geometry.type === 'Polygon' ? coords[0]
    : feature.geometry.type === 'MultiPolygon' ? coords[0]?.[0] : null;
  if (!ring?.length) return null;
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
};

const _resolveZoneId = (feature, zones) => {
  const tagged = feature?.properties?.zone_id;
  if (tagged !== undefined && tagged !== null) return tagged;
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const c = _featureCentroid(feature);
  if (!c) return null;
  for (const z of zones) {
    const g = z?.geometry;
    if (!g?.coordinates) continue;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]]
      : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
    for (const ring of rings) {
      if (_pointInRing(c, ring)) return z.zone_id;
    }
  }
  return null;
};
import Assets from '../assets/assets'
import DebtsActive from '../lending/debtsActive';
import Investments from '../lending/investments';
import { InvestmentCard, DebtCard, Card, AssetCard,CultivationCard,MapCard, CashLiquidityCard, OrdersSummaryCard } from "./Cards";
import OrdersCard from './OrdersCard';
import { useFoodTokenBatches, CROP_CODE_NAMES } from '../../hooks/useFoodTokenBatches.ts';
import MapNav from '../maps/mapsNav';
import { StaticCards } from '../maps/FieldView/staticCards';
import FieldReg_cards from '../maps/FieldRegistration/fieldRegCards';
import Header from './Header';
import TaskMessage from "./tasks";
import Settings from './Settings';
import Forms from '../../components/Forms/forms';
import Tabs from './tabs';
import UnionReserve from './UnionReserve';
import { useUnionCashReserve } from '../../hooks/useUnionCashReserve.ts';
import { useOpenCashOffers } from '../../hooks/useCashOffer.ts';
import Spinner from "../../components/UI/spinner";
import { ClaimButton, CollapseButton } from "../../components/UI/buttons";
import { useSummary } from "../../hooks/useSummary";
import { useRecordHash } from "../../hooks/useRecordHash.ts";
import { setMetaThemeColor } from '../../utils/metaTheme';

const Topic = ({ handleTopicScroll, handleOpenForm, LAND, CAP, funds, sums, savedFieldActivity }) => {
    const [scrolling, setScrolled] = useState(0); // true ⇒ user pulled up
    const { cardView, setCardView } = useViewModeContext();
    const { ix, cardIx, setIx }    = useNavContext();
    const { debts, db, fieldActivity } = useDataContext();
    const controls                 = useAnimation();
    const scrollRef                = useRef(null);
    const rafRef                   = useRef(0);

    // pixels needed to fully shrink the principal card
    const SHRINK_DISTANCE = 200; // tune
    
    useEffect(() => {
    // Clean up on unmount
    return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
    };
    }, []);
    
    const onScroll = useCallback(() => {
        const el = scrollRef.current;
        const top = el?.scrollTop ?? 0;
        setScrolled(top);
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
        try {
            const p = Math.max(0, Math.min(1, top / SHRINK_DISTANCE));
            handleTopicScroll?.(p);
        } finally {
            rafRef.current = 0;
        }
        });
    }, [cardView, handleTopicScroll]);

    const variants = {
        default:         { y: 220, zIndex: 10 },
        transactionview: { y: 0, zIndex: 10 },
        tokenview:       { y: 50, zIndex: 10 },
        // TODO: BetaWarning banner in StaticCards occupies ~50px above the card,
        // so the card sits 50px higher to keep XCircleIcon clear of the banner.
        // When BetaWarning is removed, revert offset back to: window.screen.height - 400
        mapview:         { y: window.screen.height - 400, zIndex: 0},
    };
      
    useEffect(() => {
        // make sure control is called when cardview is called
        // make sure scroll position is reset on page change (ix)
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        controls.start(variants[cardView]);
        handleTopicScroll?.(0);
    }, [cardView]);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
    }, []);

    return (
        <div 
        ref={scrollRef}
        onScroll={onScroll}
        className={`pointer-events-none relative min-h-[var(--app-height)] overflow-y-auto
            ${scrolling > window.innerHeight / 4 ? 'z-20' : 'z-0'}`
        }>
        <motion.div // animating the children position 
            className="pointer-events-auto flex flex-col overscroll-contain"
            custom={ix}
            animate={controls} 
            transition={{ type: "spring", stiffness: 300, damping: 30, bounce: 0.5 }}
            >
            { ix === 0 ? <Assets LAND={LAND} handleOpenForm={handleOpenForm} onViewField={() => { setIx(2); setCardView('mapview'); }} />
            : ix === 1 ? <Investments LAND={LAND} funds={funds} CAP={CAP} sums={sums} /> 
            : ix === 2 ? (LAND.current.hasLand || fieldActivity?.portfolioMode) ? <StaticCards LAND={LAND} />
              : LAND.current?.pendingMint ? (
                <div className="pointer-events-auto flex flex-col bg-white dark:bg-gray-700 dark:text-white rounded-3xl w-full mb-[220px] py-8 my-6 shadow-bottom">
                  <h3 className="font-bold px-8">Pending land title mint.</h3>
                  <p className="text-sm px-8 pt-3 dark:text-slate-300">Your title is queued. We will notify you when minting is completed.</p>
                </div>
              )
              : <FieldReg_cards LAND={LAND} />
            : ix === 3 ? <DebtsActive debt={debts[cardIx]} />
            : ix === 4 ? <Settings handleOpenForm={handleOpenForm} LAND={LAND} />
            : ix === 5 ? <Forms LAND={LAND} CAP={CAP} handleOpenForm={handleOpenForm} />
            : ix === 6 ? <UnionReserve handleOpenForm={handleOpenForm} savedFieldActivity={savedFieldActivity} />
            : ix === 7 && <OrdersCard unionAddr={db?.union?.leader ? db?.union?.address : undefined} />
            }
        </motion.div>
        </div> 
    )
}

const formatElapsed = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (!minutes) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const TxProgress = () => {
    const { stage, setStage, txMessage, txTimerRef, txHash, txUrl, txSubmittedAt } = useTxContext();
    const [remaining, setRemaining] = useState(10000);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
      if (!txTimerRef.current) return;
      const end = Date.now() + 10_000;
      const int = setInterval(() => setRemaining(Math.max(0, end - Date.now())), 1000);
      return () => clearInterval(int);
    }, [txTimerRef.current]);

    useEffect(() => {
      if (!txSubmittedAt || !stage) {
        setElapsed(0);
        return;
      }
      const tick = () => setElapsed(Math.max(0, Date.now() - txSubmittedAt));
      tick();
      if (stage === 'success' || stage === 'error') return;
      const int = setInterval(tick, 1000);
      return () => clearInterval(int);
    }, [txSubmittedAt, stage]);

    const stageLabel =
      stage === 'approval' ? 'Awaiting approval' :
      stage === 'approved' ? 'Approved' :
      stage === 'pending' ? 'Pending' :
      stage === 'success' ? 'Success' :
      stage === 'error' ? 'Error' :
      '';
    const showEstimate = stage === 'approved' || stage === 'pending';
    const elapsedLabel = elapsed ? formatElapsed(elapsed) : '';
    const shortHash = txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : '';
  
    return (
    <motion.div
        className="flex-grow flex flex-col justify-center items-center space-y-2 p-2 overflow-hidden"
        animate={{ height: stage ? 'h-full' : 0 }} >
        <Spinner size='small'/>
        <div className="mx-12 dark:text-white pb-12 text-center space-y-2">
            { stageLabel && (
                <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    {stageLabel}
                </div>
            )}
            { txMessage && <div>{txMessage}</div> }
            { (elapsedLabel || showEstimate) && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                    { elapsedLabel ? `Elapsed ${elapsedLabel}` : 'Elapsed 0s' }
                    { showEstimate && ' | Est. ~30-120s on Polygon.' }
                </div>
            )}
            { txUrl && (
                <a className="text-xs underline text-slate-600 dark:text-slate-300" href={txUrl} target="_blank" rel="noreferrer">
                    { shortHash ? `View tx on Polygonscan (${shortHash})` : 'View tx on Polygonscan' }
                </a>
            )}
        </div>
        { txMessage && <ClaimButton disabled={false} title={remaining > 7000 ? 'close' : `closing in ${(remaining / 1000).toFixed(0)}s..`} handleClick={() => setStage(false)} />}
    </motion.div>
    )
}

function Wallet({LAND}) {
    /**
     * structure
     *  dashboard wallet
     *  pages: 
     *      1 - Assets
     *      2 - Invest
     *      3 - Borrow 
     *      4 - Map
     *      5 - Settings
     *      6 - Transactions
     *   
     *  data requirement: 
     *      - total fungible amounts (NIN,NILA,USDC)
     *      - total infungible amounts (LAND)
     *      - status invest/borrow
     */
    const { setTxIndex, setTxDetails, debts, db, unionFunds, tokenData, fieldActivity, setFieldActivity } = useDataContext()
    const funds                                                                           = !unionFunds ? [] : unionFunds //?.map(f => f[0])
    const { stage }                                                                       = useTxContext()
    const [ cardShrink, setShrinkProgress]                                                = useState(0); 
    const { data , isLoading, error}                                                      = useSummary(db?.chain || process.env.REACT_APP_CHAIN_ID || '137',db.address,funds);
    const { ix,setIx,cardIx,prevIx }                                                      = useNavContext()
    const { tokenview, cardView, setCardView }                                            = useViewModeContext();
    const {
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        handleToggleView,
        handleCollapse,
        isCollapsed,
        isDragging,
    } = useTouch()
    // Fetch record early so cultivation cards render before FieldView opens
    const tokenId = LAND.current?.LAND?.id;
    const { record, isOwner, isApproved, fee, fetchRecord, loading: recordLoading, error: recordError } = useRecordHash(tokenId);

    useEffect(() => {
      if (!tokenId || (!isOwner && !isApproved && fee === null)) return;
      fetchRecord();
    }, [tokenId, isOwner, isApproved, fee]);

    // When record arrives, populate fieldActivity with dominant + activeCycle
    useEffect(() => {
      // Wait for tokenData to be fetched (null = not yet fetched) before stamping recordToken,
      // so the gate in staticCards doesn't unlock until both record and tokenData are ready.
      if (!record || tokenData === null) return;
      const cc = record.current_cycle;
      const hasActive = cc && cc.length > 0;

      // New schema: record.zones[] (stable NMF land-cover segments) +
      // record.clusters{features} (subzones, per-cycle activity partitions).
      // Tag each subzone with the zone it belongs to so the map/list can color
      // by zone. cycles[] is a list; current_cycle[] entries may be skeletal,
      // so enrich each from the matching cycles list entry by cycle_id.
      const zones = Array.isArray(record.zones) ? record.zones : [];
      const rawClusters = record.clusters?.features || [];
      // cycles may arrive as an array (legacy) or as an object keyed by `cycle_0`/`cycle_1`/…
      const cyclesByKey = {};
      if (Array.isArray(record.cycles)) {
        for (const c of record.cycles) {
          if (c?.cycle_id) cyclesByKey[c.cycle_id] = c;
          if (c?.idx !== undefined) cyclesByKey[`cycle_${c.idx}`] = c;
        }
      } else if (record.cycles && typeof record.cycles === 'object') {
        for (const [k, c] of Object.entries(record.cycles)) {
          cyclesByKey[k] = c;
          if (c?.cycle_id) cyclesByKey[c.cycle_id] = c;
        }
      }
      const subzones = rawClusters.map(f => {
        const zid = _resolveZoneId(f, zones);
        return { ...f, properties: { ...f.properties, zone_id: zid } };
      });
      const zoneCycles = (cc || []).map(c => {
        const enriched = c?.cycle_id ? (cyclesByKey[c.cycle_id] || {}) : {};
        return { ...enriched, ...c };
      });

      if (hasActive) {
        const primary = zoneCycles[0] || cc[0] || {};
        const parcelArea = Number(record.meta?.parcel_area_m2) || 0;
        const dominant = [{
          cluster_id: `active-${tokenId}`,
          crop_type: primary.crop_type,
          stage: primary.stage,
          activity: 'active',
          signals: { status: primary.health === 'stressed' ? 'POSSIBLE_STRESS' : 'ACTIVE_GOOD' },
          yield_kg_per_acre: primary.expected_yield_kg_acre || primary.yield_kg_per_acre || 0,
          yield_index: primary.crop_confidence || 0,
          area_m2: parcelArea,
          harvest_window: primary.predicted_eos ? { earliest: primary.predicted_eos[0], latest: primary.predicted_eos[1] } : null,
          health: primary.health ?? null,
          health_description: primary.health_description ?? null,
          water_advice: primary.water_advice ?? null,
          fertilizer_advice: primary.fertilizer_advice ?? null,
          weeding_advice: primary.weeding_advice ?? null,
          zone_id: primary.zone_id ?? null,
        }];
        // Map features: use zone-tagged subzones if present, else fall back to
        // zone polygons so the map isn't blank when clusters[] is empty.
        // Per-zone crop lookup from current_cycle entries. The pipeline writes
        // the zone identifier as either `zone_id` or `cluster_id` depending on
        // the code path; both refer to the same zN slot. Returns null for
        // zones without a matching entry — the map renders those as "unknown"
        // grey rather than inheriting some other zone's crop.
        const zoneIdOf = (c) => c?.zone_id ?? c?.cluster_id;
        const cropForZone = (zid) => {
          const zc = (cc || []).find(c => zoneIdOf(c) === zid);
          return zc?.crop_type ?? null;
        };
        // Merged zone list: parents that have been subdivided (e.g. z1 with
        // z1_a/z1_b) are replaced by their subzones, so the partition shows in
        // every view (Now, swiper, select-fields).
        const mergedZones = mergeZonesWithSubzones(record);
        const features = subzones.length > 0
          ? subzones.map(f => ({
              ...f,
              properties: { ...f.properties, crop_type: cropForZone(f.properties?.zone_id), activity: f.properties?.activity || 'active' },
            }))
          : mergedZones.map(z => ({
              type: 'Feature',
              properties: {
                zone_id: z.zone_id,
                category: z.category,
                area_m2: z.area_m2,
                ...(z.subzone_of ? { subzone_of: z.subzone_of } : {}),
                ...(z._backdrop ? { backdrop: true } : {}),
                // Subzones inherit the parent's current crop when they have
                // no direct match in current_cycle. Backdrops use the parent
                // id directly.
                crop_type: cropForZone(z.zone_id) ?? (z.subzone_of ? cropForZone(z.subzone_of) : null),
                activity: 'active',
              },
              geometry: z.geometry,
            }));

        setFieldActivity(prev => ({
          ...prev,
          dominant,
          activeCycle: cc,
          zones,
          subzones,
          zoneCycles,
          dormant: false,
          recordToken: tokenId,
          ...(features.length > 0
            ? { features, geojson: { type: 'FeatureCollection', features }, featurelength: features.length }
            : {}),
          meta: { ...prev?.meta, last_scene_date: record.meta?.last_scene_date },
        }));
      } else {
        // No active cycle — still surface zones so the map shows land-cover.
        // Use the merged zone list so subzone partitions show in the dormant
        // view too.
        const mergedZones = mergeZonesWithSubzones(record);
        const features = subzones.length > 0 ? subzones : mergedZones.map(z => ({
          type: 'Feature',
          properties: {
            zone_id: z.zone_id,
            category: z.category,
            area_m2: z.area_m2,
            ...(z.subzone_of ? { subzone_of: z.subzone_of } : {}),
            ...(z._backdrop ? { backdrop: true } : {}),
          },
          geometry: z.geometry,
        }));
        setFieldActivity(prev => ({
          ...prev,
          dominant: [],
          activeCycle: null,
          zones,
          subzones,
          zoneCycles,
          dormant: subzones.length === 0 && zones.length === 0,
          recordToken: tokenId,
          ...(features.length > 0
            ? { features, geojson: { type: 'FeatureCollection', features }, featurelength: features.length }
            : {}),
          meta: { ...prev?.meta, last_scene_date: record.meta?.last_scene_date },
        }));
      }
    }, [record, tokenData]);

    // Wait for record before deciding MapCard vs CultivationCard
    // If no tokenId (no land title), skip waiting — show MapCard immediately
    const recordReady = !tokenId || record != null || recordError != null;
    // Only use dominant when it was computed for the current field — prevents stale cross-field renders
    const fieldActivitySynced = !tokenId || fieldActivity?.recordToken === tokenId;
    const dominantClusters                                                                = fieldActivitySynced && Array.isArray(fieldActivity?.dominant)
      ? fieldActivity.dominant
      : fieldActivity?.dominant && fieldActivitySynced ? [fieldActivity.dominant] : []
    const ActiveCultivations                                                              = dominantClusters.filter(
      (d) => String(d?.activity || '').toLowerCase() === 'active'
    )
    const hasDominantCultivations                                                         = Boolean(fieldActivity) && ActiveCultivations.length > 0
    const hasActiveFoodTokens                                                             = tokenData?.some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)

    // Food token dominants — one card per ERC1155 crop. Always built when tokens exist;
    // food tokens take full priority over satellite dominant (satellite is fallback only).
    // When a token's crop matches the satellite active cycle, enrich it with satellite data
    // and use cluster_id 'active-X' so CultivationCard shows state 3 (monitoring) not state 4.
    const activeSatelliteCycle = record?.current_cycle?.[0] ?? null;
    const parcelAreaM2 = Number(record?.meta?.parcel_area_m2) || 0;
    const foodTokenDominants = hasActiveFoodTokens
      ? Object.values(
          (tokenData ?? [])
            .filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)
            .reduce((acc, t) => {
              const key = t.cropCode ?? t.sym;
              if (!acc[key]) {
                const cropName = CROP_CODE_NAMES[t.cropCode] ?? t.sym?.split('-')[0] ?? 'Crop';
                const matchesSatellite = activeSatelliteCycle &&
                  cropName.toLowerCase() === activeSatelliteCycle.crop_type?.toLowerCase();
                acc[key] = matchesSatellite
                  ? {
                      cluster_id:        `active-${tokenId}`,
                      crop_type:         cropName,
                      stage:             activeSatelliteCycle.stage,
                      activity:          'active',
                      signals:           { status: activeSatelliteCycle.health === 'stressed' ? 'POSSIBLE_STRESS' : 'ACTIVE_GOOD' },
                      yield_kg_per_acre: activeSatelliteCycle.expected_yield_kg_acre || 0,
                      yield_index:       activeSatelliteCycle.crop_confidence || 0,
                      area_m2:           parcelAreaM2,
                      harvest_window:    activeSatelliteCycle.predicted_eos
                        ? { earliest: activeSatelliteCycle.predicted_eos[0], latest: activeSatelliteCycle.predicted_eos[1] }
                        : null,
                      health:             activeSatelliteCycle.health ?? null,
                      health_description: activeSatelliteCycle.health_description ?? null,
                      water_advice:       activeSatelliteCycle.water_advice ?? null,
                      fertilizer_advice:  activeSatelliteCycle.fertilizer_advice ?? null,
                      weeding_advice:     activeSatelliteCycle.weeding_advice ?? null,
                    }
                  : {
                      cluster_id:        `foodtoken-${key}`,
                      crop_type:         cropName,
                      stage:             'growing',
                      activity:          'active',
                      signals:           { status: 'ACTIVE_GOOD' },
                      yield_kg_per_acre: 0,
                      yield_index:       0,
                      area_m2:           0,
                      harvest_window:    null,
                    };
              }
              return acc;
            }, {})
        )
      : []

    // If the user has food tokens, show those cards; satellite dominant is only shown when no tokens
    const allCultivations = hasActiveFoodTokens ? foodTokenDominants : ActiveCultivations
    const CAP                                                                             = useRef()
    const inArrays                                                                        = debts.some(d => d.defaulted)
    const meta = LAND.current?.LAND?.metadata || LAND.current?.metadata;

    // set sums to be from summary, or from db
    const sums = data ? data : db['union_fund_sums']
    const earnings = sums ? sums.total_rewards : 0

    // Union Cash & Liquidity — only fetched when user is a leader
    const { data: reserveData } = useUnionCashReserve(db?.union?.leader ? db?.union?.address : undefined);
    const { data: openOffers = 0 } = useOpenCashOffers(db?.union?.leader ? db?.union?.address : undefined);

    const cashOutDisabled = (reserveData?.settlementShortfall ?? 0n) > 0n;

    // Orders & Pricing — leaders only
    const { data: batchSummary, refetch: refetchBatches } = useFoodTokenBatches(db?.union?.address);
    const activeBatches      = batchSummary?.active          ?? [];
    const totalClaimedQt     = batchSummary?.totalClaimedQt  ?? 0;
    const totalClaimedUsdt   = batchSummary?.totalClaimedUsdt ?? 0;
    const cropBreakdown      = batchSummary?.cropBreakdown   ?? '';

    // Derive suggestedBatches: ALL active batches whose cropCode matches the active cycle's crop_type
    useEffect(() => {
      const cc = fieldActivity?.activeCycle;
      const cropType = cc?.length ? normalizeCropType(cc[0]?.crop_type) : null;
      const matches = cropType && activeBatches.length
        ? activeBatches.filter(b => (CROP_CODE_NAMES[b.cropCode] ?? '').toLowerCase() === (cropType ?? '').toLowerCase())
        : [];
      const matchIds  = matches.map(b => b.id).join(',');
      const existingIds = (fieldActivity?.suggestedBatches ?? (fieldActivity?.suggestedBatch ? [fieldActivity.suggestedBatch] : [])).map(b => b.id).join(',');
      if (matchIds === existingIds) return;
      setFieldActivity(prev => prev ? { ...prev, suggestedBatches: matches, suggestedBatch: matches[0] ?? null } : prev);
    }, [fieldActivity?.activeCycle, activeBatches]);

    const handleOpenForm = (e, params) => {
        if (e === 'cashDesk') {
            // Navigate directly to the Union Reserve card (ix=6) rather than the form sheet
            setIx((prev) => { prevIx.current = prev; return 6; });
            return;
        }
        if (e === 'cashOut' && cashOutDisabled) return;
        setTxDetails(params ?? null);
        setTxIndex(e)
        setIx((prev) => {
            prevIx.current = prev
            return 5;
        })
    }

    // Restore fieldActivity when leaving portfolio map view
    const savedFieldActivity = useRef(null);
    useEffect(() => {
        if (ix !== 2 && savedFieldActivity.current) {
            setFieldActivity(savedFieldActivity.current);
            savedFieldActivity.current = null;
        }
    }, [ix, setFieldActivity]);

    useEffect(() => {
        if (ix) return
        // reset scroll when back to ix == null
        setShrinkProgress(0);
        }, [ix]);

    useEffect(() => {
        // make sure in light mode, staticbar is reset once we called maps
        const isDark = document.documentElement.classList.contains('dark');
        if (!isDark && !ix) setMetaThemeColor('#ffffff'); // wallet
        }, [ix]);

    const handleFeatureClick = useCallback((feature) => {
        if (!feature || !fieldActivity) return;

        // Select mode: toggle selected state on the clicked zone/cluster
        if (feature._toggle && fieldActivity.selectMode) {
          const fkey = feature.properties?.zone_id ?? feature.properties?.cluster_id;
          const updated = (fieldActivity.features || []).map(f => {
            const mkey = f.properties?.zone_id ?? f.properties?.cluster_id;
            return mkey === fkey
              ? { ...f, properties: { ...f.properties, selected: !f.properties.selected } }
              : f;
          });
          setFieldActivity({
            ...fieldActivity,
            features: updated,
            geojson: { type: 'FeatureCollection', features: updated },
          });
          return;
        }

        // Default zone click: filter features to the clicked zone (map zooms
        // in via fitBounds on those features), pan the card down, turn on
        // viewmode so the X button shows. Stash the full feature set on
        // _featuresBefore so handleClose can restore it.
        const allFeatures = fieldActivity?.geojson?.features || fieldActivity?.features || [];
        const zid = feature.properties?.zone_id ?? feature.properties?.cluster_id;
        const matched = zid != null
          ? allFeatures.filter(f => {
              const fzid = f.properties?.zone_id ?? f.properties?.cluster_id;
              // match the clicked zone and any of its subzone overlays (zN_a/_b)
              return fzid === zid || (typeof fzid === 'string' && fzid.replace(/_(a|b)$/, '') === zid);
            })
          : [feature];
        const featuresToSet = matched.length ? matched : [feature];

        // Resolve the containing field name (LAND title metadata.fields[].name)
        // via point-in-polygon on the clicked feature's centroid. Field rings
        // are stored as [{lat, lng}, ...] per parseCompactMeta in useLoadETH.
        const meta = LAND?.current?.LAND?.metadata;
        let selectedFieldName = null;
        const c = _featureCentroid(feature);
        if (c && Array.isArray(meta?.fields)) {
          for (const fld of meta.fields) {
            const ring = (fld?.coordinates || []).map(p => [p.lng, p.lat]);
            if (ring.length >= 3 && _pointInRing(c, ring)) {
              selectedFieldName = fld.name;
              break;
            }
          }
        }

        setFieldActivity({
            ...fieldActivity,
            features: featuresToSet,
            geojson: { type: 'FeatureCollection', features: featuresToSet },
            viewmode: true,
            featurelength: allFeatures.length,
            _featuresBefore: fieldActivity._featuresBefore ?? allFeatures,
            selectedZoneId: zid ?? null,
            selectedFieldName,
        });
        setCardView('mapview');
    }, [fieldActivity, setFieldActivity, setCardView, LAND]);

    const handleTopicScroll = useCallback((p) => {
        // clamp
        const v = Math.max(0, Math.min(1, p || 0));
        setShrinkProgress(v);
    }, []);

    const handleDebtWarning = (d) => {
        const duedate = d && new Date(Number(d.dueDate)).toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric' });
        if (d?.defaulted){
            return `${db.union?.name} has covered your loan.`
        } else if (d.harvestDate){
            return `⚠️ Pay back before ${duedate}`
        } else if (d.confirmed) {
            return `You are growing ${d.data.crop}`
        } else {
            return `You can borrow to grow ${d.data.crop}`
        }
    }
    /**
     * debt and maps cards are dynamic. User can register multiple properties and loans
     * investment and assets are fixed.
     * maps: list NFTS
     * debt: list ??? - user can add additional cards.
     */

    let cards = [
        {
          key: 0,
          type: 'ASSETS',
          show: ix === 0 || ix === null,
          title: "Assets and Certificates",
          onClick: () => handleToggleView({ ix: 0}),
          content: <AssetCard tokens={tokenData} cardShrink={cardShrink} />,
          props: {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
            isDragging,
          },
        },
        {
          key: 1,
          type: 'INVEST',
          show: ix === 1 || ix === null,
          title: !isCollapsed && earnings > 10 ? `Claim the ${(earnings).toLocaleString('en-IN',{ maximumFractionDigits: 0})} nIN you earned` : "Invest & Borrow",
          onClick: () => handleToggleView({ ix: 1}),
          content: <InvestmentCard CAP={CAP} sums={sums} cardShrink={cardShrink} inArrays={inArrays} />
        },
        ...(db?.union?.leader ? [{
          key: 'union-reserve',
          type: 'CASH_LIQUIDITY',
          show: ix === 6 || ix === null,
          title: "Cash and Liquidity",
          onClick: () => handleToggleView({ ix: 6 }),
          content: <CashLiquidityCard
            treasury={reserveData?.treasury ?? 0n}
            available={reserveData?.available ?? 0n}
            lpPending={openOffers}
            cardShrink={cardShrink}
          />,
        }] : []),
        ...(db?.union?.leader ? [{
          key: 'food-orders',
          type: 'ORDERS',
          show: ix === 7 || ix === null,
          title: "Orders & Post-harvest",
          onClick: () => handleToggleView({ ix: 7 }),
          content: <OrdersSummaryCard
            activeBatches={activeBatches}
            cardShrink={cardShrink}
            onRefresh={refetchBatches}
          />,
        }] : []),
        // Generate Active Debt cards
        ...(debts.map((d, i) => ({
            key: `debts-${i}`,
            type: d?.defaulted ? 'DEFAULTED' : 'BORROW',
            show: ((ix === 3 && cardIx === i) || ix === null),
            title: d.harvestDate ? handleDebtWarning(d): !isCollapsed ? `Active debt at ${d.loanType}` : d.type === 'PENDING' ? `${d.loanType} Loan (Pending)` : `${d.loanType} Loan`,
            onClick: () => handleToggleView({ ix: 3, i: i }),
            content: <DebtCard d={d} cardShrink={cardShrink} />
          })) || []),          
        // Generate MAP cards (wait for record before showing; suppress if farmer already has food tokens)
        ...((!recordReady || hasDominantCultivations || hasActiveFoodTokens) ? [] : (LAND.current?.length ? landTitles : [null]).map((land, i) => ({
          key: `map-${i}`,
          type: 'MAP',
          show: ix === null,
          title: meta?.farm || LAND.current?.farmname || "Register farm land",
          onClick: () => handleToggleView({ ix: 2, i: i}),
          content: <MapCard db={db} />,
        }))),
        // Generate Active Tokenized cultivations (satellite records + food-token fallback)
        ...(allCultivations.map((d, i) => {
            const rawLabel = typeof d?.crop_type === 'string'
              ? d.crop_type
              : (d?.crop_type?.dominant?.label || d?.crop_type?.label);
            // Strip subtype suffix (sugarcane_plant → sugarcane) for the title.
            const label = rawLabel ? (normalizeCropType(rawLabel) ?? rawLabel) : rawLabel;
            const isFoodTokenHolder = hasActiveFoodTokens;
            const confirmedLabel = (label && label !== 'other' && label !== 'unknown') ? label : (d?.field_name || 'Cultivation');
            const knownCrop = label && label !== 'other' && label !== 'unknown' && label !== 'fallow';
            const rawUnion = db?.union?.name;
            const unionName = rawUnion && rawUnion.length > 12
              ? (rawUnion.lastIndexOf(' ', 12) > 0 ? rawUnion.slice(0, rawUnion.lastIndexOf(' ', 12)) : rawUnion.slice(0, 12))
              : rawUnion;
            const hasBatch = Boolean(fieldActivity?.suggestedBatch);
            const batchCropName = fieldActivity?.suggestedBatch?.cropName ?? null;
            const cardTitle = isFoodTokenHolder
              ? confirmedLabel
              : hasBatch && knownCrop
                ? (unionName ? `Join the ${unionName} ${label} batch` : `Join a ${label} batch`)
                : hasBatch
                  ? (unionName ? `Join the ${unionName} batch` : 'Join a cycle batch')
                  : (knownCrop ? confirmedLabel : 'Cycle detected');
            const titleCrop = isFoodTokenHolder ? label : (hasBatch && batchCropName ? batchCropName : null);
            return {
              key: `tokenized-${i}-${d?.cluster_id ?? ''}`,
              type: 'MAP',
              show: ix === null,
              title: cardTitle,
              titleDot: titleCrop ? cropColor(titleCrop) : 'rgba(255,255,255,0.45)',
              titleIconCrop: titleCrop,
              onClick: () => { handleToggleView({ ix: 2, i: i }); },
              content: <CultivationCard dominant={d} cardIndex={i} />
            };
          }) || []),      
      ];
    
    // reshuffle the cards to have the defaulted card on top in case of defaulted debt
    cards = cards.sort((a, b) => a.type === 'DEFAULTED' && b.type !== 'DEFAULTED' ? -1 : 1);
       
    const showFieldReg = ix === 2 && LAND.current && !LAND.current.hasLand && !LAND.current?.pendingMint && !fieldActivity?.portfolioMode;

    const visibleCards = cards.filter(c => c.show);
    const collapsedStackHeight = (visibleCards.length - 1) * (visibleCards.length > 5 ? 56 : 60) + 178 + 40;

    const content = (
        <div className="flex flex-col h-[var(--app-height)] bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 pb-[calc(48px+env(safe-area-inset-bottom))]">
            { ix === 2 && LAND.current && <MapNav LAND={LAND} onFeatureClick={handleFeatureClick} cardView={cardView} portfolioMode={fieldActivity?.portfolioMode} />}
            <Header version={0} className="flex-shrink-0 sticky" cardShrink={cardShrink} />
            { stage ? // pending onchain transaction
                <TxProgress />
                :
                <motion.div // animating the collapse of the card behind each other
                    className={`flex flex-col flex-grow mx-2 space-y-2 overflow-hidden`}
                    animate={{ height: isCollapsed ? '32' : '64' }}
                >
                    {/* TaskMessage gets the leftover space */}
                    {isCollapsed && ix === null &&
                    <TaskMessage
                        key={db.address || 'no-wallet'}
                        LAND={LAND}
                        CAP={CAP}
                        inArrays={inArrays}
                        handleOpenForm={handleOpenForm}
                        tokens={tokenData}
                        toggleScreen={(idx) => handleToggleView(idx)}
                    />
                    }
                    {/* button + cards = natural height */}
                    { (!tokenview && ix === null) && 
                    <CollapseButton handleCollapse={() => handleCollapse(ix)} isCollapsed={isCollapsed} ix={ix} />
                    }
                    <div
                        className={`relative z-10 ${ix !== null ? 'flex-shrink-0' : 'flex-grow overflow-auto'} pb-[calc(${(ix !== 2 && ix !== 5) && cardShrink < 0.5 ? '64px' : '32px'}+env(safe-area-inset-bottom))]`}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        >
                        <AnimatePresence >
                            {visibleCards.map(({ key, type, title, titleDot, titleIconCrop, onClick, content, props = {} }, index) => (
                                <Card
                                    key={key}
                                    i={index}
                                    type={type}
                                    title={title}
                                    titleDot={titleDot}
                                    titleIconCrop={titleIconCrop}
                                    onClick={onClick}
                                    inArrays={inArrays}
                                    isCollapsed={isCollapsed}
                                    listLength={cards.length}
                                    cardShrink={cardShrink}
                                    CAP={CAP}
                                    {...props}
                                >
                                    {content}
                                </Card>
                            ))}
                        </AnimatePresence>
                        {ix === null && <div aria-hidden="true" style={{ height: collapsedStackHeight }} />}
                    </div>
                    {(ix != null) && (
                        <Topic
                            handleOpenForm={handleOpenForm}
                            handleTopicScroll={handleTopicScroll}
                            LAND={LAND}
                            CAP={CAP}
                            funds={funds}
                            sums={sums}
                            savedFieldActivity={savedFieldActivity}
                        />
                    )}
                </motion.div>
            }
            <Tabs
                db={db}
                cardLength={cards.length}
                handleOpenForm={handleOpenForm}
                cashOutDisabled={cashOutDisabled}
                toggleScreen={(idx) => handleToggleView(idx)}
                isCollapsed={isCollapsed}
            />
        </div>
    );

    return (
        <FieldRegProvider>
            {showFieldReg ? (
                <FieldRegControllerProvider>
                    {content}
                </FieldRegControllerProvider>
            ) : (
                content
            )}
        </FieldRegProvider>
    );
}

export default Wallet
