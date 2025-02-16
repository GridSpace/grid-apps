/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// use: load.file
// use: kiri.selection
// use: kiri.platform
gapp.register("kiri.widgets", (root, exports) => {

const { data, kiri, moto, noop } = root;
const { api, consts, utils, newWidget, Widget } = kiri;

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
    kiri.ui.prompt("new widget name", widget.meta.file || "no name").then(newname => {
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
            load.File.load(event.target.files[0])
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
        out.appendAll(widget.adds);
    });
    return out;
}

function opacity(value) {
    api.widgets.each(w => w.setOpacity(value));
    moto.space.update();
}

function setIndexed(value) {
    api.widgets.each(w => w.setIndexed(value));
}

function setAxisIndex(value) {
    api.widgets.each(w => w.setAxisIndex(value));
}

// extend API (api.widgets)
const widgets = Object.assign(api.widgets, {
    load:       Widget.loadFromCatalog,
    new:        newWidget,
    map,
    meshes,
    rename,
    replace,
    opacity,
    annotate,
    setIndexed,
    setAxisIndex,
    all()       { return WIDGETS.slice() },
    add(w)      { return WIDGETS.push(w) },
    remove(w)   { return WIDGETS.remove(w) },
    filter(fn)  { return WIDGETS = WIDGETS.filter(fn) },
    count()     { return WIDGETS.length },
    each(fn)    { WIDGETS.slice().forEach(widget => fn(widget)) },
    for(fn)     { widgets.each(fn) },
    forid(id)   { return WIDGETS.filter(w => w.id === id)[0] }
});

});
