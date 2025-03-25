import { handleRawCodeChunk } from "./helpers/codeChunkHandler.js";
import helpers from "./helpers/helpers.js";
import showdown from "showdown";
import Attachment from "./helpers/attachment.js";

const attachment = new Attachment();
const converter = new showdown.Converter();
const resistanceThreshold = 10;

export default class main {
    static apiUrl;
    static authToken;
    static mainWorkspace;
    static Gaddon;
    constructor() {
    }
    static updateCodeChunkAttachment(AttachmentDetails) {
        document.getElementById('Context_Selector_select').value = '1';
        document.getElementById('Context_Selector_select').children[0].disabled = false;
        attachment.attachment(AttachmentDetails, vm.runtime.getEditingTarget().sprite.name);
        document.getElementById('Context_Selector_select').children[0].innerText = attachment.spriteName;
        document.getElementById('Context_Selector_select').style.width = "fit-content";
    }
    /**
     * @param {*} fileAttachmentType 0 = no attachment, 1 = code chunk, 2 = entire sprite, 3 = entire project 
     * @param {*} inputValue 
     * @returns 
     */
    static createBasePopup(fileAttachmentType = 0, inputValue = "") {
        fileAttachmentType = String(fileAttachmentType);
        if (document.querySelector('.container') != null || document.AI_INTEGRATION.popupOpen) { //reopen the popup
            document.AI_INTEGRATION.popupOpen = true;
            document.querySelector('.container').style.display = '';
            document.querySelector('.container').style.zIndex = 509;
            //FINISH ADDING SUPPORT TO reopening popup
            var textareaa = document.getElementById('auto-resizing-textarea');
            //focus on textarea
            textareaa.focus();

            textareaa.value = inputValue;

            if (textareaa.value.length > 64 || textareaa.value.includes('\n')) {
                textareaa.style.height = 'auto';
                textareaa.style.height = `${textareaa.scrollHeight}px`;
                textareaa.style.top = '0px';
            } else {
                textareaa.style.height = '20px';
                textareaa.style.top = '2px';
            }

            document.getElementById('Context_Selector_select').value = fileAttachmentType;
            return;
        }
        document.AI_INTEGRATION.popupOpen = true;

        if (!document.AI_INTEGRATION.canUse) {
            helpers.APIKeyRequiredModal();
            return;
        }


        const div = document.createElement('div');
        div.className = 'container';
        div.style.zIndex = 509;
        div.style.position = 'fixed';
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
        div.innerHTML = `
  <div class="headerT">
  <svg id="clearChat" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
</svg>
  <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="size-6" stroke="currentColor" stroke-width="1.5"  id="closePopup">
                <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
  </div>
  <div class= content id= chat_content>
      <div class=Popup_Header>
          <div class=a>
             ${helpers.FireAnimation}
          </div>
          <p class=b>Hi I'm Torchy, How can I help you today?
      </div>
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
            <option value="0">None</option>
            <option value="2">Entire Sprite</option>
            <option value="3">Entire Project</option>
          </select>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
            stroke="currentColor" class="size-6 arrow">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"></path>
          </svg>
        </div>
        <div class="attachedFile" id="AATUCEB">
          <input type="checkbox" id="AATUCEB_CB" name="AATUCEB_CB" value="AATUCEB_CB" />
          <label for="AATUCEB_CB" class="texta" style="margin-top: 1px;">Allow usage of custom extensions</label>
        </div>
      </div>
  </div>`;

        let offsetX, offsetY, isDragging = false, startX, startY, hasMoved = false;

        div.addEventListener('mousedown', (e) => {
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            offsetX = e.clientX - div.offsetLeft;
            offsetY = e.clientY - div.offsetTop;
            div.style.cursor = 'grabbing';
        });

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

        //add to body
        document.body.appendChild(div);

        var textareaa = document.getElementById('auto-resizing-textarea');
        //focus on textarea
        textareaa.focus();

        textareaa.value = inputValue;
        if (textareaa.value.length > 64 || textareaa.value.includes('\n')) { //must be done once in the beginning due to the fact that `inputValue` might be a long string
            textareaa.style.height = 'auto';
            textareaa.style.height = `${textareaa.scrollHeight}px`;
            textareaa.style.top = '0px';
        } else {
            textareaa.style.height = '20px';
            textareaa.style.top = '2px';
        }
        textareaa.addEventListener('input', () => {
            if (textareaa.value.length > 64 || textareaa.value.includes('\n')) { //make sure there is more than one line
                textareaa.style.height = 'auto';
                textareaa.style.height = `${textareaa.scrollHeight}px`;
                textareaa.style.top = '0px';
            } else {
                textareaa.style.height = '20px';
                textareaa.style.top = '2px';
            }
        });
        document.getElementById('Context_Selector_select').value = fileAttachmentType;
        if (fileAttachmentType == "1") {
            document.getElementById('Context_Selector_select').style.width = "26px";
        } else if (fileAttachmentType == "3") {
            document.getElementById('Context_Selector_select').style.width = "66px";
        } else if (fileAttachmentType == "2") {
            document.getElementById('Context_Selector_select').style.width = "60px";
        } else {
            document.getElementById('Context_Selector_select').style.width = "fit-content";
        }

        main.popupFunctionality();
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
        });

        document.getElementById('AATUCEB_CB').addEventListener('change', (e) => {
            if (e.target.checked) {
                ReduxStore.dispatch({
                    type: "scratch-gui/alerts/SHOW_ALERT",
                    alertId: "TorchyCustomBlockWarning",
                })
            }
        });
        document.getElementById('closePopup').addEventListener('click', () => {
            helpers.closePopup();
        });
        document.getElementById('clearChat').addEventListener('click', () => {
            //prompt user if they are sure
            if (confirm("Are you sure you want to clear the chat?")) {
                while (document.getElementById('chat_content').children.length > 1) {
                    document.getElementById('chat_content').children[1].remove();
                }
                helpers.disableCodeChunkAttachment();
                document.AI_INTEGRATION.AI_currently_blabbering = false;
                document.AI_INTEGRATION.CodeChunks = [];
                document.AI_INTEGRATION.AllCodeChunksEverAdded = [];
                document.AI_INTEGRATION.processedCodeChunks = [];
                document.AI_INTEGRATION.chatHistory = [];
                document.AI_INTEGRATION.errorsDetected = [];
            }
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
            const attachmentType = document.getElementById('Context_Selector_select').value;
            if (document.AI_INTEGRATION.AI_currently_blabbering) {
                ReduxStore.dispatch({
                    type: "scratch-gui/alerts/SHOW_ALERT",
                    alertId: "TorchyWaitForAIToFinishWarning",
                })
                return;
            }
            document.AI_INTEGRATION.AI_currently_blabbering = true;
            const input = document.getElementById('auto-resizing-textarea');

            if (input.value.trim() == "") {
                return;
            }
            if (attachmentType != "0") {
                helpers.disableCodeChunkAttachment();

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
                attachmentText.textContent = (attachmentType == "1" ? attachment.spriteName : (attachmentType == "2" ? "Entire Sprite" : "Entire Project"));
                fileAttachmentDiv.appendChild(svgElement);
                fileAttachmentDiv.appendChild(attachmentText);
                messageDiv.appendChild(fileAttachmentDiv);
                userMessage.appendChild(messageDiv);
                document.getElementById('chat_content').appendChild(userMessage);
            } else {
                var userMessage = document.createElement('div');
                userMessage.className = 'user-message';
                //userMessage.innerHTML = `
                //    <div class="message">${input.value}</div>
                //`;
                var message = document.createElement('div');
                message.className = 'message';
                message.innerText = input.value;
                userMessage.appendChild(message);
                document.getElementById('chat_content').appendChild(userMessage);
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
                attachmentCode = "\nAttached Code:" + Attachment.getAttachmentReady(attachment.GetAttachment(Blockly.Xml.workspaceToDom(main.mainWorkspace)));
            } else if (attachmentType == "2") {
                attachmentCode = "\nAttached Code:" + Attachment.getAttachmentReady(Blockly.Xml.workspaceToDom(main.mainWorkspace));
            } else if (attachmentType == "3") {
                attachmentCode = "\nAttached Code:" + Attachment.getAttachmentReady(helpers.returnEntireProjectAsXML(main.Gaddon));
            }
            const messageContents = input.value + attachmentCode + "\n\n\nContext:\nSprite Customes: " + customNames + "\nSprite Sounds: " + soundNames + "\nAll Sprites Names: " + allSpriteNames + "\nCurrent Sprite Name:" + vm.runtime.getEditingTarget().sprite.name;
            input.value = '';
            //reset input height
            input.style.height = '20px';
            input.style.top = '2px';

            function requestChat(messageContents) {
                var loadingDots = document.createElement('div');
                loadingDots.className = 'ai-message';
                loadingDots.id = "AI_is_thinking_what_to_blabber";
                loadingDots.innerHTML = `
                <div class="message" style="width: 22px;">
                    <div class="dot-elastic"></div>
                </div>
            `;
                document.getElementById('chat_content').appendChild(loadingDots);
                //scroll to bottom
                document.getElementById('chat_content').scrollTop = document.getElementById('chat_content').scrollHeight;
                document.AI_INTEGRATION.CodeChunks = [];

                var authTokenToUse = "";
                for (var i of document.AI_INTEGRATION.AIModels) {
                    if (i.id == document.getElementById('AI_Selector_select').value) {
                        authTokenToUse = i.API_KEY_TYPE;
                    }
                }
                if (authTokenToUse == "") {
                    console.error("No API Key found for the selected AI Model");
                    return;
                }
                if (authTokenToUse == "gemini") {
                    authTokenToUse = main.authToken.gemini;
                } else if (authTokenToUse == "openrouter") {
                    authTokenToUse = main.authToken.openrouter;
                } else {
                    console.error("Invalid API Key Type");
                    return;
                }
                var data = {
                    api_key: authTokenToUse,
                    message: messageContents,
                    history: [{ "role": "user", "message": helpers.returnSterilizedToolbox(main.Gaddon, main.mainWorkspace, document.getElementById("AATUCEB_CB").checked) }, ...document.AI_INTEGRATION.chatHistory],
                    ai_model: document.getElementById('AI_Selector_select').value,
                };

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

                            //remove the loading dots
                            document.getElementById('AI_is_thinking_what_to_blabber').remove();
                            if (document.getElementById("currentlyBlabberingOnThis") != null) { //fixes a glitch
                                document.getElementById("currentlyBlabberingOnThis").remove();
                            }
                            var aiMessage = document.createElement('div');
                            aiMessage.className = 'ai-message';
                            aiMessage.innerHTML = `<p class="message ` + (main.Gaddon.tab.redux.state.scratchGui.theme.theme.gui == "light" ? "animated-text-light" : "animated-text") + `" id="currentlyBlabberingOnThis">loading...</p>`;
                            document.getElementById('chat_content').appendChild(aiMessage);

                            var chunkNumber = 0;
                            const domParser = new DOMParser();
                            helpers.isFirstRequest = true;
                            helpers.readWithTimeout(reader)
                                .then(function processText({ done, value }) {
                                    if (done) {

                                        document.AI_INTEGRATION.AI_currently_blabbering = false;
                                        document.AI_INTEGRATION.chatHistory.push({ "role": "user", "message": messageContents });
                                        document.AI_INTEGRATION.chatHistory.push({ "role": "assistant", "message": streamResult });
                                        helpers.disableCodeChunkAttachment();

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
                                                    return "<h1 class=\"errorMessage\">failed to parse Code Chunk</h1><br>"
                                                }
                                                document.AI_INTEGRATION.AllCodeChunksEverAdded.push(document.AI_INTEGRATION.processedCodeChunks[instanceCount]);
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
                                                svg = svg.body.children[0];
                                                for (var i = 0; i < svg.children.length; i++) {
                                                    //svg.setAttribute('viewBox', `0 0 ${codeBlockWidth} ${codeBlockHeight}`);
                                                    svg.children[i].setAttribute('viewBox', `0 0 ${codeBlockWidth[i]} ${codeBlockHeight[i]}`);
                                                }
                                                return `<div class="codeChunkOverlay"><div class="insert_button_parent"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 insert_button" uniqueid="${document.AI_INTEGRATION.AllCodeChunksEverAdded.length}"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"></path></svg></div><div class="codeChunkOverlay_child"><div id="CODEBLOCK_${randomId}_${instanceCount}">${svg.outerHTML}</div></div></div>`;
                                            });

                                            document.getElementById('currentlyBlabberingOnThis').innerHTML = editedStreamResult;
                                            for (let i = 0; i <= instanceCount; i++) { // each code block
                                                try {
                                                    if (document.AI_INTEGRATION.processedCodeChunks[instanceCount].status == "error") {
                                                        document.getElementById('currentlyBlabberingOnThis').id = '';
                                                        console.warn("DEBUG: skipping codeblock #" + instanceCount + " due to status failure", document.AI_INTEGRATION.processedCodeChunks[instanceCount])
                                                        return;
                                                    }
                                                    let currentWidth = 150;
                                                    for (var xx = 0; xx < document.getElementById(`CODEBLOCK_${randomId}_${i}`).children[0].children.length; xx++) { //each top level block
                                                        if (document.querySelector('.container').style.display != "") {
                                                            document.querySelector('.container').style.display = '';
                                                            document.querySelector('.container').style.zIndex = 509;
                                                        }

                                                        const currentElement = document.getElementById(`CODEBLOCK_${randomId}_${i}`).children[0].children[xx];
                                                        currentElement.style.width = (currentElement.getBoundingClientRect().width * (currentWidth / currentElement.children[1].children[0].getBoundingClientRect().width)) + "px";

                                                        //THE SMARTED/MOST INSANE CODE THAT WORKS IN THE HISTORY OF JS
                                                        const currentText = currentElement.querySelector("text");
                                                        const oldText = currentText.innerHTML;
                                                        currentText.innerHTML = "a";

                                                        var currentHeight = currentText.getBoundingClientRect().height;
                                                        //console.log(currentText);
                                                        while (currentHeight > 16 && currentWidth > 5) {
                                                            //console.log("minimizing","currentWidth", currentWidth, "currentHeight", currentHeight);
                                                            currentWidth -= 5;
                                                            currentElement.style.width = (currentElement.getBoundingClientRect().width * (currentWidth / currentElement.children[1].children[0].getBoundingClientRect().width)) + "px";
                                                            currentHeight = currentText.getBoundingClientRect().height;
                                                        }
                                                        while (Math.round(currentHeight) < 16 && currentWidth > 5) {
                                                            //console.log("maximizing","currentWidth", currentWidth, "currentHeight", currentHeight);
                                                            currentWidth += 1;
                                                            currentElement.style.width = (currentElement.getBoundingClientRect().width * (currentWidth / currentElement.children[1].children[0].getBoundingClientRect().width)) + "px";
                                                            currentHeight = currentText.getBoundingClientRect().height;
                                                        }
                                                        currentText.innerHTML = oldText;
                                                    }
                                                    const currentElement = document.getElementById(`CODEBLOCK_${randomId}_${i}`).children[0];
                                                    //currentElement.parentElement.parentElement.style = "border: 1px solid var(--ui-tertiary);padding: 5px;padding-top: 10px;margin-bottom: 5px;margin-top: 5px;border-radius: 6px;overflow: auto;";
                                                    currentElement.parentElement.parentElement.parentElement.children[0].children[0].addEventListener("click", function () {
                                                        const element = this;
                                                        function callback() {
                                                            /*if (this.getAttribute("allowRender") == "false") {
                                                              return;
                                                            }*/
                                                            var workspace = main.mainWorkspace;
                                                            var xml = Blockly.Xml.textToDom(document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].BlocksAsXML);
                                                            //add the variables and lists that don't overlap
                                                            var [listNames, variableNames, broadcastNames] = helpers.workspaceVariables(true, main.mainWorkspace);
                                                            for (var name of document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].variables) {
                                                                if (!variableNames.includes(name)) {
                                                                    main.mainWorkspace.createVariable(name, "", null);
                                                                }
                                                            }
                                                            for (var name of document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].lists) {
                                                                if (!listNames.includes(name)) {
                                                                    main.mainWorkspace.createVariable(name, "list", null);
                                                                }
                                                            }
                                                            for (var name of document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].broadcasts) {
                                                                if (!broadcastNames.includes(name)) {
                                                                    main.mainWorkspace.createVariable(name, "broadcast_msg", null);
                                                                }
                                                            }
                                                            if (replacingBlocksInternal.length > 0) {
                                                                main.mainWorkspace.getAllBlocks().forEach(block => {
                                                                    if (block.type == "procedures_definition") {
                                                                        if (replacingBlocksInternal.includes(block.id)) {
                                                                            console.log("disposing block", block);
                                                                            block.dispose();
                                                                        }
                                                                    }
                                                                });
                                                            }

                                                            var totalWidth = 0;
                                                            //Blockly.Xml.domToWorkspace(xml, workspace);
                                                            Array.from(xml.children).forEach(block => {
                                                                const newBlock = ScratchBlocks.Xml.domToBlock(block, workspace);
                                                                const x = workspace.scrollX + totalWidth || 0;
                                                                const y = workspace.scrollY || 0;
                                                                try {
                                                                    newBlock.moveBy(x, y);
                                                                } catch (e) {
                                                                    console.error("failed to move block", e);
                                                                }
                                                                totalWidth += (newBlock.getBoundingRectangle().bottomRight.x - newBlock.getBoundingRectangle().topLeft.x) + 20;
                                                            });
                                                            main.mainWorkspace.refreshToolboxSelection_();
                                                            /*const newBlock = ScratchBlocks.Xml.domToBlock(xml, workspace);
                                                            const x = workspace.scrollX || 0;
                                                            const y = workspace.scrollY || 0;
                                                            newBlock.moveBy(x, y);*/
                                                        }
                                                        var message = `<p style="font-weight: 900;margin-bottom: 10px;">Adding this code will:</p><ul>`;

                                                        var [listNames, variableNames] = helpers.workspaceVariables(false, main.mainWorkspace);
                                                        var newVariables = [];
                                                        var newLists = [];
                                                        var existingVariables = [];
                                                        var existingLists = [];
                                                        for (var name of document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].variables) {
                                                            if (!variableNames.includes(name)) {
                                                                newVariables.push(name);
                                                            } else {
                                                                existingVariables.push(name);
                                                            }
                                                        }
                                                        for (var name of document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].lists) {
                                                            if (!listNames.includes(name)) {
                                                                newLists.push(name);
                                                            } else {
                                                                existingLists.push(name);
                                                            }
                                                        }
                                                        if (newVariables.length > 0) {
                                                            message += `<li>Create ${newVariables.length} new ${newVariables.length == 1 ? "variable" : "variables"}: "${newVariables.join('", "')}"</li>`;
                                                        }
                                                        if (newLists.length > 0) {
                                                            message += `<li>Create ${newLists.length} new ${newLists.length == 1 ? "list" : "lists"}: "${newLists.join('", "')}"</li>`;
                                                        }
                                                        if (existingVariables.length > 0) {
                                                            message += `<li>Use ${existingVariables.length} existing ${existingVariables.length == 1 ? "variable" : "variables"}: "${existingVariables.join('", "')}"</li>`;
                                                        }
                                                        if (existingLists.length > 0) {
                                                            message += `<li>Use ${existingLists.length} existing ${existingLists.length == 1 ? "list" : "lists"}: "${existingLists.join('", "')}"</li>`;
                                                        }
                                                        var currentWorkspaceBlocks = helpers.getCustomBlockNames(Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(main.mainWorkspace)));
                                                        var newBlocks = helpers.getCustomBlockNames(document.AI_INTEGRATION.AllCodeChunksEverAdded[element.getAttribute("uniqueid") - 1].BlocksAsXML);
                                                        //if their are overlapping ones give a warning
                                                        var replacingBlocks = [];
                                                        var replacingBlocksInternal = [];
                                                        var trulyNewBlocks = [];

                                                        for (var block of newBlocks) {
                                                            var matchingBlock = currentWorkspaceBlocks.find(currentBlock => currentBlock.customBlockName === block.customBlockName);
                                                            if (matchingBlock) {
                                                                replacingBlocks.push("\"" + block.customBlockName.replaceAll("%s", "").replaceAll("%b", "").replaceAll("%n", "").trim() + "\"");
                                                                replacingBlocksInternal.push(matchingBlock.blockId);
                                                            } else {
                                                                trulyNewBlocks.push("\"" + block.customBlockName.replaceAll("%s", "").replaceAll("%b", "").replaceAll("%n", "").trim() + "\"");
                                                            }
                                                        }
                                                        // List truly new blocks
                                                        if (trulyNewBlocks.length > 0) {
                                                            message += `<li>Create ${trulyNewBlocks.length} new block${trulyNewBlocks.length == 1 ? "" : "s"}: ${trulyNewBlocks.join(", ")}</li>`;
                                                        }

                                                        // List blocks that are being replaced
                                                        if (replacingBlocks.length > 0) {
                                                            message += `<li>Replace ${replacingBlocks.length} existing block${replacingBlocks.length == 1 ? "" : "s"}: ${replacingBlocks.join(", ")} <span><p class="errorMessage">(THIS WILL REPLACE YOUR CURRENT BLOCK DEFINITION)</p></span></li>`;
                                                        }
                                                        if (message === `<p style="font-weight: 900;margin-bottom: 10px;">Adding this code will:</p><ul>`) {
                                                            message = `<p>This code does not create/use any variables or lists.</p>`;
                                                        } else {
                                                            message += `</ul>`;
                                                        }
                                                        const title = "Add Code to Workspace?";
                                                        ScratchBlocks.prompt(message, null, callback, title, ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE, true);
                                                    });

                                                    var errorForChunk = [];
                                                    for (var xx = 0; xx < document.AI_INTEGRATION.errorsDetected.length; xx++) {
                                                        if (document.AI_INTEGRATION.errorsDetected[xx].uniqueCommentID == currentElement.parentElement.id.replace("CODEBLOCK_", "")) {
                                                            errorForChunk.push(document.AI_INTEGRATION.errorsDetected[xx]);
                                                        }
                                                    }

                                                    if (errorForChunk.length == 0) {
                                                        currentElement.parentElement.style = "width: fit-content;height: fit-content;margin: auto;";
                                                    } else {
                                                        console.log(errorForChunk);
                                                        var div = document.createElement('div');
                                                        div.innerHTML = `<p style="text-align: center;">A non-fatal issue was detected with this code</p><div style="display: flex;margin: 10px;"></div>`;
                                                        var button = document.createElement('button');
                                                        var button2 = document.createElement('button');
                                                        button.style = "margin-left: auto;margin-right: 10px;background-color: transparent;border: 1px solid var(--ui-tertiary);padding: 5px 10px;border-radius: 5px;";
                                                        button.innerText = "Render Anyways";
                                                        button.addEventListener("click", function (e) {
                                                            button.disabled = true;
                                                            button2.disabled = true;
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            currentElement.parentElement.style = "width: fit-content;height: fit-content;margin: auto;";
                                                            //currentElement.parentElement.parentElement.setAttribute("allowRender", "true");
                                                            currentElement.parentElement.parentElement.parentElement.children[0].style.display = "";
                                                            div.remove();
                                                        });
                                                        div.children[1].appendChild(button);
                                                        button2.style = "margin-right: auto;background-color: transparent;border: 1px solid var(--ui-tertiary);padding: 5px 10px;border-radius: 5px;";
                                                        button2.innerText = "Attempt to Repair";
                                                        button2.addEventListener("click", function (e) {
                                                            button.disabled = true;
                                                            button2.disabled = true;
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            //create new message
                                                            var userMessage = document.createElement('div');
                                                            userMessage.className = 'user-message';
                                                            userMessage.innerHTML = `
                              <div class="message">
                                <span>Attempting to repair code block</span>
                                  <span>
                                      <div class="FileAttachment">
                                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg">
                                              <path d="M2 7V14.7519H4.53246L5.9122 16.0909H8.12402L9.50376 14.7519H22V7H9.50376L8.12402 8.33905H5.9122L4.53246 7H2Z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" stroke="currentcolor"></path>
                                          </svg>
                                          <p class="p">Error Logs</p>
                                      </div>
                                  </span>
                              </div>    
                          `;
                                                            document.getElementById('chat_content').appendChild(userMessage);
                                                            requestChat("the following errors occured while trying to parse the code (attempt to fix them):" + errorForChunk.map(error => error.error || "Unknown error").join("\n"));
                                                        });
                                                        div.children[1].appendChild(button2);
                                                        currentElement.parentElement.style = "width: 0px; height: 0px; display: none;";
                                                        currentElement.parentElement.parentElement.appendChild(div);
                                                        currentElement.parentElement.parentElement.parentElement.children[0].style.display = "none";
                                                        //currentElement.parentElement.parentElement.parentElement.children[0].children[0].setAttribute("allowRender", "false");
                                                    }
                                                } catch (e) {
                                                    console.log(e);
                                                }
                                            }
                                            document.getElementById('currentlyBlabberingOnThis').className = 'message';
                                            document.getElementById('currentlyBlabberingOnThis').id = '';
                                        }
                                        processAndRenderCodeChunks();
                                        //edittedStreamResult = edittedStreamResult.replace(/CODEBLOCK{(.*?)}/gs, (match, p1) => `<div>CHANGE THIS IN FUTURE</div>`);
                                        return;

                                    }
                                    document.getElementById('currentlyBlabberingOnThis').className = 'message';
                                    // Decode the chunk and append to the stream result
                                    streamResult += decoder.decode(value, { stream: true });

                                    const animatedTextClass = main.Gaddon.tab.redux.state.scratchGui.theme.theme.gui == "light" ? "animated-text-light" : "animated-text";
                                    function updateMessageContents() {
                                        chunkNumber = 1;
                                        var edittedStreamResult = streamResult.replace(/```(.*?)```/gs, () => `<div class="codeChunkOverlay"><p>Currently Processing Code Block</p></div>`);
                                        edittedStreamResult = edittedStreamResult.replace(/```[\s\S]*$/, "<div><p class=\"" + animatedTextClass + "\">currently writing a code block</p><p id=\"chunkNumber\">(Recieved " + chunkNumber + " chunk)</p></div>");
                                        edittedStreamResult = converter.makeHtml(edittedStreamResult);
                                        document.getElementById('currentlyBlabberingOnThis').innerHTML = edittedStreamResult;
                                        document.getElementById('chat_content').scrollTop = document.getElementById('chat_content').scrollHeight;
                                        reader.read().then(processText);
                                    }
                                    if ((streamResult.match(/```/g) || []).length % 2 == 1) { //fixed animation resetting bug
                                        if (document.getElementById('currentlyBlabberingOnThis').innerHTML.includes("<p class=\"" + animatedTextClass + "\">currently writing a code block</p>")) {
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
                                    helpers.messageErrorOccured(messageContents);
                                });
                        } else {
                            console.error('Error:', response.statusText);
                            helpers.messageErrorOccured(messageContents);
                        }
                    })
                    .catch(error => {
                        console.error('Request failed', error);
                        helpers.messageErrorOccured(messageContents);
                    });
            }
            requestChat(messageContents);
        }
    }
}