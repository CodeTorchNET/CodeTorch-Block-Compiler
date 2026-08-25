import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';
import {compose} from 'redux';

import {showStandardAlert} from '../reducers/alerts';
import ProjectAnalyticsHOC from '../lib/project-analytics-hoc.jsx';

import ControlsComponent from '../components/controls/controls.jsx';

class Controls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGreenFlagClick',
            'handleStopAllClick'
        ]);
        this.state = {
            showedPopup: false
        };
    }

    handleGreenFlagClick (e) {
        if (!this.props.disableCompiler && !this.state.showedPopup) {
            this.setState({showedPopup: true});
            this.props.onShowSaveErrorAlert();
        }
        e.preventDefault();

        this.props.onGreenFlagClickAnalytics();

        if (e.shiftKey || e.altKey || e.type === 'contextmenu') {
            if (e.shiftKey) {
                this.props.vm.setTurboMode(!this.props.turbo);
            }
            if (e.altKey || e.type === 'contextmenu') {
                if (this.props.framerate === 30) {
                    this.props.vm.setFramerate(60);
                } else {
                    this.props.vm.setFramerate(30);
                }
            }
        } else {
            if (!this.props.isStarted) {
                this.props.vm.start();
            }
            this.props.vm.greenFlag();
        }
    }
    handleStopAllClick (e) {
        e.preventDefault();
        this.props.vm.stopAll();
    }
    render () {

        const {
            vm,
            isStarted,
            projectRunning,
            turbo,
            disableCompiler,
            onShowSaveErrorAlert,
            onGreenFlagClickAnalytics,
            ...props
        } = this.props;

        return (
            <ControlsComponent
                {...props}
                active={projectRunning && isStarted}
                turbo={turbo}
                onGreenFlagClick={this.handleGreenFlagClick}
                onStopAllClick={this.handleStopAllClick}
            />
        );
    }
}

Controls.propTypes = {
    isStarted: PropTypes.bool.isRequired,
    projectRunning: PropTypes.bool.isRequired,
    turbo: PropTypes.bool.isRequired,
    framerate: PropTypes.number.isRequired,
    interpolation: PropTypes.bool.isRequired,
    isSmall: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired,
    disableCompiler: PropTypes.bool.isRequired,
    onShowSaveErrorAlert: PropTypes.func.isRequired,
    onGreenFlagClickAnalytics: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.started,
    projectRunning: state.scratchGui.vmStatus.running,
    framerate: state.scratchGui.tw.framerate,
    interpolation: state.scratchGui.tw.interpolation,
    turbo: state.scratchGui.vmStatus.turbo,
    disableCompiler: !state.scratchGui.tw.compilerOptions.enabled
});

const mapDispatchToProps = dispatch => ({
    onShowSaveErrorAlert: () => dispatch(showStandardAlert('LiveReloadDisabledNotice'))
});

export default compose(
    connect(mapStateToProps, mapDispatchToProps),
    ProjectAnalyticsHOC
)(Controls);
