// hooks/useUnlockedPk.ts
import { decryptPrivateKey, handleGetEncryptedPrivateKey } from '../utils/getEncryptedKey';
import { useQuery } from "@tanstack/react-query";
import { useDataContext } from '../utils/NavigationContext.js';

export interface DbSchema {
    salt: string;
    address: string;
    chain: string;
  }

export function useDecryptKey(db: any,address?: string, salt?: string) {  
  const { setKeyMalformed } = useDataContext();

  return useQuery({
    queryKey: ['pk', address ?? null, salt ?? null],
    enabled: Boolean(address && salt),
    // read from queryKey, not closure over `db`
    queryFn: async ({ queryKey }) => {
      const [, addr, s] = queryKey as [string, string | null, string | null];
      if (!addr || !s) return null;
      
      const encrypted = await handleGetEncryptedPrivateKey(db);
      if (!encrypted) return null;
      const pk = await decryptPrivateKey(encrypted, s);
      if (!pk){
          // PK isnt loadable, salt is probably wrong.
          setKeyMalformed(true)
          }
      return pk ?? null; // never undefined
    },

    // 🔒 don't refetch unless you explicitly invalidate
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
