import {EMBED_VIEWS} from '../reducers/mode';
import {TRUSTED_IFRAME_HOST} from './brand';
import {isSameOrigin} from './ct-same-origin';

const EMBED_VIEW_PARAM = 'view';
const SET_EMBED_VIEW_ACTION = 'SET_EMBED_VIEW';

/**
 * @param {*} value Anything that claims to name an embed view
 * @returns {string} One of EMBED_VIEWS; anything not understood is the player
 */
const parseEmbedView = value => {
    const view = `${value}`.trim().toLowerCase();
    return view === EMBED_VIEWS.code || view === EMBED_VIEWS.blocks ? view : EMBED_VIEWS.player;
};

/**
 * @param {URLSearchParams} params Parsed search parameters of the embed page
 * @returns {string} The view the embed should open with
 */
const readEmbedViewFromParams = params => parseEmbedView(params.get(EMBED_VIEW_PARAM));

/**
 * Whether a message may change the embed's view.
 * @param {MessageEvent} event The message
 * @param {string} trustedHost Origin that embeds the editor, usually TRUSTED_IFRAME_HOST
 * @returns {boolean} True if the message may be acted on
 */
const isTrustedEmbedMessage = (event, trustedHost = TRUSTED_IFRAME_HOST) => {
    if (!event || event.source !== window.parent || window.parent === window) {
        return false;
    }
    if (!trustedHost) {
        return true;
    }
    return isSameOrigin(event.origin, trustedHost);
};

/**
 * @param {*} data A message's data
 * @returns {string|null} The requested view, or null when the message is about something else
 */
const readEmbedViewFromMessage = data => {
    if (!data || data.type !== 'block-compiler-action' || data.action !== SET_EMBED_VIEW_ACTION) {
        return null;
    }
    return parseEmbedView(data.view);
};

export {
    EMBED_VIEW_PARAM,
    SET_EMBED_VIEW_ACTION,
    parseEmbedView,
    readEmbedViewFromParams,
    isTrustedEmbedMessage,
    readEmbedViewFromMessage
};
