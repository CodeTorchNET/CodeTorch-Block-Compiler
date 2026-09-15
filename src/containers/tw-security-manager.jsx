import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import log from '../lib/log';
import bindAll from 'lodash.bindall';
import SecurityManagerModal from '../components/tw-security-manager-modal/security-manager-modal.jsx';
import SecurityModals from '../lib/tw-security-manager-constants';
import {getPersistedUnsandboxed, setPersistedUnsandboxed} from '../lib/tw-persisted-unsandboxed.js';


import {API_HOST, ASSET_HOST, EXTENSION_HOST} from '../lib/brand.js';
import {isSameOrigin} from '../lib/ct-same-origin.js';
import {isMinimalMode} from '../lib/ct-url-flags.js';
import {
    isExtensionAllowed,
    reportRefusedExtension
} from '../lib/ct-extension-restrictions.js';
/* eslint-disable require-atomic-updates */

/**
 * Set of extension URLs that the user has manually trusted to load unsandboxed.
 */
const extensionsTrustedByUser = new Set();

const manuallyTrustExtension = url => {
    extensionsTrustedByUser.add(url);
};

/**
 * Trusted extensions are loaded automatically and without a sandbox.
 * @param {string} url URL as a string.
 * @returns {boolean} True if the extension can is trusted
 */
const isTrustedExtension = url => (
    // Always trust our official extension repostiory.
    url.startsWith('https://extensions.turbowarp.org/') ||
    url.startsWith('https://blockcompiler.codetorch.net/') ||
    url.startsWith('https://blockextensions.codetorch.net/') ||
    url.startsWith('https://codetorch.net/') ||
    isSameOrigin(url, API_HOST) ||
    // For development.
    url.startsWith('http://localhost:8000/') ||

    extensionsTrustedByUser.has(url)
);

/**
 * Set of fetch resource hosts that were manually trusted by the user.
 * @type {Set<string>}
 */
const fetchHostsTrustedByUser = new Set();

/**
 * Set of hosts manually trusted by the user for embedding.
 * @type {Set<string>}
 */
const embedHostsTrustedByUser = new Set();

/**
 * @param {URL} parsed Parsed URL object
 * @returns {boolean} True if the URL is part of the builtin set of URLs to always trust fetching from.
 */
const isAlwaysTrustedForFetching = parsed => (
    // If we would trust loading an extension from here, we can trust loading resources too.
    isTrustedExtension(parsed.href) ||

    // Any TurboWarp service such as trampoline
    parsed.origin === 'https://turbowarp.org' ||
    parsed.origin.endsWith('.turbowarp.org') ||
    parsed.origin.endsWith('.turbowarp.xyz') ||

    // GitHub API
    // GitHub Pages allows redirects, so not included here.
    parsed.origin === 'https://raw.githubusercontent.com' ||
    parsed.origin === 'https://gist.githubusercontent.com' ||
    parsed.origin === 'https://api.github.com' ||

    // GitLab API
    // GitLab Pages allows redirects, so not included here.
    parsed.origin === 'https://gitlab.com' ||

    // Sourcehut Pages
    parsed.origin.endsWith('.srht.site') ||

    // Itch
    parsed.origin.endsWith('.itch.io') ||

    // GameJolt
    parsed.origin === 'https://api.gamejolt.com' ||

    // httpbin
    parsed.origin === 'https://httpbin.org' ||

    // ScratchDB
    parsed.origin === 'https://scratchdb.lefty.one'
);

const FETCHABLE_PROTOCOLS = [
    'http:',
    'https:',
    'data:',
    'blob:',
    'ws:',
    'wss:'
];

const VISITABLE_PROTOCOLS = [
    // The important one we want to exclude is javascript:
    'http:',
    'https:',
    'data:',
    'blob:',
    'mailto:',
    'steam:',
    'calculator:'
];

/**
 * @param {string} url Original URL string
 * @param {string[]} protocols List of allowed protocols
 * @returns {URL|null} A URL object if it is valid and of a known protocol, otherwise null.
 */
const parseURL = (url, protocols) => {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return null;
    }
    if (!protocols.includes(parsed.protocol)) {
        return null;
    }
    return parsed;
};

/**
 * Origins that the reduced editor may exchange data with. The reduced editor has nobody
 * to answer a prompt, so anything outside of this list is refused instead of asked
 * about.
 * @returns {string[]} List of serialized origins. Never contains opaque origins.
 */
const reducedEditorOrigins = () => {
    const origins = [];
    try {
        if (location.origin && location.origin !== 'null') {
            origins.push(location.origin);
        }
    } catch (e) {
        // No location, for example when running outside of a browser.
    }
    for (const host of [API_HOST, ASSET_HOST, EXTENSION_HOST]) {
        if (!host) {
            // Not configured for this build.
            continue;
        }
        try {
            const origin = new URL(host).origin;
            if (origin !== 'null' && !origins.includes(origin)) {
                origins.push(origin);
            }
        } catch (e) {
            // Not configured with a usable URL.
        }
    }
    return origins;
};

/**
 * @param {URL} parsed Parsed URL object
 * @returns {boolean} True if the reduced editor may talk to this URL's origin.
 */
const isAllowedInReducedEditor = parsed => reducedEditorOrigins().includes(parsed.origin);

let allowedAudio = false;
let allowedVideo = false;
let allowedReadClipboard = false;
let allowedNotify = false;
let allowedGeolocation = false;

/**
 * Property used to make sure the extension manager is only wrapped once.
 */
const RESTRICTION_MARKER = '__restrictedExtensionLoading';

/**
 * Make the extension manager refuse every extension that this editor is not allowed to load,
 * no matter which code path asked for it (the extension library, URL parameters, extensions
 * embedded in a project, or extensions shared by a collaborator)
 * @param {*} extensionManager The VM's extension manager
 */
const restrictExtensionLoading = extensionManager => {
    if (
        !extensionManager ||
        typeof extensionManager.loadExtensionURL !== 'function' ||
        extensionManager[RESTRICTION_MARKER]
    ) {
        return;
    }
    extensionManager[RESTRICTION_MARKER] = true;

    const originalLoadExtensionURL = extensionManager.loadExtensionURL.bind(extensionManager);
    extensionManager.loadExtensionURL = (extensionURL, ...args) => {
        if (!isExtensionAllowed(extensionURL)) {
            return Promise.reject(reportRefusedExtension(extensionURL));
        }
        return originalLoadExtensionURL(extensionURL, ...args);
    };

    // Built-in extensions used by a project are loaded through this instead.
    if (typeof extensionManager.loadExtensionIdSync === 'function') {
        const originalLoadExtensionIdSync = extensionManager.loadExtensionIdSync.bind(extensionManager);
        extensionManager.loadExtensionIdSync = (extensionId, ...args) => {
            if (!isExtensionAllowed(extensionId)) {
                throw reportRefusedExtension(extensionId);
            }
            return originalLoadExtensionIdSync(extensionId, ...args);
        };
    }
};

const SECURITY_MANAGER_METHODS = [
    'getSandboxMode',
    'canLoadExtensionFromProject',
    'canFetch',
    'canOpenWindow',
    'canRedirect',
    'canRecordAudio',
    'canRecordVideo',
    'canReadClipboard',
    'canNotify',
    'canGeolocate',
    'canEmbed',
    'canDownload'
];

class TWSecurityManagerComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAllowed',
            'handleDenied'
        ]);
        bindAll(this, SECURITY_MANAGER_METHODS);
        this.nextModalCallbacks = [];
        this.modalLocked = false;
        this.state = {
            type: null,
            data: null,
            callback: null,
            modalCount: 0
        };
    }

    componentDidMount () {
        const extensionManager = this.props.vm.extensionManager;
        const vmSecurityManager = extensionManager.securityManager;
        const propsSecurityManager = this.props.securityManager;
        for (const method of SECURITY_MANAGER_METHODS) {
            vmSecurityManager[method] = propsSecurityManager[method] || this[method];
        }
        restrictExtensionLoading(extensionManager);
    }

    // eslint-disable-next-line valid-jsdoc
    /**
     * @returns {Promise<() => Promise<boolean>>} Resolves with a function that you can call to show the modal.
     * The resolved function returns a promise that resolves with true if the request was approved.
     */
    async acquireModalLock () {
        // We need a two-step process for showing a modal so that we don't overwrite or overlap modals,
        // and so that multiple attempts to fetch resources from the same origin will all be allowed
        // with just one click. This means that some places have to wait until previous modals are
        // closed before it knows if it needs to display another modal.

        if (this.modalLocked) {
            await new Promise(resolve => {
                this.nextModalCallbacks.push(resolve);
            });
        } else {
            this.modalLocked = true;
        }

        const releaseLock = () => {
            if (this.nextModalCallbacks.length) {
                const nextModalCallback = this.nextModalCallbacks.shift();
                nextModalCallback();
            } else {
                this.modalLocked = false;
                this.setState({
                    // only clear type in case other data needs to be accessed
                    type: null
                });
            }
        };

        const showModal = async (type, data) => {
            const result = await new Promise(resolve => {
                this.setState(oldState => ({
                    type,
                    data,
                    callback: resolve,
                    modalCount: oldState.modalCount + 1
                }));
            });
            releaseLock();
            return result;
        };

        return {
            showModal,
            releaseLock
        };
    }

    handleAllowed () {
        this.state.callback(true);
    }

    handleDenied () {
        this.state.callback(false);
    }

    /**
     * @param {string} url The extension's URL
     * @returns {string} The VM worker mode to use
     */
    getSandboxMode (url) {
        if (!isExtensionAllowed(url)) {
            // Refused, not sandboxed.
            throw reportRefusedExtension(url);
        }
        if (isTrustedExtension(url)) {
            log.info(`Loading extension ${url} unsandboxed`);
            return 'unsandboxed';
        }
        return 'iframe';
    }

    handleChangeUnsandboxed (e) {
        const checked = e.target.checked;
        this.setState(oldState => ({
            data: {
                ...oldState.data,
                unsandboxed: checked
            }
        }));
    }

    /**
     * @param {string} url The extension's URL
     * @returns {Promise<boolean>} Whether the extension can be loaded
     */
    async canLoadExtensionFromProject (url) {
        if (!isExtensionAllowed(url)) {
            // Refused outright, with no way to confirm it.
            reportRefusedExtension(url);
            return false;
        }
        if (isTrustedExtension(url)) {
            log.info(`Loading extension ${url} automatically`);
            return true;
        }
        const {showModal} = await this.acquireModalLock();
        if (url.startsWith('data:')) {
            const allowed = await showModal(SecurityModals.LoadExtension, {
                url,
                unsandboxed: getPersistedUnsandboxed(),
                onChangeUnsandboxed: this.handleChangeUnsandboxed.bind(this)
            });
            if (allowed) {
                setPersistedUnsandboxed(this.state.data.unsandboxed);
            }
            if (allowed && this.state.data.unsandboxed) {
                manuallyTrustExtension(url);
            }
            return allowed;
        }
        return showModal(SecurityModals.LoadExtension, {
            url,
            unsandboxed: false
        });
    }

    /**
     * @param {string} url The resource to fetch
     * @returns {Promise<boolean>} True if the resource is allowed to be fetched
     */
    async canFetch (url) {
        const parsed = parseURL(url, FETCHABLE_PROTOCOLS);
        if (!parsed) {
            return false;
        }
        if (isMinimalMode()) {
            if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
                return true;
            }
            return isAllowedInReducedEditor(parsed);
        }
        if (isAlwaysTrustedForFetching(parsed)) {
            return true;
        }
        const {showModal, releaseLock} = await this.acquireModalLock();
        const host = (
            parsed.protocol === 'http:' ||
            parsed.protocol === 'https:' ||
            parsed.protocol === 'ws:' ||
            parsed.protocol === 'wss:'
        ) ? parsed.host : null;
        if (host && fetchHostsTrustedByUser.has(host)) {
            releaseLock();
            return true;
        }
        const allowed = await showModal(SecurityModals.Fetch, {
            url
        });
        if (host && allowed) {
            fetchHostsTrustedByUser.add(host);
        }
        return allowed;
    }

    /**
     * @param {string} url The website to open
     * @returns {Promise<boolean>} True if the website can be opened
     */
    async canOpenWindow (url) {
        const parsed = parseURL(url, VISITABLE_PROTOCOLS);
        if (!parsed || isMinimalMode()) {
            return false;
        }
        const {showModal} = await this.acquireModalLock();
        return showModal(SecurityModals.OpenWindow, {
            url
        });
    }

    /**
     * @param {string} url The website to redirect to
     * @returns {Promise<boolean>} True if the website can be redirected to
     */
    async canRedirect (url) {
        const parsed = parseURL(url, VISITABLE_PROTOCOLS);
        if (!parsed || isMinimalMode()) {
            return false;
        }
        const {showModal} = await this.acquireModalLock();
        return showModal(SecurityModals.Redirect, {
            url
        });
    }

    /**
     * @returns {Promise<boolean>} True if audio can be recorded
     */
    async canRecordAudio () {
        if (isMinimalMode()) {
            return false;
        }
        if (!allowedAudio) {
            const {showModal} = await this.acquireModalLock();
            allowedAudio = await showModal(SecurityModals.RecordAudio);
        }
        return allowedAudio;
    }

    /**
     * @returns {Promise<boolean>} True if video can be recorded
     */
    async canRecordVideo () {
        if (isMinimalMode()) {
            return false;
        }
        if (!allowedVideo) {
            const {showModal} = await this.acquireModalLock();
            allowedVideo = await showModal(SecurityModals.RecordVideo);
        }
        return allowedVideo;
    }

    /**
     * @returns {Promise<boolean>} True if the clipboard can be read
     */
    async canReadClipboard () {
        if (isMinimalMode()) {
            return false;
        }
        if (!allowedReadClipboard) {
            const {showModal} = await this.acquireModalLock();
            allowedReadClipboard = await showModal(SecurityModals.ReadClipboard);
        }
        return allowedReadClipboard;
    }

    /**
     * @returns {Promise<boolean>} True if the notifications are allowed
     */
    async canNotify () {
        if (isMinimalMode()) {
            return false;
        }
        if (!allowedNotify) {
            const {showModal} = await this.acquireModalLock();
            allowedNotify = await showModal(SecurityModals.Notify);
        }
        return allowedNotify;
    }

    /**
     * @returns {Promise<boolean>} True if geolocation is allowed.
     */
    async canGeolocate () {
        if (isMinimalMode()) {
            return false;
        }
        if (!allowedGeolocation) {
            const {showModal} = await this.acquireModalLock();
            allowedGeolocation = await showModal(SecurityModals.Geolocate);
        }
        return allowedGeolocation;
    }

    /**
     * @param {string} url Frame URL
     * @returns {Promise<boolean>} True if embed is allowed.
     */
    async canEmbed (url) {
        const parsed = parseURL(url, FETCHABLE_PROTOCOLS);
        if (!parsed) {
            return false;
        }
        if (isMinimalMode()) {
            return isAllowedInReducedEditor(parsed);
        }
        const host = (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.host : null;
        const {showModal, releaseLock} = await this.acquireModalLock();
        if (host && embedHostsTrustedByUser.has(host)) {
            releaseLock();
            return true;
        }
        const allowed = await showModal(SecurityModals.Embed, {url});
        if (host && allowed) {
            embedHostsTrustedByUser.add(host);
        }
        return allowed;
    }

    /**
     * @param {string} url URL to download
     * @param {string} name Name to download as
     * @returns {Promise<boolean>} True if allowed
     */
    async canDownload (url, name) {
        const parsed = parseURL(url, FETCHABLE_PROTOCOLS);
        if (!parsed) {
            return false;
        }
        const {showModal} = await this.acquireModalLock();
        return showModal(SecurityModals.Download, {
            url,
            name
        });
    }

    render () {
        if (this.state.type) {
            return (
                <SecurityManagerModal
                    type={this.state.type}
                    data={this.state.data}
                    onAllowed={this.handleAllowed}
                    onDenied={this.handleDenied}
                    key={this.state.modalCount}
                />
            );
        }
        return null;
    }
}

TWSecurityManagerComponent.propTypes = {
    vm: PropTypes.shape({
        extensionManager: PropTypes.shape({
            securityManager: PropTypes.shape(
                SECURITY_MANAGER_METHODS.reduce((obj, method) => {
                    obj[method] = PropTypes.func.isRequired;
                    return obj;
                }, {})
            ).isRequired
        }).isRequired
    }).isRequired,
    securityManager: PropTypes.shape(Object.fromEntries(SECURITY_MANAGER_METHODS.map(i => [i, PropTypes.func])))
};

TWSecurityManagerComponent.defaultProps = {
    securityManager: {}
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

const ConnectedSecurityManagerComponent = connect(
    mapStateToProps,
    mapDispatchToProps
)(TWSecurityManagerComponent);

export {
    ConnectedSecurityManagerComponent as default,
    TWSecurityManagerComponent,
    manuallyTrustExtension,
    isTrustedExtension,
    reducedEditorOrigins
};
