import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {connect} from 'react-redux';
import VM from 'scratch-vm';
import Box from '../components/box/box.jsx';
import greenFlag from '../components/green-flag/icon--green-flag.svg';
import {setStartedState} from '../reducers/vm-status.js';
import {FormattedMessage} from 'react-intl';

import styles from '../components/stage/stage.css';

class GreenFlagOverlay extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick'
        ]);
    }

    handleClick () {
        this.props.vm.start();
        this.props.vm.greenFlag();

        // FIXME: some unknown edge cases are causing start() to be called but for the
        // RUNTIME_STARTED listener to not update redux, causing this to always be
        // shown and never go away. this is a temporary hack to avoid that...
        this.props.onStarted();
    }

    render () {
        // Check if project has cloud vars and user is generic 'player' or empty string (not logged in)
        const isGuest = !this.props.username || this.props.username === 'player';
        const showCloudWarning = this.props.hasCloudVariables && isGuest;

        return (
            <Box
                className={classNames(
                    this.props.wrapperClass,
                    {[styles.greenFlagOverlayWithWarning]: showCloudWarning}
                )}
                onClick={this.handleClick}
            >
                {showCloudWarning && (
                    <div className={styles.cloudWarningContent}>
                        <div className={styles.cloudWarningText}>
                            <span className={styles.cloudWarningTextRed}>
                                <FormattedMessage
                                    defaultMessage="Multiplayer Features: "
                                    id="gui.greenFlagOverlay.cloudTitle"
                                />
                            </span>
                            <span>
                                <FormattedMessage
                                    defaultMessage="This project uses cloud variables. To play online or interact with others, you must log in."
                                    id="gui.greenFlagOverlay.cloudWarning"
                                />
                            </span>
                        </div>
                    </div>
                )}
                <div className={this.props.className}>
                    <img
                        draggable={false}
                        src={greenFlag}
                    />
                </div>
            </Box>

        );
    }
}

GreenFlagOverlay.propTypes = {
    className: PropTypes.string,
    vm: PropTypes.instanceOf(VM),
    wrapperClass: PropTypes.string,
    onStarted: PropTypes.func,
    hasCloudVariables: PropTypes.bool,
    username: PropTypes.string
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    hasCloudVariables: state.scratchGui.tw.hasCloudVariables,
    username: state.scratchGui.tw.username
});

const mapDispatchToProps = dispatch => ({
    onStarted: () => dispatch(setStartedState(true))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(GreenFlagOverlay);
