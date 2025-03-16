import React from 'react';
import styles from './invalid-embed.css';
import {APP_NAME} from '../../lib/brand';

// Note that when this component is used, the rest of scratch-gui is not being run, so don't
// use redux, themes, translations, etc.

// We also can't be certain that the iframe sandbox will let us open up links, so make sure
// all the links can be manually visited if necessary.

const InvalidEmbed = () => (
    <div className={styles.container}>
        <h1>{`Invalid ${APP_NAME} Embed :(`}</h1>
        <p>
            {`You must run this project within an <iframe></iframe> for it to work properly.`}
        </p>
    </div>
);

export default InvalidEmbed;
