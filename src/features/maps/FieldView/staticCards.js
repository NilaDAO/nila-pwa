import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDataContext, useNavContext, useViewModeContext } from '../../../utils/NavigationContext';
import { cropColor, cropIconUrl, normalizeCropType } from '../../../utils/cropColors.js';
import { mergeZonesWithSubzones } from '../../../utils/recordZones.js';
import { sameCropFamily } from '../../../utils/foodToken.ts';
import { motion, useDragControls, AnimatePresence, useAnimation } from 'framer-motion';
import { RateSlider, ClaimButton, DropdownButton } from '../../../components/UI/buttons';
import { ChevronDownIcon, TagIcon } from '@heroicons/react/24/solid';
import Spinner from '../../../components/UI/spinner.js';
import useLendingFlow from '../../../hooks/useDirectLendingFlow.js'
import { useMintFoodToken, useBurnLandTitle } from '../../../hooks/useMintLandTitle.ts'
import { useRecordHash } from '../../../hooks/useRecordHash.ts'
import { CROP_CODE_NAMES, CROP_VARIETIES, CROP_UNIT, CROP_CODE_COLOR_KEY, useFoodTokenBatches } from '../../../hooks/useFoodTokenBatches.ts'
import { CROP_IMG } from '../../../hooks/useFilterTasks.js'
import { readItem, setDBitem } from '../../../utils/db.js'
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

// Full selector list — all entries are on-chain food token crop codes.
const CROP_DISPLAY_OVERRIDES = { 'Cassava': 'Cassava/Tapioca' };
const SELECTOR_CROPS = CROPS_DATA.map(([, name]) => [CROP_DISPLAY_OVERRIDES[name] ?? name, null]);

// Coconut intercrop candidates (crops grown under a coconut canopy).
const INTERCROP_CANDIDATES = [
  'Banana', 'Cocoa', 'Nutmeg', 'Black pepper', 'Pineapple',
  'Turmeric', 'Ginger', 'Elephant foot yam', 'Colocasia', 'Fodder grasses',
];

// Sugarcane planting type — pan-India plain-English pair.
// "Seedling" = first plant crop from setts; "Regrowth" = ratoon from stubble.
const SUGARCANE_SUBTYPES = [
  { key: 'plant',  label: 'Seedling' },
  { key: 'ratoon', label: 'Regrowth' },
];

const cropBase = (name) => String(name ?? '').toLowerCase().split('/')[0].trim();
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

// Pre-computed season windows for 2019–2027.
// Each entry: { label, startMs, endMs }
// Zaid Y  : Feb 1 Y  – May 31 Y
// Kharif Y: Jun 1 Y  – Sep 30 Y
// Rabi Y  : Oct 1 Y  – Jan 31 Y+1
const SEASON_WINDOWS = (() => {
  const w = [];
  for (let y = 2019; y <= 2027; y++) {
    w.push({ label: `Zaid ${y}`,   startMs: Date.UTC(y,   1,  1), endMs: Date.UTC(y,   4, 31) });
    w.push({ label: `Kharif ${y}`, startMs: Date.UTC(y,   5,  1), endMs: Date.UTC(y,   8, 30) });
    w.push({ label: `Rabi ${y}`,   startMs: Date.UTC(y,   9,  1), endMs: Date.UTC(y+1, 0, 31) });
  }
  return w;
})();

// A cycle belongs to a season if overlap/min(cycle_days, season_days) > 0.80.
// Handles short crops (most of the crop is in this season) and
// perennials (most of the season is covered by the crop).
function cycleSeasonKeys(cycle) {
  if (!cycle.sos || !cycle.eos) return [];
  const sosMs = new Date(cycle.sos).getTime();
  const eosMs = new Date(cycle.eos).getTime();
  const cycleDays = (eosMs - sosMs) / 86400000;
  if (cycleDays <= 0) return [];
  const keys = [];
  for (const { label, startMs, endMs } of SEASON_WINDOWS) {
    const overlapMs = Math.min(eosMs, endMs) - Math.max(sosMs, startMs);
    if (overlapMs <= 0) continue;
    const overlapDays = overlapMs / 86400000;
    const seasonDays  = (endMs - startMs) / 86400000;
    if (overlapDays / Math.min(cycleDays, seasonDays) > 0.8) keys.push(label);
  }
  return keys;
}

const useCycleNav = (record, selectedZoneId, onCycleChange, onCurrentRestore) => {
  const seasonGroups = useMemo(() => {
    if (!record?.cycles) return [];
    const cycles = Object.entries(record.cycles)
      .map(([key, c]) => ({ key, ...c }))
      .filter(c => !!c.eos);
    const groupMap = new Map();
    for (const cycle of cycles) {
      for (const sk of cycleSeasonKeys(cycle)) {
        if (!groupMap.has(sk)) {
          const win = SEASON_WINDOWS.find(w => w.label === sk);
          groupMap.set(sk, { label: sk, startMs: win?.startMs ?? 0, cycles: [] });
        }
        groupMap.get(sk).cycles.push(cycle);
      }
    }
    return Array.from(groupMap.values()).sort((a, b) => b.startMs - a.startMs);
  }, [record, selectedZoneId]);

  const totalCount = seasonGroups.length + 1; // +1 for "current"
  const [cycleIx, setCycleIx] = useState(0);  // 0 = current
  const userInteracted = useRef(false);
  const isCurrent = cycleIx === 0;
  const currentGroup = !isCurrent ? seasonGroups[cycleIx - 1] : null;

  const navigate = useCallback((dir) => {
    const next = cycleIx + dir;
    if (next < 0 || next >= totalCount) return;
    userInteracted.current = true;
    setCycleIx(next);
  }, [cycleIx, totalCount]);

  const jumpTo = useCallback((ix) => {
    if (ix < 0 || ix >= totalCount) return;
    userInteracted.current = true;
    setCycleIx(ix);
  }, [totalCount]);

  useEffect(() => {
    if (!userInteracted.current) return;
    if (cycleIx === 0) {
      onCurrentRestore?.();
    } else {
      const group = seasonGroups[cycleIx - 1];
      if (group) {
        const allFeatures = group.cycles.flatMap(c =>
          record?.per_cycle_clusters?.[c.key]?.features ?? []
        );
        onCycleChange?.(group.cycles[0], { type: 'FeatureCollection', features: allFeatures });
      }
    }
  }, [cycleIx]);

  return { seasonGroups, totalCount, cycleIx, isCurrent, currentGroup, navigate, jumpTo };
};


const CycleSwiper = ({ cycleIx, totalCount, label, navigate }) => {
  if (totalCount <= 1) return null;
  return (
    <div className="flex items-center justify-between rounded-2xl backdrop-blur-sm bg-darkgrey/10">
      <button
        onClick={() => navigate(1)}
        disabled={cycleIx === totalCount - 1}
        className="text-lg px-2 disabled:opacity-20 text-white"
      >
        ‹
      </button>
      <p className="text-xs text-white">{label}</p>
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


const HistoricalCycleCard = ({ cycle }) => {
  if (!cycle) return null;
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
  const unmix = cycle.unmix || {};
  const pct = (v) => v == null ? null : `${Math.round(v * 100)}%`;
  return (
    <div className="flex flex-col gap-1 text-xs pt-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1">Past cycle</p>
      <div className="flex justify-between pt-1">
        <span className="text-gray-500 dark:text-slate-400">Crop</span>
        <span className="font-bold dark:text-white">{normalizeCropType(cycle.crop_type) ?? 'unknown'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-slate-400">Sowing → harvest</span>
        <span className="font-bold dark:text-white">{fmt(cycle.sos)} → {fmt(cycle.eos)}</span>
      </div>
      {cycle.peak_ndvi != null && (
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-400">Peak NDVI</span>
          <span className="font-bold dark:text-white">{cycle.peak_ndvi.toFixed(2)}</span>
        </div>
      )}
      {cycle.yield_kg_per_acre != null && (
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-400">Yield</span>
          <span className="font-bold dark:text-white">{Math.round(cycle.yield_kg_per_acre)} kg/ac</span>
        </div>
      )}
      {cycle.n_clusters != null && (
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-400">Subzones</span>
          <span className="font-bold dark:text-white">{cycle.n_clusters}</span>
        </div>
      )}
      {(unmix.crop != null || unmix.perennial != null || unmix.bare != null) && (
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-400">Land cover</span>
          <span className="font-bold dark:text-white">
            {[pct(unmix.crop) && `crop ${pct(unmix.crop)}`, pct(unmix.perennial) && `perennial ${pct(unmix.perennial)}`, pct(unmix.bare) && `bare ${pct(unmix.bare)}`].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
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

/** "early Jan '26" style — same convention as ActiveLoansCard's formatEosDate. */
const fmtEosShort = (isoDate) => {
  if (!isoDate) return '--';
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late';
  const yearStr = year !== new Date().getFullYear() ? ` '${String(year).slice(2)}` : '';
  return `${part} ${month}${yearStr}`;
};

// Crop-health enum from the satellite record's current_cycle — see
// resolveCropFromRecords in useActiveLoans.js and the matching maps in
// ActiveLoansCard.js.
const PORTFOLIO_HEALTH_COLOR = {
  excellent: 'text-green dark:text-green_dark',
  on_track: 'text-green dark:text-green_dark',
  stressed: 'text-amber dark:text-amber-300',
  underperforming: 'text-red dark:text-red',
};
const PORTFOLIO_HEALTH_LABEL = {
  excellent: 'Excellent',
  on_track: 'On track',
  stressed: 'Stressed',
  underperforming: 'Underperforming',
};

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
  // landId (string) -> the loan enriched by ActiveLoansCard's own `enriched`
  // memo (amount, eosDate/daysToEos/eosSource, cropFamily, foodTokenId,
  // health/healthSummary/healthDescription, ...) — one loan per property in
  // practice, so first-match-wins is fine.
  const loansByLandId = useMemo(() => {
    const m = {};
    for (const l of loans) if (l.landId != null && !m[String(l.landId)]) m[String(l.landId)] = l;
    return m;
  }, [loans]);

  const [resolvedIds, setResolvedIds] = useState([]);
  const [activeIds, setActiveIds] = useState([]); // landIds with a currently-active (drawn) loan → coloured blue
  // landId -> CROP_CODE_COLOR_KEY string, for outline fill color. Derived
  // straight from loansByLandId (no chain fallback needed, unlike
  // resolvedIds/activeIds below) — a property with no loan, or a loan with
  // no resolved cropFamily yet, just has no entry and keeps the default
  // grey/blue outline.
  const cropByLid = useMemo(() => {
    const m = {};
    for (const [lid, l] of Object.entries(loansByLandId)) {
      if (l.cropFamily != null) m[lid] = CROP_CODE_COLOR_KEY[l.cropFamily] ?? null;
    }
    return m;
  }, [loansByLandId]);
  const [cachedHashes, setCachedHashes] = useState(null);
  const [metadata, setMetadata] = useState(null); // { landId: { farm, outline, centroid, bounds } }
  const [expandedLid, setExpandedLid] = useState(null); // accordion: which row is open
  // Reveal non-active (other known) properties — lives in shared fieldActivity
  // (not local state) so the map's X/back button (staticNav.js) can also lift
  // the single-property scope, not just this card's own toggle button.
  const showAll = fieldActivity?.portfolioShowAll ?? false;
  // Members list is paginated rather than left to scroll indefinitely — a
  // union can have dozens of properties, and an unbounded scroll region
  // inside this drag-to-dismiss sheet was hard to reverse direction on.
  const MEMBERS_PAGE_SIZE = 8;
  const [membersPage, setMembersPage] = useState(0);

  // Seed from the persistent property-metadata cache so ALL known properties
  // (every member we've ever resolved, not just this session's active loans)
  // render their outlines immediately — chain fetches below only fill gaps.
  useEffect(() => {
    let cancelled = false;
    readItem('propertyMeta', 'FarmData').then(cached => {
      const cache = cached?.value;
      if (!cancelled && cache && Object.keys(cache).length) {
        setMetadata(prev => ({ ...cache, ...(prev || {}) }));
        console.log(`[portfolio] seeded ${Object.keys(cache).length} properties from cache`);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      const active = new Set();
      const seen = new Set();
      const isActive = (l) => l.drawdownTs && l.active && !l.chainClosed;
      for (const l of loans) {
        if (l.landId) {
          if (!seen.has(l.landId)) { seen.add(l.landId); ids.push(l.landId); }
          if (isActive(l)) active.add(String(l.landId));
        } else if (l.borrower && !seen.has(l.borrower)) {
          seen.add(l.borrower);
          try {
            const bal = await landTitle.balanceOf(l.borrower);
            if (bal > 0n) {
              const tid = Number(await landTitle.tokenOfOwnerByIndex(l.borrower, 0));
              if (!seen.has(tid)) { seen.add(tid); ids.push(tid); }
              if (isActive(l)) active.add(String(tid));
              console.log(`[portfolio] chain: ${l.borrower.slice(0,8)}… → ${tid}`);
            }
          } catch (e) {
            console.warn(`[portfolio] resolve failed ${l.borrower?.slice(0,8)}…`);
          }
        }
      }
      if (!cancelled) {
        console.log(`[portfolio] resolved ${ids.length} land IDs (${active.size} active) from ${loans.length} loans`);
        setResolvedIds(ids);
        setActiveIds([...active]);
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
      // Persist into the property-metadata cache (union of everything ever seen)
      // so future portfolio opens render all known outlines without a chain round-trip.
      try {
        const cached = await readItem('propertyMeta', 'FarmData');
        const persisted = { ...(cached?.value || {}), ...meta };
        await setDBitem('propertyMeta', persisted, 'FarmData');
      } catch (e) {
        console.warn('[portfolio] propertyMeta cache write failed:', e?.message);
      }
      if (cancelled) return;
      setMetadata(prev => ({ ...(prev || {}), ...meta }));
    })();
    return () => { cancelled = true; };
  }, [landTitle, resolvedIds]);

  // Push metadata into fieldActivity so staticMaps renders outlines immediately.
  // Single-property mode (exactly one loan — e.g. "View property outline" from
  // an expanded Active Loans row) scopes to just that property, otherwise the
  // full cache-seeded history leaks into the labels and bounds-fit below.
  // Portfolio-wide mode (multiple loans) intentionally keeps showing every
  // known property, not just this session's active loans (see cache-seed
  // effect above) — that behavior is unchanged here. "Show all known
  // properties" lifts the single-property scoping too, so the map matches
  // what's now visible in the expanded members list.
  useEffect(() => {
    if (!metadata || !Object.keys(metadata).length) return;
    const scoped = (loans.length === 1 && !showAll)
      ? Object.fromEntries(resolvedIds.filter(lid => metadata[lid]).map(lid => [lid, metadata[lid]]))
      : metadata;
    setFieldActivity(prev => {
      if (!prev?.portfolioMode) return prev;
      return { ...prev, portfolioProperties: scoped };
    });
  }, [metadata, resolvedIds, loans.length, showAll, setFieldActivity]);

  // Single-property mode: auto-expand + select the one resolved property
  // instead of waiting for the user to tap it — otherwise the map fits to
  // the same (already-scoped) bounds twice: once on open, again when the
  // row is manually expanded.
  useEffect(() => {
    if (loans.length !== 1 || resolvedIds.length !== 1) return;
    const lid = resolvedIds[0];
    setExpandedLid(lid);
    setFieldActivity(prev => prev?.portfolioMode ? { ...prev, portfolioSelected: lid } : prev);
  }, [loans.length, resolvedIds, setFieldActivity]);

  // Tell the map which properties have a live loan → coloured blue, rest grey.
  useEffect(() => {
    setFieldActivity(prev => prev?.portfolioMode ? { ...prev, portfolioActiveIds: activeIds } : prev);
  }, [activeIds, setFieldActivity]);

  // Tell the map each property's crop-type fill color (outline's primary
  // color channel — see staticMaps.js's portfolio-outline rendering).
  useEffect(() => {
    setFieldActivity(prev => prev?.portfolioMode ? { ...prev, portfolioCropByLandId: cropByLid } : prev);
  }, [cropByLid, setFieldActivity]);

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
      dragConstraints={{ top: -500, bottom: 150 }}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.05}
      onUpdate={(latest) => {
        const lifted = (latest?.y ?? 0) < -20;
        setFieldActivity(prev => (prev && !!prev.cardLifted !== lifted) ? { ...prev, cardLifted: lifted } : prev);
      }}
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
        <div className="flex flex-col px-6 pb-2 gap-3">
          <div className="flex items-center justify-between px-4">
            <div>
              <h3 className="font-bold dark:text-white">Members</h3>
              <p className="text-[10px] dark:text-slate-500">{metadata ? Object.keys(metadata).length : resolvedIds.length} properties · {activeIds.length} active{fieldActivity?.outlinesOnly ? ' · outlines only' : ''}</p>
            </div>
            <button
              onPointerDown={e => e.stopPropagation()}
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
              <Spinner size='small' />
            </div>
          )}

          {metadata && (() => {
            const isActive = (lid) => activeIds.some(id => String(id) === String(lid));
            const entries = Object.entries(metadata);
            const activeEntries = entries.filter(([lid]) => isActive(lid));
            const otherEntries = entries.filter(([lid]) => !isActive(lid));

            const renderRow = ([lid, m]) => {
              const h = cachedHashes?.find(r => String(r.landId) === String(lid));
              const expanded = String(expandedLid) === String(lid);
              const nFields = m.fieldNames?.length || 0;
              const loan = loansByLandId[String(lid)];
              const rowCropColorKey = loan?.cropFamily != null ? CROP_CODE_COLOR_KEY[loan.cropFamily] : null;
              return (
                <div key={lid} className="border-b border-slate-100 dark:border-slate-600 last:border-0">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => {
                      setExpandedLid(prev => String(prev) === String(lid) ? null : lid);
                      setFieldActivity(prev => prev ? { ...prev, portfolioSelected: lid } : prev);
                    }}
                    className="flex w-full items-center justify-between py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {rowCropColorKey && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: cropColor(rowCropColorKey), opacity: loan?.foodTokenId ? 1 : 0.4 }}
                        />
                      )}
                      <span className="font-semibold dark:text-white truncate text-left">{m.farm}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 ml-2">
                      {loan && (
                        <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400">
                          ₹{(loan.totalAmount ?? loan.amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      {loan?.eosDate && (
                        <span className={`text-[10px] font-mono ${
                          loan.daysToEos != null && loan.daysToEos < -14
                            ? 'text-red dark:text-red font-bold'
                            : loan.daysToEos != null && loan.daysToEos < 0
                              ? 'text-orange-600 dark:text-orange-400 font-bold'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}>
                          {fmtEosShort(loan.eosDate)}
                        </span>
                      )}
                      {nFields > 0 && <span className="text-gray-400 dark:text-slate-500 text-[10px]">{nFields} field{nFields > 1 ? 's' : ''}</span>}
                      <span className="text-gray-400 dark:text-slate-500 text-[10px]">#{lid}</span>
                      <ChevronDownIcon className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {expanded && (
                    <div className="pb-2 pl-1 flex flex-col gap-0.5">
                      {nFields > 0 && (
                        <p className="text-[10px] text-gray-500 dark:text-slate-400">{m.fieldNames.join(', ')}</p>
                      )}
                      {loan?.health && (
                        <p
                          className={`text-[10px] font-semibold ${PORTFOLIO_HEALTH_COLOR[loan.health] ?? 'text-gray-500 dark:text-slate-300'}`}
                          title={loan.healthDescription || undefined}
                        >
                          {loan.healthSummary || PORTFOLIO_HEALTH_LABEL[loan.health] || loan.health}
                        </p>
                      )}
                      {!fieldActivity?.outlinesOnly && h && !h.stored && (
                        <p className="text-[10px] text-amber-500">no viewing key</p>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            // A union can have dozens of properties — this list used to rely on
            // an unbounded scroll region inside the drag-to-dismiss sheet,
            // which was hard to reverse direction on and fought the sheet's
            // own drag/translateY. Paginate a fixed page size instead so the
            // row count (and the sheet's height) stays predictable.
            const visibleEntries = showAll ? [...activeEntries, ...otherEntries] : activeEntries;
            const totalPages = Math.max(1, Math.ceil(visibleEntries.length / MEMBERS_PAGE_SIZE));
            const safePage = Math.min(membersPage, totalPages - 1);
            const pageEntries = visibleEntries.slice(safePage * MEMBERS_PAGE_SIZE, (safePage + 1) * MEMBERS_PAGE_SIZE);

            return (
              <div className="flex flex-col px-4">
                {pageEntries.map(renderRow)}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setMembersPage(p => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 disabled:opacity-30 disabled:text-blue-700 active:scale-95"
                    >
                      ‹ Prev
                    </button>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">Page {safePage + 1} of {totalPages}</span>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setMembersPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={safePage === totalPages - 1}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 disabled:opacity-30 disabled:text-blue-700 active:scale-95"
                    >
                      Next ›
                    </button>
                  </div>
                )}
                {otherEntries.length > 0 && (
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setFieldActivity(prev => {
                      if (!prev) return prev;
                      const next = !(prev.portfolioShowAll ?? false);
                      // Revealing everything: drop the single-property zoom-lock
                      // so the map fits to all properties instead of staying
                      // fixed on just the one it opened with.
                      if (next) setExpandedLid(null);
                      setMembersPage(0); // the visible set (and page count) just changed
                      return next
                        ? { ...prev, portfolioShowAll: true, portfolioSelected: null }
                        : { ...prev, portfolioShowAll: false };
                    })}
                    className="self-start text-[11px] text-blue-700 dark:text-blue-300 font-medium mt-2 active:scale-95"
                  >
                    {showAll ? 'Hide other properties' : `Show all known properties (${otherEntries.length})`}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
        {/* draggable bottom grab zone — generous surface to pull the card up */}
        <div
          onPointerDown={(e) => controls.start(e)}
          style={{ touchAction: 'none' }}
          className="h-14 w-full select-none cursor-grab active:cursor-grabbing"
        />
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
  const { db, fieldActivity, setFieldActivity, tokenData, view, setView } = useDataContext();
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
  }, [view?.mode]);
  useEffect(() => {
    if (action === 'season') motionAnimate.start({ y: 0, transition: springTransition });
  }, [action]);

  // Clear portfolioMode on unmount so user's map works next time
  useEffect(() => {
    return () => {
      if (fieldActivity?.portfolioMode) {
        setFieldActivity(prev => prev?.portfolioMode ? null : prev);
      }
      setFieldActivity(prev => (prev && prev.cardLifted) ? { ...prev, cardLifted: false } : prev);
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
  const [ showAllCycles, setShowAllCycles ]         = useState(false);
  const [ override, setOverride ]                   = useState(null);
  const [ showOverride, setShowOverride ]            = useState(false);
  // Two-step override: after a crop is picked we may need a sub-question
  // (sugarcane → Seedling/Regrowth, coconut → intercrop). overridePending holds
  // the in-flight selection until the sub-question is answered (or skipped).
  const [ overridePending, setOverridePending ]      = useState(null);
  // overridePending shape: { cluster_id, cropName, prevOverride, alternatives } | null

  // True after a crop pick the backend flagged as out-of-alternatives
  // (requires_union_verification). Join batch is disabled while pending —
  // cleared when the user switches to a crop that IS in alternatives, or to
  // the detected crop.
  const [ cropPendingVerification, setCropPendingVerification ] = useState(false);

  // Apply the user's alternative crop pick. The override is purely local PWA
  // state — the canonical record is already on chain / IPFS. If the pick is
  // one of the classifier's listed alternatives we accept silently. When the
  // classifier offered no alternatives at all we also accept silently — there
  // is nothing to constrain against, so minting is allowed. Only when the
  // pick falls outside a non-empty alternatives list do we flag for union
  // verification and fire-and-forget a log to the node.
  const submitCropCorrection = (cluster_id, user_corrected, _previousOverride, alternatives, extras = {}) => {
    const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    const pick = normalize(user_corrected);
    const altList = (alternatives ?? []).map(a => ({
      crop_type: normalize(a?.crop_type),
      confidence: a?.confidence ?? null,
    }));
    const altSet = new Set(altList.map(a => a.crop_type));
    const inAlternatives = altSet.size === 0 || altSet.has(pick);

    console.log('[correct-crop] pick:', pick, '| inAlternatives:', inAlternatives, '| alternatives:', altList, '| cluster_id:', cluster_id);

    // Persist the pick into the cached record so the change survives reload.
    // We patch every cycle whose cluster_id or zone_id (with subzone suffix
    // stripped) matches — same matching used for the optimistic fieldActivity
    // update above.
    const zoneMatches = (zid) =>
      zid === cluster_id || String(zid ?? '').replace(/_(a|b)$/, '') === cluster_id;
    patchRecord?.((prev) => {
      const cc = prev?.current_cycle;
      if (!Array.isArray(cc) || cc.length === 0) return prev;
      let changed = false;
      const nextCC = cc.map((c) => {
        const match = (c.cluster_id && c.cluster_id === cluster_id) || zoneMatches(c.zone_id);
        if (!match || c.crop_type === pick) return c;
        changed = true;
        return { ...c, crop_type: pick };
      });
      return changed ? { ...prev, current_cycle: nextCC } : prev;
    });

    if (inAlternatives) {
      setCropPendingVerification(false);
      return;
    }

    setCropPendingVerification(true);
    alert("We appreciate your input. We ask your union to confirm your input. You can always change to another crop. Until then you can't join a batch.");

    const land_id = LAND?.current?.LAND?.id;
    const API = process.env.REACT_APP_API_BASE_URL;
    if (!land_id || !cluster_id || !API) return;
    fetch(`${API}/gis/correct-crop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        land_id: Number(land_id),
        cluster_id: String(cluster_id),
        user_corrected: pick,
        caller: db?.address ?? null,
        ...(extras.subtype   ? { subtype:   extras.subtype   } : {}),
        ...(extras.intercrop ? { intercrop: extras.intercrop } : {}),
      }),
    }).catch(err => console.warn('[correct-crop] log failed:', err));
  };

  useEffect(() => {
    setYieldDraft(1);
    setEditingYield(false);
    setForm(prev => ({ ...prev, yieldUnits: null }));
  }, [form.selectedBatch?.id]);

  // CS023: gated property data — log record hash flow for verification
  const tokenId = LAND?.current?.LAND?.id;
  const { record, commitment, recordHash, fee, isOwner, isApproved, claimableFees, claimViewFees, loading: recordLoading, error: recordError, fetchRecord, patchRecord } = useRecordHash(tokenId);

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

  // Optimistic list + map update: when the user picks an override crop, patch
  // the matching active cycle's crop_type and the matching geojson feature
  // properties so the cycles table and zone fill color reflect the pick
  // immediately, without waiting for a record refetch.
  useEffect(() => {
    const cropOverride = override?.cropType;
    const clusterId = override?.clusterId;
    if (!cropOverride || !clusterId) return;
    const zoneMatches = (zid) =>
      zid === clusterId || String(zid ?? '').replace(/_(a|b)$/, '') === clusterId;
    // Map color: record the override on the view so featuresFor recolors the
    // zone immediately (Plan 044 §5.1). Features are derived — never patched.
    setView(prev => ({ ...prev, override: { ...(prev.override ?? {}), [clusterId]: cropOverride } }));
    // Card title/table: patch the model fields the card reads (activeCycle +
    // dominant) so the cycles table and CultivationCard title update at once.
    setFieldActivity(prev => {
      if (!prev) return prev;
      const activeCycle = (prev.activeCycle ?? []).map(c =>
        ((c.cluster_id && c.cluster_id === clusterId) || zoneMatches(c.zone_id))
          ? { ...c, crop_type: cropOverride }
          : c
      );
      const dominant = (prev.dominant ?? []).map(d => {
        const dCid = d?.cluster_id ?? '';
        const dZid = d?.zone_id;
        if (zoneMatches(dZid) || dCid === clusterId || dCid.endsWith(`-${clusterId}`)) {
          return { ...d, crop_type: cropOverride };
        }
        return d;
      });
      return { ...prev, activeCycle, dominant };
    });
  }, [override?.cropType, override?.clusterId, setFieldActivity, setView]);


  // Food-token cycle fill: a minted food token is the farmer's self-attestation
  // that a crop is growing on the zones it covers. For any covered zone that the
  // satellite record left fallow (or detected as a different crop), inject an open
  // current_cycle entry with the token's crop — the same source-of-truth approach
  // as submitCropCorrection, so the map fill, the season table, and the card's
  // active-cycle recognition all follow. Mint packs zone zN at bit (N+1).
  useEffect(() => {
    if (!record || !patchRecord) return;
    const fts = (tokenData ?? []).filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0);
    if (!fts.length) return;

    const cover = new Map(); // zone_id → { crop, sos }
    for (const t of fts) {
      const name = CROP_CODE_NAMES[t.cropCode];
      if (!name) continue;
      const crop = name.toLowerCase();
      const sos  = t.sosTs ? new Date(t.sosTs * 1000).toISOString().slice(0, 10) : null;
      let mask = 0n; try { mask = BigInt(t.fieldsBitmask ?? '0'); } catch { mask = 0n; }
      if ((mask & 1n) === 1n) continue; // entire property — no per-zone fill
      for (let p = 1n; p < 128n; p++) if (((mask >> p) & 1n) === 1n) {
        const zid = 'z' + (p - 1n);
        if (!cover.has(zid)) cover.set(zid, { crop, sos });
      }
    }
    if (!cover.size) return;

    // sugarcane ~ sugarcane_ratoon / sugarcane_plant: treat same family as a match.
    const sameFamily = (a, b) => {
      const x = String(a || '').toLowerCase(), y = String(b || '').toLowerCase();
      return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
    };
    // Plan 044 §5.3 — a food token NEVER overwrites a satellite-detected crop.
    // The satellite record is truth; the token is the farmer's self-attestation.
    // Only fill zones the satellite left genuinely empty (fallow/unknown). A
    // stale token (e.g. last season's sugarcane) must not wipe the correct crop
    // (e.g. this season's green_gram). Distinct sources are surfaced by
    // buildCultivations, not by mutating the record.
    const cc = Array.isArray(record.current_cycle) ? record.current_cycle : [];
    const isEmptyCrop = (ct) => !ct || ct === 'fallow' || ct === 'unknown';
    const toFill = [];
    for (const [zid, { crop, sos }] of cover) {
      const existing = cc.find(c => (c.zone_id ?? c.cluster_id) === zid);
      if (existing && !isEmptyCrop(existing.crop_type)) continue; // satellite has a real crop — leave it
      if (existing && sameFamily(existing.crop_type, crop)) continue; // already growing it
      toFill.push({ zid, crop, sos });
    }
    if (!toFill.length) return; // idempotent — nothing to add, avoids a patch loop

    patchRecord((prev) => {
      const pcc = Array.isArray(prev?.current_cycle) ? [...prev.current_cycle] : [];
      let changed = false;
      for (const { zid, crop, sos } of toFill) {
        const i = pcc.findIndex(c => (c.zone_id ?? c.cluster_id) === zid);
        if (i >= 0) {
          // Only fill fallow/unknown slots — never clobber a real detected crop.
          if (isEmptyCrop(pcc[i].crop_type)) { pcc[i] = { ...pcc[i], crop_type: crop, is_open: true, _from_food_token: true }; changed = true; }
        } else {
          pcc.push({ zone_id: zid, crop_type: crop, sos, is_open: true, _from_food_token: true });
          changed = true;
        }
      }
      return changed ? { ...prev, current_cycle: pcc } : prev;
    });
    // Plan 044 §5.2 — no optimistic fieldActivity feature patch. The map is
    // derived by featuresFor from (record, tokenData, view); patching the
    // record above is enough — buildCultivations + the derive effect pick it up.
  }, [record, tokenData, patchRecord]);

  // Plan 044 §5.2 — cycle navigation just flips the view. The season's
  // features are derived by featuresFor(record, …, { mode:'season', season })
  // and the live overview by { mode:'overview' }. No feature building here.
  const handleCycleChange = useCallback((cycle) => {
    setView(prev => ({ ...prev, mode: 'season', season: cycle }));
  }, [setView]);

  // Back to live ("Now"): overview mode. Refresh dormant status — that's model
  // data the map's outline/labels read, not part of the derived feature array.
  const handleCurrentRestore = useCallback(() => {
    const hasActiveCycle = (record?.current_cycle?.length ?? 0) > 0;
    if (!hasActiveCycle) {
      const status = record ? deriveDormantStatus(record) : null;
      const isDormant = record && !record.current_cycle && record.clusters?.features?.length === 0;
      setFieldActivity(prev => prev ? ({
        ...prev,
        dormant: isDormant,
        dormantColor: isDormant && status ? dormantColor(status.ndvi) : null,
        dormantStatus: isDormant ? status : null,
      }) : prev);
    }
    setView(prev => ({ ...prev, mode: 'overview', season: null }));
  }, [setView, setFieldActivity, record]);

  const selectedZoneId = view?.focusZone ?? null;
  const cycleNav = useCycleNav(record, selectedZoneId, handleCycleChange, handleCurrentRestore);

  // Reset the cycle-table truncation when switching between zones, so each new
  // zone starts collapsed to the first 5 rows.
  useEffect(() => { setShowAllCycles(false); }, [selectedZoneId]);

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

  // Open the crop-type override dropdown when arriving via the "Not {crop}?"
  // link from CultivationCard's title in the wallet listing.
  useEffect(() => {
    if (!fieldActivity?.pendingOverride) return;
    setShowOverride(true);
    setOverrideCropOpen(true);
    setCardView('default');
    setFieldActivity(prev => prev ? { ...prev, pendingOverride: false } : prev);
  }, [fieldActivity?.pendingOverride, setFieldActivity, setCardView]);

  // Sync selected zones (view.selected) into the join-batch form (select mode)
  useEffect(() => {
    const inSelect = view?.mode === 'select';
    if (!inSelect && form.coverage === 'partial') {
      // Select mode ended (confirm was clicked) — bring card back up
      setCardView('default');
      setForm(prev => ({ ...prev, coverage: 'confirmed' }));
      // Scroll variety dropdown into view after card animates back
      setTimeout(() => {
        varRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
      return;
    }
    if (!inSelect) return;
    setForm(prev => ({ ...prev, selectedClusters: view?.selected ?? [] }));
  }, [view?.mode, view?.selected]);

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
  const land_v2 = LAND.current.LAND?.metadata?.v ? true : false

  const activeCropType = normalizeCropType(fieldActivity?.activeCycle?.[0]?.crop_type)?.toLowerCase();
  const hasTokenForActiveCrop = activeCropType
    ? (tokenData ?? []).some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && sameCropFamily(CROP_CODE_NAMES[t.cropCode], activeCropType))
    : false;
  const activeCropTokenBal = hasTokenForActiveCrop
    ? (tokenData ?? []).filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && sameCropFamily(CROP_CODE_NAMES[t.cropCode], activeCropType))
        .reduce((s, t) => s + t.bal, 0)
    : 0;
  const activeCropTokenCode = hasTokenForActiveCrop
    ? (tokenData ?? []).find(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0 && sameCropFamily(CROP_CODE_NAMES[t.cropCode], activeCropType))?.cropCode
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
        onUpdate={(latest) => {
          const lifted = (latest?.y ?? 0) < -20;
          setFieldActivity(prev => (prev && !!prev.cardLifted !== lifted) ? { ...prev, cardLifted: lifted } : prev);
        }}
        onDragEnd={(_, info) => {
          if (view?.mode === 'select' && info.offset.y < -50) {
            setView(prev => ({ ...prev, mode: 'overview' }));
          }
          if (info.offset.y > 100 && (action || showAdvice)) {
            setAction(null);
            setShowAdvice(false);
            setCardView('mapview');
            motionAnimate.start({ y: 0, transition: springTransition });
          }
        }}
        style={{ touchAction: 'none' }}
        className="flex flex-col py-4 mb-96"
      >
        {/* Cycle nav — above the card, moves with it */}
        {action !== 'season' && !selectedZoneId && cycleNav.totalCount > 1 && (
          <div className="flex flex-col gap-1">
            {!cycleNav.isCurrent && (
              <button
                onClick={() => cycleNav.jumpTo(0)}
                className="self-center px-4 py-2 rounded-xl text-xs text-white dark:text-black bg-black dark:bg-white"
              >Reset</button>
            )}
            <CycleSwiper
              cycleIx={cycleNav.cycleIx}
              totalCount={cycleNav.totalCount}
              label={cycleNav.isCurrent ? 'Now' : (cycleNav.currentGroup?.label ?? `Season ${cycleNav.cycleIx}`)}
              navigate={cycleNav.navigate}
            />
          </div>
        )}
        {/* ── Section 1: Field status ── */}
        {action !== 'season' && (() => {
          const isFallowField = !record?.current_cycle && record?.clusters?.features?.length === 0;
          const anyFoodToken = (tokenData ?? []).some(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0);
          // Gate: only render once Wallet.js has processed record+tokenData for THIS field.
          // fieldActivity.recordToken is stamped by Wallet.js's useEffect — prevents stale
          // activeCycle from a previous field triggering the wrong state.
          if (!record || fieldActivity?.recordToken !== tokenId) return null;
          // activeCycle / current_cycle are authoritative for what is active now.
          const activeCycles = cycleNav.isCurrent
            ? (fieldActivity?.activeCycle?.length ? fieldActivity.activeCycle : (record?.current_cycle ?? []))
            : [];
          const hasActiveCycle = activeCycles.length > 0;
          // ac: active cycle to drive the cycleNav header. When a zone is selected
          // (card click or map click), pick that zone's cycle so the title and
          // crop-icon match. Otherwise fall back to the first cycle.
          const ac = (selectedZoneId
            ? activeCycles.find(c => (c.zone_id ?? c.cluster_id) === selectedZoneId)
            : activeCycles[0]) ?? activeCycles[0] ?? null;
          // When swiper is on a historical season group, use the primary (first) cycle for header display
          const primaryHist = cycleNav.currentGroup?.cycles[0] ?? null;
          const effectiveAc = primaryHist ? {
            crop_type: primaryHist.crop_type,
            sos: primaryHist.sos,
            predicted_eos: primaryHist.eos ? [primaryHist.eos] : null,
            expected_yield_kg_acre: primaryHist.yield_kg_per_acre ?? null,
            health: primaryHist.health ?? null,
            stage: null,
            variety: primaryHist.variety ?? null,
            is_open: false,
          } : (ac ?? (selectedZoneId ? {} : null));
          // tokenData is guaranteed non-null here (recordToken gate only unlocks after tokenData is fetched)
          // Deduplicate by cropCode to match the ordering of foodTokenDominants in Wallet.js (cardIx aligns).
          const activeFoodTokens = Object.values(
            (tokenData ?? [])
              .filter(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)
              .reduce((acc, t) => { const k = t.cropCode ?? t.sym; if (!acc[k]) acc[k] = t; return acc; }, {})
          );
          // Only show the panel for the currently selected cultivation card
          const visibleFoodTokens = cardIx != null ? activeFoodTokens.slice(cardIx, cardIx + 1) : activeFoodTokens;
          const recordCropLower = normalizeCropType(ac?.crop_type)?.toLowerCase() ?? null;

          // The selected zone is a "food zone" (→ token/monitoring panel, no
          // correction) ONLY when a held token covers it AND attests the same crop
          // as the zone's cycle (or the zone has no satellite crop yet). A stale
          // sugarcane token must NOT turn a green_gram zone into a food zone, else
          // its batch recommendation + "Not {crop}?" correction vanish. Plan 044 §5.3.
          const selZoneCropFam = selectedZoneId ? normalizeCropType(ac?.crop_type) : null;
          const selectedIsFoodZone = !!selectedZoneId && (tokenData ?? []).some(t => {
            if (t.type !== 'ERC1155' || !((t.bal ?? 0) > 0)) return false;
            let mask = 0n; try { mask = BigInt(t.fieldsBitmask ?? '0'); } catch { mask = 0n; }
            const zn = Number(String(selectedZoneId).replace(/_(a|b)$/, '').replace(/\D/g, ''));
            const coversZone = (mask & 1n) === 1n || (Number.isFinite(zn) && ((mask >> BigInt(zn + 1)) & 1n) === 1n);
            if (!coversZone) return false;
            return !selZoneCropFam || sameCropFamily(CROP_CODE_NAMES[t.cropCode], selZoneCropFam);
          });

          // fieldState for non-food-token paths only (states 1 and 2).
          // When on a historical group, force state 2 from the group data —
          // don't trust record.current_cycle which may still carry a stale is_open cycle.
          let fieldState;
          if (selectedZoneId && !selectedIsFoodZone) fieldState = 2;
          else if (anyFoodToken) fieldState = 'food';
          else if (!cycleNav.isCurrent && cycleNav.currentGroup) fieldState = 2;
          else if (hasActiveCycle) fieldState = 2;
          else fieldState = 1;
          const eos = effectiveAc?.predicted_eos;
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
          const healthColor = effectiveAc?.health === 'stressed' ? 'text-amber-500' : effectiveAc?.health === 'poor' ? 'text-red' : 'text-green dark:text-amber-400';

          const isBatchFeasible = (b) => {
            if (!b.deliveryDate || b.deliveryDate === 0) return true;
            const growDays = TYPICAL_GROW_DAYS[b.cropCode] ?? 100;
            return Date.now() / 1000 + growDays * 86400 < b.deliveryDate;
          };

          const areaM2 = record?.meta?.parcel_area_m2 ?? 0;
          const areaAcres = areaM2 / 4046.86;
          const effectiveAcres = areaAcres * 0.85;

          const effectiveCropType = normalizeCropType((cycleNav.isCurrent ? override?.cropType : null) ?? effectiveAc?.crop_type);
          // Is THIS card's crop already tokenised? (hasTokenForActiveCrop keys off
          // activeCycle[0] — the field's first cycle — so it's wrong per-card.)
          // Correction is offered for every state except a food-token-backed crop.
          const effectiveCropTokenized = !!effectiveCropType && (tokenData ?? []).some(t =>
            t.type === 'ERC1155' && (t.bal ?? 0) > 0 && sameCropFamily(CROP_CODE_NAMES[t.cropCode], effectiveCropType)
          );
          const isManual = cycleNav.isCurrent && !!override?.cropType;
          const isUnknownCrop = !effectiveCropType || effectiveCropType === 'unknown';
          const overrideCropCode = isManual
            ? (CROPS_DATA.find(([, n]) => n === override.cropType)?.[0] ?? null)
            : null;
          const matchingBatches = (batchSummary?.active ?? [])
            .filter(b => sameCropFamily(CROP_CODE_NAMES[b.cropCode], effectiveCropType))
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

              {loading && <Spinner size='small' stages={'loading latest records'} />}

              {/* ── State 1: Fallow — available batches with earnings ── */}
              {fieldState === 1 && view?.mode !== 'season' && !selectedZoneId && (
                <div className="px-4 pt-3 flex flex-col gap-2">
                  <DormantCard record={record} />
                  {/* Season table including fallow rows — mirrors the state-2
                      table so the user sees zone-by-zone status in Now view too. */}
                  {(() => {
                    const allCycles = Array.isArray(record?.cycles) ? record.cycles : Object.values(record?.cycles || {});
                    const mergedZones = mergeZonesWithSubzones(record).filter(z => !z._backdrop);
                    if (!mergedZones.length) return null;
                    let fallowArea = 0;
                    let fallowLastEos = null;
                    for (const z of mergedZones) {
                      fallowArea += Number(z.area_m2) || 0;
                      const eosForZone = allCycles
                        .filter(c => {
                          const cz = c?.zone_id || '';
                          return cz === z.zone_id || (z.subzone_of && cz === z.subzone_of);
                        })
                        .map(c => c.eos)
                        .filter(Boolean)
                        .sort()
                        .reverse()[0];
                      if (eosForZone && (!fallowLastEos || eosForZone > fallowLastEos)) fallowLastEos = eosForZone;
                    }
                    if (fallowArea <= 0) return null;
                    return (
                      <div className="pt-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1 pb-1">Season</p>
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-gray-400 dark:text-slate-500">
                              <th className="text-left pb-1 font-semibold">Crop</th>
                              <th className="text-right pb-1 font-semibold">Harvest</th>
                              <th className="text-right pb-1 font-semibold">Size</th>
                              <th className="text-right pb-1 font-semibold">Yield</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-gray-100 dark:border-slate-700">
                              <td className="py-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#9ca3af', flexShrink:0 }} />
                                  <span className="capitalize dark:text-white">fallow</span>
                                </div>
                              </td>
                              <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{fallowLastEos ? (formatHarvestDate(fallowLastEos) ?? fallowLastEos) : '—'}</td>
                              <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{Math.round(fallowArea)} m²</td>
                              <td className="py-0.5 text-right font-bold dark:text-white whitespace-nowrap">—</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
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
                                    backgroundColor: 'white',
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

              {/* ── State 2: Active cycle or historical group, no food token ── */}
              {fieldState === 2 && effectiveAc && (
                <div className="flex flex-col gap-1.5 px-4 pt-3">
                  {showOverride && (
                    <div className="flex flex-col gap-2 py-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 mb-1">
                      <div ref={overrideCropRef} className="relative">
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => setOverrideCropOpen(o => !o)}
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-left flex items-center justify-between"
                        >
                          <span>{override?.cropType ?? `detected: ${ac?.crop_type ?? '—'}`}</span>
                          <ChevronDownIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${overrideCropOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {overrideCropOpen && !overridePending && (
                          <div className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg overflow-auto max-h-48">
                            <button
                              key="__detected__"
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => { setOverride(prev => { const n = { ...(prev ?? {}) }; delete n.cropType; return Object.keys(n).length ? n : null; }); setOverrideCropOpen(false); setShowOverride(false); setCropPendingVerification(false); }}
                              className={`w-full text-left text-xs px-3 py-1.5 dark:text-white ${!override?.cropType ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                            >detected: {ac?.crop_type ?? '—'}</button>
                            {Array.isArray(ac?.alternatives) && ac.alternatives.length > 0 && (
                              <>
                                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/50">
                                  Suggested
                                </div>
                                {ac.alternatives.map(({ crop_type, confidence }) => {
                                  const display = String(crop_type ?? '').split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
                                  const conf = Math.round((confidence ?? 0) * 100);
                                  return (
                                    <button
                                      key={`alt-${crop_type}`}
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={() => {
                                        const prevOverride = override;
                                        const cid = ac?.cluster_id ?? ac?.zone_id;
                                        setOverride(prev => ({ ...(prev ?? {}), cropType: display, clusterId: cid }));
                                        setOverrideCropOpen(false);
                                        setShowOverride(false);
                                        submitCropCorrection(cid, crop_type, prevOverride, ac?.alternatives);
                                      }}
                                      className={`w-full text-left text-xs px-3 py-1.5 dark:text-white flex items-center justify-between ${override?.cropType === display ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                                    >
                                      <span>{display}</span>
                                      <span className="text-[9px] text-gray-400 dark:text-slate-500">{conf}%</span>
                                    </button>
                                  );
                                })}
                                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/50">
                                  Other crops
                                </div>
                              </>
                            )}
                            {SELECTOR_CROPS.map(([name]) => {
                              const base = cropBase(name);
                              const needsSubQuestion = base === 'sugarcane' || base === 'coconut';
                              return (
                                <button
                                  key={name}
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={() => {
                                    const prevOverride = override;
                                    const cid = ac?.cluster_id ?? ac?.zone_id;
                                    if (needsSubQuestion) {
                                      // Defer commit until sub-question answered.
                                      setOverridePending({
                                        cluster_id: cid,
                                        cropName: name,
                                        prevOverride,
                                        alternatives: ac?.alternatives,
                                      });
                                      return;
                                    }
                                    setOverride(prev => ({ ...(prev ?? {}), cropType: name, clusterId: cid }));
                                    setOverrideCropOpen(false);
                                    setShowOverride(false);
                                    submitCropCorrection(cid, name, prevOverride, ac?.alternatives);
                                  }}
                                  className={`w-full text-left text-xs px-3 py-1.5 dark:text-white flex items-center justify-between ${override?.cropType === name ? 'bg-gray-100 dark:bg-slate-600 font-semibold' : 'active:bg-gray-50 dark:active:bg-slate-600'}`}
                                >
                                  <span>{name}</span>
                                  {needsSubQuestion && <span className="text-[9px] text-gray-400 dark:text-slate-500">→</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {overrideCropOpen && overridePending && cropBase(overridePending.cropName) === 'sugarcane' && (
                          <div className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg p-2">
                            <p className="text-[10px] text-gray-500 dark:text-slate-400 px-1 pb-2">How was the sugarcane planted?</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {SUGARCANE_SUBTYPES.map(({ key, label }) => (
                                <button
                                  key={key}
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={() => {
                                    const p = overridePending;
                                    const labelled = `${p.cropName} (${label})`;
                                    setOverride(prev => ({ ...(prev ?? {}), cropType: labelled, clusterId: p.cluster_id }));
                                    setOverridePending(null);
                                    setOverrideCropOpen(false);
                                    setShowOverride(false);
                                    submitCropCorrection(p.cluster_id, p.cropName, p.prevOverride, p.alternatives, { subtype: key });
                                  }}
                                  className="text-xs px-2 py-2 rounded-md border border-gray-200 dark:border-slate-600 dark:text-white active:bg-gray-50 dark:active:bg-slate-600"
                                >{label}</button>
                              ))}
                            </div>
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setOverridePending(null)}
                              className="w-full text-[10px] text-gray-400 dark:text-slate-500 pt-2"
                            >← back</button>
                          </div>
                        )}
                        {overrideCropOpen && overridePending && cropBase(overridePending.cropName) === 'coconut' && (
                          <div className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg p-2 max-h-72 overflow-auto">
                            <p className="text-[10px] text-gray-500 dark:text-slate-400 px-1 pb-2">Anything growing under the canopy?</p>
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => {
                                const p = overridePending;
                                setOverride(prev => ({ ...(prev ?? {}), cropType: p.cropName, clusterId: p.cluster_id }));
                                setOverridePending(null);
                                setOverrideCropOpen(false);
                                setShowOverride(false);
                                submitCropCorrection(p.cluster_id, p.cropName, p.prevOverride, p.alternatives);
                              }}
                              className="w-full text-left text-xs px-2 py-1.5 rounded-md dark:text-white active:bg-gray-50 dark:active:bg-slate-600"
                            >No intercrop</button>
                            <div className="border-t border-gray-100 dark:border-slate-600 my-1" />
                            {INTERCROP_CANDIDATES.map(ic => (
                              <button
                                key={ic}
                                onPointerDown={e => e.stopPropagation()}
                                onClick={() => {
                                  const p = overridePending;
                                  const labelled = `${p.cropName} + ${ic}`;
                                  setOverride(prev => ({ ...(prev ?? {}), cropType: labelled, clusterId: p.cluster_id }));
                                  setOverridePending(null);
                                  setOverrideCropOpen(false);
                                  setShowOverride(false);
                                  submitCropCorrection(p.cluster_id, p.cropName, p.prevOverride, p.alternatives, { intercrop: ic.toLowerCase().replace(/\s+/g, '_') });
                                }}
                                className="w-full text-left text-xs px-2 py-1.5 rounded-md dark:text-white active:bg-gray-50 dark:active:bg-slate-600"
                              >{ic}</button>
                            ))}
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setOverridePending(null)}
                              className="w-full text-[10px] text-gray-400 dark:text-slate-500 pt-2"
                            >← back</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {cycleNav.isCurrent && (
                    isUnknownCrop ? (
                      // Crop couldn't be classified — invite the farmer to tap
                      // the title to set it themselves. No "Not unknown?" link.
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => setShowOverride(v => !v)}
                        className="text-left active:scale-95"
                      >
                        <span className="text-sm font-semibold text-blue-500 dark:text-blue-400">What are you growing?</span>
                      </button>
                    ) : (
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
                      {!effectiveCropTokenized && (
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => setShowOverride(v => !v)}
                          className="text-[10px] text-blue-500 dark:text-blue-400 flex-shrink-0"
                        >Not {effectiveCropType}?</button>
                      )}
                    </div>
                    )
                  )}
                  <div className="pt-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pt-1 pb-1">Season</p>
                    {/* Zone detail: flat list of all cycles for the selected zone */}
                    {selectedZoneId && (() => {
                      const zoneAreaM2 = (fieldActivity?.geojson?.features ?? [])
                        .reduce((s, f) => s + (Number(f.properties?.area_m2) || 0), 0);
                      const allCycles = Object.entries(record?.cycles ?? {})
                        .map(([key, c]) => ({ key, ...c }))
                        .filter(c => (c.zone_id ?? c.cluster_id) === selectedZoneId)
                        .sort((a, b) => (b.sos ?? '') > (a.sos ?? '') ? 1 : -1);
                      const zoneActive = activeCycles.find(c => (c.zone_id ?? c.cluster_id) === selectedZoneId) ?? null;
                      // Collapse historical rows past 5 behind a "Show more"
                      // toggle. The active row (when present) is always shown
                      // and doesn't count against the limit.
                      const ROW_LIMIT = 5;
                      const visibleCycles = showAllCycles ? allCycles : allCycles.slice(0, ROW_LIMIT);
                      const hiddenCount = Math.max(0, allCycles.length - visibleCycles.length);
                      return (
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-gray-400 dark:text-slate-500">
                              <th className="text-left pb-1 font-semibold">Crop</th>
                              <th className="text-right pb-1 font-semibold">Start</th>
                              <th className="text-right pb-1 font-semibold">Harvest</th>
                              <th className="text-right pb-1 font-semibold">Yield</th>
                            </tr>
                          </thead>
                          <tbody>
                            {zoneActive && (
                              <tr className="border-t border-gray-100 dark:border-slate-700">
                                <td className="py-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: cropColor(normalizeCropType(zoneActive.crop_type)), flexShrink:0 }} />
                                    <span className="capitalize dark:text-white">{(zoneActive.crop_type ?? 'unknown').replace(/_/g, ' ')}</span>
                                    <span className="text-gray-400 dark:text-slate-500">active</span>
                                  </div>
                                </td>
                                <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatHarvestDate(zoneActive.sos) ?? '—'}</td>
                                <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{zoneActive.predicted_eos?.[0] ? formatHarvestDate(zoneActive.predicted_eos[0]) : '—'}</td>
                                <td className="py-0.5 text-right font-bold dark:text-white whitespace-nowrap">{zoneActive.expected_yield_kg_acre ? `${zoneActive.expected_yield_kg_acre} kg/ac` : '—'}</td>
                              </tr>
                            )}
                            {visibleCycles.map(c => {
                              const cropKey = normalizeCropType(c.crop_type) ?? 'unknown';   // for color
                              const cropDisplay = (c.crop_type ?? 'unknown').replace(/_/g, ' ');  // for label
                              const yieldVal = c.yield_kg_per_acre ?? c.expected_yield_kg_acre ?? null;
                              return (
                                <tr key={c.key} className="border-t border-gray-100 dark:border-slate-700">
                                  <td className="py-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: cropColor(cropKey), flexShrink:0 }} />
                                      <span className="capitalize dark:text-white">{cropDisplay}</span>
                                    </div>
                                  </td>
                                  <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatHarvestDate(c.sos) ?? '—'}</td>
                                  <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{c.eos ? formatHarvestDate(c.eos) : '—'}</td>
                                  <td className="py-0.5 text-right font-bold dark:text-white whitespace-nowrap">{yieldVal ? `${yieldVal} kg/ac` : '—'}</td>
                                </tr>
                              );
                            })}
                            {(hiddenCount > 0 || (showAllCycles && allCycles.length > ROW_LIMIT)) && (
                              <tr className="border-t border-gray-100 dark:border-slate-700">
                                <td colSpan={4} className="py-1 text-center">
                                  <button
                                    onPointerDown={e => e.stopPropagation()}
                                    onClick={() => setShowAllCycles(v => !v)}
                                    className="text-[10px] text-blue-500 dark:text-blue-400"
                                  >{showAllCycles ? 'Show less' : `Show ${hiddenCount} more`}</button>
                                </td>
                              </tr>
                            )}
                            {zoneAreaM2 > 0 && (
                              <tr className="border-t border-gray-100 dark:border-slate-700">
                                <td className="py-0.5 text-gray-500 dark:text-slate-400">Size</td>
                                <td colSpan={3} className="py-0.5 text-right font-bold dark:text-white">{Math.round(zoneAreaM2)} m²</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      );
                    })()}
                    {/* Compact table: historical group or active cycles, with
                        fallow zones merged as their own row. */}
                    {!selectedZoneId && (() => {
                      const rawCycles = cycleNav.currentGroup?.cycles ?? (cycleNav.isCurrent ? activeCycles : []);
                      // Area per crop — keyed by RAW crop_type so plant/ratoon
                      // stay as separate rows.
                      const cropAreaMap = {};
                      for (const f of (fieldActivity?.geojson?.features ?? [])) {
                        const k = f.properties?.crop_type ?? 'unknown';
                        cropAreaMap[k] = (cropAreaMap[k] ?? 0) + (Number(f.properties?.area_m2) || 0);
                      }
                      // Merge harvest + yield from cycle records, keyed by RAW crop_type.
                      const merged = {};
                      const coveredZones = new Set();
                      for (const c of (rawCycles || [])) {
                        const crop = c.crop_type ?? 'unknown';
                        const eosRaw = c.eos ?? c.predicted_eos?.[0];
                        const yieldVal = c.yield_kg_per_acre ?? c.expected_yield_kg_acre ?? null;
                        if (!merged[crop]) merged[crop] = { crop, eos: eosRaw, yields: [] };
                        else if (eosRaw && (!merged[crop].eos || eosRaw > merged[crop].eos)) merged[crop].eos = eosRaw;
                        if (yieldVal != null) merged[crop].yields.push(yieldVal);
                        const cz = c?.zone_id ?? c?.cluster_id;
                        if (cz) {
                          coveredZones.add(cz);
                          coveredZones.add(String(cz).replace(/_(a|b)$/, ''));
                        }
                      }
                      // Fallow zones: any merged zone (incl. subzones) that no
                      // cycle in the current view touches.
                      const allCycles = Array.isArray(record?.cycles) ? record.cycles : Object.values(record?.cycles || {});
                      const mergedZones = mergeZonesWithSubzones(record).filter(z => !z._backdrop);
                      let fallowArea = 0;
                      let fallowLastEos = null;
                      for (const z of mergedZones) {
                        if (coveredZones.has(z.zone_id)) continue;
                        if (z.subzone_of && coveredZones.has(z.subzone_of)) continue;
                        fallowArea += Number(z.area_m2) || 0;
                        const eosForZone = allCycles
                          .filter(c => {
                            const cz = c?.zone_id || '';
                            return cz === z.zone_id || (z.subzone_of && cz === z.subzone_of);
                          })
                          .map(c => c.eos)
                          .filter(Boolean)
                          .sort()
                          .reverse()[0];
                        if (eosForZone && (!fallowLastEos || eosForZone > fallowLastEos)) fallowLastEos = eosForZone;
                      }
                      if (fallowArea > 0) {
                        merged['__fallow'] = { crop: 'fallow', eos: fallowLastEos, yields: [], _fallowSize: fallowArea };
                      }
                      const rows = Object.values(merged);
                      if (!rows.length) return null;
                      return (
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-gray-400 dark:text-slate-500">
                              <th className="text-left pb-1 font-semibold">Crop</th>
                              <th className="text-right pb-1 font-semibold">Harvest</th>
                              <th className="text-right pb-1 font-semibold">Size</th>
                              <th className="text-right pb-1 font-semibold">Yield</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ crop, eos: eosRaw, yields, _fallowSize }) => {
                              const isFallow = crop === 'fallow';
                              const cropKey = isFallow ? 'fallow' : normalizeCropType(crop);  // for color/icon lookup
                              const col  = isFallow ? '#9ca3af' : cropColor(cropKey);
                              const icon = isFallow ? null : cropIconUrl(cropKey);
                              const isRatoon = !isFallow && /ratoon/i.test(crop);
                              const avgYield = yields.length ? Math.round(yields.reduce((s, v) => s + v, 0) / yields.length) : null;
                              const sizeM2 = isFallow ? (_fallowSize ?? 0) : (cropAreaMap[crop] ?? 0);
                              const onRowClick = () => {
                                const zoneIds = isFallow
                                  ? mergedZones
                                      .filter(z => !coveredZones.has(z.zone_id) && !(z.subzone_of && coveredZones.has(z.subzone_of)))
                                      .map(z => z.zone_id)
                                  : (rawCycles || [])
                                      .filter(c => (c.crop_type ?? 'unknown') === crop)
                                      .map(c => c?.zone_id ?? c?.cluster_id)
                                      .filter(Boolean);
                                if (!zoneIds.length) return;
                                // Plan 044 §5.1 — focus the row's zones; features derive.
                                setView(prev => ({ ...prev, mode: 'zone', focus: zoneIds, focusZone: zoneIds[0] }));
                                setCardView('mapview');
                              };
                              return (
                                <tr
                                  key={crop}
                                  className="border-t border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/40"
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={onRowClick}
                                >
                                  <td className="py-0.5">
                                    <div className="flex items-center gap-1.5">
                                      {icon
                                        ? (
                                          <span
                                            className="inline-flex items-center justify-center flex-shrink-0"
                                            style={{ width: 14, height: 14, borderRadius: '50%', border: isRatoon ? '1px solid #9ca3af' : '1px solid transparent', boxSizing: 'border-box' }}
                                          >
                                            <div style={{ width: 10, height: 10, WebkitMaskImage:`url(${icon})`, maskImage:`url(${icon})`, WebkitMaskRepeat:'no-repeat', maskRepeat:'no-repeat', WebkitMaskSize:'contain', maskSize:'contain', WebkitMaskPosition:'center', maskPosition:'center', backgroundColor: col }} />
                                          </span>
                                        )
                                        : (
                                          <span
                                            className="inline-flex items-center justify-center flex-shrink-0"
                                            style={{ width: 14, height: 14 }}
                                          >
                                            <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:col }} />
                                          </span>
                                        )
                                      }
                                      <span className="capitalize dark:text-white">{crop.replace(/_/g, ' ')}</span>
                                    </div>
                                  </td>
                                  <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{eosRaw ? formatHarvestDate(eosRaw) : '—'}</td>
                                  <td className="py-0.5 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{sizeM2 > 0 ? `${Math.round(sizeM2)} m²` : '—'}</td>
                                  <td className="py-0.5 text-right font-bold dark:text-white whitespace-nowrap">{avgYield ? `${avgYield} kg/ac` : '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                  {cycleNav.isCurrent && <div className="mt-2 flex flex-col gap-2">
                    {bestBatch ? (() => {
                      const feasible = isBatchFeasible(bestBatch);
                      const typicalKg = (!isManual && effectiveAc?.expected_yield_kg_acre)
                        ? effectiveAc.expected_yield_kg_acre * effectiveAcres
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
                                  backgroundColor: 'white',
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
                  </div>}
                </div>
              )}

              {/* ── Food token states: one panel per token (state 3 = matches satellite, state 4 = no match) ── */}
              {fieldState === 'food' && (!selectedZoneId || selectedIsFoodZone) && visibleFoodTokens.map(tok => {
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
                        <span className="text-sm font-semibold dark:text-white">{normalizeCropType(ac.crop_type)}</span>
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
              {/* Header row — property/field name lives in the top map header now */}
              <div className="flex items-center justify-between px-4">
                <p className="text-[10px] text-gray-400 dark:text-slate-300 leading-relaxed flex gap-1.5 pt-1">
                  <span className="flex-shrink-0">⚠️</span>
                  <span>Beta — data may be inaccurate.</span>
                </p>
              </div>

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
              <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">
                The property history is available publicly as it is generated from public data sources using nila proprietary services. However we do require readers to pay a fee, each time the record is updated. You get 30% of that fee.
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-gray-400 dark:text-slate-500">Earned so far</span>
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
            <div style={{ zIndex: 0 }} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1 px-6 py-5 items-center gap-3" onPointerDown={(e) => controls.start(e)}>
              <motion.div className="animate-bounce dark:text-white">
                <p className="font-Chains text-[2.5rem] leading-none text-center my-12">a</p>
              </motion.div>
              <p className="text-xs text-gray-400 dark:text-slate-300 text-center">Setting up your field data record. This sometimes take a few days, but generally should be done in a few hours. Hang on.</p>
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

            {/* No batches empty state — also covers batchSummary still undefined */}
            {action === 'season' && !form.selectedBatch && (batchSummary?.active?.length ?? 0) === 0 && (
              <div className="flex flex-col gap-1">
                <button disabled className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 opacity-50">
                  <span className="text-xs text-gray-400 dark:text-slate-400">No matching batch available</span>
                </button>
                <p className="text-[10px] text-gray-400 dark:text-slate-300 leading-relaxed flex gap-1.5">
                  <span className="flex-shrink-0">⚠️</span>
                  <span>Ask your union to create batch orders for the crops you are growing.</span>
                </p>
              </div>
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
                          // Plan 044 §5.1 — enter select mode via the view. The
                          // selectable outlines are derived by featuresFor; the
                          // tapped set lives in view.selected (no snapshot stack).
                          setForm(prev => ({...prev, coverage: 'partial', selectedClusters: []}));
                          setCardView('mapview');
                          setView(prev => ({ ...prev, mode: 'select', selected: [] }));
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
                      <p className="text-[10px] text-green-600 dark:text-amber-400">
                        {((record?.meta?.parcel_area_m2 ?? 0) / 4046.86).toFixed(1)} ac — entire property
                      </p>
                    )}
                    {form.coverage === 'confirmed' && form.selectedClusters?.length > 0 && (
                      <p className="text-[10px] text-green dark:text-amber-400">
                        {form.selectedClusters.length} zone(s) confirmed · {(
                          mergeZonesWithSubzones(record)
                            .filter(z => !z._backdrop && new Set(form.selectedClusters).has(z.zone_id))
                            .reduce((s, z) => s + (z.area_m2 ?? 0), 0) / 4046.86
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
                  const sosDraft = form.sosDraft ?? form.sos ?? oracleSos ?? todayStr;
                  const sosForDisplay = form.sos || oracleSos;
                  const sosDisplayFormatted = sosForDisplay
                    ? new Date(sosForDisplay + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
                    : null;

                  return (
                    <>
                      <p className="text-xs dark:text-slate-300">Start of season</p>

                      {!form.sosEditing ? (
                        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                          <p className="text-xs dark:text-white">
                            {form.sos && form.sos !== oracleSos
                              ? <>You set planting to <span className="font-semibold">{sosDisplayFormatted}</span></>
                              : hasCaseA
                                ? <>We detected planting on <span className="font-semibold">{oracleSosFormatted}</span>{oracleDaysAgo != null ? ` — ${oracleDaysAgo}d ago` : ''}</>
                                : <span className="text-gray-500 dark:text-slate-400">When did you plant?</span>}
                          </p>
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onClick={() => setForm(prev => ({ ...prev, sosEditing: true }))}
                            className="text-[10px] text-blue-500 dark:text-blue-400 flex-shrink-0 self-start"
                          >Change date</button>
                        </div>
                      ) : (
                        <div className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                          <input
                            type="date"
                            value={form.sos || oracleSos || todayStr}
                            max={todayStr}
                            min={minSosStr}
                            onPointerDown={e => e.stopPropagation()}
                            onChange={e => {
                              if (e.target.value) {
                                setForm(prev => ({ ...prev, sos: e.target.value, sosEditing: false }));
                              }
                            }}
                            className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white dark:[color-scheme:dark] px-3 py-1.5"
                          />
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
                  const canJoin           = (!varietyRequired || !!form.var) && !!form.sos && (form.coverage === 'full' || form.coverage === 'confirmed') && !cropPendingVerification;

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

                    // Compute field codex bitmask — bit 0 = entire property; zone zN → bit (N+1).
                    // The contract stores `yearFieldBitmask[landTitleId][year] |= fieldsBitmask`,
                    // so this must be a real bitfield (bit i set ⇒ field i claimed), NOT a zone index.
                    let fieldsBitmask = 1n; // default: entire property
                    let fieldAreaM2 = 0;
                    if (form.coverage === 'confirmed' && form.selectedClusters?.length > 0) {
                      const sel = new Set(form.selectedClusters);
                      const pickedZones = mergeZonesWithSubzones(record)
                        .filter(z => !z._backdrop && sel.has(z.zone_id));
                      fieldAreaM2 = Math.round(pickedZones.reduce((s, z) => s + (z.area_m2 ?? 0), 0));
                      // zone zN (and its subzones zN_a, …) → bit (N+1); OR all picked zones together
                      const mask = pickedZones.reduce((m, z) => {
                        const idx = parseInt(String(z.zone_id).match(/(\d+)/)?.[1] ?? '0', 10);
                        return m | (1n << BigInt(idx + 1));
                      }, 0n);
                      fieldsBitmask = mask === 0n ? 1n : mask; // fall back to entire property if none resolved
                    } else {
                      fieldsBitmask = 1n; // entire property
                      fieldAreaM2 = Math.round(record?.meta?.parcel_area_m2 ?? 0);
                    }
                    console.log('[joinBatch] field codex', { fieldsBitmask: '0b' + fieldsBitmask.toString(2), fieldAreaM2, coverage: form.coverage });
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
                        return foodToken.mintForBatchMember(form.selectedBatch.id, landTitleId, harvestTs, effectiveYieldKg, fieldsBitmask, fieldAreaM2, farmerVarietyCode, sosTs, { nonce });
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
                      {joining ? 'Joining…' : canJoin ? 'Join batch' : cropPendingVerification ? 'Awaiting union confirmation' : !form.coverage ? 'Select area above' : form.coverage === 'partial' ? 'Confirm field selection' : !form.sos ? 'Add start of season' : 'Select variety to continue'}
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
