// This device's store: the connection (PH-R04), sets waiting to send (PH-R16) and a cache of what's in the repo.
// Photos wait here only until they're sent; nothing here leaves the device except through github.js.
const DB = 'photo-ctrl', VERSION = 1;
let db = null;
function open() {
  if (db) return Promise.resolve(db);
  return new Promise((ok, fail) => {
    const rq = indexedDB.open(DB, VERSION);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    rq.onsuccess = () => { db = rq.result; ok(db); };
    rq.onerror = () => fail(rq.error);
  });
}
const req = (rq) => new Promise((ok, fail) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => fail(rq.error); });
async function store(name, mode = 'readonly') { return (await open()).transaction(name, mode).objectStore(name); }

export const getMeta = async (k) => req((await store('meta')).get(k));
export const setMeta = async (k, v) => req((await store('meta', 'readwrite')).put(v, k));
export const delMeta = async (k) => req((await store('meta', 'readwrite')).delete(k));

export const queued = async () => (await req((await store('queue')).getAll())).sort((a, b) => b.created - a.created);
export const putQueued = async (s) => req((await store('queue', 'readwrite')).put(s));
export const delQueued = async (id) => req((await store('queue', 'readwrite')).delete(id));

export const cached = async () => req((await store('cache')).getAll());
export const putCached = async (row) => req((await store('cache', 'readwrite')).put(row));
export const delCached = async (id) => req((await store('cache', 'readwrite')).delete(id));
export const clearCache = async () => req((await store('cache', 'readwrite')).clear());

export async function askToKeep() { try { return await navigator.storage.persist(); } catch { return false; } }
