import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import CrashMessage from '../crash-message/crash-message.jsx';
import {RewindViewerIntl} from '../rewind-viewer/rewind-viewer.jsx';
import {formatMoment} from '../rewind-viewer/time-format';
import {LoadingState, startRecovering} from '../../reducers/project-state';
import {
    canRecover,
    clearPendingRecovery,
    findWorkingVersion,
    headOf,
    loadRecoveredState,
    loadRecoveryTimeline,
    peekPendingRecovery,
    setPendingRecovery
} from '../../lib/rewind/recover';
import {postMessageToParent} from '../../lib/ct-parent-message';
import storage from '../../lib/storage';
import log from '../../lib/log';

import crashStyles from '../crash-message/crash-message.css';
import styles from './project-recovery.css';
import reloadIcon from '../crash-message/reload.svg';

/* eslint-disable max-len */
const messages = defineMessages({
    title: {id: 'gui.projectRecovery.title', defaultMessage: 'This project couldn’t be opened', description: 'Title of the screen shown when a project fails to load and can be recovered from its Rewind history'},
    body: {id: 'gui.projectRecovery.body', defaultMessage: 'Something is wrong with its saved file. Rewind kept the project’s history, so you can go back to a version that works.', description: 'Explains that the project failed to load but its Rewind history can bring back a working version'},
    restoreLast: {id: 'gui.projectRecovery.restoreLast', defaultMessage: 'Restore the last working version', description: 'Button that searches the Rewind history for the newest version of the project that opens'},
    choose: {id: 'gui.projectRecovery.choose', defaultMessage: 'Choose a version in Rewind', description: 'Button that opens the Rewind history viewer to pick a version of a project that failed to load'},
    searching: {id: 'gui.projectRecovery.searching', defaultMessage: 'Looking for a version that opens…', description: 'Shown while the Rewind history is searched for a working version'},
    trying: {id: 'gui.projectRecovery.trying', defaultMessage: 'Trying the version from {time}…', description: 'Shown while one version from the Rewind history is tried. {time} is a time like "3:42 PM" or a date'},
    found: {id: 'gui.projectRecovery.found', defaultMessage: 'The version from {time} opens.', description: 'A working version was found in the Rewind history. {time} is a time like "3:42 PM" or a date'},
    foundHint: {id: 'gui.projectRecovery.foundHint', defaultMessage: 'Opening it saves it in place of the broken file. Everything stays in Rewind, so you can still go back to any other version.', description: 'Explains what opening a recovered version does'},
    open: {id: 'gui.projectRecovery.open', defaultMessage: 'Open this version', description: 'Button that opens the recovered version of the project'},
    notFound: {id: 'gui.projectRecovery.notFound', defaultMessage: 'None of the recent versions in Rewind would open. You can still pick one yourself.', description: 'No working version was found automatically in the Rewind history'},
    searchFailed: {id: 'gui.projectRecovery.searchFailed', defaultMessage: 'The project’s history couldn’t be loaded. Check your connection and try again.', description: 'The Rewind history could not be fetched while recovering a project'},
    failed: {id: 'gui.projectRecovery.failed', defaultMessage: 'That version couldn’t be opened either. Try another one.', description: 'The chosen version of the project also failed to load'},
    back: {id: 'gui.projectRecovery.back', defaultMessage: 'Back', description: 'Button that closes the Rewind viewer and returns to the recovery screen'},
    reload: {id: 'gui.crashMessage.reload', defaultMessage: 'Reload', description: 'Button to reload the page when page crashes'}
});
/* eslint-enable max-len */

const RECOVERABLE_DURING = [LoadingState.FETCHING_WITH_ID, LoadingState.LOADING_VM_WITH_ID];

/**
 * Whether the error screen can offer Rewind recovery.
 * @param {object} props props
 * @returns {boolean} true when it can
 */
export const isRecoveryOffered = props => !!(
    props.canSave &&
    canRecover(props.meta) &&
    RECOVERABLE_DURING.includes(props.errorDuring) &&
    !props.collaborationRoom &&
    props.collaborationStatus !== 'collaborative'
);

const noop = () => {};

const hasRoom = room => !!room && room !== 'false';

const handleReload = () => {
    if (window.top === window.self) {
        window.location.replace(window.location.origin + window.location.pathname);
    } else {
        postMessageToParent({type: 'block-compiler-action', action: 'reload'});
    }
};

class ProjectRecovery extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleRestoreLast', 'handleOpen', 'handleChoose', 'handleCloseViewer', 'handleChosen']);
        const pending = peekPendingRecovery(props.projectId);
        if (pending) clearPendingRecovery();
        this.state = {
            phase: 'idle',
            trying: null,
            found: null,
            viewer: false,
            failed: !!(pending && pending.failed)
        };
        this.timeline = null;
        this.head = null;
    }
    componentDidMount () {
        log.error('[project] failed to load', this.props.error);
    }
    componentWillUnmount () {
        this.unmounted = true;
    }
    async history () {
        if (!this.timeline) this.timeline = await loadRecoveryTimeline(this.props.projectId);
        if (!this.head) this.head = await headOf(this.timeline);
        return this.timeline;
    }
    async handleRestoreLast () {
        this.setState({phase: 'searching', trying: null, found: null, failed: false});
        let found;
        try {
            const timeline = await this.history();
            found = await findWorkingVersion(timeline, state => loadRecoveredState(this.props.vm, state), {
                onTry: t => {
                    if (!this.unmounted) this.setState({trying: t});
                }
            });
        } catch (e) {
            log.error('[rewind] recovery search failed', e);
            if (!this.unmounted) this.setState({phase: 'search-failed'});
            return;
        }
        if (this.unmounted) return;
        this.setState(found ? {phase: 'found', found} : {phase: 'not-found'});
    }
    handleOpen () {
        const found = this.state.found;
        if (found) this.open(found.state, found.t);
    }
    async handleChosen (state, t) {
        await this.history();
        this.open(state, t);
    }
    open (state, t) {
        this.setState({phase: 'opening'});
        setPendingRecovery({
            projectId: this.props.projectId,
            state,
            t,
            head: this.head ? this.head.state : null,
            labelUser: storage.username || ''
        });
        this.props.onStartRecovering();
    }
    handleChoose () {
        this.setState({viewer: true, failed: false});
    }
    handleCloseViewer () {
        this.setState({viewer: false});
    }
    renderStatus () {
        const {intl, locale} = this.props;
        const {phase, trying, found, failed} = this.state;
        const time = t => formatMoment(t, locale);
        if (failed) return <p className={styles.problem}>{intl.formatMessage(messages.failed)}</p>;
        switch (phase) {
        case 'searching':
            return (
                <p className={styles.status}>
                    {trying === null ?
                        intl.formatMessage(messages.searching) :
                        intl.formatMessage(messages.trying, {time: time(trying)})}
                </p>
            );
        case 'found':
        case 'opening':
            return found ? (
                <React.Fragment>
                    <p className={styles.found}>{intl.formatMessage(messages.found, {time: time(found.t)})}</p>
                    <p className={styles.hint}>{intl.formatMessage(messages.foundHint)}</p>
                </React.Fragment>
            ) : null;
        case 'not-found':
            return <p className={styles.problem}>{intl.formatMessage(messages.notFound)}</p>;
        case 'search-failed':
            return <p className={styles.problem}>{intl.formatMessage(messages.searchFailed)}</p>;
        default:
            return null;
        }
    }
    render () {
        const {error, intl} = this.props;
        const errorMessage = error ? `${error}` : '';
        if (!isRecoveryOffered(this.props)) {
            return (
                <CrashMessage
                    errorMessage={errorMessage}
                    onReload={handleReload}
                />
            );
        }
        const {phase, viewer} = this.state;
        const busy = phase === 'searching' || phase === 'opening';
        const showFound = (phase === 'found' || phase === 'opening') && this.state.found;
        return (
            <div className={crashStyles.crashWrapper}>
                <Box className={crashStyles.body}>
                    <img
                        className={crashStyles.reloadIcon}
                        src={reloadIcon}
                        draggable={false}
                    />
                    <p className={crashStyles.header}>{intl.formatMessage(messages.title)}</p>
                    <p>{intl.formatMessage(messages.body)}</p>
                    {this.renderStatus()}
                    <div className={styles.actions}>
                        {showFound ? (
                            <button
                                className={styles.primary}
                                disabled={busy}
                                onClick={this.handleOpen}
                                data-testid="recovery-open"
                            >
                                {intl.formatMessage(messages.open)}
                            </button>
                        ) : (
                            <button
                                className={styles.primary}
                                disabled={busy}
                                onClick={this.handleRestoreLast}
                                data-testid="recovery-restore-last"
                            >
                                {intl.formatMessage(messages.restoreLast)}
                            </button>
                        )}
                        <button
                            className={styles.secondary}
                            disabled={busy}
                            onClick={this.handleChoose}
                            data-testid="recovery-choose"
                        >
                            {intl.formatMessage(messages.choose)}
                        </button>
                        <button
                            className={styles.link}
                            onClick={handleReload}
                        >
                            {intl.formatMessage(messages.reload)}
                        </button>
                    </div>
                    {errorMessage && (
                        <p className={styles.detail}>{errorMessage}</p>
                    )}
                </Box>
                {viewer && (
                    <RewindViewerIntl
                        basePath={this.props.basePath}
                        canSave={this.props.canSave}
                        exitLabel={intl.formatMessage(messages.back)}
                        isRtl={this.props.isRtl}
                        locale={this.props.locale}
                        meta={this.props.meta}
                        onClose={this.handleCloseViewer}
                        onRestoreState={this.handleChosen}
                        onSaveProject={noop}
                        projectId={this.props.projectId}
                        theme={this.props.theme}
                        vm={this.props.vm}
                    />
                )}
            </div>
        );
    }
}


ProjectRecovery.propTypes = {
    basePath: PropTypes.string,
    canSave: PropTypes.bool,
    collaborationRoom: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
    collaborationStatus: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
    error: PropTypes.any, // eslint-disable-line react/forbid-prop-types
    errorDuring: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    locale: PropTypes.string.isRequired,
    meta: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    onStartRecovering: PropTypes.func.isRequired,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    theme: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    vm: PropTypes.object.isRequired // eslint-disable-line react/forbid-prop-types
};

const mapStateToProps = state => ({
    collaborationRoom: hasRoom(state.scratchGui.collaboration.session.room) ?
        String(state.scratchGui.collaboration.session.room) : null,
    collaborationStatus: state.scratchGui.collaboration.session.status,
    error: state.scratchGui.projectState.error,
    errorDuring: state.scratchGui.projectState.errorDuring,
    isRtl: state.locales.isRtl,
    locale: state.locales.locale,
    meta: state.scratchGui.rewind.meta,
    projectId: state.scratchGui.projectState.projectId,
    theme: state.scratchGui.theme.theme,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onStartRecovering: () => dispatch(startRecovering({ctRewindRecovery: true}))
});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(ProjectRecovery));
