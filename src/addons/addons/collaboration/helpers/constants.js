export const debugging = true;

export const apiHostURL = process.env.API_HOST;
export const devMode = process.env.COLLABORATION_DEV_MODE === 'true';
export const recordMode = process.env.COLLABORATION_RECORD_MODE === 'true';
export const WEBSOCKETBASEURL = process.env.COLLABORATION_HOST;

export const INACTIVITY_THRESHOLD_X_MS = 30 * 1000; 

export const INACTIVITY_THRESHOLD_Y_MS = 60 * 1000;

export const CLOSE_STALE_GENERATION = 4001;

export const LOCAL_EVENT_SYNC_ORIGIN = Symbol('local-event-sync');

let remoteApplyDepth = 0;

export function beginRemoteApply() {
    remoteApplyDepth++;
}

export function endRemoteApply() {
    if (remoteApplyDepth > 0) remoteApplyDepth--;
}

export function isApplyingRemote() {
    return remoteApplyDepth > 0;
}

export function resetRemoteApply() {
    remoteApplyDepth = 0;
}

export const COLLABORATION_USER_ICON_CONTAINER_ID = 'collaboration-users-container';
export const SPRITE_ICON_CONTAINER_CLASS = 'collaboration-sprite-icon-container';
export const SPRITE_USER_ICON_CLASS = 'collaboration-sprite-user-icon';
export const SOUND_EDITOR_INTERACTION_AREA_SELECTOR = '[class*="sound-editor_editor-container_"]';
export const PAINT_EDITOR_CANVAS_SELECTOR = '[class*="paint-editor_canvas-container"] canvas';
export const TAB_SELECTOR = 'ul[class*="react-tabs__tab-list"] > li[class*="react-tabs__tab"]:not([class*="sa-find-bar"])';
export const TAB_ICON_CONTAINER_CLASS = 'collaboration-tab-icon-container';
export const TAB_USER_ICON_CLASS = 'collaboration-tab-user-icon';

export const mutableRefs = {

    isViewer: false,

    ydoc: null,                 

    provider: null,             

    yjsAwarenessInstance: null, 
    
    sharedBlocks: null,

    sharedVariables: null,

    sharedMonitors: null,

    sharedComments: null,

    sharedCostumes: null,

    sharedCostumeData: null,
    sharedCostumeArt: null,

    redrawCostumeArt: null,

    sharedSounds: null,

    sharedSoundData: null,

    sharedSprites: null,

    sharedSpriteData: null,

    sharedExtensions: null,

    addon: null,                

    BlocklyInstance: null,
    vm: null,
    currentCleanupFunction: null,

    localChatMessage: '',       
    chatMessageTimeoutId: null, 

    collaborationLayerGroup: null,   
    blocklyCanvasObserver: null,     
    localChatElementsRef: null,      
    currentWorkspaceSvg: null,       
    awarenessFrameCancel: null,
    throttledMouseMoveHandler: null, 
    pointerLeaveHandler: null,       
    inactivityTimerX: null,          
    inactivityTimerY: null,          
    userIconContainer: null,         

    isInitialRoomSync: false,
    loadingCooldownTimer: null,

    syncingTargets: new Set(),
    syncingCostumes: new Set(),
    syncingSounds: new Set(),
    costumeIndexMaps: new Map(),

    isUiTransition: false,
    monitorsPublishDeferred: false,
    publishMonitorsNow: null,

    roomUUID: null
};

export let localUserInfo = {
    name: 'User',                
    color: '#888888',            
    currentTargetId: null,     
    activeTabIndex: 0,           
    isInactive: false            
};

export const remoteDraggingBlocks = new Map();
export const remoteUserIcons = new Map();
export const spriteIconContainers = new Map();
export const tabIconContainers = new Map();

export function editorWorkspace() {
    const traps = mutableRefs.addon && mutableRefs.addon.tab && mutableRefs.addon.tab.traps;
    if (!traps || typeof traps.getWorkspace !== 'function') return null;
    return traps.getWorkspace() || null;
}
