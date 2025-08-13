import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import log from './log';


// eslint-disable-next-line import/no-commonjs
const {API_HOST} = require('./brand');

import {setProjectTitle} from '../reducers/project-title';
import {setAuthor, setDescription, setUsername} from '../reducers/tw';

import storage from './storage';

export const fetchProjectMeta = async projectId => {
    const authToken = await storage.getProjectToken();
    const urls = [
        `${API_HOST}/v1/projects/blocks/${projectId}/meta`,
        `${API_HOST}/v1/projects/blocks/${projectId}/meta`
    ];
    let firstError;
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }});

            const data = await res.json();
            if (res.ok) {
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
                canUseCloud: false
            };
        }
        componentDidUpdate (prevProps) {
            // project title resetting is handled in titled-hoc.jsx
            if (this.props.reduxProjectId !== prevProps.reduxProjectId) {
                this.props.onSetAuthor('', '');
                this.props.onSetDescription('', '');
                const projectId = this.props.reduxProjectId;

                if (projectId === '0') {
                    // don't try to get metadata
                } else {
                    fetchProjectMeta(projectId).then(data => {
                        // If project ID changed, ignore the results.
                        if (this.props.reduxProjectId !== projectId) {
                            return;
                        }

                        const title = data.title;
                        if (title) {
                            this.props.onSetProjectTitle(title);
                        }
                        const username = data.username;
                        if (username) {
                            this.props.onSetUsername(username);
                            this.setState({canUseCloud: true});
                        }
                        const authorName = data.author.username;
                        const authorThumbnail = data.author.PFP;
                        this.props.onSetAuthor(authorName, authorThumbnail);
                        const instructions = data.instructions || '';
                        const credits = data.description || '';
                        if (instructions || credits) {
                            this.props.onSetDescription(instructions, credits);
                        }

                        this.setState({canSave: data.canSave === 'true'});
                        // this.setState({canEditTitle: true}); // if you can save, you can edit title (it doesn't work the prop isn't passed down)
                        this.setState({canRemix: data.canRemix === 'true'});
                        storage.setCloudOTT(data?.cloudDataOTT);
                        window.CollaborationRoom = data?.collaboratorRoom;
                        window.CollaborationUsername = data?.username;
                        window.collaborationOTT = data?.collaborationOTT;
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
                onSetAuthor,
                onSetDescription,
                onSetProjectTitle,
                onSetUsername,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                    canSave={this.state.canSave}
                    canRemix={this.state.canRemix}
                    canUseCloud={this.state.canUseCloud}
                />
            );
        }
    }
    ProjectMetaFetcherComponent.propTypes = {
        reduxProjectId: PropTypes.string,
        onSetAuthor: PropTypes.func,
        onSetDescription: PropTypes.func,
        onSetProjectTitle: PropTypes.func,
        onSetUsername: PropTypes.func
    };
    const mapStateToProps = state => ({
        reduxProjectId: state.scratchGui.projectState.projectId
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
        onSetProjectTitle: title => dispatch(setProjectTitle(title)),
        onSetUsername: username => dispatch(setUsername(username))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(ProjectMetaFetcherComponent);
};

export {
    TWProjectMetaFetcherHOC as default
};
