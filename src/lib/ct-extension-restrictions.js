import {isMinimalMode} from './ct-url-flags';
import {EXTENSION_HOST} from './brand';
import {isSameOrigin} from './ct-same-origin';

/**
 * Built-in extensions that are not available in the reduced editor.
 * @type {string[]}
 */
const RESTRICTED_EXTENSION_IDS = [
    'videoSensing',
    'faceSensing',
    'text2speech',
    'translate',
    'customAchievements',
    'custom_extension'
];

/**
 * @param {string} extensionURL Extension URL or built-in extension ID
 * @returns {boolean} True if the value looks like a URL instead of a built-in extension ID
 */
const looksLikeURL = extensionURL => /^[a-z][a-z0-9+.-]*:/i.test(extensionURL);

/**
 * @param {string} extensionURL Extension URL or built-in extension ID
 * @returns {boolean} True if this extension is allowed to load
 */
const isExtensionAllowed = extensionURL => {
    if (!isMinimalMode()) {
        return true;
    }
    if (typeof extensionURL !== 'string') {
        return false;
    }
    if (RESTRICTED_EXTENSION_IDS.includes(extensionURL)) {
        return false;
    }
    if (!looksLikeURL(extensionURL)) {
        // A built-in extension ID that is not restricted.
        return true;
    }
    // Only the configured gallery may provide extensions.
    return isSameOrigin(extensionURL, EXTENSION_HOST);
};

/**
 * @param {string} extensionURL Extension URL or built-in extension ID
 * @returns {string} Message to show the user when the extension was refused
 */
const extensionRefusalMessage = extensionURL => (
    `This editor can not load the extension "${extensionURL}".`
);

const refusedNotices = [];
const noticeListeners = new Set();

/**
 * @returns {Array<{key: string, url: ?string, id: ?string, placeholder: boolean}>} refusals so far
 */
const getExtensionNotices = () => refusedNotices.slice();

/**
 * @param {function(Array<object>): void} listener called with every notice whenever one changes
 * @returns {function(): void} unsubscribe
 */
const subscribeExtensionNotices = listener => {
    noticeListeners.add(listener);
    return () => noticeListeners.delete(listener);
};

const emitNotices = () => {
    const notices = getExtensionNotices();
    for (const listener of noticeListeners) {
        try {
            listener(notices);
        } catch (e) {
            // ignore
        }
    }
};

/**
 * Record a refused extension.
 * @param {{url: ?string, id: ?string, placeholder: boolean}} notice what happened
 */
const noteRefusedExtension = ({url = null, id = null, placeholder = false}) => {
    const key = url || id;
    if (!key) return;
    const existing = refusedNotices.find(n => n.key === key);
    if (existing) {
        if (id && !existing.id) existing.id = id;
        if (placeholder) existing.placeholder = true;
    } else {
        refusedNotices.push({key, url, id, placeholder});
    }
    emitNotices();
};

const clearExtensionNotices = () => {
    refusedNotices.length = 0;
    emitNotices();
};

/**
 * Tell the user that an extension was refused, then describe the refusal as an error so
 * that whatever asked for the extension does not fail silently.
 * @param {string} extensionURL Extension URL or built-in extension ID
 * @returns {Error} The error to reject with
 */
const reportRefusedExtension = extensionURL => {
    if (looksLikeURL(`${extensionURL}`)) noteRefusedExtension({url: extensionURL});
    else noteRefusedExtension({id: extensionURL});
    return new Error(extensionRefusalMessage(extensionURL));
};

export {
    RESTRICTED_EXTENSION_IDS,
    isExtensionAllowed,
    extensionRefusalMessage,
    reportRefusedExtension,
    noteRefusedExtension,
    getExtensionNotices,
    subscribeExtensionNotices,
    clearExtensionNotices
};
