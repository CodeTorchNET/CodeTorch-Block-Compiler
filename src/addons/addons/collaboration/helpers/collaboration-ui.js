import * as constants from './constants.js';
import * as presence from './presence.js';
import * as helper from './helper.js';

export const CURSOR_UPDATE_THROTTLE_MS = 50;
export const CHAT_MESSAGE_TIMEOUT_MS = 3000; 

const CURSOR_SVG_VIEWBOX = '0 0 24 24'; 
const CURSOR_SVG_PATH = 'm2.5 2.5 4.41875 10.625 1.5687499999999999 -4.6187499999999995L13.125 6.91875z'; 
const CURSOR_WIDTH = 50;  
const CURSOR_HEIGHT = 50; 
export const COLLABORATION_LAYER_ID = 'collaboration-overlay-group';

const NAME_FONT_SIZE = 16;     
const NAME_FONT_WEIGHT = 'normal';
const NAME_TEXT_FILL = '#FFFFFF'; 
const NAME_TEXT_STROKE = '#FFFFFF'; 
const NAME_TEXT_STROKE_WIDTH = 0.5; 
const NAME_BG_ROUNDING = 15;   
const NAME_BG_OPACITY = 0.85;  
const NAME_BG_PADDING_X = 15;  
const NAME_BG_PADDING_Y = 15;  

const CHAT_FONT_SIZE = 16;     
const CHAT_FONT_WEIGHT = 'normal';
const CHAT_TEXT_FILL = '#FFFFFF'; 
const CHAT_BUBBLE_FILL = 'rgba(240, 240, 240, 0.9)'; 
const CHAT_BUBBLE_OPACITY = 0.85; 
const CHAT_BUBBLE_STROKE = '#AAAAAA'; 
const CHAT_BUBBLE_STROKE_WIDTH = 1.5; 
const CHAT_BUBBLE_ROUNDING = 20; 
const CHAT_PADDING = 15;       
const CHAT_MAX_WIDTH = 200;    

const CURSOR_STROKE = '#FFFFFF';     
const CURSOR_STROKE_WIDTH = 0.5; 

const SHADOW_OFFSET_X = '1px';
const SHADOW_OFFSET_Y = '1px';
const SHADOW_BLUR = '2px';
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.35)'; 
const CHAT_SHADOW_BLUR = '3px'; 
const CHAT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)'; 

const NAME_X_OFFSET = 63; 
const NAME_Y_OFFSET = 45; 
const CHAT_X_OFFSET = 15; 
const CHAT_Y_OFFSET = 30; 

export const SVG_NS = 'http://www.w3.org/2000/svg';

const cursorElements = new Map();

let localChatElements = {
    group: null, 
    rect: null,  
    text: null   
};

export function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function sanitizeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateChatBubbleSVG(chatGroup, chatRect, chatText, message, user, isLocal = false) {
    if (!chatGroup || !chatRect || !chatText) return;

    if (message && typeof message === 'string' && message.trim() !== '') {
        const sanitizedMessage = sanitizeText(message);
        const displayText = isLocal ? sanitizedMessage : `${user?.name || 'User'}: ${sanitizedMessage}`;

        chatText.textContent = displayText; 
        chatGroup.style.display = 'block'; 

        let textWidth = 0;
        let textHeight = 0;
        const lines = []; 

        let bbox = null;
        try {
            if (chatText.isConnected && chatText.ownerSVGElement?.isConnected) {
                bbox = chatText.getBBox();
                if (bbox && bbox.width >= 0 && bbox.height >= 0) {
                    textWidth = bbox.width;
                    textHeight = bbox.height;

                    if (textWidth > CHAT_MAX_WIDTH) {
                        const words = displayText.split(' ');
                        let currentLine = '';
                        chatText.textContent = ''; 

                        words.forEach(word => {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            chatText.textContent = testLine; 
                            let currentLineWidth = 0;
                            try {
                                if (chatText.isConnected && chatText.ownerSVGElement?.isConnected) {
                                    currentLineWidth = chatText.getBBox().width;
                                } else {
                                    currentLineWidth = testLine.length * CHAT_FONT_SIZE * 0.6; 
                                }
                            } catch (e) { }

                            if (currentLineWidth > CHAT_MAX_WIDTH && currentLine !== '') {
                                lines.push(currentLine); 
                                currentLine = word; 
                            } else {
                                currentLine = testLine; 
                            }
                        });
                        lines.push(currentLine); 

                        chatText.textContent = ''; 
                        let cumulativeHeight = 0;
                        let maxWidth = 0;
                        lines.forEach((line, index) => {
                            const tspan = document.createElementNS(SVG_NS, 'tspan');
                            tspan.textContent = line;
                            tspan.setAttribute('x', CHAT_PADDING.toString()); 
                            tspan.setAttribute('dy', index === 0 ? '0' : `${CHAT_FONT_SIZE * 1.2}px`); 
                            chatText.appendChild(tspan);
                            try {
                                if (tspan.isConnected && tspan.ownerSVGElement?.isConnected) {
                                    maxWidth = Math.max(maxWidth, tspan.getComputedTextLength()); 
                                } else {
                                    maxWidth = Math.max(maxWidth, line.length * CHAT_FONT_SIZE * 0.6); 
                                }
                            } catch (e) { }
                            cumulativeHeight += (index === 0 ? CHAT_FONT_SIZE : CHAT_FONT_SIZE * 1.2);
                        });
                        textWidth = maxWidth; 
                        textHeight = Math.max(CHAT_FONT_SIZE, cumulativeHeight); 
                    } else {
                        chatText.textContent = displayText;
                        while (chatText.firstChild) { chatText.removeChild(chatText.firstChild); }
                        chatText.textContent = displayText; 
                    }

                } else {
                    textWidth = Math.min(CHAT_MAX_WIDTH, displayText.length * CHAT_FONT_SIZE * 0.6);
                    textHeight = CHAT_FONT_SIZE * 1.2;
                }
            } else {
                textWidth = Math.min(CHAT_MAX_WIDTH, displayText.length * CHAT_FONT_SIZE * 0.6);
                textHeight = CHAT_FONT_SIZE * 1.2;
            }
        } catch (e) {
            textWidth = Math.min(CHAT_MAX_WIDTH, displayText.length * CHAT_FONT_SIZE * 0.6);
            textHeight = CHAT_FONT_SIZE * 1.2;
        }

        const rectWidth = textWidth + CHAT_PADDING * 2;
        const rectHeight = textHeight + CHAT_PADDING * 2;
        chatRect.setAttribute('width', rectWidth.toString());
        chatRect.setAttribute('height', rectHeight.toString());
        chatRect.setAttribute('x', '0'); 
        chatRect.setAttribute('y', '0'); 

        if (lines.length <= 1) {
            while (chatText.firstChild) { chatText.removeChild(chatText.firstChild); }
            chatText.textContent = displayText;
            chatText.setAttribute('x', CHAT_PADDING.toString());
            chatText.setAttribute('y', CHAT_PADDING.toString());
            chatText.removeAttribute('dy');
        } else {
            chatText.setAttribute('x', '0');
            chatText.setAttribute('y', CHAT_PADDING.toString());
        }

        chatGroup.style.display = 'block'; 

    } else {
        chatGroup.style.display = 'none';
        chatText.textContent = '';
        while (chatText.firstChild) { chatText.removeChild(chatText.firstChild); } 
        chatRect.setAttribute('width', '0');
        chatRect.setAttribute('height', '0');
    }
}

export function createLocalChatElements(layer) {
    if (!layer) return null;

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'collaborative-chat-bubble local-chat-bubble');
    group.style.display = 'none'; 
    group.style.pointerEvents = 'none'; 
    group.style.fontSize = `${CHAT_FONT_SIZE}px`;
    group.style.fontFamily = 'sans-serif';
    group.style.fontWeight = CHAT_FONT_WEIGHT;

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('rx', CHAT_BUBBLE_ROUNDING.toString());
    rect.setAttribute('ry', CHAT_BUBBLE_ROUNDING.toString());
    rect.setAttribute('fill', CHAT_BUBBLE_FILL); 
    rect.setAttribute('stroke', CHAT_BUBBLE_STROKE);
    rect.setAttribute('stroke-width', CHAT_BUBBLE_STROKE_WIDTH.toString());

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('fill', "#333333"); 
    text.setAttribute('dominant-baseline', 'text-before-edge'); 
    text.setAttribute('dy', '0');

    group.appendChild(rect);
    group.appendChild(text);
    layer.appendChild(group); 

    localChatElements = { group, rect, text };
    return localChatElements;
}

export function updateLocalChat(message, user, position) {
    if (!localChatElements.group || !user) return;

    if (message && position) {
        const bubbleX = position.x + CHAT_X_OFFSET;
        const bubbleY = position.y + CHAT_Y_OFFSET;
        localChatElements.group.setAttribute('transform', `translate(${bubbleX}, ${bubbleY})`);
        updateChatBubbleSVG(localChatElements.group, localChatElements.rect, localChatElements.text, message, user, true); 
        localChatElements.group.style.display = 'block'; 
    } else {
        localChatElements.group.style.display = 'none'; 
    }
}

export function setLocalChatVisibility(visible) {
    if (localChatElements.group) {
        localChatElements.group.style.display = visible ? 'block' : 'none';
    }
}

export function createOrUpdateRemoteCursor(clientID, state, layer, debugging = false) {
    if (!layer) return;

    const user = state.user;
    const remoteCursorPos = state.cursor;
    const remoteChatMessage = state.chatMessage;

    let cursorData = cursorElements.get(clientID);

    if (remoteCursorPos && user && typeof remoteCursorPos.x === 'number' && typeof remoteCursorPos.y === 'number') {
        const remoteX = remoteCursorPos.x;
        const remoteY = remoteCursorPos.y;

        if (!cursorData) {
            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('class', 'collaborative-cursor');
            group.style.pointerEvents = 'none'; 
            group.style.transition = 'transform 0.05s linear'; 
            group.style.willChange = 'transform'; 

            const cursorSvg = document.createElementNS(SVG_NS, 'svg');
            cursorSvg.setAttribute('width', CURSOR_WIDTH.toString());
            cursorSvg.setAttribute('height', CURSOR_HEIGHT.toString());
            cursorSvg.setAttribute('viewBox', CURSOR_SVG_VIEWBOX);
            cursorSvg.style.overflow = 'visible'; 

            const cursorPath = document.createElementNS(SVG_NS, 'path');
            cursorPath.setAttribute('d', CURSOR_SVG_PATH);
            cursorPath.setAttribute('fill', user.color || '#ff0000'); 
            cursorPath.setAttribute('stroke', CURSOR_STROKE);
            cursorPath.setAttribute('stroke-width', CURSOR_STROKE_WIDTH.toString());
            cursorPath.style.transformOrigin = 'center center';
            cursorSvg.appendChild(cursorPath);

            const nameText = document.createElementNS(SVG_NS, 'text');
            nameText.setAttribute('class', 'collaborative-cursor-name');
            nameText.setAttribute('x', '0');
            nameText.setAttribute('y', '0');
            nameText.setAttribute('fill', NAME_TEXT_FILL);
            nameText.setAttribute('font-size', `${NAME_FONT_SIZE}px`);
            nameText.setAttribute('font-family', 'sans-serif');
            nameText.setAttribute('font-weight', NAME_FONT_WEIGHT);
            nameText.setAttribute('text-anchor', 'middle'); 
            nameText.setAttribute('dominant-baseline', 'central'); 
            nameText.textContent = user.name || `User ${clientID.toString().substring(0, 4)}`; 

            const nameBg = document.createElementNS(SVG_NS, 'rect');
            nameBg.setAttribute('class', 'collaborative-cursor-name-bg');
            nameBg.setAttribute('fill', user.color || '#ff0000'); 
            nameBg.setAttribute('fill-opacity', NAME_BG_OPACITY.toString());
            nameBg.setAttribute('rx', NAME_BG_ROUNDING.toString());
            nameBg.setAttribute('ry', NAME_BG_ROUNDING.toString());

            const chatGroup = document.createElementNS(SVG_NS, 'g');
            chatGroup.setAttribute('class', 'collaborative-chat-bubble remote-chat-bubble');
            chatGroup.style.display = 'none'; 
            chatGroup.style.pointerEvents = 'none';
            chatGroup.style.fontSize = `${CHAT_FONT_SIZE}px`;
            chatGroup.style.fontFamily = 'sans-serif';
            chatGroup.style.fontWeight = CHAT_FONT_WEIGHT;
            chatGroup.setAttribute('transform', `translate(${CHAT_X_OFFSET}, ${CHAT_Y_OFFSET})`); 

            const chatRect = document.createElementNS(SVG_NS, 'rect');
            chatRect.setAttribute('rx', CHAT_BUBBLE_ROUNDING.toString());
            chatRect.setAttribute('ry', CHAT_BUBBLE_ROUNDING.toString());
            chatRect.setAttribute('fill', user.color || '#ff0000'); 
            chatRect.setAttribute('fill-opacity', CHAT_BUBBLE_OPACITY.toString());
            chatRect.setAttribute('stroke', CHAT_BUBBLE_STROKE);
            chatRect.setAttribute('stroke-width', CHAT_BUBBLE_STROKE_WIDTH.toString());

            const chatText = document.createElementNS(SVG_NS, 'text');
            chatText.setAttribute('fill', CHAT_TEXT_FILL); 
            chatText.setAttribute('dominant-baseline', 'text-before-edge');
            chatText.setAttribute('dy', '0');

            chatGroup.appendChild(chatRect);
            chatGroup.appendChild(chatText);

            group.appendChild(cursorSvg);
            group.appendChild(nameBg);
            group.appendChild(nameText);
            group.appendChild(chatGroup);

            layer.appendChild(group); 

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
                    nameText.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                    nameBg.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                } else {
                    const estWidth = (user.name || `User ${clientID.toString().substring(0, 4)}`).length * NAME_FONT_SIZE * 0.6;
                    const estHeight = NAME_FONT_SIZE;
                    nameBg.setAttribute('width', (estWidth + NAME_BG_PADDING_X * 2).toString());
                    nameBg.setAttribute('height', (estHeight + NAME_BG_PADDING_Y * 2).toString());
                    nameBg.setAttribute('x', (-(estWidth / 2 + NAME_BG_PADDING_X)).toString());
                    nameBg.setAttribute('y', (-(estHeight / 2 + NAME_BG_PADDING_Y)).toString());
                    nameText.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                    nameBg.setAttribute('transform', `translate(${NAME_X_OFFSET}, ${NAME_Y_OFFSET})`);
                }
            } catch (e) { }

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
        } else {
            let nameRecalculateNeeded = false;
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
                    }
                } catch (e) {}
            }
        }

        cursorData.group.setAttribute('transform', `translate(${remoteX}, ${remoteY})`);
        cursorData.group.style.display = ''; 

    } else {
        if (cursorData) {
            cursorData.group.style.display = 'none';
        }
    }

    if (cursorData) {
        updateChatBubbleSVG(
            cursorData.chatGroup,
            cursorData.chatRect,
            cursorData.chatText,
            remoteChatMessage, 
            user,
            false 
        );
        const isChatVisible = remoteChatMessage && typeof remoteChatMessage === 'string' && remoteChatMessage.trim() !== '';

        if (isChatVisible) {
            cursorData.nameText.style.display = 'none';
            cursorData.nameBg.style.display = 'none';
        } else {
            cursorData.nameText.style.display = '';
            cursorData.nameBg.style.display = '';
        }
        if (isChatVisible && cursorData.group.style.display === 'none' && remoteCursorPos && typeof remoteCursorPos.x === 'number' && typeof remoteCursorPos.y === 'number') {
            cursorData.group.style.display = '';
        }
    } 
}

export function removeRemoteCursor(clientID, debugging = false) {
    const cursorData = cursorElements.get(clientID);
    if (cursorData) {
        cursorData.group.remove(); 
        cursorElements.delete(clientID); 
    }
}

export function removeAllUI() {
    cursorElements.forEach(cursorData => cursorData.group.remove());
    cursorElements.clear(); 

    if (localChatElements.group) {
        localChatElements.group.remove();
    }
    localChatElements = { group: null, rect: null, text: null };

    const userIconContainer = document.getElementById('collaboration-users-container');
    userIconContainer?.remove();
}

export function clearLocalChatMessage() {
    if (constants.mutableRefs.localChatMessage !== '') {
        constants.mutableRefs.localChatMessage = ''; 
        constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('chatMessage', null);
        setLocalChatVisibility(false); 
    }
    if (constants.mutableRefs.chatMessageTimeoutId) clearTimeout(constants.mutableRefs.chatMessageTimeoutId);
    constants.mutableRefs.chatMessageTimeoutId = null;
}

function resetChatMessageTimeout() {
    if (constants.mutableRefs.chatMessageTimeoutId) clearTimeout(constants.mutableRefs.chatMessageTimeoutId);
    constants.mutableRefs.chatMessageTimeoutId = setTimeout(clearLocalChatMessage, CHAT_MESSAGE_TIMEOUT_MS);
}

export const handleGlobalKeyDown = (event) => {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.BlocklyInstance || !constants.mutableRefs.localChatElementsRef?.group || !constants.mutableRefs.currentWorkspaceSvg) return;

    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
    const isBlocklyInputFocused = activeElement && activeElement.closest('.blocklyDialog') !== null;

    if (isInputFocused || isBlocklyInputFocused) {
        clearLocalChatMessage();
        return;
    }

    const isWorkspaceFocused = activeElement === document.body || activeElement === document.documentElement || activeElement?.closest('.blocklySvg');
    if (!isWorkspaceFocused) {
        clearLocalChatMessage();
        return;
    }

    let messageChanged = false;
    if (event.key === 'Backspace') {
        if (constants.mutableRefs.localChatMessage.length > 0) {
            constants.mutableRefs.localChatMessage = constants.mutableRefs.localChatMessage.slice(0, -1);
            messageChanged = true;
            event.preventDefault(); 
        }
    }
    else if (event.key === 'Escape') {
        if (constants.mutableRefs.localChatMessage.length > 0) {
            clearLocalChatMessage();
            event.preventDefault();
        }
    }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key >= ' ' || event.key === 'Unidentified') {
            if (constants.mutableRefs.localChatMessage.length < 100) {
                constants.mutableRefs.localChatMessage += event.key;
                messageChanged = true;
                event.preventDefault();
            }
        }
    }

    if (messageChanged) {
        constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('chatMessage', constants.mutableRefs.localChatMessage || null);
        resetChatMessageTimeout(); 
        const localState = constants.mutableRefs.yjsAwarenessInstance.getLocalState();
        updateLocalChat(constants.mutableRefs.localChatMessage, constants.localUserInfo, localState?.cursor);
    }
};

export function ensureCollaborationLayerOnTop() {
    if (constants.mutableRefs.collaborationLayerGroup?.parentNode && constants.mutableRefs.collaborationLayerGroup.parentNode.lastChild !== constants.mutableRefs.collaborationLayerGroup) {
        constants.mutableRefs.collaborationLayerGroup.parentNode.appendChild(constants.mutableRefs.collaborationLayerGroup);
    }
}

export function setupCollaborationLayer() {
    const workspace = constants.editorWorkspace();
    if (!workspace) return;

    if (constants.mutableRefs.isViewer) applyViewerWorkspace(workspace);

    const newWorkspaceSvg = workspace.getParentSvg(); 
    const workspaceGroup = newWorkspaceSvg?.querySelector('.blocklyBlockCanvas');

    if (!newWorkspaceSvg || !workspaceGroup) {
        
        if (constants.mutableRefs.currentWorkspaceSvg && constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
        if (constants.mutableRefs.currentWorkspaceSvg && constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
        if (constants.mutableRefs.blocklyCanvasObserver) { constants.mutableRefs.blocklyCanvasObserver.disconnect(); constants.mutableRefs.blocklyCanvasObserver = null; }

        if (constants.mutableRefs.collaborationLayerGroup) {
            constants.mutableRefs.collaborationLayerGroup.innerHTML = ''; 
            constants.mutableRefs.collaborationLayerGroup.remove(); 
        }
        cursorElements.clear(); 
        localChatElements = { group: null, rect: null, text: null }; 

        constants.mutableRefs.currentWorkspaceSvg = null;
        constants.mutableRefs.collaborationLayerGroup = null;
        constants.mutableRefs.localChatElementsRef = null;
        return;
    }

    if (constants.mutableRefs.currentWorkspaceSvg && constants.mutableRefs.currentWorkspaceSvg !== newWorkspaceSvg) {
        if (constants.mutableRefs.throttledMouseMoveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
        if (constants.mutableRefs.pointerLeaveHandler) constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);

        if (constants.mutableRefs.blocklyCanvasObserver) {
            constants.mutableRefs.blocklyCanvasObserver.disconnect();
            constants.mutableRefs.blocklyCanvasObserver = null;
        }

        if (constants.mutableRefs.collaborationLayerGroup) {
            constants.mutableRefs.collaborationLayerGroup.innerHTML = '';
            constants.mutableRefs.collaborationLayerGroup.remove();
        }

        cursorElements.clear();
        localChatElements = { group: null, rect: null, text: null };
        constants.mutableRefs.collaborationLayerGroup = null;
        constants.mutableRefs.localChatElementsRef = null;
    }

    constants.mutableRefs.currentWorkspaceSvg = newWorkspaceSvg;

    constants.mutableRefs.collaborationLayerGroup = constants.mutableRefs.currentWorkspaceSvg.querySelector('#' + COLLABORATION_LAYER_ID);
    if (!constants.mutableRefs.collaborationLayerGroup) {
        constants.mutableRefs.collaborationLayerGroup = document.createElementNS(SVG_NS, 'g');
        constants.mutableRefs.collaborationLayerGroup.setAttribute('id', COLLABORATION_LAYER_ID);
        constants.mutableRefs.collaborationLayerGroup.style.pointerEvents = 'none'; 
        workspaceGroup.appendChild(constants.mutableRefs.collaborationLayerGroup);
    } else {
        if (constants.mutableRefs.collaborationLayerGroup.parentNode !== workspaceGroup) {
            workspaceGroup.appendChild(constants.mutableRefs.collaborationLayerGroup);
        }
        ensureCollaborationLayerOnTop(); 
    }

    if (!localChatElements.group) {
        constants.mutableRefs.localChatElementsRef = createLocalChatElements(constants.mutableRefs.collaborationLayerGroup);
    } else {
        if (localChatElements.group.parentNode !== constants.mutableRefs.collaborationLayerGroup) {
            constants.mutableRefs.collaborationLayerGroup.appendChild(localChatElements.group);
        }
        constants.mutableRefs.localChatElementsRef = localChatElements;
    }

    if (constants.mutableRefs.localChatMessage && constants.mutableRefs.localChatElementsRef?.group) {
        const localState = constants.mutableRefs.yjsAwarenessInstance?.getLocalState();
        updateLocalChat(constants.mutableRefs.localChatMessage, constants.localUserInfo, localState?.cursor);
    } else {
        setLocalChatVisibility(false); 
    }

    if (!constants.mutableRefs.throttledMouseMoveHandler) {
        constants.mutableRefs.throttledMouseMoveHandler = helper.throttle((e) => {
            const currentWorkspace = constants.editorWorkspace();
            if (!currentWorkspace || !currentWorkspace.getParentSvg() || !currentWorkspace.getCanvas() || !constants.mutableRefs.yjsAwarenessInstance) return;
            if (e.target?.closest('.blocklyFlyout') || currentWorkspace.isFlyout) return;

            try {
                const svg = constants.mutableRefs.currentWorkspaceSvg;
                const canvas = currentWorkspace.getCanvas();
                if (!svg || !canvas) return;

                let inverseSvgMatrix = currentWorkspace.getInverseScreenCTM?.();
                if (!inverseSvgMatrix) { 
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

                constants.mutableRefs.yjsAwarenessInstance.setLocalStateField('cursor', { x: workspacePoint.x, y: workspacePoint.y });
                if (constants.mutableRefs.localChatElementsRef?.group && constants.mutableRefs.localChatMessage) {
                    updateLocalChat(constants.mutableRefs.localChatMessage, constants.localUserInfo, workspacePoint);
                }
            } catch (error) {
                constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            }
        }, CURSOR_UPDATE_THROTTLE_MS); 
    }
    constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);
    constants.mutableRefs.currentWorkspaceSvg.addEventListener('pointermove', constants.mutableRefs.throttledMouseMoveHandler);

    if (!constants.mutableRefs.pointerLeaveHandler) {
        constants.mutableRefs.pointerLeaveHandler = () => {
            constants.mutableRefs.yjsAwarenessInstance?.setLocalStateField('cursor', null);
            setLocalChatVisibility(false);
        };
    }
    constants.mutableRefs.currentWorkspaceSvg.removeEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);
    constants.mutableRefs.currentWorkspaceSvg.addEventListener('pointerleave', constants.mutableRefs.pointerLeaveHandler);

    if (!constants.mutableRefs.blocklyCanvasObserver || constants.mutableRefs.blocklyCanvasObserver.target !== workspaceGroup) {
        if (constants.mutableRefs.blocklyCanvasObserver) {
            constants.mutableRefs.blocklyCanvasObserver.disconnect(); 
            constants.mutableRefs.blocklyCanvasObserver = null;
        }
        if (workspaceGroup) {
            const observerCallback = (mutationsList) => {
                if (constants.mutableRefs.collaborationLayerGroup?.parentNode && constants.mutableRefs.collaborationLayerGroup.parentNode.lastChild !== constants.mutableRefs.collaborationLayerGroup) {
                    let layerAddedInMutation = false;
                    for (const mutation of mutationsList) {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach(node => { if (node === constants.mutableRefs.collaborationLayerGroup) layerAddedInMutation = true; });
                        }
                    }
                    if (!layerAddedInMutation) ensureCollaborationLayerOnTop(); 
                }
            };
            constants.mutableRefs.blocklyCanvasObserver = new MutationObserver(observerCallback);
            constants.mutableRefs.blocklyCanvasObserver.observe(workspaceGroup, { childList: true });
        }
    }

    if (constants.mutableRefs.yjsAwarenessInstance && constants.mutableRefs.collaborationLayerGroup) {
        const states = presence.collabStates();
        const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
        states.forEach((state, clientID) => {
            if (clientID === localClientID) return; 

            const user = state.user;
            if (user) { 
                createOrUpdateRemoteCursor(clientID, state, constants.mutableRefs.collaborationLayerGroup, constants.debugging);
            }
        });
    }
}

let undoRedoOverride = false;
export function setUndoRedoOverride() {
    undoRedoOverride = true;
    setTimeout(() => {
        undoRedoOverride = false;
    }, 1000); 
}

export function updateUserMenuBarIcons() {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.userIconContainer) return;

    const states = presence.collabStates(); 
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
    const currentlyDisplayed = new Set(constants.remoteUserIcons.keys());
    const activeRemoteClientIDs = new Set(); 

    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; 

        const user = state.user;
        const isInactive = state.isInactive || false; 

        if (JSON.stringify(state) === JSON.stringify({})) {
            return;
        }
        if (!user || !user.name || !user.color) {
            return;
        }
        activeRemoteClientIDs.add(clientID); 

        let iconElement = constants.remoteUserIcons.get(clientID); 
        const displayColor = user.color; 

        if (!iconElement) {
            iconElement = document.createElement('div');
            iconElement.classList.add('collaboration-user-icon');
            iconElement.style.backgroundColor = displayColor;
            iconElement.style.opacity = isInactive ? '0.5' : '1'; 
            iconElement.title = isInactive ? `${user.name} (inactive)` : user.name; 
            const initials = user.name.slice(0, 1).toUpperCase(); 
            iconElement.textContent = initials;

            constants.mutableRefs.userIconContainer.appendChild(iconElement); 
            constants.remoteUserIcons.set(clientID, iconElement); 
        } else {
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
        currentlyDisplayed.delete(clientID); 
    });

    currentlyDisplayed.forEach(clientID => {
        const iconToRemove = constants.remoteUserIcons.get(clientID);
        if (iconToRemove) {
            iconToRemove.remove(); 
            constants.remoteUserIcons.delete(clientID); 
        }
    });
}

export function updateSpriteUserIcons() {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.vm) return;

    const states = presence.collabStates(); 
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
    const spriteListElement = document.querySelector('[class*="sprite-selector_items-wrapper"]'); 
    const stageElement = document.querySelectorAll('[class*="stage-selector_stage-selector"]')[0];

    const stageTarget = constants.mutableRefs.vm.runtime?.getTargetForStage();
    const stageName = stageTarget?.isStage ? stageTarget.getName() : 'Stage';
    const stageId = stageTarget?.id;

    if (!spriteListElement && !stageElement) {
        constants.spriteIconContainers.forEach(({ container }) => container.remove());
        constants.spriteIconContainers.clear();
        return;
    }

    const usersByTargetId = new Map(); 
    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; 
        const targetId = state.currentTargetId; 
        const user = state.user;
        if (targetId && user) {
            if (!usersByTargetId.has(targetId)) {
                usersByTargetId.set(targetId, new Set());
            }
            usersByTargetId.get(targetId).add(clientID);
        }
    });

    const currentTargetIdsProcessed = new Set(); 

    const processTargetElement = (targetElement, targetId) => {
        if (!targetElement || !targetId) return;
        currentTargetIdsProcessed.add(targetId); 

        const usersOnThisTarget = usersByTargetId.get(targetId) || new Set(); 
        let targetData = constants.spriteIconContainers.get(targetId); 

        if (!targetData) {
            const container = document.createElement('div');
            container.className = constants.SPRITE_ICON_CONTAINER_CLASS;
            if (targetElement === stageElement) {
                container.style.position = 'initial';
            }
            if (getComputedStyle(targetElement).position === 'static') {
                targetElement.style.position = 'relative';
            }
            targetElement.appendChild(container);
            targetData = { container, icons: new Map() };
            constants.spriteIconContainers.set(targetId, targetData);
        } else {
            if (targetData.container.parentElement !== targetElement) {
                targetElement.appendChild(targetData.container);
                if (getComputedStyle(targetElement).position === 'static') {
                    targetElement.style.position = 'relative';
                }
            }
            if (targetElement === stageElement && targetData.container.style.position !== 'initial') {
                targetData.container.style.position = 'initial';
            }
        }

        const { container, icons } = targetData;
        const currentlyDisplayedIcons = new Set(icons.keys()); 

        usersOnThisTarget.forEach(clientID => {
            const userState = states.get(clientID);
            if (!userState || !userState.user) return; 
            const user = userState.user;

            let iconElement = icons.get(clientID); 
            if (!iconElement) {
                iconElement = document.createElement('div');
                iconElement.className = constants.SPRITE_USER_ICON_CLASS;
                iconElement.style.backgroundColor = user.color;
                iconElement.title = user.name;
                container.appendChild(iconElement);
                icons.set(clientID, iconElement);
            } else {
                if (iconElement.style.backgroundColor !== user.color) {
                    iconElement.style.backgroundColor = user.color;
                }
                if (iconElement.title !== user.name) {
                    iconElement.title = user.name;
                }
            }
            currentlyDisplayedIcons.delete(clientID); 
        });

        currentlyDisplayedIcons.forEach(clientID => {
            const iconToRemove = icons.get(clientID);
            iconToRemove?.remove();
            icons.delete(clientID);
        });

        if (usersOnThisTarget.size === 0 && icons.size === 0) {
            container.remove();
            constants.spriteIconContainers.delete(targetId);
        }
    };

    if (stageElement && stageId) {
        processTargetElement(stageElement, stageId);
    }

    if (spriteListElement) {
        spriteListElement.querySelectorAll('[class*="sprite-selector_sprite-wrapper"]').forEach(spriteWrapper => {
            const nameElement = spriteWrapper.querySelector('[class*="sprite-selector-item_sprite-name"]');
            const spriteItemElement = spriteWrapper.querySelector('[class*="sprite-selector-item_sprite-selector-item"]');

            if (nameElement && spriteItemElement) {
                const spriteName = nameElement.textContent;
                const targetId = helper.getTargetIdByName(spriteName);
                if (targetId) {
                    processTargetElement(spriteItemElement, targetId);
                }
            }
        });
    }

    const trackedTargetIds = new Set(constants.spriteIconContainers.keys());
    trackedTargetIds.forEach(targetId => {
        if (!currentTargetIdsProcessed.has(targetId)) {
            const targetData = constants.spriteIconContainers.get(targetId);
            targetData?.container.remove();
            constants.spriteIconContainers.delete(targetId);
        }
    });
}

export function updateTabUserIcons() {
    if (!constants.mutableRefs.yjsAwarenessInstance || !constants.mutableRefs.vm) return;

    const states = presence.collabStates();
    const localClientID = constants.mutableRefs.yjsAwarenessInstance.clientID;
    const tabElements = document.querySelectorAll(constants.TAB_SELECTOR); 
    const localUserCurrentTargetId = constants.localUserInfo.currentTargetId; 

    if (tabElements.length === 0) {
        constants.tabIconContainers.forEach(({ container }) => container.remove());
        constants.tabIconContainers.clear();
        return;
    }

    const usersByTabIndex = new Map(); 
    states.forEach((state, clientID) => {
        if (clientID === localClientID) return; 

        const activeTabIndex = state.activeTabIndex;
        const user = state.user;
        const remoteUserCurrentTargetId = state.currentTargetId; 

        const isOnSameTarget = remoteUserCurrentTargetId === localUserCurrentTargetId;

        if (isOnSameTarget &&
            typeof activeTabIndex === 'number' &&
            user && user.name && user.color) { 
            if (!usersByTabIndex.has(activeTabIndex)) {
                usersByTabIndex.set(activeTabIndex, new Set());
            }
            usersByTabIndex.get(activeTabIndex).add(clientID);
        }
    });

    const currentTabIndicesProcessed = new Set(); 

    tabElements.forEach((tabElement, tabIndex) => {
        currentTabIndicesProcessed.add(tabIndex);
        const usersOnThisTab = usersByTabIndex.get(tabIndex) || new Set();
        let tabData = constants.tabIconContainers.get(tabIndex);

        if (getComputedStyle(tabElement).position === 'static') {
            tabElement.style.position = 'relative';
        }

        if (!tabData) {
            const container = document.createElement('div');
            container.className = constants.TAB_ICON_CONTAINER_CLASS;
            tabElement.appendChild(container);
            tabData = { container, icons: new Map() };
            constants.tabIconContainers.set(tabIndex, tabData);
        } else {
            if (tabData.container.parentNode !== tabElement) {
                tabData.container.remove(); 
                tabElement.appendChild(tabData.container); 
                if (getComputedStyle(tabElement).position === 'static') {
                    tabElement.style.position = 'relative';
                }
            }
        }

        const { container, icons } = tabData;
        const currentlyDisplayedIconsOnThisTab = new Set(icons.keys());

        usersOnThisTab.forEach(clientID => {
            const userState = states.get(clientID);
            const user = userState.user; 

            let iconElement = icons.get(clientID);
            if (!iconElement) {
                iconElement = document.createElement('div');
                iconElement.className = constants.TAB_USER_ICON_CLASS;
                iconElement.style.backgroundColor = user.color;
                iconElement.title = user.name; 
                container.appendChild(iconElement);
                icons.set(clientID, iconElement);
            } else {
                if (iconElement.style.backgroundColor !== user.color) {
                    iconElement.style.backgroundColor = user.color;
                }
                if (iconElement.title !== user.name) {
                    iconElement.title = user.name;
                }
            }
            currentlyDisplayedIconsOnThisTab.delete(clientID); 
        });

        currentlyDisplayedIconsOnThisTab.forEach(clientID => {
            const iconToRemove = icons.get(clientID);
            iconToRemove?.remove();
            icons.delete(clientID);
        });

        if (usersOnThisTab.size === 0) {
            container.style.display = 'none'; 
        } else {
            container.style.display = 'flex'; 
        }
    });

    const trackedTabIndices = new Set(constants.tabIconContainers.keys());
    trackedTabIndices.forEach(tabIndex => {
        if (!currentTabIndicesProcessed.has(tabIndex)) {
            const tabData = constants.tabIconContainers.get(tabIndex);
            tabData?.container.remove();
            constants.tabIconContainers.delete(tabIndex);
        }
    });
}

export function showSyncingPopup() {
    if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
        constants.mutableRefs.addon.tab.redux.dispatch({
            type: 'scratch-gui/collaboration/SET_SYNCING', 
            payload: true
        });
    } else {
        window.syncingCollab_fallback = true; 
    }
}

export function hideSyncingPopup() {
    if (constants.mutableRefs.addon?.tab?.redux?.dispatch) {
        constants.mutableRefs.addon.tab.redux.dispatch({
            type: 'scratch-gui/collaboration/SET_SYNCING', 
            payload: false
        });
    } else {
        delete window.syncingCollab_fallback; 
    }
}

export function setupCSS() {
    document.getElementById("collaborative-cursor-styles")?.remove(); 
    document.getElementById("collaborative-svg-cursor-styles")?.remove(); 

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
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.id = "collaborative-svg-cursor-styles"; 
    styleSheet.innerText = svgCursorStyles;
    document.head.appendChild(styleSheet);
}

export function getActiveRemoteClientIDs() {
    return new Set(cursorElements.keys());
}

/*
 * Telling somebody they are watching.
 */
const VIEWER_BANNER_ID = 'collaboration-viewer-banner';

export function showViewerBanner() {
    if (document.getElementById(VIEWER_BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = VIEWER_BANNER_ID;
    banner.textContent = 'You are watching this project. Ask the owner for edit access.';
    banner.style.cssText = [
        'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:16px',
        'z-index:9999', 'pointer-events:none',
        'background:rgba(35,39,50,0.94)', 'color:#ffffff',
        'font-family:"Helvetica Neue", Helvetica, Arial, sans-serif', 'font-size:13px',
        'padding:8px 16px', 'border-radius:16px', 'box-shadow:0 2px 8px rgba(0,0,0,.35)'
    ].join(';');
    document.body.appendChild(banner);
}

export function hideViewerBanner() {
    document.getElementById(VIEWER_BANNER_ID)?.remove();
}

const VIEWER_STYLE_ID = 'collaboration-viewer-styles';

export function applyViewerWorkspace(workspace) {
    if (!document.getElementById(VIEWER_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = VIEWER_STYLE_ID;

        style.textContent = `
        .blocklyBlockCanvas, .blocklyFlyout { pointer-events: none; }

        [class*="sprite-selector_add-button"],
        [class*="stage-selector_add-button"],
        [class*="selector_new-buttons"],
        [class*="sprite-selector-item_delete-button"] { display: none !important; }

        [class*="sprite-info_sprite-info"] { pointer-events: none; opacity: .6; }

        [class*="paint-editor_canvas-container"],
        [class*="paint-editor_mode-selector"],
        [class*="paint-editor_editor-container-top"] { pointer-events: none; }

        [class*="sound-editor_effects"],
        [class*="sound-editor_button-group"],
        [class*="sound-editor_name-input"],
        [class*="sound-editor_input-group"] { pointer-events: none; opacity: .6; }
        `;
        document.head.appendChild(style);
    }
    if (!workspace || !workspace.options) return;
    workspace.options.readOnly = true;
    const flyout = workspace.getFlyout && workspace.getFlyout();
    const flyoutWorkspace = flyout && flyout.getWorkspace && flyout.getWorkspace();
    if (flyoutWorkspace && flyoutWorkspace.options) flyoutWorkspace.options.readOnly = true;
}

export function clearViewerWorkspace() {
    document.getElementById(VIEWER_STYLE_ID)?.remove();
}
