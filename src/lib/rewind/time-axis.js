export const SESSION_BREAK_MS = 10 * 60 * 1000;
const BREAK_SHARE = 0.04;
const MAX_BREAKS_SHARE = 0.3;
const MIN_BREAK_U = 1000;

const QUIET = new Set(['runtime.state']);

export const buildAxis = (range, events, opts = {}) => {
    const breakMs = opts.breakMs || SESSION_BREAK_MS;
    const start = range.start;
    const end = Math.max(range.start, range.end);
    const gaps = [];
    let prev = start;
    for (const e of events) {
        if (QUIET.has(e.k)) continue;
        const ts = Math.min(Math.max(e.ts, start), end);
        if (ts - prev > breakMs) gaps.push({from: prev, to: ts});
        prev = Math.max(prev, ts);
    }
    if (end - prev > breakMs) gaps.push({from: prev, to: end});

    const idle = gaps.reduce((s, g) => s + (g.to - g.from), 0);
    const active = Math.max(0, (end - start) - idle);
    const share = gaps.length ? Math.min(BREAK_SHARE, MAX_BREAKS_SHARE / gaps.length) : 0;
    const breakU = Math.max(MIN_BREAK_U, active * share);

    const sessions = [];
    const breaks = [];
    let u = 0;
    let s0 = start;
    for (const g of gaps) {
        sessions.push({start: s0, end: g.from, u0: u, u1: u + (g.from - s0)});
        u += g.from - s0;
        breaks.push({from: g.from, to: g.to, u0: u, u1: u + breakU});
        u += breakU;
        s0 = g.to;
    }
    sessions.push({start: s0, end, u0: u, u1: u + (end - s0)});
    u += end - s0;
    const uEnd = u;

    const pieces = [];
    for (let i = 0; i < sessions.length; i++) {
        pieces.push({t0: sessions[i].start, t1: sessions[i].end, u0: sessions[i].u0, u1: sessions[i].u1, brk: null});
        const b = breaks[i];
        if (b) pieces.push({t0: b.from, t1: b.to, u0: b.u0, u1: b.u1, brk: b});
    }

    const pieceByT = t => {
        let lo = 0;
        let hi = pieces.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (pieces[mid].t0 <= t) lo = mid;
            else hi = mid - 1;
        }
        return pieces[lo];
    };
    const pieceByU = v => {
        let lo = 0;
        let hi = pieces.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (pieces[mid].u0 <= v) lo = mid;
            else hi = mid - 1;
        }
        return pieces[lo];
    };
    const lerp = (from0, from1, to0, to1, v) =>
        (from1 === from0 ? to0 : to0 + ((v - from0) / (from1 - from0) * (to1 - to0)));

    const toU = t => {
        if (t <= start) return t - start;
        if (t >= end) return uEnd + (t - end);
        const p = pieceByT(t);
        return lerp(p.t0, p.t1, p.u0, p.u1, t);
    };
    const toT = (v, snap = true) => {
        if (v <= 0) return start + v;
        if (v >= uEnd) return end + (v - uEnd);
        const p = pieceByU(v);
        if (p.brk && snap) return (v - p.u0) < (p.u1 - v) ? p.t0 : p.t1;
        return lerp(p.u0, p.u1, p.t0, p.t1, v);
    };
    const breakAt = t => {
        for (const b of breaks) if (t > b.from && t < b.to) return b;
        return null;
    };
    return {start, end, uEnd, breakU, sessions, breaks, toU, toT, breakAt};
};

export const formatGap = (ms, locale) => {
    const fmt = unit => {
        try {
            return new Intl.NumberFormat(locale, {style: 'unit', unit, unitDisplay: 'narrow'});
        } catch (e) {
            return new Intl.NumberFormat('en', {style: 'unit', unit, unitDisplay: 'narrow'});
        }
    };
    const min = Math.round(ms / 60000);
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    if (d) return h ? `${fmt('day').format(d)} ${fmt('hour').format(h)}` : fmt('day').format(d);
    if (h) return m ? `${fmt('hour').format(h)} ${fmt('minute').format(m)}` : fmt('hour').format(h);
    return fmt('minute').format(Math.max(1, m));
};
