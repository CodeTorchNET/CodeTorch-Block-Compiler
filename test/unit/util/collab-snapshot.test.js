import {
    isSnapshotFrame,
    parseSnapshotFrame,
    setSnapshot,
    getSnapshot,
    applySnapshotIds,
    reset
} from '../../../src/lib/collab-snapshot.js';

import {execFileSync} from 'child_process';
import path from 'path';

const SERVER = path.resolve(__dirname, '../../../../Collaborator Server/snapshot.js');

const encodeOnServer = (m, u) => {
    const script = `
        import { encodeSnapshot } from ${JSON.stringify(SERVER)};
        const meta = JSON.parse(process.argv[1]);
        const update = Buffer.from(process.argv[2], 'base64');
        process.stdout.write(Buffer.from(encodeSnapshot(meta, update)).toString('base64'));
    `;
    const out = execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script, JSON.stringify(m), Buffer.from(u).toString('base64')],
        {encoding: 'utf8'});
    return new Uint8Array(Buffer.from(out, 'base64'));
};

beforeEach(() => reset());

const meta = {
    project: {
        targets: [
            {isStage: true, name: 'Stage', volume: 55},
            {isStage: false, name: 'Cat', x: 12.5}
        ],
        monitors: [],
        extensions: [],
        extensionURLs: {},
        meta: {semver: '3.0.0'}
    },
    ids: [
        {name: 'Stage', isStage: true, id: 'stage-id', costumeIds: ['c1'], soundIds: []},
        {name: 'Cat', isStage: false, id: 'cat-id', costumeIds: ['c2'], soundIds: ['s1']}
    ],
    roomGeneration: 'gen-1',
    schemaVersion: 2
};

const update = new Uint8Array([0x00, 0x01, 0xff, 0x7b, 0x43, 0x54, 0x43, 0x53]);

const frame = () => encodeOnServer(meta, update);

describe('the frame the server writes', () => {
    test('is recognised', () => {
        expect(isSnapshotFrame(frame())).toBe(true);
    });

    test('splits into the same three parts that went in', () => {
        const parsed = parseSnapshotFrame(frame());
        expect(parsed).not.toBeNull();
        expect(parsed.meta.roomGeneration).toBe('gen-1');
        expect(parsed.meta.schemaVersion).toBe(2);
        expect(parsed.meta.ids).toEqual(meta.ids);
        expect(Array.from(parsed.update)).toEqual(Array.from(update));
    });

    test('yields a project half the ordinary loader can read', () => {
        const {projectData} = parseSnapshotFrame(frame());
        const project = JSON.parse(new TextDecoder('utf-8').decode(projectData));
        expect(project.targets.map(t => t.name)).toEqual(['Stage', 'Cat']);
        expect(project.targets[1].x).toBe(12.5);
    });
});

describe('anything else is not a frame', () => {
    test.each([
        ['empty', new Uint8Array(0)],
        ['plain project json', new TextEncoder().encode('{"targets":[]}')],
        ['magic only', new Uint8Array([0x43, 0x54, 0x43, 0x53])]
    ])('%s', (_name, bytes) => {
        expect(isSnapshotFrame(bytes)).toBe(false);
    });

    test('a length that overruns the body parses to null rather than throwing', () => {
        const bad = frame();
        new DataView(bad.buffer, bad.byteOffset, bad.byteLength).setUint32(4, 0xffff, false);
        expect(parseSnapshotFrame(bad)).toBeNull();
    });
});

describe('adopting the document ids', () => {
    const fakeVM = names => {
        const targets = names.map(name => ({
            getName: () => name,
            id: `local-${name}`,
            sprite: {costumes: [{id: 'local-c'}], sounds: []},
            variables: {}
        }));
        return {
            runtime: {
                targets,
                updateTargetId: (target, id) => {
                    target.id = id;
                }
            }
        };
    };

    test('renames every target to the id the document is keyed by', () => {
        setSnapshot({meta, update});
        const vm = fakeVM(['Stage', 'Cat']);
        expect(applySnapshotIds(vm)).toBe(true);
        expect(vm.runtime.targets.map(t => t.id)).toEqual(['stage-id', 'cat-id']);
    });

    test('refuses when the VM loaded a different set of targets', () => {
        setSnapshot({meta, update});
        const vm = fakeVM(['Stage', 'Dog']);
        expect(applySnapshotIds(vm)).toBe(false);
        expect(vm.runtime.targets.map(t => t.id)).toEqual(['local-Stage', 'local-Dog']);
        expect(getSnapshot()).toBeNull();
    });

    test('refuses when the counts disagree', () => {
        setSnapshot({meta, update});
        const vm = fakeVM(['Stage']);
        expect(applySnapshotIds(vm)).toBe(false);
    });

    test('is not applied twice', () => {
        setSnapshot({meta, update});
        const vm = fakeVM(['Stage', 'Cat']);
        expect(applySnapshotIds(vm)).toBe(true);
        expect(applySnapshotIds(vm)).toBe(false);
    });
});
