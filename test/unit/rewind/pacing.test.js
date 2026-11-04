import {skipPause, isAction, IDLE_LEAD_MS, ACTION_LEAD_MS} from '../../../src/components/rewind-viewer/pacing';
import {Timeline} from '../../../src/lib/rewind/timeline';

const fakeTimeline = (events, end) => ({
    range: {start: 0, end},
    idleGaps: [{from: 1000, to: 100000}],
    idleGapAt (t) {
        return this.idleGaps.find(g => t >= g.from && t < g.to) || null;
    },
    nextEventAfter: Timeline.prototype.nextEventAfter,
    events
});

const edit = ts => ({ts, k: 'blocks.move', lane: 'author'});
const running = ts => ({ts, k: 'runtime.state', lane: 'system'});

describe('rewind pauses', () => {
    const tl = fakeTimeline([edit(1000), edit(1100), running(5000), edit(100000), edit(100050)], 200000);

    test('real: nothing is jumped', () => {
        expect(skipPause(tl, 2000, 'real')).toBe(2000);
        expect(skipPause(tl, 50000, 'real')).toBe(50000);
    });

    test('long: only idle gaps are jumped', () => {
        expect(skipPause(tl, 500, 'long')).toBe(500);
        expect(skipPause(tl, 2000, 'long')).toBe(100000 - IDLE_LEAD_MS);
    });

    test('all: every pause shrinks to the lead, edits close together play as they happened', () => {
        expect(skipPause(tl, 1000, 'all')).toBe(1000);
        expect(skipPause(tl, 0, 'all')).toBe(1000 - ACTION_LEAD_MS);
        expect(skipPause(tl, 1100, 'all')).toBe(100000 - ACTION_LEAD_MS);
        expect(skipPause(tl, 100000 - 100, 'all')).toBe(100000 - 100);
        expect(skipPause(tl, 100050, 'all')).toBe(200000);
    });

    test('what counts as an edit', () => {
        expect(isAction(edit(1))).toBe(true);
        expect(isAction(running(1))).toBe(false);
        expect(isAction({ts: 1, k: 'system.unknown', lane: 'system'})).toBe(false);
    });
});
