export default class Attachment {
    static _blockly = null;

    constructor() {
        this._attachment = null;
        this._attachmentIds = [];
        this._name = null;
        this._blockIdMap = new Map(); // For faster lookups
    }

    static set blockly(blockly) {
        if (typeof blockly !== "object" || blockly === null) {
            throw new Error("blockly must be a valid object");
        }
        Attachment._blockly = blockly;
    }
    static getAttachmentReady(attachment) {
        if (attachment && attachment.nodeType === Node.ELEMENT_NODE) {
            attachment = Attachment._blockly.Xml.domToText(attachment);
        }    
        // Remove unnecessary attributes and whitespace
        return attachment
        .replace(/x="[^"]+"|y="[^"]+"|id="[^"]+"/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(" >", ">");
    }

    attachment(attachment, spriteName = "Sprite1") {
        if (Attachment._blockly === null) {
            throw new Error("blockly instance is not set. Please set it using Attachment.blockly");
        }
        if (!attachment || attachment.nodeType !== Node.ELEMENT_NODE) {
            throw new Error("Invalid attachment. It must be an XML document element.");
        }

        this._attachment = attachment;
        const blocks = attachment.getElementsByTagName("block");

        const blockIds = [];
        if(attachment.getAttribute("id")) {
            blockIds.push(attachment.getAttribute("id"));
        }
        for (let block of blocks) {
            const id = block.getAttribute("id");
            if (id) {
                blockIds.push(id);
            }
        }
        if (blockIds.length === 0) {
            throw new Error("No blocks found in the attachment.");
        }
        this._attachmentIds = blockIds;
        this._name = `${spriteName} - Code Chunk (${blockIds.length} Blocks)`;
    }

    get spriteName() {
        if (!this._name) {
            throw new Error("Attachment is not set. Use the attachment() method first.");
        }
        return this._name;
    }

    _buildBlockIdMap(workspace) {
        this._blockIdMap.clear();
        const blocks = workspace.getElementsByTagName("block");
        for (let block of blocks) {
            const id = block.getAttribute("id");
            if (id) {
                this._blockIdMap.set(id, block);
            }
        }
    }

    GetAttachment(currentWorkspace) {
        if (this._attachmentIds.length === 0) {
            throw new Error("Attachment is not set. Use the attachment() method first.");
        }
        if (!currentWorkspace || currentWorkspace.nodeType !== Node.ELEMENT_NODE) {
            throw new Error("Invalid workspace. It must be an XML document element.");
        }

        this._buildBlockIdMap(currentWorkspace);

        // Check head block first
        const headBlock = this._blockIdMap.get(this._attachmentIds[0]);
        if (headBlock) {
            //console.log(`DUBUG: Found head block with ID: ${this._attachmentIds[0]}`);
            return headBlock;
        }

        //console.log("DUBUG: Attachment head block not found in the current workspace.");
        // Search other blocks if head block is missing
        for (const id of this._attachmentIds) {
            const block = this._blockIdMap.get(id);
            if (block) {
                //console.log(`DUBUG: Found block with ID: ${id}`);
                let parent = block;
                while (parent.parentNode && parent.parentNode.nodeName.toLowerCase() != "xml"){
                    parent = parent.parentNode;
                }
                //console.log(`DUBUG: Found parent block`, parent);
                return parent;
            }
        }

        console.warn("Attachment not found in the current workspace.");
        return null;
    }
} 
