import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';

import Timeline from '../../lib/rewind/timeline';
import storage from '../../lib/storage';
import log from '../../lib/log';
import {closeRewind, clearRewindFromUrl} from '../../reducers/rewind';
import {manualUpdateProject} from '../../reducers/project-state';

import {rewindApi} from '../../lib/rewind/api';
import {restoreTo} from '../../lib/rewind/restore';
import rewindController from '../../lib/rewind/controller';
import RewindDisplay from './display';
import {targetToWorkspaceXml, workspaceKey} from './workspace-xml';
import RewindWorkspace from './workspace-view.jsx';
import TimelineBar from './timeline-bar.jsx';
import messages from './messages';
import {DEFAULT_PAUSES, PAUSES, IDLE_LEAD_MS, skipPause} from './pacing';
import {diffBlocks, stateSnapshot} from './changes';
import {formatClock, formatClockSeconds, formatDate, formatMoment} from './time-format';
import styles from './rewind-viewer.css';
import {TRUSTED_IFRAME_HOST} from '../../lib/brand';

export const SPEEDS = [1, 2, 4, 8, 16];
export const MIN_DWELL_MS = 1500;
const PLAY_ICON_PATH = 'M3.7 2.6v10.8a1 1 0 0 0 1.52.85l8.6-5.4a1 1 0 0 0 0-1.7l-8.6-5.4A1 1 0 0 0 3.7 2.6z';
const PULSE_MS = 900;
const GHOST_MS = 600;
const CAPTION_MS = 3500;
const MAX_CHANGE_SPAN_MS = 60 * 1000;
const WORKSPACE_THROTTLE_MS = 250;

const fullView = tl => ({start: 0, end: Math.max(tl.axis.uEnd, 1000)});

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

const findTarget = (state, id) => state.targets.find(t => t.id === id) || null;

/**
 * Timeline fetchers for a project.
 * @param {string|number} projectId project
 * @returns {object} result
 */
export const makeRewindFetchers = projectId => ({
    fetchIndex: () => rewindApi.getIndex(projectId),
    fetchChunk: n => rewindApi.getChunk(projectId, n),
    fetchSegment: n => rewindApi.getSegment(projectId, n),
    postVerify: (n, result) => rewindApi.verify(projectId, n, result)
});

/**
 * Leave viewing mode for the recorder.
 * @returns {?object} the recording session's recorder
 */
const resumeRecording = () => {
    clearRewindFromUrl();
    try {
        rewindController.maybeStart();
    } catch (e) {
        log.warn('[rewind] could not start recording', e);
    }
    return rewindController.session ? rewindController.session.recorder : null;
};

class RewindViewerInner extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'setStageCanvas', 'setWorkspace', 'handleScrub', 'handleViewChange', 'handleTogglePlay', 'tick',
            'handleSpeed', 'handlePauses', 'handleFollow', 'handleSelectTarget', 'handleTab', 'handleExit',
            'handleRestoreClick', 'handleRestoreConfirm', 'handleRestoreCancel', 'handleRetry', 'laneLabel',
            'tooltipFor', 'handleKeyDown', 'handleTimelineChange', 'handleStageResize'
        ]);
        this.state = {
            status: 'loading',
            error: null,
            t: 0,
            shownT: null,
            view: {start: 0, end: 1},
            playing: false,
            speed: 1,
            pauses: DEFAULT_PAUSES,
            follow: 'author',
            camera: {targetId: null, tab: 'code', asset: null, block: null},
            targets: [],
            assets: {costumes: [], sounds: [], currentCostume: null},
            broken: [],
            unknown: null,
            pulses: {},
            restore: null,
            tlVersion: 0,
            caption: null
        };
        this.timeline = null;
        this.display = null;
        this.workspace = null;
        this.wantT = null;
        this.wantCamera = false;
        this.busy = false;
        this.dragging = false;
        this.lastWorkspace = {targetId: null, key: null, at: 0, t: null, xml: null};
        this.lastSnapshot = null;
        this.captionSeq = 0;
        this.workspaceTimer = null;
        this.lastCameraAt = -Infinity;
        this.pendingCamera = null;
        this.raf = null;
        this.pulseTimers = new Map();
        this.pulseSeq = 0;
    }
    componentDidMount () {
        this.mounted = true;
        document.addEventListener('keydown', this.handleKeyDown);
        if (typeof window !== 'undefined') window.addEventListener('resize', this.handleStageResize);
        this.load();
    }
    componentWillUnmount () {
        this.mounted = false;
        document.removeEventListener('keydown', this.handleKeyDown);
        if (typeof window !== 'undefined') window.removeEventListener('resize', this.handleStageResize);
        if (this.raf) cancelAnimationFrame(this.raf);
        clearTimeout(this.workspaceTimer);
        clearTimeout(this.ghostTimer);
        clearTimeout(this.captionTimer);
        for (const timer of this.pulseTimers.values()) clearTimeout(timer);
        if (this.unsubscribe) this.unsubscribe();
        if (this.display) this.display.dispose();
        if (typeof window !== 'undefined' && window.__ctRewindViewer === this) delete window.__ctRewindViewer;
    }

    async load () {
        this.setState({status: 'loading', error: null});
        const fetchers = this.props.fetchers || makeRewindFetchers(this.props.projectId);
        const timeline = new Timeline(Object.assign({}, fetchers, {
            until: this.props.until,
            log: (...args) => log.warn('[rewind]', ...args)
        }));
        this.timeline = timeline;
        try {
            await timeline.load();
        } catch (e) {
            if (!this.mounted || this.timeline !== timeline) return;
            const status = e && (e.status === 403 || e.status === 404) ? 'unavailable' : 'error';
            this.setState({status, error: e});
            return;
        }
        if (!this.mounted || this.timeline !== timeline) return;
        if (typeof window !== 'undefined') window.__ctRewindViewer = this;
        if (timeline.isEmpty) {
            this.setState({status: 'empty'});
            return;
        }
        this.unsubscribe = timeline.on('change', this.handleTimelineChange);
        const range = timeline.range;
        this.setState({
            status: 'ready',
            t: range.end,
            view: fullView(timeline),
            follow: 'author'
        }, () => {
            this.requestShow(range.end, {camera: true});
            timeline.prefetch().catch(e => log.warn('[rewind] prefetch failed', e));
        });
    }
    handleTimelineChange () {
        if (!this.mounted) return;
        const tl = this.timeline;
        this.setState(s => {
            const wasFull = s.view.start <= 1 && s.view.end >= s.lastUEnd - 1;
            return {
                tlVersion: s.tlVersion + 1,
                lastUEnd: tl.axis.uEnd,
                view: wasFull || !s.lastUEnd ? fullView(tl) : s.view
            };
        });
    }
    handleRetry () {
        this.load();
    }

    setStageCanvas (el) {
        this.stageCanvas = el;
        if (el && !this.display) {
            this.display = new RewindDisplay({storage: this.props.storage || storage, canvas: el});
            this.handleStageResize();
        }
    }
    setWorkspace (el) {
        this.workspace = el;
    }
    handleStageResize () {
        if (this.display && this.stageCanvas) {
            const rect = this.stageCanvas.getBoundingClientRect();
            if (rect.width > 0) this.display.resize(rect.width, rect.height);
        }
        if (this.workspace) this.workspace.resize();
    }
    requestShow (t, opts = {}) {
        this.wantT = t;
        if (opts.camera) this.wantCamera = true;
        if (!this.busy) this.pump();
    }
    async pump () {
        this.busy = true;
        try {
            while (this.wantT !== null && this.mounted) {
                const t = this.wantT;
                const moveCamera = this.wantCamera;
                this.wantT = null;
                this.wantCamera = false;
                const res = await this.timeline.stateAt(t);
                if (!this.mounted) return;
                const state = res.state;
                this.lastState = state;
                this.lastStateT = t;
                if (this.display) await this.display.show(state);
                if (!this.mounted) return;
                if (moveCamera) this.cameraFromFollow(t, state);
                this.refreshWorkspace(state, moveCamera, res);
                this.refreshSidebar(state, res);
                this.lastShown = res;
            }
        } catch (e) {
            log.error('[rewind] display failed', e);
        } finally {
            this.busy = false;
        }
    }

    cameraFromFollow (t, state) {
        const follow = this.state.follow;
        let cam = null;
        if (follow !== 'free') {
            const ev = this.timeline.lastEventAtOrBefore(t, e => e.lane === follow && e.tg && findTarget(state, e.tg));
            if (ev) cam = {targetId: ev.tg, tab: ev.tab || 'code', asset: ev.asset, block: ev.block};
        }
        if (!cam && !(this.state.camera.targetId && findTarget(state, this.state.camera.targetId))) {
            const sprite = state.targets.find(x => !x.isStage) || state.targets[0];
            cam = {targetId: sprite.id, tab: 'code', asset: null, block: null};
        }
        if (cam) this.setCamera(cam);
    }
    setCamera (cam) {
        this.camera = cam;
        this.cameraDirty = true;
        this.lastCameraAt = now();
        this.setState({camera: cam});
    }

    refreshWorkspace (state, moveCamera, res) {
        if (!this.workspace) return;
        const cam = this.camera || this.state.camera;
        const targetId = cam.targetId;
        if (!targetId) return;
        const lastShown = this.lastShown;
        const sameSegment = lastShown && lastShown.segment === res.segment && lastShown.t <= res.t;
        let maybeChanged = !sameSegment || this.lastWorkspace.targetId !== targetId || this.cameraDirty;
        if (!maybeChanged) {
            maybeChanged = this.timeline.eventsBetween(lastShown.t, res.t)
                .some(e => e.tg === targetId && e.tab === 'code') ||
                this.timeline.eventsBetween(lastShown.t, res.t).some(e => e.k === 'restore');
        }
        if (!maybeChanged) return;
        const render = () => {
            this.workspaceTimer = null;
            const current = this.lastState;
            if (!current || !this.workspace) return;
            const tid = (this.camera || this.state.camera).targetId;
            const curT = this.lastStateT;
            const prev = this.lastWorkspace;
            const prevSnapshot = this.lastSnapshot;
            this.lastSnapshot = stateSnapshot(current);
            const key = workspaceKey(current, tid);
            const center = this.cameraDirty;
            if (key === prev.key && tid === prev.targetId && !center) {
                prev.t = curT;
                return;
            }
            const xml = targetToWorkspaceXml(current, tid);
            if (xml === null) return;
            const target = findTarget(current, tid);
            const opcodes = new Set(Object.keys(target.blocks || {}).map(id => target.blocks[id].opcode));
            const camNow = this.camera || this.state.camera;
            const forward = prev.t !== null && curT > prev.t &&
                (this.state.playing || curT - prev.t <= MAX_CHANGE_SPAN_MS);
            const changes = forward && prevSnapshot ?
                diffBlocks(prevSnapshot.get(tid), this.lastSnapshot.get(tid)) : null;
            const show = () => {
                this.ghostTimer = null;
                this.workspace.setContent(xml, {
                    center: center ? camNow.block : null,
                    keepView: !center || (!camNow.block && tid === prev.targetId),
                    opcodes,
                    marks: changes ? {
                        outline: changes.added.concat(changes.moved),
                        flash: changes.fields.map(f => ({id: f.id, name: f.name}))
                    } : null
                });
            };
            clearTimeout(this.ghostTimer);
            this.ghostTimer = null;
            let removedText = null;
            if (changes && changes.ghosts.length && prev.xml && prev.targetId === tid) {
                this.workspace.setContent(prev.xml, {keepView: true, marks: {ghost: changes.ghosts}});
                if (changes.removed.length === 1) removedText = this.workspace.blockText(changes.removed[0]);
                this.ghostTimer = setTimeout(show, Math.max(150, GHOST_MS / this.state.speed));
            } else {
                show();
            }
            if (changes && changes.count) this.showCaption(changes, target, prev.t, curT, removedText);
            this.cameraDirty = false;
            this.lastWorkspace = {targetId: tid, key, at: now(), t: curT, xml};
        };
        const since = now() - this.lastWorkspace.at;
        if (moveCamera || this.cameraDirty || (!this.state.playing && !this.dragging) || since >= WORKSPACE_THROTTLE_MS) {
            clearTimeout(this.workspaceTimer);
            render();
        } else if (!this.workspaceTimer) {
            this.workspaceTimer = setTimeout(render, WORKSPACE_THROTTLE_MS - since);
        }
    }

    refreshSidebar (state, res) {
        const display = this.display;
        const targets = state.targets.map(t => {
            const costume = (t.costumes || [])[t.currentCostume] || (t.costumes || [])[0] || null;
            return {
                id: t.id,
                name: t.name,
                isStage: !!t.isStage,
                costumeId: costume ? costume.id : null,
                md5: costume ? costume.md5ext : null
            };
        });
        const key = JSON.stringify(targets);
        const cam = this.camera || this.state.camera;
        const sel = findTarget(state, cam.targetId);
        const assets = sel ? {
            costumes: (sel.costumes || []).map(c => ({id: c.id, name: c.name, md5: c.md5ext})),
            sounds: (sel.sounds || []).map(s => ({id: s.id, name: s.name})),
            currentCostume: ((sel.costumes || [])[sel.currentCostume] || {}).id || null
        } : {costumes: [], sounds: [], currentCostume: null};
        const assetsKey = JSON.stringify(assets);
        const broken = res.broken || [];
        const brokenKey = JSON.stringify(broken.map(b => `${b.targetId}/${b.costumeId}`));
        let unknown = null;
        if (res.unknown) {
            const seg = this.timeline.segmentByN(res.segment);
            const next = seg && this.timeline._nextSegment(seg);
            unknown = {until: next ? next.baseTs : null};
        }
        const update = {shownT: res.t};
        if (key !== this.targetsKey) {
            this.targetsKey = key;
            update.targets = targets.map(x => Object.assign({}, x, {
                uri: display && x.costumeId ? display.costumeUri(x.id, x.costumeId) : null
            }));
        }
        if (assetsKey !== this.assetsKey) {
            this.assetsKey = assetsKey;
            update.assets = Object.assign({}, assets, {
                costumes: assets.costumes.map(c => Object.assign({}, c, {
                    uri: display && sel ? display.costumeUri(sel.id, c.id) : null
                }))
            });
        }
        if (brokenKey !== this.brokenKey) {
            this.brokenKey = brokenKey;
            update.broken = broken;
        }
        if (JSON.stringify(unknown) !== JSON.stringify(this.state.unknown)) update.unknown = unknown;
        this.setState(update);
    }

    handleScrub (t, phase) {
        if (phase === 'start') {
            this.dragging = true;
            if (this.state.playing) this.stop();
        }
        if (phase === 'end') this.dragging = false;
        this.setState({t});
        this.requestShow(t, {camera: phase === 'end'});
    }
    handleViewChange (view) {
        this.setState({view});
    }
    handleTogglePlay () {
        if (this.state.playing) this.stop();
        else this.play();
    }
    play () {
        if (!this.timeline || this.state.status !== 'ready') return;
        const range = this.timeline.range;
        let t = this.state.t;
        if (t >= range.end) t = range.start;
        this.lastFrame = null;
        this.playT = t;
        this.setState({playing: true, t});
        this.raf = requestAnimationFrame(this.tick);
    }
    stop () {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        this.setState({playing: false});
        if (this.pendingCamera) {
            this.setCamera(this.pendingCamera);
            this.pendingCamera = null;
            this.requestShow(this.playT);
        }
    }
    tick (frameTime) {
        if (!this.mounted || !this.state.playing) return;
        const nowMs = now();
        const dt = this.lastFrame === null ? 0 : Math.min(250, frameTime - this.lastFrame);
        this.lastFrame = frameTime;
        const range = this.timeline.range;
        const speed = this.state.speed;
        const prev = this.playT;
        let t = prev + (dt * speed);
        const brk = this.timeline.axis.breakAt(t);
        if (brk && brk.to - IDLE_LEAD_MS > t) t = brk.to - IDLE_LEAD_MS;
        t = skipPause(this.timeline, t, this.state.pauses);
        let ended = false;
        if (t >= range.end) {
            t = range.end;
            ended = true;
        }
        const follow = this.state.follow;
        let followed = null;
        const pulses = [];
        for (const ev of this.timeline.eventsBetween(prev, t)) {
            if (follow !== 'free' && ev.lane === follow && ev.tg) followed = ev;
            else if (ev.tg && ev.lane !== 'system') pulses.push(ev);
        }
        const dwell = this.state.pauses === 'all' ? 0 : MIN_DWELL_MS / speed;
        if (followed) {
            this.pendingCamera = {targetId: followed.tg, tab: followed.tab || 'code', asset: followed.asset,
                block: followed.block};
        }
        let cameraMoved = false;
        if (this.pendingCamera && nowMs - this.lastCameraAt >= dwell && this.lastState &&
            findTarget(this.lastState, this.pendingCamera.targetId)) {
            this.setCamera(this.pendingCamera);
            this.pendingCamera = null;
            cameraMoved = true;
        }
        if (pulses.length) this.pulse(pulses);
        this.playT = t;
        this.setState({t});
        this.requestShow(t, {camera: false});
        if (cameraMoved) this.cameraDirty = true;
        if (ended) {
            this.stop();
            return;
        }
        const view = this.state.view;
        const u = this.timeline.axis.toU(t);
        if (u > view.end || u < view.start) {
            const span = view.end - view.start;
            const uEnd = this.timeline.axis.uEnd;
            const start = Math.min(Math.max(0, u - (span * 0.1)), Math.max(0, uEnd - span));
            this.setState({view: {start, end: start + span}});
        }
        this.raf = requestAnimationFrame(this.tick);
    }
    pulse (events) {
        const lanes = new Map(this.timeline.lanes.map(l => [l.key, l]));
        const pulses = Object.assign({}, this.state.pulses);
        for (const ev of events) {
            const lane = lanes.get(ev.lane);
            if (!lane) continue;
            const badge = lane.kind === 'torchy' ? 'T' : ((lane.user || '?').charAt(0).toUpperCase());
            pulses[ev.tg] = {color: lane.color, badge, n: ++this.pulseSeq};
            clearTimeout(this.pulseTimers.get(ev.tg));
            this.pulseTimers.set(ev.tg, setTimeout(() => {
                if (!this.mounted) return;
                this.setState(s => {
                    const next = Object.assign({}, s.pulses);
                    delete next[ev.tg];
                    return {pulses: next};
                });
            }, PULSE_MS));
        }
        this.setState({pulses});
    }
    handleSpeed (e) {
        this.setState({speed: Number(e.target.value) || 1});
    }
    handlePauses (e) {
        this.setState({pauses: PAUSES.includes(e.target.value) ? e.target.value : DEFAULT_PAUSES});
    }
    handleFollow (e) {
        const follow = e.target.value;
        this.setState({follow}, () => {
            if (follow !== 'free' && !this.state.playing) this.requestShow(this.state.t, {camera: true});
        });
    }
    handleSelectTarget (e) {
        const id = e.currentTarget.dataset.target;
        this.setCamera({targetId: id, tab: this.state.camera.tab, asset: null, block: null});
        this.requestShow(this.state.t);
    }
    handleTab (e) {
        const tab = e.currentTarget.dataset.tab;
        const cam = Object.assign({}, this.state.camera, {tab});
        this.camera = cam;
        this.setState({camera: cam}, () => {
            if (tab === 'code') {
                this.cameraDirty = true;
                this.lastWorkspace.key = null;
                this.handleStageResize();
                this.requestShow(this.state.t);
            }
        });
    }
    handleKeyDown (e) {
        if (this.state.restore) {
            if (e.key === 'Escape' && this.state.restore.phase !== 'working') this.handleRestoreCancel();
            return;
        }
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
        if (e.key === ' ' && this.state.status === 'ready') {
            e.preventDefault();
            this.handleTogglePlay();
        }
    }

    async handleRestoreClick () {
        if (this.state.playing) this.stop();
        const t = Math.floor(this.state.shownT === null ? this.state.t : this.state.shownT);
        const res = await this.timeline.restoreStateAt(t);
        if (!this.mounted) return;
        this.restoreState = res.state;
        const warnings = res.warnings.slice();
        const hasCloud = st => (st.targets || []).some(tg =>
            Object.values(tg.variables || {}).some(v => v && v.isCloud));
        const liveCloud = this.props.vm.runtime.targets.some(tg => tg.isOriginal &&
            Object.values(tg.variables || {}).some(v => v && v.isCloud));
        if (liveCloud || hasCloud(res.state)) warnings.push({kind: 'cloud'});
        this.setState({restore: {phase: 'confirm', t, warnings}});
        this.requestShow(t);
    }
    handleRestoreCancel () {
        this.restoreState = null;
        this.setState({restore: null});
    }
    async handleRestoreConfirm () {
        const restore = this.state.restore;
        if (!restore || !this.restoreState) return;
        this.setState({restore: Object.assign({}, restore, {phase: 'working'})});
        if (this.props.onRestoreState) {
            const state = this.restoreState;
            this.restoreState = null;
            try {
                await this.props.onRestoreState(state, restore.t);
            } catch (e) {
                log.error('[rewind] recovery failed', e);
                if (this.mounted) this.setState({restore: Object.assign({}, restore, {phase: 'error'})});
            }
            return;
        }
        let result;
        try {
            result = await restoreTo(this.props.vm, this.restoreState, {
                recorder: resumeRecording(),
                to: restore.t,
                labelUser: this.restoringUser()
            });
        } catch (e) {
            log.error('[rewind] restore failed', e);
            if (this.mounted) this.setState({restore: Object.assign({}, restore, {phase: 'error'})});
            return;
        }
        this.restoreState = null;
        if (this.props.canSave) this.props.onSaveProject();
        if (result && result.broken && result.broken.length) {
            if (this.mounted) this.setState({restore: Object.assign({}, restore, {phase: 'partial'})});
            return;
        }
        this.handleExit();
    }
    handleExit () {
        if (this.props.rewindOnly) return;
        if (this.state.playing) this.stop();
        this.props.onClose();
    }

    /**
     * Show a caption describing the last change.
     * @param {object} changes diffBlocks result
     * @param {object} target the target shown
     * @param {number} from the previous step's time
     * @param {number} to this step's time
     * @param {?string} removedText removedText
     */
    showCaption (changes, target, from, to, removedText) {
        const intl = this.props.intl;
        const ev = this.timeline.eventsBetween(from, to).filter(e => e.tg === target.id && e.tab === 'code')
            .pop();
        const lane = ev && this.timeline.lanes.find(l => l.key === ev.lane);
        const who = lane ? this.laneLabel(lane) : intl.formatMessage(messages.laneSystem);
        const sprite = target.name;
        const text = id => this.workspace.blockText(id) || '…';
        const parts = [];
        if (changes.fields.length) {
            const f = changes.fields[0];
            parts.push(intl.formatMessage(messages.changeField, {who, from: String(f.from), to: String(f.to),
                block: text(f.id)}));
        }
        const counted = (list, one, many, blockText) => {
            if (!list.length) return;
            parts.push(list.length === 1 ?
                intl.formatMessage(one, {who, sprite, block: blockText || text(list[0])}) :
                intl.formatMessage(many, {who, sprite, count: list.length}));
        };
        counted(changes.added, messages.changeAddedOne, messages.changeAddedMany);
        counted(changes.removed, messages.changeRemovedOne, messages.changeRemovedMany, removedText || '…');
        counted(changes.moved, messages.changeMovedOne, messages.changeMovedMany);
        if (!parts.length) return;
        clearTimeout(this.captionTimer);
        this.setState({caption: {text: parts.slice(0, 2).join(' · '), n: ++this.captionSeq}});
        this.captionTimer = setTimeout(() => {
            if (this.mounted) this.setState({caption: null});
        }, CAPTION_MS);
    }
    laneLabel (lane) {
        const intl = this.props.intl;
        if (lane.kind === 'torchy') return intl.formatMessage(messages.laneTorchy);
        if (lane.kind === 'system') return intl.formatMessage(messages.laneSystem);
        if (lane.key === 'author') return lane.user || intl.formatMessage(messages.laneAuthor);
        return lane.user || '?';
    }
    tooltipFor (hover) {
        const {intl, locale} = this.props;
        if (hover.kind === 'break') {
            const {from, to} = hover.break;
            return `${formatMoment(from, locale)} → ${formatMoment(to, locale)} · ${hover.label}`;
        }
        if (hover.kind === 'broken') {
            return `${hover.broken.costumeName}: ${intl.formatMessage(messages.brokenOverlay)}`;
        }
        const m = hover.marker;
        const at = formatMoment(m.ts, locale);
        switch (m.kind) {
        case 'restore':
            return `${at} · ${intl.formatMessage(messages.markerRestore, {
                time: m.to ? formatMoment(m.to, locale) : '?', user: m.user || '?'
            })}`;
        case 'replaced': return `${at} · ${intl.formatMessage(messages.markerReplaced)}`;
        case 'compacted': return intl.formatMessage(messages.markerCompacted);
        default: return `${at} · ${intl.formatMessage(messages.markerUnknown)}`;
        }
    }
    /**
     * Who the restore is by.
     * @returns {string} username
     */
    restoringUser () {
        return storage.username || this.props.authorUsername || '';
    }
    restoreLabel (t) {
        return this.props.intl.formatMessage(messages.restoreLabel, {
            time: formatClock(t, this.props.locale),
            user: this.restoringUser() || '?'
        });
    }

    renderTop () {
        const {intl, locale} = this.props;
        const {status, t, follow, restore} = this.state;
        const tl = this.timeline;
        const ready = status === 'ready';
        const canRestore = ready && tl && tl.info && tl.info.canRestore && !this.props.rewindOnly;
        const followLanes = ready ? tl.lanes.filter(l => l.key !== 'system') : [];
        return (
            <div className={styles.topBar}>
                <div className={styles.title}>
                    {intl.formatMessage(messages.title)}
                    <span className={styles.badge}>{intl.formatMessage(messages.readOnly)}</span>
                </div>
                {ready ? (
                    <div
                        className={styles.clock}
                        data-testid="rewind-clock"
                    >
                        {formatMoment(t, locale)}
                    </div>
                ) : null}
                <div className={styles.spacer} />
                {ready ? (
                    <label>
                        {intl.formatMessage(messages.follow)}
                        <select
                            className={styles.select}
                            data-testid="rewind-follow"
                            value={follow}
                            onChange={this.handleFollow}
                        >
                            {followLanes.map(l => (
                                <option
                                    key={l.key}
                                    value={l.key}
                                >
                                    {this.laneLabel(l)}
                                </option>
                            ))}
                            <option value="free">{intl.formatMessage(messages.followFree)}</option>
                        </select>
                    </label>
                ) : null}
                {canRestore ? (
                    <button
                        className={classNames(styles.button, styles.buttonRestore)}
                        data-testid="rewind-restore"
                        disabled={!!restore}
                        onClick={this.handleRestoreClick}
                    >
                        {intl.formatMessage(messages.restore)}
                    </button>
                ) : null}
                {this.props.rewindOnly ? null : (
                    <button
                        className={styles.button}
                        data-testid="rewind-exit"
                        onClick={this.handleExit}
                    >
                        {this.props.exitLabel || intl.formatMessage(messages.exit)}
                    </button>
                )}
            </div>
        );
    }
    renderNotice () {
        const tl = this.timeline;
        const meta = this.props.meta;
        const locked = (tl && tl.info && tl.info.locked) || (meta && meta.locked);
        if (!locked) return null;
        const deleteAfter = (tl && tl.info && tl.info.deleteAfter) ||
            (meta && meta.delete_after ? Date.parse(meta.delete_after) : null);
        return (
            <div
                className={styles.notice}
                data-testid="rewind-locked"
            >
                {this.props.intl.formatMessage(messages.locked, {
                    date: deleteAfter ? formatDate(deleteAfter, this.props.locale) : '?'
                })}
                {TRUSTED_IFRAME_HOST ? (
                    <a
                        href={`${TRUSTED_IFRAME_HOST}/premium`}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {this.props.intl.formatMessage(messages.lockedLink)}
                    </a>
                ) : null}
            </div>
        );
    }
    renderAssets () {
        const {intl} = this.props;
        const {camera, assets, broken} = this.state;
        const brokenIds = new Set(broken.filter(b => b.targetId === camera.targetId).map(b => b.costumeId));
        if (camera.tab === 'sounds') {
            return (
                <div className={styles.soundList}>
                    {assets.sounds.length ? assets.sounds.map(s => (
                        <div
                            className={styles.soundItem}
                            key={s.id}
                        >
                            {s.name}
                        </div>
                    )) : intl.formatMessage(messages.noSounds)}
                </div>
            );
        }
        const selectedId = (camera.asset && assets.costumes.some(c => c.id === camera.asset)) ?
            camera.asset : assets.currentCostume;
        const selected = assets.costumes.find(c => c.id === selectedId) || assets.costumes[0] || null;
        return (
            <div className={styles.assetPanel}>
                <div className={styles.assetList}>
                    {assets.costumes.map(c => (
                        <div
                            className={classNames(styles.assetItem, {[styles.assetItemSelected]: selected && c.id === selected.id})}
                            key={c.id}
                            title={c.name}
                        >
                            {c.uri ? <img src={c.uri} /> : null}
                            {c.name}
                            {brokenIds.has(c.id) ? (
                                <div className={styles.brokenOverlay}>{intl.formatMessage(messages.brokenOverlay)}</div>
                            ) : null}
                        </div>
                    ))}
                </div>
                <div className={styles.assetPreview}>
                    {selected && selected.uri ? <img src={selected.uri} /> : null}
                    {selected && brokenIds.has(selected.id) ? (
                        <div
                            className={classNames(styles.brokenOverlay, styles.previewBroken)}
                            data-testid="rewind-broken"
                        >
                            {intl.formatMessage(messages.brokenOverlay)}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }
    renderBody () {
        const {intl, locale} = this.props;
        const {status, camera, targets, pulses, broken, unknown} = this.state;
        if (status !== 'ready') {
            let text;
            if (status === 'loading') text = intl.formatMessage(messages.loading);
            else if (status === 'empty') text = intl.formatMessage(messages.empty);
            else if (status === 'unavailable') text = intl.formatMessage(messages.unavailable);
            else text = intl.formatMessage(messages.error);
            return (
                <div
                    className={styles.message}
                    data-testid={`rewind-${status}`}
                >
                    {text}
                    {status === 'error' ? (
                        <button
                            className={classNames(styles.button, styles.buttonPrimary)}
                            onClick={this.handleRetry}
                        >
                            {intl.formatMessage(messages.retry)}
                        </button>
                    ) : null}
                </div>
            );
        }
        const selected = targets.find(x => x.id === camera.targetId);
        const brokenTargets = new Set(broken.map(b => b.targetId));
        const tabs = [
            ['code', messages.tabCode],
            ['costumes', selected && selected.isStage ? messages.tabBackdrops : messages.tabCostumes],
            ['sounds', messages.tabSounds]
        ];
        return (
            <div className={styles.body}>
                <div className={styles.center}>
                    <div className={styles.tabs}>
                        {tabs.map(([id, msg]) => (
                            <button
                                className={classNames(styles.tab, {[styles.tabSelected]: camera.tab === id})}
                                data-tab={id}
                                data-testid={`rewind-tab-${id}`}
                                key={id}
                                onClick={this.handleTab}
                            >
                                {intl.formatMessage(msg)}
                            </button>
                        ))}
                    </div>
                    <div className={styles.tabPanel}>
                        <div style={{position: 'absolute', inset: 0, visibility: camera.tab === 'code' ? 'visible' : 'hidden'}}>
                            <RewindWorkspace
                                displayVm={this.display ? this.display.vm : null}
                                isRtl={this.props.isRtl}
                                media={`${this.props.basePath || ''}static/${this.props.theme && this.props.theme.getBlocksMediaFolder ?
                                    this.props.theme.getBlocksMediaFolder() : 'blocks-media/default'}/`}
                                ref={this.setWorkspace}
                                theme={this.props.theme}
                            />
                        </div>
                        {camera.tab === 'code' && this.state.caption ? (
                            <div
                                className={styles.changeCaption}
                                data-testid="rewind-caption"
                                key={this.state.caption.n}
                            >
                                {this.state.caption.text}
                            </div>
                        ) : null}
                        {camera.tab === 'code' ? null : this.renderAssets()}
                    </div>
                </div>
                <div className={styles.side}>
                    <div className={styles.stage}>
                        <canvas
                            data-testid="rewind-stage"
                            height={360}
                            ref={this.setStageCanvas}
                            width={480}
                        />
                        {unknown ? (
                            <div
                                className={styles.unknownOverlay}
                                data-testid="rewind-unknown"
                            >
                                {unknown.until ?
                                    intl.formatMessage(messages.unknownOverlay, {time: formatClock(unknown.until, locale)}) :
                                    intl.formatMessage(messages.unknownOverlayEnd)}
                            </div>
                        ) : null}
                    </div>
                    <div
                        className={styles.sprites}
                        data-testid="rewind-sprites"
                    >
                        {targets.map(x => {
                            const pulse = pulses[x.id];
                            return (
                                <button
                                    className={classNames(styles.spriteTile, {[styles.spriteTileSelected]: x.id === camera.targetId})}
                                    data-target={x.id}
                                    data-testid="rewind-sprite"
                                    key={x.id}
                                    title={x.name}
                                    onClick={this.handleSelectTarget}
                                >
                                    {x.uri ? <img src={x.uri} /> : <div style={{height: '3rem'}} />}
                                    <span className={styles.spriteName}>
                                        {x.isStage ? intl.formatMessage(messages.stage) : x.name}
                                    </span>
                                    {brokenTargets.has(x.id) && x.costumeId &&
                                        broken.some(b => b.targetId === x.id && b.costumeId === x.costumeId) ? (
                                            <div className={styles.brokenOverlay}>{intl.formatMessage(messages.brokenOverlay)}</div>
                                        ) : null}
                                    {pulse ? (
                                        <React.Fragment key={pulse.n}>
                                            <span
                                                className={styles.pulse}
                                                data-testid="rewind-pulse"
                                                style={{'--pulse-color': pulse.color}}
                                            />
                                            <span
                                                className={styles.pulseBadge}
                                                style={{'--pulse-color': pulse.color}}
                                            >
                                                {pulse.badge}
                                            </span>
                                        </React.Fragment>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }
    renderTimeline () {
        if (this.state.status !== 'ready') return null;
        const {intl, locale} = this.props;
        const {t, playing, speed, pauses, view} = this.state;
        const tl = this.timeline;
        return (
            <div className={styles.timeline}>
                <div className={styles.controls}>
                    <button
                        aria-label={intl.formatMessage(playing ? messages.pause : messages.play)}
                        className={styles.playButton}
                        data-testid="rewind-play"
                        title={intl.formatMessage(playing ? messages.pause : messages.play)}
                        onClick={this.handleTogglePlay}
                    >
                        {playing ? (
                            <svg
                                aria-hidden="true"
                                className={styles.playIcon}
                                viewBox="0 0 16 16"
                            >
                                <rect
                                    height="12"
                                    rx="1"
                                    width="3.5"
                                    x="3.25"
                                    y="2"
                                />
                                <rect
                                    height="12"
                                    rx="1"
                                    width="3.5"
                                    x="9.25"
                                    y="2"
                                />
                            </svg>
                        ) : (
                            <svg
                                aria-hidden="true"
                                className={styles.playIcon}
                                viewBox="0 0 16 16"
                            >
                                <path d={PLAY_ICON_PATH} />
                            </svg>
                        )}
                    </button>
                    <label>
                        {intl.formatMessage(messages.speed)}
                        <select
                            className={styles.select}
                            data-testid="rewind-speed"
                            value={speed}
                            onChange={this.handleSpeed}
                        >
                            {SPEEDS.map(s => (
                                <option
                                    key={s}
                                    value={s}
                                >
                                    {`${s}×`}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        {intl.formatMessage(messages.pauses)}
                        <select
                            className={styles.select}
                            data-testid="rewind-pauses"
                            value={pauses}
                            onChange={this.handlePauses}
                        >
                            <option value="real">{intl.formatMessage(messages.pausesReal)}</option>
                            <option value="long">{intl.formatMessage(messages.pausesLong)}</option>
                            <option value="all">{intl.formatMessage(messages.pausesAll)}</option>
                        </select>
                    </label>
                    <div className={styles.spacer} />
                    {typeof this.props.until === 'number' ? (
                        <span style={{color: '#9966FF', fontWeight: 'bold'}}>
                            {`⚑ ${intl.formatMessage(messages.until)} ${formatMoment(this.props.until, locale)}`}
                        </span>
                    ) : null}
                    <button
                        className={styles.button}
                        onClick={() => this.handleViewChange(fullView(tl))} // eslint-disable-line react/jsx-no-bind
                    >
                        {intl.formatMessage(messages.zoomFit)}
                    </button>
                </div>
                <TimelineBar
                    ariaLabel={intl.formatMessage(messages.title)}
                    ariaValueText={formatClockSeconds(t, locale)}
                    axis={tl.axis}
                    brokenRanges={tl.brokenRanges}
                    events={tl.events}
                    idleGaps={tl.idleGaps}
                    laneLabel={this.laneLabel}
                    lanes={tl.lanes}
                    locale={locale}
                    markers={tl.markers}
                    range={tl.range}
                    skipIdle={pauses !== 'real'}
                    t={t}
                    tooltipFor={this.tooltipFor}
                    until={this.props.until}
                    view={view}
                    onScrub={this.handleScrub}
                    onViewChange={this.handleViewChange}
                />
            </div>
        );
    }
    renderDialog () {
        const restore = this.state.restore;
        if (!restore) return null;
        const {intl, locale} = this.props;
        const working = restore.phase === 'working';
        return (
            <div className={styles.dialogBackdrop}>
                <div
                    aria-modal="true"
                    className={styles.dialog}
                    data-testid="rewind-restore-dialog"
                    role="dialog"
                >
                    <h2>{intl.formatMessage(messages.restoreTitle)}</h2>
                    <div>{intl.formatMessage(messages.restoreBody, {time: formatMoment(restore.t, locale)})}</div>
                    <div
                        className={styles.dialogLabel}
                        data-testid="rewind-restore-label"
                    >
                        {this.restoreLabel(restore.t)}
                    </div>
                    {restore.warnings.map((w, i) => (
                        <div
                            className={styles.dialogWarning}
                            data-testid="rewind-restore-warning"
                            key={i}
                        >
                            {w.kind === 'cloud' ? intl.formatMessage(messages.restoreCloud) : null}
                            {w.kind === 'costume' ?
                                intl.formatMessage(messages.restoreBrokenCostume, {
                                    costume: w.costumeName,
                                    time: formatClock(w.at, locale),
                                    asOf: formatClock(w.asOf, locale)
                                }) :
                                null}
                            {w.kind === 'unknown' ?
                                intl.formatMessage(messages.restoreUnknown, {
                                    time: formatClock(w.at, locale),
                                    asOf: formatClock(w.asOf, locale)
                                }) : null}
                        </div>
                    ))}
                    {restore.phase === 'error' ? (
                        <div className={styles.dialogError}>{intl.formatMessage(messages.restoreFailed)}</div>
                    ) : null}
                    {restore.phase === 'partial' ? (
                        <div className={styles.dialogWarning}>{intl.formatMessage(messages.restorePartial)}</div>
                    ) : null}
                    <div className={styles.dialogButtons}>
                        {restore.phase === 'partial' ? (
                            <button
                                className={classNames(styles.button, styles.buttonPrimary)}
                                onClick={this.handleExit}
                            >
                                {intl.formatMessage(messages.exit)}
                            </button>
                        ) : (
                            <React.Fragment>
                                <button
                                    className={styles.button}
                                    disabled={working}
                                    onClick={this.handleRestoreCancel}
                                >
                                    {intl.formatMessage(messages.cancel)}
                                </button>
                                <button
                                    className={classNames(styles.button, styles.buttonRestore)}
                                    data-testid="rewind-restore-confirm"
                                    disabled={working}
                                    onClick={this.handleRestoreConfirm}
                                >
                                    {intl.formatMessage(working ? messages.restoring : messages.restoreConfirm)}
                                </button>
                            </React.Fragment>
                        )}
                    </div>
                </div>
            </div>
        );
    }
    render () {
        return (
            <div
                className={styles.overlay}
                data-testid="rewind-viewer"
                dir={this.props.isRtl ? 'rtl' : 'ltr'}
            >
                {this.renderTop()}
                {this.renderNotice()}
                {this.renderBody()}
                {this.renderTimeline()}
                {this.renderDialog()}
            </div>
        );
    }
}

RewindViewerInner.propTypes = {
    authorUsername: PropTypes.string,
    basePath: PropTypes.string,
    canSave: PropTypes.bool,
    exitLabel: PropTypes.string,
    fetchers: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    locale: PropTypes.string.isRequired,
    meta: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    onClose: PropTypes.func.isRequired,
    onRestoreState: PropTypes.func,
    rewindOnly: PropTypes.bool,
    onSaveProject: PropTypes.func.isRequired,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    storage: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    theme: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    until: PropTypes.number,
    vm: PropTypes.object.isRequired // eslint-disable-line react/forbid-prop-types
};

const RewindViewerIntl = injectIntl(RewindViewerInner);

/**
 * Mounts the viewer while rewind mode is open and the project id is known.
 * @param {object} props props
 * @returns {?React.ReactElement} viewer
 */
const RewindViewer = props => {
    const {open, projectId, ...rest} = props;
    if (!open || !projectId || projectId === '0' || projectId === 0) return null;
    return (
        <RewindViewerIntl
            key={projectId}
            projectId={projectId}
            {...rest}
        />
    );
};

RewindViewer.propTypes = {
    open: PropTypes.bool,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

const mapStateToProps = state => ({
    open: state.scratchGui.rewind.open,
    until: state.scratchGui.rewind.until,
    rewindOnly: !!state.scratchGui.rewind.rewindOnly,
    meta: state.scratchGui.rewind.meta,
    authorUsername: state.scratchGui.tw.author.username,
    projectId: state.scratchGui.projectState.projectId,
    vm: state.scratchGui.vm,
    theme: state.scratchGui.theme.theme,
    isRtl: state.locales.isRtl,
    locale: state.locales.locale
});

const mapDispatchToProps = dispatch => ({
    onClose: () => {
        resumeRecording();
        dispatch(closeRewind());
    },
    onSaveProject: () => dispatch(manualUpdateProject())
});

export {RewindViewerInner, RewindViewerIntl};

export default connect(mapStateToProps, mapDispatchToProps)(RewindViewer);
