import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {setEmbedView} from '../reducers/mode';
import {isTrustedEmbedMessage, readEmbedViewFromMessage} from './ct-embed-view';

/**
 * Lets the page that embeds the project flip it between the player and the
 * blocks-and-stage view without reloading, by posting
 * `{type: 'block-compiler-action', action: 'SET_EMBED_VIEW', view: 'code' | 'player'}`.
 * @param {React.Component} WrappedComponent The component to wrap
 * @returns {React.Component} The wrapped component
 */
const CTEmbedViewHOC = function (WrappedComponent) {
    class EmbedViewComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleMessage'
            ]);
        }
        componentDidMount () {
            window.addEventListener('message', this.handleMessage);
        }
        componentWillUnmount () {
            window.removeEventListener('message', this.handleMessage);
        }
        handleMessage (event) {
            if (!isTrustedEmbedMessage(event)) {
                return;
            }
            const view = readEmbedViewFromMessage(event.data);
            if (view !== null) {
                this.props.onSetEmbedView(view);
            }
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                onSetEmbedView,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }
    EmbedViewComponent.propTypes = {
        onSetEmbedView: PropTypes.func
    };
    const mapDispatchToProps = dispatch => ({
        onSetEmbedView: view => dispatch(setEmbedView(view))
    });
    return connect(
        null,
        mapDispatchToProps
    )(EmbedViewComponent);
};

export {
    CTEmbedViewHOC as default
};
