/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';

function getInteractiveObjects() {
    const objects = [];
    for (const plane of this.planes) {
        if (!plane?.getGroup?.().visible) {
            continue;
        }
        // Add plane mesh and outline
        objects.push(plane.mesh);
        // objects.push(plane.outline);
        // Add handles if plane is selected
        if (this.selectedPlanes.has(plane)) {
            objects.push(...plane.handles);
        }
    }

    if (this.isSketchEditing && this.isSketchEditing()) {
        const sketch = this.getEditingSketchFeature && this.getEditingSketchFeature();
        const rec = sketch?.id ? api.sketchRuntime?.getRecord?.(sketch.id) : null;
        if (rec?.entityViews) {
            for (const view of rec.entityViews.values()) {
                if (view?.object) {
                    objects.push(view.object);
                }
            }
        }
    }

    // DON'T add trackPlane here - space.js adds it as trackTo separately
    // This ensures it's detected as trackInt, not selectInt

    return objects;
}

function registerPlane(plane) {
    if (!this.planes.includes(plane)) {
        this.planes.push(plane);
        this.updateHandleScreenScales();
    }
}

function unregisterPlane(plane) {
    const index = this.planes.indexOf(plane);
    if (index >= 0) {
        this.planes.splice(index, 1);
    }
    this.selectedPlanes.delete(plane);
    if (this.hoveredPlane === plane) {
        this.hoveredPlane = null;
    }
    this.updateHandleScreenScales();
}

function setupHandleScaleHooks() {
    const viewCtrl = space.view.ctrl;
    if (viewCtrl && viewCtrl.addEventListener) {
        viewCtrl.addEventListener('change', () => {
            this.updateHandleScreenScales();
        });
    }
    window.addEventListener('resize', () => {
        this.updateHandleScreenScales();
    });
}

function updateHandleScreenScales() {
    const { camera, renderer } = space.internals();
    if (!camera || !renderer) return;

    const viewHeightPx = renderer.domElement?.clientHeight || renderer.domElement?.height;
    if (!viewHeightPx) return;

    for (const plane of this.planes) {
        if (!plane?.handles?.length) continue;
        for (const handle of plane.handles) {
            handle.getWorldPosition(this._tmpWorldPos);

            let worldPerPixel;
            if (camera.isPerspectiveCamera) {
                const distance = camera.position.distanceTo(this._tmpWorldPos);
                const fovRad = camera.fov * Math.PI / 180;
                worldPerPixel = (2 * Math.tan(fovRad / 2) * distance) / viewHeightPx;
            } else if (camera.isOrthographicCamera) {
                worldPerPixel = ((camera.top - camera.bottom) / camera.zoom) / viewHeightPx;
            } else {
                continue;
            }

            const desiredWorldRadius = this.handleScreenRadiusPx * worldPerPixel;
            const scale = Math.max(0.001, desiredWorldRadius / this.handleBaseRadius);
            handle.scale.setScalar(scale);
        }
    }
}

function handleHover(intersection, event, allIntersections) {
    const pointHit = this.getPointHitFromEvent(event);
    if (pointHit) {
        this.hoverIntersection = null;
        this.setHoveredPoint(pointHit.id);
        if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
            this.hoveredPlane.setHovered(false);
            this.hoveredPlane = null;
        }
        return;
    }

    this.setHoveredPoint(null);

    // No intersection means mouse left all objects
    if (!intersection) {
        this.hoverIntersection = null;
        if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
            this.hoveredPlane.setHovered(false);
            this.hoveredPlane = null;
        }
        return;
    }

    this.hoverIntersection = intersection;

    // Use first intersection (closest) - just like kiri/mesh
    const plane = intersection.object?.userData?.plane;
    const planeVisible = plane?.getGroup?.().visible !== false;

    if (plane && planeVisible && !plane.isSelected()) {
        // Found a plane that's not selected
        if (this.hoveredPlane !== plane) {
            // Clear previous hover
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
            }
            // Set new hover
            plane.setHovered(true);
            this.hoveredPlane = plane;
        }
    } else if (!plane || !planeVisible || plane.isSelected()) {
        // No plane found or plane is already selected, clear hover
        if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
            this.hoveredPlane.setHovered(false);
            this.hoveredPlane = null;
        }
    }
}

function getPlaneFromIntersection(intersection) {
    if (!intersection || !intersection.object) return null;
    return intersection.object.userData?.plane || null;
}

function getBestPlaneFromIntersections(allIntersections) {
    if (!allIntersections || allIntersections.length === 0) return null;

    const internals = space.internals();
    const camera = internals.camera;
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    let bestPlane = null;
    let bestDot = Infinity;

    for (const int of allIntersections) {
        const plane = int.object?.userData?.plane;
        if (!plane) continue;
        if (plane.getGroup?.().visible === false) continue;

        if (int.face && int.face.normal) {
            const normal = int.face.normal.clone();
            normal.transformDirection(int.object.matrixWorld);
            const dot = normal.dot(cameraDir);
            if (dot < bestDot) {
                bestDot = dot;
                bestPlane = plane;
            }
        }
    }

    return bestPlane;
}

function handleMouseUp(intersection, event, allIntersections) {
    if (this.draggedHandle) {
        this.draggedHandle = null;
        this.draggedPlane = null;
        this.dragHandleName = null;
        this.dragAnchorPos = null;
        this.dragStartSizes.clear();
        this.dragStartCenters.clear();
        return;
    }

    const pointHit = this.getPointHitFromEvent(event);
    if (pointHit) {
        this.selectPoint(pointHit.id, event);
        return;
    }

    if (!intersection) {
        const inViewport = this.isEventInsideViewport(event);
        if (!inViewport) {
            return;
        }
        if (!event.ctrlKey && !event.metaKey) {
            this.deselectAll();
        }
        return;
    }

    const best = this.getBestPlaneFromIntersections(allIntersections);
    const plane = (best && best.getGroup?.().visible !== false) ? best : intersection.object?.userData?.plane;
    if (plane) {
        this.selectPlane(plane, event);
    } else if (!event.ctrlKey && !event.metaKey) {
        this.deselectAll();
    }
}

function startHandleDrag(handle, intersection, event) {
    const plane = handle.userData.plane;
    if (!plane) return;

    this.draggedHandle = handle;
    this.draggedPlane = plane;
    this.dragHandleName = handle.userData.handleName;

    const oppositeCornerName = this.getOppositeCorner(this.dragHandleName);
    const oppositeHandle = plane.handles.find(h => h.userData.handleName === oppositeCornerName);

    if (oppositeHandle) {
        this.dragAnchorPos = new THREE.Vector3();
        oppositeHandle.getWorldPosition(this.dragAnchorPos);
    }

    this.dragStartSizes.clear();
    this.dragStartCenters = new Map();
    for (const selectedPlane of this.selectedPlanes) {
        this.dragStartSizes.set(selectedPlane, selectedPlane.size);
        const center = new THREE.Vector3();
        selectedPlane.group.getWorldPosition(center);
        this.dragStartCenters.set(selectedPlane, center);
    }
}

function getOppositeCorner(cornerName) {
    const opposites = {
        'top-right': 'bottom-left',
        'top-left': 'bottom-right',
        'bottom-right': 'top-left',
        'bottom-left': 'top-right'
    };
    return opposites[cornerName];
}

function handleDrag(delta, offset, isDone, intersections) {
    if (!this.draggedHandle || !this.draggedPlane) return;
    if (isDone) return;

    const event = delta.event;
    if (!event) return;

    const internals = space.internals();
    const camera = internals.camera;
    const container = internals.container;

    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mouseNDC = new THREE.Vector2(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseNDC, camera);

    this.draggedPlane.group.updateMatrixWorld(true);

    const planeNormal = new THREE.Vector3();
    this.draggedPlane.mesh.matrixWorld.extractBasis(
        new THREE.Vector3(),
        new THREE.Vector3(),
        planeNormal
    );

    const planeCenter = new THREE.Vector3();
    this.draggedPlane.group.getWorldPosition(planeCenter);

    const intersectPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planeCenter);
    const newHandlePos = new THREE.Vector3();
    raycaster.ray.intersectPlane(intersectPlane, newHandlePos);

    if (!newHandlePos || !this.dragAnchorPos) return;

    const xAxis = new THREE.Vector3();
    const yAxis = new THREE.Vector3();
    const zAxis = new THREE.Vector3();
    this.draggedPlane.mesh.matrixWorld.extractBasis(xAxis, yAxis, zAxis);

    const diagonal = new THREE.Vector3().subVectors(newHandlePos, this.dragAnchorPos);
    const newWidth = Math.max(10, Math.abs(diagonal.dot(xAxis)));
    const newHeight = Math.max(10, Math.abs(diagonal.dot(yAxis)));
    const newCenterWorld = new THREE.Vector3().addVectors(this.dragAnchorPos, newHandlePos).multiplyScalar(0.5);

    this.draggedPlane.setSize(newWidth, newHeight);

    if (this.draggedPlane.group.parent) {
        const newCenterLocal = this.draggedPlane.group.parent.worldToLocal(newCenterWorld.clone());
        this.draggedPlane.group.position.copy(newCenterLocal);
    } else {
        this.draggedPlane.group.position.copy(newCenterWorld);
    }

    this.draggedPlane.notifyChange();
    this.updateHandleScreenScales();
    space.update();
}

function viewNormalToHover() {
    let target = this.resolveTreeHoverNormalTarget() || this.resolveViewNormalTarget(this.hoverIntersection) || this.resolveViewNormalFromSelection();
    if (!target && this.isSketchEditing && this.isSketchEditing()) {
        const sketch = this.getEditingSketchFeature && this.getEditingSketchFeature();
        const rec = sketch?.id ? api.sketchRuntime?.getRecord?.(sketch.id) : null;
        const runtimePlane = rec?.plane;
        if (runtimePlane?.mesh && runtimePlane?.group) {
            runtimePlane.mesh.updateMatrixWorld(true);
            runtimePlane.group.updateMatrixWorld(true);
            const xAxis = new THREE.Vector3();
            const yAxis = new THREE.Vector3();
            const normal = new THREE.Vector3();
            runtimePlane.mesh.matrixWorld.extractBasis(xAxis, yAxis, normal);
            normal.normalize();
            const point = new THREE.Vector3();
            runtimePlane.group.getWorldPosition(point);
            target = { normal, point };
        } else if (sketch?.plane) {
            const frame = sketch.plane;
            const normal = new THREE.Vector3(
                frame.normal?.x ?? 0,
                frame.normal?.y ?? 0,
                frame.normal?.z ?? 1
            ).normalize();
            const point = new THREE.Vector3(
                frame.origin?.x || 0,
                frame.origin?.y || 0,
                frame.origin?.z || 0
            );
            target = { normal, point };
        }
    }
    if (!target) {
        return false;
    }

    const { normal, point } = target;
    const { camera } = space.internals();
    const focus = space.view.getFocus().clone();

    const camDir = camera.position.clone().sub(focus).normalize();
    const normalA = normal.clone().normalize();
    const normalB = normalA.clone().negate();
    const offsetDir = camDir.dot(normalA) >= camDir.dot(normalB) ? normalA : normalB;

    const left = Math.atan2(offsetDir.x, offsetDir.z);
    const up = Math.acos(Math.max(-1, Math.min(1, offsetDir.y)));

    space.view.panTo(point.x, point.y, point.z, left, up);
    return true;
}

function resolveTreeHoverNormalTarget() {
    const hoveredSketchId = api.sketchRuntime?.hoveredId;
    if (hoveredSketchId) {
        const rec = api.sketchRuntime?.getRecord?.(hoveredSketchId);
        const runtimePlane = rec?.plane;
        if (runtimePlane?.mesh && runtimePlane?.group) {
            runtimePlane.mesh.updateMatrixWorld(true);
            runtimePlane.group.updateMatrixWorld(true);
            const xAxis = new THREE.Vector3();
            const yAxis = new THREE.Vector3();
            const normal = new THREE.Vector3();
            runtimePlane.mesh.matrixWorld.extractBasis(xAxis, yAxis, normal);
            normal.normalize();
            const point = new THREE.Vector3();
            runtimePlane.group.getWorldPosition(point);
            return { normal, point };
        }
    }

    for (const plane of this.planes || []) {
        if (!plane?.isHovered?.()) continue;
        if (plane?.getGroup?.() && !plane.getGroup().visible) continue;
        if (!plane?.mesh || !plane?.group) continue;
        plane.mesh.updateMatrixWorld(true);
        plane.group.updateMatrixWorld(true);
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        const normal = new THREE.Vector3();
        plane.mesh.matrixWorld.extractBasis(xAxis, yAxis, normal);
        normal.normalize();
        const point = new THREE.Vector3();
        plane.group.getWorldPosition(point);
        return { normal, point };
    }

    return null;
}

function toggleDatumPlanesVisibility() {
    if (!Array.isArray(this.planes) || this.planes.length === 0) {
        return false;
    }
    const allVisible = this.planes.every(plane => plane?.getGroup?.().visible !== false);
    const nextVisible = !allVisible;
    for (const plane of this.planes) {
        plane?.setVisible?.(nextVisible);
    }
    return true;
}

function resolveViewNormalFromSelection() {
    if (this.selectedPlanes.size !== 1) {
        return null;
    }
    const plane = this.selectedPlanes.values().next().value;
    if (plane?.getGroup && !plane.getGroup().visible) {
        return null;
    }
    if (!plane?.mesh || !plane?.group) {
        return null;
    }

    plane.mesh.updateMatrixWorld(true);
    plane.group.updateMatrixWorld(true);

    const xAxis = new THREE.Vector3();
    const yAxis = new THREE.Vector3();
    const normal = new THREE.Vector3();
    plane.mesh.matrixWorld.extractBasis(xAxis, yAxis, normal);
    normal.normalize();

    const point = new THREE.Vector3();
    plane.group.getWorldPosition(point);

    return { normal, point };
}

function resolveViewNormalTarget(intersection) {
    const object = intersection?.object;
    if (!object) return null;
    const plane = object.userData?.plane;
    if (plane && !plane.getGroup?.().visible) {
        return null;
    }

    const resolver = object.userData?.viewNormalResolver;
    if (typeof resolver === 'function') {
        const resolved = resolver({ intersection, object });
        if (resolved?.normal && resolved?.point) {
            return resolved;
        }
    }

    object.updateMatrixWorld(true);

    let normal = null;
    if (intersection.face?.normal) {
        normal = intersection.face.normal.clone().transformDirection(object.matrixWorld).normalize();
    }

    if (!normal && object.userData?.plane?.mesh) {
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        normal = new THREE.Vector3();
        object.userData.plane.mesh.matrixWorld.extractBasis(xAxis, yAxis, normal);
        normal.normalize();
    }

    if (!normal) return null;

    const point = this.getFaceCenterWorld(intersection, object) || (() => {
        const p = new THREE.Vector3();
        object.getWorldPosition(p);
        return p;
    })();

    return { normal, point };
}

function getFaceCenterWorld(intersection, object) {
    if (object.userData?.plane?.group) {
        const center = new THREE.Vector3();
        object.userData.plane.group.getWorldPosition(center);
        return center;
    }

    const geom = object.geometry;
    const face = intersection.face;

    if (geom?.attributes?.position && face) {
        const pos = geom.attributes.position;
        const a = new THREE.Vector3().fromBufferAttribute(pos, face.a);
        const b = new THREE.Vector3().fromBufferAttribute(pos, face.b);
        const c = new THREE.Vector3().fromBufferAttribute(pos, face.c);
        const center = a.add(b).add(c).multiplyScalar(1 / 3);
        return center.applyMatrix4(object.matrixWorld);
    }

    return null;
}

export {
    getInteractiveObjects,
    registerPlane,
    unregisterPlane,
    setupHandleScaleHooks,
    updateHandleScreenScales,
    handleHover,
    getPlaneFromIntersection,
    getBestPlaneFromIntersections,
    handleMouseUp,
    startHandleDrag,
    getOppositeCorner,
    handleDrag,
    viewNormalToHover,
    resolveTreeHoverNormalTarget,
    toggleDatumPlanesVisibility,
    resolveViewNormalFromSelection,
    resolveViewNormalTarget,
    getFaceCenterWorld
};
