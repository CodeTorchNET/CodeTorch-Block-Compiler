const toolboxOverrides = require('../assets/toolboxOverrides.json');
const defaultToolbox = require('../assets/defaultToolbox.json');

export default class helpers {
    constructor() {
    }
    static FireAnimation = "<style>@keyframes scaleUpDown{0%,100%{transform:scaleY(1) scaleX(1)}50%,90%{transform:scaleY(1.1)}75%{transform:scaleY(.95)}80%{transform:scaleX(.95)}}@keyframes shake{0%,100%{transform:skewX(0) scale(1)}50%{transform:skewX(5deg) scale(.9)}}@keyframes particleUp{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0;top:-100%;transform:scale(.5)}}@keyframes glow{0%,100%{background-color:#ef5a00}50%{background-color:#ff7800}}.fire{width:60px;height:60px;background-color:transparent;margin-left:8px;margin-top:17px;position:relative;display:block;}.fire-center{position:absolute;height:100%;width:100%;animation:scaleUpDown 3s ease-out;animation-iteration-count:infinite;animation-fill-mode:both}.fire-center .main-fire{position:absolute;width:100%;height:100%;background-image:radial-gradient(farthest-corner at 10px 0,#d43300 0,#ef5a00 95%);transform:scaleX(.8) rotate(45deg);border-radius:0 40% 60% 40%;filter:drop-shadow(0 0 10px #d43322)}.fire-center .particle-fire{position:absolute;top:60%;left:45%;width:2px;height:2px;background-color:#ef5a00;border-radius:50%;filter:drop-shadow(0 0 10px #d43322);animation:particleUp 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-right{height:100%;width:100%;position:absolute;animation:shake 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-right .main-fire{position:absolute;top:15%;right:-25%;width:80%;height:80%;background-color:#ef5a00;transform:scaleX(.8) rotate(45deg);border-radius:0 40% 60% 40%;filter:drop-shadow(0 0 10px #d43322)}.fire-right .particle-fire{position:absolute;top:45%;left:50%;width:3.0303030303030303px;height:3.0303030303030303px;background-color:#ef5a00;transform:scaleX(.8) rotate(45deg);border-radius:50%;filter:drop-shadow(0 0 10px #d43322);animation:particleUp 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-left{position:absolute;height:100%;width:100%;animation:shake 3s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}.fire-left .main-fire{position:absolute;top:15%;left:-20%;width:80%;height:80%;background-color:#ef5a00;transform:scaleX(.8) rotate(45deg);border-radius:0 40% 60% 40%;filter:drop-shadow(0 0 10px #d43322)}.fire-left .particle-fire{position:absolute;top:10%;left:20%;width:10%;height:10%;background-color:#ef5a00;border-radius:50%;filter:drop-shadow(0 0 10px #d43322);animation:particleUp 3s infinite ease-out 0;animation-fill-mode:both}.fire-bottom .main-fire{position:absolute;top:30%;left:20%;width:75%;height:75%;background-color:#ff7800;transform:scaleX(.8) rotate(45deg);border-radius:0 40% 100% 40%;filter:blur(10px);animation:glow 2s ease-out 0;animation-iteration-count:infinite;animation-fill-mode:both}</style><div class=fire><div class=fire-left><div class=main-fire></div><div class=particle-fire></div></div><div class=fire-center><div class=main-fire></div><div class=particle-fire></div></div><div class=fire-right><div class=main-fire></div><div class=particle-fire></div></div><div class=fire-bottom><div class=main-fire></div></div></div>";
    static closePopup() {
        if (document.querySelector('.container') == null) return;
        document.querySelector('.container').style.display = 'none';
        document.querySelector('.container').style.zIndex = -999999;
        document.AI_INTEGRATION.popupOpen = false;
    }
    static currentSpriteName() {
        return vm.runtime.getEditingTarget().sprite.name;
    }
    static workspaceVariables(includeBroadcast = false, workspace) {
        var allVariables = workspace.getAllVariables(); // Get all variables
        var lists = allVariables.filter(variable => variable.type === "list");
        var listNames = lists.map(list => list.name);
        var variables = allVariables.filter(variable => variable.type === "");
        var variableNames = variables.map(variable => variable.name);
        if (includeBroadcast) {
            var broadcastNames = workspace.getAllVariables().filter(variable => variable.type === "broadcast_msg").map(variable => variable.name);
            return [listNames, variableNames, broadcastNames];
        }
        return [listNames, variableNames];
    }
    static getCustomBlockNames(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        const result = [];

        // Find all blocks of type 'procedures_definition'
        const blocks = xmlDoc.getElementsByTagName("block");

        for (let block of blocks) {
            if (block.getAttribute("type") === "procedures_definition") {
                const blockId = block.getAttribute("id");

                // Find all mutations related to this block
                const mutations = block.getElementsByTagName("mutation");

                for (let mutation of mutations) {
                    if (mutation.hasAttribute("proccode")) {
                        result.push({
                            blockId: blockId,
                            customBlockName: mutation.getAttribute("proccode")
                        });
                    }
                }
            }
        }

        return result;
    }
    static updateAIModels(geminiKey, openrouterKey) {
        if (document.getElementById('AI_Selector_select') == null) return;
        for (var i of document.AI_INTEGRATION.AIModels) {
            const canUse = !(i.API_KEY_TYPE == "gemini" && geminiKey == "" || i.API_KEY_TYPE == "openrouter" && openrouterKey == "");

            var option = document.createElement('option');
            option.value = i.id;
            option.text = i.display_name + (canUse ? "" : " (API Key Required)");
            if (i.default && canUse) {
                option.selected = true;
            }
            if (!canUse) {
                option.disabled = true;
            }
            document.getElementById('AI_Selector_select').appendChild(option);

        }
        document.getElementById('infoAboutAIModels').addEventListener('click', () => {
            ScratchBlocks.prompt(`<p>Each AI model has its own advantages and disadvantages</p><ul><li><strong>Gemini 2.0 Pro</strong> (requires Gemini API key): Excellent at explaining code but frequently makes mistakes when writing it.</li><li><strong>Gemini 2.0 Flash (recommended)</strong> (requires Gemini API key): The most tested model for writing code, offering reliable performance.</li><li><strong>Deepseek R1</strong> (requires OpenRouter API key): Poor at writing code but excels at explaining and analyzing issues. However, it has a very slow response time.</li><li><strong>Deepseek V3</strong> (requires OpenRouter API key): sometimes the best model for writing code (either really good or terrible, basically your luck), but limited to 200 messages per day.</li></ul><br><p>if you don't know what you are doing you should probably stick to the Gemini models (preferably 2.0 flash) as they are way faster and are more tested</p>`, null, function () { }, "AI Models", ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE, true);
            setTimeout(() => {
                document.querySelector(".ReactModal__Content--after-open").style.width = "700px";
            }, 100);
        });
    }
    static fetchWithTimeout(url, options = {}, timeout = 5000) {
        const controller = new AbortController();
        const signal = controller.signal;
        const fetchPromise = fetch(url, { ...options, signal });

        // Set timeout to abort fetch
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        return fetchPromise
            .finally(() => clearTimeout(timeoutId));
    }
    static disableCodeChunkAttachment() {
        document.getElementById('Context_Selector_select').value = '0';
        document.getElementById('Context_Selector_select').style.width = "26px";
        document.getElementById('Context_Selector_select').children[0].disabled = true;
        document.getElementById('Context_Selector_select').children.innerText = "Code Chunk";
    }
    static messageErrorOccured(messageContents) {
        document.AI_INTEGRATION.chatHistory.push({ "role": "user", "message": messageContents });
        //document.AI_INTEGRATION.chatHistory.push({ "role": "assistant", "message": "Error reading response" }); //not sure if the AI needs to know that it failed

        helpers.disableCodeChunkAttachment();

        document.AI_INTEGRATION.AI_currently_blabbering = false;
        if (document.getElementById('currentlyBlabberingOnThis') != null) {
            document.getElementById('currentlyBlabberingOnThis').innerHTML = "<h1 class=\"errorMessage\">Error reading response</h1>";
            document.getElementById('currentlyBlabberingOnThis').className = 'message';
        } else {
            document.getElementById('AI_is_thinking_what_to_blabber').remove();
            if (document.getElementById("currentlyBlabberingOnThis") != null) { //fixes a glitch
                document.getElementById("currentlyBlabberingOnThis").remove();
            }
            var aiMessage = document.createElement('div');
            aiMessage.className = 'ai-message';
            aiMessage.innerHTML = `<p class="message" id="currentlyBlabberingOnThis" class=\"errorMessage\">Error reading response</p>`;
            document.getElementById('chat_content').appendChild(aiMessage);
        }
    }

    static isFirstRequest = true;
    static readWithTimeout(reader) {
        const FIRST_TIMEOUT_MS = 60000;
        const DEFAULT_TIMEOUT_MS = 5000;
        const timeout = this.isFirstRequest ? FIRST_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
        this.isFirstRequest = false;

        return Promise.race([
            reader.read(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Read operation timed out")), timeout)
            ),
        ]);
    }
    static returnEntireProjectAsXML(addon) {
        //create new XML document
        const xmlDoc = document.implementation.createDocument("", "", null);

        // Create a root element
        const rootElement = xmlDoc.createElement("project");
        xmlDoc.appendChild(rootElement);

        for (var x of addon.tab.redux.state.scratchGui.vm.runtime.targets) {
            // Create a child element with text content
            const childElement = xmlDoc.createElement("sprite");
            //add sprite name as attribute
            childElement.setAttribute("name", x.getName());
            childElement.innerHTML = x.blocks.toXML();
            rootElement.appendChild(childElement);
        }
        // Serialize XML to string
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(xmlDoc);

        return xmlString;
    }
    static APIKeyRequiredModal() {
        const div = document.createElement('div');
        div.className = 'container';
        div.id = 'torchyPopup';
        div.style.zIndex = 509;
        div.style.position = 'absolute';
        const divWidth = 452;
        const divHeight = 302;
        const viewportWidth = window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const tolerance = 10;
        let newLeft = document.AI_INTEGRATION.X_COORDINATE;
        let newTop = document.AI_INTEGRATION.Y_COORDINATE;
        if (newLeft < tolerance) newLeft = tolerance;
        if (newTop < scrollY + tolerance) newTop = scrollY + tolerance;
        if (newLeft + divWidth > viewportWidth - tolerance) newLeft = viewportWidth - divWidth - tolerance;
        if (newTop + divHeight > scrollY + viewportHeight - tolerance) newTop = scrollY + viewportHeight - divHeight - tolerance;
        div.style.left = `${newLeft}px`;
        div.style.top = `${newTop}px`;
        div.innerHTML = `<div class="content no_api_key" id="chat_content">
          <div class="a"><svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="size-6" stroke="currentColor" stroke-width="1.5" id="closePopup">
                    <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
      </div><div class="b">
              <div class="c">
                 ${this.FireAnimation}
              </div>
              <p class="d">To use Torchy, please add your API key in the addons page</p></div>
      </div>`;
        document.body.appendChild(div);
        document.getElementById('closePopup').addEventListener('click', () => {
            document.getElementById('torchyPopup').remove();
            document.AI_INTEGRATION.popupOpen = false;
        });
    }
    static returnSterilizedToolbox(Gaddon, allowExtensions = false) {
        if (Gaddon == null) return;
        if (!allowExtensions) {
            return defaultToolbox.default;
        }
        function extractBlockReturnType(block) {
            if (!block) return null;
            var returnType = "Stack";
            if (block.outputConnection) {
                if (block.outputConnection.check_ && block.outputConnection.check_.includes("Boolean")) {
                    returnType = "Reporter";
                } else {
                    returnType = "Boolean";
                }
            } else if (!block.previousConnection && block.nextConnection) {
                returnType = "Hat";
            }
            return returnType;
        }
        var workspace = new Blockly.Workspace();

        var toolbox = Gaddon.tab.redux.state.scratchGui.toolbox.toolboxXML;
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(toolbox, "text/xml");
        var sterializedToolbox = document.implementation.createDocument("", "", null);
        var rootElement = sterializedToolbox.createElement("toolbox");
        sterializedToolbox.appendChild(rootElement);
        var blocks = xmlDoc.getElementsByTagName("block");
        for (var block of blocks) {
            if (!block.getAttribute("type").includes("procedures_")) { // firefox's toolbox includes procedures problem is that procedures cannot be parsed by Blockly
                var blockElement = block.cloneNode(true);
                var newBlock = Blockly.Xml.domToBlock(blockElement, workspace)
                var returnType = extractBlockReturnType(newBlock);
                var blockCopy = block.cloneNode(true);

                if (toolboxOverrides.overrides[blockCopy.getAttribute("type")] !== undefined) {
                    var parser = new DOMParser();
                    var xmlDoc = parser.parseFromString(toolboxOverrides.overrides[blockCopy.getAttribute("type")], "text/xml");
                    var overrideBlockElement = xmlDoc.getElementsByTagName("block")[0];
                    overrideBlockElement.setAttribute("blockType", returnType);
                    rootElement.appendChild(overrideBlockElement);
                } else {
                    blockCopy.removeAttribute("id");
                    blockCopy.setAttribute("blockType", returnType);
                    rootElement.appendChild(blockCopy);
                }
            }
        }
        for (var x of Object.keys(toolboxOverrides.insert)) {
            if (toolboxOverrides.insert[x] !== undefined) {
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(toolboxOverrides.insert[x], "text/xml");
                var overrideBlockElement = xmlDoc.getElementsByTagName("block")[0];
                rootElement.appendChild(overrideBlockElement);
            } else {
                console.error("A REALlY WEIRD ERROR OCCURED");
            }
        }
        workspace.dispose();
        var serializer = new XMLSerializer();
        var xmlString = serializer.serializeToString(sterializedToolbox);
        console.log("[DEBUG] toolbox has", sterializedToolbox.getElementsByTagName("block").length, "blocks");

        return xmlString.replace(/>\s+</g, '><').trim();
    }
}