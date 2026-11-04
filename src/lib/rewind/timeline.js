import {applyOpInPlace, RewindApplyError} from './apply.js';
import {cloneState, equalCanonical, diffCanonical, findTarget, sameCostumePicture} from './state.js';
import {buildAxis} from './time-axis.js';

export const CHECKPOINT_EVERY = 200;
export const IDLE_GAP_MS = 60 * 1000;
export const SYSTEM_LANE = 'system';

const LANE_COLORS = {
    author: '#4C97FF',
    torchy: '#FF8C1A',
    system: '#8A94A6'
};
const COLLAB_COLORS = ['#0FBD8C', '#FF6680', '#CF63CF', '#FFBF00', '#5CB1D6', '#59C059', '#E6564F', '#9966FF'];

export const opTime = op => (typeof op.ts === 'number' ? op.ts : op.t);

const compareOps = (a, b) => (opTime(a) - opTime(b)) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));

const SYSTEM_KINDS = new Set(['runtime.state', 'restore', 'system.replaced', 'system.unknown']);

/**
 * Lane key of an op.
 * @param {object} op op
 * @returns {string} lane key
 */
export const laneOf = op => {
    if (SYSTEM_KINDS.has(op.k) || op.source === 'runtime' || op.source === 'system' || op.source === 'restore') {
        return SYSTEM_LANE;
    }
    switch (op.actor_kind) {
    case 'author': return 'author';
    case 'torchy': return 'torchy';
    case 'collaborator': return `collaborator:${op.user || ''}`;
    case 'system':
    case 'unknown':
        return SYSTEM_LANE;
    default:
        return op.actor === 'torchy' ? 'torchy' : 'author';
    }
};

const laneOfActor = a => {
    if (a.kind === 'author') return 'author';
    if (a.kind === 'torchy') return 'torchy';
    if (a.kind === 'collaborator') return `collaborator:${a.user || ''}`;
    return SYSTEM_LANE;
};

const QUIET_KINDS = new Set(['art.keyframe', 'system.unknown', 'runtime.state']);

/**
 * The block an op is about.
 * @param {object} op op
 * @returns {?string} block id
 */
const blockOf = op => {
    if (!op.d) return null;
    switch (op.k) {
    case 'blocks.update':
    case 'blocks.delete':
    case 'blocks.deleteInput':
        return op.d.id || null;
    case 'blocks.add': {
        const ids = Object.keys(op.d.blocks || {});
        const top = ids.find(id => op.d.blocks[id] && op.d.blocks[id].topLevel);
        return top || ids[0] || null;
    }
    default:
        return null;
    }
};

/**
 * The costume or sound an op is about.
 * @param {object} op op
 * @returns {?string} costume
 */
const assetOf = op => {
    if (!op.d) return null;
    if (op.k.startsWith('art.')) return op.d.costume || null;
    if (/^(costume|sound)\.(add|update|delete)$/.test(op.k)) return op.d.id || null;
    return null;
};

/**
 * Which editor tab an op belongs to.
 * @param {object} op op
 * @returns {?string} result
 */
export const tabOf = op => {
    const k = op.k || '';
    if (k.startsWith('costume.') || k.startsWith('art.')) return 'costumes';
    if (k.startsWith('sound.')) return 'sounds';
    if (k.startsWith('blocks.') || k.startsWith('comment.') || k.startsWith('var.')) return 'code';
    return null;
};

const costumeKey = (targetId, costumeId) => `${targetId}\u0000${costumeId}`;

const findCostume = (state, targetId, costumeId) => {
    const t = findTarget(state, targetId);
    if (!t) return null;
    return {target: t, costume: (t.costumes || []).find(c => c.id === costumeId) || null};
};

const repairCostume = (costume, md5ext, format) => {
    costume.md5ext = md5ext;
    const dot = md5ext.lastIndexOf('.');
    costume.assetId = dot === -1 ? md5ext : md5ext.slice(0, dot);
    costume.dataFormat = format || (dot === -1 ? costume.dataFormat : md5ext.slice(dot + 1));
};

/**
 * One replay step.
 * @param {object} state state
 * @param {object} op op
 * @returns {?boolean} mismatch
 */
export const replayStep = (state, op) => {
    applyOpInPlace(state, op);
    if (op.k !== 'art.keyframe') return null;
    const found = findCostume(state, op.tg, op.d.costume);
    if (!found || !found.costume) return null;
    if (found.costume.md5ext === op.d.md5ext) return false;
    repairCostume(found.costume, op.d.md5ext, op.d.format);
    return true;
};

const parseTime = v => {
    if (v === null || typeof v === 'undefined') return null;
    if (typeof v === 'number') return v;
    const ms = Date.parse(v);
    return isNaN(ms) ? null : ms;
};

const lowerBound = (arr, key, get) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (get(arr[mid]) < key) lo = mid + 1;
        else hi = mid;
    }
    return lo;
};

/**
 * Number of ops with time <= t.
 * @param {Array<object>} ops ops sorted by time
 * @param {number} t epoch ms
 * @returns {number} count
 */
const countUpTo = (ops, t) => lowerBound(ops, t + 1, opTime);

export class Timeline {
    /**
     * @param {object} opts options
     * @param {function(): Promise<object>} opts.fetchIndex fetchIndex
     * @param {function(number): Promise<object>} opts.fetchChunk fetchChunk
     * @param {function(number): Promise<Array<object>>} opts.fetchSegment fetchSegment
     * @param {function(number, string): Promise<*>} [opts.postVerify] postVerify
     * @param {?number} [opts.until] until
     * @param {number} [opts.checkpointEvery] ops between checkpoints
     * @param {number} [opts.idleGapMs] idleGapMs
     * @param {number} [opts.checkpointSegments] segments whose checkpoints stay cached
     * @param {function(string, ...*)} [opts.log] diagnostics
     */
    constructor (opts) {
        this.fetchIndex = opts.fetchIndex;
        this.fetchChunk = opts.fetchChunk;
        this.fetchSegment = opts.fetchSegment;
        this.postVerify = opts.postVerify || (() => Promise.resolve());
        this.until = typeof opts.until === 'number' && isFinite(opts.until) ? opts.until : null;
        this.checkpointEvery = opts.checkpointEvery || CHECKPOINT_EVERY;
        this.idleGapMs = opts.idleGapMs || IDLE_GAP_MS;
        this.checkpointSegments = opts.checkpointSegments || 4;
        this.log = opts.log || (() => {});

        this.info = null;
        this.segments = [];
        this.lanes = [];
        this.events = [];
        this.markers = [];
        this.idleGaps = [];
        this.axis = buildAxis({start: 0, end: 0}, []);
        this.brokenRanges = [];
        this.range = {start: 0, end: 0};

        this._listeners = new Set();
        this._cursor = null;
        this._queue = Promise.resolve();
        this._lastSegment = null;
        this._checkpointLru = [];
        this._boundaries = new Map();
        this._posted = new Set();
    }

    on (event, fn) {
        if (event !== 'change') return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _emit () {
        for (const fn of this._listeners) {
            try {
                fn(this);
            } catch (e) {
                this.log('listener failed', e);
            }
        }
    }

    async load () {
        const index = await this.fetchIndex();
        this.info = {
            startedAt: parseTime(index.started_at),
            recording: !!index.recording,
            locked: !!index.locked,
            deleteAfter: parseTime(index.delete_after),
            canRestore: !!index.can_restore,
            compactedBefore: parseTime(index.compacted_before),
            serverNow: typeof index.server_now === 'number' ? index.server_now : null
        };
        const segs = (index.segments || []).map(s => ({
            n: s.n,
            baseTs: s.base_ts,
            chunkTs: typeof s.chunk_ts === 'number' ? s.chunk_ts : s.base_ts,
            endTs: typeof s.end_ts === 'number' ? s.end_ts : null,
            opCount: s.op_count || 0,
            actors: Array.isArray(s.actors) ? s.actors : [],
            sealed: !!s.sealed,
            compacted: !!s.compacted,
            verified: s.verified || 'unknown',
            kind: s.kind || 'normal',
            chunk: null,
            ops: null,
            loading: null,
            loaded: false,
            failedAt: null,
            failError: null,
            failTs: null,
            checkpoints: null,
            broken: [],
            dirtyAtEnd: null,
            lastTs: null,
            error: null
        }));
        segs.sort((a, b) => (a.baseTs - b.baseTs) || (a.n - b.n));
        this.segments = this.until === null ? segs : segs.filter((s, i) => i === 0 || s.baseTs <= this.until);
        this._rebuild();
        if (this.segments.length) {
            await this.ensureLoaded(this.segments[this.segments.length - 1]);
        }
        return this;
    }

    get isEmpty () {
        return this.segments.length === 0;
    }

    segmentByN (n) {
        return this.segments.find(s => s.n === n) || null;
    }

    _nextSegment (seg) {
        const i = this.segments.indexOf(seg);
        return i === -1 ? null : (this.segments[i + 1] || null);
    }

    /**
     * The segment that state(t) replays.
     * @param {number} t epoch ms
     * @returns {?object} segment
     */
    segmentAt (t) {
        if (!this.segments.length) return null;
        const i = lowerBound(this.segments, t + 1, s => s.baseTs) - 1;
        return this.segments[Math.max(0, i)];
    }

    ensureLoaded (seg) {
        if (seg.loaded) return Promise.resolve(seg);
        if (seg.loading) return seg.loading;
        seg.loading = (async () => {
            const [chunk, ops] = await Promise.all([
                this.fetchChunk(seg.n),
                seg.compacted ? Promise.resolve([]) : this.fetchSegment(seg.n)
            ]);
            const sorted = (ops || []).filter(op => op && typeof op === 'object' && typeof opTime(op) === 'number');
            sorted.sort(compareOps);
            Object.assign(seg, {chunk, ops: sorted});
            this._analyse(seg);
            seg.loaded = true;
            this._rebuild();
            this._emit();
            return seg;
        })();
        seg.loading.catch(e => {
            seg.loading = null;
            seg.error = e;
            this.log('segment failed to load', seg.n, e);
        });
        return seg.loading;
    }

    /**
     * Load every segment.
     * @returns {Promise<void>} done
     */
    async prefetch () {
        const todo = this.segments.filter(s => !s.loaded).reverse();
        const worker = async () => {
            while (todo.length) {
                const seg = todo.shift();
                try {
                    await this.ensureLoaded(seg);
                } catch (e) {
                    // ignore
                }
            }
        };
        await Promise.all([worker(), worker()]);
        for (const seg of this.segments) {
            const next = this._nextSegment(seg);
            if (next && seg.loaded && next.loaded) await this.checkBoundary(seg.n, {post: false});
        }
    }

    _analyse (seg) {
        const state = cloneState(seg.chunk);
        const checkpoints = new Map();
        checkpoints.set(0, seg.chunk);
        const dirty = new Map();
        const lastRepair = new Map();
        const broken = [];
        seg.failedAt = null;
        seg.failError = null;
        seg.failTs = null;
        const ops = seg.ops;
        for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            const ts = Math.max(opTime(op), seg.baseTs);
            let mismatch;
            try {
                mismatch = replayStep(state, op);
            } catch (e) {
                if (!(e instanceof RewindApplyError)) throw e;
                seg.failedAt = i;
                seg.failError = e.message;
                seg.failTs = ts;
                this.log('replay failed', seg.n, i, e.message);
                break;
            }
            if ((op.k === 'art.vector' || op.k === 'art.bitmap') && op.tg && op.d && op.d.costume) {
                const key = costumeKey(op.tg, op.d.costume);
                if (!dirty.has(key)) dirty.set(key, {from: ts, targetId: op.tg, costumeId: op.d.costume});
            } else if (op.k === 'art.keyframe') {
                const key = costumeKey(op.tg, op.d.costume);
                const d = dirty.get(key);
                if (mismatch && d) {
                    broken.push(this._brokenRange(seg, state, d, ts, lastRepair.get(key)));
                }
                dirty.delete(key);
                lastRepair.set(key, ts);
            } else if (op.k === 'costume.delete' && op.tg && op.d) {
                dirty.delete(costumeKey(op.tg, op.d.id));
            }
            if ((i + 1) % this.checkpointEvery === 0 && i + 1 < ops.length) {
                checkpoints.set(i + 1, cloneState(state));
            }
        }
        const end = seg.failedAt === null ? ops.length : seg.failedAt;
        seg.checkpoints = checkpoints;
        checkpoints.set(end, seg.failedAt === null ? state : this._replayTo(seg, end));
        seg.broken = broken;
        seg.dirtyAtEnd = [...dirty.values()].map(d => Object.assign({}, d, {
            asOf: typeof lastRepair.get(costumeKey(d.targetId, d.costumeId)) === 'number' ?
                lastRepair.get(costumeKey(d.targetId, d.costumeId)) : seg.baseTs
        }));
        seg.lastTs = ops.length ? Math.max(seg.baseTs, opTime(ops[ops.length - 1])) : seg.baseTs;
        this._touchCheckpoints(seg);
    }

    _brokenRange (seg, state, d, to, repairTs) {
        const found = findCostume(state, d.targetId, d.costumeId);
        return {
            segment: seg.n,
            targetId: d.targetId,
            costumeId: d.costumeId,
            targetName: found && found.target ? found.target.name : '',
            costumeName: found && found.costume ? found.costume.name : '',
            from: d.from,
            to,
            asOf: typeof repairTs === 'number' ? repairTs : seg.baseTs
        };
    }

    _touchCheckpoints (seg) {
        const lru = this._checkpointLru.filter(s => s !== seg);
        lru.push(seg);
        while (lru.length > this.checkpointSegments) {
            const old = lru.shift();
            if (old.checkpoints) {
                const keep = new Map();
                keep.set(0, old.chunk);
                const endIndex = old.failedAt === null ? old.ops.length : old.failedAt;
                if (old.checkpoints.has(endIndex)) keep.set(endIndex, old.checkpoints.get(endIndex));
                old.checkpoints = keep;
            }
        }
        this._checkpointLru = lru;
    }

    _rebuild () {
        const laneKeys = new Map();
        const addLane = (key, kind, user) => {
            if (!laneKeys.has(key)) laneKeys.set(key, {key, kind, user: user || ''});
        };
        addLane('author', 'author', '');
        const events = [];
        const markers = [];
        let end = 0;
        for (let si = 0; si < this.segments.length; si++) {
            const seg = this.segments[si];
            const next = this.segments[si + 1] || null;
            for (const a of seg.actors) {
                const key = laneOfActor(a);
                if (key !== SYSTEM_LANE) addLane(key, a.kind, a.user);
                if (key === 'author' && a.user && !laneKeys.get('author').user) laneKeys.get('author').user = a.user;
            }
            end = Math.max(end, seg.baseTs, seg.endTs || 0, seg.lastTs || 0);
            if (seg.kind === 'replaced') {
                markers.push({ts: seg.baseTs, kind: 'replaced', segment: seg.n});
            }
            if (seg.compacted) {
                markers.push({ts: seg.baseTs, to: next ? next.baseTs : null, kind: 'compacted', segment: seg.n});
            }
            if (seg.verified === 'mismatch' && next) {
                markers.push({ts: next.baseTs, kind: 'unknown', reason: 'mismatch', segment: seg.n});
            }
            const boundary = this._boundaryResult(seg);
            if (boundary && !boundary.equal && seg.verified !== 'mismatch' && next) {
                markers.push({ts: next.baseTs, kind: 'unknown', reason: 'mismatch', segment: seg.n});
            }
            if (!seg.loaded) continue;
            if (seg.failedAt !== null) {
                markers.push({
                    ts: seg.failTs,
                    to: next ? next.baseTs : null,
                    kind: 'unknown',
                    reason: 'apply',
                    detail: seg.failError,
                    segment: seg.n
                });
            }
            const limit = seg.failedAt === null ? seg.ops.length : seg.failedAt;
            for (let i = 0; i < limit; i++) {
                const op = seg.ops[i];
                const ts = Math.max(opTime(op), seg.baseTs);
                if (op.k === 'system.replaced') {
                    markers.push({ts, kind: 'replaced', segment: seg.n});
                    continue;
                }
                if (op.k === 'restore') {
                    markers.push({
                        ts,
                        kind: 'restore',
                        to: op.d && op.d.to,
                        user: (op.d && op.d.label_user) || op.user || '',
                        segment: seg.n
                    });
                }
                if (QUIET_KINDS.has(op.k)) continue;
                const lane = laneOf(op);
                if (lane !== SYSTEM_LANE) addLane(lane, op.actor_kind || 'author', op.user);
                if (lane === 'author' && op.user && !laneKeys.get('author').user) laneKeys.get('author').user = op.user;
                events.push({
                    ts,
                    lane,
                    k: op.k,
                    tg: op.tg || null,
                    g: op.g || null,
                    block: blockOf(op),
                    asset: assetOf(op),
                    tab: tabOf(op),
                    segment: seg.n,
                    index: i
                });
            }
        }
        if (this.info && this.info.serverNow && !this.segments.length) end = this.info.serverNow;
        events.sort((a, b) => a.ts - b.ts);
        markers.sort((a, b) => a.ts - b.ts);

        const collabs = [...laneKeys.values()].filter(l => l.key.startsWith('collaborator:'))
            .sort((a, b) => a.user.localeCompare(b.user));
        const lanes = [laneKeys.get('author')];
        collabs.forEach((l, i) => lanes.push(Object.assign({}, l, {color: COLLAB_COLORS[i % COLLAB_COLORS.length]})));
        if (laneKeys.has('torchy')) lanes.push(laneKeys.get('torchy'));
        lanes.push({key: SYSTEM_LANE, kind: 'system', user: ''});
        for (const l of lanes) if (!l.color) l.color = LANE_COLORS[l.kind] || LANE_COLORS.system;

        const start = this.segments.length ? this.segments[0].baseTs : 0;
        if (this.until !== null) end = Math.min(Math.max(end, start), this.until);
        this.range = {start, end: Math.max(start, end)};
        this.lanes = lanes;
        this.events = this.until === null ? events : events.filter(e => e.ts <= this.until);
        this.markers = this.until === null ? markers : markers.filter(m => m.ts <= this.until);
        this.brokenRanges = [];
        for (const seg of this.segments) {
            for (const b of seg.broken) this.brokenRanges.push(b);
            const boundary = this._boundaryResult(seg);
            if (boundary) for (const b of boundary.broken) this.brokenRanges.push(b);
        }
        this.idleGaps = this._idleGaps();
        this.axis = buildAxis(this.range, this.events);
    }

    _idleGaps () {
        const gaps = [];
        const evs = this.events.filter(e => e.k !== 'runtime.state');
        let prev = this.range.start;
        for (const e of evs) {
            if (e.ts - prev > this.idleGapMs) gaps.push({from: prev, to: e.ts});
            prev = Math.max(prev, e.ts);
        }
        if (this.range.end - prev > this.idleGapMs && evs.length) gaps.push({from: prev, to: this.range.end});
        return gaps;
    }

    /**
     * @param {number} t epoch ms
     * @returns {?{from: number, to: number}} gap
     */
    idleGapAt (t) {
        for (const g of this.idleGaps) if (t >= g.from && t < g.to) return g;
        return null;
    }

    /**
     * Events with from < ts <= to, in order.
     * @param {number} from from
     * @param {number} to to
     * @returns {Array<object>} events
     */
    eventsBetween (from, to) {
        const i = lowerBound(this.events, Math.floor(from) + 1, e => e.ts);
        const out = [];
        for (let j = i; j < this.events.length && this.events[j].ts <= to; j++) out.push(this.events[j]);
        return out;
    }

    /**
     * Latest event at or before t that passes `filter`.
     * @param {number} t epoch ms
     * @param {function(object): boolean} [filter] which events count
     * @returns {?object} event
     */
    lastEventAtOrBefore (t, filter) {
        let j = lowerBound(this.events, Math.floor(t) + 1, e => e.ts) - 1;
        for (; j >= 0; j--) if (!filter || filter(this.events[j])) return this.events[j];
        return null;
    }

    /**
     * First event after t that passes `filter`.
     * @param {number} t epoch ms
     * @param {function(object): boolean} [filter] which events count
     * @returns {?object} event
     */
    nextEventAfter (t, filter) {
        for (let j = lowerBound(this.events, Math.floor(t) + 1, e => e.ts); j < this.events.length; j++) {
            if (!filter || filter(this.events[j])) return this.events[j];
        }
        return null;
    }

    /**
     * Broken costume ranges containing t.
     * @param {number} t epoch ms
     * @returns {Array<object>} ranges
     */
    brokenAt (t) {
        return this.brokenRanges.filter(b => t >= b.from && t < b.to);
    }

    clampTime (t) {
        return Math.min(Math.max(t, this.range.start), this.range.end);
    }

    /**
     * State at time t.
     * @param {number} t epoch ms
     * @returns {Promise<object>} result
     */
    stateAt (t) {
        const run = this._queue.then(() => this._stateAt(t));
        this._queue = run.catch(() => {});
        return run;
    }

    async _stateAt (tIn) {
        if (!this.segments.length) throw new Error('rewind: empty timeline');
        const t = Math.floor(this.clampTime(tIn));
        const seg = this.segmentAt(t);
        await this.ensureLoaded(seg);
        if (this._lastSegment && this._lastSegment !== seg) this._crossed(this._lastSegment, seg);
        this._lastSegment = seg;

        const wanted = seg.compacted ? 0 : countUpTo(seg.ops, t);
        const target = seg.failedAt === null ? wanted : Math.min(wanted, seg.failedAt);
        const c = this._cursor;
        if (c && c.segment === seg && c.index <= target) {
            for (let i = c.index; i < target; i++) replayStep(c.state, seg.ops[i]);
            c.index = target;
        } else {
            this._cursor = {segment: seg, index: target, state: this._replayTo(seg, target)};
        }
        this._touchCheckpoints(seg);
        return {
            state: this._cursor.state,
            t,
            segment: seg.n,
            index: target,
            unknown: seg.failedAt !== null && wanted > seg.failedAt,
            broken: this.brokenAt(t)
        };
    }

    _replayTo (seg, target) {
        if (!seg.checkpoints) seg.checkpoints = new Map([[0, seg.chunk]]);
        let best = 0;
        for (const k of seg.checkpoints.keys()) if (k <= target && k > best) best = k;
        const state = cloneState(seg.checkpoints.get(best));
        for (let i = best; i < target; i++) {
            replayStep(state, seg.ops[i]);
            const next = i + 1;
            if (next % this.checkpointEvery === 0 && next < target && !seg.checkpoints.has(next)) {
                seg.checkpoints.set(next, cloneState(state));
            }
        }
        return state;
    }

    /**
     * Fresh replay of state(t).
     * @param {number} tIn epoch ms
     * @returns {Promise<object>} private RewindState
     */
    async freshStateAt (tIn) {
        const t = Math.floor(this.clampTime(tIn));
        const seg = this.segmentAt(t);
        await this.ensureLoaded(seg);
        const wanted = seg.compacted ? 0 : countUpTo(seg.ops, t);
        const target = seg.failedAt === null ? wanted : Math.min(wanted, seg.failedAt);
        const state = cloneState(seg.chunk);
        for (let i = 0; i < target; i++) replayStep(state, seg.ops[i]);
        return state;
    }

    _crossed (a, b) {
        const lo = a.baseTs <= b.baseTs ? a : b;
        const hi = lo === a ? b : a;
        const i0 = this.segments.indexOf(lo);
        const i1 = this.segments.indexOf(hi);
        for (let i = i0; i < i1; i++) {
            const seg = this.segments[i];
            this.checkBoundary(seg.n, {post: true}).catch(e => this.log('verification failed', seg.n, e));
        }
    }

    _boundaryResult (seg) {
        const entry = this._boundaries.get(seg.n);
        return entry && entry.result ? entry.result : null;
    }

    /**
     * Check a segment boundary.
     * @param {number} n segment number
     * @param {{post: boolean}} [opts] opts
     * @returns {Promise<?object>} result
     */
    checkBoundary (n, opts = {}) {
        const seg = this.segmentByN(n);
        const next = seg && this._nextSegment(seg);
        if (!seg || !next || seg.compacted) return Promise.resolve(null);
        let entry = this._boundaries.get(n);
        if (!entry) {
            entry = {result: null};
            entry.promise = (async () => {
                await Promise.all([this.ensureLoaded(seg), this.ensureLoaded(next)]);
                const endIndex = seg.failedAt === null ? seg.ops.length : seg.failedAt;
                const end = seg.checkpoints && seg.checkpoints.get(endIndex);
                const endState = end || this._replayTo(seg, endIndex);
                const equal = seg.failedAt === null && equalCanonical(endState, next.chunk);
                const diff = equal ? [] : diffCanonical(endState, next.chunk, 20);
                if (!equal) this.log('boundary mismatch', n, diff);
                const broken = this._brokenAtBoundary(seg, endState, next);
                entry.result = {equal, diff, broken};
                this._rebuild();
                this._emit();
                return entry.result;
            })();
            this._boundaries.set(n, entry);
        }
        return entry.promise.then(result => {
            if (opts.post && seg.verified === 'unknown' && seg.sealed && !this._posted.has(n)) {
                this._posted.add(n);
                const verdict = result.equal ? 'ok' : 'mismatch';
                seg.verified = verdict;
                this._rebuild();
                this._emit();
                return Promise.resolve(this.postVerify(n, verdict))
                    .catch(e => this.log('verify POST failed', n, e))
                    .then(() => result);
            }
            return result;
        });
    }

    _brokenAtBoundary (seg, endState, next) {
        const out = [];
        for (const d of seg.dirtyAtEnd || []) {
            const here = findCostume(endState, d.targetId, d.costumeId);
            if (!here || !here.costume) continue;
            let there = findCostume(next.chunk, d.targetId, d.costumeId);
            if (!there || !there.costume) {
                const t = next.chunk.targets.find(x => x.name === here.target.name &&
                    !!x.isStage === !!here.target.isStage);
                const c = t && (t.costumes || []).find(x => x.name === here.costume.name);
                there = c ? {target: t, costume: c} : null;
            }
            if (!there || !there.costume ||
                sameCostumePicture(here.target, here.costume, there.target, there.costume)) continue;
            out.push({
                segment: seg.n,
                targetId: d.targetId,
                costumeId: d.costumeId,
                targetName: here.target.name,
                costumeName: here.costume.name,
                from: d.from,
                to: next.baseTs,
                asOf: d.asOf
            });
        }
        return out;
    }

    /**
     * The state a restore to t should produce.
     * @param {number} tIn epoch ms
     * @returns {Promise<{state: object, t: number, warnings: Array<object>}>} private copy
     */
    async restoreStateAt (tIn) {
        const t = Math.floor(this.clampTime(tIn));
        const seg = this.segmentAt(t);
        await this.ensureLoaded(seg);
        await this.checkBoundary(seg.n, {post: false}).catch(() => null);
        const at = await this.stateAt(t);
        const state = cloneState(at.state);
        const warnings = [];
        for (const b of this.brokenAt(t)) {
            if (b.segment !== seg.n) continue;
            const good = await this.stateAt(b.asOf);
            const from = findCostume(good.state, b.targetId, b.costumeId);
            const into = findCostume(state, b.targetId, b.costumeId);
            if (from && from.costume && into && into.costume) {
                for (const k of ['assetId', 'dataFormat', 'md5ext', 'rotationCenterX', 'rotationCenterY',
                    'bitmapResolution']) {
                    into.costume[k] = from.costume[k];
                }
                if (into.target.art) delete into.target.art[b.costumeId];
            }
            warnings.push({
                kind: 'costume', targetName: b.targetName, costumeName: b.costumeName, at: t, asOf: b.asOf
            });
        }
        if (seg.failedAt !== null && countUpTo(seg.ops, t) > seg.failedAt) {
            warnings.push({kind: 'unknown', at: t, asOf: seg.failTs});
        }
        return {state, t, warnings};
    }
}

export default Timeline;
