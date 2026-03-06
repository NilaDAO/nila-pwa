import React, { createContext, useContext,useEffect, useState, useRef } from 'react';

export const PAGES = {
  ASSETS: 0,
  LENDING: 1,
  DEBT: 2,
  MAP: 3,
  SETTINGS: 4,
  TXNS: 6
};

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
  const [ tokenData, setTokenData ]   = useState([]);
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
      setKeyMalformed 
      }}>
      {children}
    </DataContext.Provider> 
  );
};
