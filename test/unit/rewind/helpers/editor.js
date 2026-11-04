let n = 0;
export const uid = p => `${p || 'b'}${++n}`;

export const ev = (vm, e) => vm.blockListener(Object.assign({group: ''}, e));

export const createXml = (vm, xml, blockId, group) => ev(vm, {type: 'create', blockId, xml: {outerHTML: xml}, group});

export const createScript = (vm, {x = 10, y = 20, steps = '10', text = 'hi', group = ''} = {}) => {
    const hat = uid('hat');
    const move = uid('move');
    const num = uid('num');
    const say = uid('say');
    const txt = uid('txt');
    const xml = `<block type="event_whenflagclicked" id="${hat}" x="${x}" y="${y}">` +
        `<next><block type="motion_movesteps" id="${move}"><value name="STEPS">` +
        `<shadow type="math_number" id="${num}"><field name="NUM">${steps}</field></shadow></value>` +
        `<next><block type="looks_say" id="${say}"><value name="MESSAGE">` +
        `<shadow type="text" id="${txt}"><field name="TEXT">${text}</field></shadow></value></block></next>` +
        `</block></next></block>`;
    createXml(vm, xml, hat, group);
    return {hat, move, num, say, txt};
};

export const typeInto = (vm, blockId, field, text, group = uid('edit')) => {
    for (let i = 1; i <= text.length; i++) {
        ev(vm, {type: 'change', blockId, element: 'field', name: field, newValue: text.slice(0, i), group});
    }
};

export const move = (vm, blockId, {oldParentId, oldInputName, newParentId, newInputName, x, y, group = uid('drag')}) =>
    ev(vm, {type: 'move', blockId, oldParentId, oldInputName, newParentId, newInputName,
        newCoordinate: typeof x === 'number' ? {x, y} : undefined, group});

export const del = (vm, blockId, group = uid('del')) => ev(vm, {type: 'delete', blockId, group});

export const varCreate = (vm, {varId = uid('var'), varName, varType = '', isLocal = false, isCloud = false, group = ''}) => {
    const e = {type: 'var_create', varId, varName, varType, isLocal, isCloud, group};
    if (isLocal) ev(vm, e);
    else vm.variableListener(e);
    return varId;
};

export const varRename = (vm, varId, newName) => ev(vm, {type: 'var_rename', varId, newName});
export const varDelete = (vm, varId) => ev(vm, {type: 'var_delete', varId});

export const commentCreate = (vm, {commentId = uid('cm'), blockId, text = 'note', x = 5, y = 6}) => {
    ev(vm, {type: 'comment_create', commentId, blockId, text, xy: {x, y}, width: 200, height: 100, minimized: false});
    return commentId;
};
export const commentChange = (vm, commentId, newContents) => ev(vm, {type: 'comment_change', commentId, newContents_: newContents});
export const commentMove = (vm, commentId, x, y) => ev(vm, {type: 'comment_move', commentId, newCoordinate_: {x, y}});
export const commentDelete = (vm, commentId, blockId) => ev(vm, {type: 'comment_delete', commentId, blockId});

export const runFrames = (vm, frames = 10) => {
    vm.greenFlag();
    for (let i = 0; i < frames; i++) vm.runtime._step();
    vm.stopAll();
    vm.runtime._step();
};

export const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));
