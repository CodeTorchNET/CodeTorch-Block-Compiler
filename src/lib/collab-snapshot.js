import log from './log';

const MAGIC_BYTES = [0x43, 0x54, 0x43, 0x53];
const HEADER_LENGTH = MAGIC_BYTES.length + 4;

let pending = null;
let isCollaborative = false;
let resolveReady = null;
let ready = null;

const freshReady = () => {
    ready = new Promise(resolve => {
        resolveReady = resolve;
    });
};
freshReady();

export const isSnapshotFrame = bytes => {
    if (!bytes || bytes.length < HEADER_LENGTH) return false;
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
        if (bytes[i] !== MAGIC_BYTES[i]) return false;
    }
    return true;
};

export const parseSnapshotFrame = bytes => {
    try {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const jsonLength = view.getUint32(MAGIC_BYTES.length, false);
        const jsonStart = HEADER_LENGTH;
        const jsonEnd = jsonStart + jsonLength;
        if (jsonEnd > bytes.length) throw new Error('snapshot frame is truncated');

        const json = bytes.subarray(jsonStart, jsonEnd);
        const meta = JSON.parse(new TextDecoder('utf-8').decode(json));
        return {
            projectData: new TextEncoder().encode(JSON.stringify(meta.project)),
            meta,
            update: bytes.subarray(jsonEnd)
        };
    } catch (e) {
        log.warn('collaboration: could not parse the snapshot frame, falling back', e);
        return null;
    }
};

export const setSnapshot = ({meta, update}) => {
    pending = {
        ids: meta.ids || [],
        roomGeneration: meta.roomGeneration || null,
        schemaVersion: meta.schemaVersion,
        update,
        applied: false
    };
    isCollaborative = true;
};

export const setNoSnapshot = () => {
    pending = null;
    isCollaborative = true;
};

export const reset = () => {
    pending = null;
    isCollaborative = false;
    freshReady();
};

export const getIsCollaborative = () => isCollaborative;

export const getSnapshot = () => pending;

export const whenReady = () => ready;

export const markReady = () => {
    if (resolveReady) resolveReady();
};

const adoptAssetIds = (target, kind, ids) => {
    const sprite = target.sprite;
    if (!sprite || !Array.isArray(ids) || ids.length === 0) return;
    const existing = sprite[kind];
    if (!Array.isArray(existing) || existing.length !== ids.length) return;
    sprite[kind] = existing.map((asset, i) => Object.assign({}, asset, {id: ids[i]}));
};

export const applySnapshotIds = vm => {
    if (!pending || pending.applied) return false;

    const runtime = vm && vm.runtime;
    const targets = runtime && runtime.targets;
    if (!targets) return false;

    const {ids} = pending;
    if (targets.length !== ids.length) {
        log.warn(`collaboration: snapshot describes ${ids.length} targets but the VM loaded ` +
            `${targets.length}; not adopting ids, falling back to a name remap`);
        pending = null;
        return false;
    }

    for (let i = 0; i < ids.length; i++) {
        if (targets[i].getName() !== ids[i].name) {
            log.warn(`collaboration: snapshot target ${i} is "${ids[i].name}" but the VM loaded ` +
                `"${targets[i].getName()}"; not adopting ids, falling back to a name remap`);
            pending = null;
            return false;
        }
    }

    for (let i = 0; i < ids.length; i++) {
        const target = targets[i];
        runtime.updateTargetId(target, ids[i].id);
        adoptAssetIds(target, 'costumes', ids[i].costumeIds);
        adoptAssetIds(target, 'sounds', ids[i].soundIds);
    }

    pending.applied = true;
    return true;
};
