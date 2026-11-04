import {buildAxis, formatGap, SESSION_BREAK_MS} from '../../../src/lib/rewind/time-axis';

const T0 = Date.UTC(2026, 10, 3, 14, 0, 0);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ev = (ts, k = 'block.move') => ({ts, k});

describe('time-axis', () => {
    test('no gap over the threshold: identity (shifted to 0)', () => {
        const range = {start: T0, end: T0 + (9 * MIN)};
        const axis = buildAxis(range, [ev(T0 + MIN), ev(T0 + (5 * MIN)), ev(T0 + (9 * MIN))]);
        expect(axis.breaks).toEqual([]);
        expect(axis.sessions).toHaveLength(1);
        expect(axis.uEnd).toBe(9 * MIN);
        expect(axis.toU(T0 + (3 * MIN))).toBe(3 * MIN);
        expect(axis.toT(3 * MIN)).toBe(T0 + (3 * MIN));
    });

    test('6 AM session, 4 h away, 10 AM session: the 4 h become one narrow break', () => {
        const a = T0;
        const b = T0 + (20 * MIN);
        const c = b + (4 * HOUR);
        const d = c + (30 * MIN);
        const events = [];
        for (let t = a; t <= b; t += 5 * MIN) events.push(ev(t));
        for (let t = c; t <= d; t += 5 * MIN) events.push(ev(t));
        const axis = buildAxis({start: a, end: d}, events);
        expect(axis.sessions).toHaveLength(2);
        expect(axis.breaks).toHaveLength(1);
        const active = 50 * MIN;
        expect(axis.breakU).toBeCloseTo(active * 0.04);
        expect(axis.uEnd).toBeCloseTo(active + axis.breakU);
        expect(axis.breakU / axis.uEnd).toBeLessThan(0.05);
        expect(axis.toU(c + (10 * MIN)) - axis.toU(c)).toBeCloseTo(10 * MIN);
        expect(axis.toU(b) - axis.toU(a)).toBeCloseTo(20 * MIN);
        for (const t of [a, a + (7 * MIN), b, c, c + (13 * MIN), d]) expect(axis.toT(axis.toU(t))).toBeCloseTo(t);
        const brk = axis.breaks[0];
        expect(brk).toMatchObject({from: b, to: c});
        expect(axis.toT(brk.u0 + (axis.breakU * 0.2))).toBe(b);
        expect(axis.toT(brk.u0 + (axis.breakU * 0.8))).toBe(c);
        expect(axis.toT(brk.u0 + (axis.breakU / 2), false)).toBeCloseTo(b + (2 * HOUR));
        expect(axis.breakAt(b + HOUR)).toBe(brk);
        expect(axis.breakAt(b)).toBeNull();
        expect(axis.breakAt(c)).toBeNull();
        let prev = -Infinity;
        for (let t = a; t <= d; t += 7 * MIN) {
            const u = axis.toU(t);
            expect(u).toBeGreaterThanOrEqual(prev);
            prev = u;
        }
    });

    test('runtime.state ops do not keep a session open', () => {
        const b = T0 + (5 * MIN);
        const c = b + HOUR;
        const axis = buildAxis({start: T0, end: c}, [ev(T0), ev(b), ev(b + (30 * MIN), 'runtime.state'), ev(c)]);
        expect(axis.breaks).toHaveLength(1);
        expect(axis.breaks[0]).toMatchObject({from: b, to: c});
    });

    test('a quiet tail up to the range end (e.g. `until`) is a break too', () => {
        const axis = buildAxis({start: T0, end: T0 + (3 * HOUR)}, [ev(T0), ev(T0 + (5 * MIN))]);
        expect(axis.breaks).toHaveLength(1);
        expect(axis.breaks[0]).toMatchObject({from: T0 + (5 * MIN), to: T0 + (3 * HOUR)});
        expect(axis.toT(axis.uEnd)).toBe(T0 + (3 * HOUR));
    });

    test('many sessions: breaks together stay under 30% of the active time', () => {
        const events = [];
        let t = T0;
        for (let i = 0; i < 40; i++) {
            events.push(ev(t), ev(t + (5 * MIN)));
            t += 5 * MIN + (20 * HOUR);
        }
        const end = events[events.length - 1].ts;
        const axis = buildAxis({start: T0, end}, events);
        expect(axis.breaks).toHaveLength(39);
        const active = 40 * 5 * MIN;
        expect(axis.breaks.length * axis.breakU).toBeLessThanOrEqual((active * 0.3) + 1);
        expect(axis.sessions).toHaveLength(40);
        axis.sessions.forEach(s => expect(s.u1 - s.u0).toBeCloseTo(5 * MIN));
    });

    test('gap exactly at the threshold stays in the session', () => {
        const axis = buildAxis({start: T0, end: T0 + SESSION_BREAK_MS}, [ev(T0), ev(T0 + SESSION_BREAK_MS)]);
        expect(axis.breaks).toEqual([]);
    });

    test('empty / zero range is safe', () => {
        const axis = buildAxis({start: 0, end: 0}, []);
        expect(axis.uEnd).toBe(0);
        expect(axis.toU(0)).toBe(0);
        expect(axis.toT(0)).toBe(0);
        expect(axis.breakAt(0)).toBeNull();
    });

    test('formatGap', () => {
        expect(formatGap(4 * HOUR, 'en')).toBe('4h');
        expect(formatGap((4 * HOUR) + (5 * MIN), 'en')).toBe('4h 5m');
        expect(formatGap(12 * MIN, 'en')).toBe('12m');
        expect(formatGap((3 * 24 * HOUR) + (2 * HOUR), 'en')).toBe('3d 2h');
    });
});
