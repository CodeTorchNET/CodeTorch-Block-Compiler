// helpers/collaboration-ui.js

import * as constants from './constants.js';
import * as helper from './helper.js';

// --- UI Related Constants ---
/**
 * Throttle rate for updating remote cursor positions (in milliseconds).
 * This prevents excessive updates and improves performance.
 */
export const CURSOR_UPDATE_THROTTLE_MS = 50;
/**
 * Timeout duration for chat messages (in milliseconds).
 * A chat message will disappear after this period of inactivity.
 */
export const CHAT_MESSAGE_TIMEOUT_MS = 3000; // 3 seconds

// --- SVG Cursor and Text Styling Constants ---
const CURSOR_SVG_VIEWBOX = '0 0 24 24'; // Viewbox for the cursor SVG icon.
const CURSOR_SVG_PATH = 'm2.5 2.5 4.41875 10.625 1.5687499999999999 -4.6187499999999995L13.125 6.91875z'; // SVG path data for the cursor icon.
const CURSOR_WIDTH = 50;  // Display width of the cursor.
const CURSOR_HEIGHT = 50; // Display height of the cursor.
/**
 * The ID for the main SVG group element that contains all collaboration UI overlays (cursors, chat bubbles).
 */
export const COLLABORATION_LAYER_ID = 'collaboration-overlay-group';

const NAME_FONT_SIZE = 16;     // Font size for collaborator names.
const NAME_FONT_WEIGHT = 'normal';
const NAME_TEXT_FILL = '#FFFFFF'; // Text color for names (white).
const NAME_TEXT_STROKE = '#FFFFFF'; // Stroke color for name text (white for outline).
const NAME_TEXT_STROKE_WIDTH = 0.5; // Stroke thickness for name text.
const NAME_BG_ROUNDING = 15;   // Corner radius for the name tag background.
const NAME_BG_OPACITY = 0.85;  // Opacity of the name tag background.
const NAME_BG_PADDING_X = 15;  // Horizontal padding for name tag background.
const NAME_BG_PADDING_Y = 15;  // Vertical padding for name tag background.

const CHAT_FONT_SIZE = 16;     // Font size for chat messages.
const CHAT_FONT_WEIGHT = 'normal';
const CHAT_TEXT_FILL = '#FFFFFF'; // Text color for remote chat messages (white).
const CHAT_BUBBLE_FILL = 'rgba(240, 240, 240, 0.9)'; // Background color for local chat bubbles (light grey).
const CHAT_BUBBLE_OPACITY = 0.85; // Opacity for remote chat bubbles.
const CHAT_BUBBLE_STROKE = '#AAAAAA'; // Border color for chat bubbles.
const CHAT_BUBBLE_STROKE_WIDTH = 1.5; // Border thickness for chat bubbles.
const CHAT_BUBBLE_ROUNDING = 20; // Corner radius for chat bubbles.
const CHAT_PADDING = 15;       // Padding inside chat bubbles.
const CHAT_MAX_WIDTH = 200;    // Maximum width for chat bubbles before text wraps.

const CURSOR_STROKE = '#FFFFFF';     // Border color for the cursor icon.
const CURSOR_STROKE_WIDTH = 0.5; // Border thickness for the cursor icon.

// --- Shadow Styling Constants (for SVG elements) ---
const SHADOW_OFFSET_X = '1px';
const SHADOW_OFFSET_Y = '1px';
const SHADOW_BLUR = '2px';
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.35)'; // Semi-transparent black shadow for cursors and names.
const CHAT_SHADOW_BLUR = '3px'; // Slightly larger blur for chat bubbles.
const CHAT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)'; // Slightly darker shadow for chat bubbles.

// --- Positional Offsets for UI Elements Relative to Cursor ---
const NAME_X_OFFSET = 63; // X-offset for the name tag.
const NAME_Y_OFFSET = 45; // Y-offset for the name tag.
const CHAT_X_OFFSET = 15; // X-offset for the chat bubble.
const CHAT_Y_OFFSET = 30; // Y-offset for the chat bubble.

/**
 * The SVG XML Namespace URI. Essential for creating SVG elements correctly.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A Map to store references to remote collaborator cursor and chat SVG elements.
 * Key: clientID (Yjs client ID)
 * Value: An object containing references to the SVG elements (`group`, `cursorPath`, `nameText`, `nameBg`, `chatGroup`, `chatRect`, `chatText`)
 * and the user's data (`user`).
 */
const cursorElements = new Map();

/**
 * An object to store references to the local user's chat bubble SVG elements.
 */
let localChatElements = {
    group: null, // The main SVG group for the local chat bubble.
    rect: null,  // The SVG rectangle for the chat bubble background.
    text: null   // The SVG text element for the chat message.
};

/**
 * Generates a random hexadecimal color string.
 * @returns {string} A random color string (e.g., "#RRGGBB").
 */
export function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

/**
 * Basic sanitization for text to prevent simple HTML injection.
 * Converts special characters into their HTML entities.
 * @param {string} text - The input text to sanitize.
 * @returns {string} The sanitized text.
 */
function sanitizeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Updates the content, size, and visibility of a chat bubble SVG element.
 * This function is used internally for both local and remote chat bubbles.
 * Handles text wrapping and positioning of the background rectangle.
 * @param {SVGGElement} chatGroup - The SVG group element containing the chat bubble.
 * @param {SVGRectElement} chatRect - The SVG rectangle element for the chat bubble background.
 * @param {SVGTextElement} chatText - The SVG text element for the chat message.
 * @param {string} message - The chat message to display.
 * @param {object} user - The user object containing `name` and `color`.
 * @param {boolean} [isLocal=false] - True if this is the local user's chat bubble, false for remote.
 */
function updateChatBubbleSVG(chatGroup, chatRect, chatText, message, user, isLocal = false) {
    if (!chatGroup || !chatRect || !chatText) return;

    // Only display the bubble if there's a non-empty message.
    if (message && typeof message === 'string' && message.trim() !== '') {
        const sanitizedMessage = sanitizeText(message);
        // Prefix remote messages with the user's name. Local messages do not need this.
        const displayText = isLocal ? sanitizedMessage : `${user?.name || 'User'}: ${sanitizedMessage}`;

        chatText.textContent = displayText; // Set initial text content.
        chatGroup.style.display = 'block'; // Ensure the chat group is visible.

        let textWidth = 0;
        let textHeight = 0;
        const lines = []; // Array to hold lines for word wrapping.

        // Attempt to get accurate text dimensions using `getBBox()`.
        let bbox = null;
        try {
            if (chatText.isConnected && chatText.ownerSVGElement?.isConnected) {
                bbox = chatText.getBBox();
                if (bbox && bbox.width >= 0 && bbox.height >= 0) {
                    textWidth = bbox.width;
                    textHeight = bbox.height;

                    // Simple word wrapping logic.
                    if (textWidth > CHAT_MAX_WIDTH) {
                        const words = displayText.split(' ');
                        let currentLine = '';
                        chatText.textContent = ''; // Clear existing content to rebuild with tspans.

                        words.forEach(word => {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            chatText.textContent = testLine; // Temporarily set to measure.
                            let currentLineWidth = 0;
                            try {
                                if (chatText.isConnected && chatText.ownerSVGElement?.isConnected) {
                                    currentLineWidth = chatText.getBBox().width;
                                } else {
                                    currentLineWidth = testLine.length * CHAT_FONT_SIZE * 0.6; // Fallback estimate.
                                }
                            } catch (e) { /* Ignore error during measurement. */ }

                            if (currentLineWidth > CHAT_MAX_WIDTH && currentLine !== '') {
                                lines.push(currentLine); // Add the complete line.
                                currentLine = word; // Start a new line with the current word.
                            } else {
                                currentLine = testLine; // Continue adding to the current line.
                            }
                        });
                        lines.push(currentLine); // Add the last remaining line.

                        chatText.textContent = ''; // Clear again before creating tspans.
                        let cumulativeHeight = 0;
                        let maxWidth = 0;
                        lines.forEach((line, index) => {
                            const tspan = document.createElementNS(SVG_NS, 'tspan');
                            tspan.textContent = line;
                            tspan.setAttribute('x', CHAT_PADDING.toString()); // Position each line horizontally with padding.
                            tspan.setAttribute('dy', index === 0 ? '0' : `${CHAT_FONT_SIZE * 1.2}px`); // Vertical spacing between lines.
                            chatText.appendChild(tspan);
                            try {
                                if (tspan.isConnected && tspan.ownerSVGElement?.isConnected) {
                                    maxWidth = Math.max(maxWidth, tspan.getComputedTextLength()); // More accurate line width.
                                } else {
                                    maxWidth = Math.max(maxWidth, line.length * CHAT_FONT_SIZE * 0.6); // Estimate.
                                }
                            } catch (e) { /* Ignore error. */ }
                            cumulativeHeight += (index === 0 ? CHAT_FONT_SIZE : CHAT_FONT_SIZE * 1.2);
                        });
                        textWidth = maxWidth; // Use the maximum measured line width.
                        textHeight = Math.max(CHAT_FONT_SIZE, cumulativeHeight); // Use calculated total height.
                    } else {
                        // Single line, no wrapping needed.
                        chatText.textContent = displayText;
                        // Remove any existing tspans if they were from a previous multi-line state.
                        while (chatText.firstChild) { chatText.removeChild(chatText.firstChild); }
                        chatText.textContent = displayText; // Ensure text content is directly set.
                    }

                } else {
                    // Fallback estimate if `getBBox()` returns invalid dimensions.
                    textWidth = Math.min(CHAT_MAX_WIDTH, displayText.length * CHAT_FONT_SIZE * 0.6);
                    textHeight = CHAT_FONT_SIZE * 1.2;
                }
            } else {
                // Fallback estimate if `chatText` is not connected to the DOM for `getBBox()`.
                textWidth = Math.min(CHAT_MAX_WIDTH, displayText.length * CHAT_FONT_SIZE * 0.6);
                textHeight = CHAT_FONT_SIZE * 1.2;
            }
        } catch (e) {
            // Fallback estimate if `getBBox()` throws an error.
            textWidth = Math.min(CHAT_MAX_WIDTH, displayText.length * CHAT_FONT_SIZE * 0.6);
            textHeight = CHAT_FONT_SIZE * 1.2;
        }

        // Set the dimensions of the background rectangle based on text size and padding.
        const rectWidth = textWidth + CHAT_PADDING * 2;
        const rectHeight = textHeight + CHAT_PADDING * 2;
        chatRect.setAttribute('width', rectWidth.toString());
        chatRect.setAttribute('height', rectHeight.toString());
        chatRect.setAttribute('x', '0'); // Position relative to the group's origin.
        chatRect.setAttribute('y', '0'); // Position relative to the group's origin.

        // Position the text inside the rectangle with padding.
        if (lines.length <= 1) {
            // For single-line text, clear tspans and position text directly.
            while (chatText.firstChild) { chatText.removeChild(chatText.firstChild); }
            chatText.textContent = displayText;
            chatText.setAttribute('x', CHAT_PADDING.toString());
            chatText.setAttribute('y', CHAT_PADDING.toString());
            chatText.removeAttribute('dy');
        } else {
            // For multi-line text (tspans already created), set the base position of the text element.
            chatText.setAttribute('x', '0');
            chatText.setAttribute('y', CHAT_PADDING.toString());
        }

        chatGroup.style.display = 'block'; // Ensure the group remains visible.

    } else {
        // If there's no message, hide the chat bubble.
        chatGroup.style.display = 'none';
        chatText.textContent = '';
        while (chatText.firstChild) { chatText.removeChild(chatText.firstChild); } // Clear any tspans.
        chatRect.setAttribute('width', '0');
        chatRect.setAttribute('height', '0');
    }
}

/**
 * Creates the SVG elements for the local user's chat bubble and appends them to the collaboration layer.
 * This function should only be called once to initialize these elements.
 * @param {SVGGElement} layer - The main SVG group element for collaboration overlays.
 * @returns {object|null} An object containing references to the created SVG elements (`group`, `rect`, `text`), or null if `layer` is invalid.
 */
export function createLocalChatElements(layer) {
    if (!layer) return null;

    // Create the main SVG group for the local chat bubble.
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'collaborative-chat-bubble local-chat-bubble');
    group.style.display = 'none'; // Initially hidden.
    group.style.pointerEvents = 'none'; // Non-interactive.
    group.style.fontSize = `${CHAT_FONT_SIZE}px`;
    group.style.fontFamily = 'sans-serif';
    group.style.fontWeight = CHAT_FONT_WEIGHT;

    // Create the SVG rectangle for the chat bubble background.
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('rx', CHAT_BUBBLE_ROUNDING.toString());
    rect.setAttribute('ry', CHAT_BUBBLE_ROUNDING.toString());
    rect.setAttribute('fill', CHAT_BUBBLE_FILL); // Use specific fill for local bubble.
    rect.setAttribute('stroke', CHAT_BUBBLE_STROKE);
    rect.setAttribute('stroke-width', CHAT_BUBBLE_STROKE_WIDTH.toString());

    // Create the SVG text element for the chat message.
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('fill', "#333333"); // Dark text for local bubble for contrast.
    text.setAttribute('dominant-baseline', 'text-before-edge'); // Align text to the top edge.
    text.setAttribute('dy', '0');

    group.appendChild(rect);
    group.appendChild(text);
    layer.appendChild(group); // Append the group to the main collaboration layer.

    // Store references to these elements.
    localChatElements = { group, rect, text };
    console.log("Local SVG chat bubble elements created and appended to collaboration layer.");
    return localChatElements;
}

/**
 * Updates the position and content of the local user's chat bubble.
 * @param {string} message - The message to display in the chat bubble.
 * @param {object} user - The local user's information.
 * @param {{x: number, y: number}} position - The screen coordinates for the chat bubble's position.
 */
export function updateLocalChat(message, user, position) {
    if (!localChatElements.group || !user) return;

    if (message && position) {
        // Calculate the bubble's position relative to the cursor.
        const bubbleX = position.x + CHAT_X_OFFSET;
        const bubbleY = position.y + CHAT_Y_OFFSET;
        localChatElements.group.setAttribute('transform', `translate(${bubbleX}, ${bubbleY})`);
        // Update the bubble's content and appearance using the helper function.
        updateChatBubbleSVG(localChatElements.group, localChatElements.rect, localChatElements.text, message, user, true); // `true` for isLocal.
        localChatElements.group.style.display = 'block'; // Ensure visibility.
    } else {
        localChatElements.group.style.display = 'none'; // Hide if no message or position.
    }
}

/**
 * Sets the visibility of the local user's chat bubble.
 * @param {boolean} visible - True to show, false to hide.
 */
export function setLocalChatVisibility(visible) {
    if (localChatElements.group) {
        localChatElements.group.style.display = visible ? 'block' : 'none';
    }
}

/**
 * Creates or updates the SVG elements for a remote collaborator's cursor and chat bubble.
 * This function handles both initial creation and subsequent updates based on awareness state changes.
 * @param {number} clientID - The Yjs client ID of the remote collaborator.
 * @param {object} state - The awareness state object for the remote collaborator.
 * @param {SVGGElement} layer - The main SVG group element for collaboration overlays.
 * @param {boolean} [debugging=false] - True to enable verbose logging for this function.
 */
export function createOrUpdateRemoteCursor(clientID, state, layer, debugging = false) {
    if (!layer) return;

    const user = state.user;
    const remoteCursorPos = state.cursor;
    const remoteChatMessage = state.chatMessage;

    let cursorData = cursorElements.get(clientID);

    // --- Handle Cursor Position and Creation/Update ---
    if (remoteCursorPos && user && typeof remoteCursorPos.x === 'number' && typeof remoteCursorPos.y === 'number') {
        const remoteX = remoteCursorPos.x;
        const remoteY = remoteCursorPos.y;

        if (!cursorData) {
            // --- Create new SVG cursor group if it doesn't exist ---
            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('class', 'collaborative-cursor');
            group.style.pointerEvents = 'none'; // Make it non-interactive.
            group.style.transition = 'transform 0.05s linear'; // Smooth transition for cursor movement.
            group.style.willChange = 'transform'; // Optimize for transform changes.

            // Cursor Icon SVG element.
            const cursorSvg = document.createElementNS(SVG_NS, 'svg');
            cursorSvg.setAttribute('width', CURSOR_WIDTH.toString());
            cursorSvg.setAttribute('height', CURSOR_HEIGHT.toString());
            cursorSvg.setAttribute('viewBox', CURSOR_SVG_VIEWBOX);
            cursorSvg.style.overflow = 'visible'; // Important for shadow visibility.

            // Cursor Path (the actual cursor shape).
            const cursorPath = document.createElementNS(SVG_NS, 'path');
            cursorPath.setAttribute('d', CURSOR_SVG_PATH);
            cursorPath.setAttribute('fill', user.color || '#ff0000'); // Fill with user's color.
            cursorPath.setAttribute('stroke', CURSOR_STROKE);
            cursorPath.setAttribute('stroke-width', CURSOR_STROKE_WIDTH.toString());
            cursorPath.style.transformOrigin = 'center center';
            cursorSvg.appendChild(cursorPath);

            // Name Tag Text element.
            const nameText = document.createElementNS(SVG_NS, 'text');
            nameText.setAttribute('class', 'collaborative-cursor-name');
            nameText.setAttribute('x', '0');
            nameText.setAttribute('y', '0');
            nameText.setAttribute('fill', NAME_TEXT_FILL);
            nameText.setAttribute('font-size', `${NAME_FONT_SIZE}px`);
            nameText.setAttribute('font-family', 'sans-serif');
            nameText.setAttribute('font-weight', NAME_FONT_WEIGHT);
            nameText.setAttribute('text-anchor', 'middle'); // Center text horizontally.
            nameText.setAttribute('dominant-baseline', 'central'); // Center text vertically.
            nameText.textContent = user.name || `User ${clientID.toString().substring(0, 4)}`; // Display user's name or a fallback.

            // Background rectangle for the name tag.
            const nameBg = document.createElementNS(SVG_NS, 'rect');
            nameBg.setAttribute('class', 'collaborative-cursor-name-bg');
            nameBg.setAttribute('fill', user.color || '#ff0000'); // Fill with user's color.
            nameBg.setAttribute('fill-opacity', NAME_BG_OPACITY.toString());
            nameBg.setAttribute('rx', NAME_BG_ROUNDING.toString());
            nameBg.setAttribute('ry', NAME_BG_ROUNDING.toString());

            // Chat Bubble Elements (initially hidden).
            const chatGroup = document.createElementNS(SVG_NS, 'g');
            chatGroup.setAttribute('class', 'collaborative-chat-bubble remote-chat-bubble');
            chatGroup.style.display = 'none'; // Initially hidden.
            chatGroup.style.pointerEvents = 'none';
            chatGroup.style.fontSize = `${CHAT_FONT_SIZE}px`;
            chatGroup.style.fontFamily = 'sans-serif';
            chatGroup.style.fontWeight = CHAT_FONT_WEIGHT;
            chatGroup.setAttribute('transform', `translate(${CHAT_X_OFFSET}, ${CHAT_Y_OFFSET})`); // Position relative to cursor.

            const chatRect = document.createElementNS(SVG_NS, 'rect');
            chatRect.setAttribute('rx', CHAT_BUBBLE_ROUNDING.toString());
            chatRect.setAttribute('ry', CHAT_BUBBLE_ROUNDING.toString());
            chatRect.setAttribute('fill', user.color || '#ff0000'); // Use user's color for remote bubble background.
            chatRect.setAttribute('fill-opacity', CHAT_BUBBLE_OPACITY.toString());
            chatRect.setAttribute('stroke', CHAT_BUBBLE_STROKE);
            chatRect.setAttribute('stroke-width', CHAT_BUBBLE_STROKE_WIDTH.toString());

            const chatText = document.createElementNS(SVG_NS, 'text');
            chatText.setAttribute('fill', CHAT_TEXT_FILL); // White text for colored remote bubble.
            chatText.setAttribute('dominant-baseline', 'text-before-edge');
            chatText.setAttribute('dy', '0');

            chatGroup.appendChild(chatRect);
            chatGroup.appendChild(chatText);

            // Append all elements to the main cursor group in layering order.
            group.appendChild(cursorSvg);
            group.appendChild(nameBg);
            group.appendChild(nameText);
            group.appendChild(chatGroup);

            layer.appendChild(group); // Append the cursor group to the main collaboration layer.

            // Calculate name background size after elements are in the DOM (for accurate `getBBox()`).
            try {
                let nameBox = null;
                if (nameText.isConnected && nameText.ownerSVGElement?.isConnected) {
                    nameBox = nameText.getBBox();
                }

                if (nameBox && nameBox.width > 0 && nameBox.height > 0) {
                    nameBg.setAttribute('width', (nameBox.width + NAME_BG_PADDING_X * 2).toString());
                    nameBg.setAttribute('height', (nameBox.height + NAME_BG_PADDING_Y * 2).toString());
                    nameBg.setAttribute('x', (-(nameBox.width / 2 + NAME_BG_PADDING_X)).toString());
                    nameBg.setAttribute('y', (-(nameBox.height / 2 + NAME_BG_PADDING_Y)).toString());
                    // Apply offsets to text and background.
                    nameText.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                    nameBg.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                } else {
                    console.warn("Couldn't get valid BBox for name text on create, estimating size.", nameBox);
                    const estWidth = (user.name || `User ${clientID.toString().substring(0, 4)}`).length * NAME_FONT_SIZE * 0.6;
                    const estHeight = NAME_FONT_SIZE;
                    nameBg.setAttribute('width', (estWidth + NAME_BG_PADDING_X * 2).toString());
                    nameBg.setAttribute('height', (estHeight + NAME_BG_PADDING_Y * 2).toString());
                    nameBg.setAttribute('x', (-(estWidth / 2 + NAME_BG_PADDING_X)).toString());
                    nameBg.setAttribute('y', (-(estHeight / 2 + NAME_BG_PADDING_Y)).toString());
                    nameText.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                    nameBg.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                }
            } catch (e) { console.warn("Error getting BBox for name text:", e); }

            // Store all references in the `cursorElements` map.
            cursorData = {
                group: group,
                user: { ...user },
                cursorPath: cursorPath,
                nameText: nameText,
                nameBg: nameBg,
                chatGroup: chatGroup,
                chatRect: chatRect,
                chatText: chatText
            };
            cursorElements.set(clientID, cursorData);
            if (debugging) console.log(`Created SVG cursor for ${user.name} in collaboration layer.`);

        } else {
            // --- Update existing cursor element ---
            let nameRecalculateNeeded = false;
            // Update user color and name if they have changed.
            if (cursorData.user.color !== user.color) {
                cursorData.cursorPath.setAttribute('fill', user.color || '#ff0000');
                cursorData.nameBg.setAttribute('fill', user.color || '#ff0000');
                cursorData.chatRect.setAttribute('fill', user.color || '#ff0000');
                cursorData.user.color = user.color;
            }
            if (cursorData.user.name !== user.name) {
                cursorData.nameText.textContent = user.name || `User ${clientID.toString().substring(0, 4)}`;
                cursorData.user.name = user.name;
                nameRecalculateNeeded = true;
            }

            // Recalculate name background size if the name text has changed.
            if (nameRecalculateNeeded) {
                try {
                    let nameBox = null;
                    if (cursorData.nameText.isConnected && cursorData.nameText.ownerSVGElement?.isConnected) {
                        nameBox = cursorData.nameText.getBBox();
                    }
                    if (nameBox && nameBox.width > 0 && nameBox.height > 0) {
                        cursorData.nameBg.setAttribute('width', (nameBox.width + NAME_BG_PADDING_X * 2).toString());
                        cursorData.nameBg.setAttribute('height', (nameBox.height + NAME_BG_PADDING_Y * 2).toString());
                        cursorData.nameBg.setAttribute('x', (-(nameBox.width / 2 + NAME_BG_PADDING_X)).toString());
                        cursorData.nameBg.setAttribute('y', (-(nameBox.height / 2 + NAME_BG_PADDING_Y)).toString());
                    } else {
                        console.warn("Couldn't get valid BBox for name text on update, estimating size.", nameBox);
                    }
                } catch (e) { console.warn("Error getting BBox for name text update:", e); }
            }
        }

        // Apply the cursor's position transform.
        cursorData.group.setAttribute('transform', `translate(${remoteX}, ${remoteY})`);
        cursorData.group.style.display = ''; // Ensure the cursor group is visible.

    } else {
        // If no valid cursor position is provided in the state, hide the cursor.
        if (cursorData) {
            cursorData.group.style.display = 'none';
        }
    }

    // --- Handle Chat Message and Name Visibility ---
    if (cursorData) {
        // Update the chat bubble's content and visibility using the helper function.
        updateChatBubbleSVG(
            cursorData.chatGroup,
            cursorData.chatRect,
            cursorData.chatText,
            remoteChatMessage, // Pass the message string or null.
            user,
            false // `false` for remote.
        );
        // Determine if the chat bubble is currently visible.
        const isChatVisible = remoteChatMessage && typeof remoteChatMessage === 'string' && remoteChatMessage.trim() !== '';

        if (isChatVisible) {
            // If chat is visible, hide the name tag elements.
            cursorData.nameText.style.display = 'none';
            cursorData.nameBg.style.display = 'none';
        } else {
            // If chat is not visible, show the name tag elements.
            cursorData.nameText.style.display = '';
            cursorData.nameBg.style.display = '';
        }
        // If a chat message is present and valid cursor position is available, ensure the main group is visible.
        if (isChatVisible && cursorData.group.style.display === 'none' && remoteCursorPos && typeof remoteCursorPos.x === 'number' && typeof remoteCursorPos.y === 'number') {
            if (debugging) console.log(`Making group visible for ${user.name} due to chat message and valid position.`);
            cursorData.group.style.display = '';
        }
    } else if (remoteChatMessage && debugging) {
        console.log(`Received chat message for ${user?.name || clientID}, but cursor element is missing.`);
    }
}

/**
 * Removes a remote collaborator's cursor and chat elements from the UI.
 * This is typically called when a collaborator disconnects.
 * @param {number} clientID - The Yjs client ID of the collaborator to remove.
 * @param {boolean} [debugging=false] - True to enable verbose logging.
 */
export function removeRemoteCursor(clientID, debugging = false) {
    const cursorData = cursorElements.get(clientID);
    if (cursorData) {
        cursorData.group.remove(); // Remove the entire SVG group from the DOM.
        cursorElements.delete(clientID); // Remove from the map.
        if (debugging) console.log(`Removed SVG cursor & chat for disconnected client ${clientID}`);
    }
}

/**
 * Removes all collaboration UI elements (local chat bubble and all remote cursors) from the DOM.
 * This is typically called during a full cleanup or disconnection.
 */
export function removeAllUI() {
    // Remove all remote cursors.
    cursorElements.forEach(cursorData => cursorData.group.remove());
    cursorElements.clear(); // Clear the map.

    // Remove the local chat bubble.
    if (localChatElements.group) {
        localChatElements.group.remove();
    }
    // Reset local chat elements references.
    localChatElements = { group: null, rect: null, text: null };

    // Remove the main user icon container from the menu bar.
    const userIconContainer = document.getElementById('collaboration-users-container');
    userIconContainer?.remove();
}

/**
 * Clears the local user's chat message and broadcasts this change via Yjs Awareness,
 * effectively hiding the local chat bubble for everyone.
 * Also clears any associated chat message timeout.
 */
export function clearLocalChatMessage() {
    if (constants.mutableRefs.localChatMessage !== '') {
        constants.mutableRefs.localChatMessage = ''; // Clear the local message.
        // Broadcast the null message to awareness to hide it for others.
        constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('chatMessage', null);
        setLocalChatVisibility(false); // Hide the local chat bubble immediately.
        if (constants.debugging) console.log("Collab Chat: Local message cleared.");
    }
    // Clear any pending timeout for the chat message.
    if (constants.mutableRefs.chatMessageTimeoutId) clearTimeout(constants.mutableRefs.chatMessageTimeoutId);
    constants.mutableRefs.chatMessageTimeoutId = null;
}

/**
 * Resets the timeout for the local chat message.
 * This function is called whenever the local chat message is updated,
 * ensuring the message remains visible as long as the user is typing.
 */
function resetChatMessageTimeout() {
    if (constants.mutableRefs.chatMessageTimeoutId) clearTimeout(constants.mutableRefs.chatMessageTimeoutId);
    // Set a new timeout to clear the message after `CHAT_MESSAGE_TIMEOUT_MS`.
    constants.mutableRefs.chatMessageTimeoutId = setTimeout(clearLocalChatMessage, CHAT_MESSAGE_TIMEOUT_MS);
}

/**
 * Global keydown event handler for managing the local chat message.
 * It captures key presses, updates the local chat message, and broadcasts it.
 * It also handles backspace, escape (to clear message), and character input.
 * Chat input is only active when an input field is NOT focused.
 * @param {KeyboardEvent} event - The keyboard event.
 */
export const handleGlobalKeyDown = (event) => {
    // Ensure essential components are available before processing.
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.BlocklyInstance || !constants.mutableRefs.localChatElementsRef?.group || !constants.mutableRefs.currentWorkspaceSvg) return;

    const activeElement = document.activeElement;
    // Check if an input field or content editable element is currently focused.
    const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
    // Check if a Blockly dialog input is focused.
    const isBlocklyInputFocused = activeElement && activeElement.closest('.blocklyDialog') !== null;

    // If any input field is focused, do not process chat input; instead, clear any pending chat message.
    if (isInputFocused || isBlocklyInputFocused) {
        clearLocalChatMessage();
        return;
    }

    // Check if the workspace (or document body/html if nothing else is focused) is active.
    const isWorkspaceFocused = activeElement === document.body || activeElement === document.documentElement || activeElement?.closest('.blocklySvg');
    // If the workspace is not focused, clear any pending chat message.
    if (!isWorkspaceFocused) {
        clearLocalChatMessage();
        return;
    }

    let messageChanged = false;
    // Handle Backspace: remove last character.
    if (event.key === 'Backspace') {
        if (constants.mutableRefs.localChatMessage.length > 0) {
            constants.mutableRefs.localChatMessage = constants.mutableRefs.localChatMessage.slice(0, -1);
            messageChanged = true;
            event.preventDefault(); // Prevent default browser backspace action.
        }
    }
    // Handle Escape: clear the entire message.
    else if (event.key === 'Escape') {
        if (constants.mutableRefs.localChatMessage.length > 0) {
            clearLocalChatMessage();
            event.preventDefault();
        }
    }
    // Handle single character input (excluding control keys).
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Only append printable characters or 'Unidentified' (e.g., some non-latin characters).
        if (event.key >= ' ' || event.key === 'Unidentified') {
            // Limit message length.
            if (constants.mutableRefs.localChatMessage.length < 100) {
                constants.mutableRefs.localChatMessage += event.key;
                messageChanged = true;
                event.preventDefault();
            }
        }
    }

    // If the message has changed, update awareness and reset the display timeout.
    if (messageChanged) {
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('chatMessage', constants.mutableRefs.localChatMessage || null);
        resetChatMessageTimeout(); // Extend the display time for the message.
        // Update the local chat bubble's visual appearance.
        const localState = constants.mutableRefs.yjsAwarenessInstance.getLocalState();
        updateLocalChat(constants.mutableRefs.localChatMessage, constants.localUserInfo, localState?.cursor);
        if (constants.debugging) console.log("Collab Chat Keydown:", constants.mutableRefs.localChatMessage);
    }
};

/**
 * Ensures the main collaboration SVG layer is the last child of its parent,
 * so it renders on top of all other Blockly elements.
 */
export function ensureCollaborationLayerOnTop() {
    if (constants.mutableRefs.collaborationLayerGroup?.parentNode && constants.mutableRefs.collaborationLayerGroup.parentNode.lastChild !== constants.mutableRefs.collaborationLayerGroup) {
        if (constants.debugging) console.log("Collab UI: Moving collaboration layer to top.");
        constants.mutableRefs.collaborationLayerGroup.parentNode.appendChild(constants.mutableRefs.collaborationLayerGroup);
    }
}

/**
 * Sets up or re-initializes the collaboration SVG layer and its associated event listeners.
 * This function handles cases where the Blockly workspace SVG might be re-created (e.g., theme change, full GUI reload),
 * ensuring that all collaboration UI elements are correctly attached and listeners are re-bound.
 */
export function setupCollaborationLayer() {
    if (!constants.mutableRefs.BlocklyInstance) { console.error("Collab UI: Blockly instance missing."); return; }
    const workspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
    if (!workspace) { console.warn("Collab UI: Main workspace not found."); return; }

    const newWorkspaceSvg = workspace.getParentSvg(); // The main <svg> element for Blockly.
    // The <g> element within the main SVG where blocks and other overlays are placed.
    const workspaceGroup = newWorkspaceSvg?.querySelector('.blocklyBlockCanvas');

    if (!newWorkspaceSvg || !workspaceGroup) {
        console.warn("Collab UI: Workspace SVG or blocklyBlockCanvas not found. Performing full UI cleanup.");
        // If essential Blockly elements are missing, clean up all existing UI elements and listeners.
        if (constants.mutableRefs.currentWorkspaceSvg && constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
        if (constants.mutableRefs.currentWorkspaceSvg && constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
        if (constants.mutableRefs.blocklyCanvasObserver) { constants.mutableRefs.blocklyCanvasObserver.disconnect(); constants.mutableRefs.blocklyCanvasObserver = null; }

        if (constants.mutableRefs.collaborationLayerGroup) {
            constants.mutableRefs.collaborationLayerGroup.innerHTML = ''; // Clear all children.
            constants.mutableRefs.collaborationLayerGroup.remove(); // Remove the group from its parent.
        }
        cursorElements.clear(); // Clear the map of remote cursors.
        localChatElements = { group: null, rect: null, text: null }; // Reset local chat references.

        // Reset all mutable references to null.
        constants.mutableRefs.currentWorkspaceSvg = null;
        constants.mutableRefs.collaborationLayerGroup = null;
        constants.mutableRefs.localChatElementsRef = null;
        return;
    }

    // Detect if the main Blockly SVG element has changed.
    // This happens during full GUI reloads or theme changes.
    if (constants.mutableRefs.currentWorkspaceSvg && constants.mutableRefs.currentWorkspaceSvg !== newWorkspaceSvg) {
        console.log("Collab UI: Detected new Blockly SVG element. Performing full collaboration UI re-initialization.");

        // 1. Detach event listeners from the OLD SVG element.
        if (constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
        if (constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);

        // 2. Disconnect the old MutationObserver.
        if (constants.mutableRefs.blocklyCanvasObserver) {
            constants.mutableRefs.blocklyCanvasObserver.disconnect();
            constants.mutableRefs.blocklyCanvasObserver = null;
        }

        // 3. Remove the old collaboration layer group from the DOM if it still exists.
        if (constants.mutableRefs.collaborationLayerGroup) {
            constants.mutableRefs.collaborationLayerGroup.innerHTML = '';
            constants.mutableRefs.collaborationLayerGroup.remove();
        }

        // 4. Crucially, clear the internal map of remote cursor elements.
        cursorElements.clear();

        // 5. Reset local chat elements references.
        localChatElements = { group: null, rect: null, text: null };

        // Reset mutable references that will be re-assigned for the new SVG.
        constants.mutableRefs.collaborationLayerGroup = null;
        constants.mutableRefs.localChatElementsRef = null;
    }

    // Update the reference to the current (new) SVG element.
    constants.mutableRefs.currentWorkspaceSvg = newWorkspaceSvg;

    // Find or create the main collaboration SVG group layer.
    constants.mutableRefs.collaborationLayerGroup = constants.mutableRefs.currentWorkspaceSvg.querySelector('#' + COLLABORATION_LAYER_ID);
    if (!constants.mutableRefs.collaborationLayerGroup) {
        // If the collaboration layer doesn't exist, create it and append it to `blocklyBlockCanvas`.
        constants.mutableRefs.collaborationLayerGroup = document.createElementNS(SVG_NS, 'g');
        constants.mutableRefs.collaborationLayerGroup.setAttribute('id', COLLABORATION_LAYER_ID);
        constants.mutableRefs.collaborationLayerGroup.style.pointerEvents = 'none'; // Ensure it doesn't block Blockly interaction.
        workspaceGroup.appendChild(constants.mutableRefs.collaborationLayerGroup);
        console.log("Collab UI: Collaboration layer group created and appended to new workspace.");
    } else {
        // If it already existed (e.g., re-parented), ensure it's in the correct parent and on top.
        if (constants.mutableRefs.collaborationLayerGroup.parentNode !== workspaceGroup) {
            workspaceGroup.appendChild(constants.mutableRefs.collaborationLayerGroup);
        }
        ensureCollaborationLayerOnTop(); // Ensure it's the last child for proper layering.
        console.log("Collab UI: Collaboration layer group re-used or re-parented.");
    }

    // Create or re-create local chat elements if they don't exist (because `localChatElements` was reset if SVG changed).
    if (!localChatElements.group) {
        constants.mutableRefs.localChatElementsRef = createLocalChatElements(constants.mutableRefs.collaborationLayerGroup);
        console.log("Collab UI: Local chat elements created.");
    } else {
        // If local chat elements already exist, ensure they are correctly parented and update the mutable reference.
        if (localChatElements.group.parentNode !== constants.mutableRefs.collaborationLayerGroup) {
            constants.mutableRefs.collaborationLayerGroup.appendChild(localChatElements.group);
        }
        constants.mutableRefs.localChatElementsRef = localChatElements;
        console.log("Collab UI: Re-referencing existing local chat elements.");
    }

    // Update local chat visibility based on its current message.
    if (constants.mutableRefs.localChatMessage && constants.mutableRefs.localChatElementsRef?.group) {
        const localState = constants.mutableRefs.yjsAwarenessInstance?.getLocalState();
        updateLocalChat(constants.mutableRefs.localChatMessage, constants.localUserInfo, localState?.cursor);
    } else {
        setLocalChatVisibility(false); // Hide if no message or elements aren't ready.
    }

    // Attach/re-attach throttled mouse move listener to the current (new) workspace SVG.
    // This ensures only one listener is active on the correct element for cursor position updates.
    if (!constants.mutableRefs.throttledMouseMoveHandler) {
        constants.mutableRefs.throttledMouseMoveHandler = helper.throttle((e) => {
            const currentWorkspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();
            // Basic checks for workspace and Yjs awareness.
            if (!currentWorkspace || !currentWorkspace.getParentSvg() || !currentWorkspace.getCanvas() || !constants.mutableRefs.yjsAwarenessInstance) return;
            // Filter out events originating from the Blockly flyout (toolbox) or if the workspace is a flyout.
            if (e.target?.closest('.blocklyFlyout') || currentWorkspace.isFlyout) return;

            try {
                const svg = constants.mutableRefs.currentWorkspaceSvg;
                const canvas = currentWorkspace.getCanvas();
                if (!svg || !canvas) return;

                // Transform screen coordinates to Blockly workspace coordinates.
                let inverseSvgMatrix = currentWorkspace.getInverseScreenCTM?.();
                if (!inverseSvgMatrix) { // Fallback if `getInverseScreenCTM` is not available.
                    const screenMatrix = svg.getScreenCTM();
                    if (!screenMatrix) return;
                    try { inverseSvgMatrix = screenMatrix.inverse(); } catch (err) { return; }
                }
                const svgPoint = constants.mutableRefs.BlocklyInstance.utils.mouseToSvg(e, svg, inverseSvgMatrix);
                const canvasMatrix = canvas.getCTM();
                if (!canvasMatrix) return;
                let inverseCanvasMatrix;
                try { inverseCanvasMatrix = canvasMatrix.inverse(); } catch (err) { return; }
                const workspacePoint = svgPoint.matrixTransform(inverseCanvasMatrix);

                // Broadcast the local cursor position via Yjs Awareness.
                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('cursor', { x: workspacePoint.x, y: workspacePoint.y });
                // Update the local chat bubble's position if a message is active.
                if (constants.mutableRefs.localChatElementsRef?.group && constants.mutableRefs.localChatMessage) {
                    updateLocalChat(constants.mutableRefs.localChatMessage, constants.localUserInfo, workspacePoint);
                }
            } catch (error) {
                console.error("[Collab UI] Error in mouse move handler:", error);
                // Clear cursor position if an error occurs.
                constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            }
        }, CURSOR_UPDATE_THROTTLE_MS); // Apply throttling.
    }
    // Ensure the listener is only attached once and to the correct element.
    constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
    constants.mutableRefs.currentWorkspaceSvg.addEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);

    // Attach/re-attach pointer leave listener.
    if (!constants.mutableRefs.pointerLeaveHandler) {
        constants.mutableRefs.pointerLeaveHandler = () => {
            // When pointer leaves the SVG, clear the local cursor position and hide local chat.
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            setLocalChatVisibility(false);
        };
    }
    // Ensure the listener is only attached once and to the correct element.
    constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
    constants.mutableRefs.currentWorkspaceSvg.addEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);

    // Attach/re-attach MutationObserver to the `workspaceGroup` (the `blocklyBlockCanvas`).
    // This observer ensures the collaboration layer remains on top if other elements are added after it.
    if (!constants.mutableRefs.blocklyCanvasObserver || constants.mutableRefs.blocklyCanvasObserver.target !== workspaceGroup) {
        if (constants.mutableRefs.blocklyCanvasObserver) {
            constants.mutableRefs.blocklyCanvasObserver.disconnect(); // Disconnect old observer if target changed.
            constants.mutableRefs.blocklyCanvasObserver = null;
        }
        if (workspaceGroup) {
            const observerCallback = (mutationsList) => {
                // If the collaboration layer is not the last child of its parent, move it to the top.
                if (constants.mutableRefs.collaborationLayerGroup?.parentNode && constants.mutableRefs.collaborationLayerGroup.parentNode.lastChild !== constants.mutableRefs.collaborationLayerGroup) {
                    let layerAddedInMutation = false;
                    for (const mutation of mutationsList) {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach(node => { if (node === constants.mutableRefs.collaborationLayerGroup) layerAddedInMutation = true; });
                        }
                    }
                    if (!layerAddedInMutation) ensureCollaborationLayerOnTop(); // Only move if it wasn't just added by another mutation.
                }
            };
            // Create and observe the new target.
            constants.mutableRefs.blocklyCanvasObserver = new MutationObserver(observerCallback);
            constants.mutableRefs.blocklyCanvasObserver.observe(workspaceGroup, { childList: true });
            console.log("Collab UI: MutationObserver attached to new workspaceGroup.");
        } else {
            console.warn("Collab UI: Could not attach MutationObserver, workspaceGroup is null.");
        }
    }

    // IMPORTANT STEP: Re-render ALL remote cursors based on the current awareness state.
    // This ensures that all active remote users' cursors (and chat/names) are drawn
    // onto the newly established collaboration layer, even if their awareness state hasn't changed
    // since the initial layer setup. This is crucial after a GUI re-render.
    if (constants.mutableRefs.yjsAwarenessInstance && constants.mutableRefs.collaborationLayerGroup) {
        const states = constants.mutableRefs.yjsAwarenessInstance.getStates();
        const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
        // Iterate through all remote client states.
        states.forEach((state, clientID) => {
            if (clientID === localClientID) return; // Skip the local user.

            const user = state.user;
            if (user) { // Only process if valid user data exists.
                // `createOrUpdateRemoteCursor` handles whether to display the cursor/chat
                // based on `state.cursor` and `state.chatMessage` and the local user's current target.
                // Since `cursorElements` was cleared earlier, this will mostly trigger creation.
                createOrUpdateRemoteCursor(clientID, state, constants.mutableRefs.collaborationLayerGroup, constants.debugging);
            }
        });
        console.log("Collab UI: All remote cursors re-rendered based on current awareness states.");
    }

    console.log("Collab UI: Layer setup/refresh complete.");
}

/**
 * Flag to indicate if a backpack insert operation is in progress.
 * This is a temporary override to prevent backpack events from being
 * duplicated by the collaboration system.
 */
let backpackInsertOverride = false;

/**
 * Sets a temporary override for backpack insert operations.
 * This function should be called right before a backpack insert
 * and will automatically reset after a short delay.
 */
window.handleBackpackCollaboratorOverride = function () {
    backpackInsertOverride = true;
    setTimeout(() => {
        backpackInsertOverride = false;
    }, 1000); // Reset after 1 second (this timeout length might need tuning for reliability).
};

/**
 * Flag to indicate if an undo/redo operation is in progress.
 * This is a temporary override to prevent undo/redo events from being
 * duplicated by the collaboration system.
 */
let undoRedoOverride = false;

/**
 * Sets a temporary override for undo/redo operations.
 * This function should be called right before an undo/redo action
 * and will automatically reset after a short delay.
 */
export function setUndoRedoOverride() {
    undoRedoOverride = true;
    setTimeout(() => {
        undoRedoOverride = false;
    }, 1000); // Reset after 1 second (this timeout length might need tuning for reliability).
}

/**
 * Flushes the event buffer for a given group ID, sending all buffered events
 * as a single atomic transaction.
 * @param {string} groupId The ID of the event group to flush.
 */
function flushEventBuffer(groupId) {
    const buffer = constants.mutableRefs.eventTransactionBuffer;
    if (buffer.has(groupId)) {
        const eventBatch = buffer.get(groupId);
        if (eventBatch.length > 0) {
            constants.mutableRefs.ydoc.transact(() => {
                constants.mutableRefs.yEvents.push([eventBatch]);
                if (constants.debugging) console.log(`Collab Send: Flushed ${eventBatch.length} events for group ${groupId}.`);
            }, constants.LOCAL_EVENT_SYNC_ORIGIN);
        }
        buffer.delete(groupId);
    }
}

/**
 * Central handler for all Blockly/VM events that need to be broadcast for collaboration.
 * This function filters out non-relevant events, prepares the payload, and then
 * either sends it immediately (for isolated events) or buffers it to be sent
 * in a transaction with other events from the same user action.
 * @param {object} event - The Blockly event object.
 */
export function handleBlocklyEventForCollaboration(event) {
    if (!constants.mutableRefs.BlocklyInstance || !constants.mutableRefs.BlocklyInstance.Events.isEnabled()) return;

    if (event.type === 'dragOutside') {
        constants.mutableRefs.dragOutsideStarted = true;
        return;
    }

    const workspace = constants.mutableRefs.BlocklyInstance.getMainWorkspace();

    const isDragOutsideMoveOrDelete = constants.mutableRefs.dragOutsideStarted && ["move", "delete"].includes(event.type);
    const isBackpackOverride = backpackInsertOverride && ["move", "create"].includes(event.type);
    const isUndoRedoOverride = (undoRedoOverride && ["create", "move", "delete", "var_create"].includes(event.type)) ||
        (event.type === 'var_rename' && event.varId && event.oldName && event.newName);

    if (!event.recordUndo && !(isDragOutsideMoveOrDelete || isBackpackOverride || isUndoRedoOverride)) {
        return;
    } else if (!event.recordUndo && constants.mutableRefs.dragOutsideStarted) {
        constants.mutableRefs.dragOutsideStarted = false;
    }

    if (event.type === constants.mutableRefs.BlocklyInstance.Events.CREATE) {
        const block = workspace.getBlockById(event.blockId);
        if (block?.isInFlyout || block?.isInMutator) return;
    }

    const targetName = helper.getCurrentEditingTargetName();
    let eventJson = null;

    if (event.type === constants.mutableRefs.BlocklyInstance.Events.VAR_CREATE) {
        if (typeof event.varId !== 'string' || typeof event.varName !== 'string') return;
        const varTargetName = event.isLocal ? (constants.mutableRefs.vm.runtime.getEditingTarget()?.getName() || targetName) : null;
        if (event.isLocal && !varTargetName) return;
        eventJson = { type: "var_create", isCloud: event.isCloud, isLocal: event.isLocal, id: event.varId, name: event.varName, varType: event.varType, targetName: varTargetName };
    } else if (event.type === constants.mutableRefs.BlocklyInstance.Events.VAR_RENAME) {
        if (typeof event.varId !== 'string' || typeof event.oldName !== 'string' || typeof event.newName !== 'string') return;
        eventJson = { type: "var_rename", originalVarId: event.varId, oldName: event.oldName, newName: event.newName, ambiguityFix: { varType: event.variable.type, isCloud: event.variable.isCloud, isLocal: event.variable.isLocal } };
    } else if (event.type === constants.mutableRefs.BlocklyInstance.Events.VAR_DELETE) {
        if (typeof event.varId !== 'string' || typeof event.varName !== 'string') return;
        eventJson = { type: "var_delete", originalVarId: event.varId, varName: event.varName, ambiguityFix: { varType: event.varType, isCloud: event.isCloud, isLocal: event.isLocal } };
    }

    if (eventJson == null) {
        try {
            eventJson = event.toJson();
            if (event.type.startsWith('var_') && event.type !== constants.mutableRefs.BlocklyInstance.Events.VAR_RENAME && (!event.varId || typeof event.varName === 'undefined')) return;
        } catch (e) {
            console.error("Collab Send: Error serializing event:", e, event);
            return;
        }
    }

    if (!constants.mutableRefs.yEvents || !constants.mutableRefs.ydoc) {
        console.warn("Collab Send: yEvents or ydoc not ready. Event not sent.");
        return;
    }

    const eventPackage = {
        targetName: targetName,
        event: eventJson,
        timestamp: Date.now()
    };

    const groupId = Blockly.Events.getGroup();

    if (!groupId) {
        // This is an isolated event (not part of a drag, etc.). Send it immediately in its own transaction.
        constants.mutableRefs.ydoc.transact(() => {
            constants.mutableRefs.yEvents.push([[eventPackage]]); // Wrap in an array to mark it as a batch of one.
            if (constants.debugging) console.log(`Collab Send: Event=${event.type} sent immediately.`);
        }, constants.LOCAL_EVENT_SYNC_ORIGIN);
    } else {
        // This event is part of a group. Buffer it.
        const buffer = constants.mutableRefs.eventTransactionBuffer;
        clearTimeout(constants.mutableRefs.eventFlushTimer);

        if (!buffer.has(groupId)) {
            buffer.set(groupId, []);
        }
        buffer.get(groupId).push(eventPackage);

        // Set a timer to flush the buffer. If another event in the same group arrives, the timer will be reset.
        constants.mutableRefs.eventFlushTimer = setTimeout(() => flushEventBuffer(groupId), 100); // 100ms debounce delay
    }
}

/**
 * Updates the display of user presence icons in the Scratch GUI's menu bar (top right).
 * It adds icons for new collaborators, updates existing ones (color, name, activity status),
 * and removes icons for disconnected users.
 */
export function updateUserMenuBarIcons() {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.userIconContainer) return;

    const states = constants.mutableRefs.yjsAwarenessInstance.getStates(); // Get all awareness states (including local).
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
    // Track currently displayed icons to identify which ones need to be removed.
    const currentlyDisplayed = new Set(constants.remoteUserIcons.keys());
    const activeRemoteClientIDs = new Set(); // Track clients that are currently active and processed.

    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; // Skip the local user.

        const user = state.user;
        const isInactive = state.isInactive || false; // Get inactivity status, default to false.

        // Skip empty states that might occur during rapid awareness updates.
        if (JSON.stringify(state) === JSON.stringify({})) {
            return;
        }
        // Validate user data.
        if (!user || !user.name || !user.color) {
            console.warn(`Collab UI: Incomplete user data for clientID ${clientID}`, state);
            return;
        }
        activeRemoteClientIDs.add(clientID); // Mark this client as active.

        let iconElement = constants.remoteUserIcons.get(clientID); // Get existing icon if any.
        const displayColor = user.color; // The user's chosen color.

        if (!iconElement) {
            // If no icon exists, create a new one.
            iconElement = document.createElement('div');
            iconElement.classList.add('collaboration-user-icon');
            iconElement.style.backgroundColor = displayColor;
            iconElement.style.opacity = isInactive ? '0.5' : '1'; // Adjust opacity based on inactivity.
            iconElement.title = isInactive ? `${user.name} (inactive)` : user.name; // Tooltip with name and status.
            const initials = user.name.slice(0, 1).toUpperCase(); // First letter as initials.
            iconElement.textContent = initials;

            constants.mutableRefs.userIconContainer.appendChild(iconElement); // Append to the menu bar container.
            constants.remoteUserIcons.set(clientID, iconElement); // Store reference.
            if (constants.debugging) console.log(`Collab UI: Added menu bar user icon for ${user.name} (${clientID}), Inactive: ${isInactive}`);
        } else {
            // If icon exists, update its properties if they have changed.
            if (iconElement.style.backgroundColor !== displayColor) {
                iconElement.style.backgroundColor = displayColor;
            }
            const newTitle = isInactive ? `${user.name} (inactive)` : user.name;
            if (iconElement.style.opacity !== (isInactive ? '0.5' : '1')) {
                iconElement.style.opacity = isInactive ? '0.5' : '1';
            }
            if (iconElement.title !== newTitle) {
                iconElement.title = newTitle;
            }
            const initials = user.name.slice(0, 1).toUpperCase();
            if (iconElement.textContent !== initials) iconElement.textContent = initials;
        }
        currentlyDisplayed.delete(clientID); // Mark this client as processed.
    });

    // Remove icons for clients that are no longer active.
    currentlyDisplayed.forEach(clientID => {
        const iconToRemove = constants.remoteUserIcons.get(clientID);
        if (iconToRemove) {
            iconToRemove.remove(); // Remove from DOM.
            constants.remoteUserIcons.delete(clientID); // Remove from map.
            if (constants.debugging) console.log(`Collab UI: Removed menu bar user icon for clientID ${clientID}`);
        }
    });
}

/**
 * Updates the display of user presence icons on individual sprites and the Stage in the sprite selector area.
 * Icons are displayed on a sprite/Stage if a remote user is currently editing that specific target.
 */
export function updateSpriteUserIcons() {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.vm) return;

    const states = constants.mutableRefs.yjsAwarenessInstance.getStates(); // Get all awareness states.
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
    const spriteListElement = document.querySelector('[class*="sprite-selector_items-wrapper"]'); // Container for sprites.
    // The first stage element found (assuming only one stage selector).
    const stageElement = document.querySelectorAll('[class*="stage-selector_stage-selector"]')[0];

    const stageTarget = constants.mutableRefs.vm.runtime?.getTargetForStage();
    // Get the actual name of the Stage target, defaulting to 'Stage'.
    const stageName = stageTarget?.isStage ? stageTarget.getName() : 'Stage';

    // If neither sprite list nor stage element is found, clear all existing icons.
    if (!spriteListElement && !stageElement) {
        constants.spriteIconContainers.forEach(({ container }) => container.remove());
        constants.spriteIconContainers.clear();
        return;
    }

    // Map to group active users by the target they are editing.
    const usersByTarget = new Map(); // Map<targetName, Set<clientID>>
    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; // Skip local user.
        const targetName = state.currentTargetName; // The target name the remote user is on.
        const user = state.user;
        if (targetName && user) {
            if (!usersByTarget.has(targetName)) {
                usersByTarget.set(targetName, new Set());
            }
            usersByTarget.get(targetName).add(clientID);
        }
    });

    const currentTargetNames = new Set(); // Track target names that are currently present in the GUI.

    /**
     * Processes a single target element (sprite or Stage) to update its associated user icons.
     * @param {HTMLElement} targetElement - The DOM element representing the sprite or Stage.
     * @param {string} targetName - The name of the target.
     */
    const processTargetElement = (targetElement, targetName) => {
        if (!targetElement || !targetName) return;
        currentTargetNames.add(targetName); // Add to set of currently existing targets.

        const usersOnThisTarget = usersByTarget.get(targetName) || new Set(); // Users currently on this target.
        let targetData = constants.spriteIconContainers.get(targetName); // Get existing container data.

        if (!targetData) {
            // If no container exists for this target, create a new one.
            const container = document.createElement('div');
            container.className = constants.SPRITE_ICON_CONTAINER_CLASS;
            // Special positioning for Stage selector (if needed, otherwise default to absolute).
            if (targetElement === stageElement) {
                container.style.position = 'initial';
            }
            // Ensure the target element itself is relatively positioned for absolute children.
            if (getComputedStyle(targetElement).position === 'static') {
                targetElement.style.position = 'relative';
            }
            targetElement.appendChild(container);
            targetData = { container, icons: new Map() };
            constants.spriteIconContainers.set(targetName, targetData);
        } else {
            // If container already exists, ensure it's still appended to the correct parent.
            if (targetData.container.parentElement !== targetElement) {
                targetElement.appendChild(targetData.container);
                if (getComputedStyle(targetElement).position === 'static') {
                    targetElement.style.position = 'relative';
                }
            }
            // Re-apply stage-specific positioning if necessary.
            if (targetElement === stageElement && targetData.container.style.position !== 'initial') {
                targetData.container.style.position = 'initial';
            }
        }

        const { container, icons } = targetData;
        const currentlyDisplayedIcons = new Set(icons.keys()); // Track icons currently displayed on this target.

        // Add/update icons for users currently on this target.
        usersOnThisTarget.forEach(clientID => {
            const userState = states.get(clientID);
            if (!userState || !userState.user) return; // Skip if user data is missing.
            const user = userState.user;

            let iconElement = icons.get(clientID); // Get existing icon.
            if (!iconElement) {
                // Create new icon if it doesn't exist.
                iconElement = document.createElement('div');
                iconElement.className = constants.SPRITE_USER_ICON_CLASS;
                iconElement.style.backgroundColor = user.color;
                iconElement.title = user.name;
                container.appendChild(iconElement);
                icons.set(clientID, iconElement);
            } else {
                // Update existing icon's properties if changed.
                if (iconElement.style.backgroundColor !== user.color) {
                    iconElement.style.backgroundColor = user.color;
                }
                if (iconElement.title !== user.name) {
                    iconElement.title = user.name;
                }
            }
            currentlyDisplayedIcons.delete(clientID); // Mark as processed.
        });

        // Remove icons for users no longer on this target.
        currentlyDisplayedIcons.forEach(clientID => {
            const iconToRemove = icons.get(clientID);
            iconToRemove?.remove();
            icons.delete(clientID);
        });

        // If no users are on this target and no icons remain, remove the container itself.
        if (usersOnThisTarget.size === 0 && icons.size === 0) {
            container.remove();
            constants.spriteIconContainers.delete(targetName);
        }
    };

    // Process the Stage element.
    if (stageElement && stageName) {
        processTargetElement(stageElement, stageName);
    } else if (stageName && !stageElement) {
        // If stageName exists but stageElement doesn't, ensure it's still tracked for cleanup.
        currentTargetNames.add(stageName);
    }

    // Process each sprite element in the sprite list.
    if (spriteListElement) {
        spriteListElement.querySelectorAll('[class*="sprite-selector_sprite-wrapper"]').forEach(spriteWrapper => {
            const nameElement = spriteWrapper.querySelector('[class*="sprite-selector-item_sprite-name"]');
            const spriteItemElement = spriteWrapper.querySelector('[class*="sprite-selector-item_sprite-selector-item"]');

            if (nameElement && spriteItemElement) {
                const spriteName = nameElement.textContent;
                if (spriteName) {
                    processTargetElement(spriteItemElement, spriteName);
                }
            }
        });
    }

    // Cleanup containers for targets that no longer exist in the GUI.
    const trackedTargetNames = new Set(constants.spriteIconContainers.keys());
    trackedTargetNames.forEach(targetName => {
        if (!currentTargetNames.has(targetName)) {
            const targetData = constants.spriteIconContainers.get(targetName);
            targetData?.container.remove();
            constants.spriteIconContainers.delete(targetName);
            if (constants.debugging) console.log(`Collab UI: Removed stale target icon container for "${targetName}"`);
        }
    });
}

/**
 * Updates the display of user presence icons on the Code, Costumes, and Sounds tabs.
 * Icons are shown on a tab if a remote user is viewing that tab AND is on the same sprite/Stage
 * as the local user.
 */
export function updateTabUserIcons() {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.vm) return;

    const states = constants.mutableRefs.yjsAwarenessInstance.getStates();
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
    const tabElements = document.querySelectorAll(constants.TAB_SELECTOR); // Get all tab DOM elements.
    const localUserCurrentTargetName = constants.localUserInfo.currentTargetName; // Get local user's current target.

    // If no tabs are found, clear any existing icons/containers.
    if (tabElements.length === 0) {
        constants.tabIconContainers.forEach(({ container }) => container.remove());
        constants.tabIconContainers.clear();
        return;
    }

    // Map to group users by their active tab index, but only if they are on the *same target* as the local user.
    const usersByTabIndex = new Map(); // Map<tabIndex, Set<clientID>>
    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; // Skip local user (they don't need an icon on their own tab).

        const activeTabIndex = state.activeTabIndex;
        const user = state.user;
        const remoteUserCurrentTargetName = state.currentTargetName; // Get remote user's current target.

        // Crucial condition: only show tab icon if the remote user is on the *same target* as the local user.
        const isOnSameTarget = remoteUserCurrentTargetName === localUserCurrentTargetName;

        if (isOnSameTarget &&
            typeof activeTabIndex === 'number' &&
            user && user.name && user.color) { // Basic validation for user data.
            if (!usersByTabIndex.has(activeTabIndex)) {
                usersByTabIndex.set(activeTabIndex, new Set());
            }
            usersByTabIndex.get(activeTabIndex).add(clientID);
        }
    });

    const currentTabIndicesProcessed = new Set(); // Track tab indices that are currently present in the GUI.

    tabElements.forEach((tabElement, tabIndex) => {
        currentTabIndicesProcessed.add(tabIndex);
        const usersOnThisTab = usersByTabIndex.get(tabIndex) || new Set();
        let tabData = constants.tabIconContainers.get(tabIndex);

        // Ensure the tabElement is suitable for absolute positioning of child icons.
        if (getComputedStyle(tabElement).position === 'static') {
            tabElement.style.position = 'relative';
        }

        if (!tabData) {
            // If no container exists for this tab, create a new one.
            const container = document.createElement('div');
            container.className = constants.TAB_ICON_CONTAINER_CLASS;
            tabElement.appendChild(container);
            tabData = { container, icons: new Map() };
            constants.tabIconContainers.set(tabIndex, tabData);
        } else {
            // If container already exists, ensure it's still parented correctly.
            if (tabData.container.parentElement !== tabElement) {
                tabData.container.remove(); // Remove from old parent (if any).
                tabElement.appendChild(tabData.container); // Append to new parent.
                if (getComputedStyle(tabElement).position === 'static') {
                    tabElement.style.position = 'relative';
                }
            }
        }

        const { container, icons } = tabData;
        const currentlyDisplayedIconsOnThisTab = new Set(icons.keys());

        // Add/update icons for users currently on this tab.
        usersOnThisTab.forEach(clientID => {
            const userState = states.get(clientID);
            const user = userState.user; // User data already validated above.

            let iconElement = icons.get(clientID);
            if (!iconElement) {
                // Create new icon if it doesn't exist.
                iconElement = document.createElement('div');
                iconElement.className = constants.TAB_USER_ICON_CLASS;
                iconElement.style.backgroundColor = user.color;
                iconElement.title = user.name; // Tooltip with user's name.
                container.appendChild(iconElement);
                icons.set(clientID, iconElement);
            } else {
                // Update existing icon's properties if changed.
                if (iconElement.style.backgroundColor !== user.color) {
                    iconElement.style.backgroundColor = user.color;
                }
                if (iconElement.title !== user.name) {
                    iconElement.title = user.name;
                }
            }
            currentlyDisplayedIconsOnThisTab.delete(clientID); // Mark as processed.
        });

        // Remove icons for users no longer on this tab or who left.
        currentlyDisplayedIconsOnThisTab.forEach(clientID => {
            const iconToRemove = icons.get(clientID);
            iconToRemove?.remove();
            icons.delete(clientID);
        });

        // Hide or show the container based on whether it has any user icons.
        if (usersOnThisTab.size === 0) {
            container.style.display = 'none'; // Hide if empty.
        } else {
            container.style.display = 'flex'; // Ensure visible if it has icons.
        }
    });

    // Cleanup containers for tab indices that might no longer be valid or present in the GUI.
    const trackedTabIndices = new Set(constants.tabIconContainers.keys());
    trackedTabIndices.forEach(tabIndex => {
        if (!currentTabIndicesProcessed.has(tabIndex)) {
            const tabData = constants.tabIconContainers.get(tabIndex);
            tabData?.container.remove();
            constants.tabIconContainers.delete(tabIndex);
            if (constants.debugging) console.log(`Collab UI: Removed stale tab icon container for tab index ${tabIndex}`);
        }
    });
}

/**
 * Displays a "Syncing Project" popup or uses a fallback if Redux is not available.
 * This is used to indicate that the project is undergoing initial synchronization.
 */
export function showSyncingPopup() {
    if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
        constants.mutableRefs.addon.tab.redux.dispatch({
            type: 'scratch-gui/collaboration/SET_SYNCING', // Dispatch Redux action to show popup.
            payload: true
        });
    } else {
        console.warn('Collab: Redux not available to show syncing popup. Falling back to window var.');
        window.syncingCollab_fallback = true; // Fallback for environments without Redux.
    }
}

/**
 * Hides the "Syncing Project" popup and displays a "Project Saved" alert.
 * Uses Redux action if available, otherwise a fallback.
 */
export function hideSyncingPopup() {
    if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
        constants.mutableRefs.addon.tab.redux.dispatch({
            type: 'scratch-gui/collaboration/SET_SYNCING', // Dispatch Redux action to hide popup.
            payload: false
        });
        constants.mutableRefs.addon.tab.redux.dispatch({
            type: "scratch-gui/alerts/SHOW_ALERT", // Show a "Project Saved" alert.
            alertId: "CollaborationLockedNoticeSaveProject",
        });
    } else {
        console.warn('Collab: Redux not available to hide syncing popup. Falling back to window var.');
        delete window.syncingCollab_fallback; // Clear fallback.
    }
}

/**
 * Sets up and applies CSS styles required for collaboration UI elements (cursors, chat, icons).
 * It removes any previously injected styles to prevent duplicates.
 */
export function setupCSS() {
    document.getElementById("collaborative-cursor-styles")?.remove(); // Remove old ID for styles.
    document.getElementById("collaborative-svg-cursor-styles")?.remove(); // Remove current ID if re-initializing.

    // Define CSS styles as a string literal.
    const svgCursorStyles = `
    .collaborative-cursor path {
    filter: drop-shadow(${SHADOW_OFFSET_X} ${SHADOW_OFFSET_Y} ${SHADOW_BLUR} ${SHADOW_COLOR});
    }
    .collaborative-cursor-name {
    paint-order: stroke;
    stroke: ${NAME_TEXT_STROKE};
    stroke-width: ${NAME_TEXT_STROKE_WIDTH}px;
    stroke-linecap: round;
    stroke-linejoin: round;
    cursor: default;
    }
    .collaborative-cursor-name-bg {
    filter: drop-shadow(${SHADOW_OFFSET_X} ${SHADOW_OFFSET_Y} ${SHADOW_BLUR} ${SHADOW_COLOR});
    }
    .collaborative-chat-bubble text,
    .collaborative-chat-bubble tspan
    {
    cursor: default;
    }
    .collaborative-chat-bubble rect {
    filter: drop-shadow(${SHADOW_OFFSET_X} ${SHADOW_OFFSET_Y} ${CHAT_SHADOW_BLUR} ${CHAT_SHADOW_COLOR});
    }
    #${COLLABORATION_LAYER_ID},
    .collaborative-cursor,
    .collaborative-chat-bubble {
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
    }
    .collaborative-cursor svg {
    overflow: visible;
    }
    .collaboration-user-icon-container {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 10px;
    height: 100%;
    padding: 0 5px;
    }
    .collaboration-user-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    color: white;
    border: 1px solid rgba(0,0,0,0.2);
    overflow: hidden;
    cursor: default;
    flex-shrink: 0;
    }
    .collaboration-sprite-icon-container {
    position: absolute;
    top: 2px;
    left: 2px;
    display: flex;
    flex-direction: row-reverse;
    gap: 2px;
    pointer-events: none;
    z-index: 1;
    max-width: 50%;
    overflow: hidden;
    }
    .collaboration-sprite-user-icon {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.2);
    box-sizing: border-box;
    flex-shrink: 0;
    }
    .collaboration-user-icon-container {
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 4px;
    margin-left: 10px;
    }
    .collaboration-user-icon {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
    font-weight: bold;
    border: 1px solid rgba(0,0,0,0.1);
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    flex-shrink: 0;
    }
    .collaboration-ghost-block {
    opacity: 0.5;
    pointer-events: none;
    }
    .collaboration-tab-icon-container {
    position: absolute;
    top: 2px;
    left: 14px;
    display: flex;
    flex-direction: row;
    gap: 2px;
    pointer-events: none;
    z-index: 5;
    max-height: 10px;
    }
    .collaboration-tab-user-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.3);
    box-sizing: border-box;
    flex-shrink: 0;
    }
    .collab-popup {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    }
    .collab-popup-content {
    background: #fff;
    padding: 2rem;
    max-width: 400px;
    width: 90%;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    text-align: center;
    font-family: Arial, sans-serif;
    }
    .collab-popup-content h2 {
    margin-top: 0;
    font-size: 1.5rem;
    color: #333;
    }
    .collab-popup-content p {
    font-size: 1rem;
    color: #555;
    margin-bottom: 0;
    }
    .collab-popup-content button {
    margin-top: 1.5rem;
    padding: .75rem 1.5rem;
    font-size: .75rem;
    border: none;
    border-radius: 4px;
    background-color: #d0402e;
    color: #fff;
    cursor: pointer;
    }
    .collab-popup-content button:hover {
    background-color: #cc2c17;
    }
    `;
    // Create a new style element and append it to the document head.
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.id = "collaborative-svg-cursor-styles"; // Assign a unique ID.
    styleSheet.innerText = svgCursorStyles;
    document.head.appendChild(styleSheet);
}

/**
 * Retrieves a Set of client IDs for all currently active remote collaborators
 * whose cursors are being tracked and displayed.
 * @returns {Set<number>} A set of active remote client IDs.
 */
export function getActiveRemoteClientIDs() {
    return new Set(cursorElements.keys());
}
