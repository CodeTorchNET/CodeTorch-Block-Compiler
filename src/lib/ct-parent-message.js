import {TRUSTED_IFRAME_HOST} from './brand';

/**
 * The origin that outbound messages to the embedding page are addressed to.
 *
 * @returns {string} A serialized origin, or "*" when no trusted host is configured.
 */
const getParentTargetOrigin = () => {
    if (!TRUSTED_IFRAME_HOST) {
        return '*';
    }
    try {
        const origin = new URL(TRUSTED_IFRAME_HOST).origin;
        // An opaque origin can not be used as a target.
        return origin === 'null' ? '*' : origin;
    } catch (e) {
        return '*';
    }
};

/**
 * Send a message to the page that embeds the editor.
 * @param {*} message The message to send
 * @param {Transferable[]} [transfer] Objects to transfer ownership of
 * @returns {void}
 */
const postMessageToParent = (message, transfer) => {
    window.parent.postMessage(message, getParentTargetOrigin(), transfer);
};

export {
    getParentTargetOrigin,
    postMessageToParent
};
