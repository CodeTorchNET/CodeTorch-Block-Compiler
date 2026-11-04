export const STATE_VERSION = 1;

export const RUNTIME_TARGET_FIELDS = [
    'x', 'y', 'direction', 'size', 'visible', 'currentCostume', 'volume', 'layerOrder',
    'rotationStyle', 'draggable', 'tempo', 'videoState', 'videoTransparency', 'textToSpeechLanguage'
];

const SPRITE_FIELDS = ['x', 'y', 'direction', 'size', 'rotationStyle', 'visible', 'draggable'];
const STAGE_FIELDS = ['tempo', 'videoState', 'videoTransparency', 'textToSpeechLanguage'];

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const jsonClone = v => (typeof v === 'undefined' ? v : JSON.parse(JSON.stringify(v)));

export const cloneState = state => jsonClone(state);

export const findTarget = (state, id) => {
    if (!state || !Array.isArray(state.targets)) return null;
    for (const t of state.targets) if (t.id === id) return t;
    return null;
};

export const normalizeBlock = b => {
    if (typeof b.next === 'undefined') b.next = null;
    if (typeof b.parent === 'undefined') b.parent = null;
    if (!b.inputs || typeof b.inputs !== 'object') b.inputs = {};
    if (!b.fields || typeof b.fields !== 'object') b.fields = {};
    b.shadow = !!b.shadow;
    b.topLevel = !!b.topLevel;
    return b;
};

const normalizeBlocks = blocks => {
    for (const id of Object.keys(blocks)) {
        const b = blocks[id];
        if (b && typeof b === 'object') {
            if (typeof b.id !== 'string') b.id = id;
            normalizeBlock(b);
        }
    }
    return blocks;
};

const reducedSortOrdering = elts => {
    const sorted = elts.slice(0).sort((a, b) => a - b);
    return elts.map(e => sorted.indexOf(e));
};

const serializeCostume = c => {
    const src = c.broken || c;
    return {
        id: c.id,
        name: c.name,
        assetId: src.assetId,
        dataFormat: (src.dataFormat || '').toLowerCase(),
        md5ext: src.md5 || `${src.assetId}.${(src.dataFormat || '').toLowerCase()}`,
        rotationCenterX: src.rotationCenterX,
        rotationCenterY: src.rotationCenterY,
        bitmapResolution: src.bitmapResolution || 1
    };
};

const serializeSound = s => {
    const src = s.broken || s;
    const out = {
        id: s.id,
        name: s.name,
        assetId: src.assetId,
        dataFormat: (src.dataFormat || '').toLowerCase(),
        md5ext: src.md5 || `${src.assetId}.${(src.dataFormat || '').toLowerCase()}`,
        rate: src.rate,
        sampleCount: src.sampleCount
    };
    if (src.format) out.format = src.format;
    return out;
};

export const CLOUD_VALUE = 0;
export const isCloudVar = v => !!(v && v.isCloud);

const serializeVariable = v => ({
    id: v.id,
    name: v.name,
    type: v.type || '',
    value: v.isCloud ? CLOUD_VALUE : jsonClone(v.value),
    isCloud: !!v.isCloud
});

const serializeComment = c => ({
    id: c.id,
    blockId: c.blockId || null,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    minimized: !!c.minimized,
    text: c.text
});

export const serializeTarget = (target, layerOrder) => {
    const out = {
        id: target.id,
        name: target.isStage ? 'Stage' : target.getName(),
        isStage: !!target.isStage,
        layerOrder: typeof layerOrder === 'number' ? layerOrder :
            (typeof target.layerOrder === 'number' ? target.layerOrder : null),
        currentCostume: target.currentCostume,
        volume: target.volume
    };
    if (target.isStage) {
        for (const k of STAGE_FIELDS) if (typeof target[k] !== 'undefined') out[k] = target[k];
    } else {
        for (const k of SPRITE_FIELDS) out[k] = target[k];
    }
    out.blocks = normalizeBlocks(jsonClone(target.blocks._blocks));
    out.variables = {};
    for (const id of Object.keys(target.variables)) out.variables[id] = serializeVariable(target.variables[id]);
    out.comments = {};
    for (const id of Object.keys(target.comments)) out.comments[id] = serializeComment(target.comments[id]);
    const sprite = target.sprite || {costumes: [], sounds: []};
    out.costumes = (sprite.costumes || []).map(serializeCostume);
    out.sounds = (sprite.sounds || []).map(serializeSound);
    if (target.extensionStorage && Object.keys(target.extensionStorage).length) {
        out.extensionStorage = jsonClone(target.extensionStorage);
    }
    return out;
};

const MONITOR_FIELDS = ['id', 'mode', 'opcode', 'params', 'spriteName', 'targetId', 'width', 'height',
    'x', 'y', 'visible', 'sliderMin', 'sliderMax', 'isDiscrete'];

export const serializeMonitor = monitor => {
    const m = monitor && typeof monitor.toJS === 'function' ? monitor.toJS() : monitor;
    const out = {};
    for (const k of MONITOR_FIELDS) {
        const v = (m && typeof m.get === 'function' && !hasOwn(m, k)) ? m.get(k) : m[k];
        out[k] = typeof v === 'undefined' ? null : jsonClone(v);
    }
    return out;
};

export const serializeMonitors = runtime => {
    const state = runtime.getMonitorState ? runtime.getMonitorState() : runtime._monitorState;
    const out = [];
    if (!state) return out;
    const map = state.map instanceof Map ? state.map : state;
    map.forEach(monitor => out.push(serializeMonitor(monitor)));
    return out;
};

export const serializeExtensions = vm => {
    const em = vm.extensionManager;
    if (!em || !em._loadedExtensions) return [];
    const urls = typeof em.getExtensionURLs === 'function' ? em.getExtensionURLs() : {};
    const out = [];
    for (const id of em._loadedExtensions.keys()) {
        const e = {id};
        if (urls[id]) e.url = urls[id];
        out.push(e);
    }
    return out;
};

export const serializeFonts = runtime => {
    const fm = runtime.fontManager;
    if (!fm || typeof fm.serializeJSON !== 'function') return [];
    return fm.serializeJSON() || [];
};

export const attachArt = (state, source) => {
    for (const t of state.targets) {
        for (const c of t.costumes || []) {
            if (c.dataFormat !== 'svg') continue;
            let doc = null;
            try {
                doc = source(c.id);
            } catch (e) {
                doc = null;
            }
            if (!doc || !Array.isArray(doc.order) || !doc.order.length || !doc.shapes) continue;
            if (!t.art) t.art = {};
            t.art[c.id] = {order: doc.order.slice(), shapes: jsonClone(doc.shapes)};
        }
    }
    return state;
};

export const serializeState = (vm, opts = {}) => {
    const runtime = vm.runtime;
    const originals = runtime.targets.filter(t => t.isOriginal);
    let layers = null;
    if (runtime.renderer && originals.every(t => typeof t.getLayerOrder === 'function')) {
        const orders = originals.map(t => t.getLayerOrder());
        if (orders.every(o => typeof o === 'number')) layers = reducedSortOrdering(orders);
    }
    const state = {
        v: STATE_VERSION,
        t: typeof opts.t === 'number' ? opts.t : Date.now(),
        session: opts.session || null,
        room: opts.room || null,
        targets: originals.map((t, i) => serializeTarget(t, layers ? layers[i] : null)),
        monitors: serializeMonitors(runtime),
        extensions: serializeExtensions(vm),
        fonts: serializeFonts(runtime),
        meta: {}
    };
    if (runtime.extensionStorage && Object.keys(runtime.extensionStorage).length) {
        state.meta.extensionStorage = jsonClone(runtime.extensionStorage);
    }
    if (typeof opts.art === 'function') attachArt(state, opts.art);
    return state;
};

export const readRuntimeFields = state => {
    const targets = {};
    for (const t of state.targets) {
        const entry = {vars: {}};
        for (const k of RUNTIME_TARGET_FIELDS) if (hasOwn(t, k)) entry[k] = t[k];
        for (const id of Object.keys(t.variables || {})) {
            const v = t.variables[id];
            if (v.type === 'broadcast_msg' || v.isCloud) continue;
            entry.vars[id] = v.value;
        }
        targets[t.id] = entry;
    }
    return {targets};
};

export const readRuntimeFieldsFromVm = vm => {
    const runtime = vm.runtime;
    const originals = runtime.targets.filter(t => t.isOriginal);
    let layers = null;
    if (runtime.renderer && originals.every(t => typeof t.getLayerOrder === 'function')) {
        const orders = originals.map(t => t.getLayerOrder());
        if (orders.every(o => typeof o === 'number')) layers = reducedSortOrdering(orders);
    }
    const targets = {};
    originals.forEach((t, i) => {
        const entry = {vars: {}};
        entry.layerOrder = layers ? layers[i] : (typeof t.layerOrder === 'number' ? t.layerOrder : null);
        entry.currentCostume = t.currentCostume;
        entry.volume = t.volume;
        const keys = t.isStage ? STAGE_FIELDS : SPRITE_FIELDS;
        for (const k of keys) if (typeof t[k] !== 'undefined') entry[k] = t[k];
        for (const id of Object.keys(t.variables)) {
            const v = t.variables[id];
            if (v.type === 'broadcast_msg' || v.isCloud) continue;
            entry.vars[id] = jsonClone(v.value);
        }
        targets[t.id] = entry;
    });
    return {targets};
};

const INPUT_SAME_BLOCK_SHADOW = 1;
const INPUT_BLOCK_NO_SHADOW = 2;
const INPUT_DIFF_BLOCK_SHADOW = 3;

const blockToSb3 = block => {
    const obj = {
        opcode: block.opcode,
        next: typeof block.next === 'undefined' ? null : block.next,
        parent: typeof block.parent === 'undefined' ? null : block.parent,
        inputs: {},
        fields: {},
        shadow: !!block.shadow,
        topLevel: !!block.topLevel
    };
    for (const name of Object.keys(block.inputs || {})) {
        const input = block.inputs[name];
        if (!input) continue;
        const b = typeof input.block === 'undefined' ? null : input.block;
        const s = typeof input.shadow === 'undefined' ? null : input.shadow;
        if (b === s) obj.inputs[name] = [INPUT_SAME_BLOCK_SHADOW, b];
        else if (s === null) obj.inputs[name] = [INPUT_BLOCK_NO_SHADOW, b];
        else obj.inputs[name] = [INPUT_DIFF_BLOCK_SHADOW, b, s];
    }
    for (const name of Object.keys(block.fields || {})) {
        const f = block.fields[name];
        obj.fields[name] = [f.value];
        if (hasOwn(f, 'id')) obj.fields[name].push(f.id);
    }
    if (block.topLevel) {
        obj.x = block.x ? block.x : 0;
        obj.y = block.y ? block.y : 0;
    }
    if (block.mutation) obj.mutation = block.mutation;
    if (block.comment) obj.comment = block.comment;
    return obj;
};

export const targetToSb3 = t => {
    const obj = {
        isStage: !!t.isStage,
        name: t.isStage ? 'Stage' : t.name,
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: t.currentCostume,
        costumes: t.costumes.map(c => ({
            name: c.name,
            bitmapResolution: c.bitmapResolution,
            dataFormat: c.dataFormat,
            assetId: c.assetId,
            md5ext: c.md5ext,
            rotationCenterX: c.rotationCenterX,
            rotationCenterY: c.rotationCenterY
        })),
        sounds: t.sounds.map(s => {
            const o = {
                name: s.name,
                assetId: s.assetId,
                dataFormat: s.dataFormat,
                rate: s.rate,
                sampleCount: s.sampleCount,
                md5ext: s.md5ext
            };
            if (s.format) o.format = s.format;
            return o;
        }),
        volume: t.volume
    };
    if (typeof t.layerOrder === 'number') obj.layerOrder = t.layerOrder;
    for (const id of Object.keys(t.variables || {})) {
        const v = t.variables[id];
        if (v.type === 'list') obj.lists[id] = [v.name, jsonClone(v.value)];
        else if (v.type === 'broadcast_msg') obj.broadcasts[id] = v.name;
        else obj.variables[id] = v.isCloud ? [v.name, CLOUD_VALUE, true] : [v.name, jsonClone(v.value)];
    }
    for (const id of Object.keys(t.blocks || {})) obj.blocks[id] = blockToSb3(t.blocks[id]);
    for (const id of Object.keys(t.comments || {})) {
        const c = t.comments[id];
        obj.comments[id] = {
            blockId: c.blockId || null,
            x: c.x,
            y: c.y,
            width: c.width,
            height: c.height,
            minimized: !!c.minimized,
            text: c.text
        };
    }
    if (t.isStage) {
        for (const k of STAGE_FIELDS) if (hasOwn(t, k)) obj[k] = t[k];
    } else {
        for (const k of SPRITE_FIELDS) if (hasOwn(t, k)) obj[k] = t[k];
    }
    if (t.extensionStorage) obj.extensionStorage = jsonClone(t.extensionStorage);
    return obj;
};

const CORE_EXTENSIONS = ['argument', 'colour', 'control', 'data', 'event', 'looks', 'math', 'motion',
    'operator', 'procedures', 'sensing', 'sound'];

export const stateToSb3 = state => {
    const extensionIds = [];
    const extensionURLs = {};
    for (const e of state.extensions || []) {
        if (CORE_EXTENSIONS.includes(e.id)) continue;
        extensionIds.push(e.id);
        if (e.url) extensionURLs[e.id] = e.url;
    }
    const project = {
        targets: state.targets.map(targetToSb3),
        monitors: (state.monitors || []).map(m => {
            const o = {
                id: m.id,
                mode: m.mode,
                opcode: m.opcode,
                params: jsonClone(m.params) || {},
                spriteName: m.spriteName,
                value: m.mode === 'list' ? [] : 0,
                width: m.width,
                height: m.height,
                x: m.x,
                y: m.y,
                visible: m.visible
            };
            if (m.mode !== 'list') {
                o.sliderMin = m.sliderMin;
                o.sliderMax = m.sliderMax;
                o.isDiscrete = m.isDiscrete;
            }
            return o;
        }),
        extensions: extensionIds,
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    };
    if (Object.keys(extensionURLs).length) project.extensionURLs = extensionURLs;
    if (state.fonts && state.fonts.length) project.customFonts = jsonClone(state.fonts);
    if (state.meta && state.meta.extensionStorage) project.extensionStorage = jsonClone(state.meta.extensionStorage);
    return project;
};

const adoptAssetIds = (target, kind, ids) => {
    const sprite = target.sprite;
    if (!sprite || !Array.isArray(sprite[kind]) || sprite[kind].length !== ids.length) return;
    sprite[kind] = sprite[kind].map((asset, i) => (ids[i] ? Object.assign({}, asset, {id: ids[i]}) : asset));
};

export const loadStateIntoVm = async (vm, state, additionalInfo) => {
    await vm.loadProject(stateToSb3(state), additionalInfo);
    const originals = vm.runtime.targets.filter(t => t.isOriginal);
    if (originals.length !== state.targets.length) {
        throw new Error(`rewind: loaded ${originals.length} targets for a state with ${state.targets.length}`);
    }
    originals.forEach((target, i) => {
        const st = state.targets[i];
        vm.runtime.updateTargetId(target, st.id);
        adoptAssetIds(target, 'costumes', st.costumes.map(c => c.id));
        adoptAssetIds(target, 'sounds', st.sounds.map(s => s.id));
    });
};

const round = (n, digits = 6) => {
    if (typeof n !== 'number' || !isFinite(n)) return n;
    const f = Math.pow(10, digits);
    const r = Math.round(n * f) / f;
    return Object.is(r, -0) ? 0 : r;
};

const sortKeys = obj => {
    if (Array.isArray(obj)) return obj.map(sortKeys);
    if (obj === null || typeof obj !== 'object') return obj;
    const out = {};
    for (const k of Object.keys(obj).sort()) {
        if (typeof obj[k] === 'undefined') continue;
        out[k] = sortKeys(obj[k]);
    }
    return out;
};

const stable = v => JSON.stringify(sortKeys(v));

export const artSignature = doc => {
    if (!doc || !Array.isArray(doc.order) || !doc.shapes) return null;
    const list = doc.order.filter(id => doc.shapes[id]).map(id => {
        const sh = doc.shapes[id];
        return [sh.tag, sh.attrs, sh.kids, sh.text, sh.defs];
    });
    return list.length ? stable(list) : null;
};

const costumeArt = (t, c) => (t && t.art && c ? artSignature(t.art[c.id]) : null);

export const sharedArtKeys = (a, b) => {
    const keys = new Set();
    const n = Math.min(a.targets.length, b.targets.length);
    for (let i = 0; i < n; i++) {
        const ta = a.targets[i];
        const tb = b.targets[i];
        const m = Math.min((ta.costumes || []).length, (tb.costumes || []).length);
        for (let j = 0; j < m; j++) {
            if (costumeArt(ta, ta.costumes[j]) && costumeArt(tb, tb.costumes[j])) keys.add(`${i}/${j}`);
        }
    }
    return keys;
};

export const sameCostumePicture = (ta, ca, tb, cb) => {
    const x = costumeArt(ta, ca);
    const y = costumeArt(tb, cb);
    if (x && y) return x === y;
    return ca.md5ext === cb.md5ext;
};

const canonValue = v => {
    if (typeof v === 'number') return round(v);
    if (Array.isArray(v)) return v.map(canonValue);
    return v;
};

const canonComment = c => (c ? {
    x: round(c.x, 0),
    y: round(c.y, 0),
    width: round(c.width, 0),
    height: round(c.height, 0),
    minimized: !!c.minimized,
    text: c.text
} : null);

const canonBlocks = (blocks, comments) => {
    const seen = new Set();
    const canonOne = (id, depth) => {
        if (id === null || typeof id === 'undefined') return null;
        const b = blocks[id];
        if (!b) return {missing: true};
        if (seen.has(id) || depth > 500) return {cycle: true};
        seen.add(id);
        const out = {op: b.opcode};
        if (b.shadow) out.sh = true;
        const fields = {};
        for (const name of Object.keys(b.fields || {}).sort()) {
            const f = b.fields[name];
            const cf = {v: (f.value === null || typeof f.value === 'undefined') ? null : String(f.value)};
            if (hasOwn(f, 'id') && f.id !== null && typeof f.id !== 'undefined') cf.id = f.id;
            fields[name] = cf;
        }
        if (Object.keys(fields).length) out.f = fields;
        if (b.mutation) out.m = sortKeys(b.mutation);
        if (b.comment) out.cm = canonComment(comments && comments[b.comment]);
        const inputs = {};
        for (const name of Object.keys(b.inputs || {}).sort()) {
            const input = b.inputs[name];
            if (!input) continue;
            const ci = {};
            if (input.block !== null && typeof input.block !== 'undefined') ci.b = canonOne(input.block, depth + 1);
            if (input.shadow !== null && typeof input.shadow !== 'undefined') {
                ci.s = input.shadow === input.block ? 'same' : canonOne(input.shadow, depth + 1);
            }
            inputs[name] = ci;
        }
        if (Object.keys(inputs).length) out.in = inputs;
        if (b.next) {
            const chain = [];
            let nextId = b.next;
            while (nextId) {
                const nb = blocks[nextId];
                if (!nb || seen.has(nextId)) {
                    chain.push(nb ? {cycle: true} : {missing: true});
                    break;
                }
                const nextNext = nb.next;
                const saved = nb.next;
                nb.next = null;
                try {
                    chain.push(canonOne(nextId, depth + 1));
                } finally {
                    nb.next = saved;
                }
                nextId = nextNext;
            }
            out.nx = chain;
        }
        return out;
    };
    const scripts = [];
    blocks = Object.assign({}, blocks);
    for (const id of Object.keys(blocks)) blocks[id] = Object.assign({}, blocks[id]);
    const ids = Object.keys(blocks);
    for (const id of ids) {
        const b = blocks[id];
        if (!b.topLevel) continue;
        const s = canonOne(id, 0);
        s.x = round(b.x || 0, 0);
        s.y = round(b.y || 0, 0);
        scripts.push(stable(s));
    }
    const orphans = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        const b = blocks[id];
        orphans.push(stable({op: b.opcode, sh: !!b.shadow, parentKnown: !!(b.parent && blocks[b.parent])}));
    }
    scripts.sort();
    orphans.sort();
    return {scripts, orphans};
};

const canonTarget = (t, ti, artKeys) => {
    const out = {
        name: t.isStage ? 'Stage' : t.name,
        isStage: !!t.isStage,
        layerOrder: typeof t.layerOrder === 'number' ? t.layerOrder : null,
        currentCostume: t.currentCostume,
        volume: round(t.volume)
    };
    if (t.isStage) {
        for (const k of STAGE_FIELDS) if (hasOwn(t, k)) out[k] = canonValue(t[k]);
    } else {
        for (const k of SPRITE_FIELDS) if (hasOwn(t, k)) out[k] = canonValue(t[k]);
    }
    out.blocks = canonBlocks(t.blocks || {}, t.comments || {});
    out.variables = {};
    for (const id of Object.keys(t.variables || {}).sort()) {
        const v = t.variables[id];
        const value = v.isCloud ? null : canonValue(v.value);
        out.variables[id] = {name: v.name, type: v.type || '', value, isCloud: !!v.isCloud};
    }
    out.comments = Object.values(t.comments || {})
        .filter(c => !c.blockId)
        .map(c => stable(canonComment(c)))
        .sort();
    out.costumes = (t.costumes || []).map((c, ci) => ({
        name: c.name,
        [artKeys && artKeys.has(`${ti}/${ci}`) ? 'art' : 'md5ext']:
            artKeys && artKeys.has(`${ti}/${ci}`) ? costumeArt(t, c) : c.md5ext,
        dataFormat: c.dataFormat,
        rotationCenterX: round(c.rotationCenterX, 3),
        rotationCenterY: round(c.rotationCenterY, 3),
        bitmapResolution: c.bitmapResolution || 1
    }));
    out.sounds = (t.sounds || []).map(s => ({
        name: s.name,
        md5ext: s.md5ext,
        dataFormat: s.dataFormat,
        rate: s.rate,
        sampleCount: s.sampleCount
    }));
    if (t.extensionStorage) out.extensionStorage = sortKeys(t.extensionStorage);
    return out;
};

const usedExtensionIds = state => {
    const used = new Set();
    for (const t of state.targets) {
        for (const id of Object.keys(t.blocks || {})) {
            const op = t.blocks[id].opcode || '';
            const i = op.indexOf('_');
            if (i > 0) used.add(op.slice(0, i));
        }
    }
    for (const m of state.monitors || []) {
        const op = m.opcode || '';
        const i = op.indexOf('_');
        if (i > 0) used.add(op.slice(0, i));
    }
    return used;
};

export const canonicalize = (state, opts = {}) => {
    const artKeys = opts.artKeys || null;
    const targetNames = {};
    for (const t of state.targets) targetNames[t.id] = t.isStage ? 'Stage' : t.name;
    const used = usedExtensionIds(state);
    const monitors = {};
    for (const m of state.monitors || []) {
        const spriteName = m.spriteName || (m.targetId && targetNames[m.targetId]) || null;
        const key = stable({opcode: m.opcode, params: m.params, sprite: spriteName});
        monitors[key] = sortKeys({
            mode: m.mode,
            visible: !!m.visible,
            x: round(m.x, 0),
            y: round(m.y, 0),
            width: round(m.width, 0),
            height: round(m.height, 0),
            sliderMin: m.mode === 'list' ? null : m.sliderMin,
            sliderMax: m.mode === 'list' ? null : m.sliderMax,
            isDiscrete: m.mode === 'list' ? null : m.isDiscrete
        });
    }
    return sortKeys({
        v: state.v,
        targets: state.targets.map((t, i) => canonTarget(t, i, artKeys)),
        monitors,
        extensions: (state.extensions || [])
            .filter(e => used.has(e.id) && !CORE_EXTENSIONS.includes(e.id))
            .map(e => stable({id: e.id, url: e.url || null}))
            .sort(),
        fonts: (state.fonts || []).map(f => stable(f)).sort(),
        extensionStorage: (state.meta && state.meta.extensionStorage) || null
    });
};

export const equalCanonical = (a, b) => {
    const artKeys = sharedArtKeys(a, b);
    return stable(canonicalize(a, {artKeys})) === stable(canonicalize(b, {artKeys}));
};

const diffValues = (a, b, path, out, limit) => {
    if (out.length >= limit) return;
    if (a === b) return;
    const ta = Array.isArray(a) ? 'array' : (a === null ? 'null' : typeof a);
    const tb = Array.isArray(b) ? 'array' : (b === null ? 'null' : typeof b);
    if (ta !== tb || (ta !== 'object' && ta !== 'array')) {
        const show = v => {
            const s = JSON.stringify(v);
            return s && s.length > 160 ? `${s.slice(0, 157)}...` : s;
        };
        out.push(`${path || '/'}: ${show(a)} != ${show(b)}`);
        return;
    }
    if (ta === 'array') {
        if (a.every(x => typeof x === 'string') && b.every(x => typeof x === 'string')) {
            const sa = new Set(a);
            const sb = new Set(b);
            for (const x of a) {
                if (!sb.has(x) && out.length < limit) {
                    out.push(`${path}: only in a: ${x.length > 200 ? `${x.slice(0, 197)}...` : x}`);
                }
            }
            for (const x of b) {
                if (!sa.has(x) && out.length < limit) {
                    out.push(`${path}: only in b: ${x.length > 200 ? `${x.slice(0, 197)}...` : x}`);
                }
            }
            return;
        }
        if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
        for (let i = 0; i < Math.min(a.length, b.length); i++) diffValues(a[i], b[i], `${path}/${i}`, out, limit);
        return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if (!hasOwn(a, k)) out.push(`${path}/${k}: missing in a`);
        else if (hasOwn(b, k)) diffValues(a[k], b[k], `${path}/${k}`, out, limit);
        else out.push(`${path}/${k}: missing in b`);
        if (out.length >= limit) return;
    }
};

export const diffCanonical = (a, b, limit = 50) => {
    const out = [];
    const artKeys = sharedArtKeys(a, b);
    diffValues(canonicalize(a, {artKeys}), canonicalize(b, {artKeys}), '', out, limit);
    return out;
};
