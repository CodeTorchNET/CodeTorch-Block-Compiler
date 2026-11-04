import {findTarget, normalizeBlock, CLOUD_VALUE} from './state.js';

export class RewindApplyError extends Error {
    constructor (message, op) {
        super(message);
        this.name = 'RewindApplyError';
        this.op = op;
    }
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const copy = v => (typeof v === 'undefined' ? v : JSON.parse(JSON.stringify(v)));

const fail = (op, why) => {
    throw new RewindApplyError(`${op.k}${op.tg ? ` on ${op.tg}` : ''}: ${why}`, op);
};

const needTarget = (state, op) => {
    const t = findTarget(state, op.tg);
    if (!t) fail(op, 'target does not exist');
    return t;
};

const deleteBlockCascade = (target, blockId, visited) => {
    const blocks = target.blocks;
    const block = blocks[blockId];
    if (!block || visited.has(blockId)) return;
    visited.add(blockId);
    if (block.next !== null && typeof block.next !== 'undefined') deleteBlockCascade(target, block.next, visited);
    for (const name of Object.keys(block.inputs || {})) {
        const input = block.inputs[name];
        if (!input) continue;
        if (input.block !== null && typeof input.block !== 'undefined') {
            deleteBlockCascade(target, input.block, visited);
        }
        if (input.shadow !== null && typeof input.shadow !== 'undefined' && input.shadow !== input.block) {
            deleteBlockCascade(target, input.shadow, visited);
        }
    }
    delete blocks[blockId];
    if (block.comment && target.comments && target.comments[block.comment]) {
        delete target.comments[block.comment];
    }
};

const setPath = (obj, path, value) => {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
    }
    cur[path[path.length - 1]] = value;
};

const applyBlockProps = (block, props) => {
    for (const key of Object.keys(props)) {
        const value = copy(props[key]);
        if (key.charCodeAt(0) === 91 /* [ */) {
            let path;
            try {
                path = JSON.parse(key);
            } catch (e) {
                path = null;
            }
            if (Array.isArray(path) && path.length > 0) {
                setPath(block, path, value);
                continue;
            }
        }
        if (typeof value === 'undefined') delete block[key];
        else block[key] = value;
    }
};

const defaultValueFor = type => {
    if (type === 'list') return [];
    return 0;
};

const reorderById = (op, list, order) => {
    if (order.length !== list.length) fail(op, 'reorder is not a permutation (length)');
    const byId = new Map(list.map(x => [x.id, x]));
    const out = [];
    for (const id of order) {
        const x = byId.get(id);
        if (!x) fail(op, `reorder names unknown id ${id}`);
        byId.delete(id);
        out.push(x);
    }
    return out;
};

const COSTUME_KEYS = ['name', 'assetId', 'dataFormat', 'md5ext', 'rotationCenterX', 'rotationCenterY',
    'bitmapResolution'];
const SOUND_KEYS = ['name', 'assetId', 'dataFormat', 'md5ext', 'rate', 'sampleCount', 'format'];

const pick = (data, keys) => {
    const out = {};
    for (const k of keys) if (hasOwn(data, k) && typeof data[k] !== 'undefined') out[k] = copy(data[k]);
    return out;
};

const assetAdd = (op, list, keys) => {
    if (list.some(x => x.id === op.d.id)) fail(op, `id ${op.d.id} already exists`);
    const entry = Object.assign({id: op.d.id}, pick(op.d.data, keys));
    const index = typeof op.d.index === 'number' && op.d.index >= 0 && op.d.index <= list.length ?
        op.d.index : list.length;
    list.splice(index, 0, entry);
};

const assetUpdate = (op, list, keys) => {
    const entry = list.find(x => x.id === op.d.id);
    if (!entry) fail(op, `no ${op.k.split('.')[0]} ${op.d.id}`);
    Object.assign(entry, pick(op.d.data, keys));
};

const assetDelete = (op, list) => {
    const i = list.findIndex(x => x.id === op.d.id);
    if (i !== -1) list.splice(i, 1);
};

const applyArtOps = (op, target) => {
    if (!target.art) target.art = {};
    const id = op.d.costume;
    if (op.d.reset || !target.art[id]) target.art[id] = {order: [], shapes: {}};
    const doc = target.art[id];
    for (const a of op.d.ops) {
        if (!a || typeof a !== 'object') continue;
        if (a.op === 'add' || a.op === 'update') {
            doc.shapes[a.id] = copy(a.shape);
            if (!doc.order.includes(a.id)) {
                const at = typeof a.index === 'number' ? Math.min(Math.max(a.index, 0), doc.order.length) :
                    doc.order.length;
                doc.order.splice(at, 0, a.id);
            }
        } else if (a.op === 'delete') {
            delete doc.shapes[a.id];
            doc.order = doc.order.filter(x => x !== a.id);
        } else if (a.op === 'reorder' && Array.isArray(a.order)) {
            doc.order = a.order.filter(x => hasOwn(doc.shapes, x));
        } else if (a.op === 'clear') {
            target.art[id] = {order: [], shapes: {}};
        }
    }
};

const TARGET_PROP_KEYS = new Set(['x', 'y', 'direction', 'size', 'rotationStyle', 'visible', 'draggable',
    'currentCostume', 'volume', 'layerOrder', 'tempo', 'videoState', 'videoTransparency',
    'textToSpeechLanguage']);

const HANDLERS = {
    'blocks.add' (state, op) {
        const t = needTarget(state, op);
        for (const id of Object.keys(op.d.blocks)) {
            if (hasOwn(t.blocks, id) && !op.d.replace) continue;
            const b = copy(op.d.blocks[id]);
            b.id = id;
            t.blocks[id] = normalizeBlock(b);
        }
    },
    'blocks.delete' (state, op) {
        const t = needTarget(state, op);
        if (!hasOwn(t.blocks, op.d.id)) return;
        if (op.d.raw) {
            delete t.blocks[op.d.id];
            return;
        }
        deleteBlockCascade(t, op.d.id, new Set());
    },
    'blocks.update' (state, op) {
        const t = needTarget(state, op);
        const block = t.blocks[op.d.id];
        if (!block) fail(op, `no block ${op.d.id}`);
        applyBlockProps(block, op.d.props);
    },
    'blocks.deleteInput' (state, op) {
        const t = needTarget(state, op);
        const block = t.blocks[op.d.id];
        if (!block) fail(op, `no block ${op.d.id}`);
        if (block.inputs) delete block.inputs[op.d.inputName];
    },
    'blocks.set' (state, op) {
        const t = needTarget(state, op);
        t.blocks = copy(op.d.blocks);
        for (const id of Object.keys(t.blocks)) {
            t.blocks[id].id = id;
            normalizeBlock(t.blocks[id]);
        }
    },
    'var.add' (state, op) {
        const t = needTarget(state, op);
        if (hasOwn(t.variables, op.d.id)) return;
        const data = op.d.data || {};
        const type = typeof op.d.type === 'string' ? op.d.type : (data.type || '');
        let value = hasOwn(data, 'value') ? copy(data.value) : defaultValueFor(type);
        if (type === 'broadcast_msg') value = data.name;
        if (data.isCloud) value = CLOUD_VALUE;
        t.variables[op.d.id] = {id: op.d.id, name: data.name, type, value, isCloud: !!data.isCloud};
    },
    'var.update' (state, op) {
        const t = needTarget(state, op);
        const v = t.variables[op.d.id];
        if (!v) fail(op, `no variable ${op.d.id}`);
        for (const k of ['name', 'isCloud']) if (hasOwn(op.d.data, k)) v[k] = copy(op.d.data[k]);
        if (v.isCloud) v.value = CLOUD_VALUE;
        else if (hasOwn(op.d.data, 'value')) v.value = copy(op.d.data.value);
    },
    'var.delete' (state, op) {
        const t = needTarget(state, op);
        delete t.variables[op.d.id];
    },
    'comment.add' (state, op) {
        const t = needTarget(state, op);
        if (hasOwn(t.comments, op.d.id)) return;
        const d = op.d.data;
        t.comments[op.d.id] = {
            id: op.d.id,
            blockId: d.blockId || null,
            x: d.x,
            y: d.y,
            width: d.width,
            height: d.height,
            minimized: !!d.minimized,
            text: d.text
        };
        if (d.blockId && t.blocks[d.blockId]) t.blocks[d.blockId].comment = op.d.id;
    },
    'comment.update' (state, op) {
        const t = needTarget(state, op);
        const c = t.comments[op.d.id];
        if (!c) fail(op, `no comment ${op.d.id}`);
        for (const k of ['x', 'y', 'width', 'height', 'minimized', 'text', 'blockId']) {
            if (hasOwn(op.d.data, k)) c[k] = copy(op.d.data[k]);
        }
    },
    'comment.delete' (state, op) {
        const t = needTarget(state, op);
        const c = t.comments[op.d.id];
        if (!c) return;
        if (c.blockId && t.blocks[c.blockId] && t.blocks[c.blockId].comment === op.d.id) {
            delete t.blocks[c.blockId].comment;
        }
        delete t.comments[op.d.id];
    },
    'monitor.set' (state, op) {
        if (!Array.isArray(state.monitors)) state.monitors = [];
        for (const id of Object.keys(op.d.monitors)) {
            const rec = op.d.monitors[id];
            const i = state.monitors.findIndex(m => m.id === id);
            if (rec === null) {
                if (i !== -1) state.monitors.splice(i, 1);
            } else if (i === -1) {
                state.monitors.push(Object.assign(copy(rec), {id}));
            } else {
                state.monitors[i] = Object.assign(copy(rec), {id});
            }
        }
    },
    'costume.add' (state, op) {
        assetAdd(op, needTarget(state, op).costumes, COSTUME_KEYS);
    },
    'costume.update' (state, op) {
        assetUpdate(op, needTarget(state, op).costumes, COSTUME_KEYS);
    },
    'costume.delete' (state, op) {
        const t = needTarget(state, op);
        assetDelete(op, t.costumes);
        if (t.art) delete t.art[op.d.id];
    },
    'costume.reorder' (state, op) {
        const t = needTarget(state, op);
        t.costumes = reorderById(op, t.costumes, op.d.order);
    },
    'sound.add' (state, op) {
        assetAdd(op, needTarget(state, op).sounds, SOUND_KEYS);
    },
    'sound.update' (state, op) {
        assetUpdate(op, needTarget(state, op).sounds, SOUND_KEYS);
    },
    'sound.delete' (state, op) {
        assetDelete(op, needTarget(state, op).sounds);
    },
    'sound.reorder' (state, op) {
        const t = needTarget(state, op);
        t.sounds = reorderById(op, t.sounds, op.d.order);
    },
    'art.vector' (state, op) {
        applyArtOps(op, needTarget(state, op));
    },
    'art.bitmap' (state, op) {
        needTarget(state, op);
    },
    'art.keyframe' (state, op) {
        needTarget(state, op);
    },
    'target.props' (state, op) {
        const t = needTarget(state, op);
        for (const k of Object.keys(op.d)) if (TARGET_PROP_KEYS.has(k)) t[k] = copy(op.d[k]);
    },
    'target.add' (state, op) {
        const nt = copy(op.d.target);
        if (findTarget(state, nt.id)) fail(op, `target ${nt.id} already exists`);
        for (const k of ['blocks', 'variables', 'comments']) if (!nt[k]) nt[k] = {};
        for (const id of Object.keys(nt.blocks)) normalizeBlock(nt.blocks[id]);
        for (const k of ['costumes', 'sounds']) if (!nt[k]) nt[k] = [];
        const index = typeof op.d.index === 'number' && op.d.index >= 1 && op.d.index <= state.targets.length ?
            op.d.index : state.targets.length;
        state.targets.splice(index, 0, nt);
    },
    'target.delete' (state, op) {
        const id = op.d.id || op.tg;
        const i = state.targets.findIndex(t => t.id === id);
        if (i === -1) return;
        if (state.targets[i].isStage) fail(op, 'cannot delete the stage');
        state.targets.splice(i, 1);
    },
    'target.rename' (state, op) {
        needTarget(state, op).name = op.d.name;
    },
    'target.order' (state, op) {
        state.targets = reorderById(op, state.targets, op.d.order);
        if (op.d.layers && typeof op.d.layers === 'object') {
            for (const t of state.targets) {
                if (hasOwn(op.d.layers, t.id)) t.layerOrder = op.d.layers[t.id];
            }
        }
    },
    'ext.add' (state, op) {
        if (!Array.isArray(state.extensions)) state.extensions = [];
        if (state.extensions.some(e => e.id === op.d.id)) return;
        const e = {id: op.d.id};
        if (op.d.url) e.url = op.d.url;
        state.extensions.push(e);
    },
    'ext.remove' (state, op) {
        state.extensions = (state.extensions || []).filter(e => e.id !== op.d.id);
    },
    'font.add' (state, op) {
        if (!Array.isArray(state.fonts)) state.fonts = [];
        const fam = op.d.family.toLowerCase();
        state.fonts = state.fonts.filter(f => f.family.toLowerCase() !== fam);
        const f = {system: !!op.d.system, family: op.d.family, fallback: op.d.fallback || ''};
        if (op.d.md5ext) f.md5ext = op.d.md5ext;
        state.fonts.push(f);
    },
    'font.delete' (state, op) {
        const fam = op.d.family.toLowerCase();
        state.fonts = (state.fonts || []).filter(f => f.family.toLowerCase() !== fam);
    },
    'runtime.state' (state, op) {
        for (const id of Object.keys(op.d.targets)) {
            const t = findTarget(state, id);
            if (!t) fail(op, `runtime.state names missing target ${id}`);
            const entry = op.d.targets[id];
            for (const k of Object.keys(entry)) {
                if (k === 'vars') continue;
                if (TARGET_PROP_KEYS.has(k)) t[k] = copy(entry[k]);
            }
            const vars = entry.vars || {};
            for (const varId of Object.keys(vars)) {
                const v = t.variables[varId];
                if (!v) fail(op, `runtime.state names missing variable ${varId}`);
                if (!v.isCloud) v.value = copy(vars[varId]);
            }
        }
    },
    'restore' (state, op) {
        // eslint-disable-next-line no-use-before-define
        for (const inner of op.d.diff) applyOpInPlace(state, inner);
    },
    'system.replaced' () {},
    'system.unknown' () {}
};

/**
 * Apply one op to `state`, mutating it.
 * @param {object} state state
 * @param {object} op op
 * @returns {object} state
 */
export const applyOpInPlace = (state, op) => {
    const h = HANDLERS[op && op.k];
    if (!h) throw new RewindApplyError(`unknown op kind ${op && op.k}`, op);
    h(state, op);
    return state;
};

/**
 * @param {object} state state
 * @param {Array<object>} ops ops in order
 * @param {object} [opts] options
 * @returns {object} resulting state
 */
export const applyOps = (state, ops, opts = {}) => {
    const s = opts.inPlace ? state : copy(state);
    for (const op of ops) applyOpInPlace(s, op);
    return s;
};

export const applyOp = (state, op) => applyOps(state, [op]);
