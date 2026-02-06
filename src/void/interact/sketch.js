/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';

const SKETCH_HIT_POINT_PX = 10;
const SKETCH_HIT_LINE_PX = 8;
const SKETCH_DRAG_START_PX = 3;
const SKETCH_MIN_LINE_LENGTH = 1e-4;

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
}

function clearSketchSelection() {
    this.selectedSketchEntities.clear();
    this.hoveredSketchEntityId = null;
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
        if (this.sketchLineStart) {
            this.cancelSketchLine();
            return true;
        }
        return false;
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

    return false;
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

function handleSketchPointerDown(event) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    this.sketchPointerSeq = (this.sketchPointerSeq || 0) + 1;
    const seq = this.sketchPointerSeq;
    const local = this.projectEventToSketchLocal(event, feature);
    const hit = this.hitTestSketchEntity(event, feature);

    this.sketchPointerDown = {
        seq,
        local,
        hitId: hit?.id || null,
        clientX: event?.clientX ?? 0,
        clientY: event?.clientY ?? 0
    };

    if (this.getSketchTool() === 'line' && !this.sketchLineStart && local) {
        this.sketchLineStart = local;
        this.sketchLineStartSeq = seq;
    }

    return true;
}

function handleSketchHover(event) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    if (this.sketchDrag) {
        return true;
    }

    const hit = this.hitTestSketchEntity(event, feature);
    const hoveredId = hit && !this.selectedSketchEntities.has(hit.id) ? hit.id : null;
    if (this.hoveredSketchEntityId !== hoveredId) {
        this.hoveredSketchEntityId = hoveredId;
        this.updateSketchInteractionVisuals();
    }

    return true;
}

function handleSketchMouseUp(event) {
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
        if (dist > SKETCH_DRAG_START_PX) {
            return true;
        }
        const hit = this.hitTestSketchEntity(event, feature);
        if (hit?.id) {
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
        const local = this.projectEventToSketchLocal(event, feature);
        if (!local || !this.sketchLineStart) {
            return true;
        }

        if (this.sketchLineStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchLine(feature, this.sketchLineStart, local);
                this.cancelSketchLine();
            }
            return true;
        }

        this.createSketchLine(feature, this.sketchLineStart, local);
        this.cancelSketchLine();
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
        if (!this.sketchPointerDown.hitId || !this.selectedSketchEntities.has(this.sketchPointerDown.hitId)) {
            return false;
        }
        const refs = this.collectSelectedCoordinateRefs(feature);
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
    const refs = new Set();
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (!this.selectedSketchEntities.has(entity.id)) {
            continue;
        }
        if (entity.type === 'point') {
            refs.add(entity);
            continue;
        }
        if (entity.type === 'line' && entity.a && entity.b) {
            refs.add(entity.a);
            refs.add(entity.b);
        }
    }
    return Array.from(refs);
}

function createSketchPoint(feature, local) {
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
        sketch.entities.push({
            id,
            type: 'line',
            construction: false,
            a: { x: a.x, y: a.y },
            b: { x: b.x, y: b.y }
        });
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'line' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
}

function updateSketchInteractionVisuals() {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return;
    }
    api.sketchRuntime?.setEntityInteraction(feature.id, {
        hoveredId: this.sketchDrag ? null : this.hoveredSketchEntityId,
        selectedIds: Array.from(this.selectedSketchEntities)
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
    if (!entities.length) {
        return null;
    }

    const basis = this.getSketchBasis(feature);
    const screenPoint = this.getEventViewportXY(event);
    if (!basis || !screenPoint) {
        return null;
    }

    let bestPoint = null;
    let bestLine = null;

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

        if (entity.type === 'line' && entity.a && entity.b) {
            const wa = this.sketchLocalToWorld(entity.a, basis);
            const wb = this.sketchLocalToWorld(entity.b, basis);
            const pa = api.overlay.project3Dto2D(wa);
            const pb = api.overlay.project3Dto2D(wb);
            if (!pa?.visible || !pb?.visible) continue;
            const dist = this.distanceToSegmentPx(screenPoint.x, screenPoint.y, pa.x, pa.y, pb.x, pb.y);
            if (dist <= SKETCH_HIT_LINE_PX && (!bestLine || dist < bestLine.dist)) {
                bestLine = { id: entity.id, type: 'line', dist };
            }
        }
    }

    return bestPoint || bestLine;
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
    );
    if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
    normal.normalize();

    const xAxis = new THREE.Vector3(
        frame.x_axis?.x ?? 1,
        frame.x_axis?.y ?? 0,
        frame.x_axis?.z ?? 0
    );
    xAxis.addScaledVector(normal, -xAxis.dot(normal));
    if (xAxis.lengthSq() < 1e-12) {
        xAxis.copy(Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
        xAxis.addScaledVector(normal, -xAxis.dot(normal));
    }
    xAxis.normalize();

    const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
    xAxis.crossVectors(yAxis, normal).normalize();

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
    distanceToSegmentPx,
    getEventViewportXY,
    getSketchBasis,
    sketchLocalToWorld,
    projectEventToSketchLocal,
    collectSelectedCoordinateRefs,
    createSketchPoint,
    createSketchLine
};
