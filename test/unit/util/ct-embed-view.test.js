import {
    parseEmbedView,
    readEmbedViewFromParams,
    isTrustedEmbedMessage,
    readEmbedViewFromMessage
} from '../../../src/lib/ct-embed-view';
import modeReducer, {applyEmbedView, setEmbedView, modeInitialState} from '../../../src/reducers/mode';

const embeddedMode = {
    isEmbedded: true,
    isFullScreen: false,
    isPlayerOnly: true,
    isCodeEmbed: false,
    isBlocksOnlyEmbed: false,
    hasEverEnteredEditor: false
};

describe('ct-embed-view', () => {
    describe('parseEmbedView', () => {
        test('only "code" and "blocks" open a code view', () => {
            expect(parseEmbedView('code')).toBe('code');
            expect(parseEmbedView(' Code ')).toBe('code');
            expect(parseEmbedView('blocks')).toBe('blocks');
            expect(parseEmbedView('player')).toBe('player');
            expect(parseEmbedView('editor')).toBe('player');
            expect(parseEmbedView(null)).toBe('player');
            expect(parseEmbedView(undefined)).toBe('player');
        });

        test('reads ?view= from the page URL', () => {
            expect(readEmbedViewFromParams(new URLSearchParams('?mode=dark&view=code'))).toBe('code');
            expect(readEmbedViewFromParams(new URLSearchParams('?mode=dark'))).toBe('player');
        });
    });

    describe('readEmbedViewFromMessage', () => {
        test('ignores messages that are not about the view', () => {
            expect(readEmbedViewFromMessage(null)).toBe(null);
            expect(readEmbedViewFromMessage('REQUEST_SCREENSHOT')).toBe(null);
            expect(readEmbedViewFromMessage({type: 'block-compiler-action', action: 'POPUP_CLOSED'})).toBe(null);
            expect(readEmbedViewFromMessage({type: 'other', action: 'SET_EMBED_VIEW', view: 'code'})).toBe(null);
        });

        test('reads the requested view', () => {
            expect(readEmbedViewFromMessage({
                type: 'block-compiler-action', action: 'SET_EMBED_VIEW', view: 'code'
            })).toBe('code');
            expect(readEmbedViewFromMessage({
                type: 'block-compiler-action', action: 'SET_EMBED_VIEW', view: 'player'
            })).toBe('player');
            expect(readEmbedViewFromMessage({
                type: 'block-compiler-action', action: 'SET_EMBED_VIEW', view: 'blocks'
            })).toBe('blocks');
            expect(readEmbedViewFromMessage({
                type: 'block-compiler-action', action: 'SET_EMBED_VIEW'
            })).toBe('player');
        });
    });

    describe('isTrustedEmbedMessage', () => {
        const parent = {};
        beforeEach(() => {
            global.window = {parent};
        });
        afterEach(() => {
            delete global.window;
        });

        test('accepts the trusted host, and only from the parent window', () => {
            const trusted = 'https://codetorch.net';
            expect(isTrustedEmbedMessage({source: parent, origin: 'https://codetorch.net'}, trusted)).toBe(true);
            expect(isTrustedEmbedMessage({source: {}, origin: 'https://codetorch.net'}, trusted)).toBe(false);
            expect(isTrustedEmbedMessage({source: parent, origin: 'https://codetorch.net.evil.example'}, trusted))
                .toBe(false);
            expect(isTrustedEmbedMessage({source: parent, origin: 'null'}, trusted)).toBe(false);
            expect(isTrustedEmbedMessage(null, trusted)).toBe(false);
        });

        test('without a configured host any parent is accepted', () => {
            expect(isTrustedEmbedMessage({source: parent, origin: 'http://localhost:3000'}, '')).toBe(true);
        });

        test('a top-level page has no parent to listen to', () => {
            global.window.parent = global.window;
            expect(isTrustedEmbedMessage({source: global.window, origin: 'https://codetorch.net'}, 'https://codetorch.net'))
                .toBe(false);
        });
    });

    describe('mode reducer', () => {
        test('the player view is the embed as it always was', () => {
            const state = applyEmbedView(embeddedMode, 'player');
            expect(state).toEqual({
                isEmbedded: true,
                isFullScreen: false,
                isPlayerOnly: true,
                isCodeEmbed: false,
                isBlocksOnlyEmbed: false,
                hasEverEnteredEditor: false
            });
        });

        test('the code view is an editor that does not fill the window with the stage', () => {
            const state = applyEmbedView(embeddedMode, 'code');
            expect(state).toEqual({
                isEmbedded: false,
                isFullScreen: false,
                isPlayerOnly: false,
                isCodeEmbed: true,
                isBlocksOnlyEmbed: false,
                hasEverEnteredEditor: true
            });
        });

        test('the blocks view is the code view without the stage', () => {
            const state = applyEmbedView(embeddedMode, 'blocks');
            expect(state.isCodeEmbed).toBe(true);
            expect(state.isBlocksOnlyEmbed).toBe(true);
            expect(state.isPlayerOnly).toBe(false);
            expect(state.hasEverEnteredEditor).toBe(true);
            expect(modeReducer(state, setEmbedView('code')).isBlocksOnlyEmbed).toBe(false);
            expect(setEmbedView('blocks').view).toBe('blocks');
        });

        test('switching views at runtime keeps full screen and remembers the editor was seen', () => {
            const player = applyEmbedView(embeddedMode, 'player');
            const code = modeReducer(player, setEmbedView('code'));
            expect(code.isCodeEmbed).toBe(true);
            expect(code.isPlayerOnly).toBe(false);
            expect(code.isEmbedded).toBe(false);
            expect(code.hasEverEnteredEditor).toBe(true);

            const back = modeReducer(code, setEmbedView('player'));
            expect(back.isCodeEmbed).toBe(false);
            expect(back.isPlayerOnly).toBe(true);
            expect(back.isEmbedded).toBe(true);
            expect(back.hasEverEnteredEditor).toBe(true);
        });

        test('unknown views fall back to the player', () => {
            expect(setEmbedView('costumes').view).toBe('player');
            expect(applyEmbedView(modeInitialState, 'nope').isCodeEmbed).toBe(false);
        });
    });
});
