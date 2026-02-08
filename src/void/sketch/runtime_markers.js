/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';

function makePointRing(radius, color, opacity = 1) {
    const seg = 24;
    const verts = [];
    for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        verts.push(Math.cos(t) * radius, Math.sin(t) * radius, 0.01);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: false
    });
    const ring = new THREE.Line(geo, mat);
    return ring;
}

function createSketchPointMarker(x = 0, y = 0, opts = {}, colors = {}) {
    const marker = new THREE.Group();
    marker.position.set(x, y, 0);
    marker.renderOrder = 8;

    const core = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 20),
        new THREE.MeshBasicMaterial({
            color: 0x8f8f8f,
            transparent: false,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    core.renderOrder = 8;
    core.userData.sketchPointPick = true;
    marker.add(core);

    const ringBlack = makePointRing(0.94, 0x101010, 0.95);
    ringBlack.renderOrder = 9;
    marker.add(ringBlack);

    const ringWhite = makePointRing(1.18, 0xffffff, 0.95);
    ringWhite.renderOrder = 10;
    marker.add(ringWhite);

    const ringHighlight = makePointRing(1.45, colors.pointsHover || 0xff9933, 0.95);
    ringHighlight.renderOrder = 11;
    ringHighlight.visible = false;
    marker.add(ringHighlight);

    marker.userData._markerParts = {
        core,
        ringBlack,
        ringWhite,
        ringHighlight
    };
    marker.userData._isVirtualOrigin = !!opts.virtualOrigin;

    return marker;
}

function createArcCenterMarker(x = 0, y = 0, colors = {}) {
    const marker = new THREE.Group();
    marker.position.set(x, y, 0);
    marker.renderOrder = 8;

    const core = new THREE.Mesh(
        new THREE.CircleGeometry(0.58, 20),
        new THREE.MeshBasicMaterial({
            color: 0x8f8f8f,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    core.renderOrder = 8;
    marker.add(core);

    const ring = makePointRing(0.9, 0xffffff, 0.9);
    ring.renderOrder = 9;
    marker.add(ring);

    const ringHighlight = makePointRing(1.15, colors.pointsHover || 0xff9933, 0.95);
    ringHighlight.renderOrder = 10;
    ringHighlight.visible = false;
    marker.add(ringHighlight);

    marker.userData._markerParts = {
        core,
        ringWhite: ring,
        ringHighlight
    };
    marker.userData._isArcCenter = true;
    return marker;
}

export {
    makePointRing,
    createSketchPointMarker,
    createArcCenterMarker
};
