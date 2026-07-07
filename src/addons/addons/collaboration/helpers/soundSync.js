import * as constants from './constants.js';
import * as helper from './helper.js';
import * as Y from 'yjs';

function getSharedSoundList(targetId) {
    if (!constants.mutableRefs.sharedSounds.has(targetId)) {
        constants.mutableRefs.sharedSounds.set(targetId, new Y.Array());
    }
    return constants.mutableRefs.sharedSounds.get(targetId);
}

export async function handleLocalSoundChange(targetId, [op, idParam, data]) {
    const eventGroup = constants.mutableRefs.BlocklyInstance?.Events.getGroup();
    if (eventGroup === 'yjs-remote-sync') return;
    if (constants.mutableRefs.isInitialRoomSync) return;
    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    if (!target) return;
    if (constants.mutableRefs.syncingSounds.has(targetId)) return;

    let realSound = target.getSounds().find(s => s.id === idParam);
    if (!realSound && typeof data === 'object' && data !== null) {
        realSound = target.getSounds().find(s => s.id === data.id);
    }

    if ((op === 'add' || op === 'update') && realSound?.asset) {
        const isAssetChange = op === 'add' || (data && (data.assetId || data.md5ext));
        if (isAssetChange) await helper.uploadCollaborationAsset(constants.mutableRefs.vm.runtime, realSound.asset);
    }

    constants.mutableRefs.ydoc.transact(() => {
        const ySoundList = getSharedSoundList(targetId);
        const sharedArray = ySoundList.toArray();
        const index = sharedArray.findIndex(yMap => yMap instanceof Y.Map && yMap.get('id') === idParam);
        try {
            switch (op) {
                case 'add':
                    if (realSound) {
                        const yMap = helper.serializeSoundForYjs(realSound);
                        const newIdx = target.getSounds().findIndex(s => s.id === realSound.id);
                        if (newIdx !== -1) ySoundList.insert(newIdx, [yMap]);
                        else ySoundList.push([yMap]);
                    }
                    break;
                case 'delete':
                    if (index !== -1) ySoundList.delete(index, 1);
                    break;
                case 'update':
                    if (index !== -1) {
                        const yMap = ySoundList.get(index);
                        if (data.name) yMap.set('name', data.name);
                        if (data.assetId || data.md5ext) {
                            yMap.set('assetId', realSound.assetId);
                            yMap.set('md5ext', realSound.md5 || realSound.md5ext);
                            yMap.set('sampleCount', realSound.sampleCount);
                            yMap.set('rate', realSound.rate);
                        }
                    }
                    break;
                case 'reorder': {
                    const movedId = idParam.id ?? (Array.isArray(idParam) ? idParam[0].id : null);
                    const newIndex = idParam.currentIndex ?? (Array.isArray(idParam) ? idParam[0].currentIndex : null);
                    if (!movedId || newIndex === null) break;
                    const oldIndexInY = sharedArray.findIndex(yMap => yMap instanceof Y.Map && yMap.get('id') === movedId);
                    if (oldIndexInY !== -1 && oldIndexInY !== newIndex) {
                        const item = ySoundList.get(oldIndexInY);
                        const content = item.toJSON();
                        const newMap = new Y.Map();
                        Object.keys(content).forEach(k => newMap.set(k, content[k]));
                        ySoundList.delete(oldIndexInY, 1);
                        ySoundList.insert(newIndex, [newMap]);
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
    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
    const ySoundList = constants.mutableRefs.sharedSounds.get(targetId);
    if (!target || !ySoundList) return;
    constants.mutableRefs.syncingSounds.add(targetId);
    try {
        const remoteSoundsData = ySoundList.toArray().map(yMap => yMap.toJSON());
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
        constants.mutableRefs.BlocklyInstance.Events.setGroup('yjs-remote-sync');
        const soundBank = target.sprite.soundBank;
        const keptPlayerIds = new Set(newSoundList.map(s => s.soundId).filter(Boolean));
        if (soundBank && soundBank.removeSoundPlayer) {
            currentSounds.forEach(oldSound => {
                if (oldSound.soundId && !keptPlayerIds.has(oldSound.soundId)) {
                    soundBank.removeSoundPlayer(oldSound.soundId);
                }
            });
        }
        target.sprite.sounds = newSoundList;
        for (const sound of newSoundList) {
            if (sound.asset && soundBank && !sound.soundId) {
                const player = await constants.mutableRefs.vm.runtime.audioEngine.decodeSoundPlayer({ ...sound, data: sound.asset.data });
                sound.soundId = player.id;
                soundBank.addSoundPlayer(player);
            }
        }
        if (constants.mutableRefs.vm.editingTarget?.id === target.id) constants.mutableRefs.vm.emitTargetsUpdate();
        constants.mutableRefs.vm.runtime.emitProjectChanged();
    } catch (e) { }
    finally { constants.mutableRefs.syncingSounds.delete(targetId); constants.mutableRefs.BlocklyInstance.Events.setGroup(false); }
}
