let mockMinimalMode = false;

jest.mock('../../../src/lib/brand.js', () => ({
    API_HOST: 'https://api.codetorch.net',
    ASSET_HOST: 'https://assets.codetorch.net',
    EXTENSION_HOST: 'https://blockextensions.codetorch.net',
    TRUSTED_IFRAME_HOST: 'https://codetorch.net'
}));

jest.mock('../../../src/lib/ct-url-flags', () => ({
    isMinimalMode: () => mockMinimalMode,
    isJITDisabledByURL: () => false,
    isCursorChatEnabled: () => true,
    applyPersistentFlags: params => params
}));

import {
    TWSecurityManagerComponent,
    isTrustedExtension,
    reducedEditorOrigins
} from '../../../src/containers/tw-security-manager.jsx';

const GALLERY_EXTENSION = 'https://blockextensions.codetorch.net/extensions/example.js';
const PAGE_ORIGIN = 'https://blockcompiler.codetorch.net';

const createSecurityManager = extensionManager => new TWSecurityManagerComponent({
    vm: {
        extensionManager: extensionManager || {
            securityManager: {}
        }
    },
    securityManager: {}
});

/**
 * Replace the modal machinery so that a test can see whether the user was asked anything.
 * @param {object} securityManager The instance under test
 * @param {boolean} answer The answer the imaginary user gives
 * @returns {jest.Mock} The stubbed showModal
 */
const stubModal = (securityManager, answer = false) => {
    const showModal = jest.fn(() => Promise.resolve(answer));
    securityManager.acquireModalLock = jest.fn(() => Promise.resolve({
        showModal,
        releaseLock: jest.fn()
    }));
    return showModal;
};

describe('tw-security-manager', () => {
    beforeEach(() => {
        mockMinimalMode = false;
        global.alert = jest.fn();
        global.location = {origin: PAGE_ORIGIN};
    });

    afterEach(() => {
        delete global.location;
    });

    describe('isTrustedExtension', () => {
        test('trusts extensions served by the API host', () => {
            expect(isTrustedExtension('https://api.codetorch.net/extension.js')).toBe(true);
        });

        test('does not trust a host that merely starts with the API host', () => {
            expect(isTrustedExtension('https://api.codetorch.net.evil.tld/extension.js')).toBe(false);
        });

        test('does not trust an unrelated host', () => {
            expect(isTrustedExtension('https://example.com/extension.js')).toBe(false);
        });
    });

    describe('by default', () => {
        test('trusted extensions are not sandboxed', () => {
            const securityManager = createSecurityManager();
            expect(securityManager.getSandboxMode('https://api.codetorch.net/extension.js')).toBe('unsandboxed');
        });

        test('other extensions are sandboxed instead of refused', () => {
            const securityManager = createSecurityManager();
            expect(securityManager.getSandboxMode('https://example.com/extension.js')).toBe('iframe');
        });

        test('trusted extensions from a project load without asking', async () => {
            const securityManager = createSecurityManager();
            await expect(securityManager.canLoadExtensionFromProject(GALLERY_EXTENSION)).resolves.toBe(true);
        });

        test('the built-in list of third parties can still be fetched from', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, false);

            await expect(securityManager.canFetch('https://extensions.turbowarp.org/a.js')).resolves.toBe(true);
            await expect(securityManager.canFetch('https://raw.githubusercontent.com/a/b/c.txt'))
                .resolves.toBe(true);
            await expect(securityManager.canFetch('https://httpbin.org/get')).resolves.toBe(true);
            expect(showModal).not.toHaveBeenCalled();
        });

        test('an unknown host is still asked about instead of refused', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, true);

            await expect(securityManager.canFetch('https://example.com/x')).resolves.toBe(true);
            await expect(securityManager.canEmbed('https://example.com/frame.html')).resolves.toBe(true);
            expect(showModal).toHaveBeenCalledTimes(2);
        });

        test('a project can still pull in every built-in extension', () => {
            const loadExtensionIdSync = jest.fn(() => 'loaded');
            const extensionManager = {
                securityManager: {},
                loadExtensionURL: jest.fn(() => Promise.resolve('loaded')),
                loadExtensionIdSync
            };
            const securityManager = createSecurityManager(extensionManager);
            securityManager.componentDidMount();

            expect(extensionManager.loadExtensionIdSync('customAchievements')).toBe('loaded');
            expect(extensionManager.loadExtensionIdSync('text2speech')).toBe('loaded');
            expect(loadExtensionIdSync).toHaveBeenCalledTimes(2);
        });

        test('leaving the page is still asked about', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, false);

            await expect(securityManager.canOpenWindow('https://example.com/')).resolves.toBe(false);
            await expect(securityManager.canRedirect('https://example.com/')).resolves.toBe(false);
            expect(showModal).toHaveBeenCalledTimes(2);
        });

        test('camera, microphone, location, notifications and the clipboard are still asked about', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, false);

            await expect(securityManager.canRecordAudio()).resolves.toBe(false);
            await expect(securityManager.canRecordVideo()).resolves.toBe(false);
            await expect(securityManager.canReadClipboard()).resolves.toBe(false);
            await expect(securityManager.canNotify()).resolves.toBe(false);
            await expect(securityManager.canGeolocate()).resolves.toBe(false);
            expect(showModal).toHaveBeenCalledTimes(5);
        });
    });

    describe('in the reduced editor', () => {
        beforeEach(() => {
            mockMinimalMode = true;
        });

        test('extensions from the gallery are still allowed', async () => {
            const securityManager = createSecurityManager();
            expect(securityManager.getSandboxMode(GALLERY_EXTENSION)).toBe('unsandboxed');
            await expect(securityManager.canLoadExtensionFromProject(GALLERY_EXTENSION)).resolves.toBe(true);
        });

        test('extensions from any other origin are refused instead of sandboxed', () => {
            const securityManager = createSecurityManager();
            expect(() => securityManager.getSandboxMode('https://example.com/one.js')).toThrow();
            expect(global.alert).toHaveBeenCalled();
        });

        test('a project may not load an extension from another origin', async () => {
            const securityManager = createSecurityManager();
            await expect(securityManager.canLoadExtensionFromProject('https://example.com/two.js'))
                .resolves.toBe(false);
        });

        test('a project may not load an extension from a data: URL', async () => {
            const securityManager = createSecurityManager();
            await expect(securityManager.canLoadExtensionFromProject('data:application/javascript,alert(1)'))
                .resolves.toBe(false);
        });

        test('a project may not load a restricted built-in extension', async () => {
            const securityManager = createSecurityManager();
            await expect(securityManager.canLoadExtensionFromProject('videoSensing')).resolves.toBe(false);
        });

        test('the extension manager refuses restricted extensions on every code path', async () => {
            const loadExtensionURL = jest.fn(() => Promise.resolve('loaded'));
            const loadExtensionIdSync = jest.fn(() => 'loaded');
            const extensionManager = {
                securityManager: {},
                loadExtensionURL,
                loadExtensionIdSync
            };
            const securityManager = createSecurityManager(extensionManager);
            securityManager.componentDidMount();

            await expect(extensionManager.loadExtensionURL('https://example.com/three.js')).rejects.toThrow();
            await expect(extensionManager.loadExtensionURL('translate')).rejects.toThrow();
            expect(loadExtensionURL).not.toHaveBeenCalled();

            await expect(extensionManager.loadExtensionURL(GALLERY_EXTENSION)).resolves.toBe('loaded');
            expect(loadExtensionURL).toHaveBeenCalledWith(GALLERY_EXTENSION);

            // Built-in extensions that are not restricted still load.
            await expect(extensionManager.loadExtensionURL('pen')).resolves.toBe('loaded');
        });

        test('resources are limited to our own services, without asking', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, true);

            // Our own services.
            await expect(securityManager.canFetch(`${PAGE_ORIGIN}/thing.json`)).resolves.toBe(true);
            await expect(securityManager.canFetch('https://api.codetorch.net/thing.json')).resolves.toBe(true);
            await expect(securityManager.canFetch('https://assets.codetorch.net/a.png')).resolves.toBe(true);
            await expect(securityManager.canFetch(GALLERY_EXTENSION)).resolves.toBe(true);

            // Data the project already carries.
            await expect(securityManager.canFetch('data:text/plain,hello')).resolves.toBe(true);
            await expect(securityManager.canFetch(`blob:${PAGE_ORIGIN}/9c2b`)).resolves.toBe(true);

            // The built-in list of third parties no longer applies.
            await expect(securityManager.canFetch('https://extensions.turbowarp.org/a.js')).resolves.toBe(false);
            await expect(securityManager.canFetch('https://raw.githubusercontent.com/a/b/c.txt'))
                .resolves.toBe(false);
            await expect(securityManager.canFetch('https://api.github.com/repos')).resolves.toBe(false);
            await expect(securityManager.canFetch('https://example.itch.io/game')).resolves.toBe(false);
            await expect(securityManager.canFetch('https://httpbin.org/get')).resolves.toBe(false);

            // Neither does a lookalike host, nor an unrelated one, nor a raw socket.
            await expect(securityManager.canFetch('https://api.codetorch.net.evil.tld/x')).resolves.toBe(false);
            await expect(securityManager.canFetch('https://example.com/x')).resolves.toBe(false);
            await expect(securityManager.canFetch('wss://example.com/socket')).resolves.toBe(false);

            // Not one of those decisions involved the user.
            expect(showModal).not.toHaveBeenCalled();
        });

        test('leaving the page is refused without asking', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, true);

            await expect(securityManager.canOpenWindow('https://example.com/')).resolves.toBe(false);
            await expect(securityManager.canOpenWindow(`${PAGE_ORIGIN}/other`)).resolves.toBe(false);
            await expect(securityManager.canRedirect('https://example.com/')).resolves.toBe(false);
            await expect(securityManager.canRedirect(`${PAGE_ORIGIN}/other`)).resolves.toBe(false);

            expect(showModal).not.toHaveBeenCalled();
        });

        test('camera, microphone, location, notifications and the clipboard are refused', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, true);

            await expect(securityManager.canRecordAudio()).resolves.toBe(false);
            await expect(securityManager.canRecordVideo()).resolves.toBe(false);
            await expect(securityManager.canReadClipboard()).resolves.toBe(false);
            await expect(securityManager.canNotify()).resolves.toBe(false);
            await expect(securityManager.canGeolocate()).resolves.toBe(false);

            expect(showModal).not.toHaveBeenCalled();
        });

        test('only our own services may be embedded', async () => {
            const securityManager = createSecurityManager();
            const showModal = stubModal(securityManager, true);

            await expect(securityManager.canEmbed(`${PAGE_ORIGIN}/frame.html`)).resolves.toBe(true);
            await expect(securityManager.canEmbed('https://assets.codetorch.net/frame.html')).resolves.toBe(true);
            await expect(securityManager.canEmbed('https://example.com/frame.html')).resolves.toBe(false);
            await expect(securityManager.canEmbed('https://extensions.turbowarp.org/frame.html'))
                .resolves.toBe(false);
            // An opaque origin is never one of our services.
            await expect(securityManager.canEmbed('data:text/html,<script>alert(1)</script>'))
                .resolves.toBe(false);

            expect(showModal).not.toHaveBeenCalled();
        });

        test('a host that is not configured is not turned into a hole in the list', () => {
            expect(reducedEditorOrigins()).toEqual([
                PAGE_ORIGIN,
                'https://api.codetorch.net',
                'https://assets.codetorch.net',
                'https://blockextensions.codetorch.net'
            ]);
        });

        test('a project can not pull in a restricted built-in extension', () => {
            const loadExtensionIdSync = jest.fn(() => 'loaded');
            const extensionManager = {
                securityManager: {},
                loadExtensionURL: jest.fn(() => Promise.resolve('loaded')),
                loadExtensionIdSync
            };
            const securityManager = createSecurityManager(extensionManager);
            securityManager.componentDidMount();

            expect(() => extensionManager.loadExtensionIdSync('text2speech')).toThrow();
            expect(() => extensionManager.loadExtensionIdSync('customAchievements')).toThrow();
            expect(loadExtensionIdSync).not.toHaveBeenCalled();
            expect(global.alert).toHaveBeenCalled();

            expect(extensionManager.loadExtensionIdSync('pen')).toBe('loaded');
        });
    });
});
