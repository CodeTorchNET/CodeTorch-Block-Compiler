import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';

import {axisTicks, formatMoment} from './time-format';
import {formatGap} from '../../lib/rewind/time-axis.js';
import styles from './rewind-viewer.css';

const AXIS_H = 18;
const LANE_H = 16;
const STRIP_H = 7;
const MIN_SPAN = 5 * 1000;
const SESSION_LABEL_PX = 70;

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

const MARKER_COLORS = {
    restore: '#0FBD8C',
    replaced: '#FF8C1A',
    unknown: '#E6564F',
    compacted: '#8A94A6'
};

class TimelineBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['setCanvas', 'setWrap', 'handlePointerDown', 'handlePointerMove', 'handlePointerUp',
            'handleWheel', 'handleKeyDown', 'draw', 'handleLeave']);
        this.state = {width: 600, hover: null};
        this.dragging = false;
    }
    componentDidMount () {
        if (typeof ResizeObserver !== 'undefined' && this.wrap) {
            this.observer = new ResizeObserver(entries => {
                const w = Math.floor(entries[0].contentRect.width);
                if (w > 0 && w !== this.state.width) this.setState({width: w});
            });
            this.observer.observe(this.wrap);
        }
        if (this.canvas) this.canvas.addEventListener('wheel', this.handleWheel, {passive: false});
        this.draw();
    }
    componentDidUpdate () {
        this.draw();
    }
    componentWillUnmount () {
        if (this.observer) this.observer.disconnect();
        if (this.canvas) this.canvas.removeEventListener('wheel', this.handleWheel);
    }
    setCanvas (el) {
        this.canvas = el;
    }
    setWrap (el) {
        this.wrap = el;
    }
    height () {
        return AXIS_H + (this.props.lanes.length * LANE_H) + STRIP_H + 2;
    }
    x (t) {
        return this.xu(this.props.axis.toU(t));
    }
    xu (u) {
        const {view} = this.props;
        return ((u - view.start) / Math.max(1, view.end - view.start)) * this.state.width;
    }
    uAt (clientX) {
        const rect = this.canvas.getBoundingClientRect();
        const {view} = this.props;
        const f = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
        return view.start + (f * (view.end - view.start));
    }
    timeAt (clientX) {
        const {axis, range} = this.props;
        const t = axis.toT(this.uAt(clientX));
        return Math.min(range.end, Math.max(range.start, Math.round(t)));
    }
    draw () {
        const canvas = this.canvas;
        if (!canvas) return;
        const {axis, lanes, events, markers, brokenRanges, idleGaps, skipIdle, t, until, view, locale, range} =
            this.props;
        const width = this.state.width;
        const height = this.height();
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const styleOf = getComputedStyle(canvas);
        const fg = styleOf.getPropertyValue('--rewind-fg').trim() || '#575e75';
        const grid = styleOf.getPropertyValue('--rewind-grid').trim() || 'rgba(0,0,0,0.08)';
        const laneBg = styleOf.getPropertyValue('--rewind-lane').trim() || 'rgba(0,0,0,0.03)';
        const lanesTop = AXIS_H;
        const lanesBottom = AXIS_H + (lanes.length * LANE_H);

        lanes.forEach((lane, i) => {
            if (i % 2 === 0) {
                ctx.fillStyle = laneBg;
                ctx.fillRect(0, lanesTop + (i * LANE_H), width, LANE_H);
            }
        });
        ctx.fillStyle = grid;
        const rs = this.x(range.start);
        const re = this.x(range.end);
        if (rs > 0) ctx.fillRect(0, lanesTop, rs, lanesBottom - lanesTop);
        if (re < width) ctx.fillRect(re, lanesTop, width - re, lanesBottom - lanesTop);

        ctx.font = '10px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        axis.sessions.forEach((sess, si) => {
            const a = Math.max(sess.u0, view.start);
            const b = Math.min(sess.u1, view.end);
            if (b <= a && !(si > 0 && sess.u0 >= view.start && sess.u0 <= view.end)) return;
            const labelX = si > 0 ? this.xu(sess.u0) : null;
            if (labelX !== null && labelX >= -SESSION_LABEL_PX && labelX <= width) {
                ctx.fillStyle = fg;
                ctx.save();
                ctx.font = 'bold 10px "Helvetica Neue", Helvetica, Arial, sans-serif';
                ctx.fillText(formatMoment(sess.start, locale), Math.round(labelX) + 3, AXIS_H / 2);
                ctx.restore();
            }
            if (b <= a) return;
            const px = this.xu(b) - this.xu(a);
            const t0 = axis.toT(a, false);
            const t1 = axis.toT(b, false);
            for (const tick of axisTicks(t0, t1, px, locale)) {
                const x = Math.round(this.x(tick.t)) + 0.5;
                if (labelX !== null && x >= labelX && x - labelX < SESSION_LABEL_PX) continue;
                ctx.strokeStyle = grid;
                ctx.beginPath();
                ctx.moveTo(x, AXIS_H - 4);
                ctx.lineTo(x, lanesBottom);
                ctx.stroke();
                ctx.fillStyle = fg;
                ctx.fillText(tick.label, x + 3, AXIS_H / 2);
            }
        });

        for (const brk of axis.breaks) {
            const a = this.xu(brk.u0);
            const b = this.xu(brk.u1);
            if (b < 0 || a > width) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(a, AXIS_H - 4, b - a, height - AXIS_H + 4);
            ctx.clip();
            ctx.fillStyle = laneBg;
            ctx.fillRect(a, AXIS_H - 4, b - a, height);
            ctx.strokeStyle = grid;
            for (let hx = a - height; hx < b; hx += 6) {
                ctx.beginPath();
                ctx.moveTo(hx, height);
                ctx.lineTo(hx + height, 0);
                ctx.stroke();
            }
            ctx.restore();
            ctx.strokeStyle = fg;
            ctx.globalAlpha = 0.5;
            for (const ex of [a, a + 3, b - 3, b]) {
                ctx.beginPath();
                ctx.moveTo(Math.round(ex) + 0.5, AXIS_H - 4);
                ctx.lineTo(Math.round(ex) + 0.5, lanesBottom + STRIP_H);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        if (skipIdle) {
            ctx.fillStyle = 'rgba(128,128,128,0.12)';
            for (const g of idleGaps) {
                const a = this.x(g.from);
                const b = this.x(g.to);
                if (b < 0 || a > width) continue;
                ctx.fillRect(a, lanesTop, Math.max(1, b - a), lanesBottom - lanesTop);
            }
        }

        for (const m of markers) {
            if (m.kind !== 'compacted' && !(m.kind === 'unknown' && m.to)) continue;
            const a = this.x(m.ts);
            const b = this.x(m.to || range.end);
            if (b < 0 || a > width) continue;
            ctx.save();
            ctx.globalAlpha = m.kind === 'compacted' ? 0.15 : 0.12;
            ctx.fillStyle = MARKER_COLORS[m.kind];
            ctx.fillRect(a, lanesTop, Math.max(2, b - a), lanesBottom - lanesTop);
            ctx.restore();
        }

        const laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
        const tViewStart = axis.toT(view.start, false);
        const tViewEnd = axis.toT(view.end, false);
        const i0 = lowerBound(events, tViewStart, e => e.ts);
        const lastX = new Array(lanes.length).fill(-1);
        for (let i = i0; i < events.length; i++) {
            const e = events[i];
            if (e.ts > tViewEnd) break;
            const li = laneIndex.get(e.lane);
            if (typeof li === 'undefined') continue;
            const x = Math.floor(this.x(e.ts));
            if (x === lastX[li]) continue;
            lastX[li] = x;
            ctx.fillStyle = lanes[li].color;
            const y = lanesTop + (li * LANE_H) + 3;
            ctx.fillRect(x, y, 2, LANE_H - 6);
        }

        const sysIndex = laneIndex.get('system');
        if (typeof sysIndex !== 'undefined') {
            const y = lanesTop + (sysIndex * LANE_H) + (LANE_H / 2);
            for (const m of markers) {
                if (m.kind === 'compacted') continue;
                const x = this.x(m.ts);
                if (x < -6 || x > width + 6) continue;
                ctx.fillStyle = MARKER_COLORS[m.kind] || fg;
                ctx.beginPath();
                if (m.kind === 'restore') {
                    ctx.moveTo(x, y - 6);
                    ctx.lineTo(x + 5, y + 5);
                    ctx.lineTo(x - 5, y + 5);
                } else {
                    ctx.moveTo(x, y - 6);
                    ctx.lineTo(x + 5, y);
                    ctx.lineTo(x, y + 6);
                    ctx.lineTo(x - 5, y);
                }
                ctx.closePath();
                ctx.fill();
            }
        }

        const stripY = lanesBottom + 1;
        for (const b of brokenRanges) {
            const a = this.x(b.from);
            const c = this.x(b.to);
            if (c < 0 || a > width) continue;
            ctx.save();
            ctx.fillStyle = '#FF8C1A';
            ctx.globalAlpha = 0.8;
            ctx.fillRect(a, stripY, Math.max(2, c - a), STRIP_H - 2);
            ctx.restore();
        }

        if (typeof until === 'number') {
            const x = Math.round(this.x(until)) + 0.5;
            ctx.strokeStyle = '#9966FF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, lanesBottom + STRIP_H);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.fillStyle = '#9966FF';
            ctx.beginPath();
            ctx.moveTo(x, 1);
            ctx.lineTo(x - 9, 5);
            ctx.lineTo(x, 9);
            ctx.closePath();
            ctx.fill();
        }

        const px = Math.round(this.x(t)) + 0.5;
        ctx.strokeStyle = '#FF661A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 2);
        ctx.lineTo(px, height);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#FF661A';
        ctx.beginPath();
        ctx.arc(px, 6, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    handlePointerDown (e) {
        if (e.button !== 0) return;
        this.dragging = true;
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
            // synthetic events
        }
        this.props.onScrub(this.timeAt(e.clientX), 'start');
    }
    handlePointerMove (e) {
        if (this.dragging) {
            this.props.onScrub(this.timeAt(e.clientX), 'move');
            return;
        }
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let hover = null;
        const near = this.props.markers.find(m => Math.abs(this.x(m.ts) - x) <= 5 ||
            (m.to && x >= this.x(m.ts) && x <= this.x(m.to)));
        if (near) hover = {x, kind: 'marker', marker: near};
        const lanesBottom = AXIS_H + (this.props.lanes.length * LANE_H);
        if (!hover) {
            const brk = this.props.axis.breaks.find(b => x >= this.xu(b.u0) - 1 && x <= this.xu(b.u1) + 1);
            if (brk) hover = {x, kind: 'break', break: brk, label: formatGap(brk.to - brk.from, this.props.locale)};
        }
        if (!hover && y >= lanesBottom) {
            const b = this.props.brokenRanges.find(r => x >= this.x(r.from) - 2 && x <= this.x(r.to) + 2);
            if (b) hover = {x, kind: 'broken', broken: b};
        }
        const prev = this.state.hover;
        if ((prev && prev.marker) !== (hover && hover.marker) || (prev && prev.broken) !== (hover && hover.broken) ||
            (prev && prev.break) !== (hover && hover.break)) {
            this.setState({hover});
        }
    }
    handlePointerUp (e) {
        if (!this.dragging) return;
        this.dragging = false;
        this.props.onScrub(this.timeAt(e.clientX), 'end');
    }
    handleLeave () {
        if (this.state.hover) this.setState({hover: null});
    }
    handleWheel (e) {
        e.preventDefault();
        const {view, axis} = this.props;
        const span = view.end - view.start;
        const uEnd = axis.uEnd;
        const full = Math.max(MIN_SPAN, uEnd);
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            const d = (e.shiftKey ? e.deltaY : e.deltaX) / this.state.width * span;
            let start = view.start + d;
            start = Math.min(Math.max(start, 0), Math.max(0, uEnd - span));
            this.props.onViewChange({start, end: start + span});
            return;
        }
        const anchor = this.uAt(e.clientX);
        const factor = Math.pow(1.2, e.deltaY / 100);
        const nextSpan = Math.min(full, Math.max(MIN_SPAN, span * factor));
        const f = (anchor - view.start) / Math.max(1, span);
        let start = anchor - (f * nextSpan);
        start = Math.min(Math.max(start, 0), Math.max(0, uEnd - nextSpan));
        this.props.onViewChange({start, end: start + nextSpan});
    }
    handleKeyDown (e) {
        const {t, range, axis} = this.props;
        const step = e.shiftKey ? 60 * 1000 : 1000;
        const cross = (to, dir) => {
            const brk = axis.breakAt(to);
            if (!brk) return to;
            return dir < 0 ? brk.from : brk.to;
        };
        if (e.key === 'ArrowLeft') this.props.onScrub(Math.max(range.start, cross(t - step, -1)), 'end');
        else if (e.key === 'ArrowRight') this.props.onScrub(Math.min(range.end, cross(t + step, 1)), 'end');
        else if (e.key === 'Home') this.props.onScrub(range.start, 'end');
        else if (e.key === 'End') this.props.onScrub(range.end, 'end');
        else return;
        e.preventDefault();
    }
    render () {
        const {lanes, laneLabel, tooltipFor, ariaLabel, ariaValueText, range, t} = this.props;
        const hover = this.state.hover;
        return (
            <div className={styles.timelineBody}>
                <div className={styles.laneLabels}>
                    <div style={{height: AXIS_H}} />
                    {lanes.map(l => (
                        <div
                            className={styles.laneLabel}
                            key={l.key}
                            style={{height: LANE_H}}
                            title={laneLabel(l)}
                        >
                            <span
                                className={styles.laneDot}
                                style={{background: l.color}}
                            />
                            {laneLabel(l)}
                        </div>
                    ))}
                </div>
                <div
                    className={styles.timelineCanvasWrap}
                    ref={this.setWrap}
                >
                    <canvas
                        aria-label={ariaLabel}
                        aria-valuemax={range.end}
                        aria-valuemin={range.start}
                        aria-valuenow={t}
                        aria-valuetext={ariaValueText}
                        className={styles.timelineCanvas}
                        data-testid="rewind-timeline"
                        ref={this.setCanvas}
                        role="slider"
                        tabIndex={0}
                        onKeyDown={this.handleKeyDown}
                        onPointerCancel={this.handlePointerUp}
                        onPointerDown={this.handlePointerDown}
                        onPointerLeave={this.handleLeave}
                        onPointerMove={this.handlePointerMove}
                        onPointerUp={this.handlePointerUp}
                    />
                    {hover ? (
                        <div
                            className={styles.timelineTooltip}
                            style={{left: Math.min(Math.max(0, hover.x - 60), this.state.width - 220)}}
                        >
                            {tooltipFor(hover)}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }
}

TimelineBar.propTypes = {
    ariaLabel: PropTypes.string,
    ariaValueText: PropTypes.string,
    axis: PropTypes.shape({
        toU: PropTypes.func,
        toT: PropTypes.func,
        breakAt: PropTypes.func,
        uEnd: PropTypes.number,
        sessions: PropTypes.array,
        breaks: PropTypes.array
    }).isRequired,
    brokenRanges: PropTypes.arrayOf(PropTypes.object).isRequired,
    events: PropTypes.arrayOf(PropTypes.object).isRequired,
    idleGaps: PropTypes.arrayOf(PropTypes.object).isRequired,
    laneLabel: PropTypes.func.isRequired,
    lanes: PropTypes.arrayOf(PropTypes.object).isRequired,
    locale: PropTypes.string.isRequired,
    markers: PropTypes.arrayOf(PropTypes.object).isRequired,
    onScrub: PropTypes.func.isRequired,
    onViewChange: PropTypes.func.isRequired,
    range: PropTypes.shape({start: PropTypes.number, end: PropTypes.number}).isRequired,
    skipIdle: PropTypes.bool,
    t: PropTypes.number.isRequired,
    tooltipFor: PropTypes.func.isRequired,
    until: PropTypes.number,
    view: PropTypes.shape({start: PropTypes.number, end: PropTypes.number}).isRequired
};

export default TimelineBar;
