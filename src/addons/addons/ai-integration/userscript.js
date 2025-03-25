import GetSVG from "./helpers/parser.js";
import helpers from "./helpers/helpers.js";
import Attachment from "./helpers/attachment.js";
import main from "./main.js";

const apiUrl = "http://127.0.0.1:5000";
let authToken = {};

var mainWorkspace;


window.addEventListener('blockError', (event) => {
  document.AI_INTEGRATION.errorsDetected.push(event.detail);
});

document.AI_INTEGRATION = { //probably the dumbest way to possibly do this, it just make debugging alot easier (will do it properly later)
  AI_currently_blabbering: false,
  CodeChunks: [],
  AllCodeChunksEverAdded: [],
  processedCodeChunks: [],
  chatHistory: [],
  popupOpen: false,
  canUse: true,
  errorsDetected: [],
  AIModels: [],
};

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

document.addEventListener("mousemove", (event) => {
  document.AI_INTEGRATION.X_COORDINATE = event.clientX;
  document.AI_INTEGRATION.Y_COORDINATE = event.clientY;
});

export default async function ({ addon, console }) {
  const Blockly = await addon.tab.traps.getBlockly();
  //mainWorkspace = Blockly.getMainWorkspace();
  mainWorkspace = addon.tab.traps.getWorkspace();
  main.apiUrl = apiUrl;
  main.authToken = authToken;
  main.mainWorkspace = mainWorkspace;
  main.Gaddon = addon;
  GetSVG.init(Blockly);
  Attachment._blockly = Blockly;
  authToken.gemini = addon.settings.get("GeminiAPIKey");
  authToken.openrouter = addon.settings.get("OpenRouterAPIKey");
  //create new CSS (style for popup)
  const style = document.createElement('link');
  style.setAttribute('rel', 'stylesheet');
  style.setAttribute('href', apiUrl + '/main.css');
  document.head.appendChild(style);

  if (authToken.gemini == "" && authToken.openrouter == "") {
    document.AI_INTEGRATION.canUse = false;
    window.addEventListener('ai-button-clicked', function () {
      main.createBasePopup(2, "");
    });
    return;
  }else{
    //fetch apiUrl + "/AI_models"
    fetch(apiUrl + "/AI_models", {
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
        document.AI_INTEGRATION.AIModels = data;
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
          console.log("Explain this Sprite");
          main.createBasePopup(2, "Explain this Sprite:");
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
          console.log("Explain this block", block);
          main.createBasePopup(1, "Explain this:");
          main.updateCodeChunkAttachment(Blockly.Xml.blockToDom(block));
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
          console.log("Debug this code", block);
          main.createBasePopup(1, "I have the following issue with my code {REPLACE THIS WITH ISSUE}, please help me debug it:");
          main.updateCodeChunkAttachment(Blockly.Xml.blockToDom(block));
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
          console.log("New Chat on this block", block);
          main.createBasePopup(1, "");
          main.updateCodeChunkAttachment(Blockly.Xml.blockToDom(block));
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

  window.addEventListener('ai-button-clicked', function () {
    main.createBasePopup(2, "");
  });
}
