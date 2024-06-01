/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// use: kiri.init
// use: kiri.main
gapp.register("kiri.ui", [], (root, exports) => {

    const { kiri } = root;

    let DOC = self.document,
        inputAction = null,
        lastGroup = null,
        lastDiv = null,
        addTo = null,
        bindTo = null,
        groups = {},
        groupSticky = false,
        groupName = undefined,
        hasModes = [],
        isExpert = [],
        setters = [],
        lastMode = null,
        lastExpert = true,
        letHoverPop = true,
        prefix = "tab",
        units = 1,
        lastChange = null,
        lastBtn = null,
        lastTxt = null,
        lastPop = null,
        savePop = null;

    self.$ = (self.$ || function (id) { return DOC.getElementById(id) } );

    kiri.ui = {
        prefix: function(pre) { prefix = pre; return kiri.ui },
        inputAction: function(fn) { inputAction = fn; return kiri.ui },
        lastChange: function() { return lastChange },
        checkpoint,
        restore,
        refresh,
        setMode,
        setExpert,
        setHoverPop,
        hidePoppers,
        hoverPop,
        bound,
        toInt,
        toFloat,
        hidePop,
        isPopped,
        isSticky,
        setSticky,
        newElement,
        newBoolean,
        newButton,
        newBlank,
        newGCode,
        newGroup,
        newLabel,
        newInput,
        newInput2,
        newRange,
        newRow,
        newSelect,
        newTable,
        newTableRow,
        newText,
        setGroup,
        addUnits,
        setUnits,
        confirm,
        prompt,
        alert,
        onBlur,
        setVisible(el, bool) {
            kiri.ui.setClass(el, 'hide', !bool);
        },
        setClass(el, clazz, bool) {
            if (bool) {
                el.classList.add(clazz);
            } else {
                el.classList.remove(clazz);
            }
        }
    };

    function onBlur(obj, fn) {
        if (Array.isArray(obj)) {
            for (let o of obj) onBlur(o, fn);
            return;
        }
        obj.addEventListener('blur', fn);
    }

    function alert(message) {
        return confirm(message, {ok:true});
    }

    function prompt(message, value) {
        return confirm(message, {ok:true, cancel:false}, value);
    }

    function confirm(message, buttons, input, opt = {}) {
        return new Promise((resolve, reject) => {
            let btns = buttons || {
                "yes": true,
                "no": false
            };
            let rnd = Date.now().toString(36);
            let any = $('mod-any');
            let html = [
                `<div class="confirm f-col a-stretch">`
            ];
            if (message) {
                html.push(`<label style="user-select:text">${message}</label>`);
            }
            if (opt.pre) {
                html = opt.pre.appendAll(html);
            }
            let iid;
            if (input !== undefined) {
                iid = `confirm-input-${rnd}`;
                html.append(`<div><input class="grow" type="text" spellcheck="false" value="${input}" id="${iid}"/></div>`);
            }
            html.append(`<div class="f-row j-end">`);
            Object.entries(btns).forEach((row,i) => {
                html.append(`<button id="confirm-${i}-${rnd}">${row[0]}</button>`);
            });
            html.append(`</div></div>`);
            if (opt.post) {
                html.appendAll(opt.post);
            }
            $('mod-any').innerHTML = html.join('');
            function done(value) {
                kiri.api.modal.hide();
                setTimeout(() => { resolve(value) }, 150);
            }
            if (iid) {
                iid = $(iid);
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
                kiri.api.modal.show('any');
                if (iid) {
                    iid.focus();
                    iid.selectionStart = iid.value.length;
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
        hidePoppers();
    }

    function setExpert(bool) {
        // lastExpert = bool;
        // setMode(lastMode);
    }

    function setHoverPop(bool) {
        // letHoverPop = bool;
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

        return row;
    }

    function addCollapsableElement(parent) {
        let row = newDiv();
        if (parent) parent.appendChild(row);
        if (lastGroup) lastGroup.push(row);
        return row;
    }

    function hidePoppers() {
        // showGroup(undefined);
    }

    function bound(low,high) {
        return function(v) {
            if (isNaN(v)) return low;
            return v < low ? low : v > high ? high : v;
        };
    }

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

    function toFloat() {
        let nv = this.value !== '' ? parseFloat(this.value) : null;
        if (nv !== null && this.bound) nv = this.bound(nv);
        if (this.setv) {
            return this.setv(nv * units);
        } else {
            this.value = nv;
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

    function addId(el, opt = {}) {
        if (opt.id) {
            el.setAttribute("id", opt.id);
        }
    }

    function safecall(fn) {
        try {
            return fn();
        } catch (e) {
            return true;
        }
    }

    function addModeControls(el, opt = {}) {
        el.__opt = opt;
        el.showMe = function() {
            el.classList.remove('hide');
        };
        el.hideMe = function() {
            el.classList.add('hide');
        };
        el.setVisible = function(show) {
            if (show) el.showMe();
            else el.hideMe();
        };
        el.setMode = function(mode) {
            let xprt = opt.expert === undefined || (opt.expert === lastExpert);
            let show = opt.show ? safecall(opt.show) : true;
            let disp = opt.visible ? opt.visible() : true;
            if (opt.manual) return;
            el.setVisible(el.hasMode(mode) && show && xprt && disp);
        }
        el.hasMode = function(mode) {
            return el.modes.length === 0 || el.modes.contains(mode);
        }
        el.modes = opt.modes || [];
        hasModes.push(el);
    }

    function newDiv(opt = {}) {
        let div = DOC.createElement('div');
        addModeControls(div, opt);
        addTo.appendChild(div);
        lastGroup.push(div);
        div._group = groupName;
        return div;
    }

    function hidePop() {
        if (lastPop) {
            lastPop.style.display = "none";
        }
        if (savePop) {
            savePop();
            savePop = null;
        }
        lastPop = null;
    }

    function isPopped() {
        return lastPop !== null;
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

        btn.setAttribute("class", "basis-50");
        btn.appendChild(DOC.createTextNode(label));

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
                txt.setAttribute("cols", Math.max(30, cols + 1));

                let showing = btn === lastBtn;
                hidePop();
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
        if (opt.title) {
            btn.setAttribute("title", options.title);
        }
        txt.button = btn;

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
                txt.setAttribute("cols", Math.max(30, cols + 1));

                let showing = pop === lastPop;
                hidePop();
                if (lastBtn) {
                    lastBtn.classList.remove('btn-sel');
                }
                if (lastTxt) {
                    lastTxt.classList.remove('txt-sel');
                }
                if (!showing) {
                    row.classList.add('txt-sel');
                    savePop = inputAction;
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

    function newInput(label, opt = {}) {
        let row = newDiv(opt),
            hide = opt.hide,
            size = opt.size || 5,
            height = opt.height || 0,
            ip = height > 1 ? DOC.createElement('textarea') : DOC.createElement('input'),
            action = opt.action || bindTo || inputAction;

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
        if (opt.convert) ip.convert = opt.convert.bind(ip);
        if (opt.bound) ip.bound = opt.bound;
        if (opt.action) action = opt.action;
        ip.addEventListener('focus', function(event) {
            hidePop();
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
                    refresh(opt.trigger === 1);
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

    function newInput2(opt = {}) {
        let hide = opt.hide,
            size = opt.size || 5,
            height = opt.height || 0,
            ip = height > 1 ? DOC.createElement('textarea') : DOC.createElement('input'),
            action = opt.action || bindTo || inputAction;

        ip.setAttribute("class", "var-input");
        if (Number.isInteger(size)) {
            ip.setAttribute("size", size);
        } else {
            ip.setAttribute("style", `width:${size}`);
        }
        ip.setAttribute("type", "text");
        ip.setAttribute("spellcheck", "false");
        if (opt.disabled) ip.setAttribute("disabled", "true");
        if (opt.title) ip.setAttribute("title", opt.title);
        if (opt.convert) ip.convert = opt.convert.bind(ip);
        if (opt.bound) ip.bound = opt.bound;
        if (opt.action) action = opt.action;
        ip.addEventListener('focus', function(event) {
            hidePop();
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
                    (key === ',' && opt.comma)
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
                    refresh();
                }
            });
            if (opt.units) {
                addUnits(ip, opt.round || 3);
            }
        }
        if (!ip.convert) ip.convert = raw.bind(ip);

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
            return input.real;
        };
        return input;
    }

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

    function newSelect(label, options, source) {
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
        if (options) {
            if (options.convert) ip.convert = options.convert.bind(ip);
            if (options.disabled) ip.setAttribute("disabled", "true");
            if (options.title) row.setAttribute("title", options.title);
            if (options.action) action = options.action;
        }
        ip.setVisible = row.setVisible;
        ip.onchange = function(ev) {
            lastChange = ip;
            action();
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

    // unlike other elements, does not auto-add to a row
    function newButton(label, action, opt = {}) {
        let b = DOC.createElement('button');

        b.onclick = function() {
            hidePoppers();
            if (action) action(...arguments);
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

    function newRowTable(array) {
        let div = newDiv();
        div.setAttribute("class", "table-row");
        array.forEach(function(c) {
            div.appendChild(c);
        });
        return div;
    }

    function newTableRow(arrayOfArrays, options) {
        return newRow(newTable(arrayOfArrays), options);
    }

    function newTable(arrayOfArrays) {
        let array = [];
        for (let i=0; i<arrayOfArrays.length; i++) {
            array.push(newRowTable(arrayOfArrays[i]));
        }
        return array;
    }

    function hoverPop(el, opt = {}) {
        if (Array.isArray(el)) {
            opt.group = [];
            return el.forEach(ev => hoverPop(ev, opt));
        }
        let group = opt.group || [];
        let closes = opt.closes || group;
        let target = opt.target || el;
        let mobile = false;
        let popped = false;
        group.push(target);
        if (closes !== group) {
            closes.push(target);
        }
        let openit = () => {
            clearTimeout(closes.timer);
            for (let close of closes) {
                close.classList.remove("hoverpop");
            }
            target.classList.add("hoverpop");
            popped = true;
        };
        let closeit = () => {
            target.classList.remove("hoverpop");
            clearTimeout(closes.timer);
            popped = false;
        };
        if (opt.auto !== false) {
            el.addEventListener("mouseenter", () => {
                openit();
            });
            el.addEventListener("touchstart", (ev) => {
                if (ev.target.onclick) {
                    if (mobile && popped) {
                        setTimeout(closeit, 500);
                        return;
                    }
                }
                mobile = true;
                if (popped) {
                    closeit();
                } else {
                    openit();
                }
            });
        }
        el.addEventListener("mouseleave", (ev) => {
            closes.timer = setTimeout(() => {
                target.classList.remove("hoverpop");
            }, 750);
        });
        if (!opt.sticky) {
            el.addEventListener("mouseup", (ev) => {
                if (mobile) {
                    return;
                }
                if (popped) {
                    closeit();
                } else {
                    openit();
                }
            });
        }
        document.addEventListener("keydown", (ev) => {
            if (ev.keyCode === 27 || ev.code === 'Escape') {
                closeit();
            }
        });
    }

});
