import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useDataContext, useNavContext, useViewModeContext } from '../../../utils/NavigationContext';
import useActivityMapping from '../../../hooks/useActivityMapping'
import { cropColor } from '../../../utils/cropColors.js';
import { motion, useDragControls, AnimatePresence } from 'framer-motion';
import { RateSlider, ClaimButton, DropdownButton } from '../../../components/UI/buttons';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import Spinner from '../../../components/UI/spinner.js';
import useLendingFlow from '../../../hooks/useDirectLendingFlow.js'
import { useMintFoodToken, useBurnLandTitle } from '../../../hooks/useMintLandTitle.ts'
import { useRecordHash } from '../../../hooks/useRecordHash.ts'

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
    <div className="px-4 pt-3 flex flex-col gap-1.5">
      <p className="text-sm font-semibold dark:text-white flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: dormantColor(status.ndvi) }} />
        Fallow
      </p>
      <div className="flex flex-col gap-0.5 text-xs dark:text-slate-300">
        <p>Surface: <span className="font-semibold dark:text-white">{status.surface}</span></p>
        <p>Soil: <span className="font-semibold dark:text-white">{status.moisture}</span></p>
        {status.ploughed && <p>{status.ploughed}</p>}
        {status.daysSinceCrop != null && (
          <p>Last crop ended <span className="font-semibold dark:text-white">{status.daysSinceCrop}d</span> ago</p>
        )}
      </div>
    </div>
  );
};


export const StaticCards = ({ LAND }) => {
  const [ action, setAction ]                  = useState(null)
  const [ loading, setLoading ]                = useState(true)
  const { db, fieldActivity,setFieldActivity } = useDataContext();
  const { setIx }                              = useNavContext();
  const { setTokenview, setCardView }          = useViewModeContext();
  const controls                               = useDragControls();
  const startYRef                              = useRef(0);

  const close = () => { setIx(null); setTokenview(false); setCardView('default'); };
  const [ selected, setSelected ]              = useState([])
  const [ form, setForm ]                      = useState({ crop: '', var: '', coverage: 'full' })
  const [ cropOpen, setCropOpen ]              = useState(false)
  const [ varOpen, setVarOpen ]                = useState(false)
  const cropRef                                = useRef(null)
  const varRef                                 = useRef(null)
  const { handleFieldActivity }                = useActivityMapping()
  const { burnLandTitle }                      = useBurnLandTitle(Number(process.env.REACT_APP_CHAIN_ID) || 137);

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
      meta: { ...prev?.meta, last_scene_date: record?.meta?.last_scene_date },
    }));
  }, [setFieldActivity, record]);

  // Restore current (live) state when navigating back to "Current"
  const handleCurrentRestore = useCallback(() => {
    const status = record ? deriveDormantStatus(record) : null;
    const isDormant = record && !record.current_cycle && record.clusters?.features?.length === 0;
    setFieldActivity(prev => ({
      ...prev,
      features: record?.clusters?.features || [],
      geojson: record?.clusters || { type: 'FeatureCollection', features: [] },
      featurelength: record?.clusters?.features?.length || 0,
      historical: false,
      historicalCycle: null,
      dormant: isDormant,
      dormantColor: isDormant && status ? dormantColor(status.ndvi) : null,
      dormantStatus: isDormant ? status : null,
    }));
  }, [setFieldActivity, record]);

  // Sync selected clusters from map into form (select mode)
  useEffect(() => {
    if (!fieldActivity?.selectMode && form.coverage === 'partial') {
      // Select mode ended (confirm was clicked) — bring card back up
      setCardView('default');
      setForm(prev => ({ ...prev, coverage: 'confirmed' }));
      // Scroll crop dropdown into view after card animates back
      setTimeout(() => {
        cropRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // fetch once on mount — cache guard inside handleFieldActivity prevents redundant API calls
  useEffect(() => {
    console.log('activity in staticCards effect', LAND)
    handleFieldActivity(LAND);
  }, []);

  // update selection state when features arrive
  useEffect(() => {
    if (features.length) {
      setSelected(clusterGroups.map((g) => g.key))
      setLoading(false)
    }
  }, [features.length]);

  // stop loading when record arrives (even if no active features)
  // set dormant outline color if no active cycle
  useEffect(() => {
    if (!record) return;
    setLoading(false);
    if (!record.current_cycle && record.clusters?.features?.length === 0) {
      const status = deriveDormantStatus(record);
      if (status) {
        setFieldActivity(prev => ({
          ...prev,
          dormant: true,
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

  return (
      <>
      <motion.div
        initial={{ y: -300 }}
        animate={{ y: fieldActivity?.selectMode ? 250 : 0 }}
        drag="y"
        dragConstraints={{ top: -500, bottom: 150 }}
        dragListener={false}
        dragControls={controls}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          if (fieldActivity?.selectMode && info.offset.y < -50) {
            // Dragged up during select mode — confirm selection
            setFieldActivity(prev => prev ? { ...prev, selectMode: false } : prev);
          }
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 }}
        style={{ touchAction: 'none' }}
        className="flex flex-col py-4 mb-96"
      >
        {/* Cycle nav — above the card, moves with it */}
        {record?.cycles && Object.keys(record.cycles).length > 0 && (
          <CycleSwiper record={record} onCycleChange={handleCycleChange} onCurrentRestore={handleCurrentRestore} />
        )}
        {/* ── Section 1: Cumulative data ── */}
        <div style={{ zIndex: 0}} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1">
                <div
                  onPointerDown={(e) => controls.start(e)}
                  onTouchStart={(e) => { startYRef.current = e.touches[0].clientY; }}
                  onTouchEnd={(e) => { if (e.changedTouches[0].clientY - startYRef.current > 25) close(); }}
                  className="h-10 w-full select-none cursor-grab active:cursor-grabbing flex justify-center items-center"
                >
                  <span className="h-1 w-16 rounded-full bg-slate-300 dark:bg-slate-500" />
                </div>
                <div className="flex flex-col px-6 pb-6"
                  onPointerDown={(e) => controls.start(e)}
                >
                  <h3 className='font-bold px-4 dark:text-white'>{db['farmname']}</h3>
                  <p className='text-[10px] px-4 dark:text-slate-500'>&#9888; Beta — data may be inaccurate</p>

                  { loading && <Spinner size='small' stages={'loading latest records'} />}

                  {/* Cumulative stats table */}
                  {record && (() => {
                    const cycles = record.cycles ? Object.values(record.cycles) : [];
                    const sc = record.scorecard || {};
                    const area = record.meta?.parcel_area_m2 || 0;
                    const areaAcres = area / 4046.86;

                    // Cumulative yield by crop (extrapolate nulls from crop average)
                    const byCrop = {};
                    cycles.forEach(c => {
                      const crop = c.crop_type || 'unknown';
                      if (!byCrop[crop]) byCrop[crop] = { total: 0, count: 0, withYield: 0, yieldSum: 0 };
                      byCrop[crop].count++;
                      if (c.yield_kg_per_acre != null) {
                        byCrop[crop].withYield++;
                        byCrop[crop].yieldSum += c.yield_kg_per_acre;
                      }
                    });
                    // Extrapolate: apply average to missing cycles
                    Object.values(byCrop).forEach(b => {
                      const avg = b.withYield > 0 ? b.yieldSum / b.withYield : 0;
                      b.total = Math.round(avg * b.count * areaAcres);
                    });

                    // Earliest year from SOS dates
                    const years = cycles.map(c => c.sos?.slice(0, 4)).filter(Boolean);
                    const sinceYear = years.length ? Math.min(...years.map(Number)) : null;

                    return (
                    <div className="flex flex-col gap-2 px-4 pt-3">
                      {sinceYear && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Since {sinceYear}</p>
                      )}
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500 dark:text-slate-400">Rotation</span>
                        <span className="text-xs font-bold dark:text-white">{sc.rotation_pattern || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500 dark:text-slate-400">Yield class</span>
                        <span className="text-xs font-bold dark:text-white">{sc.yield_trend || '—'}</span>
                      </div>
                      {Object.entries(byCrop).map(([crop, b]) => (
                        <div key={crop} className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cropColor(crop) }} />
                            {crop} ({b.count}x)
                          </span>
                          <span className="text-xs font-bold dark:text-white">
                            {b.total > 1000 ? `${(b.total / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t` : `${b.total.toLocaleString('en-IN')} kg`}
                            {b.withYield < b.count && <span className="text-gray-400 dark:text-slate-500 ml-1">est.</span>}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500 dark:text-slate-400">Fees earned</span>
                        {claimableFees != null && claimableFees >= 50n * 10n**18n ? (
                          <button
                            onClick={claimViewFees}
                            className="text-[10px] font-bold px-3 py-1 rounded-lg bg-green-600 text-white active:bg-green-700"
                          >
                            Claim {Number(claimableFees / 10n**14n) / 10000} nIN
                          </button>
                        ) : (
                          <span className="text-xs font-bold dark:text-white">
                            {claimableFees != null && claimableFees > 0n
                              ? `${Number(claimableFees / 10n**14n) / 10000} nIN`
                              : claimableFees === 0n ? '0 nIN' : '—'}
                          </span>
                        )}
                      </div>
                      <p className='flex text-[10px] text-gray-400 dark:text-slate-500 justify-end pt-1'>
                        {area > 0 ? `${Number(area).toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²` : ''}
                        {' · '}last overflight: {fieldActivity?.meta?.last_scene_date || record?.meta?.last_scene_date}
                      </p>
                    </div>
                    );
                  })()}
              </div>
        </div>

        {/* ── Section 2: Actions ── */}
        {/* ── Section 2: Actions ── */}
        {(() => {
          const isFallow = !record?.current_cycle && record?.clusters?.features?.length === 0;
          const isActive = !isFallow && (clusterGroups.length > 0 || record?.current_cycle);
          const primaryLabel = isFallow ? 'New season' : 'Set crop';
          const btn = "px-4 py-2 rounded-lg text-xs font-bold active:scale-95 border bg-white dark:bg-slate-700 text-black dark:text-white border-gray-200 dark:border-slate-600";
          const btnOff = btn + " opacity-40";

          const CROPS = [['0',"Paddy"],['1',"Groundnut"],['2',"Sugarcane"],['3',"Banana"],['4',"Potato"],['5',"Onion"],['6',"Sesame"],['7',"Cassava"]];
          const VARS = {
            0: [['0',"CO 51"],['1',"ADT 43"],['2',"TRY 3"],['3',"BPT 5204"]],
            1: [['0',"TMV 7"],['1',"TMV 13"],['2',"VRI 2"],['3',"VRI 3"]],
            2: [['0',"CO 86032"],['1',"COC 24"],['2',"COC 671"],['3',"CO 62175"]],
            3: [['0',"Grand Naine"],['1',"Poovan"],['2',"Nendran"],['3',"Rasthali"]],
            4: [['0',"Kufri Jyoti"],['1',"Kufri Super"],['2',"Kufri Surya"]],
            5: [['0',"CO 3"],['1',"CO (On) 5"],['2',"Arka Kalyan"],['3',"Agrifound Dark Red"]],
            6: [['0',"TMV 3"],['1',"TMV 4"],['2',"TMV 6"],['3',"TMV 7"],['4',"SVPR 1"],['5',"CO 1"]],
            7: [['0',"H-165"],['1',"H-226"],['2',"Sree Vijaya"],['3',"Sree Jaya"],['4',"CO (TP) 4"],['5',"Mulluvadi"]],
          };

          return (
          <div style={{ zIndex: 0}} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1 px-6 py-4 gap-2"
            onPointerDown={(e) => controls.start(e)}
          >
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Actions</p>
              {action === 'season' && (
                <button
                  onClick={() => setAction(null)}
                  className="text-gray-400 dark:text-slate-400 text-sm px-1 active:scale-95"
                >✕</button>
              )}
            </div>

            {action !== 'season' && (
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => setAction('season')}>
                  {primaryLabel}
                </button>
                <button className={btnOff} disabled>Pre-sale</button>
                <button className={btnOff} disabled>Shared cropping</button>
              </div>
            )}

            {action === 'season' && (
              <div className="flex flex-col gap-3 pt-1">
                <p className="text-xs dark:text-slate-300">Area</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm(prev => ({...prev, coverage: 'full'}))}
                    className={`flex-1 text-xs px-3 py-1.5 rounded-lg border ${form.coverage === 'full' ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-semibold' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white'}`}
                  >Entire property</button>
                  <button
                    onClick={() => {
                      setForm(prev => ({...prev, coverage: 'partial', selectedClusters: []}));
                      setCardView('mapview');
                      // Flatten + dedupe all historical clusters, mark as unselected
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
                      }
                    }}
                    className={`flex-1 text-xs px-3 py-1.5 rounded-lg border ${(form.coverage === 'partial' || form.coverage === 'confirmed') ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-semibold' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white'}`}
                  >Select fields</button>
                </div>

                {form.coverage === 'partial' && (
                  <p className="text-[10px] dark:text-slate-500">
                    {form.selectedClusters?.length > 0
                      ? `${form.selectedClusters.length} area(s) selected — confirm on map`
                      : 'Tap areas on the map'}
                  </p>
                )}
                {form.coverage === 'confirmed' && form.selectedClusters?.length > 0 && (
                  <p className="text-[10px] text-green-600 dark:text-green-400">{form.selectedClusters.length} area(s) confirmed</p>
                )}

                <p className="text-xs dark:text-slate-300">Crop</p>
                <div ref={cropRef} className="relative">
                  <button
                    onClick={() => setCropOpen(o => !o)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-left flex items-center justify-between"
                  >
                    <span>{form.crop ? form.crop[1] : 'Select crop'}</span>
                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${cropOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {cropOpen && (
                    <div className="absolute left-0 right-0 mt-1 z-20 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg overflow-hidden">
                      {CROPS.map((opt) => (
                        <button key={opt[0]}
                          onClick={() => { setForm(prev => ({...prev, crop: opt, var: ''})); setCropOpen(false); }}
                          className={`w-full text-left text-xs px-3 py-1.5 dark:text-white ${form.crop?.[0] === opt[0] ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                        >{opt[1]}</button>
                      ))}
                    </div>
                  )}
                </div>

                {form.crop && (
                  <>
                    <p className="text-xs dark:text-slate-300">What variety are you growing?</p>
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
                  </>
                )}

                {form.var && (
                  <>
                  <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-600/50">
                    <p className="text-[10px] dark:text-slate-300 leading-relaxed">
                      Create a <span className="font-semibold">crop passport</span> for this season —
                      a digital certificate that proves what you're growing, where, and when.
                      With it you can:
                    </p>
                    <ul className="text-[10px] dark:text-slate-300 mt-1.5 ml-3 space-y-0.5">
                      <li>· Get better loan terms from your union</li>
                      <li>· Pre-sell your harvest at a locked price</li>
                      <li>· Join bulk growing plans for higher rates</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => { setAction('mint'); setCardView('transactionview'); }}
                    className="py-3 rounded-xl bg-black dark:bg-white text-white dark:text-gray-800 text-sm font-bold active:scale-95 mt-2"
                  >
                    Create crop passport
                  </button>
                  </>
                )}
              </div>
            )}
          </div>
          );
        })()}
      </motion.div>
      </>
  )

}
