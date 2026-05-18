import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDataContext, useNavContext, useViewModeContext } from '../../../utils/NavigationContext';
import { cropColor, cropIconUrl } from '../../../utils/cropColors.js';
import { motion, useDragControls, AnimatePresence, useAnimation } from 'framer-motion';
import { RateSlider, ClaimButton, DropdownButton } from '../../../components/UI/buttons';
import { ChevronDownIcon, TagIcon } from '@heroicons/react/24/solid';
import Spinner from '../../../components/UI/spinner.js';
import useLendingFlow from '../../../hooks/useDirectLendingFlow.js'
import { useMintFoodToken, useBurnLandTitle } from '../../../hooks/useMintLandTitle.ts'
import { useRecordHash } from '../../../hooks/useRecordHash.ts'
import { CROP_CODE_NAMES, CROP_VARIETIES, CROP_UNIT, CROP_CODE_COLOR_KEY, useFoodTokenBatches } from '../../../hooks/useFoodTokenBatches.ts'
import { CROP_IMG } from '../../../hooks/useFilterTasks.js'
import { readItem } from '../../../utils/db.js'
import { decodeMetadataUri } from '../../../utils/decodeMetadataUri.ts'
import { useWallet, useContract } from '../../../hooks/useWallet.ts'
import { useTx } from '../../../hooks/useTx.ts'
import { useCertRegistry, CERT_NAMES } from '../../../hooks/useCertRegistry.ts'
import landTitleArtifact from '../../../components/ABI/NilaLandTitleWithName.json'
import foodTokenArtifact from '../../../components/ABI/FoodTokens.json'

const _ftAbi = (foodTokenArtifact).abi ?? foodTokenArtifact;
const _ftAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;

const _ltAbi = (landTitleArtifact).abi ?? landTitleArtifact;
const _ltAddr = process.env.REACT_APP_LAND_TITLE_MAIN;
const CROPS_DATA = Object.entries(CROP_CODE_NAMES).map(([code, name]) => [code, name]);
const CERT_IMAGES = ['/images/label-01.webp', '/images/label-04.webp', '/images/label-02.webp', '/images/label-03.webp', '/images/label-05.webp'];

const clusterKeyOf = (feature, idx) => {
  const clusterId = feature?.properties?.cluster_id;
  if (clusterId === undefined || clusterId === null || clusterId === '') return `cluster-${idx + 1}`;
  return `cluster-${String(clusterId)}`;
};

const clusterNumberOf = (feature, idx) => {
  const clusterId = Number(feature?.properties?.cluster_id);
  return Number.isFinite(clusterId) ? clusterId : idx + 1;
};

const MintAsset = ({fieldActivity,selected,LAND,setAction}) => {
  const { setCardView } = useViewModeContext(); 
  const [ openForm, setOpenForm ] = useState(false)
  const [ mintForm, setMintForm ] = useState(false)
  const [ available, setAvailable ] = useState(false)
  const [ loading, setLoading ] = useState(false)
  const [ _yield, setYield ] = useState(1)
  const [ form, setForm ] = useState({ 'crop': '', 'var': '', 'date': '', 'yield': null, 'voucher': null, 'sig': null })
  const { handleIssueTokenVoucher } = useLendingFlow()
  const { mintFoodToken } = useMintFoodToken()
  const max_yield = useRef()
  const features = fieldActivity?.geojson?.features || fieldActivity?.features || []
  const props = features.map(f => f.properties.area_m2 || f.properties.area_ft2)

  useEffect(() => {
    const classes = features.filter(f => f.properties?.activity !== 'border_area' && f.properties?.cluster_id !== 0).map(f => f.properties.activity).every(c => c === 'unknown' || c === 'active')
    if (classes){
      setAvailable(true)
    }
  }, []);

  const handleNewForm = () => {
      setOpenForm(true)
      setCardView('transactionview')
      setAction()
  }

  const handleIssueToken = () => {
      setLoading(true)
      handleIssueTokenVoucher(LAND,form,props).then(res => {
        setMintForm(true)
        setLoading(false)
        setYield(res._yield)
        max_yield.current = res._yield * 2
        setForm(prev => ({...prev, 'date': res.date, 'voucher': res.voucher, 'sig': res.signature}))
        console.log('res', res)
      })
  }

  const YieldNominator = ({crop}) => (
    <span>{(_yield / crop[2]).toFixed(0)} {crop[3]}</span>
  )

  const DateGenerator = ({timestamp}) => {
    const date = new Date(timestamp * 1000); // multiply by 1000 for ms
    return (`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`)
  }

  const CROPS = [['0',"Paddy",'50',"bags"],['1',"Groundnut",'50',"bags"],['2',"Sugarcane",'1000',"tons"],['3',"Banana",'20',"bunches"],['4',"Potato",'50',"bags"],['5',"Onion",'50',"bags"],['6',"Sesame",'50',"bags"],['7',"Cassava",'1000',"tons"]]
  const VARS = {
    0 : [['0',"CO 51"],['1',"ADT 43"],['2',"TRY 3"],['3',"BPT 5204"]],
    1 : [['0',"TMV 7"],['1',"TMV 13"],['2',"VRI 2"],['3',"VRI 3"],['3',"VRI 6"]],
    2 : [['0',"CO 86032"],['1',"COC 24"],['2',"COC 671"],['3',"CO 62175"]],
    3 : [['0',"Grand Naine"],['1',"Poovan"],['2',"Nendran"],['3',"Rasthali"]],
    4 : [['0',"Kufri Jyoti"],['1',"Kufri Super"],['2',"Kufri Surya"]],
    5 : [['0',"CO 3"],['1',"CO (On) 5"],['2',"Arka Kalyan"],['3',"Agrifound Dark Red"]],
    6 : [['0',"TMV 3"],['1',"TMV 4"],['2',"TMV 6"],['3',"TMV 7"],['4',"SVPR 1"],['5',"CO 1"]],
    7 : [['0',"H-165"],['1',"H-226"],['2',"Sree Vijaya"],['3',"Sree Jaya"],['4',"CO (TP) 4"],['5',"Mulluvadi"]],
  }

  return (
    <motion.div 
        className="flex flex-col bg-darkgrey justify-between w-full my-1 rounded-3xl shadow-bottom-light"
        animate={{ height: '36' }} >
      { available &&  
      <>   
      <div className='flex flex-row justify-between p-4'>
            <div className='flex flex-col text-white justify-center' >
                <p className='font-bold px-4 py-1'>New cultivation:</p>
                <p className='px-4 py-1 text-xs'>Start tracking {selected.length > 1 ? 'these fields' : 'this field'}.</p>
            </div>
            { !openForm && <ClaimButton color='white' handleClick={() => handleNewForm()} title={'start'} />}
      </div>
      { /* Spinner */ }
      { loading && <Spinner size='small' stages={''} />}
      { /* set crop and var */ }
      { openForm && !mintForm && !loading &&
      <div className='flex flex-col text-white justify-between p-4'>
          <p className='px-4 py-1 text-xs'>Great. Agri assets are global digital passports for your crops. They can be used to:</p>
          <ul className='px-4 py-4 text-xs'>
            <li>* Enter a trade agreement with your union.</li>
            <li>* Cap your sales price to receive a premium now.</li>
            <li>* Get access to larger groundUp loans.</li>
          </ul>
          <hr className="w-full border-t border-gray-500 mb-4" />
          <p className='font-bold p-4'>What are you going to grow?</p>
          <DropdownButton z={20} options={CROPS} onSelect={(f) => setForm(prev => ({...prev, 'crop': f}))} />
          {form.crop && <> 
          <p className='font-bold p-4'>What variety?</p>
          <DropdownButton z={10} options={VARS[form.crop[0]]} onSelect={(f) => setForm(prev => ({...prev, 'var': f}))} />
          </>}
          { form.var && 
            <>
            <ClaimButton color='white' handleClick={handleIssueToken} title={'Set'} />
            <p className='text-xs p-4'>⚠️ We will set a harvest date and do a yield estimate, based on the field history. You can then continue to mint.</p>
            </>
          }
      </div>
      }
      { /* confirm yield and harvest date */ }
      { openForm && mintForm && !loading &&
      <div className='flex flex-col text-white justify-between p-4'>
          <hr className="w-full border-t border-gray-500 mb-4" />
          <p className='font-bold p-4'>Please confirm the yield and harvest date we estimated:</p>
          <div className='flex flex-col items-center'>
            <img src={`/images/${form.crop[1]}.png`} alt={form.crop[1]} className='w-[20%] h-[20%]' />
            <h3 className='font-bold py-2' >{form.var[1]} {form.crop[1]}</h3>
            <p className='font-bold py-6'>{_yield.toFixed(0)} kg <YieldNominator crop={form.crop} /></p>
            {!form.yield && <RateSlider type={'kg'} decimals={0} initial={_yield} onSet={(f) => setForm(prev => ({...prev, 'yield': Math.round(_yield)}))} max={max_yield.current} onChange={v => setYield(v)} /> }
            <p className='py-2'>estimated harvest</p>
            <p className='font-bold py-6'><DateGenerator timestamp={form.date}/></p>
          </div>
          <ClaimButton color='white' handleClick={() => mintFoodToken(form.voucher, form.sig, form.date, form.yield)} disabled={!form.yield} title={'Mint'} />
          <p className='text-xs p-4'>⚠️ You can now mint your asset.</p>
      </div>
      }
      </>
      }
      { /* one of the selected fields is not fallow */ }
      { !available &&
        <div className='flex flex-row justify-between p-4'>
        <div 
          className='flex flex-col text-white justify-center'
        >
            <p className='font-bold px-4 py-1'>Continue reporting:</p>
            <p className='px-4 py-1 text-xs'>Unfortunately you can only initiate field tracking on fallow fields.</p>
        </div>
        { <ClaimButton color='white' disabled={true} title={'start'} />}
    </div>}
    </motion.div>
  )
}

const SharedCropping = ({fieldActivity,selected,LAND,setAction}) => {
  const [ openForm, setOpenForm ] = useState(false)
  const [ loading, setLoading ]   = useState(true)
  const { setCardView }           = useViewModeContext(); 

  /**
   * Lets user sign-up for shared cropping, where we benefit from bulk delivery and input demand. Union sets a goal in acre, defines crop and variety.
   */
  const handleNewForm = () => {
      setOpenForm(true)
      setCardView('transactionview')
      setAction()
  }

  const handleJoin = () => {
    if (confirm(`Please confirm that you understand your land developments will be visible to everyone that joined the same group.`)) {
      console.log('AGREED')
  }
  }

  return (
    <motion.div 
      className="flex flex-col bg-darkgrey justify-between w-full my-1 rounded-3xl shadow-bottom-light"
      animate={{ height: '36' }} >
      <div className='flex flex-row justify-between p-4'>
            <div className='flex flex-col text-white justify-center' >
                <p className='font-bold px-4 py-1'>Join shared cropping</p>
                <p className='px-4 py-1 text-xs'>Farming in aggregate has shown to generate 20-25% more profits.</p>
            </div>
          { !openForm && <ClaimButton color='white' handleClick={() => handleNewForm()} title={'show'} />}
      </div>
      { /* Spinner */ }
      { /* set crop and var */ }
      { openForm &&
      <div className='flex flex-col text-white justify-between p-4'>
          <p className='px-4 py-1 text-xs'>Grow the same crops, same varieties, at the same time.</p>
          <ul className='px-2 py-4 text-xs'>
            <li>* Union hires machines, negotiate bulk inputs.</li>
            <li>* Union negotiates bulk delivery, surpassing traders.</li>
            <li>* Union collects yield and organizes transport.</li>
            <li>* Union grades each produce on arrival.</li>
            <li>* Union rearranges allotment.</li>
            <li>* You get monthly base income + profit at the end.</li>
            <li>* All funds, rules are set and secured, no sudden changes halfway.</li>
            <li>* You never give up your land rights.</li>
            <li>* You can always exit after each harvest.</li>
          </ul>
          <hr className="w-full border-t border-gray-500 mb-4" />
          <ClaimButton color='white' handleClick={handleJoin} title={'Join'} />
          <p className='text-xs p-4'>⚠️ Join will show your interest only. You are not committing to anything.</p>
      </div>
      }
    </motion.div>
  )
}

// ── CS023: Cycle history swiper ──────────────────────────────

const useCycleNav = (record, onCycleChange, onCurrentRestore) => {
  // Index 0 = "current" (live state), 1+ = historical cycles
  const historicalCycles = useMemo(() => {
    if (!record?.cycles) return [];
    return Object.entries(record.cycles)
      .map(([key, cycle]) => ({ key, ...cycle }))
      .sort((a, b) => {
        if (a.sos && b.sos) return b.sos.localeCompare(a.sos);
        return parseInt(b.key.split('_')[1]) - parseInt(a.key.split('_')[1]);
      });
  }, [record]);

  const totalCount = historicalCycles.length + 1; // +1 for "current"
  const [cycleIx, setCycleIx] = useState(0);      // 0 = current
  const userInteracted = useRef(false);
  const isCurrent = cycleIx === 0;
  const historicalEntry = !isCurrent ? historicalCycles[cycleIx - 1] : null;

  const navigate = useCallback((dir) => {
    const next = cycleIx + dir;
    if (next < 0 || next >= totalCount) return;
    userInteracted.current = true;
    setCycleIx(next);
  }, [cycleIx, totalCount]);

  useEffect(() => {
    if (!userInteracted.current) return;
    if (cycleIx === 0) {
      onCurrentRestore?.();
    } else if (historicalEntry && record?.per_cycle_clusters) {
      const pcc = record.per_cycle_clusters[historicalEntry.key];
      onCycleChange?.(historicalEntry, pcc);
    }
  }, [cycleIx]);

  return { historicalCycles, totalCount, cycleIx, isCurrent, historicalEntry, navigate };
};

function indianSeason(sos) {
  if (!sos) return null;
  const m = parseInt(sos.slice(5, 7));
  if (m >= 6 && m <= 8) return 'Kharif';
  if (m >= 10 || m <= 1) return 'Rabi';
  if (m >= 2 && m <= 5) return 'Zaid';
  return null;
}

const CycleSwiper = ({ record, onCycleChange, onCurrentRestore }) => {
  const { totalCount, cycleIx, isCurrent, historicalEntry, navigate } = useCycleNav(record, onCycleChange, onCurrentRestore);
  if (totalCount <= 1) return null;

  let label;
  if (isCurrent) {
    label = 'Now';
  } else {
    const season = indianSeason(historicalEntry?.sos);
    const year = historicalEntry?.sos?.slice(0, 4);
    label = [season, year].filter(Boolean).join(' ') || `Cycle ${cycleIx}`;
  }

  return (
    <div className="flex items-center justify-between rounded-2xl backdrop-blur-sm bg-darkgrey/10">
      <button
        onClick={() => navigate(1)}
        disabled={cycleIx === totalCount - 1}
        className="text-lg px-2 disabled:opacity-20 text-white"
      >
        ‹
      </button>
      <p className="text-xs text-white">
        {label}
      </p>
      <button
        onClick={() => navigate(-1)}
        disabled={cycleIx === 0}
        className="text-lg px-2 disabled:opacity-20 text-white"
      >
        ›
      </button>
    </div>
  );
};


// ── Derive dormant field status from timeseries ─────────────

function deriveDormantStatus(record) {
  if (!record?.timeseries?.parcel_mean) return null;
  const ts = record.timeseries.parcel_mean;
  const dates = ts.dates || [];
  const ndvi = ts.ndvi || [];
  const ndmi = ts.ndmi || [];
  const vv = ts.vv_db || [];
  const baseline = ts.baseline || [];
  if (!dates.length) return null;

  const latest = ndvi[ndvi.length - 1];
  const latestNdmi = ndmi[ndmi.length - 1];
  const latestVv = vv[vv.length - 1];
  const latestBaseline = baseline[baseline.length - 1];
  const latestDate = dates[dates.length - 1];

  // Surface state from NDVI
  let surface;
  if (latest < 0.15) surface = 'Bare soil';
  else if (latest < 0.25) surface = 'Stubble / crop residue';
  else if (latest < 0.35) surface = 'Dormant vegetation';
  else if (latest < 0.50) surface = 'Sparse growth';
  else surface = null; // not dormant

  // Soil moisture from NDMI
  let moisture;
  if (latestNdmi < -0.1) moisture = 'Dry';
  else if (latestNdmi < 0.1) moisture = 'Moderate';
  else moisture = 'Moist';

  // Ploughing indicator from SAR VV
  let ploughed = null;
  if (latestVv != null) {
    if (latestVv > -8) ploughed = 'Possibly ploughed';
    else ploughed = 'Not ploughed';
  }

  // Days since last active vegetation (NDVI > 0.4)
  let daysSinceCrop = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (ndvi[i] > 0.4) {
      daysSinceCrop = Math.round((new Date(latestDate) - new Date(dates[i])) / 86400000);
      break;
    }
  }

  // NDVI as percentage of baseline
  const vsBaseline = latestBaseline > 0 ? Math.round((latest / latestBaseline) * 100) : null;

  return { surface, moisture, ploughed, daysSinceCrop, vsBaseline, latestDate, ndvi: latest };
}

// NDVI → color for dormant field overlay (brown scale)
function dormantColor(ndvi) {
  if (ndvi < 0.15) return '#8B6914';      // dark brown — bare soil
  if (ndvi < 0.25) return '#A0823C';      // medium brown — stubble
  if (ndvi < 0.35) return '#7A8B3C';      // olive — dormant/weeds
  return '#5A7A2A';                        // dark green — sparse growth
}

const DormantCard = ({ record }) => {
  const status = useMemo(() => deriveDormantStatus(record), [record]);
  if (!status?.surface) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 bg-gray-300 dark:bg-gray-500" />
        <span className="text-sm font-semibold dark:text-white">fallow</span>
      </div>
      <div className="flex flex-col gap-1 text-xs pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1">Season</p>
        <div className="flex justify-between pt-1">
          <span className="text-gray-500 dark:text-slate-400">Surface</span>
          <span className="font-bold dark:text-white">{status.surface}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-400">Soil</span>
          <span className="font-bold dark:text-white">{status.moisture}</span>
        </div>
        {status.ploughed && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-400">Tillage</span>
            <span className="font-bold dark:text-white">{status.ploughed}</span>
          </div>
        )}
        {status.daysSinceCrop != null && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-400">Last crop</span>
            <span className="font-bold dark:text-white">{status.daysSinceCrop}d ago</span>
          </div>
        )}
      </div>
    </div>
  );
};


// ── Portfolio view (union leader views all borrower properties) ───────

// Decode base64 tokenURI → metadata JSON
function decodeTokenURI(uri) {
  if (!uri || !uri.includes(',')) return null;
  try {
    const b64 = uri.split(',')[1];
    const json = atob(b64);
    return JSON.parse(json);
  } catch { return null; }
}

// Decode delta-encoded ring back to [lat, lng] pairs
function decodeRing(encoded, scale) {
  if (!encoded?.length || !scale) return [];
  const coords = [];
  let lat = 0, lng = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    lat += encoded[i];
    lng += encoded[i + 1];
    coords.push([lat / scale, lng / scale]);
  }
  return coords;
}

const PortfolioCards = () => {
  const { db, fieldActivity, setFieldActivity } = useDataContext();
  const { setIx } = useNavContext();
  const { setCardView } = useViewModeContext();
  const controls = useDragControls();
  const startYRef = useRef(0);
  const { provider } = useWallet();

  // Push card to bottom of screen so map is exposed above
  useEffect(() => {
    setCardView('mapview');
    return () => setCardView('default');
  }, []);
  const landTitle = useContract(_ltAddr, _ltAbi, provider);

  const loans = fieldActivity?.portfolioLoans || [];

  const [resolvedIds, setResolvedIds] = useState([]);
  const [cachedHashes, setCachedHashes] = useState(null);
  const [metadata, setMetadata] = useState(null); // { landId: { farm, outline, centroid, bounds } }

  const close = () => {
    setFieldActivity(null);
    setIx(null);
    setCardView('default');
  };

  // Resolve land IDs from loans — chain fallback for loans without landId
  useEffect(() => {
    if (!landTitle || !loans.length) return;
    let cancelled = false;
    (async () => {
      const ids = [];
      const seen = new Set();
      for (const l of loans) {
        if (l.landId && !seen.has(l.landId)) {
          seen.add(l.landId);
          ids.push(l.landId);
        } else if (!l.landId && l.borrower && !seen.has(l.borrower)) {
          seen.add(l.borrower);
          try {
            const bal = await landTitle.balanceOf(l.borrower);
            if (bal > 0n) {
              const tid = Number(await landTitle.tokenOfOwnerByIndex(l.borrower, 0));
              if (!seen.has(tid)) { seen.add(tid); ids.push(tid); }
              console.log(`[portfolio] chain: ${l.borrower.slice(0,8)}… → ${tid}`);
            }
          } catch (e) {
            console.warn(`[portfolio] resolve failed ${l.borrower?.slice(0,8)}…`);
          }
        }
      }
      if (!cancelled) {
        console.log(`[portfolio] resolved ${ids.length} land IDs from ${loans.length} loans`);
        setResolvedIds(ids);
      }
    })();
    return () => { cancelled = true; };
  }, [landTitle, loans.length]);

  // Fetch tokenURI metadata for ALL resolved land IDs — this is a free
  // view call and gives us outlines, farm names, fields instantly.
  useEffect(() => {
    if (!landTitle || !resolvedIds.length) return;
    let cancelled = false;
    (async () => {
      const meta = {};
      for (const lid of resolvedIds) {
        try {
          const uri = await landTitle.tokenURI(lid);
          // decodeMetadataUri handles both raw base64 and zlib-compressed URIs
          const decoded = await decodeMetadataUri(uri);
          if (decoded) {
            const s = decoded.s || 1e5;
            meta[lid] = {
              farm: decoded.farm || `Property ${lid}`,
              outline: (decoded.out || []).map(ring => decodeRing(ring, s)),
              fields: (decoded.fields || []).map(ring => decodeRing(ring, s)),
              fieldNames: decoded.names || [],
              centroid: decoded.c ? [decoded.c[0] / s, decoded.c[1] / s] : null,
              bounds: decoded.b ? {
                south: decoded.b[0] / s, west: decoded.b[1] / s,
                north: decoded.b[2] / s, east: decoded.b[3] / s,
              } : null,
            };
          }
        } catch (e) {
          console.warn(`[portfolio] tokenURI failed for ${lid}:`, e.message);
        }
      }
      if (cancelled) return;
      console.log('[portfolio] ── Land title metadata ──');
      console.table(Object.entries(meta).map(([lid, m]) => ({
        landId: lid, farm: m.farm, centroid: m.centroid?.join(', '),
        fields: m.fieldNames.length,
      })));
      setMetadata(meta);
    })();
    return () => { cancelled = true; };
  }, [landTitle, resolvedIds]);

  // Push metadata into fieldActivity so staticMaps renders outlines immediately
  useEffect(() => {
    if (!metadata || !Object.keys(metadata).length) return;
    setFieldActivity(prev => {
      if (!prev?.portfolioMode) return prev;
      return { ...prev, portfolioProperties: metadata };
    });
  }, [metadata, setFieldActivity]);

  // Lazy: read purchased hashes from IndexedDB (for later record.json enrichment)
  useEffect(() => {
    if (!resolvedIds.length) return;
    readItem('viewingKeys', 'FarmData').then(cached => {
      const hashes = cached?.value?.hashes || cached?.hashes || {};
      const results = resolvedIds.map(lid => ({
        landId: lid,
        hash: hashes[lid] || '(none)',
        stored: !!hashes[lid],
      }));
      console.log('[portfolio] ── Cached hashes ──');
      console.table(results);
      setCachedHashes(results);
    }).catch(() => setCachedHashes([]));
  }, [resolvedIds]);

  return (
    <motion.div
      initial={{ y: -300 }}
      animate={{ y: 0 }}
      drag="y"
      dragConstraints={{ top: -300, bottom: 150 }}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.05}
      onDragEnd={(_, info) => { if (info.offset.y > 100) close(); }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 }}
      className="flex flex-col py-4"
    >
      <div className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1">
        <div
          onPointerDown={(e) => controls.start(e)}
          style={{ touchAction: 'none' }}
          className="h-10 w-full select-none cursor-grab active:cursor-grabbing flex justify-center items-center"
        >
          <span className="h-1 w-16 rounded-full bg-slate-300 dark:bg-slate-500" />
        </div>
        <div className="flex flex-col px-6 pb-6 gap-3">
          <div className="flex items-center justify-between px-4">
            <div>
              <h3 className="font-bold dark:text-white">Portfolio view</h3>
              <p className="text-[10px] dark:text-slate-500">{resolvedIds.length} properties</p>
            </div>
            <button
              onClick={() => setFieldActivity(prev => prev ? { ...prev, portfolioLabels: !prev.portfolioLabels } : prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium transition-colors ${
                fieldActivity?.portfolioLabels !== false
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-600 dark:text-slate-400'
              }`}
            >
              <TagIcon className="h-3 w-3" />
              Labels
            </button>
          </div>

          {!metadata && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}

          {metadata && (
            <div className="flex flex-col gap-2 px-4">
              {Object.entries(metadata).map(([lid, m]) => {
                const h = cachedHashes?.find(r => String(r.landId) === String(lid));
                return (
                  <div key={lid} className="flex flex-col gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-600 last:border-0">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold dark:text-white">{m.farm}</span>
                      <span className="text-gray-400 dark:text-slate-500 text-[10px]">#{lid}</span>
                    </div>
                    {m.fieldNames?.length > 0 && (
                      <p className="text-[10px] text-gray-500 dark:text-slate-400">
                        {m.fieldNames.length} field{m.fieldNames.length > 1 ? 's' : ''}: {m.fieldNames.join(', ')}
                      </p>
                    )}
                    {h && !h.stored && (
                      <p className="text-[10px] text-amber-500">no viewing key</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};


// ── Cert status panel (shown on join-batch when batch has requiredCerts > 0) ──

const CERT_STATUS_ICON = { valid: '✓', expiring: '⚠', expired: '✕', missing: '✕' };
const CERT_STATUS_COLOR = {
  valid:    'text-green-600 dark:text-green-400',
  expiring: 'text-amber-500 dark:text-amber-400',
  expired:  'text-red-500 dark:text-red-400',
  missing:  'text-gray-400 dark:text-slate-500',
};

function fmtExpiry(unixTs) {
  if (!unixTs) return null;
  return new Date(unixTs * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CertStatusPanel({ farmerAddress, requiredMask, onJoin, joining, disabled, onApplyCert }) {
  const { requiredCerts, metCount, allMet, loading } = useCertRegistry(farmerAddress, requiredMask);

  if (loading) return <p className="text-[10px] text-gray-400 dark:text-slate-500">Checking certificates…</p>;
  if (!requiredCerts.length) return null;

  const firstMissing = requiredCerts.find(c => c.status === 'missing' || c.status === 'expired');

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
          Certificate status
        </p>
        <span className="text-[10px] font-bold dark:text-white">{metCount} of {requiredCerts.length}</span>
      </div>

      {requiredCerts.map(cert => (
        <div key={cert.index} className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-bold w-4 ${CERT_STATUS_COLOR[cert.status]}`}>
              {CERT_STATUS_ICON[cert.status]}
            </span>
            <span className="text-xs dark:text-slate-300">{cert.name}</span>
          </div>
          <span className={`text-[10px] ${CERT_STATUS_COLOR[cert.status]}`}>
            {cert.status === 'valid' || cert.status === 'expiring'
              ? `valid until ${fmtExpiry(cert.expiresAt)}`
              : cert.status === 'expired'
                ? `expired ${fmtExpiry(cert.expiresAt)}`
                : 'not found'}
          </span>
        </div>
      ))}

      {allMet ? (
        <button
          onClick={onJoin}
          disabled={joining || disabled}
          className="py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-gray-800 text-sm font-bold active:scale-95 disabled:opacity-40 mt-1"
        >
          {joining ? 'Joining…' : 'Join batch'}
        </button>
      ) : (
        <button
          onClick={onApplyCert}
          className="py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-gray-800 text-sm font-bold active:scale-95 disabled:opacity-40 mt-1"
        >
          Apply for the certificates first
        </button>
      )}
    </div>
  );
}

const TYPICAL_GROW_DAYS = { 0: 105, 1: 95, 2: 320, 3: 270, 4: 80, 5: 105, 6: 82, 7: 315 };
const TYPICAL_KG_ACRE_BATCH = { 0: 1800, 1: 750, 2: 30000, 3: 8000, 4: 7000, 5: 6000, 6: 300, 7: 12000 };

export const StaticCards = ({ LAND }) => {
  const [ action, setAction ]                  = useState(null)
  const [ showAdvice, setShowAdvice ]          = useState(false)
  const [ showDataInfo, setShowDataInfo ]      = useState(false)
  const [ loading, setLoading ]                = useState(true)
  const { db, fieldActivity, setFieldActivity, tokenData } = useDataContext();
  const { setIx, cardIx }                      = useNavContext();
  const { setTokenview, setCardView }          = useViewModeContext();
  const qc                                     = useQueryClient();
  const controls                               = useDragControls();
  const motionAnimate                          = useAnimation();
  const startYRef                              = useRef(0);

  const close = () => { setIx(null); setTokenview(false); setCardView('default'); };

  // Drive card position via animation controls so we can snap to y:0 on demand
  const springTransition = { type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 };
  useEffect(() => {
    motionAnimate.start({ y: 0, transition: springTransition });
  }, [fieldActivity?.selectMode]);
  useEffect(() => {
    if (action === 'season') motionAnimate.start({ y: 0, transition: springTransition });
  }, [action]);

  // Clear portfolioMode on unmount so user's map works next time
  useEffect(() => {
    return () => {
      if (fieldActivity?.portfolioMode) {
        setFieldActivity(prev => prev?.portfolioMode ? null : prev);
      }
    };
  }, []);

  const [ selected, setSelected ]              = useState([])
  const [ form, setForm ]                      = useState({ crop: '', var: '', sos: '', sosEditing: false, coverage: null, yieldUnits: null })

  const [ varOpen, setVarOpen ]                = useState(false)
  const [ overrideCropOpen, setOverrideCropOpen ] = useState(false)

  const varRef                                 = useRef(null)
  const overrideCropRef                        = useRef(null)
  const { burnLandTitle }                      = useBurnLandTitle(Number(process.env.REACT_APP_CHAIN_ID) || 137);
  const unionAddr = db?.union?.address;
  const { data: batchSummary }                 = useFoodTokenBatches(unionAddr);
  const { wallet }                             = useWallet();
  const foodToken                              = useContract(_ftAddr, _ftAbi, wallet);
  const [ joining, setJoining ]                = useState(false);
  const runTx                                  = useTx();
  const [ yieldDraft, setYieldDraft ]          = useState(1);
  const [ editingYield, setEditingYield ]      = useState(false);
  const [ activeBatchCert, setActiveBatchCert ] = useState(null);
  const [ showPassportInfo, setShowPassportInfo ] = useState(false);
  const [ showDetailedData, setShowDetailedData ]   = useState(false);
  const [ override, setOverride ]                   = useState(null);
  const [ showOverride, setShowOverride ]            = useState(false);

  useEffect(() => {
    setYieldDraft(1);
    setEditingYield(false);
    setForm(prev => ({ ...prev, yieldUnits: null }));
  }, [form.selectedBatch?.id]);

  // CS023: gated property data — log record hash flow for verification
  const tokenId = LAND?.current?.LAND?.id;
  const { record, commitment, recordHash, fee, isOwner, isApproved, claimableFees, claimViewFees, loading: recordLoading, error: recordError, fetchRecord } = useRecordHash(tokenId);

  useEffect(() => {
    if (!tokenId || !isOwner && !isApproved && fee === null) return;
    console.log('[CS023] useRecordHash ready', { tokenId, isOwner, isApproved, fee: fee?.toString() });
    fetchRecord();
  }, [tokenId, isOwner, isApproved, fee]);

  useEffect(() => {
    if (record) {
      console.log('[CS023] record loaded', { tokenId, recordHash, commitment, clusters: record?.clusters?.features?.length, scorecard: record?.scorecard });
    }
    if (recordError) {
      console.warn('[CS023] record error', recordError);
    }
  }, [record, recordError]);

  // Preset form.sos from record once it loads (only if not already set by user)
  useEffect(() => {
    const sos = record?.current_cycle?.[0]?.sos;
    if (sos) setForm(prev => prev.sos ? prev : { ...prev, sos });
  }, [record]);


  // CS023: when user swipes to a cycle, push its clusters onto the map
  const handleCycleChange = useCallback((cycle, perCycleClusters) => {
    if (!perCycleClusters?.features?.length) {
      setFieldActivity(prev => prev ? {
        ...prev,
        features: [],
        geojson: { type: 'FeatureCollection', features: [] },
        featurelength: 0,
        dormant: false,
        historical: true,
        historicalCycle: cycle,
        activeCycle: null,
      } : prev);
      return;
    }
    // Enrich features with cycle-level data for map labels
    const enriched = perCycleClusters.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        crop_type: f.properties?.crop_type || cycle.crop_type,
        activity: cycle.is_open ? 'active' : 'historical',
        cycle_sos: cycle.sos,
        cycle_eos: cycle.eos,
        cycle_peak_ndvi: cycle.peak_ndvi,
        cycle_crop_confidence: cycle.crop_confidence,
      }
    }));
    setFieldActivity(prev => ({
      ...prev,
      features: enriched,
      geojson: { type: 'FeatureCollection', features: enriched },
      featurelength: enriched.length,
      dormant: false,
      historical: true,
      historicalCycle: cycle,
      activeCycle: null,
      meta: { ...prev?.meta, last_scene_date: record?.meta?.last_scene_date },
    }));
  }, [setFieldActivity, record]);

  // Restore current (live) state when navigating back to "Current"
  const handleCurrentRestore = useCallback(() => {
    const hasActiveCycle = record?.current_cycle?.length > 0;
    if (hasActiveCycle) {
      const openCycleKey = Object.keys(record.cycles || {}).find(k => record.cycles[k].is_open);
      const pcc = openCycleKey ? record.per_cycle_clusters?.[openCycleKey] : null;
      const cc = record.current_cycle;
      const rawFeatures = pcc?.features || record?.clusters?.features || [];
      const enriched = rawFeatures.map(f => ({
        ...f,
        properties: { ...f.properties, crop_type: cc[0]?.crop_type, activity: 'active' }
      }));
      setFieldActivity(prev => ({
        ...prev,
        ...(enriched.length > 0
          ? { features: enriched, geojson: { type: 'FeatureCollection', features: enriched }, featurelength: enriched.length }
          : {}),
        dormant: false,
        historical: false,
        historicalCycle: null,
        activeCycle: cc,
      }));
    } else {
      const status = record ? deriveDormantStatus(record) : null;
      const isDormant = record && !record.current_cycle && record.clusters?.features?.length === 0;
      setFieldActivity(prev => ({
        ...prev,
        features: [],
        geojson: { type: 'FeatureCollection', features: [] },
        featurelength: 0,
        historical: false,
        historicalCycle: null,
        activeCycle: null,
        dormant: isDormant,
        dormantColor: isDormant && status ? dormantColor(status.ndvi) : null,
        dormantStatus: isDormant ? status : null,
      }));
    }
  }, [setFieldActivity, record]);

  // Open form immediately when arriving via "Join batch" from CultivationCard or task list
  useEffect(() => {
    if (!fieldActivity?.pendingJoin) return;
    const b = fieldActivity.suggestedBatch;
    if (b) {
      const match = CROPS_DATA.find(c => c[1].toLowerCase() === (b.cropName ?? '').toLowerCase());
      setForm(prev => ({ ...prev, ...(match ? { crop: match } : {}), selectedBatch: b }));
    }
    setAction('season');
    setCardView('transactionview');
    setFieldActivity(prev => prev ? { ...prev, pendingJoin: false } : prev);
  }, [fieldActivity?.pendingJoin]);

  // Open form in free mode (no batch pre-selected) — fallow field task, "I'm not growing X" slide
  useEffect(() => {
    if (!fieldActivity?.pendingCropForm) return;
    setForm(prev => ({ ...prev, selectedBatch: null, crop: '', var: '' }));
    setActiveBatchCert(null);
    setAction('season');
    setCardView('transactionview');
    setFieldActivity(prev => prev ? { ...prev, pendingCropForm: false } : prev);
  }, [fieldActivity?.pendingCropForm]);

  // Sync selected clusters from map into form (select mode)
  useEffect(() => {
    if (!fieldActivity?.selectMode && form.coverage === 'partial') {
      // Select mode ended (confirm was clicked) — bring card back up
      setCardView('default');
      setForm(prev => ({ ...prev, coverage: 'confirmed' }));
      // Scroll variety dropdown into view after card animates back
      setTimeout(() => {
        varRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
      return;
    }
    if (!fieldActivity?.selectMode) return;
    const sel = (fieldActivity.features || [])
      .filter(f => f.properties?.selected)
      .map(f => f.properties.cluster_id);
    setForm(prev => ({ ...prev, selectedClusters: sel }));
  }, [fieldActivity?.selectMode, fieldActivity?.features]);

  const features = fieldActivity?.geojson?.features || fieldActivity?.features || []
  const clusterGroups = useMemo(() => {
    const groups = new Map();

    features.forEach((feature, idx) => {
      if (feature?.properties?.cluster_id === 0 || feature?.properties?.activity === 'border_area') return;
      const key = clusterKeyOf(feature, idx);
      const current = groups.get(key);
      if (!current) {
        groups.set(key, {
          key,
          clusterNumber: clusterNumberOf(feature, idx),
          name: feature?.properties?.field_name || db?.farmname || 'Field',
          class: feature?.properties?.activity || feature?.properties?.class,
          features: [feature],
        });
        return;
      }
      current.features.push(feature);
    });

    return Array.from(groups.values()).sort((a, b) => a.clusterNumber - b.clusterNumber);
  }, [features, db?.farmname]);
  const featureLength = fieldActivity?.featurelength || features.length
  const land_v2 = LAND.current.LAND?.metadata?.v ? true : false

  const activeCropType = fieldActivity?.activeCycle?.[0]?.crop_type?.toLowerCase();
  const hasTokenForActiveCrop = activeCropType
    ? (tokenData ?? []).some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && CROP_CODE_NAMES[t.cropCode]?.toLowerCase() === activeCropType)
    : false;
  const activeCropTokenBal = hasTokenForActiveCrop
    ? (tokenData ?? []).filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && CROP_CODE_NAMES[t.cropCode]?.toLowerCase() === activeCropType)
        .reduce((s, t) => s + t.bal, 0)
    : 0;
  const activeCropTokenCode = hasTokenForActiveCrop
    ? (tokenData ?? []).find(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && CROP_CODE_NAMES[t.cropCode]?.toLowerCase() === activeCropType)?.cropCode
    : null;
  const activeCropUnit = activeCropTokenCode != null ? (CROP_UNIT[activeCropTokenCode] ?? { label: 'kg', toKg: 1 }) : { label: 'kg', toKg: 1 };
  const activeCropBalDisplay = activeCropTokenCode != null
    ? (activeCropTokenBal / activeCropUnit.toKg).toLocaleString('en-IN', { maximumFractionDigits: 1 })
    : '0';

  // update selection state when features arrive
  useEffect(() => {
    if (features.length) {
      setSelected(clusterGroups.map((g) => g.key))
      setLoading(false)
    }
  }, [features.length]);

  // When record arrives, stop loading spinner (fieldActivity is set by Wallet.js)
  useEffect(() => {
    if (!record) return;
    setLoading(false);
    // Enrich dormant status if needed (Wallet.js sets dormant flag but not the color/status)
    if (!record.current_cycle && record.clusters?.features?.length === 0) {
      const status = deriveDormantStatus(record);
      if (status) {
        setFieldActivity(prev => ({
          ...prev,
          dormantColor: dormantColor(status.ndvi),
          dormantStatus: status,
        }));
      }
    }
  }, [record]);

  const CLASS_NAMES = {
    // v3 string
    'fallow': "Fallow",
    'unused': "Unused",
    'active': "Active",
    'unknown': "Unknown",
  }

  const CALLOUT = {
    // v3 string
    'fallow': `Fallow ${selected && selected.length > 1 ? 'fields' : 'field'}, time to grow.`,
    'unused': 'This area has been unused for a while now.',
    'active': 'Active cultivation, report about progress.',
    'unknown': 'Classification pending.',
  }

  const handleCheckMark = (clusterKey) => {
    setAction(null)
    setSelected((prev) => {
      const next = prev.includes(clusterKey)
        ? prev.filter((k) => k !== clusterKey)
        : [...prev, clusterKey];
      const selectedSet = new Set(next);
      const sliced = features.filter((feature, idx) => selectedSet.has(clusterKeyOf(feature, idx)));
      setFieldActivity({
        ...fieldActivity,
        features: sliced,
        geojson: { type: 'FeatureCollection', features: sliced },
        viewmode: true,
        featurelength: featureLength
      });
      setCardView('mapview');
      return next;
    });
  };

  const handleViewSingleArea = (group) => {
    setFieldActivity({
      ...fieldActivity,
      features: group.features,
      geojson: { type: 'FeatureCollection', features: group.features },
      viewmode: true,
      featurelength: featureLength
    })
    setCardView('mapview');
    setAction(null)
  }

  // Portfolio mode: render portfolio view instead of single property
  if (fieldActivity?.portfolioMode) return <PortfolioCards />;

  return (
      <>
      <motion.div
        initial={{ y: -300 }}
        animate={motionAnimate}
        drag="y"
        dragConstraints={{ top: -500, bottom: 150 }}
        dragListener={false}
        dragControls={controls}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          if (fieldActivity?.selectMode && info.offset.y < -50) {
            setFieldActivity(prev => prev ? { ...prev, selectMode: false } : prev);
          }
          if (info.offset.y > 100 && (action || showAdvice)) {
            setAction(null);
            setShowAdvice(false);
            motionAnimate.start({ y: 0, transition: springTransition });
          }
        }}
        style={{ touchAction: 'none' }}
        className="flex flex-col py-4 mb-96"
      >
        {/* Cycle nav — above the card, moves with it */}
        {action !== 'season' && record?.cycles && Object.keys(record.cycles).length > 0 && (
          <CycleSwiper record={record} onCycleChange={handleCycleChange} onCurrentRestore={handleCurrentRestore} />
        )}
        {/* ── Section 1: Field status ── */}
        {action !== 'season' && (() => {
          const isFallowField = !record?.current_cycle && record?.clusters?.features?.length === 0;
          // Include record.current_cycle: Wallet.js sets activeCycle from it, but record may arrive after render
          const hasActiveCycle = (fieldActivity?.activeCycle?.length ?? 0) > 0
            || (record?.current_cycle?.length ?? 0) > 0;
          const anyFoodToken = (tokenData ?? []).some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0);
          // Gate: only render once Wallet.js has processed record+tokenData for THIS field.
          // fieldActivity.recordToken is stamped by Wallet.js's useEffect — prevents stale
          // activeCycle from a previous field triggering the wrong state.
          if (!record || fieldActivity?.recordToken !== tokenId) return null;
          // ac: prefer EO-derived activeCycle, fall back to backend current_cycle
          const ac = fieldActivity?.activeCycle?.[0] ?? record?.current_cycle?.[0] ?? null;
          // tokenData is guaranteed non-null here (recordToken gate only unlocks after tokenData is fetched)
          // Deduplicate by cropCode to match the ordering of foodTokenDominants in Wallet.js (cardIx aligns).
          const activeFoodTokens = Object.values(
            (tokenData ?? [])
              .filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)
              .reduce((acc, t) => { const k = t.cropCode ?? t.sym; if (!acc[k]) acc[k] = t; return acc; }, {})
          );
          // Only show the panel for the currently selected cultivation card
          const visibleFoodTokens = cardIx != null ? activeFoodTokens.slice(cardIx, cardIx + 1) : activeFoodTokens;
          const recordCropLower = ac?.crop_type?.toLowerCase() ?? null;

          // fieldState for non-food-token paths only (states 1 and 2)
          let fieldState;
          if (anyFoodToken) fieldState = 'food';
          else if (hasActiveCycle) fieldState = 2;
          else fieldState = 1;
          const eos = ac?.predicted_eos;
          const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';
          const harvestText = eos?.length ? `${fmtDate(eos[0])}${eos[1] ? ` → ${fmtDate(eos[1])}` : ''}` : null;
          const daysToHarvest = eos?.[0] ? Math.round((new Date(eos[0]) - new Date()) / 86400000) : null;
          const formatHarvestDate = (iso) => {
            if (!iso) return null;
            const d = new Date(iso + 'T00:00:00Z');
            const day = d.getUTCDate();
            const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
            const year = d.getUTCFullYear();
            const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late';
            const yearStr = year !== new Date().getFullYear() ? ` '${String(year).slice(2)}` : '';
            return `${part} ${month}${yearStr}`;
          };
          const healthColor = ac?.health === 'stressed' ? 'text-amber-500' : ac?.health === 'poor' ? 'text-red' : 'text-green dark:text-amber-400';

          const isBatchFeasible = (b) => {
            if (!b.deliveryDate || b.deliveryDate === 0) return true;
            const growDays = TYPICAL_GROW_DAYS[b.cropCode] ?? 100;
            return Date.now() / 1000 + growDays * 86400 < b.deliveryDate;
          };

          const areaM2 = record?.meta?.parcel_area_m2 ?? 0;
          const areaAcres = areaM2 / 4046.86;
          const effectiveAcres = areaAcres * 0.85;

          const effectiveCropType = override?.cropType ?? ac?.crop_type;
          const isManual = !!override?.cropType;
          const overrideCropCode = isManual
            ? (CROPS_DATA.find(([, n]) => n === override.cropType)?.[0] ?? null)
            : null;
          const matchingBatches = (batchSummary?.active ?? [])
            .filter(b => (CROP_CODE_NAMES[b.cropCode] ?? '').toLowerCase() === (effectiveCropType ?? '').toLowerCase())
            .filter(b => isBatchFeasible(b))
            .sort((a, bb) => Number(bb.pricePerKgUsdt ?? 0) - Number(a.pricePerKgUsdt ?? 0));
          const bestBatch = matchingBatches[0] ?? null;

          const variety = ac?.variety ?? record?.current_cycle?.[0]?.variety ?? null;

          return (
          <div style={{ zIndex: 0 }} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1">
            <div
              onPointerDown={(e) => controls.start(e)}
              onTouchStart={(e) => { startYRef.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => { if (e.changedTouches[0].clientY - startYRef.current > 25) close(); }}
              className="h-10 w-full select-none cursor-grab active:cursor-grabbing flex justify-center items-center"
            >
              <span className="h-1 w-16 rounded-full bg-slate-300 dark:bg-slate-500" />
            </div>
            <div className="flex flex-col px-6 pb-6" onPointerDown={(e) => controls.start(e)}>

              {/* Header row */}
              <div className="flex items-start justify-between px-4">
                <div>
                  <h3 className='font-bold dark:text-white'>{db['farmname']}</h3>
                  <p className='text-[10px] dark:text-slate-500'>&#9888; Beta — data may be inaccurate</p>
                </div>
              </div>

              {loading && <Spinner size='small' stages={'loading latest records'} />}

              {/* ── State 1: Fallow — available batches with earnings ── */}
              {fieldState === 1 && (
                <div className="px-4 pt-3 flex flex-col gap-2">
                  <DormantCard record={record} />
                  {!batchSummary ? null : batchSummary.active.length === 0 ? (
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 pt-1">No active batches from your union yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2 pt-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Recommended batch</p>
                      <div className="flex flex-col gap-2">
                        {batchSummary.active.map(b => {
                          const feasible = isBatchFeasible(b);
                          const typicalKg = (TYPICAL_KG_ACRE_BATCH[b.cropCode] ?? 1000) * effectiveAcres;
                          const pricePerKg = Number(b.pricePerKgUsdt ?? 0) / 1e6;
                          const earnings = pricePerKg > 0 && effectiveAcres > 0 ? Math.round(typicalKg * pricePerKg) : null;
                          const deliveryStr = b.deliveryDate > 0
                            ? new Date(b.deliveryDate * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' })
                            : null;
                          const batchIconSrc   = cropIconUrl(b.cropName);
                          const batchCropColor = cropColor(b.cropName);
                          const pickBatch = () => {
                            if (!feasible) return;
                            const match = CROPS_DATA.find(c => c[1].toLowerCase() === (b.cropName ?? '').toLowerCase());
                            setForm(prev => ({ ...prev, ...(match ? { crop: match, var: '' } : {}), selectedBatch: b }));
                            setActiveBatchCert(null);
                            setAction('season');
                            setCardView('transactionview');
                          };
                          return (
                            <button
                              key={b.id}
                              onPointerDown={e => e.stopPropagation()}
                              onClick={pickBatch}
                              disabled={!feasible}
                              className={`py-6 w-full flex flex-col items-center justify-center gap-2 rounded-xl border select-none active:scale-95 ${feasible ? 'border-gray-200 dark:border-slate-600' : 'border-gray-100 dark:border-slate-700 opacity-40'}`}
                            >
                              <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: batchCropColor }}>
                                {batchIconSrc && (
                                  <div className="w-10 h-10" style={{
                                    WebkitMaskImage: `url(${batchIconSrc})`,
                                    maskImage: `url(${batchIconSrc})`,
                                    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                                    WebkitMaskSize: 'contain', maskSize: 'contain',
                                    WebkitMaskPosition: 'center', maskPosition: 'center',
                                    backgroundColor: 'black',
                                  }} />
                                )}
                              </div>
                              <span className="text-sm font-semibold dark:text-white">{b.cropName}</span>
                              {earnings != null ? (
                                <span className="text-sm font-bold dark:text-white">₹{earnings.toLocaleString('en-IN')}</span>
                              ) : (
                                <span className="text-xs text-gray-400 dark:text-slate-500">no price set</span>
                              )}
                              {deliveryStr && (
                                <span className="text-[10px] text-gray-400 dark:text-slate-500">
                                  {feasible ? `by ${deliveryStr}` : `too late · ${deliveryStr}`}
                                </span>
                              )}
                              {effectiveAcres > 0 && (
                                <span className="text-[10px] text-gray-400 dark:text-slate-500">
                                  Est. on {effectiveAcres.toFixed(2)} ac (85%)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-slate-300 leading-relaxed flex gap-1.5 pt-1">
                        <span className="flex-shrink-0">⚠️</span>
                        <span>Not grow advice. Always discuss with your local agricultural office what should be grown on your land.</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── State 2: Active cycle, no food token ── */}
              {fieldState === 2 && ac && (
                <div className="flex flex-col gap-1.5 px-4 pt-3">
                  {showOverride && (
                    <div className="flex flex-col gap-2 py-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 mb-1">
                      <div ref={overrideCropRef} className="relative">
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => setOverrideCropOpen(o => !o)}
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-left flex items-center justify-between"
                        >
                          <span>{override?.cropType ?? `detected: ${ac.crop_type}`}</span>
                          <ChevronDownIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${overrideCropOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {overrideCropOpen && (
                          <div className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg overflow-auto max-h-48">
                            <button
                              key="__detected__"
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => { setOverride(prev => { const n = { ...(prev ?? {}) }; delete n.cropType; return Object.keys(n).length ? n : null; }); setOverrideCropOpen(false); setShowOverride(false); }}
                              className={`w-full text-left text-xs px-3 py-1.5 dark:text-white ${!override?.cropType ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                            >detected: {ac.crop_type}</button>
                            {CROPS_DATA.map(([code, name]) => (
                              <button
                                key={code}
                                onPointerDown={e => e.stopPropagation()}
                                onClick={() => { setOverride(prev => ({ ...(prev ?? {}), cropType: name })); setOverrideCropOpen(false); setShowOverride(false); }}
                                className={`w-full text-left text-xs px-3 py-1.5 dark:text-white ${override?.cropType === name ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                              >{name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 flex-shrink-0" style={{
                        WebkitMaskImage: `url(${cropIconUrl(effectiveCropType)})`,
                        maskImage: `url(${cropIconUrl(effectiveCropType)})`,
                        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain', maskSize: 'contain',
                        WebkitMaskPosition: 'center', maskPosition: 'center',
                        backgroundColor: anyFoodToken ? cropColor(effectiveCropType ?? '') : '#9ca3af',
                      }} />
                      <span className="text-sm font-semibold dark:text-white">{effectiveCropType}</span>
                      <span className={`text-[10px] ${isManual ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}>
                        {isManual ? 'manual' : 'est.'}
                      </span>
                    </div>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setShowOverride(v => !v)}
                      className="text-[10px] text-blue-500 dark:text-blue-400 flex-shrink-0"
                    >Not {effectiveCropType}?</button>
                  </div>
                  <div className="flex flex-col gap-1 text-xs pt-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1">Season</p>
                    {(override?.sos ?? ac.sos) && (
                      <div className="flex justify-between pt-1">
                        <span className="text-gray-500 dark:text-slate-400">Start of season</span>
                        <span className="font-bold dark:text-white">
                          {formatHarvestDate(override?.sos ?? ac.sos) ?? (override?.sos ?? ac.sos)}
                        </span>
                      </div>
                    )}
                    {!isManual && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Harvest</span>
                        <span className="font-bold dark:text-white">
                          {daysToHarvest != null && daysToHarvest > 0
                            ? `${daysToHarvest}d · ${formatHarvestDate(eos?.[0]) ?? harvestText ?? '—'}`
                            : formatHarvestDate(eos?.[0]) ?? harvestText ?? '—'}
                        </span>
                      </div>
                    )}
                    {!isManual && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Est. yield</span>
                        <span className="font-bold dark:text-white">{ac.expected_yield_kg_acre ? `${ac.expected_yield_kg_acre} kg/acre` : '—'}</span>
                      </div>
                    )}
                    {!isManual && ac.stage && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Stage</span>
                        <span className="font-bold dark:text-white">{ac.stage}</span>
                      </div>
                    )}
                    {!isManual && ac.health && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Health</span>
                        <span className={`font-bold ${healthColor}`}>{ac.health}</span>
                      </div>
                    )}
                    {isManual && (
                      <p className="text-[10px] text-gray-400 dark:text-slate-300 leading-relaxed flex gap-1.5 pt-1">
                        <span className="flex-shrink-0">⚠️</span>
                        <span>Thanks for the update. We will review our prediction as soon as possible.</span>
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {bestBatch ? (() => {
                      const feasible = isBatchFeasible(bestBatch);
                      const typicalKg = (!isManual && ac.expected_yield_kg_acre)
                        ? ac.expected_yield_kg_acre * effectiveAcres
                        : (TYPICAL_KG_ACRE_BATCH[bestBatch.cropCode] ?? 1000) * effectiveAcres;
                      const pricePerKg = Number(bestBatch.pricePerKgUsdt ?? 0) / 1e6;
                      const earnings = pricePerKg > 0 && effectiveAcres > 0 ? Math.round(typicalKg * pricePerKg) : null;
                      const deliveryStr = bestBatch.deliveryDate > 0
                        ? new Date(bestBatch.deliveryDate * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' })
                        : null;
                      const batchIconSrc   = cropIconUrl(bestBatch.cropName);
                      const batchCropColor = cropColor(bestBatch.cropName);
                      return (
                        <>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Recommended batch</p>
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onClick={() => {
                              if (!feasible) return;
                              const match = CROPS_DATA.find(c => c[1].toLowerCase() === (bestBatch.cropName ?? '').toLowerCase());
                              setForm(prev => ({ ...prev, ...(match ? { crop: match, var: '' } : {}), selectedBatch: bestBatch }));
                              setActiveBatchCert(null);
                              setAction('season');
                              setCardView('transactionview');
                            }}
                            disabled={!feasible}
                            className={`py-6 w-full flex flex-col items-center justify-center gap-2 rounded-xl border select-none active:scale-95 ${feasible ? 'border-gray-200 dark:border-slate-600' : 'border-gray-100 dark:border-slate-700 opacity-40'}`}
                          >
                            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: batchCropColor }}>
                              {batchIconSrc && (
                                <div className="w-10 h-10" style={{
                                  WebkitMaskImage: `url(${batchIconSrc})`,
                                  maskImage: `url(${batchIconSrc})`,
                                  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                                  WebkitMaskSize: 'contain', maskSize: 'contain',
                                  WebkitMaskPosition: 'center', maskPosition: 'center',
                                  backgroundColor: 'black',
                                }} />
                              )}
                            </div>
                            <span className="text-sm font-semibold dark:text-white">{bestBatch.cropName}</span>
                            {earnings != null ? (
                              <span className="text-sm font-bold dark:text-white">₹{earnings.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">no price set</span>
                            )}
                            {deliveryStr && (
                              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                                {feasible ? `by ${deliveryStr}` : `too late · ${deliveryStr}`}
                              </span>
                            )}
                            {effectiveAcres > 0 && (
                              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                                Est. on {effectiveAcres.toFixed(2)} ac
                              </span>
                            )}
                          </button>
                          <p className="text-[10px] text-gray-400 dark:text-slate-300 leading-relaxed flex gap-1.5">
                            <span className="flex-shrink-0">⚠️</span>
                            <span>Not grow advice. Always discuss with your local agricultural office what should be grown on your land.</span>
                          </p>
                        </>
                      );
                    })() : (
                      <div className="flex flex-col gap-1">
                        <button disabled className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 opacity-50">
                          <span className="text-xs text-gray-400 dark:text-slate-400">No matching batch available</span>
                        </button>
                        <p className="text-[10px] text-gray-400 dark:text-slate-300 leading-relaxed flex gap-1.5">
                          <span className="flex-shrink-0">⚠️</span>
                          <span>Ask your union to create batches for {effectiveCropType}.</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Food token states: one panel per token (state 3 = matches satellite, state 4 = no match) ── */}
              {fieldState === 'food' && visibleFoodTokens.map(tok => {
                const tokCropName = CROP_CODE_NAMES[tok.cropCode] ?? tok.sym?.split('-')[0] ?? 'Crop';
                const tokMatchesSatellite = hasActiveCycle && tokCropName.toLowerCase() === recordCropLower;
                const tokUnit = CROP_UNIT[tok.cropCode] ?? { label: 'kg', toKg: 1 };
                const tokVariety = tok.varietyCode != null && tok.varietyCode !== 0
                  ? (CROP_VARIETIES[tok.cropCode]?.find(v => v.code === tok.varietyCode)?.name ?? null)
                  : null;
                const tokBatch = (batchSummary?.active ?? []).find(b => b.cropCode === tok.cropCode);
                const tokBatchId = tokBatch?.id ?? null;
                const tokSos = tokMatchesSatellite
                  ? (ac?.sos ?? null)
                  : (tok.sosTs ? new Date(tok.sosTs * 1000).toISOString().slice(0, 10) : null);
                const tokCropColor = cropColor(CROP_CODE_COLOR_KEY[tok.cropCode ?? -1] ?? tokCropName);

                if (tokMatchesSatellite && ac) {
                  // State 3: token confirmed by satellite — show full monitoring data
                  return (
                    <div key={`ft-s3-${tok.cropCode}`} className="flex flex-col gap-1.5 px-4 pt-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ac.crop_type && ac.crop_type !== 'unknown'
                          ? <div className="w-4 h-4 flex-shrink-0" style={{
                              WebkitMaskImage: `url(${cropIconUrl(ac.crop_type)})`,
                              maskImage: `url(${cropIconUrl(ac.crop_type)})`,
                              WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                              WebkitMaskSize: 'contain', maskSize: 'contain',
                              WebkitMaskPosition: 'center', maskPosition: 'center',
                              backgroundColor: cropColor(ac.crop_type),
                            }} />
                          : <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cropColor(ac.crop_type) }} />
                        }
                        <span className="text-sm font-semibold dark:text-white">{ac.crop_type}</span>
                        {tokBatchId != null && (
                          <span
                            className="text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: tokCropColor }}
                          >
                            part of batch #{tokBatchId}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs pt-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1">Season</p>
                        <div className="flex justify-between pt-1">
                          <span className="text-gray-500 dark:text-slate-400">Start of the season</span>
                          <span className="font-bold dark:text-white">{formatHarvestDate(ac.sos) ?? ac.sos ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Variety</span>
                          <span className="font-bold dark:text-white">{variety ?? tokVariety ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Tokens</span>
                          <span className="font-bold dark:text-white">{activeCropBalDisplay} {activeCropUnit.label}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Harvest</span>
                          <span className="font-bold dark:text-white">
                            {daysToHarvest != null && daysToHarvest > 0
                              ? `${daysToHarvest}d · ${formatHarvestDate(eos?.[0]) ?? harvestText ?? '—'}`
                              : formatHarvestDate(eos?.[0]) ?? harvestText ?? '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Est. yield</span>
                          <span className="font-bold dark:text-white">{ac.expected_yield_kg_acre ? `${ac.expected_yield_kg_acre} kg/acre` : '—'}</span>
                        </div>
                        {ac.stage && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Stage</span>
                            <span className="font-bold dark:text-white">{ac.stage}</span>
                          </div>
                        )}
                        {ac.health && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Health</span>
                            <span className={`font-bold ${healthColor}`}>{ac.health}</span>
                          </div>
                        )}
                        {ac.weather_summary?.total_rain_mm != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Rain</span>
                            <span className="font-bold dark:text-white">{ac.weather_summary.total_rain_mm} mm</span>
                          </div>
                        )}
                        {ac.weather_summary?.mean_soil_moisture != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Soil moisture</span>
                            <span className="font-bold dark:text-white">{Math.round(ac.weather_summary.mean_soil_moisture)} kg/m²</span>
                          </div>
                        )}
                        {ac.days_since_sos != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Days since sowing</span>
                            <span className="font-bold dark:text-white">{ac.days_since_sos}</span>
                          </div>
                        )}
                        {record?.scorecard?.rotation_pattern && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Rotation</span>
                            <span className="font-bold dark:text-white">{record.scorecard.rotation_pattern}</span>
                          </div>
                        )}
                        {record?.scorecard?.yield_trend && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Yield class</span>
                            <span className="font-bold dark:text-white">{record.scorecard.yield_trend}</span>
                          </div>
                        )}
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-2">Advice</p>
                        <div className="flex justify-between pt-1">
                          <span className="text-gray-500 dark:text-slate-400">Stage</span>
                          <span className="font-bold dark:text-white">{ac.stage_description ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Health</span>
                          <span className="font-bold dark:text-white">{ac.health_description ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Yield outlook</span>
                          <span className="font-bold dark:text-white">{ac.yield_description ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Water</span>
                          <span className="font-bold dark:text-white">{ac.water_advice ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Fertilizer</span>
                          <span className="font-bold dark:text-white">{ac.fertilizer_advice ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Weeding</span>
                          <span className="font-bold dark:text-white">{ac.weeding_advice ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // State 4: token has no matching satellite cycle — show token data only
                return (
                  <div key={`ft-s4-${tok.cropCode}`} className="flex flex-col gap-2 px-4 pt-3">
                    <div className="flex items-center gap-2">
                      {tokCropName && tokCropName !== 'unknown'
                        ? <div className="w-4 h-4 flex-shrink-0" style={{
                            WebkitMaskImage: `url(${cropIconUrl(tokCropName)})`,
                            maskImage: `url(${cropIconUrl(tokCropName)})`,
                            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                            WebkitMaskSize: 'contain', maskSize: 'contain',
                            WebkitMaskPosition: 'center', maskPosition: 'center',
                            backgroundColor: tokCropColor,
                          }} />
                        : <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tokCropColor }} />
                      }
                      <span className="text-sm font-semibold dark:text-white">{tokCropName}</span>
                      <span
                        className="text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: tokCropColor }}
                      >
                        {tokBatchId != null ? `part of batch #${tokBatchId}` : 'attested'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs pt-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1">Season</p>
                      <div className="flex justify-between pt-1">
                        <span className="text-gray-500 dark:text-slate-400">Start of the season</span>
                        <span className="font-bold dark:text-white">{formatHarvestDate(tokSos) ?? tokSos ?? '—'}</span>
                      </div>
                      {tokVariety && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Variety</span>
                          <span className="font-bold dark:text-white">{tokVariety}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Tokens</span>
                        <span className="font-bold dark:text-white">
                          {(tok.bal / tokUnit.toKg).toLocaleString('en-IN', { maximumFractionDigits: 1 })} {tokUnit.label}
                        </span>
                      </div>
                    </div>
                    <button
                      disabled
                      onPointerDown={e => e.stopPropagation()}
                      className="mt-2 w-full text-[10px] text-gray-400 dark:text-slate-500 py-2.5 px-3 rounded-xl border border-gray-100 dark:border-slate-700 text-center"
                    >
                      🛰 Records will update on the next satellite overpass
                    </button>
                  </div>
                );
              })}

              {/* Cumulative history — shown in state 2 and when a token matches the satellite cycle */}
              {(fieldState === 2 || (fieldState === 'food' && visibleFoodTokens.some(t => hasActiveCycle && (CROP_CODE_NAMES[t.cropCode] ?? '').toLowerCase() === recordCropLower))) && record && (() => {
                const cycles = record.cycles ? Object.values(record.cycles) : [];
                const area = record.meta?.parcel_area_m2 || 0;
                const histAcres = area / 4046.86;
                const byCrop = {};
                cycles.forEach(c => {
                  const crop = c.crop_type || 'unknown';
                  if (!byCrop[crop]) byCrop[crop] = { total: 0, count: 0, withYield: 0, yieldSum: 0 };
                  byCrop[crop].count++;
                  if (c.yield_kg_per_acre != null) { byCrop[crop].withYield++; byCrop[crop].yieldSum += c.yield_kg_per_acre; }
                });
                Object.values(byCrop).forEach(b => {
                  const avg = b.withYield > 0 ? b.yieldSum / b.withYield : 0;
                  b.total = Math.round(avg * b.count * histAcres);
                });
                const years = cycles.map(c => c.sos?.slice(0, 4)).filter(Boolean);
                const sinceYear = years.length ? Math.min(...years.map(Number)) : null;
                if (!Object.keys(byCrop).length) return null;
                return (
                  <div className="flex flex-col gap-2 px-4 pt-3">
                    {sinceYear && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Since {sinceYear}</p>
                    )}
                    {Object.entries(byCrop).map(([crop, b]) => (
                      <div key={crop} className="flex justify-between">
                        <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                          {crop !== 'unknown'
                            ? <div className="w-3 h-3 flex-shrink-0" style={{
                                WebkitMaskImage: `url(${cropIconUrl(crop)})`,
                                maskImage: `url(${cropIconUrl(crop)})`,
                                WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                                WebkitMaskSize: 'contain', maskSize: 'contain',
                                WebkitMaskPosition: 'center', maskPosition: 'center',
                                backgroundColor: cropColor(crop),
                              }} />
                            : <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cropColor(crop) }} />
                          }
                          {crop} ({b.count}x)
                        </span>
                        <span className="text-xs font-bold dark:text-white">
                          {b.total > 1000 ? `${(b.total / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t` : `${b.total.toLocaleString('en-IN')} kg`}
                          {b.withYield < b.count && <span className="text-gray-400 dark:text-slate-500 ml-1">est.</span>}
                        </span>
                      </div>
                    ))}
                    <p className='flex text-[10px] text-gray-400 dark:text-slate-500 justify-end pt-1'>
                      {area > 0 ? `${Number(area).toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²` : ''}
                      {' · '}last overflight: {fieldActivity?.meta?.last_scene_date || record?.meta?.last_scene_date}
                    </p>
                  </div>
                );
              })()}

            </div>
          </div>
          );
        })()}

        {/* ── Section 3: Data fees ── */}
        {record && action !== 'season' && (
          <div style={{ zIndex: 0 }} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1 px-6 py-5 gap-2" onPointerDown={(e) => controls.start(e)}>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 flex-1">Your data earnings</p>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setShowDataInfo(v => !v)}
                className="text-gray-400 dark:text-slate-500 text-sm leading-none"
              >ⓘ</button>
            </div>
            {showDataInfo && (
              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                Each time someone reads your property history — a lender, a buyer, or the union — you earn a small fee in nIN. These are your rights as the data owner.
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400 dark:text-slate-500">Earned so far</span>
              {claimableFees != null && claimableFees >= 50n * 10n**18n ? (
                <button onClick={claimViewFees} className="text-xs font-bold px-4 py-1.5 rounded-xl bg-green-600 text-white active:bg-green-700">
                  Claim {Number(claimableFees / 10n**14n) / 10000} nIN
                </button>
              ) : (
                <span className="text-xs font-bold dark:text-white">
                  {claimableFees != null && claimableFees > 0n ? `${Number(claimableFees / 10n**14n) / 10000} nIN` : claimableFees === 0n ? '0 nIN' : '—'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Section 2: Actions ── */}
        {(() => {
          if (!record) return (
            <div style={{ zIndex: 0 }} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1 px-6 py-5" onPointerDown={(e) => controls.start(e)}>
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center">Setting up your field data. This usually takes 1–2 days after your land title is registered.</p>
            </div>
          );
          const isFallow = !record?.current_cycle && record?.clusters?.features?.length === 0;
          const isActive = !isFallow && (clusterGroups.length > 0 || record?.current_cycle);
          const primaryLabel = isFallow ? 'New season' : 'Set crop';
          const btn = "px-4 py-2 rounded-lg text-xs font-bold active:scale-95 border bg-white dark:bg-slate-700 text-black dark:text-white border-gray-200 dark:border-slate-600";

          const VARS = Object.fromEntries(
            Object.entries(CROP_VARIETIES).map(([code, vars]) => [
              code, vars.map(v => [String(v.code), v.name]),
            ])
          );

          return (
          <div
            style={{ zIndex: 0 }}
            className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1 px-6 py-4 gap-2"
            onPointerDown={(e) => controls.start(e)}
          >
            <div className="flex justify-center pb-1">
              <div className="w-8 h-1 rounded-full bg-gray-300 dark:bg-slate-500" />
            </div>

            {!action && (
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => { setForm(prev => ({ ...prev, selectedBatch: null, crop: '', var: '' })); setActiveBatchCert(null); setAction('season'); setCardView('transactionview'); }}>
                  {isFallow ? 'New season' : 'Join batch'}
                </button>
              </div>
            )}

            {/* Selected batch chip — shown when a batch is pre-selected (shortcut) or picked from list */}
            {action === 'season' && form.selectedBatch && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Selected batch</p>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black dark:border-white bg-black dark:bg-slate-900">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cropColor(form.selectedBatch.cropColorKey ?? form.selectedBatch.cropCode) }} />
                  <span className="text-xs text-white font-semibold flex-1">{form.selectedBatch.cropName}</span>
                  {form.selectedBatch.displayCode && (
                    <span className="text-[10px] text-gray-400 font-mono">{form.selectedBatch.displayCode}</span>
                  )}
                  {form.selectedBatch.deliveryDate > 0 && (
                    <span className="text-[10px] text-gray-300">
                      {new Date(form.selectedBatch.deliveryDate * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {form.selectedBatch.requiredCerts > 0 && (
                    <div className="flex items-center gap-1">
                      {CERT_IMAGES.map((img, i) =>
                        (form.selectedBatch.requiredCerts & (1 << i)) !== 0 ? (
                          <button
                            key={i}
                            onPointerDown={e => e.stopPropagation()}
                            onClick={() => setActiveBatchCert(activeBatchCert === i ? null : i)}
                            className={`rounded-full focus:outline-none ${activeBatchCert === i ? 'ring-2 ring-offset-1 ring-white' : ''}`}
                          >
                            <img src={img} alt={CERT_NAMES[i]} className="h-5 w-5 rounded-full object-cover" />
                          </button>
                        ) : null
                      )}
                    </div>
                  )}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => { setForm(prev => ({ ...prev, selectedBatch: null, crop: '', var: '' })); setActiveBatchCert(null); }}
                    className="text-gray-400 text-sm px-1 active:scale-95"
                  >✕</button>
                </div>
                {activeBatchCert !== null && (
                  <p className="text-[10px] text-gray-400 dark:text-slate-400 px-1">{CERT_NAMES[activeBatchCert]}</p>
                )}

              </div>
            )}

            {/* Open batch list — only shown when no batch is selected yet */}
            {action === 'season' && batchSummary?.active?.length > 0 && !form.selectedBatch && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">{isFallow ? 'New season' : 'Join batch'}</p>
                <p className="text-xs dark:text-slate-300">Select a batch:</p>
                {batchSummary.active.map(b => {
                  const dot = cropColor(b.cropColorKey ?? b.cropCode);
                  const pickBatch = () => {
                    const match = CROPS_DATA.find(c => c[1].toLowerCase() === (b.cropName ?? '').toLowerCase());
                    setForm(prev => ({ ...prev, ...(match ? { crop: match, var: '' } : {}), selectedBatch: b }));
                    setActiveBatchCert(null);
                  };
                  const hasCerts = b.requiredCerts > 0;
                  return (
                    <div key={b.id} className="flex flex-col gap-1">
                      <div
                        onPointerDown={e => e.stopPropagation()}
                        onClick={pickBatch}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 cursor-pointer active:scale-95 transition-transform select-none"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                        <span className="text-xs text-gray-600 dark:text-slate-300 flex-1">{b.cropName}</span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">#{b.id}</span>
                        {b.displayCode && (
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">{b.displayCode}</span>
                        )}
                        {b.deliveryDate > 0 && (
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">
                            {new Date(b.deliveryDate * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {hasCerts && (
                          <div className="flex items-center gap-1">
                            {CERT_IMAGES.map((img, i) =>
                              (b.requiredCerts & (1 << i)) !== 0 ? (
                                <button
                                  key={i}
                                  type="button"
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={e => { e.stopPropagation(); setActiveBatchCert(activeBatchCert === i ? null : i); }}
                                  className={`rounded-full focus:outline-none ${activeBatchCert === i ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-slate-400' : ''}`}
                                >
                                  <img src={img} alt={CERT_NAMES[i]} className="h-5 w-5 rounded-full object-cover" />
                                </button>
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                      {activeBatchCert !== null && (b.requiredCerts & (1 << activeBatchCert)) !== 0 && (
                        <p className="text-[10px] text-gray-400 dark:text-slate-400 px-1">{CERT_NAMES[activeBatchCert]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* No batches empty state */}
            {action === 'season' && !form.selectedBatch && batchSummary && batchSummary.active.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-slate-500 pt-1">Your union has not created any crop batches. Ask them to add a new batch for the crops you are growing.</p>
            )}

            {action === 'season' && (() => {
              const activeFTs = (tokenData ?? []).filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0);
              const fullPropToken = activeFTs.find(t => t.fieldNumber === 0);
              const entirePropertyPlanted = !!fullPropToken;
              return (
              <div className="flex flex-col gap-3 pt-1">
                {form.selectedBatch && (
                  <>
                    <p className="text-xs dark:text-slate-300">Area</p>
                    {entirePropertyPlanted ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        All fields planted · {fullPropToken.sym.replace('-', ' ')}
                      </p>
                    ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setForm(prev => ({...prev, coverage: 'full'}))}
                        className={`flex-1 text-xs px-3 py-1.5 rounded-lg border ${form.coverage === 'full' ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-semibold' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white'}`}
                      >Entire property</button>
                      <button
                        onClick={() => {
                          setForm(prev => ({...prev, coverage: 'partial', selectedClusters: []}));
                          setCardView('mapview');
                          if (record?.per_cycle_clusters) {
                            const sortedKeys = Object.keys(record.per_cycle_clusters)
                              .sort((a, b) => parseInt(b.split('_')[1]) - parseInt(a.split('_')[1]));
                            const seen = new Set();
                            const allFeats = [];
                            for (const k of sortedKeys) {
                              const feats = record.per_cycle_clusters[k]?.features || [];
                              for (const f of feats) {
                                const cid = f.properties?.cluster_id;
                                if (cid != null && !seen.has(cid)) {
                                  seen.add(cid);
                                  allFeats.push({...f, properties: {...f.properties, activity: 'selectable', selected: false}});
                                }
                              }
                            }
                            if (allFeats.length) {
                              setFieldActivity(prev => ({
                                ...prev,
                                features: allFeats,
                                geojson: { type: 'FeatureCollection', features: allFeats },
                                featurelength: allFeats.length,
                                dormant: false,
                                historical: false,
                                selectMode: true,
                              }));
                            }
                          } else if (record?.clusters?.features?.length) {
                            const allFeats = record.clusters.features.map(f => ({
                              ...f,
                              properties: { ...f.properties, activity: 'selectable', selected: false },
                            }));
                            setFieldActivity(prev => ({
                              ...prev,
                              features: allFeats,
                              geojson: { type: 'FeatureCollection', features: allFeats },
                              featurelength: allFeats.length,
                              dormant: false,
                              historical: false,
                              selectMode: true,
                            }));
                          }
                        }}
                        className={`flex-1 text-xs px-3 py-1.5 rounded-lg border ${(form.coverage === 'partial' || form.coverage === 'confirmed') ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-semibold' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white'}`}
                      >Select fields</button>
                    </div>
                    )}
                    {form.coverage === 'partial' && (
                      <p className="text-[10px] dark:text-slate-500">
                        {form.selectedClusters?.length > 0
                          ? `${form.selectedClusters.length} area(s) selected — confirm on map`
                          : 'Tap areas on the map'}
                      </p>
                    )}
                    {form.coverage === 'full' && (
                      <p className="text-[10px] text-green-600 dark:text-green-400">
                        {((record?.meta?.parcel_area_m2 ?? 0) / 4046.86).toFixed(1)} ac — entire property
                      </p>
                    )}
                    {form.coverage === 'confirmed' && form.selectedClusters?.length > 0 && (
                      <p className="text-[10px] text-green dark:text-amber-400">
                        {form.selectedClusters.length} area(s) confirmed · {(
                          (fieldActivity?.features ?? record?.clusters?.features ?? [])
                            .filter(f => new Set(form.selectedClusters).has(f.properties?.cluster_id))
                            .reduce((s, f) => s + (Number(f.properties?.area_m2) || 0), 0) / 4046.86
                        ).toFixed(1)} ac
                      </p>
                    )}
                  </>
                )}

                {form.crop && (
                  <>
                    <p className="text-xs dark:text-slate-300">Variety</p>
                    {form.selectedBatch?.varietyCode !== 0 ? (() => {
                      const pinnedVar = CROP_VARIETIES[form.selectedBatch.cropCode]?.find(v => v.code === form.selectedBatch.varietyCode);
                      const varEntry = pinnedVar ? [String(pinnedVar.code), pinnedVar.name] : null;
                      return form.var ? (
                        <p className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white">
                          This batch only selects variety <span className="font-semibold">{form.var[1]}</span>
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {varEntry && (
                            <button
                              onClick={() => setForm(prev => ({ ...prev, var: varEntry }))}
                              className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-400 bg-white dark:bg-slate-700 dark:text-white font-semibold active:scale-95"
                            >
                              I am growing {varEntry[1]}
                            </button>
                          )}
                        </div>
                      );
                    })() : (
                      <div ref={varRef} className="relative">
                        <button
                          onClick={() => setVarOpen(o => !o)}
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-left flex items-center justify-between"
                        >
                          <span>{form.var ? form.var[1] : 'Select variety'}</span>
                          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${varOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {varOpen && (
                          <div className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg overflow-hidden">
                            {VARS[form.crop[0]].map((opt) => (
                              <button key={opt[0]}
                                onClick={() => { setForm(prev => ({...prev, var: opt})); setVarOpen(false); }}
                                className={`w-full text-left text-xs px-3 py-1.5 dark:text-white ${form.var?.[0] === opt[0] ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                              >{opt[1]}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {form.crop && (() => {
                  const oracleSos = record?.current_cycle?.[0]?.sos;
                  const hasCaseA  = !!oracleSos;
                  const sosTs     = form.sos ? Math.floor(new Date(form.sos + 'T00:00:00Z').getTime() / 1000) : 0;
                  const daysSinceSOS = sosTs > 0 ? Math.floor((Date.now() / 1000 - sosTs) / 86400) : null;
                  const stageLabel = daysSinceSOS === null ? null
                    : daysSinceSOS <= 14  ? 'Seedling / Transplanting'
                    : daysSinceSOS <= 45  ? 'Vegetative / Tillering'
                    : daysSinceSOS <= 85  ? 'Reproductive'
                    : daysSinceSOS <= 110 ? 'Grain Filling'
                    : 'Harvest Ready';
                  const oracleSosFormatted = oracleSos
                    ? new Date(oracleSos + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
                    : null;
                  const oracleDaysAgo = oracleSos
                    ? Math.floor((Date.now() - new Date(oracleSos + 'T00:00:00Z').getTime()) / 86400000)
                    : null;
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const minSosStr = new Date(Date.now() - 270 * 86400000).toISOString().slice(0, 10);
                  const confirmed = hasCaseA && form.sos === oracleSos && !form.sosEditing;

                  return (
                    <>
                      <p className="text-xs dark:text-slate-300">Start of season</p>

                      {hasCaseA && !form.sosEditing ? (
                        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                          <p className="text-xs dark:text-white">
                            We detected planting on <span className="font-semibold">{oracleSosFormatted}</span>
                            {oracleDaysAgo != null ? ` — ${oracleDaysAgo}d ago` : ''}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setForm(prev => ({ ...prev, sosEditing: true }))}
                              className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white active:scale-95"
                            >Correct date</button>
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setForm(prev => ({ ...prev, sos: oracleSos, sosEditing: false }))}
                              className={`text-xs px-3 py-1 rounded-lg active:scale-95 ${confirmed ? 'bg-green-600 text-white' : 'border border-green-600 text-green-700 dark:text-green-400 bg-white dark:bg-slate-700'}`}
                            >{confirmed ? '✓ Confirmed' : 'Confirm ✓'}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {!hasCaseA && <p className="text-[10px] text-gray-500 dark:text-slate-400">When did you plant?</p>}
                          <div className="flex gap-2">
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setForm(prev => ({ ...prev, sos: todayStr, sosEditing: false }))}
                              className={`text-xs px-3 py-1.5 rounded-lg border active:scale-95 flex-shrink-0 ${form.sos === todayStr ? 'bg-black dark:bg-white text-white dark:text-gray-800 border-black dark:border-white font-semibold' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white'}`}
                            >Today</button>
                            <input
                              type="date"
                              value={form.sos}
                              max={todayStr}
                              min={minSosStr}
                              onPointerDown={e => e.stopPropagation()}
                              onChange={e => setForm(prev => ({ ...prev, sos: e.target.value, sosEditing: false }))}
                              className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white dark:[color-scheme:dark] px-3 py-1.5"
                            />
                          </div>
                          {hasCaseA && form.sosEditing && (
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setForm(prev => ({ ...prev, sos: oracleSos, sosEditing: false }))}
                              className="text-[10px] text-gray-400 dark:text-slate-500 underline text-left"
                            >← Back to oracle date</button>
                          )}
                        </div>
                      )}

                      {stageLabel && (
                        <p className="text-[10px] text-gray-400 dark:text-slate-500">
                          Your crop is in <span className="font-medium dark:text-slate-400">{stageLabel}</span> stage
                        </p>
                      )}
                    </>
                  );
                })()}

                {form.selectedBatch && (() => {
                  const unit              = CROP_UNIT[form.selectedBatch.cropCode] ?? { label: 'kg', toKg: 1 };
                  const hasCertReqs       = form.selectedBatch.requiredCerts > 0;
                  const varietyRequired   = (form.selectedBatch?.varietyCode ?? 0) !== 0;

                  const areaAcres         = (record?.meta?.parcel_area_m2 ?? 0) / 4046.86;
                  const activeCycleCrop   = (fieldActivity?.activeCycle?.[0]?.crop_type ?? '').toLowerCase();
                  const batchCropName     = (CROP_CODE_NAMES[form.selectedBatch.cropCode] ?? '').toLowerCase();
                  const cycleMatchesBatch = activeCycleCrop && batchCropName && activeCycleCrop === batchCropName;
                  const activeCycleYieldKg = cycleMatchesBatch
                    ? Math.round((fieldActivity.activeCycle[0].expected_yield_kg_acre ?? 0) * areaAcres)
                    : 0;
                  const hasEstimate       = activeCycleYieldKg > 0;

                  // Fallback yield for slider range when no active-cycle estimate.
                  // Priority: historical cycles for same crop → typical yield for crop type.
                  const TYPICAL_KG_ACRE   = { 0:1800, 1:750, 2:30000, 3:8000, 4:7000, 5:6000, 6:300, 7:12000 };
                  const historyCycles     = record?.cycles ? Object.values(record.cycles) : [];
                  const cropName          = (CROP_CODE_NAMES[form.selectedBatch.cropCode] ?? '').toLowerCase();
                  const sameCropYields    = historyCycles
                    .filter(c => (c.crop_type ?? '').toLowerCase() === cropName && c.yield_kg_per_acre != null)
                    .map(c => c.yield_kg_per_acre);
                  const histAvgPerAcre    = sameCropYields.length > 0
                    ? sameCropYields.reduce((s, v) => s + v, 0) / sameCropYields.length
                    : (TYPICAL_KG_ACRE[form.selectedBatch.cropCode] ?? 1000);
                  const fallbackYieldKg   = areaAcres > 0
                    ? Math.round(histAvgPerAcre * areaAcres)
                    : Math.round(histAvgPerAcre * 0.5);

                  const estimatedYieldKg  = hasEstimate ? activeCycleYieldKg : fallbackYieldKg;
                  const estimatedYieldUnits = Math.max(1, Math.round(estimatedYieldKg / unit.toKg));
                  const showSlider        = (!hasEstimate && form.yieldUnits == null) || editingYield;
                  const yieldConfirmed    = hasEstimate || form.yieldUnits != null;
                  const effectiveYieldUnits = form.yieldUnits ?? estimatedYieldUnits;
                  const effectiveYieldKg  = Math.max(1, Math.round(effectiveYieldUnits * unit.toKg));
                  const canJoin           = (!varietyRequired || !!form.var) && !!form.sos && (form.coverage === 'full' || form.coverage === 'confirmed');

                  const hasPrice          = form.selectedBatch.pricePerKgUsdt > 0n;
                  const priceINRperKg     = hasPrice ? Number(form.selectedBatch.pricePerKgUsdt) / 1e6 : 0;
                  const priceINRperUnit   = priceINRperKg * unit.toKg;
                  const earningsINR       = hasPrice ? Math.round(effectiveYieldKg * priceINRperKg) : null;

                  const title = hasEstimate && form.yieldUnits == null ? 'Estimated Yield' : 'Set the yield you expect (optional)';

                  const handleJoinBatch = async () => {
                    const sosTs = form.sos ? Math.floor(new Date(form.sos + 'T00:00:00Z').getTime() / 1000) : 0;
                    if (!foodToken || !form.selectedBatch || (varietyRequired && !form.var) || !sosTs) {
                      console.warn('[joinBatch] guard blocked', { foodToken: !!foodToken, batch: !!form.selectedBatch, variety: form.var, sosTs });
                      return;
                    }

                    // Compute field codex — fieldNumber=0 means entire property
                    const allFeatures = fieldActivity?.features ?? record?.clusters?.features ?? [];
                    let fieldNum = 0;
                    let fieldAreaM2 = 0;
                    if (form.coverage === 'confirmed' && form.selectedClusters?.length > 0) {
                      const sel = new Set(form.selectedClusters);
                      const picked = allFeatures.filter(f => sel.has(f.properties?.cluster_id));
                      fieldNum = Math.min(...form.selectedClusters);
                      fieldAreaM2 = Math.round(picked.reduce((s, f) => s + (Number(f.properties?.area_m2) || 0), 0));
                    } else {
                      fieldNum = 0;
                      fieldAreaM2 = Math.round(record?.meta?.parcel_area_m2 ?? 0);
                    }
                    console.log('[joinBatch] field codex', { fieldNum, fieldAreaM2, coverage: form.coverage });
                    const varPart = form.var ? ` variety ${form.var[1]}` : '';
                    const msg = `I confirm I am growing ${form.selectedBatch.cropName}${varPart} on the selected fields.`;
                    if (!window.confirm(msg)) return;
                    const landTitleId = LAND?.current?.LAND?.id;
                    if (!landTitleId) { console.warn('[joinBatch] no landTitleId'); return; }
                    const harvestTs = fieldActivity?.activeCycle?.[0]?.expected_harvest_date
                      ? Math.floor(new Date(fieldActivity.activeCycle[0].expected_harvest_date).getTime() / 1000)
                      : 0;
                    console.log('[joinBatch] start', {
                      batchId: form.selectedBatch.id,
                      landTitleId,
                      harvestTs,
                      effectiveYieldKg,
                      wallet: wallet.address,
                    });
                    setJoining(true);
                    const memberData = await foodToken.batchMembers(form.selectedBatch.id, wallet.address);
                    const alreadyJoined = memberData.status !== 0n;
                    console.log('[joinBatch] alreadyJoined:', alreadyJoined, 'memberData.status:', memberData.status);
                    if (!alreadyJoined) {
                      const receipt = await runTx(async () => {
                        const nonce = await wallet.provider.send('eth_getTransactionCount', [wallet.address, 'pending']);
                        console.log('[joinBatch] joinBatch nonce:', nonce);
                        return foodToken.joinBatch(form.selectedBatch.id, { nonce });
                      });
                      console.log('[joinBatch] joinBatch receipt:', receipt?.hash);
                      if (!receipt) { setJoining(false); return; }
                    }
                    await runTx(
                      async () => {
                        const nonce = await wallet.provider.send('eth_getTransactionCount', [wallet.address, 'pending']);
                        console.log('[joinBatch] mintForBatchMember nonce:', nonce, 'yieldKg:', effectiveYieldKg);
                        const farmerVarietyCode = form.var ? Number(form.var[0]) : 0;
                        return foodToken.mintForBatchMember(form.selectedBatch.id, landTitleId, harvestTs, effectiveYieldKg, fieldNum, fieldAreaM2, farmerVarietyCode, sosTs, { nonce });
                      },
                      {
                        onSuccess: (receipt) => {
                          console.log('[joinBatch] mint success, receipt:', receipt?.hash);
                          qc.invalidateQueries({ queryKey: ['balances'] });
                          qc.invalidateQueries({ queryKey: ['foodTokenBatches'] });
                          qc.invalidateQueries({ queryKey: ['tasks'] });
                          setCardView('transactionview');
                          setTimeout(() => { setIx(0); setCardView('default'); }, 600);
                        },
                        onSettled: () => setJoining(false),
                      }
                    );
                  };

                  const hasTokenForBatch = tokenData?.some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && t.cropCode === form.selectedBatch.cropCode);
                  const farmerTokenBal   = hasTokenForBatch
                    ? tokenData.filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && t.cropCode === form.selectedBatch.cropCode)
                               .reduce((s, t) => s + t.bal, 0)
                    : 0;
                  const farmerBalDisplay = unit ? (farmerTokenBal / unit.toKg).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : farmerTokenBal;

                  if (hasTokenForBatch) {
                    return (
                      <div className="mt-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-gray-500 dark:border-green-700 px-4 py-3 flex flex-col gap-1">
                        <p className="text-xs font-semibold text-green-700 dark:text-amber-400">Crop passport confirmed</p>
                        <p className="text-[10px] text-green-600 dark:text-white">
                          {farmerBalDisplay} {unit.label} of {form.selectedBatch.cropName.toLowerCase()} registered for this season.
                        </p>
                        {hasPrice && (
                          <p className="text-[10px] text-green-600 dark:text-white">
                            Estimated earnings: ₹{Math.round((farmerTokenBal / unit.toKg) * priceINRperUnit).toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                  <>
                  {showSlider ? (
                    <div className="mt-3 px-1">
                      <p className="text-xs text-gray-500 dark:text-slate-300 mb-1">{title}</p>
                      <div className="flex flex-col m-4 items-center">
                        <RateSlider
                          key={estimatedYieldUnits}
                          type="unit"
                          decimals={0}
                          min={1}
                          max={Math.max(effectiveYieldUnits * 3, 10)}
                          step={1}
                          initial={effectiveYieldUnits}
                          onChange={setYieldDraft}
                          onSet={() => { setForm(prev => ({ ...prev, yieldUnits: editingYield ? yieldDraft : effectiveYieldUnits })); setEditingYield(false); }}
                        />
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 -mt-2">
                          {unit.label}{hasPrice ? ` · ₹${priceINRperUnit.toFixed(0)}/${unit.label}` : ''}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between mt-3 px-1">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-slate-300">{title}</p>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold dark:text-white">{effectiveYieldUnits} {unit.label}</span>
                          {earningsINR && (
                            <span className="text-xs font-medium text-black dark:text-white">
                              ₹{earningsINR.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => { setEditingYield(true); setYieldDraft(effectiveYieldUnits); }}
                        className="text-[10px] text-blue-500 dark:text-blue-400"
                      >change</button>
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 dark:text-slate-300">What do I get?</p>
                    <div className="mt-1 p-3 rounded-xl bg-gray-50 dark:bg-slate-600/50">
                      <p className="text-[10px] dark:text-slate-300 leading-relaxed">
                        When you join you will receive a digital asset to:
                      </p>
                      <ul className="text-[10px] dark:text-slate-300 mt-1.5 ml-3 space-y-0.5">
                        <li>· Get better loan terms from your union</li>
                        <li>· Pre-sell your harvest at a locked price</li>
                        <li>· Join bulk growing plans for higher rates</li>
                      </ul>
                    </div>
                  </div>

                  {hasEstimate && form.yieldUnits != null &&
                    Math.abs(effectiveYieldUnits - estimatedYieldUnits) / estimatedYieldUnits > 0.20 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 px-1 flex gap-1">
                      <span>⚠</span>
                      <span>Your estimate diverges substantially from ours. {db?.union?.name ?? 'Your union'} can visit you to do a field analysis.</span>
                    </p>
                  )}

                  {hasCertReqs ? (
                    <CertStatusPanel
                      farmerAddress={db?.address}
                      requiredMask={form.selectedBatch.requiredCerts}
                      onJoin={handleJoinBatch}
                      joining={joining}
                      disabled={!canJoin}
                      onApplyCert={() => setIx(0)}
                    />
                  ) : (
                    <button
                      disabled={!canJoin}
                      onClick={handleJoinBatch}
                      className={`w-full py-3 rounded-xl text-sm font-bold mt-3 transition-opacity ${canJoin ? 'bg-black dark:bg-white text-white dark:text-gray-800 active:scale-95' : 'bg-black dark:bg-white text-white dark:text-gray-800 opacity-30 cursor-not-allowed'}`}
                    >
                      {joining ? 'Joining…' : canJoin ? 'Join batch' : !form.coverage ? 'Select area above' : form.coverage === 'partial' ? 'Confirm field selection' : !form.sos ? 'Add start of season' : 'Select variety to continue'}
                    </button>
                  )}
                  </>
                  );
                })()}
              </div>
          );
        })()}
          </div>
          );
        })()}
      </motion.div>
      </>
  )

}
