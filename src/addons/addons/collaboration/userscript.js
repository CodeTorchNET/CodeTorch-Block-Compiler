// collaboration-main.js

/**
 *  PLEASE NOTE:
 * I am going to be completely honest the comments for this entire addon are AI generated.
 * I told it to take my dirty comments and make them better. That being said it probably messed up.
 * So if you have questions just contact me.
*/
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

import * as collabUI from './helpers/collaboration-ui.js'; // Manages UI updates related to collaboration (cursors, user icons, popups).
import * as constants from './helpers/constants.js'; // Stores global constants and mutable references for the collaboration addon.
import * as assetSync from './helpers/assetSync.js'; // Handles synchronization of costume and sound asset changes.
import * as timeout from './helpers/timeout.js'; // Manages inactivity detection and related timeouts.
import * as helper from './helpers/helper.js'; // Contains general utility functions.
import * as yEventsHandler from './helpers/yEvents.js'; // Observes and processes block-related Yjs events.
import * as yProjectEventsHandler from './helpers/yProjectEvents.js'; // Observes and processes project-level Yjs events (e.g., sprite, costume, sound changes).
import CollaborationConsole from './helpers/CollaborationConsole.js';
import { recorder } from './helpers/DebugRecorder.js'; 

/**
 * Checks if a specific asset (costume or sound) is currently locked by another collaborator,
 * or if it's already being edited by the local user. If unlocked, the local user attempts to acquire the lock.
 * This function dictates whether the UI for an asset should be enabled (unlocked) or disabled (locked).
 *
 * @param {number} assetIndexToCheck The index of the asset (costume or sound) within its target.
 * @param {1|2} type The type of asset: 1 for costume, 2 for sound.
 * @returns {boolean} True if the asset is locked by another user (UI should be disabled), false otherwise (UI should be enabled for local editing).
 */
window.assetLocked = function (assetIndexToCheck, type) {
    // Pre-check: Ensure necessary Yjs, user info, and VM instances are available.
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.localUserInfo || !constants.mutableRefs.vm) {
        if (constants.debugging) CollaborationConsole.log(`Collab AssetLock: Awareness, constants.localUserInfo, or constants.mutableRefs.vm not ready. Assuming not locked for type ${type}.`);
        return false; // If not ready, assume unlocked to avoid blocking.
    }

    // Get the name of the currently editing target (sprite or stage).
    const targetNameOfAsset = constants.mutableRefs.vm.runtime.getEditingTarget()?.getName?.() || null;
    // Get the local client's unique ID from Yjs awareness.
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;

    // Validate input parameters.
    if (typeof targetNameOfAsset !== 'string' || typeof assetIndexToCheck !== 'number' || (type !== 1 && type !== 2)) {
        CollaborationConsole.error('Collab AssetLock: Invalid parameters.', { targetNameOfAsset, assetIndexToCheck, type });
        return false;
    }

    // Retrieve all current awareness states from connected clients.
    const states = constants.mutableRefs.yjsAwarenessInstance.getStates();
    let isAssetLockedByOtherUser = false; // Flag to track if another user has locked this asset.
    let lockerName = null; // Stores the name of the user who locked the asset.

    // Iterate through remote users' awareness states to check for existing locks.
    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; // Skip the local client's own state.

        const remoteUser = state.user; // Remote user's general info.
        let remoteEditingAssetInfo = null;

        // Determine which asset info to check based on 'type'.
        if (type === 1) { // Costume
            remoteEditingAssetInfo = state.editingCostumeInfo;
        } else { // Sound
            remoteEditingAssetInfo = state.editingSoundInfo;
        }

        // Check if a remote user is editing the SAME asset (same target, same asset index, same type).
        if (remoteUser && remoteEditingAssetInfo &&
            remoteEditingAssetInfo.targetName === targetNameOfAsset &&
            ((type === 1 && remoteEditingAssetInfo.costumeIndex === assetIndexToCheck) ||
                (type === 2 && remoteEditingAssetInfo.soundIndex === assetIndexToCheck))) {
            isAssetLockedByOtherUser = true;
            lockerName = remoteUser.name; // Record the name of the user holding the lock.
        }
    });

    // Get the local user's current editing asset info.
    let currentLocalEditInfo = null;
    if (type === 1) {
        currentLocalEditInfo = constants.localUserInfo.editingCostumeInfo;
    } else {
        currentLocalEditInfo = constants.localUserInfo.editingSoundInfo;
    }

    const assetTypeString = type === 1 ? 'Costume' : 'Sound';

    // Scenario 1: Asset is locked by another user.
    if (isAssetLockedByOtherUser) {
        if (constants.debugging) {
            CollaborationConsole.log(`Collab AssetLock: ${assetTypeString} index ${assetIndexToCheck} for target "${targetNameOfAsset}" is LOCKED by ${lockerName}.`);
        }
        // If the local user *thought* they were editing this asset but a remote user has the lock,
        // it indicates a conflict or a stale local state. Clear the local lock.
        if (currentLocalEditInfo &&
            currentLocalEditInfo.targetName === targetNameOfAsset &&
            ((type === 1 && currentLocalEditInfo.costumeIndex === assetIndexToCheck) ||
                (type === 2 && currentLocalEditInfo.soundIndex === assetIndexToCheck))) {
            CollaborationConsole.warn(`Collab AssetLock: Conflict detected. ${assetTypeString} ${targetNameOfAsset}[${assetIndexToCheck}] is locked by ${lockerName}, but was locally marked as editing. Clearing local lock.`);
            if (type === 1) assetSync.clearLocalEditingCostume();
            else assetSync.clearLocalEditingSound();
        }
        return true; // Return true to indicate the UI should be disabled.
    }

    // Scenario 2: Asset is NOT locked by another user, and the local user is ALREADY editing it.
    if (currentLocalEditInfo &&
        currentLocalEditInfo.targetName === targetNameOfAsset &&
        ((type === 1 && currentLocalEditInfo.costumeIndex === assetIndexToCheck) ||
            (type === 2 && currentLocalEditInfo.soundIndex === assetIndexToCheck))) {
        if (constants.debugging) {
            CollaborationConsole.log(`Collab AssetLock: ${assetTypeString} index ${assetIndexToCheck} for target "${targetNameOfAsset}" is ALREADY being edited by local user. UNLOCKED for local.`);
        }
        
        return false; // Return false to indicate the UI should be enabled.
    }

    // Scenario 3: Asset is NOT locked by another user, and the local user is NOT editing it.
    // The local user can now acquire the lock.
    if (constants.debugging) {
        CollaborationConsole.log(`Collab AssetLock: ${assetTypeString} index ${assetIndexToCheck} for target "${targetNameOfAsset}" is UNLOCKED. Local user will take the lock.`);
    }

    // Set the local editing state in constants.localUserInfo and update awareness.
    // For sounds, verify that sounds are loaded before attempting to set editing state.
    // If sounds aren't loaded yet, return false (unlocked) to avoid blocking the UI.
    if (type === 1) {
        assetSync.setLocalEditingCostume(targetNameOfAsset, assetIndexToCheck);
    } else {
        // For sounds, check if sounds are available first
        const target = targetNameOfAsset === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetNameOfAsset);
        if (target) {
            const sounds = target.getSounds();
            if (sounds && sounds.length > assetIndexToCheck && sounds[assetIndexToCheck] && sounds[assetIndexToCheck].asset && sounds[assetIndexToCheck].asset.data) {
                assetSync.setLocalEditingSound(targetNameOfAsset, assetIndexToCheck);
            } else {
                // Sounds not loaded yet - defer setting editing state, but don't block UI
                if (constants.debugging) {
                    CollaborationConsole.log(`Collab AssetLock: Sounds not fully loaded yet for "${targetNameOfAsset}". Will retry when sound is available.`);
                }
                // Try again after a short delay to allow sounds to load
                setTimeout(() => {
                    const retryTarget = targetNameOfAsset === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetNameOfAsset);
                    if (retryTarget) {
                        const retrySounds = retryTarget.getSounds();
                        if (retrySounds && retrySounds.length > assetIndexToCheck && retrySounds[assetIndexToCheck] && retrySounds[assetIndexToCheck].asset && retrySounds[assetIndexToCheck].asset.data) {
                            assetSync.setLocalEditingSound(targetNameOfAsset, assetIndexToCheck);
                        }
                    }
                }, 100);
            }
        }
    }

    return false; // Return false to indicate the UI should be enabled.
};

// --- Main Yjs Attachment Function ---
/**
 * Initializes and connects the Yjs WebsocketProvider, setting up the collaborative environment.
 * This includes creating the Yjs document, awareness instance, and attaching event listeners.
 * @returns {function | null} A cleanup function to disconnect and tear down the collaboration, or null if initialization fails.
 */
function attachYjsProvider() {
    // Show a "Syncing..." popup to indicate collaboration is starting.
    collabUI.showSyncingPopup();
    // Initialize global collaboration lock state to false.
    window.collaborationLocked = false;
    // Reset flags indicating if initial project/block events have been processed.
    constants.mutableRefs.hasProcessedInitialProjectEvents = false;
    constants.mutableRefs.hasProcessedInitialBlockEvents = false;

    // Prevent re-attachment if Yjs provider or document already exists.
    if (constants.mutableRefs.ydoc || constants.mutableRefs.provider) {
        collabUI.hideSyncingPopup();
        CollaborationConsole.warn('Collab: Yjs already attached. Skipping.');
        return null;
    }
    CollaborationConsole.log('Collab: Attaching Yjs constants.mutableRefs.provider...');

    // Ensure VM and Blockly instances are available before proceeding.
    if (!constants.mutableRefs.vm || !constants.mutableRefs.BlocklyInstance) {
        collabUI.hideSyncingPopup();
        CollaborationConsole.error('Collab: Cannot attach Yjs constants.mutableRefs.provider without constants.mutableRefs.vm and Blockly instances.');
        return null;
    }

    // --- DEV MODE INITIALIZATION ---
    // Prepare credentials, falling back to defaults if devMode is enabled
    let roomName = window.CollaborationRoom;
    let username = window.CollaborationUsername;
    let token = window.collaborationOTT;

    if (constants.devMode) {
        if (!roomName) {
            roomName = 'dev_room';
            CollaborationConsole.warn(`Collab: DevMode enabled. Using default Room ID: ${roomName}`);
        }
        if (!username) {
            username = 'DevUser_' + Math.floor(Math.random() * 1000);
            CollaborationConsole.warn(`Collab: DevMode enabled. Using generated Username: ${username}`);
        }
        if (!token) {
            token = 'dev_token_bypass';
            CollaborationConsole.warn(`Collab: DevMode enabled. Using bypass token.`);
        }
    }

    // Check if we have the OTT before proceeding.
    // We check the local 'token' variable now, which handles the devMode fallback
    if (!token) {
        CollaborationConsole.error('Collab: Cannot attach Yjs provider, collaboration OTT is missing.');
        collabUI.hideSyncingPopup();
        const popup = document.createElement('div');
        popup.className = 'collab-popup';
        popup.innerHTML = `
            <div class="collab-popup-content">
                <h2>Collaboration Error</h2>
                <p>Could not retrieve a collaboration session token. You might not have permission to edit this project.</p>
            </div>
        `;
        document.body.appendChild(popup);
        return null;
    }

    // Initialize the Yjs document.
    constants.mutableRefs.ydoc = new Y.Doc();
    // Get Y.Array instances for block-related events and project-level events.
    constants.mutableRefs.yEvents = constants.mutableRefs.ydoc.getArray('events'); // Block events.
    constants.mutableRefs.yProjectEvents = constants.mutableRefs.ydoc.getArray('project-events'); // Project asset/sprite changes.
    // Get a Y.Map instance for initial project data synchronization.
    constants.mutableRefs.yProjectDataSync = constants.mutableRefs.ydoc.getMap('project-data-sync');

    // --- Initialize Debug Recorder for this session ---
    // Extract project ID from global logic, URL, or local roomName variable
    const projectId = roomName || 'unknown_project';
    
    recorder.startSession(projectId).then(() => {
        // Save the initial project JSON snapshot for debugging
        if (constants.mutableRefs.vm) {
            try {
                const projectJSON = constants.mutableRefs.vm.toJSON();
                recorder.saveSnapshot(projectJSON);
                CollaborationConsole.log('Collab: Saved initial project JSON snapshot to IndexedDB');
            } catch (e) {
                CollaborationConsole.error('Collab: Failed to save initial project JSON snapshot:', e);
            }
        }
    });

    // Set up observers to react to changes in Yjs shared types.
    yEventsHandler.setupYEventsObserver();
    yProjectEventsHandler.setupYProjectEventsObserver();

    // --- WebRTC Provider Setup ---
    const baseServerUrl = constants.WEBSOCKETBASEURL;
    
    // Abort if authentication details are missing.
    if (!username || !token) {
        CollaborationConsole.error('Collab: Cannot attach Yjs provider, missing CollaborationUsername or OTT.');
        collabUI.hideSyncingPopup();
        const popup = document.createElement('div');
        popup.className = 'collab-popup';
        popup.innerHTML = `
            <div class="collab-popup-content">
                <h2>Collaboration Error</h2>
                <p>Authentication information (username/token) is missing. Please ensure you are logged in.</p>
                <p style="font-size: 11px;">You might need to refresh the page after logging in.</p>
            </div>
        `;
        document.body.appendChild(popup);
        return null;
    }

    try {
        // Pass the OTT as a query parameter in the room name. The y-websocket server expects this.
        const roomNameWithToken = `${roomName}?ott=${token}`;
        
        CollaborationConsole.log(`Collab: Attempting to connect to WebSocket server for room: ${roomName}`);
        
        // Instantiate the WebsocketProvider.
        // `connect: false` allows setting initial awareness state *before* the WebSocket opens.
        constants.mutableRefs.provider = new WebsocketProvider(
            baseServerUrl,
            roomNameWithToken, // Use the room name with the token
            constants.mutableRefs.ydoc,
            {
                connect: false // Don't connect immediately.
            }
        );

        CollaborationConsole.log('Collab: WebsocketProvider instance created');
        // Get the Yjs Awareness instance from the provider.
        constants.mutableRefs.yjsAwarenessInstance = constants.mutableRefs.provider.awareness;

        // --- Initialize Local Awareness State (before provider.connect()) ---
        // This ensures the local user's initial state is sent immediately upon connection.
        const localUserColor = collabUI.getRandomColor();
        constants.localUserInfo.name = username; // Set local user's name from authentication.
        constants.localUserInfo.color = localUserColor;
        constants.localUserInfo.currentTargetName = null; // Will be set by Redux listener.

        // Set the local user's initial awareness state fields.
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('user', { name: constants.localUserInfo.name, color: constants.localUserInfo.color });
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('currentTargetName', constants.localUserInfo.currentTargetName);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('activeTabIndex', constants.localUserInfo.activeTabIndex);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('chatMessage', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('cursor', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingCostumeInfo', constants.localUserInfo.editingCostumeInfo);
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingSoundInfo', constants.localUserInfo.editingSoundInfo);
        CollaborationConsole.log(`Collab: Local user initialized: ${constants.localUserInfo.name} (${localUserColor}), Target: ${constants.localUserInfo.currentTargetName}`);

        // Connect the provider AFTER setting up the initial awareness state.
        constants.mutableRefs.provider.connect();

        // --- Listener for successful sync ---
        // This event fires when the Yjs document is fully synced with peers.
        constants.mutableRefs.provider.on('synced', (syncedState) => {
            if (syncedState && constants.mutableRefs.provider.synced) {
                if (constants.debugging) CollaborationConsole.log('Collab: Provider synced with peers.');

                // Logic for initial project data synchronization:
                if (constants.mutableRefs.alreadyRanSetup !== true) {
                    if (!constants.mutableRefs.yProjectDataSync.get('sync')) {
                        if (constants.debugging) CollaborationConsole.log('Collab: First user detected, pushing initial project state');

                        const projectDataSync = {
                            type: 'projectDataSync',
                            data: constants.mutableRefs.vm.runtime.targets.map(target => ({
                                targetId: target.id,
                                targetName: target.getName(),
                                blockData: JSON.stringify(target.blocks._blocks || {}), 
                                commentData: JSON.stringify(target.comments || {})
                            }))
                        };

                        constants.mutableRefs.ydoc.transact(() => {
                            constants.mutableRefs.yProjectDataSync.set('sync', projectDataSync);
                            if (constants.debugging) CollaborationConsole.log('Collab: Pushed initial project data sync');
                        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
                    } else {
                        if (constants.debugging) CollaborationConsole.log('Collab: Initial sync data already exists, applying it now.');
                        const syncData = constants.mutableRefs.yProjectDataSync.get('sync');
                        if (syncData && syncData.data) {
                            let corruptionDetails = null;
                            for (const targetData of syncData.data) {
                                const blocksObject = JSON.parse(targetData.blockData);
                                const cycleCheckResult = helper.findCircularDependency(blocksObject, targetData.targetName);
                                if (cycleCheckResult.hasCycle) {
                                    corruptionDetails = cycleCheckResult;
                                    break;
                                }
                            }

                            if (corruptionDetails) {
                                CollaborationConsole.error("Collab FATAL: Received corrupt master copy with circular dependency. Aborting project load.", corruptionDetails);
                                collabUI.hideSyncingPopup();

                                const popup = document.createElement('div');
                                popup.className = 'collab-popup';
                                popup.innerHTML = `
                                    <div class="collab-popup-content">
                                        <h2>Collaboration Error</h2>
                                        <p>The project data from the session is corrupt and cannot be loaded. This session is in an unrecoverable state.</p>
                                        <p>Please report this to @CodeTorch.</p>
                                    </div>
                                `;
                                document.body.appendChild(popup);

                                return; // Abort applying the sync data.
                            }
                            
                            constants.mutableRefs.vm.runtime.targets.forEach(t => {
                                const originalForceNoGlow = t.blocks.forceNoGlow;
                                t.blocks.forceNoGlow = true; 
                                t.blocks.deleteAllBlocks(); 
                                t.blocks.forceNoGlow = originalForceNoGlow; 
                            });

                            syncData.data.forEach(targetData => {
                                CollaborationConsole.log("Collab: Applying initial blocks for target:", targetData.targetName);
                                const { targetName, blockData, commentData } = targetData;

                                const target = targetName === 'Stage' ?
                                    constants.mutableRefs.vm.runtime.getTargetForStage() :
                                    constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);

                                if (target && blockData) {
                                    try {
                                        const newBlocksObject = JSON.parse(blockData);
                                        const originalForceNoGlow = target.blocks.forceNoGlow;
                                        target.blocks.forceNoGlow = true; 
                                        for (const blockId in newBlocksObject) {
                                            if (Object.prototype.hasOwnProperty.call(newBlocksObject, blockId)) {
                                                target.blocks.createBlock(newBlocksObject[blockId]); 
                                            }
                                        }
                                        target.blocks.forceNoNoGlow = originalForceNoGlow; 
                                    } catch (e) {
                                        CollaborationConsole.error(`Collab: Error applying initial blocks for target "${targetName}":`, e);
                                    }
                                }
                                if (target && commentData) {
                                    for (var x of Object.keys(target.comments)) {
                                        const commentToDelete = target.comments[x];
                                        helper.CommentDelete({
                                            commentId: commentToDelete.id,
                                            blockId: commentToDelete.blockId
                                        }, target.getName());
                                    }
                                    const newCommentsObject = JSON.parse(commentData);
                                    for (const commentId in newCommentsObject) {
                                        if (Object.prototype.hasOwnProperty.call(newCommentsObject, commentId)) {
                                            const comment = newCommentsObject[commentId];
                                            const commentCreateEvent = {
                                                type: constants.mutableRefs.BlocklyInstance.Events.COMMENT_CREATE,
                                                commentId: comment.id,
                                                blockId: comment.blockId,
                                                text: comment.text,
                                                xy: { x: comment.x, y: comment.y },
                                                width: comment.width,
                                                height: comment.height,
                                                minimized: comment.minimized
                                            };
                                            helper.CommentCreate(commentCreateEvent, target.getName());
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
                
                constants.mutableRefs.vm.runtime.emitProjectChanged();
                if (constants.debugging) CollaborationConsole.log('Collab: Initial sync data applied successfully');
                
                constants.mutableRefs.vm.setEditingTarget(constants.mutableRefs.vm.runtime.getTargetForStage().id);
                if (constants.mutableRefs.vm.runtime.targets[1]) {
                    constants.mutableRefs.vm.setEditingTarget(constants.mutableRefs.vm.runtime.targets[1].id);
                }
                constants.mutableRefs.alreadyRanSetup = true; 
                CollaborationConsole.log('Collab: Provider synced, running initial setup...');
                
                helper.processSyncItems().then(() => {
                    collabUI.hideSyncingPopup();
                    timeout.resetInactivityTimers();
                });
            }
        });

        // Listener for when the provider is explicitly destroyed.
        constants.mutableRefs.provider.on('destroy', () => {
            CollaborationConsole.log("Collab: constants.mutableRefs.provider emitted 'destroy'.");
            timeout.clearInactivityTimers(); 
            collabUI.hideSyncingPopup(); 
        });

        // Listener for WebSocket connection close events.
        constants.mutableRefs.provider.on('ws-close', (event) => {
            if (constants.debugging) CollaborationConsole.log('Collab: constants.mutableRefs.provider WebSocket connection closed. Clearing inactivity timers.', event.code, event.reason);
            timeout.clearInactivityTimers(); 
            
            if (event.code === 1008 || event.reason === 'Authentication failed') {
                const popup = document.createElement('div');
                popup.className = 'collab-popup';
                popup.innerHTML = `
                     <div class="collab-popup-content">
                         <h2>Authentication Required</h2>
                         <p>Your collaboration session could not be authenticated. Please ensure you are logged in.</p>
                         <p style="font-size: 11px;margin-top: 1.5rem;">It's recommended to refresh the page.</p>
                     </div>
                 `;
                document.body.appendChild(popup);
            } else {
                collabUI.hideSyncingPopup(); 
            }
        });

        // Listener for provider status changes (connecting, connected, disconnected).
        constants.mutableRefs.provider.on('status', event => {
            if (constants.debugging) CollaborationConsole.log('Collab: constants.mutableRefs.provider status event:', event.status);
            if (event.status === 'disconnected') {
                if (constants.debugging) CollaborationConsole.log('Collab: Provider disconnected.');
                timeout.clearInactivityTimers(); 
            } else if (event.status === 'connecting') {
                collabUI.showSyncingPopup(); 
                timeout.clearInactivityTimers();
            } else if (event.status === 'connected') {
                if (constants.debugging) CollaborationConsole.log('Collab: Provider connected.');
                if (constants.mutableRefs.provider.synced) {
                    collabUI.hideSyncingPopup();
                }
            }
        });

        // --- Initial UI Setup for Collaboration Layer ---
        setTimeout(() => collabUI.setupCollaborationLayer(), 500);
        setTimeout(() => {
            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();
        }, 600);

        // --- Attach the MASTER Blockly Listener ---
        const mainWorkspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
        if (mainWorkspace) {
            if (constants.mutableRefs.workspaceChangeListener) mainWorkspace.removeChangeListener(constants.mutableRefs.workspaceChangeListener);
            constants.mutableRefs.workspaceChangeListener = collabUI.handleBlocklyEventForCollaboration;
            mainWorkspace.addChangeListener(constants.mutableRefs.workspaceChangeListener);
            CollaborationConsole.log('Collab: Attached main workspace change listener for ALL relevant events.');
        } else {
            CollaborationConsole.error('Collab: Could not find main workspace to attach listener!');
        }

        // --- Event Listener for CUSTOM Triggers ---
        const handleCustomTrigger = event => {
            if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.provider || !constants.mutableRefs.provider.synced) return;
            
            const detail = event.detail;
            if (!detail || !detail.triggerId) return;

            if (!constants.mutableRefs.yEvents && detail.triggerId === 'shareBlocksToTarget') {
                CollaborationConsole.warn('Collab Send: constants.mutableRefs.yEvents not ready for shareBlocksToTarget trigger.');
                return;
            }

            const currentTargetNameForAwareness = helper.getCurrentEditingTargetName();
            if (constants.debugging) CollaborationConsole.log('Collab Trigger RX:', detail.triggerId, 'Current Editing Target:', currentTargetNameForAwareness, 'Data:', detail.data);

            const config = constants.triggerEventConfig[detail.triggerId];

            if (detail.triggerId === 'blockDrag') {
                const { blockId, x, y } = detail.data;
                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', { blockId, x, y, targetName: currentTargetNameForAwareness });
            } else if (detail.triggerId === 'blockDragEnd') {
                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
            }
            else if (detail.triggerId === 'shareBlocksToTarget') {
                if (!constants.mutableRefs.ydoc || !constants.mutableRefs.yEvents || !constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime) {
                    CollaborationConsole.warn('Collab Send: Cannot process shareBlocksToTarget trigger, Yjs or constants.mutableRefs.vm not ready.');
                    return;
                }
                const { blocks, targetId, optFromTargetId } = detail.data;

                if (!blocks || !targetId) {
                    CollaborationConsole.error('Collab Send [shareBlocksToTarget]: Invalid data received from constants.mutableRefs.vm trigger.', detail.data);
                    return;
                }

                let destinationTargetName = null;
                const destTarget = constants.mutableRefs.vm.runtime.getTargetById(targetId);
                if (destTarget) {
                    destinationTargetName = destTarget.getName();
                } else {
                    CollaborationConsole.error(`Collab Send [shareBlocksToTarget]: Destination target ID "${targetId}" not found in constants.mutableRefs.vm.`);
                    return;
                }

                let sourceTargetName = null;
                if (optFromTargetId) {
                    const sourceTarget = constants.mutableRefs.vm.runtime.getTargetById(optFromTargetId);
                    if (sourceTarget) {
                        sourceTargetName = sourceTarget.getName();
                    } else {
                        CollaborationConsole.warn(`Collab Send [shareBlocksToTarget]: Optional source target ID "${optFromTargetId}" not found. Proceeding without source name.`);
                    }
                }

                const eventDataForYjs = {
                    type: constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE,
                    data: {
                        blocksData: blocks, 
                        destinationTargetName: destinationTargetName,
                        sourceTargetName: sourceTargetName
                    }
                };

                constants.mutableRefs.ydoc.transact(() => {
                    eventDataForYjs.timestamp = Date.now();
                    constants.mutableRefs.yEvents.push([eventDataForYjs]);
                    // Record TX event
                    recorder.recordYjsEvent('SEND', 'yEvents', eventDataForYjs);
                    if (constants.debugging) CollaborationConsole.log(`Collab Send [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Pushed event to constants.mutableRefs.yEvents`, eventDataForYjs.data);
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);
            }
            else if (config) { 
                if (!constants.mutableRefs.yProjectEvents || !constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime) {
                    CollaborationConsole.warn(`Collab Send: Cannot process ${detail.triggerId} trigger, constants.mutableRefs.yProjectEvents or constants.mutableRefs.vm not ready.`);
                    return;
                }

                let payloadData;

                if (config.preparePayload) {
                    payloadData = config.preparePayload(detail.data);
                } else {
                    const extractedData = {};
                    let allFieldsPresent = true;

                    for (const field of config.requiredFields) {
                        const value = detail.data[field];
                        if ((config.checkUndefined && typeof value === 'undefined') || (!config.checkUndefined && !value && !(field === 'spriteName' && value === ''))) {
                            allFieldsPresent = false;
                            break;
                        }
                        extractedData[field] = value;
                    }

                    if (!allFieldsPresent) {
                        const missingFields = config.requiredFields.filter(f =>
                            (config.checkUndefined && typeof detail.data[f] === 'undefined') ||
                            (!config.checkUndefined && !detail.data[f] && !(f === 'spriteName' && detail.data[f] === ''))
                        ).join(', ');
                        CollaborationConsole.error(`Collab Send [${config.consoleKey}]: Missing ${missingFields} in detail data.`, detail.data);
                        return;
                    }

                    payloadData = {};
                    config.payloadKeys.forEach(key => {
                        payloadData[key] = extractedData[key];
                    });
                }

                if (payloadData === null) { 
                    return;
                }

                const projectEventData = {
                    type: config.eventType,
                    data: payloadData
                };

                constants.mutableRefs.ydoc.transact(() => {
                    projectEventData.timestamp = Date.now();
                    constants.mutableRefs.yProjectEvents.push([projectEventData]);
                    // Record TX event
                    recorder.recordYjsEvent('SEND', 'yProjectEvents', projectEventData);
                    if (constants.debugging) CollaborationConsole.log(`Collab Send [${config.eventType}]: Pushed event to yProjectEvents`, projectEventData.data);
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);
            }
            // --- 'savedProject' Trigger (for project save operations) ---
            else if (detail.triggerId === 'savedProject') {
                let corruptionDetails = null;
                for (const target of constants.mutableRefs.vm.runtime.targets) {
                    const blocksToValidate = target.blocks._blocks;
                    const cycleCheckResult = helper.findCircularDependency(blocksToValidate, target.getName());
                    if (cycleCheckResult.hasCycle) {
                        CollaborationConsole.error(`Collab FATAL: Circular dependency detected in target "${target.getName()}". Aborting sync.`);
                        corruptionDetails = cycleCheckResult;
                        break;
                    }
                }

                if (corruptionDetails) {
                    const popup = document.createElement('div');
                    popup.className = 'collab-popup';
                    popup.innerHTML = `
                        <div class="collab-popup-content">
                            <h2>Project Sync Error</h2>
                            <p>An invalid block connection (a loop) was detected in your project. This can sometimes happen after complex block movements.</p>
                            <p>To fix this, the page needs to be reloaded. Your work should be saved up to this point.</p>
                            <p>Please send the debug log to @CodeTorch.</p>
                            <button id="collab-reload-button">Reload Project</button>
                        </div>
                    `;
                    
                    const popupContent = popup.querySelector('.collab-popup-content');

                    const downloadProjectButton = document.createElement('button');
                    downloadProjectButton.innerText = 'Download Project';
                    downloadProjectButton.addEventListener('click', () => {
                        document.querySelectorAll('[class*="menu-bar_menu-bar-item_"]')[1].click();
                        setTimeout(() => {
                            document.querySelectorAll('li[class*="menu_menu-item_"]')[3].click();
                        }, 500);
                    });
                    popupContent.appendChild(downloadProjectButton);

                    // --- NEW: Download Debug Log Button ---
                    const downloadLogButton = document.createElement('button');
                    downloadLogButton.innerText = 'Download Debug Log';
                    downloadLogButton.addEventListener('click', async () => {
                        downloadLogButton.innerText = "Generating...";
                        downloadLogButton.disabled = true;

                        const mapToObject = (map) => {
                            const obj = {};
                            if (!map || !(map instanceof Map)) return {};
                            map.forEach((value, key) => {
                                obj[String(key)] = value;
                            });
                            return obj;
                        };

                        let sessionInfo, yjsState, localCollabState, vmProjectJSON, yEventsData, yProjectEventsData, corruptionLog;

                        try {
                            if (corruptionDetails) {
                                const blockTypes = {};
                                const targetName = corruptionDetails.targetName;
                                const target = targetName === 'Stage' ?
                                    constants.mutableRefs.vm.runtime.getTargetForStage() :
                                    constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);

                                if (target && corruptionDetails.path) {
                                    corruptionDetails.path.forEach(blockId => {
                                        const block = target.blocks.getBlock(blockId);
                                        blockTypes[blockId] = block ? block.opcode : 'Not Found';
                                    });
                                }
                                corruptionLog = JSON.stringify({ ...corruptionDetails, blockTypes }, null, 2);
                            } else {
                                corruptionLog = '"No corruption details available."';
                            }
                        } catch (e) {
                            corruptionLog = `"Error generating Corruption Details: ${e.message}"`;
                        }

                        try {
                            sessionInfo = JSON.stringify({
                                timestamp: new Date().toISOString(),
                                url: window.location.href,
                                userAgent: navigator.userAgent,
                            }, null, 2);
                        } catch (e) {
                            sessionInfo = `"Error generating Session Info: ${e.message}"`;
                        }

                        try {
                            yjsState = JSON.stringify({
                                localClientID: constants.mutableRefs.ydoc?.clientID || 'N/A',
                                provider: {
                                    connected: constants.mutableRefs.provider?.wsconnected || false,
                                    synced: constants.mutableRefs.provider?.synced || false,
                                    url: constants.mutableRefs.provider?.url || 'N/A',
                                },
                                awareness: mapToObject(constants.mutableRefs.yjsAwarenessInstance?.getStates()),
                            }, null, 2);
                        } catch (e) {
                            yjsState = `"Error generating Yjs & Provider State: ${e.message}"`;
                        }

                        try {
                            localCollabState = JSON.stringify({
                                localUserInfo: constants.localUserInfo,
                                syncFlags: {
                                    hasProcessedInitialProjectEvents: constants.mutableRefs.hasProcessedInitialProjectEvents,
                                    hasProcessedInitialBlockEvents: constants.mutableRefs.hasProcessedInitialBlockEvents,
                                    alreadyRanSetup: constants.mutableRefs.alreadyRanSetup,
                                },
                                eventTransactionBuffer: mapToObject(constants.mutableRefs.eventTransactionBuffer),
                            }, null, 2);
                        } catch (e) {
                            localCollabState = `"Error generating Local Collaboration State: ${e.message}"`;
                        }

                        try {
                            vmProjectJSON = constants.mutableRefs.vm ? constants.mutableRefs.vm.toJSON() : '{"error": "VM instance not found."}';
                        } catch (e) {
                            vmProjectJSON = `{"error": "Failed to serialize project from VM", "message": "${e.message}"}`;
                        }

                        try {
                            yEventsData = JSON.stringify(constants.mutableRefs.yEvents?.toArray() || [], null, 2);
                        } catch (e) {
                            yEventsData = `"Error generating YEvents History: ${e.message}"`;
                        }

                        try {
                            yProjectEventsData = JSON.stringify(constants.mutableRefs.yProjectEvents?.toArray() || [], null, 2);
                        } catch (e) {
                            yProjectEventsData = `"Error generating YProjectEvents History: ${e.message}"`;
                        }

                        // --- EXPORT INDEXEDDB HISTORY (FIXED) ---
                        // We now request a Blob directly to avoid crashing the browser with a huge string
                        let dbBlob = null;
                        try {
                            dbBlob = await recorder.exportCurrentSessionAsBlob();
                        } catch (e) {
                            CollaborationConsole.error("Failed to export DB", e);
                            dbBlob = new Blob([JSON.stringify({ error: "Failed to export IndexedDB", details: e.message })], { type: 'text/plain' });
                        }
                        
                        // We need to combine the in-memory strings with the DB blob.
                        // We will use a Blob array to construct the final file.
                        
                        const headerContent = `Collaboration Addon Debug Log\n\n` +
                            `==================== CORRUPTION DETAILS ====================\n${corruptionLog}\n\n` +
                            `==================== Session Info ====================\n${sessionInfo}\n\n` +
                            `==================== Yjs & Provider State ====================\n${yjsState}\n\n` +
                            `==================== Local Collaboration State ====================\n${localCollabState}\n\n` +
                            `==================== Full Project State (from vm.toJSON()) ====================\n${vmProjectJSON}\n\n` +
                            `==================== YEvents History (In-Memory Current) ====================\n${yEventsData}\n\n` +
                            `==================== YProjectEvents History (In-Memory Current) ====================\n${yProjectEventsData}\n\n` +
                            `==================== FLIGHT RECORDER (INDEXED DB EXPORT) ====================\n`;

                        const footerContent = `\n\n==================== END OF LOG ====================`;

                        try {
                            // Combine strings and the DB Blob
                            const finalBlob = new Blob([headerContent, dbBlob, footerContent], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(finalBlob);
                            
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            const timestampForFile = new Date().toISOString().replace(/[:.]/g, '-');
                            a.download = `collaboration_debug_log_${timestampForFile}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            
                            downloadLogButton.innerText = "Download Debug Log";
                            downloadLogButton.disabled = false;
                        } catch (downloadError) {
                            CollaborationConsole.error("Collab: Failed to trigger debug log download.", downloadError);
                            alert("Sorry, the debug log could not be downloaded.");
                            downloadLogButton.innerText = "Error";
                        }
                    });
                    popupContent.appendChild(downloadLogButton);
                    
                    document.body.appendChild(popup);
                    
                    document.getElementById('collab-reload-button').addEventListener('click', () => {
                        window.location.reload();
                    });

                    return; 
                }

                const projectDataSync = {
                    type: 'projectDataSync',
                    data: constants.mutableRefs.vm.runtime.targets.map(target => ({
                        targetId: target.id,
                        targetName: target.getName(),
                        blockData: JSON.stringify(target.blocks._blocks || {}),
                        commentData: JSON.stringify(target.comments || {})
                    }))
                };

                if (window.collaborationLocked === false) {
                    if (constants.debugging) CollaborationConsole.log('Collab Send [savedProject]: User is alone. Wiping Yjs state.');
                    constants.mutableRefs.ydoc.transact(() => {
                        if (constants.mutableRefs.yProjectEvents && typeof constants.mutableRefs.yProjectEvents.delete === 'function' && constants.mutableRefs.yProjectEvents.length > 0) {
                            constants.mutableRefs.yProjectEvents.delete(0, constants.mutableRefs.yProjectEvents.length);
                            if (constants.debugging) CollaborationConsole.log('Collab Send [savedProject]: Wiped yProjectEvents.');
                        }
                        if (constants.mutableRefs.yEvents && typeof constants.mutableRefs.yEvents.delete === 'function' && constants.mutableRefs.yEvents.length > 0) {
                            constants.mutableRefs.yEvents.delete(0, constants.mutableRefs.yEvents.length);
                            if (constants.debugging) CollaborationConsole.log('Collab Send [savedProject]: Wiped yEvents.');
                        }

                        const savedProjectEvent = {
                            type: 'savedProject',
                            timestamp: Date.now(),
                            data: {}
                        };
                        constants.mutableRefs.yProjectEvents.push([savedProjectEvent]);
                        constants.mutableRefs.yEvents.push([savedProjectEvent]);
                        
                        // Record YJS send events
                        recorder.recordYjsEvent('SEND', 'yProjectEvents', savedProjectEvent);
                        recorder.recordYjsEvent('SEND', 'yEvents', savedProjectEvent);

                        if (constants.debugging) CollaborationConsole.log('Collab Send [savedProject]: Wiped Yjs state and pushed new savedProject event markers.');
                    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
                } else {
                    constants.mutableRefs.ydoc.transact(() => {
                        const savedProjectEvent = {
                            type: 'savedProject',
                            timestamp: Date.now(),
                            data: {}
                        };
                        constants.mutableRefs.yProjectEvents.push([savedProjectEvent]);
                        constants.mutableRefs.yEvents.push([savedProjectEvent]);

                        // Record YJS send events
                        recorder.recordYjsEvent('SEND', 'yProjectEvents', savedProjectEvent);
                        recorder.recordYjsEvent('SEND', 'yEvents', savedProjectEvent);

                        if (constants.debugging) CollaborationConsole.log('Collab Send [savedProject]: Pushed event to yEvents and yProjectEvents (multiple collaborators present).');
                    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
                }
                constants.mutableRefs.yProjectDataSync.set('sync', projectDataSync);
            }
            else {
                CollaborationConsole.warn('Collab: Unhandled custom trigger:', detail.triggerId);
            }
        };
        
        window.removeEventListener('collaboration_addon_trigger', handleCustomTrigger);
        window.addEventListener('collaboration_addon_trigger', handleCustomTrigger);

        // --- Awareness Changes Handler ---
        constants.mutableRefs.yjsAwarenessInstance.on('change', changes => {
            if (constants.mutableRefs.collaborationLayerGroup && constants.mutableRefs.currentWorkspaceSvg) {
                const { added, updated, removed } = changes;
                const states = constants.mutableRefs.yjsAwarenessInstance.getStates();
                const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
                const localTargetName = constants.localUserInfo.currentTargetName;

                function collaborationLocked() {
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        const allStates = constants.mutableRefs.yjsAwarenessInstance.getStates();
                        let validCollaboratorCount = 0;

                        allStates.forEach((state, clientID) => {
                            if (state && (Object.keys(state).length > 0) && state.user && state.user.name) {
                                if (clientID !== localClientID) {
                                    validCollaboratorCount++;
                                }
                            }
                        });
                        const newLockedState = validCollaboratorCount > 0;
                        if (window.collaborationLocked !== newLockedState) {
                            window.collaborationLocked = newLockedState;
                            if (constants.debugging) {
                                CollaborationConsole.log(`Collab: collaborationLocked set to ${window.collaborationLocked} (Valid Remote Collaborators: ${validCollaboratorCount}, Total States (incl. empty/local): ${allStates.size})`);
                            }
                        }
                    }
                }

                states.forEach((state, clientID) => {
                    if (clientID === localClientID) return; 

                    const remoteTargetName = state.currentTargetName;
                    const remoteDraggingTargetName = state.dragging?.targetName;
                    const user = state.user;

                    const showRemoteUserInWorkspace = localTargetName && remoteTargetName === localTargetName;

                    if (showRemoteUserInWorkspace && user) {
                        collabUI.createOrUpdateRemoteCursor(clientID, state, constants.mutableRefs.collaborationLayerGroup, constants.debugging);
                    } else {
                        collabUI.removeRemoteCursor(clientID, constants.debugging);
                    }

                    const dragInfo = state.dragging;
                    const existingDrag = constants.remoteDraggingBlocks.get(clientID);
                    const showRemoteDragGhost = localTargetName && remoteDraggingTargetName === localTargetName;

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
                                remoteDragData = { blockId: dragInfo.blockId, ghostSvg: ghostSvg, targetName: remoteDraggingTargetName };
                                constants.remoteDraggingBlocks.set(clientID, remoteDragData);
                                if (constants.debugging) CollaborationConsole.log(`Collab UI: Created ghost for client ${clientID} dragging block ${dragInfo.blockId} on target ${remoteDraggingTargetName}`);
                            }
                        } else {
                            remoteDragData.targetName = remoteDraggingTargetName; 
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
                            if (constants.debugging) CollaborationConsole.log(`Collab UI: Removed ghost for client ${clientID} (no longer dragging or target mismatch)`);
                        }
                    }
                    collaborationLocked(); 
                });

                removed.forEach(clientID => {
                    if (clientID === localClientID) return;
                    collabUI.removeRemoteCursor(clientID, constants.debugging);
                    const existingDrag = constants.remoteDraggingBlocks.get(clientID);
                    if (existingDrag) {
                        existingDrag.ghostSvg?.remove();
                        constants.remoteDraggingBlocks.delete(clientID);
                    }
                    collaborationLocked(); 
                });
                collabUI.ensureCollaborationLayerOnTop(); 
            } 

            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();

        }); 

        // --- Global Listeners (Visibility Change, Keydown) ---
        const handleWindowBlur = async () => {
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('dragging', null);
            collabUI.clearLocalChatMessage();

            assetSync.detachDebouncedCostumeEditorChangeListener();
            assetSync.detachDebouncedSoundEditorChangeListener();

            if (constants.localUserInfo.editingCostumeInfo) {
                if (constants.debugging) CollaborationConsole.log('Collab: Window blurred, attempting costume sync.');
                await assetSync.syncCurrentCostumeData(true); 
                timeout.handleInactivityX(); 
            }
            if (constants.localUserInfo.editingSoundInfo) {
                if (constants.debugging) CollaborationConsole.log('Collab: Window blurred, attempting sound sync.');
                await assetSync.syncCurrentSoundData(true); 
                timeout.handleInactivityX(); 
            }
        };

        const handleWindowFocus = async () => {
            if (constants.mutableRefs.yjsAwarenessInstance) {
                if (constants.localUserInfo.isInactive) {
                    constants.localUserInfo.isInactive = false;
                    constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('isInactive', false);
                    if (constants.debugging) CollaborationConsole.log('Collab: Window focused, user explicitly marked active if was inactive.');
                }
                timeout.resetInactivityTimers(); 

                if (constants.localUserInfo.editingCostumeInfo) {
                    if (constants.debugging) CollaborationConsole.log('Collab: Window focused, attempting costume sync.');
                    await assetSync.syncCurrentCostumeData();

                    if (constants.localUserInfo.activeTabIndex === 1) { 
                        if (constants.debugging) CollaborationConsole.log('Collab: Costume tab active on focus, reattaching listener.');
                        assetSync.attachDebouncedCostumeEditorChangeListener();
                    } else {
                        if (constants.debugging) CollaborationConsole.log('Collab: Costume tab NOT active on focus. Listener remains detached.');
                        assetSync.detachDebouncedCostumeEditorChangeListener();
                    }
                }
                if (constants.localUserInfo.editingSoundInfo) {
                    if (constants.debugging) CollaborationConsole.log('Collab: Window focused, attempting sound sync.');
                    await assetSync.syncCurrentSoundData();

                    if (constants.localUserInfo.activeTabIndex === 2) { 
                        if (constants.debugging) CollaborationConsole.log('Collab: Sound tab active on focus, reattaching listener.');
                        assetSync.attachDebouncedSoundEditorChangeListener();
                    } else {
                        if (constants.debugging) CollaborationConsole.log('Collab: Sound tab NOT active on focus. Listener remains detached.');
                        assetSync.detachDebouncedSoundEditorChangeListener();
                    }
                }
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

        CollaborationConsole.log('Collab: WebsocketProvider connection sequence initiated...');

        // --- Cleanup Function ---
        const cleanup = () => {
            CollaborationConsole.log('Collab: Running Yjs cleanup...');
            recorder.stop();
            collabUI.clearLocalChatMessage(); 
            timeout.clearInactivityTimers(); 
            collabUI.hideSyncingPopup(); 

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
            window.removeEventListener('collaboration_addon_trigger', handleCustomTrigger);

            const ws = constants.mutableRefs.BlocklyInstance?.getMainWorkspace();
            if (ws && constants.mutableRefs.workspaceChangeListener) ws.removeChangeListener(constants.mutableRefs.workspaceChangeListener);
            if (constants.mutableRefs.currentWorkspaceSvg) {
                if (constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
                if (constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
            }
            window.removeEventListener('beforeunload', handleBeforeUnload);

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

            constants.mutableRefs.workspaceChangeListener = null;
            constants.mutableRefs.blocklyCanvasObserver = null;
            constants.mutableRefs.localChatElementsRef = null;
            constants.mutableRefs.currentWorkspaceSvg = null;
            constants.mutableRefs.throttledMouseMoveHandler = null;
            constants.mutableRefs.pointerLeaveHandler = null;
            constants.mutableRefs.yjsAwarenessInstance = null;
            constants.mutableRefs.yEvents = null;
            constants.mutableRefs.yProjectEvents = null;
            constants.mutableRefs.ydoc = null;
            constants.mutableRefs.provider = null;
            constants.mutableRefs.userIconContainer = null;
            
            window.collaborationLocked = false;
            window.collaborationDisableSave = true; 
            constants.mutableRefs.workspaceChangeListener = null;

            if (window.collab) delete window.collab;
            CollaborationConsole.log('Collab: Cleanup finished.');

            const popup = document.createElement('div');
            popup.className = 'collab-popup';
            popup.innerHTML = `
                <div class="collab-popup-content">
                    <h2>Collaboration Ended</h2>
                    <p>The collaboration session has ended. Please refresh the page to start a new session.</p>
                    <p style="font-size: 11px;margin-top: 1.5rem;">It's recommended to download your project before refreshing (just in case something goes wrong).</p>
                </div>
            `;
            const button = document.createElement('button');
            button.innerText = 'Download Project';
            button.addEventListener('click', () => {
                document.querySelectorAll('[class*="menu-bar_menu-bar-item_"]')[1].click(); 
                setTimeout(() => {
                    document.querySelectorAll('li[class*="menu_menu-item_"]')[3].click(); 
                }, 500);
            });
            popup.children[0].appendChild(button);
            document.body.appendChild(popup);
        };

        constants.mutableRefs.provider.on('destroy', () => {
            CollaborationConsole.log("Collab: constants.mutableRefs.provider emitted 'destroy'. Manual cleanup should handle listeners etc.");
        });

        const handleBeforeUnload = () => {
            if (constants.mutableRefs.currentCleanupFunction) {
                CollaborationConsole.log('Collab: Running cleanup on beforeunload.');
                constants.mutableRefs.currentCleanupFunction();
                constants.mutableRefs.currentCleanupFunction = null; 
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return cleanup; 

    } catch (error) {
        CollaborationConsole.error('Collab: Failed to initialize Yjs/WebRTC constants.mutableRefs.provider:', error);
        collabUI.hideSyncingPopup();

        window.collaborationLocked = false; 
        constants.mutableRefs.blocklyCanvasObserver?.disconnect();
        collabUI.removeAllUI();
        constants.mutableRefs.collaborationLayerGroup?.remove();
        constants.remoteDraggingBlocks.forEach(dragData => dragData.ghostSvg?.remove());
        constants.remoteDraggingBlocks.clear();
        constants.mutableRefs.userIconContainer?.remove();
        constants.spriteIconContainers.forEach(({ container }) => container?.remove());
        constants.spriteIconContainers.clear();
        constants.mutableRefs.provider?.destroy(); 
        constants.mutableRefs.provider = null; constants.mutableRefs.ydoc = null; constants.mutableRefs.yjsAwarenessInstance = null; constants.mutableRefs.yEvents = null; constants.mutableRefs.yProjectEvents = null;

        const popup = document.createElement('div');
        popup.className = 'collab-popup';
        popup.innerHTML = `
            <div class="collab-popup-content">
                <h2>Collaboration Failed to Start</h2>
                <p>Could not connect to the collaboration server.</p>
                <p style="font-size: 11px;">Please refresh the page and try again.</p>
            </div>
        `;
        document.body.appendChild(popup);

        return null; 
    }
}

let shouldRunCollaborationAddon = constants.devMode ? true : "waiting";

/**
 * Sets the global flag to activate or deactivate the collaboration addon.
 * This function is called by the Scratch GUI's `project-fetcher-hoc`.
 * @param {boolean} action True to enable collaboration, false to disable.
 */
window.StartCollaborator = function (action = true) {
    shouldRunCollaborationAddon = action;
}

// --- Main Addon Export ---
export default async function ({ addon, console: addonConsole }) {
    CollaborationConsole.log('Collaboration Addon Initializing...', document.querySelectorAll('[class*="loader_background_"]').length);

    recorder.processOldSessions();
    try {
        constants.mutableRefs.addon = addon;
        constants.mutableRefs.BlocklyInstance = await addon.tab.traps.getBlockly();
        constants.mutableRefs.vm = addon.tab.traps.vm;

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
            CollaborationConsole.log('Collab UI: User icon container added to menu bar.');
        } else if (document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID)) {
            constants.mutableRefs.userIconContainer = document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID);
            CollaborationConsole.log('Collab UI: Re-using existing user icon container.');
        } else {
            CollaborationConsole.warn('Collab UI: Could not find menu bar element to attach user icon container.');
        }

        if (constants.debugging) {
            window.addon = addon; window.Blockly = constants.mutableRefs.BlocklyInstance; window.vm = constants.mutableRefs.vm;
        }

        function startCollaboratorOffically() {
            if (!constants.mutableRefs.currentCleanupFunction) {
                if (shouldRunCollaborationAddon == "waiting") {
                    setTimeout(() => {
                        startCollaboratorOffically();
                    }, 100);
                } else {
                    if (shouldRunCollaborationAddon) {
                        CollaborationConsole.log('Collab: Project loaded, attaching Yjs constants.mutableRefs.provider...');
                        if (constants.debugging) window.collab = constants; 
                        setTimeout(() => {
                            if (!constants.mutableRefs.provider) {
                                const undoInternal = constants.mutableRefs.BlocklyInstance.mainWorkspace.undo;
                                constants.mutableRefs.BlocklyInstance.mainWorkspace.undo = function (...args) {
                                    collabUI.setUndoRedoOverride(); 
                                    undoInternal.apply(this, args);
                                }
                                constants.mutableRefs.currentCleanupFunction = attachYjsProvider(); 
                            } else {
                                CollaborationConsole.log('Collab: Yjs provider already attached after load, skipping.');
                            }
                        }, 800);
                    }
                }
            } else {
                CollaborationConsole.log('Collab: Project loaded, but collaboration addon is disabled. Skipping Yjs provider attachment.');
            }
        }
        
        if (document.querySelectorAll('[class*="loader_background_"]').length === 0) {
            if (constants.debugging) CollaborationConsole.log('Collab: No loader background detected, starting collaborator immediately.');
            startCollaboratorOffically();
        }

        const handleStateChange = ({ detail } = {}) => {
            const action = detail?.action || addon.tab.redux?.lastAction;
            if (!action) return;
            const actionType = action.type;

            const isProjectLoadComplete = actionType === 'scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID' ||
                actionType === 'scratch-gui/project-state/DONE_LOADING_VM_WITH_ID';

            if (isProjectLoadComplete) {
                startCollaboratorOffically();
            }

            if (actionType === 'scratch-gui/targets/UPDATE_TARGET_LIST') {
                const newTargetId = action.editingTarget;
                let newTargetName = null;
                if (newTargetId) {
                    newTargetName = constants.mutableRefs.vm.runtime.getTargetById(newTargetId)?.getName();
                } else {
                    const stageTarget = constants.mutableRefs.vm.runtime.getTargetForStage();
                    if (stageTarget) newTargetName = stageTarget.getName();
                }

                if (typeof newTargetName === 'string' && newTargetName !== constants.localUserInfo.currentTargetName) {
                    CollaborationConsole.log(`Collab: Editing target changed to: ${newTargetName} (ID: ${newTargetId || 'Stage'})`);
                    constants.localUserInfo.currentTargetName = newTargetName; 
                    assetSync.clearLocalEditingCostume();
                    assetSync.clearLocalEditingSound();
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('currentTargetName', newTargetName);
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
                    }
                    setTimeout(() => {
                        collabUI.setupCollaborationLayer();
                    }, 100);
                } else if (typeof newTargetName !== 'string') {
                    CollaborationConsole.warn(`Collab: Could not definitively get target name during target change. Action:`, action);
                }
            }

            if (actionType === 'scratch-gui/navigation/ACTIVATE_TAB') {
                const newActiveTabIndex = detail.action.activeTabIndex;
                const oldActiveTabIndex = constants.localUserInfo.activeTabIndex;

                if (constants.debugging) CollaborationConsole.log(`Collab: ACTIVATE_TAB triggered. New tab: ${newActiveTabIndex}, Previous tab: ${oldActiveTabIndex}`);

                if (oldActiveTabIndex === 1 && newActiveTabIndex !== 1) {
                    if (constants.debugging) CollaborationConsole.log('Collab: Navigating away from Costumes tab. Clearing costume editing state.');
                    assetSync.detachDebouncedCostumeEditorChangeListener();
                    if (constants.localUserInfo.editingCostumeInfo) {
                        assetSync.clearLocalEditingCostume(); 
                    }
                }
                else if (newActiveTabIndex === 1) {
                    if (constants.localUserInfo.editingCostumeInfo) {
                        if (constants.debugging) CollaborationConsole.log('Collab: Navigated to Costumes tab while a costume might be edited. Ensuring listener is attached.');
                        assetSync.attachDebouncedCostumeEditorChangeListener(); 
                    } else {
                        assetSync.detachDebouncedCostumeEditorChangeListener(); 
                    }
                } else {
                    assetSync.detachDebouncedCostumeEditorChangeListener();
                }

                if (oldActiveTabIndex === 2 && newActiveTabIndex !== 2) {
                    if (constants.debugging) CollaborationConsole.log('Collab: Navigating away from Sounds tab. Clearing sound editing state.');
                    assetSync.detachDebouncedSoundEditorChangeListener();
                    if (constants.localUserInfo.editingSoundInfo) {
                        assetSync.clearLocalEditingSound();
                    }
                }
                else if (newActiveTabIndex === 2) {
                    if (constants.localUserInfo.editingSoundInfo) {
                        if (constants.debugging) CollaborationConsole.log('Collab: Navigated to Sounds tab while a sound might be edited. Ensuring listener is attached.');
                        assetSync.attachDebouncedSoundEditorChangeListener();
                    } else {
                        assetSync.detachDebouncedSoundEditorChangeListener();
                    }
                } else {
                    assetSync.detachDebouncedSoundEditorChangeListener();
                }

                if (typeof newActiveTabIndex === 'number' && constants.localUserInfo.activeTabIndex !== newActiveTabIndex) {
                    if (constants.debugging) CollaborationConsole.log(`Collab: Local tab activated. From: ${oldActiveTabIndex} To: ${newActiveTabIndex}`);
                    constants.localUserInfo.activeTabIndex = newActiveTabIndex;
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('activeTabIndex', newActiveTabIndex);
                    }
                }
            }

            if (actionType === 'scratch-gui/theme/SET_THEME') {
                setTimeout(async () => {
                    constants.mutableRefs.BlocklyInstance = await addon.tab.traps.getBlockly(); 
                    collabUI.setupCollaborationLayer();
                }, 100);
            }

            const spriteListChangingActions = [
                'scratch-gui/targets/UPDATE_TARGET_LIST',
            ];
            if (spriteListChangingActions.includes(actionType)) {
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
            CollaborationConsole.log('Collab: Redux state listener attached.');
            handleStateChange(); 
        } else {
            CollaborationConsole.warn('Collab: Redux listener not available. Automatic attach/cleanup might fail.');
            setTimeout(() => {
                if (!constants.mutableRefs.provider) constants.mutableRefs.currentCleanupFunction = attachYjsProvider();
            }, 1500);
        }

    } catch (error) {
        CollaborationConsole.error('Collab: Fatal error during initialization:', error);
        if (constants.mutableRefs.currentCleanupFunction) constants.mutableRefs.currentCleanupFunction();
        else {
            constants.remoteUserIcons.forEach(icon => icon.remove()); constants.remoteUserIcons.clear();
            constants.mutableRefs.userIconContainer?.remove();
            constants.spriteIconContainers.forEach(({ container }) => container?.remove()); constants.spriteIconContainers.clear();
        }
    }

    CollaborationConsole.log('Collaboration Addon Initialized.');
}
