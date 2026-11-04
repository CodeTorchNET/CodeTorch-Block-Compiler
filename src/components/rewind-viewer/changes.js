const fieldValues = block => {
    const out = {};
    const fields = block.fields || {};
    for (const name of Object.keys(fields)) {
        const f = fields[name];
        out[name] = f && typeof f === 'object' ? f.value : f;
    }
    return out;
};

export const blockSnapshot = target => {
    if (!target) return null;
    const out = {};
    const blocks = target.blocks || {};
    for (const id of Object.keys(blocks)) {
        const b = blocks[id];
        out[id] = {
            parent: b.parent || null,
            next: b.next || null,
            topLevel: !!b.topLevel,
            x: b.x,
            y: b.y,
            shadow: !!b.shadow,
            fields: fieldValues(b)
        };
    }
    return out;
};

export const stateSnapshot = state => {
    const out = new Map();
    for (const t of state.targets) out.set(t.id, blockSnapshot(t));
    return out;
};

const hasAncestorIn = (blocks, id, set) => {
    const seen = new Set();
    let p = blocks[id] && blocks[id].parent;
    while (p && !seen.has(p)) {
        if (set.has(p)) return true;
        seen.add(p);
        p = blocks[p] && blocks[p].parent;
    }
    return false;
};

export const diffBlocks = (before, after) => {
    if (!before || !after) return null;
    const added = [];
    const removed = [];
    const ghosts = [];
    const fields = [];
    let moved = [];
    for (const id of Object.keys(after)) {
        const a = after[id];
        const b = before[id];
        if (!b) {
            if (!a.shadow) added.push(id);
            continue;
        }
        for (const name of Object.keys(a.fields)) {
            if (b.fields[name] !== a.fields[name] && Object.prototype.hasOwnProperty.call(b.fields, name)) {
                fields.push({id, name, from: b.fields[name], to: a.fields[name]});
            }
        }
        if (a.shadow) continue;
        if (a.parent !== b.parent || a.topLevel !== b.topLevel ||
            (a.topLevel && (a.x !== b.x || a.y !== b.y))) {
            moved.push(id);
        }
    }
    for (const id of Object.keys(before)) {
        if (after[id]) continue;
        ghosts.push(id);
        if (!before[id].shadow) removed.push(id);
    }
    const moving = new Set(moved);
    const gone = new Set(ghosts);
    const fresh = new Set(Object.keys(after).filter(id => !before[id]));
    moved = moved.filter(id => {
        const a = after[id];
        const b = before[id];
        if (a.parent === b.parent) return true;
        const carried = p => p && (moving.has(p) || gone.has(p) || fresh.has(p));
        return !(carried(a.parent) || carried(b.parent));
    });
    const movedSet = new Set(moved);
    moved = moved.filter(id => !hasAncestorIn(after, id, movedSet));
    const count = added.length + removed.length + moved.length + fields.length;
    if (!count && !ghosts.length) return null;
    return {added, removed, ghosts, moved, fields, count};
};
