import React from 'react';
import bindAll from 'lodash.bindall';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import styles from './disconnected-modal.css';

class DisconnectedModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleReload'
        ]);
    }

    handleReload () {
        if (window.top === window.self) {
            window.location.reload();
        } else {
            window.parent.postMessage({type: 'block-compiler-action', action: 'reload'}, '*');
        }
    }

    render () {
        return (
            <Modal
                fullScreen
                className={styles.modalContent}
                contentLabel={'Collaboration Disconnected'}
                id="collaborationDisconnected"
                onRequestClose={this.handleReload}
            >
                <Box className={styles.body}>
                    <div className={styles.contentContainer}>
                        <h1 className={styles.title}>
                            {'Collaboration Disconnected'}
                        </h1>
                        <p className={styles.message}>
                            {'You have been disconnected due to inactivity.'}
                            <br />
                            {'Please reload the page to reconnect to the collaboration session.'}
                        </p>
                        <Box className={styles.buttonRow}>
                            <button
                                className={styles.reloadButton}
                                onClick={this.handleReload}
                            >
                                {'Reload Page'}
                            </button>
                        </Box>
                    </div>
                </Box>
            </Modal>
        );
    }
}

export default DisconnectedModal;
