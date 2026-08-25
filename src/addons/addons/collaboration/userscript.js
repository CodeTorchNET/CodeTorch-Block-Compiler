import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

import * as collabUI from './helpers/collaboration-ui.js';
import * as constants from './helpers/constants.js';
import * as timeout from './helpers/timeout.js';
import * as helper from './helpers/helper.js';
import * as costumeSync from './helpers/costumeSync.js';
import * as costumeArtSync from './helpers/costumeArtSync.js';
import * as presence from './helpers/presence.js';
import * as soundSync from './helpers/soundSync.js';
import * as transformSync from './helpers/transformSync.js';
import * as OH from './helpers/observeHandlers.js';
import * as scheduler from './helpers/refreshScheduler.js';
import * as recorder from './helpers/recorder.js';
import * as session from './helpers/session.js';
import * as collabSnapshot from '../../../lib/collab-snapshot.js';
import {onArtChanged} from '../../../lib/collab-art-bus.js';
import {setShapeReporting, setLiveResync, setDragReporter} from 'scratch-paint/src/helper/collab-live.js';
import {syncRemoteFloats} from 'scratch-paint/src/helper/bit-replay.js';
import {syncRemoteGhosts} from 'scratch-paint/src/helper/vector-ghost.js';
import {setCursorReporter, setRemoteCursors} from 'scratch-paint/src/helper/collab-cursors.js';

function attachYjsProvider() {
    let unsubscribeArt = null;
    collabUI.showSyncingPopup();

    if (constants.mutableRefs.ydoc || constants.mutableRefs.provider) {
        collabUI.hideSyncingPopup();
        
        return null;
    }
    

    if (!constants.mutableRefs.vm || !constants.mutableRefs.BlocklyInstance) {
        collabUI.hideSyncingPopup();
        
        return null;
    }

    const sessionInfo = collaborationSession();
    let roomName = sessionInfo.room;
    let username = sessionInfo.username;
    let token = sessionInfo.ott;
    let role = sessionInfo.role;

    if (constants.devMode) {
        if (!roomName) roomName = 'dev_room';
        if (!username) username = 'DevUser_' + Math.floor(Math.random() * 1000);
        if (!token) token = 'dev_token_bypass';
        if (!role) {
            role = new URLSearchParams(window.location.search).get('collabRole') || 'editor';
        }
    }

    constants.mutableRefs.isViewer = role === 'viewer';

    if (!token) {
        
        collabUI.hideSyncingPopup();
        return null;
    }

    constants.mutableRefs.roomUUID = roomName;

    constants.mutableRefs.ydoc = new Y.Doc();

    constants.mutableRefs.sharedBlocks = constants.mutableRefs.ydoc.getMap('blocks');
    constants.mutableRefs.sharedVariables = constants.mutableRefs.ydoc.getMap('variables');
    constants.mutableRefs.sharedMonitors = constants.mutableRefs.ydoc.getMap('monitors');
    constants.mutableRefs.sharedComments = constants.mutableRefs.ydoc.getMap('comments');
    constants.mutableRefs.sharedCostumes = constants.mutableRefs.ydoc.getMap('costumes');
    constants.mutableRefs.sharedCostumeData = constants.mutableRefs.ydoc.getMap('costumeData');
    constants.mutableRefs.sharedCostumeArt = constants.mutableRefs.ydoc.getMap('costumeArt');
    constants.mutableRefs.sharedSounds = constants.mutableRefs.ydoc.getMap('sounds');
    constants.mutableRefs.sharedSoundData = constants.mutableRefs.ydoc.getMap('soundData');
    constants.mutableRefs.sharedSprites = constants.mutableRefs.ydoc.getArray('sprites');
    constants.mutableRefs.sharedSpriteData = constants.mutableRefs.ydoc.getMap('spriteData');
    constants.mutableRefs.sharedExtensions = constants.mutableRefs.ydoc.getArray('extensions');

    const baseServerUrl = constants.WEBSOCKETBASEURL;

    if (!username || !token) {
        
        collabUI.hideSyncingPopup();
        return null;
    }

    try {
        const preSeed = collabSnapshot.getSnapshot();
        const connectionParams = {ott: token};
        if (preSeed && preSeed.roomGeneration) connectionParams.gen = preSeed.roomGeneration;

        

        constants.mutableRefs.provider = new WebsocketProvider(
            baseServerUrl,
            roomName,
            constants.mutableRefs.ydoc,
            {
                connect: false,
                params: connectionParams,
                resyncInterval: 20000
            }
        );

        
        constants.mutableRefs.yjsAwarenessInstance = constants.mutableRefs.provider.awareness;

        let runInitialSync = null;
        let hasSynced = false;
        let joinedGeneration = null;
        const pendingSpritePublishes = new Set();
        const cancelPendingSpritePublishes = () => {
            pendingSpritePublishes.forEach(id => clearTimeout(id));
            pendingSpritePublishes.clear();
        };
        const snapshot = collabSnapshot.getSnapshot();
        if (snapshot && snapshot.update && snapshot.update.length > 0) {
            try {
                Y.applyUpdate(constants.mutableRefs.ydoc, snapshot.update, 'collab-snapshot');
            } catch (e) {
                console.warn('[collaboration] could not apply the snapshot; falling back to a full sync', e);
            }
        }

        const localUserColor = collabUI.getRandomColor();
        constants.localUserInfo.name = username;
        constants.localUserInfo.color = localUserColor;
        constants.localUserInfo.currentTargetId = helper.getCurrentEditingTargetId();

        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('user', { name: constants.localUserInfo.name, color: constants.localUserInfo.color });
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('currentTargetId', constants.localUserInfo.currentTargetId);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('activeTabIndex', constants.localUserInfo.activeTabIndex);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('chatMessage', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('cursor', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('paintCursor', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('paintFloat', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('paintDrag', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('costumeDigest', null);

        

        constants.mutableRefs.isInitialRoomSync = true;
        if (constants.mutableRefs.loadingCooldownTimer) {
            clearTimeout(constants.mutableRefs.loadingCooldownTimer);
            constants.mutableRefs.loadingCooldownTimer = null;
        }

        constants.mutableRefs.provider.connect();

        const applySpriteListFromYjs = () => {
            const vm = constants.mutableRefs.vm;
            const runtime = vm.runtime;
            const sharedSpriteData = constants.mutableRefs.sharedSpriteData;

            const remoteIds = [...new Set(constants.mutableRefs.sharedSprites.toArray())];
            const remoteIdSet = new Set(remoteIds);

            helper.resolveDuplicateSpriteNames(remoteIds);

            const previousGroup = constants.mutableRefs.BlocklyInstance.Events.getGroup();
            constants.mutableRefs.BlocklyInstance.Events.setGroup('yjs-remote-sync');
            constants.beginRemoteApply();

            try {
                remoteIds.forEach(id => {
                    const yMap = sharedSpriteData.get(id);
                    if (!yMap) return;
                    const name = yMap.get('name');
                    const isStage = yMap.get('isStage');
                    let existingTarget = runtime.getTargetById(id);

                    if (!existingTarget && isStage) {
                        const localStage = runtime.getTargetForStage();
                        if (!localStage) return;
                        if (localStage.id !== id) runtime.updateTargetId(localStage, id);
                        existingTarget = localStage;
                    }

                    if (!existingTarget) {
                        const newSprite = new constants.mutableRefs.vm.exports.Sprite(null, runtime);
                        newSprite.name = name;
                        const target = newSprite.createClone(isStage ? 'background' : 'sprite');
                        target.id = id;
                        target.originalTargetId = id;
                        runtime.addTarget(target);
                        transformSync.applyTransformFromYjs(target, yMap);
                        transformSync.applyStateFromYjs(target, yMap);
                        helper.hydrateTargetFromYjs(id);
                    } else {
                        if (!existingTarget.isStage && existingTarget.getName() !== name) {
                            vm.renameSprite(id, name, false, true);
                        }
                        transformSync.applyTransformFromYjs(existingTarget, yMap);
                        transformSync.applyStateFromYjs(existingTarget, yMap);
                    }
                });

                const idsToDelete = [...new Set(
                    runtime.targets
                        .filter(t => t.isOriginal && !t.isStage && !remoteIdSet.has(t.id))
                        .map(t => t.id)
                )];
                idsToDelete.forEach(targetId => {
                    if (!runtime.getTargetById(targetId)) return;
                    if (vm.deleteSpriteNoWarning !== undefined) {
                        vm.deleteSpriteNoWarning(targetId, false);
                    } else {
                        vm.deleteSprite(targetId, false);
                    }
                });

                const newOrder = [];
                remoteIds.forEach(id => {
                    const t = runtime.getTargetById(id);
                    if (t && !newOrder.includes(t)) newOrder.push(t);
                });

                runtime.targets.forEach(t => {
                    if (!t.isOriginal) newOrder.push(t);
                });

                if (newOrder.length > 0) {
                    runtime.targets = newOrder;
                    runtime.executableTargets = [...newOrder].reverse(); 
                }

                transformSync.applyLayerOrderFromYjs();

                vm.emitTargetsUpdate(false);
            } catch (e) {
                console.warn('[collaboration] sprite list sync failed', e);
            } finally {
                constants.endRemoteApply();
                constants.mutableRefs.BlocklyInstance.Events.setGroup(previousGroup || false);
            }
        };

        constants.mutableRefs.sharedSprites.observe(event => {
            if (event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN) return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            applySpriteListFromYjs();
        });

        constants.mutableRefs.sharedSpriteData.observeDeep(events => {
            if (events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN)) return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            applySpriteListFromYjs();
        });
        constants.mutableRefs.sharedExtensions.observe(event => {
            if (event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN) return;
            
            const remoteExtensions = constants.mutableRefs.sharedExtensions.toArray();
            remoteExtensions.forEach(ext => {
                const extObj = (typeof ext.toJSON === 'function') ? ext.toJSON() : ext;
                const extURL = extObj.URL || extObj;
                const extName = extObj.name || extObj;
                if (typeof extURL === 'string' && !constants.mutableRefs.vm.extensionManager.isExtensionLoaded(extName)) {
                    constants.mutableRefs.vm.extensionManager.loadExtensionURL(extURL, false);
                }
            });
        });
        constants.mutableRefs.sharedBlocks.observeDeep(events => {
            const isLocal = events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN);
            if (isLocal) return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            if (recorder.isRecording()) {
                const seen = new Set();
                const arriving = [];
                events.forEach(event => {
                    if (event.path.length >= 1) seen.add(event.path[0]);
                    if (event.path.length === 1 && event.changes && event.changes.keys) {
                        event.changes.keys.forEach((change, key) => arriving.push(`${change.action}:${key}`));
                    }
                });
                recorder.record('remote.blocks.apply', {targets: [...seen], keys: arriving});
            }

            const Blockly = constants.mutableRefs.BlocklyInstance;
            const previousGroup = Blockly.Events.getGroup();
            Blockly.Events.setGroup('yjs-remote-sync');
            constants.beginRemoteApply();

            const touchedByTarget = new Map();
            const deletedInTarget = new Set();

            try {
                events.forEach(event => {
                    const targetId = event.path.length >= 1 ? event.path[0] : null;
                    if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                        return;
                    }

                    const result = OH.sharedBlocks(event);
                    if (!result) return;
                    if (result.cancelledDrags > 0) {
                        window.__collabCancelledDrags =
                            (window.__collabCancelledDrags || 0) + result.cancelledDrags;
                    }
                    if (result.deletedAny && result.targetId) {
                        deletedInTarget.add(result.targetId);
                    }
                    if (result.targetId && result.dirtyIds.length > 0) {
                        const list = touchedByTarget.get(result.targetId) || [];
                        result.dirtyIds.forEach(id => list.push(id));
                        touchedByTarget.set(result.targetId, list);
                    }
                    if (result.needsToolboxRefresh) scheduler.queueToolboxRefresh();
                    if (result.needsFullRefresh) {
                        scheduler.queueFullRefresh();
                    } else if (result.targetId && result.dirtyIds.length > 0) {
                        scheduler.queueBlockSync(result.targetId, result.dirtyIds);
                    }
                    if (result.targetId && result.detachedSlots.length > 0) {
                        const detachedTargetId = result.targetId;
                        const byBlock = new Map();
                        result.detachedSlots.forEach(([parentId, prop]) => {
                            if (!byBlock.has(parentId)) byBlock.set(parentId, new Set());
                            byBlock.get(parentId).add(prop);
                        });
                        setTimeout(() => helper.publishBlocksToYjs(detachedTargetId, byBlock), 0);
                    }
                    if (result.targetId && result.promotedIds.length > 0) {
                        const promotedTargetId = result.targetId;
                        const promotedIds = result.promotedIds.slice();
                        const promotion = new Map(
                            promotedIds.map(id => [id, new Set(['parent', 'topLevel'])]));
                        setTimeout(() => helper.publishBlocksToYjs(promotedTargetId, promotion), 0);
                    }
                });

                deletedInTarget.forEach(tid => {
                    if (!touchedByTarget.has(tid)) touchedByTarget.set(tid, []);
                });
                touchedByTarget.forEach((ids, tid) => {
                    const target = constants.mutableRefs.vm.runtime.getTargetById(tid);
                    if (!target) return;
                    const blocks = target.blocks._blocks;
                    const yBlocks = constants.mutableRefs.sharedBlocks?.get(tid);

                    const looped = ids.some(id => helper.parentChainLoops(blocks, id));
                    const ghosts = !looped &&
                        ids.some(id => helper.referencesAGhost(blocks, id, yBlocks));

                    if (!looped && !ghosts && !deletedInTarget.has(tid)) return;

                    if (!looped) {
                        scheduler.queueRepair(tid);
                        return;
                    }

                    const repaired = new Map();
                    const changed = target.blocks.validateAndRepair(repaired);
                    if (repaired.size > 0) {
                        setTimeout(() => helper.publishBlocksToYjs(tid, repaired), 0);
                    }

                    if (changed > 0) scheduler.queueFullRefresh();
                });
            } finally {
                constants.endRemoteApply();
                Blockly.Events.setGroup(previousGroup || false);
            }
        });
        constants.mutableRefs.sharedVariables.observeDeep(events => {
            if (events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN)) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            const Blockly = constants.mutableRefs.BlocklyInstance;
            const previousGroup = Blockly.Events.getGroup();
            Blockly.Events.setGroup('yjs-remote-sync');
            constants.beginRemoteApply();

            try {
                const touched = new Set();
                events.forEach(event => {
                    if (event.path.length >= 1) {
                        touched.add(event.path[0]);
                    } else {
                        event.changes.keys.forEach((change, id) => touched.add(id));
                    }
                });
                touched.forEach(id => helper.resolveDuplicateVariableNames(id));

                let needsWorkspaceRefresh = false;
                events.forEach(event => {
                    const targetId = event.path.length >= 1 ? event.path[0] : null;
                    if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                        return;
                    }

                    const changed = OH.sharedVariables(event);
                    needsWorkspaceRefresh = needsWorkspaceRefresh || changed;
                });

                if (needsWorkspaceRefresh) {
                    scheduler.queueFullRefresh();
                    scheduler.queueToolboxRefresh();
                }
            } catch (e) {
                console.warn('[collaboration] variable sync failed', e);
            } finally {
                constants.endRemoteApply();
                Blockly.Events.setGroup(previousGroup || false);
            }
        });

        constants.mutableRefs.sharedMonitors.observeDeep(events => {
            const isLocal = events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN);
            if (isLocal) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            const Blockly = constants.mutableRefs.BlocklyInstance;
            const previousGroup = Blockly.Events.getGroup();
            Blockly.Events.setGroup('yjs-remote-sync');
            constants.beginRemoteApply();

            try {
                events.forEach(event => {
                    OH.sharedMonitors(event);
                });
                scheduler.queueToolboxRefresh();
            } catch (e) {
                console.warn('[collaboration] monitor sync failed', e);
            } finally {
                constants.endRemoteApply();
                Blockly.Events.setGroup(previousGroup || false);
            }
        });

        constants.mutableRefs.sharedComments.observeDeep(events => {
            const isLocal = events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN);
            if (isLocal) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            const Blockly = constants.mutableRefs.BlocklyInstance;
            const previousGroup = Blockly.Events.getGroup();
            Blockly.Events.setGroup('yjs-remote-sync');
            constants.beginRemoteApply();

            try {
                events.forEach(event => {
                    const targetId = event.path.length >= 1 ? event.path[0] : null;
                    if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                        return;
                    }

                    if (OH.sharedComments(event)) {
                        const editingTargetId = constants.mutableRefs.vm.editingTarget?.id;
                        if (!targetId || targetId === editingTargetId) {
                            scheduler.queueFullRefresh();
                        }
                    }
                });
            } catch (e) {
                console.warn('[collaboration] comment sync failed', e);
            } finally {
                constants.endRemoteApply();
                Blockly.Events.setGroup(previousGroup || false);
            }
        });
        const observeAssetChanges = handler => events => {
            if (constants.mutableRefs.isInitialRoomSync) return;

            events.forEach(event => {
                const targetId = event.path.length > 0 ? event.path[0] : null;
                if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                    return;
                }

                handler(event);
            });
        };

        constants.mutableRefs.sharedCostumes.observeDeep(observeAssetChanges(costumeSync.handleRemoteCostumeChanges));
        constants.mutableRefs.sharedCostumeData.observeDeep(observeAssetChanges(costumeSync.handleRemoteCostumeChanges));

        constants.mutableRefs.sharedCostumeArt.observeDeep(costumeArtSync.handleRemoteArtChanges);
        constants.mutableRefs.redrawCostumeArt = costumeArtSync.applyRemoteArt;
        unsubscribeArt = onArtChanged(costumeArtSync.publishFromEditor);
        setShapeReporting(true);
        setLiveResync(costumeArtSync.resyncOpenCostume);

        setCursorReporter(point => {
            const awareness = constants.mutableRefs.yjsAwarenessInstance;
            if (!awareness) return;
            const asset = awareness.getLocalState()?.editingAsset;
            if (!point || !asset || asset.type !== 'costume') {
                if (awareness.getLocalState()?.paintCursor) {
                    awareness.setLocalStateField('paintCursor', null);
                }
                return;
            }
            awareness.setLocalStateField('paintCursor', {
                x: point.x,
                y: point.y,
                targetId: asset.targetId,
                index: asset.index
            });
        });

        setDragReporter(claim => {
            const awareness = constants.mutableRefs.yjsAwarenessInstance;
            if (!awareness) return;
            const asset = awareness.getLocalState()?.editingAsset;
            if (!claim || !asset || asset.type !== 'costume') {
                if (awareness.getLocalState()?.paintDrag) {
                    awareness.setLocalStateField('paintDrag', null);
                }
                return;
            }
            awareness.setLocalStateField('paintDrag', {
                dragId: claim.dragId,
                kind: claim.kind,
                dx: claim.dx,
                dy: claim.dy,
                ids: claim.ids,
                targetId: asset.targetId,
                index: asset.index
            });
        });
        constants.mutableRefs.sharedSounds.observeDeep(observeAssetChanges(soundSync.handleRemoteSoundChanges));
        constants.mutableRefs.sharedSoundData.observeDeep(observeAssetChanges(soundSync.handleRemoteSoundChanges));

        const handleTargetBlocksChanged = (targetId, [type, payload]) => {
            if (constants.isApplyingRemote()) return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
            if (!target) return;

            recorder.record(`local.blocks.${type}`, {
                target: targetId,
                stage: !!target.isStage,
                published: constants.mutableRefs.sharedSprites.toArray().includes(targetId),
                ids: recorder.blockIds(type, payload)
            });

            constants.mutableRefs.ydoc.transact(() => {
                let yTargetMap = constants.mutableRefs.sharedBlocks.get(targetId);
                if (!yTargetMap) {
                    if (!constants.mutableRefs.sharedSprites.toArray().includes(targetId)) return;
                    yTargetMap = new Y.Map();
                    yTargetMap.set('__targetName', target.getName());
                    constants.mutableRefs.sharedBlocks.set(targetId, yTargetMap);
                }

                if (type === 'add') {
                    payload.forEach(block => {
                        const yBlock = helper.serializeBlockForYjs(block);
                        yTargetMap.set(block.id, yBlock);
                    });
                } else if (type === 'delete') {
                    yTargetMap.delete(payload);
                } else if (type === 'update') {
                    Object.keys(payload).forEach(blockId => {
                        let yBlock = yTargetMap.get(blockId);
                        if (!yBlock) {
                            const fullBlock = constants.mutableRefs.vm.runtime.getTargetById(targetId)?.blocks.getBlock(blockId);
                            if (fullBlock) {
                                yBlock = helper.serializeBlockForYjs(fullBlock);
                                yTargetMap.set(blockId, yBlock);
                            } else {
                                return;
                            }
                        }

                        const updates = payload[blockId];
                        Object.keys(updates).forEach(prop => {
                            if (typeof updates[prop] === 'object' && updates[prop] !== null) {
                                yBlock.set(prop, JSON.stringify(updates[prop]));
                            } else {
                                yBlock.set(prop, updates[prop]);
                            }
                        });
                    });
                } else if (type === 'deleteInput') {
                    const yBlock = yTargetMap.get(payload.id);
                    if (yBlock) {
                        const rawInputs = yBlock.get('inputs');
                        if (typeof rawInputs === 'string') {
                            try {
                                const inputs = JSON.parse(rawInputs);
                                delete inputs[payload.inputName];
                                yBlock.set('inputs', JSON.stringify(inputs));
                            } catch (e) { }
                        }
                        const staleKeys = [];
                        yBlock.forEach((value, key) => {
                            if (key.startsWith('["')) {
                                try {
                                    const parts = JSON.parse(key);
                                    if (parts[0] === 'inputs' && parts[1] === payload.inputName) staleKeys.push(key);
                                } catch (e) { }
                            }
                        });
                        staleKeys.forEach(key => yBlock.delete(key));
                    }
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleTargetVariablesChanged = (targetId, [varId, varType, op, data]) => {
            if (constants.isApplyingRemote()) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);

            if (!target) return;
            data.varType = varType;

            constants.mutableRefs.ydoc.transact(() => {
                let yTargetVarMap = constants.mutableRefs.sharedVariables.get(targetId);
                if (!yTargetVarMap) {
                    yTargetVarMap = new Y.Map();
                    constants.mutableRefs.sharedVariables.set(targetId, yTargetVarMap);
                }

                if (op === 'add') {
                    const variable = target.variables[varId];
                    if (variable) {
                        yTargetVarMap.set(varId, helper.serializeVariableForYjs(variable));
                    }
                } else if (op === 'update') {
                    const yVarMap = yTargetVarMap.get(varId);
                    if (yVarMap) {
                        Object.keys(data).forEach(key => {
                            let val = data[key];
                            if (Array.isArray(val)) {
                                yVarMap.set(key, JSON.stringify(val));
                            } else {
                                yVarMap.set(key, val);
                            }
                        });
                    }
                } else if (op === 'delete') {
                    yTargetVarMap.delete(varId);
                    scheduler.rebuildWorkspace();
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleMonitorsUpdate = (monitorList) => {
            if (constants.isApplyingRemote()) return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            if (constants.mutableRefs.isUiTransition) {
                constants.mutableRefs.monitorsPublishDeferred = true;
                return;
            }

            constants.mutableRefs.ydoc.transact(() => {
                const monitors = (monitorList && monitorList.map instanceof Map) ? monitorList.map : monitorList;

                monitors.forEach((monitor, id) => {
                    const existingYMonitor = constants.mutableRefs.sharedMonitors.get(id);
                    const monitorData = monitor.toJS ? monitor.toJS() : monitor;

                    if (!existingYMonitor) {
                        const yMonitor = helper.serializeMonitorForYjs(monitor);
                        constants.mutableRefs.sharedMonitors.set(id, yMonitor);
                    } else {
                        const existingMonitor = helper.deserializeMonitorFromYjs(existingYMonitor);
                        if (!helper.compareMonitorData(existingMonitor, monitorData)) {
                            const yMonitor = helper.serializeMonitorForYjs(monitor);
                            constants.mutableRefs.sharedMonitors.set(id, yMonitor);
                        }
                    }
                });
                constants.mutableRefs.sharedMonitors.forEach((_, id) => {
                    if (!monitorList.has(id)) {
                        constants.mutableRefs.sharedMonitors.delete(id);
                    }
                });
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleTargetCommentsChanged = (targetId, [type, commentId, payload]) => {
            if (constants.isApplyingRemote()) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
            if (!target) return;

            constants.mutableRefs.ydoc.transact(() => {
                let yTargetMap = constants.mutableRefs.sharedComments.get(targetId);
                if (!yTargetMap) {
                    yTargetMap = new Y.Map();
                    constants.mutableRefs.sharedComments.set(targetId, yTargetMap);
                }

                if (type === 'add') {
                    const comment = target.comments[commentId];
                    if (comment) {
                        yTargetMap.set(commentId, helper.serializeCommentForYjs(comment));
                    }
                } else if (type === 'update') {
                    const yComment = yTargetMap.get(commentId);
                    if (yComment) {
                        Object.keys(payload).forEach(key => {
                            yComment.set(key, payload[key]);
                        });
                    }
                } else if (type === 'delete') {
                    yTargetMap.delete(commentId);
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleTargetCostumeChanged = (targetId, [op, costumeId, data]) => {
            costumeSync.handleLocalCostumeChange(targetId, [op, costumeId, data]);
        };

        const handleTargetSoundsChanged = (targetId, eventData) => {
            soundSync.handleLocalSoundChange(targetId, eventData);
        };

        const handleTargetSimplePropertyChanged = (data) => {
            if (constants.isApplyingRemote()) return;

            for (const [targetId, properties] of data) {
                if (Object.prototype.hasOwnProperty.call(properties, 'currentCostume')) {
                    const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
                    if (target && target === constants.mutableRefs.vm.runtime.getEditingTarget()) {
                        const newIndex = properties.currentCostume;
                        const currentLocalState = constants.mutableRefs.yjsAwarenessInstance.getLocalState();
                        const currentAsset = currentLocalState?.editingAsset;
                        if (currentAsset && currentAsset.type === 'costume' && currentAsset.index !== newIndex) {
                            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', {
                                ...currentAsset,
                                index: newIndex
                            });
                        }
                    }
                }
                const hasSyncedField = [...transformSync.TRANSFORM_FIELDS, ...transformSync.SPRITE_STATE_FIELDS]
                    .some(key => Object.prototype.hasOwnProperty.call(properties, key));
                if (hasSyncedField) {
                    if (constants.mutableRefs.isInitialRoomSync) continue;
                    transformSync.handleLocalTransformChange(targetId, properties);
                    transformSync.publishLayerOrder();
                }
            }
        };

        const handleTargetsIndexChanged = (data) => {
            if (constants.isApplyingRemote()) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            constants.mutableRefs.ydoc.transact(() => {
                const sharedSprites = constants.mutableRefs.sharedSprites;
                const { id, currentIndex } = data[0];

                const oldIndex = sharedSprites.toArray().indexOf(id);
                if (oldIndex !== -1 && oldIndex !== currentIndex) {
                    sharedSprites.delete(oldIndex, 1);
                    sharedSprites.insert(Math.min(currentIndex, sharedSprites.length), [id]);
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleAddSprite = () => {
            if (constants.mutableRefs.isInitialRoomSync) return;
            const publishTimer = setTimeout(async () => {
                pendingSpritePublishes.delete(publishTimer);
                if (constants.mutableRefs.isInitialRoomSync) return;
                const targets = constants.mutableRefs.vm.runtime.targets;
                const sharedSprites = constants.mutableRefs.sharedSprites;
                
                for (const target of targets) {
                    if (target.isOriginal && !constants.mutableRefs.sharedBlocks.has(target.id)) {
                        
                        await helper.pushTargetStateToYjs(target);
                    }
                }

                constants.mutableRefs.ydoc.transact(() => {
                    const sharedSpriteData = constants.mutableRefs.sharedSpriteData;
                    const knownIds = new Set(sharedSprites.toArray());
                    targets.forEach(target => {
                        if (!target.isOriginal) return;
                        if (!sharedSpriteData.has(target.id)) {
                            sharedSpriteData.set(target.id, helper.serializeSpriteForYjs(target));
                        }
                        if (!knownIds.has(target.id)) {
                            sharedSprites.push([target.id]);
                            knownIds.add(target.id);
                        }
                    });
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);

                helper.reconcileExtensionsToYjs();
            }, 100);
            pendingSpritePublishes.add(publishTimer);
        };

        const handleDeleteSprite = (targetId) => {
            if (constants.mutableRefs.isInitialRoomSync) return;
            constants.mutableRefs.ydoc.transact(() => {
                const sharedSprites = constants.mutableRefs.sharedSprites;
                const orderIndex = sharedSprites.toArray().indexOf(targetId);
                if (orderIndex !== -1) sharedSprites.delete(orderIndex, 1);
                if (constants.mutableRefs.sharedSpriteData.has(targetId)) {
                    constants.mutableRefs.sharedSpriteData.delete(targetId);
                }
                if (constants.mutableRefs.sharedCostumeData.has(targetId)) {
                    constants.mutableRefs.sharedCostumeData.delete(targetId);
                }
                if (constants.mutableRefs.sharedSoundData.has(targetId)) {
                    constants.mutableRefs.sharedSoundData.delete(targetId);
                }
                if (constants.mutableRefs.sharedBlocks.has(targetId)) {
                    constants.mutableRefs.sharedBlocks.delete(targetId);
                }
                if (constants.mutableRefs.sharedVariables.has(targetId)) {
                    constants.mutableRefs.sharedVariables.delete(targetId);
                }
                if (constants.mutableRefs.sharedComments.has(targetId)) {
                    constants.mutableRefs.sharedComments.delete(targetId);
                }
                if (constants.mutableRefs.sharedCostumes.has(targetId)) {
                    constants.mutableRefs.sharedCostumes.delete(targetId);
                }
                if (constants.mutableRefs.sharedSounds.has(targetId)) {
                    constants.mutableRefs.sharedSounds.delete(targetId);
                }

                const orphanedMonitors = [];
                constants.mutableRefs.sharedMonitors.forEach((yMonitor, monitorId) => {
                    if (yMonitor && yMonitor.get('targetId') === targetId) {
                        orphanedMonitors.push(monitorId);
                    }
                });
                orphanedMonitors.forEach(monitorId => {
                    constants.mutableRefs.sharedMonitors.delete(monitorId);
                });
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleTargetRenamed = (targetId, newName) => {

            if (constants.isApplyingRemote()) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            constants.mutableRefs.ydoc.transact(() => {
                constants.mutableRefs.sharedSpriteData.get(targetId)?.set('name', newName);
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleExtensionAdded = (extension) => {
            constants.mutableRefs.ydoc.transact(() => {
                const currentExts = constants.mutableRefs.sharedExtensions.toArray();
                const alreadyExists = currentExts.some(ext => {
                    const extObj = (typeof ext.toJSON === 'function') ? ext.toJSON() : ext;
                    if (typeof extObj === 'string') return extObj === extension.URL || extObj === extension.name;
                    return extObj.URL === extension.URL && extObj.name === extension.name;
                });
                if (!alreadyExists) {
                    constants.mutableRefs.sharedExtensions.push([extension]);
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);

            setTimeout(() => helper.reconcileExtensionsToYjs(), 0);
        };

        constants.mutableRefs.vm.on('TARGET_BLOCKS_CHANGED', handleTargetBlocksChanged);
        constants.mutableRefs.vm.on('TARGET_VARIABLES_CHANGED', handleTargetVariablesChanged);
        constants.mutableRefs.vm.on('MONITORS_UPDATE', handleMonitorsUpdate);
        constants.mutableRefs.publishMonitorsNow = () =>
            handleMonitorsUpdate(constants.mutableRefs.vm.runtime._monitorState);
        constants.mutableRefs.vm.on('TARGET_COMMENTS_CHANGED', handleTargetCommentsChanged);
        constants.mutableRefs.vm.on('TARGET_COSTUME_CHANGED', handleTargetCostumeChanged);
        constants.mutableRefs.vm.on('SOUNDS_CHANGED', handleTargetSoundsChanged);
        constants.mutableRefs.vm.on('TARGET_SIMPLE_PROPERTY_CHANGED', handleTargetSimplePropertyChanged);
        constants.mutableRefs.vm.on('TARGET_RENAMED', handleTargetRenamed);
        constants.mutableRefs.vm.on('TARGETS_INDEX_CHANGED', handleTargetsIndexChanged);
        constants.mutableRefs.vm.on('ADD_SPRITE', handleAddSprite);
        constants.mutableRefs.vm.on('DELETE_SPRITE', handleDeleteSprite);
        constants.mutableRefs.vm.on('COLLABORATION_EXTENSION_ADDED', handleExtensionAdded);
        runInitialSync = () => {
            if (!constants.mutableRefs.ydoc) return;
            constants.mutableRefs.isInitialRoomSync = true;
            cancelPendingSpritePublishes();
            try {
                constants.mutableRefs.ydoc.transact(() => {
                    helper.performInitialSync(applySpriteListFromYjs);
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);
            } catch (e) {
                console.warn('[collaboration] initial sync failed', e);
            }

            try {
                costumeArtSync.hydrateArt();
            } catch (e) {
                console.warn('[collaboration] could not draw the room\'s costumes', e);
            }

            hasSynced = true;

            collabUI.hideSyncingPopup();
            timeout.resetInactivityTimers();
            constants.mutableRefs.isInitialRoomSync = false;
            helper.reconcileExtensionsToYjs();

            scheduler.queueFullRefresh();
            setTimeout(() => {
                constants.mutableRefs.vm?.emitTargetsUpdate(false);
            }, 500);

            if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/collaboration/SET_COLLAB_ACTIVE',
                    payload: true
                });
            }
        };

        const restartWithoutSnapshot = () => {
            collabSnapshot.setNoSnapshot();
            const cleanup = constants.mutableRefs.currentCleanupFunction;
            constants.mutableRefs.currentCleanupFunction = null;
            try {
                cleanup?.();
            } catch (e) {
                console.warn('[collaboration] cleanup failed while rejoining', e);
            }
            collabUI.showSyncingPopup();
            setTimeout(() => {
                if (!constants.mutableRefs.provider) {
                    constants.mutableRefs.currentCleanupFunction = attachYjsProvider();
                }
            }, 250);
        };

        constants.mutableRefs.provider.on('synced', (syncedState) => {
            if (!syncedState || !constants.mutableRefs.provider.synced) return;

            const heldGeneration = constants.mutableRefs.ydoc?.getMap('meta').get('roomGeneration');
            if (heldGeneration) constants.mutableRefs.provider.params.gen = heldGeneration;

            recorder.record('provider.synced', {first: !hasSynced, generation: heldGeneration});

            if (!hasSynced) {
                const seeded = collabSnapshot.getSnapshot();
                const roomGeneration = constants.mutableRefs.ydoc.getMap('meta').get('roomGeneration');
                if (seeded && seeded.roomGeneration && roomGeneration &&
                    seeded.roomGeneration !== roomGeneration) {
                    console.warn('[collaboration] the room was recreated during load ' +
                        `(snapshot ${seeded.roomGeneration}, room ${roomGeneration}); ` +
                        'discarding the pre-seeded state and rejoining');
                    restartWithoutSnapshot();
                    return;
                }
                joinedGeneration = roomGeneration || heldGeneration || null;
                setTimeout(runInitialSync, 100);
                return;
            }

            if (joinedGeneration && heldGeneration && heldGeneration !== joinedGeneration) {
                console.warn('[collaboration] the room was rebuilt while this client was away ' +
                    `(joined ${joinedGeneration}, now ${heldGeneration}); rejoining`);
                recorder.record('session.generation-changed', {
                    from: joinedGeneration,
                    to: heldGeneration
                });
                restartWithoutSnapshot();
                return;
            }

            collabUI.hideSyncingPopup();
            timeout.resetInactivityTimers();
        });

        constants.mutableRefs.provider.on('connection-close', (event) => {
            try {
                handleConnectionClose(event);
            } catch (e) {
                console.warn('[collaboration] the close handler failed; reconnection is unaffected', e);
            }
        });

        function handleConnectionClose(event) {
            recorder.record('provider.connection-close', {code: event && event.code});
            timeout.clearInactivityTimers();

            if (event && event.code !== constants.CLOSE_STALE_GENERATION) {
                session.refreshToken();
            }
            if (event && event.code === constants.CLOSE_STALE_GENERATION) {
                console.warn('[collaboration] the room was recreated during load; ' +
                    'discarding the pre-seeded state and rejoining');
                restartWithoutSnapshot();
                return;
            }
            collabUI.hideSyncingPopup();
        }

        constants.mutableRefs.provider.on('status', event => {
            recorder.record('provider.status', {status: event.status});
            if (event.status === 'disconnected') {
                timeout.clearInactivityTimers();
            } else if (event.status === 'connecting') {
                collabUI.showSyncingPopup();
                timeout.clearInactivityTimers();
            } else if (event.status === 'connected') {
                if (constants.mutableRefs.provider.synced) {
                    collabUI.hideSyncingPopup();
                }
            }
        });

        presence.attach();

        if (constants.mutableRefs.isViewer) {
            collabUI.showViewerBanner();
            collabUI.applyViewerWorkspace(constants.editorWorkspace());
        }

        setTimeout(() => collabUI.setupCollaborationLayer(), 500);
        setTimeout(() => {
            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();
        }, 600);

        const onLocalDrag = (data) => {
            const currentTargetId = helper.getCurrentEditingTargetId();
            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', {
                blockId: data.blockId,
                x: data.x,
                y: data.y,
                targetId: currentTargetId
            });
        };

        const onLocalDragEnd = () => {
            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
        };

        constants.mutableRefs.BlocklyInstance.CollaborationEmitter.on('blockDrag', onLocalDrag);
        constants.mutableRefs.BlocklyInstance.CollaborationEmitter.on('blockDragEnd', onLocalDragEnd);

        const updatePaintCursors = states => {
            const awareness = constants.mutableRefs.yjsAwarenessInstance;
            if (!awareness) return;
            const mine = awareness.getLocalState()?.editingAsset;
            if (!mine || mine.type !== 'costume') {
                setRemoteCursors([]);
                return;
            }
            const cursors = [];
            states.forEach((state, clientID) => {
                if (clientID === awareness.clientID) return;
                const cursor = state.paintCursor;
                if (!cursor || !state.user) return;
                if (cursor.targetId !== mine.targetId || cursor.index !== mine.index) return;
                cursors.push({
                    id: clientID,
                    name: state.user.name,
                    color: state.user.color,
                    x: cursor.x,
                    y: cursor.y
                });
            });
            setRemoteCursors(cursors);
        };

        const updatePaintFloats = states => {
            const awareness = constants.mutableRefs.yjsAwarenessInstance;
            if (!awareness) return;
            const mine = awareness.getLocalState()?.editingAsset;
            if (!mine || mine.type !== 'costume') {
                syncRemoteFloats([]);
                return;
            }
            const claims = [];
            states.forEach((state, clientID) => {
                if (clientID === awareness.clientID) return;
                const float = state.paintFloat;
                if (!float || !float.shape) return;
                if (float.targetId !== mine.targetId || float.index !== mine.index) return;
                claims.push({floatId: float.floatId, shape: float.shape});
            });
            syncRemoteFloats(claims);
        };

        const updatePaintGhosts = states => {
            const awareness = constants.mutableRefs.yjsAwarenessInstance;
            if (!awareness) return;
            const mine = awareness.getLocalState()?.editingAsset;
            if (!mine || mine.type !== 'costume') {
                syncRemoteGhosts([]);
                return;
            }
            const claims = [];
            states.forEach((state, clientID) => {
                if (clientID === awareness.clientID) return;
                const drag = state.paintDrag;
                if (!drag || !Array.isArray(drag.ids)) return;
                if (drag.targetId !== mine.targetId || drag.index !== mine.index) return;
                claims.push({
                    dragId: `${clientID}:${drag.dragId}`,
                    kind: drag.kind,
                    dx: drag.dx,
                    dy: drag.dy,
                    ids: drag.ids,
                    color: state.user && state.user.color
                });
            });
            syncRemoteGhosts(claims);
        };

        let lastDrift = null;

        let answeredAbout = null;

        const reconcileDigests = () => {
            const awareness = constants.mutableRefs.yjsAwarenessInstance;
            if (!awareness) return;
            const mine = awareness.getLocalState()?.costumeDigest;
            if (!mine) {

                let asked = null;
                presence.collabStates().forEach((state, clientID) => {
                    if (clientID === awareness.clientID || asked) return;
                    if (state.costumeDigest) asked = state.costumeDigest.costumeId;
                });
                if (asked && asked !== answeredAbout) {
                    answeredAbout = asked;
                    costumeArtSync.publishDigest(asked);
                }
                return;
            }
            answeredAbout = null;

            const reached = costumeArtSync.appliedCount(mine.costumeId);
            let comparable = false;
            presence.collabStates().forEach((state, clientID) => {
                if (clientID === awareness.clientID) return;
                const theirs = state.costumeDigest;
                if (theirs && theirs.costumeId === mine.costumeId && theirs.applied === reached) {
                    comparable = true;
                }
            });
            if (comparable && mine.applied !== reached) {
                costumeArtSync.publishDigest(mine.costumeId);
                return;
            }

            let bestOrdered = mine.ordered !== false;
            let bestApplied = mine.applied;
            let bestClient = awareness.clientID;
            const disagreed = [];

            presence.collabStates().forEach((state, clientID) => {
                if (clientID === awareness.clientID) return;
                const theirs = state.costumeDigest;
                if (!theirs || theirs.costumeId !== mine.costumeId) return;
                if (theirs.applied !== mine.applied) return;
                if (theirs.digest !== mine.digest) {
                    disagreed.push(`${state.user?.name || clientID}=${theirs.digest}` +
                        `(applied ${theirs.applied}${theirs.ordered === false ? ', out of order' : ''})`);
                }
                const ordered = theirs.ordered !== false;
                let better;
                if (ordered === bestOrdered) {
                    better = theirs.applied === bestApplied ?
                        clientID < bestClient :
                        theirs.applied > bestApplied;
                } else {
                    better = ordered;
                }
                if (better) {
                    bestOrdered = ordered;
                    bestApplied = theirs.applied;
                    bestClient = clientID;
                }
            });

            if (!disagreed.length) {
                lastDrift = null;
                return;
            }

            const drift = `${mine.costumeId}|${mine.digest}|${disagreed.join(',')}`;
            if (drift === lastDrift) return;
            lastDrift = drift;

            console.warn('[collaboration] a bitmap costume has drifted: ' +
                `${constants.localUserInfo.name}=${mine.digest}(applied ${mine.applied}), ` +
                `${disagreed.join(', ')} -- costume ${mine.costumeId}`);

            recorder.record('art.drift', {
                costume: mine.costumeId,
                mine: mine.digest,
                applied: mine.applied,
                ordered: mine.ordered !== false,
                peers: disagreed,
                elected: bestClient,
                electedOrdered: bestOrdered,
                repairing: bestClient === awareness.clientID
            });

            if (bestClient === awareness.clientID) {
                costumeArtSync.publishWholeRaster(mine.costumeId);
            }
        };

        let awarenessFrame = 0;
        let mineChanged = false;
        const departed = new Set();

        const paintAwareness = () => {
            awarenessFrame = 0;
            const removed = [...departed];
            departed.clear();

            if (mineChanged) {
                mineChanged = false;
                presence.announceIfViewer();
            }

            if (constants.mutableRefs.collaborationLayerGroup && constants.mutableRefs.currentWorkspaceSvg) {
                const states = presence.collabStates();
                const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
                const localTargetId = constants.localUserInfo.currentTargetId;
                const lockedCostumes = {};
                const lockedSounds = {};
                
                const assetClaims = {};

                states.forEach((state, clientID) => {
                    if (state.editingAsset && state.user) {
                        const { type, index, targetId, timestamp } = state.editingAsset;
                        const key = `${type}:${targetId}:${index}`;
                        if (!assetClaims[key]) assetClaims[key] = [];
                        assetClaims[key].push({
                            clientID,
                            timestamp: timestamp || 0,
                            user: state.user,
                            type,
                            targetId,
                            index
                        });
                    }

                    if (clientID === localClientID) return;

                    const remoteTargetId = state.currentTargetId;
                    const remoteDraggingTargetId = state.dragging?.targetId;
                    const user = state.user;

                    const showRemoteUserInWorkspace = localTargetId && remoteTargetId === localTargetId;

                    if (showRemoteUserInWorkspace && user) {
                        collabUI.createOrUpdateRemoteCursor(clientID, state, constants.mutableRefs.collaborationLayerGroup, constants.debugging);
                    } else {
                        collabUI.removeRemoteCursor(clientID, constants.debugging);
                    }

                    const dragInfo = state.dragging;
                    const existingDrag = constants.remoteDraggingBlocks.get(clientID);
                    const showRemoteDragGhost = localTargetId && remoteDraggingTargetId === localTargetId;

                    if (showRemoteDragGhost && dragInfo?.blockId) {
                        let remoteDragData = existingDrag;
                        if (!remoteDragData || remoteDragData.blockId !== dragInfo.blockId) {
                            if (remoteDragData) remoteDragData.ghostSvg?.remove();

                            const workspace = constants.editorWorkspace();
                            const realBlock = workspace?.getBlockById(dragInfo.blockId);
                            if (realBlock?.getSvgRoot) {
                                const ghostSvg = realBlock.getSvgRoot().cloneNode(true);
                                ghostSvg.setAttribute('class', 'collaboration-ghost-block');
                                ghostSvg.style.opacity = '0.5';
                                ghostSvg.style.pointerEvents = 'none';
                                ghostSvg.removeAttribute('data-id');
                                constants.mutableRefs.collaborationLayerGroup.appendChild(ghostSvg);
                                remoteDragData = { blockId: dragInfo.blockId, ghostSvg: ghostSvg, targetId: remoteDraggingTargetId };
                                constants.remoteDraggingBlocks.set(clientID, remoteDragData);
                            }
                        } else {
                            remoteDragData.targetId = remoteDraggingTargetId;
                        }
                        if (remoteDragData?.ghostSvg) {
                            remoteDragData.ghostSvg.setAttribute('transform', `translate(${dragInfo.x},${dragInfo.y})`);
                            if (remoteDragData.ghostSvg.parentNode === constants.mutableRefs.collaborationLayerGroup) {
                                constants.mutableRefs.collaborationLayerGroup.appendChild(remoteDragData.ghostSvg);
                            }
                        }
                    } else {
                        if (existingDrag) {
                            existingDrag.ghostSvg?.remove();
                            constants.remoteDraggingBlocks.delete(clientID);
                        }
                    }
                });

                const costumePeers = {};

                Object.values(assetClaims).forEach(claims => {
                    if (claims.length === 0) return;
                    claims.sort((a, b) => {
                        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
                        return a.clientID - b.clientID;
                    });

                    const winner = claims[0];
                    if (winner.type === 'sound' && winner.clientID !== localClientID) {
                        lockedSounds[`${winner.targetId}:${winner.index}`] = {
                            name: winner.user.name, color: winner.user.color
                        };
                    }

                    if (winner.type === 'costume') {
                        const others = claims
                            .filter(claim => claim.clientID !== localClientID)
                            .map(claim => ({ name: claim.user.name, color: claim.user.color }));
                        if (others.length) {
                            costumePeers[`${winner.targetId}:${winner.index}`] = others;
                        }
                    }
                });

                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/collaboration/SET_ASSET_LOCKS',
                    lockedCostumes,
                    lockedSounds,
                    costumePeers
                });

                removed.forEach(clientID => {
                    if (clientID === localClientID) return;
                    collabUI.removeRemoteCursor(clientID, constants.debugging);
                    const existingDrag = constants.remoteDraggingBlocks.get(clientID);
                    if (existingDrag) {
                        existingDrag.ghostSvg?.remove();
                        constants.remoteDraggingBlocks.delete(clientID);
                    }
                });
                collabUI.ensureCollaborationLayerOnTop();
            }

            const paintStates = presence.collabStates();
            updatePaintCursors(paintStates);
            updatePaintFloats(paintStates);
            updatePaintGhosts(paintStates);
            reconcileDigests();
            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();
        };

        constants.mutableRefs.awarenessFrameCancel = () => {
            if (awarenessFrame) cancelAnimationFrame(awarenessFrame);
            awarenessFrame = 0;
            departed.clear();
        };

        constants.mutableRefs.yjsAwarenessInstance.on('change', changes => {
            for (const clientID of changes.removed) departed.add(clientID);
            const mine = constants.mutableRefs.yjsAwarenessInstance.clientID;
            if (changes.added.includes(mine) || changes.updated.includes(mine)) mineChanged = true;
            if (awarenessFrame) return;
            awarenessFrame = requestAnimationFrame(paintAwareness);
        });

        const handleWindowBlur = async () => {
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('dragging', null);
            collabUI.clearLocalChatMessage();
            timeout.handleInactivityX();
        };

        const handleWindowFocus = async () => {
            if (constants.mutableRefs.yjsAwarenessInstance) {
                if (constants.localUserInfo.isInactive) {
                    constants.localUserInfo.isInactive = false;
                    constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('isInactive', false);
                }
                timeout.resetInactivityTimers();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleWindowBlur();
            } else if (document.visibilityState === 'visible') {
                handleWindowFocus();
            }
        };
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('keydown', collabUI.handleGlobalKeyDown);
        window.addEventListener('keydown', collabUI.handleGlobalKeyDown);

        const cleanup = () => {

            costumeArtSync.flushPendingMints();
            costumeArtSync.reset();
            costumeSync.reset();
            soundSync.reset();
            constants.mutableRefs.redrawCostumeArt = null;
            setShapeReporting(false);
            setLiveResync(null);
            setDragReporter(null);
            syncRemoteFloats([]);
            syncRemoteGhosts([]);
            presence.detach();
            if (constants.mutableRefs.awarenessFrameCancel) {
                constants.mutableRefs.awarenessFrameCancel();
                constants.mutableRefs.awarenessFrameCancel = null;
            }
            setCursorReporter(null);
            setRemoteCursors([]);
            collabUI.hideViewerBanner();
            collabUI.clearViewerWorkspace();
            constants.mutableRefs.isViewer = false;
            if (unsubscribeArt) {
                unsubscribeArt();
                unsubscribeArt = null;
            }

            constants.mutableRefs.BlocklyInstance.CollaborationEmitter.off('blockDrag', onLocalDrag);
            constants.mutableRefs.BlocklyInstance.CollaborationEmitter.off('blockDragEnd', onLocalDragEnd);

            constants.mutableRefs.vm.removeListener('TARGET_BLOCKS_CHANGED', handleTargetBlocksChanged);
            constants.mutableRefs.vm.removeListener('TARGET_VARIABLES_CHANGED', handleTargetVariablesChanged);
            constants.mutableRefs.vm.removeListener('MONITORS_UPDATE', handleMonitorsUpdate);
            constants.mutableRefs.publishMonitorsNow = null;
            constants.mutableRefs.monitorsPublishDeferred = false;
            constants.mutableRefs.vm.removeListener('TARGET_COMMENTS_CHANGED', handleTargetCommentsChanged);
            constants.mutableRefs.vm.removeListener('TARGET_COSTUME_CHANGED', handleTargetCostumeChanged);
            constants.mutableRefs.vm.removeListener('SOUNDS_CHANGED', handleTargetSoundsChanged);
            constants.mutableRefs.vm.removeListener('TARGET_SIMPLE_PROPERTY_CHANGED', handleTargetSimplePropertyChanged);
            constants.mutableRefs.vm.removeListener('TARGET_RENAMED', handleTargetRenamed);
            constants.mutableRefs.vm.removeListener('TARGETS_INDEX_CHANGED', handleTargetsIndexChanged);
            constants.mutableRefs.vm.removeListener('ADD_SPRITE', handleAddSprite);
            constants.mutableRefs.vm.removeListener('DELETE_SPRITE', handleDeleteSprite);
            constants.mutableRefs.vm.removeListener('COLLABORATION_EXTENSION_ADDED', handleExtensionAdded);

            collabUI.clearLocalChatMessage();
            timeout.clearInactivityTimers();
            collabUI.hideSyncingPopup();

            if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/collaboration/SET_COLLAB_ACTIVE',
                    payload: false
                });
            }
            if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/collaboration/SET_DISCONNECTED',
                    payload: true
                });
            }

            if (constants.mutableRefs.provider) {
                constants.mutableRefs.provider.off('synced');
                constants.mutableRefs.provider.off('status');
                constants.mutableRefs.provider.off('connection-close');
            }
            if (constants.mutableRefs.provider?.connected) {
                constants.mutableRefs.provider.disconnect();
            }
            constants.mutableRefs.provider?.destroy();

            window.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('keydown', collabUI.handleGlobalKeyDown);
            window.removeEventListener('beforeunload', handleBeforeUnload);

            if (constants.mutableRefs.currentWorkspaceSvg) {
                if (constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
                if (constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
            }
            constants.mutableRefs.blocklyCanvasObserver?.disconnect();

            hasSynced = false;
            cancelPendingSpritePublishes();
            constants.resetRemoteApply();

            collabUI.removeAllUI();
            constants.remoteDraggingBlocks.forEach(dragData => dragData.ghostSvg?.remove());
            constants.remoteDraggingBlocks.clear();
            constants.mutableRefs.collaborationLayerGroup?.remove();
            constants.remoteUserIcons.forEach(icon => icon.remove());
            constants.remoteUserIcons.clear();
            constants.mutableRefs.userIconContainer?.remove();
            constants.spriteIconContainers.forEach(({ container }) => container?.remove());
            constants.spriteIconContainers.clear();
            constants.tabIconContainers.forEach(({ container }) => container?.remove());
            constants.tabIconContainers.clear();

            constants.mutableRefs.blocklyCanvasObserver = null;
            constants.mutableRefs.localChatElementsRef = null;
            constants.mutableRefs.currentWorkspaceSvg = null;
            constants.mutableRefs.throttledMouseMoveHandler = null;
            constants.mutableRefs.pointerLeaveHandler = null;
            constants.mutableRefs.yjsAwarenessInstance = null;
            constants.mutableRefs.ydoc = null;
            constants.mutableRefs.provider = null;
            constants.mutableRefs.userIconContainer = null;
            constants.mutableRefs.sharedBlocks = null;
            constants.mutableRefs.sharedVariables = null;
            constants.mutableRefs.sharedMonitors = null;
            constants.mutableRefs.sharedComments = null;
            constants.mutableRefs.sharedCostumes = null;
            constants.mutableRefs.sharedCostumeData = null;
            constants.mutableRefs.sharedCostumeArt = null;
            constants.mutableRefs.sharedSounds = null;
            constants.mutableRefs.sharedSoundData = null;
            constants.mutableRefs.sharedSprites = null;
            constants.mutableRefs.sharedSpriteData = null;
            constants.mutableRefs.sharedExtensions = null;
            constants.mutableRefs.isInitialRoomSync = false;
            constants.mutableRefs.isUiTransition = false;
            constants.mutableRefs.roomUUID = null;
            scheduler.reset();

            if (window.collab) delete window.collab;
            
        };

        const handleBeforeUnload = () => {
            if (constants.mutableRefs.currentCleanupFunction) {
                constants.mutableRefs.currentCleanupFunction();
                constants.mutableRefs.currentCleanupFunction = null;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return cleanup;

    } catch (error) {
        
        collabUI.hideSyncingPopup();
        collabUI.removeAllUI();
        constants.mutableRefs.provider?.destroy();
        constants.mutableRefs.provider = null;
        constants.mutableRefs.ydoc = null;
        constants.mutableRefs.yjsAwarenessInstance = null;
        return null;
    }
}

function collaborationSession() {
    const state = constants.mutableRefs.addon?.tab?.redux?.state;
    return (state && state.scratchGui && state.scratchGui.collaboration &&
        state.scratchGui.collaboration.session) || {};
}

function collaborationStatus() {
    if (constants.devMode) return 'collaborative';
    return collaborationSession().status || 'unknown';
}

export default async function ({ addon, console: addonConsole }) {
    

    try {
        constants.mutableRefs.addon = addon;
        constants.mutableRefs.BlocklyInstance = await addon.tab.traps.getBlockly();
        constants.mutableRefs.vm = addon.tab.traps.vm;

        window.collab = {
            addon: addon,
            BlocklyInstance: constants.mutableRefs.BlocklyInstance,
            vm: constants.mutableRefs.vm,
            constants: constants,
            getYjsProvider: () => constants.mutableRefs.provider,
            getYjsAwareness: () => constants.mutableRefs.yjsAwarenessInstance,
            getPresence: () => [...presence.collabStates()].map(([id, state]) => ({
                id,
                name: state && state.user ? state.user.name : null,
                targetId: (state && state.currentTargetId) || null,
                editingAsset: (state && state.editingAsset) || null,
                hasCursor: !!(state && state.cursor),
                viaStateless: presence.isViewerPresence(id)
            })),
            getSharedBlocks: () => constants.mutableRefs.sharedBlocks,
            getSharedVariables: () => constants.mutableRefs.sharedVariables,
            getSharedMonitors: () => constants.mutableRefs.sharedMonitors,
            getSharedComments: () => constants.mutableRefs.sharedComments,
            getSharedCostumes: () => constants.mutableRefs.sharedCostumes,
            getSharedCostumeData: () => constants.mutableRefs.sharedCostumeData,
            getSharedCostumeArt: () => constants.mutableRefs.sharedCostumeArt,
            getSharedSounds: () => constants.mutableRefs.sharedSounds,
            getSharedSoundData: () => constants.mutableRefs.sharedSoundData,
            getSharedSprites: () => constants.mutableRefs.sharedSprites,
            getSharedSpriteData: () => constants.mutableRefs.sharedSpriteData,
            getEditorWorkspace: () => constants.editorWorkspace(),
            getSharedExtensions: () => constants.mutableRefs.sharedExtensions,
        };

        if (!constants.mutableRefs.BlocklyInstance) throw new Error('Failed to trap Blockly instance.');
        if (!constants.mutableRefs.vm) throw new Error('Failed to trap constants.mutableRefs.vm instance.');

        collabUI.setupCSS();

        const menuBar = await addon.tab.waitForElement('[class*="menu-bar_main-menu"]', {
            markAsSeen: true,
            reduxCondition: state => state.scratchGui.mode.isPlayerOnly !== true
        });
        if (menuBar && !document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID)) {
            constants.mutableRefs.userIconContainer = document.createElement('div');
            constants.mutableRefs.userIconContainer.id = constants.COLLABORATION_USER_ICON_CONTAINER_ID;
            constants.mutableRefs.userIconContainer.classList.add('collaboration-user-icon-container');
            menuBar.parentNode.insertBefore(constants.mutableRefs.userIconContainer, menuBar.nextSibling);
            
        } else if (document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID)) {
            constants.mutableRefs.userIconContainer = document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID);
        }

        function startCollaboratorOffically() {
            if (!constants.mutableRefs.currentCleanupFunction) {
                if (collaborationStatus() === 'unknown') {
                    if (collaborationSession().room || constants.devMode) collabUI.showSyncingPopup();
                    setTimeout(() => {
                        startCollaboratorOffically();
                    }, 100);
                } else {
                    if (collaborationStatus() === 'collaborative') {
                        collabUI.showSyncingPopup();

                        collabSnapshot.whenReady().then(() => {
                            if (!constants.mutableRefs.provider) {
                                constants.mutableRefs.currentCleanupFunction = attachYjsProvider();
                            }
                        });
                    } else {
                        collabUI.hideSyncingPopup();
                    }
                }
            }
        }

        startCollaboratorOffically();

        const triggerSilence = () => {
            constants.mutableRefs.isUiTransition = true;
            if (constants.mutableRefs.loadingCooldownTimer) clearTimeout(constants.mutableRefs.loadingCooldownTimer);
            constants.mutableRefs.loadingCooldownTimer = setTimeout(() => {
                constants.mutableRefs.isUiTransition = false;
                constants.mutableRefs.loadingCooldownTimer = null;
                if (constants.mutableRefs.monitorsPublishDeferred) {
                    constants.mutableRefs.monitorsPublishDeferred = false;
                    constants.mutableRefs.publishMonitorsNow?.();
                }
            }, 500);
        };

        const handleStateChange = ({ detail } = {}) => {
            const action = detail?.action || addon.tab.redux?.lastAction;
            if (!action) return;
            const actionType = action.type;

            const isProjectLoadComplete = actionType === 'scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID' ||
                actionType === 'scratch-gui/project-state/DONE_LOADING_VM_WITH_ID';

            if (isProjectLoadComplete) {
                startCollaboratorOffically();
            }

            if (actionType === 'scratch-gui/collaboration/SET_SELECTED_ASSET') {
                const { assetType, index, targetId } = action;

                if (assetType === 'costume' && targetId) {
                    costumeArtSync.ensureArt(targetId, index);
                }

                if (constants.mutableRefs.yjsAwarenessInstance && targetId) {
                    const currentLocalState = constants.mutableRefs.yjsAwarenessInstance.getLocalState();
                    const currentAsset = currentLocalState?.editingAsset;
                    let newTimestamp = Date.now();
                    if (currentAsset && 
                        currentAsset.type === assetType && 
                        currentAsset.index === index && 
                        currentAsset.targetId === targetId) {
                        newTimestamp = currentAsset.timestamp;
                    }

                    constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', {
                        type: assetType,
                        index: index,
                        targetId: targetId,
                        timestamp: newTimestamp
                    });
                    const cursor = currentLocalState?.paintCursor;
                    if (cursor && (cursor.targetId !== targetId || cursor.index !== index)) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('paintCursor', null);
                    }
                    const float = currentLocalState?.paintFloat;
                    if (float && (float.targetId !== targetId || float.index !== index)) {
                        costumeArtSync.withdrawFloat();
                    }

                    const drag = currentLocalState?.paintDrag;
                    if (drag && (drag.targetId !== targetId || drag.index !== index)) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('paintDrag', null);
                    }
                    if (currentLocalState?.costumeDigest) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('costumeDigest', null);
                    }
                }
            }

            if (actionType === 'scratch-gui/targets/UPDATE_TARGET_LIST') {
                triggerSilence();

                const newTargetId = action.editingTarget;

                if (newTargetId && newTargetId !== constants.localUserInfo.currentTargetId) {
                    
                    constants.localUserInfo.currentTargetId = newTargetId;
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('currentTargetId', newTargetId);
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);

                        const currentTab = constants.localUserInfo.activeTabIndex;
                        if (currentTab === 1 || currentTab === 2) {
                            const target = constants.mutableRefs.vm.runtime.getTargetById(newTargetId);
                            const editingAssetType = currentTab === 1 ? 'costume' : 'sound';
                            const editingAssetIndex = currentTab === 1 ? (target?.currentCostume || 0) : 0; 
                            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', {
                                type: editingAssetType,
                                index: editingAssetIndex,
                                targetId: newTargetId,
                                timestamp: Date.now()
                            });
                        }
                    }
                    setTimeout(() => {
                        collabUI.setupCollaborationLayer();
                    }, 100);
                }
            }

            if (actionType === 'scratch-gui/navigation/ACTIVATE_TAB') {
                const newActiveTabIndex = detail.action.activeTabIndex;
                if (typeof newActiveTabIndex === 'number' && constants.localUserInfo.activeTabIndex !== newActiveTabIndex) {
                    if (newActiveTabIndex === 0) {
                        triggerSilence();
                    }

                    constants.localUserInfo.activeTabIndex = newActiveTabIndex;
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('activeTabIndex', newActiveTabIndex);
                        
                        if (newActiveTabIndex === 0) {
                            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', null);
                            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('paintCursor', null);
                            costumeArtSync.withdrawFloat();
                            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('costumeDigest', null);
                        } else if (newActiveTabIndex === 1) {
                            const target = constants.mutableRefs.vm.runtime.getEditingTarget();
                            if (target) {
                                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', {
                                    type: 'costume',
                                    index: target.currentCostume,
                                    targetId: target.id,
                                    timestamp: Date.now()
                                });
                            }
                        } else if (newActiveTabIndex === 2) {
                            const target = constants.mutableRefs.vm.runtime.getEditingTarget();
                            if (target) {
                                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingAsset', {
                                    type: 'sound',
                                    index: 0,
                                    targetId: target.id,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    }
                }
            }

            if (actionType === 'scratch-gui/theme/SET_THEME') {
                setTimeout(async () => {
                    constants.mutableRefs.BlocklyInstance = await addon.tab.traps.getBlockly();
                    collabUI.setupCollaborationLayer();
                }, 100);
            }

            if (actionType === 'scratch-gui/targets/UPDATE_TARGET_LIST') {
                setTimeout(() => {
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        collabUI.updateSpriteUserIcons();
                    }
                }, 150);
            }
        };

        if (addon.tab.redux) {
            addon.tab.redux.removeEventListener('statechanged', handleStateChange);
            addon.tab.redux.addEventListener('statechanged', handleStateChange);
            
            handleStateChange();
        } else {
            
            setTimeout(() => {
                if (!constants.mutableRefs.provider) constants.mutableRefs.currentCleanupFunction = attachYjsProvider();
            }, 1500);
        }

    } catch (error) {
        
        if (constants.mutableRefs.currentCleanupFunction) constants.mutableRefs.currentCleanupFunction();
    }

    
}
