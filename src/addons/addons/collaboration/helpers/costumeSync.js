import * as constants from './constants.js';
import * as helper from './helper.js';
import * as Y from 'yjs';

function getSharedCostumeList(targetId) {
    if (!constants.mutableRefs.sharedCostumes.has(targetId)) {
        
        constants.mutableRefs.sharedCostumes.set(targetId, new Y.Array());
    }
    return constants.mutableRefs.sharedCostumes.get(targetId);
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
    const eventGroup = constants.mutableRefs.BlocklyInstance?.Events.getGroup();
    if (eventGroup === 'yjs-remote-sync') {
        return;
    }
    if (constants.mutableRefs.isInitialRoomSync) return;


    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    if (!target) return;
    
    const targetName = target.getName();
    
    if (constants.mutableRefs.syncingCostumes.has(targetId)) {
        return;
    }

    let realCostume = target.getCostumes().find(c => c.id === idParam);
    if (!realCostume && typeof data === 'object') {
        realCostume = target.getCostumes().find(c => c === data);
    }

    if (op === 'add' || op === 'update') {
        if (realCostume && realCostume.asset) {
            const isAssetChange = op === 'add' || (data && (data.assetId || data.md5ext || data.md5));
            if (isAssetChange) {
                await helper.uploadCollaborationAsset(constants.mutableRefs.vm.runtime, realCostume.asset);
            }
        }
    }

    constants.mutableRefs.ydoc.transact(() => {
        const yCostumeList = getSharedCostumeList(targetId);
        try {
            switch (op) {
                case 'add':
                    performSyncAdd(target, yCostumeList, realCostume);
                    break;
                case 'delete':
                    performSyncDelete(yCostumeList, idParam);
                    break;
                case 'update':
                    performSyncUpdate(target, yCostumeList, idParam, data);
                    break;
                case 'reorder':
                    handleLocalReorder(yCostumeList, idParam);
                    break;
            }
        } catch (e) {
            
        }
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

function performSyncAdd(target, yCostumeList, realCostume) {
    if (!realCostume) return;
    const yMap = new Y.Map();
    const serialized = serializeCostume(realCostume);
    Object.keys(serialized).forEach(key => yMap.set(key, serialized[key]));
    const currentCostumes = target.getCostumes();
    const newIndex = currentCostumes.findIndex(c => c.id === realCostume.id);
    if (newIndex === -1) {
        yCostumeList.push([yMap]);
    } else {
        yCostumeList.insert(newIndex, [yMap]);
    }
}

function performSyncDelete(yCostumeList, costumeId) {
    const sharedArray = yCostumeList.toArray();
    const index = sharedArray.findIndex(yMap => yMap instanceof Y.Map && yMap.get('id') === costumeId);
    if (index !== -1) yCostumeList.delete(index, 1);
}

function performSyncUpdate(target, yCostumeList, costumeId, updateData) {
    const sharedArray = yCostumeList.toArray();
    const index = sharedArray.findIndex(yMap => yMap instanceof Y.Map && yMap.get('id') === costumeId);
    if (index === -1) return;
    const yMap = yCostumeList.get(index);
    const realCostume = target.getCostumes().find(c => c.id === costumeId);
    if (!realCostume) return;
    if (updateData.assetId || updateData.md5ext || updateData.md5) {
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

function handleLocalReorder(yCostumeList, reorderData) {
    const movedId = reorderData.id ?? (Array.isArray(reorderData) ? reorderData[0].id : null);
    const newIndex = reorderData.currentIndex ?? (Array.isArray(reorderData) ? reorderData[0].currentIndex : null);
    if (!movedId || newIndex === null) return;
    const sharedArray = yCostumeList.toArray();
    const oldIndex = sharedArray.findIndex(yMap => yMap instanceof Y.Map && yMap.get('id') === movedId);
    if (oldIndex !== -1 && oldIndex !== newIndex) {
        const itemToMove = yCostumeList.get(oldIndex);
        const content = itemToMove.toJSON(); 
        const newMap = new Y.Map();
        Object.keys(content).forEach(k => newMap.set(k, content[k]));
        yCostumeList.delete(oldIndex, 1);
        yCostumeList.insert(newIndex, [newMap]);
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
    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    const yCostumeList = constants.mutableRefs.sharedCostumes.get(targetId);
    if (!target || !yCostumeList) return;

    constants.mutableRefs.syncingCostumes.add(targetId);

    try {
        const remoteCostumesData = yCostumeList.toArray().map(yMap => yMap.toJSON());
        const currentCostumes = target.getCostumes();
        
        const loadPromises = remoteCostumesData.map(async (remoteMeta) => {
            let existingMatch = currentCostumes.find(c => c.id === remoteMeta.id);
            let staleMatch = null;
            if (existingMatch && (existingMatch.md5 || existingMatch.md5ext) !== remoteMeta.md5ext) {
                staleMatch = existingMatch;
                existingMatch = null;
            }
            if (!existingMatch) {
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
                finalCostume.rotationCenterX = meta.rotationCenterX;
                finalCostume.rotationCenterY = meta.rotationCenterY;
                finalCostume.bitmapResolution = meta.bitmapResolution;
            }
            return finalCostume;
        });

        constants.mutableRefs.BlocklyInstance.Events.setGroup('yjs-remote-sync');
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
        setTimeout(function() {
            const vm = constants.mutableRefs.vm;
            if (vm) {
                vm.emitTargetsUpdate();
            }
        },500);
        constants.mutableRefs.vm.runtime.emitProjectChanged();
    } catch (e) {
        
    } finally {
        constants.mutableRefs.syncingCostumes.delete(targetId);
        constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
    }
}
