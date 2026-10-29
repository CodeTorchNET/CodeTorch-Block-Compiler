import GetSVG from './helpers/parser.js';
import Attachment from './helpers/attachment.js';
import helpers from './helpers/helpers.js';
import {
    store,
    getActiveSession,
    createNewSession,
    loadSessionsForCurrentProject,
    loadDefaultModelId
} from './state/sessions.js';
import * as host from './ui/host.js';
import * as chatView from './ui/chatView.js';
import * as composer from './ui/composer.js';
import {submitFromComposer, stopActiveRequest} from './chat/stream.js';
import {buildProviders} from './chat/providers.js';
import {fetchAllModels} from './chat/models.js';
import {withCustomModels} from './chat/customModels.js';

const SETTINGS_REFRESH_DELAY_MS = 800;
let refreshTimer = null;
let refreshToken = 0;

function currentProjectId () {
    const hash = String(window.location.hash || '').substring(1);
    return hash || '0';
}

export default class main {
    static async init ({addon, settings}) {
        store.addon = addon;
        main.applySettings(settings);

        host.setComposerHandlers({onSend: submitFromComposer, onStop: stopActiveRequest});
        try {
            await loadDefaultModelId();
        } catch (e) {
            console.error('[Torchy] could not load the default model', e);
        }
        await main.onProjectChanged();
        await host.initHost(addon);
        main.refreshModels();
    }

    static applySettings (settings) {
        store.settings = settings || {};
        store.providers = buildProviders(store.settings);
        store.canUse = store.providers.length > 0;
    }

    static async refreshModels () {
        const token = ++refreshToken;
        const providers = store.providers;
        if (providers.length === 0) {
            store.AIModels = [];
            store.modelErrors = {};
            store.modelsLoading = false;
            composer.rebuildModelOptions();
            return;
        }

        store.modelsLoading = true;
        store.AIModels = withCustomModels(store.AIModels, providers);
        composer.rebuildModelOptions();
        try {
            const {models, errors} = await fetchAllModels(providers);
            if (token !== refreshToken) return;
            store.AIModels = withCustomModels(models, providers);
            store.modelErrors = errors;
            for (const [providerId, message] of Object.entries(errors)) {
                console.error(`[Torchy] could not load the models of ${providerId}: ${message}`);
            }
        } catch (e) {
            if (token !== refreshToken) return;
            console.error('[Torchy] could not load the AI model list', e);
        } finally {
            if (token === refreshToken) {
                store.modelsLoading = false;
                composer.rebuildModelOptions();
            }
        }
    }

    /**
     * @param {number} fileAttachmentType 0 = none, 1 = code chunk, 2 = entire sprite, 3 = entire project
     * @param {string} inputValue prefilled prompt
     * @param {Element} attachmentDOM block XML captured from the context menu
     */
    static startNewSessionWithPrompt (fileAttachmentType = 0, inputValue = '', attachmentDOM = null) {
        let session = getActiveSession();
        if (!session || session.chatHistory.length > 0) {
            session = createNewSession();
        }
        store.activeSessionId = session.id;
        session.inputText = inputValue;

        if (attachmentDOM) {
            try {
                const attachment = new Attachment();
                attachment.attachment(attachmentDOM, helpers.currentSpriteName());
                session.attachment = attachment;
                session.attachmentType = String(fileAttachmentType);
            } catch (e) {
                console.error('[Torchy] could not attach the selected blocks', e);
            }
        }

        main.open();
    }

    /** Replace the model list directly. */
    static setAIModels (models) {
        store.AIModels = Array.isArray(models) ? models : [];
        store.modelsLoading = false;
        composer.rebuildModelOptions();
    }

    static open () {
        host.openHost();
    }

    static close () {
        host.closeHost();
    }

    static closeFloating () {
        host.closeFloatingHost();
    }

    static setDisplayMode (mode) {
        host.setDisplayMode(mode);
    }

    static onSettingsChanged (settings) {
        const before = JSON.stringify(store.providers);
        main.applySettings(settings);
        host.refreshHostView();
        if (JSON.stringify(store.providers) === before) return;

        const activeIds = new Set(store.providers.map(p => p.id));
        store.AIModels = withCustomModels(store.AIModels.filter(m => activeIds.has(m.providerId)), store.providers);
        composer.rebuildModelOptions();

        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            main.refreshModels();
        }, SETTINGS_REFRESH_DELAY_MS);
    }

    static async onProjectChanged () {
        const projectId = currentProjectId();
        if (store.currentProjectId === projectId && store.sessions.length > 0) return;

        host.closeHost();
        chatView.clearAllPanes();
        try {
            await loadSessionsForCurrentProject(projectId);
        } catch (e) {
            console.error('[Torchy] could not load the sessions of this project', e);
        }
    }

    static destroy () {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = null;
        refreshToken++;
        host.destroyHost();
        if (typeof GetSVG.dispose === 'function') {
            try {
                GetSVG.dispose();
            } catch (e) {
                console.error('[Torchy] could not dispose the preview workspace', e);
            }
        }
    }
}
