import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import styles from './ct-pm-settings.css';

import {isAdvancedBlocksAllowed, isAdvancedEverythingAllowed} from '../../lib/ct-url-flags.js';

/* eslint-disable max-len */
const messages = defineMessages({
    lockedByBlocks: {
        id: 'ct.advancedBlocks.lockedByBlocks',
        defaultMessage: 'Due to the fact that this project uses {kind} blocks, this setting cannot currently be disabled. Remove all related blocks to be able to turn this setting off.',
        description: 'Shown under an Advanced blocks setting the project uses; {kind} is the kind of blocks (Snap, advanced, extension, loosely placed)'
    },
    kindSnap: {id: 'ct.advancedBlocks.kindSnap', defaultMessage: 'Snap!', description: '{kind} in "this project uses {kind} blocks": blocks of Snap! related behavior'},
    kindAdvanced: {id: 'ct.advancedBlocks.kindAdvanced', defaultMessage: 'advanced', description: '{kind} in "this project uses {kind} blocks": Advanced blocks'},
    kindExtensions: {id: 'ct.advancedBlocks.kindExtensions', defaultMessage: 'extension', description: '{kind} in "this project uses {kind} blocks": blocks of the extra extensions'},
    kindLoose: {id: 'ct.advancedBlocks.kindLoose', defaultMessage: 'loosely placed', description: '{kind} in "this project uses {kind} blocks": round reporters placed in hexagonal slots'},
    lockedNeededBy: {
        id: 'ct.advancedBlocks.lockedNeededBy',
        defaultMessage: 'Due to the fact that "{setting}" is on and needs this setting, it cannot currently be disabled. Turn off "{setting}" first to be able to turn this setting off.',
        description: 'Shown under the Advanced blocks setting while another setting that needs it is on; {setting} is that setting\'s name'
    },
    lockedImported: {
        id: 'ct.advancedBlocks.lockedImported',
        defaultMessage: 'Due to the fact that this project was brought over from {platform}, this setting cannot be disabled.',
        description: 'Shown under a setting an imported project needs; {platform} is the editor it came from (PenguinMod, Snap!)'
    },
    snapCredit: {
        id: 'ct.advancedBlocks.snapCredit',
        // eslint-disable-next-line max-len
        defaultMessage: 'Snap! is made by Jens Mönig and Brian Harvey and is copyright its authors (snap.berkeley.edu). CodeTorch is not affiliated with or endorsed by Snap!: "Snap! related behavior" only makes projects work the way Snap! projects do.',
        description: 'Credit line under the Advanced blocks settings; keep the names and snap.berkeley.edu as they are'
    },
    snapName: {
        id: 'ct.advancedBlocks.snap',
        defaultMessage: 'Snap! related behavior',
        description: 'Setting that adds Snap!-style extensions to the extension library'
    },
    advancedName: {
        id: 'ct.advancedBlocks.advanced',
        defaultMessage: 'Advanced blocks',
        description: 'Advanced blocks setting'
    },
    extensionsName: {
        id: 'ct.advancedBlocks.extensions',
        defaultMessage: 'Extra extensions',
        description: 'Setting that adds more extensions to the extension library'
    },
    confusingRead: {
        id: 'ct.advancedBlocks.confusingRead',
        defaultMessage: 'If you find {setting} confusing, read: {article}',
        description: 'Under a setting\'s help text; {setting} is the setting\'s name, {article} a link to the help article, titled in English like the article'
    },
    closedByPolicy: {
        id: 'ct.advancedBlocks.closedByPolicy',
        defaultMessage: 'Your school has turned Advanced blocks off. Projects that already use them still work.',
        description: 'Shown in the settings when an EDU policy does not allow Advanced blocks'
    }
});
/* eslint-enable max-len */

const HELP_ARTICLES = {
    advanced: {url: 'https://help.codetorch.net/articles/advanced-blocks', title: 'Advanced Blocks'},
    snap: {url: 'https://help.codetorch.net/articles/snap-related-behavior', title: 'Snap! Related Behavior'}
};

const ArticleLink = ({article, setting}) => (
    <p className={styles.article}>
        <FormattedMessage
            {...messages.confusingRead}
            values={{
                setting,
                article: (
                    <a
                        href={HELP_ARTICLES[article].url}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {HELP_ARTICLES[article].title}
                    </a>
                )
            }}
        />
    </p>
);
ArticleLink.propTypes = {
    article: PropTypes.oneOf(Object.keys(HELP_ARTICLES)).isRequired,
    setting: PropTypes.string.isRequired
};

class CTAdvancedBlocksSettings extends React.Component {
    constructor (props) {
        super(props);
        this.state = {snapshot: this.readSnapshot()};
        this.handleChanged = this.handleChanged.bind(this);
        this.handleAdvanced = this.handleAdvanced.bind(this);
        this.handleLoose = this.handleLoose.bind(this);
        this.handleExtensions = this.handleExtensions.bind(this);
        this.handleSnap = this.handleSnap.bind(this);
        this.handleEverything = this.handleEverything.bind(this);
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
    handleEverything (e) {
        this.set('everything', e.target.checked);
    }
    handleSnap (e) {
        this.set('snap', e.target.checked);
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
        const fromSnap = !!(snapshot.origin && snapshot.origin.platform === 'Snap');
        const lockedNote = name => {
            if (name === 'snap' && fromSnap) return intl.formatMessage(messages.lockedImported, {platform: 'Snap!'});
            if (snapshot.uses[name]) {
                const kind = {
                    snap: messages.kindSnap,
                    advanced: messages.kindAdvanced,
                    extensions: messages.kindExtensions,
                    loose: messages.kindLoose
                }[name];
                return intl.formatMessage(messages.lockedByBlocks, {kind: intl.formatMessage(kind)});
            }
            if (name === 'everything') {
                return snapshot.origin && !fromSnap ?
                    intl.formatMessage(messages.lockedImported, {platform: 'PenguinMod'}) : null;
            }
            if (name !== 'advanced') return null;
            if (snapshot.origin) {
                return intl.formatMessage(messages.lockedImported, {platform: fromSnap ? 'Snap!' : 'PenguinMod'});
            }
            if (snapshot.effective.snap) {
                return intl.formatMessage(messages.lockedNeededBy, {setting: intl.formatMessage(messages.snapName)});
            }
            if (snapshot.effective.extensions) {
                const setting = intl.formatMessage(messages.extensionsName);
                return intl.formatMessage(messages.lockedNeededBy, {setting});
            }
            return null;
        };
        const locked = name => lockedNote(name) !== null;
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
                        disabled={locked('advanced')}
                        note={lockedNote('advanced')}
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
                                <ArticleLink
                                    article="advanced"
                                    setting={intl.formatMessage(messages.advancedName)}
                                />
                            </React.Fragment>
                        }
                    />
                )}
                {allowed && snapshot.effective.advanced && isAdvancedEverythingAllowed() && (
                    <BooleanSetting
                        value={!!snapshot.effective.everything}
                        onChange={this.handleEverything}
                        disabled={locked('everything')}
                        note={lockedNote('everything')}
                        label={
                            <FormattedMessage
                                defaultMessage="Show every advanced block"
                                description="Setting that shows all advanced blocks instead of the essential ones"
                                id="ct.advancedBlocks.everything"
                            />
                        }
                        help={
                            <FormattedMessage
                                // eslint-disable-next-line max-len
                                defaultMessage="Off: the palette shows the essential advanced blocks, the ones used to teach coding. On: every advanced block, including device, browser and other rarely needed ones. Blocks a project already uses always keep working. Saved with this project."
                                description="Help for the Show every advanced block setting"
                                id="ct.advancedBlocks.everythingHelp"
                            />
                        }
                    />
                )}
                {allowed && (
                    <BooleanSetting
                        value={snapshot.effective.loose}
                        onChange={this.handleLoose}
                        disabled={locked('loose')}
                        note={lockedNote('loose')}
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
                            </React.Fragment>
                        }
                    />
                )}
                {allowed && (
                    <BooleanSetting
                        value={snapshot.effective.extensions}
                        onChange={this.handleExtensions}
                        disabled={locked('extensions')}
                        note={lockedNote('extensions')}
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
                            </React.Fragment>
                        }
                    />
                )}
                {allowed && (
                    <BooleanSetting
                        value={!!snapshot.effective.snap}
                        onChange={this.handleSnap}
                        disabled={locked('snap')}
                        note={lockedNote('snap')}
                        label={
                            <FormattedMessage
                                defaultMessage="Snap! related behavior"
                                description="Setting that adds Snap!-style extensions to the extension library"
                                id="ct.advancedBlocks.snap"
                            />
                        }
                        help={
                            <React.Fragment>
                                <FormattedMessage
                                    // eslint-disable-next-line max-len
                                    defaultMessage="Adds what Snap! projects use: blocks as values (rings), call, map, keep and combine, lists inside lists and maths on whole lists. The blocks go in Operators, Control and Variables. Turns on Advanced blocks too. Saved with this project."
                                    description="Help for the Snap! related behavior setting"
                                    id="ct.advancedBlocks.snapHelp"
                                />
                                <ArticleLink
                                    article="snap"
                                    setting={intl.formatMessage(messages.snapName)}
                                />
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
                {allowed && (
                    <p className={styles.credit}>{intl.formatMessage(messages.snapCredit)}</p>
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
