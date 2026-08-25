import * as constants from './constants.js';

const DEFAULT_CAPACITY = 2000;

const ring = [];
let capacity = DEFAULT_CAPACITY;
let writeIndex = 0;
let sequence = 0;
let dropped = 0;
let enabled = constants.recordMode === true;
let startedAt = 0;

function stateVector() {
    const doc = constants.mutableRefs.ydoc;
    if (!doc || !doc.store || !doc.store.clients) return null;
    const sv = {};
    doc.store.clients.forEach((structs, clientId) => {
        const last = structs[structs.length - 1];
        if (last) sv[clientId] = last.id.clock + last.length;
    });
    return sv;
}

export function record(kind, detail) {
    if (!enabled) return;

    const doc = constants.mutableRefs.ydoc;
    const entry = {
        seq: sequence++,
        t: Math.round(performance.now() - startedAt),
        kind,
        client: doc ? doc.clientID : null,
        sv: stateVector()
    };
    if (detail) entry.d = detail;

    if (ring.length < capacity) {
        ring.push(entry);
    } else {
        ring[writeIndex] = entry;
        writeIndex = (writeIndex + 1) % capacity;
        dropped++;
    }
}

export function blockIds(type, payload) {
    if (!enabled) return [];
    if (type === 'add' && Array.isArray(payload)) return payload.map(b => b && b.id).filter(Boolean);
    if (type === 'delete') return typeof payload === 'string' ? [payload] : [];
    if (payload && typeof payload === 'object') return Object.keys(payload);
    return [];
}

export function isRecording() {
    return enabled;
}

export function start (opts) {
    capacity = (opts && opts.capacity) || DEFAULT_CAPACITY;
    ring.length = 0;
    writeIndex = 0;
    sequence = 0;
    dropped = 0;
    startedAt = performance.now();
    enabled = true;
    return `recording (capacity ${capacity})`;
}

export function stop () {
    enabled = false;
    return `stopped at ${sequence} actions`;
}

export function dump() {
    if (ring.length < capacity) return ring.slice();
    return ring.slice(writeIndex).concat(ring.slice(0, writeIndex));
}

export function stats() {
    return {
        enabled,
        recorded: sequence,
        held: ring.length,
        dropped,
        clientID: constants.mutableRefs.ydoc ? constants.mutableRefs.ydoc.clientID : null,
        room: constants.mutableRefs.provider ? constants.mutableRefs.provider.roomname : null
    };
}

export function toJSON() {
    const doc = constants.mutableRefs.ydoc;
    return JSON.stringify({
        clientID: doc ? doc.clientID : null,
        room: constants.mutableRefs.provider ? constants.mutableRefs.provider.roomname : null,
        generation: doc ? doc.getMap('meta').get('roomGeneration') : null,
        recorded: sequence,
        dropped,
        actions: dump()
    }, null, 2);
}

export function save() {
    const doc = constants.mutableRefs.ydoc;
    const name = `collab-trace-${doc ? doc.clientID : 'unknown'}-${Date.now()}.json`;
    const blob = new Blob([toJSON()], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return name;
}

if (typeof window !== 'undefined') {
    window.collabRecorder = {start, stop, dump, stats, toJSON, save, isRecording};
}
