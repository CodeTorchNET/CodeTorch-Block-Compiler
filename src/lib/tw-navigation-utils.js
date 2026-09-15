import {setProjectId as reduxSetProjectId} from '../reducers/project-state';
import {applyPersistentFlags} from './ct-url-flags';

const searchParamsToString = params => {
    let newSearch = params.toString();
    if (newSearch.length > 0) {
        // Add leading question mark
        newSearch = `?${newSearch}`;
        newSearch = newSearch
            // Remove '=' from empty values
            // eslint-disable-next-line no-div-regex
            .replace(/=(?=$|&)/g, '')
            // Decode / and : (common in project_url setting)
            .replace(/%2F/g, '/')
            .replace(/%3A/g, ':');
    }
    return newSearch;
};

const setProjectId = (dispatch, projectId) => {
    if (process.env.ROUTING_STYLE === 'wildcard') {
        if (projectId === '0') {
            projectId = '';
        }
        const flags = searchParamsToString(applyPersistentFlags(new URLSearchParams()));
        location.href = `${process.env.ROOT}/projects/${projectId}${flags}`;
        return;
    }
    dispatch(reduxSetProjectId(projectId));
};

/**
 * Change URL search params to something else in place
 * @param {URLSearchParams} params New URLSearchParams
 */
const setSearchParams = params => {
    applyPersistentFlags(params);
    const newSearch = searchParamsToString(params);
    if (location.search !== newSearch) {
        history.replaceState(null, null, `${location.pathname}${newSearch}${location.hash}`);
    }
};

export {
    setProjectId,
    searchParamsToString,
    setSearchParams
};
