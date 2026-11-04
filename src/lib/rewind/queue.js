const DB_NAME = 'CT_Rewind';
const DB_VERSION = 1;
const STORE = 'batches';

export const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const MAX_ATTEMPTS = 20;
export const MAX_OPS = 20000;
export const MAX_BYTES = 32 * 1024 * 1024;

const batchBytes = b => {
    let n = 0;
    try {
        n = JSON.stringify({base: b.base, ops: b.ops}).length;
    } catch (e) {
        n = 0;
    }
    for (const k of Object.keys(b.assets || {})) {
        const d = b.assets[k] && b.assets[k].data;
        n += d ? d.byteLength || d.length || 0 : 0;
    }
    return n;
};

export const pruneBatches = (batches, ctx) => {
    const now = ctx.now || Date.now();
    const drop = [];
    let keep = [];
    for (const b of batches.slice().sort((x, y) => x.createdAt - y.createdAt)) {
        let reason = null;
        if (ctx.user !== undefined && b.user !== ctx.user) reason = 'other-user';
        else if (now - b.createdAt > MAX_AGE_MS) reason = 'expired';
        else if (!b.room && b.savedRevision === null && b.session !== ctx.liveSession) reason = 'unsaved';
        else if ((b.attempts || 0) >= MAX_ATTEMPTS) reason = 'gave-up';
        if (reason) drop.push({batch: b, reason});
        else keep.push(b);
    }
    let ops = keep.reduce((n, b) => n + b.ops.length, 0);
    let bytes = keep.reduce((n, b) => n + batchBytes(b), 0);
    while ((ops > MAX_OPS || bytes > MAX_BYTES) && keep.length) {
        const victim = keep.find(b => b.session !== ctx.liveSession) || keep[0];
        const sid = victim.session;
        for (const b of keep.filter(x => x.session === sid)) {
            drop.push({batch: b, reason: 'over-cap'});
            ops -= b.ops.length;
            bytes -= batchBytes(b);
        }
        keep = keep.filter(x => x.session !== sid);
    }
    const holed = new Set(drop.map(d => d.batch.session));
    const survivors = [];
    for (const b of keep) {
        if (holed.has(b.session)) drop.push({batch: b, reason: 'session-gap'});
        else survivors.push(b);
    }
    return {keep: survivors, drop};
};

export const memoryBackend = () => {
    const rows = new Map();
    return {
        put: async b => {
            rows.set(b.key, JSON.parse(JSON.stringify(Object.assign({}, b, {assets: {}}))));
            rows.get(b.key).assets = b.assets || {};
        },
        remove: async key => {
            rows.delete(key);
        },
        list: async projectId => [...rows.values()].filter(b => b.projectId === projectId)
    };
};

let dbPromise = null;
const openDb = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const store = req.result.createObjectStore(STORE, {keyPath: 'key'});
            store.createIndex('projectId', 'projectId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }).catch(() => null);
    return dbPromise;
};

const tx = async (mode, fn) => {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result = null;
        const req = fn(store);
        if (req) {
            req.onsuccess = () => {
                result = req.result;
            };
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    });
};

export const idbBackend = () => {
    const fallback = memoryBackend();
    const guard = (fn, alt) => async (...args) => {
        try {
            const db = await openDb();
            if (!db) return alt(...args);
            return await fn(...args);
        } catch (e) {
            return alt(...args);
        }
    };
    return {
        put: guard(b => tx('readwrite', store => store.put(b)), fallback.put),
        remove: guard(key => tx('readwrite', store => store.delete(key)), fallback.remove),
        list: guard(async projectId => (await tx('readonly', store => store.index('projectId')
            .getAll(projectId))) || [], fallback.list)
    };
};

export const createQueue = ({backend} = {}) => {
    const b = backend || idbBackend();
    return {
        put: batch => b.put(batch),
        remove: key => b.remove(key),
        list: async projectId => (await b.list(projectId)).sort((x, y) => x.createdAt - y.createdAt)
    };
};
