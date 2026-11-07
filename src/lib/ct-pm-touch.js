/**
 * Advanced blocks.
 */

/**
 * @param {function(): ?VirtualMachine} getVm returns the VM
 * @param {function(): ?DOMRect} getRect returns the stage canvas' bounding rectangle
 * @returns {{start: Function, move: Function, end: Function}} event listeners
 */
export const createTouchForwarder = (getVm, getRect) => {
    const post = (e, isDown) => {
        const vm = getVm();
        const rect = getRect();
        if (!vm || !rect || !e.changedTouches) return;
        const changedTouches = [];
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            changedTouches.push({identifier: t.identifier, x: t.clientX - rect.left, y: t.clientY - rect.top});
        }
        const data = {canvasWidth: rect.width, canvasHeight: rect.height, changedTouches};
        if (typeof isDown === 'boolean') data.isDown = isDown;
        vm.postIOData('touch', data);
    };
    return {
        start: e => post(e, true),
        move: e => post(e),
        end: e => post(e, false)
    };
};
