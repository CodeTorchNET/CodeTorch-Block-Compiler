/**
 * Content signature of a shape.
 * @param {object} shape shape
 * @returns {string} signature
 */
export const signature = shape => JSON.stringify([shape.tag, shape.attrs, shape.kids, shape.text, shape.defs]);

/**
 * Short hash of a string.
 * @param {string} text text
 * @returns {string} hash
 */
export const contentHash = text => {
    let hash = 5381;
    for (let index = 0; index < text.length; index++) {
        hash = (((hash << 5) + hash) + text.charCodeAt(index)) | 0;
    }
    return (hash >>> 0).toString(36);
};

/**
 * Give every shape an id.
 * @param {object} opts options
 * @param {string} opts.costumeId costume id
 * @param {Array<object>} opts.shapes shapes
 * @param {?Array<object>} opts.items paper items
 * @param {boolean} opts.seeding first publication
 * @param {?Array<{id: string, signature: string}>} opts.existing existing shapes
 * @param {string|number} opts.clientId client id
 */
export const assignShapeIds = ({costumeId, shapes, items, seeding, existing, clientId}) => {
    const claimed = new Set();
    for (const shape of shapes) {
        if (!shape.id) continue;
        if (claimed.has(shape.id)) shape.id = null;
        else claimed.add(shape.id);
    }

    if (existing && !seeding) {
        const byContent = new Map();
        for (const entry of existing) {
            const key = contentHash(entry.signature);
            if (!byContent.has(key)) byContent.set(key, []);
            byContent.get(key).push(entry.id);
        }
        for (const shape of shapes) {
            if (shape.id) continue;
            const candidates = byContent.get(contentHash(signature(shape))) || [];
            while (candidates.length) {
                const candidate = candidates.shift();
                if (claimed.has(candidate)) continue;
                shape.id = candidate;
                claimed.add(candidate);
                break;
            }
        }
    }

    const seeded = new Map();
    for (let index = 0; index < shapes.length; index++) {
        if (!shapes[index].id) {
            if (seeding) {
                const hash = contentHash(signature(shapes[index]));
                const nth = (seeded.get(hash) || 0) + 1;
                seeded.set(hash, nth);
                shapes[index].id = nth === 1 ? `${costumeId}~${hash}` : `${costumeId}~${hash}~${nth}`;
            } else {
                shapes[index].id = `${clientId}-${Math.random().toString(36)
                    .slice(2, 9)}`;
            }
            claimed.add(shapes[index].id);
        }
        const item = items && items[index];
        if (item) {
            if (!item.data) item.data = {};
            item.data.collabId = shapes[index].id;
        }
    }
};

/**
 * Indices of a longest increasing subsequence.
 * @param {Array<number>} values values
 * @returns {Array<number>} indices
 */
export const longestOrdered = values => {
    const best = values.map(() => 1);
    const previous = values.map(() => -1);
    let end = 0;
    for (let index = 0; index < values.length; index++) {
        for (let earlier = 0; earlier < index; earlier++) {
            if (values[earlier] < values[index] && best[earlier] + 1 > best[index]) {
                best[index] = best[earlier] + 1;
                previous[index] = earlier;
            }
        }
        if (best[index] > best[end]) end = index;
    }
    const out = [];
    for (let index = values.length ? end : -1; index !== -1; index = previous[index]) out.push(index);
    return out.reverse();
};

/**
 * Stored form of a shape.
 * @param {object} shape shape
 * @returns {object} entry
 */
export const shapeEntry = shape => {
    const out = {tag: shape.tag, attrs: shape.attrs};
    if (shape.kids) out.kids = shape.kids;
    if (typeof shape.text !== 'undefined') out.text = shape.text;
    if (shape.defs) out.defs = shape.defs;
    return out;
};

/**
 * Diff two publications of a costume's shapes.
 * @param {?Map<string, string>} before previous signatures
 * @param {Array<object>} shapes shapes
 * @returns {{ops: Array<object>, after: Map<string, string>, reset: boolean}} result
 */
export const diffShapes = (before, shapes) => {
    const after = new Map();
    for (const shape of shapes) after.set(shape.id, signature(shape));
    const ops = [];
    if (!before) {
        shapes.forEach((shape, index) => ops.push({op: 'add', id: shape.id, shape: shapeEntry(shape), index}));
        return {ops, after, reset: true};
    }
    for (const id of before.keys()) if (!after.has(id)) ops.push({op: 'delete', id});
    shapes.forEach((shape, index) => {
        const was = before.get(shape.id);
        if (was === after.get(shape.id)) return;
        ops.push({op: was ? 'update' : 'add', id: shape.id, shape: shapeEntry(shape), index});
    });
    const prevOrder = [...before.keys()].filter(id => after.has(id));
    const nowOrder = shapes.map(shape => shape.id).filter(id => before.has(id));
    if (prevOrder.some((id, index) => id !== nowOrder[index])) {
        ops.push({op: 'reorder', order: shapes.map(shape => shape.id)});
    }
    return {ops, after, reset: false};
};
