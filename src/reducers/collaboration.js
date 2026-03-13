const SET_COLLAB_SYNCING = 'scratch-gui/collaboration/SET_SYNCING';
const SET_ASSET_LOCKS = 'scratch-gui/collaboration/SET_ASSET_LOCKS';
const SET_SELECTED_ASSET = 'scratch-gui/collaboration/SET_SELECTED_ASSET';
const SET_DISCONNECTED = 'scratch-gui/collaboration/SET_DISCONNECTED'; // New
const SET_COLLAB_ACTIVE = 'scratch-gui/collaboration/SET_COLLAB_ACTIVE';

const initialState = {
    isCollabSyncing: false,
    isCollabActive: false,
    isDisconnected: false,
    lockedCostumes: {},
    lockedSounds: {},
    selectedAsset: {
        type: null,
        index: null,
        targetId: null
    }
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;

    switch (action.type) {
    case SET_COLLAB_SYNCING:
        return {
            ...state,
            isCollabSyncing: action.payload
        };
    case SET_COLLAB_ACTIVE:
        return {
            ...state,
            isCollabActive: action.payload
        };
    case SET_ASSET_LOCKS:
        return {
            ...state,
            lockedCostumes: action.lockedCostumes,
            lockedSounds: action.lockedSounds
        };
    case SET_SELECTED_ASSET:
        return {
            ...state,
            selectedAsset: {
                type: action.assetType,
                index: action.index,
                targetId: action.targetId
            }
        };
    case SET_DISCONNECTED:
        return {...state, isDisconnected: action.payload};
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

const setCollabActive = function (isActive) {
    return {
        type: SET_COLLAB_ACTIVE,
        payload: isActive
    };
};

const setAssetLocks = function (lockedCostumes, lockedSounds) {
    return {
        type: SET_ASSET_LOCKS,
        lockedCostumes,
        lockedSounds
    };
};

const setSelectedAsset = function (assetType, index, targetId) {
    return {
        type: SET_SELECTED_ASSET,
        assetType,
        index,
        targetId
    };
};

const selectIsAssetLocked = (state, targetId, index, type) => {
    const locks = type === 'costume' ?
        state.scratchGui.collaboration.lockedCostumes :
        state.scratchGui.collaboration.lockedSounds;
    return locks[`${targetId}:${index}`] || null;
};

const setCollabDisconnected = function (isDisconnected) {
    return {
        type: SET_DISCONNECTED,
        payload: isDisconnected
    };
};

export {
    reducer as default,
    initialState as collaborationInitialState,
    setCollabSyncing,
    setCollabActive,
    setAssetLocks,
    setSelectedAsset,
    setCollabDisconnected,
    selectIsAssetLocked,
    SET_ASSET_LOCKS,
    SET_SELECTED_ASSET
};
