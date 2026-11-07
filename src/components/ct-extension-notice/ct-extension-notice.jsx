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
    unsafe: {
        id: 'gui.ctExtensions.unsafe',
        defaultMessage: 'Extension {name} is known to be unsafe, so it will not run. Its blocks are shown but do nothing.',
        description: 'Banner when a project (usually from PenguinMod) uses an extension CodeTorch never runs, e.g. one that runs arbitrary JavaScript; the project still opens'
    },
    unsupported: {
        id: 'gui.ctExtensions.unsupported',
        defaultMessage: 'This project uses {name}, which isn\'t supported yet. Its blocks are shown but do nothing.',
        description: 'Banner when a project (usually from PenguinMod) uses an extension CodeTorch does not have; the project still opens'
    },
    unsafeBlocks: {
        id: 'gui.ctExtensions.unsafeBlocks',
        defaultMessage: 'This project uses JavaScript blocks, which are known to be unsafe, so they will not run. They are shown but do nothing.',
        description: 'Banner when a project from PenguinMod contains its "run JavaScript" blocks; the project still opens'
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

/**
 * @param {{placeholder: boolean, reason: ?string}} notice a refusal
 * @returns {object} which message describes it
 */
const noticeMessage = notice => {
    if (notice.reason && messages[notice.reason]) return messages[notice.reason];
    return notice.placeholder ? messages.placeholder : messages.refused;
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
                            {intl.formatMessage(noticeMessage(n), {
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
