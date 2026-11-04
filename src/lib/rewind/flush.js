import {uuidv4} from './ops.js';
import {pruneBatches} from './queue.js';
import {buildIdsSidecar} from './ids.js';
import {stateMd5exts} from './recorder.js';

const MAX_OPS_PER_REQUEST = 5000;

export const QUIET_KINDS = new Set(['runtime.state']);
export const isEdit = op => !QUIET_KINDS.has(op.k);
const SOFT_NEEDS_BASE = new Set(['room', 'left-room']);
const RETRY_DELAYS_MS = [2000, 10000, 30000, 120000, 300000];

export class RewindFlusher {
    constructor (opts) {
        this.vm = opts.vm;
        this.recorder = opts.recorder;
        this.api = opts.api;
        this.queue = opts.queue;
        this.projectId = opts.projectId;
        this.user = opts.user || '';
        this.session = opts.session;
        this.baseRevision = typeof opts.baseRevision === 'number' ? opts.baseRevision : null;
        this.storeAsset = opts.storeAsset || null;
        this.now = opts.now || (() => Date.now());
        this.schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
        this.unschedule = opts.unschedule || (id => clearTimeout(id));
        this.retryTimer = null;
        this.retryCount = 0;
        this.log = opts.log || console;
        this.onStop = opts.onStop || null;
        this.room = opts.room || null;
        this.pendingBase = this.recorder.base || null;
        this.forceBase = false;
        this.uploaded = new Set(this.pendingBase ? stateMd5exts(this.pendingBase) : []);
        this.relist = new Set();
        this.baseWantedFor = null;
        this.sending = null;
        this.stopped = false;
        this.stats = {sent: 0, accepted: 0, dropped: 0, failures: 0, droppedLocally: 0};
    }

    saveHeaders () {
        if (this.stopped) return {};
        return this.api.saveHeaders({session: this.session, baseRevision: this.baseRevision, room: this.room});
    }

    setRoom (room) {
        this.room = room || null;
        this.recorder.setRoom(this.room);
        this.pendingBase = this.recorder.rebase(room ? 'joined room' : 'left room');
    }

    buildBatch (savedRevision) {
        const taken = this.recorder.takeBatch();
        let {ops} = taken;
        const {assets, md5exts} = taken;
        const edits = ops.some(isEdit);
        const need = this.recorder.needsBase;
        const needForced = !!need && !SOFT_NEEDS_BASE.has(need);
        let base = this.pendingBase;
        let forced = this.forceBase;
        if (!base && need) {
            base = this.recorder.rebase(need);
            forced = forced || needForced;
        } else if (base && needForced && !edits) {
            base = this.recorder.rebase(need);
            forced = true;
        } else if (base && needForced) {
            forced = true;
        }
        if (base && !forced && !edits) {
            this.pendingBase = base;
            if (ops.length) this.recorder.unshiftOps(ops);
            ops = [];
            base = null;
        } else {
            this.pendingBase = null;
            this.forceBase = false;
        }
        for (const m of this.relist) md5exts.push(m);
        this.relist.clear();
        if (!ops.length && !base && savedRevision === null) return null;
        const list = [...new Set(md5exts.concat(base ? stateMd5exts(base) : []))];
        const bytes = {};
        for (const m of list) {
            if (this.uploaded.has(m)) continue;
            const a = assets.get(m) || this.recorder.assetRefs.get(m);
            if (a && a.data) bytes[m] = {assetType: a.assetType && a.assetType.name, dataFormat: a.dataFormat, data: a.data};
        }
        return {
            key: uuidv4(),
            projectId: this.projectId,
            user: this.user,
            session: this.session,
            room: this.room,
            savedRevision,
            base: base || null,
            baseForced: !!(base && forced),
            headIds: savedRevision === null ? null : buildIdsSidecar(this.vm),
            ops,
            md5exts: list,
            assets: bytes,
            createdAt: this.now(),
            attempts: 0
        };
    }

    async enqueue (savedRevision) {
        const batch = this.buildBatch(savedRevision);
        if (batch) await this.queue.put(batch);
        return batch;
    }

    async afterSave ({revision} = {}) {
        if (this.stopped) return;
        if (typeof revision === 'number') this.baseRevision = revision;
        const saved = this.room ? null : (typeof revision === 'number' ? revision : null);
        this.baseWantedFor = null;
        await this.enqueue(saved);
        await this.sendQueued();
        if (saved !== null && this.baseWantedFor === saved && this.pendingBase && this.forceBase && !this.stopped) {
            this.baseWantedFor = null;
            await this.enqueue(saved);
            await this.sendQueued();
        }
    }

    async flushNow () {
        if (this.stopped) return;
        if (!this.room) return;
        await this.enqueue(null);
        await this.sendQueued();
    }

    sendQueued () {
        if (this.sending) {
            this.sending = this.sending.then(() => this.sendPass());
            return this.sending;
        }
        this.sending = this.sendPass().finally(() => {
            this.sending = null;
        });
        return this.sending;
    }

    async sendPass () {
        if (this.stopped) return;
        const batches = await this.queue.list(this.projectId);
        const {keep, drop} = pruneBatches(batches, {now: this.now(), user: this.user, liveSession: this.session});
        for (const {batch, reason} of drop) {
            this.stats.droppedLocally += batch.ops.length;
            this.log.warn(`[rewind] dropping ${batch.ops.length} queued op(s): ${reason}`);
            await this.queue.remove(batch.key);
            if (batch.session === this.session && reason !== 'unsaved') {
                this.recorder.needsBase = this.recorder.needsBase || `dropped:${reason}`;
            }
        }
        for (const batch of keep) {
            const ok = await this.sendBatch(batch);
            if (!ok) {
                this.scheduleRetry();
                return;
            }
        }
        this.retryCount = 0;
    }

    scheduleRetry () {
        if (this.stopped || this.retryTimer !== null) return;
        const delay = RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)];
        this.retryCount++;
        this.retryTimer = this.schedule(() => {
            this.retryTimer = null;
            this.sendQueued().catch(e => this.log.warn('[rewind] retry failed', e));
        }, delay);
    }

    async uploadAssets (batch) {
        if (!this.storeAsset) return;
        for (const m of Object.keys(batch.assets || {})) {
            if (this.uploaded.has(m)) continue;
            const a = batch.assets[m];
            try {
                await this.storeAsset(a, m);
                this.uploaded.add(m);
            } catch (e) {
                this.log.warn(`[rewind] could not upload ${m}; the server will report it missing`, e);
            }
        }
    }

    requestBody (batch, ops) {
        return {
            session_id: batch.session,
            room: batch.room,
            saved_revision: batch.savedRevision,
            client_now: this.now(),
            base: batch.base,
            base_forced: !!(batch.base && batch.baseForced),
            head_ids: batch.headIds,
            ops,
            assets: batch.md5exts
        };
    }

    async sendBatch (batch) {
        await this.uploadAssets(batch);
        try {
            for (let i = 0; i < Math.max(1, batch.ops.length); i += MAX_OPS_PER_REQUEST) {
                const slice = batch.ops.slice(i, i + MAX_OPS_PER_REQUEST);
                const body = this.requestBody(i === 0 ? batch : Object.assign({}, batch, {base: null}), slice);
                const res = await this.api.postOps(batch.projectId, body);
                this.handleResult(batch, res);
                if (this.stopped) break;
            }
            await this.queue.remove(batch.key);
            return true;
        } catch (e) {
            const status = e && e.status;
            if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                this.log.warn(`[rewind] the server refused ${batch.ops.length} op(s) (${status}); dropping them`);
                this.stats.droppedLocally += batch.ops.length;
                await this.queue.remove(batch.key);
                if (batch.session === this.session) this.recorder.needsBase = this.recorder.needsBase || `refused:${status}`;
                return true;
            }
            this.stats.failures++;
            batch.attempts = (batch.attempts || 0) + 1;
            await this.queue.put(batch);
            return false;
        }
    }

    handleResult (batch, res) {
        if (!res) return;
        this.stats.sent += batch.ops.length;
        this.stats.accepted += res.accepted || 0;
        this.stats.dropped += res.dropped || 0;
        for (const m of batch.md5exts) this.uploaded.add(m);
        if (Array.isArray(res.missing_assets) && res.missing_assets.length) {
            for (const m of res.missing_assets) {
                this.uploaded.delete(m);
                this.relist.add(m);
            }
        }
        if (res.dropped && res.dropped_reasons) {
            this.log.info && this.log.info('[rewind] server dropped ops', res.dropped_reasons);
        }
        if (res.recording === false) {
            this.stop('not recording');
            return;
        }
        if (res.need_base && batch.session === this.session && !this.pendingBase) {
            this.pendingBase = this.recorder.rebase('server asked for a base');
        }
        if (res.stale && batch.session === this.session && !batch.room && batch.savedRevision !== null) {
            this.forceBase = true;
            this.baseWantedFor = batch.savedRevision;
        }
    }

    pagehide () {
        if (this.stopped || !this.room) return;
        let batch;
        try {
            batch = this.buildBatch(null);
        } catch (e) {
            return;
        }
        if (!batch) return;
        this.queue.put(batch).catch(() => {});
        if (Object.keys(batch.assets).length) return;
        this.api.postOps(batch.projectId, this.requestBody(batch, batch.ops), {keepalive: true})
            .then(() => this.queue.remove(batch.key))
            .catch(() => {});
    }

    stop (why) {
        if (this.stopped) return;
        this.stopped = true;
        if (this.retryTimer !== null) {
            this.unschedule(this.retryTimer);
            this.retryTimer = null;
        }
        this.log.info && this.log.info(`[rewind] recording stopped (${why})`);
        if (this.onStop) this.onStop(why);
    }
}
