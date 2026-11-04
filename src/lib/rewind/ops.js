export const OP_KINDS = new Set([
    'blocks.add', 'blocks.delete', 'blocks.update', 'blocks.deleteInput', 'blocks.set',
    'var.add', 'var.update', 'var.delete',
    'comment.add', 'comment.update', 'comment.delete',
    'monitor.set',
    'costume.add', 'costume.update', 'costume.delete', 'costume.reorder',
    'sound.add', 'sound.update', 'sound.delete', 'sound.reorder',
    'art.vector', 'art.bitmap', 'art.keyframe',
    'target.props', 'target.add', 'target.delete', 'target.rename', 'target.order',
    'ext.add', 'ext.remove',
    'font.add', 'font.delete',
    'runtime.state',
    'restore',
    'system.replaced', 'system.unknown'
]);

export const SOURCES = new Set([
    'editor', 'torchy', 'backpack', 'import', 'library', 'duplicate', 'paste',
    'runtime', 'restore', 'system'
]);

export const ACTORS = new Set(['self', 'torchy']);

export const MAX_OP_BYTES = 256 * 1024;

const TARGET_KINDS = new Set([
    'blocks.add', 'blocks.delete', 'blocks.update', 'blocks.deleteInput', 'blocks.set',
    'var.add', 'var.update', 'var.delete',
    'comment.add', 'comment.update', 'comment.delete',
    'costume.add', 'costume.update', 'costume.delete', 'costume.reorder',
    'sound.add', 'sound.update', 'sound.delete', 'sound.reorder',
    'art.vector', 'art.bitmap', 'art.keyframe',
    'target.props', 'target.delete', 'target.rename'
]);

export class RewindOpError extends Error {
    constructor (message) {
        super(message);
        this.name = 'RewindOpError';
    }
}

/* global globalThis */
const getCrypto = () => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
    if (typeof window !== 'undefined' && window.crypto) return window.crypto;
    return null;
};

const hex = n => {
    let s = '';
    const bytes = new Uint8Array(n);
    const c = getCrypto();
    if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < n; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
};

export const uuidv4 = () => {
    const c = getCrypto();
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const h = hex(16).split('');
    h[12] = '4';
    h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
    const s = h.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const utf8Length = str => {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    // eslint-disable-next-line no-undef
    return Buffer.byteLength(str, 'utf8');
};

export const opBytes = op => utf8Length(JSON.stringify(op));

const PAYLOAD = {
    'blocks.add': d => (isObj(d.blocks) && Object.keys(d.blocks).length ? null : 'blocks.add needs d.blocks'),
    'blocks.delete': d => (typeof d.id === 'string' ? null : 'blocks.delete needs d.id'),
    'blocks.update': d => (typeof d.id === 'string' && isObj(d.props) ? null : 'blocks.update needs d.id, d.props'),
    'blocks.deleteInput': d => (typeof d.id === 'string' && typeof d.inputName === 'string' ?
        null : 'blocks.deleteInput needs d.id, d.inputName'),
    'blocks.set': d => (isObj(d.blocks) ? null : 'blocks.set needs d.blocks'),
    'var.add': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'var.add needs d.id, d.data'),
    'var.update': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'var.update needs d.id, d.data'),
    'var.delete': d => (typeof d.id === 'string' ? null : 'var.delete needs d.id'),
    'comment.add': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'comment.add needs d.id, d.data'),
    'comment.update': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'comment.update needs d.id, d.data'),
    'comment.delete': d => (typeof d.id === 'string' ? null : 'comment.delete needs d.id'),
    'monitor.set': d => (isObj(d.monitors) ? null : 'monitor.set needs d.monitors'),
    'costume.add': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'costume.add needs d.id, d.data'),
    'costume.update': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'costume.update needs d.id, d.data'),
    'costume.delete': d => (typeof d.id === 'string' ? null : 'costume.delete needs d.id'),
    'costume.reorder': d => (Array.isArray(d.order) ? null : 'costume.reorder needs d.order'),
    'sound.add': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'sound.add needs d.id, d.data'),
    'sound.update': d => (typeof d.id === 'string' && isObj(d.data) ? null : 'sound.update needs d.id, d.data'),
    'sound.delete': d => (typeof d.id === 'string' ? null : 'sound.delete needs d.id'),
    'sound.reorder': d => (Array.isArray(d.order) ? null : 'sound.reorder needs d.order'),
    'art.vector': d => (typeof d.costume === 'string' && Array.isArray(d.ops) ?
        null : 'art.vector needs d.costume, d.ops'),
    'art.bitmap': d => (typeof d.costume === 'string' && isObj(d.op) ? null : 'art.bitmap needs d.costume, d.op'),
    'art.keyframe': d => (typeof d.costume === 'string' && typeof d.md5ext === 'string' &&
        (d.format === 'png' || d.format === 'svg') ? null : 'art.keyframe needs d.costume, d.md5ext, d.format'),
    'target.props': d => (Object.keys(d).length ? null : 'target.props needs at least one property'),
    'target.add': d => (isObj(d.target) && typeof d.target.id === 'string' ? null : 'target.add needs d.target'),
    'target.delete': d => (typeof d.id === 'string' ? null : 'target.delete needs d.id'),
    'target.rename': d => (typeof d.name === 'string' ? null : 'target.rename needs d.name'),
    'target.order': d => (Array.isArray(d.order) ? null : 'target.order needs d.order'),
    'ext.add': d => (typeof d.id === 'string' ? null : 'ext.add needs d.id'),
    'ext.remove': d => (typeof d.id === 'string' ? null : 'ext.remove needs d.id'),
    'font.add': d => (typeof d.family === 'string' ? null : 'font.add needs d.family'),
    'font.delete': d => (typeof d.family === 'string' ? null : 'font.delete needs d.family'),
    'runtime.state': d => (isObj(d.targets) ? null : 'runtime.state needs d.targets'),
    'restore': d => (typeof d.to === 'number' && Array.isArray(d.diff) ? null : 'restore needs d.to, d.diff'),
    'system.replaced': () => null,
    'system.unknown': () => null
};

export const validateOp = op => {
    if (!isObj(op)) return 'op is not an object';
    if (typeof op.id !== 'string' || !UUID_RE.test(op.id)) return 'op.id is not a uuid';
    if (typeof op.t !== 'number' || !isFinite(op.t) || op.t <= 0) return 'op.t is not an epoch ms';
    if (!OP_KINDS.has(op.k)) return `unknown op kind ${op.k}`;
    if (!SOURCES.has(op.source)) return `unknown op source ${op.source}`;
    if (!ACTORS.has(op.actor)) return `unknown op actor ${op.actor}`;
    if (TARGET_KINDS.has(op.k) && typeof op.tg !== 'string') return `${op.k} needs tg`;
    if (op.tg !== null && typeof op.tg !== 'string') return 'op.tg must be a string or null';
    if (!isObj(op.d)) return 'op.d is not an object';
    if (typeof op.g !== 'undefined' && typeof op.g !== 'string') return 'op.g must be a string';
    const why = PAYLOAD[op.k](op.d);
    if (why) return why;
    if (op.k === 'restore') {
        for (const inner of op.d.diff) {
            const innerWhy = validateOp(inner);
            if (innerWhy) return `restore diff: ${innerWhy}`;
            if (inner.k === 'restore') return 'restore diff cannot nest a restore';
        }
    } else if (opBytes(op) > MAX_OP_BYTES) {
        return `op is larger than ${MAX_OP_BYTES} bytes`;
    }
    return null;
};

export const makeOp = (k, tg, d, opts = {}) => {
    const source = opts.source || 'editor';
    const op = {
        id: opts.id || uuidv4(),
        t: typeof opts.t === 'number' ? opts.t : Date.now(),
        actor: opts.actor || (source === 'torchy' ? 'torchy' : 'self'),
        source,
        k,
        tg: typeof tg === 'string' ? tg : null,
        d
    };
    if (typeof opts.g === 'string' && opts.g) op.g = opts.g;
    const why = validateOp(op);
    if (why) throw new RewindOpError(why);
    return op;
};

export const isDisplayable = op => !(op.k === 'system.unknown' || op.k === 'art.keyframe' ||
    (op.source === 'system' && op.k !== 'system.replaced'));
