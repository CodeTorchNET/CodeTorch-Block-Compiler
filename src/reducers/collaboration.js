const SET_COLLAB_SYNCING = 'scratch-gui/collaboration/SET_SYNCING';

const initialState = {
    isCollabSyncing: false

};

const reducer = function (state, action) {

    if (typeof state === 'undefined') state = initialState;

    switch (action.type) {
    case SET_COLLAB_SYNCING:

        return {
            ...state,
            isCollabSyncing: action.payload
        };
    default:

        return state;
    }
};
const setCollabSyncing = function (isSyncing) {
    return {
        type: SET_COLLAB_SYNCING,
        payload: isSyncing
    };
};

export {
    reducer as default,
    initialState as collaborationInitialState,
    setCollabSyncing
};
