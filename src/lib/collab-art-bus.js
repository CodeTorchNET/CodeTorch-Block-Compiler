const subscribers = new Set();

/**
 * Listen for costume shapes.
 *
 * @param {function(object): void} handler called with `{targetId, costumeIndex, view, shapes, items}`
 * @returns {function(): void} unsubscribe
 */
export const onArtChanged = handler => {
    subscribers.add(handler);
    return () => subscribers.delete(handler);
};

/**
 * Announce that a costume's shapes have changed.
 * @param {object} art `{targetId, costumeIndex, view, shapes, items}`
 */
export const publishArt = art => {
    for (const handler of subscribers) {
        try {
            handler(art);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[collaboration] a costume-shape listener threw', e);
        }
    }
};

/** Whether anybody is listening, so the editor can skip the work when nobody is. */
export const hasArtSubscribers = () => subscribers.size > 0;

export default {onArtChanged, publishArt, hasArtSubscribers};
