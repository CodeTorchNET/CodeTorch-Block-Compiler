const FUNCTIONS = 'ctFunctions';
const LIST_VALUES = 'jwArray';

const HIDDEN = new Set(['blank', 'get', 'index', 'has', 'length', 'set', 'append', 'reverse', 'forEach',
    'sum', 'split', 'join']);

const EVERYTHING_ONLY = new Set(['blankLength', 'parse', 'builder', 'builderAppend', 'builderSet', 'fill',
    'splice', 'repeat', 'toString', 'validate']);

const PLACE = {
    newList: 'data',
    numbers: 'data',
    reporterRing: 'operatorsTop',
    predicateRing: 'operatorsTop',
    commandRing: 'operatorsTop',
    call: 'control',
    run: 'control',
    launch: 'control',
    callList: 'control',
    runList: 'control',
    launchList: 'control',
    tell: 'control',
    ask: 'control',
    map: 'data',
    keep: 'data',
    findFirst: 'data',
    combine: 'data'
};

/**
 * Top-level blocks.
 * @param {string} xml xml
 * @returns {Array<{type: ?string, xml: string}>} its its
 */
const topLevelItems = xml => {
    const items = [];
    const open = xml.indexOf('>');
    const close = xml.lastIndexOf('</category>');
    const body = xml.slice(open + 1, close === -1 ? xml.length : close);
    const tag = /<(\/?)(block|sep|label|button)\b[^>]*?(\/?)>/g;
    let depth = 0;
    let start = -1;
    let type = null;
    let match;
    while ((match = tag.exec(body))) {
        const [whole, closing, name, selfClosing] = match;
        if (name !== 'block') {
            if (depth === 0) items.push({type: null, xml: whole});
            continue;
        }
        if (closing) {
            depth--;
            if (depth === 0) items.push({type, xml: body.slice(start, match.index + whole.length)});
        } else if (selfClosing) {
            if (depth === 0) items.push({type: (/type="([^"]+)"/.exec(whole) || [])[1] || null, xml: whole});
        } else {
            if (depth === 0) {
                start = match.index;
                type = (/type="([^"]+)"/.exec(whole) || [])[1] || null;
            }
            depth++;
        }
    }
    return items;
};

/**
 * Take the Functions and List values categories out of the extension categories and split their.
 * @param {Array<{id: string, xml: string}>} categoriesXML the extension categories
 * @param {{essentials: boolean}} [options] options
 * @returns {{categoriesXML: Array, operatorsTop: string, operatorsEnd: string, control: string, data: string}} the the
 */
const placeSnapBlocks = (categoriesXML, options = {}) => {
    const out = {categoriesXML: [], operatorsTop: '', operatorsEnd: '', control: '', data: ''};
    let listValues = '';
    for (const category of categoriesXML) {
        if (category.id === FUNCTIONS) {
            for (const item of topLevelItems(category.xml)) {
                if (!item.type) continue;
                const place = PLACE[item.type.slice(FUNCTIONS.length + 1)] || 'operatorsEnd';
                out[place] += item.xml;
            }
        } else if (category.id === LIST_VALUES) {
            listValues = topLevelItems(category.xml)
                .filter(item => {
                    if (!item.type) return false;
                    const name = item.type.slice(LIST_VALUES.length + 1);
                    return !HIDDEN.has(name) && !(options.essentials && EVERYTHING_ONLY.has(name));
                })
                .map(item => item.xml)
                .join('');
        } else {
            out.categoriesXML.push(category);
        }
    }
    const gap = '<sep gap="36"/>';
    if (out.data && listValues) out.data += gap;
    out.data += listValues;
    return out;
};

export {
    EVERYTHING_ONLY,
    HIDDEN,
    placeSnapBlocks,
    topLevelItems
};
