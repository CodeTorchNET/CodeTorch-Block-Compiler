import * as constants from './constants.js';
import storage from '../../../../lib/storage.js';

const MIN_INTERVAL_MS = 10000;

let lastAttempt = 0;
let inFlight = null;

function projectId() {
    const state = constants.mutableRefs.addon?.tab?.redux?.state;
    return state?.scratchGui?.projectState?.projectId || null;
}

export async function refreshToken() {

    if (constants.devMode) return null;
    if (inFlight) return inFlight;

    const now = Date.now();
    if (now - lastAttempt < MIN_INTERVAL_MS) return null;
    lastAttempt = now;

    const id = projectId();
    if (!id) return null;

    inFlight = (async () => {
        try {
            const authToken = await storage.getProjectToken();
            const accessKey = storage.accessKey;
            const query = accessKey ? `?access_key=${encodeURIComponent(accessKey)}` : '';
            const response = await fetch(
                `${constants.apiHostURL}/v1/projects/blocks/${id}/collaboration-token${query}`,
                {
                    method: 'POST',
                    headers: {Authorization: `Bearer ${authToken}`}
                }
            );
            if (!response.ok) {
                console.warn('[collaboration] could not renew the room token ' +
                    `(${response.status}); this client will stay disconnected`);
                return null;
            }
            const data = await response.json();
            const token = data && data.collaborationOTT;
            if (!token) return null;

            constants.mutableRefs.addon?.tab?.redux?.dispatch({
                type: 'scratch-gui/collaboration/SET_SESSION',
                payload: {ott: token}
            });
            if (constants.mutableRefs.provider) {
                constants.mutableRefs.provider.params.ott = token;
            }
            return token;
        } catch (e) {
            console.warn('[collaboration] could not renew the room token', e);
            return null;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}
