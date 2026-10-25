import TorchyBridge from './torchyBridge.js';
import blockDefinitions from './blockDefinitions.js';
import GetSVG from './parser.js';

const bridge = new TorchyBridge(blockDefinitions);
const blockParser = new GetSVG();
const xmlParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

const TORCHY_LANGUAGES = ['', 'scratch', 'torchy', 'blocks', 'scratchblocks', 'sb'];

export function registerExtensionBlocks (defs) {
    bridge.registerDefinitions(defs);
}

function parseFence (codeChunk) {
    const source = typeof codeChunk === 'string' ? codeChunk : '';
    let language = '';
    let body = source;

    const opening = body.match(/^[ \t]*```([\w-]*)([^\n]*)(?:\r?\n|$)/);
    if (opening) {
        const tag = opening[1] || '';
        const rest = opening[2] || '';
        if (rest.trim() === '') {
            language = tag;
            body = body.slice(opening[0].length);
        } else if (tag !== '' && TORCHY_LANGUAGES.indexOf(tag.toLowerCase()) !== -1) {
            language = tag;
            body = `${rest.trim()}\n${body.slice(opening[0].length)}`;
        } else {
            body = body.replace(/^[ \t]*```/, '');
        }
    }

    body = body.replace(/\r?\n?[ \t]*```[\s\S]*$/, '');

    const isTorchyCode = TORCHY_LANGUAGES.indexOf(language.toLowerCase()) !== -1;
    return {language, isTorchyCode, body};
}

function stripComments (text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/[^\n]*/gm, '$1');
}

function collectWorkspaceProcedures (mainWorkspace) {
    const procs = [];
    if (!mainWorkspace || typeof mainWorkspace.getAllBlocks !== 'function') return procs;
    try {
        for (const block of mainWorkspace.getAllBlocks()) {
            if (block.type !== 'procedures_prototype' || typeof block.procCode_ !== 'string') continue;
            procs.push({
                proccode: block.procCode_,
                argumentids: block.argumentIds_ || [],
                argumentnames: block.displayNames_ || []
            });
        }
    } catch (e) {
        console.error("[Torchy] could not read the workspace's custom blocks", e);
    }
    return procs;
}

export async function handleRawCodeChunk (codeChunk, uniqueCommentID, mainWorkspace) {
    const {language, isTorchyCode, body} = parseFence(codeChunk);

    const response = {
        variables: [],
        lists: [],
        broadcasts: [],
        rawCode: codeChunk,
        language: language,
        isTorchyCode: isTorchyCode,
        BlocksAsXML: '',
        blocksAsSVG: '',
        status: isTorchyCode ? 'success' : 'skipped',
        warnings: [],
        overlappingVars: [],
        overlappingLists: [],
        uniqueCommentID: uniqueCommentID
    };

    if (!isTorchyCode) return response;

    try {
        const rawText = stripComments(body).trim();

        // Use TorchyBridge to convert text -> XML
        // This generates valid Scratch XML based on the definitions
        bridge.setKnownProcedures(collectWorkspaceProcedures(mainWorkspace));
        const xmlString = bridge.fromText(rawText);
        response.warnings = (bridge.lastWarnings || []).slice();

        // Parse to DOM to extract variables/lists and check for parsing issues
        const xmlDoc = xmlParser.parseFromString(xmlString, 'text/xml');

        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            console.error('[Torchy] Generated XML parse error');
            response.status = 'error';
            return response;
        }

        // Implicitly extract variables, lists, and broadcasts
        // TorchyBridge adds the 'variabletype' attribute to fields defined with it in blockDefinitions
        const fields = xmlDoc.getElementsByTagName('field');
        const uniqueVars = new Set();
        const uniqueLists = new Set();
        const uniqueBroadcasts = new Set();

        for (const field of fields) {
            if (field.hasAttribute('variabletype')) {
                const type = field.getAttribute('variabletype');
                const name = field.textContent;

                if (type === 'list') {
                    uniqueLists.add(name);
                } else if (type === 'broadcast_msg') {
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
        if (mainWorkspace && typeof mainWorkspace.getVariable === 'function') {
            for (const x of response.variables) {
                if (mainWorkspace.getVariable(x) != null) response.overlappingVars.push(x);
            }
            for (const y of response.lists) {
                if (mainWorkspace.getVariable(y, 'list') != null) response.overlappingLists.push(y);
            }
        }

        // Finalize XML string for usage
        response.BlocksAsXML = xmlSerializer.serializeToString(xmlDoc);

        // Generate SVG for display
        response.blocksAsSVG = (await blockParser.getSVG(response.BlocksAsXML, uniqueCommentID)) || '';

    } catch (e) {
        console.error('[Torchy] Error handling code chunk:', e);
        response.status = 'error';
    }

    return response;
}
