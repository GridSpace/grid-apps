/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { space } from '../../moto/space.js';
import { updateTool } from '../mode/cam/tools.js';

const { selection } = api;

function settings() {
    return api.conf.get();
}

function boundsSelection() {
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

function rotateInputSelection() {
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

function positionSelection() {
    if (selection.meshes().length === 0) {
        api.show.alert("select object to position");
        return;
    }
    let current = settings(),
        { device, process} = current,
        center = process.ctOriginCenter || process.camOriginCenter || device.bedRound || device.originCenter,
        bounds = boundsSelection();

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

function selectionSize(e, ui) {
    let dv = parseFloat(e.target.value || 1),
        pv = parseFloat(e.target.was || 1),
        ra = dv / pv,
        xv = parseFloat(ui.sizeX.was ?? ui.scaleX.value) || 1,
        yv = parseFloat(ui.sizeY.was ?? ui.scaleY.value) || 1,
        zv = parseFloat(ui.sizeZ.was ?? ui.scaleZ.value) || 1,
        ta = e.target,
        xc = ui.lockX.checked,
        yc = ui.lockY.checked,
        zc = ui.lockZ.checked,
        xt = ta === ui.sizeX,
        yt = ta === ui.sizeY,
        zt = ta === ui.sizeZ,
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
    ui.sizeX.was = ui.sizeX.value = xv * xr;
    ui.sizeY.was = ui.sizeY.value = yv * yr;
    ui.sizeZ.was = ui.sizeZ.value = zv * zr;
}

function selectionScale(e, ui) {
    let dv = parseFloat(e.target.value || 1),
        pv = parseFloat(e.target.was || 1),
        ra = dv / pv,
        xv = parseFloat(ui.scaleX.was ?? ui.scaleX.value) || 1,
        yv = parseFloat(ui.scaleY.was ?? ui.scaleY.value) || 1,
        zv = parseFloat(ui.scaleZ.was ?? ui.scaleY.value) || 1,
        ta = e.target,
        xc = ui.lockX.checked,
        yc = ui.lockY.checked,
        zc = ui.lockZ.checked,
        xt = ta === ui.scaleX,
        yt = ta === ui.scaleY,
        zt = ta === ui.scaleZ,
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
    ui.scaleX.was = ui.scaleX.value = xv * xr;
    ui.scaleY.was = ui.scaleY.value = yv * yr;
    ui.scaleZ.was = ui.scaleZ.value = zv * zr;
}

function selectionRotate(e) {
    let val = parseFloat(e.target.value) || 0;
    e.target.value = val;
}

function setupSelectionBindings(ui) {
    // on enter but not on blur
    space.event.onEnterKey([
        ui.scaleX,        (e) => selectionScale(e, ui),
        ui.scaleY,        (e) => selectionScale(e, ui),
        ui.scaleZ,        (e) => selectionScale(e, ui),
        ui.sizeX,         (e) => selectionSize(e, ui),
        ui.sizeY,         (e) => selectionSize(e, ui),
        ui.sizeZ,         (e) => selectionSize(e, ui),
    ]);
    // on enter and blur
    space.event.onEnterKey([
        ui.toolName,      updateTool,
        ui.toolNum,       updateTool,
        ui.toolFluteDiam, updateTool,
        ui.toolFluteLen,  updateTool,
        ui.toolShaftDiam, updateTool,
        ui.toolShaftLen,  updateTool,
        ui.toolTaperTip,  updateTool,
        ui.toolTaperAngle, updateTool,
        $('rot_x'),       selectionRotate,
        $('rot_y'),       selectionRotate,
        $('rot_z'),       selectionRotate
    ], true);
}

export const selectionTools = {
    rotateInputSelection,
    positionSelection,
    setupSelectionBindings
};
