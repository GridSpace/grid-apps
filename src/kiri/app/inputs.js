/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * UI component factory system.
 * Creates form elements, dialogs, and manages UI state/visibility.
 * Supports mode-specific visibility, unit conversion, and hierarchical grouping.
 */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';

let DOC = self.document,
    /** Callback for input changes */
    inputAction = null,
    /** Previous addTo value for nesting */
    lastAddTo = null,
    /** Current group array */
    lastGroup = null,
    /** Last created div container */
    lastDiv = null,
    /** Current container to add elements to */
    addTo = null,
    /** Alternative binding target for input actions */
    bindTo = null,
    /** Map of group name to array of elements */
    groups = {},
    /** Sticky state prevents auto-hide on blur */
    groupSticky = false,
    /** Current group name */
    groupName = undefined,
    /** Collapsible group headers (clickable label) */
    heads = {},
    /** Hidden groups by name */
    hidden = {},
    /** Elements with mode visibility rules */
    hasModes = [],
    /** Elements with unit conversion setters */
    setters = [],
    /** Last mode set for visibility filtering */
    lastMode = null,
    /** Last expert mode state */
    lastExpert = true,
    /** Prefix for element IDs */
    prefix = "tab",
    /** Unit scale multiplier for conversions */
    units = 1,
    /** Last changed input element */
    lastChange = null,
    /** Last clicked button */
    lastBtn = null,
    /** Last clicked text element */
    lastTxt = null,
    /** Last shown popup */
    lastPop = null;

/**
 * UI component factory and utilities.
 * Provides chainable builder pattern and component creation functions.
 */
export const UI = {
    prefix: function(pre) { prefix = pre; return UI },
    inputAction: function(fn) { inputAction = fn; return UI },
    lastChange: function() { return lastChange },
    checkpoint,
    restore,
    refresh,
    setHidden,
    setMode,
    bound,
    toInt,
    toFloat,
    toFloatArray,
    toDegsFloat,
    isSticky,
    setSticky,
    newBoolean,
    newButton,
    newBlank,
    newDiv,
    newElement,
    newExpand,
    endExpand,
    newGCode,
    newGroup,
    newLabel,
    newInput,
    newValue,
    newRange,
    newRow,
    newSelect,
    newText,
    setGroup,
    addUnits,
    setUnits,
    confirm,
    prompt,
    alert,
    onBlur,
    setEnabled(el, bool) {
        if (bool) {
            el.removeAttribute('disabled');
        } else {
            el.setAttribute('disabled','');
        }
    },
    setVisible(el, bool) {
        UI.setClass(el, 'hide', !bool);
    },
    setClass(el, clazz, bool) {
        if (bool) {
            el.classList.add(clazz);
        } else {
            el.classList.remove(clazz);
        }
    }
};

/**
 * Set hidden group map and refresh visibility.
 * @param {object} map - Map of group name to hidden boolean
 */
function setHidden(map) {
    hidden = map;
    refresh();
    for (let ctrl of Object.values(heads)) {
        ctrl.update();
    }
}

/**
 * Attach blur event listener to element(s).
 * @param {HTMLElement|Array<HTMLElement>} obj - Element or array of elements
 * @param {function} fn - Blur handler function
 */
function onBlur(obj, fn) {
    if (Array.isArray(obj)) {
        for (let o of obj) onBlur(o, fn);
        return;
    }
    obj.addEventListener('blur', fn);
}

/**
 * Show alert dialog with OK button.
 * @param {string} message - Alert message
 * @returns {Promise<boolean>} Resolves when OK clicked
 */
function alert(message) {
    return confirm(message, {ok:true});
}

/**
 * Show prompt dialog with text input.
 * @param {string} message - Prompt message
 * @param {string} value - Default input value
 * @returns {Promise<string>} Resolves with entered text or undefined if cancelled
 */
function prompt(message, value) {
    return confirm(message, {ok:true, cancel:undefined}, value);
}

/**
 * Show modal dialog with custom buttons and optional input.
 * Blocks keyboard events while open.
 * @param {string} message - Dialog message
 * @param {object} buttons - Button labels mapped to return values (e.g., {yes: true, no: false})
 * @param {string|Array<string>} [input] - Optional input field. Array creates textarea with lines.
 * @param {object} [opt={}] - Options: {pre, post} for additional HTML content
 * @returns {Promise} Resolves with button value or input value if provided
 */
function confirm(message, buttons, input, opt = {}) {
    return new Promise((resolve, reject) => {
        let { feature } = api;
        let onkey_save = feature.on_key;
        feature.on_key = key => {
            // console.log({ eat_key: key });
            return true;
        };
        let dialog = $('dialog');
        let btns = buttons || {
            "yes": true,
            "no": false
        };
        let rnd = Date.now().toString(36);
        let html = [
            `<div class="confirm f-col a-stretch" style="padding:5px !important">`
        ];
        if (message) {
            html.push(`<label style="user-select:text">${message}</label>`);
        }
        if (opt.pre) {
            html = opt.pre.appendAll(html);
        }
        let iid;
        if (Array.isArray(input)) {
            iid = `confirm-input-${rnd}`;
            html.append(`<div><textarea rows="15" cols="40" class="grow" type="text" spellcheck="false" id="${iid}"></textarea></div>`);
        } else if (input !== undefined) {
            iid = `confirm-input-${rnd}`;
            html.append(`<div><input class="grow" type="text" spellcheck="false" id="${iid}"/></div>`);
        }
        html.append(`<div class="f-row j-end">`);
        Object.entries(btns).forEach((row,i) => {
            html.append(`<button id="confirm-${i}-${rnd}">${row[0]}</button>`);
        });
        html.append(`</div></div>`);
        if (opt.post) {
            html.appendAll(opt.post);
        }
        dialog.innerHTML = html.join('');
        function done(value) {
            dialog.close();
            feature.on_key = onkey_save;
            if (value !== undefined) {
                setTimeout(() => { resolve(value) }, 150);
            }
        }
        if (iid) {
            let array = Array.isArray(input);
            iid = $(iid);
            iid.value = array ? input.join('\n') : input;
            if (!array)
            iid.onkeypress = (ev) => {
                if (ev.key === 'Enter' || ev.charCode === 13) {
                    done(ev.target.value);
                }
            };
        }
        Object.entries(btns).forEach((row,i) => {
            $(`confirm-${i}-${rnd}`).onclick = (ev) => {
                let value = iid && row[1] ? iid.value : row[1];
                ev.preventDefault();
                ev.stopPropagation();
                done(value);
            }
        });
        setTimeout(() => {
            dialog.showModal();
            if (iid) {
                iid.focus();
                iid.selectionStart = 0;
                iid.selectionEnd = iid.value.length;
            }
        }, 150);
    });
}

function refresh() {
    setMode(lastMode);
    setters.forEach(input => {
        if (input.setv) {
            input.setv(input.real);
        }
    });
}

function setMode(mode) {
    lastMode = mode;
    hasModes.forEach(div => div.setMode(mode));
}

function checkpoint(at) {
    return { addTo: at || addTo, lastDiv: at || lastDiv, lastGroup, groupName };
}

function restore(opt = {}) {
    addTo = opt.addTo || addTo;
    bindTo = opt.bindTo || null;
    lastDiv = opt.lastDiv || lastDiv;
    lastGroup = opt.lastGroup || lastGroup;
    groupName = opt.groupName || groupName;
}

// at present only used by the layers popup menu
function setGroup(div) {
    addTo = lastDiv = div;
    groupName = undefined;
    lastGroup = [];
    return div;
}

function newElement(type, opt = {}) {
    let el = DOC.createElement(type);
    if (opt.id) {
        el.setAttribute("id", opt.id);
    }
    if (opt.class) {
        for (let cl of opt.class.split(' ')) {
            el.classList.add(cl);
        }
    }
    if (opt.attr) {
        for (let [key, val] of Object.entries(opt.attr)) {
            el.setAttribute(key, val);
        }
    }
    return el;
}

function newGroup(label, div, opt = {}) {
    lastDiv = div = (div || lastDiv);

    let group = opt.group || label,
        row = DOC.createElement('div'),
        dbkey = `beta-${prefix}-show-${group}`,
        link;

    if (opt.class) {
        opt.class.split(' ').forEach(ce => {
            row.classList.add(ce);
        });
    } else {
        row.setAttribute("class", "set-header");
    }

    if (div && opt.driven) {
        addModeControls(div, opt);
    }

    addTo = lastDiv;

    div.appendChild(row);
    if (label) {
        link = DOC.createElement('a');
        link.appendChild(DOC.createTextNode(label));
        row.appendChild(link);
    }

    addModeControls(row, opt);
    lastGroup = groups[group] = [];
    lastGroup.key = dbkey;
    groupName = group;

    if (opt.hideable) {
        let pad = DOC.createElement('i');
        let arr = DOC.createElement('span');
        pad.setAttribute('class','grow');
        row.appendChild(pad);
        row.appendChild(arr);
        const ctrl = heads[group] = {
            row,
            arr,
            update() {
                if (!hidden[group]) {
                    arr.innerHTML = '<i class="fa-solid fa-caret-down"></i>';
                    row.classList.add('hidden');
                } else {
                    arr.innerHTML = '<i class="fa-solid fa-caret-up"></i>';
                    row.classList.remove('hidden');
                }
            }
        };
        row.onclick = () => {
            hidden[group] = !hidden[group];
            refresh();
            ctrl.update();
        };
    }

    return row;
}

function addCollapsableElement(parent, options = {}) {
    let row = newDiv(options);
    if (parent) parent.appendChild(row);
    if (lastGroup) lastGroup.push(row);
    return row;
}

/**
 * Create a value bounding function.
 * @param {number} low - Minimum value
 * @param {number} high - Maximum value
 * @returns {function} Function that clamps value to [low, high] range
 */
function bound(low,high) {
    return function(v) {
        if (isNaN(v)) return low;
        return v < low ? low : v > high ? high : v;
    };
}

/**
 * Convert input value to integer.
 * Bound to input element as `this`. Applies bounds and unit conversion if configured.
 * @returns {number} Integer value
 */
function toInt() {
    let nv = this.value !== '' ? parseInt(this.value) : null;
    if (isNaN(nv)) nv = 0;
    if (nv !== null && this.bound) nv = this.bound(nv);
    this.value = nv;
    if (this.setv) {
        return this.real = Math.round(nv * units);
    };
    return nv;
}

/**
 * Convert input value to float.
 * Bound to input element as `this`. Applies bounds and unit conversion if configured.
 * @returns {number} Float value
 */
function toFloat() {
    let nv = this.value !== '' ? parseFloat(this.value) : null;
    if (nv !== null && this.bound) nv = this.bound(nv);
    this.value = nv;
    if (this.setv) {
        return this.setv(nv * units);
    }
    return nv;
}

/**
 * Convert comma-separated input to float array.
 * Bound to input element as `this`. Applies bounds to each value.
 * @returns {Array<number>} Float array
 */
function toFloatArray() {
    let nv = this.value !== '' ? this.value.split(',').map(v => parseFloat(v)) : null;
    console.log({ toFloatArray: nv });
    if (this.bound) nv = nv.map(v => this.bound(v));
    this.array = nv;
    return nv;
}

/**
 * Convert input value to degrees float (0-360).
 * Bound to input element as `this`. Normalizes to 0-359.99 range.
 * @returns {number} Degrees float
 */
function toDegsFloat(){
    let nv = this.value !== '' ? parseFloat(this.value) : null;
    if (nv !== null && this.bound) nv = this.bound(nv);
    nv = (nv+360)% 360; // bound the val to 0-359.99
    this.value = nv;
    if (this.setv) {
        return this.setv(nv);
    }
    return nv;
}

function raw() {
    return this.value !== '' ? this.value : null;
}

function setUnits(v) {
    if (v !== units) {
        units = v;
        refresh();
    }
}

function newLabel(text, opt = {}) {
    let label = DOC.createElement('label');
    label.appendChild(DOC.createTextNode(text));
    label.setAttribute("class", "noselect");
    if (opt.class) opt.class.split(' ').forEach(cl => {
        label.classList.add(cl);
    })
    return label;
}

/**
 * Create a read-only value display element.
 * @param {number} [size=6] - Input size attribute
 * @param {object} [opt={}] - Options: {class}
 * @returns {HTMLInputElement} Read-only input element
 */
function newValue(size = 6, opt = {}) {
    let value = DOC.createElement('input');
    value.setAttribute("size", size);
    value.setAttribute("readonly", '');
    value.setAttribute("class", "nooutline noselect");
    if (opt.class) opt.class.split(' ').forEach(cl => {
        value.classList.add(cl);
    })
    return value;
}

function addId(el, opt = {}) {
    if (opt.id) {
        el.setAttribute("id", opt.id);
    }
}

function safecall(fn) {
    try {
        return fn();
    } catch (e) {
        // console.log({ safecall_error: e });
        return false;
    }
}

function addModeControls(el, opt = {}) {
    el.__opt = opt;
    el.showMe = function() {
        if (opt.trace) console.log({ showMe: el });
        el.classList.remove('hide');
    };
    el.hideMe = function() {
        if (opt.trace) console.log({ hideMe: el });
        el.classList.add('hide');
    };
    el.setVisible = function(show) {
        if (opt.trace) console.log({ setVisible: show });
        if (show) el.showMe();
        else el.hideMe();
    };
    el.setMode = function(mode) {
        let hidn = hidden[el._group] === true;
        let xprt = opt.expert === undefined || (opt.expert === lastExpert);
        let show = opt.show ? safecall(opt.show) : true;
        let disp = opt.visible ? opt.visible() : true;
        let hmod = el.hasMode(mode);
        if (opt.trace) console.log({ setMode: mode, xprt, show, disp, hmod, modes:el.modes });
        if (opt.manual) return;
        el.setVisible(!hidn && hmod && show && xprt && disp);
    }
    el.hasMode = function(mode) {
        return (el.modes.length === 0) ||
            (el.modes.contains && el.modes.contains(mode)) ||
            (el.modes === mode);
    }
    el.modes = opt.modes || [];
    hasModes.push(el);
}

function newDiv(opt = {}) {
    let div = DOC.createElement(opt.tag || 'div');
    addModeControls(div, opt);
    (opt.addto || addTo).appendChild(div);
    if (opt.addto) lastDiv = addTo = div;
    if (opt.class) div.setAttribute('class', opt.class);
    if (opt.content) div.innerHTML = opt.content;
    if (opt.group !== false) {
        lastGroup?.push(div);
        div._group = groupName;
    } else {
        lastGroup = undefined;
        groupName = undefined;
    }
    return div;
}

/**
 * Create a collapsible details/summary element.
 * Changes addTo context to the details element until endExpand() called.
 * @param {string} label - Summary label text
 * @param {object} [opt={}] - Options: {class, open, modes, show, etc.}
 * @returns {HTMLElement} Details element with collapse() method
 */
function newExpand(label, opt = {}) {
    let div = DOC.createElement('details');
    div.setAttribute('class', opt.class || 'f-col');
    if (opt.open) div.setAttribute('open', true);
    addModeControls(div, opt);

    let summary = DOC.createElement('summary');
    summary.setAttribute('class', opt.class || 'var-row');
    summary.innerHTML = `<label>${label}</label>`;

    div.appendChild( summary );
    div.collapse = () => {
        div.removeAttribute('open');
    };

    lastAddTo = addTo;
    addTo.appendChild(div);
    addTo = div;

    return div;
}

/**
 * End expand context, restoring previous addTo.
 * @returns {HTMLElement} Restored addTo element
 */
function endExpand() {
    addTo = lastAddTo;
    return addTo;
}

function isSticky() {
    return groupSticky;
}

function setSticky(bool) {
    groupSticky = bool;
}

function newGCode(label, options) {
    let opt = options || {},
        btn = DOC.createElement("button"),
        txt = DOC.createElement("textarea"),
        area = opt.area;

    txt.setAttribute("wrap", "off");
    txt.setAttribute("spellcheck", "false");
    txt.setAttribute("style", "resize: none");
    txt.onblur = bindTo || inputAction;
    txt.button = btn;

    btn.setAttribute("class", "basis-50");
    btn.appendChild(DOC.createTextNode(label));
    btn.setAttribute("title", opt.title || undefined);
    btn.onclick = function(ev) {
        ev.stopPropagation();
        if (ev.target === txt) {
            // drop clicks on TextArea
            ev.target.focus();
        } else {
            let fc = area.firstChild;
            if (fc) area.removeChild(fc);
            area.appendChild(txt);
            txt.scrollTop = 0;
            txt.scrollLeft = 0;
            txt.selectionEnd = 0;
            let rows = txt.value.split('\n');
            let cols = 0;
            rows.forEach(row => {
                cols = Math.max(cols, row.length);
            });
            let showing = btn === lastBtn;
            if (lastTxt) {
                lastTxt.classList.remove('txt-sel');
            }
            if (lastBtn) {
                lastBtn.classList.remove('btn-sel');
            }
            if (!showing) {
                btn.classList.add('btn-sel');
                lastTxt = btn;
                lastBtn = btn;
                txt.focus();
            } else {
                inputAction();
            }
        }
    };

    addModeControls(btn, opt);

    return txt;
}

function newText(label, options) {
    let opt = options || {},
        inline = opt.row,
        row = inline ? lastDiv : newDiv(options),
        btn = DOC.createElement("button"),
        pop = DOC.createElement("div"),
        txt = DOC.createElement("textarea"),
        area = opt.area;

    txt.setAttribute("wrap", "off");
    txt.setAttribute("spellcheck", "false");
    txt.setAttribute("style", "resize: none");
    txt.onblur = inputAction;

    btn.appendChild(DOC.createTextNode(inline ? label : "edit"));

    btn.onclick = function(ev) {
        ev.stopPropagation();
        if (ev.target === txt) {
            // drop clicks on TextArea
            ev.target.focus();
        } else {
            let fc = area.firstChild;
            if (fc) area.removeChild(fc);
            area.appendChild(txt);
            // first time, button click / show
            btn.parentNode.onclick = btn.onclick;
            txt.scrollTop = 0;
            txt.scrollLeft = 0;
            txt.selectionEnd = 0;
            let rows = txt.value.split('\n');
            let cols = 0;
            rows.forEach(row => {
                cols = Math.max(cols, row.length);
            });

            let showing = pop === lastPop;
            if (lastBtn) {
                lastBtn.classList.remove('btn-sel');
            }
            if (lastTxt) {
                lastTxt.classList.remove('txt-sel');
            }
            if (!showing) {
                row.classList.add('txt-sel');
                pop.style.display = "flex";
                lastPop = pop;
                lastTxt = row;
                txt.focus();
            } else {
                inputAction();
            }
        }
    };
    addModeControls(btn, opt);
    addId(btn, opt);

    if (!inline) {
        row.appendChild(newLabel(label));
        row.setAttribute("class", "var-row");
    }
    row.appendChild(btn);
    if (opt.title) row.setAttribute("title", options.title);
    if (row.setVisible) {
        btn.setVisible = row.setVisible;
    }

    return txt;
}

/**
 * Create a labeled input field with automatic validation and unit conversion.
 * Supports text input or textarea (if height > 1).
 * Filters non-numeric keys unless opt.text=true.
 * Triggers action on blur.
 * @param {string} label - Input label text
 * @param {object} [opt={}] - Options: {size, height, action, convert, bound, units, round, text, comma, disabled, title, id, trigger, hide}
 * @returns {HTMLInputElement|HTMLTextAreaElement} Input element with setVisible() method
 */
function newInput(label, opt = {}) {
    let row = newDiv(opt),
        hide = opt.hide,
        size = opt.size ?? 5,
        height = opt.height || 0,
        action = opt.action || bindTo || inputAction,
        ip = height > 1 ? DOC.createElement('textarea') : DOC.createElement('input');

    row.appendChild(newLabel(label));
    row.appendChild(ip);
    row.setAttribute("class", opt.class || "var-row");
    if (height > 1) {
        ip.setAttribute("cols", size);
        ip.setAttribute("rows", height);
        ip.setAttribute("wrap", "off");
    } else {
        if (Number.isInteger(size)) {
            ip.setAttribute("size", size);
        } else {
            ip.setAttribute("style", `width:${size}`);
        }
    }
    ip.setAttribute("type", "text");
    ip.setAttribute("spellcheck", "false");
    row.style.display = hide ? 'none' : '';
    if (opt.disabled) ip.setAttribute("disabled", "true");
    if (opt.title) row.setAttribute("title", opt.title);
    if (opt.id) ip.setAttribute("id", opt.id);
    if (opt.convert) ip.convert = opt.convert.bind(ip);
    if (opt.bound) ip.bound = opt.bound;
    if (opt.action) action = opt.action;
    ip.addEventListener('focus', function(event) {
        setSticky(true);
    });
    if (action) {
        ip.addEventListener('keydown', function(event) {
            let key = event.key;
            if (
                opt.text ||
                (key >= '0' && key <= '9') ||
                key === '.' ||
                key === '-' ||
                key === 'Backspace' ||
                key === 'Delete' ||
                key === 'ArrowLeft' ||
                key === 'ArrowRight' ||
                key === 'Tab' ||
                event.metaKey ||
                event.ctrlKey ||
                (key === ',' && options.comma)
            ) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
        });
        ip.addEventListener('keyup', function(event) {
            if (event.keyCode === 13) {
                ip.blur();
            }
        });
        ip.addEventListener('blur', function(event) {
            setSticky(false);
            lastChange = ip;
            action(event);
            if (opt.trigger) {
                refresh(opt.trigger === 1 || opt.trigger === true);
            }
        });
        if (opt.units) {
            addUnits(ip, opt.round || 3);
        }
    }
    if (!ip.convert) ip.convert = raw.bind(ip);
    ip.setVisible = row.setVisible;

    return ip;
}

function addUnits(input, round) {
    setters.push(input);
    input.setv = function(value) {
        if (typeof(value) === 'number') {
            input.real = value;
            input.value = (value / units).round(round);
        } else {
            input.value = value;
        }
        // console.log({ value }, input.real, input.value );
        return input.real;
    };
    return input;
}

/**
 * Create a labeled range slider.
 * @param {string} label - Slider label text
 * @param {object} options - Options: {min, max, hide, title, action, modes, etc.}
 * @returns {HTMLInputElement} Range input with setVisible() method
 */
function newRange(label, options) {
    let row = newDiv(options),
        ip = DOC.createElement('input'),
        hide = options && options.hide,
        action = bindTo || inputAction;

    if (label) row.appendChild(newLabel(label));
    row.appendChild(ip);
    row.setAttribute("class", "var-row");
    ip.setAttribute("type", "range");
    ip.setAttribute("min", (options && options.min ? options.min : 0));
    ip.setAttribute("max", (options && options.max ? options.max : 100));
    ip.setAttribute("value", 0);
    row.style.display = hide ? 'none' : '';
    if (options) {
        if (options.title) {
            ip.setAttribute("title", options.title);
            row.setAttribute("title", options.title);
        }
        if (options.action) action = options.action;
    }
    ip.setVisible = row.setVisible;

    return ip;
}

/**
 * Create a labeled select dropdown.
 * Triggers action on change.
 * @param {string} label - Select label text
 * @param {object} [options={}] - Options: {hide, id, convert, disabled, title, action, trigger, post, modes, etc.}
 * @param {Array|string} source - Option source array or source attribute value
 * @returns {HTMLSelectElement} Select element with setVisible() method
 */
function newSelect(label, options = {}, source) {
    let row = newDiv(options),
        ip = DOC.createElement('select'),
        hide = options && options.hide,
        action = bindTo || inputAction;

    row.appendChild(newLabel(label));
    row.appendChild(ip);
    if (Array.isArray(source)) {
        ip._source = source;
    } else {
        row.setAttribute("source", source || "tools");
    }
    row.setAttribute("class", "var-row");
    row.style.display = hide ? 'none' : '';
    if (options.id) ip.setAttribute("id", options.id);
    if (options.convert) ip.convert = options.convert.bind(ip);
    if (options.disabled) ip.setAttribute("disabled", "true");
    if (options.title) row.setAttribute("title", options.title);
    if (options.action) action = options.action;
    ip.setVisible = row.setVisible;
    ip.onchange = function(ev) {
        lastChange = ip;
        action();
        if (options.trigger) {
            refresh();
        }
        if (options.post) {
            options.post();
        }
    };
    ip.onclick = (ev) => {
        groupSticky = true;
    };
    // because firefox
    ip.onmouseenter = (ev) => {
        groupSticky = true;
    };

    return ip;
}

/**
 * Create a labeled checkbox.
 * Triggers action on click.
 * @param {string} label - Checkbox label text
 * @param {function} [action=bindTo] - Click handler function
 * @param {object} [opt={}] - Options: {hide, disabled, title, trigger, modes, etc.}
 * @returns {HTMLInputElement} Checkbox element with setVisible() method
 */
function newBoolean(label, action = bindTo, opt = {}) {
    let row = newDiv(opt),
        ip = DOC.createElement('input'),
        hide = opt.hide;

    if (label) {
        row.appendChild(newLabel(label));
    }
    row.appendChild(ip);
    row.setAttribute("class", "var-row");
    row.style.display = hide ? 'none' : '';
    ip.setAttribute("type", "checkbox");
    ip.checked = false;
    if (opt.disabled) {
        ip.setAttribute("disabled", "true");
    }
    if (opt.title) {
        ip.setAttribute("title", opt.title);
        row.setAttribute("title", opt.title);
    }
    if (action) {
        ip.onclick = function(ev) {
            action(ip);
            if (opt.trigger) {
                refresh();
            }
        };
    }
    ip.setVisible = row.setVisible;

    return ip;
}

function newBlank(options) {
    let opt = options || {},
        row = newDiv(opt),
        hide = opt.hide;

    row.isBlank = true;
    row.style.display = hide ? 'none' : '';

    if (!opt.driven) {
        row.setAttribute("class", "var-row");
    }

    if (opt.class) {
        opt.class.split(' ').forEach(ce => {
            row.classList.add(ce);
        });
    }

    return row;
}

/**
 * Create a button element.
 * Unlike other elements, does not auto-add to a row.
 * Action can be a function or event name string.
 * @param {string} label - Button label text
 * @param {function|string} action - Click handler or event name to emit
 * @param {object} [opt={}] - Options: {class, icon, title, id, modes, etc.}
 * @returns {HTMLButtonElement} Button element with mode visibility
 */
function newButton(label, action, opt = {}) {
    let b = DOC.createElement('button');

    b.onclick = function() {
        switch (typeof action) {
            case "string":
                api.event.emit(action);
                break;
            case "function":
                action(...arguments);
                break;
        }
    };

    if (opt.class) {
        opt.class.split(' ').forEach(ce => {
            b.classList.add(ce);
        });
    }
    if (opt.icon) {
        let d = DOC.createElement('div');
        d.innerHTML = opt.icon;
        b.appendChild(d);
    }
    if (opt.title) {
        b.setAttribute('title', opt.title);
    }
    if (label) {
        b.appendChild(DOC.createTextNode(label));
    }

    addModeControls(b, opt);
    addId(b, opt);

    return b;
}

/**
 * Create a row container with child elements.
 * @param {Array<HTMLElement>} children - Child elements to append
 * @param {object} options - Options: {class, noadd, modes, etc.}
 * @returns {HTMLElement} Row element
 */
function newRow(children, options) {
    let row = addCollapsableElement((options && options.noadd) ? null : addTo);
    if (children) children.forEach(function (c) { row.appendChild(c) });
    addModeControls(row, options);
    if (options && options.class) {
        options.class.split(' ').forEach(ce => {
            row.classList.add(ce);
        });
    }
    return row;
}
