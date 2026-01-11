/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Face selection tools for mesh manipulation.
 * Provides interactive tools for:
 * - Lay flat: Rotate selected face to be parallel with build plate
 * - Left align: Rotate to align face normal with -X axis
 * - Face up: Select face normal for custom operations
 * - Camera focus: Select point for camera focus
 *
 * Tools use hover mode to display visual indicator on face under cursor.
 * User clicks face to apply operation. ESC to cancel.
 */

import { api } from './api.js';
import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';

const { Vector3, Quaternion } = THREE;

/** X-axis unit vector for rotation calculations */
const XAXIS = new THREE.Vector3(1,0,0);

/** Z-axis unit vector for rotation calculations */
const ZAXIS = new THREE.Vector3(0,0,1);

/** Circle mesh geometry for face indicator */
let pgeo = new THREE.CircleGeometry(8, 30);

/** Semi-transparent material for face indicator */
let pmat = new THREE.MeshBasicMaterial({color: 0xddeeff, opacity: 0.6, transparent: true});

/** Combined mesh for face indicator (circle + outline) */
let pmesh = new THREE.Mesh(pgeo, pmat);

// Build circle outline from geometry indices
let pi = pgeo.index.array;
let pp = pgeo.attributes.position.array;
let np = [];
for (let i=0; i<pi.length; i++) {
    if (pi[i] * pi[i+1]) {
        np.push(pp[pi[i]*3+0]);
        np.push(pp[pi[i]*3+1]);
        np.push(pp[pi[i]*3+2]);
        np.push(pp[pi[i+1]*3+0]);
        np.push(pp[pi[i+1]*3+1]);
        np.push(pp[pi[i+1]*3+2]);
    }
}

let wgeo = new THREE.BufferGeometry();
wgeo.setAttribute('position', new THREE.BufferAttribute(np.toFloat32(), 3));

let wmat = new THREE.LineBasicMaterial({ color: 0x6699cc });
let wmesh = new THREE.LineSegments(wgeo, wmat);
pmesh.add(wmesh);

/** Alert handle for "ESC to end" message */
let alert;

/** Last object (widget mesh) the indicator was attached to */
let lastobj;

/** Last face that was hovered over */
let lastface;

/** Whether a tool is currently active */
let enabled = false;

/** Name of current operation for display */
let opName = 'lay flat';

/** Callback to execute when face is selected */
let onDone = onLayFlatSelect;

/**
 * Lay flat operation: Rotate widget so selected face is parallel to build plate.
 * Calculates quaternion to align face normal with -Z axis (down).
 */
function onLayFlatSelect() {
    let q = new Quaternion().setFromUnitVectors(lastface.normal, new Vector3(0,0,-1));
    api.selection.rotate(q);
    // endIt();
}

/**
 * Left align operation: Rotate widget so selected face normal aligns with -X axis.
 * Projects face normal onto XY plane and calculates Z-axis rotation.
 * Used for orienting parts for belt printers or side printing.
 */
function onLeftySelect() {
    // Project the face normal onto the XY plane (ignore Z component)
    let projectedNormal = new Vector3(lastface.normal.x, lastface.normal.y, 0).normalize();

    // Target direction on XY plane (negative Y axis)
    let targetDir = new Vector3(-1, 0, 0);

    // Calculate angle between projected normal and target
    let angle = Math.atan2(
        projectedNormal.x * targetDir.y - projectedNormal.y * targetDir.x, // cross product Z component
        projectedNormal.x * targetDir.x + projectedNormal.y * targetDir.y  // dot product
    );

    // Create quaternion for Z-axis rotation only
    let q = new Quaternion().setFromAxisAngle(ZAXIS, angle);
    api.selection.rotate(q);
}

/**
 * Face select operation: Emit face normal for custom handling.
 * Emits 'tool.mesh.face-normal' event with selected face normal.
 */
function onFaceUpSelect() {
    api.event.emit('tool.mesh.face-normal', lastface.normal);
    // endIt();
}

/**
 * Start interactive face selection tool.
 * Enables hover mode, displays alert, and begins tracking mouse.
 * If already enabled, ends the current operation.
 * Cannot start if another hover mode is active.
 */
function startIt() {
    if (enabled) {
        endIt();
        return;
    }
    if (api.feature.hover) {
        console.log(`${opName} cannot pre-empt hover`);
        return;
    }
    api.feature.hover = true;
    enabled = true;
    alert = api.show.alert(`[ESC] to end ${opName}`, 600000);
}

/**
 * End current face selection tool.
 * Disables hover mode, hides alert, and cleans up indicator mesh.
 */
function endIt() {
    if (enabled) {
        api.hide.alert(alert);
        api.feature.hover = false;
        enabled = false;
        alert = undefined;
        cleanup();
    }
}

/**
 * Remove face indicator mesh from scene.
 */
function cleanup() {
    if (lastobj) {
        lastobj.remove(pmesh);
        lastobj = undefined;
    }
}

api.event.on('key.esc', endIt);

/**
 * Start camera focus tool.
 * User clicks face to set camera focus point.
 * @param {Function} fn - Callback to execute with focus point
 */
function startFocus(fn) {
    opName = 'camera focus';
    onDone = fn;
    startIt();
}

/**
 * Start face selection tool.
 * User clicks face to select its normal vector.
 */
function startFaceUp() {
    opName = 'face select';
    onDone = onFaceUpSelect;
    startIt();
}

/**
 * Start lay flat tool.
 * User clicks face to rotate widget so that face is parallel to build plate.
 */
function startLayFlat() {
    opName = 'lay flat';
    onDone = onLayFlatSelect;
    startIt();
}

/**
 * Start left align tool.
 * User clicks face to align its normal with -X axis.
 */
function startLeftAlign() {
    opName = 'align y axis';
    onDone = onLeftySelect;
    startIt();
}

/**
 * Scale face indicator based on camera distance.
 * For camera focus, scales inversely (closer = smaller).
 * For other tools, scales with distance for consistent visual size.
 */
function scale() {
    let cam = space.internals().camera;
    let dist = cam.position.distanceTo(pmesh.position);
    let scale = opName === 'camera focus' ?
        Math.min(0.25, 100 / dist) : dist / 100;
    pmesh.scale.set(scale,scale,scale);
}

api.event.on('mouse.hover', (ev) => {
    if (!enabled) {
        return;
    }
    cleanup();
    let { int, ints, event, point, type } = ev;
    if (type === 'widget') {
        lastface = int.face;
        let obj = lastobj = int.object;
        let norm = int.face.normal;
        let widget = obj.widget;
        let track = widget.track;
        let opos = track.pos;
        obj.add(pmesh);
        pmesh.position.x = point.x - opos.x + norm.x * 0.1;
        if (track.indexed) {
            let rad = track.indexRad;
            let py = point.y * 1.001;
            let pz = point.z * 1.001;
            let v = new THREE.Vector3(point.x, py, pz).applyAxisAngle(XAXIS, rad);
            pmesh.position.y = -v.z;
            pmesh.position.z = v.y;
        } else {
            const zcomp = api.mode.get() === 'CAM' ? track.tzoff : 0;
            pmesh.position.y = -point.z - opos.y + norm.y * 0.1;
            pmesh.position.z = point.y + zcomp + norm.z * 0.1;
        }
        let q = new Quaternion().setFromUnitVectors(ZAXIS,
            new Vector3(norm.x,norm.y,norm.z)
        );
        pmesh.setRotationFromQuaternion(q);
        scale();
    }
});

api.event.on('mouse.hover.up', (ev) => {
    if (!enabled) {
        return;
    }
    let { object } = ev;
    if (!object) {
        return;
    }
    onDone(ev);
    endIt();
});

export {
    cleanup,
    endIt,
    onDone,
    onFaceUpSelect,
    onLayFlatSelect,
    scale,
    startFaceUp,
    startFocus,
    startIt,
    startLeftAlign,
    startLayFlat,
};
