const SET = 'scratch-gui/draft/SET';

const initialState = {
    state: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET:
        return Object.assign({}, state, {state: action.state || null});
    default:
        return state;
    }
};

const setDraftState = draftState => ({type: SET, state: draftState});

export {
    reducer as default,
    initialState as draftInitialState,
    setDraftState
};
