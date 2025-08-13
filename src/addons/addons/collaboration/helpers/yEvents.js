import * as constants from './constants.js';
import * as helper from './helper.js';

/**
 * A flag indicating whether events should be processed immediately (`true`)
 * or queued for later processing (`false`). This is set to true once the
 * application is fully initialized and ready to handle live updates.
 */
let canFinallyRunEvents = false;

/**
 * Reference to the main Blockly workspace. This is dynamically assigned
 * within the observer to ensure it's up-to-date.
 */
let workspace = null;

/**
 * Sets up an observer for remote Yjs events (`constants.mutableRefs.yEvents`).
 * This observer listens for changes made by other collaborators and applies them
 * to the local Scratch-like project's Blockly workspace and VM state.
 */
export function setupYEventsObserver() {
    // Observe changes to the Y.Array (constants.mutableRefs.yEvents) that stores Blockly and custom project events.
    constants.mutableRefs.yEvents.observe(event => {
        // Ignore events that originated from this local client to prevent echoing and infinite loops.
        if (event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN) return;

        // Obtain a fresh reference to the main Blockly workspace for applying visual changes.
        workspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();

        // Check if the Scratch VM and its runtime are available. These are essential for applying logic changes.
        if (!constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime) {
            console.warn('Collab RX: VM or VM runtime not ready. Skipping event processing.');
            return;
        }

        // For standard Blockly events (like block moves, changes, etc.), the workspace must be loaded.
        // For custom events like 'shareBlocksToTarget', the VM is the primary dependency.
        if (!workspace && event.changes.added.some(item => item.content?.getContent()?.[0]?.event?.type)) {
            console.warn('Collab RX: Workspace not found, cannot apply remote standard Blockly events.');
            // Custom events that don't directly modify the workspace (like 'CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE')
            // can still proceed even if the workspace isn't fully ready.
        }

        const allReceivedEventItemsInBatch = [];
        // Extract all individual event items from the Yjs transaction's added changes.
        event.changes.added.forEach(item => {
            if (item.content && typeof item.content.getContent === 'function') {
                item.content.getContent().forEach(eventItem => {
                    allReceivedEventItemsInBatch.push(eventItem);
                });
            } else {
                // Log a warning if an item in the Yjs change array has an unexpected structure.
                console.warn('Collab RX (yEvents observer): Received unexpected item structure in yEvents change:', item);
            }
        });

        // If no event items were received, there's nothing to process.
        if (allReceivedEventItemsInBatch.length === 0) return;
        if (constants.debugging) console.log(`Collab RX (yEvents observer): Received ${allReceivedEventItemsInBatch.length} remote event items.`);

        let itemsToProcess = allReceivedEventItemsInBatch;

        // --- Optimization logic for initial synchronization ---
        // This block attempts to optimize the initial load by only processing events
        // from the last 'savedProject' event onwards within the first batch of events.
        // This is crucial to avoid applying granular, potentially outdated, block changes
        // if a full project state was synced more recently.
        if (!constants.mutableRefs.hasProcessedInitialBlockEvents) {
            let lastSaveProjectIndexInBatch = -1;
            // Iterate backwards through the current batch to find the last 'savedProject' event.
            for (let i = allReceivedEventItemsInBatch.length - 1; i >= 0; i--) {
                if (allReceivedEventItemsInBatch[i] && allReceivedEventItemsInBatch[i].type === 'savedProject') {
                    lastSaveProjectIndexInBatch = i;
                    break;
                }
            }

            if (lastSaveProjectIndexInBatch !== -1) {
                // If a 'savedProject' event is found, slice the array to process only subsequent events.
                itemsToProcess = allReceivedEventItemsInBatch.slice(lastSaveProjectIndexInBatch);
                if (constants.debugging) {
                    console.log(`Collab RX (yEvents observer): Initial event batch. Found 'savedProject'. Processing ${itemsToProcess.length} of ${allReceivedEventItemsInBatch.length} items from this batch, starting from the save event.`);
                }
            } else {
                // If no 'savedProject' marker is in this batch, process all events in the batch.
                if (constants.debugging) {
                    console.log(`Collab RX (yEvents observer): Initial event batch. No 'savedProject' found in this specific batch. Processing all ${allReceivedEventItemsInBatch.length} items from this batch.`);
                }
            }
            // Mark that this initial processing logic has been applied for this observer.
            constants.mutableRefs.hasProcessedInitialBlockEvents = true;
        }
        // --- End of optimization logic ---

        // Log the number of events being processed, indicating if filtering occurred.
        if (constants.debugging && itemsToProcess !== allReceivedEventItemsInBatch) {
            console.log(`Collab RX (yEvents observer): Filtered to process ${itemsToProcess.length} events.`);
        } else if (constants.debugging && constants.mutableRefs.hasProcessedInitialBlockEvents) {
            console.log(`Collab RX (yEvents observer): Received ${itemsToProcess.length} remote event items to process (subsequent batch).`);
        }

        // Temporarily disable Blockly events to prevent local actions triggered by remote events
        // from generating new events that would then be re-broadcast.
        if (canFinallyRunEvents) constants.mutableRefs.BlocklyInstance.Events.disable();

        // Iterate through each event item in the batch and process it.
        itemsToProcess.forEach(item => {
            if (canFinallyRunEvents) {
                // If the system is ready, process the event immediately.
                processSpecificEvent(item);
            } else {
                // Otherwise, queue the event for deferred processing once the system is ready.
                addEventToQueue(item);
            }
        });

        // Re-enable Blockly events after the batch has been processed.
        if (canFinallyRunEvents) constants.mutableRefs.BlocklyInstance.Events.enable();
    });
}

/**
 * Adds a project event item to a queue for deferred processing.
 * This is used when the system is not yet ready to apply events directly
 * (e.g., during initial VM or Blockly workspace loading).
 * @param {object} item - The event item to add to the queue.
 */
function addEventToQueue(item) {
    helper.addItemToProcess(item, 'yEvents'); // Utilizes a helper function to manage the processing queue.
}

/**
 * Sets the `canFinallyRunEvents` flag to `true`, allowing subsequent events
 * to be processed immediately and triggering the processing of any events
 * currently held in the queue.
 */
export function runNormally() {
    canFinallyRunEvents = true; // Signals that the system is ready for live event processing.
}

/**
 * Processes a single remote project event, applying the corresponding change
 * to the Blockly workspace and/or Scratch VM state. This function handles
 * various event types, including variable/list/broadcast changes, custom block
 * sharing events, and standard Blockly events.
 * @param {object} item - The event item to process.
 */
export function processSpecificEvent(item) {
    if (constants.debugging) console.log(`Collab RX: Processing event item:`, item);
    // Emit a generic project changed event on the VM runtime to signal that
    // something has been modified, which can trigger UI updates.
    constants.mutableRefs.vm.runtime.emitProjectChanged();

    // Basic validation for the event item.
    if (!item) {
        console.warn('Collab RX: Received null/undefined event item. Skipping.');
        return;
    }

    // Extract event type, data, and the name of the target (sprite/stage)
    // where the event originated from the remote client.
    const eventType = item?.event?.type;
    const eventData = item?.event;
    const senderContextTargetName = item?.targetName;
    const currentWorkspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
    
    // --- Handle variable, list, and broadcast message events ---
    // These events are custom processed as they often involve specific VM and Blockly interactions
    // beyond standard block events.
    if (eventType === 'var_create' || eventType === 'var_delete' || eventType === 'var_rename') {
        // Re-emit project changed for good measure, though the initial one usually suffices.
        constants.mutableRefs.vm.runtime.emitProjectChanged();

        // Ensure the Blockly workspace is available, as variable operations often involve it.
        if (!currentWorkspace) {
            console.warn(`Collab RX: Workspace not found, cannot apply variable event type "${eventType}". Skipping.`);
            return;
        }

        /**
         * Resets the block caches for all targets in the VM runtime.
         * This is crucial after changes that might affect block definitions or references,
         * such as renaming broadcasts, to ensure the VM re-evaluates blocks correctly.
         */
        const resetVMCaches = () => {
            const blockContainers = new Set(constants.mutableRefs.vm.runtime.targets.map(i => i.blocks));
            for (const blocks of blockContainers) {
                blocks.resetCache();
            }
        };

        /**
         * Finds a Scratch VM target (sprite or Stage) by its name.
         * @param {string} name - The name of the target.
         * @returns {object|null} The VM target object, or null if not found.
         */
        const findVmTargetByName = name => {
            if (!constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime || !constants.mutableRefs.vm.runtime.targets) return null;
            for (const t of constants.mutableRefs.vm.runtime.targets) {
                if (t.getName() === name) {
                    return t;
                }
            }
            return null;
        };

        /**
         * Retrieves a variable, list, or broadcast message object from the VM
         * based on its name and context (global or local to a target).
         * Includes an `ambiguityFix` to correctly identify variables of the same name but different types (e.g., variable vs. list).
         * @param {string} variableName - The name of the variable/list/broadcast.
         * @param {string|null} contextTargetName - The name of the target for local variables, or null for global.
         * @param {object} ambiguityFix - An object containing `varType` ('variable', 'list', 'broadcast_msg') and `isCloud` (boolean) for precise identification.
         * @returns {object|null} The VM variable object, or null if not found.
         */
        const getVmVariableByName = (variableName, contextTargetName, ambiguityFix) => {
            if (!(ambiguityFix && typeof ambiguityFix.varType !== "undefined" && typeof ambiguityFix.isCloud !== "undefined")) {
                console.warn(`Collab RX: getVmVariableByName called without ambiguityFix, which is required for correct variable type resolution.`);
                return null;
            }
            if (contextTargetName) { // Process local variable scope
                const vmTarget = findVmTargetByName(contextTargetName);
                if (vmTarget && vmTarget.variables) {
                    for (const id in vmTarget.variables) {
                        const varObj = vmTarget.variables[id];
                        if (varObj.name === variableName && varObj.type === ambiguityFix.varType && varObj.isCloud === ambiguityFix.isCloud) {
                            return varObj; // Returns {id, name, type, isCloud}
                        }
                    }
                }
            } else { // Process global variable scope (always tied to Stage)
                const allGlobalVars = currentWorkspace.getAllVariables(); // Get all Blockly variables (including lists/broadcasts)
                for (const v of allGlobalVars) {
                    if (v.name === variableName && v.type === ambiguityFix.varType && v.isCloud === ambiguityFix.isCloud) {
                        return { id: v.getId(), name: v.name, type: v.type, isCloud: v.isCloud };
                    }
                }
            }
            return null;
        };

        // --- Handle Variable Creation ---
        if (eventType === 'var_create') {
            const newVarData = eventData; // Contains id, name, varType, isCloud, isLocal, targetName
            let varTargetName = null;
            if (!newVarData.isLocal) { // Global variables are always associated with the 'Stage'.
                varTargetName = 'Stage';
            } else { // Local variables are associated with a specific sprite.
                varTargetName = newVarData.targetName;
            }
            const vmTargetForCreate = findVmTargetByName(varTargetName);

            if (vmTargetForCreate) {
                let existingVar = null;
                // First, try to find the variable by its ID (if provided).
                if (newVarData.id && vmTargetForCreate.variables[newVarData.id]) {
                    existingVar = vmTargetForCreate.variables[newVarData.id];
                } else {
                    // If not found by ID, check for a variable with the same name, type, and cloud status.
                    // This prevents creating semantic duplicates if a variable already exists.
                    for (const idKey in vmTargetForCreate.variables) {
                        const varObj = vmTargetForCreate.variables[idKey];
                        if (
                            varObj.name === newVarData.name &&
                            varObj.type === newVarData.varType &&
                            varObj.isCloud === newVarData.isCloud
                        ) {
                            existingVar = varObj;
                            break;
                        }
                    }
                }

                if (!existingVar) {
                    try {
                        // Determine if the toolbox should be refreshed (if the current target is the Stage or the editing sprite).
                        const shouldRefreshToolbox = (vmTargetForCreate.getName() === 'Stage') || (vmTargetForCreate.getName() === helper.getCurrentEditingTargetName());
                        // Create the variable in the Scratch VM.
                        vmTargetForCreate.createVariable(newVarData.id, newVarData.name, newVarData.varType, newVarData.isCloud);
                        if (shouldRefreshToolbox) {
                            // Create the corresponding variable in Blockly's workspace and refresh the toolbox.
                            currentWorkspace.createVariable(newVarData.name, newVarData.varType, newVarData.id, !(vmTargetForCreate.getName() === 'Stage'), newVarData.isCloud);
                            currentWorkspace.refreshToolboxSelection_();
                        }
                        if (constants.debugging) console.log(`Collab RX: Created variable "${newVarData.name}" on target ${vmTargetForCreate.getName()}, refreshing toolbox?`, shouldRefreshToolbox);
                    } catch (e) {
                        console.error(`Collab RX: Error creating variable from Yjs for target ${vmTargetForCreate.getName()}:`, newVarData.name, e);
                    }
                } else if (constants.debugging) {
                    console.log(`Collab RX: Variable "${newVarData.name}" already exists on target ${vmTargetForCreate.getName()}, skipping creation.`);
                }
            } else {
                console.warn(`Collab RX [var_create]: Target sprite "${newVarData.targetName}" not found for local variable "${newVarData.name}" creation.`);
            }
        }
        // --- Handle Variable Renaming ---
        else if (eventType === 'var_rename') {
            const renameData = eventData; // Contains oldName, newName, originalVarId, and ambiguityFix
            let variableToRename;
            let vmTargetForAction = null;

            // `ambiguityFix` is critical for correctly identifying the variable when multiple types (var, list, broadcast)
            // might share similar names or contexts.
            if (!renameData.ambiguityFix || typeof renameData.ambiguityFix.varType === "undefined" || typeof renameData.ambiguityFix.isCloud === "undefined" || typeof renameData.ambiguityFix.isLocal === "undefined") {
                console.warn(`Collab RX: var_rename called without ambiguityFix, which is required for correct variable type resolution. Skipping.`);
                return;
            }

            // Determine the context (local to a sprite or global on Stage).
            if (renameData.ambiguityFix.isLocal) {
                vmTargetForAction = findVmTargetByName(senderContextTargetName);
                if (vmTargetForAction) {
                    variableToRename = getVmVariableByName(renameData.oldName, senderContextTargetName, renameData.ambiguityFix);
                }
            } else { // Global
                vmTargetForAction = findVmTargetByName('Stage');
                if (vmTargetForAction) {
                    variableToRename = getVmVariableByName(renameData.oldName, null, renameData.ambiguityFix);
                }
            }

            if (variableToRename) {
                if (vmTargetForAction) {
                    // Check for name conflicts before renaming.
                    let conflict = false;
                    for (const vid in vmTargetForAction.variables) {
                        if (vmTargetForAction.variables[vid].name === renameData.newName && vid !== variableToRename.id) {
                            conflict = true;
                            break;
                        }
                    }
                    if (conflict) {
                        console.warn(`Collab RX: Rename conflict for variable "${renameData.newName}" on target ${vmTargetForAction.getName()}. Skipping.`);
                        return;
                    }

                    // Apply rename in VM if the variable exists and its name is different.
                    if (vmTargetForAction.variables[variableToRename.id] && vmTargetForAction.variables[variableToRename.id].name !== renameData.newName) {
                        try {
                            vmTargetForAction.renameVariable(variableToRename.id, renameData.newName);
                            if (constants.debugging) console.log(`Collab RX: Renamed variable on ${vmTargetForAction.getName()}: "${renameData.oldName}" -> "${renameData.newName}"`);
                        } catch (e) {
                            console.error(`Collab RX: Error renaming variable on ${vmTargetForAction.getName()}:`, e);
                        }
                    }

                    // Apply rename in Blockly workspace.
                    const blocklyVariable = currentWorkspace.getVariableById(variableToRename.id);
                    if (blocklyVariable) {
                        try {
                            currentWorkspace.renameVariableById(blocklyVariable.id_, renameData.newName);
                            // Special handling for broadcast messages after renaming:
                            if (blocklyVariable.type === "broadcast_msg") {
                                // 1. Update the 'value' property of the VM variable itself, as it's often used internally.
                                if (variableToRename.value !== renameData.newName) {
                                    variableToRename.value = renameData.newName;
                                    if (constants.debugging) console.log(`Collab RX: Updated VM broadcast variable value for ID ${variableToRename.id} to "${renameData.newName}"`);
                                }
                                // 2. Iterate through all blocks in the VM and update any 'broadcast' blocks
                                // that reference this variable ID, ensuring their value (the broadcast name) is current.
                                const blockContainers = new Set(constants.mutableRefs.vm.runtime.targets.map(i => i.blocks));
                                for (const blockContainer of blockContainers) {
                                    for (const block of Object.values(blockContainer._blocks)) {
                                        const broadcastOption = block.fields && block.fields.BROADCAST_OPTION;
                                        if (broadcastOption && broadcastOption.id === variableToRename.id) {
                                            if (broadcastOption.value !== renameData.newName) {
                                                broadcastOption.value = renameData.newName;
                                                if (constants.debugging) console.log(`Collab RX: Updated VM block's BROADCAST_OPTION value for block ${block.id} to "${renameData.newName}"`);
                                            }
                                        }
                                    }
                                }
                                // 3. Reset VM caches to ensure the runtime picks up all changes.
                                resetVMCaches();
                                if (constants.debugging) console.log("Collab RX: Reset VM caches after broadcast rename.");
                            }
                            if (constants.debugging) console.log(`Collab RX: Blockly variable renamed for ID ${blocklyVariable.id_} to "${renameData.newName}"`);
                        } catch (e) {
                            console.error(`Collab RX: Error renaming Blockly variable for ID ${blocklyVariable.id_}:`, e);
                        }
                    }
                }
            } else {
                console.warn(`Collab RX [var_rename]: Variable "${renameData.oldName}" not found in context "${senderContextTargetName || 'intended global'}" nor globally.`);
            }
        }
        // --- Handle Variable Deletion ---
        else if (eventType === 'var_delete') {
            const deleteData = eventData; // Contains varName, originalVarId, and ambiguityFix
            let variableToDelete;
            let vmTargetForAction = null;

            // `ambiguityFix` is crucial for correctly identifying the variable.
            if (!deleteData.ambiguityFix || typeof deleteData.ambiguityFix.varType === "undefined" || typeof deleteData.ambiguityFix.isCloud === "undefined" || typeof deleteData.ambiguityFix.isLocal === "undefined") {
                console.warn(`Collab RX: var_delete called without ambiguityFix, which is required for correct variable type resolution. Skipping.`);
                return;
            }

            // Determine the context (local to a sprite or global on Stage).
            if (deleteData.ambiguityFix.isLocal) {
                vmTargetForAction = findVmTargetByName(senderContextTargetName);
                if (vmTargetForAction) {
                    variableToDelete = getVmVariableByName(deleteData.varName, senderContextTargetName, deleteData.ambiguityFix);
                }
            } else { // Global
                vmTargetForAction = findVmTargetByName('Stage');
                if (vmTargetForAction) {
                    variableToDelete = getVmVariableByName(deleteData.varName, null, deleteData.ambiguityFix);
                }
            }

            if (variableToDelete) {
                if (vmTargetForAction) {
                    // Delete the variable from the Scratch VM.
                    if (vmTargetForAction.variables && vmTargetForAction.variables[variableToDelete.id]) {
                        try {
                            vmTargetForAction.deleteVariable(variableToDelete.id);
                            if (constants.debugging) console.log(`Collab RX: Deleted variable "${deleteData.varName}" from ${vmTargetForAction.getName()}`);
                        } catch (e) {
                            console.error(`Collab RX: Error deleting variable from ${vmTargetForAction.getName()}:`, e);
                        }
                    } else if (constants.debugging) {
                        console.log(`Collab RX: Variable "${deleteData.varName}" (ID: ${variableToDelete.id}) not found on target ${vmTargetForAction.getName()} for deletion, might have been already deleted.`);
                    }

                    // Delete the variable from the Blockly workspace.
                    const variableMap = currentWorkspace.getVariableMap();
                    const blocklyVariable = variableMap.getVariableById(variableToDelete.id);

                    if (blocklyVariable) {
                        // Get all uses of the variable in the workspace, required by Blockly's internal deletion method.
                        const uses = variableMap.getVariableUsesById(blocklyVariable.id_);
                        try {
                            // Force delete the variable in Blockly without prompts or checks, as it's a remote operation.
                            variableMap.deleteVariableInternal_(blocklyVariable, uses);
                            // Refresh the toolbox to remove the deleted variable.
                            constants.mutableRefs.BlocklyInstance.getMainWorkspace().refreshToolboxSelection_();
                            if (constants.debugging) console.log(`Collab RX: Blockly variable force-deleted for ID ${blocklyVariable.id_}`);
                        } catch (e) {
                            console.error(`Collab RX: Error force-deleting Blockly variable for ID ${blocklyVariable.id_}:`, e);
                        }
                    }
                }
            } else {
                console.warn(`Collab RX [var_delete]: Variable "${deleteData.varName}" not found in context "${senderContextTargetName || 'intended global'}" nor globally.`);
            }
        }
        return; // Exit function as variable events are handled separately.
    }

    // --- Handle Custom Remote Block Sharing Call ---
    // This event type facilitates sharing a selection of blocks (e.g., via copy-paste)
    // from one target to another or within the same target.
    if (item.type === constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE) {
        if (!item.data) {
            console.warn(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Missing data in event item:`, item);
            return;
        }
        const { blocksData, destinationTargetName, sourceTargetName } = item.data;

        if (!blocksData || !destinationTargetName) {
            console.warn(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Invalid or incomplete data received:`, item.data);
            return;
        }

        // Resolve the destination target's internal VM ID from its name.
        let localDestinationTargetId = null;
        const destStageTarget = constants.mutableRefs.vm.runtime.getTargetForStage();
        if (destStageTarget && destStageTarget.getName() === destinationTargetName) {
            localDestinationTargetId = destStageTarget.id;
        } else {
            const destSpriteTarget = constants.mutableRefs.vm.runtime.getSpriteTargetByName(destinationTargetName);
            if (destSpriteTarget) {
                localDestinationTargetId = destSpriteTarget.id;
            }
        }

        if (!localDestinationTargetId) {
            console.warn(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Destination target "${destinationTargetName}" not found locally. Skipping VM call.`);
            return;
        }

        // Resolve the source target's internal VM ID from its name (optional, may be null).
        let localSourceTargetId = null;
        if (sourceTargetName) {
            const sourceStage = constants.mutableRefs.vm.runtime.getTargetForStage();
            if (sourceStage && sourceStage.getName() === sourceTargetName) {
                localSourceTargetId = sourceStage.id;
            } else {
                const sourceSprite = constants.mutableRefs.vm.runtime.getSpriteTargetByName(sourceTargetName);
                if (sourceSprite) {
                    localSourceTargetId = sourceSprite.id;
                } else {
                    console.warn(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Source target "${sourceTargetName}" not found locally. Proceeding without source ID if applicable.`);
                }
            }
        }

        if (constants.debugging) {
            console.log(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Attempting to call vm.shareBlocksToTarget with emit=false.`);
            console.log(`  Destination: "${destinationTargetName}" (Resolved ID: ${localDestinationTargetId})`);
            console.log(`  Source: "${sourceTargetName || 'N/A'}" (Resolved ID: ${localSourceTargetId || 'N/A'})`);
            console.log(`  Blocks data (first block ID if exists):`, blocksData?.[0]?.id);
        }

        try {
            // Call `vm.shareBlocksToTarget` to import the block data into the VM.
            // The `false` argument prevents the VM from re-emitting these changes as local Blockly events,
            // as they are already being processed as a remote event.
            constants.mutableRefs.vm.shareBlocksToTarget(blocksData, localDestinationTargetId, localSourceTargetId, false)
                .then(() => {
                    if (constants.debugging) console.log(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: vm.shareBlocksToTarget promise resolved for "${destinationTargetName}".`);
                    // `shareBlocksToTarget` itself will trigger local Blockly.Events.Create events for the new blocks.
                    // These local events *will* be picked up by the local `handleBlocklyEventForCollaboration` and broadcast.
                    // However, they will be marked with `constants.LOCAL_EVENT_SYNC_ORIGIN`, preventing *this* client
                    // from processing them again from `yEvents`. Other clients will receive and process them.
                    // Refresh the workspace to visually update it after blocks are added.
                    constants.mutableRefs.vm.refreshWorkspace();
                })
                .catch(e => {
                    console.error(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Error during vm.shareBlocksToTarget promise for "${destinationTargetName}":`, e);
                });
        } catch (e) {
            // Catch any synchronous errors that might occur during the initial call.
            console.error(`Collab RX [${constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE}]: Synchronous error calling vm.shareBlocksToTarget for "${destinationTargetName}":`, e);
        }
        return; // Exit function as this custom event type is handled.
    }

    // --- Handle Standard Blockly Events ---
    // This section processes regular Blockly events (e.g., block creation, moves, changes, deletions)
    // that were broadcast by other clients. This also covers the 'echo' of locally fired events
    // by `vm.shareBlocksToTarget` (which are then re-broadcast by the local client for others).
    if (item.event && item.event.type) {
        const remoteTargetName = item.targetName; // The name of the target (sprite/stage) where the event occurred remotely.
        const eventJson = item.event; // The raw JSON representation of the Blockly event.

        if (!workspace) {
            console.warn(`Collab RX: Workspace not found, cannot apply standard remote event type "${eventJson.type}". Skipping.`);
            return;
        }

        let blocklyEvent;
        try {
            // Special handling for `BLOCK_MOVE` events that represent a block being "unplugged"
            // (moved to become a top-level block). Blockly's `fromJson` might not correctly capture
            // `oldParentId` in this scenario, so it's manually constructed to preserve the "unplug" action.
            if (eventJson.type === constants.mutableRefs.BlocklyInstance.Events.BLOCK_MOVE &&
                eventJson.newCoordinate && // Indicates a move to a specific coordinate
                (typeof eventJson.newParentId === 'undefined' || eventJson.newParentId === null) && // Indicates it's becoming a top-level block
                eventJson.blockId) {
                const blockToMove = workspace.getBlockById(eventJson.blockId);
                if (blockToMove) {
                    // Create a new `BlockMove` event from the existing block to capture its current parentage as 'old' state.
                    blocklyEvent = new constants.mutableRefs.BlocklyInstance.Events.BlockMove(blockToMove);
                    // Explicitly set `newParentId` and `newInputName` to undefined/null to signify becoming a top block.
                    blocklyEvent.newParentId = undefined;
                    blocklyEvent.newInputName = undefined;
                    // Parse and set the new coordinates.
                    if (eventJson.newCoordinate) {
                        const coords = eventJson.newCoordinate.split(',');
                        blocklyEvent.newCoordinate = new constants.mutableRefs.BlocklyInstance.utils.Coordinate(parseFloat(coords[0]), parseFloat(coords[1]));
                    }
                    // Copy group ID if present.
                    if (eventJson.group) {
                        blocklyEvent.group = eventJson.group;
                    }
                    // Apply any other properties from the JSON that were not covered by the constructor.
                    blocklyEvent.fromJson(eventJson);
                } else {
                    // Fallback to standard `fromJson` if the block is not found (should be rare).
                    console.warn(`Collab RX: Block ${eventJson.blockId} for programmatic detach not found. Falling back to direct fromJson.`);
                    blocklyEvent = constants.mutableRefs.BlocklyInstance.Events.fromJson(eventJson, workspace);
                }
            } else {
                // For all other event types, or `BLOCK_MOVE`s that are not "unplugs", use standard `fromJson`.
                blocklyEvent = constants.mutableRefs.BlocklyInstance.Events.fromJson(eventJson, workspace);
            }

            if (!blocklyEvent) {
                throw new Error('Blockly.Events.fromJson returned undefined or null');
            }
        } catch (e) {
            console.error(`Collab RX: Error deserializing standard event JSON type "${eventJson.type}":`, e, eventJson);
            return; // Skip this event if deserialization fails.
        }

        // --- Determine the correct Scratch VM Target for the event ---
        // The `remoteTargetName` specifies which sprite or the Stage this event applies to.
        let target = null;
        const stage = constants.mutableRefs.vm.runtime.getTargetForStage();
        if (remoteTargetName && stage?.getName() === remoteTargetName) {
            target = stage;
        } else if (remoteTargetName) {
            target = constants.mutableRefs.vm.runtime.getSpriteTargetByName(remoteTargetName);
        }

        // Fallback or error handling if the target cannot be resolved.
        if (!target) {
            if (remoteTargetName) {
                // If a specific target name was provided but not found locally, it's a potential issue.
                console.warn(`Collab RX: Target "${remoteTargetName}" for standard event type "${blocklyEvent.type}" (Block ID: ${blocklyEvent.blockId || 'N/A'}) not found. VM update may be skipped or fail.`);
            } else {
                // If no remote target name was specified, it might be a truly global event.
                // In such cases, attempt to use the currently editing target as a fallback.
                target = constants.mutableRefs.vm.runtime.getEditingTarget();
                if (constants.debugging && target) console.log(`Collab RX: Standard event type "${blocklyEvent.type}" had no remoteTargetName. Using current editing target "${target.getName()}" for VM update attempt.`);
            }

            if (!target) {
                console.error(`Collab RX: Skipping standard event type "${blocklyEvent.type}" (Block ID: ${blocklyEvent.blockId || 'N/A'}) due to inability to determine/resolve target (Remote: "${remoteTargetName}").`);
                return; // Critical failure to resolve target, skip event.
            }
        }

        const currentEditingTargetName = helper.getCurrentEditingTargetName(); // Get the name of the target currently being edited locally.

        // --- Handle Comment Events ---
        // Comment events are handled separately via helper functions because they might need to update
        // a workspace that is not currently visible (i.e., not the currently editing target's workspace).
        if (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.COMMENT_CREATE &&
            remoteTargetName && currentEditingTargetName !== remoteTargetName) {
            helper.CommentCreate(blocklyEvent, remoteTargetName);
            return; // Stop further processing for this event.
        }

        if (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.COMMENT_DELETE &&
            remoteTargetName && currentEditingTargetName !== remoteTargetName) {
            helper.CommentDelete(blocklyEvent, remoteTargetName);
            return; // Stop further processing for this event.
        }

        if (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.COMMENT_CHANGE &&
            remoteTargetName && currentEditingTargetName !== remoteTargetName) {
            helper.CommentChange(blocklyEvent, remoteTargetName);
            return; // Stop further processing for this event.
        }

        if (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.COMMENT_MOVE &&
            remoteTargetName && currentEditingTargetName !== remoteTargetName) {
            helper.CommentMove(blocklyEvent, remoteTargetName);
            return; // Stop further processing for this event.
        }

        // --- Apply Standard Event to Blockly Workspace and VM ---
        try {
            if (constants.debugging) {
                console.log(`Collab RX: Processing standard event=${blocklyEvent.type} (Block ID: ${blocklyEvent.blockId || 'N/A'})`);
                console.log(`  VM Target for event: "${target.getName()}" (Origin Context: "${remoteTargetName || 'N/A'}")`);
                console.log(`  Current local view: "${currentEditingTargetName || 'N/A'}"`);
            }

            // 1. Apply the event VISUALLY to the Blockly workspace.
            // This is only done if the local client is currently viewing the target (sprite or Stage)
            // where the event originated, or if it's a global event.
            const isViewingCorrectTarget = remoteTargetName && currentEditingTargetName === remoteTargetName;
            const isPotentiallyGlobalEvent = !remoteTargetName; // Covers events not specific to a sprite.

            // Only run visual updates if the local workspace is relevant.
            // `VAR_CREATE` events are always applied visually as they affect the toolbox regardless of current target view.
            if (isViewingCorrectTarget || isPotentiallyGlobalEvent || constants.mutableRefs.BlocklyInstance.Events.VAR_CREATE === blocklyEvent.type) {
                let canRunVisually = true;
                // Optimization: For BLOCK_CREATE events, if the block already exists visually, skip visual application.
                // This can happen if `shareBlocksToTarget` already created the blocks locally, and this is the echo.
                if (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.BLOCK_CREATE && blocklyEvent.blockId && currentWorkspace.getBlockById(blocklyEvent.blockId)) {
                    if (constants.debugging) console.log(`Collab RX: Skipping visual .run() for standard CREATE on block ${blocklyEvent.blockId} - block already exists in current workspace view.`);
                    canRunVisually = false;
                }
                // For other events (MOVE, CHANGE, DELETE), ensure the block exists before trying to apply changes visually.
                else if (blocklyEvent.blockId && (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.MOVE || blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.CHANGE || blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.DELETE)) {
                    if (!currentWorkspace.getBlockById(blocklyEvent.blockId)) {
                        if (constants.debugging) console.log(`Collab RX: Skipping visual .run() for ${blocklyEvent.type} on block ${blocklyEvent.blockId} - block not found in current workspace view.`);
                        canRunVisually = false;
                    }
                }

                if (canRunVisually) {
                    if (constants.debugging) console.log(`Collab RX: Applying standard event ${blocklyEvent.type} VISUALLY.`, item);
                    blocklyEvent.run(true); // Apply the event forward to the Blockly workspace.
                    // Refresh the toolbox if a procedure definition was created/modified or a block was deleted,
                    // as these can affect which blocks are available.
                    if (item?.event?.xml?.includes("procedures_definition") || item?.event?.newValue?.includes("argumentids") || blocklyEvent.type === "delete") {
                        console.log(`Collab RX: Refreshing toolbox`);
                        constants.mutableRefs.BlocklyInstance.getMainWorkspace().refreshToolboxSelection_();
                    }
                }
            } else if (constants.debugging) console.log(`Collab RX: Skipping visual application of standard event ${blocklyEvent.type} because remote target "${remoteTargetName}" is not the current view "${currentEditingTargetName}".`);

            // 2. Apply the event to the Scratch VM state.
            // This ensures the underlying data model is consistent, regardless of what's visually shown.
            if (target.blocks && typeof target.blocks.blocklyListen === 'function') {
                let canRunVmUpdate = true;
                // Optimization: For BLOCK_CREATE events, if the block already exists in the VM target's blocks, skip VM update.
                // This handles cases where `shareBlocksToTarget` already populated the VM.
                if (blocklyEvent.type === constants.mutableRefs.BlocklyInstance.Events.BLOCK_CREATE && blocklyEvent.blockId && target.blocks.getBlock(blocklyEvent.blockId)) {
                    if (constants.debugging) console.log(`Collab RX: Skipping VM .blocklyListen() for standard CREATE on block ${blocklyEvent.blockId} - block already exists in VM target "${target.getName()}".`);
                    canRunVmUpdate = false;
                }

                if (canRunVmUpdate) {
                    if (constants.debugging) console.log(`Collab RX: Updating VM state for Target="${target.getName()}" via blocklyListen for event type ${blocklyEvent.type}.`);
                    target.blocks.blocklyListen(blocklyEvent); // Apply the event to the VM's block manager.
                }
            } else {
                console.error(`Collab RX: Failed to update VM state for standard event type ${blocklyEvent?.type}. Target "${target?.getName()}" or its 'blocks.blocklyListen' method not found.`);
            }

        } catch (e) {
            console.error(`Collab RX: Error applying remote standard event type ${blocklyEvent?.type} (VM Target: ${target?.getName()}, Block ID: ${blocklyEvent?.blockId}):`, e, blocklyEvent);
        }
    }
    // --- Handle 'savedProject' event (benchmark marker) ---
    else if (item.type && item.type === "savedProject") {
        // This event type is used as a benchmark or marker for initial synchronization.
        // No functional action is required for this event.
    }
    // --- Handle unhandled custom event types ---
    else if (item.type && item.type !== constants.CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE) {
        // Log a warning for any recognized custom event types that do not have a dedicated handler.
        console.warn('Collab RX: Received unhandled custom event item type:', item.type, item);
    }
    // --- Handle malformed event items ---
    else if (!item.type && !item.event) {
        // Log a warning for any event item that does not conform to expected structures.
        console.warn('Collab RX: Received malformed event item with no type and no event field:', item);
    }
}