import * as constants from './constants.js';
import * as collabUI from './collaboration-ui.js';
import * as assetSync from './assetSync.js';
import * as helper from './helper.js';

/**
 * Flag indicating whether project events can be processed immediately or if they should be queued.
 * This is set to true after initial project syncing is complete.
 */
let canFinallyRunEvents = false;

/**
 * Sets up an observer for remote project events received via Yjs.
 * This observer is responsible for applying remote changes to the local Scratch VM.
 */
export async function setupYProjectEventsObserver() {
    // Observe changes to the Y.Array (constants.mutableRefs.yProjectEvents) that stores project events.
    constants.mutableRefs.yProjectEvents.observe(event => {
        // Ignore events originating from the local client to prevent infinite loops or redundant processing.
        if (event.transaction.origin === constants.LOCAL_EVENT_SYNC_ORIGIN) return;

        // Ensure the Scratch VM and its runtime are initialized before processing events.
        if (!constants.mutableRefs.vm || !constants.mutableRefs.vm.runtime) {
            console.warn('Collab RX (constants.mutableRefs.yProjectEvents): vm or vm runtime not ready. Skipping project event processing.');
            return;
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
                console.warn('Collab RX (constants.mutableRefs.yProjectEvents): Received unexpected item structure in yProjectEvents change:', item);
            }
        });

        // If no event items were received, there's nothing to process.
        if (allReceivedEventItemsInBatch.length === 0) return;

        let itemsToProcess = allReceivedEventItemsInBatch;

        // --- Logic for optimizing initial sync based on 'savedProject' events ---
        // This optimization helps ensure that during the initial project load,
        // if a 'savedProject' event is present in the first batch, we only
        // process events from that save point onwards. This avoids applying
        // old, potentially conflicting, granular events if a full project state was saved later.
        if (!constants.mutableRefs.hasProcessedInitialProjectEvents) {
            let lastSaveProjectIndexInBatch = -1;
            // Iterate backwards through the current batch to find the last 'savedProject' event.
            for (let i = allReceivedEventItemsInBatch.length - 1; i >= 0; i--) {
                if (allReceivedEventItemsInBatch[i] && allReceivedEventItemsInBatch[i].type === 'savedProject') {
                    lastSaveProjectIndexInBatch = i;
                    break;
                }
            }

            if (lastSaveProjectIndexInBatch !== -1) {
                // If a 'savedProject' event is found, only process events from that index onwards.
                itemsToProcess = allReceivedEventItemsInBatch.slice(lastSaveProjectIndexInBatch);
                if (constants.debugging) {
                    console.log(`Collab RX (constants.mutableRefs.yProjectEvents): Initial event batch. Found 'savedProject'. Processing ${itemsToProcess.length} of ${allReceivedEventItemsInBatch.length} items from this batch, starting from the save event.`);
                }
            } else {
                // If no 'savedProject' event is found in this specific initial batch, process all items.
                if (constants.debugging) {
                    console.log(`Collab RX (constants.mutableRefs.yProjectEvents): Initial event batch. No 'savedProject' found in this specific batch. Processing all ${allReceivedEventItemsInBatch.length} items from this batch.`);
                }
            }
            // Mark that the initial processing logic has been applied.
            // Subsequent event batches (delta updates) will bypass this optimization block.
            constants.mutableRefs.hasProcessedInitialProjectEvents = true;
        }
        // --- End of optimization logic ---

        // Log the number of events being processed, indicating if filtering occurred.
        if (constants.debugging && itemsToProcess !== allReceivedEventItemsInBatch) {
            console.log(`Collab RX (constants.mutableRefs.yProjectEvents): Filtered to process ${itemsToProcess.length} events.`);
        } else if (constants.debugging) {
            console.log(`Collab RX (constants.mutableRefs.yProjectEvents): Received ${itemsToProcess.length} remote project event items to process.`);
        }

        try {
            // Process each event item: either immediately or add to a queue.
            itemsToProcess.forEach(item => {
                if (canFinallyRunEvents) {
                    // If the system is ready, process the event directly.
                    processSpecificEvent(item);
                } else {
                    // Otherwise, queue the event for later processing.
                    addEventToQueue(item);
                }
            });
        } finally {
            // Ensure the collaboration UI layer remains on top after processing events.
            collabUI.ensureCollaborationLayerOnTop();
        }
    });
}

/**
 * Adds a project event item to a queue for deferred processing.
 * This is used when the system is not yet ready to apply events directly (e.g., during initial VM load).
 * @param {object} item - The project event item to queue.
 */
function addEventToQueue(item) {
    helper.addItemToProcess(item, 'yProjectEvents'); // Utilizes a helper to manage the queue.
}

/**
 * Sets the `canFinallyRunEvents` flag to true, allowing immediate processing of subsequent events
 * and triggering the processing of any events currently in the queue.
 */
export function runNormally() {
    canFinallyRunEvents = true; // Enables immediate event processing.
}

/**
 * Processes a single remote project event, applying the corresponding change to the Scratch VM.
 * This function handles various types of project modifications like sprite additions, costume edits, etc.
 * @param {object} item - The project event item to process.
 */
export async function processSpecificEvent(item) {
    // Emit a 'projectChanged' event on the VM runtime to notify other parts of the system
    // that a change has occurred, which can trigger UI updates.
    constants.mutableRefs.vm.runtime.emitProjectChanged();

    // Validate the event item to ensure it has a type.
    if (!item || !item.type) {
        console.warn('Collab RX (constants.mutableRefs.yProjectEvents): Received null, undefined, or typeless project event item. Skipping.', item);
        return;
    }

    // --- Handle different types of remote project events ---

    // Handles the addition of a new sprite.
    if (item.type === constants.CUSTOM_REMOTE_SPRITE_ADDED_CALL_TYPE) {
        if (!item.data || typeof item.data.spriteJson === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_ADDED_CALL_TYPE}]: Missing or invalid spriteJson in data:`, item);
            return;
        }
        let spriteJson = item.data.spriteJson;
        let type = item.data.type; // Indicates if spriteJson is JS object or binary (.sprite3)
        if (type === "JS") {
            spriteJson = JSON.parse(spriteJson); // Parse the JSON string into a JS object.
        } else {
            spriteJson = helper.convertBase64ToUint8Array(spriteJson); // Convert base64 string to Uint8Array for binary assets.
        }
        try {
            // Call `addSprite` on the VM. The second argument `false` prevents the VM from re-emitting
            // the event locally, as it originated remotely.
            const newTargetId = await constants.mutableRefs.vm.addSprite(spriteJson, false);
            if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_ADDED_CALL_TYPE}]: constants.mutableRefs.vm.addSprite promise resolved. New target ID: ${newTargetId}.`);
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_ADDED_CALL_TYPE}]: Error during constants.mutableRefs.vm.addSprite:`, e, spriteJson);
        }
        return; // Event handled.
    }
    // Handles the renaming of a sprite.
    else if (item.type === constants.CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.spriteName === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, spriteName } = item.data; // targetId here refers to the sprite's *old name*.
        if (!targetId || !spriteName) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE}]: Missing targetId or spriteName in data:`, item);
            return;
        }
        // Map the old sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping rename.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE}]: Attempting to rename target ID "${actualTargetId}" to "${spriteName}".`);
        try {
            // Call `renameSprite` on the VM. `false` prevents local re-emission.
            constants.mutableRefs.vm.renameSprite(actualTargetId, spriteName, false);
            // Refresh the workspace to update any blocks that might reference the old sprite name.
            constants.mutableRefs.vm.refreshWorkspace();
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE}]: Error during rename:`, e, item);
        }
    }
    // Handles the deletion of a sprite.
    else if (item.type === constants.CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId } = item.data; // targetId here refers to the sprite's *name*.
        if (!targetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE}]: Missing targetId in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping delete.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE}]: Attempting to delete target ID "${actualTargetId}".`);
        try {
            // Call `deleteSprite` on the VM. `false` prevents local re-emission.
            constants.mutableRefs.vm.deleteSprite(actualTargetId, false);
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE}]: Error during delete:`, e, item);
        }
    }
    // Handles the renaming of a costume.
    else if (item.type === constants.CUSTOM_REMOTE_COSTUME_RENAME_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.costumeIndex === 'undefined' || typeof item.data.newName === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_RENAME_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, costumeIndex, newName } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof costumeIndex === 'undefined' || typeof newName === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_RENAME_CALL_TYPE}]: Missing targetId, costumeIndex or newName in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        try {
            // Get the target object and call `renameCostume`. This is synchronous.
            constants.mutableRefs.vm.runtime.getTargetById(actualTargetId).renameCostume(costumeIndex, newName);
            // If the renamed costume belongs to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
                constants.mutableRefs.vm.refreshWorkspace();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_RENAME_CALL_TYPE}]: Error during rename:`, e, item);
        }
    }
    // Handles the deletion of a costume.
    else if (item.type === constants.CUSTOM_REMOTE_COSTUME_DELETE_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.costumeIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_DELETE_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, costumeIndex } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof costumeIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_DELETE_CALL_TYPE}]: Missing targetId or costumeIndex in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        try {
            // Get the target object and call `deleteCostume`. This is synchronous.
            constants.mutableRefs.vm.runtime.getTargetById(actualTargetId).deleteCostume(costumeIndex);
            // If the deleted costume belonged to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_DELETE_CALL_TYPE}]: Error during delete:`, e, item);
        }
    }
    // Handles the reordering of costumes.
    else if (item.type === constants.CUSTOM_REMOTE_COSTUME_REORDER_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.costumeIndex === 'undefined' || typeof item.data.newIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_REORDER_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, costumeIndex, newIndex } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof costumeIndex === 'undefined' || typeof newIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_REORDER_CALL_TYPE}]: Missing targetId, costumeIndex or newIndex in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        try {
            // Get the target object and call `reorderCostume`. This is synchronous.
            constants.mutableRefs.vm.runtime.getTargetById(actualTargetId).reorderCostume(costumeIndex, newIndex);
            // If the reordered costume belongs to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_REORDER_CALL_TYPE}]: Error during reorder:`, e, item);
        }
    }
    // Handles the duplication of a costume.
    else if (item.type === constants.CUSTOM_REMOTE_COSTUME_DUPLICATE_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.costumeIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_DUPLICATE_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, costumeIndex } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof costumeIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_DUPLICATE_CALL_TYPE}]: Missing targetId or costumeIndex in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        try {
            // Await the promise returned by `duplicateCostume`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.duplicateCostume(costumeIndex, constants.mutableRefs.vm.runtime.getTargetById(actualTargetId), false);
            // If the duplicated costume belongs to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_DUPLICATE_CALL_TYPE}]: Error during duplicate:`, e, item);
        }
    }
    // Handles the addition of a new costume.
    else if (item.type === constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, md5ext, costumeObject, optVersion } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE}]: Missing targetId in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping costume addition.`);
            return;
        }

        const costumeDataFinal = costumeObject;
        // If the costume asset data is present, convert it from base64 to Uint8Array.
        if (typeof costumeObject?.asset?.data !== 'undefined') {
            costumeObject.asset.data = helper.convertBase64ToUint8Array(costumeObject.asset.data);
            if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE}]: Converted base64 to Uint8Array for costumeObject.asset.data.`);
            // Reconstruct the Scratch-Vm Asset object.
            costumeDataFinal.asset = new constants.mutableRefs.vm.runtime.storage.Asset(costumeObject?.asset?.assetType, costumeObject?.asset?.assetId, costumeObject?.asset?.dataFormat, costumeObject?.asset?.data, true);
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE}]: Attempting to add costume to target ID "${actualTargetId}".`);
        try {
            // Await the promise returned by `addCostume`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.addCostume(md5ext, costumeDataFinal, actualTargetId, optVersion, false);
            // If the costume is added to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE}]: Error during costume addition:`, e, item);
        }
    }
    // Handles the loading of an extension.
    else if (item.type === constants.CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE) {
        if (!item.data) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { extensionURL } = item.data;
        if (typeof extensionURL === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE}]: Missing extensionURL in data:`, item);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE}]: Attempting to load extension from URL "${extensionURL}".`);
        try {
            // Await the promise returned by `loadExtensionURL`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.extensionManager.loadExtensionURL(extensionURL, false);
            if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE}]: Extension loaded successfully.`);
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE}]: Error loading extension:`, e, item);
        }
    }
    // Handles sharing a costume from one sprite to another.
    else if (item.type === constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.costumeIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, costumeIndex, editingTargetId } = item.data; // targetId and editingTargetId here refer to sprite *names*.
        if (typeof targetId === 'undefined' || typeof costumeIndex === 'undefined' || typeof editingTargetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE}]: Missing targetId or costumeIndex in data:`, item);
            return;
        }
        // Map source sprite name (targetId) to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping costume share.`);
            return;
        }
        // Map destination sprite name (editingTargetId) to its VM target object.
        let actualEditingTarget = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === editingTargetId) {
                actualEditingTarget = target;
                break;
            }
        }
        if (!actualEditingTarget) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE}]: Target ID "${editingTargetId}" not found in constants.mutableRefs.vm. Skipping costume share.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE}]: Attempting to share costume index "${costumeIndex}" from target ID "${actualTargetId}" to "${actualEditingTarget.id}".`);
        try {
            // Await the promise returned by `shareCostumeToTarget`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.shareCostumeToTarget(costumeIndex, actualTargetId, actualEditingTarget, false);
            // If the costume is shared to or from the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE}]: Error during share:`, e, item);
        }
    }
    // Handles updates to costume image data (e.g., from paint editor changes).
    else if (item.type === 'costumeEdited') {
        if (!item.data) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [costumeEdited]: Missing data in item:`, item);
            return;
        }
        // Destructure all expected data fields including bitmapResolution.
        const { targetName, costumeIndex, rotationCenterX, rotationCenterY, costumeAssetDataB64, isBitmap, dataFormat, bitmapResolution } = item.data;

        // Validate all required fields are present.
        if (typeof targetName === 'undefined' || typeof costumeIndex === 'undefined' ||
            typeof rotationCenterX === 'undefined' || typeof rotationCenterY === 'undefined' ||
            typeof costumeAssetDataB64 === 'undefined' || typeof isBitmap === 'undefined' ||
            typeof dataFormat === 'undefined' || typeof bitmapResolution === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [costumeEdited]: Missing required fields in data:`, item.data);
            return;
        }

        // Map the sprite name (targetName) to its internal VM ID.
        let actualTargetId = null;
        for (const t of constants.mutableRefs.vm.runtime.targets) {
            if (t.getName() === targetName) {
                actualTargetId = t.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [costumeEdited]: Target ID for name "${targetName}" not found in constants.mutableRefs.vm. Skipping costume edit.`);
            return;
        }
        // Get the VM target object.
        const vmTarget = constants.mutableRefs.vm.runtime.getTargetById(actualTargetId);
        if (!vmTarget) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [costumeEdited]: constants.mutableRefs.vm Target object for ID "${actualTargetId}" not found. Skipping costume edit.`);
            return;
        }

        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [costumeEdited]: Attempting to edit costume index "${costumeIndex}" for target "${targetName}" (ID: "${actualTargetId}"). DataFormat: ${dataFormat}, Resolution: ${bitmapResolution}`);

        try {
            // Call `updateCostumeImageProgrammatically` from `assetSync` to apply the image data change.
            await assetSync.updateCostumeImageProgrammatically(
                vmTarget,
                costumeIndex,
                costumeAssetDataB64,
                isBitmap,
                dataFormat,
                rotationCenterX,
                rotationCenterY,
                bitmapResolution
            );
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [costumeEdited]: Error calling assetSync.updateCostumeImageProgrammatically:`, e, item);
        }
    }
    // Handles the addition of a new sound.
    else if (item.type === constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, soundObject } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof soundObject === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE}]: Missing targetId or soundObject in item:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sound addition.`);
            return;
        }

        const soundDataFinal = soundObject;
        // If the sound asset data is present, convert it from base64 to Uint8Array.
        if (typeof soundObject?.asset?.data !== 'undefined') {
            soundObject.asset.data = helper.convertBase64ToUint8Array(soundObject.asset.data);
            if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE}]: Converted base64 to Uint8Array for soundObject.asset.data.`);
            // Reconstruct the Scratch-Vm Asset object.
            soundDataFinal.asset = new constants.mutableRefs.vm.runtime.storage.Asset(soundObject?.asset?.assetType, soundObject?.asset?.assetId, soundObject?.asset?.dataFormat, soundObject?.asset?.data, true);
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE}]: Attempting to add sound to target ID "${actualTargetId}".`);
        try {
            // Await the promise returned by `addSound`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.addSound(soundDataFinal, actualTargetId, false);
            // If the sound is added to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE}]: Error during sound addition:`, e, item);
        }
    }
    // Handles the renaming of a sound.
    else if (item.type === constants.CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.soundIndex === 'undefined' || typeof item.data.newName === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, soundIndex, newName } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof soundIndex === 'undefined' || typeof newName === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE}]: Missing targetId, soundIndex or newName in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sound rename.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE}]: Attempting to rename sound index "${soundIndex}" to "${newName}" for target ID "${actualTargetId}".`);
        try {
            // Get the target object and call `renameSound`. This is synchronous.
            constants.mutableRefs.vm.runtime.getTargetById(actualTargetId).renameSound(soundIndex, newName);
            // If the renamed sound belongs to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
                constants.mutableRefs.vm.refreshWorkspace();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE}]: Error during sound rename:`, e, item);
        }
    }
    // Handles the deletion of a sound.
    else if (item.type === constants.CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.soundIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, soundIndex } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof soundIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE}]: Missing targetId or soundIndex in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sound delete.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE}]: Attempting to delete sound index "${soundIndex}" for target ID "${actualTargetId}".`);
        try {
            // Get the target object and call `deleteSound`. This is synchronous.
            constants.mutableRefs.vm.runtime.getTargetById(actualTargetId).deleteSound(soundIndex);
            // If the deleted sound belonged to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE}]: Error during sound delete:`, e, item);
        }
    }
    // Handles the reordering of sounds.
    else if (item.type === constants.CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.soundIndex === 'undefined' || typeof item.data.newIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, soundIndex, newIndex } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof soundIndex === 'undefined' || typeof newIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE}]: Missing targetId, soundIndex or newIndex in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sound reorder.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE}]: Attempting to reorder sound index "${soundIndex}" to "${newIndex}" for target ID "${actualTargetId}".`);
        try {
            // Get the target object and call `reorderSound`. This is synchronous.
            constants.mutableRefs.vm.runtime.getTargetById(actualTargetId).reorderSound(soundIndex, newIndex);
            // If the reordered sound belongs to the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE}]: Error during sound reorder:`, e, item);
        }
    }
    // Handles the duplication of a sound.
    else if (item.type === constants.CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.soundIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, soundIndex } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined' || typeof soundIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE}]: Missing targetId or soundIndex in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sound duplicate.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE}]: Attempting to duplicate sound index "${soundIndex}" for target ID "${actualTargetId}".`);
        try {
            // Await the promise returned by `duplicateSound`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.duplicateSound(soundIndex, constants.mutableRefs.vm.runtime.getTargetById(actualTargetId), false);
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE}]: Error during sound duplicate:`, e, item);
        }
    }
    // Handles sharing a sound from one sprite to another.
    else if (item.type === constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined' || typeof item.data.soundIndex === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId, soundIndex, editingTargetId } = item.data; // targetId and editingTargetId here refer to sprite *names*.
        if (typeof targetId === 'undefined' || typeof soundIndex === 'undefined' || typeof editingTargetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE}]: Missing targetId or soundIndex in data:`, item);
            return;
        }
        // Map source sprite name (targetId) to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sound share.`);
            return;
        }
        // Map destination sprite name (editingTargetId) to its VM target object.
        let actualEditingTarget = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === editingTargetId) {
                actualEditingTarget = target;
                break;
            }
        }
        if (!actualEditingTarget) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE}]: Target ID "${editingTargetId}" not found in constants.mutableRefs.vm. Skipping sound share.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE}]: Attempting to share sound index "${soundIndex}" from target ID "${actualTargetId}" to "${actualEditingTarget.id}".`);
        try {
            // Await the promise returned by `shareSoundToTarget`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.shareSoundToTarget(soundIndex, actualTargetId, actualEditingTarget, false);
            // If the sound is shared to or from the currently edited target, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE}]: Error during share:`, e, item);
        }
    }
    // Handles updates to sound data (e.g., from sound editor changes).
    else if (item.type === 'soundEdited') {
        if (!item.data) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [soundEdited]: Missing data in item:`, item);
            return;
        }
        const { targetName, soundIndex, soundAssetDataB64, dataFormat } = item.data;

        // Validate all required fields are present.
        if (typeof targetName === 'undefined' || typeof soundIndex === 'undefined' ||
            typeof soundAssetDataB64 === 'undefined' || typeof dataFormat === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [soundEdited]: Missing required fields in data:`, item.data);
            return;
        }

        // Map the sprite name (targetName) to its internal VM ID.
        let actualTargetId = null;
        for (const t of constants.mutableRefs.vm.runtime.targets) {
            if (t.getName() === targetName) {
                actualTargetId = t.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [soundEdited]: Target ID for name "${targetName}" not found in constants.mutableRefs.vm. Skipping sound edit.`);
            return;
        }
        // Get the VM target object.
        const vmTarget = constants.mutableRefs.vm.runtime.getTargetById(actualTargetId);
        if (!vmTarget) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [soundEdited]: constants.mutableRefs.vm Target object for ID "${actualTargetId}" not found. Skipping sound edit.`);
            return;
        }

        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [soundEdited]: Attempting to edit sound index "${soundIndex}" for target "${targetName}" (ID: "${actualTargetId}"). DataFormat: ${dataFormat}`);

        try {
            // Call `updateSoundProgrammatically` from `assetSync` to apply the sound data change.
            await assetSync.updateSoundProgrammatically(
                vmTarget,
                soundIndex,
                soundAssetDataB64,
                dataFormat
            );
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [soundEdited]: Error calling assetSync.updateSoundProgrammatically:`, e, item);
        }
    }
    // Handles the duplication of a sprite.
    else if (item.type === constants.CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE) {
        if (!item.data || typeof item.data.targetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { targetId } = item.data; // targetId here refers to the sprite's *name*.
        if (typeof targetId === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE}]: Missing targetId in data:`, item);
            return;
        }
        // Map the sprite name (targetId) back to its internal VM ID.
        let actualTargetId = null;
        for (const target of constants.mutableRefs.vm.runtime.targets) {
            if (target.getName() === targetId) {
                actualTargetId = target.id;
                break;
            }
        }
        if (!actualTargetId) {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE}]: Target ID "${targetId}" not found in constants.mutableRefs.vm. Skipping sprite duplicate.`);
            return;
        }
        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE}]: Attempting to duplicate sprite with ID "${actualTargetId}".`);
        try {
            // Await the promise returned by `duplicateSprite`. `false` prevents local re-emission.
            await constants.mutableRefs.vm.duplicateSprite(actualTargetId, false);
            // If the duplicated sprite was the currently edited one, emit updates to refresh the UI.
            if (actualTargetId === constants.mutableRefs.vm.runtime.getEditingTarget().id) {
                constants.mutableRefs.vm.emitTargetsUpdate();
            }
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE}]: Error during sprite duplicate:`, e, item);
        }
    }
    // Handles the addition of a new backdrop.
    else if (item.type === constants.CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE) {
        if (!item.data || typeof item.data.md5ext === 'undefined' || typeof item.data.backdropObject === 'undefined') {
            console.warn(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE}]: Missing or invalid data in item:`, item);
            return;
        }
        const { md5ext, backdropObject } = item.data;

        const backdropDataFinal = backdropObject;
        // If the backdrop asset data is present, convert it from base64 to Uint8Array.
        if (typeof backdropObject?.asset?.data !== 'undefined') {
            backdropObject.asset.data = helper.convertBase64ToUint8Array(backdropObject.asset.data);
            if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE}]: Converted base64 to Uint8Array for backdropObject.asset.data.`);
            // Reconstruct the Scratch-Vm Asset object.
            backdropDataFinal.asset = new constants.mutableRefs.vm.runtime.storage.Asset(
                backdropObject?.asset?.assetType,
                backdropObject?.asset?.assetId,
                backdropObject?.asset?.dataFormat,
                backdropObject?.asset?.data,
                true // Generate MD5 hash for the asset.
            );
        }

        if (constants.debugging) console.log(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE}]: Attempting to add backdrop.`);
        try {
            // Call `addBackdrop` on the VM. `false` prevents local re-emission.
            await constants.mutableRefs.vm.addBackdrop(md5ext, backdropDataFinal, false);
            // The `addBackdrop` method typically emits `runtime.emitProjectChanged()` internally,
            // which in turn calls `vm.emitTargetsUpdate()`, so no explicit emitTargetsUpdate is needed here.
        } catch (e) {
            console.error(`Collab RX (constants.mutableRefs.yProjectEvents) [${constants.CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE}]: Error during backdrop addition:`, e, item);
        }
    }
    // This event type is used for initial sync optimization and does not require active processing.
    else if (item.type === 'savedProject') {
        // No action needed; this event serves as a marker for initial project load.
    }
    // Log a warning for any unhandled project event types.
    else {
        console.warn(`Collab RX (constants.mutableRefs.yProjectEvents): Received unhandled project event type: ${item.type}`, item);
    }
}