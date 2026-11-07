const sep = '<sep gap="36"/>';

const shadow = (name, type, fields = '') => `<value name="${name}"><shadow type="${type}">${fields}</shadow></value>`;
const num = (name, value) => shadow(name, 'math_number', `<field name="NUM">${value}</field>`);
const int = (name, value) => shadow(name, 'math_integer', `<field name="NUM">${value}</field>`);
const text = (name, value) => shadow(name, 'text', `<field name="TEXT">${value}</field>`);
const check = name => shadow(name, 'checkbox', '<field name="CHECKBOX">FALSE</field>');
const color = name => shadow(name, 'colour_picker');
const ESSENTIALS = new Set([
    'motion_changebyxy', 'motion_pointtowardsxy',
    'looks_stoptalking', 'looks_previouscostume', 'looks_previousbackdrop', 'looks_getSpriteVisible',
    'sound_isSoundPlaying',
    'event_whenstopclicked', 'event_whenanything',
    'control_expandableIf', 'control_from_to', 'control_exitLoop', 'control_continueLoop', 'control_switch',
    'control_switch_default', 'control_case', 'control_if_return_else_return', 'control_is_clone',
    'sensing_thing_is_number', 'sensing_thing_is_text', 'sensing_distanceTo', 'sensing_directionTo',
    'operator_power', 'operator_gtorequal', 'operator_ltorequal', 'operator_notequal', 'operator_trueBoolean',
    'operator_falseBoolean', 'operator_expandablejoininputs', 'operator_getLettersFromIndexToIndexInTextFixed',
    'operator_indexOfTextInText', 'operator_replaceAll', 'operator_toUpperLowerCase', 'operator_character_to_code',
    'operator_code_to_character', 'operator_newLine'
]);

let essentialsOnly = false;

const block = (type, inner = '', attrs = '') => (essentialsOnly && !ESSENTIALS.has(type) ? '' :
    `<block type="${type}"${attrs}>${inner}</block>`);
const sound = (soundName, name = 'SOUND_MENU') =>
    shadow(name, 'sound_sounds_menu', `<field name="SOUND_MENU">${soundName}</field>`);

const motion = ({isStage}) => (isStage ? '' : [
    block('motion_changebyxy', num('DX', 10) + num('DY', 10)),
    block('motion_pointtowardsxy', num('X', 0) + num('Y', 0)),
    block('motion_movebacksteps', num('STEPS', 10)),
    block('motion_moveupdownsteps', num('STEPS', 10)),
    sep,
    block('motion_turnaround'),
    block('motion_pointinrandomdirection'),
    block('motion_turnrightaroundxy', num('DEGREES', 15) + num('X', 0) + num('Y', 0)),
    block('motion_turnleftaroundxy', num('DEGREES', 15) + num('X', 0) + num('Y', 0)),
    sep,
    block('motion_ifonspritebounce', shadow('SPRITE', 'motion_pointtowards_menu')),
    block('motion_ifonxybounce', num('X', 0) + num('Y', 0)),
    block('motion_move_sprite_to_scene_side')
].join(''));

const looks = ({isStage, targetId, costumeName, backdropName}) => {
    const costumeInput = isStage ?
        shadow('COSTUME', 'looks_backdrops', `<field name="BACKDROP">${backdropName}</field>`) :
        shadow('COSTUME', 'looks_costume', `<field name="COSTUME">${costumeName}</field>`);
    const visibilityMenu = shadow('VISIBLE_OPTION', 'looks_changeVisibilityOfSprite_menu');
    const parts = [];
    if (!isStage) {
        parts.push(
            block('looks_stoptalking'),
            block('looks_setFont', text('font', 'Helvetica') + num('size', 14)),
            block('looks_setColor', `<field name="prop">BUBBLE_FILL</field>${color('color')}`),
            block('looks_setShape', `<field name="prop">STROKE_WIDTH</field>${num('color', 2)}`),
            block('looks_sayWidth', '', ` id="${targetId}_sayWidth"`),
            block('looks_sayHeight', '', ` id="${targetId}_sayHeight"`),
            sep,
            block('looks_previouscostume')
        );
    }
    parts.push(
        block('looks_previousbackdrop'),
        block('looks_getinputofcostume', shadow('INPUT', 'looks_getinput_menu') + costumeInput),
        sep
    );
    if (!isStage) {
        parts.push(
            block('looks_setStretch', num('X', 100) + num('Y', 100)),
            block('looks_changeStretch', num('X', 10) + num('Y', 10)),
            block('looks_stretchGetX', '', ` id="${targetId}_stretchGetX"`),
            block('looks_stretchGetY', '', ` id="${targetId}_stretchGetY"`),
            sep
        );
    }
    parts.push(
        block('looks_setTintColor', color('color')),
        block('looks_tintColor', '', ` id="${targetId}_tintColor"`),
        block('looks_getEffectValue', '', ` id="${targetId}_getEffectValue"`)
    );
    if (!isStage) {
        parts.push(
            sep,
            block('looks_getSpriteVisible', '', ` id="${targetId}_getSpriteVisible"`),
            block('looks_changeVisibilityOfSpriteShow', visibilityMenu),
            block('looks_changeVisibilityOfSpriteHide', visibilityMenu),
            block('looks_getOtherSpriteVisible', shadow('VISIBLE_OPTION', 'looks_getOtherSpriteVisible_menu')),
            sep,
            block('looks_layersSetLayer', int('NUM', 1)),
            block('looks_goTargetLayer', shadow('VISIBLE_OPTION', 'looks_getOtherSpriteVisible_menu')),
            block('looks_layersGetLayer', '', ` id="${targetId}_layersGetLayer"`)
        );
    }
    return parts.join('');
};

const soundBlocks = ({targetId, soundName}) => [
    block('sound_play_at_seconds_until_done', sound(soundName) + num('VALUE', 1)),
    block('sound_play_at_seconds', sound(soundName) + num('VALUE', 1)),
    block('sound_stop', sound(soundName)),
    block('sound_playallsounds'),
    block('sound_set_stop_fadeout_to', num('VALUE', 1) + sound(soundName)),
    sep,
    block('sound_isSoundPlaying', sound(soundName)),
    block('sound_getLength', sound(soundName)),
    block('sound_getEffectValue', '', ` id="${targetId}_sound_getEffectValue"`)
].join('');

const events = () => [
    block('event_whenstopclicked'),
    block('event_whenkeyhit'),
    block('event_whenmousescrolled'),
    sep,
    block('event_always'),
    block('event_whenanything', check('ANYTHING'))
].join('');

const elseIf = block('control_expandableIf',
    `<mutation branches="2" ends-in-else="false"></mutation>${check('BOOL1')}${check('BOOL2')}`);

const control = ({isStage}) => {
    const parts = [
        block('control_waitsecondsoruntil', shadow('DURATION', 'math_positive_number', '<field name="NUM">1</field>') +
            check('CONDITION')),
        block('control_waittick'),
        sep,
        block('control_repeatForSeconds', shadow('TIMES', 'math_positive_number', '<field name="NUM">1</field>')),
        block('control_from_to', shadow('SHADOW', 'control_from_to_index') + int('FROM', 1) + int('TO', 10)),
        block('control_exitLoop'),
        block('control_continueLoop'),
        sep,
        block('control_switch', text('CONDITION', '')),
        block('control_switch_default', text('CONDITION', '')),
        block('control_case', text('CONDITION', '')),
        block('control_case_next', text('CONDITION', '')),
        block('control_exitCase'),
        sep,
        block('control_if_return_else_return', check('boolean') + text('TEXT1', 'yes') + text('TEXT2', 'no')),
        sep,
        block('control_try_catch'),
        block('control_throw_error', text('ERROR', 'Oops!')),
        block('control_error'),
        sep,
        block('control_run_as_sprite', shadow('RUN_AS_OPTION', 'control_run_as_sprite_menu')),
        block('control_stop_sprite', shadow('STOP_OPTION', 'control_stop_sprite_menu')),
        block('control_backToGreenFlag'),
        block('control_new_script'),
        sep,
        block('control_delete_clones_of', shadow('CLONE_OPTION', 'control_create_clone_of_menu'))
    ];
    if (!isStage) parts.push(block('control_is_clone'));
    return parts.join('');
};

const sensing = ({isStage, targetId}) => {
    const parts = [];
    if (!isStage) {
        parts.push(
            block('sensing_objecttouchingobject', shadow('FULLTOUCHINGOBJECTMENU', 'sensing_fulltouchingobjectmenu') +
                shadow('SPRITETOUCHINGOBJECTMENU', 'sensing_touchingobjectmenusprites')),
            block('sensing_objecttouchingclonesprite',
                shadow('FULLTOUCHINGOBJECTMENU', 'sensing_fulltouchingobjectmenu') +
                shadow('SPRITETOUCHINGOBJECTMENU', 'sensing_touchingobjectmenusprites')),
            block('sensing_getxyoftouchingsprite', shadow('SPRITE', 'sensing_distancetomenu'))
        );
    }
    parts.push(
        block('sensing_distanceTo', num('x1', 0) + num('y1', 0) + num('x2', 100) + num('y2', 100)),
        block('sensing_directionTo', num('x2', 100) + num('y2', 100) + num('x1', 0) + num('y1', 0)),
        sep,
        block('sensing_keyhit', shadow('KEY_OPTION', 'sensing_keyoptions')),
        block('sensing_mousescrolling', shadow('SCROLL_OPTION', 'sensing_scrolldirections')),
        block('sensing_mouseclicked', '', ' id="sensing_mouseclicked"'),
        sep,
        block('sensing_thing_is_number', text('TEXT1', '10')),
        block('sensing_thing_is_text', text('TEXT1', 'apple')),
        block('sensing_thing_has_number', text('TEXT1', 'apple10')),
        block('sensing_isUpperCase', text('text', 'A')),
        sep,
        block('sensing_set_of', shadow('OBJECT', 'sensing_of_object_menu') + text('VALUE', '0')),
        block('sensing_setclipboard', text('ITEM', 'Hello!')),
        block('sensing_getclipboard', '', ' id="sensing_getclipboard"')
    );
    if (!isStage) parts.push(block('sensing_getdragmode', '', ` id="${targetId}_getdragmode"`));
    parts.push(
        sep,
        block('sensing_mobile'),
        block('sensing_fingerdown', shadow('FINGER_OPTION', 'sensing_fingeroptions')),
        block('sensing_fingertapped', shadow('FINGER_OPTION', 'sensing_fingeroptions')),
        block('sensing_fingerx', shadow('FINGER_OPTION', 'sensing_fingeroptions')),
        block('sensing_fingery', shadow('FINGER_OPTION', 'sensing_fingeroptions')),
        sep,
        block('sensing_regextest', text('reg', '[a-z]+') + text('regrule', 'i') + text('text', 'Hello')),
        block('sensing_getspritewithattrib', text('var', 'x position') + text('val', '0')),
        block('sensing_getoperatingsystem'),
        block('sensing_getbrowser'),
        block('sensing_geturl'),
        block('sensing_loggedin', '', ' id="sensing_loggedin"')
    );
    return parts.join('');
};

const operators = () => [
    block('operator_power', num('NUM1', 2) + num('NUM2', 3)),
    block('operator_expandableMath', `<mutation inputcount="3" menuvalues="++"></mutation>${
        num('NUM1', '')}${num('NUM2', '')}${num('NUM3', '')}`),
    block('operator_constrainnumber', num('inp', 50) + num('min', 1) + num('max', 100)),
    block('operator_lerpFunc', num('ONE', 0) + num('TWO', 100) + num('AMOUNT', 0.5)),
    sep,
    block('operator_gtorequal', text('OPERAND1', '') + text('OPERAND2', '50')),
    block('operator_ltorequal', text('OPERAND1', '') + text('OPERAND2', '50')),
    block('operator_notequal', text('OPERAND1', '') + text('OPERAND2', '50')),
    block('operator_expandableCompare', `<mutation inputcount="3" menuvalues="mm"></mutation>${
        text('INPUT1', '')}${text('INPUT2', '')}${text('INPUT3', '')}`),
    sep,
    block('operator_trueBoolean'),
    block('operator_falseBoolean'),
    block('operator_randomBoolean'),
    block('operator_expandableBool', `<mutation inputcount="3" menuvalues="aa" optimize="true"></mutation>${
        check('BOOL1')}${check('BOOL2')}${check('BOOL3')}`),
    block('operator_xor', check('OPERAND1') + check('OPERAND2')),
    sep,
    block('operator_newLine'),
    block('operator_tabCharacter'),
    block('operator_expandablejoininputs', `<mutation inputcount="3"></mutation>${
        text('INPUT1', 'apple ')}${text('INPUT2', 'banana ')}${text('INPUT3', 'pear')}`),
    block('operator_getLettersFromIndexToIndexInTextFixed', num('INDEX1', 2) + num('INDEX2', 4) +
        text('TEXT', 'apple')),
    block('operator_indexOfTextInText', text('TEXT1', 'world') + text('TEXT2', 'Hello world!')),
    block('operator_lastIndexOfTextInText', text('TEXT1', 'o') + text('TEXT2', 'Hello world!')),
    block('operator_countAppearTimes', text('TEXT1', 'o') + text('TEXT2', 'Hello world!')),
    block('operator_textStartsOrEndsWith', text('TEXT1', 'apple') + text('TEXT2', 'app')),
    block('operator_textIncludesLetterFrom', text('TEXT1', 'apple') + text('TEXT2', 'aeiou')),
    block('operator_replaceAll', text('text', 'foo bar foo') + text('term', 'foo') + text('res', 'baz')),
    block('operator_replaceFirst', text('text', 'foo bar foo') + text('term', 'foo') + text('res', 'baz')),
    block('operator_toUpperLowerCase', text('TEXT', 'Hello')),
    block('operator_readLineInMultilineText', num('LINE', 1) + text('TEXT', 'Hello')),
    sep,
    block('operator_stringify', text('ONE', 'apple')),
    block('operator_boolify', text('ONE', 'true')),
    block('operator_character_to_code', text('ONE', 'a')),
    block('operator_code_to_character', num('ONE', 97)),
    sep,
    block('operator_advMath', num('ONE', 2) + num('TWO', 8)),
    block('operator_advlog', num('NUM1', 2) + num('NUM2', 8)),
    block('operator_nand', check('OPERAND1') + check('OPERAND2')),
    block('operator_nor', check('OPERAND1') + check('OPERAND2')),
    block('operator_xnor', check('OPERAND1') + check('OPERAND2')),
    block('operator_regexmatch', text('text', 'foo bar') + text('reg', '[a-z]+') + text('regrule', 'g')),
    block('operator_checkboxBoolean')
].join('');

const CATEGORIES = {
    motion,
    looks,
    sound: soundBlocks,
    events,
    control,
    sensing,
    operators
};

/**
 * Inserts "else if" right after the vanilla if-else block.
 * @param {string} xml the control category XML
 * @returns {string} the XML with the block added
 */
const insertElseIf = xml => {
    const anchor = /<block type="control_if_else"\s*(\/>|><\/block>)/;
    const match = anchor.exec(xml);
    if (!match) return xml;
    const end = match.index + match[0].length;
    return xml.slice(0, end) + elseIf + xml.slice(end);
};

/**
 * Blocks left out at the Essentials level leave their separators behind.
 * @param {string} xml a category's advanced blocks
 * @returns {string} the same, tidied
 */
const tidySeparators = xml => {
    let out = xml || '';
    while (out.includes(sep + sep)) out = out.split(sep + sep).join(sep);
    while (out.startsWith(sep)) out = out.slice(sep.length);
    while (out.endsWith(sep)) out = out.slice(0, -sep.length);
    return out;
};

/**
 * Adds the advanced blocks to one built-in category's XML.
 * @param {string} categoryId categoryId
 * @param {string} xml xml
 * @param {object} context context
 * @returns {string} the XML with the advanced blocks in
 */
const addCtPmBlocks = (categoryId, xml, context) => {
    const make = CATEGORIES[categoryId];
    if (!make || typeof xml !== 'string') return xml;
    if (categoryId === 'control') xml = insertElseIf(xml);
    essentialsOnly = !!context.essentialsOnly;
    let extra;
    try {
        extra = tidySeparators(make(context));
    } finally {
        essentialsOnly = false;
    }
    if (!extra) return xml;
    const close = xml.lastIndexOf('</category>');
    if (close === -1) return xml;
    const before = xml.slice(0, close);
    const gapAt = before.lastIndexOf(sep);
    const insertAt = gapAt !== -1 && before.slice(gapAt + sep.length).trim() === '' ? gapAt : close;
    return `${xml.slice(0, insertAt)}${sep}${extra}${xml.slice(insertAt)}`;
};

export {
    addCtPmBlocks
};
