/** Minimal IndexedDB wrapper. All user data lives here, never in the bundle. */
import { DB_NAME, DB_VERSION } from './config.js';

const STORES = {
  meta: { keyPath: 'key' },
  jobs: { keyPath: 'id', indexes: ['status', 'updatedAt', 'localScore'] },
  tailorRuns: { keyPath: 'id', indexes: ['jobId', 'createdAt'] },
  artifacts: { keyPath: 'id', indexes: ['jobId'] },
  events: { keyPath: 'id', indexes: ['jobId', 'at'] },
  contacts: { keyPath: 'id', indexes: ['jobId'] },
  reviewQueue: { keyPath: 'id' },
  usageLog: { keyPath: 'id', indexes: ['month'] },
};

let dbPromise = null;
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: def.keyPath });
          (def.indexes || []).forEach(ix => os.createIndex(ix, ix));
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
export const get = (store, key) => tx(store, 'readonly', os => os.get(key));
export const put = (store, value) => tx(store, 'readwrite', os => os.put(value)).then(() => value);
export const del = (store, key) => tx(store, 'readwrite', os => os.delete(key));
export const list = (store) => tx(store, 'readonly', os => os.getAll());
export const listBy = (store, index, value) => tx(store, 'readonly', os => os.index(index).getAll(value));
export const clearStore = (store) => tx(store, 'readwrite', os => os.clear());

export const getMeta = (key, fallback = null) => get('meta', key).then(r => (r ? r.value : fallback));
export const setMeta = (key, value) => put('meta', { key, value });

/** A status and its sync checkpoint must commit together, or both roll back. */
export async function updateJobWithEvents(id, update) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['jobs','events'], 'readwrite');
    const jobs = t.objectStore('jobs'); let result=null;
    const read = jobs.get(id);
    read.onsuccess = () => {
      try {
        if (!read.result) throw new Error('Job no longer exists');
        result=update(read.result);
        if (result) {
          jobs.put(result.job);
          for (const event of result.events || []) t.objectStore('events').put(event);
        }
      } catch (error) { t.abort(); reject(error); }
    };
    t.oncomplete = () => resolve(result?.job || null);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Job sync was not saved. Refresh to retry.'));
  });
}

/** All-or-nothing jobs-only insert. add() cannot overwrite an existing record. */
export async function addJobs(records) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('jobs', 'readwrite');
    const os = t.objectStore('jobs');
    try { for (const record of records) os.add(record); }
    catch (e) { t.abort(); reject(e); return; }
    t.oncomplete = () => resolve(records);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Import cancelled; no jobs were saved.'));
  });
}

export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), stores: {} };
  for (const s of Object.keys(STORES)) out.stores[s] = await list(s);
  return out;
}
export async function importAll(payload, { merge = true } = {}) {
  for (const [s, rows] of Object.entries(payload.stores || {})) {
    if (!STORES[s]) continue;
    if (!merge) await clearStore(s);
    for (const row of rows) {
      if (merge) {
        const cur = await get(s, row[STORES[s].keyPath]);
        if (cur && cur.updatedAt && row.updatedAt && cur.updatedAt > row.updatedAt) continue;
      }
      await put(s, row);
    }
  }
}
export async function wipeAll() { for (const s of Object.keys(STORES)) await clearStore(s); }
