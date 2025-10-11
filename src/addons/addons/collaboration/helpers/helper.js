// helpers/helper.js

import * as yEventsHandler from './yEvents.js';
import * as yProjectEventsHandler from './yProjectEvents.js';
import * as collabUI from './collaboration-ui.js';

import * as constants from './constants.js';

/**
 * Converts a Uint8Array (binary data) to a Base64 encoded string.
 * This used for transmitting all binary assets over yjs (yjs messes up binary data transfer)
 * @param {Uint8Array} uint8Array - The Uint8Array to convert.
 * @returns {string|null} The Base64 encoded string, or null if input is invalid.
 */
export function convertUint8ArrayToBase64(uint8Array) {
    if (!uint8Array) return null;
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary); // `btoa` converts binary string to Base64.
}

/**
 * Converts a Base64 encoded string back into a Uint8Array (binary data).
 * This is the reverse operation of `convertUint8ArrayToBase64`.
 * @param {string} base64String - The Base64 string to decode.
 * @returns {Uint8Array|null} The decoded Uint8Array, or null if decoding fails.
 */
export function convertBase64ToUint8Array(base64String) {
    if (!base64String) return null;
    try {
        const binaryString = atob(base64String); // `atob` decodes Base64 to a binary string.
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error('Collab: Error decoding Base64 string', e, base64String);
        return null;
    }
}

/**
 * Creates a throttled version of a function.
 * When the throttled function is called, it will execute the original function
 * at most once within a specified `limit` time frame. Subsequent calls within
 * the limit are ignored.
 * @param {Function} func - The function to throttle.
 * @param {number} limit - The time limit (in milliseconds) during which the function can be called once.
 * @returns {Function} The throttled function.
 */
export function throttle(func, limit) {
    let inThrottle; // Flag to track if the function is currently in its throttling period.
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args); // Execute the original function.
            inThrottle = true; // Set the flag to true.
            // After the limit, reset the flag to allow the function to be called again.
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Retrieves the name of the currently active editing target (sprite or Stage) in the Scratch VM.
 * @returns {string|null} The name of the editing target, or null if it cannot be determined.
 */
export function getCurrentEditingTargetName() {
    try {
        return constants.mutableRefs.vm?.runtime?.getEditingTarget?.()?.getName?.() || null;
    } catch (e) {
        console.error('Collab: Error getting current editing target name:', e);
        return null;
    }
}

// --- Event Synchronization Queue Management ---

/**
 * An array that serves as a queue for event items received out of order or when the system
 * is not yet ready to process them. Items are stored with their type (yEvents or yProjectEvents).
 */
let itemsToProcess = [];

/**
 * Adds an event item to the processing queue. Items are inserted in chronological order based on their timestamp.
 * If an item lacks a valid timestamp, it is added to the end of the queue.
 * @param {object} item - The event item to add (e.g., a Blockly event JSON or a custom project event).
 * @param {'yEvents'|'yProjectEvents'} type - The type of event handler (`yEvents` for Blockly-related, `yProjectEvents` for project-level changes).
 */
export function addItemToProcess(item, type) {
    if (!item || !type) {
        console.warn('Collab: Invalid item or type to process');
        return;
    }
    if (!(type === 'yEvents' || type === 'yProjectEvents')) {
        console.warn('Collab: Invalid type for processing:', type);
        return;
    }

    const newItemWithMetadata = { item, type };
    const newItemTimestamp = item?.timestamp; // Attempt to get the timestamp of the new event.

    // If the new item has a valid numeric timestamp, insert it into the queue
    // in chronological order to maintain proper event sequence.
    if (typeof newItemTimestamp === 'number' && !isNaN(newItemTimestamp)) {
        let inserted = false;
        for (let i = 0; i < itemsToProcess.length; i++) {
            const existingItemTimestamp = itemsToProcess[i].item?.timestamp;
            // Insert before existing items that either lack a timestamp or have a later timestamp.
            if (typeof existingItemTimestamp !== 'number' || isNaN(existingItemTimestamp) || newItemTimestamp < existingItemTimestamp) {
                itemsToProcess.splice(i, 0, newItemWithMetadata); // Insert at this position.
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            // If the loop completes without insertion, the new item is the latest or the queue was empty,
            // so add it to the end.
            itemsToProcess.push(newItemWithMetadata);
        }
    } else {
        // If the new item does NOT have a valid timestamp, push it to the very end as a fallback.
        console.warn('Collab: Item does not have a valid timestamp, pushing to end:', newItemWithMetadata);
        itemsToProcess.push(newItemWithMetadata);
    }
}

/**
 * Processes all event items currently in the `itemsToProcess` queue.
 * This function disables Blockly events during processing to prevent feedback loops,
 * applies each event using the appropriate handler, clears the queue, and then
 * re-enables Blockly events. Includes error handling for critical sync failures.
 * @returns {Promise<void>} A promise that resolves when all items have been processed or an error occurs.
 */
export function processSyncItems() {
    console.log(`Collab RX: Processing ${itemsToProcess.length} event items from the queue.`, itemsToProcess);
    return new Promise(async resolve => {
        // Temporarily disable Blockly events to prevent local actions triggered by remote events
        // from generating new events that would then be re-broadcast.
        constants.mutableRefs.BlocklyInstance.Events.disable();
        let processingEvent = ''; // Stores the stringified current event for error reporting.

        try {
            // Iterate through each item in the queue and process it using the designated handler.
            for (var item of itemsToProcess) {
                const { item: eventItem, type } = item;
                if (!eventItem || !type) {
                    console.warn('Collab: Invalid item or type in processSyncItems queue; skipping.');
                    continue; // Skip to the next item if malformed.
                }
                try {
                    processingEvent = JSON.stringify(eventItem); // Attempt to stringify for error context.
                } catch (e) {
                    processingEvent = 'Failed to stringify eventItem';
                }

                // Call the appropriate event handler based on the item's type.
                if (type === 'yEvents') {
                    yEventsHandler.processSpecificEvent(eventItem);
                } else if (type === 'yProjectEvents') {
                    await yProjectEventsHandler.processSpecificEvent(eventItem); // Await async project event processing.
                } else {
                    console.warn('Collab: Unknown type in processSyncItems queue:', type);
                }
            }

            // --- Post-processing cleanup and state restoration ---
            processingEvent = 'clean up event 1';
            collabUI.ensureCollaborationLayerOnTop(); // Ensure the collaboration UI layer is correctly positioned.
            processingEvent = 'clean up event 2';
            itemsToProcess = []; // Clear the queue after successful processing.
            processingEvent = 'clean up event 3';
            constants.mutableRefs.BlocklyInstance.Events.enable(); // Re-enable Blockly events.
            processingEvent = 'clean up event 4';
            yEventsHandler.runNormally(); // Signal that yEvents handler can now process events normally (not queueing).
            processingEvent = 'clean up event 5';
            yProjectEventsHandler.runNormally(); // Signal that yProjectEvents handler can now process events normally.
            resolve(); // Resolve the promise indicating successful processing.

        } catch (error) {
            // --- Error Handling for Critical Sync Failure ---
            console.error('Collab: Fatal error during initial sync:', error, 'Processing Event:', processingEvent);

            // Create and display a user-facing error popup.
            const popup = document.createElement('div');
            popup.className = 'collab-popup';
            popup.innerHTML = `
                <div class="collab-popup-content">
                    <h2>A fatal error occurred while syncing your project with the other collaborators.</h2>
                    <p>Please copy the error details below and report it to @CodeTorch</p>
                    <button class="collab-popup-button" id="copyErrorDetails">Copy Error Details</button>
                </div>
            `;
            document.body.appendChild(popup);

            // Add functionality to copy error details to clipboard.
            const copyButton = document.getElementById('copyErrorDetails');
            copyButton.addEventListener('click', () => {
                const errorDetails = [
                    'Initial Sync Failure',
                    `Name: ${error.name || 'N/A'}`,
                    `Message: ${error.message || 'N/A'}`,
                    `Stack Trace:\n${error.stack || 'N/A'}`,
                    `Processing Event: ${processingEvent || 'N/A'}`
                ].join('\n\n'); // Format error details for readability.

                navigator.clipboard.writeText(errorDetails).then(() => {
                    alert('Error details copied to clipboard. Please report this to @CodeTorch.');
                }).catch((copyError) => {
                    console.error('Clipboard write failed:', copyError);
                    alert('Failed to copy error details. Please report this to @CodeTorch.');
                });
            });
            resolve(); // Still resolve the promise even on error, so the main flow can continue.
        }
    });
}

/**
 * Helper function to resolve the correct Scratch VM target (Stage or a Sprite)
 * based on the provided target name.
 * @param {string} remoteTargetName - The name of the target ('Stage' or a sprite name).
 * @returns {object|null} The Scratch VM target object, or null if not found.
 */
function getTargetForCommentEvent(remoteTargetName) {
    if (remoteTargetName === "Stage") {
        return constants.mutableRefs.vm.runtime.getTargetForStage();
    }
    return constants.mutableRefs.vm.runtime.getSpriteTargetByName(remoteTargetName);
}

/**
 * Handles the Blockly COMMENT_CREATE event received from a remote collaborator.
 * Creates a new comment in the Scratch VM's data model for the specified target.
 * @param {object} blocklyEvent - The Blockly event object containing comment details.
 * @param {string} remoteTargetName - The name of the target (Stage or Sprite) the comment belongs to.
 */
export function CommentCreate(blocklyEvent, remoteTargetName) {
    const target = getTargetForCommentEvent(remoteTargetName);
    if (!target) {
        console.error(`Collab RX: Skipping 'comment_create' event for target "${remoteTargetName}" because it does not exist in the current VM.`);
        return;
    }
    try {
        // Call the VM's internal method to create a comment with the provided properties.
        target.createComment(
            blocklyEvent.commentId,
            blocklyEvent.blockId, // Block ID if attached, null otherwise.
            blocklyEvent.text,
            blocklyEvent.xy.x,
            blocklyEvent.xy.y,
            blocklyEvent.width,
            blocklyEvent.height,
            blocklyEvent.minimized
        );
        if (constants.debugging) {
            console.log(`Collab RX: Created comment for 'comment_create' event on target "${remoteTargetName}":`, blocklyEvent);
        }
    } catch (e) {
        console.error(`Collab RX: Error creating comment for 'comment_create' event on target "${remoteTargetName}":`, e);
    }
}

/**
 * Handles the Blockly COMMENT_DELETE event received from a remote collaborator.
 * Deletes a comment and any associated block reference from the specified target's
 * data model in the Scratch VM.
 * @param {object} blocklyEvent - The Blockly event object containing the comment ID and optional block ID.
 * @param {string} remoteTargetName - The name of the target (Stage or Sprite) the comment belonged to.
 */
export function CommentDelete(blocklyEvent, remoteTargetName) {
    const target = getTargetForCommentEvent(remoteTargetName);
    if (!target) {
        console.error(`Collab RX: Skipping 'comment_delete' event for target "${remoteTargetName}" because it does not exist in the current VM.`);
        return;
    }

    const commentIdToDelete = blocklyEvent.commentId;
    const blockIdAssociated = blocklyEvent.blockId; // Block ID is present if the comment was attached to a block.

    // Check if the comment actually exists before attempting to delete.
    if (target.comments && target.comments[commentIdToDelete]) {
        try {
            // 1. Remove the comment object from the target's comments collection.
            delete target.comments[commentIdToDelete];
            if (constants.debugging) {
                console.log(`Collab RX: Deleted comment with ID "${commentIdToDelete}" from target "${remoteTargetName}".`);
            }

            // 2. If the comment was attached to a block, remove its reference from that block.
            if (blockIdAssociated) {
                const blockWithComment = target.blocks.getBlock(blockIdAssociated);
                if (blockWithComment && blockWithComment.comment === commentIdToDelete) {
                    blockWithComment.comment = null; // Clear the reference.
                    if (constants.debugging) {
                        console.log(`Collab RX: Removed comment reference from block "${blockIdAssociated}" on target "${remoteTargetName}".`);
                    }
                } else if (constants.debugging) {
                    console.log(`Collab RX: Block "${blockIdAssociated}" not found or comment reference already cleared for delete event.`);
                }
            }
        } catch (e) {
            console.error(`Collab RX: Error deleting comment with ID "${commentIdToDelete}" on target "${remoteTargetName}":`, e);
        }
    } else if (constants.debugging) {
        console.log(`Collab RX: Comment with ID "${commentIdToDelete}" not found on target "${remoteTargetName}" for deletion, might have been already deleted or not exist.`);
    }
}

/**
 * Handles the Blockly COMMENT_CHANGE event received from a remote collaborator.
 * Updates properties (e.g., text, size, minimized state) of an existing comment
 * on the specified target in the Scratch VM's data model.
 * @param {object} blocklyEvent - The Blockly event object containing the comment ID and new contents.
 * @param {string} remoteTargetName - The name of the target (Stage or Sprite) the comment belongs to.
 */
export function CommentChange(blocklyEvent, remoteTargetName) {
    const target = getTargetForCommentEvent(remoteTargetName);
    if (!target) {
        console.error(`Collab RX: Skipping 'comment_change' event for target "${remoteTargetName}" because it does not exist in the current VM.`);
        return;
    }
    // `newContents_` contains an object with properties that have changed (e.g., `{ text: "new text" }`).
    if (!blocklyEvent.newContents_) {
        console.error(`Collab RX: 'comment_change' event for target "${remoteTargetName}" is missing newContents. Cannot apply changes.`, blocklyEvent);
        return;
    }
    try {
        const newContentsKeys = Object.keys(blocklyEvent.newContents_);
        // Iterate through each changed property and update the comment in the VM.
        for (const key of newContentsKeys) {
            if (target.comments && target.comments[blocklyEvent.commentId]) {
                target.comments[blocklyEvent.commentId][key] = blocklyEvent.newContents_[key];
                if (constants.debugging) {
                    console.log(`Collab RX: Updated comment "${blocklyEvent.commentId}" property "${key}" to "${blocklyEvent.newContents_[key]}" on target "${remoteTargetName}".`);
                }
            } else {
                console.warn(`Collab RX: Cannot apply 'comment_change' event for comment "${blocklyEvent.commentId}" on target "${remoteTargetName}" as it does not exist.`);
                return; // Stop if the comment cannot be found.
            }
        }
    } catch (e) {
        console.error(`Collab RX: Error applying 'comment_change' event for target "${remoteTargetName}":`, e);
    }
}

/**
 * Handles the Blockly COMMENT_MOVE event received from a remote collaborator.
 * Updates the X and Y coordinates of an existing comment on the specified target
 * in the Scratch VM's data model.
 * @param {object} blocklyEvent - The Blockly event object containing the comment ID and new coordinates.
 * @param {string} remoteTargetName - The name of the target (Stage or Sprite) the comment belongs to.
 */
export function CommentMove(blocklyEvent, remoteTargetName) {
    const target = getTargetForCommentEvent(remoteTargetName);
    if (!target) {
        console.error(`Collab RX: Skipping 'comment_move' event for target "${remoteTargetName}" because it does not exist in the current VM.`);
        return;
    }
    const comment = target.comments[blocklyEvent.commentId];
    if (!comment) {
        console.error(`Collab RX: 'comment_move' event for target "${remoteTargetName}" references a comment that does not exist:`, blocklyEvent.commentId);
        return;
    }
    const coordinates = blocklyEvent.newCoordinate_;
    if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number') {
        console.error(`Collab RX: 'comment_move' event for target "${remoteTargetName}" has invalid coordinates:`, coordinates);
        return;
    }
    try {
        comment.x = coordinates.x;
        comment.y = coordinates.y;
        if (constants.debugging) {
            console.log(`Collab RX: Moved comment with ID "${blocklyEvent.commentId}" to new coordinates (${comment.x}, ${comment.y}) on target "${remoteTargetName}".`);
        }
    } catch (e) {
        console.error(`Collab RX: Error moving comment with ID "${blocklyEvent.commentId}" on target "${remoteTargetName}":`, e, blocklyEvent);
    }
}

export function findCircularDependency(blocksObject, targetName) {
    const blockIds = Object.keys(blocksObject);
    const visitedGlobally = new Set(); // To avoid re-checking branches we know are safe.

    for (const startId of blockIds) {
        if (visitedGlobally.has(startId)) continue; // Already checked this node and its descendants.

        const visitedInPath = new Set(); // Tracks nodes for the CURRENT traversal path.
        const currentPath = []; // Tracks the actual block IDs in the path.

        function traverse(blockId) {
            if (!blockId) return null; // End of a chain, no cycle.

            // Cycle detected!
            if (visitedInPath.has(blockId)) {
                // Find the start of the cycle in the current path and return the cycle loop.
                const cycleStartIndex = currentPath.indexOf(blockId);
                const cyclePath = [...currentPath.slice(cycleStartIndex), blockId];
                console.error(`Collab Validation: Circular dependency detected in target "${targetName}"! Path: ${cyclePath.join(' -> ')}`);
                return {
                    hasCycle: true,
                    path: cyclePath,
                    targetName: targetName
                };
            }
            if (!blocksObject[blockId]) {
                // This block is referenced but doesn't exist. Data integrity issue, but not a cycle.
                return null;
            }

            visitedInPath.add(blockId);
            currentPath.push(blockId);

            const block = blocksObject[blockId];

            // Recurse through 'next'
            let cycleResult = traverse(block.next);
            if (cycleResult) return cycleResult;

            // Recurse through all 'inputs'
            if (block.inputs) {
                for (const inputName in block.inputs) {
                    const input = block.inputs[inputName];
                    // The input is an array, e.g., [1, 'shadow-id'], [2, 'block-id'], [3, 'block-id', 'shadow-id']
                    // The actual connected block is the second element (index 1).
                    if (input && Array.isArray(input) && input.length > 1 && input[1]) {
                        cycleResult = traverse(input[1]);
                        if (cycleResult) {
                            return cycleResult;
                        }
                    }
                }
            }

            visitedInPath.delete(blockId); // Backtrack: remove from current path.
            currentPath.pop();
            visitedGlobally.add(blockId); // Mark this node as fully explored and safe.
            return null; // No cycle found from this path.
        }

        const result = traverse(startId);
        if (result && result.hasCycle) {
            // Found a cycle, no need to check other blocks.
            return result;
        }
    }
    return {
        hasCycle: false
    }; // No cycles found in any block.
}
