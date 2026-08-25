import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import VM from 'scratch-vm';
import AudioEngine from 'scratch-audio';

import {setProjectUnchanged} from '../reducers/project-changed';
import {setUsername} from '../reducers/tw';
import {
    LoadingStates,
    getIsLoadingWithId,
    onLoadedProject,
    projectError
} from '../reducers/project-state';
import log from './log';
import storage from './storage';
import * as collabSnapshot from './collab-snapshot';

const {API_HOST, TRUSTED_IFRAME_HOST} = require('../lib/brand');

const SECURITY_CRITICAL_FONTS = [
    'Helvetica Neue',
    'Helvetica',
    'Arial'
];

const vmManagerHOC = function (WrappedComponent) {
    class VMManager extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                canUseCloud: false
            };
            bindAll(this, [
                'loadProject'
            ]);
        }
        componentDidMount () {
            if (!this.props.vm.initialized) {
                window.vm = this.props.vm;
                try {
                    this.audioEngine = new AudioEngine();
                    this.props.vm.attachAudioEngine(this.audioEngine);
                } catch (e) {
                    log.error('could not create scratch-audio', e);
                }
                for (const font of SECURITY_CRITICAL_FONTS) {
                    this.props.vm.runtime.fontManager.restrictFont(font);
                }
                this.props.vm.initialized = true;
                this.props.vm.setLocale(this.props.locale, this.props.messages);
            }
            if (!this.props.isPlayerOnly && !this.props.isStarted) {
                this.props.vm.start();
            }
        }
        componentDidUpdate (prevProps) {
            if (this.props.isLoadingWithId && this.props.fontsLoaded &&
                (!prevProps.isLoadingWithId || !prevProps.fontsLoaded)) {
                this.loadProject();
            }
            if (!this.props.isPlayerOnly && !this.props.isStarted) {
                this.props.vm.start();
            }
        }
        loadProject () {
 
            this.props.vm.quit();
            return storage.loadCustomAchievementData()
                .then(({accessToken, customAchievements}) => {
                    const additionalData = {
                        projectId: this.props.projectId,
                        authToken: accessToken,
                        API_HOST: API_HOST,
                        TRUSTED_IFRAME_HOST: TRUSTED_IFRAME_HOST,
                        customAchievements: customAchievements,
                        canRecieveAchievement: !this.props.hasEverEnteredEditor,
                        canSave: this.props.canSave
                    };
                    const username = storage.username || '';
                    this.props.onSetUsername(username);

                    if (username !== ''){
                        this.setState({canUseCloud: true});
                    }

                    this.props.vm.loadProject(this.props.projectData, additionalData)
                        .then(() => {
                            collabSnapshot.applySnapshotIds(this.props.vm);
                            collabSnapshot.markReady();

                            this.props.onLoadedProject(this.props.loadingState, this.props.canSave);
                            setTimeout(() => this.props.onSetProjectUnchanged());

                            if (!this.props.isStarted) {
                                setTimeout(() => this.props.vm.renderer.draw());
                            }
                        })
                        .catch(e => {
                            collabSnapshot.markReady();
                            this.props.onError(e);
                        });
                })
                .catch(e => {
                    collabSnapshot.markReady();
                    this.props.onError(e);
                });
        }
        render () {
            const {
                fontsLoaded,
                loadingState,
                locale,
                messages,
                isStarted,
                onError: onErrorProp,
                onLoadedProject: onLoadedProjectProp,
                onSetProjectUnchanged,
                projectData,
                isLoadingWithId: isLoadingWithIdProp,
                vm,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    isLoading={isLoadingWithIdProp}
                    vm={vm}
                    canUseCloud={this.state.canUseCloud}
                    {...componentProps}
                />
            );
        }
    }

    VMManager.propTypes = {
        canSave: PropTypes.bool,
        cloudHost: PropTypes.string,
        fontsLoaded: PropTypes.bool,
        isLoadingWithId: PropTypes.bool,
        isPlayerOnly: PropTypes.bool,
        isStarted: PropTypes.bool,
        loadingState: PropTypes.oneOf(LoadingStates),
        locale: PropTypes.string,
        messages: PropTypes.objectOf(PropTypes.string),
        onError: PropTypes.func,
        onLoadedProject: PropTypes.func,
        onSetProjectUnchanged: PropTypes.func,
        projectData: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
        projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        username: PropTypes.string,
        vm: PropTypes.instanceOf(VM).isRequired,
        hasEverEnteredEditor: PropTypes.bool,
        onSetUsername: PropTypes.func
    };

    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        return {
            fontsLoaded: state.scratchGui.fontsLoaded,
            isLoadingWithId: getIsLoadingWithId(loadingState),
            locale: state.locales.locale,
            messages: state.locales.messages,
            projectData: state.scratchGui.projectState.projectData,
            projectId: state.scratchGui.projectState.projectId,
            loadingState: loadingState,
            isPlayerOnly: state.scratchGui.mode.isPlayerOnly,
            isStarted: state.scratchGui.vmStatus.started,
            hasEverEnteredEditor: state.scratchGui.mode.hasEverEnteredEditor
        };
    };

    const mapDispatchToProps = dispatch => ({
        onError: error => dispatch(projectError(error)),
        onLoadedProject: (loadingState, canSave) =>
            dispatch(onLoadedProject(loadingState, canSave, true)),
        onSetProjectUnchanged: () => dispatch(setProjectUnchanged()),
        onSetUsername: username => dispatch(setUsername(username))
    });

    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );

    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(VMManager);
};

export default vmManagerHOC;
