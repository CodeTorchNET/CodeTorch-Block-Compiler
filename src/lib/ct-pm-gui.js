import ctPm from 'scratch-vm/src/ct-pm';
import {noteRefusedExtension} from './ct-extension-restrictions.js';
import {isAdvancedBlocksAllowed} from './ct-url-flags.js';

const REFRESH_DELAY = 150;

export const classifyExtension = id => ctPm.classifyExtension(id);
export {isAdvancedBlocksAllowed};

/**
 * Whether the editor should offer Advanced blocks right now.
 * @param {VirtualMachine} vm the VM
 * @returns {boolean} true if the palette should show them
 */
export const isAdvancedBlocksOffered = vm => !!(vm && vm.runtime.ctPm && isAdvancedBlocksAllowed() &&
    vm.runtime.ctPm.effective.advanced);

/**
 * Whether the extension library should offer the extra.
 * @param {VirtualMachine} vm the VM
 * @returns {boolean} true if they should be offered
 */
export const isExtensionsOffered = vm => !!(vm && vm.runtime.ctPm && isAdvancedBlocksAllowed() &&
    vm.runtime.ctPm.effective.extensions);

/**
 * @param {VirtualMachine} vm the VM
 * @returns {function(): void} uninstall
 */
export const installCtPm = vm => {
    const runtime = vm.runtime;
    if (!runtime.ctPm) return () => {};
    let timer = null;
    const refreshSoon = () => {
        if (timer !== null) return;
        timer = setTimeout(() => {
            timer = null;
            runtime.ctPm.refresh();
        }, REFRESH_DELAY);
    };
    const onLoaded = () => {
        runtime.ctPm.refresh();
        if (ctPm.unsafeOpcodesUsed(runtime).length) {
            noteRefusedExtension({id: 'javascript', placeholder: true, reason: 'unsafeBlocks'});
        }
    };
    const onUncaught = ({target, message}) => {
        // eslint-disable-next-line no-console
        console.warn(`Uncaught error in a script of ${target && target.getName ? target.getName() : '?'}: ${message}`);
    };
    vm.on('PROJECT_CHANGED', refreshSoon);
    runtime.on('CT_PM_REMOTE_APPLIED', refreshSoon);
    runtime.on('PROJECT_LOADED', onLoaded);
    runtime.on('CT_PM_UNCAUGHT_ERROR', onUncaught);
    return () => {
        if (timer !== null) clearTimeout(timer);
        vm.off('PROJECT_CHANGED', refreshSoon);
        runtime.off('CT_PM_REMOTE_APPLIED', refreshSoon);
        runtime.off('PROJECT_LOADED', onLoaded);
        runtime.off('CT_PM_UNCAUGHT_ERROR', onUncaught);
    };
};
