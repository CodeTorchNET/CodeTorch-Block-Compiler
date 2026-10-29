import {
    saveSession,
    deleteSession,
    loadSessionsForProject,
    saveMetadata,
    loadMetadata
} from '../helpers/db.js';

const MAX_TAB_NAME_LENGTH = 28;

export class ChatSession {
    constructor (id, projectId, data = {}) {
        this.id = id;
        this.projectId = projectId;
        this.name = data.name || `Chat ${id}`;
        this.chatHistory = data.chatHistory || [];
        this.allCodeChunksEverAdded = data.allCodeChunksEverAdded || [];
        this.domCache = null;
        this.inputText = data.inputText || '';
        this.isBlabbering = false;
        // Attachments point at live workspace blocks, so they are never persisted.
        this.attachment = null;
        this.attachmentType = data.attachmentType === '1' ? '0' : data.attachmentType || '0';
        this.selectedModelId = data.selectedModelId || null;
        this.allowCustomExtensions =
            typeof data.allowCustomExtensions === 'boolean' ? data.allowCustomExtensions : false;
        this.controller = null;
        this.stopRequested = false;
    }

    toJSON () {
        return {
            id: this.id,
            projectId: this.projectId,
            name: this.name,
            chatHistory: this.chatHistory,
            allCodeChunksEverAdded: this.allCodeChunksEverAdded,
            inputText: this.inputText,
            attachmentType: this.attachmentType,
            selectedModelId: this.selectedModelId,
            allowCustomExtensions: this.allowCustomExtensions
        };
    }
}

export const store = {
    addon: null,
    settings: {},
    providers: [],
    AIModels: [],
    modelErrors: {},
    modelsLoading: false,
    canUse: false,

    sessions: [],
    activeSessionId: null,
    nextSessionId: 1,
    currentProjectId: '0',

    popupOpen: false
};

if (typeof document !== 'undefined') document.AI_INTEGRATION = store;

export function getActiveSession () {
    if (!store.activeSessionId) return null;
    return store.sessions.find(s => s.id === store.activeSessionId) || null;
}

export function getSession (sessionId) {
    return store.sessions.find(s => s.id === sessionId) || null;
}

export function createNewSession () {
    const newId = store.nextSessionId++;
    const session = new ChatSession(newId, store.currentProjectId);
    store.sessions.push(session);
    store.activeSessionId = newId;

    saveSession(session.toJSON());
    saveMetadata(`${store.currentProjectId}_nextSessionId`, store.nextSessionId);
    saveMetadata(`${store.currentProjectId}_activeSessionId`, store.activeSessionId);

    return session;
}

export function closeSession (sessionId) {
    const index = store.sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return;

    store.sessions.splice(index, 1);
    deleteSession(sessionId);

    if (store.activeSessionId === sessionId) {
        store.activeSessionId = store.sessions.length > 0 ?
            store.sessions[Math.max(0, index - 1)].id :
            null;
        saveMetadata(`${store.currentProjectId}_activeSessionId`, store.activeSessionId);
    }
}

export function updateAndSaveSession (session) {
    if (session) saveSession(session.toJSON());
}

export function saveActiveSessionMetadata () {
    saveMetadata(`${store.currentProjectId}_activeSessionId`, store.activeSessionId);
}

export function clearSessions () {
    store.sessions = [];
    store.activeSessionId = null;
    store.nextSessionId = 1;
}

export async function loadSessionsForCurrentProject (projectId) {
    store.currentProjectId = projectId;
    clearSessions();

    const savedSessions = await loadSessionsForProject(projectId);
    const savedNextSessionId = await loadMetadata(`${projectId}_nextSessionId`);
    const savedActiveSessionId = await loadMetadata(`${projectId}_activeSessionId`);

    if (savedSessions && savedSessions.length > 0) {
        store.sessions = savedSessions.map(s => new ChatSession(s.id, s.projectId, s));
        const maxId = savedSessions.reduce((max, s) => Math.max(max, s.id), 0);
        store.nextSessionId = Math.max(savedNextSessionId || 1, maxId + 1);

        const activeExists = store.sessions.some(s => s.id === savedActiveSessionId);
        store.activeSessionId = activeExists ? savedActiveSessionId : store.sessions[0].id;
    }
}

export function nameSessionFromMessage (session, message) {
    if (!session || session.chatHistory.length > 0) return;
    const trimmed = String(message).trim()
        .replace(/\s+/g, ' ');
    if (!trimmed) return;
    session.name = trimmed.length > MAX_TAB_NAME_LENGTH ?
        `${trimmed.slice(0, MAX_TAB_NAME_LENGTH - 1)}…` :
        trimmed;
}

export function getSessionTitle (session) {
    if (!session) return '';
    const firstUserTurn = session.chatHistory.find(turn => turn.role === 'user');
    if (firstUserTurn && firstUserTurn.message) {
        return String(firstUserTurn.message).split('\n\n\nContext:\n')[0];
    }
    return session.name;
}
