// helpers/assetSync.js

import * as constants from './constants.js';
import * as helper from './helper.js'; 

// --- Helper functions for managing local sound editing state ---

/**
 * Sets the local user's current sound editing state and initiates a sync.
 * This is called when the user selects a sound to edit in the sound editor.
 * @param {string} targetName - The name of the target (sprite or Stage) the sound belongs to.
 * @param {number} soundIndex - The index of the sound within the target's sound list.
 */
export async function setLocalEditingSound(targetName, soundIndex) {
    // Ensure VM and Yjs Awareness are ready.
    if (!constants.mutableRefs.vm || !constants.mutableRefs.yjsAwarenessInstance) {
        console.warn('Collab: Cannot set local editing sound, VM or awareness not ready.');
        return;
    }

    // Resolve the target object from its name.
    const target = targetName === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);
    if (!target) {
        console.warn(`Collab: setLocalEditingSound - Target "${targetName}" not found. Clearing editing state.`);
        await clearLocalEditingSound(); // Clear state if target is invalid.
        return;
    }

    const sounds = target.getSounds();
    // Validate the sound index.
    if (soundIndex < 0 || soundIndex >= sounds.length) {
        console.warn(`Collab: setLocalEditingSound - Invalid sound index ${soundIndex} for target "${targetName}". Max index: ${sounds.length - 1}. Clearing editing state.`);
        await clearLocalEditingSound(); // Clear state if index is invalid.
        return;
    }
    const sound = sounds[soundIndex];
    // Validate sound asset data exists.
    if (!sound || !sound.asset || !sound.asset.data) {
        console.warn(`Collab: setLocalEditingSound - Sound asset data not found for "${targetName}"[${soundIndex}]. Cannot initialize editing state. Clearing editing state.`);
        await clearLocalEditingSound();
        return;
    }

    // Create the new editing info object.
    const newEditingInfo = {
        targetName,
        soundIndex,
        // Preserve the last sent hash if the same sound is being re-edited, otherwise reset.
        lastSentDataHash: constants.localUserInfo.editingSoundInfo?.targetName === targetName && constants.localUserInfo.editingSoundInfo?.soundIndex === soundIndex ?
            constants.localUserInfo.editingSoundInfo.lastSentDataHash :
            null
    };

    // Compare stringified versions of old and new editing info to detect actual change.
    const oldEditingInfoString = JSON.stringify(constants.localUserInfo.editingSoundInfo ? { t: constants.localUserInfo.editingSoundInfo.targetName, i: constants.localUserInfo.editingSoundInfo.soundIndex } : null);
    const newEditingInfoString = JSON.stringify({ t: newEditingInfo.targetName, i: newEditingInfo.soundIndex });

    if (oldEditingInfoString !== newEditingInfoString) {
        // If the editing context has changed, clear the old one first (which includes a final sync).
        if (constants.localUserInfo.editingSoundInfo) {
            await clearLocalEditingSound();
        }
        constants.localUserInfo.editingSoundInfo = newEditingInfo; // Update local state.
        // Broadcast the new editing context via Yjs Awareness.
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingSoundInfo', { targetName, soundIndex });
        if (constants.debugging) console.log(`Collab: Set local editing sound: Target "${targetName}", Index ${soundIndex}. Initializing hash.`);
    } else {
        // If it's the same sound, just ensure the local state is updated (e.g., if only `lastSentDataHash` needs refresh).
        constants.localUserInfo.editingSoundInfo = newEditingInfo;
    }

    // Immediately sync the current sound data for the newly selected sound.
    await syncCurrentSoundData();
    // Attach a debounced change listener to monitor further edits in the sound editor.
    attachDebouncedSoundEditorChangeListener();
}

/**
 * Clears the local user's current sound editing state and performs a final sync.
 * This is called when the user navigates away from the sound editor or becomes inactive.
 */
export async function clearLocalEditingSound() {
    if (!constants.mutableRefs.yjsAwarenessInstance) {
        return;
    }

    // Detach the sound editor change listener to prevent further syncs after clearing.
    detachDebouncedSoundEditorChangeListener();

    if (constants.localUserInfo.editingSoundInfo !== null) {
        const infoToClear = constants.localUserInfo.editingSoundInfo; // Capture info before clearing.
        await syncCurrentSoundData(true); // Perform a final sync to ensure latest changes are broadcast.

        // Log what was cleared.
        const clearedTargetName = infoToClear.targetName;
        const clearedSoundIndex = infoToClear.soundIndex;
        if (constants.debugging) console.log(`Collab: Cleared local editing sound state. Target: "${clearedTargetName}", Index: ${clearedSoundIndex}`);

        constants.localUserInfo.editingSoundInfo = null; // Clear local editing state.
        // Broadcast that the user is no longer editing a sound via Yjs Awareness.
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingSoundInfo', null);
    }
}

/**
 * Gathers and formats the necessary data for a 'soundEdited' event.
 * @param {string} targetName - The name of the target (sprite or Stage).
 * @param {number} soundIndex - The index of the sound.
 * @returns {object|null} An object containing the event type and data, or null if data is invalid.
 */
function getSoundEditedEventData(targetName, soundIndex) {
    if (!constants.mutableRefs.vm) return null;
    const target = targetName === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);
    if (!target) {
        console.warn(`Collab Sync: Target "${targetName}" not found while preparing soundEdited event.`);
        return null;
    }
    const sounds = target.getSounds();
    if (soundIndex < 0 || soundIndex >= sounds.length) {
        console.warn(`Collab Sync: Invalid sound index ${soundIndex} for target "${targetName}". Max index: ${sounds.length - 1}`);
        return null;
    }
    const sound = sounds[soundIndex];
    if (!sound || !sound.asset || !sound.asset.data) {
        console.warn(`Collab Sync: Sound or sound asset data not found for target "${targetName}", index ${soundIndex}.`);
        return null;
    }

    return {
        type: 'soundEdited',
        data: {
            targetName: targetName,
            soundIndex: soundIndex,
            // Convert binary sound data to Base64 for transmission.
            soundAssetDataB64: helper.convertUint8ArrayToBase64(sound.asset.data),
            dataFormat: sound.asset.dataFormat // e.g., 'wav', 'mp3'
        }
    };
}

/**
 * Synchronizes the current sound data with other collaborators if it has changed.
 * This function hashes the current sound data and compares it to the last sent hash.
 * @param {boolean} [isFinalSync=false] - True if this is a final sync before clearing editing state.
 */
export async function syncCurrentSoundData(isFinalSync = false) {
    if (!constants.mutableRefs.ydoc || !constants.mutableRefs.yProjectEvents) {
        return; // Yjs document and event array must be available.
    }

    const editingInfoForThisSync = constants.localUserInfo.editingSoundInfo;
    if (!editingInfoForThisSync) {
        if (constants.debugging) console.log('Collab Sync: No local sound editing info available to sync.');
        return;
    }

    // Destructure properties from the captured editing info.
    const { targetName, soundIndex } = editingInfoForThisSync;
    const lastSentDataHashFromCapture = editingInfoForThisSync.lastSentDataHash;

    const target = targetName === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);
    if (!target) {
        if (constants.debugging) console.warn(`Collab Sync: Target "${targetName}" not found for sound data sync.`);
        return;
    }
    const targetSounds = target.getSounds();
    if (soundIndex < 0 || soundIndex >= targetSounds.length) {
        if (constants.debugging) console.warn(`Collab Sync: Invalid sound index ${soundIndex} for target "${targetName}". Max index: ${targetSounds.length - 1}`);
        return;
    }
    const soundToSync = targetSounds[soundIndex];
    if (!soundToSync || !soundToSync.asset || !soundToSync.asset.data) {
        if (constants.debugging) console.warn(`Collab Sync: Sound asset data not found for target "${targetName}", index ${soundIndex}.`);
        return;
    }

    // Generate a SHA-256 hash of the current sound data.
    const currentDataHash = await digestMessage(soundToSync.asset.data);

    if (currentDataHash === null) {
        console.error('Collab Sync: Failed to hash current sound data. Skipping sync.');
        return;
    }

    // Compare the current hash with the last sent hash. If different, or if it's a final sync, proceed.
    if (currentDataHash !== lastSentDataHashFromCapture || isFinalSync) {
        if (currentDataHash === lastSentDataHashFromCapture && !isFinalSync) {
            // If hashes are the same and it's not a final sync, no need to push.
            if (constants.debugging) console.log(`Collab Sync: Sound data for "${targetName}"[${soundIndex}] hash (${currentDataHash}) unchanged (compared to captured ${lastSentDataHashFromCapture}). No push needed.`);
            return;
        }

        const projectEventData = getSoundEditedEventData(targetName, soundIndex); // Get formatted event data.

        if (projectEventData) {
            // Use a Yjs transaction to push the event.
            constants.mutableRefs.ydoc.transact(() => {
                projectEventData.timestamp = Date.now(); // Add a timestamp for chronological ordering.
                constants.mutableRefs.yProjectEvents.push([projectEventData]);

                // CRITICAL CHECK: Only update `lastSentDataHash` if `constants.localUserInfo.editingSoundInfo`
                // still points to the same sound that this sync operation was initiated for.
                // This prevents updating the hash for a different sound if the user switched quickly.
                if (constants.localUserInfo.editingSoundInfo &&
                    constants.localUserInfo.editingSoundInfo.targetName === targetName &&
                    constants.localUserInfo.editingSoundInfo.soundIndex === soundIndex) {

                    constants.localUserInfo.editingSoundInfo.lastSentDataHash = currentDataHash;
                    if (constants.debugging) console.log(`Collab Sync [soundEdited${isFinalSync ? ' Final' : ''}]: Pushed event. New hash: ${currentDataHash} for "${targetName}[${soundIndex}]"`);
                } else if (constants.debugging) console.log(`Collab Sync [soundEdited${isFinalSync ? ' Final' : ''}]: Pushed event for "${targetName}[${soundIndex}]" (Hash: ${currentDataHash}), but local editing state changed/nulled. Not updating its lastSentDataHash.`);
            }, constants.LOCAL_EVENT_SYNC_ORIGIN); // Mark as local origin to prevent self-echoing.
        }
    } else if (constants.debugging) console.log(`Collab Sync: Sound data hash for "${targetName}"[${soundIndex}] (${currentDataHash}) is same as captured last sent (${lastSentDataHashFromCapture}). Skipping push.`);
}

// --- Helper functions for managing local costume editing state ---

/**
 * Sets the local user's current costume editing state and initiates a sync.
 * This is called when the user selects a costume to edit in the paint editor.
 * @param {string} targetName - The name of the target (sprite or Stage) the costume belongs to.
 * @param {number} costumeIndex - The index of the costume within the target's costume list.
 */
export async function setLocalEditingCostume(targetName, costumeIndex) {
    // Ensure VM and Yjs Awareness are ready.
    if (!constants.mutableRefs.vm || !constants.mutableRefs.yjsAwarenessInstance) {
        console.warn('Collab: Cannot set local editing costume, VM or awareness not ready.');
        return;
    }

    // Resolve the target object from its name.
    const target = targetName === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);
    if (!target) {
        console.warn(`Collab: setLocalEditingCostume - Target "${targetName}" not found. Clearing editing state.`);
        await clearLocalEditingCostume();
        return;
    }
    const costumes = target.getCostumes();
    // Validate the costume index.
    if (costumeIndex < 0 || costumeIndex >= costumes.length) {
        console.warn(`Collab: setLocalEditingCostume - Invalid costume index ${costumeIndex} for target "${targetName}". Max index: ${costumes.length - 1}. Clearing editing state.`);
        await clearLocalEditingCostume();
        return;
    }
    const costume = costumes[costumeIndex];
    // Validate costume asset data exists.
    if (!costume || !costume.asset || !costume.asset.data) {
        console.warn(`Collab: setLocalEditingCostume - Costume asset data not found for "${targetName}"[${costumeIndex}]. Cannot initialize editing state. Clearing editing state.`);
        await clearLocalEditingCostume();
        return;
    }

    // Create the new editing info object.
    const newEditingInfo = {
        targetName,
        costumeIndex,
        // Preserve the last sent hash if the same costume is being re-edited, otherwise reset.
        lastSentDataHash: constants.localUserInfo.editingCostumeInfo?.targetName === targetName && constants.localUserInfo.editingCostumeInfo?.costumeIndex === costumeIndex ?
            constants.localUserInfo.editingCostumeInfo.lastSentDataHash :
            null
    };

    // Compare stringified versions of old and new editing info to detect actual change.
    const oldEditingInfoString = JSON.stringify(constants.localUserInfo.editingCostumeInfo ? { t: constants.localUserInfo.editingCostumeInfo.targetName, i: constants.localUserInfo.editingCostumeInfo.costumeIndex } : null);
    const newEditingInfoString = JSON.stringify({ t: newEditingInfo.targetName, i: newEditingInfo.costumeIndex });

    if (oldEditingInfoString !== newEditingInfoString) {
        // If the editing context has changed, clear the old one first (includes final sync).
        if (constants.localUserInfo.editingCostumeInfo) {
            await clearLocalEditingCostume();
        }

        constants.localUserInfo.editingCostumeInfo = newEditingInfo; // Update local state.
        // Broadcast the new editing context via Yjs Awareness.
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingCostumeInfo', { targetName, costumeIndex });
        if (constants.debugging) console.log(`Collab: Set local editing costume: Target "${targetName}", Index ${costumeIndex}. Initializing hash.`);
    } else {
        // If it's the same costume, ensure the local state is updated.
        constants.localUserInfo.editingCostumeInfo = newEditingInfo;
    }

    // Immediately sync the current costume data for the newly selected costume.
    await syncCurrentCostumeData();
    // Attach a debounced change listener to monitor further edits in the paint editor.
    attachDebouncedCostumeEditorChangeListener();
}

/**
 * Clears the local user's current costume editing state and performs a final sync.
 * This is called when the user navigates away from the paint editor or becomes inactive.
 */
export async function clearLocalEditingCostume() {
    if (!constants.mutableRefs.yjsAwarenessInstance) {
        return;
    }

    // Detach the costume editor change listener.
    detachDebouncedCostumeEditorChangeListener();

    if (constants.localUserInfo.editingCostumeInfo !== null) {
        const infoToClear = constants.localUserInfo.editingCostumeInfo; // Capture info before clearing.

        await syncCurrentCostumeData(true); // Perform a final sync.

        // Log what was cleared.
        const clearedTargetName = infoToClear.targetName;
        const clearedCostumeIndex = infoToClear.costumeIndex;
        if (constants.debugging) console.log(`Collab: Cleared local editing costume state. Target: "${clearedTargetName}", Index: ${clearedCostumeIndex}`);

        constants.localUserInfo.editingCostumeInfo = null; // Clear local editing state.
        // Broadcast that the user is no longer editing a costume via Yjs Awareness.
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('editingCostumeInfo', null);
    }
}

/**
 * Gathers and formats the necessary data for a 'costumeEdited' event.
 * @param {string} targetName - The name of the target (sprite or Stage).
 * @param {number} costumeIndex - The index of the costume.
 * @returns {object|null} An object containing the event type and data, or null if data is invalid.
 */
function getCostumeEditedEventData(targetName, costumeIndex) {
    if (!constants.mutableRefs.vm) return null;
    const target = targetName === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);
    if (!target) {
        console.warn(`Collab Sync: Target "${targetName}" not found while preparing costumeEdited event.`);
        return null;
    }
    const costumes = target.getCostumes();
    if (costumeIndex < 0 || costumeIndex >= costumes.length) {
        console.warn(`Collab Sync: Invalid costume index ${costumeIndex} for target "${targetName}". Max index: ${costumes.length - 1}`);
        return null;
    }
    const costume = costumes[costumeIndex];
    if (!costume || !costume.asset) {
        console.warn(`Collab Sync: Costume or costume asset not found for target "${targetName}", index ${costumeIndex}.`);
        return null;
    }

    return {
        type: 'costumeEdited',
        data: {
            targetName: targetName,
            costumeIndex: costumeIndex,
            rotationCenterX: costume.rotationCenterX,
            rotationCenterY: costume.rotationCenterY,
            // Convert binary costume data to Base64 for transmission.
            costumeAssetDataB64: helper.convertUint8ArrayToBase64(costume.asset.data),
            isBitmap: !(costume.dataFormat === 'svg'), // Determine if it's a bitmap (not SVG).
            dataFormat: costume.dataFormat,
            bitmapResolution: costume.bitmapResolution || 1 // Include bitmap resolution if applicable.
        }
    };
}

/**
 * Synchronizes the current costume data with other collaborators if it has changed.
 * This function hashes the current costume data and compares it to the last sent hash.
 * @param {boolean} [isFinalSync=false] - True if this is a final sync before clearing editing state.
 */
export async function syncCurrentCostumeData(isFinalSync = false) {
    if (!constants.mutableRefs.ydoc || !constants.mutableRefs.yProjectEvents) {
        return; // Yjs document and event array must be available.
    }

    const editingInfoForThisSync = constants.localUserInfo.editingCostumeInfo;
    if (!editingInfoForThisSync) {
        if (constants.debugging) console.log('Collab Sync: No local costume editing info available to sync.');
        return;
    }

    // Destructure properties from the captured editing info.
    const { targetName, costumeIndex } = editingInfoForThisSync;
    const lastSentDataHashFromCapture = editingInfoForThisSync.lastSentDataHash;

    const target = targetName === 'Stage' ? constants.mutableRefs.vm.runtime.getTargetForStage() : constants.mutableRefs.vm.runtime.getSpriteTargetByName(targetName);
    if (!target) {
        if (constants.debugging) console.warn(`Collab Sync: Target "${targetName}" not found for costume data sync.`);
        return;
    }
    const targetCostumes = target.getCostumes();
    if (costumeIndex < 0 || costumeIndex >= targetCostumes.length) {
        if (constants.debugging) console.warn(`Collab Sync: Invalid costume index ${costumeIndex} for target "${targetName}". Max index: ${targetCostumes.length - 1}`);
        return;
    }
    const costumeToSync = targetCostumes[costumeIndex];
    if (!costumeToSync || !costumeToSync.asset || !costumeToSync.asset.data) {
        if (constants.debugging) console.warn(`Collab Sync: Costume asset data not found for target "${targetName}", index ${costumeIndex}.`);
        return;
    }

    // Generate a SHA-256 hash of the current costume data.
    const currentDataHash = await digestMessage(costumeToSync.asset.data);

    if (currentDataHash === null) {
        console.error('Collab Sync: Failed to hash current costume data. Skipping sync.');
        return;
    }

    // Compare the current hash with the last sent hash. If different, or if it's a final sync, proceed.
    if (currentDataHash !== lastSentDataHashFromCapture || isFinalSync) {
        if (currentDataHash === lastSentDataHashFromCapture && !isFinalSync) {
            // If hashes are the same and it's not a final sync, no need to push.
            if (constants.debugging) console.log(`Collab Sync: Costume data for "${targetName}"[${costumeIndex}] hash (${currentDataHash}) unchanged (compared to captured ${lastSentDataHashFromCapture}). No push needed.`);
            return;
        }

        const projectEventData = getCostumeEditedEventData(targetName, costumeIndex); // Get formatted event data.

        if (projectEventData) {
            // Use a Yjs transaction to push the event.
            constants.mutableRefs.ydoc.transact(() => {
                projectEventData.timestamp = Date.now(); // Add a timestamp for chronological ordering.
                constants.mutableRefs.yProjectEvents.push([projectEventData]);

                // CRITICAL CHECK: Only update `lastSentDataHash` if `constants.localUserInfo.editingCostumeInfo`
                // still points to the same costume that this sync operation was initiated for.
                if (constants.localUserInfo.editingCostumeInfo &&
                    constants.localUserInfo.editingCostumeInfo.targetName === targetName &&
                    constants.localUserInfo.editingCostumeInfo.costumeIndex === costumeIndex) {

                    constants.localUserInfo.editingCostumeInfo.lastSentDataHash = currentDataHash;
                    if (constants.debugging) console.log(`Collab Sync [costumeEdited${isFinalSync ? ' Final' : ''}]: Pushed event. New hash: ${currentDataHash} for "${targetName}[${costumeIndex}]"`);
                } else {
                    // If `constants.localUserInfo.editingCostumeInfo` has changed (e.g., to null or another costume),
                    // we've pushed the data for the original costume, but we DO NOT update its hash in `constants.localUserInfo`.
                    if (constants.debugging) console.log(`Collab Sync [costumeEdited${isFinalSync ? ' Final' : ''}]: Pushed event for "${targetName}[${costumeIndex}]" (Hash: ${currentDataHash}), but local editing state changed/nulled. Not updating its lastSentDataHash.`);
                }
            }, constants.LOCAL_EVENT_SYNC_ORIGIN); // Mark as local origin to prevent self-echoing.
        }
    } else if (constants.debugging) console.log(`Collab Sync: Costume data hash for "${targetName}"[${costumeIndex}] (${currentDataHash}) is same as captured last sent (${lastSentDataHashFromCapture}). Skipping push.`);
}

/**
 * Generates a SHA-256 hash of a given ArrayBuffer.
 * This is used to detect changes in binary asset data (costumes, sounds).
 * @param {ArrayBuffer} messageBuffer - The binary data to hash.
 * @returns {Promise<string|null>} A promise that resolves to the SHA-256 hash as a hex string, or null on error.
 */
async function digestMessage(messageBuffer) {
    if (!messageBuffer || messageBuffer.byteLength === 0) return 'empty'; // Handle empty data case.
    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', messageBuffer); // Use Web Cryptography API.
        const hashArray = Array.from(new Uint8Array(hashBuffer)); // Convert ArrayBuffer to Array of bytes.
        // Convert bytes to hex string.
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        console.error('Collab: Error digesting message for hashing', error);
        return null; // Indicate failure.
    }
}

/**
 * Creates a debounced version of a function.
 * The debounced function will only execute after a specified `wait` time
 * has passed without any further calls. This is useful for handling
 * rapidly firing events (like drawing actions) by only reacting when
 * the user has "finished" their current action.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * The debounced handler for costume editor changes. It will trigger `syncCurrentCostumeData`.
 */
const handleCostumeEditorChange = async () => {
    if (constants.debugging) console.log('Collab: Debounced costume editor change detected, attempting sync.');
    if (constants.localUserInfo.editingCostumeInfo) {
        await syncCurrentCostumeData();
    }
};

/**
 * Attaches a debounced change listener to the Paint Editor's canvas.
 * This listener detects when the user finishes a drawing action (on `pointerup`)
 * and then triggers a synchronized update of the costume data.
 */
export function attachDebouncedCostumeEditorChangeListener() {
    if (!constants.mutableRefs.debouncedSyncCostume) {
        // Initialize the debounced function if it hasn't been already.
        constants.mutableRefs.debouncedSyncCostume = debounce(handleCostumeEditorChange, 1500); // Sync 1.5 seconds after last pointerup.
    }

    detachDebouncedCostumeEditorChangeListener(); // Ensure no multiple listeners are attached.

    // Find the Paint Editor canvas element.
    const paintEditorCanvas = document.querySelector(constants.PAINT_EDITOR_CANVAS_SELECTOR);
    if (paintEditorCanvas) {
        constants.mutableRefs.currentPaintEditorCanvas = paintEditorCanvas;
        // Attach the debounced listener to the `pointerup` event on the canvas.
        constants.mutableRefs.currentPaintEditorCanvas.addEventListener('pointerup', constants.mutableRefs.debouncedSyncCostume);
        if (constants.debugging) console.log('Collab: Attached debounced listener to paint editor canvas.');
    } else if (constants.debugging) console.warn('Collab: Could not find paint editor canvas to attach listener.');
}

/**
 * Detaches the debounced change listener from the Paint Editor's canvas.
 * This is called when the user navigates away from the costume editor.
 */
export function detachDebouncedCostumeEditorChangeListener() {
    if (constants.mutableRefs.currentPaintEditorCanvas && constants.mutableRefs.debouncedSyncCostume) {
        constants.mutableRefs.currentPaintEditorCanvas.removeEventListener('pointerup', constants.mutableRefs.debouncedSyncCostume);
        if (constants.debugging) console.log('Collab: Detached debounced listener from paint editor canvas.');
    }
    constants.mutableRefs.currentPaintEditorCanvas = null; // Clear the reference to the canvas.
}

/**
 * The debounced handler for sound editor changes. It will trigger `syncCurrentSoundData`.
 */
const handleSoundEditorChange = async () => {
    if (constants.debugging) console.log('Collab: Debounced sound editor change detected, attempting sync.');
    if (constants.localUserInfo.editingSoundInfo) {
        await syncCurrentSoundData();
    }
};

/**
 * Attaches a debounced change listener to the Sound Editor's interaction area.
 * This listener detects user clicks (as a heuristic for interaction) and triggers
 * a synchronized update of the sound data after a delay.
 */
export function attachDebouncedSoundEditorChangeListener() {
    if (!constants.mutableRefs.debouncedSyncSoundData) {
        // Initialize the debounced function.
        constants.mutableRefs.debouncedSyncSoundData = debounce(handleSoundEditorChange, 2000); // Sync 2 seconds after last interaction.
    }

    detachDebouncedSoundEditorChangeListener(); // Ensure no multiple listeners.

    // Find the Sound Editor interaction area.
    const soundEditorArea = document.querySelector(constants.SOUND_EDITOR_INTERACTION_AREA_SELECTOR);
    if (soundEditorArea) {
        constants.mutableRefs.currentSoundEditorArea = soundEditorArea;
        // Attach the debounced listener to the `click` event in the capture phase.
        constants.mutableRefs.currentSoundEditorArea.addEventListener('click', constants.mutableRefs.debouncedSyncSoundData, true);
        if (constants.debugging) console.log('Collab: Attached debounced listener to sound editor area.');
    } else if (constants.debugging) console.warn('Collab: Could not find sound editor area to attach listener.');
}

/**
 * Detaches the debounced change listener from the Sound Editor's interaction area.
 * This is called when the user navigates away from the sound editor.
 */
export function detachDebouncedSoundEditorChangeListener() {
    if (constants.mutableRefs.currentSoundEditorArea && constants.mutableRefs.debouncedSyncSoundData) {
        constants.mutableRefs.currentSoundEditorArea.removeEventListener('click', constants.mutableRefs.debouncedSyncSoundData, true);
        if (constants.debugging) console.log('Collab: Detached debounced listener from sound editor area.');
    }
    constants.mutableRefs.currentSoundEditorArea = null; // Clear the reference.
}

/**
 * Programmatically updates a sound's audio buffer and associated metadata within the Scratch VM.
 * This function is used to apply remote sound editor changes.
 * @param {object} target - The Scratch VM target object (sprite or Stage).
 * @param {number} soundIndex - The index of the sound to update within the target's sound list.
 * @param {string} soundAssetDataB64 - The Base64 encoded string of the new sound asset data.
 * @param {string} dataFormat - The format of the audio data (e.g., 'wav', 'mp3').
 */
export async function updateSoundProgrammatically(target, soundIndex, soundAssetDataB64, dataFormat) {
    if (!target || !target.sprite || !target.sprite.sounds || !target.sprite.sounds[soundIndex]) {
        console.error(`Collab RX [soundEdited]: Target "${target?.getName()}" or sound at index ${soundIndex} not found.`);
        return;
    }

    const soundToUpdate = target.sprite.sounds[soundIndex];

    if (typeof soundAssetDataB64 !== 'string') {
        console.error(`Collab RX [soundEdited]: Expected Base64 string for sound data for target "${target.getName()}", sound ${soundIndex}, got:`, typeof soundAssetDataB64);
        return;
    }

    const uint8ArrayData = helper.convertBase64ToUint8Array(soundAssetDataB64);
    if (!uint8ArrayData) {
        console.error(`Collab RX [soundEdited]: Failed to convert Base64 to Uint8Array for sound data. Target: "${target.getName()}", sound: ${soundIndex}`);
        return;
    }

    try {
        // Decode the Uint8Array audio data into an AudioBuffer using the Web Audio API.
        // `slice(0)` is used to create a new ArrayBuffer from the underlying `uint8Array.buffer`
        // to ensure compatibility with `decodeAudioData` which consumes the buffer.
        const audioBuffer = await constants.mutableRefs.vm.runtime.audioEngine.audioContext.decodeAudioData(uint8ArrayData.buffer.slice(0));

        if (constants.debugging) console.log(`Collab RX [soundEdited]: AudioBuffer decoded. Calling vm.updateSoundBuffer for sound ${soundIndex} on target "${target.getName()}".`);

        // Call the VM method to update the sound's asset, data format, sample rate, and other metadata.
        constants.mutableRefs.vm.updateSoundBuffer(soundIndex, audioBuffer, dataFormat, target);

        // If the updated sound belongs to the currently editing target, trigger UI refreshes.
        if (target.id === constants.mutableRefs.vm.runtime.getEditingTarget()?.id) {
            constants.mutableRefs.vm.emitTargetsUpdate(); // Update sprite selector and other related UI.
            constants.mutableRefs.vm.runtime.requestRedraw(); // Request a redraw of the stage.
        }

        // Attempt to force a refresh of the sound editor UI if it's currently open for this sound.
        const soundEditor = document.querySelector(constants.SOUND_EDITOR_INTERACTION_AREA_SELECTOR);
        if (soundEditor && constants.mutableRefs.vm.editingTarget && constants.mutableRefs.vm.editingTarget.id === target.id) {
            const redux = window.ReduxStore; // Assuming Redux store is globally accessible.
            // Check if the sound editor is open and the currently edited sound matches the one being updated.
            if (redux && redux.getState().scratchGui.soundEditor.soundIndex === soundIndex) {
                if (constants.debugging) console.log(`Collab RX [soundEdited]: Attempting to refresh sound editor UI for target ${target.getName()}, sound ${soundIndex}`);
                // Currently, a direct Redux dispatch to force re-render might be needed,
                // or rely on a more granular VM event if Scratch GUI supports it.
            }
        }
    } catch (e) {
        console.error(`Collab RX [soundEdited]: Error decoding audio data or updating sound buffer for target "${target.getName()}", sound ${soundIndex}:`, e);
        console.error('Data format was:', dataFormat, 'Base64 snippet:', soundAssetDataB64.substring(0, 100));
    }
}

/**
 * Programmatically updates a costume's image data (bitmap or SVG) within the Scratch VM.
 * This function is used to apply remote paint editor changes.
 * @param {object} target - The Scratch VM target object (sprite or Stage).
 * @param {number} costumeIndex - The index of the costume to update.
 * @param {string} assetDataB64 - The Base64 encoded string of the new costume asset data.
 * @param {boolean} isBitmap - True if the costume is a bitmap (PNG, JPEG), false if SVG.
 * @param {string} dataFormat - The format of the asset data (e.g., 'png', 'jpeg', 'svg').
 * @param {number} rotationCenterX - The X-coordinate of the costume's rotation center.
 * @param {number} rotationCenterY - The Y-coordinate of the costume's rotation center.
 * @param {number} bitmapResolution - The resolution of the bitmap (e.g., 1 for 1x, 2 for 2x).
 */
export async function updateCostumeImageProgrammatically(target, costumeIndex, assetDataB64, isBitmap, dataFormat, rotationCenterX, rotationCenterY, bitmapResolution) {
    if (!target || !target.sprite || !target.sprite.costumes_ || !target.sprite.costumes_[costumeIndex]) {
        console.error(`Collab [costumeEdited]: Target "${target?.getName()}" or costume at index ${costumeIndex} not found.`, target);
        return;
    }

    if (isBitmap) {
        // --- Bitmap Handling ---
        if (typeof assetDataB64 !== 'string') {
            console.error(`Collab [costumeEdited]: Expected Base64 string for bitmap data for target "${target.getName()}", costume ${costumeIndex}, got:`, typeof assetDataB64);
            if (assetDataB64 === null || assetDataB64 === '') {
                console.warn(`Collab [costumeEdited]: Bitmap data is empty for target "${target.getName()}", costume ${costumeIndex}. Attempting to update with empty image representation.`);
            } else {
                return;
            }
        }
        if (!dataFormat || dataFormat === 'svg') {
            console.error(`Collab [costumeEdited]: Invalid dataFormat "${dataFormat}" for bitmap on target "${target.getName()}", costume ${costumeIndex}.`);
            return;
        }

        const imageElement = new Image();
        imageElement.onload = () => {
            let imageDataToPass;
            const imgWidth = imageElement.naturalWidth;
            const imgHeight = imageElement.naturalHeight;

            // Handle cases where the loaded image might have zero dimensions or if `assetDataB64` was empty.
            if (imgWidth === 0 || imgHeight === 0 || assetDataB64 === null || assetDataB64 === '') {
                if (constants.debugging) console.warn(`Collab [costumeEdited]: Loaded image has zero dimensions (${imgWidth}x${imgHeight}) or asset data was empty for target "${target.getName()}", costume ${costumeIndex}. Creating 1x1 transparent ImageData as placeholder.`);
                // Create a minimal 1x1 transparent ImageData as a placeholder.
                const temp1x1Canvas = document.createElement('canvas');
                temp1x1Canvas.width = 1;
                temp1x1Canvas.height = 1;
                imageDataToPass = temp1x1Canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 1, 1);
            } else {
                // Draw the image onto a temporary canvas to get `ImageData`.
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = imgWidth;
                tempCanvas.height = imgHeight;
                const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tempCtx.drawImage(imageElement, 0, 0, imgWidth, imgHeight);
                try {
                    imageDataToPass = tempCtx.getImageData(0, 0, imgWidth, imgHeight);
                } catch (e) {
                    console.error(`Collab [costumeEdited]: Error getting ImageData for target "${target.getName()}", costume ${costumeIndex} (${imgWidth}x${imgHeight}):`, e);
                    return;
                }
            }

            if (constants.debugging) console.log(`Collab [costumeEdited]: ImageData prepared (${imageDataToPass.width}x${imageDataToPass.height}). Calling vm.updateBitmap with ImageData for costume ${costumeIndex} on target "${target.getName()}".`);

            // Call the VM method to update the bitmap costume.
            constants.mutableRefs.vm.updateBitmap(costumeIndex, imageDataToPass, rotationCenterX, rotationCenterY, bitmapResolution, target);

            // If the updated costume belongs to the currently editing target, trigger UI refreshes.
            if (target.id === constants.mutableRefs.vm.runtime.getEditingTarget()?.id) {
                constants.mutableRefs.vm.emitTargetsUpdate(); // Update sprite selector and other related UI.
                constants.mutableRefs.vm.runtime.requestRedraw(); // Request a redraw of the stage.
            }
        };
        imageElement.onerror = err => {
            console.error(`Collab [costumeEdited]: Error loading image from Base64 for target "${target.getName()}", costume ${costumeIndex}, format ${dataFormat}:`, err);
        };

        // Set the image source; for empty data, use a minimal transparent PNG.
        if (assetDataB64 === null || assetDataB64 === '') {
            imageElement.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            if (constants.debugging) console.log(`Collab [costumeEdited]: Using 1x1 transparent PNG for empty/null bitmap asset data for target "${target.getName()}", costume ${costumeIndex}.`);
        } else {
            imageElement.src = `data:image/${dataFormat};base64,${assetDataB64}`;
            if (constants.debugging) console.log(`Collab [costumeEdited]: Set image src to data URL (format: ${dataFormat}) for target "${target.getName()}", costume ${costumeIndex}. Waiting for onload.`);
        }

    } else {
        // --- SVG Handling ---
        let svgString;
        if (assetDataB64 === null || assetDataB64 === '') {
            // Provide a minimal empty SVG string for empty data.
            svgString = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1" height="1"></svg>';
            if (constants.debugging) console.log(`Collab [costumeEdited]: Using minimal empty SVG for empty SVG asset data for target "${target.getName()}", costume ${costumeIndex}.`);
        } else if (typeof assetDataB64 === 'string') {
            try {
                // Decode Base64 string to Uint8Array, then to text (SVG XML).
                const uint8Array = helper.convertBase64ToUint8Array(assetDataB64);
                if (!uint8Array) throw new Error('Base64 decoding to Uint8Array returned null');
                const textDecoder = new TextDecoder();
                svgString = textDecoder.decode(uint8Array);
            } catch (e) {
                console.error(`Collab [costumeEdited]: Error decoding Base64 SVG data for target "${target.getName()}", costume ${costumeIndex}:`, e);
                return;
            }
        } else {
            console.error(`Collab [costumeEdited]: Expected Base64 string for SVG data for target "${target.getName()}", costume ${costumeIndex}, got:`, typeof assetDataB64);
            return;
        }

        // Call the VM method to update the SVG costume.
        constants.mutableRefs.vm.updateSvg(costumeIndex, svgString, rotationCenterX, rotationCenterY, target);
        if (constants.debugging) console.log(`Collab [costumeEdited]: SVG costume ${costumeIndex} updated via vm.updateSvg on target "${target.getName()}".`);

        // If the updated costume belongs to the currently editing target, trigger UI refreshes.
        if (target.id === constants.mutableRefs.vm.runtime.getEditingTarget()?.id) {
            constants.mutableRefs.vm.emitTargetsUpdate();
            constants.mutableRefs.vm.runtime.requestRedraw();
        }
    }
}