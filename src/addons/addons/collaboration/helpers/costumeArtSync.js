import * as Y from 'yjs';
import * as constants from './constants.js';
import * as helper from './helper.js';
import * as recorder from './recorder.js';
import {compose} from 'scratch-paint/src/helper/collab-art.js';
import {applyLive, canApplyLive, replayBitmap, canReplayBitmap, setLiveResync} from 'scratch-paint/src/helper/collab-live.js';
import {bitmapDigest, bitmapSnapshot} from 'scratch-paint/src/helper/bit-replay.js';

const MINT_IDLE_MS = 1000;

const mintTimers = new Map();

const published = new Map();

let floatingCostume = null;

let recordedFloatId = null;

const artKey = (targetId, costumeId) => `${targetId}|${costumeId}`;

function artFor(costumeId, create) {
    const root = constants.mutableRefs.sharedCostumeArt;
    if (!root) return null;
    if (!root.has(costumeId)) {
        if (!create) return null;
        const made = new Y.Map();
        made.set('order', new Y.Array());
        made.set('shapes', new Y.Map());
        made.set('view', new Y.Map());

        made.set('ops', new Y.Array());
        root.set(costumeId, made);
    }
    const entry = root.get(costumeId);
    return {
        order: entry.get('order'),
        shapes: entry.get('shapes'),
        view: entry.get('view'),
        ops: entry.get('ops') || null
    };
}

function isSeeded(costumeId) {
    const art = artFor(costumeId, false);
    return !!(art && art.order.length > 0);
}

export function isShapeBacked(costumeId) {
    return isSeeded(costumeId);
}

export function createArt(costumeId) {
    artFor(costumeId, true);
}

export function ensureArt(targetId, index) {
    if (!constants.mutableRefs.ydoc || !constants.mutableRefs.sharedCostumeArt) return;
    const target = constants.mutableRefs.vm?.runtime?.getTargetById(targetId);
    const costume = target && target.getCostumes()[index];
    if (!costume) return;
    if (constants.mutableRefs.sharedCostumeArt.has(costume.id)) return;
    constants.mutableRefs.ydoc.transact(() => {
        artFor(costume.id, true);
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

export function isDocBacked(costumeId) {
    if (isShapeBacked(costumeId)) return true;
    if (floatingCostume === costumeId) return true;
    const art = artFor(costumeId, false);
    return !!(art && art.ops && art.ops.length > 0);
}

function assignIds(costumeId, shapes, items, seeding) {
    const clientId = constants.mutableRefs.ydoc ? constants.mutableRefs.ydoc.clientID : 'x';

    const existing = artFor(costumeId, false);
    if (existing && !seeding) {
        const byContent = new Map();
        for (const id of existing.order.toArray()) {
            const entry = existing.shapes.get(id);
            if (!entry) continue;
            const stored = entry.toJSON();
            const key = contentHash(signature(stored));
            if (!byContent.has(key)) byContent.set(key, []);
            byContent.get(key).push(id);
        }
        for (const shape of shapes) {
            if (shape.id) continue;
            const candidates = byContent.get(contentHash(signature(shape)));
            if (candidates && candidates.length) shape.id = candidates.shift();
        }
    }

    for (let index = 0; index < shapes.length; index++) {
        if (!shapes[index].id) {

            shapes[index].id = seeding ?
                `${costumeId}~${contentHash(signature(shapes[index]))}` :
                `${clientId}-${Math.random().toString(36).slice(2, 9)}`;
        }
        const item = items && items[index];
        if (item) {
            if (!item.data) item.data = {};
            item.data.collabId = shapes[index].id;
        }
    }
}

const signature = shape => JSON.stringify([shape.tag, shape.attrs, shape.kids, shape.text, shape.defs]);

function contentHash(text) {
    let hash = 5381;
    for (let index = 0; index < text.length; index++) {
        hash = (((hash << 5) + hash) + text.charCodeAt(index)) | 0;
    }
    return (hash >>> 0).toString(36);
}

export function publishFromEditor(art) {
    if (!art) return;
    if (art.op && (art.op.kind === 'float' || art.op.kind === 'float-end')) {
        publishLocalFloat(art);
        return;
    }
    if (art.op) {
        publishLocalOp(art);
        return;
    }
    if (art.shapes) publishLocalArt(art);
}

export function withdrawFloat() {
    if (recordedFloatId) {
        recorder.record('local.art.float-end', {floatId: recordedFloatId});
        recordedFloatId = null;
    }
    floatingCostume = null;
    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    if (awareness && awareness.getLocalState()?.paintFloat) {
        awareness.setLocalStateField('paintFloat', null);
    }
}

export function publishLocalFloat(art) {
    if (constants.isApplyingRemote()) return;
    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    if (!awareness) return;

    if (art.op.kind === 'float-end') {
        withdrawFloat();
        return;
    }

    const target = constants.mutableRefs.vm.runtime.getTargetById(art.targetId);
    const costume = target && target.getCostumes()[art.costumeIndex];
    if (costume) floatingCostume = costume.id;

    if (art.op.floatId !== recordedFloatId) {
        recordedFloatId = art.op.floatId;
        recorder.record('local.art.float', {
            costume: costume ? costume.id : null,
            floatId: art.op.floatId,
            shape: art.op.shape && art.op.shape.type
        });
    }

    awareness.setLocalStateField('paintFloat', {
        floatId: art.op.floatId,
        shape: art.op.shape,
        targetId: art.targetId,
        index: art.costumeIndex
    });
}

export function publishLocalArt(art) {
    if (constants.isApplyingRemote()) return;
    if (constants.mutableRefs.isInitialRoomSync) return;
    if (!constants.mutableRefs.ydoc || !constants.mutableRefs.sharedCostumeArt) return;
    if (!art || !art.shapes || !art.view) return;

    const target = constants.mutableRefs.vm.runtime.getTargetById(art.targetId);
    if (!target) return;
    const costume = target.getCostumes()[art.costumeIndex];
    if (!costume) return;

    const seeding = !isSeeded(costume.id);
    assignIds(costume.id, art.shapes, art.items, seeding);

    const key = artKey(art.targetId, costume.id);
    const before = published.get(key) || new Map();
    const after = new Map();
    for (const shape of art.shapes) after.set(shape.id, signature(shape));

    constants.mutableRefs.ydoc.transact(() => {
        const store = artFor(costume.id, true);
        if (!store) return;

        for (const shape of art.shapes) {
            if (before.get(shape.id) === after.get(shape.id)) continue;
            const entry = new Y.Map();
            entry.set('tag', shape.tag);
            entry.set('attrs', shape.attrs);
            if (shape.kids) entry.set('kids', shape.kids);
            if (shape.text !== undefined) entry.set('text', shape.text);
            if (shape.defs) entry.set('defs', shape.defs);
            store.shapes.set(shape.id, entry);
        }

        for (const id of before.keys()) {
            if (!after.has(id)) store.shapes.delete(id);
        }

        const wantOrder = art.shapes.map(shape => shape.id);

        const haveOrder = store.order.toArray();
        const haveSet = new Set(haveOrder);
        const wantSet = new Set(wantOrder);

        for (let index = haveOrder.length - 1; index >= 0; index--) {
            const id = haveOrder[index];
            if (!wantSet.has(id) && before.has(id)) store.order.delete(index, 1);
        }
        for (let index = 0; index < wantOrder.length; index++) {
            const id = wantOrder[index];
            if (!haveSet.has(id)) {
                store.order.insert(Math.min(index, store.order.length), [id]);
            }
        }

        pruneDuplicateOrder(store);

        const settled = store.order.toArray();
        const mutualHere = settled.filter(id => wantSet.has(id) && haveSet.has(id));
        const mutualThere = wantOrder.filter(id => haveSet.has(id));
        if (mutualHere.length === mutualThere.length &&
            mutualHere.some((id, index) => id !== mutualThere[index])) {

            const rebuilt = wantOrder.slice();
            settled.forEach((id, index) => {
                if (wantSet.has(id)) return;
                rebuilt.splice(Math.min(index, rebuilt.length), 0, id);
            });
            store.order.delete(0, store.order.length);
            store.order.insert(0, rebuilt);
        }

        for (const [name, value] of Object.entries(art.view)) {
            if (store.view.get(name) !== value) store.view.set(name, value);
        }
        if (Number.isFinite(art.rotationCenterX)) store.view.set('rotationCenterX', art.rotationCenterX);
        if (Number.isFinite(art.rotationCenterY)) store.view.set('rotationCenterY', art.rotationCenterY);
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);

    published.set(key, after);
    scheduleMint(art.targetId, costume.id);

    if (recorder.isRecording()) {
        let changed = 0;
        for (const shape of art.shapes) {
            if (before.get(shape.id) !== after.get(shape.id)) changed++;
        }
        let removed = 0;
        for (const id of before.keys()) {
            if (!after.has(id)) removed++;
        }
        recorder.record('local.art.shapes', {
            costume: costume.id, changed, removed, total: after.size, seeding
        });
    }
}

function scheduleMint(targetId, costumeId) {
    const key = artKey(targetId, costumeId);
    clearTimeout(mintTimers.get(key));
    mintTimers.set(key, setTimeout(() => {
        mintTimers.delete(key);
        mintNow(targetId, costumeId).catch(() => {});
    }, MINT_IDLE_MS));
}

export function flushPendingMints() {
    const pending = [...mintTimers.keys()];
    return Promise.all(pending.map(key => {
        clearTimeout(mintTimers.get(key));
        mintTimers.delete(key);
        const [targetId, costumeId] = key.split('|');
        return mintNow(targetId, costumeId, {urgent: true}).catch(() => {});
    }));
}

async function mintNow(targetId, costumeId, opts = {}) {
    const runtime = constants.mutableRefs.vm && constants.mutableRefs.vm.runtime;
    if (!runtime) return;
    const target = runtime.getTargetById(targetId);
    if (!target) return;
    const costume = target.getCostumes().find(candidate => candidate.id === costumeId);
    if (!costume || !costume.asset) return;

    if (costume.dataFormat === 'svg' && isSeeded(costumeId)) return;
    const uploaded = await helper.uploadCollaborationAsset(runtime, costume.asset, opts);

    if (!uploaded) {
        recorder.record('local.costume.mint-failed', {costume: costumeId, target: targetId});
        return;
    }
    const yData = constants.mutableRefs.sharedCostumeData &&
        constants.mutableRefs.sharedCostumeData.get(targetId);
    const entry = yData && yData.get(costumeId);
    if (!entry) return;
    const md5ext = costume.md5 || costume.md5ext;
    if (entry.get('md5ext') === md5ext) return;
    constants.mutableRefs.ydoc.transact(() => {
        entry.set('assetId', costume.assetId);
        entry.set('md5ext', md5ext);
        entry.set('dataFormat', costume.dataFormat);
        entry.set('rotationCenterX', costume.rotationCenterX);
        entry.set('rotationCenterY', costume.rotationCenterY);
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

export function composeFromDoc(costumeId) {
    const art = artFor(costumeId, false);
    if (!art || art.order.length === 0) return null;
    const shapes = [];

    const drawn = new Set();
    for (const id of art.order.toArray()) {
        if (drawn.has(id)) continue;
        drawn.add(id);
        const entry = art.shapes.get(id);
        if (!entry) continue;
        const shape = entry.toJSON();
        shape.id = id;
        shapes.push(shape);
    }
    if (!shapes.length) return null;
    const view = art.view.toJSON();
    return {
        svg: compose(view, shapes),
        ids: shapes.map(shape => shape.id),
        rotationCenterX: view.rotationCenterX,
        rotationCenterY: view.rotationCenterY
    };
}

function isOpenInEditor(target, index) {
    if (!canApplyLive()) return false;
    const state = constants.mutableRefs.addon?.tab?.redux?.state;
    const selected = state?.scratchGui?.collaboration?.selectedAsset;
    if (!selected || selected.type !== 'costume') return false;
    return selected.targetId === target.id && selected.index === index;
}

function pruneDuplicateOrder(store) {
    const ids = store.order.toArray();
    const seen = new Set();
    const duplicates = [];
    for (let index = 0; index < ids.length; index++) {
        if (seen.has(ids[index])) duplicates.push(index);
        else seen.add(ids[index]);
    }
    for (let index = duplicates.length - 1; index >= 0; index--) {
        store.order.delete(duplicates[index], 1);
    }
}

const pendingApply = new Map();

export function handleRemoteArtChanges(events) {
    const list = Array.isArray(events) ? events : [events];
    if (list.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN)) return;

    const costumeIds = new Set();
    for (const event of list) {
        if (event.path.length === 2 && event.path[1] === 'ops') {
            const inserted = [];
            for (const part of event.changes.delta || []) {
                if (part.insert) inserted.push(...part.insert);
            }
            if (inserted.length) applyRemoteOps(event.path[0], inserted);
            continue;
        }

        if (event.path.length > 0) {
            costumeIds.add(event.path[0]);
        } else {
            event.changes.keys.forEach((change, costumeId) => costumeIds.add(costumeId));
        }
    }

    for (const costumeId of costumeIds) {
        clearTimeout(pendingApply.get(costumeId));
        pendingApply.set(costumeId, setTimeout(() => {
            pendingApply.delete(costumeId);
            applyRemoteArt(costumeId);
        }, 16));
    }
}

export function applyRemoteArt(costumeId) {
    const runtime = constants.mutableRefs.vm && constants.mutableRefs.vm.runtime;
    if (!runtime || !runtime.renderer) return;

    let target = null;
    let costume = null;
    for (const candidate of runtime.targets) {
        if (candidate.isOriginal === false) continue;
        const found = candidate.getCostumes().find(entry => entry.id === costumeId);
        if (found) {
            target = candidate;
            costume = found;
            break;
        }
    }
    if (!costume) return;

    const rebuilt = composeFromDoc(costumeId);
    if (!rebuilt) {
        recorder.record('remote.art.skip', {costume: costumeId, why: 'nothing-composed'});
        return;
    }
    const converting = costume.dataFormat !== 'svg';

    const centerX = Number.isFinite(rebuilt.rotationCenterX) ?
        rebuilt.rotationCenterX : costume.rotationCenterX;
    const centerY = Number.isFinite(rebuilt.rotationCenterY) ?
        rebuilt.rotationCenterY : costume.rotationCenterY;

    let live = false;
    constants.beginRemoteApply();
    try {
        constants.mutableRefs.vm._updateSvg(
            costume, rebuilt.svg, centerX, centerY, target ? target.id : undefined);

        const index = target ? target.getCostumes().indexOf(costume) : -1;
        if (index >= 0 && isOpenInEditor(target, index)) {
            applyLive(rebuilt.svg, centerX, centerY, rebuilt.ids);
            live = true;
        }
    } catch (e) {
        recorder.record('remote.art.error', {costume: costumeId, message: String(e)});
        console.warn('[collaboration] could not redraw a costume from the document', e);
    } finally {
        constants.endRemoteApply();
    }

    recorder.record('remote.art.shapes', {
        costume: costumeId,
        shapes: rebuilt.ids ? rebuilt.ids.length : undefined,
        live,
        converting: converting || undefined
    });
}

const replayedOps = new Set();

const ECHO_MS = 2000;
const replayEcho = new Map();

export function isReplayEcho(costumeId) {
    const until = replayEcho.get(costumeId);
    if (until === undefined) return false;
    if (Date.now() < until) return true;
    replayEcho.delete(costumeId);
    return false;
}

export function replaysLive(costumeId) {
    if (!canReplayBitmap()) return false;
    const found = locateCostume(costumeId);
    return !!found && isOpenInEditor(found.target, found.index);
}

const appliedIds = new Map();

const outOfOrder = new Set();

function noteApplied(costumeId, id) {
    if (!id) return;
    let seen = appliedIds.get(costumeId);
    if (!seen) {
        seen = new Set();
        appliedIds.set(costumeId, seen);
    }
    seen.add(id);
}

export function appliedInOrder(costumeId) {
    return !outOfOrder.has(costumeId);
}

function readsThePicture(op) {
    if (!op) return false;
    if (op.kind === 'fill' || op.kind === 'gradfill') return true;
    return op.kind === 'stamp' && !!op.shape && op.shape.type === 'raster';
}

function planRun(costumeId, arrived) {
    const store = artFor(costumeId, false);
    const docOps = store && store.ops ? store.ops.toArray() : null;
    if (!docOps || !docOps.length) return {plan: arrived, indexOf: null, redone: 0, stranded: false};

    const indexOf = new Map();
    for (let index = 0; index < docOps.length; index++) {
        const entry = docOps[index];
        if (entry && entry.id) indexOf.set(entry.id, index);
    }

    let earliest = Infinity;
    for (const op of arrived) {
        const at = op && indexOf.get(op.id);
        if (typeof at === 'number' && at < earliest) earliest = at;
    }
    const seen = appliedIds.get(costumeId);
    if (!seen || earliest === Infinity) return {plan: arrived, indexOf, redone: 0, stranded: false};

    const overtaken = [];
    for (const id of seen) {
        const at = indexOf.get(id);
        if (typeof at === 'number' && at > earliest) overtaken.push(at);
    }
    if (!overtaken.length) return {plan: arrived, indexOf, redone: 0, stranded: false};
    overtaken.sort((x, y) => x - y);

    for (let index = earliest; index < docOps.length; index++) {
        if (readsThePicture(docOps[index])) {
            return {plan: arrived, indexOf, redone: 0, stranded: true};
        }
    }

    return {
        plan: arrived.concat(overtaken.map(at => docOps[at])),
        indexOf,
        redone: overtaken.length,
        stranded: false
    };
}

let replayQueue = Promise.resolve();

export function publishLocalOp(art) {
    if (constants.isApplyingRemote()) return;
    if (constants.mutableRefs.isInitialRoomSync) return;
    if (!constants.mutableRefs.ydoc || !constants.mutableRefs.sharedCostumeArt) return;
    if (!art || !art.op) return;

    const target = constants.mutableRefs.vm.runtime.getTargetById(art.targetId);
    if (!target) return;
    const costume = target.getCostumes()[art.costumeIndex];
    if (!costume) return;

    const clientId = constants.mutableRefs.ydoc.clientID;
    const id = `${clientId}-${Math.random().toString(36).slice(2, 9)}`;
    replayedOps.add(id);
    noteApplied(costume.id, id);

    constants.mutableRefs.ydoc.transact(() => {
        const store = artFor(costume.id, true);
        if (!store || !store.ops) return;
        store.ops.push([Object.assign({}, art.op, {id, by: clientId})]);
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);

    withdrawFloat();

    countApplied(costume.id);
    scheduleMint(art.targetId, costume.id);
    scheduleDigest(costume.id);

    recorder.record('local.art.op', {
        costume: costume.id,
        kind: art.op.kind,
        id,
        applied: appliedCounts.get(costume.id) || 0
    });
}

function applyRemoteOps(costumeId, ops) {

    replayQueue = replayQueue
        .then(() => runRemoteOps(costumeId, ops))
        .catch(e => console.warn('[collaboration] could not replay a bitmap edit', e));
}

async function runRemoteOps(costumeId, ops) {
    const runtime = constants.mutableRefs.vm && constants.mutableRefs.vm.runtime;
    if (!runtime) return;

    let target = null;
    let index = -1;
    for (const candidate of runtime.targets) {
        if (candidate.isOriginal === false) continue;
        const at = candidate.getCostumes().findIndex(entry => entry.id === costumeId);
        if (at >= 0) {
            target = candidate;
            index = at;
            break;
        }
    }
    if (!target) {
        recorder.record('remote.art.skip', {costume: costumeId, n: ops.length, why: 'no-target'});
        return;
    }

    if (!canReplayBitmap() || !isOpenInEditor(target, index)) {
        recorder.record('remote.art.skip', {
            costume: costumeId,
            n: ops.length,
            why: canReplayBitmap() ? 'not-open' : 'no-raster'
        });
        return;
    }

    const run = planRun(costumeId, ops);
    if (run.stranded && !outOfOrder.has(costumeId)) {
        outOfOrder.add(costumeId);
        console.warn('[collaboration] two edits to one bitmap crossed and one of them reads the ' +
            'picture it lands on, so this costume cannot be put back in order here -- taking ' +
            `somebody else's copy instead (costume ${costumeId})`);
        recorder.record('art.order.stranded', {costume: costumeId, n: ops.length});
    }
    if (run.redone) {
        recorder.record('art.order.redone', {costume: costumeId, n: run.redone});
    }

    constants.beginRemoteApply();
    try {
        for (const op of run.plan) {
            if (!op) continue;
            const fresh = !replayedOps.has(op.id);
            if (fresh) {
                replayedOps.add(op.id);
                countApplied(costumeId);
                noteApplied(costumeId, op.id);
            }
            const performed = replayBitmap(op);
            const landed = (performed && typeof performed.then === 'function') ?
                await performed : performed;
            if (landed) replayEcho.set(costumeId, Date.now() + ECHO_MS);
            if (landed && op.kind === 'image') outOfOrder.delete(costumeId);
            recorder.record('remote.art.op', {
                costume: costumeId,
                kind: op.kind,
                id: op.id,
                by: op.by,
                landed: !!landed,
                again: !fresh,
                applied: appliedCounts.get(costumeId) || 0
            });
            if (!landed) {
                console.warn(`[collaboration] a ${op.kind || 'bitmap'} edit will arrive with the ` +
                    'costume rather than immediately');
            }
        }
    } catch (e) {
        recorder.record('remote.art.error', {costume: costumeId, message: String(e)});
        console.warn('[collaboration] could not replay a bitmap edit', e);
    } finally {
        constants.endRemoteApply();
    }

    if (run.stranded) publishDigest(costumeId);
    else scheduleDigest(costumeId);

    scheduleMint(target.id, costumeId);
}

const DIGEST_IDLE_MS = 10000;

const digestTimers = new Map();

const appliedCounts = new Map();

function countApplied(costumeId) {
    appliedCounts.set(costumeId, (appliedCounts.get(costumeId) || 0) + 1);
}

export function appliedCount(costumeId) {
    return appliedCounts.get(costumeId) || 0;
}

function scheduleDigest(costumeId) {
    clearTimeout(digestTimers.get(costumeId));
    digestTimers.set(costumeId, setTimeout(() => {
        digestTimers.delete(costumeId);
        publishDigest(costumeId);
    }, DIGEST_IDLE_MS));
}

function locateCostume(costumeId) {
    const runtime = constants.mutableRefs.vm && constants.mutableRefs.vm.runtime;
    if (!runtime) return null;
    for (const candidate of runtime.targets) {
        if (candidate.isOriginal === false) continue;
        const index = candidate.getCostumes().findIndex(entry => entry.id === costumeId);
        if (index >= 0) {
            return {target: candidate, costume: candidate.getCostumes()[index], index};
        }
    }
    return null;
}

export function publishDigest(costumeId) {
    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    if (!awareness) return;

    const found = locateCostume(costumeId);
    if (!found || found.costume.dataFormat === 'svg' ||
        !canReplayBitmap() || !isOpenInEditor(found.target, found.index)) {
        if (awareness.getLocalState()?.costumeDigest) {
            awareness.setLocalStateField('costumeDigest', null);
        }
        recorder.record('art.digest.none', {costume: costumeId, why: 'not-comparable'});
        return;
    }

    const digest = bitmapDigest();
    if (!digest) {
        recorder.record('art.digest.none', {costume: costumeId, why: 'floating'});
        return;
    }

    const applied = appliedCounts.get(costumeId) || 0;
    const ordered = appliedInOrder(costumeId);
    awareness.setLocalStateField('costumeDigest', {costumeId, digest, applied, ordered});
    recorder.record('art.digest', {costume: costumeId, digest, applied, ordered});
}

const REPAIR_COOLDOWN_MS = 3000;

const lastRepair = new Map();

export function publishWholeRaster(costumeId) {
    const awareness = constants.mutableRefs.yjsAwarenessInstance;
    const found = locateCostume(costumeId);
    if (!found) return;

    const last = lastRepair.get(costumeId) || 0;
    if (Date.now() - last < REPAIR_COOLDOWN_MS) {
        recorder.record('art.repair.held', {costume: costumeId, since: Date.now() - last});
        return;
    }
    lastRepair.set(costumeId, Date.now());

    const png = bitmapSnapshot();
    if (!png) {
        recorder.record('art.repair.abandoned', {costume: costumeId, why: 'no-snapshot'});
        return;
    }

    recorder.record('art.repair.publish', {costume: costumeId, bytes: png.length});

    publishLocalOp({
        targetId: found.target.id,
        costumeIndex: found.index,
        op: {kind: 'image', png}
    });
    outOfOrder.delete(costumeId);
    if (awareness?.getLocalState()?.costumeDigest) {
        awareness.setLocalStateField('costumeDigest', null);
    }
}

export function resyncOpenCostume() {
    const state = constants.mutableRefs.addon?.tab?.redux?.state;
    const selected = state?.scratchGui?.collaboration?.selectedAsset;
    if (!selected || selected.type !== 'costume') return;

    const target = constants.mutableRefs.vm?.runtime?.getTargetById(selected.targetId);
    const costume = target && target.getCostumes()[selected.index];
    if (!costume || !isShapeBacked(costume.id)) return;

    applyRemoteArt(costume.id);
}

export function forgetArt(costumeId, becoming) {
    const root = constants.mutableRefs.sharedCostumeArt;
    if (!root || !root.has(costumeId)) return;
    const nowBitmap = !!becoming && becoming !== 'svg';
    constants.mutableRefs.ydoc.transact(() => {
        const store = artFor(costumeId, false);
        if (!store) return;
        if (nowBitmap) {
            if (store.order.length) store.order.delete(0, store.order.length);
            for (const id of [...store.shapes.keys()]) store.shapes.delete(id);
        } else if (store.ops && store.ops.length) {
            store.ops.delete(0, store.ops.length);
        }
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);

    if (!nowBitmap) return;
    for (const key of [...published.keys()]) {
        if (key.endsWith(`|${costumeId}`)) published.delete(key);
    }
}

export function hydrateArt() {
    const root = constants.mutableRefs.sharedCostumeArt;
    if (!root) return;
    root.forEach((entry, costumeId) => {
        try {
            const order = entry.get('order');
            if (!order || order.length === 0) return;
            applyRemoteArt(costumeId);
        } catch (e) {
            console.warn('[collaboration] could not draw a costume from the room', e);
        }
    });
}

export function reset() {
    for (const timer of mintTimers.values()) clearTimeout(timer);
    mintTimers.clear();
    for (const timer of pendingApply.values()) clearTimeout(timer);
    pendingApply.clear();
    published.clear();
    replayedOps.clear();
    for (const timer of digestTimers.values()) clearTimeout(timer);
    digestTimers.clear();
    appliedCounts.clear();
    replayEcho.clear();
    floatingCostume = null;
    recordedFloatId = null;
    appliedIds.clear();
    lastRepair.clear();
    outOfOrder.clear();
    replayQueue = Promise.resolve();
}
