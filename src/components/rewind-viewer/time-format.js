const cache = new Map();

const formatter = (locale, options) => {
    const key = `${locale}|${JSON.stringify(options)}`;
    if (!cache.has(key)) {
        let f;
        try {
            f = new Intl.DateTimeFormat(locale, options);
        } catch (e) {
            f = new Intl.DateTimeFormat('en', options);
        }
        cache.set(key, f);
    }
    return cache.get(key);
};

const sameDay = (a, b) => {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

/**
 * "2:14 PM" (or the locale's form).
 * @param {number} ms epoch ms
 * @param {string} locale BCP 47
 * @returns {string} label
 */
export const formatClock = (ms, locale) => formatter(locale, {hour: 'numeric', minute: '2-digit'}).format(ms);

/**
 * "2:14:05 PM".
 * @param {number} ms epoch ms
 * @param {string} locale BCP 47
 * @returns {string} label
 */
export const formatClockSeconds = (ms, locale) =>
    formatter(locale, {hour: 'numeric', minute: '2-digit', second: '2-digit'}).format(ms);

/**
 * Time, with the date when it isn't today: "2:14 PM" / "Nov 2, 2:14 PM".
 * @param {number} ms epoch ms
 * @param {string} locale BCP 47
 * @param {number} [today] epoch ms that counts as today
 * @returns {string} label
 */
export const formatMoment = (ms, locale, today = Date.now()) => (sameDay(ms, today) ?
    formatClock(ms, locale) :
    formatter(locale, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(ms));

/**
 * Full date: "November 3, 2026".
 * @param {number} ms epoch ms
 * @param {string} locale BCP 47
 * @returns {string} label
 */
export const formatDate = (ms, locale) =>
    formatter(locale, {year: 'numeric', month: 'long', day: 'numeric'}).format(ms);

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEPS = [SEC, 5 * SEC, 15 * SEC, 30 * SEC, MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
    DAY, 7 * DAY, 30 * DAY];

/**
 * Axis ticks for a time window.
 * @param {number} start epoch ms
 * @param {number} end epoch ms
 * @param {number} width px
 * @param {string} locale BCP 47
 * @param {number} [minPx] minimum px between ticks
 * @returns {Array<{t: number, label: string}>} ticks
 */
export const axisTicks = (start, end, width, locale, minPx = 90) => {
    const span = Math.max(1, end - start);
    const step = STEPS.find(s => (s / span) * width >= minPx) || STEPS[STEPS.length - 1];
    const offset = new Date(start).getTimezoneOffset() * MIN;
    let first = (Math.ceil((start - offset) / step) * step) + offset;
    if (step >= DAY) {
        const d = new Date(start);
        d.setHours(0, 0, 0, 0);
        first = d.getTime();
        while (first < start) first += step;
    }
    const ticks = [];
    for (let t = first; t <= end && ticks.length < 200; t += step) {
        let label;
        if (step >= DAY) label = formatter(locale, {month: 'short', day: 'numeric'}).format(t);
        else if (step < MIN) label = formatClockSeconds(t, locale);
        else label = formatClock(t, locale);
        ticks.push({t, label});
    }
    return ticks;
};
