import * as constants from './constants.js';
import * as Y from 'yjs';
import * as transformSync from './transformSync.js';

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

export function publishBlocksToYjs(targetId, repaired) {
    const vm = constants.mutableRefs.vm;
    const sharedBlocks = constants.mutableRefs.sharedBlocks;
    const ydoc = constants.mutableRefs.ydoc;
    if (!vm || !sharedBlocks || !ydoc || !repaired || repaired.size === 0) return;
    if (constants.mutableRefs.isInitialRoomSync) return;

    const target = vm.runtime.getTargetById(targetId);
    if (!target) return;

    const yTargetBlockMap = sharedBlocks.get(targetId);
    if (!yTargetBlockMap) return;

    ydoc.transact(() => {
        repaired.forEach((props, blockId) => {
            const block = target.blocks.getBlock(blockId);
            if (!block) {
                if (yTargetBlockMap.has(blockId)) yTargetBlockMap.delete(blockId);
                return;
            }

            const yBlock = yTargetBlockMap.get(blockId);
            if (!yBlock) {
                yTargetBlockMap.set(blockId, serializeBlockForYjs(block));
                return;
            }
            const write = props || Object.keys(block);
            write.forEach(prop => writeBlockProp(yBlock, block, prop));
        });
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

function writeBlockProp(yBlock, block, prop) {
    if (!prop.startsWith('["')) {
        const value = block[prop];
        if (value === undefined) {
            if (yBlock.has(prop)) yBlock.delete(prop);
        } else if (typeof value === 'object' && value !== null) {
            yBlock.set(prop, JSON.stringify(value));
        } else {
            yBlock.set(prop, value);
        }
        return;
    }

    let parts;
    try {
        parts = JSON.parse(prop);
    } catch (e) {
        return;
    }
    let value = block;
    for (const part of parts) {
        if (value === null || typeof value !== 'object') return;
        value = value[part];
    }
    yBlock.set(prop, value === undefined ? null : value);
}

export function cancelDragOf(blockId) {
    const workspace = constants.editorWorkspace();
    const gesture = workspace && workspace.currentGesture_;
    if (!gesture || typeof gesture.cancel !== 'function') return false;
    if (typeof gesture.isDragging === 'function' && !gesture.isDragging()) return false;

    const dragging = gesture.blockDragger_ && gesture.blockDragger_.draggingBlock_;
    if (!dragging || dragging.id !== blockId) return false;

    gesture.cancel();
    return true;
}

export function referencesAGhost(blocks, blockId, yBlocks) {
    const block = blocks[blockId];
    if (!block || !yBlocks) return false;

    const missing = id => id && !blocks[id] && !yBlocks.has(id);
    if (missing(block.parent)) return true;
    if (missing(block.next)) return true;
    for (const name in block.inputs) {
        const input = block.inputs[name];
        if (!input) continue;
        if (missing(input.block) || missing(input.shadow)) return true;
    }
    return false;
}

export function parentChainLoops(blocks, blockId) {
    const seen = new Set();
    let current = blockId;
    while (current && blocks[current]) {
        if (seen.has(current)) return true;
        seen.add(current);
        current = blocks[current].parent;
    }
    return false;
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
                if (!current[part]) {
                    current[part] = (pathParts[0] === 'inputs' && i === 1)
                        ? { name: part, block: null, shadow: null }
                        : {};
                }
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
    const transform = transformSync.serializeTransformFields(target);
    Object.keys(transform).forEach(key => yMap.set(key, transform[key]));
    const state = transformSync.serializeStateFields(target);
    Object.keys(state).forEach(key => yMap.set(key, state[key]));
    if (!target.isStage && typeof target.getLayerOrder === 'function') {
        const layerOrder = target.getLayerOrder();
        if (typeof layerOrder === 'number') yMap.set('layerOrder', layerOrder);
    }
    return yMap;
}

const KEEPALIVE_MAX_BYTES = 60 * 1024;

export async function uploadCollaborationAsset(runtime, asset, opts = {}) {
    if (!asset || !runtime.storage) {
        return false;
    }

    const md5ext = `${asset.assetId}.${asset.dataFormat}`;
    const roomUUID = constants.mutableRefs.roomUUID;

    try {
        const uploadRoot = `${constants.apiHostURL}/v1/projects/blocks/assets/`; 
        
        let url = `${uploadRoot}${md5ext}?collaboration=true`;
        if (roomUUID) {
            url += `&room=${roomUUID}`;
        }

        const token = (opts.urgent && runtime.storage.projectToken) ?
            runtime.storage.projectToken :
            await runtime.storage.getProjectToken();
        if (!token) throw new Error("Could not retrieve project token from storage.");

        const request = {
            method: 'POST',
            body: asset.data,
            headers: {
                'Content-Type': asset.assetType.contentType,
                'Authorization': `Bearer ${token}`
            }
        };

        if (opts.urgent && asset.data && asset.data.byteLength <= KEEPALIVE_MAX_BYTES) {
            request.keepalive = true;
        }

        const response = await fetch(url, request);

        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
        }
        return true;
    } catch (e) {
        console.error(`Collaboration asset upload failed: ${e.message}`);
        return false;
    }
}

function reportMissingBytes(kind, record, why) {
    console.warn(`[collaboration] ${kind} "${record.name || record.id}" arrived without its bytes ` +
        `(${record.md5 || record.md5ext || record.assetId}): ${why}. It will have a record and no ` +
        'picture or sound until somebody republishes it.');
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
            reportMissingBytes('costume', costume, 'the asset store had nothing under that id');
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
                    reportMissingBytes('costume', costume, `the image would not decode (${err && err.type})`);
                    resolve(costume);
                };
                image.src = asset.encodeDataURI();
            }
        });
    } catch (e) {
        reportMissingBytes('costume', costume, String(e));
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
            reportMissingBytes('sound', sound, 'the asset store had nothing under that id');
            return sound;
        }
        sound.asset = asset;
        return sound;
    } catch (e) {
        reportMissingBytes('sound', sound, String(e));
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
        const yCostumeOrder = new Y.Array();
        const yCostumeMap = new Y.Map();
        target.getCostumes().forEach(costume => {
            yCostumeMap.set(costume.id, serializeCostumeForYjs(costume));
            yCostumeOrder.push([costume.id]);
        });
        constants.mutableRefs.sharedCostumes.set(targetId, yCostumeOrder);
        constants.mutableRefs.sharedCostumeData.set(targetId, yCostumeMap);
        const ySoundOrder = new Y.Array();
        const ySoundMap = new Y.Map();
        target.getSounds().forEach(sound => {
            ySoundMap.set(sound.id, serializeSoundForYjs(sound));
            ySoundOrder.push([sound.id]);
        });
        constants.mutableRefs.sharedSounds.set(targetId, ySoundOrder);
        constants.mutableRefs.sharedSoundData.set(targetId, ySoundMap);

    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

function applyYjsBlocksToTarget(target, yTargetMap) {
    const alreadyHere = [];
    yTargetMap.forEach((yBlockMap, blockId) => {
        if (blockId === '__targetName') return;
        const blockData = deserializeBlockFromYjs(yBlockMap);
        if (target.blocks.getBlock(blockId)) {
            alreadyHere.push([blockId, blockData]);
            return;
        }
        target.blocks.createBlock(blockData);
    });
    let adopted = 0;
    alreadyHere.forEach(([blockId, blockData]) => {
        adopted += adoptShadowIdsFromYjs(target, blockId, blockData);
    });
    if (adopted > 0) target.blocks.resetCache();
}

function adoptShadowIdsFromYjs(target, blockId, remote) {
    const local = target.blocks.getBlock(blockId);
    if (!local || !local.inputs || !remote || !remote.inputs) return 0;

    let adopted = 0;
    Object.keys(remote.inputs).forEach(name => {
        const mine = local.inputs[name];
        const theirs = remote.inputs[name];
        if (!mine || !theirs) return;
        if (mine.shadow === theirs.shadow) return;
        if (!mine.shadow || mine.block !== mine.shadow) return;
        if (!theirs.shadow || theirs.block !== theirs.shadow) return;

        const roomsShadow = target.blocks.getBlock(theirs.shadow);
        if (!roomsShadow) return;

        const invented = mine.shadow;
        local.inputs[name] = { name, block: theirs.shadow, shadow: theirs.shadow };
        roomsShadow.parent = blockId;
        target.blocks.deleteBlock(invented);
        adopted++;
    });
    return adopted;
}

function applyYjsVariablesToTarget(target, yTargetVarMap) {
    const vm = constants.mutableRefs.vm;

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

        if (typeof name !== 'undefined' && target.variables[varId].name !== name) {
            target.variables[varId].name = name;
        }

        if (type === 'broadcast_msg') {
            target.variables[varId].value = name;
            target.variables[varId].name = name;
            vm.runtime.targets.forEach(t => t.blocks.resetCache());
        } else {
            target.variables[varId].value = value;
        }
    });
}

function applyYjsCommentsToTarget(target, yTargetCommentMap) {
    yTargetCommentMap.forEach((yCommentMap, commentId) => {
        if (target.comments[commentId]) return;
        const commentData = deserializeCommentFromYjs(yCommentMap);
        target.createComment(
            commentData.id, commentData.blockId, commentData.text,
            commentData.x, commentData.y, commentData.width,
            commentData.height, commentData.minimized, true
        );
    });
}

export function resolveOrderedEntries(yOrderArray, yDataMap) {
    if (!yOrderArray || !yDataMap) return [];
    return yOrderArray.toArray()
        .map(id => yDataMap.get(id))
        .filter(entry => entry !== undefined && entry !== null);
}

function applyYjsCostumesToTarget(target, yCostumeOrder, yCostumeMap) {
    const vm = constants.mutableRefs.vm;
    if (!target.sprite) return;
    const costumeList = resolveOrderedEntries(yCostumeOrder, yCostumeMap)
        .map(yMap => deserializeCostumeFromYjs(yMap));

    const previousCostumeId = target.getCostumes()[target.currentCostume]?.id ?? null;

    Promise.all(costumeList.map(c => loadRemoteCostume(c, vm.runtime)))
        .then(loadedCostumes => {
            if (loadedCostumes.length > 0) {
                target.sprite.costumes = loadedCostumes;
                let index = previousCostumeId === null ?
                    target.currentCostume :
                    loadedCostumes.findIndex(c => c.id === previousCostumeId);
                if (index < 0) index = target.currentCostume;
                index = Math.min(Math.max(index, 0), loadedCostumes.length - 1);
                target.currentCostume = index;
                target.setCostume(index);
                target.updateAllDrawableProperties();

                const redraw = constants.mutableRefs.redrawCostumeArt;
                if (redraw) {
                    for (const costume of loadedCostumes) {
                        try {
                            redraw(costume.id);
                        } catch (e) {
                            console.warn('[collaboration] could not redraw a rebuilt costume', e);
                        }
                    }
                }
            }
        });
}

function applyYjsSoundsToTarget(target, ySoundOrder, ySoundMap) {
    const vm = constants.mutableRefs.vm;
    if (!target.sprite) return;
    const soundList = resolveOrderedEntries(ySoundOrder, ySoundMap)
        .map(yMap => deserializeSoundFromYjs(yMap));
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
}

export function hydrateTargetFromYjs(targetId) {
    const vm = constants.mutableRefs.vm;
    const target = vm?.runtime.getTargetById(targetId);
    if (!target) return;

    const yBlocks = constants.mutableRefs.sharedBlocks?.get(targetId);
    if (yBlocks) applyYjsBlocksToTarget(target, yBlocks);
    const yVariables = constants.mutableRefs.sharedVariables?.get(targetId);
    if (yVariables) applyYjsVariablesToTarget(target, yVariables);
    const yComments = constants.mutableRefs.sharedComments?.get(targetId);
    if (yComments) applyYjsCommentsToTarget(target, yComments);
    const yCostumes = constants.mutableRefs.sharedCostumes?.get(targetId);
    const yCostumeData = constants.mutableRefs.sharedCostumeData?.get(targetId);
    if (yCostumes && yCostumeData) applyYjsCostumesToTarget(target, yCostumes, yCostumeData);
    const ySounds = constants.mutableRefs.sharedSounds?.get(targetId);
    const ySoundData = constants.mutableRefs.sharedSoundData?.get(targetId);
    if (ySounds && ySoundData) applyYjsSoundsToTarget(target, ySounds, ySoundData);
}

export function reconcileExtensionsToYjs() {
    const vm = constants.mutableRefs.vm;
    const sharedExtensions = constants.mutableRefs.sharedExtensions;
    if (!vm || !sharedExtensions || !constants.mutableRefs.ydoc) return;

    const extensionManager = vm.extensionManager;
    if (!extensionManager || !extensionManager._loadedExtensions) return;
    const extensionURLs = (typeof extensionManager.getExtensionURLs === 'function') ?
        extensionManager.getExtensionURLs() : {};

    const knownNames = new Set();
    sharedExtensions.toArray().forEach(ext => {
        const extObj = (typeof ext.toJSON === 'function') ? ext.toJSON() : ext;
        if (typeof extObj === 'string') {
            knownNames.add(extObj);
        } else if (extObj && extObj.name) {
            knownNames.add(extObj.name);
        }
    });

    const missing = [];
    for (const id of extensionManager._loadedExtensions.keys()) {
        if (!knownNames.has(id)) {
            missing.push({ URL: extensionURLs[id] || id, name: id });
        }
    }
    if (missing.length === 0) return;

    constants.mutableRefs.ydoc.transact(() => {
        constants.mutableRefs.sharedExtensions.push(missing);
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
}

export function remapTargetIdsFromYjs() {
    const vm = constants.mutableRefs.vm;
    const sharedSprites = constants.mutableRefs.sharedSprites;
    const sharedSpriteData = constants.mutableRefs.sharedSpriteData;
    if (!vm || !sharedSprites || !sharedSpriteData) return 0;

    const remoteIds = [...new Set(sharedSprites.toArray())];
    if (remoteIds.length === 0) return 0;

    const localByName = new Map();
    vm.runtime.targets.forEach(target => {
        if (target.isOriginal !== false) localByName.set(target.getName(), target);
    });

    const claimed = new Set();
    let remapped = 0;

    remoteIds.forEach(spriteId => {
        const meta = sharedSpriteData.get(spriteId);
        if (!meta) return;
        const remoteId = meta.get('id') || spriteId;
        const remoteName = meta.get('name');

        const local = localByName.get(remoteName);
        if (!local || claimed.has(local.id)) return;
        claimed.add(local.id);

        if (local.id !== remoteId) {
            vm.runtime.updateTargetId(local, remoteId);
            remapped++;
        }
        adoptAssetIdsFromYjs(local, 'costumes',
            constants.mutableRefs.sharedCostumes?.get(remoteId),
            constants.mutableRefs.sharedCostumeData?.get(remoteId));
        adoptAssetIdsFromYjs(local, 'sounds',
            constants.mutableRefs.sharedSounds?.get(remoteId),
            constants.mutableRefs.sharedSoundData?.get(remoteId));
    });

    return remapped;
}

function adoptAssetIdsFromYjs(target, kind, yOrder, yData) {
    const sprite = target.sprite;
    if (!sprite || !yOrder || !yData) return;
    const local = sprite[kind];
    if (!Array.isArray(local) || local.length === 0) return;

    const remoteByMd5 = new Map();
    yOrder.toArray().forEach(id => {
        const entry = yData.get(id);
        if (!entry) return;
        const md5ext = entry.get('md5ext');
        if (md5ext && !remoteByMd5.has(md5ext)) remoteByMd5.set(md5ext, id);
    });
    if (remoteByMd5.size === 0) return;

    const taken = new Set();
    let changed = false;
    const next = local.map(asset => {
        const md5ext = asset.md5ext || asset.md5;
        const remoteId = remoteByMd5.get(md5ext);
        if (!remoteId || taken.has(remoteId) || remoteId === asset.id) return asset;
        taken.add(remoteId);
        changed = true;
        return Object.assign({}, asset, {id: remoteId});
    });
    if (changed) sprite[kind] = next;
}

export function performInitialSync(applySpriteList) {
    const vm = constants.mutableRefs.vm;
    if (!vm) return 'synced';

    remapTargetIdsFromYjs();

    if (typeof applySpriteList === 'function') {
        try {
            applySpriteList();
        } catch (e) {
            console.warn('[collaboration] could not reconcile the sprite list', e);
        }
    }

    const targetIds = new Set([
        ...constants.mutableRefs.sharedBlocks.keys(),
        ...constants.mutableRefs.sharedVariables.keys(),
        ...constants.mutableRefs.sharedComments.keys(),
        ...constants.mutableRefs.sharedCostumes.keys(),
        ...constants.mutableRefs.sharedSounds.keys()
    ]);
    targetIds.forEach(targetId => {
        if (!vm.runtime.getTargetById(targetId)) return;
        try {
            hydrateTargetFromYjs(targetId);
        } catch (e) {
            console.warn(`[collaboration] could not reconcile target ${targetId}`, e);
        }
    });

    constants.mutableRefs.sharedMonitors.forEach(yMonitorMap => {
        try {
            vm.deserializeMonitor(deserializeMonitorFromYjs(yMonitorMap));
        } catch (e) {
            console.warn('[collaboration] could not reconcile a monitor', e);
        }
    });

    repairAfterReconcile();

    return 'synced';
}

function repairAfterReconcile() {
    const vm = constants.mutableRefs.vm;
    if (!vm) return;

    const repairedByTarget = new Map();
    vm.runtime.targets.forEach(target => {
        if (!target.isOriginal) return;
        if (typeof target.blocks.validateAndRepair !== 'function') return;
        try {
            const repaired = new Map();
            if (target.blocks.validateAndRepair(repaired) > 0 && repaired.size > 0) {
                repairedByTarget.set(target.id, repaired);
            }
        } catch (e) {
            console.warn(`[collaboration] block-graph repair failed for ${target.id}`, e);
        }
    });

    if (repairedByTarget.size === 0) return;

    console.warn(`[collaboration] repaired the block graph of ${repairedByTarget.size} target(s) ` +
        'while joining the room');
    setTimeout(() => {
        repairedByTarget.forEach((repaired, targetId) => {
            publishBlocksToYjs(targetId, repaired);
        });
    }, 0);
}

function unusedName(name, taken) {
    if (taken.indexOf(name) < 0) return name;
    const stem = String(name).replace(/\d+$/, '');
    let i = 2;
    while (taken.indexOf(stem + i) >= 0) i++;
    return stem + i;
}

export function resolveDuplicateSpriteNames(orderedIds) {
    const sharedSpriteData = constants.mutableRefs.sharedSpriteData;
    if (!sharedSpriteData) return 0;

    const entries = [];
    for (const id of orderedIds) {
        const yMap = sharedSpriteData.get(id);
        if (!yMap || yMap.get('isStage')) continue;
        const name = yMap.get('name');
        if (typeof name !== 'string' || name === '') continue;
        entries.push([id, name]);
    }

    const everyName = entries.map(entry => entry[1]);
    const taken = [];
    const fixes = [];
    for (const [id, name] of entries) {
        if (taken.indexOf(name) < 0) {
            taken.push(name);
            continue;
        }
        const fixed = unusedName(name, everyName.concat(taken));
        fixes.push([id, fixed]);
        taken.push(fixed);
        everyName.push(fixed);
    }
    if (fixes.length === 0) return 0;

    constants.mutableRefs.ydoc.transact(() => {
        for (const [id, fixed] of fixes) {
            const yMap = sharedSpriteData.get(id);
            if (yMap) yMap.set('name', fixed);
        }
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    return fixes.length;
}

export function resolveDuplicateVariableNames(targetId) {
    const sharedVariables = constants.mutableRefs.sharedVariables;
    const yTargetMap = sharedVariables && sharedVariables.get(targetId);
    if (!yTargetMap) return 0;

    const entries = [];
    yTargetMap.forEach((yVar, varId) => {
        if (!yVar || typeof yVar.get !== 'function') return;
        const name = yVar.get('name');
        if (typeof name !== 'string' || name === '') return;
        entries.push({ id: varId, name: name, type: yVar.get('type') || '' });
    });
    entries.sort((a, b) => (a.id < b.id ? -1 : 1));

    const namesOfType = type => entries
        .filter(entry => entry.type === type)
        .map(entry => entry.name);

    const taken = [];
    const fixes = [];
    for (const entry of entries) {
        const key = entry.type + ' ' + entry.name;
        if (taken.indexOf(key) < 0) {
            taken.push(key);
            continue;
        }
        const used = namesOfType(entry.type).concat(fixes.map(fix => fix[1]));
        const fixed = unusedName(entry.name, used);
        fixes.push([entry.id, fixed]);
        taken.push(entry.type + ' ' + fixed);
    }
    if (fixes.length === 0) return 0;

    constants.mutableRefs.ydoc.transact(() => {
        for (const fix of fixes) {
            const yVar = yTargetMap.get(fix[0]);
            if (yVar) yVar.set('name', fix[1]);
        }
    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    return fixes.length;
}
