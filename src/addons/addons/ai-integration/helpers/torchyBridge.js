export default class TorchyBridge {
  constructor(blockDefinitions) {
    this.defMap = {};
    this.defs = blockDefinitions;

    this.definedProcs = {};

    this.parser = new DOMParser();
    this.serializer = new XMLSerializer();

    this.processDefinitions(this.defs);
  }

  processDefinitions(definitions) {
    definitions.forEach((def) => {
      this.defMap[def.id.toUpperCase()] = def;

      const parts = def.spec.split(/%(\d+)/);
      def.tokens = [];
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i] !== "") def.tokens.push(parts[i]);
        } else {
          const argIdx = parseInt(parts[i], 10) - 1;
          def.tokens.push({ argIndex: argIdx });
        }
      }
    });
  }

  registerDefinitions(newDefinitions) {
    // Filter out duplicates to prevent issues
    const uniqueNewDefs = newDefinitions.filter(newDef =>
      !this.defs.some(existing => existing.id === newDef.id)
    );

    this.defs = [...this.defs, ...uniqueNewDefs];
    this.processDefinitions(uniqueNewDefs);
  }
  _getChild(parent, tagName) {
    if (!parent || !parent.children) return null;
    for (let i = 0; i < parent.children.length; i++) {
      if (parent.children[i].tagName === tagName) {
        return parent.children[i];
      }
    }
    return null;
  }

  _getSubstackBlock(parent, statementName) {
    if (!parent || !parent.children) return null;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (
        (child.tagName === "statement" || child.tagName === "value") &&
        child.getAttribute("name") === statementName
      ) {
        return this._getChild(child, "block");
      }
    }
    return null;
  }

  toText(xmlString) {
    const doc = this.parser.parseFromString(xmlString, "text/xml");
    const topLevelBlocks = doc.querySelectorAll("xml > block");
    if (topLevelBlocks.length === 0) return "No blocks found.";

    const stacks = Array.from(topLevelBlocks).map((block) =>
      this.processBlockChain(block)
    );
    return stacks.join("\n\n");
  }

  processBlockChain(blockNode) {
    let output = [];
    let currentBlock = blockNode;
    while (currentBlock) {
      output.push(this.renderBlock(currentBlock));

      const nextTag = this._getChild(currentBlock, "next");
      currentBlock = nextTag ? this._getChild(nextTag, "block") : null;
    }
    return output.join("\n");
  }

  renderBlock(blockNode) {
    const type = blockNode.getAttribute("type").toUpperCase();

    if (type === "PROCEDURES_DEFINITION") {
      let customBlockStmt = this._getChild(blockNode, "statement");
      if (!customBlockStmt) {
          customBlockStmt = this._getChild(blockNode, "value");
      }
      
      if (!customBlockStmt) return "define [Invalid]";

      const shadow = customBlockStmt.querySelector(
        'shadow[type="procedures_prototype"]'
      );
      if (!shadow) return "define [Invalid]";
      const mutation = shadow.querySelector("mutation");

      const proccode = mutation.getAttribute("proccode");
      const argNames = JSON.parse(
        mutation.getAttribute("argumentnames") || "[]"
      );
      const warp = mutation.getAttribute("warp") === "true";

      let defLine = `define "${proccode}"`;

      let formattedArgs = "";
      let tokenRegex = /%([sb])/g;
      let match;
      let argIdx = 0;
      while (
        (match = tokenRegex.exec(proccode)) !== null &&
        argIdx < argNames.length
      ) {
        if (match[1] === "s") formattedArgs += ` (${argNames[argIdx]})`;
        if (match[1] === "b") formattedArgs += ` <${argNames[argIdx]}>`;
        argIdx++;
      }

      let result = `${defLine}${formattedArgs}`;
      if (warp) result += " warp";

      result += " {";
      const nextTag = this._getChild(blockNode, "next");
      if (nextTag) {
        const bodyBlock = this._getChild(nextTag, "block");
        if (bodyBlock) {
          const bodyText = this.processBlockChain(bodyBlock);
          result += "\n" + this.indent(bodyText);
        }
        blockNode.removeChild(nextTag);
      }

      result += "\n}";

      return result;
    }

    if (type === "PROCEDURES_CALL") {
      const mutation = blockNode.querySelector("mutation");
      const proccode = mutation.getAttribute("proccode");
      const argIds = JSON.parse(mutation.getAttribute("argumentids") || "[]");

      const argTypes = [];
      proccode.replace(/%([sb])/g, (m, type) => {
        argTypes.push(type);
      });

      let text = `call "${proccode}"`;

      argIds.forEach((id, index) => {
        const valNode = Array.from(blockNode.children).find(
          (n) => n.getAttribute("name") === id
        );
        const argType = argTypes[index] || "s";

        if (valNode) {
          let val = this.extractValue(valNode);

          if (val.startsWith("<") && val.endsWith(">")) {
            text += ` ${val}`;
          } else {
            const isWrapped = val.startsWith("(") || val.startsWith("[");
            if (isWrapped) text += ` ${val}`;
            else text += ` (${val})`;
          }
        } else {
          if (argType === "b") text += ` <>`;
          else text += ` ()`;
        }
      });

      return text;
    }

    const def = this.defMap[type];
    if (!def) return `[Unknown Block: ${type}]`;

    let text = def.spec;
    const values = Array.from(blockNode.children).filter(
      (n) => n.tagName === "value"
    );
    const fields = Array.from(blockNode.children).filter(
      (n) => n.tagName === "field"
    );

    text = text.replace(/%(\d+)/g, (match, index) => {
      const i = parseInt(index, 10) - 1;
      const inputType = def.inputs[i] || "";
      const isMenu = inputType.startsWith("%d") || inputType.startsWith("%m");
      const isBoolean = inputType.startsWith("%b");

      let valContent = "";
      const argDef = def.xml && def.xml.args[i];

      if (argDef && argDef.type === "field") {
        const field = fields.find(
          (f) => f.getAttribute("name") === argDef.name
        );
        valContent = field ? field.textContent : argDef.default;
        if (isMenu) return `[${valContent}]`;
        return `(${valContent})`;
      } else if (argDef) {
        const valNode = values.find(
          (v) => v.getAttribute("name") === argDef.name
        );

        if (valNode) {
          valContent = this.extractValue(valNode);
          const hasWrapper = /^(?:\(.*\)|<.*>|\[.*\])$/.test(valContent);
          if (hasWrapper) {
            return valContent;
          } else {
            if (isBoolean) return `<${valContent}>`;
            return `(${valContent})`;
          }
        } else {
          valContent = argDef.default;
          if (isBoolean) return `<${valContent}>`;
          return `(${valContent})`;
        }
      }
      return match;
    });

    if (def.shape === "reporter") text = `(${text})`;
    else if (def.shape === "boolean") text = `<${text}>`;

    if (def.shape.includes("c-block")) {
      text += " {";

      const subStack = this._getSubstackBlock(blockNode, "SUBSTACK");
      if (subStack) {
        text += "\n" + this.indent(this.processBlockChain(subStack));
      }

      if (def.id === "control_if_else") {
        text += "\n} else {";
        const subStack2 = this._getSubstackBlock(blockNode, "SUBSTACK2");
        if (subStack2) {
          text += "\n" + this.indent(this.processBlockChain(subStack2));
        }
      }
      text += "\n}";
    }

    return text;
  }

  indent(text) {
    return text
      .split("\n")
      .map((line) => "  " + line)
      .join("\n");
  }

  extractValue(valueNode) {
    const nestedBlock = this._getChild(valueNode, "block");
    if (nestedBlock) return this.renderBlock(nestedBlock);

    const shadow = this._getChild(valueNode, "shadow");
    if (shadow) {
      const field = this._getChild(shadow, "field");
      return field ? field.textContent : "";
    }
    const field = this._getChild(valueNode, "field");
    return field ? field.textContent : "";
  }

  fromText(textString) {
    this.definedProcs = {};
    const xmlDoc = document.implementation.createDocument(null, "xml");
    const root = xmlDoc.documentElement;
    root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

    const rawLines = textString.split(/\r?\n/);

    let stack = [{ container: root, lastBlock: null, type: 'root' }];

    rawLines.forEach((rawLine, index) => {
      const line = rawLine.trim();

      if (!line) {
        if (stack.length === 1) stack[0].lastBlock = null;
        return;
      }

      if (line === "}" || line === "} else {") {
        if (stack.length > 1) {
          const popped = stack.pop();
          if (popped.type === 'definition') {
            stack[stack.length - 1].lastBlock = null;
          }
        } else {
          console.warn("Unmatched } at line", index);
        }

        if (line === "} else {") {
          const parentContext = stack[stack.length - 1];
          const ifBlock = parentContext.lastBlock;
          if (ifBlock && ifBlock.getAttribute("type") === "control_if") {
            ifBlock.setAttribute("type", "control_if_else");
            const statement = xmlDoc.createElement("statement");
            statement.setAttribute("name", "SUBSTACK2");
            ifBlock.appendChild(statement);
            stack.push({ container: statement, lastBlock: null, type: 'statement' });
            return;
          }
        }
        return;
      }

      const cleanLine = line.replace(/\{$/, "").trim();
      const blockEl = this.parseLineToBlock(cleanLine, xmlDoc);

      if (!blockEl) {
        console.warn(`Unknown block syntax: ${cleanLine}`);
        return;
      }

      const context = stack[stack.length - 1];

      if (context.lastBlock) {
        const nextEl = xmlDoc.createElement("next");
        nextEl.appendChild(blockEl);
        context.lastBlock.appendChild(nextEl);
      } else {
        if (context.container) {
          context.container.appendChild(blockEl);
        } else {
          console.warn("Error: No container and no previous block to attach to.");
        }
      }

      context.lastBlock = blockEl;

      if (line.endsWith("{")) {
        if (blockEl.getAttribute("type") === "procedures_definition") {
          stack.push({ container: null, lastBlock: blockEl, type: 'definition' });
        } else {
          const statement = xmlDoc.createElement("statement");
          statement.setAttribute("name", "SUBSTACK");
          blockEl.appendChild(statement);
          stack.push({ container: statement, lastBlock: null, type: 'statement' });
        }
      }
    });

    return this.serializer.serializeToString(xmlDoc);
  }

  parseLineToBlock(line, doc) {
    let content = line.trim();

    if (content.startsWith("define ")) {
      return this.buildDefinitionBlock(content, doc);
    }

    if (content.startsWith("call ")) {
      return this.buildCallBlock(content, doc);
    }

    let shape = "stack";
    if (content.startsWith("(") && content.endsWith(")")) {
      shape = "reporter";
      content = content.slice(1, -1);
    } else if (content.startsWith("<") && content.endsWith(">")) {
      shape = "boolean";
      content = content.slice(1, -1);
    }

    for (const def of this.defs) {
      let defShape = "stack";
      if (def.shape === "reporter") defShape = "reporter";
      if (def.shape === "boolean") defShape = "boolean";
      if (
        def.shape.includes("c-block") ||
        def.shape === "cap" ||
        def.shape === "hat"
      ) {
        defShape = "stack";
      }

      if (defShape !== shape) continue;

      const match = this.matchDef(def, content);
      if (match) {
        return this.buildBlockElement(def, match.args, doc);
      }
    }

    return null;
  }

  buildDefinitionBlock(line, doc) {
    const regex = /^define\s+"([^"]+)"(.*)$/;
    const match = line.match(regex);
    if (!match) return null;

    const proccode = match[1];
    let rest = match[2].trim();
    let warp = false;

    if (rest.endsWith("warp")) {
      warp = true;
      rest = rest.substring(0, rest.length - 4).trim();
    }

    const argNames = [];
    const argIds = [];
    const argDefaults = [];

    let cursor = 0;
    while (cursor < rest.length) {
      if (rest[cursor] === "(" || rest[cursor] === "<") {
        const arg = this.extractBalanced(rest, cursor);
        if (arg) {
          const name = arg.slice(1, -1);
          argNames.push(name);
          const id = `arg_${proccode.replace(/\W/g, "")}_${name}`;
          argIds.push(id);

          if (arg.startsWith("(")) argDefaults.push("");
          else argDefaults.push("false");

          cursor += arg.length;
        } else {
          cursor++;
        }
      } else {
        cursor++;
      }
    }

    this.definedProcs[proccode] = {
      argumentids: argIds,
      argumentnames: argNames,
    };

    const block = doc.createElement("block");
    block.setAttribute("type", "procedures_definition");

    const statement = doc.createElement("statement");
    statement.setAttribute("name", "custom_block");
    block.appendChild(statement);

    const shadow = doc.createElement("shadow");
    shadow.setAttribute("type", "procedures_prototype");
    statement.appendChild(shadow);

    const mutation = doc.createElement("mutation");
    mutation.setAttribute("proccode", proccode);
    mutation.setAttribute("argumentids", JSON.stringify(argIds));
    mutation.setAttribute("argumentnames", JSON.stringify(argNames));
    mutation.setAttribute("argumentdefaults", JSON.stringify(argDefaults));
    mutation.setAttribute("warp", warp ? "true" : "false");
    shadow.appendChild(mutation);

    argIds.forEach((id, idx) => {
      const name = argNames[idx];
      const isBool = argDefaults[idx] === "false";

      const valueEl = doc.createElement("value");
      valueEl.setAttribute("name", id);
      shadow.appendChild(valueEl);

      const innerShadow = doc.createElement("shadow");
      innerShadow.setAttribute(
        "type",
        isBool ? "argument_reporter_boolean" : "argument_reporter_string_number"
      );
      valueEl.appendChild(innerShadow);

      const field = doc.createElement("field");
      field.setAttribute("name", "VALUE");
      field.textContent = name;
      innerShadow.appendChild(field);
    });

    return block;
  }

  buildCallBlock(line, doc) {
    const regex = /^call\s+"([^"]+)"(.*)$/;
    const match = line.match(regex);
    if (!match) return null;

    const proccode = match[1];
    const rest = match[2].trim();

    const argTypes = [];
    proccode.replace(/%([sb])/g, (m, type) => {
      argTypes.push(type);
    });

    let procDef = this.definedProcs[proccode];

    if (!procDef) {
      procDef = { argumentids: [] };
      let dummyCount = 0;
      let rCursor = 0;
      while (rCursor < rest.length) {
        if (rest[rCursor] === "(" || rest[rCursor] === "<") {
          const chunk = this.extractBalanced(rest, rCursor);
          if (chunk) {
            procDef.argumentids.push(`unknown_arg_${dummyCount++}`);
            rCursor += chunk.length;
          } else rCursor++;
        } else rCursor++;
      }
    }

    const block = doc.createElement("block");
    block.setAttribute("type", "procedures_call");

    const mutation = doc.createElement("mutation");
    mutation.setAttribute("proccode", proccode);
    mutation.setAttribute("argumentids", JSON.stringify(procDef.argumentids));
    mutation.setAttribute("warp", "false");
    block.appendChild(mutation);

    let cursor = 0;
    let argIdx = 0;

    while (cursor < rest.length && argIdx < procDef.argumentids.length) {
      if (rest[cursor] === "(" || rest[cursor] === "<") {
        const argStr = this.extractBalanced(rest, cursor);
        if (argStr) {
          const id = procDef.argumentids[argIdx];
          const typeChar = argTypes[argIdx] || "s";

          let rawVal = argStr;
          let nestedBlock = null;

          if (
            (rawVal.startsWith("(") && rawVal.endsWith(")")) ||
            (rawVal.startsWith("<") && rawVal.endsWith(">"))
          ) {
            nestedBlock = this.parseLineToBlock(rawVal, doc);
          }

          if (typeChar === "s") {
            const valueEl = doc.createElement("value");
            valueEl.setAttribute("name", id);

            const shadow = doc.createElement("shadow");
            shadow.setAttribute("type", "text");
            const field = doc.createElement("field");
            field.setAttribute("name", "TEXT");

            if (nestedBlock) {
              field.textContent = "";
              shadow.appendChild(field);
              valueEl.appendChild(shadow);
              valueEl.appendChild(nestedBlock);
            } else {
              field.textContent = rawVal.slice(1, -1);
              shadow.appendChild(field);
              valueEl.appendChild(shadow);
            }

            block.appendChild(valueEl);
          } else if (typeChar === "b") {
            if (nestedBlock) {
              const valueEl = doc.createElement("value");
              valueEl.setAttribute("name", id);
              valueEl.appendChild(nestedBlock);
              block.appendChild(valueEl);
            }
          }

          cursor += argStr.length;
          argIdx++;
        } else cursor++;
      } else cursor++;
    }

    return block;
  }

  matchDef(def, text) {
    let cursor = 0;
    const args = {};

    for (const token of def.tokens) {
      if (typeof token === "string") {
        if (!text.startsWith(token, cursor)) return null;
        cursor += token.length;
      } else {
        if (cursor >= text.length) return null;

        const startChar = text[cursor];
        if (!["(", "<", "["].includes(startChar)) return null;

        const argStr = this.extractBalanced(text, cursor);
        if (!argStr) return null;

        args[token.argIndex] = argStr;
        cursor += argStr.length;
      }
    }
    if (cursor !== text.length) return null;
    return { args };
  }

  extractBalanced(text, start) {
    const open = text[start];
    let close = "";
    if (open === "(") close = ")";
    else if (open === "<") close = ">";
    else if (open === "[") close = "]";
    else return null;

    let balance = 0;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (char === "\\" && !escaped) {
        escaped = true;
        continue;
      }

      if (!escaped) {
        if (char === open) balance++;
        else if (char === close) balance--;
      }

      escaped = false;

      if (balance === 0) {
        return text.substring(start, i + 1);
      }
    }
    if (balance > 0 && text[text.length - 1] === close) {
      return text.substring(start);
    }

    return null;
  }

  buildBlockElement(def, argsMap, doc) {
    const block = doc.createElement("block");
    block.setAttribute("type", def.id);

    def.xml.args.forEach((argDef, index) => {
      const rawVal = argsMap[index];
      if (rawVal === undefined) return;

      if (argDef.type === "field") {
        const field = doc.createElement("field");
        field.setAttribute("name", argDef.name);

        let val = rawVal;
        if (val.startsWith("[") && val.endsWith("]")) val = val.slice(1, -1);
        if (val.startsWith("(") && val.endsWith(")")) val = val.slice(1, -1);

        if (argDef.hasOwnProperty("variableType")) {
          field.setAttribute("variabletype", argDef.variableType);
        }

        field.textContent = val;
        block.appendChild(field);
      } else {
        const valueEl = doc.createElement("value");
        valueEl.setAttribute("name", argDef.name);

        let nestedBlock = null;
        if (
          (rawVal.startsWith("(") && rawVal.endsWith(")")) ||
          (rawVal.startsWith("<") && rawVal.endsWith(">"))
        ) {
          nestedBlock = this.parseLineToBlock(rawVal, doc);
        }

        let shadowValue = argDef.default || "";
        if (!nestedBlock) {
          let cleanVal = rawVal;
          if (cleanVal.startsWith("(") && cleanVal.endsWith(")"))
            cleanVal = cleanVal.slice(1, -1);
          else if (cleanVal.startsWith("<") && cleanVal.endsWith(">"))
            cleanVal = cleanVal.slice(1, -1);
          else if (cleanVal.startsWith("[") && cleanVal.endsWith("]"))
            cleanVal = cleanVal.slice(1, -1);

          if (argDef.shadow === 'colour_picker') {
            const hexRegex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;
            if (!hexRegex.test(cleanVal)) {
              console.warn(`[Torchy] Invalid hex color code "${cleanVal}" for block "${def.id}". Defaulting to #000000.`);
              cleanVal = '#000000';
            }
          }

          shadowValue = cleanVal;
        }

        this.appendShadow(doc, valueEl, argDef, shadowValue);

        if (nestedBlock) {
          valueEl.appendChild(nestedBlock);
        }
        block.appendChild(valueEl);
      }
    });

    return block;
  }

  appendShadow(doc, parent, argDef, value) {
    if (!argDef.shadow) return;
    const shadow = doc.createElement("shadow");
    shadow.setAttribute("type", argDef.shadow);
    const field = doc.createElement("field");
    field.setAttribute("name", argDef.field);
    if (argDef.variableType) {
      field.setAttribute("variabletype", argDef.variableType);
    }
    field.textContent = value;
    shadow.appendChild(field);
    parent.appendChild(shadow);
  }
  generateToolboxReference() {
    const categories = {};

    this.defs.forEach((def) => {
      if (def.category === "custom") return;

      if (!categories[def.category]) {
        categories[def.category] = [];
      }

      let text = def.spec;
      text = text.replace(/%(\d+)/g, (match, index) => {
        const i = parseInt(index, 10) - 1;
        const inputType = def.inputs[i] || "";
        const isMenu = inputType.startsWith("%d") || inputType.startsWith("%m");
        const isBoolean = inputType.startsWith("%b");

        const argDef = def.xml && def.xml.args[i];
        let valContent = argDef ? argDef.default : "";

        if (argDef && argDef.type === "field") {
          if (isMenu) return `[${valContent}]`;
          return `(${valContent})`;
        } else {
          if (isBoolean) return `<${valContent}>`;
          return `(${valContent})`;
        }
      });

      if (def.shape === "reporter") text = `(${text})`;
      else if (def.shape === "boolean") text = `<${text}>`;

      if (def.shape.includes("c-block")) {
        text += " {\n  // blocks\n}";
        if (def.id === "control_if_else") {
          text = text.replace("\n}", "\n} else {\n  // blocks\n}");
        }
      }

      categories[def.category].push(text);
    });

    let output = "Available Blocks and Syntax:\n\n";

    output += "--- CUSTOM BLOCKS ---\n";
    output += '// Define a block\n';
    output += 'define "block name" (numberOrStringInput) <booleanInput> {\n  // definition body\n}\n';
    output += '// Call a block\n';
    output += 'call "block name" (10) <true>\n\n';

    for (const [category, blocks] of Object.entries(categories)) {
      output += `--- ${category.toUpperCase()} ---\n`;
      output += blocks.join("\n") + "\n\n";
    }

    return output;
  }
}
