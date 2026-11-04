import {parseRewindParams, rewindReducer, closeRewind} from '../../../src/reducers/rewind';
import {targetToWorkspaceXml, workspaceKey} from '../../../src/components/rewind-viewer/workspace-xml';
import {visualSignature, displayOnly} from '../../../src/components/rewind-viewer/display';
import {axisTicks} from '../../../src/components/rewind-viewer/time-format';
import ct from '../../../src/lib/tw-translations/ct-translations.json';
import messages from '../../../src/components/rewind-viewer/messages';

const blk = (id, opcode, extra = {}) => Object.assign({
    id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false
}, extra);

const state = () => ({
    v: 1, targets: [
        {id: 'stage', name: 'Stage', isStage: true, blocks: {},
            variables: {v1: {id: 'v1', name: 'score <&>', type: '', value: 0, isCloud: false}}, comments: {},
            costumes: [{id: 'c0', name: 'b', md5ext: 'a.svg'}], sounds: []},
        {id: 'cat', name: 'Cat', isStage: false, x: 0, y: 0, layerOrder: 1,
            blocks: {
                hat: blk('hat', 'event_whenflagclicked', {topLevel: true, x: 10, y: 20, next: 'say'}),
                say: blk('say', 'looks_say', {parent: 'hat', inputs: {MESSAGE: {name: 'MESSAGE', block: 't', shadow: 't'}}}),
                t: blk('t', 'text', {parent: 'say', shadow: true, fields: {TEXT: {name: 'TEXT', value: 'hi'}}})
            },
            variables: {l1: {id: 'l1', name: 'mine', type: '', value: 1, isCloud: false}},
            comments: {k: {blockId: null, x: 1, y: 2, width: 100, height: 50, minimized: false, text: 'note'}},
            costumes: [{id: 'k1', name: 'c1', md5ext: 'b.svg', rotationCenterX: 1, rotationCenterY: 1}], sounds: []}
    ],
    monitors: [{id: 'm'}], extensions: [{id: 'pen'}], fonts: []
});

describe('rewind URL params', () => {
    test('rewind=1 opens, until is digits-only and needs rewind', () => {
        expect(parseRewindParams('?rewind=1&until=1793653305600')).toEqual({open: true, until: 1793653305600, rewindOnly: false});
        expect(parseRewindParams('?until=1793653305600')).toEqual({open: false, until: null, rewindOnly: false});
        expect(parseRewindParams('?rewind=1&until=12abc')).toEqual({open: true, until: null, rewindOnly: false});
        expect(parseRewindParams('?rewind=0')).toEqual({open: false, until: null, rewindOnly: false});
        expect(parseRewindParams('?mode=dark&rewind=1&minimal=true')).toEqual({open: true, until: null, rewindOnly: false});
    });
    test('rewindonly: only with rewind, and nothing closes the viewer', () => {
        expect(parseRewindParams('?rewind=1&rewindonly=1&until=5')).toEqual({open: true, until: 5, rewindOnly: true});
        expect(parseRewindParams('?rewindonly=1')).toEqual({open: false, until: null, rewindOnly: false});
        expect(parseRewindParams('?rewind=1&rewindonly=0').rewindOnly).toBe(false);
        const locked = {open: true, openedFromUrl: true, until: 5, rewindOnly: true, meta: null};
        expect(rewindReducer(locked, closeRewind())).toBe(locked);
        const normal = Object.assign({}, locked, {rewindOnly: false});
        expect(rewindReducer(normal, closeRewind()).open).toBe(false);
    });
});

describe('workspace xml', () => {
    test('scripts with shadows, escaped variables, workspace comments', () => {
        const xml = targetToWorkspaceXml(state(), 'cat');
        expect(xml).toContain('id="hat"');
        expect(xml).toContain('<shadow');
        expect(xml).toContain('score &lt;&amp;&gt;');
        expect(xml).toContain('islocal="true"');
        expect(xml).toContain('>note</comment>');
        expect(targetToWorkspaceXml(state(), 'nope')).toBeNull();
    });
    test('key changes with blocks, not with sprite position', () => {
        const a = state();
        const b = state();
        b.targets[1].x = 99;
        expect(workspaceKey(a, 'cat')).toBe(workspaceKey(b, 'cat'));
        b.targets[1].blocks.t.fields.TEXT.value = 'bye';
        expect(workspaceKey(a, 'cat')).not.toBe(workspaceKey(b, 'cat'));
    });
});

describe('display', () => {
    test('signature ignores props and scripts, catches assets and layers', () => {
        const a = state();
        const b = state();
        b.targets[1].x = 50;
        b.targets[1].blocks = {};
        expect(visualSignature(a)).toBe(visualSignature(b));
        b.targets[1].costumes[0].md5ext = 'z.svg';
        expect(visualSignature(a)).not.toBe(visualSignature(b));
    });
    test('displayOnly strips scripts, monitors, extensions without touching the input', () => {
        const s = state();
        const d = displayOnly(s);
        expect(d.targets[1].blocks).toEqual({});
        expect(d.monitors).toEqual([]);
        expect(d.extensions).toEqual([]);
        expect(Object.keys(s.targets[1].blocks)).toHaveLength(3);
    });
});

describe('time axis and translations', () => {
    test('ticks are ordered and inside the window', () => {
        const start = Date.UTC(2026, 10, 3, 14, 3, 17);
        const ticks = axisTicks(start, start + (30 * 60 * 1000), 900, 'en');
        expect(ticks.length).toBeGreaterThan(3);
        for (let i = 1; i < ticks.length; i++) expect(ticks[i].t).toBeGreaterThan(ticks[i - 1].t);
        expect(ticks[0].t).toBeGreaterThanOrEqual(start);
    });
    test('every locale translates every gui.rewind string', () => {
        const ids = Object.values(messages).map(m => m.id)
            .sort();
        expect(Object.keys(ct).sort()).toEqual(['ar', 'bn', 'de', 'es', 'fr', 'hi', 'ja', 'pt', 'ru', 'zh-cn']);
        for (const locale of Object.keys(ct)) {
            expect(Object.keys(ct[locale]).filter(k => k.startsWith('gui.rewind.'))
                .sort()).toEqual(ids);
        }
    });
});
