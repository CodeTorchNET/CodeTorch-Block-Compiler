import { handleRawCodeChunk, registerExtensionBlocks } from "./helpers/codeChunkHandler.js";
import helpers from "./helpers/helpers.js";
import showdown from "showdown";
import Attachment from "./helpers/attachment.js";
import TorchyBridge from "./helpers/torchyBridge.js";
import blockDefinitions from "./helpers/blockDefinitions.js";

const converter = new showdown.Converter();
const resistanceThreshold = 10;
const bridge = new TorchyBridge(blockDefinitions);

export default class main {
    static apiUrl;
    static authToken;
    static mainWorkspace;
    static Gaddon;
    constructor() {
    }

    static startNewSessionWithPrompt(fileAttachmentType = 0, inputValue = "", attachmentDOM = null) {
      let session = document.AI_INTEGRATION.getActiveSession();
      if (!session || session.chatHistory.length > 0) {
        session = document.AI_INTEGRATION.createNewSession();
      }
      document.AI_INTEGRATION.activeSessionId = session.id;
      session.inputText = inputValue;
      if (attachmentDOM) {
        const newAttachment = new Attachment();
        newAttachment.attachment(attachmentDOM, vm.runtime.getEditingTarget().sprite.name);
        session.attachment = newAttachment;
        session.attachmentType = String(fileAttachmentType);
      }
      main.createBasePopup();
    }
    
    /**
     * @param {*} fileAttachmentType 0 = no attachment, 1 = code chunk, 2 = entire sprite, 3 = entire project 
     * @param {*} inputValue 
     * @returns 
     */
    static createBasePopup() {
        if (document.AI_INTEGRATION.sessions.length === 0) {
          document.AI_INTEGRATION.createNewSession();
        }

        if (document.getElementById("popupParentDiv") != null) { //reopen the popup
            document.AI_INTEGRATION.popupOpen = true;
            document.getElementById("popupParentDiv").style.display = 'block'; 
            document.getElementById("popupParentDiv").style.zIndex = 509;
            this.renderChatUI();
            this.renderActiveSessionContent();
            document.getElementById('auto-resizing-textarea').focus();
            return;
        }
        document.AI_INTEGRATION.popupOpen = true;

        if (!document.AI_INTEGRATION.canUse) {
            helpers.APIKeyRequiredModal();
            return;
        }

        const div = document.createElement('div');
        div.style.zIndex = 509;
        div.style.position = 'fixed';
        div.id = "popupParentDiv";

        //intial popup dimensions
        div.style.width = '452px';
        div.style.height = '302px';
        div.style.minWidth = '452px';
        div.style.minHeight = '302px';

        const div2 = document.createElement('div');
        div2.className = 'container';
        const divWidth = 452;
        const divHeight = 302;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const tolerance = 10;
        let newLeft = document.AI_INTEGRATION.X_COORDINATE;
        let newTop = document.AI_INTEGRATION.Y_COORDINATE;
        if (newLeft < tolerance) newLeft = tolerance;
        if (newTop < tolerance) newTop = tolerance;
        if (newLeft + divWidth > viewportWidth - tolerance) newLeft = viewportWidth - divWidth - tolerance;
        if (newTop + divHeight > viewportHeight - tolerance) newTop = viewportHeight - divHeight - tolerance;
        div.style.left = `${newLeft}px`;
        div.style.top = `${newTop}px`;
        div2.innerHTML = `
  <div class="headerT">
    <div id="dragHandle" class="drag-handle">
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" height="19" width="19" viewBox="0 0 24 24">
        <circle cx="5" cy="5" r="1.5"></circle>
        <circle cx="12" cy="5" r="1.5"></circle>
        <circle cx="19" cy="5" r="1.5"></circle>
        
        <circle cx="5" cy="12" r="1.5"></circle>
        <circle cx="12" cy="12" r="1.5"></circle>
        <circle cx="19" cy="12" r="1.5"></circle>
        
        <circle cx="5" cy="19" r="1.5"></circle>
        <circle cx="12" cy="19" r="1.5"></circle>
        <circle cx="19" cy="19" r="1.5"></circle>
        </svg>
    </div>
      <div class="chat-tabs-container" id="chat_tabs_container"></div>
    <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="size-6" stroke="currentColor" stroke-width="1.5"  id="closePopup">
                  <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
  </div>
  <div class=content id=chat_content_wrapper>
  </div>
  <div class=input-container id= chat_box>
      <div class=input-parent>
          <textarea class=input-field id=auto-resizing-textarea placeholder="Ask me anything..."></textarea>
          <svg fill= none viewBox="0 0 17 17" xmlns= http:// www.w3.org/ 2000/ id=submitChat svg class= send-icon height= 17 width= 17>
              <g clip-path= url(#clip0_147_21)>
                  <path
                      d="M2.92172 9.30564L1.08789 3.34619C5.47463 4.62202 9.61134 6.63746 13.3197 9.30564C9.61155 11.9738 5.47507 13.9892 1.08856 15.2651L2.92172 9.30564ZM2.92172 9.30564H7.95788"
                      stroke-linecap= round stroke-linejoin= round stroke=#7C7766 stroke-width= 1.5></path>
              </g>
              <defs>
                  <clipPath id= clip0_147_21>
                      <rect fill= white height= 16.1157 transform="translate(0.132812 0.00830078)" width= 16.1157></rect>
                  </clipPath>
              </defs>
          </svg>
      </div>
      <div class="bottomBar" id="bottomBar">
        <div class="AI_selector">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
            stroke="currentColor" class="size-6 svg">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z">
            </path>
          </svg>
          <select name="AI Model Selector" id="AI_Selector_select">
          </select>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
            stroke="currentColor" class="size-6 arrow">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" id="infoAboutAIModels" class="size-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"></path>
        </svg>
        </div>
        <div class="attachedFile" id="attachedFile">
          <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="24" width="24"
            class="svg">
            <path
              d="M2 7V14.7519H4.53246L5.9122 16.0909H8.12402L9.50376 14.7519H22V7H9.50376L8.12402 8.33905H5.9122L4.53246 7H2Z"
              stroke-linecap="round" stroke-linejoin="round" stroke="currentcolor" stroke-width="2"></path>
          </svg>
          <select name="AI Model Selector" id="Context_Selector_select">
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
        <!--<div class="attachedFile" id="AATUCEB">
          <input type="checkbox" id="AATUCEB_CB" name="AATUCEB_CB" value="AATUCEB_CB" />
          <label for="AATUCEB_CB" class="texta" style="margin-top: 1px;">Allow usage of custom extensions</label>
        </div>-->
      </div>
  </div>`;

        let offsetX, offsetY, isDragging = false, startX, startY, hasMoved = false;

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                if (!hasMoved) {
                    const deltaX = Math.abs(e.clientX - startX);
                    const deltaY = Math.abs(e.clientY - startY);
                    if (deltaX < resistanceThreshold && deltaY < resistanceThreshold) {
                        return;
                    }
                    hasMoved = true;
                }

                // Get viewport dimensions
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // Get div dimensions
                const divRect = div.getBoundingClientRect();
                const divWidth = divRect.width;
                const divHeight = divRect.height;

                // Define tolerance
                const tolerance = 10;

                // Calculate new position
                let newLeft = e.clientX - offsetX;
                let newTop = e.clientY - offsetY;

                // Prevent moving out of bounds with tolerance
                if (newLeft < tolerance) newLeft = tolerance;
                if (newTop < tolerance) newTop = tolerance;
                if (newLeft + divWidth > viewportWidth - tolerance) newLeft = viewportWidth - divWidth - tolerance;
                if (newTop + divHeight > viewportHeight - tolerance) newTop = viewportHeight - divHeight - tolerance;

                div.style.left = newLeft + 'px';
                div.style.top = newTop + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            div.style.cursor = "default";
        });
        // Add resize functionality
        let isResizing = false;
        let resizeDirection = null;
        let startWidth, startHeight, startLeft, startTop;

        const handleResizeMouseDown = (direction, e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            resizeDirection = direction;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(div.style.width, 10);
            startHeight = parseInt(div.style.height, 10);
            startLeft = parseInt(div.style.left, 10);
            startTop = parseInt(div.style.top, 10);
            document.body.style.userSelect = 'none';
        };

        const handleResizeMouseMove = (e) => {
            if (!isResizing) return;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const tolerance = 10;
            const minWidth = 452;
            const minHeight = 302;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (resizeDirection.includes('right')) {
                let newWidth = startWidth + dx;
                if (startLeft + newWidth > viewportWidth - tolerance) {
                    newWidth = viewportWidth - startLeft - tolerance;
                }
                div.style.width = `${Math.max(newWidth, minWidth)}px`;
            }
            
            if (resizeDirection.includes('left')) {
                let newWidth = startWidth - dx;
                let newLeft = startLeft + dx;
                
                if (newWidth < minWidth) {
                    newWidth = minWidth;
                    newLeft = startLeft + startWidth - minWidth;
                }
                if (newLeft < tolerance) {
                    newLeft = tolerance;
                    newWidth = startWidth + startLeft - tolerance;
                }
                
                div.style.width = `${newWidth}px`;
                div.style.left = `${newLeft}px`;
            }
        
            if (resizeDirection.includes('bottom')) {
                let newHeight = startHeight + dy;
                if (startTop + newHeight > viewportHeight - tolerance) {
                    newHeight = viewportHeight - startTop - tolerance;
                }
                div.style.height = `${Math.max(newHeight, minHeight)}px`;
            }
        
            if (resizeDirection.includes('top')) {
                let newHeight = startHeight - dy;
                let newTop = startTop + dy;
                
                if (newHeight < minHeight) {
                    newHeight = minHeight;
                    newTop = startTop + startHeight - minHeight;
                }
                if (newTop < tolerance) {
                    newTop = tolerance;
                    newHeight = startHeight + startTop - tolerance;
                }
                
                div.style.height = `${newHeight}px`;
                div.style.top = `${newTop}px`;
            }
        };

        const handleResizeMouseUp = () => {
            isResizing = false;
            resizeDirection = null;
            document.body.style.userSelect = '';
        };

        const leftResize = document.createElement('div');
        leftResize.className = 'resize-handle left-resize';
        const rightResize = document.createElement('div');
        rightResize.className = 'resize-handle right-resize';
        const topResize = document.createElement('div');
        topResize.className = 'resize-handle top-resize';
        const bottomResize = document.createElement('div');
        bottomResize.className = 'resize-handle bottom-resize';

        const topLeftResize = document.createElement('div');
        topLeftResize.className = 'resize-handle top-left-resize';
        const topRightResize = document.createElement('div');
        topRightResize.className = 'resize-handle top-right-resize';
        const bottomLeftResize = document.createElement('div');
        bottomLeftResize.className = 'resize-handle bottom-left-resize';
        const bottomRightResize = document.createElement('div');
        bottomRightResize.className = 'resize-handle bottom-right-resize';


        // Add event listeners for resize handles
        leftResize.addEventListener('mousedown', (e) => handleResizeMouseDown('left', e));
        rightResize.addEventListener('mousedown', (e) => handleResizeMouseDown('right', e));
        topResize.addEventListener('mousedown', (e) => handleResizeMouseDown('top', e));
        bottomResize.addEventListener('mousedown', (e) => handleResizeMouseDown('bottom', e));

        topLeftResize.addEventListener('mousedown', (e) => handleResizeMouseDown('top-left', e));
        topRightResize.addEventListener('mousedown', (e) => handleResizeMouseDown('top-right', e));
        bottomLeftResize.addEventListener('mousedown', (e) => handleResizeMouseDown('bottom-left', e));
        bottomRightResize.addEventListener('mousedown', (e) => handleResizeMouseDown('bottom-right', e));

        document.addEventListener('mousemove', handleResizeMouseMove);
        document.addEventListener('mouseup', handleResizeMouseUp);

        div.appendChild(div2);
        div.appendChild(leftResize);
        div.appendChild(rightResize);
        div.appendChild(topResize);
        div.appendChild(bottomResize);
        div.appendChild(topLeftResize);
        div.appendChild(topRightResize);
        div.appendChild(bottomLeftResize);
        div.appendChild(bottomRightResize);
        document.body.appendChild(div);

        document.getElementById('dragHandle').addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            offsetX = e.clientX - div.offsetLeft;
            offsetY = e.clientY - div.offsetTop;
            div.style.cursor = 'grabbing';
        });

        var textareaa = document.getElementById('auto-resizing-textarea');
        textareaa.addEventListener('input', () => {
            if (textareaa.value.length > (textareaa.offsetWidth / 5.84375) || textareaa.value.includes('\n')) { //make sure there is more than one line
                textareaa.style.height = 'auto';
                textareaa.style.height = `${textareaa.scrollHeight}px`;
                textareaa.style.top = '0px';
            } else {
                textareaa.style.height = '20px';
                textareaa.style.top = '2px';
            }
        });
        
        main.renderChatUI();
        main.renderActiveSessionContent();
        main.popupFunctionality();
        textareaa.focus();
    }

    static rehydrateChatPane(session, pane) {
        pane.innerHTML = '';
        let codeChunkCounter = 0;

        if (!session.chatHistory || session.chatHistory.length === 0) {
            pane.innerHTML = `
                <div class=Popup_Header>
                    <div class=a>
                      ${helpers.FireAnimation}
                    </div>
                    <p class=b>Hi I'm Torchy, How can I help you today?
                </div>
              `;
            return;
        }

        session.chatHistory.forEach(turn => {
            if (turn.role === 'user') {
                const userMessageText = turn.message.split('\n\n\nContext:\n')[0];
                var userMessage = document.createElement('div');
                userMessage.className = 'user-message';

                var messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                
                var textSpan = document.createElement('span');
                textSpan.innerText = userMessageText;
                messageDiv.appendChild(textSpan);
                
                if (turn.attachment && turn.attachment.type !== "0") {
                    var fileAttachmentDiv = document.createElement('div');
                    fileAttachmentDiv.className = 'FileAttachment';
                    var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svgElement.setAttribute("width", "24");
                    svgElement.setAttribute("height", "24");
                    svgElement.setAttribute("viewBox", "0 0 24 24");
                    svgElement.setAttribute("fill", "none");
                    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                    svgElement.classList.add("svg");
                    var pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    pathElement.setAttribute("d", "M2 7V14.7519H4.53246L5.9122 16.0909H8.12402L9.50376 14.7519H22V7H9.50376L8.12402 8.33905H5.9122L4.53246 7H2Z");
                    pathElement.setAttribute("stroke-linecap", "round");
                    pathElement.setAttribute("stroke-linejoin", "round");
                    pathElement.setAttribute("stroke-width", "2");
                    pathElement.setAttribute("stroke", "currentcolor");
                    svgElement.appendChild(pathElement);
                    var attachmentText = document.createElement('p');
                    attachmentText.className = 'p';
                    attachmentText.textContent = turn.attachment.name;
                    fileAttachmentDiv.appendChild(svgElement);
                    fileAttachmentDiv.appendChild(attachmentText);
                    messageDiv.appendChild(fileAttachmentDiv);
                }

                userMessage.appendChild(messageDiv);
                pane.appendChild(userMessage);
            } else if (turn.role === 'assistant') {
                const aiMessage = document.createElement('div');
                aiMessage.className = 'ai-message';
                const messageDiv = document.createElement('p');
                messageDiv.className = 'message';

                let editedStreamResult = turn.message.replaceAll(/```(.*?)```/gs, "CODECHUNK23407283947");
                editedStreamResult = converter.makeHtml(editedStreamResult);

                editedStreamResult = editedStreamResult.replaceAll("CODECHUNK23407283947", () => {
                    const chunkData = session.allCodeChunksEverAdded[codeChunkCounter];
                    codeChunkCounter++;
                    if (!chunkData || !chunkData.renderedHTML) {
                        let rawContent = (chunkData && chunkData.rawCode) ? chunkData.rawCode : "Raw code unavailable";
                        // Sanitize HTML
                        rawContent = rawContent
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;");

                        return `<div class="raw-code-block"><h1 class="errorMessage">failed to parse Code Chunk</h1><pre>${rawContent}</pre></div><br>`;
                    }
                    const uniqueId = codeChunkCounter;
                    const randomId = Math.random().toString(36).substr(2, 5).toUpperCase();

                    return `<div class="codeChunkOverlay"><div class="insert_button_parent"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 insert_button" uniqueid="${uniqueId}"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path></svg></div><div class="codeChunkOverlay_child"><div id="CODEBLOCK_${randomId}_${uniqueId}">${chunkData.renderedHTML}</div></div></div>`;
                });

                messageDiv.innerHTML = editedStreamResult;
                aiMessage.appendChild(messageDiv);
                pane.appendChild(aiMessage);
                main.attachInsertButtonListeners(aiMessage);
            }
        });
    }

    static saveSessionStateFromUI(session) {
      if (!session) return;
  
      const pane = document.querySelector(`.chat-content-pane[data-session-id="${session.id}"]`);
      if (pane) {
          session.domCache = pane.innerHTML;
      }
      session.inputText = document.getElementById('auto-resizing-textarea').value;
      session.selectedModelId = document.getElementById('AI_Selector_select').value;
      session.allowCustomExtensions = true; // document.getElementById('AATUCEB_CB').checked;
      session.attachmentType = document.getElementById('Context_Selector_select').value;
      
      document.AI_INTEGRATION.updateAndSaveSession(session);
    }

    static switchSession(sessionId) {
      document.AI_INTEGRATION.activeSessionId = sessionId;
      document.AI_INTEGRATION.saveActiveSessionMetadata();
      this.renderChatUI();
      this.renderActiveSessionContent();
    }

    static closeSessionUI(sessionId) {
      const paneToRemove = document.querySelector(`.chat-content-pane[data-session-id="${sessionId}"]`);
      if (paneToRemove) {
          paneToRemove.remove();
      }
      if (document.AI_INTEGRATION.sessions.length <= 1) {
        helpers.closePopup();
        document.AI_INTEGRATION.sessions = [];
        document.AI_INTEGRATION.activeSessionId = null;
        return;
      }
      document.AI_INTEGRATION.closeSession(sessionId);
      this.renderChatUI();
      this.renderActiveSessionContent();
    }

    static startNewSessionUI() {
      const currentSession = document.AI_INTEGRATION.getActiveSession();
      if (currentSession) {
        this.saveSessionStateFromUI(currentSession);
      }
      const session = document.AI_INTEGRATION.createNewSession();
      this.switchSession(session.id);
    }
    
    static renderChatUI() {
      const sessions = document.AI_INTEGRATION.sessions;
      const activeSessionId = document.AI_INTEGRATION.activeSessionId;
      const tabsContainer = document.getElementById('chat_tabs_container');
      
      tabsContainer.innerHTML = '<div class="new-chat-tab" id="new_chat_tab"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></div>';
      
      sessions.forEach(session => {
        const tab = document.createElement('div');
        tab.className = `chat-tab ${session.id === activeSessionId ? 'active' : ''}`;
        tab.dataset.sessionId = session.id;
        tab.innerHTML = `
          <span>${session.name}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 close-tab"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        `;
        tabsContainer.insertBefore(tab, document.getElementById('new_chat_tab'));

        tab.addEventListener('click', (e) => {
            if (e.target.closest('.close-tab')) {
                this.closeSessionUI(session.id);
            } else {
                const currentSession = document.AI_INTEGRATION.getActiveSession();
                if (currentSession) {
                    this.saveSessionStateFromUI(currentSession);
                }
                this.switchSession(session.id);
            }
        });
      });

      document.getElementById('new_chat_tab').addEventListener('click', () => this.startNewSessionUI());
    }

    static renderActiveSessionContent() {
      const wrapper = document.getElementById('chat_content_wrapper');
      if (!wrapper) return;
      
      const input = document.getElementById('auto-resizing-textarea');
      const activeSession = document.AI_INTEGRATION.getActiveSession();

      wrapper.querySelectorAll('.chat-content-pane').forEach(pane => {
        pane.style.display = 'none';
      });

      if (!activeSession) {
        if(input) input.value = '';
        return;
      }

      let activePane = wrapper.querySelector(`.chat-content-pane[data-session-id="${activeSession.id}"]`);
      if (!activePane) {
        activePane = document.createElement('div');
        activePane.className = 'chat-content-pane';
        activePane.dataset.sessionId = activeSession.id;

        if (activeSession.domCache) {
          activePane.innerHTML = activeSession.domCache;
          this.attachInsertButtonListeners(activePane);
        } else {
          // Rehydrate from history if available, otherwise show welcome.
          this.rehydrateChatPane(activeSession, activePane);
        }
        wrapper.appendChild(activePane);
      }
      
      activePane.style.display = 'block';
      activePane.scrollTop = activePane.scrollHeight;

      if(input) {
        input.value = activeSession.inputText || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      this.renderAttachmentUI();
      this.renderSettingsUI();
    }

    static renderSettingsUI() {
      const session = document.AI_INTEGRATION.getActiveSession();
      const modelSelector = document.getElementById('AI_Selector_select');
      //const customExtCheckbox = document.getElementById('AATUCEB_CB');

      if (session && modelSelector /*&& customExtCheckbox*/) {
          if (session.selectedModelId && modelSelector.querySelector(`option[value="${session.selectedModelId}"]`)) {
              modelSelector.value = session.selectedModelId;
          } else {
              const defaultOption = modelSelector.querySelector('option:not([disabled])[selected]');
              if (defaultOption) {
                  session.selectedModelId = defaultOption.value;
                  modelSelector.value = defaultOption.value;
              } else { 
                  const firstEnabledOption = modelSelector.querySelector('option:not([disabled])');
                  if (firstEnabledOption) {
                     session.selectedModelId = firstEnabledOption.value;
                     modelSelector.value = firstEnabledOption.value;
                  }
              }
          }
          // customExtCheckbox.checked = session.allowCustomExtensions;
      }
    }

    static renderAttachmentUI() {
      const session = document.AI_INTEGRATION.getActiveSession();
      const select = document.getElementById('Context_Selector_select');
      const option = select.querySelector('option[value="1"]');

      if (session && session.attachment) {
        select.value = session.attachmentType;
        option.disabled = false;
        option.innerText = session.attachment.spriteName;
        select.style.width = "fit-content";
      } else {
        const attachmentType = session ? session.attachmentType : '0';
        select.value = attachmentType;
        option.disabled = true;
        option.innerText = "Code Chunk";
        if (attachmentType === '2') {
          select.style.width = "60px";
        } else if (attachmentType === '3') {
          select.style.width = "66px";
        } else { // '0' or any other case
          select.style.width = "26px";
        }
      }
    }

    static attachInsertButtonListeners(parentElement) {
      parentElement.querySelectorAll('.insert_button').forEach(button => {
        if (button.dataset.listenerAttached) return;
        button.dataset.listenerAttached = 'true';
        button.addEventListener("click", function () {
            const element = this;
            const uniqueid = element.getAttribute("uniqueid");
            const session = document.AI_INTEGRATION.getActiveSession();
            if(!session) return;
            const chunkData = session.allCodeChunksEverAdded[uniqueid - 1];

            function callback() {
                var workspace = main.mainWorkspace;
                var xml = Blockly.Xml.textToDom(chunkData.BlocksAsXML);
                var [listNames, variableNames, broadcastNames] = helpers.workspaceVariables(true, main.mainWorkspace);
                for (var name of chunkData.variables) if (!variableNames.includes(name)) main.mainWorkspace.createVariable(name, "", null);
                for (var name of chunkData.lists) if (!listNames.includes(name)) main.mainWorkspace.createVariable(name, "list", null);
                for (var name of chunkData.broadcasts) if (!broadcastNames.includes(name)) main.mainWorkspace.createVariable(name, "broadcast_msg", null);
                
                if (replacingBlocksInternal.length > 0) {
                    main.mainWorkspace.getAllBlocks().forEach(block => {
                        if (block.type == "procedures_definition" && replacingBlocksInternal.includes(block.id)) block.dispose();
                    });
                }

                var totalWidth = 0;
                Array.from(xml.children).forEach(block => {
                    const newBlock = ScratchBlocks.Xml.domToBlock(block, workspace);
                    const x = workspace.scrollX + totalWidth || 0;
                    const y = workspace.scrollY || 0;
                    try { newBlock.moveBy(x, y); } catch (e) { console.error("failed to move block", e); }
                    totalWidth += (newBlock.getBoundingRectangle().bottomRight.x - newBlock.getBoundingRectangle().topLeft.x) + 20;
                });
                main.mainWorkspace.refreshToolboxSelection_();
            }

            var message = `<p style="font-weight: 900;margin-bottom: 10px;">Adding this code will:</p><ul>`;
            var [listNames, variableNames] = helpers.workspaceVariables(false, main.mainWorkspace);
            var newVariables = chunkData.variables.filter(name => !variableNames.includes(name));
            var newLists = chunkData.lists.filter(name => !listNames.includes(name));
            var existingVariables = chunkData.variables.filter(name => variableNames.includes(name));
            var existingLists = chunkData.lists.filter(name => listNames.includes(name));

            if (newVariables.length > 0) message += `<li>Create ${newVariables.length} new ${newVariables.length == 1 ? "variable" : "variables"}: "${newVariables.join('", "')}"</li>`;
            if (newLists.length > 0) message += `<li>Create ${newLists.length} new ${newLists.length == 1 ? "list" : "lists"}: "${newLists.join('", "')}"</li>`;
            if (existingVariables.length > 0) message += `<li>Use ${existingVariables.length} existing ${existingVariables.length == 1 ? "variable" : "variables"}: "${existingVariables.join('", "')}"</li>`;
            if (existingLists.length > 0) message += `<li>Use ${existingLists.length} existing ${existingLists.length == 1 ? "list" : "lists"}: "${existingLists.join('", "')}"</li>`;

            var currentWorkspaceBlocks = helpers.getCustomBlockNames(Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(main.mainWorkspace)));
            var newBlocks = helpers.getCustomBlockNames(chunkData.BlocksAsXML);
            var replacingBlocks = [], replacingBlocksInternal = [], trulyNewBlocks = [];

            for (var block of newBlocks) {
                var matchingBlock = currentWorkspaceBlocks.find(b => b.customBlockName === block.customBlockName);
                const cleanName = "\"" + block.customBlockName.replaceAll(/%[sbn]/g, "").trim() + "\"";
                if (matchingBlock) {
                    replacingBlocks.push(cleanName);
                    replacingBlocksInternal.push(matchingBlock.blockId);
                } else {
                    trulyNewBlocks.push(cleanName);
                }
            }

            if (trulyNewBlocks.length > 0) message += `<li>Create ${trulyNewBlocks.length} new block${trulyNewBlocks.length > 1 ? "s" : ""}: ${trulyNewBlocks.join(", ")}</li>`;
            if (replacingBlocks.length > 0) message += `<li>Replace ${replacingBlocks.length} existing block${replacingBlocks.length > 1 ? "s" : ""}: ${replacingBlocks.join(", ")} <span><p class="errorMessage">(THIS WILL REPLACE YOUR CURRENT BLOCK DEFINITION)</p></span></li>`;
            if (message === `<p style="font-weight: 900;margin-bottom: 10px;">Adding this code will:</p><ul>`) message = `<p>This code does not create/use any variables or lists.</p>`;
            else message += `</ul>`;

            ScratchBlocks.prompt(message, null, callback, "Add Code to Workspace?", ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE, true);
        });
      });
    }

    static popupFunctionality() {
        helpers.updateAIModels(main.authToken.gemini, main.authToken.openrouter);

        document.getElementById("Context_Selector_select").addEventListener("change", (e) => {
            if (e.target.value == "0") {
                e.target.style.width = "26px";
            } else if (e.target.value == "3") {
                e.target.style.width = "66px";
            } else if (e.target.value == "2") {
                e.target.style.width = "60px";
            } else {
                e.target.style.width = "fit-content";
            }
            const session = document.AI_INTEGRATION.getActiveSession();
            if (session) {
                session.attachmentType = e.target.value;
                document.AI_INTEGRATION.updateAndSaveSession(session);
            }
        });

        document.getElementById('AI_Selector_select').addEventListener('change', (e) => {
            const session = document.AI_INTEGRATION.getActiveSession();
            if (session) {
                session.selectedModelId = e.target.value;
                document.AI_INTEGRATION.updateAndSaveSession(session);
            }
        });

        // always allow custom extensions
        // document.getElementById('AATUCEB_CB').addEventListener('change', (e) => {
        //     if (e.target.checked) {
        //         ReduxStore.dispatch({
        //             type: "scratch-gui/alerts/SHOW_ALERT",
        //             alertId: "TorchyCustomBlockWarning",
        //         })
        //     }
        //     const session = document.AI_INTEGRATION.getActiveSession();
        //     if (session) {
        //         session.allowCustomExtensions = e.target.checked;
        //         document.AI_INTEGRATION.updateAndSaveSession(session);
        //     }
        // });
        document.getElementById('closePopup').addEventListener('click', () => {
            const session = document.AI_INTEGRATION.getActiveSession();
            if (session) {
                this.saveSessionStateFromUI(session);
            }
            helpers.closePopup();
        });
        document.getElementById('submitChat').addEventListener('click', () => {
            internal();
        });
        //add send command for enter + shift
        document.getElementById('auto-resizing-textarea').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                internal();
            }
        });

        function internal() {
            const requestingSession = document.AI_INTEGRATION.getActiveSession();
            if (!requestingSession) return;
            
            const allowCustomExtensions = true;// document.getElementById('AATUCEB_CB').checked;
            
            if (allowCustomExtensions) {
                // Dynamically load extension definitions
                const extensionDefs = helpers.generateExtensionDefinitions(vm.runtime);
                
                // Register to the local bridge (for attachments/context)
                bridge.registerDefinitions(extensionDefs);
                
                // Register to the code handler bridge (for parsing AI output)
                registerExtensionBlocks(extensionDefs);
                
                console.log(`[Torchy] Loaded ${extensionDefs.length} custom extension blocks.`);
            }

            const attachmentType = document.getElementById('Context_Selector_select').value;
            if (requestingSession.isBlabbering) {
                ReduxStore.dispatch({
                    type: "scratch-gui/alerts/SHOW_ALERT",
                    alertId: "TorchyWaitForAIToFinishWarning",
                })
                return;
            }
            requestingSession.isBlabbering = true;
            requestingSession.attachmentType = attachmentType;
            const input = document.getElementById('auto-resizing-textarea');

            if (input.value.trim() == "") {
                requestingSession.isBlabbering = false;
                return;
            }

            const sessionPane = document.querySelector(`.chat-content-pane[data-session-id="${requestingSession.id}"]`);
            if (!sessionPane) {
                console.error("Could not find session pane for session", requestingSession.id);
                requestingSession.isBlabbering = false;
                return;
            }

            let attachmentName = "";
            if (attachmentType !== "0") {
                if(attachmentType === "1") attachmentName = requestingSession.attachment ? requestingSession.attachment.spriteName : "Code Chunk";
                else if (attachmentType === "2") attachmentName = "Entire Sprite";
                else if (attachmentType === "3") attachmentName = "Entire Project";
            }

            if (attachmentType != "0") {
                var userMessage = document.createElement('div');
                userMessage.className = 'user-message';
                var messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                var textSpan = document.createElement('span');
                textSpan.textContent = input.value;
                messageDiv.appendChild(textSpan);
                var fileAttachmentDiv = document.createElement('div');
                fileAttachmentDiv.className = 'FileAttachment';
                var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svgElement.setAttribute("width", "24");
                svgElement.setAttribute("height", "24");
                svgElement.setAttribute("viewBox", "0 0 24 24");
                svgElement.setAttribute("fill", "none");
                svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                svgElement.classList.add("svg");
                var pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathElement.setAttribute("d", "M2 7V14.7519H4.53246L5.9122 16.0909H8.12402L9.50376 14.7519H22V7H9.50376L8.12402 8.33905H5.9122L4.53246 7H2Z");
                pathElement.setAttribute("stroke-linecap", "round");
                pathElement.setAttribute("stroke-linejoin", "round");
                pathElement.setAttribute("stroke-width", "2");
                pathElement.setAttribute("stroke", "currentcolor");
                svgElement.appendChild(pathElement);
                var attachmentText = document.createElement('p');
                attachmentText.className = 'p';
                attachmentText.textContent = attachmentName;
                fileAttachmentDiv.appendChild(svgElement);
                fileAttachmentDiv.appendChild(attachmentText);
                messageDiv.appendChild(fileAttachmentDiv);
                userMessage.appendChild(messageDiv);
                sessionPane.appendChild(userMessage);
            } else {
                var userMessage = document.createElement('div');
                userMessage.className = 'user-message';
                var message = document.createElement('div');
                message.className = 'message';
                message.innerText = input.value;
                userMessage.appendChild(message);
                sessionPane.appendChild(userMessage);
            }
            var customNames = "";
            for (var customName of vm.runtime.getEditingTarget().sprite.costumes) customNames += customName.name + ", ";
            var soundNames = "";
            for (var soundName of vm.runtime.getEditingTarget().sprite.sounds) soundNames += soundName.name + ", ";
            var allSpriteNames = vm.runtime.targets
                .filter(target => target.isSprite && target.getName() !== "Stage")
                .map(sprite => sprite.getName())
                .join(", ");

            var attachmentCode = "";
            if (attachmentType == "1") {
                if (requestingSession.attachment) {
                    const blockDom = requestingSession.attachment.GetAttachment(Blockly.Xml.workspaceToDom(main.mainWorkspace));
                    // Wrap in <xml> so TorchyBridge parser finds it (it searches for "xml > block")
                    const xmlText = "<xml>" + Blockly.Xml.domToText(blockDom) + "</xml>";
                    attachmentCode = "\nAttached Code:\n" + bridge.toText(xmlText);
                }
            } else if (attachmentType == "2") {
                const xmlText = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(main.mainWorkspace));
                attachmentCode = "\nAttached Code:\n" + bridge.toText(xmlText);
            } else if (attachmentType == "3") {
                let projectCode = "";
                const targets = main.Gaddon.tab.redux.state.scratchGui.vm.runtime.targets;
                for (const target of targets) {
                    if (target.isOriginal) {
                        const name = target.getName();
                        const xml = target.blocks.toXML()
                                    .replace(/[\n\r]+\s*/g, ' ')
                                    .replace(/>\s+</g, '><')
                                    .trim()
                                    .replace('>,<','><');
                        const text = bridge.toText(`<xml>${xml}</xml>`);
                        if (text && text !== "No blocks found.") {
                            projectCode += `\n--- Sprite: ${name} ---\n${text}\n`;
                        }
                    }
                }
                attachmentCode = "\nAttached Code:\n" + projectCode;
            }
            console.log("attachment:", attachmentCode)
            const selectedModelForAttachment = document.AI_INTEGRATION.AIModels.find(m => m.id === document.getElementById('AI_Selector_select').value);
            if (!selectedModelForAttachment || selectedModelForAttachment.API_KEY_TYPE !== 'gemini') {
                requestingSession.attachment = null;
            }
            main.renderAttachmentUI();
            
            const userMessageFinal = input.value;
            const attachmentInfo = { type: attachmentType, name: attachmentName };
            const contextString = attachmentCode + "\n\n\nContext:\nSprite Customes: " + customNames + "\nSprite Sounds: " + soundNames + "\nAll Sprites Names: " + allSpriteNames + "\nCurrent Sprite Name:" + vm.runtime.getEditingTarget().sprite.name;

            input.value = '';
            //reset input height
            input.style.height = '20px';
            input.style.top = '2px';

            function requestChat(userMessage, contextString, session, attachmentInfo) {
                const messageId = `blabbering-message-${session.id}-${Date.now()}`;
                var loadingDots = document.createElement('div');
                loadingDots.className = 'ai-message';
                loadingDots.id = `loading-dots-${session.id}`;
                loadingDots.innerHTML = `
                <div class="message" style="width: 22px;">
                    <div class="dot-elastic"></div>
                </div>
            `;
                if(sessionPane.querySelector('.Popup_Header')) {
                    sessionPane.querySelector('.Popup_Header').remove();
                }
                sessionPane.appendChild(loadingDots);
                //scroll to bottom
                sessionPane.scrollTop = sessionPane.scrollHeight;
                document.AI_INTEGRATION.CodeChunks = [];

                var authTokenToUse = "";
                const selectedModelId = document.getElementById('AI_Selector_select').value;
                const selectedModel = document.AI_INTEGRATION.AIModels.find(m => m.id === selectedModelId);

                if (!selectedModel) {
                    console.error("No AI Model selected");
                    helpers.messageErrorOccured(userMessage + contextString, session);
                    return;
                }
                
                authTokenToUse = selectedModel.API_KEY_TYPE;
                
                if (authTokenToUse == "gemini") {
                    authTokenToUse = main.authToken.gemini;
                } else if (authTokenToUse == "openrouter") {
                    authTokenToUse = main.authToken.openrouter;
                } else {
                    console.error("Invalid API Key Type");
                    helpers.messageErrorOccured(userMessage + contextString, session);
                    return;
                }

                let data;
                let messageForHistory;

                const historyForAPI = [
                    { "role": "user", "message": bridge.generateToolboxReference() },
                    ...session.chatHistory
                ];

                if (selectedModel && selectedModel.API_KEY_TYPE === 'gemini') {
                    data = {
                        api_key: authTokenToUse,
                        message: userMessage, // pure user message
                        history: historyForAPI,
                        ai_model: selectedModelId,
                        context: contextString,
                    };
                    messageForHistory = userMessage;
                } else {
                    // For other models, combine user message and context.
                    const fullMessage = userMessage + contextString;
                    data = {
                        api_key: authTokenToUse,
                        message: fullMessage,
                        history: historyForAPI,
                        ai_model: selectedModelId,
                    };
                    messageForHistory = fullMessage;
                }

                helpers.fetchWithTimeout(main.apiUrl + "/chat", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                }, 30000)
                    .then(response => {
                        if (response.ok) {
                            const reader = response.body.getReader();
                            const decoder = new TextDecoder();
                            let streamResult = '';

                            const loadingDotsEl = document.getElementById(`loading-dots-${session.id}`);
                            if (loadingDotsEl) loadingDotsEl.remove();

                            var aiMessage = document.createElement('div');
                            aiMessage.className = 'ai-message';
                            aiMessage.innerHTML = `<p class="message ` + (main.Gaddon.tab.redux.state.scratchGui.theme.theme.gui == "light" ? "animated-text-light" : "animated-text") + `" id="${messageId}">loading...</p>`;
                            sessionPane.appendChild(aiMessage);

                            var chunkNumber = 0;
                            const domParser = new DOMParser();
                            helpers.isFirstRequest = true;
                            helpers.readWithTimeout(reader)
                                .then(async function processText({ done, value }) {
                                    if (done) {
                                        session.isBlabbering = false;

                                        const userHistoryObject = {
                                            role: "user",
                                            message: userMessage, // Use the pure user message
                                        };
                                        if (attachmentInfo && attachmentInfo.type !== "0") {
                                            userHistoryObject.attachment = attachmentInfo;
                                        }
                                        session.chatHistory.push(userHistoryObject);
                                        session.chatHistory.push({ "role": "assistant", "message": streamResult });

                                        async function processAndRenderCodeChunks() {
                                            var randomId = Math.random().toString(36).substr(2, 5).toUpperCase();
                                            document.AI_INTEGRATION.CodeChunks = streamResult.match(/```(.*?)```/gs) || [];
                                            document.AI_INTEGRATION.processedCodeChunks = [];
 
                                            const processedChunks = await Promise.all(
                                                document.AI_INTEGRATION.CodeChunks.map((chunk, index) =>
                                                    handleRawCodeChunk(chunk, `${randomId}_${index}`, main.mainWorkspace)
                                                )
                                            );

                                            document.AI_INTEGRATION.processedCodeChunks = processedChunks;
 
                                            let instanceCount = -1;
                                            var editedStreamResult = streamResult.replaceAll(/```(.*?)```/gs, "CODECHUNK23407283947");
                                            editedStreamResult = converter.makeHtml(editedStreamResult)
                                            editedStreamResult = editedStreamResult.replaceAll("CODECHUNK23407283947", () => {
                                                instanceCount++;
                                                if (document.AI_INTEGRATION.processedCodeChunks[instanceCount].status == "error") {
                                                    // Retrieve original raw chunk (sanitize for HTML)
                                                    let rawContent = document.AI_INTEGRATION.CodeChunks[instanceCount] || "";
                                                    rawContent = rawContent
                                                        .replace(/&/g, "&amp;")
                                                        .replace(/</g, "&lt;")
                                                        .replace(/>/g, "&gt;");
                                                    
                                                    return `<div class="raw-code-block"><h1 class="errorMessage">failed to parse Code Chunk</h1><pre>${rawContent}</pre></div><br>`;
                                                }
                                                const chunkDataForThisInstance = document.AI_INTEGRATION.processedCodeChunks[instanceCount];
                                                session.allCodeChunksEverAdded.push(chunkDataForThisInstance);
                                                let Div = document.createElement('div');
                                                Div.id = `TEMPCODEBLOCK${instanceCount}`;
                                                Div.style.position = 'absolute';
                                                Div.style.opacity = '0';
                                                Div.style.pointerEvents = 'none';
                                                Div.style.zIndex = '-9999';
                                                Div.style.width = '500px';
                                                Div.innerHTML = `<div id="CODEBLOCK${instanceCount}">${document.AI_INTEGRATION.processedCodeChunks[instanceCount].blocksAsSVG}</div>`;
                                                document.body.appendChild(Div);
                                                var codeBlockWidth = [];
                                                var codeBlockHeight = [];
                                                const theDiv = document.getElementById(`CODEBLOCK${instanceCount}`).children[0];
                                                for (var xx = 0; xx < theDiv.children.length; xx++) {
                                                    codeBlockWidth.push(theDiv.children[xx].children[1].getBBox().width);
                                                    codeBlockHeight.push(theDiv.children[xx].children[1].getBoundingClientRect().height);
                                                }
                                                document.getElementById(`TEMPCODEBLOCK${instanceCount}`).remove();

                                                let svg = domParser.parseFromString(document.AI_INTEGRATION.processedCodeChunks[instanceCount].blocksAsSVG, "text/html");
                                                svg = svg.body.children[0]; // This is the <div> containing one or more <svg> elements
                                                for (var i = 0; i < svg.children.length; i++) {
                                                    const svgElement = svg.children[i];
                                                    const width = codeBlockWidth[i];
                                                    const height = codeBlockHeight[i];

                                                    // Set the viewBox to define the internal coordinate system.
                                                    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
                                                    
                                                    // CRITICAL FIX: Set the width and height to define the element's size in the layout.
                                                    svgElement.setAttribute('width', width);
                                                    svgElement.setAttribute('height', height);
                                                }
                                                chunkDataForThisInstance.renderedHTML = svg.outerHTML;
                                                return `<div class="codeChunkOverlay"><div class="insert_button_parent"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 insert_button" uniqueid="${session.allCodeChunksEverAdded.length}"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path></svg></div><div class="codeChunkOverlay_child"><div id="CODEBLOCK_${randomId}_${instanceCount}">${svg.outerHTML}</div></div></div>`;
                                            });

                                            const blabberingElement = document.getElementById(messageId);
                                            if (blabberingElement) {
                                              blabberingElement.innerHTML = editedStreamResult;
                                              main.attachInsertButtonListeners(blabberingElement);
                                              blabberingElement.className = 'message';
                                              blabberingElement.id = '';
                                            }
                                        } 
                                        await processAndRenderCodeChunks(); 
                                        document.AI_INTEGRATION.updateAndSaveSession(session); 
                                        return;

                                    }
                                    const blabberingElement = document.getElementById(messageId);
                                    if (blabberingElement) blabberingElement.className = 'message';
                                    // Decode the chunk and append to the stream result
                                    streamResult += decoder.decode(value, { stream: true });

                                    const animatedTextClass = main.Gaddon.tab.redux.state.scratchGui.theme.theme.gui == "light" ? "animated-text-light" : "animated-text";
                                    function updateMessageContents() {
                                        chunkNumber = 1;
                                        var edittedStreamResult = streamResult.replace(/```(.*?)```/gs, () => `<div class="codeChunkOverlay"><p>Currently Processing Code Block</p></div>`);
                                        edittedStreamResult = edittedStreamResult.replace(/```[\s\S]*$/, "<div><p class=\"" + animatedTextClass + "\">currently writing a code block</p><p id=\"chunkNumber\">(Recieved " + chunkNumber + " chunk)</p></div>");
                                        edittedStreamResult = converter.makeHtml(edittedStreamResult);
                                        if (blabberingElement) {
                                            blabberingElement.innerHTML = edittedStreamResult;
                                            sessionPane.scrollTop = sessionPane.scrollHeight;
                                        }
                                        reader.read().then(processText);
                                    }
                                    if (blabberingElement && (streamResult.match(/```/g) || []).length % 2 == 1) { //fixed animation resetting bug
                                        if (blabberingElement.innerHTML.includes("<p class=\"" + animatedTextClass + "\">currently writing a code block</p>")) {
                                            chunkNumber++;
                                            document.getElementById("chunkNumber").innerText = `(Received ${chunkNumber} chunks for this code block)`;
                                            reader.read().then(processText);
                                        } else {
                                            updateMessageContents()
                                        }
                                    } else {
                                        updateMessageContents()
                                    }
                                })
                                .catch(error => {
                                    console.error("Error reading:", error);
                                    helpers.messageErrorOccured(messageForHistory, session);
                                    const loadingDotsEl = document.getElementById(`loading-dots-${session.id}`);
                                    if (loadingDotsEl) loadingDotsEl.remove();
                                    const errorEl = document.getElementById(messageId);
                                    if (errorEl) {
                                        errorEl.innerHTML = `<h1 class="errorMessage">Error reading response</h1>`;
                                        errorEl.className = 'message';
                                        errorEl.id = '';
                                    }
                                });
                        } else {
                            console.error('Error:', response.statusText);
                            helpers.messageErrorOccured(messageForHistory, session);
                            const loadingDotsEl = document.getElementById(`loading-dots-${session.id}`);
                            if (loadingDotsEl) loadingDotsEl.remove();
                             const errorEl = document.getElementById(messageId);
                             if (errorEl) {
                                errorEl.innerHTML = `<h1 class="errorMessage">Error reading response</h1>`;
                                errorEl.className = 'message';
                                errorEl.id = '';
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Request failed', error);
                        helpers.messageErrorOccured(messageForHistory, session);
                        const loadingDotsEl = document.getElementById(`loading-dots-${session.id}`);
                        if (loadingDotsEl) loadingDotsEl.remove();
                        const errorEl = document.getElementById(messageId);
                        if (errorEl) {
                            errorEl.innerHTML = `<h1 class="errorMessage">Error reading response</h1>`;
                            errorEl.className = 'message';
                            errorEl.id = '';
                        }
                    });
            }
            requestChat(userMessageFinal, contextString, requestingSession, attachmentInfo);
        }
    }
}
