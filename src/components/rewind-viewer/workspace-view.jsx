import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';

import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';
import defineDynamicBlock from '../../lib/define-dynamic-block';
import {injectExtensionBlockTheme} from '../../lib/themes/blockHelpers';
import {BLOCKS_DEFAULT_SCALE} from '../../lib/layout-constants';

import styles from './rewind-viewer.css';

class RewindWorkspace extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['setDiv', 'handleExtensionAdded']);
        this.workspace = null;
        this.ScratchBlocks = null;
        this.pending = null;
        this.glowing = null;
    }
    componentDidMount () {
        this.mounted = true;
        if (this.props.displayVm) this.props.displayVm.on('EXTENSION_ADDED', this.handleExtensionAdded);
        LazyScratchBlocks.load().then(() => {
            if (!this.mounted) return;
            this.ScratchBlocks = LazyScratchBlocks.get();
            this.inject();
            if (this.pending) {
                const p = this.pending;
                this.pending = null;
                this.setContent(p.xml, p.opts);
            }
        });
    }
    componentWillUnmount () {
        this.mounted = false;
        if (this.props.displayVm) this.props.displayVm.removeListener('EXTENSION_ADDED', this.handleExtensionAdded);
        if (this.workspace) {
            const SB = this.ScratchBlocks;
            const main = SB.mainWorkspace;
            try {
                this.workspace.dispose();
            } catch (e) {
                // ignore
            }
            if (main !== this.workspace) SB.mainWorkspace = main;
            this.workspace = null;
        }
    }
    setDiv (el) {
        this.div = el;
    }
    inject () {
        const SB = this.ScratchBlocks;
        const theme = this.props.theme;
        const previousMain = SB.mainWorkspace;
        try {
            this.workspace = SB.inject(this.div, {
                readOnly: true,
                media: this.props.media,
                rtl: this.props.isRtl,
                zoom: {controls: true, wheel: true, startScale: BLOCKS_DEFAULT_SCALE},
                grid: {spacing: 40, length: 2, colour: theme ? theme.getBlockColors().gridColor : '#ddd'},
                colours: theme ? theme.getBlockColors() : undefined, // eslint-disable-line no-undefined
                comments: true,
                collapse: false,
                sounds: false,
                scrollbars: true
            });
        } finally {
            SB.mainWorkspace = previousMain;
        }
        this.workspace.markFocused = function () {
            this.setBrowserFocus();
        };
    }
    /**
     * @param {object} categoryInfo extension category info
     */
    handleExtensionAdded (categoryInfo) {
        const SB = this.ScratchBlocks || (LazyScratchBlocks.isLoaded() ? LazyScratchBlocks.get() : null);
        if (!SB) return;
        const theme = this.props.theme;
        const define = list => {
            if (!list || !list.length) return;
            const json = [];
            list.forEach(blockInfo => {
                if (blockInfo.info && blockInfo.info.isDynamic) {
                    const opcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
                    if (!SB.Blocks[opcode]) {
                        SB.Blocks[opcode] = defineDynamicBlock(SB, categoryInfo, blockInfo, opcode, theme);
                    }
                } else if (blockInfo.json && !SB.Blocks[blockInfo.json.type]) {
                    json.push(theme ? injectExtensionBlockTheme(blockInfo.json, theme) : blockInfo.json);
                }
            });
            if (json.length) SB.defineBlocksWithJsonArray(json);
        };
        define(Object.getOwnPropertyNames(categoryInfo.customFieldTypes || {})
            .map(name => categoryInfo.customFieldTypes[name].scratchBlocksDefinition));
        define(categoryInfo.menus);
        define(categoryInfo.blocks);
    }
    /**
     * @param {Iterable<string>} opcodes opcodes in the content about to be shown
     */
    ensureDefinitions (opcodes) {
        const SB = this.ScratchBlocks;
        const vm = this.props.displayVm;
        if (!SB || !vm) return;
        const em = vm.extensionManager;
        for (const opcode of opcodes) {
            if (SB.Blocks[opcode]) continue;
            const id = opcode.split('_')[0];
            try {
                if (em.isBuiltinExtension(id) && !em.isExtensionLoaded(id)) em.loadExtensionIdSync(id);
            } catch (e) {
                // ignore
            }
        }
    }
    /**
     * @param {string} xml workspace xml
     * @param {object} [opts] options
     */
    setContent (xml, opts = {}) {
        if (!this.workspace) {
            this.pending = {xml, opts};
            return;
        }
        const SB = this.ScratchBlocks;
        const ws = this.workspace;
        if (opts.opcodes) this.ensureDefinitions(opts.opcodes);
        const view = {scrollX: ws.scrollX, scrollY: ws.scrollY, scale: ws.scale};
        const previousMain = SB.mainWorkspace;
        SB.Events.disable();
        try {
            ws.clear();
            const dom = SB.Xml.textToDom(xml);
            try {
                SB.Xml.domToWorkspace(dom, ws);
            } catch (e) {
                ws.clear();
                for (const child of Array.from(dom.childNodes)) {
                    const tag = child.nodeName && child.nodeName.toLowerCase();
                    try {
                        if (tag === 'variables') SB.Xml.domToVariables(child, ws);
                        else if (tag === 'block') SB.Xml.domToBlock(child, ws);
                    } catch (err) {
                        // skip this script
                    }
                }
            }
        } finally {
            SB.Events.enable();
            SB.mainWorkspace = previousMain;
        }
        if (opts.keepView) {
            ws.scrollX = view.scrollX;
            ws.scrollY = view.scrollY;
            ws.scale = view.scale;
            ws.resize();
        }
        this.glowing = null;
        const marked = this.mark(opts.marks);
        if (opts.center && ws.getBlockById(opts.center)) {
            const block = ws.getBlockById(opts.center);
            const root = block.getRootBlock ? block.getRootBlock() : block;
            try {
                if (!opts.keepView) ws.centerOnBlock(marked ? block.id : root.id);
                if (!marked) {
                    ws.glowStack(root.id, true);
                    this.glowing = root.id;
                }
            } catch (e) {
                // not on screen yet
            }
        } else if (!opts.keepView) {
            try {
                ws.scrollCenter();
            } catch (e) {
                // empty workspace
            }
        }
    }
    /**
     * Mark what changed.
     * @param {?object} marks {outline: [id], flash: [{id, name}], ghost: [id]}
     * @returns {boolean} true if anything was marked
     */
    mark (marks) {
        if (!marks) return false;
        const ws = this.workspace;
        let any = false;
        const addClass = (el, cls) => {
            if (!el) return;
            el.classList.add(cls);
            any = true;
        };
        const ownFields = block => {
            const out = [];
            for (const input of block.inputList || []) for (const f of input.fieldRow) out.push(f);
            return out;
        };
        for (const id of marks.outline || []) {
            const block = ws.getBlockById(id);
            if (block) addClass(block.svgPath_, styles.changedBlock);
        }
        for (const {id, name} of marks.flash || []) {
            const block = ws.getBlockById(id);
            if (!block) continue;
            if (block.isShadow()) {
                addClass(block.svgPath_, styles.changedField);
                continue;
            }
            const field = block.getField(name);
            addClass(field && field.fieldGroup_, styles.changedField);
        }
        for (const id of marks.ghost || []) {
            const block = ws.getBlockById(id);
            if (!block) continue;
            addClass(block.svgPath_, styles.removedBlock);
            for (const f of ownFields(block)) addClass(f.fieldGroup_, styles.removedBlock);
        }
        return any;
    }
    /**
     * @param {string} id a block shown now
     * @returns {?string} how the block reads
     */
    blockText (id) {
        const ws = this.workspace;
        let block = ws && ws.getBlockById(id);
        if (block && block.isShadow() && block.getParent()) block = block.getParent();
        if (!block) return null;
        try {
            return block.toString(40);
        } catch (e) {
            return null;
        }
    }
    resize () {
        if (this.workspace && this.ScratchBlocks) this.ScratchBlocks.svgResize(this.workspace);
    }
    render () {
        return (
            <div
                className={styles.workspace}
                data-testid="rewind-workspace"
                ref={this.setDiv}
            />
        );
    }
}

RewindWorkspace.propTypes = {
    displayVm: PropTypes.shape({
        on: PropTypes.func,
        removeListener: PropTypes.func,
        extensionManager: PropTypes.object
    }),
    isRtl: PropTypes.bool,
    media: PropTypes.string.isRequired,
    theme: PropTypes.shape({getBlockColors: PropTypes.func})
};

export default RewindWorkspace;
