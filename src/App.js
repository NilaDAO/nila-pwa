// App.js – Root component implementing startup flow for React (CRA) PWA
// --------------------------------------------------------------
// Flow order (do not change):
// 1. Version check  -> unregister SW  -> optional hard‑reset DB  -> reload
// 2. Detect mobile
// 3. Ensure PWA is installed (standalone mode)
// 4. Network status:   offline => cache / IDB  |  online => fetch + set contexts
// 5. If nothing in DB/contexts after 4, route to register_recover
// --------------------------------------------------------------

import { useEffect, useState, useCallback,useRef } from 'react';
import { Routes, Route } from 'react-router-dom';

// 🛠️ UI pieces (place‑holders)
import RegisterRecover from './features/registration/registerRecover.js';
import { NotMobile, InstallApp, NotFoundPage, MoveToStandalone, MismatchDevice } from './features/registration/preLoadPages.js';
import Wallet from './features/wallet/Wallet.js'
import Spinner from './components/UI/spinner.js';

// 🔌 Hooks & context updaters 
import { readAllItems, setDBitem, deleteItem } from './utils/db';
import { getUserAttributes } from './utils/cognito_helpers.js'
import { useErc20Balances, useGrantInfo, useLandTitle } from './hooks/useLoadETH.ts';
import { useUnionGenericFunds } from './hooks/useLoadFunds.ts';
import { useDataContext } from './utils/NavigationContext.js';
import { deleteAllItems } from "./utils/db.js";

function App({installAvailable}) {
  // bootStage controls what gets rendered while we init
  // 'loading' | 'install' | 'register' | 'ready' | 'notMobile'
  const { setTokenData,setGrantData, db, setDb, setUnionFunds, setDebts, setFieldActivity, keyMalformed } = useDataContext();
  const [ bootStage, setBootStage]                                                      = useState('loading');
  const [ chain, setChain]                                                              = useState();
  const [ address, setAddress]                                                          = useState('');
  const [ hasRelatedApp, setHasRelatedApp]                                              = useState(false);
  const [ canInstall, setCanInstall]                                                    = useState(false);
  const [ installCheckDone, setInstallCheckDone]                                        = useState(false);
  const [ loadStage, setLoadStages]                                                     = useState('loading data')
  const [ installPromptEvent, setInstallPromptEvent]                                    = useState(null);
  const LAND                                                                            = useRef(null);

  // Fetch General hooks: ERC20 always hot
  const registerRecoverFlag                                = db && !Object.hasOwn(db, 'reload') // verify if this is new reg or recover on if a reload item exists
  const pendingLandMint                                    = Boolean(db?.reload?.land?.pendingMint || LAND.current?.pendingMint);
  const useCache                                           = db && (Date.now() > db?.reload?.expired || pendingLandMint);
  const hot_ready                                          = !!chain && !!address
  const unionAddress                                       = db && db.union?.address

  const [landTitleId, setLandTitleId]                      = useState(Number(db?.reload?.land?.LAND?.id) || undefined);
  const {data : bal,  error : Ebal, isFetched: Fbal }      = useErc20Balances(chain, address, { enabled: hot_ready}, landTitleId);
  const foodtokens                                         = bal && bal.filter(b => b.type === 'ERC1155').length + 1 // 0 is false...
  const cold_ready                                         = Boolean((!!chain && !!address && !!useCache && !!foodtokens) || (registerRecoverFlag && !!foodtokens))
  const {data : grant, error : Egrant, isFetched: Fgrant}  = useGrantInfo(chain, address, unionAddress, foodtokens, cold_ready );
  const {data : land, error : Eland,  isFetched: Fland }   = useLandTitle(chain, address, cold_ready, pendingLandMint );

  // When land title resolves (e.g. fresh inject), update landTitleId so useErc20Balances refetches food tokens
  useEffect(() => {
    if (land?.LAND?.id) setLandTitleId(Number(land.LAND.id));
  }, [land?.LAND?.id]);
  
  // keep tokenData in sync with latest balances (incl. post-tx invalidations)
  useEffect(() => {
    if (!Array.isArray(bal)) return;
    setTokenData(bal);

    const isPendingMint = Boolean(LAND.current?.pendingMint && !LAND.current?.hasLand);
    if (!isPendingMint || !land?.hasLand || !land?.LAND) return;

    LAND.current = land;
    const ttl = 86_400_000; // 24 h
    setDBitem(
      'reload',
      { expired: Date.now() + ttl, grant: db?.reload?.grant, land },
      'Init'
    );
  }, [bal, land, db, setTokenData]);
  
  // Fetch Union hooks:
  const refetch_funds              = db && Date.now() > db?.reloadUnion?.expired || db && !db?.reloadUnion?.data; // refetch when expired or missing 
  const cold_ready_union           = !!address && db?.union && db.union.address.startsWith("0x") && !!refetch_funds;
  const { data: generic, isFetched: genericFetched }       = useUnionGenericFunds(db?.union?.address, { enabled: cold_ready_union });
  
  // Detect install state and set PWA listener (for user that are on web but have app installed)
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; // last is for safari

  const isIOSCapable = (() => {
    const ua = navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/.test(ua);
    return isIOS && isSafari;
  })();

  // edge swipe to root, instead of close app.
  useEffect(() => {
    // push initial state so first back doesn't instantly exit
    if (window.history.state?.nilaRoot !== true) {
      window.history.replaceState({ nilaRoot: true }, "");
    }
  }, []);
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      if ('getInstalledRelatedApps' in navigator) {
        try {
          const apps = await navigator.getInstalledRelatedApps();
          // If your manifest has "id", Chrome returns a record with platform 'webapp'
          // We accept any related app as “installed Nila”
          if (mounted && Array.isArray(apps) && apps.length > 0) {
            setHasRelatedApp(true);
          }
        } catch (_) {}
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 🔒 Wait window: decide "canInstall" first, then let bootstrap run
  useEffect(() => {
    const bus = window.__nilaInstall;
    const update = (v) => setCanInstall(!!v || isIOSCapable || !!installAvailable);
    update(bus?.evt);
    bus?.listeners?.add(update);
    // settle after a short grace if no BIP fires
    const t = setTimeout(() => setInstallCheckDone(true), 500);
    return () => { bus?.listeners?.delete(update); clearTimeout(t); };
  }, [installAvailable, isIOSCapable]);

  useEffect(() => {
    if (isInstalled) setInstallCheckDone(true);               // already PWA
    if (isIOSCapable || installAvailable || canInstall) setInstallCheckDone(true);
  }, [isInstalled, isIOSCapable, installAvailable, canInstall]);

  const allowWeb = localStorage.getItem('allowWeb') === '1';

  // deleteItem('debts','Init')

  // ------------- Union Funds initializer and cache --------------
  useEffect(() => {
    // process from query if enabled
    if (cold_ready_union){
        setUnionFunds(generic)
        const ttl = 1_000 // 86_400_000 // 24 h
        setDBitem('reloadUnion',{ 'expired': Date.now() + ttl, 'data': generic},'Init') // tiny helper to create|update db
    // process from cache if not enabled
    } else {
      setUnionFunds(db?.reloadUnion?.data)
    } 
  }, [genericFetched,cold_ready_union]); // call when enabled is set, then when query finishes
  
  // new version check through SW
  useEffect(() => {
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data?.type === 'APP_UPDATED') {
        if (data.forceLogout) {
          deleteAllItems();
          document.cookie.split(';').forEach(c => {
            document.cookie = c.split('=')[0].trim() +
              '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
          });
        }
        // store the new version so you never check again
        localStorage.setItem('app_version', data.version);
        window.location.reload(true);
      }
    });
  }, []);

  // ------------- core initializer --------------
  const bootstrap = useCallback(async () => {

    // check if we can load the wallet or set mismatchdevice
    if(keyMalformed){
      setBootStage('mismatchdevice')
      return;
    }
    
    // ⛔ don’t progress yet: prevents flashing RegisterRecover
    if (!installCheckDone && !isInstalled) {
     setBootStage('loading');
     return;
    }

    // 2️⃣  MOBILE DETECTION ----------------------------------------------
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!isMobile) {
        setBootStage('notMobile');
        return;
    }

    // 3️⃣  INSTALLATION ENFORCEMENT (capability-aware) -------------------
    if (!isInstalled && !allowWeb) {
      // Prefer moving to the already installed app if we detect a related one on this device,
      // OR if this browser once set the appinstalled flag.
      if (hasRelatedApp || localStorage.getItem('appinstalled') === 'yes') {
        setBootStage('moveToStandalone');
        return;
      }

      // Otherwise, if installing is possible here, show the install screen.
      if (canInstall) {
        setBootStage('install');
        return;
      }

      // not installable → continue boot in web
    }

    // 4️⃣  NETWORK STATUS & DATA LOAD ------------------------------------
    const initDb = await readAllItems('Init');
    const farmDb = await readAllItems('FarmData');
    const merged = { ...farmDb, ...initDb };
    // Local dev override: if RPC points to localhost, force chainId to 31337
    // (db.chain is stored from Cognito custom:chain which holds the mainnet/testnet value)
    const _rpc = process.env.REACT_APP_RPC || '';
    if (_rpc.includes('127.0.0.1') || _rpc.includes('localhost')) {
      merged.chain = '31337';
    }
    setDb(merged);
      
    // 5️⃣ Set any Debt the user has from indexedDB, if no attribute, call getLoansByBorrower with address to reset
    if (initDb.debts){ 
      console.log('debts updated in app.js', initDb?.debts)
      setDebts([...initDb?.debts])
    }
    
    // 6️⃣ User has to recover or register a new account, no local data
    if (!merged.address) {
      setBootStage('register');
      return
    }

    // User is available, check online status
    const online = navigator.onLine;

    const init = async () => {
      /**
       * Loading conditions, set bootstage to ready 
       * @param online App online
       * @param isFetched balance loaded or both balance, grant and land data loaded
       * @param cold_ready true if loading grant and land data
       * @param Ebal error state for balance
       * @param Egrant error state for grants
       * @param Eland error state for land title
       */
      // IN CASE ADDRESS IS MISSING, GET IT FROM COGNITO.
      let address,chain
      const isFetched = Fbal && !cold_ready || Fbal && Fgrant && Fland
      if (!initDb.address){
        const attributes = await getUserAttributes(db['token'])
        address = attributes.UserAttributes.find(attribute => attribute.Name === 'custom:address')?.Value;
        chain = attributes.UserAttributes.find(attribute => attribute.Name === 'custom:chain')?.Value;
      }
      // set the props to load the wallet properties
      setChain(merged.chain || chain || process.env.REACT_APP_CHAIN_ID || '137');
      setAddress(merged.address || address);

      function handleSetLocalState(bal,grant,land){
        // escape route if grant and|or land are undefined
        //if(!grant || !land){
        //  deleteItem('reload','Init')
        //  window.location.reload(true);
        //  return;
        //}
        console.log('land', land)
        setTokenData(bal);
        setGrantData(grant);
        // If chain says no land but IndexedDB has a pending mint, preserve that state
        const storedLand = db?.reload?.land;
        LAND.current = (!land?.hasLand && storedLand?.pendingMint) ? storedLand : land;
        setBootStage('ready');
      }

      if(online && isFetched && cold_ready ){
        // query enabled to wait untill fetched
        handleSetLocalState(bal,grant,land)
        const ttl = 86_400_000 // 24 h
        console.log('setting reload with', [grant,land].every(x => x))
        // make sure reload isnt populated with undefined
        if ([grant,land].every(x => x)){
          console.log("IS RELOAD ACTUALLY SET NOW?")
          setDBitem('reload',{ 'expired': Date.now() + ttl, 'grant': grant, 'land':land },'Init') // tiny helper
        }
      } 
      else if (online && isFetched && !cold_ready){ 
        // query disabled so load grants & land from db
        const { grant, land } = db.reload
        handleSetLocalState(bal,grant,land)
      } 
      else if (!online){  
        // offline mode
        setLoadStages('offline, loading data from cache')
        const { grant, land } = merged?.reload
        handleSetLocalState(bal,grant,land)
      } 
      else if (db?.hasOwnProperty('reload') && (Egrant || Eland) || Ebal){   // error 
          console.log('error, load any from cache')
          // load as much as possible from local storage
          const { grant, land } = db?.reload
          // loading issue, continue with what we can.
           if (!Fbal){
            setLoadStages('Your wallet cannot be loaded for now. Try again later.')
            // do not set bootstage to ready!!!
          } else {
            setLoadStages('Uff, we couldnt load your grants or land token. We are setting an older version for now.')
            handleSetLocalState(bal,grant,land)
           }
      }
    };
    
    init();
  }, [isInstalled,installCheckDone,canInstall,bootStage,chain,address,grant,bal,land,Ebal,Egrant,Eland,keyMalformed]); // if error, this will call again

  // Kick off bootstrap on mount
  useEffect(() => {
    bootstrap();
  }, [isInstalled,bootstrap]);

  // ------------- conditional renders --------------
  if (bootStage === 'loading') return (<div className='flex h-full justify-center'><Spinner stages={loadStage} /></div>);
  if (bootStage === 'notMobile') return <NotMobile />;
  if (bootStage === 'moveToStandalone') return <MoveToStandalone installPrompt={installPromptEvent} setInstallPromptEvent={setInstallPromptEvent} />;
  if (bootStage === 'install') return <InstallApp installAvailable={installAvailable} />;
  if (bootStage === 'mismatchdevice') return <MismatchDevice />;

  // Render routes once we know where to go
  return (
      <Routes>
        {bootStage === 'register' && <Route path="/*" element={<RegisterRecover setBootStage={setBootStage} />} />}
        {bootStage === 'ready' && <Route path="/*" element={<Wallet LAND={LAND} selected={false} />} />}
        {/* fallback: if route mismatch, shove user to root */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
  );
}

export default App;
