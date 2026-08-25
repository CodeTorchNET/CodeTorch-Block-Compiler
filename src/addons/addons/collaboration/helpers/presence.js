import * as constants from './constants.js';

const TAG_STATELESS = 5;
const TAG_BROADCAST_STATELESS = 6;

const HEARTBEAT_MS = 3000;
const EXPIRY_MS = 10000;

const viewers = new Map();

let heartbeat = null;

const writeVarUint = (out, value) => {
    let rest = value;
    while (rest > 127) {
        out.push(128 | (127 & rest));
        rest = Math.floor(rest / 128);
    }
    out.push(rest);
};

const readVarUint = (bytes, from) => {
    let value = 0;
    let multiplier = 1;
    let at = from;
    for (;;) {
        const byte = bytes[at++];
        value += (byte & 0x7f) * multiplier;
        if (byte < 0x80) return [value, at];
        multiplier *= 128;
    }
};

export function collabStates() {
    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    const states = new Map(awareness ? awareness.getStates() : []);
    const now = Date.now();
    for (const [clientID, entry] of [...viewers]) {
        if (now - entry.at > EXPIRY_MS) {
            viewers.delete(clientID);
            continue;
        }
        if (!states.has(clientID)) states.set(clientID, entry.state);
    }
    return states;
}

export function isViewerPresence(clientID) {
    return viewers.has(clientID);
}

const POINTER_FIELDS = ['cursor', 'paintCursor', 'dragging', 'paintFloat', 'paintDrag'];

const withoutPointer = state => {
    const out = {};
    for (const [name, value] of Object.entries(state)) {
        if (POINTER_FIELDS.includes(name)) continue;
        out[name] = value;
    }
    return out;
};

function publish() {
    const provider = constants.mutableRefs.provider;
    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    if (!provider || !awareness || !provider.wsconnected || !provider.ws) return;

    const state = awareness.getLocalState();
    if (!state || !state.user) return;

    const body = new TextEncoder().encode(JSON.stringify({
        kind: 'viewer-presence',
        clientID: awareness.clientID,
        state: withoutPointer(state)
    }));
    const header = [];
    writeVarUint(header, TAG_BROADCAST_STATELESS);
    writeVarUint(header, body.length);

    const frame = new Uint8Array(header.length + body.length);
    frame.set(header, 0);
    frame.set(body, header.length);
    try {
        provider.ws.send(frame);
    } catch (e) {
    }
}

export function announceIfViewer() {
    if (!constants.mutableRefs.isViewer) return;
    publish();
}

export function attach() {
    const provider = constants.mutableRefs.provider;
    if (!provider) return;

    provider.messageHandlers[TAG_STATELESS] = (encoder, decoder) => {
        try {
            const [length, from] = readVarUint(decoder.arr, decoder.pos);
            const text = new TextDecoder().decode(decoder.arr.subarray(from, from + length));
            receive(JSON.parse(text));
        } catch (e) {
        }
    };

    stopHeartbeat();
    if (constants.mutableRefs.isViewer) {
        heartbeat = setInterval(publish, HEARTBEAT_MS);
        publish();
    }
}

function receive(message) {
    if (!message || message.kind !== 'viewer-presence') return;
    if (typeof message.clientID !== 'number' || !message.state) return;

    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    if (awareness && message.clientID === awareness.clientID) return;

    viewers.set(message.clientID, {state: message.state, at: Date.now()});
}

function stopHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
}

export function detach() {
    stopHeartbeat();
    viewers.clear();
    const provider = constants.mutableRefs.provider;
    if (provider && provider.messageHandlers) {
        delete provider.messageHandlers[TAG_STATELESS];
    }
}
