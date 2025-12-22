import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import log from './log';

// eslint-disable-next-line import/no-commonjs
const {API_HOST, ASSET_HOST} = require('./brand');

import {setProjectTitle} from '../reducers/project-title';
import {setAuthor, setDescription} from '../reducers/tw';

import storage from './storage';

/**
 * Shared promise cache to prevent double-loading metadata
 * when both HOCs trigger at the same time.
 * (this is primarily due to Scratch Project Loading)
 */
let activeFetchMetadataPromise = null;

export const fetchProjectMeta = async (projectId, isScratch) => {
    const authToken = await storage.getProjectToken();
    let urls = [
        `${API_HOST}/v1/projects/blocks/${projectId}/meta`,
        `${API_HOST}/v1/projects/blocks/${projectId}/meta`
    ];
    if (isScratch) {
        urls = [
            `${ASSET_HOST}/scratch_project_meta/${projectId}`,
            `${ASSET_HOST}/scratch_project_meta/${projectId}`
        ];
    }
    let firstError;
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: isScratch ? {} : {
                    Authorization: `Bearer ${authToken}`
                }
            });

            const data = await res.json();
            if (res.ok) {
                if (isScratch){
                    storage.setScratchProjectToken(data.project_token); // so we can load actual project JSON file
                    return {
                        title: data.title,
                        author: {
                            username: data.author.username,
                            PFP: data.author.profile.images['90x90']
                        },
                        instructions: data.instructions,
                        description: data.description,
                        canSave: 'false',
                        canRemix: 'false'
                    };
                }
                return data;
            }
            if (res.status === 404) {
                throw new Error('Project is probably unshared');
            }
            throw new Error(`Unexpected status code: ${res.status}`);
        } catch (err) {
            if (!firstError) {
                firstError = err;
            }
        }
    }
    throw firstError;
};

export const fetchProjectMetaWithCache = (projectId, isScratch) => {
    if (activeFetchMetadataPromise && activeFetchMetadataPromise.id === projectId) {
        return activeFetchMetadataPromise.promise;
    }

    const promise = fetchProjectMeta(projectId, isScratch);
    activeFetchMetadataPromise = {
        id: projectId,
        promise: promise.finally(() => {
        })
    };
    return promise;
};

const getNoIndexTag = () => document.querySelector('meta[name="robots"][content="noindex"]');
const setIndexable = indexable => {
    if (indexable) {
        const tag = getNoIndexTag();
        if (tag) {
            tag.remove();
        }
    } else if (!getNoIndexTag()) {
        const tag = document.createElement('meta');
        tag.name = 'robots';
        tag.content = 'noindex';
        document.head.appendChild(tag);
    }
};

const TWProjectMetaFetcherHOC = function (WrappedComponent) {
    class ProjectMetaFetcherComponent extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                canSave: false,
                canRemix: false,
                canUseCloud: false,
                canEditTitle: false
            };
        }

        componentDidUpdate (prevProps) {
            if (
                this.props.reduxProjectId !== prevProps.reduxProjectId ||
                this.props.isScratchProject !== prevProps.isScratchProject
            ) {
                this.props.onSetAuthor('', '');
                this.props.onSetDescription('', '');
                const projectId = this.props.reduxProjectId;
                const isScratch = this.props.isScratchProject;

                if (projectId === '0') {
                    activeFetchMetadataPromise = null; // Reset cache on new project
                } else {
                    fetchProjectMetaWithCache(projectId, isScratch).then(data => {
                        if (this.props.reduxProjectId !== projectId) return;

                        const title = data.title;
                        if (title) {
                            this.props.onSetProjectTitle(title);
                        }

                        const authorName = data.author.username;
                        const authorThumbnail = data.author.PFP;
                        this.props.onSetAuthor(authorName, authorThumbnail);
                        
                        const instructions = data.instructions || '';
                        const credits = data.description || '';
                        if (instructions || credits) {
                            this.props.onSetDescription(instructions, credits);
                        }

                        const canSave = data.canSave === 'true';
                        this.setState({
                            canSave: canSave,
                            canRemix: data.canRemix === 'true',
                            canEditTitle: canSave // Enable title editing if user has save permissions
                        });
                        
                        if (isScratch) {
                            window.CollaborationRoom = null;
                            window.parent.postMessage({
                                type: 'block-compiler-action',
                                action: 'scratch-project-description',
                                payload: {
                                    instructions: data.instructions || ''
                                    // description: data.description || ''
                                }
                            }, '*');
                        } else {
                            storage.setCloudOTT(data?.cloudDataOTT);
                            storage.setCustomAchievements(data?.customAchievements);
                            window.CollaborationRoom = data?.collaboratorRoom;
                            window.CollaborationUsername = data?.username;
                            window.collaborationOTT = data?.collaborationOTT;
                        }
                        setIndexable(true);
                    })
                        .catch(err => {
                            setIndexable(false);
                            if (`${err}`.includes('unshared')) {
                                this.props.onSetDescription('unshared', 'unshared');
                            }
                            log.warn('cannot fetch project meta', err);
                        });
                }
            }
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                reduxProjectId,
                isScratchProject,
                onSetAuthor,
                onSetDescription,
                onSetProjectTitle,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                    canSave={this.state.canSave}
                    canRemix={this.state.canRemix}
                    canUseCloud={this.state.canUseCloud}
                    canEditTitle={this.state.canEditTitle}
                />
            );
        }
    }
    ProjectMetaFetcherComponent.propTypes = {
        reduxProjectId: PropTypes.string,
        isScratchProject: PropTypes.bool,
        onSetAuthor: PropTypes.func,
        onSetDescription: PropTypes.func,
        onSetProjectTitle: PropTypes.func
    };
    const mapStateToProps = state => ({
        reduxProjectId: state.scratchGui.projectState.projectId,
        isScratchProject: state.scratchGui.projectState.isScratchProject
    });
    const mapDispatchToProps = dispatch => ({
        onSetAuthor: (username, thumbnail) => dispatch(setAuthor({
            username,
            thumbnail
        })),
        onSetDescription: (instructions, credits) => dispatch(setDescription({
            instructions,
            credits
        })),
        onSetProjectTitle: title => dispatch(setProjectTitle(title))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(ProjectMetaFetcherComponent);
};

export {
    TWProjectMetaFetcherHOC as default
};
