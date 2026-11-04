import {blockSnapshot, diffBlocks} from '../../../src/components/rewind-viewer/changes';

const blk = (id, extra = {}) => Object.assign({id, opcode: 'x', parent: null, next: null, topLevel: false,
    inputs: {}, fields: {}, shadow: false}, extra);
const target = blocks => ({blocks: Object.fromEntries(blocks.map(b => [b.id, b]))});
const num = (id, parent, v) => blk(id, {parent, shadow: true, fields: {NUM: {name: 'NUM', value: v}}});

const script = (opts = {}) => [
    blk('hat', {topLevel: true, x: 0, y: 0, next: 'A'}),
    blk('A', {parent: 'hat', next: 'B'}),
    num('An', 'A', opts.n || '10'),
    blk('B', {parent: 'A', next: 'C'}),
    blk('C', {parent: 'B'})
];
const snap = blocks => blockSnapshot(target(blocks));

describe('rewind changes', () => {
    test('nothing to compare with, or nothing changed', () => {
        expect(diffBlocks(null, snap(script()))).toBeNull();
        expect(diffBlocks(snap(script()), snap(script()))).toBeNull();
    });

    test('a field edit names the field with its old and new value', () => {
        const d = diffBlocks(snap(script()), snap(script({n: '20'})));
        expect(d.fields).toEqual([{id: 'An', name: 'NUM', from: '10', to: '20'}]);
        expect(d.added.concat(d.removed, d.moved)).toEqual([]);
    });

    test('adding blocks: every new block, never shadows', () => {
        const after = script().concat([blk('D', {parent: 'C'}), num('Dn', 'D', '1')]);
        after.find(b => b.id === 'C').next = 'D';
        const d = diffBlocks(snap(script()), snap(after));
        expect(d.added).toEqual(['D']);
        expect(d.moved).toEqual([]);
    });

    test('inserting a block in the middle: the block below is carried, not moved', () => {
        const after = script().concat([blk('N', {parent: 'A', next: 'B'})]);
        after.find(b => b.id === 'A').next = 'N';
        after.find(b => b.id === 'B').parent = 'N';
        const d = diffBlocks(snap(script()), snap(after));
        expect(d.added).toEqual(['N']);
        expect(d.moved).toEqual([]);
    });

    test('dragging a block out of the middle: it moved, the block below did not', () => {
        const after = script();
        after.find(b => b.id === 'A').next = 'C';
        Object.assign(after.find(b => b.id === 'B'), {parent: null, next: null, topLevel: true, x: 300, y: 40});
        after.find(b => b.id === 'C').parent = 'A';
        const d = diffBlocks(snap(script()), snap(after));
        expect(d.moved).toEqual(['B']);
    });

    test('dragging a whole script: only its hat moved', () => {
        const after = script();
        Object.assign(after.find(b => b.id === 'hat'), {x: 50, y: 80});
        expect(diffBlocks(snap(script()), snap(after)).moved).toEqual(['hat']);
    });

    test('removing a block: named once, its shadow is a ghost too, the block below is carried', () => {
        const after = script().filter(b => b.id !== 'A' && b.id !== 'An');
        after.find(b => b.id === 'hat').next = 'B';
        after.find(b => b.id === 'B').parent = 'hat';
        const d = diffBlocks(snap(script()), snap(after));
        expect(d.removed).toEqual(['A']);
        expect(d.ghosts.sort()).toEqual(['A', 'An']);
        expect(d.moved).toEqual([]);
        expect(d.count).toBe(1);
    });
});
