import {makeOp} from './ops.js';
import {readRuntimeFields, sameCostumePicture} from './state.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const stableStringify = v => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(x => (typeof x === 'undefined' ? 'null' : stableStringify(x))).join(',')}]`;
    const keys = Object.keys(v).filter(k => typeof v[k] !== 'undefined')
        .sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
};
const same = (a, b) => a === b || stableStringify(a) === stableStringify(b);
const copy = v => (typeof v === 'undefined' ? v : JSON.parse(JSON.stringify(v)));

const PROP_KEYS = ['x', 'y', 'direction', 'size', 'rotationStyle', 'visible', 'draggable', 'currentCostume',
    'volume', 'layerOrder', 'tempo', 'videoState', 'videoTransparency', 'textToSpeechLanguage'];

const matchTargets = (from, to) => {
    const pairs = new Map();
    const usedFrom = new Set();
    const fromById = new Map(from.targets.map(t => [t.id, t]));
    for (const t of to.targets) {
        const f = fromById.get(t.id);
        if (f) {
            pairs.set(t, f);
            usedFrom.add(f);
        }
    }
    for (const t of to.targets) {
        if (pairs.has(t) || !t.isStage) continue;
        const f = from.targets.find(x => x.isStage && !usedFrom.has(x));
        if (f) {
            pairs.set(t, f);
            usedFrom.add(f);
        }
    }
    for (const t of to.targets) {
        if (pairs.has(t)) continue;
        const f = from.targets.find(x => !x.isStage && !usedFrom.has(x) && x.name === t.name);
        if (f) {
            pairs.set(t, f);
            usedFrom.add(f);
        }
    }
    return {pairs, usedFrom};
};

const diffAssets = (kind, keys, fromList, toList, tg, push, samePicture = null) => {
    const pairs = new Map();
    const used = new Set();
    const byId = new Map(fromList.map(x => [x.id, x]));
    for (const a of toList) {
        const f = byId.get(a.id);
        if (f) {
            pairs.set(a, f);
            used.add(f);
        }
    }
    for (const a of toList) {
        if (pairs.has(a)) continue;
        const f = fromList.find(x => !used.has(x) && x.name === a.name);
        if (f) {
            pairs.set(a, f);
            used.add(f);
        }
    }
    const pick = x => {
        const o = {};
        for (const k of keys) if (hasOwn(x, k)) o[k] = copy(x[k]);
        return o;
    };
    let working = fromList.map(x => x.id);
    toList.forEach(a => {
        if (pairs.has(a)) return;
        let id = a.id;
        if (fromList.some(x => x.id === id)) id = `${id}-r`;
        push(`${kind}.add`, tg, {id, data: pick(a), index: working.length});
        working.push(id);
        pairs.set(a, {id, __new: true});
    });
    for (const a of toList) {
        const f = pairs.get(a);
        if (f.__new) continue;
        const data = {};
        const skip = samePicture && samePicture(f, a) && f.md5ext !== a.md5ext ? ['md5ext', 'assetId'] : [];
        for (const k of keys) {
            if (skip.includes(k)) continue;
            if (hasOwn(a, k) && !same(a[k], f[k])) data[k] = copy(a[k]);
        }
        if (Object.keys(data).length) push(`${kind}.update`, tg, {id: f.id, data});
    }
    for (const f of fromList) {
        if (used.has(f)) continue;
        push(`${kind}.delete`, tg, {id: f.id});
        working = working.filter(id => id !== f.id);
    }
    const order = toList.map(a => pairs.get(a).id);
    if (!same(order, working)) push(`${kind}.reorder`, tg, {order});
};

/**
 * Ops that add a whole target.
 * @param {object} target RewindState target
 * @param {Function} push push
 * @param {object} [extra] extra
 */
export const pushTargetAdd = (target, push, extra = {}) => {
    const nt = copy(target);
    const blocks = nt.blocks || {};
    nt.blocks = {};
    push('target.add', null, Object.assign({target: nt}, extra));
    const ids = Object.keys(blocks);
    for (let i = 0; i < ids.length; i += 200) {
        const chunk = {};
        for (const id of ids.slice(i, i + 200)) chunk[id] = blocks[id];
        push('blocks.add', nt.id, {blocks: chunk});
    }
};

const diffTargetContent = (f, t, push) => {
    const tg = f.id;
    const fb = f.blocks || {};
    const tb = t.blocks || {};
    const adds = {};
    const updates = [];
    for (const id of Object.keys(fb)) {
        if (!hasOwn(tb, id)) {
            push('blocks.delete', tg, {id, raw: true});
            continue;
        }
        const a = fb[id];
        const b = tb[id];
        if (same(a, b)) continue;
        const removedKey = Object.keys(a).some(k => !hasOwn(b, k) || typeof b[k] === 'undefined');
        if (removedKey) {
            push('blocks.delete', tg, {id, raw: true});
            adds[id] = copy(b);
            continue;
        }
        const props = {};
        for (const k of Object.keys(b)) if (!same(a[k], b[k])) props[k] = copy(b[k]);
        updates.push({id, props});
    }
    for (const id of Object.keys(tb)) if (!hasOwn(fb, id)) adds[id] = copy(tb[id]);
    const addIds = Object.keys(adds);
    for (let i = 0; i < addIds.length; i += 200) {
        const chunk = {};
        for (const id of addIds.slice(i, i + 200)) chunk[id] = adds[id];
        push('blocks.add', tg, {blocks: chunk});
    }
    for (const u of updates) push('blocks.update', tg, u);

    const fv = f.variables || {};
    const tv = t.variables || {};
    for (const id of Object.keys(fv)) {
        if (!hasOwn(tv, id) || (tv[id].type || '') !== (fv[id].type || '')) push('var.delete', tg, {id});
    }
    for (const id of Object.keys(tv)) {
        const v = tv[id];
        if (!hasOwn(fv, id) || (fv[id].type || '') !== (v.type || '')) {
            const data = v.isCloud ? {name: v.name, isCloud: true} :
                {name: v.name, value: copy(v.value), isCloud: false};
            push('var.add', tg, {id, type: v.type || '', data});
            continue;
        }
        const data = {};
        const keys = (v.isCloud || fv[id].isCloud) ? ['name', 'isCloud'] : ['name', 'value', 'isCloud'];
        for (const k of keys) if (!same(fv[id][k], v[k])) data[k] = copy(v[k]);
        if (Object.keys(data).length) push('var.update', tg, {id, type: v.type || '', data});
    }

    const fc = f.comments || {};
    const tc = t.comments || {};
    for (const id of Object.keys(fc)) if (!hasOwn(tc, id)) push('comment.delete', tg, {id});
    for (const id of Object.keys(tc)) {
        const c = tc[id];
        if (!hasOwn(fc, id)) {
            push('comment.add', tg, {id, data: copy(c)});
            continue;
        }
        const data = {};
        for (const k of ['x', 'y', 'width', 'height', 'minimized', 'text', 'blockId']) {
            if (!same(fc[id][k], c[k])) data[k] = copy(c[k]);
        }
        if (Object.keys(data).length) push('comment.update', tg, {id, data});
    }

    diffAssets('costume', ['name', 'assetId', 'dataFormat', 'md5ext', 'rotationCenterX', 'rotationCenterY',
        'bitmapResolution'], f.costumes || [], t.costumes || [], tg, push,
    (from, to) => sameCostumePicture(f, from, t, to));
    diffAssets('sound', ['name', 'assetId', 'dataFormat', 'md5ext', 'rate', 'sampleCount', 'format'],
        f.sounds || [], t.sounds || [], tg, push);

    const props = {};
    for (const k of PROP_KEYS) if (hasOwn(t, k) && !same(f[k], t[k])) props[k] = copy(t[k]);
    if (Object.keys(props).length) push('target.props', tg, props);
    if (!t.isStage && f.name !== t.name) push('target.rename', tg, {name: t.name});
};

/**
 * @param {object} from RewindState
 * @param {object} to RewindState
 * @param {object} [opts] opts
 * @returns {Array<object>} ops
 */
export const diffStates = (from, to, opts = {}) => {
    const ops = [];
    const t0 = typeof opts.t === 'number' ? opts.t : Date.now();
    const push = (k, tg, d) => {
        ops.push(makeOp(k, tg, d, {source: opts.source || 'restore', actor: opts.actor, t: t0, g: opts.g}));
    };
    const {pairs, usedFrom} = matchTargets(from, to);

    for (const f of from.targets) {
        if (!usedFrom.has(f)) push('target.delete', f.id, {id: f.id});
    }
    const resultIds = [];
    const appended = [];
    to.targets.forEach(t => {
        const f = pairs.get(t);
        if (f) {
            resultIds.push(f.id);
            return;
        }
        pushTargetAdd(t, push);
        resultIds.push(t.id);
        appended.push(t.id);
    });
    to.targets.forEach(t => {
        const f = pairs.get(t);
        if (f) diffTargetContent(f, t, push);
    });
    const kept = from.targets.filter(f => usedFrom.has(f)).map(f => f.id);
    const simulated = kept.concat(appended);
    if (!same(simulated, resultIds)) push('target.order', null, {order: resultIds});

    const fm = new Map((from.monitors || []).map(m => [m.id, m]));
    const tm = new Map((to.monitors || []).map(m => [m.id, m]));
    const monitors = {};
    for (const [id] of fm) if (!tm.has(id)) monitors[id] = null;
    for (const [id, m] of tm) if (!fm.has(id) || !same(fm.get(id), m)) monitors[id] = copy(m);
    if (Object.keys(monitors).length) push('monitor.set', null, {monitors});

    const fe = new Set((from.extensions || []).map(e => e.id));
    const te = new Set((to.extensions || []).map(e => e.id));
    for (const e of to.extensions || []) {
        if (!fe.has(e.id)) push('ext.add', null, e.url ? {id: e.id, url: e.url} : {id: e.id});
    }
    for (const e of from.extensions || []) if (!te.has(e.id)) push('ext.remove', null, {id: e.id});

    const ff = new Map((from.fonts || []).map(x => [x.family.toLowerCase(), x]));
    const tf = new Map((to.fonts || []).map(x => [x.family.toLowerCase(), x]));
    for (const [fam, x] of ff) if (!tf.has(fam)) push('font.delete', null, {family: x.family});
    for (const [fam, x] of tf) if (!ff.has(fam) || !same(ff.get(fam), x)) push('font.add', null, copy(x));

    return ops;
};

/**
 * @param {object} a a
 * @param {object} b b
 * @returns {?object} runtime.state payload, null when nothing changed
 */
export const diffRuntime = (a, b) => {
    const targets = {};
    for (const id of Object.keys(b.targets)) {
        const before = a.targets[id];
        if (!before) continue;
        const after = b.targets[id];
        const entry = {};
        for (const k of Object.keys(after)) {
            if (k === 'vars') continue;
            if (!same(before[k], after[k])) entry[k] = copy(after[k]);
        }
        const vars = {};
        for (const varId of Object.keys(after.vars)) {
            if (!hasOwn(before.vars, varId)) continue;
            if (!same(before.vars[varId], after.vars[varId])) vars[varId] = copy(after.vars[varId]);
        }
        if (Object.keys(vars).length) entry.vars = vars;
        if (Object.keys(entry).length) targets[id] = entry;
    }
    return Object.keys(targets).length ? {targets} : null;
};

export {readRuntimeFields};
