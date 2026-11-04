import ArgumentType from 'scratch-vm/src/extension-support/argument-type';
import BlockType from 'scratch-vm/src/extension-support/block-type';

export const PLACEHOLDER_COLOR = '#9E9E9E';

const NUMBER_SHADOWS = new Set([
    'math_number', 'math_positive_number', 'math_whole_number', 'math_integer', 'math_angle'
]);

const SUBSTACK = /^SUBSTACK\d*$/;

const shadowArgumentType = (shadowOpcode, menuPrefix) => {
    if (typeof shadowOpcode !== 'string') return {type: ArgumentType.BOOLEAN};
    if (shadowOpcode.startsWith(menuPrefix)) {
        return {type: ArgumentType.STRING, menu: shadowOpcode.slice(menuPrefix.length)};
    }
    if (NUMBER_SHADOWS.has(shadowOpcode)) return {type: ArgumentType.NUMBER};
    if (shadowOpcode === 'colour_picker') return {type: ArgumentType.COLOR};
    if (shadowOpcode === 'note') return {type: ArgumentType.NOTE};
    if (shadowOpcode === 'matrix') return {type: ArgumentType.MATRIX};
    return {type: ArgumentType.STRING};
};

const addItem = (menus, menuName, value, acceptReporters) => {
    if (!menus[menuName]) menus[menuName] = {acceptReporters, items: []};
    const item = `${value === null || typeof value === 'undefined' ? '' : value}`;
    if (!menus[menuName].items.includes(item)) menus[menuName].items.push(item);
};

export const buildPlaceholderInfo = (extensionID, blocks, lookup) => {
    const prefix = `${extensionID}_`;
    const menuPrefix = `${extensionID}_menu_`;
    const menus = {};
    const defs = new Map();

    for (const block of blocks) {
        const opcode = block.opcode.slice(prefix.length);
        if (block.opcode.startsWith(menuPrefix)) {
            const menuName = block.opcode.slice(menuPrefix.length);
            const field = block.fields && block.fields[menuName];
            addItem(menus, menuName, field ? field.value : '', true);
            continue;
        }
        if (!defs.has(opcode)) defs.set(opcode, {args: new Map(), reporter: false, branches: 0});
        const def = defs.get(opcode);
        const parent = block.parent ? lookup(block.parent) : null;
        if (parent && parent.next !== block.id) def.reporter = true;
        for (const name of Object.keys(block.inputs || {})) {
            if (SUBSTACK.test(name)) {
                const n = name === 'SUBSTACK' ? 1 : Number(name.slice('SUBSTACK'.length));
                def.branches = Math.max(def.branches, n || 1);
                continue;
            }
            const input = block.inputs[name];
            const shadow = input && input.shadow ? lookup(input.shadow) : null;
            const arg = shadowArgumentType(shadow ? shadow.opcode : null, menuPrefix);
            if (!def.args.has(name) || def.args.get(name).type === ArgumentType.BOOLEAN) def.args.set(name, arg);
        }
        for (const name of Object.keys(block.fields || {})) {
            const menuName = `ctPlaceholder_${opcode}_${name}`;
            addItem(menus, menuName, block.fields[name].value, false);
            def.args.set(name, {type: ArgumentType.STRING, menu: menuName});
        }
    }

    const placeholderFuncs = {};
    const infoBlocks = [];
    let i = 0;
    for (const [opcode, def] of defs) {
        const func = `ctPlaceholder${i++}`;
        const blockType = def.reporter ? BlockType.REPORTER :
            (def.branches ? BlockType.CONDITIONAL : BlockType.COMMAND);
        placeholderFuncs[func] = blockType;
        const argNames = [...def.args.keys()];
        const info = {
            opcode,
            func,
            blockType,
            text: [opcode, ...argNames.map(n => `[${n}]`)].join(' '),
            arguments: Object.fromEntries(argNames.map(n => {
                const a = def.args.get(n);
                const out = {type: a.type};
                if (a.menu) out.menu = a.menu;
                if (a.type === ArgumentType.STRING || a.type === ArgumentType.NUMBER) out.defaultValue = '';
                return [n, out];
            })),
            hideFromPalette: true
        };
        if (blockType === BlockType.CONDITIONAL) info.branchCount = def.branches;
        infoBlocks.push(info);
    }
    for (const menuName of Object.keys(menus)) {
        if (!menus[menuName].items.length) menus[menuName].items.push('');
    }

    return {
        id: extensionID,
        name: extensionID,
        color1: PLACEHOLDER_COLOR,
        color2: '#8A8A8A',
        color3: '#757575',
        blocks: infoBlocks,
        menus,
        placeholderFuncs
    };
};

export const createPlaceholderExtension = (extensionID, blocks, lookup) => {
    const {placeholderFuncs, ...info} = buildPlaceholderInfo(extensionID, blocks, lookup);
    const extension = {
        isCodeTorchPlaceholder: true,
        getInfo: () => info
    };
    for (const func of Object.keys(placeholderFuncs)) {
        extension[func] = placeholderFuncs[func] === BlockType.REPORTER ? () => '' : () => {};
    }
    return extension;
};
