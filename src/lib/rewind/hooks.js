let active = null;
let depth = 0;
const reasons = [];
const probes = new Set();
let meta = null;
let room = null;
const metaListeners = new Set();

const call = (name, ...args) => {
    if (!active || typeof active[name] !== 'function') return null;
    try {
        return active[name](...args);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[rewind] ${name} failed`, e);
        return null;
    }
};

/**
 * Room generation as a non-negative integer.
 * @param {string|number} generation generation
 * @returns {number} integer
 */
export const roomGenerationNumber = generation => {
    if (typeof generation === 'number' && Number.isSafeInteger(generation) && generation >= 0) return generation;
    const s = String(generation || '');
    let h1 = 0x811c9dc5;
    let h2 = 0x050c5d1f;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
    }
    return ((h1 & 0xfffff) * 0x100000000) + h2;
};

export const rewindHooks = {
    setActive (session) {
        if (active && typeof active.endSuppress === 'function') {
            for (let i = 0; i < depth; i++) call('endSuppress');
        }
        active = session;
        if (active) {
            for (const r of reasons) call('beginSuppress', r);
            for (const p of probes) call('addProbe', p);
            if (room) call('roomJoined', room);
        }
    },
    getActive () {
        return active;
    },
    beginSuppress (reason) {
        depth++;
        reasons.push(reason);
        call('beginSuppress', reason);
    },
    endSuppress () {
        if (depth === 0) return;
        depth--;
        reasons.pop();
        call('endSuppress');
    },
    suppress (reason, fn) {
        rewindHooks.beginSuppress(reason);
        let result;
        try {
            result = fn();
        } catch (e) {
            rewindHooks.endSuppress();
            throw e;
        }
        if (result && typeof result.then === 'function') {
            return result.finally(() => rewindHooks.endSuppress());
        }
        rewindHooks.endSuppress();
        return result;
    },
    addProbe (fn) {
        probes.add(fn);
        const remove = call('addProbe', fn);
        return () => {
            probes.delete(fn);
            if (typeof remove === 'function') remove();
        };
    },
    roomJoined (joined) {
        room = joined;
        call('roomJoined', joined);
    },
    roomLeft () {
        room = null;
        call('roomLeft');
    },
    hintSource (kind, source, opts) {
        call('hintSource', kind, source, opts);
    },
    paintEditorClosed () {
        call('paintEditorClosed');
    },
    saveHeaders () {
        return call('saveHeaders') || {};
    },
    afterSave (info) {
        return call('afterSave', info);
    },
    setMeta (projectId, rewind) {
        meta = rewind ? Object.assign({projectId}, rewind) : null;
        for (const fn of metaListeners) fn(meta);
    },
    getMeta () {
        return meta;
    },
    onMeta (fn) {
        metaListeners.add(fn);
        return () => metaListeners.delete(fn);
    }
};

export default rewindHooks;
