import {JSDOM} from 'jsdom';
import makeToolboxXML from '../../../src/lib/make-toolbox-xml';
import {addCtPmBlocks} from '../../../src/lib/ct-pm-toolbox';

const OPCODES = require('scratch-vm/src/ct-pm/opcodes').OPCODES;

const toolbox = (isStage, offered) =>
    makeToolboxXML(false, isStage, 'target', [], 'costume1', 'backdrop1', 'sound1', undefined, offered);

const {DOMParser} = new JSDOM('').window;

const parse = xml => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    return doc;
};

const blockTypes = doc => [...doc.getElementsByTagName('block')].map(b => b.getAttribute('type'));

describe('Advanced blocks in the palette', () => {
    test('off: the toolbox is exactly the vanilla one', () => {
        expect(toolbox(false, false)).toBe(makeToolboxXML(false, false, 'target', [], 'costume1', 'backdrop1',
            'sound1'));
        expect(blockTypes(parse(toolbox(false, false))).some(type => Object.prototype.hasOwnProperty.call(OPCODES, type)))
            .toBe(false);
    });

    test('initial setup never gets them', () => {
        const xml = makeToolboxXML(true, true, null, [], '', '', '', undefined, true);
        expect(xml).not.toContain('control_expandableIf');
    });

    test('on: well-formed, vanilla blocks still all there and in order', () => {
        const vanilla = blockTypes(parse(toolbox(false, false)));
        const withPm = blockTypes(parse(toolbox(false, true)));
        expect(withPm.filter(type => vanilla.includes(type))).toEqual(vanilla);
        expect(withPm.length).toBeGreaterThan(vanilla.length + 100);
    });

    test('on: every offered block is a known PenguinMod opcode or a vanilla shadow', () => {
        const vanilla = new Set(blockTypes(parse(toolbox(false, false))));
        for (const type of blockTypes(parse(toolbox(false, true)))) {
            if (vanilla.has(type)) continue;
            expect(Object.prototype.hasOwnProperty.call(OPCODES, type)).toBe(true);
            expect(OPCODES[type].status).toBe('native');
        }
    });

    test('else if sits right after if-else', () => {
        const types = blockTypes(parse(toolbox(false, true)));
        expect(types[types.indexOf('control_if_else') + 1]).toBe('control_expandableIf');
    });

    test('PM blocks come after the vanilla ones of their category', () => {
        const doc = parse(toolbox(false, true));
        const looks = [...doc.getElementsByTagName('category')].find(c => c.getAttribute('id') === 'looks');
        const types = [...looks.children].filter(e => e.tagName === 'block').map(e => e.getAttribute('type'));
        const firstPm = types.findIndex(type => Object.prototype.hasOwnProperty.call(OPCODES, type));
        expect(types.slice(firstPm).some(type => !Object.prototype.hasOwnProperty.call(OPCODES, type))).toBe(false);
    });

    test('checkbox shadows only in boolean slots of advanced blocks', () => {
        const doc = parse(toolbox(false, true));
        for (const shadow of [...doc.getElementsByTagName('shadow')].filter(s => s.getAttribute('type') === 'checkbox')) {
            const owner = shadow.parentElement.parentElement.getAttribute('type');
            expect(Object.prototype.hasOwnProperty.call(OPCODES, owner)).toBe(true);
        }
        expect(toolbox(false, true)).toMatch(/<block type="operator_and"\s*\/>/);
    });

    test('stage: no sprite-only blocks', () => {
        const types = blockTypes(parse(toolbox(true, true)));
        expect(types).toContain('control_expandableIf');
        expect(types).not.toContain('motion_changebyxy');
        expect(types).not.toContain('looks_setStretch');
        expect(types).not.toContain('control_is_clone');
    });

    test('names are XML-escaped by the caller and survive', () => {
        const xml = addCtPmBlocks('sound', '<category id="sound"><sep gap="36"/></category>',
            {isStage: false, targetId: 't', soundName: 'a &amp; b'});
        parse(`<xml>${xml}</xml>`);
        expect(xml).toContain('a &amp; b');
    });
});
