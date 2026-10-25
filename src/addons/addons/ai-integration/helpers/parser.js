/**
 * thanks to blocks2image for this code (modified for standalone use)
 * @example
 *   GetSVG.init(Blockly);
 *   const svgGenerator = new GetSVG();
 *   svgGenerator.getSVG(blockXmlString, "id").then(svgString => {
 *     console.log(svgString); // Process the exported SVG string here
 *   });
 */

let Blockly = null;

let previewContainer = null;
let previewWorkspace = null;

const CONTAINER_ID = 'parsingInjectionDiv';

function ensureContainer () {
    if (previewContainer && previewContainer.isConnected) return previewContainer;

    let div = document.getElementById(CONTAINER_ID);
    if (!div) {
        div = document.createElement('div');
        div.id = CONTAINER_ID;
        document.body.appendChild(div);
    }
    div.style.position = 'absolute';
    div.style.left = '-10000px';
    div.style.top = '0';
    div.style.width = '1000px';
    div.style.height = '1000px';
    div.style.overflow = 'hidden';
    div.style.pointerEvents = 'none';

    previewContainer = div;
    return div;
}

function getPreviewWorkspace () {
    if (previewWorkspace) return previewWorkspace;

    const ScratchBlocks = Blockly;
    if (!ScratchBlocks || typeof ScratchBlocks.inject !== 'function') {
        console.error('[Torchy] Scratch Blocks not loaded');
        return null;
    }

    const container = ensureContainer();
    if (!container) return null;

    const workspaceConfig = {
        zoom: {
            controls: false,
            wheel: false,
            startScale: 0.9
        },
        comments: false,
        collapse: false,
        scrollbars: true,
        media: 'static/blocks-media/default/',
        rtl: false
    };

    // HACK to remove the toolbox
    const oldDefaultToolbox = ScratchBlocks.Blocks && ScratchBlocks.Blocks.defaultToolbox;
    if (ScratchBlocks.Blocks) ScratchBlocks.Blocks.defaultToolbox = null;

    const previousMainWorkspace = ScratchBlocks.mainWorkspace;
    try {
        previewWorkspace = ScratchBlocks.inject(container, workspaceConfig);
    } finally {
        ScratchBlocks.mainWorkspace = previousMainWorkspace;
        if (ScratchBlocks.Blocks) ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;
    }

    return previewWorkspace;
}

export default class GetSVG {
    constructor () {
        this.exSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.exSVG.setAttribute('xmlns:html', 'http://www.w3.org/1999/xhtml');
        this.exSVG.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        this.exSVG.setAttribute('version', '1.1');
    }

    static Blockly;

    // Method to set CSS variables for the element
    setCSSVars (element) {
        const rootStyle = document.documentElement.style;
        for (let i = 0; i < rootStyle.length; i++) {
            const property = rootStyle[i];
            if (property && property.startsWith('--editorTheme3-')) {
                element.style.setProperty(property, rootStyle.getPropertyValue(property));
            }
        }
    }

    // Method to create style for the SVG
    makeStyle () {
        const style = document.createElement('style');
        style.textContent = `
      .blocklyText {
          fill: ${Blockly.Colours.text};
          font-family: "Helvetica Neue", Helvetica, sans-serif;
          font-size: 12pt;
          font-weight: 500;
      }
      .blocklyNonEditableText>text, .blocklyEditableText>text {
          fill: ${Blockly.Colours.textFieldText};
      }
      .blocklyDropdownText {
          fill: ${Blockly.Colours.text} !important;
      }
    `;
        for (const userstyle of document.querySelectorAll(".scratch-addons-style[data-addons*='editor-theme3']")) {
            if (userstyle.disabled) continue;
            style.textContent += userstyle.textContent;
        }
        return style;
    }

    async getSVG (blockXml, uniqueCommentID) {
        if (!Blockly) {
            console.error('Blockly is not initialized. Call init(Blockly) first.');
            return '';
        }

        const workspace = getPreviewWorkspace();
        if (!workspace) return '';

        workspace.clear();

        this.blockXml = Blockly.Xml.textToDom(blockXml);

        let returnedData = '<div class="previewWrapper"> ';

        for (const childXml of Array.from(this.blockXml.children)) {
            const block = Blockly.Xml.domToBlock(childXml, workspace, uniqueCommentID);
            returnedData += await this.getSVG_internal(block);
        }
        returnedData += '</div>';
        return returnedData;
    }

    // Main method to fetch the SVG for a given blockXml
    async getSVG_internal (block) {

        // Get the exported SVG
        const svg = this.selectedBlocks(false, block);
        if (!svg) return '';

        // Replace &nbsp; whitespace issues
        svg.querySelectorAll('text').forEach(text => {
            text.innerHTML = text.innerHTML.replace(/&nbsp;/g, ' ');
        });

        // Replace external images with data URIs
        await this.replaceExternalImages(svg);

        // Export the SVG as a file
        return new XMLSerializer().serializeToString(svg);
    }

    // Method to generate selected blocks SVG
    selectedBlocks (isExportPNG, block) {
        const svg = this.exSVG.cloneNode();

        let svgchild = block && block.getSvgRoot && block.getSvgRoot();
        if (!svgchild) {
            console.error('Block SVG not found');
            return;
        }

        svgchild = svgchild.cloneNode(true);
        const dataShapes = svgchild.getAttribute('data-shapes');
        let translateY = 0;
        const scale = isExportPNG ? 2 : 1;

        if (dataShapes === 'c-block c-1 hat') {
            translateY = 20;
        } else if (dataShapes === 'hat') {
            translateY = block.CAT_BLOCKS ? 32 : 16;
        }

        svgchild.setAttribute('transform', `translate(0,${scale * translateY}) scale(${scale})`);

        this.setCSSVars(svg);
        svg.append(this.makeStyle());
        svg.append(svgchild);
        return svg;
    }

    // Method to replace external images with data URIs
    async replaceExternalImages (svg) {
        await Promise.all(
            Array.from(svg.querySelectorAll('image')).map(async item => {
                const iconUrl = item.getAttribute('xlink:href');
                if (!iconUrl || iconUrl.startsWith('data:')) return;
                const blob = await (await fetch(iconUrl)).blob();
                const reader = new FileReader();
                const dataUri = await new Promise(resolve => {
                    reader.addEventListener('load', () => resolve(reader.result));
                    reader.readAsDataURL(blob);
                });
                item.setAttribute('xlink:href', dataUri);
            })
        );
    }

    static init (FullBlockly) {
        Blockly = FullBlockly;
        ensureContainer();
    }

    static dispose () {
        if (previewWorkspace) {
            try {
                previewWorkspace.dispose();
            } catch (e) {
                console.error('[Torchy] Failed to dispose the preview workspace:', e);
            }
            previewWorkspace = null;
        }
        if (previewContainer && previewContainer.parentNode) {
            previewContainer.parentNode.removeChild(previewContainer);
        }
        previewContainer = null;
    }
}
