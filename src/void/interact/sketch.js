/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';

const SKETCH_HIT_POINT_PX = 11;
const SKETCH_HIT_LINE_PX = 10;
const SKETCH_DRAG_START_PX = 5;
const SKETCH_MIN_LINE_LENGTH = 1e-4;
const SKETCH_POINT_MERGE_EPS = 1e-4;
const SKETCH_VIRTUAL_ORIGIN_ID = '__sketch-origin__';

function getEditingSketchFeature() {
    const sketchId = api.sketchRuntime?.editingId;
    if (!sketchId) return null;
    const feature = api.features.findById(sketchId);
    return feature?.type === 'sketch' ? feature : null;
}

function isSketchEditing() {
    return !!this.getEditingSketchFeature();
}

function setSketchTool(tool = 'select') {
    const allowed = new Set(['select', 'point', 'line']);
    const next = allowed.has(tool) ? tool : 'select';
    if (this.sketchTool === next) return;
    this.sketchTool = next;
    if (next !== 'line') {
        this.cancelSketchLine();
    }
    this.updateSketchInteractionVisuals();
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function getSketchTool() {
    return this.sketchTool || 'select';
}

function cancelSketchLine() {
    this.sketchLineStart = null;
    this.sketchLineStartSeq = null;
    this.sketchLinePreview = null;
}

function clearSketchSelection() {
    this.selectedSketchEntities.clear();
    this.hoveredSketchEntityId = null;
    this.sketchLinePreview = null;
    this.updateSketchInteractionVisuals();
}

function handleSketchKeyDown(event) {
    if (!this.isSketchEditing()) {
        return false;
    }

    const activeTag = document.activeElement?.tagName;
    const editingInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
    if (editingInput) {
        return false;
    }

    if (event.code === 'Escape') {
        const hadLine = !!this.sketchLineStart;
        if (hadLine) {
            this.cancelSketchLine();
        }
        if (this.getSketchTool() !== 'select') {
            this.setSketchTool('select');
            return true;
        }
        return hadLine;
    }

    if (event.code === 'KeyV') {
        this.setSketchTool('select');
        return true;
    }

    if (event.code === 'KeyL') {
        this.setSketchTool('line');
        return true;
    }

    if (event.code === 'KeyQ') {
        return this.toggleSelectedConstruction();
    }

    if (event.code === 'Delete' || event.code === 'Backspace') {
        return this.deleteSelectedSketchEntities();
    }

    return false;
}

function deleteSelectedSketchEntities() {
    const feature = this.getEditingSketchFeature();
    if (!feature || !this.selectedSketchEntities.size) {
        return false;
    }

    const removeIds = new Set(this.selectedSketchEntities);
    let removed = 0;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const keep = [];
        for (const entity of sketch.entities) {
            if (removeIds.has(entity.id)) {
                removed++;
            } else {
                keep.push(entity);
            }
        }
        sketch.entities = keep;
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.remove', ids: Array.from(removeIds) }
    });

    if (!removed) {
        return false;
    }

    this.selectedSketchEntities.clear();
    this.hoveredSketchEntityId = null;
    this.setSketchTool('select');
    this.updateSketchInteractionVisuals();
    return true;
}

function toggleSelectedConstruction() {
    const feature = this.getEditingSketchFeature();
    if (!feature || !this.selectedSketchEntities.size) {
        return false;
    }

    const selected = (feature.entities || []).filter(entity => this.selectedSketchEntities.has(entity.id) && entity.type === 'line');
    if (!selected.length) {
        return false;
    }

    const setConstruction = selected.some(entity => !entity.construction);
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        for (const entity of sketch.entities) {
            if (!this.selectedSketchEntities.has(entity.id) || entity.type !== 'line') {
                continue;
            }
            entity.construction = setConstruction;
        }
    }, {
        opType: 'feature.update',
        payload: { field: 'construction', value: setConstruction }
    });

    this.updateSketchInteractionVisuals();
    return true;
}

function handleSketchPointerDown(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    this.sketchPointerSeq = (this.sketchPointerSeq || 0) + 1;
    const seq = this.sketchPointerSeq;
    const local = this.projectEventToSketchLocal(event, feature);
    const hit = this.resolveSketchHit(event, intersections, feature);
    const hitLocal = this.getSketchHitLocalPoint(feature, hit);

    this.sketchPointerDown = {
        seq,
        local,
        hitId: hit?.id || this.hoveredSketchEntityId || null,
        clientX: event?.clientX ?? 0,
        clientY: event?.clientY ?? 0
    };

    if (this.getSketchTool() === 'line' && !this.sketchLineStart) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchLineStart = start;
        this.sketchLineStartSeq = seq;
        this.sketchLinePreview = { a: start, b: start };
        this.updateSketchInteractionVisuals();
    }

    return true;
}

function handleSketchHover(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    if (this.sketchDrag) {
        return true;
    }

    const tool = this.getSketchTool();
    let previewChanged = false;
    if (tool === 'line' && this.sketchLineStart) {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        const next = local ? { a: this.sketchLineStart, b: local } : null;
        const prev = this.sketchLinePreview;
        const same = !!(prev && next
            && prev.a && next.a
            && prev.b && next.b
            && prev.a.x === next.a.x
            && prev.a.y === next.a.y
            && prev.b.x === next.b.x
            && prev.b.y === next.b.y);
        if (!same) {
            this.sketchLinePreview = next;
            previewChanged = true;
        }
    } else {
        if (this.sketchLinePreview !== null) {
            this.sketchLinePreview = null;
            previewChanged = true;
        }
    }

    const hit = this.resolveSketchHit(event, intersections, feature);
    const hoveredId = hit && !this.selectedSketchEntities.has(hit.id) ? hit.id : null;
    if (this.hoveredSketchEntityId !== hoveredId || previewChanged) {
        this.hoveredSketchEntityId = hoveredId;
        this.updateSketchInteractionVisuals();
    }

    return true;
}

function handleSketchMouseUp(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    const pointerDown = this.sketchPointerDown;
    const dist = pointerDown ? this.pointerDistance(event, pointerDown) : 0;
    const wasDrag = !!this.sketchDrag;

    if (wasDrag) {
        return true;
    }

    const tool = this.getSketchTool();
    if (tool === 'select') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const hit = upHit
            || (pointerDown?.hitId ? { id: pointerDown.hitId } : null)
            || (this.hoveredSketchEntityId ? { id: this.hoveredSketchEntityId } : null);
        if (hit?.id) {
            if (hit.id === SKETCH_VIRTUAL_ORIGIN_ID) {
                this.updateSketchInteractionVisuals();
                return true;
            }
            if (this.selectedSketchEntities.has(hit.id)) {
                this.selectedSketchEntities.delete(hit.id);
            } else {
                this.selectedSketchEntities.add(hit.id);
            }
        } else {
            this.selectedSketchEntities.clear();
        }
        this.updateSketchInteractionVisuals();
        return true;
    }

    if (tool === 'point') {
        if (dist > SKETCH_DRAG_START_PX) {
            return true;
        }
        const local = this.projectEventToSketchLocal(event, feature);
        if (!local) {
            return true;
        }
        this.createSketchPoint(feature, local);
        return true;
    }

    if (tool === 'line') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const local = this.getSketchHitLocalPoint(feature, upHit) || this.projectEventToSketchLocal(event, feature);
        if (!local || !this.sketchLineStart) {
            return true;
        }

        if (this.sketchLineStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchLine(feature, this.sketchLineStart, local);
                // Drag gesture creates one segment and exits pending state.
                this.cancelSketchLine();
            }
            return true;
        }

        this.createSketchLine(feature, this.sketchLineStart, local);
        if (this.getSketchHitLocalPoint(feature, upHit)) {
            // Common polygon workflow: close/attach on existing point and exit line mode.
            this.cancelSketchLine();
            this.setSketchTool('select');
            return true;
        }
        // Click-chain mode: keep endpoint as next segment start.
        this.sketchLineStart = { x: local.x, y: local.y };
        this.sketchLineStartSeq = null;
        return true;
    }

    return true;
}

function handleSketchDrag(delta, offset, isDone) {
    const feature = this.getEditingSketchFeature();
    if (!feature || this.getSketchTool() !== 'select') {
        return false;
    }

    if (!this.sketchPointerDown) {
        return false;
    }

    if (isDone) {
        if (!this.sketchDrag) {
            return false;
        }
        const moved = !!this.sketchDrag.moved;
        this.sketchDrag = null;
        if (moved) {
            api.features.commit(feature.id, {
                opType: 'feature.update',
                payload: { field: 'entities.move' }
            });
        }
        this.updateSketchInteractionVisuals();
        return true;
    }

    const event = delta?.event;
    if (!event) {
        return false;
    }

    if (!this.sketchDrag) {
        const offsetMag = Math.hypot(offset?.x || 0, offset?.y || 0);
        if (offsetMag < SKETCH_DRAG_START_PX) {
            return false;
        }
        const downId = this.sketchPointerDown.hitId || this.hoveredSketchEntityId || null;
        if (!downId || downId === SKETCH_VIRTUAL_ORIGIN_ID) {
            return false;
        }
        const activeIds = this.selectedSketchEntities.has(downId)
            ? new Set(this.selectedSketchEntities)
            : new Set([downId]);
        const refs = this.collectCoordinateRefsFromIds(feature, activeIds);
        if (!refs.length || !this.sketchPointerDown.local) {
            return false;
        }
        const baseline = new Map();
        for (const ref of refs) {
            baseline.set(ref, { x: ref.x || 0, y: ref.y || 0 });
        }
        this.sketchDrag = {
            start: { x: this.sketchPointerDown.local.x, y: this.sketchPointerDown.local.y },
            baseline,
            moved: false
        };
        this.hoveredSketchEntityId = null;
        this.updateSketchInteractionVisuals();
    }

    const local = this.projectEventToSketchLocal(event, feature);
    if (!local) {
        return true;
    }

    const dx = local.x - this.sketchDrag.start.x;
    const dy = local.y - this.sketchDrag.start.y;

    for (const [ref, base] of this.sketchDrag.baseline.entries()) {
        ref.x = base.x + dx;
        ref.y = base.y + dy;
    }

    this.sketchDrag.moved = this.sketchDrag.moved || Math.hypot(dx, dy) > 0;
    api.sketchRuntime.sync();
    this.updateSketchInteractionVisuals();
    return true;
}

function collectSelectedCoordinateRefs(feature) {
    return this.collectCoordinateRefsFromIds(feature, this.selectedSketchEntities);
}

function collectCoordinateRefsFromIds(feature, selectedIds) {
    const refs = new Set();
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const pointById = new Map();
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            pointById.set(entity.id, entity);
        }
    }
    for (const entity of entities) {
        if (!selectedIds?.has(entity.id)) {
            continue;
        }
        if (entity.type === 'point') {
            refs.add(entity);
            continue;
        }
        if (entity.type === 'line') {
            const [a, b] = this.getLineEndpoints(entity, pointById);
            if (a) refs.add(a);
            if (b) refs.add(b);
        }
    }
    return Array.from(refs);
}

function createSketchPoint(feature, local) {
    const existing = this.findPointByCoord(feature, local, SKETCH_POINT_MERGE_EPS);
    if (existing) {
        this.selectedSketchEntities.clear();
        this.selectedSketchEntities.add(existing.id);
        this.hoveredSketchEntityId = null;
        this.updateSketchInteractionVisuals();
        return;
    }
    const id = this.newSketchEntityId('point');
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.entities.push({
            id,
            type: 'point',
            x: local.x,
            y: local.y,
            fixed: false
        });
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'point' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
}

function createSketchLine(feature, a, b) {
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    if (Math.hypot(dx, dy) < SKETCH_MIN_LINE_LENGTH) {
        return;
    }

    const id = this.newSketchEntityId('line');
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const pa = this.ensureSketchPoint(sketch, a);
        const pb = this.ensureSketchPoint(sketch, b);
        sketch.entities.push({
            id,
            type: 'line',
            construction: false,
            a: pa.id,
            b: pb.id
        });
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'line' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchLinePreview = null;
    this.updateSketchInteractionVisuals();
}

function updateSketchInteractionVisuals() {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return;
    }
    api.sketchRuntime?.setEntityInteraction(feature.id, {
        hoveredId: this.sketchDrag ? null : this.hoveredSketchEntityId,
        selectedIds: Array.from(this.selectedSketchEntities),
        previewLine: this.sketchLinePreview,
        previewStart: this.sketchLineStart
    });
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function newSketchEntityId(prefix = 'e') {
    const tail = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${Date.now().toString(36)}-${tail}`;
}

function pointerDistance(event, pointerDown) {
    if (!event || !pointerDown) return 0;
    return Math.hypot((event.clientX || 0) - pointerDown.clientX, (event.clientY || 0) - pointerDown.clientY);
}

function hitTestSketchEntity(event, feature) {
    if (!event || !feature) {
        return null;
    }

    const entities = Array.isArray(feature.entities) ? feature.entities : [];

    const basis = this.getSketchBasis(feature);
    const screenPoint = this.getEventViewportXY(event);
    if (!basis || !screenPoint) {
        return null;
    }

    let bestPoint = null;
    let bestLine = null;
    const pointById = new Map();
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            pointById.set(entity.id, entity);
        }
    }

    for (const entity of entities) {
        if (!entity?.id) continue;

        if (entity.type === 'point') {
            const world = this.sketchLocalToWorld(entity, basis);
            const proj = api.overlay.project3Dto2D(world);
            if (!proj?.visible) continue;
            const dist = Math.hypot(screenPoint.x - proj.x, screenPoint.y - proj.y);
            if (dist <= SKETCH_HIT_POINT_PX && (!bestPoint || dist < bestPoint.dist)) {
                bestPoint = { id: entity.id, type: 'point', dist };
            }
            continue;
        }

        if (entity.type === 'line') {
            const [a, b] = this.getLineEndpoints(entity, pointById);
            if (!a || !b) continue;
            const wa = this.sketchLocalToWorld(a, basis);
            const wb = this.sketchLocalToWorld(b, basis);
            const pa = api.overlay.project3Dto2D(wa);
            const pb = api.overlay.project3Dto2D(wb);
            if (!pa?.visible || !pb?.visible) continue;
            const dist = this.distanceToSegmentPx(screenPoint.x, screenPoint.y, pa.x, pa.y, pb.x, pb.y);
            if (dist <= SKETCH_HIT_LINE_PX && (!bestLine || dist < bestLine.dist)) {
                bestLine = { id: entity.id, type: 'line', dist };
            }
        }
    }

    const originProj = api.overlay.project3Dto2D(basis.origin);
    if (originProj?.visible) {
        const originDist = Math.hypot(screenPoint.x - originProj.x, screenPoint.y - originProj.y);
        if (originDist <= SKETCH_HIT_POINT_PX && (!bestPoint || originDist < bestPoint.dist)) {
            bestPoint = { id: SKETCH_VIRTUAL_ORIGIN_ID, type: 'point', dist: originDist };
        }
    }

    return bestPoint || bestLine;
}

function getSketchEntityHitFromIntersections(intersections, feature) {
    if (!intersections || !intersections.length) {
        return null;
    }
    const rec = api.sketchRuntime?.getRecord?.(feature?.id);
    const allowed = rec?.entityViews ? new Set(Array.from(rec.entityViews.keys())) : null;
    let bestPoint = null;
    let bestLine = null;
    for (const hit of intersections) {
        const id = hit?.object?.userData?.sketchEntityId;
        if (!id) continue;
        if (allowed && !allowed.has(id)) continue;
        const type = hit.object.userData?.sketchEntityType || null;
        const cand = { id, type, distance: hit.distance ?? Infinity };
        if (type === 'point') {
            if (!bestPoint || cand.distance < bestPoint.distance) {
                bestPoint = cand;
            }
        } else if (!bestLine || cand.distance < bestLine.distance) {
            bestLine = cand;
        }
    }
    return bestPoint || bestLine || null;
}

function resolveSketchHit(event, intersections, feature) {
    const rayHit = this.getSketchEntityHitFromIntersections(intersections, feature);
    const screenHit = this.hitTestSketchEntity(event, feature);
    if (screenHit?.type === 'point') {
        return screenHit;
    }
    if (rayHit?.type === 'point') {
        return rayHit;
    }
    return rayHit || screenHit || null;
}

function getSketchHitLocalPoint(feature, hit) {
    if (!hit?.id) {
        return null;
    }
    if (hit.id === SKETCH_VIRTUAL_ORIGIN_ID) {
        return { x: 0, y: 0 };
    }

    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id === hit.id) {
            return { x: entity.x || 0, y: entity.y || 0 };
        }
    }

    const rec = api.sketchRuntime?.getRecord?.(feature?.id);
    const view = rec?.entityViews?.get?.(hit.id);
    if (view?.type === 'point' && view.entity) {
        return { x: view.entity.x || 0, y: view.entity.y || 0 };
    }
    return null;
}

function findPointByCoord(feature, local, eps = SKETCH_POINT_MERGE_EPS) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (entity?.type !== 'point' || !entity.id) continue;
        if (Math.abs((entity.x || 0) - local.x) <= eps && Math.abs((entity.y || 0) - local.y) <= eps) {
            return entity;
        }
    }
    return null;
}

function ensureSketchPoint(sketch, local) {
    sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
    const existing = this.findPointByCoord(sketch, local, SKETCH_POINT_MERGE_EPS);
    if (existing) {
        return existing;
    }
    const point = {
        id: this.newSketchEntityId('point'),
        type: 'point',
        x: local.x,
        y: local.y,
        fixed: false
    };
    sketch.entities.push(point);
    return point;
}

function getLineEndpoints(line, pointById) {
    let a = null;
    let b = null;
    if (typeof line?.a === 'string') {
        a = pointById?.get(line.a) || null;
    } else if (line?.a && typeof line.a === 'object') {
        a = line.a;
    }
    if (typeof line?.b === 'string') {
        b = pointById?.get(line.b) || null;
    } else if (line?.b && typeof line.b === 'object') {
        b = line.b;
    }
    return [a, b];
}

function distanceToSegmentPx(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq <= 1e-9) {
        return Math.hypot(px - ax, py - ay);
    }
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
}

function getEventViewportXY(event) {
    const { container } = space.internals();
    if (!container || !event) {
        return null;
    }
    const rect = container.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
    };
}

function getSketchBasis(feature) {
    const rec = api.sketchRuntime?.getRecord?.(feature?.id);
    const runtimePlane = rec?.plane;
    if (runtimePlane?.mesh && runtimePlane?.group) {
        runtimePlane.mesh.updateMatrixWorld(true);
        runtimePlane.group.updateMatrixWorld(true);
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        const normal = new THREE.Vector3();
        runtimePlane.mesh.matrixWorld.extractBasis(xAxis, yAxis, normal);
        xAxis.normalize();
        yAxis.normalize();
        normal.normalize();
        const origin = new THREE.Vector3();
        runtimePlane.group.getWorldPosition(origin);
        return { origin, normal, xAxis, yAxis };
    }

    const frame = feature?.plane;
    if (!frame) return null;
    const origin = new THREE.Vector3(
        frame.origin?.x || 0,
        frame.origin?.y || 0,
        frame.origin?.z || 0
    );
    const normal = new THREE.Vector3(
        frame.normal?.x ?? 0,
        frame.normal?.y ?? 0,
        frame.normal?.z ?? 1
    ).normalize();
    const xAxis = new THREE.Vector3(
        frame.x_axis?.x ?? 1,
        frame.x_axis?.y ?? 0,
        frame.x_axis?.z ?? 0
    ).normalize();
    const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
    return { origin, normal, xAxis, yAxis };
}

function sketchLocalToWorld(local, basis) {
    return basis.origin.clone()
        .addScaledVector(basis.xAxis, local.x || 0)
        .addScaledVector(basis.yAxis, local.y || 0);
}

function projectEventToSketchLocal(event, feature) {
    const basis = this.getSketchBasis(feature);
    const vp = this.getEventViewportXY(event);
    if (!basis || !vp) {
        return null;
    }

    const { camera } = space.internals();
    if (!camera) {
        return null;
    }

    const ndc = new THREE.Vector2(
        (vp.x / vp.width) * 2 - 1,
        -(vp.y / vp.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(basis.normal, basis.origin);
    const world = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, world);
    if (!hit) {
        return null;
    }

    const rel = world.clone().sub(basis.origin);
    return {
        x: rel.dot(basis.xAxis),
        y: rel.dot(basis.yAxis)
    };
}

export {
    getEditingSketchFeature,
    isSketchEditing,
    setSketchTool,
    getSketchTool,
    cancelSketchLine,
    clearSketchSelection,
    handleSketchKeyDown,
    handleSketchPointerDown,
    handleSketchHover,
    handleSketchMouseUp,
    handleSketchDrag,
    toggleSelectedConstruction,
    updateSketchInteractionVisuals,
    newSketchEntityId,
    pointerDistance,
    hitTestSketchEntity,
    getSketchEntityHitFromIntersections,
    resolveSketchHit,
    getSketchHitLocalPoint,
    distanceToSegmentPx,
    getEventViewportXY,
    getSketchBasis,
    sketchLocalToWorld,
    projectEventToSketchLocal,
    collectSelectedCoordinateRefs,
    collectCoordinateRefsFromIds,
    createSketchPoint,
    createSketchLine,
    deleteSelectedSketchEntities,
    findPointByCoord,
    ensureSketchPoint,
    getLineEndpoints
};
