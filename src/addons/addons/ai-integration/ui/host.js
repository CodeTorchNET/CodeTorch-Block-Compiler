import helpers from '../helpers/helpers.js';
import {saveMetadata, loadMetadata} from '../helpers/db.js';
import {store, getActiveSession, createNewSession} from '../state/sessions.js';
import {
    createComposer,
    focusInput,
    rebuildModelOptions,
    syncStreamingState
} from './composer.js';
import {
    renderChatUI,
    renderActiveSessionContent,
    saveSessionStateFromUI,
    clearAllPanes
} from './chatView.js';

const KEY_DISPLAY_MODE = 'ui_displayMode';
const KEY_DOCK_WIDTH = 'ui_dockWidth';
const KEY_FLOAT_RECT = 'ui_floatRect';

const FLOAT_DEFAULT_WIDTH = 452;
const FLOAT_DEFAULT_HEIGHT = 360;
const FLOAT_MIN_WIDTH = 452;
const FLOAT_MIN_HEIGHT = 302;
const FLOAT_TOLERANCE = 10;
const DRAG_RESISTANCE = 10;

const DOCK_DEFAULT_WIDTH = 380;
const DOCK_MIN_WIDTH = 300;
const dockMaxWidth = () => Math.max(DOCK_MIN_WIDTH, window.innerWidth * 0.6);

const FLEX_WRAPPER_SELECTOR = "[class*='gui_flex-wrapper_']";
const WRAPPER_DOCKED_CLASS = 'torchy-has-dock';

const DRAG_HANDLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" height="19" width="19" viewBox="0 0 24 24">' +
    '<circle cx="5" cy="5" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="19" cy="5" r="1.5"></circle>' +
    '<circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle>' +
    '<circle cx="5" cy="19" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle><circle cx="19" cy="19" r="1.5"></circle></svg>';

/* Panel with a filled right column: "dock me to the side". */
const DOCK_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4z" fill="currentColor" stroke="none"></path></svg>';
/* Detached rectangle: "pop me out into a window". */
const FLOAT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    '<rect x="3" y="7" width="13" height="12" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path></svg>';

const CLOSE_BUTTON_HTML =
    '<button type="button" id="closePopup" title="Close Torchy">' +
    '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="size-6" stroke="currentColor" ' +
    'stroke-width="1.5"><path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>';

const FLOAT_RESIZE_HANDLES = [
    'left',
    'right',
    'top',
    'bottom',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right'
];

/** The only module-level UI state (alongside the session store). */
const state = {
    mode: 'floating',
    open: false,
    destroyed: false,
    container: null,
    floatEl: null,
    dockEl: null,
    wrapper: null,
    floatRect: null,
    dockWidth: DOCK_DEFAULT_WIDTH,
    loopRunning: false
};

function defaultFloatRect () {
    return {
        width: FLOAT_DEFAULT_WIDTH,
        height: FLOAT_DEFAULT_HEIGHT,
        left: Math.round((window.innerWidth - FLOAT_DEFAULT_WIDTH) / 2),
        top: Math.round((window.innerHeight - FLOAT_DEFAULT_HEIGHT) / 2)
    };
}

function clampRect (rect) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const width = Math.max(FLOAT_MIN_WIDTH, Math.min(rect.width || FLOAT_DEFAULT_WIDTH, viewportWidth - FLOAT_TOLERANCE * 2));
    const height = Math.max(FLOAT_MIN_HEIGHT, Math.min(rect.height || FLOAT_DEFAULT_HEIGHT, viewportHeight - FLOAT_TOLERANCE * 2));

    let left = Number.isFinite(rect.left) ? rect.left : (viewportWidth - width) / 2;
    let top = Number.isFinite(rect.top) ? rect.top : (viewportHeight - height) / 2;

    left = Math.min(Math.max(left, FLOAT_TOLERANCE), Math.max(FLOAT_TOLERANCE, viewportWidth - width - FLOAT_TOLERANCE));
    top = Math.min(Math.max(top, FLOAT_TOLERANCE), Math.max(FLOAT_TOLERANCE, viewportHeight - height - FLOAT_TOLERANCE));

    return {left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height)};
}

function applyFloatRect () {
    if (!state.floatEl) return;
    const rect = clampRect(state.floatRect || defaultFloatRect());
    state.floatRect = rect;
    state.floatEl.style.left = `${rect.left}px`;
    state.floatEl.style.top = `${rect.top}px`;
    state.floatEl.style.width = `${rect.width}px`;
    state.floatEl.style.height = `${rect.height}px`;
}

function persistFloatRect () {
    if (state.floatRect) saveMetadata(KEY_FLOAT_RECT, state.floatRect);
}

function setDockWidth (width, persist) {
    state.dockWidth = Math.round(Math.min(Math.max(width, DOCK_MIN_WIDTH), dockMaxWidth()));
    if (state.dockEl) state.dockEl.style.setProperty('--torchy-dock-width', `${state.dockWidth}px`);
    if (persist) saveMetadata(KEY_DOCK_WIDTH, state.dockWidth);
}

/** Blockly only re-measures the workspace when the window resizes. */
function notifyResize () {
    window.dispatchEvent(new Event('resize'));
}

function dragWith (onMove, onDone) {
    const move = e => onMove(e);
    const up = e => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.userSelect = '';
        if (onDone) onDone(e);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
}

function startWindowDrag (e) {
    if (state.mode !== 'floating' || !state.floatEl) return;
    e.preventDefault();
    const rect = state.floatEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    state.floatEl.style.cursor = 'grabbing';

    dragWith(
        ev => {
            if (!moved) {
                if (Math.abs(ev.clientX - startX) < DRAG_RESISTANCE && Math.abs(ev.clientY - startY) < DRAG_RESISTANCE) {
                    return;
                }
                moved = true;
            }
            state.floatRect = Object.assign({}, state.floatRect, {
                left: ev.clientX - offsetX,
                top: ev.clientY - offsetY
            });
            applyFloatRect();
        },
        () => {
            state.floatEl.style.cursor = 'default';
            persistFloatRect();
        }
    );
}

function startWindowResize (direction, e) {
    e.preventDefault();
    e.stopPropagation();
    const start = clampRect(state.floatRect || defaultFloatRect());
    const startX = e.clientX;
    const startY = e.clientY;
    document.body.style.userSelect = 'none';

    dragWith(
        ev => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const next = Object.assign({}, start);

            if (direction.includes('right')) next.width = start.width + dx;
            if (direction.includes('bottom')) next.height = start.height + dy;
            if (direction.includes('left')) {
                next.width = Math.max(FLOAT_MIN_WIDTH, start.width - dx);
                next.left = start.left + (start.width - next.width);
            }
            if (direction.includes('top')) {
                next.height = Math.max(FLOAT_MIN_HEIGHT, start.height - dy);
                next.top = start.top + (start.height - next.height);
            }

            state.floatRect = next;
            applyFloatRect();
        },
        () => persistFloatRect()
    );
}

function startDockResize (e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = state.dockWidth;
    document.body.style.userSelect = 'none';

    dragWith(
        ev => setDockWidth(startWidth + (startX - ev.clientX), false),
        () => {
            setDockWidth(state.dockWidth, true);
            notifyResize();
        }
    );
}

function buildContainer () {
    const container = document.createElement('div');
    container.className = 'container';
    container.id = 'torchyContainer';

    const header = document.createElement('div');
    header.className = 'headerT';

    const dragHandle = document.createElement('div');
    dragHandle.id = 'dragHandle';
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = DRAG_HANDLE_SVG;
    dragHandle.addEventListener('mousedown', startWindowDrag);

    const tabs = document.createElement('div');
    tabs.className = 'chat-tabs-container';
    tabs.id = 'chat_tabs_container';

    const modeToggle = document.createElement('button');
    modeToggle.type = 'button';
    modeToggle.id = 'torchyModeToggle';
    modeToggle.className = 'torchy-mode-toggle';
    modeToggle.addEventListener('click', () => {
        setDisplayMode(state.mode === 'docked' ? 'floating' : 'docked');
    });

    header.append(dragHandle, tabs, modeToggle);
    header.insertAdjacentHTML('beforeend', CLOSE_BUTTON_HTML);

    const content = document.createElement('div');
    content.className = 'content';
    content.id = 'chat_content_wrapper';

    container.append(header, content);
    container.appendChild(createComposer({onSend: onComposerSend, onStop: onComposerStop}));

    header.querySelector('#closePopup').addEventListener('click', () => closeHost());

    container.addEventListener('keydown', e => {
        if (e.key === 'Escape' && state.mode === 'floating') {
            e.stopPropagation();
            closeHost();
        }
    });

    return container;
}

function buildFloatHost () {
    const host = document.createElement('div');
    host.id = 'popupParentDiv';
    host.style.position = 'fixed';
    host.style.zIndex = 509;
    host.style.minWidth = `${FLOAT_MIN_WIDTH}px`;
    host.style.minHeight = `${FLOAT_MIN_HEIGHT}px`;

    for (const direction of FLOAT_RESIZE_HANDLES) {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${direction}-resize`;
        handle.addEventListener('mousedown', e => startWindowResize(direction, e));
        host.appendChild(handle);
    }

    document.body.appendChild(host);
    return host;
}

function buildDockHost () {
    const host = document.createElement('div');
    host.className = 'torchy-dock';
    host.id = 'torchyDock';

    const handle = document.createElement('div');
    handle.className = 'resize-handle left-resize';
    handle.id = 'torchyDockResize';
    handle.title = 'Drag to resize the Torchy panel';
    handle.addEventListener('mousedown', startDockResize);
    host.appendChild(handle);

    return host;
}

function getFlexWrapper () {
    const live = document.querySelector(FLEX_WRAPPER_SELECTOR);
    if (live) state.wrapper = live;
    return live || (state.wrapper && state.wrapper.isConnected ? state.wrapper : null);
}

function updateModeToggle () {
    const button = document.getElementById('torchyModeToggle');
    if (!button) return;
    const docked = state.mode === 'docked';
    button.innerHTML = docked ? FLOAT_ICON_SVG : DOCK_ICON_SVG;
    button.title = docked ?
        'Undock Torchy into a floating window' :
        'Dock Torchy to the right of the editor';
    button.setAttribute('aria-label', button.title);
    button.dataset.mode = state.mode;
}

function attachToFloat () {
    if (!state.floatEl) state.floatEl = buildFloatHost();
    if (state.container.parentNode !== state.floatEl) state.floatEl.appendChild(state.container);
    applyFloatRect();
    state.floatEl.style.display = 'block';
    state.floatEl.style.zIndex = 509;
}

function detachDockFromWrapper () {
    if (state.dockEl && state.dockEl.parentNode) {
        const parent = state.dockEl.parentNode;
        state.dockEl.remove();
        parent.classList.remove(WRAPPER_DOCKED_CLASS);
    }
    if (state.wrapper) state.wrapper.classList.remove(WRAPPER_DOCKED_CLASS);
}

function attachToDock () {
    const wrapper = getFlexWrapper();
    if (!wrapper) return false;

    if (!state.dockEl) state.dockEl = buildDockHost();
    if (state.dockEl.parentNode !== wrapper) wrapper.appendChild(state.dockEl);
    wrapper.classList.add(WRAPPER_DOCKED_CLASS);

    if (state.container.parentNode !== state.dockEl) state.dockEl.appendChild(state.container);
    setDockWidth(state.dockWidth, false);
    state.dockEl.style.display = 'flex';

    if (state.floatEl) state.floatEl.style.display = 'none';
    return true;
}

function showHost () {
    if (state.mode === 'docked' && attachToDock()) {
        notifyResize();
        return;
    }
    state.mode = 'floating';
    detachDockFromWrapper();
    attachToFloat();
    updateModeToggle();
}

function renderNoKeyView () {
    const wrapper = document.getElementById('chat_content_wrapper');
    if (!wrapper) return;
    state.container.classList.add('torchy-no-key');
    wrapper.innerHTML =
        `<div class="no_api_key" id="torchy_no_key"><div class="b"><div class="c">${
            helpers.FireAnimation
        }</div><p class="d">To use Torchy, please add your API key in the <span id="addonsPage">addons page</span></p></div></div>`;
    const link = wrapper.querySelector('#addonsPage');
    if (link) {
        link.addEventListener('click', () => {
            window.parent.postMessage({type: 'block-compiler-action', action: 'addonsPage'}, '*');
        });
    }
}

function renderChatView () {
    state.container.classList.remove('torchy-no-key');
    const wrapper = document.getElementById('chat_content_wrapper');
    if (wrapper && wrapper.querySelector('#torchy_no_key')) wrapper.textContent = '';

    if (store.sessions.length === 0) createNewSession();
    renderChatUI();
    renderActiveSessionContent();
    syncStreamingState();
}

export function refreshHostView () {
    if (!state.container) return;
    if (store.canUse) renderChatView();
    else renderNoKeyView();
}

export async function initHost (addon) {
    state.destroyed = false;

    const [savedMode, savedWidth, savedRect] = await Promise.all([
        loadMetadata(KEY_DISPLAY_MODE),
        loadMetadata(KEY_DOCK_WIDTH),
        loadMetadata(KEY_FLOAT_RECT)
    ]).catch(e => {
        console.error('[Torchy] could not load window metadata', e);
        return [];
    });

    if (savedMode === 'docked' || savedMode === 'floating') state.mode = savedMode;
    if (Number.isFinite(savedWidth)) state.dockWidth = savedWidth;
    if (savedRect && typeof savedRect === 'object') state.floatRect = clampRect(savedRect);

    if (!state.loopRunning) {
        state.loopRunning = true;
        reattachLoop(addon);
    }
}

async function reattachLoop (addon) {
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const wrapper = await addon.tab.waitForElement(FLEX_WRAPPER_SELECTOR, {
            markAsSeen: true,
            reduxEvents: [
                'scratch-gui/mode/SET_PLAYER',
                'fontsLoaded/SET_FONTS_LOADED',
                'scratch-gui/locales/SELECT_LOCALE'
            ]
        });
        state.wrapper = wrapper;
        if (state.destroyed) continue;
        if (state.mode === 'docked' && state.open && state.container) {
            attachToDock();
            notifyResize();
        }
    }
}

export function isHostOpen () {
    return state.open;
}

export function getDisplayMode () {
    return state.mode;
}

export function openHost () {
    if (!state.container) state.container = buildContainer();

    state.open = true;
    store.popupOpen = true;

    showHost();
    updateModeToggle();
    refreshHostView();
    rebuildModelOptions();
    if (store.canUse) focusInput();
}

export function closeHost () {
    const session = getActiveSession();
    if (session && state.container) saveSessionStateFromUI(session);

    state.open = false;
    store.popupOpen = false;

    if (state.floatEl) {
        state.floatEl.style.display = 'none';
        state.floatEl.style.zIndex = -999999;
    }
    if (state.dockEl) {
        state.dockEl.style.display = 'none';
        detachDockFromWrapper();
        notifyResize();
    }
}

export function closeFloatingHost () {
    if (state.mode === 'floating') closeHost();
}

export function setDisplayMode (mode) {
    const next = mode === 'docked' ? 'docked' : 'floating';
    if (next === state.mode) return;

    if (next === 'docked' && !getFlexWrapper()) {
        console.error('[Torchy] cannot dock: the editor layout is not present');
        return;
    }

    state.mode = next;
    saveMetadata(KEY_DISPLAY_MODE, next);

    if (!state.container) {
        updateModeToggle();
        return;
    }

    if (next === 'docked') {
        attachToDock();
    } else {
        detachDockFromWrapper();
        attachToFloat();
    }
    updateModeToggle();
    if (state.open) notifyResize();
}

export function destroyHost () {
    state.destroyed = true;
    state.open = false;
    store.popupOpen = false;

    detachDockFromWrapper();
    if (state.dockEl) state.dockEl.remove();
    if (state.floatEl) state.floatEl.remove();
    if (state.container) state.container.remove();

    state.dockEl = null;
    state.floatEl = null;
    state.container = null;
    notifyResize();
}

export function resetPanes () {
    clearAllPanes();
}

const handlers = {onSend: null, onStop: null};

export function setComposerHandlers ({onSend, onStop}) {
    handlers.onSend = onSend;
    handlers.onStop = onStop;
}

function onComposerSend () {
    if (handlers.onSend) handlers.onSend();
}

function onComposerStop () {
    if (handlers.onStop) handlers.onStop();
}
