import {equalCanonical, diffCanonical, artSignature, attachArt} from '../../../src/lib/rewind/state';
import {diffStates} from '../../../src/lib/rewind/diff';

const shape = (id, d, fill = '#f00') => ({id, tag: 'path', attrs: {d, fill}});
const doc = shapes => ({order: shapes.map(s => s.id), shapes: Object.fromEntries(shapes.map(s => [s.id, s]))});
const state = ({md5 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg', art = null} = {}) => {
    const t = {
        id: 'sp', name: 'Sprite1', isStage: false, layerOrder: 1, currentCostume: 0, volume: 100,
        blocks: {}, variables: {}, comments: {}, sounds: [],
        costumes: [{id: 'c1', name: 'costume1', md5ext: md5, assetId: md5.split('.')[0], dataFormat: 'svg',
            rotationCenterX: 10, rotationCenterY: 10, bitmapResolution: 1}]
    };
    if (art) t.art = {c1: art};
    return {v: 1, t: 1, session: 's', room: null, monitors: [], extensions: [], fonts: [], meta: {},
        targets: [{id: 'st', name: 'Stage', isStage: true, layerOrder: 0, currentCostume: 0, volume: 100, blocks: {},
            variables: {}, comments: {}, costumes: [], sounds: []}, t]};
};
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.svg';

describe('doc-backed vector costumes compare by shapes', () => {
    test('same shapes (other ids), different md5 → equal', () => {
        const a = state({md5: A, art: doc([shape('x1', 'M0 0L1 1'), shape('x2', 'M2 2')])});
        const b = state({md5: B, art: doc([{id: 'y1', tag: 'path', attrs: {fill: '#f00', d: 'M0 0L1 1'}},
            shape('y2', 'M2 2')])});
        expect(equalCanonical(a, b)).toBe(true);
        expect(diffCanonical(a, b)).toEqual([]);
    });
    test('different shapes or order → not equal', () => {
        const a = state({md5: A, art: doc([shape('x1', 'M0 0'), shape('x2', 'M2 2')])});
        expect(equalCanonical(a, state({md5: A, art: doc([shape('x1', 'M0 0'), shape('x2', 'M3 3')])}))).toBe(false);
        expect(equalCanonical(a, state({md5: A, art: doc([shape('x2', 'M2 2'), shape('x1', 'M0 0')])}))).toBe(false);
    });
    test('art on one side only (or none) → md5 rule', () => {
        const withArt = state({md5: A, art: doc([shape('x1', 'M0 0')])});
        expect(equalCanonical(withArt, state({md5: B}))).toBe(false);
        expect(equalCanonical(withArt, state({md5: A}))).toBe(true);
        expect(equalCanonical(state({md5: A}), state({md5: B}))).toBe(false);
        expect(diffCanonical(state({md5: A}), state({md5: B})).join()).toMatch(/md5ext/);
    });
    test('restore diff does not rewrite a re-rendered costume', () => {
        const art = doc([shape('x1', 'M0 0')]);
        const ops = diffStates(state({md5: A, art}), state({md5: B, art: doc([shape('z', 'M0 0')])}));
        expect(ops.filter(o => o.k === 'costume.update')).toEqual([]);
        const changed = diffStates(state({md5: A, art}), state({md5: B, art: doc([shape('z', 'M9 9')])}));
        expect(changed.some(o => o.k === 'costume.update' && o.d.data.md5ext === B)).toBe(true);
    });
    test('attachArt only adds svg costumes the source knows; signature ignores ids', () => {
        const s = attachArt(state(), id => (id === 'c1' ? doc([shape('q', 'M1 1')]) : null));
        expect(artSignature(s.targets[1].art.c1)).toBe(artSignature(doc([shape('r', 'M1 1')])));
        expect(s.targets[0].art).toBeUndefined();
        expect(artSignature({order: [], shapes: {}})).toBeNull();
    });
});
