// hooks/useCollectGrant.ts ---------------------------------------------
import { useWallet, useContract } from "./useWallet.ts";
import { useTx } from "./useTx.ts";
import nilaGrantAbi from '../components/ABI/NilaGrant.json';
import { useQueryClient } from "@tanstack/react-query";
import { useViewModeContext,useDataContext } from '../utils/NavigationContext.js';
import { setDBitem, readItem} from '../utils/db';

// Polygon Amoy grant contract (change if network map moves)
const nilaGrantContract = String(process.env.REACT_APP_GRANT_ADDRESS)
  
export function useCollectGrant() { 
    const runTx = useTx();
    const { setTokenview, setCardView } = useViewModeContext();
    const { db,setGrantData } = useDataContext();
    const { wallet } = useWallet();  
    const grant = useContract(nilaGrantContract, nilaGrantAbi, wallet);
    const queryClient = useQueryClient();

    const collectGrant = (address: string, union: string, foodtokens: number) =>
      {
        runTx(() => grant!.claimGrant(address,union,foodtokens - 1), {
          onSuccess: () => {
            // go back to asset page
            setTokenview(false)
            // change local grant state to 
            setGrantData((prev: any ) => ({...prev,alreadyClaimed: true}))
            // force reload on next call 
            const expired = db.reload.expired
            const ttl = 86_400_000 // 24 h
            setDBitem('reload',{ 'expired': expired - ttl, 'grant': db.reload.grant, 'land':db.reload.land },'Init')
            // remove query cache
            queryClient.invalidateQueries({ queryKey: ["balances", wallet?.address] })
            queryClient.invalidateQueries({ queryKey: ["grant"] })
          },
          onError: () => {
            // force reload on next call 
            const expired = db.reload.expired
            const ttl = 86_400_000 // 24 h
            setDBitem('reload',{ 'expired': expired - ttl, 'grant': db.reload.grant, 'land':db.reload.land },'Init')
            setGrantData((prev: any ) => ({...prev,alreadyClaimed: true}))
            setTokenview(false)
            setCardView('default')
          }
        });
      }
    
      return { collectGrant };
    }