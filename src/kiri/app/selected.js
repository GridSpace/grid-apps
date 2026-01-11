/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { space } from '../../moto/space.js';
import { THREE } from '../../ext/three.js';
import { tool as MeshTool } from '../../mesh/tool.js';
import { encode as objEncode } from '../../load/obj.js';
import { encode as stlEncode } from '../../load/stl.js';

/**
 * Array of currently selected widget meshes.
 * @type {Array}
 */
const selectedMeshes = [];

function updateTool(ev) {
    api.tool.update(ev);
}

/**
 * Execute function for each unique group represented in selection.
 * Passes the first widget from each group to the function.
 * @param {function} fn - Function(widget) to execute for each group
 */
function for_groups(fn) {
    let groups = widgets(true).map(w => w.group).uniq();
    for (let group of groups) {
        fn(group[0]);
    }
}

/**
 * Execute function for each selected widget.
 * If nothing selected, defaults to all widgets unless noauto=true.
 * @param {function} fn - Function(widget) to execute
 * @param {boolean} [noauto] - If true, don't auto-select all widgets when none selected
 */
function for_widgets(fn, noauto) {
    let m = selectedMeshes;
    let w = api.widgets.all();
    if (m.length === 0 && w.length) {
        m = noauto ? [] : w.map(w => w.mesh);
    }
    m.slice().forEach(mesh => { fn(mesh.widget) });
}

/**
 * Execute function for all widgets with selection status.
 * @param {function} fn - Function(widget, is_selected) to execute
 */
function for_status(fn) {
    api.widgets.all().forEach(w => {
        fn(w, selectedMeshes.contains(w.mesh));
    });
}

/**
 * Execute function for each selected mesh.
 * @param {function} fn - Function(mesh) to execute
 */
function for_meshes(fn) {
    selectedMeshes.slice().forEach(mesh => { fn(mesh) });
}

/**
 * Move selected widget groups.
 * Only works in ARRANGE view.
 * @param {number} x - X offset
 * @param {number} y - Y offset
 * @param {number} z - Z offset
 * @param {boolean} [abs] - If true, use absolute positioning instead of relative
 */
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

/**
 * Compute bounding box of all selected meshes.
 * @returns {THREE.Box3} Bounding box
 */
function get_bounds() {
    // Helper to compute bounds of selected meshes
    const THREE = self.THREE;
    let bounds = new THREE.Box3();
    selection.for_meshes(mesh => {
        let box = mesh.getBoundingBox().clone();
        let pos = mesh.widget.mesh.position;
        box.min.add(pos);
        box.max.add(pos);
        bounds = bounds.union(box);
    });
    return bounds;
}

/**
 * Update UI size/scale info fields based on selected mesh bounds.
 * Calculates combined bounding box and displays dimensions/scale in UI.
 */
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
            ui.size.X.value = 0;
            ui.size.Y.value = 0;
            ui.size.Z.value = 0;
            ui.scale.X.value = 1;
            ui.scale.Y.value = 1;
            ui.scale.Z.value = 1;
        }
        return;
    }
    let dx = bounds.max.x - bounds.min.x,
        dy = bounds.max.y - bounds.min.y,
        dz = bounds.max.z - bounds.min.z,
        scale = api.view.unit_scale();
    ui.size.X.value = ui.size.X.was = (dx / scale).round(2)
    ui.size.Y.value = ui.size.Y.was = (dy / scale).round(2)
    ui.size.Z.value = ui.size.Z.was = (dz / scale).round(2)
    ui.scale.X.value = ui.scale.X.was = track.scale.x.round(2);
    ui.scale.Y.value = ui.scale.Y.was = track.scale.y.round(2);
    ui.scale.Z.value = ui.scale.Z.was = track.scale.z.round(2);
    update_bounds();
}

/**
 * Update platform bounds and constrain widgets to bed limits.
 * For belt mode, fits widgets and updates origin.
 * Automatically moves widgets back into bounds if they exceed bed size.
 * @param {Array<Widget>} [widgets] - Widgets to bound. Defaults to selected widgets.
 */
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

/**
 * Duplicate selected widgets with offset.
 * Only works in ARRANGE view.
 * New widgets offset by bounding box width + 1 in X direction.
 */
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

/**
 * Mirror selected widgets along X axis.
 * Only works in ARRANGE view.
 */
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

/**
 * Scale selected widget groups.
 * Only works in ARRANGE view.
 * Updates bounds, saves workspace, refreshes info and display.
 * @param {number} x - X scale factor
 * @param {number} y - Y scale factor
 * @param {number} z - Z scale factor
 * @param {boolean} [last] - If strictly false, skips auto-save
 */
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

/**
 * Rotate selected widget groups.
 * Only works in ARRANGE view.
 * Updates bounds, saves workspace, refreshes info and display.
 * @param {number} x - X rotation in radians
 * @param {number} y - Y rotation in radians
 * @param {number} z - Z rotation in radians
 */
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

/**
 * Merge selected widgets into a single widget.
 * Combines all vertex data from selected widgets into one mesh.
 * @param {object} options - Options
 * @param {boolean} [options.deleteMerged=true] - If true, deletes original widgets after merge
 */
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

/**
 * Export selected widgets to STL or OBJ format.
 * If multiple widgets, applies position offsets in STL format.
 * @param {string} [format="stl"] - Export format: "stl" or "obj"
 * @returns {ArrayBuffer|string} Encoded file data
 */
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

/**
 * Get selected widgets.
 * @param {boolean} [orall] - If true and nothing selected, returns all widgets
 * @returns {Array<Widget>} Selected widgets or empty array
 */
function widgets(orall) {
    let sel = selectedMeshes.slice().map(m => m.widget);
    return sel.length ? sel : orall ? api.widgets.all() : []
}

function setDisabled(bool) {
    for_widgets(w => w.meta.disabled = bool);
    api.platform.update_selected();
}

function settings() {
    return api.conf.get();
}

/**
 * Prompt user for rotation angles and rotate selection.
 * Shows alert if nothing selected.
 * Accepts comma-separated X,Y,Z degrees.
 */
function input_rotate() {
    if (selection.meshes().length === 0) {
        api.show.alert("select object to rotate");
        return;
    }
    api.uc.prompt("Enter X,Y,Z degrees of rotation","").then(coord => {
        coord = (coord || '').split(',');
        let prod = Math.PI / 180,
            x = parseFloat(coord[0] || 0.0) * prod,
            y = parseFloat(coord[1] || 0.0) * prod,
            z = parseFloat(coord[2] || 0.0) * prod;
        selection.rotate(x, y, z);
    });
}

/**
 * Prompt user for position coordinates and move selection.
 * Shows alert if nothing selected.
 * Accepts comma-separated X,Y coordinates.
 * Adjusts for center vs corner origin modes.
 */
function input_position() {
    if (selection.meshes().length === 0) {
        api.show.alert("select object to position");
        return;
    }
    let current = settings(),
        { device, process} = current,
        center = process.ctOriginCenter || process.camOriginCenter || device.bedRound || device.originCenter,
        bounds = selection.get_bounds();

    api.uc.prompt("Enter X,Y coordinates for selection","").then(coord => {
        coord = (coord || '').split(',');
        let x = parseFloat(coord[0] || 0.0),
            y = parseFloat(coord[1] || 0.0),
            z = parseFloat(coord[2] || 0.0);

        if (!center) {
            x = x - device.bedWidth/2 + (bounds.max.x - bounds.min.x)/2;
            y = y - device.bedDepth/2 + (bounds.max.y - bounds.min.y)/2
        }

        selection.move(x, y, z, true);
    });
}

/**
 * Handle size input change event.
 * Calculates scale ratio from size change and applies to selection.
 * Respects lock checkboxes for proportional scaling.
 * Prevents scales below 0.1.
 * @param {Event} e - Input change event
 * @param {object} ui - UI elements object with size/lock fields
 */
function input_resize(e, ui) {
    let dv = parseFloat(e.target.value || 1),
        pv = parseFloat(e.target.was || 1),
        ra = dv / pv,
        xv = parseFloat(ui.size.X.was ?? ui.scale.X.value) || 1,
        yv = parseFloat(ui.size.Y.was ?? ui.scale.Y.value) || 1,
        zv = parseFloat(ui.size.Z.was ?? ui.scale.Z.value) || 1,
        ta = e.target,
        xc = ui.lock.X.checked,
        yc = ui.lock.Y.checked,
        zc = ui.lock.Z.checked,
        xt = ta === ui.size.X,
        yt = ta === ui.size.Y,
        zt = ta === ui.size.Z,
        tl = (xt && xc) || (yt && yc) || (zt && zc),
        xr = ((tl && xc) || (!tl && xt) ? ra : 1),
        yr = ((tl && yc) || (!tl && yt) ? ra : 1),
        zr = ((tl && zc) || (!tl && zt) ? ra : 1);
    // prevent null scale
    if (xv * xr < 0.1 || yv * yr < 0.1 || zv * zr < 0.1) {
        api.alerts.show('invalid scale value');
        return;
    }
    selection.scale(xr,yr,zr);
    ui.size.X.was = ui.size.X.value = xv * xr;
    ui.size.Y.was = ui.size.Y.value = yv * yr;
    ui.size.Z.was = ui.size.Z.value = zv * zr;
}

/**
 * Handle scale input change event.
 * Calculates scale ratio from scale change and applies to selection.
 * Respects lock checkboxes for proportional scaling.
 * Prevents scales below 0.1.
 * @param {Event} e - Input change event
 * @param {object} ui - UI elements object with scale/lock fields
 */
function input_scale(e, ui) {
    let dv = parseFloat(e.target.value || 1),
        pv = parseFloat(e.target.was || 1),
        ra = dv / pv,
        xv = parseFloat(ui.scale.X.was ?? ui.scale.X.value) || 1,
        yv = parseFloat(ui.scale.Y.was ?? ui.scale.Y.value) || 1,
        zv = parseFloat(ui.scale.Z.was ?? ui.scale.Y.value) || 1,
        ta = e.target,
        xc = ui.lock.X.checked,
        yc = ui.lock.Y.checked,
        zc = ui.lock.Z.checked,
        xt = ta === ui.scale.X,
        yt = ta === ui.scale.Y,
        zt = ta === ui.scale.Z,
        tl = (xt && xc) || (yt && yc) || (zt && zc),
        xr = ((tl && xc) || (!tl && xt) ? ra : 1),
        yr = ((tl && yc) || (!tl && yt) ? ra : 1),
        zr = ((tl && zc) || (!tl && zt) ? ra : 1);
    // prevent null scale
    if (xv * xr < 0.1 || yv * yr < 0.1 || zv * zr < 0.1) {
        api.alerts.show('invalid scale value');
        return;
    }
    selection.scale(xr,yr,zr);
    ui.scale.X.was = ui.scale.X.value = xv * xr;
    ui.scale.Y.was = ui.scale.Y.value = yv * yr;
    ui.scale.Z.was = ui.scale.Z.value = zv * zr;
}

function parse_as_float(e) {
    e.target.value = parseFloat(e.target.value) || 0;
}

/**
 * Bind input handlers to UI elements.
 * Sets up Enter key handlers for scale, size, tool, and rotation inputs.
 * @param {object} ui - UI elements object
 */
function input_binding(ui) {
    // on enter but not on blur
    space.event.onEnterKey([
        ui.scale.X,        (e) => input_scale(e, ui),
        ui.scale.Y,        (e) => input_scale(e, ui),
        ui.scale.Z,        (e) => input_scale(e, ui),
        ui.size.X,         (e) => input_resize(e, ui),
        ui.size.Y,         (e) => input_resize(e, ui),
        ui.size.Z,         (e) => input_resize(e, ui),
    ]);
    // on enter and blur
    space.event.onEnterKey([
        ui.toolName,       updateTool,
        ui.toolNum,        updateTool,
        ui.toolFluteDiam,  updateTool,
        ui.toolFluteLen,   updateTool,
        ui.toolShaftDiam,  updateTool,
        ui.toolShaftLen,   updateTool,
        ui.toolTaperTip,   updateTool,
        ui.toolTaperAngle, updateTool,
        $('rot_x'),        parse_as_float,
        $('rot_y'),        parse_as_float,
        $('rot_z'),        parse_as_float
    ], true);
}

// extend API (api.selection)
export const selection = {
    duplicate,
    for_groups,
    for_meshes,
    for_status,
    for_widgets,
    get_bounds,
    input_binding,
    input_position,
    input_rotate,
    isolateBodies,
    merge,
    mirror,
    move,
    rotate,
    scale,
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
