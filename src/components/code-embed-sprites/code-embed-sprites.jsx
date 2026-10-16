import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {FormattedMessage} from 'react-intl';
import VM from 'scratch-vm';

import getCostumeUrl from '../../lib/get-costume-url';

import styles from './code-embed-sprites.css';

/**
 * @param {object} target A sprite or the stage from the targets state
 * @returns {?string} A small picture of its current costume
 */
const thumbnailOf = target => {
    const asset = target.costume && target.costume.asset;
    return asset ? getCostumeUrl(asset) : null;
};

/**
 * The code embed's way to pick whose blocks are shown
 */
class CodeEmbedSprites extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSelect']);
    }
    handleSelect (event) {
        this.props.vm.setEditingTarget(event.currentTarget.dataset.targetId);
    }
    renderChip (target, label) {
        const thumbnail = thumbnailOf(target);
        return (
            <button
                key={target.id}
                type="button"
                className={styles.chip}
                aria-pressed={target.id === this.props.editingTarget}
                data-target-id={target.id}
                onClick={this.handleSelect}
            >
                {thumbnail ? (
                    <img
                        className={styles.thumbnail}
                        src={thumbnail}
                        alt=""
                        draggable={false}
                    />
                ) : null}
                <span className={styles.name}>{label}</span>
            </button>
        );
    }
    render () {
        const {sprites, stage} = this.props;
        const ordered = Object.keys(sprites)
            .map(id => sprites[id])
            .sort((a, b) => a.order - b.order);
        return (
            <div className={styles.sprites}>
                {ordered.map(sprite => this.renderChip(sprite, sprite.name))}
                {stage.id ? this.renderChip(stage, (
                    <FormattedMessage
                        defaultMessage="Stage"
                        description="Label for the stage in the stage selector"
                        id="gui.stageSelector.stage"
                    />
                )) : null}
            </div>
        );
    }
}

CodeEmbedSprites.propTypes = {
    editingTarget: PropTypes.string,
    sprites: PropTypes.objectOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        order: PropTypes.number
    })).isRequired,
    stage: PropTypes.shape({
        id: PropTypes.string
    }).isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage
});

export default connect(mapStateToProps)(CodeEmbedSprites);
