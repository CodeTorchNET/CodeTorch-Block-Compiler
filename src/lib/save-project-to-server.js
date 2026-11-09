import {postMessageToParent} from './ct-parent-message';
import {requestCaptchaToken} from './ct-captcha-bridge';
import queryString from 'query-string';
import xhr from 'xhr';
import storage from '../lib/storage';
import rewindHooks from './rewind/hooks';
import {COPY_CHANGED, draftSaveHeaders} from './draft';

/**
 * Whether the API refused the save until a captcha is solved.
 * @param {object} response the xhr response
 * @returns {boolean} true for a captcha_required refusal
 */
const needsCaptcha = response => {
    if (response.statusCode !== 400) return false;
    try {
        const body = JSON.parse(response.body);
        const action = (body && body.details && body.details.action) || (body && body.action);
        return action === 'captcha_required';
    } catch (e) {
        return false;
    }
};

/**
 * Save a project JSON to the project server.
 * This should eventually live in scratch-www.
 * @param {number} projectId the ID of the project, null if a new project.
 * @param {object} vmState the JSON project representation.
 * @param {object} params the request params.
 * @property {?number} params.originalId the original project ID if a copy/remix.
 * @property {?boolean} params.isCopy a flag indicating if this save is creating a copy.
 * @property {?boolean} params.isRemix a flag indicating if this save is creating a remix.
 * @property {?string} params.title the title of the project.
 * @property {?string} params.lesson the Learning Path lesson a new project is created for.
 * @return {Promise} A promise that resolves when the network request resolves.
 */
export default function (projectId, vmState, params) {
    const opts = {
        body: vmState,
        // If we set json:true then the body is double-stringified, so don't
        headers: {
            'Content-Type': 'application/json'
        },
        withCredentials: true,
        timeout: 120000
    };
    const creatingProject = projectId === null || typeof projectId === 'undefined';
    const queryParams = {};
    if (Object.prototype.hasOwnProperty.call(params, 'originalId')) queryParams.original_id = params.originalId;
    if (Object.prototype.hasOwnProperty.call(params, 'isCopy')) queryParams.is_copy = params.isCopy;
    if (Object.prototype.hasOwnProperty.call(params, 'isRemix')) queryParams.is_remix = params.isRemix;
    if (Object.prototype.hasOwnProperty.call(params, 'title')) queryParams.title = params.title;
    if (Object.prototype.hasOwnProperty.call(params, 'source')) queryParams.source = params.source;
    if (Object.prototype.hasOwnProperty.call(params, 'lesson')) queryParams.lesson = params.lesson;
    if (Object.prototype.hasOwnProperty.call(params, 'classId')) queryParams.class_id = params.classId;

    let qs = queryString.stringify(queryParams);
    if (qs) qs = `?${qs}`;

    return storage.getProjectToken().then(token => {
        // Add token to headers if present
        if (token) {
            opts.headers.Authorization = `Bearer ${token}`;
        }

        // Set method and URL
        if (creatingProject) {
            Object.assign(opts, {
                method: 'post',
                url: `${storage.CTprojectHost}/${qs}`
            });
        } else {
            Object.assign(opts, {
                method: 'put',
                url: `${storage.CTprojectHost}/${projectId}${qs}`
            });
            Object.assign(opts.headers, rewindHooks.saveHeaders(), draftSaveHeaders(projectId));
        }

        const send = () => new Promise((resolve, reject) => {
            xhr(opts, (err, response) => (err ? reject(err) : resolve(response)));
        });

        return send()
            .then(response => {
                if (!needsCaptcha(response)) return response;
                return requestCaptchaToken().then(captchaToken => {
                    opts.headers['X-Hcaptcha-Token'] = captchaToken;
                    return send();
                }, () => response);
            })
            .then(response => {
                if (response.statusCode === 409 && !creatingProject) {
                    let changed = false;
                    try {
                        changed = JSON.parse(response.body).error_code === COPY_CHANGED;
                    } catch (e) {
                        // ignore
                    }
                    if (changed) throw COPY_CHANGED;
                }
                if (response.statusCode !== 200) throw response.statusCode;
                // Since we didn't set json: true, we have to parse manually
                const body = JSON.parse(response.body);
                if (queryParams.is_remix) {
                    postMessageToParent({
                        type: 'block-compiler-action',
                        action: 'createdRemix',
                        remixId: body['content-name'],
                        remixTitle: body['content-title'],
                        originalId: queryParams.original_id
                    });
                }
                body.id = creatingProject ? body['content-name'] : projectId;
                const revision = response.headers && Number(response.headers['x-content-revision']);
                if (Number.isFinite(revision)) body.contentRevision = revision;
                return body;
            });
    });
}
