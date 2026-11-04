import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {getExtensionNotices, subscribeExtensionNotices} from '../../lib/ct-extension-restrictions.js';
import styles from './ct-extension-notice.css';

/* eslint-disable max-len */
const messages = defineMessages({
    placeholder: {
        id: 'gui.ctExtensions.placeholder',
        defaultMessage: 'This project uses an extension that isn\'t available here: {name}. Its blocks are shown but won\'t run.',
        description: 'Banner in the reduced editor when a project uses an extension this editor refuses to load; the project still opens'
    },
    refused: {
        id: 'gui.ctExtensions.refused',
        defaultMessage: 'This editor can\'t load the extension {name}.',
        description: 'Banner when an extension was refused (for example one shared by a collaborator)'
    },
    dismiss: {
        id: 'gui.ctExtensions.dismiss',
        defaultMessage: 'Dismiss',
        description: 'Button that hides the extension notice banner'
    }
});
/* eslint-enable max-len */

export const noticeName = notice => {
    if (notice.id) return notice.id;
    const url = `${notice.url || ''}`;
    if (url.startsWith('data:')) return url.slice(0, 40);
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean)
            .pop();
        return last ? `${u.host}/…/${last}` : u.host;
    } catch (e) {
        return url.slice(0, 80);
    }
};

class CTExtensionNotice extends React.Component {
    constructor (props) {
        super(props);
        this.state = {notices: getExtensionNotices(), dismissed: 0};
        this.handleDismiss = this.handleDismiss.bind(this);
    }
    componentDidMount () {
        this.unsubscribe = subscribeExtensionNotices(notices => this.setState({notices}));
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
    }
    handleDismiss () {
        this.setState(s => ({dismissed: s.notices.length}));
    }
    render () {
        const {intl} = this.props;
        const {notices, dismissed} = this.state;
        if (notices.length <= dismissed) return null;
        return (
            <div
                className={styles.notice}
                data-testid="ct-extension-notice"
                role="status"
            >
                <div className={styles.lines}>
                    {notices.map(n => (
                        <div
                            data-placeholder={n.placeholder ? 'true' : 'false'}
                            key={n.key}
                        >
                            {intl.formatMessage(n.placeholder ? messages.placeholder : messages.refused, {
                                name: noticeName(n)
                            })}
                        </div>
                    ))}
                </div>
                <button
                    aria-label={intl.formatMessage(messages.dismiss)}
                    className={styles.dismiss}
                    title={intl.formatMessage(messages.dismiss)}
                    onClick={this.handleDismiss}
                >
                    {'×'}
                </button>
            </div>
        );
    }
}

CTExtensionNotice.propTypes = {
    intl: intlShape.isRequired
};

export {messages};
export default injectIntl(CTExtensionNotice);
