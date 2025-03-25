import * as htmlparser2 from "htmlparser2";
import domSerializer from "dom-serializer";
import GetSVG from "./parser.js";

const xmlSerializer = new XMLSerializer();
const xmlParser = new DOMParser();
const blockParser = new GetSVG();

export async function handleRawCodeChunk(codeChunk, uniqueCommentID,mainWorkspace) {
    let response = {
        "variables": [],
        "lists": [],
        "broadcasts": [],
        "rawXML": codeChunk,
        "BlocksAsXML": "",
        "blocksAsSVG": "",
        "status": "success",
        "overlappingVars": [],
        "overlappingLists": [],
        "uniqueCommentID": uniqueCommentID,
    }
    try {
        codeChunk = "<xml>" + codeChunk.replace("```xml", "").replaceAll("```", "") + "</xml>";
        let xmlCode = xmlParser.parseFromString(codeChunk, "text/xml");
        //check if it successfully parsed
        if (xmlCode.getElementsByTagName("parsererror").length > 0) {
            console.log("[DEBUG] received malformed code chunk, attempting to repair it");
            //response.status = "error";
            //return response;
            const handler = new htmlparser2.DomHandler((error, dom) => {
                if (error) {
                    console.error("[DEBUG] Attempted to repair the code chunk, but failed to parse it", error);
                    response.status = "failedToParse";
                } else {
                    // Serialize using dom-serializer
                    let fixedXML = domSerializer(dom); // Use the default export here
                    codeChunk = fixedXML.replace(/variabletype="removeAfter"/g, 'variabletype=""');
                    xmlCode = xmlParser.parseFromString(codeChunk, "text/xml");
                    console.log("[DEBUG] Successfully repaired the code chunk", codeChunk);
                }
            });
            const parser = new htmlparser2.Parser(handler, { xmlMode: true });
            let modifiedCodeChunk = codeChunk.replace(/variabletype=""/g, 'variabletype="removeAfter"');
            parser.write(modifiedCodeChunk);
            parser.end();
        } else {
            console.log("[DEBUG] received well formed code chunk");
        }
        if (response.status == "failedToParse") { response.status = "error"; return response };
        while (xmlCode.getElementsByTagName("variableCreationRequest").length > 0) {
            if (xmlCode.getElementsByTagName("variableCreationRequest")[0].getAttribute("type") == "broadcast_msg") {
                response.broadcasts.push(xmlCode.getElementsByTagName("variableCreationRequest")[0].textContent);
            } else {
                response.variables.push(xmlCode.getElementsByTagName("variableCreationRequest")[0].textContent);
            }
            //delete the variable creation request
            xmlCode.getElementsByTagName("variableCreationRequest")[0].remove();
        }
        while (xmlCode.getElementsByTagName("listCreationRequest").length > 0) {
            response.lists.push(xmlCode.getElementsByTagName("listCreationRequest")[0].textContent);
            //delete the list creation request
            xmlCode.getElementsByTagName("listCreationRequest")[0].remove();
        }
        for (var x of response.variables) if (mainWorkspace.getVariable(x) != null) response.overlappingVars.push(x)
        for (var x of response.lists) if (mainWorkspace.getVariable(x, "list") != null) response.overlappingLists.push(x)

        response.BlocksAsXML = xmlSerializer.serializeToString(xmlCode);
        response.blocksAsSVG = await blockParser.getSVG(response.BlocksAsXML, uniqueCommentID);
    } catch (e) {
        console.error(e);
        response.status = "error";
    }
    /* No longer needed as I now make a workspace for each parse
    //due to the way that the code is parsed, the variables and lists are added to the workspace and we need to remove them (if they don't overlap)
    response.variables.forEach(variable => {
      if (!response.overlappingVars.includes(variable)) {
        if (mainWorkspace.getVariable(variable) != null) mainWorkspace.deleteVariableById(mainWorkspace.getVariable(variable).getId())
      }
    });
    response.lists.forEach(list => {
      if (!response.overlappingLists.includes(list)) {
        if (mainWorkspace.getVariable(list, "list") != null) mainWorkspace.deleteVariableById(mainWorkspace.getVariable(list, "list").getId())
      }
    });
    */
    return response;
}