import { useEffect,useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation, scroll } from 'framer-motion';
import useTouch from "../../hooks/useTouch";
import { FieldRegProvider } from '../../utils/FieldRegContext';
import { FieldRegControllerProvider } from '../maps/FieldRegistration/FieldRegController';
import { useDataContext, useNavContext, useViewModeContext, useTxContext} from '../../utils/NavigationContext';
import { cropColor } from '../../utils/cropColors.js';
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
    const { cardView }             = useViewModeContext();
    const { ix, cardIx }           = useNavContext();
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
            { ix === 0 ? <Assets LAND={LAND} handleOpenForm={handleOpenForm} /> 
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
      if (!record) return;
      const cc = record.current_cycle;
      const hasActive = cc && cc.length > 0;

      if (hasActive) {
        // Build one dominant entry from the primary prediction (for CultivationCard)
        const primary = cc[0];
        const parcelArea = Number(record.meta?.parcel_area_m2) || 0;
        const dominant = [{
          cluster_id: `active-${tokenId}`,
          crop_type: primary.crop_type,
          stage: primary.stage,
          activity: 'active',
          signals: { status: primary.health === 'stressed' ? 'POSSIBLE_STRESS' : 'ACTIVE_GOOD' },
          yield_kg_per_acre: primary.expected_yield_kg_acre || 0,
          yield_index: primary.crop_confidence || 0,
          area_m2: parcelArea,
          harvest_window: primary.predicted_eos ? { earliest: primary.predicted_eos[0], latest: primary.predicted_eos[1] } : null,
        }];

        // Find cluster features for the open cycle
        const openCycleKey = Object.keys(record.cycles || {}).find(k => record.cycles[k].is_open);
        const pcc = openCycleKey ? record.per_cycle_clusters?.[openCycleKey] : null;
        const features = (pcc?.features || record.clusters?.features || []).map(f => ({
          ...f,
          properties: { ...f.properties, crop_type: cc[0]?.crop_type, activity: 'active' },
        }));

        setFieldActivity(prev => ({
          ...prev,
          dominant,
          activeCycle: cc,
          dormant: false,
          ...(features.length > 0
            ? { features, geojson: { type: 'FeatureCollection', features }, featurelength: features.length }
            : {}),
          meta: { ...prev?.meta, last_scene_date: record.meta?.last_scene_date },
        }));
      } else {
        // Dormant / fallow
        setFieldActivity(prev => ({
          ...prev,
          dominant: [],
          activeCycle: null,
          dormant: record.clusters?.features?.length === 0,
          meta: { ...prev?.meta, last_scene_date: record.meta?.last_scene_date },
        }));
      }
    }, [record]);

    // Wait for record before deciding MapCard vs CultivationCard
    // If no tokenId (no land title), skip waiting — show MapCard immediately
    const recordReady = !tokenId || record != null || recordError != null;
    const dominantClusters                                                                = Array.isArray(fieldActivity?.dominant)
      ? fieldActivity.dominant
      : fieldActivity?.dominant ? [fieldActivity.dominant] : []
    const ActiveCultivations                                                              = dominantClusters.filter(
      (d) => String(d?.activity || '').toLowerCase() === 'active'
    )
    const hasDominantCultivations                                                         = Boolean(fieldActivity) && ActiveCultivations.length > 0
    const hasActiveFoodTokens                                                             = tokenData?.some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)

    // Synthetic dominant entries from food tokens — used when no satellite record exists yet
    const foodTokenDominants = hasActiveFoodTokens && !hasDominantCultivations
      ? Object.values(
          (tokenData ?? [])
            .filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)
            .reduce((acc, t) => {
              const key = t.cropCode ?? t.sym;
              if (!acc[key]) acc[key] = {
                cluster_id:      `foodtoken-${key}`,
                crop_type:       CROP_CODE_NAMES[t.cropCode] ?? t.sym?.split('-')[0] ?? 'Crop',
                stage:           'growing',
                activity:        'active',
                signals:         { status: 'ACTIVE_GOOD' },
                yield_kg_per_acre: 0,
                yield_index:     0,
                area_m2:         0,
                harvest_window:  null,
              };
              return acc;
            }, {})
        )
      : []

    const allCultivations = [...ActiveCultivations, ...foodTokenDominants]
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
      const cropType = cc?.length ? (cc[0]?.crop_type ?? '').toLowerCase() : null;
      const matches = cropType && activeBatches.length
        ? activeBatches.filter(b => (CROP_CODE_NAMES[b.cropCode] ?? '').toLowerCase() === cropType)
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

        // Select mode: toggle selected state on the clicked cluster
        if (feature._toggle && fieldActivity.selectMode) {
          const cid = feature.properties?.cluster_id;
          const updated = (fieldActivity.features || []).map(f =>
            f.properties?.cluster_id === cid
              ? { ...f, properties: { ...f.properties, selected: !f.properties.selected } }
              : f
          );
          setFieldActivity({
            ...fieldActivity,
            features: updated,
            geojson: { type: 'FeatureCollection', features: updated },
          });
          return;
        }

        const clusterId = feature.properties?.cluster_id;
        const allFeatures = fieldActivity?.geojson?.features || fieldActivity?.features || [];
        const matched = clusterId !== undefined && clusterId !== null
          ? allFeatures.filter(f => f.properties?.cluster_id === clusterId)
          : [feature];
        setFieldActivity({
            ...fieldActivity,
            features: matched,
            geojson: { type: 'FeatureCollection', features: matched },
            viewmode: true,
            featurelength: allFeatures.length,
        });
        setCardView('mapview');
    }, [fieldActivity, setFieldActivity, setCardView]);

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
            const label = typeof d?.crop_type === 'string'
              ? d.crop_type
              : (d?.crop_type?.dominant?.label || d?.crop_type?.label);
            const isFoodTokenHolder = hasActiveFoodTokens;
            const confirmedLabel = (label && label !== 'other' && label !== 'unknown') ? label : (d?.field_name || 'Cultivation');
            const knownCrop = label && label !== 'other' && label !== 'unknown' && label !== 'fallow';
            const rawUnion = db?.union?.name;
            const unionName = rawUnion && rawUnion.length > 12
              ? (rawUnion.lastIndexOf(' ', 12) > 0 ? rawUnion.slice(0, rawUnion.lastIndexOf(' ', 12)) : rawUnion.slice(0, 12))
              : rawUnion;
            const hasBatch = Boolean(fieldActivity?.suggestedBatch);
            const cardTitle = isFoodTokenHolder
              ? confirmedLabel
              : hasBatch && knownCrop
                ? (unionName ? `Join the ${unionName} ${label} batch` : `Join a ${label} batch`)
                : hasBatch
                  ? (unionName ? `Join the ${unionName} batch` : 'Join a cycle batch')
                  : (knownCrop ? confirmedLabel : 'Cycle detected');
            return {
              key: `tokenized-${i}-${d?.cluster_id ?? ''}`,
              type: 'MAP',
              show: ix === null,
              title: cardTitle,
              titleDot: isFoodTokenHolder ? cropColor(label) : 'rgba(255,255,255,0.45)',
              onClick: () => {
                if (!isFoodTokenHolder) {
                  if (fieldActivity?.suggestedBatch) {
                    setFieldActivity(prev => prev ? { ...prev, pendingJoin: true } : prev);
                  } else {
                    setFieldActivity(prev => prev ? { ...prev, pendingCropForm: true } : prev);
                  }
                }
                handleToggleView({ ix: 2, i: i });
              },
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
                            {visibleCards.map(({ key, type, title, titleDot, onClick, content, props = {} }, index) => (
                                <Card
                                    key={key}
                                    i={index}
                                    type={type}
                                    title={title}
                                    titleDot={titleDot}
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
