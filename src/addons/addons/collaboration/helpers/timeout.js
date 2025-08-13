// helpers/timeout.js

import * as constants from './constants.js';
import * as assetSync from './assetSync.js';

/**
 * A flag to ensure that user activity listeners are attached only once.
 */
let attachedListeners = false;

// --- Inactivity Timer Management ---

/**
 * Handles actions to be taken when the first inactivity threshold (Timer X) is reached.
 * This involves marking the user as inactive and releasing any held asset locks.
 */
export async function handleInactivityX() {
    if (constants.debugging) console.log('Collab: Inactivity X threshold reached.');

    // Only proceed if the user is not already marked as inactive by this timer.
    if (!constants.localUserInfo.isInactive) {
        constants.localUserInfo.isInactive = true; // Mark the local user as inactive.
        // Update the Yjs Awareness state to broadcast this user's inactivity to other collaborators.
        constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('isInactive', true);
        if (constants.debugging) console.log('Collab: User marked as inactive.');

        // Release any asset editing locks held by the inactive user.
        // This allows other collaborators to edit costumes or sounds.
        await assetSync.clearLocalEditingCostume();
        await assetSync.clearLocalEditingSound();

        // If the user is currently in the costume/sound editor tabs, force them back to the code tab (tab index 0).
        if (constants.localUserInfo.activeTabIndex !== 0) {
            // Update the Yjs Awareness state immediately to reflect the tab change.
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('activeTabIndex', 0);

            // If running within an environment that supports Redux actions (e.g., Scratch GUI addon),
            // dispatch an action to programmatically switch the active tab.
            if (typeof addon !== 'undefined' && addon?.tab?.redux?.dispatch) {
                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/navigation/ACTIVATE_TAB',
                    activeTabIndex: 0
                });
                if (constants.debugging) console.log('Collab: Dispatched ACTIVATE_TAB (0) due to inactivity X.');
                // The `constants.localUserInfo.activeTabIndex` will be updated automatically
                // by a Redux state change listener elsewhere in the system.
            } else {
                // Fallback: if Redux dispatch is not available, manually update the local tab index.
                constants.localUserInfo.activeTabIndex = 0;
                console.warn('Collab: Redux dispatch not available for ACTIVATE_TAB on inactivity X. Manually set local tab index.');
            }
        }
    }
    // Timer Y (the longer inactivity timer) continues to run.
    // Clear Timer X as its threshold has been reached and actions have been taken.
    if (constants.mutableRefs.inactivityTimerX) clearTimeout(constants.mutableRefs.inactivityTimerX);
    constants.mutableRefs.inactivityTimerX = null;
}

/**
 * Handles actions to be taken when the second, longer inactivity threshold (Timer Y) is reached.
 * This typically triggers a cleanup function, if one is registered.
 */
function handleInactivityY() {
    if (constants.debugging) console.log('Collab: Inactivity Y threshold reached. Cleaning up.');

    // If a cleanup function has been registered, execute it.
    if (constants.mutableRefs.currentCleanupFunction) {
        constants.mutableRefs.currentCleanupFunction();
        // Clear the reference to prevent multiple calls if the cleanup process is slow.
        constants.mutableRefs.currentCleanupFunction = null;
    }
    // Ensure all inactivity timers are stopped after the cleanup attempt.
    clearInactivityTimers();
}

/**
 * Clears and stops all currently running inactivity timers.
 */
export function clearInactivityTimers() {
    if (constants.mutableRefs.inactivityTimerX) clearTimeout(constants.mutableRefs.inactivityTimerX);
    if (constants.mutableRefs.inactivityTimerY) clearTimeout(constants.mutableRefs.inactivityTimerY);
    constants.mutableRefs.inactivityTimerX = null;
    constants.mutableRefs.inactivityTimerY = null;
    // Uncomment for detailed debugging: if (constants.debugging) console.log("Collab: Inactivity timers cleared.");
}

/**
 * Resets the inactivity timers. This function is called on any user activity.
 * It clears existing timers and restarts them. If the user was marked inactive,
 * it marks them as active again. It also attaches global activity listeners once.
 */
export function resetInactivityTimers() {
    // Stop any currently running timers.
    clearInactivityTimers();

    // Only start new timers if the Yjs provider is connected and synced.
    // This prevents timers from starting prematurely if collaboration is not fully established.
    if (constants.mutableRefs.yjsAwarenessInstance && constants.mutableRefs.provider) {
        // Start Timer X (shorter threshold) and Timer Y (longer threshold).
        constants.mutableRefs.inactivityTimerX = setTimeout(handleInactivityX, constants.INACTIVITY_THRESHOLD_X_MS);
        constants.mutableRefs.inactivityTimerY = setTimeout(handleInactivityY, constants.INACTIVITY_THRESHOLD_Y_MS);
        // Uncomment for detailed debugging: if (constants.debugging) console.log("Collab: Inactivity timers reset and started.");

        // If the user was previously marked inactive, mark them as active now.
        if (constants.localUserInfo.isInactive) {
            constants.localUserInfo.isInactive = false;
            // Update Yjs Awareness to broadcast the user's active status.
            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('isInactive', false);
            if (constants.debugging) console.log("Collab: User active, 'isInactive' set to false in awareness.");
            // UI updates for user icons based on activity will be triggered by this awareness change.
        }
    } else if (constants.debugging) {
        console.log('Collab: Not resetting inactivity timers, Yjs provider not fully ready or available.');
    }

    // Attach global event listeners to detect user activity and reset timers.
    // This block ensures listeners are attached only once.
    if (!attachedListeners) {
        document.addEventListener('mousemove', resetInactivityTimers);
        document.addEventListener('keydown', resetInactivityTimers);
        document.addEventListener('mousedown', resetInactivityTimers);
        document.addEventListener('touchstart', resetInactivityTimers);
        document.addEventListener('wheel', resetInactivityTimers);
        document.addEventListener('scroll', resetInactivityTimers);
        document.addEventListener('pointerdown', resetInactivityTimers);
        document.addEventListener('pointerup', resetInactivityTimers);
        document.addEventListener('pointermove', resetInactivityTimers);
        attachedListeners = true; // Set flag to true to prevent re-attaching listeners.
    }
}