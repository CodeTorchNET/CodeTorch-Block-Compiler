import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';
import classNames from 'classnames';

import booleanInputIcon from './icon--boolean-input.svg';
import textInputIcon from './icon--text-input.svg';
import labelIcon from './icon--label.svg';
import branchInputIcon from './icon--branch-input.svg';

import styles from './custom-procedures.css';

const messages = defineMessages({
    myblockModalTitle: {
        defaultMessage: 'Make a Block',
        description: 'Title for the modal where you create a custom block.',
        id: 'gui.customProcedures.myblockModalTitle'
    },
    defaultColor: {
        defaultMessage: 'Default color',
        description: 'Tooltip of the swatch that gives a custom block the normal My Blocks color',
        id: 'ct.customProcedures.defaultColor'
    },
    customColor: {
        defaultMessage: 'Custom color',
        description: 'Tooltip of the button that opens a color picker for any custom block color',
        id: 'ct.customProcedures.customColor'
    }
});

const STACK_INPUT_HELP_URL = 'https://help.codetorch.net/articles/stack-inputs';

const PRESET_COLORS = [null, '#4c97ff', '#9966ff', '#cf63cf', '#ffbf00', '#ffab19', '#5cb1d6',
    '#59c059', '#ff8c1a', '#ff661a', '#0fbd8c', '#7f7f7f'];

const ColorRow = props => {
    const isPreset = PRESET_COLORS.indexOf(props.color) !== -1;
    return (
        <div className={styles.colorRow}>
            <span className={styles.colorLabel}>
                <FormattedMessage
                    defaultMessage="Block color"
                    description="Label of the row of colors a custom block can have"
                    id="ct.customProcedures.blockColor"
                />
            </span>
            {PRESET_COLORS.map(c => (
                <button
                    aria-label={c ? c : props.intl.formatMessage(messages.defaultColor)}
                    aria-pressed={props.color === c}
                    className={classNames(styles.colorSwatch, {
                        [styles.colorSwatchSelected]: props.color === c,
                        [styles.colorSwatchDefault]: !c
                    })}
                    key={c || 'default'}
                    style={c ? {background: c} : null}
                    title={c ? null : props.intl.formatMessage(messages.defaultColor)}
                    type="button"
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => props.onChangeColor(c)}
                />
            ))}
            <label
                className={classNames(styles.colorSwatch, styles.colorSwatchCustom, {
                    [styles.colorSwatchSelected]: !isPreset
                })}
                style={isPreset ? null : {background: props.color}}
                title={props.intl.formatMessage(messages.customColor)}
            >
                <input
                    aria-label={props.intl.formatMessage(messages.customColor)}
                    className={styles.colorInput}
                    type="color"
                    value={props.color || '#ff6680'}
                    // eslint-disable-next-line react/jsx-no-bind
                    onChange={e => props.onChangeColor(e.target.value)}
                />
            </label>
        </div>
    );
};

ColorRow.propTypes = {
    color: PropTypes.string,
    intl: intlShape,
    onChangeColor: PropTypes.func.isRequired
};

const CustomProcedures = props => (
    <Modal
        className={styles.modalContent}
        contentLabel={props.intl.formatMessage(messages.myblockModalTitle)}
        onRequestClose={props.onCancel}
        id="customProceduresModal"
    >
        <Box
            className={styles.workspace}
            componentRef={props.componentRef}
        />
        <Box className={styles.body}>
            <div className={styles.optionsRow}>
                <div
                    className={styles.optionCard}
                    role="button"
                    tabIndex="0"
                    onClick={props.onAddTextNumber}
                >
                    <img
                        className={styles.optionIcon}
                        src={textInputIcon}
                        draggable={false}
                    />
                    <div className={styles.optionTitle}>
                        <FormattedMessage
                            defaultMessage="Add an input"
                            description="Label for button to add a number/text input"
                            id="gui.customProcedures.addAnInputNumberText"
                        />
                    </div>
                    <div className={styles.optionDescription}>
                        <FormattedMessage
                            defaultMessage="number or text"
                            description="Description of the number/text input type"
                            id="gui.customProcedures.numberTextType"
                        />
                    </div>
                </div>
                <div
                    className={styles.optionCard}
                    role="button"
                    tabIndex="0"
                    onClick={props.onAddBoolean}
                >
                    <img
                        className={styles.optionIcon}
                        src={booleanInputIcon}
                        draggable={false}
                    />
                    <div className={styles.optionTitle}>
                        <FormattedMessage
                            defaultMessage="Add an input"
                            description="Label for button to add a boolean input"
                            id="gui.customProcedures.addAnInputBoolean"
                        />
                    </div>
                    <div className={styles.optionDescription}>
                        <FormattedMessage
                            defaultMessage="boolean"
                            description="Description of the boolean input type"
                            id="gui.customProcedures.booleanType"
                        />
                    </div>
                </div>
                {props.onAddBranch ? (
                    <div
                        className={styles.optionCard}
                        role="button"
                        tabIndex="0"
                        onClick={props.onAddBranch}
                    >
                        <img
                            className={styles.optionIcon}
                            src={branchInputIcon}
                            draggable={false}
                        />
                        <div className={styles.optionTitle}>
                            <FormattedMessage
                                defaultMessage="Add an input"
                                description="Label for button to add a C-shaped input (a stack of blocks)"
                                id="ct.customProcedures.addAnInputBranch"
                            />
                        </div>
                        <div className={styles.optionDescription}>
                            <FormattedMessage
                                defaultMessage="stack of blocks"
                                description="Description of the C-shaped input type: the input is a stack of blocks"
                                id="ct.customProcedures.branchType"
                            />
                        </div>
                    </div>
                ) : null}
                <div
                    className={styles.optionCard}
                    role="button"
                    tabIndex="0"
                    onClick={props.onAddLabel}
                >
                    <img
                        className={styles.optionIcon}
                        src={labelIcon}
                        draggable={false}
                    />
                    <div className={styles.optionTitle}>
                        <FormattedMessage
                            defaultMessage="Add a label"
                            description="Label for button to add a label"
                            id="gui.customProcedures.addALabel"
                        />
                    </div>
                </div>
            </div>
            {props.onAddBranch ? (
                <div className={styles.helpRow}>
                    <a
                        className={styles.helpLink}
                        href={STACK_INPUT_HELP_URL}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        <FormattedMessage
                            defaultMessage="What's a stack input?"
                            description="Link to a help article on the C-shaped (stack of blocks) custom block input"
                            id="ct.customProcedures.stackInputHelp"
                        />
                    </a>
                </div>
            ) : null}
            {props.onChangeColor ? (
                <ColorRow
                    color={props.color}
                    intl={props.intl}
                    onChangeColor={props.onChangeColor}
                />
            ) : null}
            <div className={styles.checkboxRow}>
                <label>
                    <input
                        checked={props.warp}
                        type="checkbox"
                        onChange={props.onToggleWarp}
                    />
                    <FormattedMessage
                        defaultMessage="Run without screen refresh"
                        description="Label for checkbox to run without screen refresh"
                        id="gui.customProcedures.runWithoutScreenRefresh"
                    />
                </label>
            </div>
            <Box className={styles.buttonRow}>
                <button
                    className={styles.cancelButton}
                    onClick={props.onCancel}
                >
                    <FormattedMessage
                        defaultMessage="Cancel"
                        description="Label for button to cancel custom procedure edits"
                        id="gui.customProcedures.cancel"
                    />
                </button>
                <button
                    className={styles.okButton}
                    onClick={props.onOk}
                >
                    <FormattedMessage
                        defaultMessage="OK"
                        description="Label for button to save new custom procedure"
                        id="gui.customProcedures.ok"
                    />
                </button>
            </Box>
        </Box>
    </Modal>
);

CustomProcedures.propTypes = {
    color: PropTypes.string,
    componentRef: PropTypes.func.isRequired,
    intl: intlShape,
    onAddBoolean: PropTypes.func.isRequired,
    onAddBranch: PropTypes.func,
    onAddLabel: PropTypes.func.isRequired,
    onAddTextNumber: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onChangeColor: PropTypes.func,
    onOk: PropTypes.func.isRequired,
    onToggleWarp: PropTypes.func.isRequired,
    warp: PropTypes.bool.isRequired
};

export default injectIntl(CustomProcedures);
