/**
 * Load the module with a particular trusted host configured.
 * @param {string|undefined} trustedHost Value of TRUSTED_IFRAME_HOST for this build
 * @returns {object} The freshly loaded module
 */
const loadWithHost = trustedHost => {
    let loaded;
    jest.isolateModules(() => {
        jest.doMock('../../../src/lib/brand', () => ({
            TRUSTED_IFRAME_HOST: trustedHost
        }));
        loaded = require('../../../src/lib/ct-parent-message');
    });
    return loaded;
};

describe('ct-parent-message', () => {
    describe('getParentTargetOrigin', () => {
        test('uses the configured host', () => {
            expect(loadWithHost('https://codetorch.net').getParentTargetOrigin())
                .toBe('https://codetorch.net');
        });

        test('reduces the configured host to its origin', () => {
            expect(loadWithHost('https://codetorch.net/some/path?a=b').getParentTargetOrigin())
                .toBe('https://codetorch.net');
        });

        test('falls back to any page when no host is configured', () => {
            expect(loadWithHost('').getParentTargetOrigin()).toBe('*');
            expect(loadWithHost(undefined).getParentTargetOrigin()).toBe('*');
        });

        test('falls back to any page when the host is not a usable URL', () => {
            expect(loadWithHost('codetorch.net').getParentTargetOrigin()).toBe('*');
            expect(loadWithHost('data:text/plain,x').getParentTargetOrigin()).toBe('*');
        });
    });

    describe('postMessageToParent', () => {
        test('addresses the embedding page by origin', () => {
            const postMessage = jest.fn();
            global.window = {parent: {postMessage}};
            loadWithHost('https://codetorch.net').postMessageToParent({hello: 'world'});
            expect(postMessage).toHaveBeenCalledWith({hello: 'world'}, 'https://codetorch.net', undefined);
            delete global.window;
        });

        test('addresses any page when no host is configured', () => {
            const postMessage = jest.fn();
            global.window = {parent: {postMessage}};
            loadWithHost('').postMessageToParent({hello: 'world'});
            expect(postMessage).toHaveBeenCalledWith({hello: 'world'}, '*', undefined);
            delete global.window;
        });
    });
});
