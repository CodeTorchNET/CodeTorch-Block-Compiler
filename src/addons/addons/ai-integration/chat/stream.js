import TorchyBridge from "../helpers/torchyBridge.js";
import blockDefinitions from "../helpers/blockDefinitions.js";
import { handleRawCodeChunk, registerExtensionBlocks } from "../helpers/codeChunkHandler.js";
import helpers from "../helpers/helpers.js";
import {
    store,
    getActiveSession,
    updateAndSaveSession,
    nameSessionFromMessage,
} from "../state/sessions.js";
import * as composer from "../ui/composer.js";
import * as chatView from "../ui/chatView.js";

const bridge = new TorchyBridge(blockDefinitions);

const FIRST_BYTE_TIMEOUT_MS = 60000;
const IDLE_TIMEOUT_MS = 90000;
const MAX_ERROR_DETAIL = 300;

class RequestError extends Error {}

function registerExtensionDefinitions() {
    try {
        const vm = helpers.getVM();
        const definitions = helpers.generateExtensionDefinitions(vm.runtime);
        bridge.registerDefinitions(definitions);
        registerExtensionBlocks(definitions);
    } catch (e) {
        console.error("[Torchy] could not load custom extension blocks", e);
    }
}

function describeAttachment(session, attachmentType) {
    if (attachmentType === "1") return session.attachment ? session.attachment.spriteName : "Code Chunk";
    if (attachmentType === "2") return "Entire Sprite";
    if (attachmentType === "3") return "Entire Project";
    return "";
}

function buildAttachmentCode(session, attachmentType) {
    const ScratchBlocks = window.ScratchBlocks;
    const workspace = helpers.getWorkspace();
    if (attachmentType === "0" || !ScratchBlocks) return "";

    try {
        if (attachmentType === "1") {
            if (!session.attachment || !workspace) return "";
            const blockDom = session.attachment.GetAttachment(ScratchBlocks.Xml.workspaceToDom(workspace));
            if (!blockDom) return "";
            // Wrapped in <xml> so the bridge parser finds it (it searches for "xml > block").
            return "\nAttached Code:\n" + bridge.toText("<xml>" + ScratchBlocks.Xml.domToText(blockDom) + "</xml>");
        }
        if (attachmentType === "2") {
            if (!workspace) return "";
            const xmlText = ScratchBlocks.Xml.domToText(ScratchBlocks.Xml.workspaceToDom(workspace));
            return "\nAttached Code:\n" + bridge.toText(xmlText);
        }
        if (attachmentType === "3") {
            let projectCode = "";
            for (const target of helpers.getVM().runtime.targets) {
                if (!target.isOriginal) continue;
                const xml = target.blocks
                    .toXML()
                    .replace(/[\n\r]+\s*/g, " ")
                    .replace(/>\s+</g, "><")
                    .trim()
                    .replace(">,<", "><");
                const text = bridge.toText(`<xml>${xml}</xml>`);
                if (text && text !== "No blocks found.") {
                    projectCode += `\n--- Sprite: ${target.getName()} ---\n${text}\n`;
                }
            }
            return "\nAttached Code:\n" + projectCode;
        }
    } catch (e) {
        console.error("[Torchy] could not read the attached code", e);
    }
    return "";
}

function buildContextString(session, attachmentType) {
    const vm = helpers.getVM();
    const target = vm.runtime.getEditingTarget();

    let costumeNames = "";
    for (const costume of target.sprite.costumes) costumeNames += costume.name + ", ";
    let soundNames = "";
    for (const sound of target.sprite.sounds) soundNames += sound.name + ", ";
    const allSpriteNames = vm.runtime.targets
        .filter(t => t.isSprite && t.getName() !== "Stage")
        .map(sprite => sprite.getName())
        .join(", ");

    return (
        buildAttachmentCode(session, attachmentType) +
        "\n\n\nContext:\nSprite Customes: " +
        costumeNames +
        "\nSprite Sounds: " +
        soundNames +
        "\nAll Sprites Names: " +
        allSpriteNames +
        "\nCurrent Sprite Name:" +
        target.sprite.name
    );
}

function buildRequestBody({ model, apiKey, session, userText, contextString }) {
    const history = [{ role: "user", message: bridge.generateToolboxReference() }, ...session.chatHistory];

    if (model.API_KEY_TYPE === "gemini") {
        return {
            api_key: apiKey,
            message: userText,
            history,
            ai_model: model.id,
            context: contextString,
        };
    }
    return {
        api_key: apiKey,
        message: userText + contextString,
        history,
        ai_model: model.id,
    };
}

function fetchChat(url, body, controller) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new RequestError("Request failed: the server did not respond in time"));
        }, FIRST_BYTE_TIMEOUT_MS);
    });

    const request = fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
    });

    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

function readWithTimeout(reader, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new RequestError("Request failed: the AI stopped responding")), timeoutMs);
    });
    return Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
}

function truncateDetail(text) {
    const trimmed = String(text).trim();
    return trimmed.length > MAX_ERROR_DETAIL ? `${trimmed.slice(0, MAX_ERROR_DETAIL)}…` : trimmed;
}

async function readErrorDetail(response) {
    let text = "";
    try {
        text = await response.text();
    } catch (e) {
        return "";
    }
    if (!text) return "";
    try {
        const parsed = JSON.parse(text);
        const value = parsed && (parsed.error || parsed.message);
        if (typeof value === "string") return truncateDetail(value);
        if (value && typeof value.message === "string") return truncateDetail(value.message);
    } catch (e) {
        // not JSON: fall through to the raw body
    }
    return truncateDetail(text);
}

function appendErrorBubble(pane, message, onRetry) {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-message errorMessage torchy-error";

    const text = document.createElement("p");
    text.className = "message errorMessage";
    text.textContent = message;

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "torchy-retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
        wrapper.remove();
        onRetry();
    });

    text.appendChild(retry);
    wrapper.appendChild(text);
    pane.appendChild(wrapper);
    chatView.scrollToBottom(pane);
    return wrapper;
}

function reportFailure(req, message) {
    const { session, pane } = req;
    appendErrorBubble(pane, message, () => runRequest(req));

    session.inputText = req.userText;
    if (session.id === store.activeSessionId && composer.getInputText().trim() === "") {
        composer.setInputText(req.userText);
    }
}

async function finalizeAssistantMessage(session, pane, messageEl, text) {
    const fences = text.match(chatView.FENCE_REGEX) || [];
    const randomId = Math.random().toString(36).substr(2, 5).toUpperCase();
    const workspace = helpers.getWorkspace();

    const processed = [];
    for (let i = 0; i < fences.length; i++) {
        try {
            // eslint-disable-next-line no-await-in-loop
            processed.push(await handleRawCodeChunk(fences[i], `${randomId}_${i}`, workspace));
        } catch (e) {
            console.error("[Torchy] could not convert a code chunk", e);
            processed.push({
                status: "error",
                rawCode: fences[i],
                variables: [],
                lists: [],
                broadcasts: [],
                warnings: [],
            });
        }
    }

    const baseIndex = session.allCodeChunksEverAdded.length;
    for (const chunk of processed) {
        if (chunk.status === "success" && chunk.blocksAsSVG && !chunk.renderedHTML) {
            chunk.renderedHTML = chatView.sizeSvgMarkup(chunk.blocksAsSVG);
        }
        session.allCodeChunksEverAdded.push(chunk);
    }

    const pinned = chatView.isPinnedToBottom(pane);
    messageEl.className = "message";
    messageEl.innerHTML = chatView.renderMarkdownWithPlaceholders(text);
    chatView.replacePlaceholders(messageEl, chatView.CODE_CHUNK_TOKEN, index =>
        chatView.buildChunkNode(processed[index], baseIndex + index + 1)
    );
    if (pinned) chatView.scrollToBottom(pane);
}

function userHistoryTurn(req) {
    const turn = { role: "user", message: req.userText };
    if (req.attachmentInfo && req.attachmentInfo.type !== "0") turn.attachment = req.attachmentInfo;
    return turn;
}

export async function runRequest(req) {
    const { session, pane } = req;

    const model = store.AIModels.find(m => m.id === req.modelId);
    if (!model) {
        reportFailure(req, "Request failed: no AI model is selected");
        return;
    }
    const apiKey =
        model.API_KEY_TYPE === "gemini"
            ? store.authToken.gemini
            : model.API_KEY_TYPE === "openrouter"
                ? store.authToken.openrouter
                : "";
    if (!apiKey) {
        reportFailure(req, `Request failed: no ${model.API_KEY_TYPE} API key is set`);
        return;
    }

    const controller = new AbortController();
    session.controller = controller;
    session.stopRequested = false;
    session.isBlabbering = true;
    if (session.id === store.activeSessionId) composer.setStreaming(true);

    chatView.removeWelcomeHeader(pane);
    const loadingDots = chatView.appendLoadingDots(pane, session.id);
    chatView.scrollToBottom(pane);

    const buffer = { text: "" };
    let messageEl = null;
    let chunkCount = 0;
    let renderScheduled = 0;
    let finished = false;

    const renderPartial = () => {
        if (finished || !messageEl || !messageEl.isConnected) return;
        const pinned = chatView.isPinnedToBottom(pane);
        messageEl.className = "message";
        messageEl.innerHTML = chatView.renderStreamingMarkdown(buffer.text, chunkCount);
        if (pinned) chatView.scrollToBottom(pane);
    };

    const scheduleRender = () => {
        if (renderScheduled) return;
        renderScheduled = requestAnimationFrame(() => {
            renderScheduled = 0;
            renderPartial();
        });
    };

    const stopRendering = () => {
        finished = true;
        if (renderScheduled) cancelAnimationFrame(renderScheduled);
        renderScheduled = 0;
    };

    try {
        const response = await fetchChat(`${store.apiUrl}/chat`, buildRequestBody({
            model,
            apiKey,
            session,
            userText: req.userText,
            contextString: req.contextString,
        }), controller);

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            throw new RequestError(
                `Request failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
            );
        }

        loadingDots.remove();
        messageEl = chatView.createAssistantMessage(pane);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let first = true;
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await readWithTimeout(reader, first ? FIRST_BYTE_TIMEOUT_MS : IDLE_TIMEOUT_MS);
            first = false;
            if (done) break;
            buffer.text += decoder.decode(value, { stream: true });
            chunkCount++;
            scheduleRender();
        }

        stopRendering();
        session.chatHistory.push(userHistoryTurn(req));
        session.chatHistory.push({ role: "assistant", message: buffer.text });
        try {
            await finalizeAssistantMessage(session, pane, messageEl, buffer.text);
        } catch (e) {
            console.error("[Torchy] could not render the answer", e);
        }
        updateAndSaveSession(session);
    } catch (error) {
        stopRendering();
        if (loadingDots.isConnected) loadingDots.remove();
        controller.abort();

        if (session.stopRequested) {
            await handleStopped(req, messageEl, buffer.text);
        } else {
            console.error("[Torchy] request failed", error);
            if (messageEl && messageEl.parentNode) messageEl.parentNode.remove();
            const message =
                error instanceof RequestError ? error.message : `Request failed: ${error.message || error}`;
            reportFailure(req, message);
        }
    } finally {
        session.isBlabbering = false;
        session.controller = null;
        if (session.id === store.activeSessionId) composer.setStreaming(false);
    }
}

async function handleStopped(req, messageEl, partial) {
    const { session, pane } = req;
    if (!partial.trim()) {
        if (messageEl && messageEl.parentNode) messageEl.parentNode.remove();
        if (req.userBubble && req.userBubble.isConnected) req.userBubble.remove();
        session.inputText = req.userText;
        if (session.id === store.activeSessionId && composer.getInputText().trim() === "") {
            composer.setInputText(req.userText);
        }
        if (session.chatHistory.length === 0) chatView.renderWelcome(pane);
        return;
    }
    const text = `${partial} *(stopped)*`;
    session.chatHistory.push(userHistoryTurn(req));
    session.chatHistory.push({ role: "assistant", message: text });
    try {
        if (messageEl) await finalizeAssistantMessage(session, pane, messageEl, text);
    } catch (e) {
        console.error("[Torchy] could not render the stopped answer", e);
    }
    updateAndSaveSession(session);
}

export function stopActiveRequest() {
    const session = getActiveSession();
    if (!session || !session.controller) return;
    session.stopRequested = true;
    session.controller.abort();
}

export function submitFromComposer() {
    const session = getActiveSession();
    if (!session) return;

    if (session.isBlabbering) {
        helpers.showAlert("TorchyWaitForAIToFinishWarning");
        return;
    }

    const userText = composer.getInputText();
    if (userText.trim() === "") return;

    const pane = chatView.getPaneForSession(session.id);
    if (!pane) {
        console.error("[Torchy] could not find the chat pane for session", session.id);
        return;
    }

    registerExtensionDefinitions();

    const attachmentType = composer.getAttachmentType();
    session.attachmentType = attachmentType;
    const attachmentName = describeAttachment(session, attachmentType);
    const contextString = buildContextString(session, attachmentType);

    chatView.removeWelcomeHeader(pane);
    const userBubble = chatView.appendUserMessage(pane, userText, attachmentType !== "0" ? attachmentName : null);

    const model = composer.getSelectedModel();
    if (!model || model.API_KEY_TYPE !== "gemini") session.attachment = null;
    composer.renderAttachmentUI();

    nameSessionFromMessage(session, userText);
    chatView.renderChatUI();

    composer.setInputText("");
    updateAndSaveSession(session);

    runRequest({
        session,
        pane,
        userBubble,
        userText,
        contextString,
        attachmentInfo: { type: attachmentType, name: attachmentName },
        modelId: composer.getSelectedModelId(),
    });
}
