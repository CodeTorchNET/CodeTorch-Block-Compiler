import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import {isAdvancedBlocksAllowed} from '../../lib/ct-url-flags.js';

/* eslint-disable max-len */
const messages = defineMessages({
    usedByProject: {
        id: 'ct.advancedBlocks.usedByProject',
        defaultMessage: 'This project uses these blocks, so this stays on.',
        description: 'Shown under an Advanced blocks setting that cannot be turned off because the project already uses it'
    },
    closedByPolicy: {
        id: 'ct.advancedBlocks.closedByPolicy',
        defaultMessage: 'Your school has turned Advanced blocks off. Projects that already use them still work.',
        description: 'Shown in the settings when an EDU policy does not allow Advanced blocks'
    }
});
/* eslint-enable max-len */

class CTAdvancedBlocksSettings extends React.Component {
    constructor (props) {
        super(props);
        this.state = {snapshot: this.readSnapshot()};
        this.handleChanged = this.handleChanged.bind(this);
        this.handleAdvanced = this.handleAdvanced.bind(this);
        this.handleLoose = this.handleLoose.bind(this);
        this.handleExtensions = this.handleExtensions.bind(this);
        this.handleAnyType = this.handleAnyType.bind(this);
        this.handleCodeTorchBehaviour = this.handleCodeTorchBehaviour.bind(this);
    }
    componentDidMount () {
        if (this.props.vm) this.props.vm.runtime.on('CT_PM_CHANGED', this.handleChanged);
    }
    componentWillUnmount () {
        if (this.props.vm) this.props.vm.runtime.off('CT_PM_CHANGED', this.handleChanged);
    }
    readSnapshot () {
        const ctPm = this.props.vm && this.props.vm.runtime.ctPm;
        return ctPm ? ctPm.refresh() : null;
    }
    handleChanged (snapshot) {
        this.setState({snapshot});
    }
    set (name, value) {
        this.props.vm.runtime.ctPm.setSetting(name, value);
    }
    handleAdvanced (e) {
        this.set('advanced', e.target.checked);
    }
    handleLoose (e) {
        this.set('loose', e.target.checked);
    }
    handleExtensions (e) {
        this.set('extensions', e.target.checked);
    }
    handleAnyType (e) {
        this.set('anyType', e.target.checked);
    }
    handleCodeTorchBehaviour (e) {
        this.set('quirks', !e.target.checked);
    }
    render () {
        const {snapshot} = this.state;
        if (!snapshot) return null;
        const {BooleanSetting, Header, intl} = this.props;
        const allowed = isAdvancedBlocksAllowed();
        const usedNote = <p>{intl.formatMessage(messages.usedByProject)}</p>;
        return (
            <React.Fragment>
                <Header>
                    <FormattedMessage
                        defaultMessage="Advanced blocks"
                        description="Settings modal section"
                        id="ct.advancedBlocks.section"
                    />
                </Header>
                {!allowed && (
                    <p data-testid="ct-advanced-blocks-closed">
                        {intl.formatMessage(messages.closedByPolicy)}
                    </p>
                )}
                {allowed && (
                    <BooleanSetting
                        value={snapshot.effective.advanced}
                        onChange={this.handleAdvanced}
                        label={
                            <FormattedMessage
                                defaultMessage="Advanced blocks"
                                description="Advanced blocks setting"
                                id="ct.advancedBlocks.advanced"
                            />
                        }
                        help={
                            <React.Fragment>
                                <FormattedMessage
                                    // eslint-disable-next-line max-len
                                    defaultMessage="Adds extra blocks to the palette, such as else if, switch, try/catch, more operators and list blocks. Saved with this project."
                                    description="Advanced blocks setting help"
                                    id="ct.advancedBlocks.advancedHelp"
                                />
                                {snapshot.uses.advanced && !snapshot.explicit.advanced && usedNote}
                            </React.Fragment>
                        }
                    />
                )}
                {allowed && (
                    <BooleanSetting
                        value={snapshot.effective.loose}
                        onChange={this.handleLoose}
                        label={
                            <FormattedMessage
                                defaultMessage="Loose block shapes"
                                description="Loose block shapes setting"
                                id="ct.advancedBlocks.loose"
                            />
                        }
                        help={
                            <React.Fragment>
                                <FormattedMessage
                                    // eslint-disable-next-line max-len
                                    defaultMessage="Lets round reporter blocks go into hexagonal (true/false) slots. Saved with this project."
                                    description="Loose block shapes setting help"
                                    id="ct.advancedBlocks.looseHelp"
                                />
                                {snapshot.uses.loose && !snapshot.explicit.loose && usedNote}
                            </React.Fragment>
                        }
                    />
                )}
                {allowed && (
                    <BooleanSetting
                        value={snapshot.effective.extensions}
                        onChange={this.handleExtensions}
                        label={
                            <FormattedMessage
                                defaultMessage="Extra extensions"
                                description="Setting that adds more extensions to the extension library"
                                id="ct.advancedBlocks.extensions"
                            />
                        }
                        help={
                            <React.Fragment>
                                <FormattedMessage
                                    // eslint-disable-next-line max-len
                                    defaultMessage="Adds more extensions to the extension library, such as tweening, timers and camera controls. Turns on Advanced blocks too. Saved with this project."
                                    description="Help for the Extra extensions setting"
                                    id="ct.advancedBlocks.extensionsHelp"
                                />
                                {snapshot.uses.extensions && !snapshot.explicit.extensions && usedNote}
                            </React.Fragment>
                        }
                    />
                )}
                {allowed && (snapshot.effective.extensions || snapshot.explicit.anyType) && (
                    <BooleanSetting
                        value={snapshot.effective.anyType}
                        onChange={this.handleAnyType}
                        label={
                            <FormattedMessage
                                defaultMessage="Allow any block in typed inputs (not recommended)"
                                // eslint-disable-next-line max-len
                                description="Setting that turns off the check on inputs that only take one kind of value"
                                id="ct.advancedBlocks.anyType"
                            />
                        }
                        help={
                            <FormattedMessage
                                // eslint-disable-next-line max-len
                                defaultMessage="Some extension inputs only take one kind of value, such as an array or a vector, and refuse other blocks. Turn this on only if blocks in a project from PenguinMod won't snap where they did there. Saved with this project."
                                description="Help for the Allow any block in typed inputs setting"
                                id="ct.advancedBlocks.anyTypeHelp"
                            />
                        }
                    />
                )}
                {snapshot.origin && (
                    <BooleanSetting
                        value={!snapshot.quirks}
                        onChange={this.handleCodeTorchBehaviour}
                        label={
                            <FormattedMessage
                                defaultMessage="Use CodeTorch behaviour"
                                description="Setting for projects imported from PenguinMod"
                                id="ct.advancedBlocks.codeTorchBehaviour"
                            />
                        }
                        help={
                            <FormattedMessage
                                // eslint-disable-next-line max-len
                                defaultMessage="This project came from PenguinMod. While this is off, a few blocks behave the way they did there, so the project runs as it did before. Turn it on once the project works without them."
                                description="Help for the Use CodeTorch behaviour setting"
                                id="ct.advancedBlocks.codeTorchBehaviourHelp"
                            />
                        }
                    />
                )}
            </React.Fragment>
        );
    }
}

CTAdvancedBlocksSettings.propTypes = {
    intl: intlShape,
    vm: PropTypes.shape({
        runtime: PropTypes.object
    }),
    BooleanSetting: PropTypes.elementType.isRequired,
    Header: PropTypes.elementType.isRequired
};

export {messages};
export default injectIntl(CTAdvancedBlocksSettings);
