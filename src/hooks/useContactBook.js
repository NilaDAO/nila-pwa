import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataContext } from '../utils/NavigationContext';
import { setDBitem, readAllItems, deleteItem } from '../utils/db';

const SYSTEM_CONTACTS = {
  '0x0000000000000000000000000000000000000000': 'nIN mint',
  '0x4173bbaf66a4f9a2705d05b800e8602370366756': 'Nila Funds',
  '0xbae307fe0a453955c649cd8f81e3da572df448ea': 'USD Exchange',
};

const API = process.env.REACT_APP_API_BASE_URL;

/**
 * Persistent contact book backed by IndexedDB + backend relay sync.
 *
 * System contacts (nIN mint, Nila Funds, USD Exchange, union, union rep)
 * are always available and cannot be deleted.
 */
export function useContactBook({ enabled: enableSync = true } = {}) {
  const { db } = useDataContext();
  const queryClient = useQueryClient();
  const unionAddress = db?.union?.address;

  // Build dynamic system contacts from current user context
  const systemContacts = useMemo(() => {
    const sys = { ...SYSTEM_CONTACTS };
    if (unionAddress) sys[unionAddress.toLowerCase()] = 'Union';
    if (db?.union?.rep && unionAddress) {
      // rep name is stored on the union object
      sys[unionAddress.toLowerCase()] = db.union.rep;
    }
    return sys;
  }, [unionAddress, db?.union?.rep]);

  const query = useQuery({
    queryKey: ['contactBook', unionAddress ?? '_local_'],
    enabled: enableSync,
    queryFn: async () => {
      console.log('[ContactSync] START union=%s', unionAddress);

      // Read local contacts from IndexedDB
      let local = {};
      try {
        local = await readAllItems('Contacts') ?? {};
      } catch (_) { /* first run */ }
      console.log('[ContactSync] local IDB: %d contacts', Object.keys(local).length);

      // Backend sync only when user belongs to a union
      if (unionAddress) {
        // --- PULL: merge remote into local (local names win on dup) ---
        let added = 0;
        try {
          const url = `${API}/contacts/sync?union=${unionAddress}`;
          console.log('[ContactSync] GET %s', url);
          const res = await fetch(url);
          console.log('[ContactSync] GET status=%d', res.status);
          if (res.ok) {
            const body = await res.json();
            const remote = Array.isArray(body.contacts) ? body.contacts : [];
            console.log('[ContactSync] remote returned %d contacts', remote.length);
            for (const c of remote) {
              const key = c.address?.toLowerCase();
              if (key && c.name && !local[key]) {
                await setDBitem(key, c.name, 'Contacts');
                local[key] = c.name;
                added++;
              }
            }
          }
        } catch (err) {
          console.warn('[ContactSync] GET failed:', err.message);
        }
        console.log('[ContactSync] merged %d new from remote → %d total', added, Object.keys(local).length);

        // --- PUSH: send local contacts so other leaders get them ---
        try {
          const list = Object.entries(local).map(([address, name]) => ({ address, name }));
          if (list.length) {
            const res = await fetch(`${API}/contacts/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ union: unionAddress, contacts: list }),
            });
            console.log('[ContactSync] POST %d contacts → status=%d', list.length, res.status);
          }
        } catch (err) {
          console.warn('[ContactSync] POST failed:', err.message);
        }
      }

      return local;
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const userContacts = query.data ?? {};

  // Merged map: system + user (user overrides system for display)
  const contacts = useMemo(() => {
    const merged = new Map();
    for (const [addr, name] of Object.entries(systemContacts)) {
      merged.set(addr.toLowerCase(), name);
    }
    for (const [addr, name] of Object.entries(userContacts)) {
      merged.set(addr.toLowerCase(), name);
    }
    return merged;
  }, [systemContacts, userContacts]);

  const resolveName = useCallback((address) => {
    if (!address) return address;
    const name = contacts.get(address.toLowerCase());
    if (name) return name;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [contacts]);

  const hasName = useCallback((address) => {
    if (!address) return false;
    return contacts.has(address.toLowerCase());
  }, [contacts]);

  const pushToBackend = useCallback(async (updatedContacts) => {
    if (!unionAddress) return;
    try {
      const list = Object.entries(updatedContacts).map(([address, name]) => ({ address, name }));
      await fetch(`${API}/contacts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ union: unionAddress, contacts: list }),
      });
    } catch (_) { /* non-critical — will sync next time */ }
  }, [unionAddress]);

  const cacheKey = unionAddress ?? '_local_';

  const addContact = useCallback(async (address, name) => {
    const key = address.toLowerCase();
    await setDBitem(key, name, 'Contacts');
    const updated = { ...userContacts, [key]: name };
    queryClient.setQueryData(['contactBook', cacheKey], updated);
    pushToBackend(updated);
  }, [userContacts, cacheKey, queryClient, pushToBackend]);

  const removeContact = useCallback(async (address) => {
    const key = address.toLowerCase();
    // Don't allow deleting system contacts
    if (systemContacts[key]) return;
    await deleteItem(key, 'Contacts');
    const updated = { ...userContacts };
    delete updated[key];
    queryClient.setQueryData(['contactBook', cacheKey], updated);
    pushToBackend(updated);
  }, [userContacts, cacheKey, systemContacts, queryClient, pushToBackend]);

  // Flat list for picker UIs
  const contactList = useMemo(() => {
    return Array.from(contacts.entries()).map(([address, name]) => ({
      address,
      name,
      system: !!systemContacts[address],
    }));
  }, [contacts, systemContacts]);

  return {
    contacts,
    resolveName,
    hasName,
    addContact,
    removeContact,
    contactList,
    isLoading: query.isLoading,
  };
}
