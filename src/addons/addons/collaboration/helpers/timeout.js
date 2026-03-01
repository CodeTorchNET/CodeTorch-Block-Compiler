import * as constants from './constants.js';

let attachedListeners = false;

export async function handleInactivityX() {
    if (!constants.localUserInfo.isInactive) {
        constants.localUserInfo.isInactive = true;
        constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('isInactive', true);
        if (constants.localUserInfo.activeTabIndex !== 0) {
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('activeTabIndex', 0);

            if (typeof addon !== 'undefined' && addon?.tab?.redux?.dispatch) {
                constants.mutableRefs.addon.tab.redux.dispatch({
                    type: 'scratch-gui/navigation/ACTIVATE_TAB',
                    activeTabIndex: 0
                });
            } else {
                constants.localUserInfo.activeTabIndex = 0;
            }
        }
    }
    if (constants.mutableRefs.inactivityTimerX) clearTimeout(constants.mutableRefs.inactivityTimerX);
    constants.mutableRefs.inactivityTimerX = null;
}

function handleInactivityY() {
    if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
        constants.mutableRefs.addon.tab.redux.dispatch({
            type: 'scratch-gui/collaboration/SET_DISCONNECTED',
            payload: true
        });
    }
    if (constants.mutableRefs.currentCleanupFunction) {
        constants.mutableRefs.currentCleanupFunction();
        constants.mutableRefs.currentCleanupFunction = null;
    }
    clearInactivityTimers();
}

export function clearInactivityTimers() {
    if (constants.mutableRefs.inactivityTimerX) clearTimeout(constants.mutableRefs.inactivityTimerX);
    if (constants.mutableRefs.inactivityTimerY) clearTimeout(constants.mutableRefs.inactivityTimerY);
    constants.mutableRefs.inactivityTimerX = null;
    constants.mutableRefs.inactivityTimerY = null;
}

export function resetInactivityTimers() {
    clearInactivityTimers();

    if (constants.mutableRefs.yjsAwarenessInstance && constants.mutableRefs.provider) {
        constants.mutableRefs.inactivityTimerX = setTimeout(handleInactivityX, constants.INACTIVITY_THRESHOLD_X_MS);
        constants.mutableRefs.inactivityTimerY = setTimeout(handleInactivityY, constants.INACTIVITY_THRESHOLD_Y_MS);

        if (constants.localUserInfo.isInactive) {
            constants.localUserInfo.isInactive = false;
            constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('isInactive', false);
        }
    } 

    if (!attachedListeners) {
        const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel', 'scroll', 'pointerdown', 'pointerup', 'pointermove'];
        events.forEach(evt => document.addEventListener(evt, resetInactivityTimers));
        attachedListeners = true;
    }
}