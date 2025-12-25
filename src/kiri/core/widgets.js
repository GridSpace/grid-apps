/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from '../app/api.js';
import { load } from '../../load/file.js';
import { Widget, newWidget } from './widget.js';

let WIDGETS = [];

function map() {
    let map = {};
    for (let widget of WIDGETS) {
        map[widget.id] = widget;
    }
    return map;
}

function annotate(id) {
    let w = WIDGETS.filter(w => w.id === id)[0];
    if (!w) {
        console.trace(`annotate missing widget ${id}`);
        return {};
    }
    return (w.anno = w.anno || {});
}

/** TODO really should be on widget, not widgets */
function rename(sel) {
    let widgets = sel ? [ sel ] : api.selection.widgets(true);
    if (widgets.length !== 1) {
        return;
    }
    let widget = widgets[0];
    api.uc.prompt("new widget name", widget.meta.file || "no name").then(newname => {
        if (newname) {
            widget.meta.file = newname;
            api.platform.changed();
            api.space.save(true);
        }
    });
}

function replace(vertices, sel) {
    let widgets = sel ? [sel] : api.selection.widgets(true);
    if (!widgets.length) {
        return;
    }
    function onload(vertices) {
        for (let w of widgets) {
            let track = Object.clone(w.track);
            let { scale, rot, pos } = track;
            let roto = w.roto.slice();
            w.loadVertices(vertices);
            for (let m of roto) {
                w.mesh.geometry.applyMatrix4(m.clone());
            }
            w._scale(scale.x, scale.y, scale.z);
        }
        api.platform.update();
    }
    if (vertices) {
        onload(vertices);
    } else {
        // dialog
        $('load-file').onchange = function(event) {
            load(event.target.files[0])
                .then(data => onload(data[0].mesh))
                .catch(error => console.log({error}));
        };
        $('load-file').click();
    }
}

function meshes() {
    let out = [];
    widgets.each(widget => {
        if (!api.feature.hoverAdds) {
            out.push(widget.mesh);
        }
        out.appendAll(widget.adds.filter(m=>m.visible));
    });
    return out;
}

function setOpacity(value) {
    api.widgets.each(w => w.setOpacity(value));
    api.space.update();
}

function setIndexed(value) {
    api.widgets.each(w => w.setIndexed(value));
}

function setAxisIndex(value) {
    api.widgets.each(w => w.setAxisIndex(value));
}

// extend API (api.widgets)
export const widgets = {
    load:       Widget.loadFromCatalog,
    new:        newWidget,
    map,
    meshes,
    rename,
    replace,
    opacity(o)    { setOpacity(o); console.trace('opacity() deprecated') },
    annotate,
    setIndexed,
    setAxisIndex,
    setColor(c,s) { api.widgets.each(widget => widget.setColor(c,undefined,s) )},
    setOpacity,
    all()         { return WIDGETS.slice() },
    add(w)        { return WIDGETS.push(w) },
    remove(w)     { return WIDGETS.remove(w) },
    filter(fn)    { return WIDGETS = WIDGETS.filter(fn) },
    count()       { return WIDGETS.length },
    each(fn)      { WIDGETS.slice().forEach(widget => fn(widget)) },
    for(fn)       { widgets.each(fn) },
    forid(id)     { return WIDGETS.filter(w => w.id === id)[0] }
};
