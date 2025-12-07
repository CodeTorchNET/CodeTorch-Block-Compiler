import TorchyBridge from "./torchyBridge.js";
import blockDefinitions from "./blockDefinitions.js";
import GetSVG from "./parser.js";

const bridge = new TorchyBridge(blockDefinitions);
const blockParser = new GetSVG();
const xmlParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

export function registerExtensionBlocks(defs) {
    bridge.registerDefinitions(defs);
}

export async function handleRawCodeChunk(codeChunk, uniqueCommentID, mainWorkspace) {
    let response = {
        "variables": [],
        "lists": [],
        "broadcasts": [],
        "rawXML": "", // Kept for compatibility, though it's technically raw text now
        "rawCode": codeChunk,
        "BlocksAsXML": "",
        "blocksAsSVG": "",
        "status": "success",
        "overlappingVars": [],
        "overlappingLists": [],
        "uniqueCommentID": uniqueCommentID,
    }

    try {
        // Clean up the markdown
        let rawText = codeChunk.replace("```", "").replace("```", "").trim();

        // Strip single-line comments (e.g., // this is a comment)
        rawText = rawText.replace(/\/\/.*$/gm, '');
        // Strip multi-line comments (e.g., /* this is a comment */)
        rawText = rawText.replace(/\/\*[\s\S]*?\*\//g, '');

        // Use TorchyBridge to convert text -> XML
        // This generates valid Scratch XML based on the definitions
        let xmlString = bridge.fromText(rawText);

        console.log("debugging output:",rawText,xmlString);
        // Parse to DOM to extract variables/lists and check for parsing issues
        let xmlDoc = xmlParser.parseFromString(xmlString, "text/xml");

        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
            console.error("[Torchy] Generated XML parse error");
            response.status = "error";
            return response;
        }

        // Implicitly extract variables, lists, and broadcasts
        // TorchyBridge adds the 'variabletype' attribute to fields defined with it in blockDefinitions
        const fields = xmlDoc.getElementsByTagName("field");
        const uniqueVars = new Set();
        const uniqueLists = new Set();
        const uniqueBroadcasts = new Set();

        for (let field of fields) {
            if (field.hasAttribute("variabletype")) {
                const type = field.getAttribute("variabletype");
                const name = field.textContent;
                
                if (type === "list") {
                    uniqueLists.add(name);
                } else if (type === "broadcast_msg") {
                    uniqueBroadcasts.add(name);
                } else {
                    // Standard variables usually have type=""
                    uniqueVars.add(name);
                }
            }
        }

        response.variables = Array.from(uniqueVars);
        response.lists = Array.from(uniqueLists);
        response.broadcasts = Array.from(uniqueBroadcasts);

        // Check for overlaps with main workspace
        for (var x of response.variables) {
            if (mainWorkspace.getVariable(x) != null) response.overlappingVars.push(x);
        }
        for (var x of response.lists) {
            if (mainWorkspace.getVariable(x, "list") != null) response.overlappingLists.push(x);
        }

        // Finalize XML string for usage
        response.BlocksAsXML = xmlSerializer.serializeToString(xmlDoc);
        
        // Generate SVG for display
        response.blocksAsSVG = await blockParser.getSVG(response.BlocksAsXML, uniqueCommentID);

    } catch (e) {
        console.error("[Torchy] Error handling code chunk:", e);
        response.status = "error";
    }

    return response;
}
