// Gradient Maker Addon
// By: SharkPool
export default async function () {
    const isPM = true;
    const customID = "custom-gradient-btn";
    const symbolTag = Symbol("custom-gradient-tag");
    const guiIMGS = {
        "select": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect stroke="#000" fill="#fff" x=".5" y=".5" width="19" height="19" rx="4" stroke-opacity=".15"/><path fill="red" d="M13.35 8.8h-2.4V6.4a1.2 1.2 90 0 0-2.4 0l.043 2.4H6.15a1.2 1.2 90 0 0 0 2.4l2.443-.043L8.55 13.6a1.2 1.2 90 0 0 2.4 0v-2.443l2.4.043a1.2 1.2 90 0 0 0-2.4"/></svg>`,
        "add": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`,
        "delete": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" /></svg>`,
    };

    const paperLinkModes = new Set([
        "TEXT", "OVAL", "RECT",
        ...(isPM ? ["ROUNDED_RECT", "TRIANGLE", "SUSSY", "ARROW"] : [])
    ]);

    let selectedClassName, unselectedClassName, customBtn;
    let observerUsed = false;
    let modalStorage = {};

    /* Internal Utils */
    function position2Angle(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return angle + 90;
    }

    function initGradSelectClasses(gradRow) {
        const classes = {};
        const children = Array.from(gradRow.children);
        for (const child of children) {
            const name = child.classList.toString();
            if (classes[name] === undefined) classes[name] = 1;
            else classes[name] = 0;
        }

        for (const [cls, count] of Object.entries(classes)) {
            if (count) selectedClassName = cls;
            else unselectedClassName = cls
        }
    }

    function encodeGradHTML(settings) {
        const sortedParts = [...settings.parts].sort((a, b) => a.p - b.p);

        let gradString = settings.type === "Linear" ? "linear-gradient(" : "radial-gradient(";
        if (settings.type === "Linear") gradString += `${settings.dir}deg, `;
        for (const part of sortedParts) gradString += `${part.c} ${part.p}%, `;
        return gradString.substring(0, gradString.length - 2) + ")";
    }

    function genLinearGradPoints(bounds, angleDeg) {
        const center = bounds.center;
        const dir = new paper.Point({ angle: angleDeg, length: 1 });
        const boundsRect = new paper.Path.Rectangle(bounds);
        const gradLine = new paper.Path.Line({
            from: center.subtract(dir.multiply(10000)),
            to: center.add(dir.multiply(10000))
        });

        const intersections = gradLine.getIntersections(boundsRect);
        gradLine.remove();
        boundsRect.remove();
        if (intersections.length < 2) {
            return {
                origin: center.subtract(dir.multiply(bounds.width / 2)),
                destination: center.add(dir.multiply(bounds.width / 2))
            };
        } else {
            return {
                origin: intersections[0].point,
                destination: intersections[1].point
            };
        }
    }

    function setSelected2Grad(settings) {
        // compile SVG-based gradient
        const sortedParts = [...settings.parts].sort((a, b) => a.p - b.p);
        const gradStops = sortedParts.map(part => new paper.GradientStop(part.c, part.p / 100));
        const gradient = new paper.Gradient(gradStops, settings.type === "Radial");
        modalStorage._gradCache = { settings, gradient };

        paper.project.getSelectedItems().forEach((item) => {
            let origin, destination;
            if (settings.type === "Radial") {
                origin = item.bounds.center;
                destination = item.bounds.center.add([item.bounds.width / 2, 0]);
            } else {
                const points = genLinearGradPoints(item.bounds, settings.dir - 90);
                origin = points.origin;
                destination = points.destination;
            }

            item[settings.path] = { gradient, origin, destination };
        });

        // update drawing & action
        if (paper.tool.onUpdateImage) paper.tool.onUpdateImage();

        // set with html otherwise GUI will crash
        const swatch = document.querySelectorAll(
            `div[class^=color-button_color-button_] div[class^=color-button_color-button-swatch_]`
        )[settings.path === "fillColor" ? 0 : 1];
        if (swatch) swatch.style.background = encodeGradHTML(settings);
    }

    function paperGrad2CSS(paperGrad) {
        const { gradient, origin, destination } = paperGrad;
        if (!gradient || !origin || !destination) return null;

        const stops = gradient.stops.map(s => `${s.color.toCSS(true)} ${Math.round(s.offset * 100)}%`);
        if (gradient.radial) return `radial-gradient(circle, ${stops.join(", ")})`;
        else return `linear-gradient(${position2Angle(destination, origin)}deg, ${stops.join(", ")})`;
    }

    function extractGradient(color) {
        if (!color || !color.gradient) return {};
        return {
            gradient: color.gradient,
            origin: color.origin || "",
            destination: color.destination || color.highlight || ""
        };
    }

    function decodeSelectedGrad(item, draggableDiv, settingsDiv) {
        const { gradient, origin, destination } = extractGradient(item[modalStorage.path]);
        if (!gradient || !origin || !destination) return draggableDiv.append(createDraggable(), createDraggable());

        // create draggables
        const newStops = gradient.stops.map((s, i) => {
            // "offset" will be undefined when using Scratch gradients, which dont have set-stops
            const alpha = Math.round(s.color.alpha * 255).toString(16).padStart(2, "0");
            return createDraggable(s.color.toCSS(true) + alpha, s.offset ? s.offset * 100 : i * 100)
        });
        draggableDiv.append(...newStops);

        // preset values
        const angle = position2Angle(destination, origin);
        settingsDiv.querySelector("select").value = gradient.radial ? "Radial" : "Linear";
        settingsDiv.querySelector("input").value = angle;
        modalStorage.type = gradient.radial ? "Radial" : "Linear";
        modalStorage.dir = angle;
    }

    function decodeFromCache(settings, draggableDiv, settingsDiv) {
        // create draggables
        const newStops = settings.parts.map((s, i) => {
            // "p" will be NaN when using Scratch gradients, which dont have set-stops
            return createDraggable(s.c, isNaN(s.p) ? i * 100 : s.p)
        });
        draggableDiv.append(...newStops);

        // preset values
        settingsDiv.querySelector("select").value = settings.type;
        settingsDiv.querySelector("input").value = settings.dir;
        modalStorage.type = settings.type;
        modalStorage.dir = settings.dir;
    }

    function handleFillEvent(paint) {
        if (!modalStorage._gradCache) return;

        // set the GUI gradient mode to linear so we can position our gradients
        paint.fillMode.gradientType = "HORIZONTAL";
        paint.color.fillColor.gradientType = "HORIZONTAL";
        paint.color.strokeColor.gradientType = "HORIZONTAL";

        // set the swatch color in case the GUI resets it
        const swatch = document.querySelector(`div[class^=color-button_color-button_] div[class^=color-button_color-button-swatch_]`);
        if (swatch) queueMicrotask(() => {
            if (!modalStorage._gradCache) return;
            swatch.style.background = encodeGradHTML(modalStorage._gradCache.settings);
        });

        const tool = paper.tool;
        if (typeof tool?._getFillItem !== "function") return;

        const item = tool._getFillItem();
        if (!item) return;

        const bounds = item.bounds;
        let origin, destination;
        if (modalStorage.type === "Radial") {
            origin = new paper.Point(tool._point.x, tool._point.y);
            destination = origin.add([Math.max(bounds.width, bounds.height) / 2, 0]);
        } else {
            const points = genLinearGradPoints(bounds, modalStorage.dir - 90);
            origin = points.origin;
            destination = points.destination;
        }

        const path = tool.fillProperty === "fill" ? "fillColor" : "strokeColor";
        item[path] = {
            gradient: modalStorage._gradCache.gradient,
            origin, destination
        };
    }

    function handleShapeModeEvent(type) {
        if (!modalStorage._gradCache && type !== "TEXT") return;

        // set the swatch color in case the GUI resets it
        const swatch = document.querySelector(`div[class^=color-button_color-button_] div[class^=color-button_color-button-swatch_]`);
        if (swatch) queueMicrotask(() => {
            if (!modalStorage._gradCache) return;
            swatch.style.background = encodeGradHTML(modalStorage._gradCache.settings);
        });

        const tool = paper.tool;
        if (typeof tool?._onMouseDrag !== "function") return;
        if (tool[symbolTag]) return;
        // patch this event, if not already, to run our code

        const funcName = type === "TEXT" ? "onKeyDown" : "onMouseDrag";
        const ogOnFunc = tool[funcName];
        tool[symbolTag] = true;
        tool[funcName] = function (...args) {
            ogOnFunc.call(this, ...args);

            // replace the fill with the custom gradient
            if (!modalStorage._gradCache) {
                if (type === "TEXT") {
                    tool.element.style.background = "";
                    tool.element.style.backgroundClip = "";
                    tool.element.style.color = "";
                }
                return;
            }

            let item;
            switch (type) {
                case "RECT":
                    item = this.rect;
                    break;
                case "OVAL":
                    item = this.oval;
                    break;
                case "TEXT":
                    item = this.textBox;
                    break;
                /* PenguinMod shapes */
                case "ROUNDED_RECT":
                    item = this.rect;
                    break;
                case "TRIANGLE":
                    item = this.tri;
                    break;
                case "SUSSY":
                    item = this.sussy;
                    break;
                case "ARROW":
                    item = this.tri;
                    break;
                default: return;
            }
            if (!item) return;
            const bounds = item.bounds;
            let origin, destination;
            if (modalStorage.type === "Radial") {
                origin = item.bounds.center;
                destination = item.bounds.center.add([item.bounds.width / 2, 0]);
            } else {
                const points = genLinearGradPoints(bounds, modalStorage.dir - 90);
                origin = points.origin;
                destination = points.destination;
            }

            item.fillColor = {
                gradient: modalStorage._gradCache.gradient,
                origin, destination
            };

            // text uses HTML elements, so we have to handle that too
            if (type === "TEXT") {
                tool.element.style.background = encodeGradHTML(modalStorage._gradCache.settings);
                tool.element.style.backgroundClip = "text";
                tool.element.style.color = "transparent";
            }
        }
    }

    /* GUI Utils */
    function getButtonURI(name, dontCompile) {
        const themeHex = isPM ? "#00c3ff" : document.documentElement.style.getPropertyValue("--looks-secondary") || "#ff4c4c";
        const guiSVG = guiIMGS[name].replace("red", themeHex);
        if (dontCompile) return guiSVG;
        else return "data:image/svg+xml;base64," + btoa(guiSVG);
    }

    function showSelectedGrad(item) {
        const [fillSwatch, outlineSwatch] = document.querySelectorAll(`div[class^=color-button_color-button_] div[class^=color-button_color-button-swatch_]`);
        const outCSSGrad = paperGrad2CSS(extractGradient(item.strokeColor));
        if (outlineSwatch) {
            if (outCSSGrad) outlineSwatch.style.background = outCSSGrad;
            else if (!item.strokeColor || item.strokeWidth === 0) outlineSwatch.style.background = "#fff";
        }

        const fillGrad = extractGradient(item.fillColor);
        const fillCSSGrad = paperGrad2CSS(fillGrad);
        modalStorage._gradCache = undefined;
        if (fillSwatch) {
            if (fillCSSGrad) {
                fillSwatch.style.background = fillCSSGrad;

                // update cache
                const { gradient, destination, origin } = fillGrad;
                modalStorage._gradCache = {
                    gradient,
                    settings: {
                        type: gradient.radial ? "Radial" : "Linear",
                        dir: position2Angle(destination, origin),
                        parts: gradient.stops.map(s => {
                            const alpha = Math.round(s.color.alpha * 255).toString(16).padStart(2, "0");
                            return { c: s.color.toCSS(true) + alpha, p: s.offset * 100 };
                        })
                    }
                };
            } else if (!item.fillColor) fillSwatch.style.background = "#fff";
        }
    }

    function createDraggable(optC, optP) {
        const index = modalStorage.parts.length;
        const rngPos = optP ?? Math.floor(Math.random() * 100);
        const rngHex = optC ?? `#${Math.floor(Math.random() * Math.pow(2, 24)).toString(16).padStart(6, "0")}`;
        const opacity = optC ? optC.length === 9 ? parseInt(optC.slice(7, 9), 16) / 255 : 1 : 1;
  
        const draggable = document.createElement("div");
        draggable.id = index;
        draggable.classList.add("pointer");
        draggable.setAttribute("style", `cursor: pointer; position: absolute; top: -5px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; z-index: 10;`);
        draggable.style.left = `${rngPos}%`;

        const nub = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        nub.setAttribute("width", "12");
        nub.setAttribute("height", "6");
        nub.style.marginBottom = "-1px";
        nub.style.filter = "drop-shadow(0px -1px 1px rgba(0,0,0,0.3))";


        const colorContainer = document.createElement("div");
        colorContainer.setAttribute("style", `width: 18px; height: 18px; border-radius: 20%; background: ${rngHex.substring(0, 7)}; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.4); opacity: ${opacity}; display: flex; justify-content: center; align-items: center; position: relative; box-sizing: border-box;`);

        const colorInput = document.createElement("input");
        colorInput.setAttribute("type", "color");
        colorInput.setAttribute("style", `opacity: 0; position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;`);
        colorInput.value = rngHex.substring(0, 7);

        const opacityInput = document.createElement("input");
        opacityInput.classList.add("SP-gradient-maker-input");
        opacityInput.setAttribute("type", "number");
        opacityInput.setAttribute("min", "0");
        opacityInput.setAttribute("max", "100");
        opacityInput.value = Math.round(opacity * 100);
        opacityInput.setAttribute("style", `visibility: hidden; position: absolute; top: -35px; left: 50%; transform: translateX(-50%); z-index: 20; box-shadow: 0 2px 5px rgba(0,0,0,0.2); width: 60px; padding: 0 0.5rem; text-align: center; border-radius: 0.25rem; border: 1px solid var(--ui-black-transparent, rgba(0,0,0,0.15)); background: var(--input-background, #fff); color: var(--text-primary, #575e75); outline: none;`);

        // Color picker handler
        colorContainer.addEventListener("click", (e) => {
            opacityInput.style.visibility = "visible";
            colorInput.click();
            e.stopPropagation();
        });
        draggable.addEventListener("mouseleave", (e) => {
            opacityInput.style.visibility = "hidden";
            e.stopPropagation();
        });

        colorInput.addEventListener("input", (e) => {
            modalStorage.parts[draggable.id].c = e.target.value + Math.round((opacityInput.value / 100) * 255).toString(16).padStart(2, "0");
            colorContainer.style.background = e.target.value;
            updateDisplay();
        });

        // Opacity slider handler
        opacityInput.addEventListener("click", (e) => {
            opacityInput.focus();
            e.stopPropagation();
        });
        opacityInput.addEventListener("input", (e) => {
            const newOpacity = Math.min(100, Math.max(0, e.target.value));
            e.target.value = newOpacity;
            colorContainer.style.opacity = newOpacity / 100;

            const alpha = Math.round((newOpacity / 100) * 255).toString(16).padStart(2, "0");
            const hex = modalStorage.parts[draggable.id].c;
            modalStorage.parts[draggable.id].c = hex.substring(0, 7) + alpha;
            updateDisplay();
        });

        draggable.addEventListener("mousedown", (e) => {
            e.preventDefault();
            if (e.target === opacityInput) return;

            // Bring to front
            draggable.parentElement.appendChild(draggable);

            modalStorage.selectedPointer = draggable;
            const container = draggable.parentElement;
            const containerRect = container.getBoundingClientRect();

            const onMouseMove = (moveEvent) => {
                const x = moveEvent.clientX - containerRect.left;
                const percent = Math.min(100, Math.max(0, (x / container.offsetWidth) * 100));
                draggable.style.left = `${percent}%`;
                modalStorage.parts[draggable.id].p = percent;
                updateDisplay();
            };

            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });

        draggable.style.zIndex = 20;

        colorContainer.append(colorInput, opacityInput);
        draggable.append(nub, colorContainer);
        modalStorage.parts.push({ c: rngHex, p: rngPos });
        modalStorage.selectedPointer = draggable;
        return draggable;
    }

    function genSettingsTable(div) {
        const btnGroup = document.createElement("div");
        btnGroup.classList.add("SP-gradient-maker-btn-group");

        const createBtn = document.createElement("button");
        createBtn.classList.add("SP-gradient-maker-icon-btn");
        createBtn.title = "Add Color";
        createBtn.innerHTML = guiIMGS.add;
        createBtn.addEventListener("click", (e) => {
            const draggableSpace = modalStorage.modal.querySelector(`div[class="SP-gradient-maker-draggables"]`);
            draggableSpace.appendChild(createDraggable());
            updateDisplay();
            e.stopPropagation();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("SP-gradient-maker-icon-btn");
        deleteBtn.title = "Delete Color";
        deleteBtn.innerHTML = guiIMGS.delete;
        deleteBtn.addEventListener("click", (e) => {
            const pointer = modalStorage.selectedPointer;
            if (pointer) {
                if (modalStorage.parts.length <= 2) return e.stopPropagation();
                modalStorage.parts.splice(pointer.id, 1);
                pointer.remove();
                
                // Re-index remaining points
                const draggables = modalStorage.modal.querySelector('.SP-gradient-maker-draggables').children;
                Array.from(draggables).forEach((drag, newIdx) => {
                    drag.id = newIdx;
                });
                
                updateDisplay();
                delete modalStorage.selectedPointer;
            }
            e.stopPropagation();
        });

        btnGroup.append(createBtn, deleteBtn);

        const selectContainer = document.createElement("div");
        selectContainer.style.display = "flex";
        selectContainer.style.alignItems = "center";
        selectContainer.style.gap = "0.5rem";

        const title1 = document.createElement("span");
        title1.textContent = "Type:";

        const select = document.createElement("select");
        select.classList.add("SP-gradient-maker-select");
        const option1 = document.createElement("option");
        const option2 = document.createElement("option");
        option1.text = "Linear"; option1.value = "Linear";
        option2.text = "Radial"; option2.value = "Radial";
        select.append(option1, option2);
        select.addEventListener("change", (e) => {
            modalStorage.type = e.target.value;
            updateDisplay();
            e.stopPropagation();
        });

        selectContainer.append(title1, select);

        const dirContainer = document.createElement("div");
        dirContainer.style.display = "flex";
        dirContainer.style.alignItems = "center";
        dirContainer.style.gap = "0.5rem";

        const title2 = document.createElement("span");
        title2.textContent = "Direction:";

        const dirBtn = document.createElement("input");
        dirBtn.classList.add("SP-gradient-maker-input");
        dirBtn.setAttribute("type", "number");
        dirBtn.setAttribute("max", 360);
        dirBtn.setAttribute("min", 0);
        dirBtn.setAttribute("value", 90);
        dirBtn.addEventListener("input", (e) => {
            modalStorage.dir = e.target.value;
            updateDisplay();
            e.stopPropagation();
        });

        dirContainer.append(title2, dirBtn);

        div.append(btnGroup, selectContainer, dirContainer);
    }

    function genButtonTable(div) {
        const cancelBtn = document.createElement("button");
        cancelBtn.id = "cancel";
        cancelBtn.classList.add("SP-gradient-maker-btn");
        cancelBtn.textContent = "Cancel";

        const enterBtn = document.createElement("button");
        enterBtn.id = "enter";
        enterBtn.classList.add("SP-gradient-maker-btn", "primary");
        enterBtn.textContent = "OK";

        div.append(cancelBtn, enterBtn);
    }

    function updateDisplay() {
        const display = modalStorage.modal.querySelector(`div[class="color-display"]`);
        if (display) display.style.background = encodeGradHTML(modalStorage);
    }

    function setupCSS() {
        if (!document.getElementById('SP-gradient-maker-styles')) {
            const style = document.createElement('style');
            style.id = 'SP-gradient-maker-styles';
            style.textContent = `
                .SP-gradient-maker-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 50000;
                    background-color: var(--ui-modal-overlay, rgba(0, 0, 0, 0.6));
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .SP-gradient-maker-modal {
                    width: 450px;
                    background: var(--ui-modal-background, #fff);
                    border: 4px solid var(--ui-white-transparent, rgba(255, 255, 255, 0.25));
                    border-radius: 0.5rem;
                    display: flex;
                    flex-direction: column;
                    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                    color: var(--text-primary, #575e75);
                    overflow: hidden;
                }
                .SP-gradient-maker-header {
                    height: 3.125rem;
                    background-color: var(--looks-secondary, #855cd6);
                    color: var(--ui-modal-header-foreground, white);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 1rem;
                    letter-spacing: 0.4px;
                }
                .SP-gradient-maker-body {
                    padding: 1.5rem 2.25rem;
                    background: var(--ui-modal-background, #fff);
                }
                .SP-gradient-maker-display {
                    width: 100%;
                    height: 50px;
                    border-bottom: none;
                    border-radius: 0.5rem 0.5rem 0 0;
                    box-sizing: border-box;
                    background-color: #fff;
                    background-size: 16px 16px;
                    background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
                }
                .SP-gradient-maker-draggables {
                    width: 100%;
                    height: 40px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    border: 1px solid var(--ui-black-transparent, rgba(0,0,0,0.15));
                    border-top: none;
                    border-radius: 0 0 0.5rem 0.5rem;
                    background: var(--ui-primary, #f9f9f9);
                    box-sizing: border-box;
                    margin-bottom: 1.5rem;
                }
                .SP-gradient-maker-settings {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    font-size: 0.875rem;
                    font-weight: bold;
                }
                .SP-gradient-maker-btn-group {
                    display: flex;
                    gap: 0.5rem;
                }
                .SP-gradient-maker-icon-btn {
                    width: 2rem;
                    height: 2rem;
                    border: 1px solid var(--ui-black-transparent, rgba(0,0,0,0.15));
                    border-radius: 0.25rem;
                    background: var(--ui-white, #fff);
                    color: var(--text-primary, #575e75);
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 0;
                    transition: all 0.15s;
                }
                .SP-gradient-maker-icon-btn:active {
                    transform: scale(0.95);
                }
                .SP-gradient-maker-icon-btn svg {
                    width: 1.25rem;
                    height: 1.25rem;
                }
                .SP-gradient-maker-select, .SP-gradient-maker-input {
                    height: 2rem;
                    border: 1px solid var(--ui-black-transparent, rgba(0,0,0,0.15));
                    border-radius: 2rem;
                    padding: 0 0.75rem;
                    background: var(--input-background, #fff);
                    color: var(--text-primary, #575e75);
                    font-family: inherit;
                    font-size: 0.875rem;
                    font-weight: bold;
                    outline: none;
                    box-sizing: border-box;
                    transition: 0.25s ease-out;
                    appearance: none;
                }
                .SP-gradient-maker-select:hover, .SP-gradient-maker-input:hover {
                    border-color: var(--looks-secondary, #855cd6);
                }
                .SP-gradient-maker-select{
                    padding: 0 1.25rem;
                }
                .SP-gradient-maker-select:focus, .SP-gradient-maker-input:focus {
                    border-color: var(--looks-secondary, #855cd6);
                    box-shadow: 0 0 0 0.25rem var(--looks-transparent, rgba(133, 92, 214, 0.35));
                }
                
                .SP-gradient-maker-input::-webkit-outer-spin-button,
                .SP-gradient-maker-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
                }

                input[type=number].SP-gradient-maker-input {
                -moz-appearance: textfield;
                }

                .SP-gradient-maker-input {
                    width: 4.5rem;
                    text-align: center;
                    padding: 0 0.5rem;
                }
                .SP-gradient-maker-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.5rem;
                }
                .SP-gradient-maker-btn {
                    padding: 0.75rem 1rem;
                    border-radius: 0.25rem;
                    border: 1px solid var(--ui-black-transparent, rgba(0,0,0,0.15));
                    font-weight: 600;
                    font-size: 0.85rem;
                    cursor: pointer;
                    font-family: inherit;
                    background: var(--ui-white, #fff);
                    color: var(--text-primary, #575e75);
                    transition: all 0.15s;
                }
                .SP-gradient-maker-btn:active {
                    transform: scale(0.95);
                }
                .SP-gradient-maker-btn.primary {
                    background: var(--looks-secondary, #855cd6);
                    border-color: var(--looks-secondary, #855cd6);
                    color: white;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /* Main GUI */
    function openGradientMaker() {
        const paint = ReduxStore.getState().scratchPaint;
        const oldCache = modalStorage._gradCache;
        modalStorage = {
            parts: [], type: "Linear", dir: 90,
            selectedPointer: undefined, modal: undefined,
            path: paint.modals.fillColor ? "fillColor" : "strokeColor"
        };

        const container = document.createElement("div");
        container.classList.add("SP-gradient-maker-overlay");

        const modal = document.createElement("div");
        modal.classList.add("SP-gradient-maker-modal");
        modalStorage.modal = modal;

        const title = document.createElement("div");
        title.classList.add("SP-gradient-maker-header");
        title.textContent = "Gradient Maker";

        const body = document.createElement("div");
        body.classList.add("SP-gradient-maker-body");

        const displayContainer = document.createElement("div");
        displayContainer.classList.add("SP-gradient-maker-display");
        
        const display = document.createElement("div");
        display.classList.add("color-display");
        display.style.width = "100%";
        display.style.height = "100%";
        display.style.borderRadius = "inherit";
        displayContainer.appendChild(display);

        const draggables = document.createElement("div");
        draggables.classList.add("SP-gradient-maker-draggables");

        const settings = document.createElement("div");
        settings.classList.add("SP-gradient-maker-settings");
        genSettingsTable(settings);

        const buttons = document.createElement("div");
        buttons.classList.add("SP-gradient-maker-footer");
        genButtonTable(buttons);

        buttons.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (btn) {
                if (btn.id === "enter") setSelected2Grad(modalStorage);
                container.remove();
            }
            e.stopPropagation();
        });

        body.append(displayContainer, draggables, settings, buttons);
        modal.append(title, body);
        container.appendChild(modal);
        document.body.appendChild(container);

        if (paint.selectedItems?.length) decodeSelectedGrad(paint.selectedItems[0], draggables, settings);
        else if (oldCache) decodeFromCache(oldCache.settings, draggables, settings);
        else draggables.append(createDraggable(), createDraggable());
        updateDisplay();

        container.addEventListener("mousedown", (e) => {
            if (e.target === container) container.remove();
            e.stopPropagation();
        });
    }

    function startListenerWorker() {
        let lastMode, lastSelected, lastModals;
        ReduxStore.subscribe(() => {
            const paint = ReduxStore.getState().scratchPaint;
            if (!paint || paint?.format === undefined || paint?.format === null) return;
            const { mode, selectedItems, modals } = paint;

            // no bitmap support :(
            if (paint.format.startsWith("BITMAP")) {
                if (customBtn) {
                    customBtn.remove();
                    customBtn = undefined;
                }
                return;
            }

            // run relative tool events
            if (mode === "FILL") handleFillEvent(paint);
            else if (paperLinkModes.has(mode)) handleShapeModeEvent(mode);

            const idChain = selectedItems.map((e) => e.id).join(".");
            const modalChain = `${modals.fillColor}${modals.strokeColor}`;
            if (mode === lastMode && idChain === lastSelected && modalChain === lastModals) return;
            lastMode = mode;
            lastSelected = idChain;
            lastModals = modalChain;

            // decode potential custom gradients
            if (selectedItems?.length) showSelectedGrad(selectedItems[0]);
            else if (mode === "SELECT" || mode === "RESHAPE") modalStorage._gradCache = undefined;

            // add custom modal
            if (!modals.strokeColor && !modals.fillColor) return;
            if (observerUsed) return;
            const observer = new MutationObserver(() => {
                const gradRow = document.querySelector(`div[class^="color-picker_gradient-picker-row_"]`);
                if (!gradRow || gradRow.lastElementChild.id === customID) return;

                // get the appropriate class names for selected items
                if (!selectedClassName) initGradSelectClasses(gradRow);
                const children = Array.from(gradRow.children);

                customBtn = children[0].cloneNode(true);
                customBtn.src = getButtonURI("select");
                customBtn.id = customID;
                customBtn.setAttribute("class", unselectedClassName);
                gradRow.appendChild(customBtn);

                gradRow.addEventListener("click", (e) => {
                    if (e.target === customBtn) {
                        for (const child of children) child.setAttribute("class", unselectedClassName);
                        customBtn.setAttribute("class", selectedClassName);
                        openGradientMaker();
                    } else if (e.target.nodeName === "IMG") {
                        modalStorage._gradCache = undefined;
                        customBtn.setAttribute("class", unselectedClassName);
                    }
                });

                observerUsed = false;
                observer.disconnect();
            });

            observer.observe(document.body, { childList: true, subtree: true });
            observerUsed = true;
        });
    }

    setupCSS();
    if (typeof scaffolding === "undefined") startListenerWorker();
}