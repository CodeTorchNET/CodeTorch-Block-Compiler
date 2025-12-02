// helpers/constants.js

import * as helper from './helper.js';
import CollaborationConsole from './CollaborationConsole.js'; 

/**
 * Global debugging flag. Set to `true` to enable verbose console logging and other debugging features.
 */
export const debugging = true;

export const apiHostURL = process.env.API_HOST;
/**
 * Development Mode. 
 * Set to `true` to allow the addon to run even if window.CollaborationRoom/OTT are undefined.
 */
export const devMode = process.env.COLLABORATION_DEV_MODE === 'true';

/**
 * The base URL for the WebSocket server used for Yjs collaboration.
 */
export const WEBSOCKETBASEURL = process.env.COLLABORATION_HOST;

/**
 * Inactivity thresholds in milliseconds.
 * - `INACTIVITY_THRESHOLD_X_MS`: When reached, the user is marked inactive, and asset editing locks are released.
 * - `INACTIVITY_THRESHOLD_Y_MS`: When reached, a more aggressive cleanup/disconnect process is initiated.
 */
export const INACTIVITY_THRESHOLD_X_MS = 30 * 1000; // 30 seconds
export const INACTIVITY_THRESHOLD_Y_MS = 5 * 60 * 1000; // 5 minutes

/**
 * A unique symbol used as the `origin` for Yjs transactions initiated by the local client.
 * This helps remote clients distinguish between local and remote events, preventing self-echoing.
 */
export const LOCAL_EVENT_SYNC_ORIGIN = Symbol('local-event-sync');

// --- UI Element IDs and Classes ---
/**
 * The ID of the HTML container element where collaboration user icons in the top menu bar are displayed.
 */
export const COLLABORATION_USER_ICON_CONTAINER_ID = 'collaboration-users-container';
/**
 * CSS class for the container element holding user icons on a specific sprite/target.
 */
export const SPRITE_ICON_CONTAINER_CLASS = 'collaboration-sprite-icon-container';
/**
 * CSS class for individual user icons displayed on sprites/targets.
 */
export const SPRITE_USER_ICON_CLASS = 'collaboration-sprite-user-icon';

// --- Custom Event Types for Collaboration ---
// These are custom event types used to signal specific actions in the Scratch VM
// that are not directly covered by standard Blockly events (e.g., adding a sprite, editing an asset).
export const CUSTOM_REMOTE_SHARE_BLOCKS_CALL_TYPE = 'remoteShareBlocksCall';
export const CUSTOM_REMOTE_SPRITE_ADDED_CALL_TYPE = 'remoteSpriteAddedCall';
export const CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE = 'remoteSpriteRenameCall';
export const CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE = 'remoteSpriteDeleteCall';
export const CUSTOM_REMOTE_COSTUME_RENAME_CALL_TYPE = 'remoteCostumeRenameCall';
export const CUSTOM_REMOTE_COSTUME_DELETE_CALL_TYPE = 'remoteCostumeDeleteCall';
export const CUSTOM_REMOTE_COSTUME_REORDER_CALL_TYPE = 'remoteCostumeReorderCall';
export const CUSTOM_REMOTE_COSTUME_DUPLICATE_CALL_TYPE = 'remoteCostumeDuplicateCall';
export const CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE = 'remoteCostumeAddedCall';
export const CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE = 'remoteCostumeSharedCall';
export const CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE = 'remoteSoundAddedCall';
export const CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE = 'remoteSoundRenameCall';
export const CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE = 'remoteSoundDeleteCall';
export const CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE = 'remoteSoundReorderCall';
export const CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE = 'remoteSoundDuplicateCall';
export const CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE = 'remoteSoundSharedCall';
export const CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE = 'remoteSpriteDuplicateCall';
export const CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE = 'remoteExtensionLoadedCall';
export const CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE = 'remoteBackdropAddedCall';

// --- UI Selectors for Specific Editor Areas ---
/**
 * CSS selector for the main interaction area of the Scratch Sound Editor.
 * Used to detect user activity within this specific UI component.
 */
export const SOUND_EDITOR_INTERACTION_AREA_SELECTOR = '[class*="sound-editor_editor-container_"]';
/**
 * CSS selector for the HTML canvas element within the Scratch Paint Editor.
 * Used to detect user activity and capture changes in the paint editor.
 */
export const PAINT_EDITOR_CANVAS_SELECTOR = '[class*="paint-editor_canvas-container"] canvas';

/**
 * Configuration for different types of events that can be triggered (sent) to other collaborators.
 * Each entry defines:
 * - `eventType`: The unique string identifier for the event.
 * - `consoleKey`: A key used for logging purposes.
 * - `preparePayload`: An optional function to transform the raw data into the event payload.
 *   This is particularly useful for converting binary data (like asset data) to Base64.
 * - `requiredFields`: An array of field names that must be present in the data for the event to be sent.
 * - `payloadKeys`: An array of field names to directly extract from the data as the payload.
 * - `checkUndefined`: A boolean flag indicating whether to strictly check for `undefined` values in `requiredFields`.
 */
export const triggerEventConfig = {
    /** Configuration for sending a 'sprite added' event. */
    spriteAdded: {
        eventType: CUSTOM_REMOTE_SPRITE_ADDED_CALL_TYPE,
        consoleKey: 'spriteAdded',
        preparePayload: data => {
            const spriteJson = data.spriteData;
            if (!spriteJson) {
                CollaborationConsole.error('Collab Send [spriteAdded]: Invalid or missing spriteJson from trigger.', data);
                return null;
            }
            // If sprite data is a string (e.g., JSON representation), send as JS.
            if (typeof (spriteJson) === 'string') {
                return { spriteJson: spriteJson, type: "JS" };
            } else {
                // If sprite data is binary (Uint8Array or ArrayBuffer), convert to Base64 and mark as U8.
                const uint8ArrayData = spriteJson instanceof Uint8Array ? spriteJson : new Uint8Array(spriteJson);
                const processedSpriteData = helper.convertUint8ArrayToBase64(uint8ArrayData);
                return { spriteJson: processedSpriteData, type: "U8" };
            }
        }
    },
    /** Configuration for sending a 'sprite renamed' event. */
    spriteRenamed: {
        eventType: CUSTOM_REMOTE_SPRITE_RENAME_CALL_TYPE,
        consoleKey: 'spriteRenamed',
        requiredFields: ['targetId', 'spriteName'], // `targetId` here refers to the sprite's original name.
        payloadKeys: ['targetId', 'spriteName']
    },
    /** Configuration for sending a 'sprite deleted' event. */
    spriteDeleted: {
        eventType: CUSTOM_REMOTE_SPRITE_DELETE_CALL_TYPE,
        consoleKey: 'spriteDeleted',
        requiredFields: ['targetId'],
        payloadKeys: ['targetId']
    },
    /** Configuration for sending a 'costume renamed' event. */
    costumeRenamed: {
        eventType: CUSTOM_REMOTE_COSTUME_RENAME_CALL_TYPE,
        consoleKey: 'costumeRenamed',
        requiredFields: ['targetId', 'costumeIndex', 'newName'],
        payloadKeys: ['targetId', 'costumeIndex', 'newName'],
        checkUndefined: true // Indicates that a strict `typeof` check for undefined should be performed.
    },
    /** Configuration for sending a 'costume deleted' event. */
    costumeDeleted: {
        eventType: CUSTOM_REMOTE_COSTUME_DELETE_CALL_TYPE,
        consoleKey: 'costumeDeleted',
        requiredFields: ['targetId', 'costumeIndex'],
        payloadKeys: ['targetId', 'costumeIndex'],
        checkUndefined: true
    },
    /** Configuration for sending a 'costume reordered' event. */
    costumeReordered: {
        eventType: CUSTOM_REMOTE_COSTUME_REORDER_CALL_TYPE,
        consoleKey: 'costumeReordered',
        requiredFields: ['targetId', 'costumeIndex', 'newIndex'],
        payloadKeys: ['targetId', 'costumeIndex', 'newIndex'],
        checkUndefined: true
    },
    /** Configuration for sending a 'costume duplicated' event. */
    costumeDuplicated: {
        eventType: CUSTOM_REMOTE_COSTUME_DUPLICATE_CALL_TYPE,
        consoleKey: 'costumeDuplicated',
        requiredFields: ['targetId', 'costumeIndex'],
        payloadKeys: ['targetId', 'costumeIndex'],
        checkUndefined: true
    },
    /** Configuration for sending a 'backdrop added' event. */
    backdropAdded: {
        eventType: CUSTOM_REMOTE_BACKDROP_ADDED_CALL_TYPE,
        consoleKey: 'backdropAdded',
        preparePayload: data => {
            let { md5ext, backdropObject } = data;

            if (typeof md5ext === 'undefined' || typeof backdropObject === 'undefined') {
                CollaborationConsole.error(`Collab Send [backdropAdded]: Missing required data (md5ext or backdropObject).`, data);
                return null;
            }

            // Create a deep copy of the backdrop object to avoid modifying the original VM object directly.
            let modifiedBackdropObject = structuredClone(backdropObject);
            // If the backdrop asset data is present, convert it to Base64 for transmission.
            if (typeof modifiedBackdropObject?.asset?.data !== 'undefined') {
                modifiedBackdropObject.asset.data = helper.convertUint8ArrayToBase64(modifiedBackdropObject.asset.data);
                if (debugging) CollaborationConsole.log(`Collab Send [backdropAdded]: Converted backdrop asset data to base64.`);
            }
            return {
                md5ext: md5ext,
                backdropObject: modifiedBackdropObject
            };
        }
    },
    /** Configuration for sending a 'costume added' event. */
    costumeAdded: {
        eventType: CUSTOM_REMOTE_COSTUME_ADDED_CALL_TYPE,
        consoleKey: 'costumeAdded',
        preparePayload: data => {
            let { md5ext, costumeObject, targetId, optVersion } = data;

            // Log a warning if targetId is explicitly missing, but proceed with other checks.
            if (!targetId) {
                CollaborationConsole.warn(`Collab Send [costumeAdded]: Target ID "${targetId}" not found in VM. Skipping costume addition.`);
                return null;
            }

            // Ensure all essential fields are present.
            if (typeof targetId === 'undefined' || typeof md5ext === 'undefined' || typeof costumeObject === 'undefined') {
                CollaborationConsole.error(`Collab Send [costumeAdded]: Missing required data.`, data);
                return null;
            }

            let modifiedCostumeObject = structuredClone(costumeObject);
            
            // If the costume asset data is present, convert it to Base64.
            if (typeof modifiedCostumeObject?.asset?.data !== 'undefined') {
                modifiedCostumeObject.asset.data = helper.convertUint8ArrayToBase64(modifiedCostumeObject.asset.data);
                if (debugging) CollaborationConsole.log(`Collab Send [costumeAdded]: Converted costume asset data to base64.`);
            }
            return {
                targetId: targetId,
                md5ext: md5ext,
                costumeObject: modifiedCostumeObject,
                optVersion: optVersion
            };
        }
    },
    /** Configuration for sending an 'extension loaded' event. */
    extensionLoaded: {
        eventType: CUSTOM_REMOTE_EXTENSION_LOADED_CALL_TYPE,
        consoleKey: 'extensionLoaded',
        requiredFields: ['extensionURL'],
        payloadKeys: ['extensionURL'],
        checkUndefined: true
    },
    /** Configuration for sending a 'costume shared' event. */
    costumeShared: {
        eventType: CUSTOM_REMOTE_COSTUME_SHARED_CALL_TYPE,
        consoleKey: 'costumeShared',
        requiredFields: ['costumeIndex', 'targetId', 'editingTargetId'],
        payloadKeys: ['costumeIndex', 'targetId', 'editingTargetId'],
        checkUndefined: true
    },
    /** Configuration for sending a 'sound added' event. */
    soundAdded: {
        eventType: CUSTOM_REMOTE_SOUND_ADDED_CALL_TYPE,
        consoleKey: 'soundAdded',
        preparePayload: data => {
            let { soundObject, targetId } = data;

            // Log a warning if targetId is explicitly missing.
            if (!targetId) {
                CollaborationConsole.warn(`Collab Send [soundAdded]: Target ID "${targetId}" not found in VM. Skipping sound addition.`);
                return null;
            }
            // Ensure all essential fields are present.
            if (typeof targetId === 'undefined' || typeof soundObject === 'undefined') {
                CollaborationConsole.error(`Collab Send [soundAdded]: Missing required data.`, data);
                return null;
            }

            let modifiedSoundObject = structuredClone(soundObject);
            
            // If the sound asset data is present, convert it to Base64.
            if (typeof modifiedSoundObject?.asset?.data !== 'undefined') {
                modifiedSoundObject.asset.data = helper.convertUint8ArrayToBase64(modifiedSoundObject.asset.data);
                if (debugging) CollaborationConsole.log(`Collab Send [soundAdded]: Converted sound asset data to base64.`);
            }
            return {
                targetId: targetId,
                soundObject: modifiedSoundObject
            };
        }
    },
    /** Configuration for sending a 'sound renamed' event. */
    soundRenamed: {
        eventType: CUSTOM_REMOTE_SOUND_RENAME_CALL_TYPE,
        consoleKey: 'soundRenamed',
        requiredFields: ['targetId', 'soundIndex', 'newName'],
        payloadKeys: ['targetId', 'soundIndex', 'newName'],
        checkUndefined: true
    },
    /** Configuration for sending a 'sound deleted' event. */
    soundDeleted: {
        eventType: CUSTOM_REMOTE_SOUND_DELETE_CALL_TYPE,
        consoleKey: 'soundDeleted',
        requiredFields: ['targetId', 'soundIndex'],
        payloadKeys: ['targetId', 'soundIndex'],
        checkUndefined: true
    },
    /** Configuration for sending a 'sound reordered' event. */
    soundReordered: {
        eventType: CUSTOM_REMOTE_SOUND_REORDER_CALL_TYPE,
        consoleKey: 'soundReordered',
        requiredFields: ['targetId', 'soundIndex', 'newIndex'],
        payloadKeys: ['targetId', 'soundIndex', 'newIndex'],
        checkUndefined: true
    },
    /** Configuration for sending a 'sound duplicated' event. */
    soundDuplicated: {
        eventType: CUSTOM_REMOTE_SOUND_DUPLICATE_CALL_TYPE,
        consoleKey: 'soundDuplicated',
        requiredFields: ['targetId', 'soundIndex'],
        payloadKeys: ['targetId', 'soundIndex'],
        checkUndefined: true
    },
    /** Configuration for sending a 'sound shared' event. */
    soundShared: {
        eventType: CUSTOM_REMOTE_SOUND_SHARED_CALL_TYPE,
        consoleKey: 'soundShared',
        requiredFields: ['soundIndex', 'targetId', 'editingTargetId'],
        payloadKeys: ['soundIndex', 'targetId', 'editingTargetId'],
        checkUndefined: true
    },
    /** Configuration for sending a 'sprite duplicated' event. */
    spriteDuplicated: {
        eventType: CUSTOM_REMOTE_SPRITE_DUPLICATE_CALL_TYPE,
        consoleKey: 'spriteDuplicated',
        requiredFields: ['targetId'],
        payloadKeys: ['targetId']
    }
};

/**
 * An object containing mutable references to various Yjs, Scratch GUI, and internal
 * collaboration state objects. These references can be reassigned or updated by other modules.
 */
export const mutableRefs = {
    // --- Yjs Shared Types & State References ---
    ydoc: null,                 // The Yjs document instance.
    provider: null,             // The Yjs provider (e.g., WebSocketProvider) for connection management.
    yEvents: null,              // Yjs Array for storing Blockly and other general project events.
    yProjectEvents: null,       // Yjs Array for storing project-level asset events (e.g., sprite, costume, sound changes).
    yjsAwarenessInstance: null, // The Yjs Awareness instance for tracking collaborator presence and state.
    addon: null,                // Reference to the Scratch GUI addon instance (if applicable).

    // --- Scratch VM/Blockly References ---
    BlocklyInstance: null,      // The global Blockly object.
    vm: null,                   // The Scratch VM instance.
    workspaceChangeListener: null, // Listener function for Blockly workspace changes.
    currentCleanupFunction: null,  // A function to be called for cleanup on inactivity.

    // --- Local UI State Management (primitives/references that are fully reassigned) ---
    localChatMessage: '',       // The current local chat message being typed/sent.
    chatMessageTimeoutId: null, // Timeout ID for managing chat message display.

    // --- UI Layer References ---
    collaborationLayerGroup: null,   // SVG group element for collaboration UI overlays (e.g., ghost blocks).
    blocklyCanvasObserver: null,     // MutationObserver for changes to the Blockly canvas.
    localChatElementsRef: null,      // Reference to local chat UI elements.
    currentWorkspaceSvg: null,       // Reference to the main Blockly SVG element.
    throttledMouseMoveHandler: null, // Throttled mouse move event handler.
    pointerLeaveHandler: null,       // Pointer leave event handler.
    inactivityTimerX: null,          // Timer ID for inactivity threshold X.
    inactivityTimerY: null,          // Timer ID for inactivity threshold Y.
    userIconContainer: null,         // HTML element container for user icons in the menu bar.

    // --- Asset Sync Specific References ---
    debouncedSyncCostume: null,      // Debounced function for syncing costume changes.
    currentPaintEditorCanvas: null,  // Reference to the active canvas in the Paint Editor.
    debouncedSyncSoundData: null,    // Debounced function for syncing sound data changes.
    currentSoundEditorArea: null,    // Reference to the active area in the Sound Editor.
    dragOutsideStarted: false,       // Flag indicating if a drag operation started outside relevant areas.

    // --- Initial Sync Flags ---
    hasProcessedInitialProjectEvents: false, // Flag to track if initial project events (assets) have been processed.
    hasProcessedInitialBlockEvents: false,   // Flag to track if initial Blockly events have been processed.
    alreadyRanSetup: false,                  // Flag to prevent re-running the main collaboration setup logic.

    // --- Event Transaction Buffering ---
    eventTransactionBuffer: new Map(), // A map to buffer Blockly events by their group ID.
    eventFlushTimer: null,             // A timer for debouncing the flushing of the event buffer.
};

/**
 * An object holding the local user's information and current state,
 * which is then broadcast via Yjs Awareness. Its properties are mutated.
 */
export let localUserInfo = {
    name: 'User',                // The display name of the local user.
    color: '#888888',            // The color associated with the local user.
    currentTargetName: null,     // The name of the target (sprite/Stage) the user is currently editing.
    activeTabIndex: 0,           // The index of the currently active tab (0: Code, 1: Costumes, 2: Sounds).
    editingCostumeInfo: null,    // { targetName, costumeIndex, lastSentDataHash } if editing a costume.
    editingSoundInfo: null,      // { targetName, soundIndex } if editing a sound.
    isInactive: false            // Boolean flag indicating if the user is currently inactive.
};

// --- UI Element Maps ---
/**
 * A Map to store information about blocks being dragged remotely by other users.
 * Key: clientID, Value: { blockId: string, ghostSvg: SVGElement, targetName: string }
 */
export const remoteDraggingBlocks = new Map();
/**
 * A Map to store references to user icons displayed in the menu bar.
 * Key: clientID, Value: HTMLElement (the user's icon).
 */
export const remoteUserIcons = new Map();
/**
 * A Map to store the container elements for user icons on each sprite/target.
 * Key: targetId, Value: { container: HTMLElement, icons: Map<clientID, HTMLElement> }
 */
export const spriteIconContainers = new Map();
/**
 * CSS selector for identifying the main tab elements in the Scratch GUI.
 * Used to attach user icons to tabs.
 */
export const TAB_SELECTOR = 'ul[class*="react-tabs__tab-list"] > li[class*="react-tabs__tab"]:not([class*="sa-find-bar"])';
/**
 * CSS class for the container element holding user icons on a specific tab.
 */
export const TAB_ICON_CONTAINER_CLASS = 'collaboration-tab-icon-container';
/**
 * CSS class for individual user icons displayed on tabs.
 */
export const TAB_USER_ICON_CLASS = 'collaboration-tab-user-icon';
/**
 * A Map to store the container elements for user icons on each tab.
 * Key: tabIndex, Value: { container: HTMLElement, icons: Map<clientID, HTMLElement> }
 */
export const tabIconContainers = new Map();
