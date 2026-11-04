import {API_HOST} from '../brand';
import storage from '../storage';
import {fetchProjectMeta} from '../tw-project-meta-fetcher-hoc';
import rewindController from './controller';

/**
 * Turns Rewind on for a project with one of the owner's free Rewinds.
 * @param {string} projectId project id
 * @returns {Promise<{status: string, meta: ?object}>} status status
 */
export const enableFreeRewind = async projectId => {
    const token = await storage.getProjectToken();
    const url = `${API_HOST}/v1/projects/blocks/${projectId}/rewind/free`;
    const headers = {Authorization: `Bearer ${token}`};
    const offerRes = await fetch(url, {headers});
    if (!offerRes.ok) throw new Error(`free rewind offer: ${offerRes.status}`);
    const offer = await offerRes.json();
    if (!offer.granted) {
        if (!offer.offered) return {status: 'needsPro', meta: null};
        const claimRes = await fetch(url, {method: 'POST', headers});
        if (claimRes.status === 409) return {status: 'needsPro', meta: null};
        if (!claimRes.ok) throw new Error(`free rewind claim: ${claimRes.status}`);
    }
    const data = await fetchProjectMeta(projectId, false);
    rewindController.metaLoaded(projectId, data);
    return {status: 'enabled', meta: data.rewind || null};
};
