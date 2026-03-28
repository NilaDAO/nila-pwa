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
export function useContactBook() {
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
    queryKey: ['contactBook'],
    queryFn: async () => {
      // Read user contacts from IndexedDB
      let stored = {};
      try {
        stored = await readAllItems('Contacts') ?? {};
      } catch (_) { /* first run */ }

      // Pull from backend (non-blocking merge)
      if (unionAddress) {
        try {
          const res = await fetch(`${API}/contacts/sync?union=${unionAddress}`);
          if (res.ok) {
            const remote = await res.json();
            if (Array.isArray(remote.contacts)) {
              for (const c of remote.contacts) {
                const key = c.address?.toLowerCase();
                if (key && !stored[key]) {
                  await setDBitem(key, c.name, 'Contacts');
                  stored[key] = c.name;
                }
              }
            }
          }
        } catch (_) { /* backend offline — use local only */ }
      }

      return stored; // { [lowercaseAddr]: name, ... }
    },
    staleTime: Infinity,
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

  const addContact = useCallback(async (address, name) => {
    const key = address.toLowerCase();
    await setDBitem(key, name, 'Contacts');
    const updated = { ...userContacts, [key]: name };
    queryClient.setQueryData(['contactBook'], updated);
    pushToBackend(updated);
  }, [userContacts, queryClient, pushToBackend]);

  const removeContact = useCallback(async (address) => {
    const key = address.toLowerCase();
    // Don't allow deleting system contacts
    if (systemContacts[key]) return;
    await deleteItem(key, 'Contacts');
    const updated = { ...userContacts };
    delete updated[key];
    queryClient.setQueryData(['contactBook'], updated);
    pushToBackend(updated);
  }, [userContacts, systemContacts, queryClient, pushToBackend]);

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
