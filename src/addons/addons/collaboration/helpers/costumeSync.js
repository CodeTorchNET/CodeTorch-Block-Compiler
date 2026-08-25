import * as constants from './constants.js';
import * as helper from './helper.js';
import * as costumeArtSync from './costumeArtSync.js';
import * as recorder from './recorder.js';
import * as Y from 'yjs';

function getSharedCostumeOrder(targetId) {
    if (!constants.mutableRefs.sharedCostumes.has(targetId)) {
        constants.mutableRefs.sharedCostumes.set(targetId, new Y.Array());
    }
    return constants.mutableRefs.sharedCostumes.get(targetId);
}

function getSharedCostumeData(targetId) {
    if (!constants.mutableRefs.sharedCostumeData.has(targetId)) {
        constants.mutableRefs.sharedCostumeData.set(targetId, new Y.Map());
    }
    return constants.mutableRefs.sharedCostumeData.get(targetId);
}

function serializeCostume(costume) {
    return {
        id: costume.id,
        name: costume.name,
        assetId: costume.assetId,
        dataFormat: costume.dataFormat,
        md5ext: costume.md5 || `${costume.assetId}.${costume.dataFormat}`,
        rotationCenterX: costume.rotationCenterX,
        rotationCenterY: costume.rotationCenterY,
        bitmapResolution: costume.bitmapResolution || 1
    };
}

export async function handleLocalCostumeChange(targetId, [op, idParam, data]) {
    if (constants.isApplyingRemote()) {
        recorder.record('local.costume.skip', {op, target: targetId, why: 'applying-remote'});
        return;
    }
    if (constants.mutableRefs.isInitialRoomSync) {
        recorder.record('local.costume.skip', {op, target: targetId, why: 'initial-sync'});
        return;
    }

    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    if (!target) {
        recorder.record('local.costume.skip', {op, target: targetId, why: 'no-target'});
        return;
    }
    
    const targetName = target.getName();
    
    if (constants.mutableRefs.syncingCostumes.has(targetId)) {
        recorder.record('local.costume.skip', {op, target: targetId, why: 'rebuilding'});
        return;
    }

    let realCostume = target.getCostumes().find(c => c.id === idParam);
    if (!realCostume && typeof data === 'object') {
        realCostume = target.getCostumes().find(c => c === data);
    }

    let docBacked = realCostume && costumeArtSync.isDocBacked(realCostume.id);

    const knownFormat = realCostume ? formatInDocument(targetId, realCostume.id) : null;
    const formatChanged = op === 'update' && realCostume && data && data.dataFormat &&
        knownFormat && knownFormat !== data.dataFormat;

    const replayEcho = formatChanged && data.dataFormat !== 'svg' &&
        costumeArtSync.isReplayEcho(realCostume.id);
    const convertedFormat = formatChanged && !replayEcho;
    if (convertedFormat) {
        docBacked = false;
        costumeArtSync.forgetArt(realCostume.id, data.dataFormat);
    }

    let uploaded = true;
    if (op === 'add' || op === 'update') {
        if (realCostume && realCostume.asset && !docBacked) {
            const isAssetChange = op === 'add' || (data && (data.assetId || data.md5ext || data.md5));
            if (isAssetChange) {
                uploaded = await helper.uploadCollaborationAsset(
                    constants.mutableRefs.vm.runtime, realCostume.asset);
                if (!uploaded) {
                    recorder.record('local.costume.upload-failed',
                        {costume: realCostume.id, target: targetId, op});
                }
            }
        }
    }

    constants.mutableRefs.ydoc.transact(() => {
        const yCostumeOrder = getSharedCostumeOrder(targetId);
        const yCostumeData = getSharedCostumeData(targetId);
        try {
            switch (op) {
                case 'add':
                    performSyncAdd(target, yCostumeOrder, yCostumeData, realCostume);
                    break;
                case 'delete':
                    performSyncDelete(yCostumeOrder, yCostumeData, idParam);
                    break;
                case 'update':
                    performSyncUpdate(target, yCostumeData, idParam, data, docBacked, uploaded);
                    break;
                case 'reorder':
                    handleLocalReorder(yCostumeOrder, idParam);
                    break;
            }
        } catch (e) {
            recorder.record('local.costume.error', {op, target: targetId, message: String(e)});
        }
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);

    recorder.record(`local.costume.${op}`, {
        target: targetId,
        subject: op === 'reorder' ? idParam : ((realCostume && realCostume.id) || idParam),
        docBacked,
        converted: convertedFormat || undefined,
        echo: replayEcho || undefined
    });
}

function formatInDocument(targetId, costumeId) {
    const yData = constants.mutableRefs.sharedCostumeData &&
        constants.mutableRefs.sharedCostumeData.get(targetId);
    const entry = yData && yData.get(costumeId);
    return entry ? (entry.get('dataFormat') || null) : null;
}

function performSyncAdd(target, yCostumeOrder, yCostumeData, realCostume) {
    if (!realCostume) return;

    costumeArtSync.createArt(realCostume.id);
    const yMap = new Y.Map();
    const serialized = serializeCostume(realCostume);
    Object.keys(serialized).forEach(key => yMap.set(key, serialized[key]));
    yCostumeData.set(realCostume.id, yMap);
    if (yCostumeOrder.toArray().includes(realCostume.id)) return;
    const currentCostumes = target.getCostumes();
    const newIndex = currentCostumes.findIndex(c => c.id === realCostume.id);
    if (newIndex === -1 || newIndex > yCostumeOrder.length) {
        yCostumeOrder.push([realCostume.id]);
    } else {
        yCostumeOrder.insert(newIndex, [realCostume.id]);
    }
}

function performSyncDelete(yCostumeOrder, yCostumeData, costumeId) {
    const index = yCostumeOrder.toArray().indexOf(costumeId);
    if (index !== -1) yCostumeOrder.delete(index, 1);
    if (yCostumeData.has(costumeId)) yCostumeData.delete(costumeId);
}

function performSyncUpdate(target, yCostumeData, costumeId, updateData, docBacked, uploaded) {
    const yMap = yCostumeData.get(costumeId);
    if (!yMap) return;
    const realCostume = target.getCostumes().find(c => c.id === costumeId);
    if (!realCostume) return;

    if (uploaded && !docBacked &&
            (updateData.assetId || updateData.md5ext || updateData.md5 || updateData.dataFormat)) {
        yMap.set('assetId', realCostume.assetId);
        yMap.set('md5ext', realCostume.md5 || realCostume.md5ext);
        yMap.set('dataFormat', realCostume.dataFormat);
        yMap.set('bitmapResolution', realCostume.bitmapResolution || 1);
        yMap.set('rotationCenterX', realCostume.rotationCenterX);
        yMap.set('rotationCenterY', realCostume.rotationCenterY);
    }
    if (updateData.name) yMap.set('name', updateData.name);
    if (updateData.rotationCenterX !== undefined) yMap.set('rotationCenterX', Number(updateData.rotationCenterX));
    if (updateData.rotationCenterY !== undefined) yMap.set('rotationCenterY', Number(updateData.rotationCenterY));
}

function handleLocalReorder(yCostumeOrder, reorderData) {
    const movedId = reorderData.id ?? (Array.isArray(reorderData) ? reorderData[0].id : null);
    const newIndex = reorderData.currentIndex ?? (Array.isArray(reorderData) ? reorderData[0].currentIndex : null);
    if (!movedId || newIndex === null) return;
    const oldIndex = yCostumeOrder.toArray().indexOf(movedId);
    if (oldIndex !== -1 && oldIndex !== newIndex) {
        yCostumeOrder.delete(oldIndex, 1);
        yCostumeOrder.insert(Math.min(newIndex, yCostumeOrder.length), [movedId]);
    }
}

let remoteSyncTimeouts = new Map();

export function handleRemoteCostumeChanges(events) {
    const eventArray = Array.isArray(events) ? events : [events];
    if (eventArray.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN)) return;

    const targetsToSync = new Set();
    eventArray.forEach(event => {
        if (event.path.length > 0) {
            targetsToSync.add(event.path[0]);
        } else {
            event.changes.keys.forEach((change, targetId) => {
                targetsToSync.add(targetId);
            });
        }
    });

    targetsToSync.forEach(targetId => {
        if (remoteSyncTimeouts.has(targetId)) clearTimeout(remoteSyncTimeouts.get(targetId));
        const timeoutId = setTimeout(() => {
            syncRemoteToLocal(targetId);
            remoteSyncTimeouts.delete(targetId);
        }, 10);
        remoteSyncTimeouts.set(targetId, timeoutId);
    });
}

async function syncRemoteToLocal(targetId) {
    if (constants.mutableRefs.syncingCostumes.has(targetId)) return;
    const order = constants.mutableRefs.sharedCostumes;
    const data = constants.mutableRefs.sharedCostumeData;
    if (!order || !data) return;
    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    const yCostumeOrder = order.get(targetId);
    const yCostumeData = data.get(targetId);
    if (!target || !yCostumeOrder || !yCostumeData) return;

    constants.mutableRefs.syncingCostumes.add(targetId);
    let previousGroup = null;
    let groupWasSet = false;

    try {
        const remoteCostumesData = helper.resolveOrderedEntries(yCostumeOrder, yCostumeData)
            .map(yMap => yMap.toJSON());
        const currentCostumes = target.getCostumes();
        
        const loadPromises = remoteCostumesData.map(async (remoteMeta) => {
            let existingMatch = currentCostumes.find(c => c.id === remoteMeta.id);
            let staleMatch = null;

            const docBacked = costumeArtSync.isShapeBacked(remoteMeta.id) ||
                (costumeArtSync.isDocBacked(remoteMeta.id) &&
                    !constants.mutableRefs.isInitialRoomSync &&
                    costumeArtSync.replaysLive(remoteMeta.id));
            if (existingMatch && !docBacked &&
                (existingMatch.md5 || existingMatch.md5ext) !== remoteMeta.md5ext) {
                staleMatch = existingMatch;
                existingMatch = null;
            }
            if (!existingMatch && !docBacked) {
                existingMatch = currentCostumes.find(c =>
                    c.assetId === remoteMeta.assetId && (c.md5 === remoteMeta.md5ext || c.md5ext === remoteMeta.md5ext)
                );
            }
            if (existingMatch) return { existing: existingMatch, meta: remoteMeta };
            const loaded = await helper.loadRemoteCostume(remoteMeta, constants.mutableRefs.vm.runtime, 3, staleMatch);
            return { loaded: loaded, meta: remoteMeta };
        });

        const results = await Promise.all(loadPromises);
        const newCostumeList = results.map(result => {
            const { existing, loaded, meta } = result;
            let finalCostume;
            if (loaded) {
                finalCostume = loaded;
                finalCostume.id = meta.id;
            } else {
                finalCostume = Object.assign({}, existing);
                finalCostume.id = meta.id;
                finalCostume.name = meta.name;
                if (!costumeArtSync.isDocBacked(meta.id)) {
                    finalCostume.rotationCenterX = meta.rotationCenterX;
                    finalCostume.rotationCenterY = meta.rotationCenterY;
                }
                finalCostume.bitmapResolution = meta.bitmapResolution;
            }
            return finalCostume;
        });

        previousGroup = constants.mutableRefs.BlocklyInstance.Events.getGroup();
        groupWasSet = true;
        constants.mutableRefs.BlocklyInstance.Events.setGroup('yjs-remote-sync');
        constants.beginRemoteApply();
        target.sprite.costumes = newCostumeList;
        if (target.currentCostume >= newCostumeList.length) {
            target.currentCostume = Math.max(0, newCostumeList.length - 1);
        }
        target.setCostume(target.currentCostume);
        target.updateAllDrawableProperties();
        const keptSkinIds = new Set(newCostumeList.map(c => c.skinId).filter(id => id !== undefined));
        currentCostumes.forEach(oldCostume => {
            if (oldCostume.skinId !== undefined && !keptSkinIds.has(oldCostume.skinId)) {
                constants.mutableRefs.vm.runtime.renderer.destroySkin(oldCostume.skinId);
            }
        });

        const redrawn = [];
        for (const costume of newCostumeList) {
            if (!costume || !costumeArtSync.isShapeBacked(costume.id)) continue;
            try {
                costumeArtSync.applyRemoteArt(costume.id);
                redrawn.push(costume.id);
            } catch (e) {
                console.warn('[collaboration] could not redraw a rebuilt costume', e);
            }
        }

        if (recorder.isRecording()) {
            recorder.record('remote.costume.rebuild', {
                target: targetId,
                fetched: results.filter(entry => entry.loaded).map(entry => entry.meta.id),
                kept: results.filter(entry => !entry.loaded).map(entry => entry.meta.id),
                redrawn
            });
        }

        setTimeout(function() {
            const vm = constants.mutableRefs.vm;
            if (vm) {
                vm.emitTargetsUpdate();
            }
        },500);
        constants.mutableRefs.vm.runtime.emitProjectChanged();
    } catch (e) {
        recorder.record('remote.costume.error', {target: targetId, message: String(e)});
    } finally {
        constants.mutableRefs.syncingCostumes.delete(targetId);
        if (groupWasSet) {
            constants.endRemoteApply();
            constants.mutableRefs.BlocklyInstance.Events.setGroup(previousGroup || false);
        }
    }
}

export function reset() {
    for (const timer of remoteSyncTimeouts.values()) clearTimeout(timer);
    remoteSyncTimeouts.clear();
}
