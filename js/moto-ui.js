/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_moto_ui = exports;

(function() {

    var moto = self.moto = self.moto || {};
    if (moto.ui) return;

    var SELF = self,
        lastGroup = null,
        lastDiv = null,
        hideAction = null,
        inputAction = null,
        hasModes = [],
        SDB = moto.KV,
        DOC = SELF.document,
        prefix = "tab";

    SELF.$ = (SELF.$ || function (id) { return DOC.getElementById(id) } );

    moto.ui = {
        prefix: function(pre) { prefix = pre; return moto.ui },
        hideAction: function(fn) { hideAction = fn; return moto.ui },
        inputAction: function(fn) { inputAction = fn; return moto.ui },
        setMode: setMode,
        bound: bound,
        toInt: toInt,
        toFloat: toFloat,
        hidePop: hidePop,
        isPopped: isPopped,
        newText: newTextArea,
        newLabel: newLabel,
        newRange: newRangeField,
        newInput: newInputField,
        newButton: newButton,
        newBoolean: newBooleanField,
        newSelectField: newSelectField,
        newTable: newTables,
        newTableRow: newTableRow,
        newRow: newRow,
        newBlank: newBlank,
        newGroup: newGroup,
        setGroup: setGroup
    };

    function setMode(mode) {
        hasModes.forEach(function(div) {
            div.setMode(mode);
        });
    }

    function isControlGroupVisible(label, key) {
        var ls = SDB.getItem(key),
            dv = true;
        return ls ? ls !== 'false' : dv !== undefined ? dv : true;
    }

    function setGroup(div) {
        lastDiv = div;
        return div;
    }

    function newGroup(label, div, options) {
        lastDiv = div || lastDiv;
        return addCollapsableGroup(label, lastDiv, options);
    }

    function addCollapsableGroup(label, div, options) {
        var row = DOC.createElement('div'),
            a = DOC.createElement('a'),
            dbkey = prefix+'-show-'+label;

        lastGroup = "ck_"+label;
        div.appendChild(row);
        row.setAttribute("class", "grouphead noselect");
        row.setAttribute("id", lastGroup);
        row.appendChild(a);
        a.appendChild(DOC.createTextNode(label));
        a.setAttribute("ck", lastGroup);
        a.setAttribute("id", lastGroup+"_label");
        addModeControls(row, options);
        return row;
    }

    function toInt() {
        var nv = this.value !== '' ? parseInt(this.value) : null;
        if (isNaN(nv)) nv = 0;
        if (nv !== null && this.bound) nv = this.bound(nv);
        this.value = nv;
        return nv;
    }

    function toFloat() {
        var nv = this.value !== '' ? parseFloat(this.value) : null;
        if (nv !== null && this.bound) nv = this.bound(nv);
        this.value = nv;
        return nv;
    }

    function bound(low,high) {
        return function(v) {
            if (isNaN(v)) return low;
            return v < low ? low : v > high ? high : v;
        };
    }

    function raw() {
        return this.value !== '' ? this.value : null;
    }

    function newLabel(text) {
        var label = DOC.createElement('label');
        label.appendChild(DOC.createTextNode(text));
        label.setAttribute("class", "noselect");
        return label;
    }

    function addId(el, options) {
        if (options && options.id) {
            el.setAttribute("id", options.id);
        }
    }

    function addModeControls(el, options) {
        el.__show = true;
        el.__modeSave = null;
        el.showMe = function() {
            if (el.__show) return;
            el.style.display = el.__modeSave;
            el.__show = true;
            el.__modeSave = null;
        };
        el.hideMe = function() {
            if (!el.__show) return;
            el.__show = false;
            el.__modeSave = el.style.display;
            el.style.display = 'none';
        };
        el.setVisible = function(show) {
            if (show) el.showMe();
            else el.hideMe();
        };
        el.setMode = function(mode) {
            el.setVisible(el.modes.contains(mode));
        }
        el.hasMode = function(mode) {
            return el.modes.contains(mode);
        }
        if (options && options.modes) {
            el.modes = options.modes;
            hasModes.push(el);
        }
    }

    function newDiv(options) {
        var div = DOC.createElement('div');
        addModeControls(div, options);
        return div;
    }

    var lastPop = null;

    function hidePop() {
        if (lastPop) lastPop.style.display = "none";
        lastPop = null;
    }

    function isPopped() {
        return lastPop !== null;
    }

    function newTextArea(label, options) {
        var opt = options || {},
            row = newDiv(options),
            btn = DOC.createElement("button"),
            box = DOC.createElement("div"),
            pop = DOC.createElement("div"),
            lbl = DOC.createElement("label"),
            txt = DOC.createElement("textarea");

        pop.setAttribute("class", "poptext flow-col");
        box.setAttribute("style", "position: relative");
        box.appendChild(pop);
        pop.appendChild(lbl);
        pop.appendChild(txt);
        lbl.appendChild(DOC.createTextNode(label));

        txt.setAttribute("cols", 30);
        txt.setAttribute("rows", 20);
        txt.setAttribute("wrap", "off");

        btn.appendChild(DOC.createTextNode("edit"));
        btn.onclick = function(ev) {
            btn.parentNode.appendChild(box);
            btn.parentNode.onclick = btn.onclick;
            ev.stopPropagation();
            // drop clicks on TextArea
            if (ev.target === txt) {
                ev.target.focus();
            } else {
                var showing = pop === lastPop;
                hidePop();
                if (!showing) {
                    pop.style.display = "flex";
                    lastPop = pop;
                    txt.focus();
                }
            }
        };
        addModeControls(btn, opt);
        addId(btn, opt);

        lastDiv.appendChild(row);
        row.appendChild(newLabel(label));
        row.appendChild(btn);
        row.setAttribute("class", ["flow-row",lastGroup].join(" "));
        if (opt.title) row.setAttribute("title", options.title);
        btn.setVisible = row.setVisible;

        return txt;
    }

    function newInputField(label, options) {
        var row = newDiv(options),
            hide = options && options.hide,
            size = options ? options.size || 5 : 5,
            height = options ? options.height : 0,
            ip = height > 1 ? DOC.createElement('textarea') : DOC.createElement('input'),
            action = inputAction;
        lastDiv.appendChild(row);
        row.appendChild(newLabel(label));
        row.appendChild(ip);
        row.setAttribute("class", ["flow-row",lastGroup].join(" "));
        if (height > 1) {
            ip.setAttribute("cols", size);
            ip.setAttribute("rows", height);
            ip.setAttribute("wrap", "off");
        } else {
            ip.setAttribute("size", size);
        }
        ip.setAttribute("type", "text");
        row.style.display = hide ? 'none' : '';
        if (options) {
            if (options.disabled) ip.setAttribute("disabled", "true");
            if (options.title) row.setAttribute("title", options.title);
            if (options.convert) ip.convert = options.convert.bind(ip);
            if (options.bound) ip.bound = options.bound;
            if (options.action) action = options.action;
        }
        ip.addEventListener('focus', function(event) {
            hidePop();
        });
        if (action) {
            ip.addEventListener('keyup', function(event) {
                if (event.keyCode === 13) action(event);
            });
            ip.addEventListener('blur', function(event) {
                action(event);
            });
        }
        if (!ip.convert) ip.convert = raw.bind(ip);
        ip.setVisible = row.setVisible;
        return ip;
    }

    function newRangeField(label, options) {
        var row = newDiv(options),
            ip = DOC.createElement('input'),
            hide = options && options.hide,
            action = inputAction;
        lastDiv.appendChild(row);
        if (label) row.appendChild(newLabel(label));
        row.appendChild(ip);
        row.setAttribute("class", ["flow-row",lastGroup].join(" "));
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

    function newSelectField(label, options) {
        var row = newDiv(options),
            ip = DOC.createElement('select'),
            hide = options && options.hide,
            action = inputAction;
        lastDiv.appendChild(row);
        row.appendChild(newLabel(label));
        row.appendChild(ip);
        row.setAttribute("class", ["flow-row",lastGroup].join(" "));
        row.style.display = hide ? 'none' : '';
        if (options) {
            if (options.convert) ip.convert = options.convert.bind(ip);
            if (options.disabled) ip.setAttribute("disabled", "true");
            if (options.title) row.setAttribute("title", options.title);
            if (options.action) action = options.action;
        }
        ip.onchange = function() { action() };
        ip.setVisible = row.setVisible;
        return ip;
    }

    function newBooleanField(label, action, options) {
        var row = newDiv(options),
            ip = DOC.createElement('input'),
            hide = options && options.hide;
        lastDiv.appendChild(row);
        if (label) row.appendChild(newLabel(label));
        row.appendChild(ip);
        row.setAttribute("class", ["flow-row",lastGroup].join(" "));
        row.style.display = hide ? 'none' : '';
        ip.setAttribute("type", "checkbox");
        ip.checked = false;
        if (options) {
            if (options.disabled) ip.setAttribute("disabled", "true");
            if (options.title) {
                ip.setAttribute("title", options.title);
                row.setAttribute("title", options.title);
            }
        }
        if (action) ip.onclick = function() { action() };
        ip.setVisible = row.setVisible;
        return ip;
    }

    function newBlank(options) {
        var row = newDiv(options),
            hide = options && options.hide;
        lastDiv.appendChild(row);
        row.setAttribute("class", ["flow-row",lastGroup].join(" "));
        row.style.display = hide ? 'none' : '';
        ip.setVisible = row.setVisible;
        return ip;
    }

    function newButton(label, action, options) {
        var b = DOC.createElement('button'),
            t = DOC.createTextNode(label);
        b.appendChild(t);
        b.onclick = function() { action() };
        addModeControls(b, options);
        addId(b, options);
        return b;
    }

    function newTableRow(arrayOfArrays, options) {
        return newRow(newTables(arrayOfArrays), options);
    }

    function newTables(arrayOfArrays) {
        var array = [];
        for (var i=0; i<arrayOfArrays.length; i++) {
            array.push(newRowTable(arrayOfArrays[i]));
        }
        return array;
    }

    function newRowTable(array) {
        var div = DOC.createElement('div');
        div.setAttribute("class", "tablerow");
        array.forEach(function(c) {
            div.appendChild(c);
        });
        return div;
    }

    function newRow(children, options) {
        var row = addCollapsableElement((options && options.noadd) ? null : lastDiv);
        if (children) children.forEach(function (c) { row.appendChild(c) });
        addModeControls(row, options);
        return row;
    }

    function addCollapsableElement(parent) {
        var row = DOC.createElement('div');
        if (parent) parent.appendChild(row);
        if (lastGroup) row.setAttribute("class", lastGroup);
        return row;
    }

})();
