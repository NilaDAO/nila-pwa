// Lists kept on this phone (25 Oct): the union's members list and the crop shares' chain state, in IndexedDB, so the
// leader's app shows them at once and asks the node and the chain only for what changed. Any IndexedDB failure
// (private mode, no space) gives undefined: the app then reads everything again, as before.
const DB = 'nila-kept';
const STORE = 'kept';
let dbp;
function open() {
  return (dbp ||= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null));
}

export async function keptGet(key) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export async function keptPut(key, value) {
  const db = await open();
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key); } catch { /* full */ }
}
