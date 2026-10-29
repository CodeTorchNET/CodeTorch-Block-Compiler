import {store, getActiveSession, updateAndSaveSession, setDefaultModelId} from '../state/sessions.js';
import {pickDefaultModel} from '../chat/models.js';
import {addCustomModelId, CUSTOM_MODELS_GROUP} from '../chat/customModels.js';

const TEXTAREA_MIN_HEIGHT = 20;
const TEXTAREA_MAX_HEIGHT = 157;

// Value prefix of the "Type a model id…" entry each provider gets in the dropdown.
const ADD_MODEL_PREFIX = '__add__:';
const ADD_MODEL_LABEL = 'Type a model id…';
const MODEL_ID_EXAMPLES = {
    gemini: 'gemini-2.5-flash',
    openrouter: 'anthropic/claude-sonnet-4.5',
    custom: 'llama3.1'
};

/** An option the user can actually chat with: not a placeholder, not the "type a model id" entry. */
const selectable = option => !option.disabled && !option.value.startsWith(ADD_MODEL_PREFIX);

const MODEL_INFO_HTML =
    `<p>Torchy talks to the AI providers you set up in the addons page directly. The list shows what each provider offers right now:</p><ul>` +
    `<li><strong>Google Gemini</strong>: every Gemini chat model on your key. The <em>Flash</em> models are fast and the most tested with Torchy's block syntax, so start there.</li>` +
    `<li><strong>OpenRouter</strong>: the models most used for coding this week, followed by the most used free models. Free models cost nothing but have daily limits and can be slower.</li>` +
    `<li><strong>Custom API</strong>: whatever your own OpenAI-compatible server lists (for example a local Ollama).</li>` +
    `</ul><p>A model that is not listed (or a server that lists nothing) still works: pick <em>${ADD_MODEL_LABEL}</em> under the provider and enter the id exactly as the provider names it.</p>` +
    `<br><p>Bigger "pro" or "reasoning" models explain code well but are slower; small or free models sometimes write blocks that cannot be converted. If a model misbehaves, try another one.</p>`;

const COMPOSER_HTML = `
  <div class="input-parent">
    <textarea class="input-field" id="auto-resizing-textarea" placeholder="Ask me anything..."></textarea>
    <button type="button" id="submitChat" class="send-button" title="Send">
      <svg class="send-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 17" height="17" width="17">
        <path d="M2.92172 9.30564L1.08789 3.34619C5.47463 4.62202 9.61134 6.63746 13.3197 9.30564C9.61155 11.9738 5.47507 13.9892 1.08856 15.2651L2.92172 9.30564ZM2.92172 9.30564H7.95788"
          stroke-linecap="round" stroke-linejoin="round" stroke="#7C7766" stroke-width="1.5"></path>
      </svg>
    </button>
    <button type="button" id="stopChat" class="stop-button" title="Stop generating">
      <svg class="stop-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 17" height="17" width="17">
        <circle cx="8.5" cy="8.5" r="7" stroke="#d0402e" stroke-width="1.5"></circle>
        <rect x="6" y="6" width="5" height="5" rx="1" fill="#d0402e"></rect>
      </svg>
    </button>
  </div>
  <div class="bottomBar" id="bottomBar">
    <div class="AI_selector">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="currentColor" class="size-6 svg">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z"></path>
      </svg>
      <select name="AI Model Selector" id="AI_Selector_select"></select>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="currentColor" class="size-6 arrow">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="currentColor" id="infoAboutAIModels" class="size-6">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"></path>
      </svg>
    </div>
    <div class="attachedFile" id="attachedFile">
      <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="24" width="24" class="svg">
        <path d="M2 7V14.7519H4.53246L5.9122 16.0909H8.12402L9.50376 14.7519H22V7H9.50376L8.12402 8.33905H5.9122L4.53246 7H2Z"
          stroke-linecap="round" stroke-linejoin="round" stroke="currentcolor" stroke-width="2"></path>
      </svg>
      <select name="Context Selector" id="Context_Selector_select">
        <option value="1" disabled>Code Chunk</option>
        <option value="0" selected>None</option>
        <option value="2">Entire Sprite</option>
        <option value="3">Entire Project</option>
      </select>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="currentColor" class="size-6 arrow">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
      </svg>
    </div>
  </div>`;

const textarea = () => document.getElementById('auto-resizing-textarea');
const modelSelect = () => document.getElementById('AI_Selector_select');
const contextSelect = () => document.getElementById('Context_Selector_select');
const composerBox = () => document.getElementById('chat_box');

export function getInputText () {
    const input = textarea();
    return input ? input.value : '';
}

export function setInputText (value) {
    const input = textarea();
    if (!input) return;
    input.value = value;
    autosize();
}

export function focusInput () {
    const input = textarea();
    if (input) input.focus();
}

export function getSelectedModelId () {
    const select = modelSelect();
    return select ? select.value : null;
}

export function getSelectedModel () {
    const id = getSelectedModelId();
    if (!id) return null;
    return store.AIModels.find(model => model.key === id) || null;
}

export function getAttachmentType () {
    const select = contextSelect();
    return select ? select.value : '0';
}

export function autosize () {
    const input = textarea();
    if (!input) return;
    input.style.height = 'auto';
    const height = Math.min(Math.max(input.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
    input.style.height = `${height}px`;
}

function addPlaceholderOption (parent, text) {
    const option = document.createElement('option');
    option.value = '';
    option.disabled = true;
    option.textContent = text;
    parent.appendChild(option);
}

/**
 * Fill the model dropdown: one group per provider (and per OpenRouter list), plus a disabled line
 * for providers whose models could not be loaded. Idempotent; keeps the current choice when it
 * still exists.
 */
export function rebuildModelOptions () {
    const select = modelSelect();
    if (!select) return;

    const previous = select.value;
    select.textContent = '';

    const defaultModel =
        store.AIModels.find(model => model.key === store.defaultModelId) || pickDefaultModel(store.AIModels);
    const defaultId = defaultModel ? defaultModel.key : null;
    const groups = new Map();
    const groupFor = (provider, label) => {
        const groupKey = `${provider.id}\u0000${label}`;
        if (!groups.has(groupKey)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = label ? `${provider.name} · ${label}` : provider.name;
            select.appendChild(optgroup);
            groups.set(groupKey, optgroup);
        }
        return groups.get(groupKey);
    };

    const addModelOption = (model, provider) => {
        const option = document.createElement('option');
        option.value = model.key;
        const saysFree = /\(free\)|:free$/i.test(model.name);
        option.textContent = model.free === true && !saysFree ? `${model.name} · free` : model.name;
        if (model.key === defaultId) option.defaultSelected = true;
        groupFor(provider, model.group).appendChild(option);
    };

    for (const provider of store.providers) {
        const models = store.AIModels.filter(model => model.providerId === provider.id);
        const listed = models.filter(model => !model.custom);
        for (const model of listed) addModelOption(model, provider);
        const error = store.modelErrors[provider.id];
        if (listed.length === 0) {
            const text = error ? `Could not load models: ${error}` : store.modelsLoading ? 'Loading models…' : 'No models';
            addPlaceholderOption(groupFor(provider, ''), text);
        }
        // Typed-in models, then the entry that adds another one.
        for (const model of models.filter(model => model.custom)) addModelOption(model, provider);
        const add = document.createElement('option');
        add.value = `${ADD_MODEL_PREFIX}${provider.id}`;
        add.textContent = ADD_MODEL_LABEL;
        groupFor(provider, CUSTOM_MODELS_GROUP).appendChild(add);
    }
    if (store.providers.length === 0) addPlaceholderOption(select, 'Add an API key in the addons page');

    const options = Array.from(select.options);
    const stillAvailable = options.some(o => o.value === previous && selectable(o));
    if (stillAvailable) {
        select.value = previous;
    } else if (defaultId !== null) {
        select.value = defaultId;
    } else {
        const firstEnabled = options.find(selectable);
        if (firstEnabled) select.value = firstEnabled.value;
    }

    renderSettingsUI();
}

export function renderSettingsUI () {
    const session = getActiveSession();
    const select = modelSelect();
    if (!session || !select || select.options.length === 0) return;

    const options = Array.from(select.options);
    const saved = options.find(o => o.value === session.selectedModelId && selectable(o));
    if (saved) {
        select.value = saved.value;
        return;
    }
    const fallback = options.find(o => o.defaultSelected && selectable(o)) || options.find(selectable);
    if (fallback) {
        select.value = fallback.value;
        session.selectedModelId = fallback.value;
    }
}

export function renderAttachmentUI () {
    const session = getActiveSession();
    const select = contextSelect();
    if (!select) return;
    const codeChunkOption = select.querySelector('option[value="1"]');

    if (session && session.attachment) {
        codeChunkOption.disabled = false;
        codeChunkOption.textContent = session.attachment.spriteName;
        select.value = session.attachmentType;
        return;
    }

    codeChunkOption.disabled = true;
    codeChunkOption.textContent = 'Code Chunk';
    if (session && session.attachmentType === '1') session.attachmentType = '0';
    select.value = session ? session.attachmentType : '0';
}

/** Make `modelId` the model new chats start on. */
function rememberDefaultModel (modelId) {
    setDefaultModelId(modelId);
    const select = modelSelect();
    if (!select) return;
    Array.from(select.options).forEach(option => {
        option.defaultSelected = option.value === modelId;
    });
}

/** Ask for a model id with the editor's prompt modal, then select (and remember) it. */
function promptForModelId (providerId) {
    const provider = store.providers.find(p => p.id === providerId);
    const ScratchBlocks = window.ScratchBlocks;
    if (!provider || !ScratchBlocks || typeof ScratchBlocks.prompt !== 'function') return;
    const example = MODEL_ID_EXAMPLES[providerId] || MODEL_ID_EXAMPLES.custom;
    ScratchBlocks.prompt(
        `Model id for ${provider.name}, exactly as the provider names it (for example ${example}):`,
        '',
        input => selectTypedModel(provider, input),
        'Type a model id',
        ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE
    );
}

function selectTypedModel (provider, input) {
    const model = addCustomModelId(provider.id, input);
    if (!model) return;
    if (!store.AIModels.some(m => m.key === model.key)) store.AIModels.push(model);
    const session = getActiveSession();
    if (session) {
        session.selectedModelId = model.key;
        updateAndSaveSession(session);
    }
    setDefaultModelId(model.key);
    rebuildModelOptions();
}

function showModelInfoDialog () {
    const ScratchBlocks = window.ScratchBlocks;
    if (!ScratchBlocks) return;
    ScratchBlocks.prompt(
        MODEL_INFO_HTML,
        null,
        () => {},
        'AI Models',
        ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE,
        true
    );
    setTimeout(() => {
        const modal = document.querySelector('.ReactModal__Content--after-open');
        if (modal) modal.style.width = '700px';
    }, 100);
}

export function createComposer ({onSend, onStop}) {
    const box = document.createElement('div');
    box.className = 'input-container';
    box.id = 'chat_box';
    box.innerHTML = COMPOSER_HTML;

    const input = box.querySelector('#auto-resizing-textarea');
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            onSend();
        }
    });

    box.querySelector('#submitChat').addEventListener('click', () => onSend());
    box.querySelector('#stopChat').addEventListener('click', () => onStop());
    box.querySelector('#infoAboutAIModels').addEventListener('click', showModelInfoDialog);

    box.querySelector('#AI_Selector_select').addEventListener('change', e => {
        const value = e.target.value;
        if (value.startsWith(ADD_MODEL_PREFIX)) {
            // Put the previous choice back while the dialog is open; selectTypedModel moves it.
            renderSettingsUI();
            promptForModelId(value.slice(ADD_MODEL_PREFIX.length));
            return;
        }
        rememberDefaultModel(value);
        const session = getActiveSession();
        if (!session) return;
        session.selectedModelId = value;
        updateAndSaveSession(session);
    });

    box.querySelector('#Context_Selector_select').addEventListener('change', e => {
        const session = getActiveSession();
        if (!session) return;
        session.attachmentType = e.target.value;
        updateAndSaveSession(session);
    });

    return box;
}

export function setStreaming (streaming) {
    const box = composerBox();
    if (box) box.classList.toggle('streaming', !!streaming);
}

export function syncStreamingState () {
    const session = getActiveSession();
    setStreaming(!!(session && session.isBlabbering));
}
