/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';
import { properties } from '../properties.js';

function getInteractiveObjects() {
    const objects = [];
    const retargetMode = !!(this.isSketchRetargetMode && this.isSketchRetargetMode());
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

    if (!retargetMode) {
        for (const rec of api.sketchRuntime?.sketches?.values?.() || []) {
            if (!rec?.entitiesGroup?.visible) continue;
            for (const view of rec.entityViews?.values?.() || []) {
                if (view?.type === 'profile' && view.object?.visible !== false) {
                    objects.push(view.object);
                }
            }
        }
    }
    if (!(this.isSketchEditing && this.isSketchEditing()) || (this.isSketchRetargetMode && this.isSketchRetargetMode())) {
        for (const mesh of api.solids?.getPickMeshes?.() || []) {
            objects.push(mesh);
        }
    }

    if (this.isSketchEditing && this.isSketchEditing() && !(this.isSketchRetargetMode && this.isSketchRetargetMode())) {
        const sketch = this.getEditingSketchFeature && this.getEditingSketchFeature();
        const rec = sketch?.id ? api.sketchRuntime?.getRecord?.(sketch.id) : null;
        if (rec?.entityViews) {
            const points = [];
            const lines = [];
            for (const view of rec.entityViews.values()) {
                if (view?.object) {
                    if (view.type === 'point') {
                        const parts = view.object.userData?._markerParts || {};
                        if (parts.core) {
                            points.push(parts.core);
                        } else {
                            points.push(view.object);
                        }
                    } else {
                        lines.push(view.object);
                    }
                }
            }
            objects.push(...points, ...lines);
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
    if (!(this.isSketchEditing && this.isSketchEditing()) || (this.isSketchRetargetMode && this.isSketchRetargetMode())) {
        const primaryHit = this.getPrimarySurfaceHitFromIntersections(allIntersections || (intersection ? [intersection] : []));
        if (primaryHit?.type === 'profile') {
            const profileHit = primaryHit.hit;
            if (this.hoveredSolidFaceKey) {
                this.hoveredSolidFaceKey = null;
                api.solids?.setHoveredFace?.(null);
            }
            const key = `${profileHit.featureId}:${profileHit.profileId}`;
            this.hoveredSketchProfileKey = key;
            api.sketchRuntime?.setHoveredProfile(key);
            this.hoverIntersection = intersection || null;
            this.setHoveredPoint(null);
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
                this.hoveredPlane = null;
            }
            window.dispatchEvent(new CustomEvent('void-state-change'));
            return;
        }
        if (this.hoveredSketchProfileKey) {
            this.hoveredSketchProfileKey = null;
            api.sketchRuntime?.setHoveredProfile(null);
        }
        if (primaryHit?.type === 'solid-face') {
            const solidFaceHit = primaryHit.hit;
            this.hoveredSolidFaceKey = solidFaceHit.key;
            api.solids?.setHoveredFace?.(solidFaceHit.key);
            this.hoverIntersection = solidFaceHit.intersection || intersection || null;
            this.setHoveredPoint(null);
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
                this.hoveredPlane = null;
            }
            window.dispatchEvent(new CustomEvent('void-state-change'));
            return;
        }
        if (this.hoveredSolidFaceKey) {
            this.hoveredSolidFaceKey = null;
            api.solids?.setHoveredFace?.(null);
            window.dispatchEvent(new CustomEvent('void-state-change'));
        }
    }

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

    if (!(this.isSketchEditing && this.isSketchEditing()) || (this.isSketchRetargetMode && this.isSketchRetargetMode())) {
        const primaryHit = this.getPrimarySurfaceHitFromIntersections(allIntersections || (intersection ? [intersection] : []));
        if (primaryHit?.type === 'profile') {
            this.selectSketchProfile(primaryHit.hit, event);
            return;
        }
        if (primaryHit?.type === 'solid-face') {
            this.selectSolidFace(primaryHit.hit, event);
            return;
        }
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

function getSketchProfileHitFromIntersections(intersections) {
    if (!Array.isArray(intersections)) return null;
    for (const hit of intersections) {
        const obj = hit?.object;
        const profileId = obj?.userData?.sketchProfileId || null;
        const featureId = obj?.userData?.sketchFeatureId || null;
        if (profileId && featureId) {
            return { featureId, profileId, object: obj };
        }
    }
    return null;
}

function getPrimarySurfaceHitFromIntersections(intersections) {
    if (!Array.isArray(intersections)) return null;
    const retargetMode = !!(this.isSketchRetargetMode && this.isSketchRetargetMode());
    const SKETCH_FACE_EPSILON = 0.25;
    let nearestProfile = null;
    let nearestSolidFace = null;
    for (const hit of intersections) {
        const obj = hit?.object;
        if (!obj) continue;
        const profileId = obj.userData?.sketchProfileId || null;
        const featureId = obj.userData?.sketchFeatureId || null;
        if (!retargetMode && !nearestProfile && profileId && featureId) {
            nearestProfile = {
                type: 'profile',
                distance: Number(hit?.distance) || 0,
                hit: { featureId, profileId, object: obj, intersection: hit }
            };
        }
        if (!nearestSolidFace) {
            const solidFaceHit = api.solids?.getFaceHitFromIntersections?.([hit]);
            if (solidFaceHit) {
                nearestSolidFace = {
                    type: 'solid-face',
                    distance: Number(hit?.distance) || 0,
                    hit: solidFaceHit
                };
            }
        }
        if (nearestProfile && nearestSolidFace) {
            const delta = nearestProfile.distance - nearestSolidFace.distance;
            if (delta <= SKETCH_FACE_EPSILON) {
                return nearestProfile;
            }
            return nearestSolidFace;
        }
    }
    if (nearestProfile) return nearestProfile;
    if (nearestSolidFace) return nearestSolidFace;
    return null;
}

function selectSketchProfile(hit, event) {
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    if (currentFeature?.type === 'extrude') {
        const rawLoops = hit?.object?.userData?.sketchProfileLoops
            || (hit?.object?.userData?.sketchProfileLoop ? [hit.object.userData.sketchProfileLoop] : null);
        const loops = Array.isArray(rawLoops)
            ? rawLoops
                .filter(loop => Array.isArray(loop) && loop.length >= 3)
                .map(loop => loop.map(p => ({ x: p?.x || 0, y: p?.y || 0 })))
            : [];
        const profile = { sketchId: hit.featureId, profileId: hit.profileId };
        if (loops.length) {
            profile.loops = loops;
        }
        const updated = api.features.update(currentFeature.id, feature => {
            feature.input = feature.input || {};
            const current = Array.isArray(feature.input.profiles) ? feature.input.profiles : [];
            const key = `${profile.sketchId}:${profile.profileId}`;
            const has = current.some(p => `${p?.sketchId}:${p?.profileId}` === key);
            const next = has
                ? current.filter(p => `${p?.sketchId}:${p?.profileId}` !== key)
                : [...current, profile];
            feature.input.profiles = next;
        }, {
            opType: 'feature.update',
            payload: { field: 'profiles.toggle', profile }
        });
        if (updated) {
            properties.onChanged?.();
        }
        return;
    }

    const key = `${hit.featureId}:${hit.profileId}`;
    const multi = !!(event?.ctrlKey || event?.metaKey);
    if (!multi) {
        this.selectedSolidFaceKeys?.clear?.();
        this.hoveredSolidFaceKey = null;
        api.solids?.clearFaceSelection?.();
        this.selectedSketchProfiles.clear();
    }
    if (this.selectedSketchProfiles.has(key)) {
        this.selectedSketchProfiles.delete(key);
    } else {
        this.selectedSketchProfiles.add(key);
    }
    api.sketchRuntime?.setSelectedProfiles(Array.from(this.selectedSketchProfiles));
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function selectSolidFace(hit, event) {
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    const editingSketch = currentFeature?.type === 'sketch' && currentFeature?.id === currentFeatureId;
    const editingExtrude = currentFeature?.type === 'extrude' && currentFeature?.id === currentFeatureId;
    const editingBoolean = currentFeature?.type === 'boolean' && currentFeature?.id === currentFeatureId;
    const extrudeOp = String(currentFeature?.params?.operation || 'new');
    const extrudeRole = properties.getExtrudePickRole?.() || 'profiles';
    const editingExtrudeTargets = editingExtrude
        && (extrudeOp === 'add' || extrudeOp === 'subtract')
        && extrudeRole === 'targets';
    const forceMulti = editingBoolean || editingExtrudeTargets;
    const multi = forceMulti || !!(event?.ctrlKey || event?.metaKey);
    if (!multi) {
        for (const selectedPlane of this.selectedPlanes || []) {
            selectedPlane.setSelected(false);
        }
        this.selectedPlanes?.clear?.();
        this.selectedSketchProfiles?.clear?.();
        this.clearSelectedPoints?.();
        api.sketchRuntime?.setSelectedProfiles?.([]);
        api.sketchRuntime?.setHoveredProfile?.(null);
    }
    const selected = api.solids?.toggleSelectedFace?.(hit.key, multi) || [];
    this.selectedSolidFaceKeys = new Set(selected);
    this.hoveredSolidFaceKey = hit.key;
    api.solids?.setHoveredFace?.(hit.key);
    const hitSolidId = hit?.solidId || (() => {
        const splitAt = String(hit?.key || '').lastIndexOf(':');
        return splitAt > 0 ? String(hit.key).substring(0, splitAt) : null;
    })();
    const selectedSolidIds = Array.from(new Set(selected.map(key => {
        const splitAt = String(key || '').lastIndexOf(':');
        return splitAt > 0 ? String(key).substring(0, splitAt) : null;
    }).filter(Boolean)));

    if (editingSketch) {
        const target = hit?.key ? api.solids?.getSketchTargetForFaceKey?.(hit.key) : null;
        if (target?.frame) {
            const updated = api.features.update(currentFeature.id, feature => {
                const offset = Number(feature?.target?.offset || 0);
                feature.target = feature.target || {};
                feature.target.kind = 'face';
                feature.target.id = target.id || null;
                feature.target.name = target.name || 'Face';
                feature.target.label = target.label || null;
                feature.target.source = target.source || null;
                feature.target.offset = offset;
                feature.plane = api.solids?.applyOffsetToFrame?.(target.frame, offset) || target.frame;
            }, {
                opType: 'feature.update',
                payload: { field: 'target.face', key: hit?.key || null }
            });
            if (updated) {
                properties.onChanged?.();
            }
        }
    } else if (editingExtrude) {
        const operation = String(currentFeature?.params?.operation || 'new');
        const pickRole = properties.getExtrudePickRole?.() || 'profiles';
        if ((operation === 'add' || operation === 'subtract') && pickRole === 'targets' && hitSolidId) {
            const updated = api.features.update(currentFeature.id, feature => {
                feature.input = feature.input || {};
                const current = Array.isArray(feature.input.targets) ? feature.input.targets.filter(Boolean) : [];
                if (current.includes(hitSolidId)) {
                    feature.input.targets = current.filter(id => id !== hitSolidId);
                } else {
                    feature.input.targets = [...current, hitSolidId];
                }
            }, {
                opType: 'feature.update',
                payload: { field: 'targets.toggle', solidId: hitSolidId }
            });
            if (updated) {
                const nextFeature = api.features.findById(currentFeature.id);
                const nextTargets = Array.isArray(nextFeature?.input?.targets)
                    ? nextFeature.input.targets.filter(Boolean)
                    : [];
                api.solids?.setSelected?.(nextTargets);
                properties.onChanged?.();
            }
        }
    } else if (editingBoolean) {
        const mode = String(currentFeature?.params?.mode || 'add');
        const role = properties.getBooleanPickRole?.() || 'targets';
        const input = currentFeature?.input || {};
        const legacy = Array.isArray(input.solids) ? input.solids.filter(Boolean) : [];
        let targets = Array.isArray(input.targets) ? input.targets.filter(Boolean) : legacy;
        let tools = Array.isArray(input.tools) ? input.tools.filter(Boolean) : [];
        if (hitSolidId) {
            if (mode === 'subtract') {
                if (role === 'tools') {
                    if (tools.includes(hitSolidId)) {
                        tools = tools.filter(id => id !== hitSolidId);
                    } else {
                        tools = [...tools, hitSolidId];
                        targets = targets.filter(id => id !== hitSolidId);
                    }
                } else {
                    if (targets.includes(hitSolidId)) {
                        targets = targets.filter(id => id !== hitSolidId);
                    } else {
                        targets = [...targets, hitSolidId];
                        tools = tools.filter(id => id !== hitSolidId);
                    }
                }
            } else {
                if (targets.includes(hitSolidId)) {
                    targets = targets.filter(id => id !== hitSolidId);
                } else {
                    targets = [...targets, hitSolidId];
                }
                tools = [];
            }
        }
        const updated = api.features.update(currentFeature.id, feature => {
            feature.input = feature.input || {};
            feature.input.targets = targets.slice();
            feature.input.tools = tools.slice();
            delete feature.input.solids;
        }, {
            opType: 'feature.update',
            payload: { field: 'boolean.inputs', targets, tools }
        });
        if (updated) {
            const selectedIds = mode === 'subtract'
                ? Array.from(new Set([...targets, ...tools]))
                : targets.slice();
            api.solids?.setSelected?.(selectedIds);
            properties.onChanged?.();
        }
    }
    window.dispatchEvent(new CustomEvent('void-state-change'));
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
    getSketchProfileHitFromIntersections,
    getPrimarySurfaceHitFromIntersections,
    selectSketchProfile,
    selectSolidFace,
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
