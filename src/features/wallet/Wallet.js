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
import { InvestmentCard, DebtCard, Card, AssetCard,CultivationCard,MapCard, CashLiquidityCard } from "./Cards";
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
import { setMetaThemeColor } from '../../utils/metaTheme';

const Topic = ({ handleTopicScroll, handleOpenForm, LAND, CAP, funds, sums }) => {
    const [scrolling, setScrolled] = useState(0); // true ⇒ user pulled up
    const { cardView }             = useViewModeContext();
    const { ix, cardIx }           = useNavContext();
    const { debts }                = useDataContext();
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
            : ix === 2 ? LAND.current.hasLand ? <StaticCards LAND={LAND} />
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
            : ix === 6 && <UnionReserve handleOpenForm={handleOpenForm} />
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
    const { data , isLoading, error}                                                      = useSummary(process.env.REACT_APP_CHAIN_ID || '137',db.address,funds);
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
    const dominantClusters                                                                = Array.isArray(fieldActivity?.dominant)
      ? fieldActivity.dominant
      : fieldActivity?.dominant ? [fieldActivity.dominant] : []
    const ActiveCultivations                                                              = dominantClusters.filter(
      (d) => String(d?.activity || '').toLowerCase() === 'active'
    )
    const hasDominantCultivations                                                         = Boolean(fieldActivity) && ActiveCultivations.length > 0
    const CAP                                                                             = useRef()
    const inArrays                                                                        = debts.some(d => d.defaulted)
    const meta = LAND.current?.LAND?.metadata || LAND.current?.metadata;

    // set sums to be from summary, or from db
    const sums = data ? data : db['union_fund_sums']
    const earnings = sums ? sums.total_rewards : 0

    // Union Cash & Liquidity — only fetched when user is a leader
    const { data: reserveData } = useUnionCashReserve(db?.union?.leader ? db?.union?.address : undefined);
    const { data: openOffers = 0 } = useOpenCashOffers(db?.union?.leader ? db?.union?.address : undefined);

    const handleOpenForm = (e, params) => {
        if (e === 'cashDesk') {
            // Navigate directly to the Union Reserve card (ix=6) rather than the form sheet
            setIx((prev) => { prevIx.current = prev; return 6; });
            return;
        }
        setTxDetails(params ?? null);
        setTxIndex(e)
        setIx((prev) => {
            prevIx.current = prev
            return 5;
        })
    }

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
          title: !isCollapsed && earnings > 10 ? `Claim the ${(earnings).toLocaleString('en-IN',{ maximumFractionDigits: 0})} nIN you earned` : "Invest and Borrow",
          onClick: () => handleToggleView({ ix: 1}),
          content: <InvestmentCard CAP={CAP} sums={sums} cardShrink={cardShrink} inArrays={inArrays} />
        },
        ...(db?.union?.leader ? [{
          key: 'union-reserve',
          type: 'CASH_LIQUIDITY',
          show: ix === 6 || ix === null,
          title: "Cash & Liquidity",
          onClick: () => handleToggleView({ ix: 6 }),
          content: <CashLiquidityCard
            treasury={reserveData?.treasury ?? 0n}
            available={reserveData?.available ?? 0n}
            lpPending={openOffers}
            cardShrink={cardShrink}
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
        // Generate MAP cards
        ...(hasDominantCultivations ? [] : (LAND.current?.length ? landTitles : [null]).map((land, i) => ({
          key: `map-${i}`,
          type: 'MAP',
          show: ix === null,
          title: meta?.farm || LAND.current?.farmname || "Register farm land",
          onClick: () => handleToggleView({ ix: 2, i: i}),
          content: <MapCard db={db} />,
        }))),
        // Generate Active Tokenized cultivations
        ...(ActiveCultivations.map((d, i) => {
            const label = typeof d?.crop_type === 'string'
              ? d.crop_type
              : (d?.crop_type?.dominant?.label || d?.crop_type?.label);
            const cardTitle = (label && label !== 'other' && label !== 'unknown')
              ? label
              : (d?.field_name || 'Cultivation');
            return {
              key: `tokenized-${d?.cluster_id ?? i}`,
              type: 'MAP',
              show: ix === null,
              title: cardTitle,
              titleDot: cropColor(label),
              onClick: () => handleToggleView({ ix: 2, i: i}),
              content: <CultivationCard dominant={d} cardIndex={i} />
            };
          }) || []),      
      ];
    
    // reshuffle the cards to have the defaulted card on top in case of defaulted debt
    cards = cards.sort((a, b) => a.type === 'DEFAULTED' && b.type !== 'DEFAULTED' ? -1 : 1);
       
    const showFieldReg = ix === 2 && LAND.current && !LAND.current.hasLand && !LAND.current?.pendingMint;

    const content = (
        <div className="flex flex-col h-[var(--app-height)] bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 pb-[calc(48px+env(safe-area-inset-bottom))]">
            { ix === 2 && LAND.current && <MapNav LAND={LAND} onFeatureClick={handleFeatureClick} cardView={cardView} />}
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
                            {cards.filter(c => c.show).map(({ key, type, title, titleDot, onClick, content, props = {} }, index) => (
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
                    </div>
                    {(ix != null) && (
                        <Topic
                            handleOpenForm={handleOpenForm}
                            handleTopicScroll={handleTopicScroll}
                            LAND={LAND}
                            CAP={CAP}
                            funds={funds}
                            sums={sums}
                        />
                    )}
                </motion.div>
            }
            <Tabs
                db={db}
                cardLength={cards.length}
                handleOpenForm={handleOpenForm}
                toggleScreen={(idx) => handleToggleView(idx)}
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
