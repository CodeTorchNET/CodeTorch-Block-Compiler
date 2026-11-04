import {SYSTEM_LANE} from '../../lib/rewind/timeline';

export const PAUSES = ['real', 'long', 'all'];
export const DEFAULT_PAUSES = 'long';

export const IDLE_LEAD_MS = 300;
export const ACTION_LEAD_MS = 600;

/**
 * Whether a timeline event is an edit.
 * @param {object} ev timeline event
 * @returns {boolean} true for an edit
 */
export const isAction = ev => ev.lane !== SYSTEM_LANE && ev.k !== 'runtime.state';

/**
 * The playhead after skipping the pause it is in.
 * @param {object} timeline timeline
 * @param {number} t playhead
 * @param {string} pauses one of PAUSES
 * @returns {number} new playhead
 */
export const skipPause = (timeline, t, pauses) => {
    if (pauses === 'long') {
        const gap = timeline.idleGapAt(t);
        if (gap && gap.to - IDLE_LEAD_MS > t) return gap.to - IDLE_LEAD_MS;
        return t;
    }
    if (pauses === 'all') {
        const next = timeline.nextEventAfter(Math.floor(t), isAction);
        if (!next) return Math.max(t, timeline.range.end);
        if (next.ts - ACTION_LEAD_MS > t) return next.ts - ACTION_LEAD_MS;
    }
    return t;
};
