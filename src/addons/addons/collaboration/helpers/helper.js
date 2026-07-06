import * as constants from './constants.js';
import * as Y from 'yjs';
import * as OH from './observeHandlers.js';
import * as costumeSync from './costumeSync.js';
import * as soundSync from './soundSync.js';

const targetNameIdCache = new Map();

export function getTargetIdByName(targetName) {
    if (!constants.mutableRefs.vm || !targetName) {
        return null;
    }

    if (targetNameIdCache.has(targetName)) {
        const cachedId = targetNameIdCache.get(targetName);
        const target = constants.mutableRefs.vm.runtime.getTargetById(cachedId);
        if (target && target.getName() === targetName) {
            return cachedId;
        }
    }

    targetNameIdCache.clear();
    const targets = constants.mutableRefs.vm.runtime.targets;
    let foundId = null;

    for (const target of targets) {
        const name = target.getName();
        targetNameIdCache.set(name, target.id);
        if (name === targetName) {
            foundId = target.id;
        }
    }

    if (foundId) {
        return foundId;
    }

    
    return null;
}

export function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

export function getCurrentEditingTargetId() {
    try {
        return constants.mutableRefs.vm?.runtime?.getEditingTarget?.()?.id || null;
    } catch (e) {
        
        return null;
    }
}

export function serializeBlockForYjs(block) {
    const yBlockMap = new Y.Map();
    Object.keys(block).forEach(key => {
        if (typeof block[key] === 'object' && block[key] !== null) {
            yBlockMap.set(key, JSON.stringify(block[key]));
        } else if (block[key] !== undefined) {
            yBlockMap.set(key, block[key]);
        }
    });
    return yBlockMap;
}

export function deserializeBlockFromYjs(yBlockMap) {
    const block = {};
    const pathKeys = [];

    yBlockMap.forEach((value, key) => {
        if (key.startsWith('["')) {
            pathKeys.push({ key, value });
        } else if (key === 'inputs' || key === 'fields' || key === 'mutation') {
            try {
                block[key] = JSON.parse(value);
            } catch (e) {
                block[key] = value;
            }
        } else {
            block[key] = value;
        }
    });

    pathKeys.forEach(({ key, value }) => {
        try {
            const pathParts = JSON.parse(key);
            let current = block;
            for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!current[part]) current[part] = {};
                current = current[part];
            }
            current[pathParts[pathParts.length - 1]] = value;
        } catch (e) {
            block[key] = value;
        }
    });

    return block;
}

export function serializeVariableForYjs(variable) {
    const yVarMap = new Y.Map();
    yVarMap.set('id', variable.id);
    yVarMap.set('name', variable.name);
    yVarMap.set('type', variable.type);
    yVarMap.set('isCloud', variable.isCloud);
    if (Array.isArray(variable.value)) {
        yVarMap.set('value', JSON.stringify(variable.value));
    } else {
        yVarMap.set('value', variable.value);
    }
    return yVarMap;
}

export function serializeMonitorForYjs(monitor) {
    const yMonitorMap = new Y.Map();
    const monitorData = monitor.toJS ? monitor.toJS() : monitor;

    Object.keys(monitorData).forEach(key => {
        const val = monitorData[key];
        if (key === 'params' || (key === 'value' && Array.isArray(val))) {
            yMonitorMap.set(key, JSON.stringify(val));
        } else if (val !== undefined && val !== null) {
            yMonitorMap.set(key, val);
        }
    });
    return yMonitorMap;
}

export function deserializeMonitorFromYjs(yMonitorMap) {
    const monitor = {};

    if (!yMonitorMap || typeof yMonitorMap.forEach !== 'function') {
        return monitor;
    }

    yMonitorMap.forEach((value, key) => {
        if (key === 'params' || key === 'value') {
            try {
                monitor[key] = JSON.parse(value);
            } catch (e) {
                monitor[key] = value;
            }
        } else {
            monitor[key] = value;
        }
    });
    return monitor;
}

export function serializeCommentForYjs(comment) {
    const yCommentMap = new Y.Map();
    Object.keys(comment).forEach(key => {
        if (comment[key] !== undefined && comment[key] !== null) {
            yCommentMap.set(key, comment[key]);
        }
    });
    return yCommentMap;
}

export function deserializeCommentFromYjs(yCommentMap) {
    const comment = {};
    yCommentMap.forEach((value, key) => {
        comment[key] = value;
    });
    return comment;
}

export function serializeCostumeForYjs(costume) {
    const yCostumeMap = new Y.Map();
    yCostumeMap.set('id', costume.id);
    yCostumeMap.set('name', costume.name);
    yCostumeMap.set('assetId', costume.assetId);
    yCostumeMap.set('dataFormat', costume.dataFormat);
    yCostumeMap.set('md5ext', costume.md5 || `${costume.assetId}.${costume.dataFormat}`);
    yCostumeMap.set('rotationCenterX', costume.rotationCenterX);
    yCostumeMap.set('rotationCenterY', costume.rotationCenterY);
    yCostumeMap.set('bitmapResolution', costume.bitmapResolution || 1);
    return yCostumeMap;
}

export function deserializeCostumeFromYjs(yCostumeMap) {
    const costume = {};
    yCostumeMap.forEach((value, key) => {
        costume[key] = value;
    });
    if (!costume.md5 && costume.md5ext) costume.md5 = costume.md5ext;
    return costume;
}

export function serializeSoundForYjs(sound) {
    const ySoundMap = new Y.Map();
    ySoundMap.set('id', sound.id);
    ySoundMap.set('name', sound.name);
    ySoundMap.set('assetId', sound.assetId);
    ySoundMap.set('dataFormat', sound.dataFormat);
    ySoundMap.set('md5ext', sound.md5 || `${sound.assetId}.${sound.dataFormat}`);
    ySoundMap.set('format', sound.format || '');
    ySoundMap.set('rate', sound.rate);
    ySoundMap.set('sampleCount', sound.sampleCount);
    return ySoundMap;
}

export function deserializeSoundFromYjs(ySoundMap) {
    const sound = {};
    ySoundMap.forEach((value, key) => {
        sound[key] = value;
    });
    if (!sound.md5 && sound.md5ext) sound.md5 = sound.md5ext;
    return sound;
}

export function serializeSpriteForYjs(target) {
    const yMap = new Y.Map();
    yMap.set('id', target.id);
    yMap.set('name', target.getName());
    yMap.set('isStage', !!target.isStage);
    return yMap;
}

export async function uploadCollaborationAsset(runtime, asset) {
    if (!asset || !runtime.storage) {
        return;
    }

    const md5ext = `${asset.assetId}.${asset.dataFormat}`;
    const roomUUID = constants.mutableRefs.roomUUID;

    try {
        const uploadRoot = `${constants.apiHostURL}/v1/projects/blocks/assets/`; 
        
        let url = `${uploadRoot}${md5ext}?collaboration=true`;
        if (roomUUID) {
            url += `&room=${roomUUID}`;
        }

        const token = await runtime.storage.getProjectToken();
        if (!token) throw new Error("Could not retrieve project token from storage.");

        const response = await fetch(url, {
            method: 'POST',
            body: asset.data,
            headers: {
                'Content-Type': asset.assetType.contentType,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
        }
    } catch (e) {
        console.error(`Collaboration asset upload failed: ${e.message}`);
    }
}

export async function loadRemoteCostume(costumeData, runtime, retries = 3, existingCostume = null) {
    const costume = { ...costumeData };
    if (!costume.md5) costume.md5 = costume.md5ext;
    if (!costume.dataFormat && costume.md5ext) {
        costume.dataFormat = costume.md5ext.split('.').pop();
    }
    const assetType = costume.dataFormat === 'svg'
        ? runtime.storage.AssetType.ImageVector
        : runtime.storage.AssetType.ImageBitmap;
    try {
        const asset = await runtime.storage.load(assetType, costume.assetId, costume.dataFormat);
        if (!asset) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return loadRemoteCostume(costumeData, runtime, retries - 1, existingCostume);
            }
            return costume;
        }
        costume.asset = asset;
        return new Promise(resolve => {
            if (costume.dataFormat === 'svg') {
                const svgString = asset.decodeText();
                if (existingCostume && existingCostume.skinId !== undefined && existingCostume.dataFormat === 'svg') {
                    runtime.renderer.updateSVGSkin(existingCostume.skinId, svgString, [costume.rotationCenterX, costume.rotationCenterY]);
                    costume.skinId = existingCostume.skinId;
                } else {
                    costume.skinId = runtime.renderer.createSVGSkin(svgString, [costume.rotationCenterX, costume.rotationCenterY]);
                    if (existingCostume && existingCostume.skinId !== undefined) {
                        runtime.renderer.destroySkin(existingCostume.skinId);
                    }
                }
                costume.size = runtime.renderer.getSkinSize(costume.skinId);
                resolve(costume);
            } else {
                const image = new Image();
                image.onload = function () {
                    const resolution = costume.bitmapResolution || 1;
                    const center = [costume.rotationCenterX, costume.rotationCenterY];
                    if (existingCostume && existingCostume.skinId !== undefined && existingCostume.dataFormat !== 'svg') {
                        runtime.renderer.updateBitmapSkin(existingCostume.skinId, image, resolution,
                            [center[0] / resolution, center[1] / resolution]);
                        costume.skinId = existingCostume.skinId;
                    } else {
                        costume.skinId = runtime.renderer.createBitmapSkin(image, resolution, center);
                        if (existingCostume && existingCostume.skinId !== undefined) {
                            runtime.renderer.destroySkin(existingCostume.skinId);
                        }
                    }
                    const renderSize = runtime.renderer.getSkinSize(costume.skinId);
                    costume.size = [renderSize[0] * 2, renderSize[1] * 2];
                    resolve(costume);
                };
                image.onerror = function (err) {
                    resolve(costume);
                };
                image.src = asset.encodeDataURI();
            }
        });
    } catch (e) {
        return costume;
    }
}

export async function loadRemoteSound(soundData, runtime, retries = 3) {
    const sound = { ...soundData };
    if (!sound.md5) sound.md5 = sound.md5ext;
    
    try {
        const asset = await runtime.storage.load(runtime.storage.AssetType.Sound, sound.assetId, sound.dataFormat);
        if (!asset) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return loadRemoteSound(soundData, runtime, retries - 1);
            }
            return sound;
        }
        sound.asset = asset;
        return sound;
    } catch (e) {
        
        return sound;
    }
}

export function compareMonitorData(a, b) {
    const keysToCompare = [
        "id",
        "opcode",
        "params",
        "mode",
        "sliderMin",
        "sliderMax",
        "isDiscrete",
        "x",
        "y",
        "width",
        "height",
        "visible",
        "spriteName"
    ];

    return keysToCompare.every(key =>
        deepEqual(a[key], b[key])
    );
}

function normalizePrimitive(value) {
    return value === undefined ? null : value;
}

function deepEqual(x, y) {
    x = normalizePrimitive(x);
    y = normalizePrimitive(y);
    if (x === y) return true;

    if (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y)) {
        return true;
    }

    if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) {
        return false;
    }

    const keysX = Object.keys(x);
    const keysY = Object.keys(y);

    if (keysX.length !== keysY.length) return false;

    return keysX.every(k => deepEqual(x[k], y[k]));
}


export function clearLocalState() {
    const vm = constants.mutableRefs.vm;
    if (!vm) return;
    const targetsToDelete = vm.runtime.targets.filter(t => !t.isStage && t.isOriginal);
    targetsToDelete.forEach(target => {
        if (vm.deleteSpriteNoWarning !== undefined) {
            vm.deleteSpriteNoWarning(target.id, true);
        } else {
            vm.deleteSprite(target.id, true);
        }
    });
    const stage = vm.runtime.getTargetForStage();
    if (stage) {
        const blockIds = Object.keys(stage.blocks._blocks);
        blockIds.forEach(id => stage.blocks.deleteBlock(id));
        Object.keys(stage.comments).forEach(id => {
            delete stage.comments[id];
        });
    }

    vm.emitWorkspaceUpdate();
}


export function pushLocalStateToYjs() {
    const vm = constants.mutableRefs.vm;
    const Blockly = constants.mutableRefs.BlocklyInstance;
    const sharedBlocks = constants.mutableRefs.sharedBlocks;
    const sharedVariables = constants.mutableRefs.sharedVariables;
    const sharedMonitors = constants.mutableRefs.sharedMonitors;
    const sharedComments = constants.mutableRefs.sharedComments;
    const sharedCostumes = constants.mutableRefs.sharedCostumes;
    const sharedSounds = constants.mutableRefs.sharedSounds;
    const sharedSprites = constants.mutableRefs.sharedSprites;
    const sharedExtensions = constants.mutableRefs.sharedExtensions;

    if (!vm || !sharedBlocks || !sharedVariables || !sharedCostumes || !sharedSounds || !sharedSprites || !sharedExtensions) return;

    if (Blockly) Blockly.Events.setGroup('yjs-remote-sync');

    try {
        constants.mutableRefs.ydoc.transact(() => {
            const ySpriteArray = [];
            vm.runtime.targets.forEach(target => {
                const targetId = target.id;
                const targetName = target.getName();

                ySpriteArray.push(serializeSpriteForYjs(target));

                const yTargetBlockMap = new Y.Map();
                yTargetBlockMap.set('__targetName', targetName);
                Object.values(target.blocks._blocks).forEach(block => {
                    yTargetBlockMap.set(block.id, serializeBlockForYjs(block));
                });
                sharedBlocks.set(targetId, yTargetBlockMap);

                const yTargetVarMap = new Y.Map();
                Object.values(target.variables).forEach(variable => {
                    yTargetVarMap.set(variable.id, serializeVariableForYjs(variable));
                });
                sharedVariables.set(targetId, yTargetVarMap);

                const yTargetMap = new Y.Map();
                Object.values(target.comments).forEach(comment => {
                    yTargetMap.set(comment.id, serializeCommentForYjs(comment));
                });
                sharedComments.set(targetId, yTargetMap);

                const yCostumeArray = new Y.Array();
                if (target.sprite && target.sprite.costumes) {
                    target.sprite.costumes.forEach(costume => {
                        yCostumeArray.push([serializeCostumeForYjs(costume)]);
                    });
                }
                sharedCostumes.set(targetId, yCostumeArray);

                const ySoundArray = new Y.Array();
                if (target.sprite && target.sprite.sounds) {
                    target.sprite.sounds.forEach(sound => {
                        ySoundArray.push([serializeSoundForYjs(sound)]);
                    });
                }
                sharedSounds.set(targetId, ySoundArray);
            });

            sharedSprites.insert(0, ySpriteArray);

            vm.runtime.getMonitorState().forEach((monitor, id) => {
                sharedMonitors.set(id, serializeMonitorForYjs(monitor));
            });

            const extensionManager = vm.extensionManager;
            const extensionURLs = extensionManager.getExtensionURLs();
            const loadedExtensions = Array.from(extensionManager._loadedExtensions.keys()).map(id => {
                return { URL: extensionURLs[id] || id, name: id };
            });
            if (loadedExtensions.length > 0) {
                sharedExtensions.insert(0, loadedExtensions);
            }

        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    } finally {
        if (Blockly) Blockly.Events.setGroup(false);
    }
}

export async function pushTargetStateToYjs(target) {
    const targetId = target.id;
    const targetName = target.getName();
    const runtime = target.runtime;

    const costumePromises = target.getCostumes().map(async (costume) => {
        if (!costume.asset && costume.assetId && runtime.storage) {
            costume.asset = runtime.storage.get(costume.assetId);
        }
        if (costume.asset) {
            await uploadCollaborationAsset(runtime, costume.asset);
        }
    });
    const soundPromises = target.getSounds().map(sound => 
        uploadCollaborationAsset(runtime, sound.asset)
    );
    await Promise.all([...costumePromises, ...soundPromises]);

    constants.mutableRefs.ydoc.transact(() => {
        const yTargetBlockMap = new Y.Map();
        yTargetBlockMap.set('__targetName', targetName);
        Object.values(target.blocks._blocks).forEach(block => {
            yTargetBlockMap.set(block.id, serializeBlockForYjs(block));
        });
        constants.mutableRefs.sharedBlocks.set(targetId, yTargetBlockMap);
        const yTargetVarMap = new Y.Map();
        Object.values(target.variables).forEach(variable => {
            yTargetVarMap.set(variable.id, serializeVariableForYjs(variable));
        });
        constants.mutableRefs.sharedVariables.set(targetId, yTargetVarMap);
        const yTargetCommentMap = new Y.Map();
        Object.values(target.comments).forEach(comment => {
            yTargetCommentMap.set(comment.id, serializeCommentForYjs(comment));
        });
        constants.mutableRefs.sharedComments.set(targetId, yTargetCommentMap);
        const yCostumeArray = new Y.Array();
        const costumeElements = target.getCostumes().map(costume => serializeCostumeForYjs(costume));
        if (costumeElements.length > 0) yCostumeArray.push(costumeElements);
        constants.mutableRefs.sharedCostumes.set(targetId, yCostumeArray);
        const ySoundArray = new Y.Array();
        const soundElements = target.getSounds().map(sound => serializeSoundForYjs(sound));
        if (soundElements.length > 0) ySoundArray.push(soundElements);
        constants.mutableRefs.sharedSounds.set(targetId, ySoundArray);

    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

export function performInitialSync() {
    const vm = constants.mutableRefs.vm;
    const Blockly = constants.mutableRefs.BlocklyInstance;
    const sharedBlocks = constants.mutableRefs.sharedBlocks;
    const sharedVariables = constants.mutableRefs.sharedVariables;
    const sharedMonitors = constants.mutableRefs.sharedMonitors;
    const sharedComments = constants.mutableRefs.sharedComments;
    const sharedCostumes = constants.mutableRefs.sharedCostumes;
    const sharedSounds = constants.mutableRefs.sharedSounds;
    const sharedSprites = constants.mutableRefs.sharedSprites;
    const sharedExtensions = constants.mutableRefs.sharedExtensions;

    if (!vm || !sharedBlocks || !sharedVariables || !sharedMonitors || 
        !sharedComments || !sharedCostumes || !sharedSounds || !sharedSprites || !sharedExtensions) return;

    if (sharedBlocks.size === 0) {
        pushLocalStateToYjs();
        return;
    }

    if (Blockly) Blockly.Events.setGroup('yjs-remote-sync');

    try {
        sharedBlocks.forEach((yTargetMap, remoteId) => {
            const remoteName = yTargetMap.get('__targetName');
            if (remoteName) {
                const localTarget = vm.runtime.targets.find(t => t.getName() === remoteName);
                if (localTarget && localTarget.isStage && localTarget.id !== remoteId) {
                    vm.runtime.updateTargetId(localTarget, remoteId);
                }
            }
        });

        clearLocalState();
        const remoteSpriteList = sharedSprites.toArray();
        if (remoteSpriteList.length > 0) {
            const newTargetList = [];
            const localTargetsMap = new Map(vm.runtime.targets.map(t => [t.id, t]));
            
            remoteSpriteList.forEach(ySpriteMap => {
                const id = ySpriteMap.get('id');
                const name = ySpriteMap.get('name');
                const isStage = ySpriteMap.get('isStage');

                let target = localTargetsMap.get(id);

                if (!target && isStage) {
                    target = vm.runtime.getTargetForStage();
                    if (target) {
                        localTargetsMap.delete(target.id);
                        vm.runtime.updateTargetId(target, id);
                    }
                }

                if (target) {
                    newTargetList.push(target);
                    localTargetsMap.delete(id); 
                    if (target.getName() !== name) target.sprite.name = name;
                } else {
                    const newSprite = new constants.mutableRefs.vm.exports.Sprite(null, vm.runtime);
                    newSprite.name = name;
                    target = newSprite.createClone(isStage ? 'background' : 'sprite');
                    target.id = id;
                    target.originalTargetId = id;
                    vm.runtime.addTarget(target);
                    newTargetList.push(target);
                }
            });
            vm.runtime.targets = newTargetList;
            vm.runtime.executableTargets = [...newTargetList];
        }

        sharedBlocks.forEach((yTargetMap, targetId) => {
            const target = vm.runtime.getTargetById(targetId);
            if (!target) return;

            yTargetMap.forEach((yBlockMap, blockId) => {
                if (blockId === '__targetName') return;
                const blockData = deserializeBlockFromYjs(yBlockMap);
                target.blocks.createBlock(blockData);
            });
        });
        sharedVariables.forEach((yTargetVarMap, targetId) => {
            const target = vm.runtime.getTargetById(targetId);
            if (!target) return;

            const remoteVarIds = new Set(yTargetVarMap.keys());
            Object.keys(target.variables).forEach(varId => {
                if (!remoteVarIds.has(varId)) {
                    target.deleteVariable(varId, true);
                }
            });

            yTargetVarMap.forEach((yVarMap, varId) => {
                const name = yVarMap.get('name');
                const type = yVarMap.get('type');
                const isCloud = yVarMap.get('isCloud');
                let value = yVarMap.get('value');

                if (type === 'list') {
                    try { value = JSON.parse(value); } catch (e) { }
                }

                if (!target.variables[varId]) {
                    target.createVariable(varId, name, type, isCloud, true);
                }
                
                if (type === 'broadcast_msg') {
                    target.variables[varId].value = name;
                    target.variables[varId].name = name;
                    vm.runtime.targets.forEach(t => t.blocks.resetCache());
                } else {
                    target.variables[varId].value = value;
                }
            });
        });
        sharedComments.forEach((yTargetMap, targetId) => {
            const target = vm.runtime.getTargetById(targetId);
            if (!target) return;
            yTargetMap.forEach((yCommentMap, commentId) => {
                const commentData = deserializeCommentFromYjs(yCommentMap);
                target.createComment(
                    commentData.id, commentData.blockId, commentData.text,
                    commentData.x, commentData.y, commentData.width,
                    commentData.height, commentData.minimized, true
                );
            });
        });

        sharedMonitors.forEach((yMonitorMap, monitorId) => {
            const monitorData = deserializeMonitorFromYjs(yMonitorMap);
            vm.deserializeMonitor(monitorData);
        });

        sharedCostumes.forEach((yCostumeArray, targetId) => {
             const target = vm.runtime.getTargetById(targetId);
             if (!target || !target.sprite) return;
             const costumeList = yCostumeArray.map(yMap => deserializeCostumeFromYjs(yMap));
             
             Promise.all(costumeList.map(c => loadRemoteCostume(c, vm.runtime)))
                .then(loadedCostumes => {
                    if (loadedCostumes.length > 0) {
                        target.sprite.costumes = loadedCostumes;
                        target.currentCostume = 0;
                        target.setCostume(0);
                        target.updateAllDrawableProperties();
                    }
                });
        });

        sharedSounds.forEach((ySoundArray, targetId) => {
            const target = vm.runtime.getTargetById(targetId);
            if (!target || !target.sprite) return;
            const soundList = ySoundArray.map(yMap => deserializeSoundFromYjs(yMap));
            Promise.all(soundList.map(s => loadRemoteSound(s, vm.runtime)))
                .then(async loadedSounds => {
                    target.sprite.sounds = loadedSounds;
                    for (const sound of loadedSounds) {
                        if (sound.asset && target.sprite.soundBank) {
                            const player = await vm.runtime.audioEngine.decodeSoundPlayer({
                                ...sound, data: sound.asset.data
                            });
                            sound.soundId = player.id;
                            target.sprite.soundBank.addSoundPlayer(player);
                        }
                    }
                });
        });

        const remoteExtensions = sharedExtensions.toArray();
        remoteExtensions.forEach(ext => {
            const extObj = (typeof ext.toJSON === 'function') ? ext.toJSON() : ext;
            const extURL = extObj.URL || extObj;
            const extName = extObj.name || extObj;
            if (typeof extURL === 'string' && !vm.extensionManager.isExtensionLoaded(extName)) {
                
                vm.extensionManager.loadExtensionURL(extURL, false);
            }
        });

        // This might seem like a really stupid thing to do but its honestly the most effective way.
        vm.setEditingTarget(vm.runtime.getTargetForStage().id);
        if (vm.runtime.targets[1]) {
            vm.setEditingTarget(vm.runtime.targets[1].id);
        }
        if (Blockly) {
            Blockly.getMainWorkspace()?.refreshToolboxSelection_();
        }

    } finally {
        if (Blockly) Blockly.Events.setGroup(false);
    }

    
}

export function applyInitialSyncEventQueue() {
    if (constants.mutableRefs.initialSyncEvents.length === 0) return;

    const eventCount = constants.mutableRefs.initialSyncEvents.length;
    

    const Blockly = constants.mutableRefs.BlocklyInstance;
    const events = constants.mutableRefs.initialSyncEvents;
    
    Blockly.Events.setGroup('yjs-remote-sync');

    try {
        let globalNeedsWorkspaceRefresh = false;
        let globalNeedsToolboxRefresh = false;

        for (const item of events) {
            const { eventType, event } = item;

            switch (eventType) {
                case 'blocks': {
                    const [ws, tb] = OH.sharedBlocks(event);
                    globalNeedsWorkspaceRefresh = globalNeedsWorkspaceRefresh || ws;
                    globalNeedsToolboxRefresh = globalNeedsToolboxRefresh || tb;
                    break;
                }
                case 'variables': {
                    const ws = OH.sharedVariables(event);
                    globalNeedsWorkspaceRefresh = globalNeedsWorkspaceRefresh || ws;
                    break;
                }
                case 'monitors': {
                    OH.sharedMonitors(event);
                    break;
                }
                case 'comments': {
                    OH.sharedComments(event);
                    break;
                }
                case 'costumes': {
                    costumeSync.handleRemoteCostumeChanges(event);
                    break;
                }
                case 'sounds': {
                    soundSync.handleRemoteSoundChanges(event);
                    break;
                }
            }
        }

        OH.sharedBlocksRefresh(globalNeedsToolboxRefresh, globalNeedsWorkspaceRefresh);
        setTimeout(function() {
            const vm = constants.mutableRefs.vm;
            if (vm) {
                
                vm.emitTargetsUpdate();
            }
        },500);

    } catch (err) {
        
    } finally {
        constants.mutableRefs.initialSyncEvents = [];
        Blockly.Events.setGroup(false);
    }
}

export function applyQueuedEventsForTarget(targetId) {
    
    const events = constants.mutableRefs.initialSyncEvents;
    if (events.length === 0) return;

    

    const Blockly = constants.mutableRefs.BlocklyInstance;
    Blockly.Events.setGroup('yjs-remote-sync');

    try {
        let globalNeedsWorkspaceRefresh = false;
        let globalNeedsToolboxRefresh = false;

        for (let i = events.length - 1; i >= 0; i--) {
            const {eventType, event, targetId: eventTargetId} = events[i];
            
            if (eventTargetId === targetId) {
                switch (eventType) {
                    case 'blocks': {
                        const [ws, tb] = OH.sharedBlocks(event);
                        globalNeedsWorkspaceRefresh = globalNeedsWorkspaceRefresh || ws;
                        globalNeedsToolboxRefresh = globalNeedsToolboxRefresh || tb;
                        break;
                    }
                    case 'variables': {
                        globalNeedsWorkspaceRefresh = globalNeedsWorkspaceRefresh || OH.sharedVariables(event);
                        break;
                    }
                    case 'costumes': {
                        costumeSync.handleRemoteCostumeChanges(event);
                        break;
                    }
                    case 'sounds': {
                        soundSync.handleRemoteSoundChanges(event);
                        break;
                    }
                    case 'comments': {
                        OH.sharedComments(event);
                        break;
                    }
                }
                events.splice(i, 1);
            }
        }

        OH.sharedBlocksRefresh(globalNeedsToolboxRefresh, globalNeedsWorkspaceRefresh);
    } finally {
        Blockly.Events.setGroup(false);
    }
}
