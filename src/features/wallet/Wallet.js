import { useEffect,useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useAnimation, scroll } from 'framer-motion';
import useTouch from "../../hooks/useTouch";
import { FieldRegProvider } from '../../utils/FieldRegContext';
import { FieldRegControllerProvider } from '../maps/FieldRegistration/FieldRegController';
import { useDataContext, useNavContext, useViewModeContext, useTxContext} from '../../utils/NavigationContext';
import { cropColor, zoneColor, normalizeCropType } from '../../utils/cropColors.js';
import { buildCultivations, featuresFor } from '../maps/FieldView/fieldViewModel.js';
import { sameCropFamily } from '../../utils/foodToken.ts';

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
import { InvestmentCard, DebtCard, Card, AssetCard,CultivationCard,CultivationCardSkeleton,MapCard, CashLiquidityCard, OrdersSummaryCard, DonationCard } from "./Cards";
import { useDonationPrograms, useDonationsEnabled } from "../../hooks/useDonationPrograms.ts";
import OrdersCard from './OrdersCard';
import { useFoodTokenBatches, CROP_CODE_NAMES } from '../../hooks/useFoodTokenBatches.ts';
import MapNav from '../maps/mapsNav';
import { StaticCards } from '../maps/FieldView/staticCards';
import FieldReg_cards from '../maps/FieldRegistration/fieldRegCards';
import Header from './Header';
import TaskMessage from "./tasks";
import Settings from './Settings';
import Forms from '../../components/Forms/forms';
import Donate from '../../components/Forms/Donate';
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
    const { enterFieldView }       = useTouch();
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
            { ix === 0 ? <Assets LAND={LAND} handleOpenForm={handleOpenForm} onViewField={() => enterFieldView({ mode: 'overview' })} />
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
            : ix === 7 ? <OrdersCard unionAddr={db?.union?.leader ? db?.union?.address : undefined} />
            : ix === 8 && <Donate />
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
        { txMessage && remaining <= 7000 && <ClaimButton disabled={false} title={`closing in ${(remaining / 1000).toFixed(0)}s..`} handleClick={() => setStage(false)} />}
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
    const { setTxIndex, setTxDetails, debts, db, unionFunds, tokenData, fieldActivity, setFieldActivity, view, setView } = useDataContext()
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
        enterFieldView,
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
        const parcelArea = Number(record.meta?.parcel_area_m2) || 0;
        const zoneAreaById = new Map(zones.map(z => [z.zone_id, Number(z.area_m2) || 0]));
        const cycles = (zoneCycles.length ? zoneCycles : (cc || []))
          .filter(c => c?.is_open !== false);
        const dominant = cycles.map((cyc, i) => {
          const zid = cyc.zone_id ?? cyc.cluster_id ?? null;
          return {
            cluster_id: `active-${tokenId}-${zid ?? i}`,
            crop_type: cyc.crop_type,
            crop_confidence: cyc.crop_confidence ?? null,
            alternatives: cyc.alternatives ?? [],
            stage: cyc.stage,
            activity: 'active',
            signals: { status: cyc.health === 'stressed' ? 'POSSIBLE_STRESS' : 'ACTIVE_GOOD' },
            yield_kg_per_acre: cyc.expected_yield_kg_acre || cyc.yield_kg_per_acre || 0,
            yield_index: cyc.crop_confidence || 0,
            area_m2: zoneAreaById.get(zid) || parcelArea,
            harvest_window: cyc.predicted_eos ? { earliest: cyc.predicted_eos[0], latest: cyc.predicted_eos[1] } : null,
            health: cyc.health ?? null,
            health_description: cyc.health_description ?? null,
            water_advice: cyc.water_advice ?? null,
            fertilizer_advice: cyc.fertilizer_advice ?? null,
            weeding_advice: cyc.weeding_advice ?? null,
            zone_id: zid,
          };
        });
        // Plan 044 §5.2 — features are no longer built or stored here. They are
        // derived from (record, tokenData, view) by the single effect below.
        // This effect only owns the data model the card reads.
        setFieldActivity(prev => ({
          ...prev,
          dominant,
          activeCycle: cc,
          zones,
          subzones,
          zoneCycles,
          dormant: false,
          recordToken: tokenId,
          meta: { ...prev?.meta, last_scene_date: record.meta?.last_scene_date },
        }));
      } else {
        // No active cycle — model only; features (land-cover zones) are derived.
        setFieldActivity(prev => ({
          ...prev,
          dominant: [],
          activeCycle: null,
          zones,
          subzones,
          zoneCycles,
          dormant: subzones.length === 0 && zones.length === 0,
          recordToken: tokenId,
          meta: { ...prev?.meta, last_scene_date: record.meta?.last_scene_date },
        }));
      }
    }, [record, tokenData]);

    // Plan 044 §5.3 — the merged per-crop cultivation model (satellite + food
    // token folded together, source/confirmed kept distinct). One source of
    // truth for the map's feature fill and the food-token cards.
    const cultivations = useMemo(() => buildCultivations(record, tokenData), [record, tokenData]);

    // Plan 044 §5.2 — THE single feature selector. Features are derived from
    // (record, tokenData, view) and nothing else writes them. This replaces the
    // old ~11 in-place mutation sites + the _featuresBefore/_selectBeforeFeatures
    // snapshot stacks + the food-token fill effect. "Back" = view.mode flips to
    // 'overview' and this recomputes.
    useEffect(() => {
      if (!record || fieldActivity?.portfolioMode) return;
      const features = featuresFor(record, tokenData, view, cultivations);
      setFieldActivity(prev => prev ? ({
        ...prev,
        features,
        geojson: { type: 'FeatureCollection', features },
        featurelength: features.length,
      }) : prev);
    }, [record, tokenData, view, cultivations, fieldActivity?.portfolioMode, setFieldActivity]);

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
              // Zones this token covers — so clicking the card filters the map like open-cycle cards do.
              const tokenZoneIds = (() => {
                let mask = 0n; try { mask = BigInt(t.fieldsBitmask ?? '0'); } catch { mask = 0n; }
                if ((mask & 1n) === 1n) return [];                 // entire property → no single zone
                const zs = [];
                for (let p = 1n; p < 128n; p++) if (((mask >> p) & 1n) === 1n) zs.push('z' + (p - 1n));
                if (!zs.length && t.fieldNumber != null) zs.push('z' + t.fieldNumber);
                return zs;
              })();
              if (!acc[key]) {
                const cropName = CROP_CODE_NAMES[t.cropCode] ?? t.sym?.split('-')[0] ?? 'Crop';
                const matchesSatellite = activeSatelliteCycle &&
                  cropName.toLowerCase() === activeSatelliteCycle.crop_type?.toLowerCase();
                const base = matchesSatellite
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
                acc[key] = { ...base, zone_id: tokenZoneIds[0] ?? null, zone_ids: [...tokenZoneIds] };
              } else {
                // Same crop, another token → accumulate its zones for the map filter
                for (const z of tokenZoneIds) if (!acc[key].zone_ids.includes(z)) acc[key].zone_ids.push(z);
                if (acc[key].zone_id == null) acc[key].zone_id = tokenZoneIds[0] ?? null;
              }
              return acc;
            }, {})
        )
      : []

    // Show food-token cards AND open-cycle cards for zones not yet tokenised.
    // A satellite cycle is hidden (shown as the token card instead) ONLY when a
    // held token of the SAME crop family covers its zone. Plan 044 §5.3: a token
    // is self-attestation for ITS crop — a stale/different token (e.g. last
    // season's sugarcane) must NOT hide the correct satellite crop (e.g. this
    // season's green_gram). Hiding by zone alone wiped the other cycles.
    const zoneNumOf = (zid) => {
      const m = String(zid ?? '').match(/(\d+)/);
      return m ? Number(m[1]) : null;
    };
    const heldFts = (tokenData ?? []).filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0);
    const tokenCoversCycle = (d) => {
      const zn = zoneNumOf(d?.zone_id);
      return heldFts.some(t => {
        let mask = 0n; try { mask = BigInt(t.fieldsBitmask ?? '0'); } catch { mask = 0n; }
        const entire = (mask & 1n) === 1n;
        const coversZone = entire || (zn != null && ((mask >> BigInt(zn + 1)) & 1n) === 1n);
        // Same crop family → this cycle IS the tokenised one; different crop →
        // leave the satellite cycle visible.
        return coversZone && sameCropFamily(CROP_CODE_NAMES[t.cropCode], d?.crop_type);
      });
    };
    const uncommittedCultivations = ActiveCultivations.filter(d => !tokenCoversCycle(d));
    // Merge same-crop zones into a single card; preserve all zone_ids for map highlight.
    const rawCultivations = hasActiveFoodTokens
      ? [...foodTokenDominants, ...uncommittedCultivations]
      : ActiveCultivations
    const allCultivations = Object.values((rawCultivations || []).reduce((acc, d) => {
      // Key by crop FAMILY so sugarcane_ratoon / sugarcane_plant / a corrected
      // "sugarcane" all merge into ONE card — otherwise correcting a zone to an
      // existing crop spawns a duplicate cultivation card.
      const key = normalizeCropType(String(d?.crop_type ?? '__unknown__')) || '__unknown__';
      if (!acc[key]) {
        const seed = d?.zone_ids?.length ? [...d.zone_ids] : (d?.zone_id != null ? [d.zone_id] : []);
        acc[key] = { ...d, zone_ids: seed };
        return acc;
      }
      const g = acc[key];
      const incoming = d?.zone_ids?.length ? d.zone_ids : (d?.zone_id != null ? [d.zone_id] : []);
      for (const z of incoming) if (!g.zone_ids.includes(z)) g.zone_ids.push(z);
      g.area_m2 = (Number(g.area_m2) || 0) + (Number(d?.area_m2) || 0);
      // Promote the zone with highest crop_confidence as the group's "primary"
      // — drives crop_confidence, alternatives, advisories, default click zone.
      if ((d?.crop_confidence ?? 0) > (g.crop_confidence ?? 0)) {
        g.crop_confidence = d.crop_confidence;
        g.alternatives = d.alternatives;
        g.zone_id = d.zone_id;
        g.cluster_id = d.cluster_id;
        g.health = d.health;
        g.health_description = d.health_description;
        g.water_advice = d.water_advice;
        g.fertilizer_advice = d.fertilizer_advice;
        g.weeding_advice = d.weeding_advice;
      }
      return acc;
    }, {}))
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

    // Donation programs — card shows only when the union leader has turned
    // donations on AND there are active programs for the union.
    const { data: donationsEnabled = false } = useDonationsEnabled(db?.union);
    const { data: donationPrograms = [] } = useDonationPrograms(db?.union, donationsEnabled);

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
        ? activeBatches.filter(b => sameCropFamily(CROP_CODE_NAMES[b.cropCode], cropType))
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
        if (!feature) return;
        const zid = feature.properties?.zone_id ?? feature.properties?.cluster_id;

        // Plan 044 §5.1 — select mode: toggle the zone in view.selected. The
        // feature array is derived; we never mutate it here.
        if (feature._toggle && view?.mode === 'select') {
          if (zid == null) return;
          setView(prev => {
            const cur = new Set(prev.selected || []);
            cur.has(zid) ? cur.delete(zid) : cur.add(zid);
            return { ...prev, selected: [...cur] };
          });
          return;
        }

        // Default zone click → focus the WHOLE cultivation that contains the
        // tapped zone (not just the one zone). featuresFor filters the overview
        // to view.focus; the map fits to it.
        const cult = (cultivations || []).find(c =>
          c.zone_ids.some(z => z === zid || String(z).replace(/_(a|b)$/, '') === zid)
        );
        const group = cult ? cult.zone_ids : (zid != null ? [zid] : []);

        // Resolve the containing field name via point-in-polygon for display.
        const meta = LAND?.current?.LAND?.metadata;
        let focusName = null;
        const c = _featureCentroid(feature);
        if (c && Array.isArray(meta?.fields)) {
          for (const fld of meta.fields) {
            const ring = (fld?.coordinates || []).map(p => [p.lng, p.lat]);
            if (ring.length >= 3 && _pointInRing(c, ring)) { focusName = fld.name; break; }
          }
        }

        setView(prev => ({ ...prev, mode: 'zone', focus: group, focusZone: zid ?? null, focusName }));
        setCardView('mapview');
    }, [view, setView, setCardView, LAND, cultivations]);

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
        // Donation programs — directly under Investment. Shown only when the union
        // leader enabled donations AND there are active programs.
        ...((donationsEnabled && donationPrograms.length > 0) ? [{
          key: 'donate',
          type: 'DONATE',
          show: ix === 8 || ix === null,
          title: 'Donate',
          onClick: () => handleToggleView({ ix: 8 }),
          content: <DonationCard programs={donationPrograms} cardShrink={cardShrink} />,
        }] : []),
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
            const confirmedLabel = (label && label !== 'other' && label !== 'unknown') ? label : (d?.field_name || 'Cultivation');
            const knownCrop = label && label !== 'other' && label !== 'unknown' && label !== 'fallow';
            const rawUnion = db?.union?.name;
            const unionName = rawUnion && rawUnion.length > 12
              ? (rawUnion.lastIndexOf(' ', 12) > 0 ? rawUnion.slice(0, rawUnion.lastIndexOf(' ', 12)) : rawUnion.slice(0, 12))
              : rawUnion;
            // Per-card batch check: only show "Join the {crop} batch" when an active
            // batch exists for THIS card's crop. The field-level suggestedBatch is
            // computed against the first cycle only, which mis-labels other cards.
            const hasBatch = Boolean(label) && activeBatches.some(b =>
              sameCropFamily(CROP_CODE_NAMES[b.cropCode], label)
            );
            const batchCropName = label;
            // Crop code + token state for THIS card's crop. The "already tokenised"
            // gate must be PER-CROP: holding a sugarcane token must not suppress the
            // recommendation / correction link on the green_gram card (Plan 044 §5.3).
            const cardZoneNum = (() => { const m = String(d?.zone_id ?? '').match(/(\d+)/); return m ? Number(m[1]) : null; })();
            const cardCropCode = Number(Object.entries(CROP_CODE_NAMES).find(([, n]) => sameCropFamily(n, label))?.[0] ?? -1);
            // This card's crop is tokenised (same crop family held on-chain).
            const cardCropTokenized = cardCropCode >= 0 && (tokenData ?? []).some(t =>
              t.type === 'ERC1155' && (t.bal ?? 0) > 0 && t.cropCode === cardCropCode
            );
            // Icon colour also lights up for a token sitting on this exact zone.
            const cardHasFoodToken = cardCropTokenized || (tokenData ?? []).some(t =>
              t.type === 'ERC1155' && (t.bal ?? 0) > 0 && cardZoneNum != null && t.fieldNumber === cardZoneNum
            );
            const cardTitle = cardCropTokenized
              ? confirmedLabel
              : hasBatch && knownCrop
                ? (unionName ? `Join the ${unionName} ${label} batch` : `Join a ${label} batch`)
                : hasBatch
                  ? (unionName ? `Join the ${unionName} batch` : 'Join a cycle batch')
                  : (knownCrop ? confirmedLabel : 'Cycle detected');
            const titleCrop = knownCrop ? label : null;
            // "Not {crop}?" link in the card title — opens the map and triggers
            // the crop-type override dropdown in staticCards via pendingOverride.
            // Hidden only once a token FOR THIS CROP exists (on-chain confirmed);
            // a token for a different crop must not hide it.
            const titleAction = (knownCrop && !cardCropTokenized) ? {
              label: `Not ${label}?`,
              onClick: () => {
                setFieldActivity(prev => prev ? { ...prev, pendingOverride: true } : { pendingOverride: true });
                handleToggleView({ ix: 2, i: i });
              },
            } : null;
            return {
              key: `tokenized-${i}-${d?.cluster_id ?? ''}`,
              type: 'MAP',
              show: ix === null,
              title: cardTitle,
              titleDot: (titleCrop && cardHasFoodToken) ? cropColor(titleCrop) : 'rgba(255,255,255,0.45)',
              titleIconCrop: titleCrop,
              titleAction,
              onClick: () => {
                // Plan 044 §5.4 — focus the WHOLE cultivation (every zone it
                // covers), routed through the one entry primitive. featuresFor
                // derives the map; no feature mutation, no _featuresBefore.
                const cult = (cultivations || []).find(c => sameCropFamily(c.crop_family, d?.crop_type));
                const zids = (cult?.zone_ids?.length
                  ? cult.zone_ids
                  : (d?.zone_ids ?? (d?.zone_id ? [d.zone_id] : []))
                ).filter(z => z != null);
                enterFieldView(
                  zids.length
                    ? { mode: 'zone', focus: zids, focusZone: zids[0], i }
                    : { mode: 'overview', i }
                );
              },
              content: <CultivationCard dominant={d} cardIndex={i} />
            };
          }) || []),
        // While the IPFS record is still loading, hold the cultivation slot with a
        // flashing placeholder so the real card fades in instead of popping in.
        // Placed at the end so it takes the same stack position the cultivation
        // card will occupy once the record lands.
        ...((tokenId && !recordReady) ? [{
          key: 'cultivation-loading',
          type: 'MAP',
          show: ix === null,
          title: '',
          content: <CultivationCardSkeleton />,
        }] : []),
      ];
    
    // reshuffle the cards to have the defaulted card on top in case of defaulted debt
    cards = cards.sort((a, b) => a.type === 'DEFAULTED' && b.type !== 'DEFAULTED' ? -1 : 1);
       
    const showFieldReg = ix === 2 && LAND.current && !LAND.current.hasLand && !LAND.current?.pendingMint && !fieldActivity?.portfolioMode;

    const visibleCards = cards.filter(c => c.show);
    const collapsedStackHeight = (visibleCards.length - 1) * (visibleCards.length > 5 ? 56 : 60) + 178 + 40;

    const content = (
        <div className="flex flex-col h-[var(--app-height)] bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 pb-[calc(48px+env(safe-area-inset-bottom))]">
            { ix === 2 && LAND.current && !stage && <MapNav LAND={LAND} onFeatureClick={handleFeatureClick} cardView={cardView} cardShrink={cardShrink} portfolioMode={fieldActivity?.portfolioMode} />}
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
                        className={`relative z-10 ${ix !== null ? 'flex-shrink-0' : 'flex-grow overflow-auto'}`}
                        style={{ paddingBottom: `calc(${(ix !== 2 && ix !== 5) && cardShrink < 0.5 ? '64px' : '32px'} + env(safe-area-inset-bottom, 0px))` }}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        >
                        <AnimatePresence >
                            {visibleCards.map(({ key, type, title, titleDot, titleIconCrop, titleAction, onClick, content, props = {} }, index) => (
                                <Card
                                    key={key}
                                    i={index}
                                    type={type}
                                    title={title}
                                    titleDot={titleDot}
                                    titleIconCrop={titleIconCrop}
                                    titleAction={titleAction}
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
