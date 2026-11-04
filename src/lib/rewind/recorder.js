import {makeOp, RewindOpError, opBytes, MAX_OP_BYTES} from './ops.js';
import {
    serializeState, serializeTarget, serializeMonitors, serializeFonts, readRuntimeFieldsFromVm,
    cloneState
} from './state.js';
import {applyOpInPlace} from './apply.js';
import {diffStates, diffRuntime, pushTargetAdd} from './diff.js';
import {assignShapeIds, diffShapes} from '../costume-art-shapes.js';

const FIELD_VALUE_KEY = /^\["fields","[^"]*","value"\]$/;
const PROP_KEYS = ['x', 'y', 'direction', 'size', 'rotationStyle', 'visible', 'draggable', 'currentCostume',
    'volume', 'layerOrder', 'tempo', 'videoState', 'videoTransparency', 'textToSpeechLanguage'];
const PROPS_COALESCE_MS = 1000;
const ASSET_IDLE_MS = 15000;
const BLOCKS_PER_OP = 200;

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const copy = v => (typeof v === 'undefined' ? v : JSON.parse(JSON.stringify(v)));
const stable = v => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    return `{${Object.keys(v).filter(k => typeof v[k] !== 'undefined')
        .sort()
        .map(k => `${JSON.stringify(k)}:${stable(v[k])}`)
        .join(',')}}`;
};

const costumeData = c => ({
    name: c.name,
    assetId: c.assetId,
    dataFormat: (c.dataFormat || '').toLowerCase(),
    md5ext: c.md5 || `${c.assetId}.${(c.dataFormat || '').toLowerCase()}`,
    rotationCenterX: c.rotationCenterX,
    rotationCenterY: c.rotationCenterY,
    bitmapResolution: c.bitmapResolution || 1
});

const soundData = s => {
    const out = {
        name: s.name,
        assetId: s.assetId,
        dataFormat: (s.dataFormat || '').toLowerCase(),
        md5ext: s.md5 || `${s.assetId}.${(s.dataFormat || '').toLowerCase()}`,
        rate: s.rate,
        sampleCount: s.sampleCount
    };
    if (s.format) out.format = s.format;
    return out;
};

const ASSET_KEYS = ['assetId', 'md5ext', 'md5', 'dataFormat', 'rotationCenterX', 'rotationCenterY',
    'bitmapResolution'];

export const collectMd5ext = (op, out) => {
    const d = op.d || {};
    switch (op.k) {
    case 'costume.add':
    case 'costume.update':
    case 'sound.add':
    case 'sound.update':
        if (d.data && d.data.md5ext) out.add(d.data.md5ext);
        break;
    case 'art.keyframe':
        out.add(d.md5ext);
        break;
    case 'font.add':
        if (d.md5ext) out.add(d.md5ext);
        break;
    case 'target.add':
        for (const c of d.target.costumes || []) if (c.md5ext) out.add(c.md5ext);
        for (const s of d.target.sounds || []) if (s.md5ext) out.add(s.md5ext);
        break;
    case 'restore':
        for (const inner of d.diff) collectMd5ext(inner, out);
        break;
    }
};

export class RewindRecorder {
    constructor (vm, opts = {}) {
        this.artSource = opts.artSource || null;
        this.vm = vm;
        this.now = opts.now || (() => Date.now());
        this.session = opts.session || null;
        this.room = opts.room || null;
        this.shadowEnabled = opts.shadow !== false && !this.room;
        this.keyframeEvery = opts.keyframeEvery || 20;
        this.onOps = opts.onOps || null;
        this.log = opts.log || console;
        this.clientId = opts.clientId || `rw${Math.random().toString(36)
            .slice(2, 7)}`;

        this.started = false;
        this.ops = [];
        this.lastT = 0;
        this.pendingField = null;
        this.pendingProps = null;
        this.pendingAssets = new Map();
        this.assetRefs = new Map();
        this.knownTargets = new Set();
        this.suppressDepth = 0;
        this.suppressReasons = [];
        this.suppressDirty = false;
        this.preSuppressTargets = null;
        this.probes = [];
        this.hints = [];
        this.sourceStack = [];
        this.running = false;
        this.assetTimer = null;
        this.closingAssets = false;
        this.artPublished = new Map();
        this.needsBase = null;
        this.base = null;
        this.shadow = null;
        this.baseline = null;
        this.monitorsSnapshot = new Map();
        this.fontsSnapshot = [];
        this.subscriptions = [];
        this.stats = {recorded: 0, suppressed: 0, coalesced: 0, repairs: 0, dropped: 0};
    }

    start () {
        if (this.started) return this.base;
        this.started = true;
        this.base = this.snapshot();
        this.attach();
        return this.base;
    }

    stop () {
        if (!this.started) return;
        this.started = false;
        for (const [emitter, name, fn] of this.subscriptions) {
            if (typeof emitter.off === 'function') emitter.off(name, fn);
            else emitter.removeListener(name, fn);
        }
        this.subscriptions = [];
        clearTimeout(this.assetTimer);
    }

    snapshot () {
        const runtime = this.vm.runtime;
        const opts = {t: this.nextT(), session: this.session, room: this.room};
        if (this.artSource) opts.art = this.artSource;
        const base = serializeState(this.vm, opts);
        this.shadow = this.shadowEnabled ? cloneState(base) : null;
        this.baseline = readRuntimeFieldsFromVm(this.vm);
        this.knownTargets = new Set(runtime.targets.filter(t => t.isOriginal).map(t => t.id));
        this.monitorsSnapshot = this.readMonitors();
        this.fontsSnapshot = serializeFonts(runtime);
        this.artPublished = new Map();
        return base;
    }

    rebase (reason) {
        this.closePending();
        this.base = this.snapshot();
        this.needsBase = null;
        if (reason && this.log && this.log.info) this.log.info(`[rewind] new base (${reason})`);
        return this.base;
    }

    setRoom (room) {
        const same = (room && this.room && room.id === this.room.id && room.generation === this.room.generation) ||
            (!room && !this.room);
        if (same) return;
        this.closePending();
        this.room = room || null;
        this.shadowEnabled = !this.room;
        this.needsBase = room ? 'room' : 'left-room';
    }

    attach () {
        const vm = this.vm;
        const on = (emitter, name, fn) => {
            const wrapped = (...args) => this.dispatch(name, fn, args);
            emitter.on(name, wrapped);
            this.subscriptions.push([emitter, name, wrapped]);
        };
        on(vm, 'TARGET_BLOCKS_CHANGED', this.onBlocks);
        on(vm, 'TARGET_VARIABLES_CHANGED', this.onVariables);
        on(vm, 'TARGET_COMMENTS_CHANGED', this.onComments);
        on(vm, 'MONITORS_UPDATE', this.onMonitors);
        on(vm, 'TARGET_COSTUME_CHANGED', this.onCostume);
        on(vm, 'TARGET_CURRENT_COSTUME_CHANGED', this.onCurrentCostume);
        on(vm, 'SOUNDS_CHANGED', this.onSounds);
        on(vm, 'TARGET_SIMPLE_PROPERTY_CHANGED', this.onSimpleProps);
        on(vm, 'TARGET_RENAMED', this.onRename);
        on(vm, 'TARGETS_INDEX_CHANGED', this.onIndexChanged);
        on(vm, 'ADD_SPRITE', this.onAddSprite);
        on(vm, 'DELETE_SPRITE', this.onDeleteSprite);
        on(vm, 'COLLABORATION_EXTENSION_ADDED', this.onExtensionAdded);
        on(vm, 'EXTENSION_REMOVED', this.onExtensionRemoved);
        on(vm, 'PROJECT_RUN_START', this.onRunStart);
        on(vm, 'PROJECT_RUN_STOP', this.onRunStop);
        if (vm.runtime.fontManager && typeof vm.runtime.fontManager.on === 'function') {
            on(vm.runtime.fontManager, 'change', this.onFonts);
        }
    }

    dispatch (name, fn, args) {
        if (!this.started) return;
        if (this.isSuppressed()) {
            this.stats.suppressed++;
            this.suppressDirty = true;
            this.onSuppressedEvent(name, args);
            return;
        }
        try {
            fn.apply(this, args);
        } catch (e) {
            this.log.warn(`[rewind] recorder failed on ${name}`, e);
            this.needsBase = this.needsBase || `recorder-error:${name}`;
        }
    }

    isSuppressed () {
        if (this.suppressDepth > 0) return true;
        for (const probe of this.probes) {
            try {
                if (probe()) return true;
            } catch (e) {
                // ignore
            }
        }
        return false;
    }

    addSuppressionProbe (fn) {
        this.probes.push(fn);
        return () => {
            this.probes = this.probes.filter(p => p !== fn);
        };
    }

    beginSuppress (reason) {
        if (this.suppressDepth === 0 && this.started) {
            this.closePending();
            if (this.running) this.checkpointRuntime('before-suppress');
            this.preSuppressTargets = new Set(this.originalIds());
            this.suppressDirty = false;
        }
        this.suppressDepth++;
        this.suppressReasons.push(reason || 'unknown');
    }

    endSuppress () {
        if (this.suppressDepth === 0) return;
        this.suppressDepth--;
        const reason = this.suppressReasons.pop();
        if (this.suppressDepth === 0 && this.started) this.afterSuppression(reason);
    }

    suppress (reason, fn) {
        this.beginSuppress(reason);
        let result;
        try {
            result = fn();
        } catch (e) {
            this.endSuppress();
            throw e;
        }
        if (result && typeof result.then === 'function') {
            return result.then(value => {
                this.endSuppress();
                return value;
            }, err => {
                this.endSuppress();
                throw err;
            });
        }
        this.endSuppress();
        return result;
    }

    afterSuppression (reason) {
        const now = new Set(this.originalIds());
        const before = this.preSuppressTargets || new Set();
        for (const id of now) if (!before.has(id)) this.knownTargets.add(id);
        for (const id of [...this.knownTargets]) if (!now.has(id)) this.knownTargets.delete(id);
        this.preSuppressTargets = null;
        this.baseline = readRuntimeFieldsFromVm(this.vm);
        this.monitorsSnapshot = this.readMonitors();
        this.fontsSnapshot = serializeFonts(this.vm.runtime);
        if (this.shadow && this.suppressDirty && reason !== 'restore') {
            this.shadow = serializeState(this.vm);
            this.needsBase = this.needsBase || `suppressed:${reason}`;
        }
        this.suppressDirty = false;
    }

    onSuppressedEvent (name, args) {
        if (name === 'TARGET_COSTUME_CHANGED') {
            const [, payload] = args;
            if (payload && typeof payload[1] === 'string') this.artPublished.delete(payload[1]);
        }
    }

    hintSource (kind, source, opts = {}) {
        this.hints.push({kind, source, targetId: opts.targetId || null, until: this.now() + (opts.ttl || 30000)});
    }

    takeHint (kind, targetId) {
        const t = this.now();
        this.hints = this.hints.filter(h => h.until >= t);
        const i = this.hints.findIndex(h => h.kind === kind && (!h.targetId || !targetId || h.targetId === targetId));
        if (i === -1) return null;
        const [hint] = this.hints.splice(i, 1);
        return hint.source;
    }

    withSource (source, fn) {
        this.sourceStack.push(source);
        try {
            return fn();
        } finally {
            this.sourceStack.pop();
        }
    }

    sourceFor (group) {
        if (typeof group === 'string' && group.startsWith('torchy:')) return 'torchy';
        if (this.sourceStack.length) return this.sourceStack[this.sourceStack.length - 1];
        return 'editor';
    }

    currentGroup () {
        const g = this.vm.runtime && this.vm.runtime.currentBlocklyGroup;
        return typeof g === 'string' && g ? g : null;
    }

    nextT () {
        const t = Math.max(this.now(), this.lastT + 1);
        this.lastT = t;
        return t;
    }

    originalIds () {
        return this.vm.runtime.targets.filter(t => t.isOriginal).map(t => t.id);
    }

    target (id) {
        return this.vm.runtime.getTargetById(id) || null;
    }

    known (targetId) {
        return typeof targetId === 'string' && this.knownTargets.has(targetId);
    }

    record (k, tg, d, opts = {}) {
        if (!opts.keepPending) this.closePending();
        if (!k.startsWith('art.') && !this.closingAssets && k !== 'costume.update') this.closeAssets();
        const op = this.makeOp(k, tg, d, opts);
        if (!op) return null;
        this.commit(op);
        return op;
    }

    makeOp (k, tg, d, opts) {
        const source = opts.source || this.sourceFor(opts.g);
        try {
            return makeOp(k, tg, d, {source, actor: opts.actor, g: opts.g || null, t: this.nextT()});
        } catch (e) {
            if (e instanceof RewindOpError) {
                this.stats.dropped++;
                this.needsBase = this.needsBase || `unrecordable:${k}:${e.message}`;
                this.log.warn(`[rewind] could not record ${k}: ${e.message}`);
                return null;
            }
            throw e;
        }
    }

    commit (op) {
        if (this.shadow) {
            try {
                applyOpInPlace(this.shadow, op);
            } catch (e) {
                this.log.warn('[rewind] shadow could not apply an op; next flush carries a base', e);
                this.shadow = null;
                this.needsBase = this.needsBase || 'shadow-apply';
            }
        }
        this.applyToBaseline(op);
        this.ops.push(op);
        this.stats.recorded++;
        if (this.onOps) this.onOps([op]);
    }

    applyToBaseline (op) {
        const b = this.baseline;
        if (!b) return;
        const entry = op.tg && b.targets[op.tg];
        switch (op.k) {
        case 'target.props':
            if (entry) for (const k of Object.keys(op.d)) if (PROP_KEYS.includes(k)) entry[k] = copy(op.d[k]);
            break;
        case 'var.add':
            if (entry && op.d.type !== 'broadcast_msg') {
                entry.vars[op.d.id] = copy(hasOwn(op.d.data, 'value') ? op.d.data.value :
                    (op.d.type === 'list' ? [] : 0));
            }
            break;
        case 'var.update':
            if (entry && hasOwn(op.d.data, 'value')) entry.vars[op.d.id] = copy(op.d.data.value);
            break;
        case 'var.delete':
            if (entry) delete entry.vars[op.d.id];
            break;
        case 'target.add': {
            const t = op.d.target;
            const e = {vars: {}};
            for (const k of PROP_KEYS) if (hasOwn(t, k)) e[k] = copy(t[k]);
            for (const id of Object.keys(t.variables || {})) {
                if (t.variables[id].type !== 'broadcast_msg') e.vars[id] = copy(t.variables[id].value);
            }
            b.targets[t.id] = e;
            break;
        }
        case 'target.delete':
            delete b.targets[op.d.id];
            break;
        case 'runtime.state':
            for (const id of Object.keys(op.d.targets)) {
                const e = b.targets[id];
                if (!e) continue;
                const src = op.d.targets[id];
                for (const k of Object.keys(src)) {
                    if (k === 'vars') Object.assign(e.vars, copy(src.vars));
                    else e[k] = copy(src[k]);
                }
            }
            break;
        case 'restore':
            for (const inner of op.d.diff) this.applyToBaseline(inner);
            break;
        }
    }

    closePending () {
        if (this.pendingField) {
            const {op} = this.pendingField;
            this.pendingField = null;
            this.ops.push(op);
            this.stats.recorded++;
            if (this.onOps) this.onOps([op]);
        }
        if (this.pendingProps) {
            const {op} = this.pendingProps;
            this.pendingProps = null;
            this.ops.push(op);
            this.stats.recorded++;
            if (this.onOps) this.onOps([op]);
        }
    }

    noteAsset (asset) {
        if (!asset || !asset.assetId || !asset.dataFormat) return;
        this.assetRefs.set(`${asset.assetId}.${asset.dataFormat}`, asset);
    }

    onBlocks (targetId, change, ext) {
        if (!this.known(targetId) || !Array.isArray(change)) return;
        const [type, payload] = change;
        const g = (ext && ext.group) || this.currentGroup();
        let source = this.sourceFor(g);
        const target = this.target(targetId);
        if (type === 'add') {
            const list = Array.isArray(payload) ? payload : Object.values(payload || {});
            if (!g && !this.sourceStack.length) {
                const hinted = this.takeHint('share', targetId);
                if (hinted) source = hinted;
            }
            const blocks = {};
            for (const b of list) {
                if (!b || typeof b.id !== 'string') continue;
                const live = target && target.blocks._blocks[b.id];
                blocks[b.id] = copy(live || b);
            }
            const ids = Object.keys(blocks);
            const group = g || `vm:${this.nextT()}`;
            for (let i = 0; i < ids.length; i += BLOCKS_PER_OP) {
                const chunk = {};
                for (const id of ids.slice(i, i + BLOCKS_PER_OP)) chunk[id] = blocks[id];
                this.record('blocks.add', targetId, {blocks: chunk, replace: true}, {source, g: group});
            }
        } else if (type === 'delete') {
            this.record('blocks.delete', targetId, {id: payload}, {source, g});
        } else if (type === 'update') {
            const ids = Object.keys(payload || {});
            if (ids.length === 1 && this.coalesceField(targetId, ids[0], payload[ids[0]], g, source)) return;
            const group = ids.length > 1 ? (g || `vm:${this.nextT()}`) : (g || null);
            for (const id of ids) {
                const props = copy(payload[id]);
                if (!props || !Object.keys(props).length) continue;
                if (ids.length === 1 && this.isFieldEdit(props)) {
                    this.startField(targetId, id, props, g, source);
                } else {
                    this.record('blocks.update', targetId, {id, props}, {source, g: group});
                }
            }
        } else if (type === 'deleteInput') {
            this.record('blocks.deleteInput', targetId, {id: payload.id, inputName: payload.inputName},
                {source, g});
        }
    }

    isFieldEdit (props) {
        const keys = Object.keys(props);
        return keys.length > 0 && keys.every(k => FIELD_VALUE_KEY.test(k));
    }

    fieldKey (targetId, blockId, props, g) {
        return `${targetId}|${blockId}|${Object.keys(props).sort()
            .join(',')}|${g || ''}`;
    }

    coalesceField (targetId, blockId, props, g, source) {
        const p = this.pendingField;
        if (!p || !g || !this.isFieldEdit(props)) return false;
        if (p.key !== this.fieldKey(targetId, blockId, props, g) || p.op.source !== source) return false;
        Object.assign(p.op.d.props, copy(props));
        p.op.t = this.nextT();
        if (this.shadow) {
            try {
                applyOpInPlace(this.shadow, {k: 'blocks.update', tg: targetId, d: {id: blockId, props}});
            } catch (e) {
                this.shadow = null;
                this.needsBase = this.needsBase || 'shadow-apply';
            }
        }
        this.stats.coalesced++;
        return true;
    }

    startField (targetId, blockId, props, g, source) {
        this.closePending();
        this.closeAssets();
        const op = this.makeOp('blocks.update', targetId, {id: blockId, props}, {source, g});
        if (!op) return;
        if (this.shadow) {
            try {
                applyOpInPlace(this.shadow, op);
            } catch (e) {
                this.shadow = null;
                this.needsBase = this.needsBase || 'shadow-apply';
            }
        }
        if (g) {
            this.pendingField = {key: this.fieldKey(targetId, blockId, props, g), op};
        } else {
            this.ops.push(op);
            this.stats.recorded++;
            if (this.onOps) this.onOps([op]);
        }
    }

    onVariables (targetId, change) {
        if (!this.known(targetId) || !Array.isArray(change)) return;
        const [varId, varType, op, data] = change;
        const target = this.target(targetId);
        const g = this.currentGroup();
        if (op === 'add') {
            const v = target && target.variables[varId];
            const d = v ? {name: v.name, value: copy(v.value), isCloud: !!v.isCloud} :
                {name: data && data.name, value: copy(data && data.value), isCloud: !!(data && data.isCloud)};
            if (d.isCloud) delete d.value;
            this.record('var.add', targetId, {id: varId, type: varType || '', data: d}, {g});
        } else if (op === 'update') {
            const v = target && target.variables[varId];
            const cloud = !!((v && v.isCloud) || (data && data.isCloud));
            const d = {};
            for (const k of ['name', 'value', 'isCloud']) {
                if (k === 'value' && cloud) continue;
                if (data && hasOwn(data, k)) d[k] = copy(data[k]);
            }
            if (Object.keys(d).length) {
                this.record('var.update', targetId, {id: varId, type: varType || '', data: d}, {g});
            }
        } else if (op === 'delete') {
            this.record('var.delete', targetId, {id: varId, type: varType || ''}, {g});
        }
    }

    onComments (targetId, change) {
        if (!this.known(targetId) || !Array.isArray(change)) return;
        const [type, commentId, payload] = change;
        const target = this.target(targetId);
        const g = this.currentGroup();
        if (type === 'add') {
            const c = (target && target.comments[commentId]) || payload;
            if (!c) return;
            this.record('comment.add', targetId, {id: commentId,
                data: {
                    blockId: c.blockId || null,
                    x: c.x,
                    y: c.y,
                    width: c.width,
                    height: c.height,
                    minimized: !!c.minimized,
                    text: c.text
                }}, {g});
        } else if (type === 'update') {
            const d = {};
            for (const k of ['x', 'y', 'width', 'height', 'minimized', 'text']) {
                if (payload && hasOwn(payload, k)) d[k] = copy(payload[k]);
            }
            if (Object.keys(d).length) this.record('comment.update', targetId, {id: commentId, data: d}, {g});
        } else if (type === 'delete') {
            this.record('comment.delete', targetId, {id: commentId}, {g});
        }
    }

    readMonitors () {
        const out = new Map();
        for (const m of serializeMonitors(this.vm.runtime)) out.set(m.id, {m, s: stable(m)});
        return out;
    }

    onMonitors () {
        const now = this.readMonitors();
        const delta = {};
        for (const [id, {m, s}] of now) {
            const was = this.monitorsSnapshot.get(id);
            if (!was || was.s !== s) delta[id] = m;
        }
        for (const id of this.monitorsSnapshot.keys()) if (!now.has(id)) delta[id] = null;
        this.monitorsSnapshot = now;
        if (!Object.keys(delta).length) return;
        this.record('monitor.set', null, {monitors: delta}, {source: this.isRunning() ? 'runtime' : null});
    }

    onCostume (targetId, change) {
        if (!this.known(targetId) || !Array.isArray(change)) return;
        const [op, id, data] = change;
        const target = this.target(targetId);
        if (!target) return;
        const costumes = target.getCostumes();
        if (op === 'add') {
            const index = costumes.findIndex(c => c.id === id);
            if (index === -1) return;
            const c = costumes[index];
            this.noteAsset(c.asset);
            this.record('costume.add', targetId, {id, index, data: costumeData(c)},
                {source: this.takeHint('asset', targetId)});
        } else if (op === 'update') {
            const c = costumes.find(x => x.id === id);
            if (!c) return;
            const keys = Object.keys(data || {});
            if (keys.some(k => ASSET_KEYS.includes(k))) this.holdAsset(targetId, c);
            else if (data && hasOwn(data, 'name')) this.record('costume.update', targetId, {id, data: {name: c.name}});
        } else if (op === 'delete') {
            this.pendingAssets.delete(id);
            this.artPublished.delete(id);
            this.record('costume.delete', targetId, {id});
        } else if (op === 'reorder') {
            this.record('costume.reorder', targetId, {order: costumes.map(c => c.id)});
        }
        this.noteCurrentCostume(target);
    }

    holdAsset (targetId, costume) {
        const held = this.pendingAssets.get(costume.id) || {tg: targetId, costumeId: costume.id, artOps: 0};
        held.data = costumeData(costume);
        held.asset = costume.asset;
        this.pendingAssets.set(costume.id, held);
        clearTimeout(this.assetTimer);
        this.assetTimer = setTimeout(() => {
            if (this.started && !this.isSuppressed()) this.closeAssets();
        }, ASSET_IDLE_MS);
    }

    closeAssets (costumeId) {
        if (this.closingAssets || !this.pendingAssets.size) return;
        this.closingAssets = true;
        try {
            this.closePending();
            for (const [id, held] of [...this.pendingAssets]) {
                if (costumeId && id !== costumeId) continue;
                this.pendingAssets.delete(id);
                if (!this.known(held.tg)) continue;
                const target = this.target(held.tg);
                if (!target || !target.getCostumes().some(c => c.id === id)) continue;
                this.noteAsset(held.asset);
                this.record('costume.update', held.tg, {id, data: held.data}, {keepPending: true});
                if (held.artOps > 0) {
                    this.record('art.keyframe', held.tg, {
                        costume: id,
                        md5ext: held.data.md5ext,
                        format: held.data.dataFormat === 'svg' ? 'svg' : 'png'
                    }, {keepPending: true});
                }
            }
        } finally {
            this.closingAssets = false;
        }
    }

    paintEditorClosed () {
        if (!this.started || this.isSuppressed()) return;
        this.closeAssets();
    }

    noteCurrentCostume (target) {
        const entry = this.baseline && this.baseline.targets[target.id];
        if (!entry || entry.currentCostume === target.currentCostume) return;
        this.record('target.props', target.id, {currentCostume: target.currentCostume});
    }

    onCurrentCostume () {
        if (this.isRunning()) return;
        const target = this.vm.editingTarget;
        if (target && this.known(target.id)) this.noteCurrentCostume(target);
    }

    onSounds (targetId, change) {
        if (!this.known(targetId) || !Array.isArray(change)) return;
        const [op, id] = change;
        const target = this.target(targetId);
        if (!target) return;
        const sounds = target.getSounds ? target.getSounds() : target.sprite.sounds;
        if (op === 'add') {
            const index = sounds.findIndex(s => s.id === id);
            if (index === -1) return;
            this.noteAsset(sounds[index].asset);
            this.record('sound.add', targetId, {id, index, data: soundData(sounds[index])},
                {source: this.takeHint('asset', targetId)});
        } else if (op === 'update') {
            const s = sounds.find(x => x.id === id);
            if (!s) return;
            this.noteAsset(s.asset);
            this.record('sound.update', targetId, {id, data: soundData(s)});
        } else if (op === 'delete') {
            this.record('sound.delete', targetId, {id});
        } else if (op === 'reorder') {
            this.record('sound.reorder', targetId, {order: sounds.map(s => s.id)});
        }
    }

    onSimpleProps (list) {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (!Array.isArray(item)) continue;
            const [targetId, props] = item;
            if (!this.known(targetId) || !props) continue;
            const entry = this.baseline && this.baseline.targets[targetId];
            const d = {};
            for (const k of PROP_KEYS) {
                if (!hasOwn(props, k)) continue;
                if (entry && stable(entry[k]) === stable(props[k])) continue;
                d[k] = copy(props[k]);
            }
            if (!Object.keys(d).length) continue;
            const p = this.pendingProps;
            const t = this.now();
            if (p && p.targetId === targetId && t - p.last < PROPS_COALESCE_MS) {
                Object.assign(p.op.d, d);
                p.op.t = this.nextT();
                p.last = t;
                if (this.shadow) applyOpInPlace(this.shadow, {k: 'target.props', tg: targetId, d});
                this.applyToBaseline({k: 'target.props', tg: targetId, d});
                this.stats.coalesced++;
                continue;
            }
            this.closePending();
            this.closeAssets();
            const op = this.makeOp('target.props', targetId, d, {});
            if (!op) continue;
            if (this.shadow) applyOpInPlace(this.shadow, op);
            this.applyToBaseline(op);
            this.pendingProps = {targetId, op, last: t};
        }
    }

    onRename (targetId, name) {
        if (!this.known(targetId)) return;
        this.record('target.rename', targetId, {name});
    }

    onIndexChanged () {
        this.record('target.order', null, {order: this.originalIds()});
    }

    onAddSprite () {
        const runtime = this.vm.runtime;
        const originals = runtime.targets.filter(t => t.isOriginal);
        const fresh = originals.filter(t => !this.knownTargets.has(t.id));
        if (!fresh.length) return;
        const source = this.takeHint('sprite') || (this.sourceStack.length ? this.sourceFor(null) : 'import');
        const g = `sprite:${this.nextT()}`;
        for (const t of fresh) {
            const st = serializeTarget(t, null);
            const layers = readRuntimeFieldsFromVm(this.vm).targets[t.id];
            if (layers && typeof layers.layerOrder === 'number') st.layerOrder = layers.layerOrder;
            for (const c of (t.sprite && t.sprite.costumes) || []) this.noteAsset(c.asset);
            for (const s of (t.sprite && t.sprite.sounds) || []) this.noteAsset(s.asset);
            this.knownTargets.add(t.id);
            this.closePending();
            this.closeAssets();
            pushTargetAdd(st, (k, tg, d) => {
                const op = this.makeOp(k, tg, d, {source, g});
                if (op) this.commit(op);
            });
        }
        const order = originals.map(t => t.id);
        const tail = order.slice(order.length - fresh.length);
        if (fresh.some(t => !tail.includes(t.id))) this.record('target.order', null, {order}, {source, g});
    }

    onDeleteSprite (targetId) {
        if (!this.known(targetId)) return;
        this.pendingAssets.forEach((held, id) => {
            if (held.tg === targetId) this.pendingAssets.delete(id);
        });
        this.record('target.delete', targetId, {id: targetId});
        this.knownTargets.delete(targetId);
    }

    onExtensionAdded (info) {
        if (!info || typeof info.name !== 'string') return;
        const em = this.vm.extensionManager;
        const builtin = em && typeof em.isBuiltinExtension === 'function' && em.isBuiltinExtension(info.name);
        const d = {id: info.name};
        if (!builtin && typeof info.URL === 'string' && info.URL !== info.name) d.url = info.URL;
        this.record('ext.add', null, d);
    }

    onExtensionRemoved (info) {
        const id = info && (info.name || info.id || info);
        if (typeof id === 'string') this.record('ext.remove', null, {id});
    }

    onFonts () {
        const now = serializeFonts(this.vm.runtime);
        const key = f => f.family.toLowerCase();
        const before = new Map(this.fontsSnapshot.map(f => [key(f), f]));
        const after = new Map(now.map(f => [key(f), f]));
        this.fontsSnapshot = now;
        const fm = this.vm.runtime.fontManager;
        for (const [k, f] of before) if (!after.has(k)) this.record('font.delete', null, {family: f.family});
        for (const [k, f] of after) {
            if (before.has(k) && stable(before.get(k)) === stable(f)) continue;
            const internal = fm && fm.fonts && fm.fonts.find(x => x.family.toLowerCase() === k);
            if (internal && internal.asset) this.noteAsset(internal.asset);
            this.record('font.add', null, copy(f));
        }
    }

    isRunning () {
        const rt = this.vm.runtime;
        return !!(rt && rt.threads && rt.threads.some(th => !th.updateMonitor));
    }

    onRunStart () {
        this.running = true;
    }

    onRunStop () {
        this.running = false;
    }

    checkpointRuntime (reason) {
        if (!this.baseline) return null;
        const now = readRuntimeFieldsFromVm(this.vm);
        const delta = diffRuntime(this.baseline, now);
        if (!delta) return null;
        return this.record('runtime.state', null, delta, {source: 'runtime', g: `runtime:${reason || 'checkpoint'}`});
    }

    onArt (art) {
        if (!this.started || !art) return;
        if (this.isSuppressed()) {
            this.stats.suppressed++;
            return;
        }
        try {
            this.recordArt(art);
        } catch (e) {
            this.log.warn('[rewind] could not record a paint edit', e);
        }
    }

    recordArt (art) {
        const target = this.vm.runtime.getTargetById(art.targetId);
        if (!target || !this.known(target.id)) return;
        const costume = target.getCostumes()[art.costumeIndex];
        if (!costume) return;
        for (const id of this.pendingAssets.keys()) if (id !== costume.id) this.closeAssets(id);
        if (art.op) {
            if (art.op.kind === 'float' || art.op.kind === 'float-end') return;
            const d = {costume: costume.id, op: copy(art.op)};
            if (opBytes({d}) > MAX_OP_BYTES - 1024) {
                this.bumpArt(target.id, costume, true);
                return;
            }
            this.record('art.bitmap', target.id, d, {keepPending: true});
            this.bumpArt(target.id, costume, false);
            return;
        }
        if (!Array.isArray(art.shapes)) return;
        const before = this.artPublished.get(costume.id) || null;
        const existing = before ? [...before].map(([id, signature]) => ({id, signature})) : null;
        assignShapeIds({
            costumeId: costume.id,
            shapes: art.shapes,
            items: art.items,
            seeding: !before,
            existing,
            clientId: this.clientId
        });
        const {ops, after, reset} = diffShapes(before, art.shapes);
        this.artPublished.set(costume.id, after);
        if (!ops.length) return;
        const d = {costume: costume.id, ops};
        if (reset) d.reset = true;
        if (art.view) d.view = copy(art.view);
        if (opBytes({d}) > MAX_OP_BYTES - 1024) {
            this.artPublished.delete(costume.id);
            this.bumpArt(target.id, costume, true);
            return;
        }
        this.record('art.vector', target.id, d, {keepPending: true});
        this.bumpArt(target.id, costume, false);
    }

    bumpArt (targetId, costume, forceKeyframe) {
        const held = this.pendingAssets.get(costume.id) || {tg: targetId,
            costumeId: costume.id,
            artOps: 0,
            data: (() => {
                const d = costumeData(costume);
                delete d.name;
                return d;
            })(),
            asset: costume.asset};
        held.artOps++;
        this.pendingAssets.set(costume.id, held);
        if (forceKeyframe || held.artOps >= this.keyframeEvery) {
            Promise.resolve().then(() => {
                if (!this.started) return;
                const c = this.vm.runtime.getTargetById(targetId)?.getCostumes()
                    .find(x => x.id === costume.id);
                if (c) this.holdAsset(targetId, c);
                const h = this.pendingAssets.get(costume.id);
                if (h) h.artOps = Math.max(h.artOps, 1);
                this.closeAssets(costume.id);
            });
        }
    }

    takeBatch (opts = {}) {
        this.closePending();
        this.closeAssets();
        this.checkpointRuntime('flush');
        if (opts.repair !== false && this.shadow && !this.room) this.repair();
        const ops = this.ops;
        this.ops = [];
        const assets = new Map();
        const want = new Set();
        for (const op of ops) collectMd5ext(op, want);
        for (const md5ext of want) {
            const a = this.assetRefs.get(md5ext);
            if (a) assets.set(md5ext, a);
        }
        return {ops, assets, md5exts: [...want]};
    }

    repair () {
        const live = serializeState(this.vm);
        const ops = diffStates(this.shadow, live, {source: 'system', t: this.nextT(), g: `repair:${this.lastT}`});
        if (!ops.length) return 0;
        this.stats.repairs += ops.length;
        this.log.warn(`[rewind] the live project had ${ops.length} change(s) no recorded edit explains; ` +
            `recording them as system repair ops: ${[...new Set(ops.map(o => o.k))].join(', ')}`);
        for (const op of ops) {
            op.t = this.nextT();
            this.commit(op);
        }
        return ops.length;
    }

    unshiftOps (ops) {
        this.ops = ops.concat(this.ops);
    }
}

export const stateMd5exts = state => {
    const out = new Set();
    for (const t of state.targets) {
        for (const c of t.costumes || []) if (c.md5ext) out.add(c.md5ext);
        for (const s of t.sounds || []) if (s.md5ext) out.add(s.md5ext);
    }
    for (const f of state.fonts || []) if (f.md5ext) out.add(f.md5ext);
    return [...out];
};
