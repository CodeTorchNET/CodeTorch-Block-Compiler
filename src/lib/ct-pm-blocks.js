/**
 * Advanced blocks.
 * @param {ScratchBlocks} ScratchBlocks the ScratchBlocks instance
 * @param {VirtualMachine} vm the VM
 * @param {object} helpers helpers
 */
const defineCtPmMenus = (ScratchBlocks, vm, {jsonForMenuBlock, spriteMenu}) => {
    const Blocks = ScratchBlocks.Blocks;
    if (!Blocks.control_run_as_sprite_menu) return;
    const t = (id, english) => ScratchBlocks.ScratchMsgs.translate(id, english);
    const msg = (key, english) => (typeof ScratchBlocks.Msg[key] === 'string' ? ScratchBlocks.Msg[key] : english);
    const colours = ScratchBlocks.Colours;

    const menu = (type, field, colors, start) => {
        Blocks[type].init = function () {
            this.jsonInit(jsonForMenuBlock(field, spriteMenu, colors, start()));
        };
    };
    const stage = () => [[t('SENSING_OF_STAGE', 'Stage'), '_stage_']];
    const thisSprite = () => [[msg('CT_PM_THISSPRITE', 'this sprite'), '_myself_']];

    menu('control_run_as_sprite_menu', 'RUN_AS_OPTION', colours.control, stage);
    menu('control_stop_sprite_menu', 'STOP_OPTION', colours.control, stage);
    menu('looks_getOtherSpriteVisible_menu', 'VISIBLE_OPTION', colours.looks, thisSprite);
    menu('looks_changeVisibilityOfSprite_menu', 'VISIBLE_OPTION', colours.looks, thisSprite);
    menu('sensing_touchingobjectmenusprites', 'SPRITETOUCHINGOBJECTMENU', colours.sensing, thisSprite);
    menu('sensing_fulltouchingobjectmenu', 'FULLTOUCHINGOBJECTMENU', colours.sensing, () => [
        [t('SENSING_TOUCHINGOBJECT_POINTER', 'mouse-pointer'), '_mouse_'],
        [t('SENSING_TOUCHINGOBJECT_EDGE', 'edge'), '_edge_'],
        ...thisSprite()
    ]);

    Blocks.sensing_set_of.init = function () {
        const blockId = this.id;
        const menuFn = () => {
            const stageOptions = [
                [msg('CT_PM_SENSING_SETOF_BACKDROP', 'backdrop'), 'backdrop'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            const spriteOptions = [
                [ScratchBlocks.Msg.SENSING_OF_XPOSITION, 'x position'],
                [ScratchBlocks.Msg.SENSING_OF_YPOSITION, 'y position'],
                [ScratchBlocks.Msg.SENSING_OF_DIRECTION, 'direction'],
                [msg('CT_PM_SENSING_SETOF_COSTUME', 'costume'), 'costume'],
                [ScratchBlocks.Msg.SENSING_OF_SIZE, 'size'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            const variableItems = (target, localOnly) => {
                if (!target) return [];
                const names = target.getAllVariableNamesInScopeByType('', localOnly);
                names.sort(ScratchBlocks.scratchBlocksUtils.compareStrings);
                return names.map(name => [name, name]);
            };
            const stageTarget = vm.runtime.getTargetForStage();
            if (!vm.editingTarget || !stageTarget) return spriteOptions;
            let lookup = vm.editingTarget.blocks;
            let block = lookup.getBlock(blockId);
            if (!block) {
                lookup = vm.runtime.flyoutBlocks;
                block = lookup.getBlock(blockId);
            }
            const objectInput = block && block.inputs && block.inputs.OBJECT;
            if (!objectInput) return spriteOptions;
            if (objectInput.shadow !== objectInput.block) {
                return stageOptions.concat(variableItems(stageTarget, false));
            }
            const menuBlock = lookup.getBlock(objectInput.shadow);
            const selected = menuBlock && menuBlock.fields.OBJECT && menuBlock.fields.OBJECT.value;
            if (!selected || selected === '_stage_') {
                return stageOptions.concat(variableItems(stageTarget, false));
            }
            return spriteOptions.concat(variableItems(vm.runtime.getSpriteTargetByName(selected), true));
        };
        this.jsonInit({
            message0: msg('CT_PM_SENSING_SETOF', 'set %1 of %2 to %3'),
            args0: [
                {type: 'field_dropdown', name: 'PROPERTY', options: menuFn},
                {type: 'input_value', name: 'OBJECT'},
                {type: 'input_value', name: 'VALUE'}
            ],
            category: ScratchBlocks.Categories.sensing,
            extensions: ['colours_sensing', 'shape_statement']
        });
    };
};

export default defineCtPmMenus;
