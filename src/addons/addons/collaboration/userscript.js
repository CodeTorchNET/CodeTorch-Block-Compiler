import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

import * as collabUI from './helpers/collaboration-ui.js';
import * as constants from './helpers/constants.js';
import * as timeout from './helpers/timeout.js';
import * as helper from './helpers/helper.js';
import * as costumeSync from './helpers/costumeSync.js';
import * as soundSync from './helpers/soundSync.js';
import * as transformSync from './helpers/transformSync.js';
import * as OH from './helpers/observeHandlers.js';
import * as scheduler from './helpers/refreshScheduler.js';


function attachYjsProvider() {
    collabUI.showSyncingPopup();

    if (constants.mutableRefs.ydoc || constants.mutableRefs.provider) {
        collabUI.hideSyncingPopup();
        
        return null;
    }
    

    if (!constants.mutableRefs.vm || !constants.mutableRefs.BlocklyInstance) {
        collabUI.hideSyncingPopup();
        
        return null;
    }

    let roomName = window.CollaborationRoom;
    let username = window.CollaborationUsername;
    let token = window.collaborationOTT;

    if (constants.devMode) {
        if (!roomName) roomName = 'dev_room';
        if (!username) username = 'DevUser_' + Math.floor(Math.random() * 1000);
        if (!token) token = 'dev_token_bypass';
    }

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
    constants.mutableRefs.sharedSounds = constants.mutableRefs.ydoc.getMap('sounds');
    constants.mutableRefs.sharedSprites = constants.mutableRefs.ydoc.getArray('sprites');
    constants.mutableRefs.sharedExtensions = constants.mutableRefs.ydoc.getArray('extensions');

    const baseServerUrl = constants.WEBSOCKETBASEURL;

    if (!username || !token) {
        
        collabUI.hideSyncingPopup();
        return null;
    }

    try {
        const roomNameWithToken = `${roomName}?ott=${token}`;

        

        constants.mutableRefs.provider = new WebsocketProvider(
            baseServerUrl,
            roomNameWithToken,
            constants.mutableRefs.ydoc,
            {
                connect: false
            }
        );

        
        constants.mutableRefs.yjsAwarenessInstance = constants.mutableRefs.provider.awareness;

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

        

        constants.mutableRefs.isInitialRoomSync = true;
        if (constants.mutableRefs.loadingCooldownTimer) {
            clearTimeout(constants.mutableRefs.loadingCooldownTimer);
            constants.mutableRefs.loadingCooldownTimer = null;
        }


        constants.mutableRefs.provider.connect();
        constants.mutableRefs.sharedSprites.observeDeep(events => {
            if (events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN)) return;
            
            if (constants.mutableRefs.isInitialRoomSync) {
                return;
            }

            

            const remoteList = constants.mutableRefs.sharedSprites.toArray();
            const vm = constants.mutableRefs.vm;
            const runtime = vm.runtime;
            const remoteIds = new Set(remoteList.map(m => m.get('id')));

            constants.mutableRefs.BlocklyInstance.Events.setGroup('yjs-remote-sync');
            
            try {
                remoteList.forEach(yMap => {
                    const id = yMap.get('id');
                    const name = yMap.get('name');
                    const isStage = yMap.get('isStage');
                    const existingTarget = runtime.getTargetById(id);

                    if (!existingTarget) {
                        const newSprite = new constants.mutableRefs.vm.exports.Sprite(null, runtime);
                        newSprite.name = name;
                        const target = newSprite.createClone(isStage ? 'background' : 'sprite');
                        target.id = id;
                        target.originalTargetId = id;
                        runtime.addTarget(target);
                        transformSync.applyTransformFromYjs(target, yMap);
                        helper.hydrateTargetFromYjs(id);
                    } else {
                        if (existingTarget.getName() !== name) {
                            vm.renameSprite(id, name, false);
                        }
                        transformSync.applyTransformFromYjs(existingTarget, yMap);
                    }
                });
                const localTargets = runtime.targets.filter(t => t.isOriginal);
                localTargets.forEach(target => {
                    if (!remoteIds.has(target.id) && !target.isStage) {
                        
                        if (vm.deleteSpriteNoWarning !== undefined) {
                            vm.deleteSpriteNoWarning(target.id, false);
                        } else {
                            vm.deleteSprite(target.id, false);
                        }
                    }
                });
                const newOrder = [];
                remoteList.forEach(yMap => {
                    const t = runtime.getTargetById(yMap.get('id'));
                    if (t) newOrder.push(t);
                });
                
                runtime.targets.forEach(t => {
                    if (!t.isOriginal) newOrder.push(t);
                });

                if (newOrder.length > 0) {
                    runtime.targets = newOrder;
                    runtime.executableTargets = [...newOrder].reverse(); 
                }

                vm.emitTargetsUpdate(false);
            } finally {
                constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
            }
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
            try {
                const isLocal = events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN);
                if (isLocal) return;
                if (constants.mutableRefs.isInitialRoomSync) return;

                const Blockly = constants.mutableRefs.BlocklyInstance;

                Blockly.Events.setGroup('yjs-remote-sync');
                events.forEach(event => {
                    const targetId = event.path.length >= 1 ? event.path[0] : null;
                    if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                        return;
                    }

                    const result = OH.sharedBlocks(event);
                    if (!result) return;
                    if (result.needsToolboxRefresh) scheduler.queueToolboxRefresh();
                    if (result.needsFullRefresh) {
                        scheduler.queueFullRefresh();
                    } else if (result.targetId && result.dirtyIds.length > 0) {
                        scheduler.queueBlockSync(result.targetId, result.dirtyIds);
                    }
                });
            } finally {
                setTimeout(() => {
                    constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
                }, 0);
            }
        });
        constants.mutableRefs.sharedVariables.observeDeep(events => {

            try {
                if (events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN)) return;
                if (constants.mutableRefs.isInitialRoomSync) return;
                const Blockly = constants.mutableRefs.BlocklyInstance;

                Blockly.Events.setGroup('yjs-remote-sync');

                let needsWorkspaceRefresh = false;
                events.forEach(event => {
                    const targetId = event.path.length >= 1 ? event.path[0] : null;
                    if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                        return;
                    }

                    needsWorkspaceRefresh = needsWorkspaceRefresh || OH.sharedVariables(event);
                });

                if (needsWorkspaceRefresh) {
                    scheduler.queueFullRefresh();
                    scheduler.queueToolboxRefresh();
                }

                setTimeout(() => {
                    constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
                }, 0);

            } catch (e) {

                constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
            }
        });

        constants.mutableRefs.sharedMonitors.observeDeep(events => {

            const isLocal = events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN);
            if (isLocal) return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            try {
                const Blockly = constants.mutableRefs.BlocklyInstance;
                Blockly.Events.setGroup('yjs-remote-sync');

                events.forEach(event => {
                    OH.sharedMonitors(event);
                });
                scheduler.queueToolboxRefresh();
            } catch (e) {

            } finally {
                setTimeout(() => {
                    constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
                }, 0);
            }
        });

        constants.mutableRefs.sharedComments.observeDeep(events => {

            const isLocal = events.some(event => event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN);
            if (isLocal) return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            const Blockly = constants.mutableRefs.BlocklyInstance;
            Blockly.Events.setGroup('yjs-remote-sync');

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
            } finally {
                setTimeout(() => {
                    constants.mutableRefs.BlocklyInstance.Events.setGroup(false);
                }, 0);
            }
        });
        constants.mutableRefs.sharedCostumes.observeDeep(events => {
            if (constants.mutableRefs.isInitialRoomSync) return;

            events.forEach(event => {
                const targetId = event.path.length > 0 ? event.path[0] : null;
                if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                    return;
                }

                costumeSync.handleRemoteCostumeChanges(event);
            });
        });

        constants.mutableRefs.sharedSounds.observeDeep(events => {
            if (constants.mutableRefs.isInitialRoomSync) return;

            events.forEach(event => {
                const targetId = event.path.length > 0 ? event.path[0] : null;
                if (targetId && !constants.mutableRefs.vm.runtime.getTargetById(targetId)) {
                    return;
                }

                soundSync.handleRemoteSoundChanges(event);
            });
        });

        const handleTargetBlocksChanged = (targetId, [type, payload]) => {
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;
            if (constants.mutableRefs.isInitialRoomSync) return;
            const target = constants.mutableRefs.vm.runtime.getTargetById(targetId);
            if (!target) return;

            constants.mutableRefs.ydoc.transact(() => {
                let yTargetMap = constants.mutableRefs.sharedBlocks.get(targetId);
                if (!yTargetMap) {
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
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;
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
                    constants.mutableRefs.vm.emitWorkspaceUpdate();
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleMonitorsUpdate = (monitorList) => {
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;
            if (constants.mutableRefs.isInitialRoomSync || constants.mutableRefs.isUiTransition) return;

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
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;
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
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;

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
                const hasTransformField = transformSync.TRANSFORM_FIELDS.some(
                    key => Object.prototype.hasOwnProperty.call(properties, key));
                if (hasTransformField) {
                    if (constants.mutableRefs.isInitialRoomSync) continue;
                    transformSync.handleLocalTransformChange(targetId, properties);
                }
            }
        };

        const handleTargetsIndexChanged = (data) => {
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            constants.mutableRefs.ydoc.transact(() => {
                const sharedSprites = constants.mutableRefs.sharedSprites;
                const { id, currentIndex } = data[0];
                
                let oldIndex = -1;
                let itemToMove = null;

                for (let i = 0; i < sharedSprites.length; i++) {
                    const yMap = sharedSprites.get(i);
                    if (yMap.get('id') === id) {
                        oldIndex = i;
                        itemToMove = yMap;
                        break;
                    }
                }

                if (oldIndex !== -1 && oldIndex !== currentIndex) {
                    const cloneMap = new Y.Map();
                    itemToMove.forEach((v, k) => cloneMap.set(k, v));
                    
                    sharedSprites.delete(oldIndex);
                    sharedSprites.insert(currentIndex, [cloneMap]);
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleAddSprite = () => {
            if (constants.mutableRefs.isInitialRoomSync) return;
            setTimeout(async () => {
                if (constants.mutableRefs.isInitialRoomSync) return;
                const targets = constants.mutableRefs.vm.runtime.targets;
                const sharedSprites = constants.mutableRefs.sharedSprites;
                
                for (const target of targets) {
                    if (target.isOriginal && !constants.mutableRefs.sharedBlocks.has(target.id)) {
                        
                        await helper.pushTargetStateToYjs(target);
                    }
                }

                constants.mutableRefs.ydoc.transact(() => {
                    if (sharedSprites.length > 0) sharedSprites.delete(0, sharedSprites.length);
                    const ySpriteArray = targets.map(target => helper.serializeSpriteForYjs(target));
                    sharedSprites.insert(0, ySpriteArray);
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);
            }, 100);
        };

        const handleDeleteSprite = (targetId) => {
            if (constants.mutableRefs.isInitialRoomSync) return;
            constants.mutableRefs.ydoc.transact(() => {
                const sharedSprites = constants.mutableRefs.sharedSprites;
                for (let i = 0; i < sharedSprites.length; i++) {
                    const yMap = sharedSprites.get(i);
                    if (yMap.get('id') === targetId) {
                        sharedSprites.delete(i);
                        break;
                    }
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
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleTargetRenamed = (targetId, newName) => {

            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;
            if (constants.mutableRefs.isInitialRoomSync) return;

            constants.mutableRefs.ydoc.transact(() => {
                
                const sharedSprites = constants.mutableRefs.sharedSprites;
                for (let i = 0; i < sharedSprites.length; i++) {
                    const yMap = sharedSprites.get(i);
                    
                    if (yMap.get('id') === targetId) {
                        
                        yMap.set('name', newName);
                        break;
                    }
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        };

        const handleExtensionAdded = (extension) => {
            if (constants.mutableRefs.BlocklyInstance?.Events.getGroup() === 'yjs-remote-sync') return;

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
        };

        constants.mutableRefs.vm.on('TARGET_BLOCKS_CHANGED', handleTargetBlocksChanged);
        constants.mutableRefs.vm.on('TARGET_VARIABLES_CHANGED', handleTargetVariablesChanged);
        constants.mutableRefs.vm.on('MONITORS_UPDATE', handleMonitorsUpdate);
        constants.mutableRefs.vm.on('TARGET_COMMENTS_CHANGED', handleTargetCommentsChanged);
        constants.mutableRefs.vm.on('TARGET_COSTUME_CHANGED', handleTargetCostumeChanged);
        constants.mutableRefs.vm.on('SOUNDS_CHANGED', handleTargetSoundsChanged);
        constants.mutableRefs.vm.on('TARGET_SIMPLE_PROPERTY_CHANGED', handleTargetSimplePropertyChanged);
        constants.mutableRefs.vm.on('TARGET_RENAMED', handleTargetRenamed);
        constants.mutableRefs.vm.on('TARGETS_INDEX_CHANGED', handleTargetsIndexChanged);
        constants.mutableRefs.vm.on('ADD_SPRITE', handleAddSprite);
        constants.mutableRefs.vm.on('DELETE_SPRITE', handleDeleteSprite);
        constants.mutableRefs.vm.on('COLLABORATION_EXTENSION_ADDED', handleExtensionAdded);
        constants.mutableRefs.provider.on('synced', (syncedState) => {
            if (syncedState && constants.mutableRefs.provider.synced) {
                setTimeout(() => {
                    constants.mutableRefs.isInitialRoomSync = true;
                    try {
                        constants.mutableRefs.ydoc.transact(() => {
                            helper.performInitialSync();
                        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
                    } finally {
                        collabUI.hideSyncingPopup();
                        timeout.resetInactivityTimers();
                        constants.mutableRefs.isInitialRoomSync = false;
                        setTimeout(() => {
                            constants.mutableRefs.vm?.emitTargetsUpdate(false);
                        }, 500);

                        if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
                            constants.mutableRefs.addon.tab.redux.dispatch({
                                type: 'scratch-gui/collaboration/SET_COLLAB_ACTIVE',
                                payload: true
                            });
                        }
                    }
                }, 100);
            }
        });

        constants.mutableRefs.provider.on('destroy', () => {
            timeout.clearInactivityTimers();
            collabUI.hideSyncingPopup();
        });

        constants.mutableRefs.provider.on('ws-close', (event) => {
            timeout.clearInactivityTimers();
            collabUI.hideSyncingPopup();
        });

        constants.mutableRefs.provider.on('status', event => {
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

        constants.mutableRefs.yjsAwarenessInstance.on('change', changes => {
            if (constants.mutableRefs.collaborationLayerGroup && constants.mutableRefs.currentWorkspaceSvg) {
                const { removed } = changes;
                const states = constants.mutableRefs.yjsAwarenessInstance.getStates();
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

                            const workspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
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

                Object.values(assetClaims).forEach(claims => {
                    if (claims.length === 0) return;
                    claims.sort((a, b) => {
                        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
                        return a.clientID - b.clientID;
                    });
                    
                    const winner = claims[0];
                    if (winner.clientID !== localClientID) {
                        const lockKey = `${winner.targetId}:${winner.index}`;
                        const lockInfo = { name: winner.user.name, color: winner.user.color };
                        if (winner.type === 'costume') lockedCostumes[lockKey] = lockInfo;
                        if (winner.type === 'sound') lockedSounds[lockKey] = lockInfo;
                    }
                });

                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/collaboration/SET_ASSET_LOCKS',
                    lockedCostumes,
                    lockedSounds
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

            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();
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
            

            constants.mutableRefs.BlocklyInstance.CollaborationEmitter.off('blockDrag', onLocalDrag);
            constants.mutableRefs.BlocklyInstance.CollaborationEmitter.off('blockDragEnd', onLocalDragEnd);

            constants.mutableRefs.vm.removeListener('TARGET_BLOCKS_CHANGED', handleTargetBlocksChanged);
            constants.mutableRefs.vm.removeListener('TARGET_VARIABLES_CHANGED', handleTargetVariablesChanged);
            constants.mutableRefs.vm.removeListener('MONITORS_UPDATE', handleMonitorsUpdate);
            constants.mutableRefs.vm.removeListener('TARGET_COMMENTS_CHANGED', handleTargetCommentsChanged);
            constants.mutableRefs.vm.removeListener('TARGET_COSTUME_CHANGED', handleTargetCostumeChanged);
            constants.mutableRefs.vm.removeListener('SOUNDS_CHANGED', handleTargetSoundsChanged);
            constants.mutableRefs.vm.removeListener('TARGET_SIMPLE_PROPERTY_CHANGED', handleTargetSimplePropertyChanged);
            constants.mutableRefs.vm.removeListener('TARGET_RENAMED', handleTargetRenamed);
            constants.mutableRefs.vm.removeListener('TARGETS_INDEX_CHANGED', handleTargetsIndexChanged);
            constants.mutableRefs.vm.removeListener('ADD_SPRITE', handleAddSprite);
            constants.mutableRefs.vm.removeListener('DELETE_SPRITE', handleDeleteSprite);
            constants.mutableRefs.vm.removeListener('EXTENSION_ADDED', handleExtensionAdded);

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
                constants.mutableRefs.provider.off('destroy');
                constants.mutableRefs.provider.off('status');
                constants.mutableRefs.provider.off('ws-close');
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
            constants.mutableRefs.sharedSounds = null;
            constants.mutableRefs.sharedSprites = null;
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

let shouldRunCollaborationAddon = constants.devMode ? true : "waiting";
window.StartCollaborator = function (action = true) {
    shouldRunCollaborationAddon = action;
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
            getSharedBlocks: () => constants.mutableRefs.sharedBlocks,
            getSharedVariables: () => constants.mutableRefs.sharedVariables,
            getSharedMonitors: () => constants.mutableRefs.sharedMonitors,
            getSharedComments: () => constants.mutableRefs.sharedComments,
            getSharedCostumes: () => constants.mutableRefs.sharedCostumes,
            getSharedSounds: () => constants.mutableRefs.sharedSounds,
            getSharedSprites: () => constants.mutableRefs.sharedSprites,
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
                if (shouldRunCollaborationAddon == "waiting") {
                    setTimeout(() => {
                        startCollaboratorOffically();
                    }, 100);
                } else {
                    if (shouldRunCollaborationAddon) {
                        
                        setTimeout(() => {
                            if (!constants.mutableRefs.provider) {
                                constants.mutableRefs.currentCleanupFunction = attachYjsProvider();
                            }
                        }, 800);
                    }
                }
            }
        }

        if (document.querySelectorAll('[class*="loader_background_"]').length === 0) {
            startCollaboratorOffically();
        }


        const triggerSilence = () => {
            constants.mutableRefs.isUiTransition = true;
            if (constants.mutableRefs.loadingCooldownTimer) clearTimeout(constants.mutableRefs.loadingCooldownTimer);
            constants.mutableRefs.loadingCooldownTimer = setTimeout(() => {
                constants.mutableRefs.isUiTransition = false;
                constants.mutableRefs.loadingCooldownTimer = null;
            }, 500); // 500ms total fallback to ensure we don't stay silent forever if no events fire.
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
