import showdown from 'showdown';
import helpers from '../helpers/helpers.js';
import {sanitize, escapeHTML} from '../util/sanitize.js';
import {
    store,
    getActiveSession,
    getSessionTitle,
    createNewSession,
    closeSession,
    updateAndSaveSession,
    saveActiveSessionMetadata
} from '../state/sessions.js';
import {closeHost} from './host.js';
import {
    getInputText,
    setInputText,
    focusInput,
    getSelectedModelId,
    getAttachmentType,
    renderAttachmentUI,
    renderSettingsUI,
    syncStreamingState
} from './composer.js';

const converter = new showdown.Converter();

export const FENCE_REGEX = /```[\s\S]*?```/g;
export const CODE_CHUNK_TOKEN = 'CODECHUNK23407283947';

function getPaneWrapper () {
    return document.getElementById('chat_content_wrapper');
}

export function getPaneForSession (sessionId) {
    const wrapper = getPaneWrapper();
    if (!wrapper) return null;
    return wrapper.querySelector(`.chat-content-pane[data-session-id="${sessionId}"]`);
}

export function clearAllPanes () {
    const wrapper = getPaneWrapper();
    if (wrapper) wrapper.textContent = '';
}

export function saveSessionStateFromUI (session) {
    if (!session) return;
    const pane = getPaneForSession(session.id);
    if (pane) session.domCache = pane.innerHTML;
    session.inputText = getInputText();
    session.selectedModelId = getSelectedModelId() || session.selectedModelId;
    session.allowCustomExtensions = true;
    session.attachmentType = getAttachmentType() || session.attachmentType;
    updateAndSaveSession(session);
}

export function switchSession (sessionId) {
    store.activeSessionId = sessionId;
    saveActiveSessionMetadata();
    renderChatUI();
    renderActiveSessionContent();
}

export function startNewSessionUI () {
    const current = getActiveSession();
    if (current) saveSessionStateFromUI(current);
    const session = createNewSession();
    switchSession(session.id);
}

export function closeSessionUI (sessionId) {
    const pane = getPaneForSession(sessionId);
    if (pane) pane.remove();

    closeSession(sessionId);

    if (store.sessions.length === 0) {
        closeHost();
        return;
    }
    renderChatUI();
    renderActiveSessionContent();
}

function buildTab (session) {
    const tab = document.createElement('div');
    tab.className = `chat-tab${session.id === store.activeSessionId ? ' active' : ''}`;
    tab.dataset.sessionId = session.id;

    const label = document.createElement('span');
    label.textContent = session.name;
    const title = getSessionTitle(session);
    if (title) tab.title = title;

    const close = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    close.setAttribute('viewBox', '0 0 24 24');
    close.setAttribute('fill', 'none');
    close.setAttribute('stroke', 'currentColor');
    close.setAttribute('stroke-width', '1.5');
    close.setAttribute('class', 'size-6 close-tab');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 18 18 6M6 6l12 12');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    close.appendChild(path);

    tab.append(label, close);
    tab.addEventListener('click', e => {
        if (e.target.closest('.close-tab')) {
            closeSessionUI(session.id);
            return;
        }
        const current = getActiveSession();
        if (current) saveSessionStateFromUI(current);
        switchSession(session.id);
    });
    return tab;
}

export function renderChatUI () {
    const tabsContainer = document.getElementById('chat_tabs_container');
    if (!tabsContainer) return;
    tabsContainer.textContent = '';

    store.sessions.forEach(session => tabsContainer.appendChild(buildTab(session)));

    const newTab = document.createElement('div');
    newTab.className = 'new-chat-tab';
    newTab.id = 'new_chat_tab';
    newTab.title = 'New chat';
    newTab.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" ' +
        'stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" ' +
        'd="M12 4.5v15m7.5-7.5h-15" /></svg>';
    newTab.addEventListener('click', () => startNewSessionUI());
    tabsContainer.appendChild(newTab);
}

export function renderActiveSessionContent () {
    const wrapper = getPaneWrapper();
    if (!wrapper) return;

    const activeSession = getActiveSession();
    wrapper.querySelectorAll('.chat-content-pane').forEach(pane => {
        pane.style.display = 'none';
    });

    if (!activeSession) {
        setInputText('');
        return;
    }

    let activePane = getPaneForSession(activeSession.id);
    if (!activePane) {
        activePane = document.createElement('div');
        activePane.className = 'chat-content-pane';
        activePane.dataset.sessionId = activeSession.id;
        if (activeSession.domCache) {
            activePane.innerHTML = activeSession.domCache;
            restoreInteractivity(activePane);
        } else {
            rehydrateChatPane(activeSession, activePane);
        }
        wrapper.appendChild(activePane);
    }

    activePane.style.display = 'block';
    activePane.scrollTop = activePane.scrollHeight;

    setInputText(activeSession.inputText || '');
    renderAttachmentUI();
    renderSettingsUI();
    syncStreamingState();
}

function buildAttachmentChip (name) {
    const chip = document.createElement('div');
    chip.className = 'FileAttachment';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.classList.add('svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
        'd',
        'M2 7V14.7519H4.53246L5.9122 16.0909H8.12402L9.50376 14.7519H22V7H9.50376L8.12402 8.33905H5.9122L4.53246 7H2Z'
    );
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke', 'currentcolor');
    svg.appendChild(path);

    const text = document.createElement('p');
    text.className = 'p';
    text.textContent = name;

    chip.append(svg, text);
    return chip;
}

/**
 * @param {number} turnIndex index this message has (or will have) in `session.chatHistory`;
 *     editing the message rolls the chat back to it.
 */
export function appendUserMessage (pane, text, attachmentName, turnIndex) {
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.dataset.turnIndex = String(turnIndex);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'torchy-edit-message';
    edit.title = 'Edit this message';
    edit.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" ' +
        'stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" ' +
        'd="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>';
    userMessage.appendChild(edit);

    const message = document.createElement('div');
    message.className = 'message';

    const span = document.createElement('span');
    span.textContent = text;
    message.appendChild(span);

    if (attachmentName) message.appendChild(buildAttachmentChip(attachmentName));

    userMessage.appendChild(message);
    pane.appendChild(userMessage);
    attachEditButtonListeners(userMessage);
    return userMessage;
}

const ROLLBACK_WARNING_HTML =
    '<p>Editing goes back to this point in the chat: this message and everything after it, ' +
    "including Torchy's answers, will be deleted. The message is put back in the text box so you can change it " +
    'and send it again.</p><br><p>Code you already added to your workspace is not touched.</p>';

function countCodeChunks (history) {
    return history.reduce((count, turn) => {
        if (turn.role !== 'assistant') return count;
        return count + (String(turn.message || '').match(FENCE_REGEX) || []).length;
    }, 0);
}

function rollbackToTurn (session, turnIndex, text) {
    const pane = getPaneForSession(session.id);
    const kept = session.chatHistory.slice(0, Math.max(0, Math.min(turnIndex, session.chatHistory.length)));
    session.chatHistory = kept;
    session.allCodeChunksEverAdded = session.allCodeChunksEverAdded.slice(0, countCodeChunks(kept));
    session.domCache = null;
    session.inputText = text;
    if (pane) rehydrateChatPane(session, pane);
    if (session.id === store.activeSessionId) {
        setInputText(text);
        focusInput();
    }
    renderChatUI();
    updateAndSaveSession(session);
}

function attachEditButtonListeners (parentElement) {
    if (!parentElement) return;
    parentElement.querySelectorAll('.torchy-edit-message').forEach(button => {
        if (button.dataset.listenerAttached) return;
        button.dataset.listenerAttached = 'true';
        button.addEventListener('click', () => {
            const session = getActiveSession();
            const userMessage = button.closest('.user-message');
            if (!session || !userMessage) return;
            if (session.isBlabbering) {
                helpers.showAlert('TorchyWaitForAIToFinishWarning');
                return;
            }
            const turnIndex = Number(userMessage.dataset.turnIndex);
            if (!Number.isInteger(turnIndex)) return;
            const textEl = userMessage.querySelector('.message > span');
            const text = textEl ? textEl.textContent : '';

            const ScratchBlocks = window.ScratchBlocks;
            if (!ScratchBlocks || typeof ScratchBlocks.prompt !== 'function') return;
            ScratchBlocks.prompt(
                ROLLBACK_WARNING_HTML,
                null,
                () => {
                    if (session.isBlabbering) return;
                    rollbackToTurn(session, turnIndex, text);
                },
                'Edit this message?',
                ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE,
                true
            );
        });
    });
}

export function removeWelcomeHeader (pane) {
    const header = pane.querySelector('.Popup_Header');
    if (header) header.remove();
}

export function appendLoadingDots (pane, sessionId) {
    const dots = document.createElement('div');
    dots.className = 'ai-message torchy-loading-dots';
    dots.dataset.sessionId = sessionId;
    dots.innerHTML = '<div class="message" style="width: 22px;"><div class="dot-elastic"></div></div>';
    pane.appendChild(dots);
    return dots;
}

export function createAssistantMessage (pane) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message';
    const messageEl = document.createElement('p');
    messageEl.className = `message ${helpers.isLightTheme() ? 'animated-text-light' : 'animated-text'}`;
    messageEl.textContent = 'loading...';
    wrapper.appendChild(messageEl);
    pane.appendChild(wrapper);
    return messageEl;
}

export function renderStreamingMarkdown (text, chunkCount) {
    const animatedClass = helpers.isLightTheme() ? 'animated-text-light' : 'animated-text';
    let html = String(text).replace(
        FENCE_REGEX,
        '<div class="codeChunkOverlay"><p>Currently Processing Code Block</p></div>'
    );
    html = html.replace(
        /```[\s\S]*$/,
        `<div><p class="${animatedClass}">currently writing a code block</p>` +
            `<p class="torchy-chunk-count">(Received ${chunkCount} chunks)</p></div>`
    );
    return sanitize(converter.makeHtml(html));
}

export function isPinnedToBottom (pane) {
    if (!pane) return false;
    return pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
}

export function scrollToBottom (pane) {
    if (pane) pane.scrollTop = pane.scrollHeight;
}

function fenceBody (rawCode) {
    return String(rawCode || '')
        .replace(/^```[^\n]*\n?/, '')
        .replace(/```\s*$/, '');
}

function buildRawBlock (text, heading) {
    if (!heading) {
        const pre = document.createElement('pre');
        pre.className = 'raw-code-block';
        pre.textContent = text;
        return pre;
    }
    const block = document.createElement('div');
    block.className = 'raw-code-block';
    const title = document.createElement('h1');
    title.className = 'errorMessage';
    title.textContent = heading;
    const pre = document.createElement('pre');
    pre.textContent = text;
    block.append(title, pre);
    return block;
}

function buildWarningsNode (warnings) {
    const wrap = document.createElement('div');
    wrap.className = 'torchy-warnings';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'torchy-warnings-toggle';
    toggle.textContent = `${warnings.length} lines could not be converted`;

    const list = document.createElement('ul');
    list.className = 'torchy-warnings-list';
    list.hidden = true;
    warnings.forEach(warning => {
        const item = document.createElement('li');
        item.textContent = warning && warning.text ? warning.text : String(warning);
        list.appendChild(item);
    });

    toggle.addEventListener('click', () => {
        list.hidden = !list.hidden;
    });
    wrap.append(toggle, list);
    return wrap;
}

export function sizeSvgMarkup (markup) {
    if (!markup) return '';
    const holder = document.createElement('div');
    holder.style.cssText =
        'position:absolute;opacity:0;pointer-events:none;z-index:-9999;width:500px;left:0;top:0;';
    const inner = document.createElement('div');
    inner.innerHTML = markup;
    holder.appendChild(inner);
    document.body.appendChild(holder);

    let result = markup;
    try {
        const previewWrapper = inner.children[0];
        if (previewWrapper) {
            for (let i = 0; i < previewWrapper.children.length; i++) {
                const svgElement = previewWrapper.children[i];
                const measured = svgElement.children[1] || svgElement;
                const width = measured.getBBox().width;
                const height = measured.getBoundingClientRect().height;
                svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
                svgElement.setAttribute('width', width);
                svgElement.setAttribute('height', height);
            }
            result = previewWrapper.outerHTML;
        }
    } catch (e) {
        console.error('[Torchy] could not measure block preview', e);
    } finally {
        holder.remove();
    }
    return result;
}

export function buildChunkNode (chunkData, uniqueIndex) {
    if (!chunkData) return buildRawBlock('Raw code unavailable', 'failed to parse Code Chunk');

    const status = chunkData.status || (chunkData.renderedHTML ? 'success' : 'error');

    if (status === 'skipped') {
        return buildRawBlock(fenceBody(chunkData.rawCode), null);
    }

    if (!chunkData.renderedHTML && chunkData.blocksAsSVG) {
        chunkData.renderedHTML = sizeSvgMarkup(chunkData.blocksAsSVG);
    }

    if (status !== 'success' || !chunkData.renderedHTML) {
        return buildRawBlock(chunkData.rawCode || 'Raw code unavailable', 'failed to parse Code Chunk');
    }

    const overlay = document.createElement('div');
    overlay.className = 'codeChunkOverlay';

    const buttonParent = document.createElement('div');
    buttonParent.className = 'insert_button_parent';
    const insertButton = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    insertButton.setAttribute('viewBox', '0 0 24 24');
    insertButton.setAttribute('fill', 'none');
    insertButton.setAttribute('stroke', 'currentColor');
    insertButton.setAttribute('stroke-width', '1.5');
    insertButton.setAttribute('class', 'size-6 insert_button');
    insertButton.setAttribute('uniqueid', String(uniqueIndex));
    const plus = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    plus.setAttribute('d', 'M12 4.5v15m7.5-7.5h-15');
    plus.setAttribute('stroke-linecap', 'round');
    plus.setAttribute('stroke-linejoin', 'round');
    insertButton.appendChild(plus);
    buttonParent.appendChild(insertButton);

    const child = document.createElement('div');
    child.className = 'codeChunkOverlay_child';
    const preview = document.createElement('div');
    preview.innerHTML = chunkData.renderedHTML;
    child.appendChild(preview);

    overlay.append(buttonParent, child);

    if (Array.isArray(chunkData.warnings) && chunkData.warnings.length > 0) {
        overlay.appendChild(buildWarningsNode(chunkData.warnings));
    }

    attachInsertButtonListeners(overlay);
    return overlay;
}

export function replacePlaceholders (root, token, factory) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
        if (node.nodeValue.indexOf(token) !== -1) textNodes.push(node);
        node = walker.nextNode();
    }

    let index = 0;
    for (const textNode of textNodes) {
        const parts = textNode.nodeValue.split(token);
        const fragment = document.createDocumentFragment();
        parts.forEach((part, i) => {
            if (part) fragment.appendChild(document.createTextNode(part));
            if (i < parts.length - 1) {
                const element = factory(index++);
                if (element) fragment.appendChild(element);
            }
        });
        textNode.parentNode.replaceChild(fragment, textNode);
    }
    return index;
}

/** Markdown -> sanitised HTML, with every fence replaced by a placeholder token. */
export function renderMarkdownWithPlaceholders (text) {
    const withTokens = String(text).replace(FENCE_REGEX, CODE_CHUNK_TOKEN);
    return sanitize(converter.makeHtml(withTokens));
}

export function renderWelcome (pane) {
    pane.innerHTML =
        `<div class="Popup_Header"><div class="a">${
            helpers.FireAnimation
        }</div><p class="b">Hi I'm Torchy, How can I help you today?</p></div>`;
}

export function rehydrateChatPane (session, pane) {
    pane.textContent = '';

    if (!session.chatHistory || session.chatHistory.length === 0) {
        renderWelcome(pane);
        return;
    }

    let codeChunkCounter = 0;

    session.chatHistory.forEach((turn, turnIndex) => {
        if (turn.role === 'user') {
            const text = String(turn.message || '').split('\n\n\nContext:\n')[0];
            const attachmentName =
                turn.attachment && turn.attachment.type !== '0' ? turn.attachment.name : null;
            appendUserMessage(pane, text, attachmentName, turnIndex);
            return;
        }
        if (turn.role !== 'assistant') return;

        const aiMessage = document.createElement('div');
        aiMessage.className = 'ai-message';
        const messageEl = document.createElement('p');
        messageEl.className = 'message';
        messageEl.innerHTML = renderMarkdownWithPlaceholders(turn.message || '');
        replacePlaceholders(messageEl, CODE_CHUNK_TOKEN, () => {
            const index = codeChunkCounter++;
            return buildChunkNode(session.allCodeChunksEverAdded[index], index + 1);
        });
        aiMessage.appendChild(messageEl);
        pane.appendChild(aiMessage);
    });
}

function buildConfirmationMessage (chunkData, workspace) {
    const intro = '<p style="font-weight: 900;margin-bottom: 10px;">Adding this code will:</p><ul>';
    let message = intro;

    const [listNames, variableNames] = helpers.workspaceVariables(false, workspace);
    const quote = names => names.map(name => `"${escapeHTML(name)}"`).join(', ');

    const newVariables = chunkData.variables.filter(name => !variableNames.includes(name));
    const newLists = chunkData.lists.filter(name => !listNames.includes(name));
    const existingVariables = chunkData.variables.filter(name => variableNames.includes(name));
    const existingLists = chunkData.lists.filter(name => listNames.includes(name));

    if (newVariables.length > 0) {
        message += `<li>Create ${newVariables.length} new ${newVariables.length === 1 ? 'variable' : 'variables'}: ${quote(newVariables)}</li>`;
    }
    if (newLists.length > 0) {
        message += `<li>Create ${newLists.length} new ${newLists.length === 1 ? 'list' : 'lists'}: ${quote(newLists)}</li>`;
    }
    if (existingVariables.length > 0) {
        message += `<li>Use ${existingVariables.length} existing ${existingVariables.length === 1 ? 'variable' : 'variables'}: ${quote(existingVariables)}</li>`;
    }
    if (existingLists.length > 0) {
        message += `<li>Use ${existingLists.length} existing ${existingLists.length === 1 ? 'list' : 'lists'}: ${quote(existingLists)}</li>`;
    }

    const ScratchBlocks = window.ScratchBlocks;
    const currentWorkspaceBlocks = helpers.getCustomBlockNames(
        ScratchBlocks.Xml.domToText(ScratchBlocks.Xml.workspaceToDom(workspace))
    );
    const newBlocks = helpers.getCustomBlockNames(chunkData.BlocksAsXML);
    const replacingBlocks = [];
    const replacingBlockIds = [];
    const trulyNewBlocks = [];

    for (const block of newBlocks) {
        const match = currentWorkspaceBlocks.find(b => b.customBlockName === block.customBlockName);
        const displayName = block.customBlockName
            .replace(/%b/g, '< >')
            .replace(/%[sn]/g, '( )')
            .replace(/\s+/g, ' ')
            .trim();
        const cleanName = `"${escapeHTML(displayName)}"`;
        if (match) {
            replacingBlocks.push(cleanName);
            replacingBlockIds.push(match.blockId);
        } else {
            trulyNewBlocks.push(cleanName);
        }
    }

    if (trulyNewBlocks.length > 0) {
        message += `<li>Create ${trulyNewBlocks.length} new block${trulyNewBlocks.length > 1 ? 's' : ''}: ${trulyNewBlocks.join(', ')}</li>`;
    }
    if (replacingBlocks.length > 0) {
        message += `<li>Replace ${replacingBlocks.length} existing block${replacingBlocks.length > 1 ? 's' : ''}: ${replacingBlocks.join(', ')} <span><p class="errorMessage">(THIS WILL REPLACE YOUR CURRENT BLOCK DEFINITION)</p></span></li>`;
    }

    if (message === intro) {
        message = '<p>This code does not create/use any variables or lists.</p>';
    } else {
        message += '</ul>';
    }

    return {message, replacingBlockIds};
}

function insertChunkIntoWorkspace (chunkData, workspace, replacingBlockIds) {
    const ScratchBlocks = window.ScratchBlocks;
    const xml = ScratchBlocks.Xml.textToDom(chunkData.BlocksAsXML);
    const [listNames, variableNames, broadcastNames] = helpers.workspaceVariables(true, workspace);

    for (const name of chunkData.variables) {
        if (!variableNames.includes(name)) workspace.createVariable(name, '', null);
    }
    for (const name of chunkData.lists) {
        if (!listNames.includes(name)) workspace.createVariable(name, 'list', null);
    }
    for (const name of chunkData.broadcasts) {
        if (!broadcastNames.includes(name)) workspace.createVariable(name, 'broadcast_msg', null);
    }

    if (replacingBlockIds.length > 0) {
        workspace.getAllBlocks().forEach(block => {
            if (block.type === 'procedures_definition' && replacingBlockIds.includes(block.id)) {
                block.dispose();
            }
        });
    }

    const scale = workspace.scale || 1;
    const baseX = (30 - workspace.scrollX) / scale;
    const baseY = (30 - workspace.scrollY) / scale;
    let offsetX = 0;

    Array.from(xml.children).forEach(blockDom => {
        const newBlock = ScratchBlocks.Xml.domToBlock(blockDom, workspace);
        try {
            newBlock.moveBy(baseX + offsetX, baseY);
        } catch (e) {
            console.error('[Torchy] failed to move block', e);
        }
        const rect = newBlock.getBoundingRectangle();
        offsetX += rect.bottomRight.x - rect.topLeft.x + 20;
    });

    if (typeof workspace.refreshToolboxSelection_ === 'function') {
        workspace.refreshToolboxSelection_();
    }
}

export function restoreInteractivity (pane) {
    if (!pane) return;
    pane.querySelectorAll('.insert_button, .torchy-edit-message').forEach(button => {
        delete button.dataset.listenerAttached;
    });
    attachInsertButtonListeners(pane);
    attachEditButtonListeners(pane);
    pane.querySelectorAll('.torchy-warnings').forEach(wrap => {
        const toggle = wrap.querySelector('.torchy-warnings-toggle');
        const list = wrap.querySelector('.torchy-warnings-list');
        if (!toggle || !list) return;
        toggle.addEventListener('click', () => {
            list.hidden = !list.hidden;
        });
    });
}

export function attachInsertButtonListeners (parentElement) {
    if (!parentElement) return;
    parentElement.querySelectorAll('.insert_button').forEach(button => {
        if (button.dataset.listenerAttached) return;
        button.dataset.listenerAttached = 'true';
        button.addEventListener('click', () => {
            const session = getActiveSession();
            if (!session) return;
            const uniqueId = Number(button.getAttribute('uniqueid'));
            const chunkData = session.allCodeChunksEverAdded[uniqueId - 1];
            if (!chunkData || !chunkData.BlocksAsXML) {
                console.error('[Torchy] no code chunk data for insert button', uniqueId);
                return;
            }

            const workspace = helpers.getWorkspace();
            if (!workspace || !window.ScratchBlocks) {
                console.error('[Torchy] no workspace available to insert into');
                return;
            }

            const {message, replacingBlockIds} = buildConfirmationMessage(chunkData, workspace);
            const ScratchBlocks = window.ScratchBlocks;
            ScratchBlocks.prompt(
                message,
                null,
                () => {
                    const liveWorkspace = helpers.getWorkspace() || workspace;
                    insertChunkIntoWorkspace(chunkData, liveWorkspace, replacingBlockIds);
                },
                'Add Code to Workspace?',
                ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE,
                true
            );
        });
    });
}
