import {makeOp, opBytes, MAX_OP_BYTES, uuidv4} from './ops.js';
import {serializeState, targetToSb3, diffCanonical, normalizeBlock} from './state.js';
import {diffStates} from './diff.js';
import {muteCloud, resyncCloud} from '../cloud-mute.js';

import {loadCostume} from 'scratch-vm/src/import/load-costume.js';
import {loadSound} from 'scratch-vm/src/import/load-sound.js';
import MonitorRecord from 'scratch-vm/src/engine/monitor-record';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const copy = v => (typeof v === 'undefined' ? v : JSON.parse(JSON.stringify(v)));

const setPath = (obj, path, value) => {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        if (cur[path[i]] === null || typeof cur[path[i]] !== 'object') cur[path[i]] = {};
        cur = cur[path[i]];
    }
    cur[path[path.length - 1]] = value;
};

const applyProps = (block, props) => {
    for (const key of Object.keys(props)) {
        const value = copy(props[key]);
        if (key.charCodeAt(0) === 91) {
            try {
                const path = JSON.parse(key);
                if (Array.isArray(path) && path.length) {
                    setPath(block, path, value);
                    continue;
                }
            } catch (e) {
                // plain key
            }
        }
        block[key] = value;
    }
};

const withId = (obj, id) => {
    const out = Object.assign({}, obj);
    Object.defineProperty(out, 'id', {value: id, writable: true, enumerable: true, configurable: true});
    return out;
};

const loadCostumeObject = async (runtime, data, id) => {
    const costume = {
        name: data.name,
        assetId: data.assetId,
        dataFormat: data.dataFormat,
        md5: data.md5ext,
        rotationCenterX: data.rotationCenterX,
        rotationCenterY: data.rotationCenterY,
        bitmapResolution: data.bitmapResolution || 1,
        skinId: null
    };
    const loaded = await loadCostume(data.md5ext, costume, runtime);
    if (!loaded || !loaded.asset) throw new Error(`costume asset ${data.md5ext} could not be loaded`);
    return withId(loaded, id);
};

const loadSoundObject = async (runtime, target, data, id) => {
    const sound = {
        name: data.name,
        assetId: data.assetId,
        dataFormat: data.dataFormat,
        md5: data.md5ext,
        rate: data.rate,
        sampleCount: data.sampleCount,
        format: data.format || '',
        data: null
    };
    const loaded = await loadSound(sound, runtime, target.sprite.soundBank);
    if (!loaded || !loaded.asset) throw new Error(`sound asset ${data.md5ext} could not be loaded`);
    return withId(loaded, id);
};

const soundMeta = s => ({
    name: s.name,
    assetId: s.assetId,
    dataFormat: s.dataFormat,
    md5ext: s.md5,
    rate: s.rate,
    sampleCount: s.sampleCount,
    format: s.format
});

const applyTargetProps = (vm, target, props, opts = {}) => {
    if (!target) return;
    const info = {};
    for (const k of ['x', 'y', 'direction', 'draggable', 'rotationStyle', 'visible', 'size']) {
        if (hasOwn(props, k)) info[k] = props[k];
    }
    if (Object.keys(info).length && !target.isStage) {
        if (opts.silent) {
            if (hasOwn(info, 'x') || hasOwn(info, 'y')) {
                target.setXY(hasOwn(info, 'x') ? info.x : target.x, hasOwn(info, 'y') ? info.y : target.y, true);
            }
            if (hasOwn(info, 'direction')) target.setDirection(info.direction);
            if (hasOwn(info, 'draggable')) target.setDraggable(info.draggable);
            if (hasOwn(info, 'rotationStyle')) target.setRotationStyle(info.rotationStyle);
            if (hasOwn(info, 'visible')) target.setVisible(info.visible);
            if (hasOwn(info, 'size')) target.setSize(info.size);
        } else {
            target.postSpriteInfo(Object.assign({force: true}, info));
        }
    }
    if (hasOwn(props, 'currentCostume')) {
        target.setCostume(props.currentCostume);
        if (!opts.silent) {
            vm.runtime.emitTargetSimplePropertyChanged([
                [target.originalTargetId, {currentCostume: target.currentCostume}]
            ]);
        }
    }
    if (hasOwn(props, 'volume')) target.volume = props.volume;
    for (const k of ['tempo', 'videoState', 'videoTransparency', 'textToSpeechLanguage']) {
        if (hasOwn(props, k)) target[k] = props[k];
    }
    if (hasOwn(props, 'layerOrder') && typeof props.layerOrder === 'number') {
        if (typeof target.getLayerOrder === 'function' && typeof target.getLayerOrder() === 'number') {
            const now = vm.runtime.targets.filter(t => t.isOriginal && !t.isStage);
            const ranks = now.map(t => t.getLayerOrder()).sort((a, b) => a - b);
            const want = ranks[Math.max(0, Math.min(ranks.length - 1, props.layerOrder - 1))];
            if (typeof want === 'number') target.goBackwardLayers(target.getLayerOrder() - want);
        } else {
            target.layerOrder = props.layerOrder;
        }
    }
};

const emitBlocks = (runtime, targetId, change) => runtime.emitTargetBlocksChanged(targetId, change);

/**
 * Apply ops to a live VM.
 * @param {object} vm VirtualMachine
 * @param {Array<object>} ops ops
 * @param {object} [opts] options
 * @returns {Promise<{broken: Array<object>}>} what could not be applied
 */
export const applyOpsToVm = async (vm, ops, opts = {}) => {
    const runtime = vm.runtime;
    const broken = [];
    const touchedEditing = {blocks: false};
    const get = id => runtime.getTargetById(id);
    for (const op of ops) {
        const d = op.d;
        const target = op.tg ? get(op.tg) : null;
        if (op.tg && !target && op.k !== 'target.delete') {
            broken.push({op: op.k, tg: op.tg, why: 'no such target'});
            continue;
        }
        if (target && vm.editingTarget === target && op.k.startsWith('blocks.')) touchedEditing.blocks = true;
        switch (op.k) {
        case 'blocks.add': {
            const added = [];
            for (const id of Object.keys(d.blocks)) {
                const b = normalizeBlock(Object.assign(copy(d.blocks[id]), {id}));
                if (target.blocks._blocks[id]) {
                    if (!d.replace) continue;
                    target.blocks._blocks[id] = b;
                    if (b.topLevel) target.blocks._addScript(id);
                    else target.blocks._deleteScript(id);
                } else {
                    target.blocks.createBlock(b);
                }
                added.push(target.blocks._blocks[id]);
            }
            target.blocks.resetCache();
            if (added.length) emitBlocks(runtime, target.originalTargetId, ['add', added]);
            break;
        }
        case 'blocks.delete':
            if (!target.blocks._blocks[d.id]) break;
            if (d.raw) {
                delete target.blocks._blocks[d.id];
                target.blocks._deleteScript(d.id);
                target.blocks.resetCache();
                emitBlocks(runtime, target.originalTargetId, ['delete', d.id]);
            } else {
                target.blocks.deleteBlock(d.id, {source: 'default', targetId: target.originalTargetId});
            }
            break;
        case 'blocks.update': {
            const b = target.blocks._blocks[d.id];
            if (!b) {
                broken.push({op: op.k, id: d.id, why: 'no such block'});
                break;
            }
            applyProps(b, d.props);
            if (hasOwn(d.props, 'topLevel')) {
                if (b.topLevel) target.blocks._addScript(d.id);
                else target.blocks._deleteScript(d.id);
            }
            target.blocks.resetCache();
            emitBlocks(runtime, target.originalTargetId, ['update', {[d.id]: copy(d.props)}]);
            break;
        }
        case 'blocks.deleteInput': {
            const b = target.blocks._blocks[d.id];
            if (b && b.inputs) delete b.inputs[d.inputName];
            emitBlocks(runtime, target.originalTargetId, ['deleteInput', {id: d.id, inputName: d.inputName}]);
            break;
        }
        case 'blocks.set':
            for (const id of Object.keys(target.blocks._blocks)) {
                delete target.blocks._blocks[id];
                target.blocks._deleteScript(id);
                emitBlocks(runtime, target.originalTargetId, ['delete', id]);
            }
            await applyOpsToVm(vm, [{k: 'blocks.add', tg: op.tg, d: {blocks: d.blocks, replace: true}}], opts);
            break;
        case 'var.add':
            target.createVariable(d.id, d.data.name, d.type || '', !!d.data.isCloud);
            if (target.variables[d.id] && !target.variables[d.id].isCloud && hasOwn(d.data, 'value')) {
                target.variables[d.id].value = copy(d.data.value);
            }
            break;
        case 'var.update': {
            const v = target.variables[d.id];
            if (!v) {
                broken.push({op: op.k, id: d.id, why: 'no such variable'});
                break;
            }
            if (hasOwn(d.data, 'name') && d.data.name !== v.name) {
                target.renameVariable(d.id, d.data.name);
                runtime.emitTargetVariablesChanged(target.originalTargetId,
                    [d.id, v.type, 'update', {name: d.data.name}]);
            }
            if (hasOwn(d.data, 'value') && !v.isCloud && !d.data.isCloud) v.value = copy(d.data.value);
            if (hasOwn(d.data, 'isCloud')) v.isCloud = !!d.data.isCloud;
            break;
        }
        case 'var.delete':
            target.deleteVariable(d.id);
            break;
        case 'comment.add': {
            const c = d.data;
            target.createComment(d.id, c.blockId || null, c.text, c.x, c.y, c.width, c.height, !!c.minimized);
            break;
        }
        case 'comment.update': {
            const c = target.comments[d.id];
            if (!c) break;
            const changed = {};
            for (const k of ['x', 'y', 'width', 'height', 'minimized', 'text']) {
                if (hasOwn(d.data, k)) changed[k] = c[k] = copy(d.data[k]);
            }
            runtime.emitTargetCommentsChanged(target.originalTargetId, ['update', d.id, changed]);
            break;
        }
        case 'comment.delete': {
            const c = target.comments[d.id];
            if (!c) break;
            if (c.blockId && target.blocks._blocks[c.blockId]) delete target.blocks._blocks[c.blockId].comment;
            delete target.comments[d.id];
            runtime.emitTargetCommentsChanged(target.originalTargetId, ['delete', d.id]);
            break;
        }
        case 'monitor.set':
            for (const id of Object.keys(d.monitors)) {
                const m = d.monitors[id];
                if (m === null) {
                    runtime.requestRemoveMonitor(id);
                } else if (runtime.getMonitorState().has(id)) {
                    runtime.requestUpdateMonitor(Object.assign(copy(m), {id}));
                } else {
                    runtime.requestAddMonitor(new MonitorRecord(Object.assign(copy(m), {id})));
                }
            }
            break;
        case 'costume.add': {
            if (opts.loadAssets === false) break;
            try {
                const costume = await loadCostumeObject(runtime, d.data, d.id);
                target.addCostume(costume, typeof d.index === 'number' ? d.index : null);
            } catch (e) {
                broken.push({op: op.k, tg: op.tg, id: d.id, md5ext: d.data.md5ext, why: String(e.message || e)});
            }
            break;
        }
        case 'costume.update': {
            const costumes = target.getCostumes();
            const index = costumes.findIndex(c => c.id === d.id);
            if (index === -1) {
                broken.push({op: op.k, id: d.id, why: 'no such costume'});
                break;
            }
            const assetChange = ['md5ext', 'assetId', 'dataFormat'].some(k => hasOwn(d.data, k) &&
                d.data[k] !== (k === 'md5ext' ? costumes[index].md5 : costumes[index][k]));
            if (assetChange && opts.loadAssets !== false) {
                try {
                    const merged = Object.assign({
                        name: costumes[index].name,
                        assetId: costumes[index].assetId,
                        dataFormat: costumes[index].dataFormat,
                        md5ext: costumes[index].md5,
                        rotationCenterX: costumes[index].rotationCenterX,
                        rotationCenterY: costumes[index].rotationCenterY,
                        bitmapResolution: costumes[index].bitmapResolution
                    }, d.data);
                    const loaded = await loadCostumeObject(runtime, merged, d.id);
                    const old = costumes[index];
                    // eslint-disable-next-line require-atomic-updates
                    target.sprite.costumes[index] = loaded;
                    if (runtime.renderer && old.skinId !== null && typeof old.skinId !== 'undefined' &&
                        old.skinId !== loaded.skinId) runtime.renderer.destroySkin(old.skinId);
                    if (target.currentCostume === index) target.setCostume(index);
                    runtime.emitTargetCostumeChanged(target.originalTargetId, ['update', d.id, {
                        assetId: loaded.assetId,
                        md5ext: loaded.md5,
                        dataFormat: loaded.dataFormat,
                        rotationCenterX: loaded.rotationCenterX,
                        rotationCenterY: loaded.rotationCenterY,
                        bitmapResolution: loaded.bitmapResolution
                    }]);
                } catch (e) {
                    broken.push({op: op.k, tg: op.tg, id: d.id, md5ext: d.data.md5ext, why: String(e.message || e)});
                }
            } else {
                const c = costumes[index];
                if (hasOwn(d.data, 'rotationCenterX')) c.rotationCenterX = d.data.rotationCenterX;
                if (hasOwn(d.data, 'rotationCenterY')) c.rotationCenterY = d.data.rotationCenterY;
            }
            if (hasOwn(d.data, 'name')) target.renameCostume(index, d.data.name);
            break;
        }
        case 'costume.delete': {
            const index = target.getCostumes().findIndex(c => c.id === d.id);
            if (index !== -1) target.deleteCostume(index);
            break;
        }
        case 'costume.reorder':
            d.order.forEach((id, to) => {
                const from = target.getCostumes().findIndex(c => c.id === id);
                if (from !== -1 && from !== to) vm.reorderCostume(target.id, from, to);
            });
            break;
        case 'sound.add': {
            if (opts.loadAssets === false) break;
            try {
                const sound = await loadSoundObject(runtime, target, d.data, d.id);
                target.addSound(sound, typeof d.index === 'number' ? d.index : null);
                runtime.emitTargetSoundsChanged(target.originalTargetId, ['add', sound.id, sound]);
            } catch (e) {
                broken.push({op: op.k, tg: op.tg, id: d.id, md5ext: d.data.md5ext, why: String(e.message || e)});
            }
            break;
        }
        case 'sound.update': {
            const sounds = target.sprite.sounds;
            const index = sounds.findIndex(s => s.id === d.id);
            if (index === -1) {
                broken.push({op: op.k, id: d.id, why: 'no such sound'});
                break;
            }
            const assetChange = hasOwn(d.data, 'md5ext') && d.data.md5ext !== sounds[index].md5;
            if (assetChange && opts.loadAssets !== false) {
                try {
                    const merged = Object.assign(soundMeta(sounds[index]), d.data);
                    const loaded = await loadSoundObject(runtime, target, merged, d.id);
                    sounds[index] = loaded;
                    runtime.emitTargetSoundsChanged(target.originalTargetId, ['update', d.id, loaded]);
                } catch (e) {
                    broken.push({op: op.k, tg: op.tg, id: d.id, md5ext: d.data.md5ext, why: String(e.message || e)});
                }
            }
            if (hasOwn(d.data, 'name')) target.renameSound(index, d.data.name);
            break;
        }
        case 'sound.delete': {
            const index = target.sprite.sounds.findIndex(s => s.id === d.id);
            if (index !== -1) {
                target.deleteSound(index);
                runtime.emitTargetSoundsChanged(target.originalTargetId, ['delete', d.id]);
            }
            break;
        }
        case 'sound.reorder':
            d.order.forEach((id, to) => {
                const from = target.sprite.sounds.findIndex(s => s.id === id);
                if (from !== -1 && from !== to) vm.reorderSound(target.id, from, to);
            });
            break;
        case 'target.props':
            applyTargetProps(vm, target, d);
            break;
        case 'target.add': {
            const st = d.target;
            const before = new Set(runtime.targets.map(t => t.id));
            const json = targetToSb3(st);
            await vm.addSprite(JSON.stringify(json));
            const created = runtime.targets.find(t => t.isOriginal && !before.has(t.id));
            if (!created) {
                broken.push({op: op.k, id: st.id, why: 'sprite was not added'});
                break;
            }
            runtime.updateTargetId(created, st.id);
            const adopt = (kind, list) => {
                const ids = (list || []).map(x => x.id);
                if (created.sprite[kind].length === ids.length) {
                    created.sprite[kind] = created.sprite[kind].map((x, i) => withId(x, ids[i]));
                }
            };
            adopt('costumes', st.costumes);
            adopt('sounds', st.sounds);
            if (created.getName() !== st.name) vm.renameSprite(st.id, st.name);
            break;
        }
        case 'target.delete':
            if (get(d.id)) vm.deleteSprite(d.id, false);
            if (get(d.id)) broken.push({op: op.k, id: d.id, why: 'sprite was not deleted'});
            break;
        case 'target.rename':
            vm.renameSprite(op.tg, d.name);
            break;
        case 'target.order': {
            d.order.forEach((id, to) => {
                const originals = runtime.targets.filter(t => t.isOriginal);
                const from = originals.findIndex(t => t.id === id);
                if (from > 0 && to > 0 && from !== to) vm.reorderTarget(from, to);
            });
            if (d.layers) {
                for (const id of Object.keys(d.layers)) applyTargetProps(vm, get(id), {layerOrder: d.layers[id]});
            }
            break;
        }
        case 'ext.add':
            if (!vm.extensionManager.isExtensionLoaded(d.id)) {
                try {
                    await vm.extensionManager.loadExtensionURL(d.url || d.id);
                } catch (e) {
                    broken.push({op: op.k, id: d.id, why: String(e.message || e)});
                }
            }
            break;
        case 'ext.remove':
            break;
        case 'font.add': {
            const fm = runtime.fontManager;
            try {
                if (d.system) {
                    fm.addSystemFont(d.family, d.fallback || '');
                } else if (opts.loadAssets !== false) {
                    const [assetId, ext] = (d.md5ext || '').split('.');
                    const asset = await runtime.storage.load(runtime.storage.AssetType.Font, assetId, ext);
                    if (!asset) throw new Error(`font asset ${d.md5ext} could not be loaded`);
                    fm.addCustomFont(d.family, d.fallback || '', asset);
                }
            } catch (e) {
                broken.push({op: op.k, family: d.family, why: String(e.message || e)});
            }
            break;
        }
        case 'font.delete': {
            const fm = runtime.fontManager;
            const index = fm.fonts.findIndex(f => f.family.toLowerCase() === d.family.toLowerCase());
            if (index !== -1) fm.deleteFont(index);
            break;
        }
        case 'runtime.state':
            for (const id of Object.keys(d.targets)) {
                const t = get(id);
                if (!t) continue;
                const entry = d.targets[id];
                const props = Object.assign({}, entry);
                delete props.vars;
                applyTargetProps(vm, t, props, {silent: true});
                for (const varId of Object.keys(entry.vars || {})) {
                    if (t.variables[varId]) t.variables[varId].value = copy(entry.vars[varId]);
                }
            }
            break;
        case 'restore':
            await applyOpsToVm(vm, d.diff, opts);
            break;
        default:
            break;
        }
    }
    if (touchedEditing.blocks && typeof vm.emitWorkspaceUpdate === 'function') vm.emitWorkspaceUpdate();
    if (typeof vm.emitTargetsUpdate === 'function') vm.emitTargetsUpdate(false);
    return {broken};
};

/**
 * Split a restore's diff into op-sized parts.
 * @param {object} d {to, label_user, diff}
 * @param {object} opts makeOp options
 * @returns {Array<object>} restore ops
 */
export const makeRestoreOps = (d, opts) => {
    const g = opts.g || `restore:${uuidv4()}`;
    const parts = [];
    let current = [];
    let size = 0;
    for (const op of d.diff) {
        const n = opBytes(op);
        if (current.length && size + n > MAX_OP_BYTES - 4096) {
            parts.push(current);
            current = [];
            size = 0;
        }
        current.push(op);
        size += n;
    }
    parts.push(current);
    return parts.map((diff, i) => makeOp('restore', null, Object.assign(
        {to: d.to, label_user: d.label_user, diff},
        parts.length > 1 ? {part: i, parts: parts.length} : {}
    ), Object.assign({}, opts, {g, source: 'restore'})));
};

/**
 * Restore the live project to `targetState`.
 * @param {object} vm VirtualMachine
 * @param {object} targetState state to go back to
 * @param {object} opts options
 * @returns {Promise<object>} {ok, opCount, mismatches, broken, ops}
 */
export const restoreTo = async (vm, targetState, opts = {}) => {
    const recorder = opts.recorder || null;
    const now = opts.now || (() => Date.now());
    if (recorder) {
        recorder.closePending();
        recorder.closeAssets();
        recorder.checkpointRuntime('before-restore');
    }
    const art = recorder && recorder.artSource ? {art: recorder.artSource} : {};
    const live = serializeState(vm, art);
    const diff = diffStates(live, targetState, {source: 'restore', t: now()});
    const run = () => applyOpsToVm(vm, diff, {loadAssets: true});
    const unmute = muteCloud(vm.runtime);
    let broken;
    try {
        ({broken} = recorder ? await recorder.suppress('restore', run) : await run());
    } finally {
        unmute();
    }
    const cloudIds = new Set();
    for (const st of [live, targetState]) {
        for (const t of st.targets || []) {
            for (const id of Object.keys(t.variables || {})) if (t.variables[id].isCloud) cloudIds.add(id);
        }
    }
    if (diff.some(op => /^var\./.test(op.k) && op.d && cloudIds.has(op.d.id))) resyncCloud(vm.runtime);
    const after = serializeState(vm, art);
    const mismatches = diffCanonical(after, targetState, 20);
    let ops = [];
    if (recorder && diff.length) {
        const landed = diffStates(live, after, {source: 'restore', t: now()});
        ops = makeRestoreOps({to: opts.to || 0, label_user: opts.labelUser || '', diff: landed}, {});
        for (const op of ops) {
            op.t = recorder.nextT();
            recorder.commit(op);
        }
        if (recorder.shadow) recorder.shadow = after;
    }
    return {ok: mismatches.length === 0 && broken.length === 0, opCount: diff.length, mismatches, broken, ops};
};
