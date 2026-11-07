import {JSDOM} from 'jsdom';
import TorchyBridge from '../../../src/addons/addons/ai-integration/helpers/torchyBridge.js';
import blockDefinitions from '../../../src/addons/addons/ai-integration/helpers/blockDefinitions.js';
import advancedDefinitions from '../../../src/addons/addons/ai-integration/helpers/advancedDefinitions.js';

const {window} = new JSDOM('');
global.DOMParser = window.DOMParser;
global.XMLSerializer = window.XMLSerializer;
global.document = window.document;

const referenceLine = def => {
    let text = def.spec.replace(/%(\d+)/g, (m, index) => {
        const i = Number(index) - 1;
        const input = def.inputs[i] || '';
        const arg = def.xml.args[i];
        const value = arg ? arg.default : '';
        if (arg && arg.type === 'field') return input.startsWith('%m') || input.startsWith('%d') ? `[${value}]` : `(${value})`;
        if (input.startsWith('%b')) return `<${value}>`;
        return `(${value})`;
    });
    if (def.shape === 'reporter') text = `(${text})`;
    if (def.shape === 'boolean') text = `<${text}>`;
    return text;
};

const topBlockType = xml => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const block = doc.documentElement.querySelector('block');
    return block ? block.getAttribute('type') : null;
};

const makeBridge = offered => {
    const bridge = new TorchyBridge([...blockDefinitions, ...advancedDefinitions]);
    bridge.setAdvancedOffered(() => offered);
    return bridge;
};

describe('Torchy and Advanced blocks', () => {
    test('not offered: not in the toolbox, not written, but still readable', () => {
        const bridge = makeBridge(false);
        const reference = bridge.generateToolboxReference();
        expect(reference).not.toContain('escape loop');
        expect(reference).not.toContain('try to do');
        expect(reference).toContain('forever');
        expect(topBlockType(bridge.fromText('escape loop'))).toBe(null);
        expect(bridge.toText('<xml><block type="control_exitLoop"></block></xml>')).toBe('escape loop');
    });

    test('offered: in the toolbox and written', () => {
        const bridge = makeBridge(true);
        const reference = bridge.generateToolboxReference();
        expect(reference).toContain('escape loop');
        expect(reference).toContain('try to do {\n  // blocks\n} if a block errors {\n  // blocks\n}');
        expect(topBlockType(bridge.fromText('escape loop'))).toBe('control_exitLoop');
    });

    test('try / catch round-trips through text', () => {
        const bridge = makeBridge(true);
        const text = 'try to do {\n  say (hi)\n} if a block errors {\n  say (oops)\n}';
        const xml = bridge.fromText(text);
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const block = doc.documentElement.querySelector('block');
        expect(block.getAttribute('type')).toBe('control_try_catch');
        const names = Array.from(block.children).filter(c => c.tagName === 'statement')
            .map(c => c.getAttribute('name'));
        expect(names).toEqual(['SUBSTACK', 'SUBSTACK2']);
        expect(bridge.toText(xml)).toBe(text);
        expect(bridge.lastWarnings).toEqual([]);
    });

    test('vanilla if / else is unchanged', () => {
        const bridge = makeBridge(true);
        const text = 'if <mouse down?> then {\n  say (a)\n} else {\n  say (b)\n}';
        const xml = bridge.fromText(text);
        expect(topBlockType(xml)).toBe('control_if_else');
        expect(bridge.toText(xml)).toBe(text);
    });

    test('every advanced definition parses back to itself from its reference line', () => {
        const bridge = makeBridge(true);
        const wrong = [];
        for (const def of advancedDefinitions) {
            const line = referenceLine(def);
            const type = topBlockType(bridge.fromText(line));
            if (type !== def.id) wrong.push(`${def.id}: "${line}" -> ${type}`);
        }
        expect(wrong).toEqual([]);
    });

    test('vanilla definitions still parse to themselves with Advanced blocks offered', () => {
        const offered = makeBridge(true);
        const plain = makeBridge(false);
        const changed = [];
        for (const def of blockDefinitions) {
            if (def.category === 'custom' || typeof def.spec !== 'string') continue;
            const line = referenceLine(def);
            const before = topBlockType(plain.fromText(line));
            const after = topBlockType(offered.fromText(line));
            if (before !== after) changed.push(`${def.id}: ${before} -> ${after}`);
        }
        expect(changed).toEqual([]);
    });

    test('a typed value that looks bracketed keeps its own wrapper', () => {
        const bridge = makeBridge(true);
        const text = 'set [my list] to array (["a", "b"])';
        const xml = bridge.fromText(text);
        expect(xml).toContain('<field name="TEXT">["a", "b"]</field>');
        expect(bridge.toText(xml)).toBe(text);
        expect(bridge.toText(bridge.fromText('say ([hi])'))).toBe('say ([hi])');
    });
});
