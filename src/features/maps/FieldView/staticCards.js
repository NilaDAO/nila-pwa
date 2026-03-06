import { useEffect, useMemo, useState, useRef } from 'react';
import { useDataContext,useViewModeContext } from '../../../utils/NavigationContext';
import useActivityMapping from '../../../hooks/useActivityMapping'
import { cropColor } from '../../../utils/cropColors.js';
import { motion } from 'framer-motion';
import { RateSlider, ClaimButton, DropdownButton } from '../../../components/UI/buttons';
import Spinner from '../../../components/UI/spinner.js';
import useLendingFlow from '../../../hooks/useDirectLendingFlow.js'
import { useMintFoodToken, useBurnLandTitle } from '../../../hooks/useMintLandTitle.ts'

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

  const CROPS = [['0',"Paddy",'50',"bags"],['1',"Groundnut",'50',"bags"],['2',"Sugarcane",'1000',"tons"],['3',"Banana",'20',"bunches"],['4',"Potato",'50',"bags"],['5',"Onion",'50',"bags"]]
  const VARS = {
    0 : [['0',"CO 51"],['1',"ADT 43"],['2',"TRY 3"],['3',"BPT 5204"]],
    1 : [['0',"TMV 7"],['1',"TMV 13"],['2',"VRI 2"],['3',"VRI 3"],['3',"VRI 6"]],
    2 : [['0',"CO 86032"],['1',"COC 24"],['2',"COC 671"],['3',"CO 62175"]],
    3 : [['0',"Grand Naine"],['1',"Poovan"],['2',"Nendran"],['3',"Rasthali"]],
    4 : [['0',"Kufri Jyoti"],['1',"Kufri Super"],['2',"Kufri Surya"]],
    5 : [['0',"CO 3"],['1',"CO (On) 5"],['2',"Arka Kalyan"],['3',"Agrifound Dark Red"]],
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

export const StaticCards = ({ LAND }) => {
  const [ action, setAction ]                  = useState(null)
  const [ loading, setLoading ]                = useState(true)
  const { db, fieldActivity,setFieldActivity } = useDataContext();
  const { setCardView }                        = useViewModeContext();
  const [ selected, setSelected ]              = useState([])
  const { handleFieldActivity }                = useActivityMapping()
  const { burnLandTitle }                      = useBurnLandTitle(db.chain);

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

  const BetaWarning = () => (
    <div className="inset-0 flex items-center justify-center w-full z-20">
      <div className="relative flex flex-col items-center p-4 bg-red dark:bg-red rounded-3xl shadow-bottom">
        <p className="text-xs text-white dark:text-black mx-4">⚠️ This feature is currently in beta. Data provided can be inaccurate.</p>
      </div>
    </div>
  )

  return (
      <>
      <BetaWarning />
      <div className="flex flex-col mb-[220px] py-4 mb-96"> 
        <div style={{ zIndex: 0}} className="flex w-full bg-white dark:bg-gray-700 rounded-3xl shadow-bottom flex-col my-1">
                <div className="flex flex-col justify-evenly p-8">
                  { fieldActivity && fieldActivity.features.length > 0 && fieldActivity.features.length < featureLength ?
                  (() => {
                    const props = fieldActivity.features[0].properties;
                    const cropType = typeof props?.crop_type === 'string' ? props.crop_type : (props?.crop_type?.dominant?.label || props?.crop_type?.label);
                    const areaM2 = Number(props?.area_m2 || 0);
                    const yieldKgPerAcre = Number(props?.yield_kg_per_acre || 0);
                    const yieldKg = areaM2 > 0 && yieldKgPerAcre > 0 ? (areaM2 / 4046.86) * yieldKgPerAcre : null;
                    const harvest = props?.harvest_window;
                    const harvestText = (() => {
                      if (!harvest?.earliest) return null;
                      const now = new Date();
                      const earliest = new Date(harvest.earliest);
                      const latest = harvest.latest ? new Date(harvest.latest) : null;
                      const daysEarliest = Math.round((earliest - now) / 86400000);
                      if (daysEarliest < 0) return 'harvest window passed';
                      const fmt = (d) => d > 30 ? `${Math.round(d / 7)} wks` : `${d}d`;
                      return latest
                        ? `${fmt(daysEarliest)} – ${fmt(Math.round((latest - now) / 86400000))}`
                        : fmt(daysEarliest);
                    })();
                    return (
                    <div>
                      <div className='px-4 pt-2 flex flex-col gap-1'>
                        {cropType && cropType !== 'unknown' && cropType !== 'other' &&
                          <p className='text-sm font-semibold dark:text-white flex items-center gap-1'>
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cropColor(cropType) }} />
                            {cropType}
                          </p>
                        }
                        {yieldKg !== null &&
                          <p className='text-xs dark:text-slate-300'>
                            Est. yield: <span className='font-semibold'>{(yieldKg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t</span>
                          </p>
                        }
                        {harvestText &&
                          <p className='text-xs dark:text-slate-300'>
                            Harvest in: <span className='font-semibold'>{harvestText}</span>
                          </p>
                        }
                        {props?.classification_log?.farmer_advice &&
                          <p className='py-1 text-sm dark:text-slate-300'>
                            {props.classification_log.farmer_advice}
                          </p>
                        }
                      </div>
                    </div>
                    );
                  })()
                  :
                  <>
                  <h3 className='font-bold px-4 dark:text-white' >{db['farmname']}</h3>
                  <h3 className='px-4 dark:text-white'>Select new field(s) to track.</h3>
                  { loading && <Spinner size='small' stages={'loading latest records'} />}
                  { !loading && 

                    <div className='flex flex-row justify-between'>
                      <div>
                      { fieldActivity && clusterGroups.map((group) => {
                        const clusterArea = group.features.reduce((s, f) => s + Number(f.properties?.area_m2 || 0), 0);
                        const clusterYieldKg = group.features.reduce((s, f) => {
                          const a = Number(f.properties?.area_m2 || 0);
                          const ypa = Number(f.properties?.yield_kg_per_acre || 0);
                          return s + (a / 4046.86) * ypa;
                        }, 0);
                        return (
                        <div key={group.key} className="flex px-4 py-1">
                        <input checked={selected.includes(group.key)} onChange={() => handleCheckMark(group.key)} type="checkbox" className="w-4 h-4 m-1 accent-black dark:accent-green_dark border-gray-300 bg-red dark:border-slate-400 rounded" />
                        <div onClick={() => handleViewSingleArea(group)} className="px-2">
                          <p className='dark:text-slate-400'>{`${group.name} - ${group.clusterNumber}`}</p>
                          <p className='text-xs font-bold dark:text-white flex items-center gap-1'>
                            <span
                              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cropColor(group.features[0]?.properties?.crop_type) }}
                            />
                            {(() => {
                              const ct = group.features[0]?.properties?.crop_type;
                              const label = typeof ct === 'string' ? ct : (ct?.dominant?.label || ct?.label);
                              return (label && label !== 'unknown' && label !== 'other') ? label : CLASS_NAMES[group.class];
                            })()}
                          </p>
                          <p className='text-xs dark:text-slate-400'>
                            {clusterArea > 0 ? `${clusterArea.toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²` : ''}
                            {clusterYieldKg > 0 ? ` · ${clusterYieldKg.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kg est.` : ''}
                          </p>
                        </div>
                        </div>
                        );
                      })}
                      </div>
                    </div>
                  }                  
                  <p className='flex text-xs dark:text-slate-400 justify-end'>last satellite overflight: {fieldActivity?.meta?.last_scene_date}</p>
                  </>
                  }
              </div>
        </div>
        { /* fieldActivity && fieldActivity.features.length < featureLength && (!action || action === 'mint') && <MintAsset fieldActivity={fieldActivity} selected={selected} LAND={LAND} setAction={() => setAction('mint')} /> */ }
        { /* fieldActivity && fieldActivity.features.length < featureLength && (!action || action === 'share') &&  <SharedCropping fieldActivity={fieldActivity} selected={selected} LAND={LAND} setAction={() => setAction('share')}  /> */ }
      </div>
      </>
  )

}
