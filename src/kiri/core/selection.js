/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { space } from '../../moto/space.js';
import { THREE } from '../../ext/three.js';
import { tool as MeshTool } from '../../mesh/tool.js';
import { encode as objEncode } from '../../load/obj.js';
import { encode as stlEncode } from '../../load/stl.js';

const selectedMeshes = [];

function for_groups(fn) {
    let groups = widgets(true).map(w => w.group).uniq();
    for (let group of groups) {
        fn(group[0]);
    }
}

function for_widgets(fn, noauto) {
    let m = selectedMeshes;
    let w = api.widgets.all();
    if (m.length === 0 && w.length) {
        m = noauto ? [] : w.map(w => w.mesh);
    }
    m.slice().forEach(mesh => { fn(mesh.widget) });
}

function for_status(fn) {
    api.widgets.all().forEach(w => {
        fn(w, selectedMeshes.contains(w.mesh));
    });
}

function for_meshes(fn) {
    selectedMeshes.slice().forEach(mesh => { fn(mesh) });
}

function move(x, y, z, abs) {
    if (!api.view.is_arrange()) {
        return;
    }
    for_groups(w => w.move(x, y, z, abs));
    update_bounds();
    api.platform.update_bounds();
    api.event.emit('selection.move', {x, y, z, abs});
    space.update();
    api.space.auto_save();
}

function update_info() {
    const ui = api.ui;
    let bounds = new THREE.Box3(), track;
    for_meshes(mesh => {
        let box = mesh.getBoundingBox().clone();
        track = mesh.widget.track;
        let {pos} = track
        box.min.add(pos);
        box.max.add(pos);
        bounds = bounds.union(box);
    });
    if (bounds.min.x === Infinity) {
        if (selectedMeshes.length === 0) {
            ui.sizeX.value = 0;
            ui.sizeY.value = 0;
            ui.sizeZ.value = 0;
            ui.scaleX.value = 1;
            ui.scaleY.value = 1;
            ui.scaleZ.value = 1;
        }
        return;
    }
    let dx = bounds.max.x - bounds.min.x,
        dy = bounds.max.y - bounds.min.y,
        dz = bounds.max.z - bounds.min.z,
        scale = api.view.unit_scale();
    ui.sizeX.value = ui.sizeX.was = (dx / scale).round(2)
    ui.sizeY.value = ui.sizeY.was = (dy / scale).round(2)
    ui.sizeZ.value = ui.sizeZ.was = (dz / scale).round(2)
    ui.scaleX.value = ui.scaleX.was = track.scale.x.round(2);
    ui.scaleY.value = ui.scaleY.was = track.scale.y.round(2);
    ui.scaleZ.value = ui.scaleZ.was = track.scale.z.round(2);
    update_bounds();
}

function update_bounds(widgets) {
    const settings = api.conf.get();
    // update bounds on selection for drag limiting
    const isBelt = settings.device.bedBelt;
    if (isBelt) {
        if (api.platform.fit()) {
            api.platform.update_origin();
            space.update();
        }
    }
    const dvy = settings.device.bedDepth;
    const dvx = settings.device.bedWidth;
    const bounds_sel = new THREE.Box3();
    if (!widgets) {
        widgets = selectedMeshes.map(m => m.widget);
    }
    for (let widget of widgets) {
        const wp = widget.track.pos;
        const bx = widget.track.box;
        const miny = wp.y - bx.h / 2 + dvy / 2;
        const maxy = wp.y + bx.h / 2 + dvy / 2;
        const minx = wp.x - bx.w / 2 + dvx / 2;
        const maxx = wp.x + bx.w / 2 + dvx / 2;
        // keep widget in bounds when rotated or scaled
        const ylo = miny < 0;
        const yhi = !isBelt && maxy > dvy
        if (ylo && !yhi) {
            widget.move(0, -miny, 0);
        } else if (yhi && !ylo) {
            widget.move(0, dvy - maxy, 0);
        }
        const xlo = minx < 0;
        const xhi = maxx > dvx;
        if (xlo && !xhi) {
            widget.move(-minx, 0, 0);
        } else if (xhi && !xlo) {
            widget.move(dvx - maxx, 0, 0);
        }

        const wb = widget.mesh.getBoundingBox().clone();
        wb.min.x += wp.x;
        wb.max.x += wp.x;
        wb.min.y += wp.y;
        wb.max.y += wp.y;
        bounds_sel.union(wb);
    }
    settings.bounds_sel = bounds_sel;
}

function duplicate() {
    if (!api.view.is_arrange()) {
        return;
    }
    for_widgets(widget => {
        const mesh = widget.mesh;
        const bb = mesh.getBoundingBox();
        const ow = widget;
        const nw = api.widgets.new().loadGeometry(mesh.geometry.clone());
        nw.meta.file = ow.meta.file;
        nw.meta.vertices = ow.meta.vertices;
        nw.anno = ow.annotations();
        nw.move(bb.max.x - bb.min.x + 1, 0, 0);
        api.platform.add(nw, true);
        api.event.emit("widget.duplicate", nw, ow);
    });
}

function mirror() {
    if (!api.view.is_arrange()) {
        return;
    }
    for_widgets(widget => {
        widget.mirror();
    });
    space.update();
    api.space.auto_save();
}

function scale() {
    if (!api.view.is_arrange()) {
        return;
    }
    let args = [...arguments];
    for_groups(w => w.scale(...args));
    selection.update_bounds();
    api.platform.update_bounds();
    api.event.emit('selection.scale', args);
    // skip update if last argument is strictly 'false'
    if (args.last() === false) {
        return;
    }
    api.space.auto_save();
    selection.update_info();
    space.update();
}

function rotate(x, y, z) {
    if (!api.view.is_arrange()) {
        return;
    }
    for_groups(w => w.rotate(x, y, z));
    selection.update_bounds();
    api.platform.update_bounds();
    api.event.emit('selection.rotate', {x, y, z});
    api.space.auto_save();
    selection.update_info();
    space.update();
}

function merge({ deleteMerged = true }) {
    let sel = widgets();
    if (sel.length === 0) {
        sel = api.widgets.all();
    }
    let obj = [];
    sel.forEach(widget => {
        let {x, y, z} = widget.track.pos || { x:0, y:0, z:0 };
        let pos = widget.mesh.geometry.attributes.position;
        let pvals = pos.array;
        for (let i=0, il=pos.count; i<il; i += 3) {
            let pi = i * pos.itemSize;
            obj.push(pvals[pi++] + x, pvals[pi++] + y, pvals[pi++] + z);
            obj.push(pvals[pi++] + x, pvals[pi++] + y, pvals[pi++] + z);
            obj.push(pvals[pi++] + x, pvals[pi++] + y, pvals[pi++] + z);
        }
    });
    let w = api.platform.load_verts([], obj, "merged");
    if (deleteMerged) api.platform.delete(sel);
    api.platform.select(w);
}

/**
 * Isolates the bodies within the selected widgets. If no widgets are selected,
 * it processes all available widgets. For each widget, it checks if a tool is
 * associated; if not, it creates a new MeshTool and indexes the vertices.
 * The function identifies isolated bodies within each widget. If a widget has
 * a single body, it remains selected. Otherwise, it creates new widgets for
 * each isolated body and selects them while deleting the original widget.
 */
function isolateBodies(){
    let sel = widgets();
    console.log('isolate', sel);
    if (sel.length === 0) {
        sel = api.widgets.all();
    }
    for(let widget of sel){
        if (!widget.tool) {
            let tool = widget.tool = new MeshTool();
            tool.index(widget.getGeoVertices({ unroll: true, translate:true }));
        }
        let bodies = widget.tool.isolateBodies()
        if(bodies.length ==1){
            api.platform.select(widget);
        }else{
            // console.log(bodies,Array.from(bodies.entries()))
            for(let [i,verts] of bodies.entries()){
                let w = api.platform.load_verts([], verts, `isolate ${i} of ${ widget.anno.file}`);
                api.platform.select(w)
            }
            api.platform.delete(widget);
        }
    }
}

function exportWidgets(format = "stl") {
    let sel = widgets();
    if (sel.length === 0) {
        sel = api.widgets.all();
    }
    let facets = 0;
    let outs = [];
    sel.forEach(widget => {
        let mesh = widget.mesh;
        let geo = mesh.geometry;
        outs.push({geo, widget});
        facets += geo.attributes.position.count;
    });
    if (format === "obj") {
        let recs = outs.map(out => {
            let meta = out.widget.meta;
            let name = meta.file || 'unnamed';
            let { position } = out.geo.attributes;
            return { file: name, varr: position.array };
        });
        return objEncode(recs);
    }
    let recs = outs.map(out => {
        let { position } = out.geo.attributes;
        let pvals = position.array;
        let varr = pvals;

        // Apply position offset if exporting multiple widgets
        if (outs.length > 1) {
            let {x, y, z} = out.widget.track.pos;
            varr = new Float32Array(pvals.length);
            for (let i = 0; i < pvals.length; i += 3) {
                varr[i] = pvals[i] + x;
                varr[i+1] = pvals[i+1] + y;
                varr[i+2] = pvals[i+2] + z;
            }
        }

        return { file: out.widget.meta.file || 'unnamed', varr };
    });
    return stlEncode(recs);
}

function widgets(orall) {
    let sel = selectedMeshes.slice().map(m => m.widget);
    return sel.length ? sel : orall ? api.widgets.all() : []
}

function setDisabled(bool) {
    for_widgets(w => w.meta.disabled = bool);
    api.platform.update_selected();
}

// extend API (api.selection)
export const selection = {
    move,
    merge,
    isolateBodies,
    scale,
    rotate,
    mirror,
    duplicate,
    for_groups,
    for_meshes,
    for_status,
    for_widgets,
    update_bounds,
    update_info,
    widgets,
    export:     exportWidgets,
    add(w)      { selectedMeshes.addOnce(w.mesh) },
    delete()    { api.platform.delete(widgets()) },
    remove(w)   { return selectedMeshes.remove(w.mesh) },
    count()     { return selectedMeshes.length },
    contains(w) { return selectedMeshes.indexOf(w.mesh) >= 0 },
    enable()    { setDisabled(false) },
    disable()   { setDisabled(true) },
    opacity()   { api.widgets.opacity(...arguments) },
    meshes()    { return selectedMeshes.slice() },
};
