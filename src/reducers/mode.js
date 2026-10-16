import {postMessageToParent} from '../lib/ct-parent-message';

const SET_FULL_SCREEN = 'scratch-gui/mode/SET_FULL_SCREEN';
const SET_PLAYER = 'scratch-gui/mode/SET_PLAYER';
const SET_EMBED_VIEW = 'scratch-gui/mode/SET_EMBED_VIEW';
const EXTERNAL_NAVIGATION = 'scratch-gui/mode/EXTERNAL_NAVIGATION';

/**
 * What an embed can show: the running project on its own, the blocks next to
 * the stage, or the blocks on their own (a narrow embed shows one at a time).
 * @enum {string}
 */
const EMBED_VIEWS = {
    player: 'player',
    code: 'code',
    blocks: 'blocks'
};

const initialState = {
    isEmbedded: false,
    isFullScreen: false,
    isPlayerOnly: false,
    isCodeEmbed: false,
    isBlocksOnlyEmbed: false,
    hasEverEnteredEditor: true
};

/**
 * @param {object} state The mode state
 * @param {string} view One of EMBED_VIEWS
 * @returns {object} The mode state showing that view
 */
const applyEmbedView = (state, view) => {
    const isCode = view === EMBED_VIEWS.code || view === EMBED_VIEWS.blocks;
    return Object.assign({}, state, {
        isEmbedded: !isCode,
        isPlayerOnly: !isCode,
        isCodeEmbed: isCode,
        isBlocksOnlyEmbed: view === EMBED_VIEWS.blocks,
        hasEverEnteredEditor: state.hasEverEnteredEditor || isCode
    });
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_FULL_SCREEN:
        return Object.assign({}, state, {
            isFullScreen: action.isFullScreen
        });
    case SET_PLAYER:
        return Object.assign({}, state, {
            isPlayerOnly: action.isPlayerOnly,
            hasEverEnteredEditor: state.hasEverEnteredEditor || !action.isPlayerOnly
        });
    case SET_EMBED_VIEW:
        return applyEmbedView(state, action.view);
    default:
        return state;
    }
};

const setFullScreen = function (isFullScreen) {
    return {
        type: SET_FULL_SCREEN,
        isFullScreen: isFullScreen
    };
};
const setPlayer = function () {
    postMessageToParent({
        type: 'block-compiler-action',
        action: 'communityPage',
        projectID: window.location.hash.replace('#', '')
    });
    return {
        type: EXTERNAL_NAVIGATION
    };
};
const setEmbedView = function (view) {
    return {
        type: SET_EMBED_VIEW,
        view: view === EMBED_VIEWS.code || view === EMBED_VIEWS.blocks ? view : EMBED_VIEWS.player
    };
};

export {
    reducer as default,
    initialState as modeInitialState,
    applyEmbedView,
    EMBED_VIEWS,
    setFullScreen,
    setPlayer,
    setEmbedView
};
