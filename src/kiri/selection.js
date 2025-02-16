/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.space
// dep: kiri.api
// dep: kiri.consts
// dep: kiri.utils
gapp.register("kiri.selection", (root, exports) => {

const { kiri, moto, noop } = self;
const { api, consts, utils } = kiri;
const { space } = moto;

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
        bounds = bounds.union(mesh.getBoundingBox());
        track = mesh.widget.track;
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

function merge() {
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
    api.platform.delete(sel);
    api.platform.select(w);
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
        let obj = [];
        let vpad = 0;
        for (let out of outs) {
            let meta = out.widget.meta;
            let name = meta.file || 'unnamed';
            obj.push(`g ${name}`);
            let { position } = out.geo.attributes;
            let pvals = position.array;
            for (let i=0, il=position.count; i<il; i += 3) {
                let pi = i * position.itemSize;
                obj.push(`v ${pvals[pi++]} ${pvals[pi++]} ${pvals[pi++]}`);
                obj.push(`v ${pvals[pi++]} ${pvals[pi++]} ${pvals[pi++]}`);
                obj.push(`v ${pvals[pi++]} ${pvals[pi++]} ${pvals[pi++]}`);
                obj.push(`f ${i+1+vpad} ${i+2+vpad} ${i+3+vpad}`);
            }
            vpad += position.count;
        }
        return obj.join('\n');
    }
    let stl = new Uint8Array(80 + 4 + facets/3 * 50);
    let dat = new DataView(stl.buffer);
    let pos = 84;
    dat.setInt32(80, facets/3, true);
    for (let out of outs) {
        let { position } = out.geo.attributes;
        let pvals = position.array;
        for (let i=0, il=position.count; i<il; i += 3) {
            let pi = i * position.itemSize;
            let p0 = new THREE.Vector3(pvals[pi++], pvals[pi++], pvals[pi++]);
            let p1 = new THREE.Vector3(pvals[pi++], pvals[pi++], pvals[pi++]);
            let p2 = new THREE.Vector3(pvals[pi++], pvals[pi++], pvals[pi++]);
            let norm = THREE.computeFaceNormal(p0, p1, p2);
            let xo = 0, yo = 0, zo = 0;
            if (outs.length > 1) {
                let {x, y, z} = out.widget.track.pos;
                xo = x;
                yo = y;
                zo = z;
            }
            dat.setFloat32(pos +  0, norm.x, true);
            dat.setFloat32(pos +  4, norm.y, true);
            dat.setFloat32(pos +  8, norm.z, true);
            dat.setFloat32(pos + 12, p0.x + xo, true);
            dat.setFloat32(pos + 16, p0.y + yo, true);
            dat.setFloat32(pos + 20, p0.z + zo, true);
            dat.setFloat32(pos + 24, p1.x + xo, true);
            dat.setFloat32(pos + 28, p1.y + yo, true);
            dat.setFloat32(pos + 32, p1.z + zo, true);
            dat.setFloat32(pos + 36, p2.x + xo, true);
            dat.setFloat32(pos + 40, p2.y + yo, true);
            dat.setFloat32(pos + 44, p2.z + zo, true);
            pos += 50;
        }
    }
    return stl;
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
const selection = Object.assign(api.selection, {
    move,
    merge,
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
});

});
