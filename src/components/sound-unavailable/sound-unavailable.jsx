import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import styles from './sound-unavailable.css';

/*
 * Shown in place of the sound editor when a sound's bytes never arrived.
 */
const SoundUnavailable = ({name}) => (
    <div className={styles.container}>
        <div className={styles.name}>{name}</div>
        <div className={styles.detail}>
            <FormattedMessage
                defaultMessage="This sound didn't finish loading, so it can't be edited yet. Try reloading the project."
                description="Shown in place of the sound editor when a sound's audio data could not be fetched."
                id="gui.soundEditor.unavailable"
            />
        </div>
    </div>
);

SoundUnavailable.propTypes = {
    name: PropTypes.string
};

export default SoundUnavailable;
