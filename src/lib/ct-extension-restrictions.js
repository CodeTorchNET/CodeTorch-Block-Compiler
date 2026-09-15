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

const alreadyReported = new Set();

/**
 * Tell the user that an extension was refused, then describe the refusal as an error so
 * that whatever asked for the extension does not fail silently.
 * @param {string} extensionURL Extension URL or built-in extension ID
 * @returns {Error} The error to reject with
 */
const reportRefusedExtension = extensionURL => {
    const message = extensionRefusalMessage(extensionURL);
    if (!alreadyReported.has(extensionURL)) {
        alreadyReported.add(extensionURL);
        try {
            // eslint-disable-next-line no-alert
            alert(message);
        } catch (e) {
            // Nothing to show the message on.
        }
    }
    return new Error(message);
};

export {
    RESTRICTED_EXTENSION_IDS,
    isExtensionAllowed,
    extensionRefusalMessage,
    reportRefusedExtension
};
