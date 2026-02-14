/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';
import { properties } from '../properties.js';
import { resolveSelectionCandidate, SELECTION_INTENTS, SELECTION_MODES } from './selection_resolver.js';

function resolveChamferEdgeIdentity(edge = {}) {
    const key = String(edge?.key || '').trim();
    if (key) return `key:${key}`;
    const ref = String(edge?.boundary_segment_id || edge?.entity?.id || '').trim();
    const mapped = String(api.solids?.getEdgeKeyForBoundaryRef?.(ref) || '').trim();
    if (mapped) return `mapped:${mapped}`;
    if (ref) return `ref:${ref}`;
    const solidId = String(edge?.solidId || '').trim();
    const edgeIndex = Number(edge?.edgeIndex);
    if (solidId && Number.isFinite(edgeIndex)) {
        return `idx:${solidId}:${edgeIndex}`;
    }
    return null;
}

function buildChamferEdgeIdentitySet(edge = {}) {
    const set = new Set();
    const add = (value) => {
        const v = String(value || '').trim();
        if (v) set.add(v);
    };
    add(resolveChamferEdgeIdentity(edge));
    const key = String(edge?.key || '').trim();
    if (key) {
        add(`key:${key}`);
        add(`mapped:${key}`);
    }
    const ref = String(edge?.boundary_segment_id || edge?.entity?.id || '').trim();
    if (ref) {
        add(`ref:${ref}`);
        const mapped = String(api.solids?.getEdgeKeyForBoundaryRef?.(ref) || '').trim();
        if (mapped) add(`mapped:${mapped}`);
    }
    return set;
}

function isEditingExtrudeProfiles() {
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    if (!currentFeature || currentFeature.type !== 'extrude' || currentFeature.id !== currentFeatureId) {
        return false;
    }
    const role = properties.getExtrudePickRole?.() || 'profiles';
    return role === 'profiles';
}

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
    for (const mesh of api.solids?.getPickMeshes?.() || []) {
        objects.push(mesh);
    }

    const sketchEditingActive = this.isSketchEditing && this.isSketchEditing();
    const sketchRetarget = this.isSketchRetargetMode && this.isSketchRetargetMode();
    const includeSolidEdges = !sketchEditingActive || (sketchEditingActive && !sketchRetarget);
    if (includeSolidEdges) {
        for (const edgeObj of api.solids?.getPickEdges?.() || []) {
            objects.push(edgeObj);
        }
    }
    if (sketchEditingActive && !sketchRetarget) {
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
    const sketchEditing = !!(this.isSketchEditing && this.isSketchEditing());
    const retargetMode = !!(this.isSketchRetargetMode && this.isSketchRetargetMode());
    const editingExtrudeProfiles = !sketchEditing && isEditingExtrudeProfiles();
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    const editingChamfer = !sketchEditing && currentFeature?.type === 'chamfer' && currentFeature?.id === currentFeatureId;
    const primaryHit = this.getPrimarySurfaceHitFromIntersections(allIntersections || (intersection ? [intersection] : []));

    if (!sketchEditing || retargetMode) {
        if (editingChamfer) {
            if (primaryHit?.type === 'solid-edge') {
                const edgeKey = String(primaryHit.hit?.key || '');
                let edge = null;
                const worldPoint = primaryHit.hit?.intersection?.point || null;
                if (worldPoint) {
                    const raw = String(primaryHit.hit?.key || '');
                    let faceKey = '';
                    if (raw.startsWith('faceedge:') || raw.startsWith('faceedgeloop:')) {
                        const parts = raw.split(':');
                        const fid = Number(parts[parts.length - 2]);
                        const sid = parts.slice(1, -2).join(':');
                        if (sid && Number.isFinite(fid)) faceKey = `${sid}:${fid}`;
                    }
                    if (faceKey) {
                        const snap = api.solids?.getFaceEdgeHit?.(faceKey, worldPoint, 3.0) || null;
                        edge = snap?.key ? (api.solids?.getEdgeByKey?.(snap.key) || null) : null;
                    }
                }
                if (!edge && edgeKey) {
                    edge = api.solids?.getEdgeByKey?.(edgeKey) || null;
                }
                if (edge?.key) {
                    this.hoveredSolidEdgeKey = edge.key;
                    api.solids?.setHoveredEdge?.(edge.key);
                    if (this.hoveredSolidFaceKey) {
                        this.hoveredSolidFaceKey = null;
                        api.solids?.setHoveredFace?.(null);
                    }
                    this.hoverIntersection = primaryHit.hit?.intersection || intersection || null;
                    this.setHoveredPoint(null);
                    if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                        this.hoveredPlane.setHovered(false);
                        this.hoveredPlane = null;
                    }
                    window.dispatchEvent(new CustomEvent('void-state-change'));
                    return;
                }
            }
            let faceKey = null;
            let worldPoint = null;
            if (primaryHit?.type === 'solid-face') {
                faceKey = String(primaryHit.hit?.key || '');
                worldPoint = primaryHit.hit?.intersection?.point || null;
            }
            if (faceKey && worldPoint) {
                const snap = api.solids?.getFaceEdgeHit?.(faceKey, worldPoint, 3.0) || null;
                const edge = snap?.key ? (api.solids?.getEdgeByKey?.(snap.key) || null) : null;
                if (edge?.key) {
                    this.hoveredSolidEdgeKey = edge.key;
                    api.solids?.setHoveredEdge?.(edge.key);
                    if (this.hoveredSolidFaceKey) {
                        this.hoveredSolidFaceKey = null;
                        api.solids?.setHoveredFace?.(null);
                    }
                    this.hoverIntersection = snap.intersection || intersection || null;
                    this.setHoveredPoint(null);
                    if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                        this.hoveredPlane.setHovered(false);
                        this.hoveredPlane = null;
                    }
                    window.dispatchEvent(new CustomEvent('void-state-change'));
                    return;
                }
            }
            if (this.hoveredSolidEdgeKey) {
                this.hoveredSolidEdgeKey = null;
                api.solids?.setHoveredEdge?.(null);
                window.dispatchEvent(new CustomEvent('void-state-change'));
            }
            // Strict chamfer edit behavior: never fall through to live topology hover paths.
            return;
        }
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
        if (!editingExtrudeProfiles && primaryHit?.type === 'solid-edge') {
            const solidEdgeHit = primaryHit.hit;
            this.hoveredSolidEdgeKey = solidEdgeHit.key;
            api.solids?.setHoveredEdge?.(solidEdgeHit.key);
            if (this.hoveredSolidFaceKey) {
                this.hoveredSolidFaceKey = null;
                api.solids?.setHoveredFace?.(null);
            }
            this.hoverIntersection = solidEdgeHit.intersection || intersection || null;
            this.setHoveredPoint(null);
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
                this.hoveredPlane = null;
            }
            window.dispatchEvent(new CustomEvent('void-state-change'));
            return;
        }
        if (!editingExtrudeProfiles && primaryHit?.type === 'solid-face') {
            const solidFaceHit = primaryHit.hit;
            this.hoveredSolidFaceKey = solidFaceHit.key;
            api.solids?.setHoveredFace?.(solidFaceHit.key);
            if (this.hoveredSolidEdgeKey) {
                this.hoveredSolidEdgeKey = null;
                api.solids?.setHoveredEdge?.(null);
            }
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
        if (this.hoveredSolidEdgeKey) {
            this.hoveredSolidEdgeKey = null;
            api.solids?.setHoveredEdge?.(null);
            window.dispatchEvent(new CustomEvent('void-state-change'));
        }
    } else {
        let nextFaceKey = null;
        let nextIntersection = intersection || null;
        if (primaryHit?.type === 'solid-edge') {
            const edge = primaryHit.hit || null;
            const solidId = String(edge?.solidId || '');
            const faceId = Number(edge?.faceId);
            if (solidId && Number.isFinite(faceId)) {
                nextFaceKey = `${solidId}:${faceId}`;
            } else {
                const raw = String(edge?.key || '');
                if (raw.startsWith('faceedge:') || raw.startsWith('faceedgeloop:')) {
                    const parts = raw.split(':');
                    const fid = Number(parts[parts.length - 2]);
                    const sid = parts.slice(1, -2).join(':');
                    if (sid && Number.isFinite(fid)) nextFaceKey = `${sid}:${fid}`;
                }
            }
            nextIntersection = edge?.intersection || nextIntersection;
        } else if (primaryHit?.type === 'solid-face') {
            const face = primaryHit.hit || null;
            nextFaceKey = String(face?.key || '') || null;
            nextIntersection = face?.intersection || nextIntersection;
        }
        if (nextFaceKey) {
            this.hoveredSolidFaceKey = nextFaceKey;
            // In sketch mode we render boundaries/projections, never solid-face fill hover.
            api.solids?.setHoveredFace?.(null);
            this.hoverIntersection = nextIntersection;
            this.setHoveredPoint(null);
            this.hoveredSketchProfileKey = null;
            api.sketchRuntime?.setHoveredProfile?.(null);
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
                this.hoveredPlane = null;
            }
            this.updateSketchInteractionVisuals?.();
            window.dispatchEvent(new CustomEvent('void-state-change'));
            return;
        }
        if (this.hoveredSolidFaceKey) {
            this.hoveredSolidFaceKey = null;
            api.solids?.setHoveredFace?.(null);
            this.updateSketchInteractionVisuals?.();
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

function distancePointToSegment2D(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = (abx * abx) + (aby * aby);
    if (abLenSq <= 1e-12) return Math.hypot(px - ax, py - ay);
    let t = ((apx * abx) + (apy * aby)) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + (abx * t);
    const qy = ay + (aby * t);
    return Math.hypot(px - qx, py - qy);
}

function getSelectedChamferEdgeHitFromScreen(event, maxPx = 10) {
    if (!event) return null;
    const keys = Array.from(this.selectedSolidEdgeKeys || []);
    if (!keys.length) return null;
    const { camera, renderer } = space.internals();
    const el = renderer?.domElement;
    if (!camera || !el?.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    const mx = Number(event.clientX || 0) - rect.left;
    const my = Number(event.clientY || 0) - rect.top;
    const w = Math.max(1, rect.width || el.clientWidth || el.width || 1);
    const h = Math.max(1, rect.height || el.clientHeight || el.height || 1);
    const toScreen = (v) => {
        const p = v.clone().project(camera);
        return { x: ((p.x + 1) * 0.5) * w, y: ((1 - p.y) * 0.5) * h };
    };
    let bestKey = null;
    let bestDist = Infinity;
    for (const key of keys) {
        const edge = api.solids?.getEdgeByKey?.(key) || null;
        const path = Array.isArray(edge?.pathWorld) && edge.pathWorld.length >= 2
            ? edge.pathWorld
            : (edge?.aWorld && edge?.bWorld) ? [edge.aWorld, edge.bWorld] : null;
        if (!path || path.length < 2) continue;
        for (let i = 0; i + 1 < path.length; i++) {
            const a = toScreen(path[i]);
            const b = toScreen(path[i + 1]);
            const d = distancePointToSegment2D(mx, my, a.x, a.y, b.x, b.y);
            if (d < bestDist) {
                bestDist = d;
                bestKey = key;
            }
        }
    }
    if (!bestKey || bestDist > Math.max(2, Number(maxPx || 10))) return null;
    return { key: bestKey };
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

    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    const editingChamfer = currentFeature?.type === 'chamfer' && currentFeature?.id === currentFeatureId;

    if (!(this.isSketchEditing && this.isSketchEditing()) || (this.isSketchRetargetMode && this.isSketchRetargetMode())) {
        const primaryHit = this.getPrimarySurfaceHitFromIntersections(allIntersections || (intersection ? [intersection] : []));
        if (primaryHit?.type === 'profile') {
            this.selectSketchProfile(primaryHit.hit, event);
            return;
        }
        if (primaryHit?.type === 'solid-edge') {
            this.selectSolidEdge(primaryHit.hit, event);
            return;
        }
        if (primaryHit?.type === 'solid-face') {
            this.selectSolidFace(primaryHit.hit, event);
            return;
        }
        if (editingChamfer) {
            const selectedHit = this.getSelectedChamferEdgeHitFromScreen?.(event, 10) || null;
            if (selectedHit?.key) {
                this.selectSolidEdge({ key: selectedHit.key, intersection: intersection || null }, event);
                return;
            }
        }
        if (isEditingExtrudeProfiles()) {
            // While editing extrude profiles, ignore non-profile clicks so solids/planes
            // do not steal interaction from profile picking.
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
        if (editingChamfer) {
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
        if (editingChamfer) {
            return;
        }
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
    const sketchEditing = !!(this.isSketchEditing && this.isSketchEditing());
    const retargetMode = !!(this.isSketchRetargetMode && this.isSketchRetargetMode());
    const editingExtrudeProfiles = isEditingExtrudeProfiles();
    const mode = editingExtrudeProfiles
        ? SELECTION_MODES.extrudeProfiles
        : (sketchEditing
            ? (retargetMode ? SELECTION_MODES.sketchRetarget : SELECTION_MODES.sketch)
            : SELECTION_MODES.solid);
    const edgeGateDistance = (sketchEditing && !retargetMode && !editingExtrudeProfiles) ? 0.5 : 2.5;
    return resolveSelectionCandidate(intersections, {
        api,
        mode,
        intents: [
            SELECTION_INTENTS.profile,
            SELECTION_INTENTS.solidEdge,
            SELECTION_INTENTS.solidFace
        ],
        retargetMode,
        editingExtrudeProfiles,
        sketchFaceEpsilon: 0.25,
        edgeGateDistance
    });
}

function selectSketchProfile(hit, event) {
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    if (currentFeature?.type === 'chamfer' && currentFeature?.id === currentFeatureId) {
        return;
    }
    if (currentFeature?.type === 'extrude') {
        const rawLoops = hit?.object?.userData?.sketchProfileLoops
            || (hit?.object?.userData?.sketchProfileLoop ? [hit.object.userData.sketchProfileLoop] : null);
        const loops = Array.isArray(rawLoops)
            ? rawLoops
                .filter(loop => Array.isArray(loop) && loop.length >= 3)
                .map(loop => loop.map(p => ({ x: p?.x || 0, y: p?.y || 0 })))
            : [];
        const regionId = `profile:${hit.featureId}:${hit.profileId}`;
        const profile = {
            region_id: regionId
        };
        if (loops.length) {
            profile.loops = loops;
        }
        const updated = api.features.update(currentFeature.id, feature => {
            feature.input = feature.input || {};
            const current = Array.isArray(feature.input.profiles) ? feature.input.profiles : [];
            const key = String(profile?.region_id || '');
            const has = current.some(p => String(p?.region_id || '') === key);
            const next = has
                ? current.filter(p => String(p?.region_id || '') !== key)
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
    // Sketch area/profile picking should be toggle/multi by default.
    // Space/Escape remains the clear/deselect route.
    const multi = true;
    if (!this.selectedSketchProfiles.size) {
        this.selectedSolidFaceKeys?.clear?.();
        this.selectedSolidEdgeKeys?.clear?.();
        this.hoveredSolidFaceKey = null;
        this.hoveredSolidEdgeKey = null;
        api.solids?.clearFaceSelection?.();
        api.solids?.clearEdgeSelection?.();
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
    const editingChamfer = currentFeature?.type === 'chamfer' && currentFeature?.id === currentFeatureId;
    const extrudeOp = String(currentFeature?.params?.operation || 'new');
    const extrudeRole = properties.getExtrudePickRole?.() || 'profiles';
    const editingExtrudeTargets = editingExtrude
        && (extrudeOp === 'add' || extrudeOp === 'subtract')
        && extrudeRole === 'targets';
    const forceMulti = editingBoolean || editingExtrudeTargets;

    if (editingChamfer) {
        // In chamfer edit mode, face clicks should never clear existing edge picks.
        // If we're close to a boundary, treat the face click as an edge pick.
        const facePoint = hit?.intersection?.point || null;
        const edge = (hit?.key && facePoint)
            ? api.solids?.getFaceEdgeHit?.(hit.key, facePoint, 3.0)
            : null;
        if (edge?.key) {
            this.selectSolidEdge({ ...edge, intersection: hit?.intersection || null }, event);
        }
        return;
    }

    const multi = forceMulti || !!(event?.ctrlKey || event?.metaKey);
    if (!multi) {
        for (const selectedPlane of this.selectedPlanes || []) {
            selectedPlane.setSelected(false);
        }
        this.selectedPlanes?.clear?.();
        this.selectedSketchProfiles?.clear?.();
        this.clearSelectedPoints?.();
        this.selectedSolidEdgeKeys?.clear?.();
        this.hoveredSolidEdgeKey = null;
        api.solids?.clearEdgeSelection?.();
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
                const hitPoint = hit?.intersection?.point || null;
                feature.target = feature.target || {};
                feature.target.kind = 'face';
                feature.target.id = target.id || null;
                feature.target.name = target.name || 'Face';
                feature.target.label = target.label || null;
                feature.target.source = target.source || null;
                if (feature.target.source) {
                    if (hitPoint) {
                        feature.target.source.anchor = {
                            x: Number(hitPoint.x || 0),
                            y: Number(hitPoint.y || 0),
                            z: Number(hitPoint.z || 0)
                        };
                    }
                    const solidId = String(feature.target.source.solid_id || '');
                    if (solidId) {
                        const solid = api.solids?.list?.().find?.(item => item?.id === solidId) || null;
                        feature.target.source.solid_feature_id = solid?.source?.feature_id || feature.target.source.solid_feature_id || null;
                    }
                }
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
        let targets = Array.isArray(input.targets) ? input.targets.filter(Boolean) : [];
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

function selectSolidEdge(hit, event) {
    const key = hit?.key || null;
    if (!key) return;
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    const editingChamfer = currentFeature?.type === 'chamfer' && currentFeature?.id === currentFeatureId;
    const multi = true;
    if (!this.selectedSolidEdgeKeys?.size) {
        for (const selectedPlane of this.selectedPlanes || []) {
            selectedPlane.setSelected(false);
        }
        this.selectedPlanes?.clear?.();
        this.selectedSketchProfiles?.clear?.();
        this.clearSelectedPoints?.();
        this.selectedSolidFaceKeys?.clear?.();
        this.hoveredSolidFaceKey = null;
        api.solids?.clearFaceSelection?.();
    }
    if (editingChamfer) {
        let edge = null;
        const hoveredKey = String(this.hoveredSolidEdgeKey || '');
        if (hoveredKey) {
            edge = api.solids?.getEdgeByKey?.(hoveredKey) || null;
        }
        const worldPoint = hit?.intersection?.point || this.hoverIntersection?.point || null;
        let faceKey = String(this.hoveredSolidFaceKey || '');
        if (!faceKey) {
            const raw = String(hit?.key || '');
            if (raw.startsWith('faceedge:') || raw.startsWith('faceedgeloop:')) {
                const parts = raw.split(':');
                const fid = Number(parts[parts.length - 2]);
                const sid = parts.slice(1, -2).join(':');
                if (sid && Number.isFinite(fid)) faceKey = `${sid}:${fid}`;
            }
        }
        if (!edge) {
            const snap = (worldPoint && faceKey)
                ? (api.solids?.getFaceEdgeHit?.(faceKey, worldPoint, 3.0) || null)
                : null;
            edge = snap?.key ? (api.solids?.getEdgeByKey?.(snap.key) || null) : null;
        }
        if (!edge) {
            edge = api.solids?.getEdgeByKey?.(key) || null;
        }
        if (!edge) return;
        const edgeEntity = api.solids?.resolveCanonicalEdgeEntity?.(edge.key || key) || null;
        const refId = String(edgeEntity?.id || '');
        if (!refId) return;
        const ref = {
            key: edge.key,
            boundary_segment_id: refId,
            entity: {
                kind: String(edgeEntity?.kind || 'boundary-segment'),
                id: refId
            },
            solidId: edge.solidId,
            edgeIndex: edge.index,
            meshEdgeKey: edge.meshEdgeKey || null
        };
        if (Array.isArray(edge?.meshEdgeKeys) && edge.meshEdgeKeys.length) {
            ref.meshEdgeKeys = edge.meshEdgeKeys.slice();
        }
        if (Array.isArray(edge?.pathWorld) && edge.pathWorld.length >= 2) {
            ref.path = edge.pathWorld.map(p => ({
                x: Number(p?.x || 0),
                y: Number(p?.y || 0),
                z: Number(p?.z || 0)
            }));
        }
        const existing = Array.isArray(currentFeature?.input?.edges) ? currentFeature.input.edges.slice() : [];
        const refResolved = api.solids?.resolveChamferRefToEdgeKey?.(ref) || null;
        const refIds = buildChamferEdgeIdentitySet(ref);
        const has = existing.some(item => {
            const itemResolved = api.solids?.resolveChamferRefToEdgeKey?.(item) || null;
            if (refResolved && itemResolved && refResolved === itemResolved) {
                return true;
            }
            const ids = buildChamferEdgeIdentitySet(item);
            for (const id of ids) {
                if (refIds.has(id)) return true;
            }
            return false;
        });
        const edgeRefs = has
            ? existing.filter(item => {
                const itemResolved = api.solids?.resolveChamferRefToEdgeKey?.(item) || null;
                if (refResolved && itemResolved && refResolved === itemResolved) {
                    return false;
                }
                const ids = buildChamferEdgeIdentitySet(item);
                for (const id of ids) {
                    if (refIds.has(id)) return false;
                }
                return true;
            })
            : [...existing, ref];
        const selectedKeys = edgeRefs
            .map(item => {
                const resolved = api.solids?.resolveChamferRefToEdgeKey?.(item) || null;
                if (!resolved) return null;
                return String(resolved).startsWith('segment:')
                    ? String(resolved).substring('segment:'.length)
                    : String(resolved);
            })
            .filter(Boolean);
        this.selectedSolidEdgeKeys = new Set(selectedKeys);
        this.hoveredSolidEdgeKey = edge.key;
        api.solids?.setSelectedEdges?.(selectedKeys);
        api.solids?.setHoveredEdge?.(edge.key);
        api.features.update(currentFeature.id, feature => {
            feature.input = feature.input || {};
            feature.input.edges = edgeRefs;
        }, {
            opType: 'feature.update',
            payload: { field: 'edges.set', edges: edgeRefs }
        });
        properties.onChanged?.();
        window.dispatchEvent(new CustomEvent('void-state-change'));
        return;
    }
    const selected = api.solids?.toggleSelectedEdge?.(key, multi) || [];
    this.selectedSolidEdgeKeys = new Set(selected);
    this.hoveredSolidEdgeKey = key;
    api.solids?.setHoveredEdge?.(key);
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
    const snappedUp = getSnappedCameraUpForNormal(camera, offsetDir);
    space.view.panTo(point.x, point.y, point.z, left, up, undefined, snappedUp || undefined);
    return true;
}

function getSnappedCameraUpForNormal(camera, viewDir) {
    const dir = viewDir.clone().normalize();
    const currentUpProjected = camera.up.clone().projectOnPlane(dir);
    if (currentUpProjected.lengthSq() < 1e-8) {
        currentUpProjected.set(0, 1, 0).projectOnPlane(dir);
    }
    if (currentUpProjected.lengthSq() < 1e-8) {
        return null;
    }
    currentUpProjected.normalize();

    const basis = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1)
    ];

    let best = null;
    let bestScore = -Infinity;
    for (const axis of basis) {
        const projected = axis.clone().projectOnPlane(dir);
        const lenSq = projected.lengthSq();
        if (lenSq < 1e-8) continue;
        projected.normalize();
        const score = projected.dot(currentUpProjected);
        if (score > bestScore) {
            bestScore = score;
            best = projected;
        }
    }
    return best;
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
    getSelectedChamferEdgeHitFromScreen,
    handleMouseUp,
    getSketchProfileHitFromIntersections,
    getPrimarySurfaceHitFromIntersections,
    selectSketchProfile,
    selectSolidEdge,
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
