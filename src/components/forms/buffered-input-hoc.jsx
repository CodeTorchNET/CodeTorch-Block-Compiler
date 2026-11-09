import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

/**
 * Higher Order Component to manage inputs that submit on blur and <enter>
 * @param {React.Component} Input text input that consumes onChange, onBlur, onKeyPress
 * @returns {React.Component} Buffered input that calls onSubmit on blur and <enter>
 */
export default function (Input) {
    class BufferedInput extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleChange',
                'handleFocus',
                'handleKeyPress',
                'handleFlush'
            ]);
            this.state = {
                value: null,
                edited: false
            };
        }
        handleKeyPress (e) {
            if (e.key === 'Enter') {
                this.handleFlush();
                e.target.blur();
            }
        }
        handleFlush () {
            const isNumeric = typeof this.props.value === 'number';
            const validatesNumeric = isNumeric ? !isNaN(this.state.value) : true;
            if (this.state.value !== null && this.state.edited && validatesNumeric) {
                this.props.onSubmit(isNumeric ? Number(this.state.value) : this.state.value);
            }
            this.setState({value: null, edited: false});
        }
        handleFocus (e) {
            if (this.state.value === null && typeof this.props.value !== 'undefined') {
                this.setState({value: this.props.value, edited: false});
            }
            if (this.props.onFocus) this.props.onFocus(e);
        }
        handleChange (e) {
            this.setState({value: e.target.value, edited: true});
        }
        render () {
            const bufferedValue = this.state.value === null ? this.props.value : this.state.value;
            return (
                <Input
                    {...this.props}
                    value={bufferedValue}
                    onBlur={this.handleFlush}
                    onChange={this.handleChange}
                    onFocus={this.handleFocus}
                    onKeyPress={this.handleKeyPress}
                />
            );
        }
    }

    BufferedInput.propTypes = {
        onFocus: PropTypes.func,
        onSubmit: PropTypes.func.isRequired,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    };

    return BufferedInput;
}
