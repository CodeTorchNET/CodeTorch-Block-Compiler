import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

const ProjectAnalyticsHOC = function (WrappedComponent) {
    class ProjectAnalytics extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleAnalytics',
                'reportStatsToParent',
                'sendStatsBeforeUnload'
            ]);

            this.sessionStartTimestamp = null;
            this.pureTimeAccumulator = 0;
            this.lastRunStartTimestamp = null;
            this.reportInterval = null;
        }

        componentDidMount () {
            window.addEventListener('beforeunload', this.sendStatsBeforeUnload);
            window.addEventListener('pagehide', this.sendStatsBeforeUnload);

            this.reportInterval = setInterval(this.reportStatsToParent, 3000);
        }

        componentDidUpdate (prevProps) {
            const isIndex =
                window.location.pathname.endsWith('index.html') ||
                window.location.pathname === '/';

            if (!isIndex) return;

            if (this.props.projectRunning && !this.sessionStartTimestamp) {
                this.sessionStartTimestamp = Date.now();
            }

            // Transition Stopped -> Running
            if (!prevProps.projectRunning && this.props.projectRunning) {
                this.lastRunStartTimestamp = Date.now();
            } else if (
                prevProps.projectRunning &&
                !this.props.projectRunning
            ) {
                // Running -> Stopped
                if (this.lastRunStartTimestamp) {
                    this.pureTimeAccumulator +=
                        Date.now() - this.lastRunStartTimestamp;
                    this.lastRunStartTimestamp = null;
                }
            }
        }

        componentWillUnmount () {
            window.removeEventListener('beforeunload', this.sendStatsBeforeUnload);
            window.removeEventListener('pagehide', this.sendStatsBeforeUnload);

            if (this.reportInterval) {
                clearInterval(this.reportInterval);
            }
            
            this.reportStatsToParent();
        }

        handleAnalytics () {
            const isIndex =
                window.location.pathname.endsWith('index.html') ||
                window.location.pathname === '/';

            if (!isIndex) return;

            const now = Date.now();

            window.parent.postMessage(
                {type: 'block-compiler-action', action: 'greenFlagClicked'},
                '*'
            );

            if (!this.sessionStartTimestamp) {
                this.sessionStartTimestamp = now;
            }
        }

        reportStatsToParent () {
            // Don't report if we haven't started a session (clicked green flag or interacted)
            if (!this.sessionStartTimestamp) return;

            const now = Date.now();
            const totalTime = now - this.sessionStartTimestamp;
            let pureTime = this.pureTimeAccumulator;

            // Calculate current running time if project is active
            if (this.props.projectRunning && this.lastRunStartTimestamp) {
                pureTime += now - this.lastRunStartTimestamp;
            }

            window.parent.postMessage({
                type: 'block-compiler-action',
                action: 'report_stats',
                totalTimeMs: totalTime,
                pureTimeMs: pureTime
            }, '*');
        }

        sendStatsBeforeUnload () {
            this.reportStatsToParent();
        }

        render () {
            return (
                <WrappedComponent
                    onGreenFlagClickAnalytics={this.handleAnalytics}
                    {...this.props}
                />
            );
        }
    }

    ProjectAnalytics.propTypes = {
        projectRunning: PropTypes.bool
    };

    return ProjectAnalytics;
};

export default ProjectAnalyticsHOC;
