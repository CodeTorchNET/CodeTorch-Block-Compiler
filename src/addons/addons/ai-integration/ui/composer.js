import {store, getActiveSession, updateAndSaveSession} from '../state/sessions.js';

const TEXTAREA_MIN_HEIGHT = 20;
const TEXTAREA_MAX_HEIGHT = 157;

const MODEL_INFO_HTML =
    `<p>Each AI model has its own advantages and disadvantages</p><ul>` +
    `<li><strong>Gemini 2.5 Pro</strong> (requires Gemini API key): Excellent at explaining code but frequently makes mistakes when writing it.</li>` +
    `<li><strong>Gemini 2.5 Flash (recommended)</strong> (requires Gemini API key): The most tested model for writing code, offering reliable performance.</li>` +
    `<li><strong>Deepseek R1</strong> (requires OpenRouter API key): Poor at writing code but excels at explaining and analyzing issues. However, it has a very slow response time.</li>` +
    `<li><strong>Deepseek V3</strong> (requires OpenRouter API key): sometimes the best model for writing code (either really good or terrible, basically your luck), but limited to 200 messages per day.</li>` +
    `</ul><br><p>if you don't know what you are doing you should probably stick to the Gemini models (preferably 2.0 flash) as they are way faster and are more tested</p>`;

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
    return store.AIModels.find(model => model.id === id) || null;
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

export function rebuildModelOptions () {
    const select = modelSelect();
    if (!select) return;

    const previous = select.value;
    select.textContent = '';

    let defaultId = null;
    for (const model of store.AIModels) {
        const usable = !(
            (model.API_KEY_TYPE === 'gemini' && !store.authToken.gemini) ||
            (model.API_KEY_TYPE === 'openrouter' && !store.authToken.openrouter)
        );
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.display_name + (usable ? '' : ' (API Key Required)');
        option.disabled = !usable;
        if (model.default && usable) {
            option.defaultSelected = true;
            if (defaultId === null) defaultId = model.id;
        }
        select.appendChild(option);
    }

    const stillAvailable = Array.from(select.options).some(o => o.value === previous && !o.disabled);
    if (stillAvailable) {
        select.value = previous;
    } else if (defaultId !== null) {
        select.value = defaultId;
    } else {
        const firstEnabled = Array.from(select.options).find(o => !o.disabled);
        if (firstEnabled) select.value = firstEnabled.value;
    }

    renderSettingsUI();
}

export function renderSettingsUI () {
    const session = getActiveSession();
    const select = modelSelect();
    if (!session || !select || select.options.length === 0) return;

    const options = Array.from(select.options);
    const saved = options.find(o => o.value === session.selectedModelId && !o.disabled);
    if (saved) {
        select.value = saved.value;
        return;
    }
    const fallback = options.find(o => o.defaultSelected && !o.disabled) || options.find(o => !o.disabled);
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
        const session = getActiveSession();
        if (!session) return;
        session.selectedModelId = e.target.value;
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
