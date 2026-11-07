const COLUMN_TOLERANCE = 256;
const LEFT = 48;
const TOP = 64;
const ROW_GAP = 72;
const COLUMN_GAP = 96;

/**
 * Put every block comment next to its block.
 * @param {object} workspace the Blockly workspace
 * @returns {object} root block id -> width including its comments
 */
const placeComments = workspace => {
    const widths = {};
    for (const comment of workspace.getTopComments()) {
        if (!comment.setVisible || !comment.block_ || !comment.block_.rendered) continue;
        try {
            comment.setVisible(false);
            comment.needsAutoPositioning_ = true;
            comment.setVisible(true);
            const right = comment.getBoundingRectangle().bottomRight.x;
            const root = comment.block_.getRootBlock();
            const left = root.getBoundingRectangle().topLeft.x;
            widths[root.id] = Math.max(right - left, widths[root.id] || 0);
        } catch (e) {
            // ignore
        }
    }
    return widths;
};

/**
 * @param {object} workspace the Blockly workspace
 * @returns {Array<Array<object>>} top blocks in columns, left to right, each top to bottom
 */
const columnsOf = workspace => {
    const columns = [];
    for (const block of workspace.getTopBlocks()) {
        const {x} = block.getRelativeToSurfaceXY();
        let best = null;
        let bestError = COLUMN_TOLERANCE;
        for (const column of columns) {
            const error = Math.abs(x - column.x);
            if (error < bestError) {
                bestError = error;
                best = column;
            }
        }
        if (best) {
            best.x = ((best.x * best.blocks.length) + x) / (best.blocks.length + 1);
            best.blocks.push(block);
        } else {
            columns.push({x, blocks: [block]});
        }
    }
    columns.sort((a, b) => a.x - b.x);
    for (const column of columns) {
        column.blocks.sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
    }
    return columns.map(column => column.blocks);
};

/**
 * @param {object} workspace the Blockly workspace, rendered
 */
const layoutImportedScripts = workspace => {
    const widths = placeComments(workspace);
    let cursorX = LEFT;
    for (const column of columnsOf(workspace)) {
        let cursorY = TOP;
        let columnWidth = 0;
        for (const block of column) {
            const xy = block.getRelativeToSurfaceXY();
            if (cursorX !== xy.x || cursorY !== xy.y) block.moveBy(cursorX - xy.x, cursorY - xy.y);
            const size = block.getHeightWidth();
            cursorY += size.height + ROW_GAP;
            columnWidth = Math.max(columnWidth, size.width, widths[block.id] || 0);
        }
        cursorX += columnWidth + COLUMN_GAP;
    }
    placeComments(workspace);
};

export default layoutImportedScripts;
