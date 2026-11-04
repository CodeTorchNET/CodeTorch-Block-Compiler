import ArgumentType from 'scratch-vm/src/extension-support/argument-type';
import BlockType from 'scratch-vm/src/extension-support/block-type';

import {buildPlaceholderInfo, createPlaceholderExtension} from '../../../src/lib/ct-extension-placeholder';
import {
    clearExtensionNotices,
    getExtensionNotices,
    noteRefusedExtension,
    reportRefusedExtension
} from '../../../src/lib/ct-extension-restrictions';

const VM = require('scratch-vm');

const URL_ = 'https://evil.example.com/ext/thing.js';

const project = () => ({
    targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null},
        {isStage: false, name: 'Sprite1', variables: {}, lists: {}, broadcasts: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true, x: 0, y: 0,
            size: 100, direction: 90, draggable: false, rotationStyle: 'all around',
            blocks: {
                hat: {opcode: 'event_whenflagclicked', next: 'cmd', parent: null, inputs: {}, fields: {},
                    shadow: false, topLevel: true, x: 0, y: 0},
                cmd: {opcode: 'thing_doIt', next: 'cblock', parent: 'hat',
                    inputs: {AMOUNT: [3, 'rep', [4, '10']], WHERE: [1, 'menu1']},
                    fields: {MODE: ['fast', null]}, shadow: false, topLevel: false},
                menu1: {opcode: 'thing_menu_places', next: null, parent: 'cmd', inputs: {},
                    fields: {places: ['north', null]}, shadow: true, topLevel: false},
                rep: {opcode: 'thing_value', next: null, parent: 'cmd', inputs: {}, fields: {},
                    shadow: false, topLevel: false},
                cblock: {opcode: 'thing_repeatish', next: null, parent: 'cmd',
                    inputs: {SUBSTACK: [2, 'inner'], COND: [2, 'cond']}, fields: {}, shadow: false, topLevel: false},
                inner: {opcode: 'motion_movesteps', next: null, parent: 'cblock', inputs: {STEPS: [1, [4, '10']]},
                    fields: {}, shadow: false, topLevel: false},
                cond: {opcode: 'operator_not', next: null, parent: 'cblock', inputs: {}, fields: {},
                    shadow: false, topLevel: false}
            }}
    ],
    monitors: [],
    extensions: ['thing'],
    extensionURLs: {thing: URL_},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const vmWith = ({placeholders}) => {
    const vm = new VM();
    const loaded = [];
    vm.securityManager.canLoadExtensionFromProject = () => Promise.resolve(false);
    vm.extensionManager.loadExtensionURL = url => {
        loaded.push(url);
        return Promise.resolve();
    };
    if (placeholders) {
        vm.securityManager.createPlaceholderExtension = (id, url, blocks, lookup) =>
            createPlaceholderExtension(id, blocks, lookup);
    }
    return {vm, loaded};
};

describe('placeholder info', () => {
    const blocksById = {
        a: {id: 'a', opcode: 'thing_doIt', parent: null, next: null, inputs: {
            N: {name: 'N', block: 'n', shadow: 'n'}, W: {name: 'W', block: 'm', shadow: 'm'},
            B: {name: 'B', block: null, shadow: null}, R: {name: 'R', block: 'r', shadow: 's'}
        }, fields: {MODE: {name: 'MODE', value: 'fast'}}},
        n: {id: 'n', opcode: 'math_number', parent: 'a', fields: {NUM: {value: '1'}}},
        m: {id: 'm', opcode: 'thing_menu_places', parent: 'a', inputs: {}, fields: {places: {value: 'north'}}},
        r: {id: 'r', opcode: 'thing_value', parent: 'a', next: null, inputs: {}, fields: {}},
        s: {id: 's', opcode: 'text', parent: 'a', fields: {TEXT: {value: 'x'}}},
        c: {id: 'c', opcode: 'thing_loop', parent: null, next: null, inputs: {
            SUBSTACK: {name: 'SUBSTACK', block: null, shadow: null},
            SUBSTACK2: {name: 'SUBSTACK2', block: null, shadow: null}
        }, fields: {}},
        m2: {id: 'm2', opcode: 'thing_menu_places', parent: null, inputs: {}, fields: {places: {value: 'south'}}}
    };
    const own = Object.values(blocksById).filter(b => b.opcode.startsWith('thing_'));
    const info = buildPlaceholderInfo('thing', own, id => blocksById[id] || null);
    const byOpcode = Object.fromEntries(info.blocks.map(b => [b.opcode, b]));

    test('one definition per opcode, menus excluded, none in the palette', () => {
        expect(Object.keys(byOpcode).sort()).toEqual(['doIt', 'loop', 'value']);
        expect(info.blocks.every(b => b.hideFromPalette)).toBe(true);
        expect(info.id).toBe('thing');
    });
    test('argument types from shadows; menus from the values the project uses', () => {
        const args = byOpcode.doIt.arguments;
        expect(args.N.type).toBe(ArgumentType.NUMBER);
        expect(args.W).toMatchObject({type: ArgumentType.STRING, menu: 'places'});
        expect(args.B.type).toBe(ArgumentType.BOOLEAN);
        expect(args.R.type).toBe(ArgumentType.STRING);
        expect(info.menus.places).toEqual({acceptReporters: true, items: ['north', 'south']});
        expect(args.MODE.menu).toBe('ctPlaceholder_doIt_MODE');
        expect(info.menus.ctPlaceholder_doIt_MODE).toEqual({acceptReporters: false, items: ['fast']});
        expect(byOpcode.doIt.text).toBe('doIt [N] [W] [B] [R] [MODE]');
    });
    test('shapes: used in an input = reporter, SUBSTACKs = C block with that many branches', () => {
        expect(byOpcode.value.blockType).toBe(BlockType.REPORTER);
        expect(byOpcode.doIt.blockType).toBe(BlockType.COMMAND);
        expect(byOpcode.loop.blockType).toBe(BlockType.CONDITIONAL);
        expect(byOpcode.loop.branchCount).toBe(2);
    });
    test('every block is a no-op; reporters report an empty string', () => {
        const ext = createPlaceholderExtension('thing', own, id => blocksById[id] || null);
        for (const b of ext.getInfo().blocks) {
            const result = ext[b.func]({}, {});
            expect(result).toBe(b.blockType === BlockType.REPORTER ? '' : undefined);
        }
        expect(ext.isCodeTorchPlaceholder).toBe(true);
    });
});

describe('a project with a refused extension', () => {
    test('without a placeholder the load still fails (full editor behaviour unchanged)', async () => {
        const {vm} = vmWith({placeholders: false});
        await expect(vm.loadProject(project())).rejects.toThrow(/Permission to load extension denied: thing/);
    });

    test('with a placeholder: loads, keeps every block, never fetches the extension', async () => {
        const {vm, loaded} = vmWith({placeholders: true});
        const events = [];
        vm.on('EXTENSION_PLACEHOLDER', e => events.push(e));
        await vm.loadProject(project());
        expect(loaded).toEqual([]);
        expect(events).toEqual([{id: 'thing', url: URL_}]);
        expect(vm.extensionManager.isExtensionLoaded('thing')).toBe(true);
        const sprite = vm.runtime.targets.find(t => t.getName() === 'Sprite1');
        expect(sprite.blocks.getBlock('cmd').opcode).toBe('thing_doIt');
        await new Promise(r => setTimeout(r, 50));
        const defined = new Set();
        for (const category of vm.runtime._blockInfo) {
            for (const b of category.blocks) if (b.json) defined.add(b.json.type);
            for (const m of category.menus) defined.add(m.json.type);
        }
        for (const opcode of ['thing_doIt', 'thing_value', 'thing_repeatish', 'thing_menu_places']) {
            expect(defined.has(opcode)).toBe(true);
        }
    });

    test('saving keeps the extension, its URL and every block exactly as loaded', async () => {
        const {vm} = vmWith({placeholders: true});
        await vm.loadProject(project());
        const saved = JSON.parse(vm.toJSON());
        expect(saved.extensions).toContain('thing');
        expect(saved.extensionURLs).toEqual({thing: URL_});
        const tree = (blocks, id) => {
            if (!id) return null;
            const b = blocks[id];
            if (Array.isArray(b)) return b;
            const inputs = {};
            for (const [name, input] of Object.entries(b.inputs)) {
                inputs[name] = input.map(x => (typeof x === 'string' && blocks[x] ? tree(blocks, x) : x));
            }
            return {opcode: b.opcode, fields: b.fields, shadow: b.shadow, inputs, next: tree(blocks, b.next)};
        };
        const top = blocks => Object.keys(blocks).filter(id => blocks[id].topLevel)
            .map(id => tree(blocks, id));
        expect(top(saved.targets.find(t => t.name === 'Sprite1').blocks))
            .toEqual(top(project().targets[1].blocks));
        const second = vmWith({placeholders: true}).vm;
        await second.loadProject(JSON.stringify(saved));
        expect(JSON.parse(second.toJSON()).extensionURLs).toEqual({thing: URL_});
    });

    test('running the project does nothing for placeholder blocks and throws nothing', async () => {
        const {vm} = vmWith({placeholders: true});
        await vm.loadProject(project());
        vm.runtime.compilerOptions.enabled = false;
        vm.greenFlag();
        for (let i = 0; i < 5; i++) vm.runtime._step();
        const sprite = vm.runtime.targets.find(t => t.getName() === 'Sprite1');
        expect(sprite.x).toBe(0);
    });

    test('a refused built-in (restricted in minimal mode) gets a placeholder too', async () => {
        const {vm} = vmWith({placeholders: true});
        vm.extensionManager.loadExtensionIdSync = () => {
            throw new Error('refused');
        };
        const p = project();
        p.targets[1].blocks = {t1: {opcode: 'translate_getTranslate', next: null, parent: null,
            inputs: {WORDS: [1, [10, 'hello']]}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0}};
        p.extensions = ['translate'];
        p.extensionURLs = {};
        await vm.loadProject(p);
        expect(vm.extensionManager.isExtensionLoaded('translate')).toBe(true);
        expect(JSON.parse(vm.toJSON()).extensionURLs || {}).toEqual({});
    });
});

describe('notice strings', () => {
    test('every locale translates every gui.ctExtensions string, keeping {name}', () => {
        const ct = require('../../../src/lib/tw-translations/ct-translations.json');
        const {messages} = require('../../../src/components/ct-extension-notice/ct-extension-notice.jsx');
        const ids = Object.values(messages).map(m => m.id)
            .sort();
        for (const locale of Object.keys(ct)) {
            expect(Object.keys(ct[locale]).filter(k => k.startsWith('gui.ctExtensions.'))
                .sort()).toEqual(ids);
            expect(ct[locale]['gui.ctExtensions.placeholder']).toContain('{name}');
            expect(ct[locale]['gui.ctExtensions.refused']).toContain('{name}');
        }
    });
});

describe('refusal notices (replace alert())', () => {
    beforeEach(() => clearExtensionNotices());
    test('a refusal and its placeholder are one notice', () => {
        global.alert = jest.fn();
        reportRefusedExtension(URL_);
        noteRefusedExtension({url: URL_, id: 'thing', placeholder: true});
        expect(getExtensionNotices()).toEqual([{key: URL_, url: URL_, id: 'thing', placeholder: true}]);
        expect(global.alert).not.toHaveBeenCalled();
    });
    test('built-ins are keyed by ID', () => {
        reportRefusedExtension('translate');
        expect(getExtensionNotices()).toEqual([{key: 'translate', url: null, id: 'translate', placeholder: false}]);
    });
});
