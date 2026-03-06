import { readAllItems } from './db'
import { useDataContext } from './NavigationContext';

export function useReloadDB() {
    const { setDb }  = useDataContext() 
    return async () => {
        const init_db = await readAllItems('Init')
        const farm_db = await readAllItems('FarmData')
        setDb({ ...farm_db, ...init_db })
      }
    }