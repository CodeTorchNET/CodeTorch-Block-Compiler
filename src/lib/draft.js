import {API_HOST} from './brand';
import storage from './storage';

export const COPY_CHANGED = 'project_copy_changed';

let loaded = {projectId: null, copy: null};

/**
 * Records the draft state /meta.
 * @param {string} projectId project id
 * @param {?object} draftState draftState
 */
export const noteDraftState = (projectId, draftState) => {
    if (!draftState) {
        loaded = {projectId: null, copy: null};
        return;
    }
    loaded = {projectId: String(projectId), copy: draftState.active ? 'draft' : 'shared'};
};

/**
 * @param {string} projectId project being saved
 * @returns {object} the request header naming the copy the editor works on
 */
export const draftSaveHeaders = projectId => {
    if (!loaded.copy || loaded.projectId !== String(projectId)) return {};
    return {'X-Project-Copy': loaded.copy};
};

const request = async (projectId, method, path) => {
    const token = await storage.getProjectToken();
    const res = await fetch(`${API_HOST}/v1/projects/blocks/${projectId}/draft${path}`, {
        method,
        headers: token ? {Authorization: `Bearer ${token}`} : {}
    });
    let body = null;
    try {
        body = await res.json();
    } catch (e) {
        // ignore
    }
    if (!res.ok) {
        const err = new Error(`draft ${method} ${path}: ${res.status}`);
        err.code = body && body.error_code;
        throw err;
    }
    noteDraftState(projectId, body);
    return body;
};

/**
 * Starts a draft.
 * @param {string} projectId project id
 * @returns {Promise<object>} the new draft state
 */
export const startDraft = projectId => request(projectId, 'POST', '');

/**
 * Publishes the draft over the shared version and ends it.
 * @param {string} projectId project id
 * @returns {Promise<object>} the new draft state
 */
export const publishDraft = projectId => request(projectId, 'POST', '/publish');

/**
 * Throws the draft away; the shared version is what the editor works on.
 * @param {string} projectId project id
 * @returns {Promise<object>} the new draft state
 */
export const discardDraft = projectId => request(projectId, 'DELETE', '');
