import * as constants from './constants.js';
import * as helper from './helper.js';
import * as Y from 'yjs';

function getSharedSoundOrder(targetId) {
    if (!constants.mutableRefs.sharedSounds.has(targetId)) {
        constants.mutableRefs.sharedSounds.set(targetId, new Y.Array());
    }
    return constants.mutableRefs.sharedSounds.get(targetId);
}

function getSharedSoundData(targetId) {
    if (!constants.mutableRefs.sharedSoundData.has(targetId)) {
        constants.mutableRefs.sharedSoundData.set(targetId, new Y.Map());
    }
    return constants.mutableRefs.sharedSoundData.get(targetId);
}

export async function handleLocalSoundChange(targetId, [op, idParam, data]) {
    if (constants.isApplyingRemote()) return;
    if (constants.mutableRefs.isInitialRoomSync) return;
    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    if (!target) return;
    if (constants.mutableRefs.syncingSounds.has(targetId)) return;

    let realSound = target.getSounds().find(s => s.id === idParam);
    if (!realSound && typeof data === 'object' && data !== null) {
        realSound = target.getSounds().find(s => s.id === data.id);
    }

    let uploaded = true;
    if ((op === 'add' || op === 'update') && realSound?.asset) {
        const isAssetChange = op === 'add' || (data && (data.assetId || data.md5ext));
        if (isAssetChange) {
            uploaded = await helper.uploadCollaborationAsset(
                constants.mutableRefs.vm.runtime, realSound.asset);
        }
    }

    constants.mutableRefs.ydoc.transact(() => {
        const ySoundOrder = getSharedSoundOrder(targetId);
        const ySoundData = getSharedSoundData(targetId);
        try {
            switch (op) {
                case 'add':
                    if (realSound) {
                        ySoundData.set(realSound.id, helper.serializeSoundForYjs(realSound));
                        if (!ySoundOrder.toArray().includes(realSound.id)) {
                            const newIdx = target.getSounds().findIndex(s => s.id === realSound.id);
                            if (newIdx !== -1 && newIdx <= ySoundOrder.length) ySoundOrder.insert(newIdx, [realSound.id]);
                            else ySoundOrder.push([realSound.id]);
                        }
                    }
                    break;
                case 'delete': {
                    const index = ySoundOrder.toArray().indexOf(idParam);
                    if (index !== -1) ySoundOrder.delete(index, 1);
                    if (ySoundData.has(idParam)) ySoundData.delete(idParam);
                    break;
                }
                case 'update': {
                    const yMap = ySoundData.get(idParam);
                    if (yMap) {
                        if (data.name) yMap.set('name', data.name);
                        if (uploaded && (data.assetId || data.md5ext)) {
                            yMap.set('assetId', realSound.assetId);
                            yMap.set('md5ext', realSound.md5 || realSound.md5ext);
                            yMap.set('sampleCount', realSound.sampleCount);
                            yMap.set('rate', realSound.rate);
                        }
                    }
                    break;
                }
                case 'reorder': {
                    const movedId = idParam.id ?? (Array.isArray(idParam) ? idParam[0].id : null);
                    const newIndex = idParam.currentIndex ?? (Array.isArray(idParam) ? idParam[0].currentIndex : null);
                    if (!movedId || newIndex === null) break;
                    const oldIndexInY = ySoundOrder.toArray().indexOf(movedId);
                    if (oldIndexInY !== -1 && oldIndexInY !== newIndex) {
                        ySoundOrder.delete(oldIndexInY, 1);
                        ySoundOrder.insert(Math.min(newIndex, ySoundOrder.length), [movedId]);
                    }
                    break;
                }
            }
        } catch (e) { }
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

let remoteSyncTimeouts = new Map();

export function handleRemoteSoundChanges(events) {
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
        const timeoutId = setTimeout(() => { syncRemoteToLocal(targetId); remoteSyncTimeouts.delete(targetId); }, 10);
        remoteSyncTimeouts.set(targetId, timeoutId);
    });
}

async function syncRemoteToLocal(targetId) {
    if (constants.mutableRefs.syncingSounds.has(targetId)) return;
    const order = constants.mutableRefs.sharedSounds;
    const data = constants.mutableRefs.sharedSoundData;
    if (!order || !data) return;
    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    const ySoundOrder = order.get(targetId);
    const ySoundData = data.get(targetId);
    if (!target || !ySoundOrder || !ySoundData) return;
    constants.mutableRefs.syncingSounds.add(targetId);
    let previousGroup = null;
    let groupWasSet = false;
    try {
        const remoteSoundsData = helper.resolveOrderedEntries(ySoundOrder, ySoundData)
            .map(yMap => yMap.toJSON());
        const currentSounds = target.getSounds();
        const loadPromises = remoteSoundsData.map(async (remoteMeta) => {
            let existingMatch = currentSounds.find(s => s.id === remoteMeta.id);
            if (existingMatch && (existingMatch.md5 || existingMatch.md5ext) !== remoteMeta.md5ext) existingMatch = null;
            if (existingMatch) return { existing: existingMatch, meta: remoteMeta };
            const loaded = await helper.loadRemoteSound(remoteMeta, constants.mutableRefs.vm.runtime);
            return { loaded: loaded, meta: remoteMeta };
        });
        const results = await Promise.all(loadPromises);
        const newSoundList = results.map(result => {
            let finalSound;
            if (result.loaded) { finalSound = result.loaded; finalSound.id = result.meta.id; }
            else { finalSound = Object.assign({}, result.existing); finalSound.id = result.meta.id; finalSound.name = result.meta.name; }
            return finalSound;
        });
        const soundBank = target.sprite.soundBank;

        const decodedPlayers = [];
        for (const sound of newSoundList) {
            if (sound.asset && soundBank && !sound.soundId) {
                const player = await constants.mutableRefs.vm.runtime.audioEngine.decodeSoundPlayer({ ...sound, data: sound.asset.data });
                decodedPlayers.push([sound, player]);
            }
        }

        previousGroup = constants.mutableRefs.BlocklyInstance.Events.getGroup();
        groupWasSet = true;
        constants.mutableRefs.BlocklyInstance.Events.setGroup('yjs-remote-sync');
        constants.beginRemoteApply();
        const keptPlayerIds = new Set(newSoundList.map(s => s.soundId).filter(Boolean));
        if (soundBank && soundBank.removeSoundPlayer) {
            currentSounds.forEach(oldSound => {
                if (oldSound.soundId && !keptPlayerIds.has(oldSound.soundId)) {
                    soundBank.removeSoundPlayer(oldSound.soundId);
                }
            });
        }
        target.sprite.sounds = newSoundList;
        decodedPlayers.forEach(([sound, player]) => {
            sound.soundId = player.id;
            soundBank.addSoundPlayer(player);
        });
        if (constants.mutableRefs.vm.editingTarget?.id === target.id) constants.mutableRefs.vm.emitTargetsUpdate();
        constants.mutableRefs.vm.runtime.emitProjectChanged();
    } catch (e) { }
    finally {
        constants.mutableRefs.syncingSounds.delete(targetId);
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
