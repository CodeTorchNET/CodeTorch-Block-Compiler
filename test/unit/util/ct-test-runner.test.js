import {
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    TEST_HAT_OPCODE,
    UNNAMED_TEST,
    buildReport,
    clampTimeout,
    collectTests,
    disambiguateNames,
    listTestNames,
    summarize
} from '../../../src/lib/ct-test-runner';

const hat = (name, y) => {
    const blocks = {};
    if (name === null) {
        // A reporter was dropped into the NAME slot instead of text.
        blocks.shadow = {opcode: 'operator_join', fields: {}};
    } else {
        blocks.shadow = {opcode: 'text', fields: {TEXT: {value: name}}};
    }
    blocks.hat = {
        opcode: TEST_HAT_OPCODE,
        topLevel: true,
        y: y,
        inputs: {NAME: {shadow: 'shadow'}}
    };
    return blocks;
};

const makeTarget = (blocks, isOriginal = true) => ({
    isOriginal: isOriginal,
    blocks: {_blocks: blocks}
});

const withPrefix = (blocks, prefix) => {
    const out = {};
    Object.keys(blocks).forEach(key => {
        const block = Object.assign({}, blocks[key]);
        if (block.inputs && block.inputs.NAME) {
            block.inputs = {NAME: {shadow: `${prefix}${block.inputs.NAME.shadow}`}};
        }
        out[`${prefix}${key}`] = block;
    });
    return out;
};

describe('collectTests', () => {
    test('finds top-level test hats and reads the authored name', () => {
        const runtime = {targets: [makeTarget(hat('Login', 20))]};
        const tests = collectTests(runtime);
        expect(tests).toHaveLength(1);
        expect(tests[0].name).toBe('Login');
        expect(tests[0].blockId).toBe('hat');
    });

    test('preserves the author\'s casing', () => {
        const runtime = {targets: [
            makeTarget(withPrefix(hat('Login', 10), 'a')),
            makeTarget(withPrefix(hat('login', 10), 'b'))
        ]};
        expect(collectTests(runtime).map(t => t.name)).toEqual(['Login', 'login']);
    });

    test('orders by target, then y, then block id', () => {
        const stage = Object.assign(
            withPrefix(hat('second', 40), 'a'),
            withPrefix(hat('first', 10), 'b')
        );
        const sprite = withPrefix(hat('third', 5), 'c');
        const runtime = {targets: [makeTarget(stage), makeTarget(sprite)]};
        expect(collectTests(runtime).map(t => t.name)).toEqual(['first', 'second', 'third']);
    });

    test('skips clones, non-top-level hats and other opcodes', () => {
        const clone = makeTarget(hat('clone test', 0), false);
        const notTopLevel = makeTarget({
            hat: {opcode: TEST_HAT_OPCODE, topLevel: false, y: 0, inputs: {}}
        });
        const otherOpcode = makeTarget({
            hat: {opcode: 'event_whenflagclicked', topLevel: true, y: 0, inputs: {}}
        });
        const runtime = {targets: [clone, notTopLevel, otherOpcode]};
        expect(collectTests(runtime)).toEqual([]);
    });

    test('names a hat whose NAME slot holds a reporter', () => {
        const runtime = {targets: [makeTarget(hat(null, 0))]};
        expect(collectTests(runtime)[0].name).toBe(UNNAMED_TEST);
    });

    test('trims the authored name and falls back when it is blank', () => {
        const runtime = {targets: [
            makeTarget(withPrefix(hat('  spaced  ', 0), 'a')),
            makeTarget(withPrefix(hat('   ', 0), 'b'))
        ]};
        expect(collectTests(runtime).map(t => t.name)).toEqual(['spaced', UNNAMED_TEST]);
    });

    test('tolerates a runtime with no targets', () => {
        expect(collectTests({})).toEqual([]);
        expect(collectTests({targets: []})).toEqual([]);
    });
});

describe('disambiguateNames', () => {
    test('leaves unique names alone', () => {
        const {tests, duplicates} = disambiguateNames([{name: 'a'}, {name: 'b'}]);
        expect(tests.map(t => t.name)).toEqual(['a', 'b']);
        expect(duplicates).toEqual([]);
    });

    test('numbers repeats from the second occurrence', () => {
        const {tests, duplicates} = disambiguateNames([
            {name: 'a'}, {name: 'b'}, {name: 'a'}, {name: 'a'}
        ]);
        expect(tests.map(t => t.name)).toEqual(['a', 'b', 'a #2', 'a #3']);
        expect(duplicates).toEqual(['a']);
    });

    test('reports each duplicated name once', () => {
        const {duplicates} = disambiguateNames([
            {name: 'a'}, {name: 'a'}, {name: 'a'}, {name: 'b'}, {name: 'b'}
        ]);
        expect(duplicates).toEqual(['a', 'b']);
    });

    test('does not mutate the input', () => {
        const input = [{name: 'a'}, {name: 'a'}];
        disambiguateNames(input);
        expect(input.map(t => t.name)).toEqual(['a', 'a']);
    });
});

describe('listTestNames', () => {
    test('returns the run-ordered, disambiguated names', () => {
        const runtime = {targets: [makeTarget(Object.assign(
            withPrefix(hat('same', 10), 'a'),
            withPrefix(hat('same', 20), 'b')
        ))]};
        expect(listTestNames(runtime)).toEqual(['same', 'same #2']);
    });
});

describe('summarize', () => {
    test('counts every non-passed status as failed', () => {
        expect(summarize([
            {status: 'passed'},
            {status: 'failed'},
            {status: 'errored'},
            {status: 'timed_out'},
            {status: 'passed'}
        ])).toEqual({passed: 2, failed: 3, total: 5});
    });

    test('an empty suite is a valid, empty summary', () => {
        expect(summarize([])).toEqual({passed: 0, failed: 0, total: 0});
    });
});

describe('buildReport', () => {
    const started = new Date('2026-09-15T21:04:11.123Z');
    const finished = new Date('2026-09-15T21:04:12.456Z');

    test('assembles the documented shape', () => {
        const results = [
            {name: 'a', status: 'passed', duration_ms: 3},
            {name: 'b', status: 'failed', message: 'nope', duration_ms: 4}
        ];
        const report = buildReport(results, started, finished);
        expect(report.runner).toBe('blocks');
        expect(report.started_at).toBe('2026-09-15T21:04:11.123Z');
        expect(report.finished_at).toBe('2026-09-15T21:04:12.456Z');
        expect(report.tests).toBe(results);
        expect(report.summary).toEqual({passed: 1, failed: 1, total: 2});
    });

    test('the summary identity holds for any results', () => {
        const results = [
            {name: 'a', status: 'timed_out', duration_ms: 5000},
            {name: 'b', status: 'passed', duration_ms: 1},
            {name: 'c', status: 'errored', duration_ms: 0}
        ];
        const report = buildReport(results, started, finished);
        expect(report.summary.total).toBe(report.tests.length);
        expect(report.summary.passed + report.summary.failed).toBe(report.summary.total);
        expect(report.summary.passed).toBe(
            report.tests.filter(t => t.status === 'passed').length
        );
    });

    test('an empty project produces a valid empty report', () => {
        const report = buildReport([], started, finished);
        expect(report.tests).toEqual([]);
        expect(report.summary).toEqual({passed: 0, failed: 0, total: 0});
    });
});

describe('clampTimeout', () => {
    test('clamps into the protocol range', () => {
        expect(clampTimeout(10)).toBe(MIN_TIMEOUT_MS);
        expect(clampTimeout(999999)).toBe(MAX_TIMEOUT_MS);
        expect(clampTimeout(1234)).toBe(1234);
    });

    test('falls back to the default for nonsense', () => {
        expect(clampTimeout('not a number')).toBe(DEFAULT_TIMEOUT_MS);
        expect(clampTimeout(Infinity)).toBe(DEFAULT_TIMEOUT_MS);
        expect(clampTimeout(undefined)).toBe(DEFAULT_TIMEOUT_MS);
    });
});
