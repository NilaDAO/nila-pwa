import React, { createContext, useContext,useEffect, useState, useRef } from 'react';

export const PAGES = {
  ASSETS: 0,
  LENDING: 1,
  DEBT: 2,
  MAP: 3,
  SETTINGS: 4,
  TXNS: 6
};

// Plan 044 §5.1 — default FieldView state. `selected` (select mode) and
// `override` (crop correction) are the only genuinely interactive bits; every
// other view is a pure function of (record, tokenData, view).
export const DEFAULT_VIEW = Object.freeze({
  mode: 'overview',     // 'overview' | 'zone' | 'select' | 'season' | 'portfolio'
  focus: null,          // array of zone ids in focus, the whole group (zone mode)
  focusZone: null,      // representative single zone id (card per-zone detail)
  focusName: null,      // containing field name, for display
  season: null,         // the cycle object for season mode
  property: null,       // landId (portfolio mode)
  selected: [],         // zone ids tapped in select mode
  override: {},         // { [zoneId]: cropType } manual crop correction
});

export const NavContext = createContext();
export const TxContext = createContext();
export const ViewModeContext = createContext();
export const DataContext = createContext();

export const useTxContext = () => useContext(TxContext)
export const useNavContext = () => useContext(NavContext)
export const useDataContext = () => useContext(DataContext)
export const useViewModeContext = () => useContext(ViewModeContext)

export const NavigationProvider = ({ children }) => {
  const [ ix, setIx ] = useState(null)  
  const [ cardIx, setCardIx ] = useState(null)  
  const prevIx = useRef(null)

  return (
    <NavContext.Provider value={{ ix, setIx, setCardIx, cardIx,prevIx }}>
      {children}
    </NavContext.Provider> 
  );
};

export const ViewModeProvider = ({ children }) => {
  const [ cardView, setCardView ] = useState('default')  
  const [ tokenview, setTokenview ] = useState() 
  const navRef = useRef({ 'assetTab': true, 'clusterFocus': null}); // init once
 
  return (
    <ViewModeContext.Provider value={{ navRef,cardView, setCardView, tokenview, setTokenview }}>
      {children}
    </ViewModeContext.Provider> 
  );
};

export const TxProvider = ({ children }) => {
  // type Stage = false (idle) | "approval" | "approved" | "pending" | "success" | "error";
  const [ stage, setStage ] = useState(false);
  const [ txMessage, setTxMessage ] = useState(false);
  const [ txHash, setTxHash ] = useState();
  const [ txUrl, setTxUrl ] = useState();
  const [ txSubmittedAt, setTxSubmittedAt ] = useState();
  const txTimerRef = useRef(null);   // ← store it

  useEffect(() => {
    if (!stage) {
      setTxMessage(undefined);   // 🧹 clear banner text
      setTxHash(undefined);
      setTxUrl(undefined);
      setTxSubmittedAt(undefined);
    }
  }, [stage]);

  return (
    <TxContext.Provider value={{
      stage,
      setStage,
      txMessage,
      setTxMessage,
      txHash,
      setTxHash,
      txUrl,
      setTxUrl,
      txSubmittedAt,
      setTxSubmittedAt,
      txTimerRef
    }}>
      {children}
    </TxContext.Provider> 
  );
}

export const DataProvider = ({ children }) => {
  const [ tokenData, setTokenData ]   = useState(null); // null = not yet fetched; [] = fetched, no tokens
  const [ grantData, setGrantData ]   = useState([]);
  const [ unionFunds, setUnionFunds ] = useState();
  const [ debts, setDebts]            = useState([])
  const [ selected, setSelected]      = useState(false)
  const [ db,setDb ]                  = useState()
  const [ stats, setStats]            = useState()
  const [ selectedAsset, setSelectedAsset ] = useState(null)
  const [ txIndex, setTxIndex ]       = useState(0)  
  const [ txdetails, setTxDetails ]   = useState()   
  const [ fieldActivity, setFieldActivity ] = useState()
  const [ keyMalformed, setKeyMalformed ]   = useState(false);
  // Plan 044 §5.1 — the single explicit FieldView state. Replaces the old
  // implicit flag soup (viewmode/selectMode/selectedZoneId/historical/
  // portfolioMode). Illegal combinations are unrepresentable.
  const [ view, setView ] = useState(DEFAULT_VIEW);

  return (
    <DataContext.Provider value={{ 
      grantData, 
      setGrantData,
      tokenData, 
      setTokenData,
      txdetails, 
      setTxDetails,
      txIndex, 
      stats, 
      fieldActivity, 
      setFieldActivity, 
      setStats,
      setTxIndex,
      unionFunds, 
      setUnionFunds,
      db,
      setDb,
      debts, 
      setDebts,
      selected,
      setSelected,
      selectedAsset,
      setSelectedAsset,
      keyMalformed,
      setKeyMalformed,
      view,
      setView
      }}>
      {children}
    </DataContext.Provider> 
  );
};
