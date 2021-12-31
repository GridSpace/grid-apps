/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register('moto.webui', [
    "moto.license", // dep: moto.license
    "add.array",    // dep: add.array
]);

let moto = self.moto = self.moto || {};
if (moto.webui) return;

// window ui helpers
Object.assign(self, {
    $: (id) => {
        return document.getElementById(id);
    },

    $d: (id, v) => {
        $(id).style.display = v;
    },

    $h: (id, h) => {
        $(id).innerHTML = h;
    },

    estop: (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
    }
});

let nextid = 1;

function build(data, context) {
    if (Array.isArray(data)) {
        let html = [];
        for (let d of data) {
            html.appendAll(build(d, context));
        }
        return html;
    }
    let { type, attr, innr } = data;
    let elid;
    let html = [];
    let text
    html.push(`<${type}`);
    let func = {};
    for (let [key, val] of Object.entries(attr || {})) {
        let tov = typeof val;
        if (key === '_') {
            text = val;
        } else if (key === 'id') {
            elid = val;
        } else if (tov === 'function') {
            func[key] = val;
            elid = elid || `_${nextid++}`;
        } else if (tov === 'object') {
            html.push(` ${key}="${val.join(' ')}"`);
        } else {
            html.push(` ${key}="${val}"`);
        }
    }
    if (elid) {
        html.push(` id="${elid}"`);
        context.push({elid, func});
    }
    html.push('>');
    if (innr) {
        let snips = [];
        if (innr.length) {
            for (let i of innr) {
                snips.push(build(i, context));
            }
        } else {
            snips.push(build(i, context));
        }
        html.appendAll(snips.flat());
    }
    if (text) {
        html.push(text);
    }
    html.push(`</${type}>`);
    return html;
}

// core html builder funtions
let h = self.h = moto.webui = {
    bind: (el, data, opt = {}) => {
        let ctx = [];
        let html = build(data, ctx).join('');
        if (opt.append) {
            el.innerHTML += html;
        } else {
            el.innerHTML = html;
        }
        for (let bind of ctx) {
            let { elid, func } = bind;
            let et = $(elid);
            for (let [name, fn] of Object.entries(func)) {
                et[name] = fn;
            }
        }
    },

    el: (type, attr, innr) => {
        if (Array.isArray(attr)) {
            innr = attr;
            attr = {};
        }
        return { type, attr, innr };
    }
};

// add common element types
["a", "div", "span", "label", "input", "button"].forEach(type => {
    h[type] = (attr, innr) => {
        return h.el(type, attr, innr);
    }
});

})();
