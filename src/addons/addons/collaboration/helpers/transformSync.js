import * as constants from './constants.js';

export const TRANSFORM_FIELDS = ['x', 'y', 'direction', 'size', 'rotationStyle', 'visible', 'draggable'];

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

export function applyTransformFromYjs(target, yMap) {
    const data = {};
    TRANSFORM_FIELDS.forEach(field => {
        const value = yMap.get(field);
        if (value !== undefined) data[field] = value;
    });

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
    const sharedSprites = constants.mutableRefs.sharedSprites;
    for (let i = 0; i < sharedSprites.length; i++) {
        const yMap = sharedSprites.get(i);
        if (yMap.get('id') === targetId) return yMap;
    }
    return null;
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
                if (TRANSFORM_FIELDS.includes(key)) yMap.set(key, properties[key]);
            });
        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    } finally {
        constants.mutableRefs.syncingTargets.delete(targetId);
    }
}

export function handleLocalTransformChange(targetId, properties) {
    if (constants.mutableRefs.syncingTargets.has(targetId)) return;

    const relevant = {};
    TRANSFORM_FIELDS.forEach(key => {
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
