import * as constants from './constants.js';

export const TRANSFORM_FIELDS = ['x', 'y', 'direction', 'size', 'rotationStyle', 'visible', 'draggable'];

export const SPRITE_STATE_FIELDS = ['currentCostume', 'volume'];

const STAGE_ONLY_FIELDS = ['tempo', 'videoTransparency', 'videoState', 'textToSpeechLanguage'];

export function serializeTransformFields(target) {
    return {
        x: target.x,
        y: target.y,
        direction: target.direction,
        size: target.size,
        rotationStyle: target.rotationStyle,
        visible: target.visible,
        draggable: target.draggable
    };
}

export function serializeStateFields(target) {
    const out = {
        currentCostume: target.currentCostume ?? 0,
        volume: target.volume ?? 100
    };
    if (target.isStage) {
        STAGE_ONLY_FIELDS.forEach(field => {
            if (target[field] !== undefined) out[field] = target[field];
        });
    }
    return out;
}

export function publishLayerOrder() {
    const vm = constants.mutableRefs.vm;
    if (!vm || !constants.mutableRefs.sharedSpriteData) return;

    constants.mutableRefs.ydoc.transact(() => {
        vm.runtime.targets.forEach(target => {
            if (!target.isOriginal || target.isStage) return;
            const order = target.getLayerOrder();
            if (typeof order !== 'number') return;
            const yMap = findSpriteMap(target.id);
            if (yMap && yMap.get('layerOrder') !== order) yMap.set('layerOrder', order);
        });
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

export function applyLayerOrderFromYjs() {
    const vm = constants.mutableRefs.vm;
    if (!vm || !constants.mutableRefs.sharedSpriteData) return;

    const ordered = vm.runtime.targets
        .filter(target => target.isOriginal && !target.isStage)
        .map(target => ({target, order: findSpriteMap(target.id)?.get('layerOrder')}))
        .filter(entry => typeof entry.order === 'number')
        .sort((a, b) => a.order - b.order);

    if (ordered.length < 2) return;
    ordered.forEach(entry => entry.target.goToFront());
}

export function applyStateFromYjs(target, yMap) {
    const currentCostume = yMap.get('currentCostume');
    if (typeof currentCostume === 'number' &&
        currentCostume !== target.currentCostume &&
        currentCostume >= 0 &&
        currentCostume < target.getCostumes().length) {
        target.setCostume(currentCostume);
    }
    const volume = yMap.get('volume');
    if (typeof volume === 'number' && volume !== target.volume) target.volume = volume;
}

export function applyTransformFromYjs(target, yMap) {
    const data = {};
    TRANSFORM_FIELDS.forEach(field => {
        const value = yMap.get(field);
        if (value !== undefined) data[field] = value;
    });

    const costumes = (!target.isStage && typeof target.getCostumes === 'function') ? target.getCostumes() : null;
    const currentCostume = costumes ? costumes[target.currentCostume] : null;
    const hasLoadedSkin = target.isStage ||
        !!(currentCostume && currentCostume.skinId !== undefined && currentCostume.skinId !== null);

    if (!hasLoadedSkin) {
        TRANSFORM_FIELDS.forEach(field => {
            if (Object.prototype.hasOwnProperty.call(data, field)) target[field] = data[field];
        });
        return;
    }

    const isXChanged = Object.prototype.hasOwnProperty.call(data, 'x');
    const isYChanged = Object.prototype.hasOwnProperty.call(data, 'y');
    if (isXChanged || isYChanged) {
        target.setXY(isXChanged ? data.x : target.x, isYChanged ? data.y : target.y, true);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'direction')) target.setDirection(data.direction);
    if (Object.prototype.hasOwnProperty.call(data, 'size')) target.setSize(data.size);
    if (Object.prototype.hasOwnProperty.call(data, 'rotationStyle')) target.setRotationStyle(data.rotationStyle);
    if (Object.prototype.hasOwnProperty.call(data, 'visible')) target.setVisible(data.visible);
    if (Object.prototype.hasOwnProperty.call(data, 'draggable')) target.setDraggable(data.draggable);
}

function findSpriteMap(targetId) {
    return constants.mutableRefs.sharedSpriteData?.get(targetId) || null;
}

const TRANSFORM_PUSH_THROTTLE_MS = 50;
const pendingPushes = new Map();
const throttleTimers = new Map();
const lastPushTimes = new Map();

function flushTransformPush(targetId) {
    throttleTimers.delete(targetId);
    const properties = pendingPushes.get(targetId);
    pendingPushes.delete(targetId);
    if (!properties) return;

    lastPushTimes.set(targetId, Date.now());
    constants.mutableRefs.syncingTargets.add(targetId);
    try {
        constants.mutableRefs.ydoc.transact(() => {
            const yMap = findSpriteMap(targetId);
            if (!yMap) return;
            Object.keys(properties).forEach(key => {
                if (TRANSFORM_FIELDS.includes(key) || SPRITE_STATE_FIELDS.includes(key)) {
                    yMap.set(key, properties[key]);
                }
            });
        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    } finally {
        constants.mutableRefs.syncingTargets.delete(targetId);
    }
}

export function handleLocalTransformChange(targetId, properties) {
    if (constants.mutableRefs.syncingTargets.has(targetId)) return;

    const relevant = {};
    [...TRANSFORM_FIELDS, ...SPRITE_STATE_FIELDS].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(properties, key)) relevant[key] = properties[key];
    });
    if (Object.keys(relevant).length === 0) return;

    pendingPushes.set(targetId, Object.assign({}, pendingPushes.get(targetId), relevant));

    if (throttleTimers.has(targetId)) return;

    const elapsed = Date.now() - (lastPushTimes.get(targetId) || 0);
    if (elapsed >= TRANSFORM_PUSH_THROTTLE_MS) {
        flushTransformPush(targetId);
    } else {
        const delay = TRANSFORM_PUSH_THROTTLE_MS - elapsed;
        throttleTimers.set(targetId, setTimeout(() => flushTransformPush(targetId), delay));
    }
}
