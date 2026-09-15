import {parseBooleanParam, parseFlags} from '../../../src/lib/ct-url-flags';

const flagsFor = search => parseFlags(new URLSearchParams(search));

describe('ct-url-flags', () => {
    describe('parseBooleanParam', () => {
        test('uses the default when the parameter is missing', () => {
            expect(parseBooleanParam(new URLSearchParams(''), 'test', true)).toBe(true);
            expect(parseBooleanParam(new URLSearchParams(''), 'test', false)).toBe(false);
        });

        test('understands false', () => {
            expect(parseBooleanParam(new URLSearchParams('?test=false'), 'test', true)).toBe(false);
            expect(parseBooleanParam(new URLSearchParams('?test=FALSE'), 'test', true)).toBe(false);
        });

        test('a parameter without a value counts as on', () => {
            expect(parseBooleanParam(new URLSearchParams('?test'), 'test', false)).toBe(true);
        });

        test('uses the default for values it does not understand', () => {
            expect(parseBooleanParam(new URLSearchParams('?test=maybe'), 'test', false)).toBe(false);
        });
    });

    describe('parseFlags', () => {
        test('nothing is changed without any parameters', () => {
            expect(flagsFor('')).toEqual({
                useJIT: true,
                minimal: false,
                chat: true
            });
        });

        test('useJIT=false turns the compiler off', () => {
            expect(flagsFor('?useJIT=false').useJIT).toBe(false);
        });

        test('useJIT=true changes nothing', () => {
            expect(flagsFor('?useJIT=true')).toEqual(flagsFor(''));
        });

        test('minimal=true is understood', () => {
            expect(flagsFor('?minimal=true').minimal).toBe(true);
            expect(flagsFor('?minimal').minimal).toBe(true);
            expect(flagsFor('?minimal=false').minimal).toBe(false);
        });

        test('chat=false is understood', () => {
            expect(flagsFor('?chat=false').chat).toBe(false);
            expect(flagsFor('?chat=true').chat).toBe(true);
        });

        test('the flags are independent', () => {
            expect(flagsFor('?minimal=true&chat=false&useJIT=false')).toEqual({
                useJIT: false,
                minimal: true,
                chat: false
            });
        });
    });
});
