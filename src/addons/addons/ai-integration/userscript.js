import GetSVG from "./helpers/parser.js";
import helpers from "./helpers/helpers.js";
import Attachment from "./helpers/attachment.js";
import main from "./main.js";
import { saveSession, deleteSession, loadSessionsForProject, saveMetadata, loadMetadata } from "./helpers/db.js";
const {API_HOST} = require('../../../lib/brand.js');

const AI_INTEGRATION = {
  AI_currently_blabbering: false,
  CodeChunks: [],
  AllCodeChunksEverAdded: [],
  processedCodeChunks: [],
  errorsDetected: [],
  
  sessions: [],
  activeSessionId: null,
  nextSessionId: 1,
  currentProjectId: '0',

  popupOpen: false,
  canUse: true,
  AIModels: [],
};

let authToken = {};
var mainWorkspace;

class ChatSession {
  constructor(id, projectId, data = {}) {
    this.id = id;
    this.projectId = projectId;
    this.name = data.name || `Chat ${id}`;
    this.chatHistory = data.chatHistory || [];
    this.allCodeChunksEverAdded = data.allCodeChunksEverAdded || [];
    this.domCache = null;
    this.inputText = data.inputText || "";
    this.isBlabbering = false;
    this.attachment = null;
    this.attachmentType = data.attachmentType || "0";
    this.selectedModelId = data.selectedModelId || null;
    this.allowCustomExtensions = typeof data.allowCustomExtensions === "boolean" ? data.allowCustomExtensions : false;
  }
  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      chatHistory: this.chatHistory,
      allCodeChunksEverAdded: this.allCodeChunksEverAdded,
      inputText: this.inputText,
      attachmentType: this.attachmentType,
      selectedModelId: this.selectedModelId,
      allowCustomExtensions: this.allowCustomExtensions,
    };
  }
}

window.addEventListener('blockError', (event) => {
  document.AI_INTEGRATION.errorsDetected.push(event.detail);
});

// TODO: possibly push this into the addons api?
document.AI_INTEGRATION = AI_INTEGRATION;

// TODO: dont use global events
window.addEventListener('blockError', (event) => {
  AI_INTEGRATION.errorsDetected.push(event.detail);
});

function workspaceOverride() {
  if (typeof Blockly !== 'undefined') {
    Blockly.getMainWorkspace = function () { // I have to do this as the getmainworkspace gets linked to the getSVG parsing one 
    return mainWorkspace;
  }
}else{
  setTimeout(() => {
    workspaceOverride();
  }, 100);
}
}
workspaceOverride();

// TODO: this should use a global hook
document.addEventListener("mousemove", (event) => {
  AI_INTEGRATION.X_COORDINATE = event.clientX;
  AI_INTEGRATION.Y_COORDINATE = event.clientY;
});

export default async function ({ addon, console }) {
  const Blockly = await addon.tab.traps.getBlockly();

  function getCurrentProjectId() {
    const hash = window.location.hash.substring(1);
    return hash || '0';
  }

  async function initializeForProject() {
    const projectId = getCurrentProjectId();
    if (document.AI_INTEGRATION && document.AI_INTEGRATION.currentProjectId === projectId && document.AI_INTEGRATION.sessions.length > 0) {
      return; // Already initialized for this project
    }

    if (document.AI_INTEGRATION.popupOpen) {
      helpers.closePopup();
    }
    
    document.AI_INTEGRATION.currentProjectId = projectId;
    
    // Load persisted state for the current project
    const savedSessions = await loadSessionsForProject(projectId);
    const savedNextSessionId = await loadMetadata(`${projectId}_nextSessionId`);
    const savedActiveSessionId = await loadMetadata(`${projectId}_activeSessionId`);
    
    document.AI_INTEGRATION.sessions = [];
    document.AI_INTEGRATION.activeSessionId = null;
    document.AI_INTEGRATION.nextSessionId = 1;

    if (savedSessions && savedSessions.length > 0) {
      document.AI_INTEGRATION.sessions = savedSessions.map(s => new ChatSession(s.id, s.projectId, s));
      
      const maxId = savedSessions.reduce((max, s) => Math.max(max, s.id), 0);
      document.AI_INTEGRATION.nextSessionId = Math.max(savedNextSessionId || 1, maxId + 1);
      
      const activeSessionExists = document.AI_INTEGRATION.sessions.some(s => s.id === savedActiveSessionId);
      if (activeSessionExists) {
          document.AI_INTEGRATION.activeSessionId = savedActiveSessionId;
      } else if (document.AI_INTEGRATION.sessions.length > 0) {
          document.AI_INTEGRATION.activeSessionId = document.AI_INTEGRATION.sessions[0].id;
      }
    }
  }

  await initializeForProject();
  window.addEventListener('hashchange', initializeForProject);

  mainWorkspace = addon.tab.traps.getWorkspace();
  main.apiUrl = `${API_HOST}/v1/torchy`;
  main.authToken = authToken;
  main.mainWorkspace = mainWorkspace;
  main.Gaddon = addon;
  GetSVG.init(Blockly);
  Attachment._blockly = Blockly;
  authToken.gemini = addon.settings.get("GeminiAPIKey");
  authToken.openrouter = addon.settings.get("OpenRouterAPIKey");

  if (authToken.gemini == "" && authToken.openrouter == "") {
    AI_INTEGRATION.canUse = false;
    window.addEventListener('ai-button-clicked', function () {
      main.createBasePopup(2, "");
    });
    return;
  }else{
    fetch(`${API_HOST}/v1/torchy/ai_models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          console.error('Error:', response.statusText);
          return [];
        }
      })
      .then(data => {
        AI_INTEGRATION.AIModels = data;
        helpers.updateAIModels(authToken.gemini, authToken.openrouter);
      })
      .catch(error => {
        console.error('Request failed', error);
      });
  }
  addon.tab.createBlockContextMenu(
    (items) => {
      items.push({
        enabled: true,
        text: "Explain this Sprite",
        callback: () => {
          main.startNewSessionWithPrompt(2, "Explain this Sprite:");
        },
        separator: true,
      });
      return items;
    },
    { workspace: true }
  );
  addon.tab.createBlockContextMenu(
    (items, block) => {
      items.push({
        text: "Explain this Code",
        enabled: true,
        callback: () => {
          main.startNewSessionWithPrompt(1, "Explain this:", Blockly.Xml.blockToDom(block));
        },
        separator: true,
      });
      return items;
    },
    { blocks: true }
  );
  addon.tab.createBlockContextMenu(
    (items, block) => {
      items.push({
        text: "Debug this Code",
        enabled: true,
        callback: () => {
          main.startNewSessionWithPrompt(1, "I have the following issue with my code {REPLACE THIS WITH ISSUE}, please help me debug it:", Blockly.Xml.blockToDom(block));
        },
      });
      return items;
    },
    { blocks: true }
  );
  addon.tab.createBlockContextMenu(
    (items, block) => {
      items.push({
        text: "New Chat",
        enabled: true,
        callback: () => {
          main.startNewSessionWithPrompt(1, "", Blockly.Xml.blockToDom(block));
        },
      });
      return items;
    },
    { blocks: true }
  );

  addon.tab.redux.addEventListener("statechanged", ({ detail }) => {
    if(detail.action.type === "scratch-gui/project-state/START_LOADING_VM_FILE_UPLOAD"){
      helpers.closePopup();
    }
    if (detail.action.type === "scratch-gui/navigation/ACTIVATE_TAB") {
      const activeTabIndex = detail.action.activeTabIndex;
      //console.log(`Tab changed to index: ${activeTabIndex}`);
      if (activeTabIndex != 0) {
        helpers.closePopup();
      }
    }
  });

  // TODO: dont use global events
  window.addEventListener('ai-button-clicked', function () {
    main.startNewSessionWithPrompt(2, "");
  });
}
