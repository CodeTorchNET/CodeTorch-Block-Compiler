const OPEN = 'scratch-gui/rewind/OPEN';
const CLOSE = 'scratch-gui/rewind/CLOSE';
const SET_META = 'scratch-gui/rewind/SET_META';

const parseRewindParams = search => {
    let params;
    try {
        params = new URLSearchParams(search || '');
    } catch (e) {
        return {open: false, until: null, rewindOnly: false};
    }
    const raw = params.get('rewind');
    const open = raw !== null && ['1', 'true', 'yes', ''].includes(raw.trim().toLowerCase());
    const untilRaw = params.get('until');
    const until = open && untilRaw && /^\d{1,16}$/.test(untilRaw) ? Number(untilRaw) : null;
    const onlyRaw = params.get('rewindonly');
    const rewindOnly = open && onlyRaw !== null &&
        ['1', 'true', 'yes', ''].includes(onlyRaw.trim().toLowerCase());
    return {open, until, rewindOnly};
};

const fromUrl = typeof location === 'undefined' ? {open: false, until: null, rewindOnly: false} :
    parseRewindParams(location.search);

const initialState = {
    open: fromUrl.open,
    openedFromUrl: fromUrl.open,
    until: fromUrl.until,
    rewindOnly: fromUrl.rewindOnly,
    meta: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN:
        return Object.assign({}, state, {open: true});
    case CLOSE:
        if (state.rewindOnly) return state;
        return Object.assign({}, state, {open: false, until: null, openedFromUrl: false});
    case SET_META:
        return Object.assign({}, state, {meta: action.meta || null});
    default:
        return state;
    }
};

const openRewind = () => ({type: OPEN});
const closeRewind = () => ({type: CLOSE});
const setRewindMeta = meta => ({type: SET_META, meta});

const clearRewindFromUrl = () => {
    try {
        const url = new URL(location.href);
        if (!url.searchParams.has('rewind') && !url.searchParams.has('until')) return;
        url.searchParams.delete('rewind');
        url.searchParams.delete('until');
        history.replaceState(history.state, '', url.toString());
    } catch (e) {
        // ignore
    }
};

export {
    reducer as default,
    reducer as rewindReducer,
    initialState as rewindInitialState,
    parseRewindParams,
    openRewind,
    closeRewind,
    setRewindMeta,
    clearRewindFromUrl
};
