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
        if (constants.debugging) console.log(`Collab AssetLock: Awareness, constants.localUserInfo, or constants.mutableRefs.vm not ready. Assuming not locked for type ${type}.`);
        return false; // If not ready, assume unlocked to avoid blocking.
    }

    // Get the name of the currently editing target (sprite or stage).
    const targetNameOfAsset = constants.mutableRefs.vm.runtime.getEditingTarget()?.getName?.() || null;
    // Get the local client's unique ID from Yjs awareness.
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;

    // Validate input parameters.
    if (typeof targetNameOfAsset !== 'string' || typeof assetIndexToCheck !== 'number' || (type !== 1 && type !== 2)) {
        console.error('Collab AssetLock: Invalid parameters.', { targetNameOfAsset, assetIndexToCheck, type });
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
            console.log(`Collab AssetLock: ${assetTypeString} index ${assetIndexToCheck} for target "${targetNameOfAsset}" is LOCKED by ${lockerName}.`);
        }
        // If the local user *thought* they were editing this asset but a remote user has the lock,
        // it indicates a conflict or a stale local state. Clear the local lock.
        if (currentLocalEditInfo &&
            currentLocalEditInfo.targetName === targetNameOfAsset &&
            ((type === 1 && currentLocalEditInfo.costumeIndex === assetIndexToCheck) ||
                (type === 2 && currentLocalEditInfo.soundIndex === assetIndexToCheck))) {
            console.warn(`Collab AssetLock: Conflict detected. ${assetTypeString} ${targetNameOfAsset}[${assetIndexToCheck}] is locked by ${lockerName}, but was locally marked as editing. Clearing local lock.`);
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
            console.log(`Collab AssetLock: ${assetTypeString} index ${assetIndexToCheck} for target "${targetNameOfAsset}" is ALREADY being edited by local user. UNLOCKED for local.`);
        }
        // Re-attach the editor change listener to ensure changes are synced.
        if (type === 1) assetSync.attachDebouncedCostumeEditorChangeListener();
        else assetSync.attachDebouncedSoundEditorChangeListener();
        return false; // Return false to indicate the UI should be enabled.
    }

    // Scenario 3: Asset is NOT locked by another user, and the local user is NOT editing it.
    // The local user can now acquire the lock.
    if (constants.debugging) {
        console.log(`Collab AssetLock: ${assetTypeString} index ${assetIndexToCheck} for target "${targetNameOfAsset}" is UNLOCKED. Local user will take the lock.`);
    }

    // Set the local editing state in constants.localUserInfo and update awareness.
    if (type === 1) assetSync.setLocalEditingCostume(targetNameOfAsset, assetIndexToCheck);
    else assetSync.setLocalEditingSound(targetNameOfAsset, assetIndexToCheck);

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
        console.warn('Collab: Yjs already attached. Skipping.');
        return null;
    }
    console.log('Collab: Attaching Yjs constants.mutableRefs.provider...');

    // Ensure VM and Blockly instances are available before proceeding.
    if (!constants.mutableRefs.vm || !constants.mutableRefs.BlocklyInstance) {
        collabUI.hideSyncingPopup();
        console.error('Collab: Cannot attach Yjs constants.mutableRefs.provider without constants.mutableRefs.vm and Blockly instances.');
        return null;
    }

    // Check if we have the OTT before proceeding.
    if (!window.collaborationOTT) {
        console.error('Collab: Cannot attach Yjs provider, collaboration OTT is missing.');
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

    // Set up observers to react to changes in Yjs shared types.
    yEventsHandler.setupYEventsObserver();
    yProjectEventsHandler.setupYProjectEventsObserver();

    // --- WebRTC Provider Setup ---
    // Construct the server URL and room name for the WebSocket provider.
    const baseServerUrl = constants.WEBSOCKETBASEURL;
    const roomName = window.CollaborationRoom;

    // Use the fetched OTT instead of the old JWT logic
    const username = window.CollaborationUsername;
    const token = window.collaborationOTT;

    // Abort if authentication details are missing.
    if (!username || !token) {
        console.error('Collab: Cannot attach Yjs provider, missing CollaborationUsername or OTT.');
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
        // The y-websocket library constructs the URL as `${serverUrl}/${roomName}`, so we append the query string here.
        const roomNameWithToken = `${roomName}?ott=${token}`;
        
        console.log(`Collab: Attempting to connect to WebSocket server for room: ${roomName}`);
        
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

        console.log('Collab: WebsocketProvider instance created');
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
        console.log(`Collab: Local user initialized: ${constants.localUserInfo.name} (${localUserColor}), Target: ${constants.localUserInfo.currentTargetName}`);

        // Connect the provider AFTER setting up the initial awareness state.
        constants.mutableRefs.provider.connect();

        // --- Listener for successful sync ---
        // This event fires when the Yjs document is fully synced with peers.
        constants.mutableRefs.provider.on('synced', (syncedState) => {
            if (syncedState && constants.mutableRefs.provider.synced) {
                if (constants.debugging) console.log('Collab: Provider synced with peers.');

                // Logic for initial project data synchronization:
                // If `alreadyRanSetup` is false, this is the first time syncing.
                if (constants.mutableRefs.alreadyRanSetup !== true) {
                    // Check if initial project data already exists in `yProjectDataSync`.
                    if (!constants.mutableRefs.yProjectDataSync.get('sync')) {
                        // If no initial data, this client is the first to connect to this session.
                        // Push the current project state from the VM as the initial baseline.
                        if (constants.debugging) console.log('Collab: First user detected, pushing initial project state');

                        const projectDataSync = {
                            type: 'projectDataSync',
                            data: constants.mutableRefs.vm.runtime.targets.map(target => ({
                                targetId: target.id,
                                targetName: target.getName(),
                                blockData: JSON.stringify(target.blocks._blocks || {}), // Serialize blocks.
                                commentData: JSON.stringify(target.comments || {}) // Serialize comments.
                            }))
                        };

                        // Use `ydoc.transact` for atomic updates to Yjs.
                        constants.mutableRefs.ydoc.transact(() => {
                            constants.mutableRefs.yProjectDataSync.set('sync', projectDataSync); // Set the initial project data.
                            if (constants.debugging) console.log('Collab: Pushed initial project data sync');
                        }, constants.LOCAL_EVENT_SYNC_ORIGIN); // Specify origin to avoid re-applying locally.
                    } else {
                        // If initial data exists, this client is joining an ongoing session.
                        // Apply the existing initial project data from `yProjectDataSync`.
                        if (constants.debugging) console.log('Collab: Initial sync data already exists, applying it now.');
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
                                console.error("Collab FATAL: Received corrupt master copy with circular dependency. Aborting project load.", corruptionDetails);
                                collabUI.hideSyncingPopup(); // Hide the "syncing" message

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
                            // IMPORTANT: Clear all existing blocks from all targets in the VM first.
                            // This prevents duplication and ensures a clean slate before applying remote blocks.
                            constants.mutableRefs.vm.runtime.targets.forEach(t => {
                                const originalForceNoGlow = t.blocks.forceNoGlow;
                                t.blocks.forceNoGlow = true; // Temporarily disable projectChanged emits during mass deletion.
                                t.blocks.deleteAllBlocks(); // This clears `_blocks` and `_scripts` correctly.
                                t.blocks.forceNoGlow = originalForceNoGlow; // Restore original emit behavior.
                            });

                            // Now, process each target's data and add blocks/comments using the VM's API.
                            syncData.data.forEach(targetData => {
                                console.log("Collab: Applying initial blocks for target:", targetData.targetName);
                                const { targetName, blockData, commentData } = targetData;

                                // Find the corresponding target in the VM.
                                const target = targetName === 'Stage' ?
                                    constants.mutableRefs.vm.runtime.getTargetForStage() :
                                    constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);

                                // Apply blocks if target exists and block data is available.
                                if (target && blockData) {
                                    try {
                                        const newBlocksObject = JSON.parse(blockData);
                                        const originalForceNoGlow = target.blocks.forceNoGlow;
                                        target.blocks.forceNoGlow = true; // Prevent emits during bulk creation.
                                        for (const blockId in newBlocksObject) {
                                            if (Object.prototype.hasOwnProperty.call(newBlocksObject, blockId)) {
                                                target.blocks.createBlock(newBlocksObject[blockId]); // Add each block.
                                            }
                                        }
                                        target.blocks.forceNoNoGlow = originalForceNoGlow; // Restore.
                                    } catch (e) {
                                        console.error(`Collab: Error applying initial blocks for target "${targetName}":`, e);
                                    }
                                }
                                // Apply comments if target exists and comment data is available.
                                if (target && commentData) {
                                    // Delete existing comments to avoid duplicates.
                                    for (var x of Object.keys(target.comments)) {
                                        const commentToDelete = target.comments[x];
                                        helper.CommentDelete({
                                            commentId: commentToDelete.id,
                                            blockId: commentToDelete.blockId
                                        }, target.getName());
                                    }
                                    const newCommentsObject = JSON.parse(commentData);
                                    // Create new comments from the synced data.
                                    for (const commentId in newCommentsObject) {
                                        if (Object.prototype.hasOwnProperty.call(newCommentsObject, commentId)) {
                                            const comment = newCommentsObject[commentId];
                                            // Construct a Blockly event object that matches helper.CommentCreate's expectation.
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
                // After applying initial data (or if current user was the first), emit `projectChanged` to refresh the VM/UI.
                constants.mutableRefs.vm.runtime.emitProjectChanged();
                if (constants.debugging) console.log('Collab: Initial sync data applied successfully');
                // Re-select targets to ensure the UI updates correctly (e.g., blockly workspace renders).
                constants.mutableRefs.vm.setEditingTarget(constants.mutableRefs.vm.runtime.getTargetForStage().id);
                if (constants.mutableRefs.vm.runtime.targets[1]) {
                    constants.mutableRefs.vm.setEditingTarget(constants.mutableRefs.vm.runtime.targets[1].id);
                }
                constants.mutableRefs.alreadyRanSetup = true; // Mark setup as run to prevent re-applying initial data.
                console.log('Collab: Provider synced, running initial setup...');
                // Process any pending sync items and hide the syncing popup.
                helper.processSyncItems().then(() => {
                    collabUI.hideSyncingPopup();
                    timeout.resetInactivityTimers();
                });
            }
        });

        // Listener for when the provider is explicitly destroyed.
        constants.mutableRefs.provider.on('destroy', () => {
            console.log("Collab: constants.mutableRefs.provider emitted 'destroy'.");
            timeout.clearInactivityTimers(); // Clear inactivity timers.
            collabUI.hideSyncingPopup(); // Hide syncing popup.
        });

        // Listener for WebSocket connection close events.
        constants.mutableRefs.provider.on('ws-close', (event) => {
            if (constants.debugging) console.log('Collab: constants.mutableRefs.provider WebSocket connection closed. Clearing inactivity timers.', event.code, event.reason);
            timeout.clearInactivityTimers(); // Clear inactivity timers.
            // If connection was closed due to authentication failure, display a specific error popup.
            if (event.code === 1008 || event.reason === 'Authentication failed') {
                const popup = document.createElement('div');
                popup.className = 'collab-popup';
                popup.innerHTML = `
                     <div class="collab-popup-content">
                         <h2>Authentication Required</h2>
                         <p>Your collaboration session could not be authenticated. Please ensure you are logged in and your token is valid.</p>
                         <p style="font-size: 11px;margin-top: 1.5rem;">It's recommended to refresh the page.</p>
                     </div>
                 `;
                document.body.appendChild(popup);
            } else {
                collabUI.hideSyncingPopup(); // Hide the syncing popup for other types of disconnects.
            }
        });

        // Listener for provider status changes (connecting, connected, disconnected).
        constants.mutableRefs.provider.on('status', event => {
            if (constants.debugging) console.log('Collab: constants.mutableRefs.provider status event:', event.status);
            if (event.status === 'disconnected') {
                if (constants.debugging) console.log('Collab: Provider disconnected.');
                timeout.clearInactivityTimers(); // Clear timers on disconnect.
            } else if (event.status === 'connecting') {
                collabUI.showSyncingPopup(); // Show popup if re-connecting.
                timeout.clearInactivityTimers();
            } else if (event.status === 'connected') {
                if (constants.debugging) console.log('Collab: Provider connected.');
                // If already synced, hide popup.
                if (constants.mutableRefs.provider.synced) {
                    collabUI.hideSyncingPopup();
                }
            }
        });

        // --- Initial UI Setup for Collaboration Layer ---
        // Delay setting up the collaboration layer slightly to allow initial rendering.
        setTimeout(() => collabUI.setupCollaborationLayer(), 500);

        // Delay initial updates of user icons after layer setup.
        setTimeout(() => {
            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();
        }, 600);

        // --- Attach the MASTER Blockly Listener ---
        // Get the main Blockly workspace.
        const mainWorkspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
        if (mainWorkspace) {
            // Remove any existing change listener before attaching a new one.
            if (constants.mutableRefs.workspaceChangeListener) mainWorkspace.removeChangeListener(constants.mutableRefs.workspaceChangeListener);
            // Store a reference to the handler for later removal.
            constants.mutableRefs.workspaceChangeListener = collabUI.handleBlocklyEventForCollaboration;
            // Add the listener to the Blockly workspace.
            mainWorkspace.addChangeListener(constants.mutableRefs.workspaceChangeListener);
            console.log('Collab: Attached main workspace change listener for ALL relevant events.');
        } else {
            console.error('Collab: Could not find main workspace to attach listener!');
        }

        // --- Event Listener for CUSTOM Triggers (e.g., Drag State, VM Passthrough) ---
        /**
         * Handles custom events dispatched by the Scratch GUI for collaboration purposes.
         * These events often contain data not directly captured by Blockly events,
         * such as drag states or specific VM actions.
         * @param {CustomEvent} event The custom event object.
         */
        const handleCustomTrigger = event => {
            // Ensure awareness and provider are ready before sending events.
            if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.provider || !constants.mutableRefs.provider.synced) return;
            if (!constants.mutableRefs.yEvents && detail.triggerId === 'shareBlocksToTarget') {
                console.warn('Collab Send: constants.mutableRefs.yEvents not ready for shareBlocksToTarget trigger.');
                return;
            }

            const detail = event.detail;
            if (!detail || !detail.triggerId) return;

            // Get the currently edited target name for awareness updates.
            const currentTargetNameForAwareness = helper.getCurrentEditingTargetName();

            if (constants.debugging) console.log('Collab Trigger RX:', detail.triggerId, 'Current Editing Target:', currentTargetNameForAwareness, 'Data:', detail.data);

            const config = constants.triggerEventConfig[detail.triggerId];

            // --- Drag Triggers (Update Awareness State) ---
            if (detail.triggerId === 'blockDrag') {
                // Update local awareness with current block drag position.
                const { blockId, x, y } = detail.data;
                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', { blockId, x, y, targetName: currentTargetNameForAwareness });
            } else if (detail.triggerId === 'blockDragEnd') {
                // Clear local awareness drag state when dragging ends.
                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
            }
            // --- Share Blocks Trigger (New VM Passthrough Logic) ---
            else if (detail.triggerId === 'shareBlocksToTarget') {
                // This trigger is used when blocks are dragged between targets in Scratch GUI.
                if (!constants.mutableRefs.ydoc || !constants.mutableRefs.yEvents || !constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime) {
                    console.warn('Collab Send: Cannot process shareBlocksToTarget trigger, Yjs or constants.mutableRefs.vm not ready.');
                    return;
                }
                const { blocks, targetId, optFromTargetId } = detail.data;

                if (!blocks || !targetId) {
                    console.error('Collab Send [shareBlocksToTarget]: Invalid data received from constants.mutableRefs.vm trigger.', detail.data);
                    return;
                }

                // Determine the destination target name.
                let destinationTargetName = null;
                const destTarget = constants.mutableRefs.vm.runtime.getTargetById(targetId);
                if (destTarget) {
                    destinationTargetName = destTarget.getName();
                } else {
                    console.error(`Collab Send [shareBlocksToTarget]: Destination target ID "${targetId}" not found in constants.mutableRefs.vm.`);
                    return;
                }

                // Determine the optional source target name.
                let sourceTargetName = null;
                if (optFromTargetId) {
                    const sourceTarget = constants.mutableRefs.vm.runtime.getTargetById(optFromTargetId);
                    if (sourceTarget) {
                        sourceTargetName = sourceTarget.getName();
                    } else {
                        console.warn(`Collab Send [shareBlocksToTarget]: Optional source target ID "${optFromTargetId}" not found. Proceeding without source name.`);
                    }
                }

                // Construct the event data for Yjs.
                const eventDataForYjs = {
                    type: constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE,
                    data: {
                        blocksData: blocks, // The actual block structures.
                        destinationTargetName: destinationTargetName,
                        sourceTargetName: sourceTargetName
                    }
                };

                // Push the event to Yjs `yEvents` array within a transaction.
                constants.mutableRefs.ydoc.transact(() => {
                    eventDataForYjs.timestamp = Date.now();
                    constants.mutableRefs.yEvents.push([eventDataForYjs]);
                    if (constants.debugging) console.log(`Collab Send [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Pushed event to constants.mutableRefs.yEvents`, eventDataForYjs.data);
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);
            }
            // --- General Project Event Triggers (e.g., sprite, costume, sound changes) ---
            else if (config) { // If a configuration for this trigger ID exists.
                if (!constants.mutableRefs.yProjectEvents || !constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime) {
                    console.warn(`Collab Send: Cannot process ${detail.triggerId} trigger, constants.mutableRefs.yProjectEvents or constants.mutableRefs.vm not ready.`);
                    return;
                }

                let payloadData;

                // Use `preparePayload` if defined in the config for complex data extraction.
                if (config.preparePayload) {
                    payloadData = config.preparePayload(detail.data);
                } else {
                    // Generic data extraction and validation based on `requiredFields` and `payloadKeys`.
                    const extractedData = {};
                    let allFieldsPresent = true;

                    for (const field of config.requiredFields) {
                        const value = detail.data[field];
                        // Check for missing/undefined fields based on config.
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
                        console.error(`Collab Send [${config.consoleKey}]: Missing ${missingFields} in detail data.`, detail.data);
                        return;
                    }

                    payloadData = {};
                    config.payloadKeys.forEach(key => {
                        payloadData[key] = extractedData[key];
                    });
                }

                if (payloadData === null) { // If `preparePayload` returned null, it indicates an error.
                    return;
                }

                const projectEventData = {
                    type: config.eventType,
                    data: payloadData
                };

                // Push the project event to `yProjectEvents` array within a transaction.
                constants.mutableRefs.ydoc.transact(() => {
                    projectEventData.timestamp = Date.now();
                    constants.mutableRefs.yProjectEvents.push([projectEventData]);
                    if (constants.debugging) console.log(`Collab Send [${config.eventType}]: Pushed event to yProjectEvents`, projectEventData.data);
                }, constants.LOCAL_EVENT_SYNC_ORIGIN);
            }
            // --- 'savedProject' Trigger (for project save operations) ---
            else if (detail.triggerId === 'savedProject') {
                let corruptionDetails = null;
                // Loop through every target (Sprite, Stage) in the project.
                for (const target of constants.mutableRefs.vm.runtime.targets) {
                    const blocksToValidate = target.blocks._blocks;
                    const cycleCheckResult = helper.findCircularDependency(blocksToValidate, target.getName());
                    if (cycleCheckResult.hasCycle) {
                        console.error(`Collab FATAL: Circular dependency detected in target "${target.getName()}". Aborting sync.`);
                        corruptionDetails = cycleCheckResult;
                        break;
                    }
                }

                if (corruptionDetails) {
                    // Create the main popup container.
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
                    
                    // Get a reference to the content area of the popup to append buttons.
                    const popupContent = popup.querySelector('.collab-popup-content');

                    // --- Button 1: Download Project (Unchanged) ---
                    const downloadProjectButton = document.createElement('button');
                    downloadProjectButton.innerText = 'Download Project';
                    downloadProjectButton.addEventListener('click', () => {
                        document.querySelectorAll('[class*="menu-bar_menu-bar-item_"]')[1].click();
                        setTimeout(() => {
                            document.querySelectorAll('li[class*="menu_menu-item_"]')[3].click();
                        }, 500);
                    });
                    popupContent.appendChild(downloadProjectButton);

                    // --- Button 2 (NEW): Download Debug Log ---
                    const downloadLogButton = document.createElement('button');
                    downloadLogButton.innerText = 'Download Debug Log';
                    downloadLogButton.addEventListener('click', () => {
                        let sessionInfo, yjsState, localCollabState, vmProjectJSON, yEventsData, yProjectEventsData, corruptionLog;

                        // Helper to convert Maps to plain objects for JSON.stringify
                        const mapToObject = (map) => {
                            const obj = {};
                            if (!map || !(map instanceof Map)) return {};
                            map.forEach((value, key) => {
                                obj[String(key)] = value;
                            });
                            return obj;
                        };

                        // --- Section 0: Corruption Details ---
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

                        // --- Section 1: Session Info ---
                        try {
                            sessionInfo = JSON.stringify({
                                timestamp: new Date().toISOString(),
                                url: window.location.href,
                                userAgent: navigator.userAgent,
                            }, null, 2);
                        } catch (e) {
                            sessionInfo = `"Error generating Session Info: ${e.message}"`;
                        }

                        // --- Section 2: Yjs & Provider State ---
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

                        // --- Section 3: Local Collaboration State ---
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

                        // --- Section 4: Project & VM State ---
                        try {
                            vmProjectJSON = constants.mutableRefs.vm ? constants.mutableRefs.vm.toJSON() : '{"error": "VM instance not found."}';
                        } catch (e) {
                            vmProjectJSON = `{"error": "Failed to serialize project from VM", "message": "${e.message}"}`;
                        }

                        // --- Section 5: YEvents History ---
                        try {
                            yEventsData = JSON.stringify(constants.mutableRefs.yEvents?.toArray() || [], null, 2);
                        } catch (e) {
                            yEventsData = `"Error generating YEvents History: ${e.message}"`;
                        }

                        // --- Section 6: YProjectEvents History ---
                        try {
                            yProjectEventsData = JSON.stringify(constants.mutableRefs.yProjectEvents?.toArray() || [], null, 2);
                        } catch (e) {
                            yProjectEventsData = `"Error generating YProjectEvents History: ${e.message}"`;
                        }

                        // Assemble the log string
                        const logContent = `Collaboration Addon Debug Log\n\n` +
                            `==================== CORRUPTION DETAILS ====================\n${corruptionLog}\n\n` +
                            `==================== Session Info ====================\n${sessionInfo}\n\n` +
                            `==================== Yjs & Provider State ====================\n${yjsState}\n\n` +
                            `==================== Local Collaboration State ====================\n${localCollabState}\n\n` +
                            `==================== Full Project State (from vm.toJSON()) ====================\n${vmProjectJSON}\n\n` +
                            `==================== YEvents History (Block Actions) ====================\n${yEventsData}\n\n` +
                            `==================== YProjectEvents History (Asset & Project Actions) ====================\n${yProjectEventsData}\n\n` +
                            `==================== END OF LOG ====================`;
                        
                        // Create and trigger download
                        try {
                            const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            const timestampForFile = new Date().toISOString().replace(/[:.]/g, '-');
                            a.download = `collaboration_debug_log_${timestampForFile}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                        } catch (downloadError) {
                            console.error("Collab: Failed to trigger debug log download.", downloadError);
                            alert("Sorry, the debug log could not be downloaded.");
                        }
                    });
                    popupContent.appendChild(downloadLogButton);
                    
                    // Display the popup.
                    document.body.appendChild(popup);
                    
                    // Add the listener for the "Reload" button (which was created via innerHTML).
                    document.getElementById('collab-reload-button').addEventListener('click', () => {
                        window.location.reload();
                    });

                    return; // Abort the save/sync process.
                }

                // Get the current project data for a full sync snapshot.
                const projectDataSync = {
                    type: 'projectDataSync',
                    data: constants.mutableRefs.vm.runtime.targets.map(target => ({
                        targetId: target.id,
                        targetName: target.getName(),
                        blockData: JSON.stringify(target.blocks._blocks || {}),
                        commentData: JSON.stringify(target.comments || {})
                    }))
                };

                // If the user is currently the only collaborator (collaborationLocked is false).
                if (window.collaborationLocked === false) {
                    if (constants.debugging) console.log('Collab Send [savedProject]: User is alone. Wiping Yjs state.');
                    // Wipe Yjs event arrays to reset history.
                    constants.mutableRefs.ydoc.transact(() => {
                        if (constants.mutableRefs.yProjectEvents && typeof constants.mutableRefs.yProjectEvents.delete === 'function' && constants.mutableRefs.yProjectEvents.length > 0) {
                            constants.mutableRefs.yProjectEvents.delete(0, constants.mutableRefs.yProjectEvents.length);
                            if (constants.debugging) console.log('Collab Send [savedProject]: Wiped yProjectEvents.');
                        }
                        if (constants.mutableRefs.yEvents && typeof constants.mutableRefs.yEvents.delete === 'function' && constants.mutableRefs.yEvents.length > 0) {
                            constants.mutableRefs.yEvents.delete(0, constants.mutableRefs.yEvents.length);
                            if (constants.debugging) console.log('Collab Send [savedProject]: Wiped yEvents.');
                        }

                        // Push new 'savedProject' events after wiping, acting as a new baseline marker.
                        constants.mutableRefs.yProjectEvents.push([{
                            type: 'savedProject',
                            timestamp: Date.now(),
                            data: {}
                        }]);
                        constants.mutableRefs.yEvents.push([{
                            type: 'savedProject',
                            timestamp: Date.now(),
                            data: {}
                        }]);
                        if (constants.debugging) console.log('Collab Send [savedProject]: Wiped Yjs state and pushed new savedProject event markers.');
                    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
                } else {
                    // If other collaborators are present, simply push the 'savedProject' event.
                    constants.mutableRefs.ydoc.transact(() => {
                        constants.mutableRefs.yProjectEvents.push([{
                            type: 'savedProject',
                            timestamp: Date.now(),
                            data: {}
                        }]);
                        constants.mutableRefs.yEvents.push([{
                            type: 'savedProject',
                            timestamp: Date.now(),
                            data: {}
                        }]);
                        if (constants.debugging) console.log('Collab Send [savedProject]: Pushed event to yEvents and yProjectEvents (multiple collaborators present).');
                    }, constants.LOCAL_EVENT_SYNC_ORIGIN);
                }
                // Update the project data sync map regardless of collaboration state, ensuring the latest project save is available.
                constants.mutableRefs.yProjectDataSync.set('sync', projectDataSync);
            }
            else {
                console.warn('Collab: Unhandled custom trigger:', detail.triggerId);
            }
        };
        // Ensure only one listener is attached at a time.
        window.removeEventListener('collaboration_addon_trigger', handleCustomTrigger);
        window.addEventListener('collaboration_addon_trigger', handleCustomTrigger);

        // --- Awareness Changes Handler (Remote Users UI - Cursors, Chat, Drag Ghosts, Presence Icons) ---
        // This listener reacts to changes in other users' awareness states (e.g., cursor position, active target, drag state).
        constants.mutableRefs.yjsAwarenessInstance.on('change', changes => {
            // Update Cursors, Chat Bubbles, Drag Ghosts (within the Blockly workspace).
            if (constants.mutableRefs.collaborationLayerGroup && constants.mutableRefs.currentWorkspaceSvg) {
                const { added, updated, removed } = changes;
                const states = constants.mutableRefs.yjsAwarenessInstance.getStates();
                const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
                const localTargetName = constants.localUserInfo.currentTargetName;

                /**
                 * Updates the global `window.collaborationLocked` flag based on the presence of other active collaborators.
                 * This flag helps determine if the local user is alone or in a multi-user session.
                 */
                function collaborationLocked() {
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        const allStates = constants.mutableRefs.yjsAwarenessInstance.getStates();
                        let validCollaboratorCount = 0;

                        allStates.forEach((state, clientID) => {
                            // Count any remote client with an active state and user info.
                            if (state && (Object.keys(state).length > 0) && state.user && state.user.name) {
                                if (clientID !== localClientID) {
                                    validCollaboratorCount++;
                                }
                            }
                        });
                        const newLockedState = validCollaboratorCount > 0;
                        // Update the global flag only if its state has changed.
                        if (window.collaborationLocked !== newLockedState) {
                            window.collaborationLocked = newLockedState;
                            if (constants.debugging) {
                                console.log(`Collab: collaborationLocked set to ${window.collaborationLocked} (Valid Remote Collaborators: ${validCollaboratorCount}, Total States (incl. empty/local): ${allStates.size})`);
                            }
                        }
                    }
                }
                // --- Update Workspace UI (Cursors, Chat, Ghosts) ---
                states.forEach((state, clientID) => {
                    if (clientID === localClientID) return; // Skip local client.

                    const remoteTargetName = state.currentTargetName;
                    const remoteDraggingTargetName = state.dragging?.targetName;
                    const user = state.user;

                    // Determine if the remote user's cursor/chat should be shown (i.e., if they are on the same target).
                    const showRemoteUserInWorkspace = localTargetName && remoteTargetName === localTargetName;

                    // Render or update remote cursor and chat bubble.
                    if (showRemoteUserInWorkspace && user) {
                        collabUI.createOrUpdateRemoteCursor(clientID, state, constants.mutableRefs.collaborationLayerGroup, constants.debugging);
                    } else {
                        collabUI.removeRemoteCursor(clientID, constants.debugging);
                    }

                    // Render or update dragging ghost (a translucent copy of the block being dragged remotely).
                    const dragInfo = state.dragging;
                    const existingDrag = constants.remoteDraggingBlocks.get(clientID);
                    // Show ghost ONLY if the local user is viewing the same target where the remote user is dragging.
                    const showRemoteDragGhost = localTargetName && remoteDraggingTargetName === localTargetName;

                    if (showRemoteDragGhost && dragInfo?.blockId) {
                        let remoteDragData = existingDrag;
                        // If no existing ghost or block ID changed, create a new ghost.
                        if (!remoteDragData || remoteDragData.blockId !== dragInfo.blockId) {
                            if (remoteDragData) remoteDragData.ghostSvg?.remove(); // Remove old ghost if block changed.

                            const workspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
                            const realBlock = workspace?.getBlockById(dragInfo.blockId);
                            if (realBlock?.getSvgRoot) {
                                const ghostSvg = realBlock.getSvgRoot().cloneNode(true); // Clone the real block's SVG.
                                ghostSvg.setAttribute('class', 'collaboration-ghost-block');
                                ghostSvg.style.opacity = '0.5';
                                ghostSvg.style.pointerEvents = 'none';
                                ghostSvg.removeAttribute('data-id');
                                constants.mutableRefs.collaborationLayerGroup.appendChild(ghostSvg); // Add to the collaboration layer.
                                remoteDragData = { blockId: dragInfo.blockId, ghostSvg: ghostSvg, targetName: remoteDraggingTargetName };
                                constants.remoteDraggingBlocks.set(clientID, remoteDragData);
                                if (constants.debugging) console.log(`Collab UI: Created ghost for client ${clientID} dragging block ${dragInfo.blockId} on target ${remoteDraggingTargetName}`);
                            }
                        } else {
                            remoteDragData.targetName = remoteDraggingTargetName; // Update target name.
                        }
                        // Update ghost position.
                        if (remoteDragData?.ghostSvg) {
                            remoteDragData.ghostSvg.setAttribute('transform', `translate(${dragInfo.x},${dragInfo.y})`);
                            // Ensure the ghost is always on top by re-appending.
                            if (remoteDragData.ghostSvg.parentNode === constants.mutableRefs.collaborationLayerGroup) {
                                constants.mutableRefs.collaborationLayerGroup.appendChild(remoteDragData.ghostSvg);
                            }
                        }
                    } else { // Remote user is not dragging, or local user is on a different target.
                        if (existingDrag) { // Remove existing ghost.
                            existingDrag.ghostSvg?.remove();
                            constants.remoteDraggingBlocks.delete(clientID);
                            if (constants.debugging) console.log(`Collab UI: Removed ghost for client ${clientID} (no longer dragging or target mismatch)`);
                        }
                    }
                    collaborationLocked(); // Update the `collaborationLocked` flag.
                });

                // Remove workspace artifacts for clients who have left awareness.
                removed.forEach(clientID => {
                    if (clientID === localClientID) return;
                    collabUI.removeRemoteCursor(clientID, constants.debugging);
                    const existingDrag = constants.remoteDraggingBlocks.get(clientID);
                    if (existingDrag) {
                        existingDrag.ghostSvg?.remove();
                        constants.remoteDraggingBlocks.delete(clientID);
                    }
                    collaborationLocked(); // Update the `collaborationLocked` flag.
                });
                collabUI.ensureCollaborationLayerOnTop(); // Keep collaboration UI elements visible.
            } // End of UI ready check.

            // --- Update Presence Icons (Menu Bar and Sprites) ---
            // Update user icons in the menu bar, sprite list, and tab bar to reflect who is online and where they are.
            collabUI.updateUserMenuBarIcons();
            collabUI.updateSpriteUserIcons();
            collabUI.updateTabUserIcons();

        }); // End awareness.on('change')

        // --- Global Listeners (Visibility Change, Keydown) ---
        /**
         * Handles logic when the window loses focus or becomes hidden.
         * Clears local cursor/drag state, chat messages, and attempts to sync/release asset locks.
         */
        const handleWindowBlur = async () => {
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('dragging', null);
            collabUI.clearLocalChatMessage();

            // Detach asset editor listeners, as focus is lost.
            assetSync.detachDebouncedCostumeEditorChangeListener();
            assetSync.detachDebouncedSoundEditorChangeListener();

            // If a costume/sound was being edited, perform a final sync and attempt to unlock it.
            if (constants.localUserInfo.editingCostumeInfo) {
                if (constants.debugging) console.log('Collab: Window blurred, attempting costume sync.');
                await assetSync.syncCurrentCostumeData(true); // Perform final sync.
                timeout.handleInactivityX(); // Unlock costume for other users.
            }
            if (constants.localUserInfo.editingSoundInfo) {
                if (constants.debugging) console.log('Collab: Window blurred, attempting sound sync.');
                await assetSync.syncCurrentSoundData(true); // Perform final sync.
                timeout.handleInactivityX(); // Unlock sound for other users.
            }
        };

        /**
         * Handles logic when the window gains focus or becomes visible.
         * Resets inactivity timers and re-attaches asset editor listeners if applicable.
         */
        const handleWindowFocus = async () => {
            if (constants.mutableRefs.yjsAwarenessInstance) {
                // Mark local user as active if they were previously inactive.
                if (constants.localUserInfo.isInactive) {
                    constants.localUserInfo.isInactive = false;
                    constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('isInactive', false);
                    if (constants.debugging) console.log('Collab: Window focused, user explicitly marked active if was inactive.');
                }
                timeout.resetInactivityTimers(); // Reset inactivity timers.

                // If a costume was being edited, sync its data and re-attach listener if on the costume tab.
                if (constants.localUserInfo.editingCostumeInfo) {
                    if (constants.debugging) console.log('Collab: Window focused, attempting costume sync.');
                    await assetSync.syncCurrentCostumeData();

                    if (constants.localUserInfo.activeTabIndex === 1) { // 1 is Costumes tab.
                        if (constants.debugging) console.log('Collab: Costume tab active on focus, reattaching listener.');
                        assetSync.attachDebouncedCostumeEditorChangeListener();
                    } else {
                        if (constants.debugging) console.log('Collab: Costume tab NOT active on focus. Listener remains detached.');
                        assetSync.detachDebouncedCostumeEditorChangeListener();
                    }
                }
                // If a sound was being edited, sync its data and re-attach listener if on the sound tab.
                if (constants.localUserInfo.editingSoundInfo) {
                    if (constants.debugging) console.log('Collab: Window focused, attempting sound sync.');
                    await assetSync.syncCurrentSoundData();

                    if (constants.localUserInfo.activeTabIndex === 2) { // 2 is Sounds tab.
                        if (constants.debugging) console.log('Collab: Sound tab active on focus, reattaching listener.');
                        assetSync.attachDebouncedSoundEditorChangeListener();
                    } else {
                        if (constants.debugging) console.log('Collab: Sound tab NOT active on focus. Listener remains detached.');
                        assetSync.detachDebouncedSoundEditorChangeListener();
                    }
                }
            }
        };

        /**
         * Handles the `visibilitychange` event, calling blur/focus logic based on document visibility.
         */
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleWindowBlur();
            } else if (document.visibilityState === 'visible') {
                handleWindowFocus();
            }
        };
        // Attach `visibilitychange` listener.
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('visibilitychange', handleVisibilityChange);
        // Attach global keydown listener for chat functionality.
        window.removeEventListener('keydown', collabUI.handleGlobalKeyDown);
        window.addEventListener('keydown', collabUI.handleGlobalKeyDown);

        console.log('Collab: WebsocketProvider connection sequence initiated...');

        // --- Cleanup Function ---
        /**
         * Cleans up all resources and listeners related to the collaboration session.
         * This function is returned by `attachYjsProvider` and called on disconnect or addon unload.
         */
        const cleanup = () => {
            console.log('Collab: Running Yjs cleanup...');
            collabUI.clearLocalChatMessage(); // Clear any local chat messages.
            timeout.clearInactivityTimers(); // Clear all inactivity timers.
            collabUI.hideSyncingPopup(); // Hide the syncing popup.

            // Remove provider event listeners.
            if (constants.mutableRefs.provider) {
                constants.mutableRefs.provider.off('synced');
                constants.mutableRefs.provider.off('destroy');
                constants.mutableRefs.provider.off('status');
                constants.mutableRefs.provider.off('ws-close');
            }
            // Disconnect and destroy the Yjs provider.
            if (constants.mutableRefs.provider?.connected) {
                constants.mutableRefs.provider.disconnect();
            }
            constants.mutableRefs.provider?.destroy();

            // Remove global window event listeners.
            window.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('keydown', collabUI.handleGlobalKeyDown);
            window.removeEventListener('collaboration_addon_trigger', handleCustomTrigger);

            // Remove Blockly workspace change listener.
            const ws = constants.mutableRefs.BlocklyInstance?.getMainWorkspace();
            if (ws && constants.mutableRefs.workspaceChangeListener) ws.removeChangeListener(constants.mutableRefs.workspaceChangeListener);
            // Remove mouse event listeners from the Blockly canvas.
            if (constants.mutableRefs.currentWorkspaceSvg) {
                if (constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
                if (constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
            }
            // Remove `beforeunload` listener.
            window.removeEventListener('beforeunload', handleBeforeUnload);

            // Disconnect the Blockly canvas observer.
            constants.mutableRefs.blocklyCanvasObserver?.disconnect();

            // Remove all collaboration UI elements.
            collabUI.removeAllUI();
            constants.remoteDraggingBlocks.forEach(dragData => dragData.ghostSvg?.remove()); // Remove all ghost blocks.
            constants.remoteDraggingBlocks.clear();
            constants.mutableRefs.collaborationLayerGroup?.remove(); // Remove the main collaboration SVG layer.
            constants.remoteUserIcons.forEach(icon => icon.remove()); // Remove all remote user icons.
            constants.remoteUserIcons.clear();
            constants.mutableRefs.userIconContainer?.remove(); // Remove menu bar icon container.
            constants.spriteIconContainers.forEach(({ container }) => container?.remove()); // Remove sprite icon containers.
            constants.spriteIconContainers.clear();
            constants.tabIconContainers.forEach(({ container }) => container?.remove()); // Remove tab icon containers.
            constants.tabIconContainers.clear();

            // Clear all mutable references.
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
            
            // Reset global collaboration flags.
            window.collaborationLocked = false;
            window.collaborationDisableSave = true; // Disable saving to prevent issues after session ends.
            constants.mutableRefs.workspaceChangeListener = null;

            // Remove global `window.collab` debug reference.
            if (window.collab) delete window.collab;
            console.log('Collab: Cleanup finished.');

            // Display a popup informing the user that collaboration has ended.
            const popup = document.createElement('div');
            popup.className = 'collab-popup';
            popup.innerHTML = `
                <div class="collab-popup-content">
                    <h2>Collaboration Ended</h2>
                    <p>The collaboration session has ended. Please refresh the page to start a new session.</p>
                    <p style="font-size: 11px;margin-top: 1.5rem;">It's recommended to download your project before refreshing (just in case something goes wrong).</p>
                </div>
            `;
            // Add a "Download Project" button for convenience.
            const button = document.createElement('button');
            button.innerText = 'Download Project';
            button.addEventListener('click', () => {
                // Simulate clicks to trigger the Scratch GUI's download functionality.
                document.querySelectorAll('[class*="menu-bar_menu-bar-item_"]')[1].click(); // Click 'File' menu.
                setTimeout(() => {
                    document.querySelectorAll('li[class*="menu_menu-item_"]')[3].click(); // Click 'Save to your computer'
                }, 500);
            });
            popup.children[0].appendChild(button);
            document.body.appendChild(popup);
        };

        // Re-assign the `destroy` handler, just in case.
        constants.mutableRefs.provider.on('destroy', () => {
            console.log("Collab: constants.mutableRefs.provider emitted 'destroy'. Manual cleanup should handle listeners etc.");
        });

        /**
         * Handles the `beforeunload` event to ensure cleanup is performed when the user leaves the page.
         */
        const handleBeforeUnload = () => {
            if (constants.mutableRefs.currentCleanupFunction) {
                console.log('Collab: Running cleanup on beforeunload.');
                constants.mutableRefs.currentCleanupFunction();
                constants.mutableRefs.currentCleanupFunction = null; // Clear reference after calling.
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return cleanup; // Return the cleanup function so it can be called later.

    } catch (error) {
        console.error('Collab: Failed to initialize Yjs/WebRTC constants.mutableRefs.provider:', error);
        collabUI.hideSyncingPopup();

        window.collaborationLocked = false; // Ensure collaboration is marked as unlocked.
        // Attempt partial cleanup in case of initialization failure.
        constants.mutableRefs.blocklyCanvasObserver?.disconnect();
        collabUI.removeAllUI();
        constants.mutableRefs.collaborationLayerGroup?.remove();
        constants.remoteDraggingBlocks.forEach(dragData => dragData.ghostSvg?.remove());
        constants.remoteDraggingBlocks.clear();
        constants.mutableRefs.userIconContainer?.remove();
        constants.spriteIconContainers.forEach(({ container }) => container?.remove());
        constants.spriteIconContainers.clear();
        constants.mutableRefs.provider?.destroy(); // Attempt to destroy the provider if partially created.
        // Clear references.
        constants.mutableRefs.provider = null; constants.mutableRefs.ydoc = null; constants.mutableRefs.yjsAwarenessInstance = null; constants.mutableRefs.yEvents = null; constants.mutableRefs.yProjectEvents = null;

        // Display an error popup indicating connection failure.
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

        return null; // Indicate failure to initialize.
    }
}

// Global flag to control when the collaboration addon should attempt to connect.
// "waiting" state means it's waiting for the project to load.
let shouldRunCollaborationAddon = "waiting";

/**
 * Sets the global flag to activate or deactivate the collaboration addon.
 * This function is called by the Scratch GUI's `project-fetcher-hoc`.
 * @param {boolean} action True to enable collaboration, false to disable.
 */
window.StartCollaborator = function (action = true) {
    shouldRunCollaborationAddon = action;
}

// --- Main Addon Export ---
/**
 * The main entry point for the Scratch Addons collaboration extension.
 * This function initializes the addon, sets up dependencies, and attaches listeners.
 * @param {object} { addon, console: addonConsole } Addon runtime object and console.
 */
export default async function ({ addon, console: addonConsole }) {
    addonConsole.log('Collaboration Addon Initializing...', document.querySelectorAll('[class*="loader_background_"]').length);

    try {
        // Store references to the addon, Blockly, and VM instances.
        constants.mutableRefs.addon = addon;
        constants.mutableRefs.BlocklyInstance = await addon.tab.traps.getBlockly();
        constants.mutableRefs.vm = addon.tab.traps.vm;

        // Ensure Blockly and VM instances are successfully trapped.
        if (!constants.mutableRefs.BlocklyInstance) throw new Error('Failed to trap Blockly instance.');
        if (!constants.mutableRefs.vm) throw new Error('Failed to trap constants.mutableRefs.vm instance.');

        // Inject custom CSS for collaboration UI elements.
        collabUI.setupCSS();

        // --- Create User Icon Container (Menu Bar) ---
        // Wait for the Scratch GUI's menu bar element.
        const menuBar = await addon.tab.waitForElement('[class*="menu-bar_main-menu"]', {
            markAsSeen: true,
            reduxCondition: state => state.scratchGui.mode.isPlayerOnly !== true // Ensure not in player-only mode.
        });
        // Create and append the container for user icons in the menu bar.
        if (menuBar && !document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID)) {
            constants.mutableRefs.userIconContainer = document.createElement('div');
            constants.mutableRefs.userIconContainer.id = constants.COLLABORATION_USER_ICON_CONTAINER_ID;
            constants.mutableRefs.userIconContainer.classList.add('collaboration-user-icon-container');
            // Insert the container after the menu bar.
            menuBar.parentNode.insertBefore(constants.mutableRefs.userIconContainer, menuBar.nextSibling);
            addonConsole.log('Collab UI: User icon container added to menu bar.');
        } else if (document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID)) {
            // Re-use existing container if it already exists (e.g., on addon re-enable).
            constants.mutableRefs.userIconContainer = document.getElementById(constants.COLLABORATION_USER_ICON_CONTAINER_ID);
            addonConsole.log('Collab UI: Re-using existing user icon container.');
        } else {
            addonConsole.warn('Collab UI: Could not find menu bar element to attach user icon container.');
        }

        // Expose debug references to the window object if debugging is enabled.
        if (constants.debugging) {
            window.addon = addon; window.Blockly = constants.mutableRefs.BlocklyInstance; window.vm = constants.mutableRefs.vm;
        }

        /**
         * Attempts to officially start the collaboration by attaching the Yjs provider.
         * This function waits for the project to be loaded if it's not already.
         */
        function startCollaboratorOffically() {
            // Only proceed if no cleanup function exists, indicating collaboration isn't already active.
            if (!constants.mutableRefs.currentCleanupFunction) {
                if (shouldRunCollaborationAddon == "waiting") {
                    // If still waiting for project load, retry after a delay.
                    setTimeout(() => {
                        startCollaboratorOffically();
                    }, 100);
                } else {
                    if (shouldRunCollaborationAddon) {
                        addonConsole.log('Collab: Project loaded, attaching Yjs constants.mutableRefs.provider...');
                        if (constants.debugging) window.collab = constants; // Expose constants for debugging.
                        setTimeout(() => {
                            // If provider isn't already attached, attach it.
                            if (!constants.mutableRefs.provider) {
                                // Override Blockly's undo function to potentially handle custom undo/redo logic (e.g., chat messages).
                                const undoInternal = constants.mutableRefs.BlocklyInstance.mainWorkspace.undo;
                                constants.mutableRefs.BlocklyInstance.mainWorkspace.undo = function (...args) {
                                    collabUI.setUndoRedoOverride(); // Set flag to indicate undo/redo in progress.
                                    undoInternal.apply(this, args);
                                }
                                constants.mutableRefs.currentCleanupFunction = attachYjsProvider(); // Store the cleanup function.
                            } else {
                                addonConsole.log('Collab: Yjs provider already attached after load, skipping.');
                            }
                        }, 800);
                    }
                }
            } else {
                addonConsole.log('Collab: Project loaded, but collaboration addon is disabled. Skipping Yjs provider attachment.');
            }
        }
        // If no loader background is present, assume project is already loaded and start collaboration immediately.
        if (document.querySelectorAll('[class*="loader_background_"]').length === 0) {
            if (constants.debugging) console.log('Collab: No loader background detected, starting collaborator immediately.');
            startCollaboratorOffically();
        }

        // --- Redux Listener (Project Load, Target Change) ---
        /**
         * Listens to Redux state changes in Scratch GUI to react to project loading,
         * active target changes (sprite/stage), and active tab changes.
         * @param {object} { detail } Event detail object from Redux state change.
         */
        const handleStateChange = ({ detail } = {}) => {
            const action = detail?.action || addon.tab.redux?.lastAction;
            if (!action) return;
            const actionType = action.type;

            // --- Project Load Complete ---
            // Trigger `startCollaboratorOffically` once the project has finished loading.
            const isProjectLoadComplete = actionType === 'scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID' ||
                actionType === 'scratch-gui/project-state/DONE_LOADING_VM_WITH_ID';

            if (isProjectLoadComplete) {
                startCollaboratorOffically();
            }

            // --- Target (Sprite/Stage) Change ---
            // When the active editing target (sprite or stage) changes in Scratch GUI.
            if (actionType === 'scratch-gui/targets/UPDATE_TARGET_LIST') {
                const newTargetId = action.editingTarget;
                let newTargetName = null;
                if (newTargetId) {
                    newTargetName = constants.mutableRefs.vm.runtime.getTargetById(newTargetId)?.getName();
                } else {
                    // If `editingTarget` is null/undefined, assume it's the Stage.
                    const stageTarget = constants.mutableRefs.vm.runtime.getTargetForStage();
                    if (stageTarget) newTargetName = stageTarget.getName();
                }

                // If the target name has actually changed.
                if (typeof newTargetName === 'string' && newTargetName !== constants.localUserInfo.currentTargetName) {
                    addonConsole.log(`Collab: Editing target changed to: ${newTargetName} (ID: ${newTargetId || 'Stage'})`);
                    constants.localUserInfo.currentTargetName = newTargetName; // Update local user's target.
                    // Clear any local asset editing state when switching targets.
                    assetSync.clearLocalEditingCostume();
                    assetSync.clearLocalEditingSound();
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        // Update awareness with the new target and clear any ongoing drag state.
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('currentTargetName', newTargetName);
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('dragging', null);
                    }
                    // Re-setup collaboration layer and update sprite icons after a slight delay.
                    setTimeout(() => {
                        collabUI.setupCollaborationLayer();
                    }, 100);
                } else if (typeof newTargetName !== 'string') {
                    addonConsole.warn(`Collab: Could not definitively get target name during target change. Action:`, action);
                }
            }

            // --- Tab Activation Change ---
            // When the user switches tabs (Code, Costumes, Sounds).
            if (actionType === 'scratch-gui/navigation/ACTIVATE_TAB') {
                const newActiveTabIndex = detail.action.activeTabIndex;
                const oldActiveTabIndex = constants.localUserInfo.activeTabIndex;

                if (constants.debugging) console.log(`Collab: ACTIVATE_TAB triggered. New tab: ${newActiveTabIndex}, Previous tab: ${oldActiveTabIndex}`);

                // --- Handle Costume Editing State ---
                // If leaving the Costumes tab (index 1).
                if (oldActiveTabIndex === 1 && newActiveTabIndex !== 1) {
                    if (constants.debugging) console.log('Collab: Navigating away from Costumes tab. Clearing costume editing state.');
                    assetSync.detachDebouncedCostumeEditorChangeListener();
                    if (constants.localUserInfo.editingCostumeInfo) {
                        assetSync.clearLocalEditingCostume(); // Clear local lock if exists.
                    }
                }
                // If entering the Costumes tab (index 1).
                else if (newActiveTabIndex === 1) {
                    if (constants.localUserInfo.editingCostumeInfo) {
                        if (constants.debugging) console.log('Collab: Navigated to Costumes tab while a costume might be edited. Ensuring listener is attached.');
                        assetSync.attachDebouncedCostumeEditorChangeListener(); // Re-attach listener if a costume is marked as edited.
                    } else {
                        assetSync.detachDebouncedCostumeEditorChangeListener(); // Ensure detached if no costume is actively edited.
                    }
                } else {
                    // If not related to costume tab, ensure listener is detached as a fallback.
                    assetSync.detachDebouncedCostumeEditorChangeListener();
                }

                // --- Handle Sound Editing State --- (Similar logic for sounds)
                // If leaving the Sounds tab (index 2).
                if (oldActiveTabIndex === 2 && newActiveTabIndex !== 2) {
                    if (constants.debugging) console.log('Collab: Navigating away from Sounds tab. Clearing sound editing state.');
                    assetSync.detachDebouncedSoundEditorChangeListener();
                    if (constants.localUserInfo.editingSoundInfo) {
                        assetSync.clearLocalEditingSound();
                    }
                }
                // If entering the Sounds tab (index 2).
                else if (newActiveTabIndex === 2) {
                    if (constants.localUserInfo.editingSoundInfo) {
                        if (constants.debugging) console.log('Collab: Navigated to Sounds tab while a sound might be edited. Ensuring listener is attached.');
                        assetSync.attachDebouncedSoundEditorChangeListener();
                    } else {
                        assetSync.detachDebouncedSoundEditorChangeListener();
                    }
                } else {
                    assetSync.detachDebouncedSoundEditorChangeListener();
                }

                // Update local user info and awareness with the new active tab index.
                if (typeof newActiveTabIndex === 'number' && constants.localUserInfo.activeTabIndex !== newActiveTabIndex) {
                    if (constants.debugging) console.log(`Collab: Local tab activated. From: ${oldActiveTabIndex} To: ${newActiveTabIndex}`);
                    constants.localUserInfo.activeTabIndex = newActiveTabIndex;
                    if (constants.mutableRefs.yjsAwarenessInstance) {
                        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('activeTabIndex', newActiveTabIndex);
                    }
                }
            }

            // --- Theme Change ---
            // If the GUI theme changes, re-setup the collaboration layer to ensure correct styling.
            if (actionType === 'scratch-gui/theme/SET_THEME') {
                setTimeout(async () => {
                    constants.mutableRefs.BlocklyInstance = await addon.tab.traps.getBlockly(); // Re-trap Blockly.
                    collabUI.setupCollaborationLayer();
                }, 100);
            }

            // --- Sprite List Changes ---
            // Trigger an update of sprite user icons when the target list changes (e.g., sprite added/deleted).
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

        // Attach the Redux state listener. Remove any existing one first to prevent duplicates.
        if (addon.tab.redux) {
            addon.tab.redux.removeEventListener('statechanged', handleStateChange);
            addon.tab.redux.addEventListener('statechanged', handleStateChange);
            addonConsole.log('Collab: Redux state listener attached.');
            handleStateChange(); // Perform an initial check on the current Redux state.
        } else {
            addonConsole.warn('Collab: Redux listener not available. Automatic attach/cleanup might fail.');
            // Fallback for environments without Redux access: attempt to attach after a delay.
            setTimeout(() => {
                if (!constants.mutableRefs.provider) constants.mutableRefs.currentCleanupFunction = attachYjsProvider();
            }, 1500);
        }

    } catch (error) {
        // Log any fatal errors during addon initialization.
        addonConsole.error('Collab: Fatal error during initialization:', error);
        // Attempt to run cleanup if a cleanup function exists.
        if (constants.mutableRefs.currentCleanupFunction) constants.mutableRefs.currentCleanupFunction();
        else {
            // Perform a minimal cleanup if cleanup function wasn't fully set up.
            constants.remoteUserIcons.forEach(icon => icon.remove()); constants.remoteUserIcons.clear();
            constants.mutableRefs.userIconContainer?.remove();
            constants.spriteIconContainers.forEach(({ container }) => container?.remove()); constants.spriteIconContainers.clear();
        }
    }

    addonConsole.log('Collaboration Addon Initialized.');
}
