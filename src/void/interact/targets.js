/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';

import { api } from '../api.js';

function getPrimarySketchTarget() {
    return this.resolveSketchTarget(this.hoverIntersection) || this.resolveSketchTargetFromSelection();
}

function resolveSketchTargetFromSelection() {
    const selectedFaceKeys = api.solids?.getSelectedFaceKeys?.() || Array.from(this.selectedSolidFaceKeys || []);
    const selectedFaceCount = selectedFaceKeys.length;
    if (selectedFaceCount > 0) {
        if (selectedFaceCount === 1) {
            const key = selectedFaceKeys[0];
            const target = api.solids?.getSketchTargetForFaceKey?.(key);
            if (target?.frame) {
                return target;
            }
        }
        // If any solid face is selected but it's not a valid sketch target (for now: non-planar),
        // do not silently fall back to a datum plane.
        return null;
    }
    if (this.selectedPlanes.size !== 1) {
        return null;
    }
    const plane = this.selectedPlanes.values().next().value;
    return this.sketchTargetFromPlane(plane);
}

function resolveSketchTarget(intersection) {
    const object = intersection?.object;
    if (!object) return null;

    const resolver = object.userData?.sketchTargetResolver;
    if (typeof resolver === 'function') {
        const resolved = resolver({ intersection, object });
        if (resolved?.frame) {
            return resolved;
        }
    }

    const plane = object.userData?.plane;
    if (plane) {
        return this.sketchTargetFromPlane(plane);
    }

    if (intersection.face && object.geometry) {
        return this.sketchTargetFromFace(intersection, object);
    }

    return null;
}

function sketchTargetFromPlane(plane) {
    if (!plane || typeof plane.getFrame !== 'function') {
        return null;
    }
    return {
        kind: 'plane',
        id: plane.id,
        name: plane.name || plane.label || 'Plane',
        label: plane.label || null,
        frame: plane.getFrame(),
        source: {
            type: 'plane',
            id: plane.id
        }
    };
}

function sketchTargetFromFace(intersection, object) {
    if (!intersection?.face || !object) {
        return null;
    }

    object.updateMatrixWorld(true);

    const normal = intersection.face.normal.clone().transformDirection(object.matrixWorld).normalize();
    const center = this.getFaceCenterWorld(intersection, object) || intersection.point?.clone();
    if (!center) return null;

    const xAxis = this.getFaceXAxisWorld(intersection, object, normal);
    if (!xAxis) return null;

    const faceIndex = intersection.faceIndex ?? -1;
    return {
        kind: 'face',
        id: `${object.uuid}:f${faceIndex}`,
        name: 'Face',
        frame: this.makeFrame(center, normal, xAxis),
        source: {
            type: 'face',
            object_id: object.uuid,
            face_index: faceIndex
        }
    };
}

function makeFrame(origin, normal, xAxis) {
    return {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        x_axis: { x: xAxis.x, y: xAxis.y, z: xAxis.z }
    };
}

function getFaceXAxisWorld(intersection, object, normal) {
    const geom = object.geometry;
    const face = intersection.face;
    const pos = geom?.attributes?.position;
    if (!face || !pos) {
        return this.projectAxisOnPlane(new THREE.Vector3(1, 0, 0), normal);
    }

    const a = new THREE.Vector3().fromBufferAttribute(pos, face.a).applyMatrix4(object.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(pos, face.b).applyMatrix4(object.matrixWorld);
    const edge = b.sub(a);
    if (edge.lengthSq() < 1e-12) {
        return this.projectAxisOnPlane(new THREE.Vector3(1, 0, 0), normal);
    }
    return this.projectAxisOnPlane(edge, normal);
}

function projectAxisOnPlane(axis, normal) {
    const out = axis.clone().addScaledVector(normal, -axis.dot(normal));
    if (out.lengthSq() < 1e-12) {
        const fallback = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        fallback.addScaledVector(normal, -fallback.dot(normal));
        if (fallback.lengthSq() < 1e-12) {
            return null;
        }
        return fallback.normalize();
    }
    return out.normalize();
}

export {
    getPrimarySketchTarget,
    resolveSketchTargetFromSelection,
    resolveSketchTarget,
    sketchTargetFromPlane,
    sketchTargetFromFace,
    makeFrame,
    getFaceXAxisWorld,
    projectAxisOnPlane
};
