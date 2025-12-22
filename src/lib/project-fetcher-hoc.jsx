import React from 'react';
import PropTypes from 'prop-types';
import {intlShape, injectIntl} from 'react-intl';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
// eslint-disable-next-line import/no-commonjs
const {API_HOST, ASSET_HOST} = require('./brand');

import {setProjectUnchanged} from '../reducers/project-changed';
import {fetchProjectMetaWithCache} from './tw-project-meta-fetcher-hoc.jsx';
import {
    LoadingStates,
    getIsCreatingNew,
    getIsFetchingWithId,
    getIsLoading,
    getIsShowingProject,
    onFetchedProjectData,
    projectError,
    setProjectId
} from '../reducers/project-state';
import {
    activateTab,
    BLOCKS_TAB_INDEX
} from '../reducers/editor-tab';

import log from './log';
import storage from './storage';

import VM from 'scratch-vm';

// TW: Temporary hack for project tokens
const fetchProjectToken = async projectId => {
    if (projectId === '0') {
        return null;
    }
    await storage.loadAccessToken();
    return storage.getProjectToken();
};

/* Higher Order Component to provide behavior for loading projects by id. If
 * there's no id, the default project is loaded.
 * @param {React.Component} WrappedComponent component to receive projectData prop
 * @returns {React.Component} component with project loading behavior
 */
const ProjectFetcherHOC = function (WrappedComponent) {
    class ProjectFetcherComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'fetchProject'
            ]);
            storage.setProjectHost(props.projectHost);
            storage.setProjectToken(props.projectToken);
            storage.setAssetHost(props.assetHost);
            storage.setAssetLoadHost(props.assetLoadHost);
            storage.setTranslatorFunction(props.intl.formatMessage);
            // props.projectId might be unset, in which case we use our default;
            // or it may be set by an even higher HOC, and passed to us.
            // Either way, we now know what the initial projectId should be, so
            // set it in the redux store.
            if (
                props.projectId !== '' &&
                props.projectId !== null &&
                typeof props.projectId !== 'undefined'
            ) {
                this.props.setProjectId(props.projectId.toString());
            }
        }
        componentDidUpdate (prevProps) {
            if (prevProps.projectHost !== this.props.projectHost) {
                storage.setProjectHost(this.props.projectHost);
            }
            if (prevProps.projectToken !== this.props.projectToken) {
                storage.setProjectToken(this.props.projectToken);
            }
            if (prevProps.assetHost !== this.props.assetHost) {
                storage.setAssetHost(this.props.assetHost);
            }
            if (prevProps.assetLoadHost !== this.props.assetLoadHost) {
                storage.setAssetLoadHost(this.props.assetLoadHost);
            }
            if (this.props.isFetchingWithId && !prevProps.isFetchingWithId) {
                this.fetchProject(this.props.reduxProjectId, this.props.loadingState, this.props.isScratchProject);
            }
            if (this.props.isShowingProject && !prevProps.isShowingProject) {
                this.props.onProjectUnchanged();
            }
            if (this.props.isShowingProject && (prevProps.isLoadingProject || prevProps.isCreatingNew)) {
                this.props.onActivateTab(BLOCKS_TAB_INDEX);
            }
        }
        fetchProject (projectId, loadingState, isScratchProject) {
            if (isScratchProject){
                storage.setProjectHost(this.props.scratchProjectHost);
                storage.setAssetLoadHost(this.props.scratchTrampolineHost);
            }
            // tw: clear and stop the VM before fetching
            // these will also happen later after the project is fetched, but fetching may take a while and
            // the project shouldn't be running while fetching the new project
            this.props.vm.clear();
            this.props.vm.quit();

            let assetPromise;
            // In case running in node...
            // let projectUrl = typeof URLSearchParams === 'undefined' ?
            //    null :
            //    new URLSearchParams(location.search).get('project_url');
            let projectUrl = null;
            if (projectUrl) {
                if (
                    !projectUrl.startsWith('http:') &&
                    !projectUrl.startsWith('https:') &&
                    !projectUrl.startsWith('data:')
                ) {
                    projectUrl = `https://${projectUrl}`;
                }
                assetPromise = fetch(projectUrl)
                    .then(r => {
                        if (!r.ok) {
                            throw new Error(`Request returned status ${r.status}`);
                        }
                        return r.arrayBuffer();
                    })
                    .then(buffer => ({data: buffer}));
            } else if (isScratchProject) {
                assetPromise = fetchProjectMetaWithCache(projectId, true)
                    .then(() =>
                        storage.load(
                            storage.AssetType.Project,
                            projectId,
                            storage.DataFormat.JSON
                        )
                    );
            } else {
                assetPromise = fetchProjectToken(projectId)
                    .then(token => {
                        storage.setProjectToken(token);
                        return storage.load(
                            storage.AssetType.Project,
                            projectId,
                            storage.DataFormat.JSON,
                            token
                        );
                    });
            }

            return assetPromise
                .then(projectAsset => {
                    if (projectAsset) {
                        let collaboratorStatus = false;
                        // eslint-disable-next-line func-style, require-jsdoc, no-inner-declarations
                        function startCollaborator (){
                            if (typeof window.StartCollaborator === 'function'){
                                window.StartCollaborator(collaboratorStatus);
                            } else {
                                setTimeout(startCollaborator, 100);
                            }
                        }
                        this.props.onFetchedProjectData(projectAsset.data, loadingState);
                        if (
                            window.CollaborationRoom &&
                            typeof window.CollaborationRoom === 'string' &&
                            window.CollaborationRoom !== 'false'
                        ) {
                            collaboratorStatus = true;
                        }
                        startCollaborator();
                    } else {
                        // Treat failure to load as an error
                        // Throw to be caught by catch later on
                        throw new Error('Could not find project');
                    }
                })
                .catch(err => {
                    this.props.onError(err);
                    log.error(err);
                });
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                assetHost,
                assetLoadHost,
                intl,
                isLoadingProject: isLoadingProjectProp,
                loadingState,
                onActivateTab,
                onError: onErrorProp,
                onFetchedProjectData: onFetchedProjectDataProp,
                onProjectUnchanged,
                projectHost,
                projectId,
                reduxProjectId,
                setProjectId: setProjectIdProp,
                /* eslint-enable no-unused-vars */
                isFetchingWithId: isFetchingWithIdProp,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    fetchingProject={isFetchingWithIdProp}
                    {...componentProps}
                />
            );
        }
    }
    ProjectFetcherComponent.propTypes = {
        assetHost: PropTypes.string,
        assetLoadHost: PropTypes.string,
        scratchProjectHost: PropTypes.string,
        scratchTrampolineHost: PropTypes.string,
        canSave: PropTypes.bool,
        intl: intlShape.isRequired,
        isCreatingNew: PropTypes.bool,
        isFetchingWithId: PropTypes.bool,
        isLoadingProject: PropTypes.bool,
        isShowingProject: PropTypes.bool,
        isScratchProject: PropTypes.bool,
        loadingState: PropTypes.oneOf(LoadingStates),
        onActivateTab: PropTypes.func,
        onError: PropTypes.func,
        onFetchedProjectData: PropTypes.func,
        onProjectUnchanged: PropTypes.func,
        projectHost: PropTypes.string,
        projectToken: PropTypes.string,
        projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        reduxProjectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        setProjectId: PropTypes.func,
        vm: PropTypes.instanceOf(VM)
    };
    ProjectFetcherComponent.defaultProps = {
        assetHost: `${API_HOST}/v1/projects/blocks/assets`, // used to upload assets
        assetLoadHost: `${ASSET_HOST}/block_project_assets`, // used to load assets
        scratchTrampolineHost: `${ASSET_HOST}/scratch_project_assets`, // used to load Scratch projects
        projectHost: `${API_HOST}/v1/projects/blocks`,
        scratchProjectHost: `${ASSET_HOST}/scratch_project_json` // used to load Scratch projects
    };

    const mapStateToProps = state => ({
        isCreatingNew: getIsCreatingNew(state.scratchGui.projectState.loadingState),
        isFetchingWithId: getIsFetchingWithId(state.scratchGui.projectState.loadingState),
        isLoadingProject: getIsLoading(state.scratchGui.projectState.loadingState),
        isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
        loadingState: state.scratchGui.projectState.loadingState,
        reduxProjectId: state.scratchGui.projectState.projectId,
        isScratchProject: state.scratchGui.projectState.isScratchProject,
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onActivateTab: tab => dispatch(activateTab(tab)),
        onError: error => dispatch(projectError(error)),
        onFetchedProjectData: (projectData, loadingState) =>
            dispatch(onFetchedProjectData(projectData, loadingState)),
        setProjectId: projectId => dispatch(setProjectId(projectId)),
        onProjectUnchanged: () => dispatch(setProjectUnchanged())
    });
    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(ProjectFetcherComponent));
};

export {
    ProjectFetcherHOC as default
};
