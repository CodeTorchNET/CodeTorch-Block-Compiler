import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import { injectIntl, intlShape, defineMessages } from 'react-intl';
import VM from 'scratch-vm';


import { getSpriteLibrary } from '../lib/libraries/tw-async-libraries.js';
import randomizeSpritePosition from '../lib/randomize-sprite-position.js';
import spriteTags from '../lib/libraries/sprite-tags.js';

import LibraryComponent from '../components/library/library.jsx';

import AIBlob from '../components/ai-blob/ai-blob.jsx'

import Modal from '../containers/modal.jsx';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Sprite',
        description: 'Heading for the sprite library',
        id: 'gui.spriteLibrary.chooseASprite'
    }
});

class AIModal extends React.PureComponent {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
        this.state = {
            data: getSpriteLibrary()
        };
    }
    componentDidMount() {
        if (this.state.data.then) {
            this.state.data.then(data => this.setState({
                data
            }));
        }
    }
    handleItemSelect(item) {
        // Randomize position of library sprite
        randomizeSpritePosition(item);
        this.props.vm.addSprite(JSON.stringify(item)).then(() => {
            this.props.onActivateBlocksTab();
        });
    }
    render() {
        return (
            <Modal
                fullScreen
                contentLabel={this.props.title}
                id={this.props.id}
                onRequestClose={this.handleClose}
            >
                <div style={{ marginLeft: 'auto', marginRight: 'auto', width: 'fit-content' }}>
                    <AIBlob
                    />
                    <p>Describe your image</p>
                </div>
            </Modal>
        );
    }
}

AIModal.propTypes = {
    intl: intlShape.isRequired,
    onActivateBlocksTab: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(AIModal);
