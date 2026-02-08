/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';
import { enforceSketchConstraintsInPlace } from '../sketch_constraints.js';

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
    const allowed = new Set(['select', 'point', 'line', 'arc', 'circle', 'rect', 'rect-center']);
    const next = allowed.has(tool) ? tool : 'select';
    if (this.sketchTool === next) {
        // Allow re-clicking circle tool to recover from stale pending-center state
        // without requiring a page reload.
        if (next === 'circle') {
            this.cancelSketchCircle();
            this.sketchPointerDown = null;
            this.sketchDrag = null;
            this.updateSketchInteractionVisuals();
        }
        return;
    }
    this.sketchTool = next;
    if (next !== 'line') {
        this.cancelSketchLine();
    }
    if (next !== 'arc') {
        this.cancelSketchArc();
    }
    if (next !== 'circle') {
        this.cancelSketchCircle();
    }
    if (next !== 'rect' && next !== 'rect-center') {
        this.cancelSketchRect();
    }
    this.sketchRectCenterMode = next === 'rect-center';
    this.updateSketchInteractionVisuals();
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function getSketchTool() {
    return this.sketchTool || 'select';
}

function cancelSketchLine() {
    this.sketchLineStart = null;
    this.sketchLineStartRefId = null;
    this.sketchLineStartSeq = null;
    this.sketchLinePreview = null;
}

function cancelSketchArc() {
    this.sketchArcStart = null;
    this.sketchArcStartRefId = null;
    this.sketchArcEnd = null;
    this.sketchArcEndRefId = null;
    this.sketchArcPreview = null;
}

function cancelSketchCircle() {
    this.sketchCircleCenter = null;
    this.sketchCircleCenterRefId = null;
    this.sketchCircleStartSeq = null;
    this.sketchArcPreview = null;
}

function cancelSketchRect() {
    this.sketchRectStart = null;
    this.sketchRectStartRefId = null;
    this.sketchRectStartSeq = null;
    this.sketchRectPreview = null;
}

function clearSketchSelection() {
    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchConstraints.clear();
    this.hoveredSketchEntityId = null;
    this.hoveredSketchConstraintId = null;
    this.sketchLinePreview = null;
    this.sketchArcPreview = null;
    this.sketchRectPreview = null;
    this.clearSketchMarquee();
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
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
    }

    if (event.code === 'Escape') {
        const hadMarquee = !!this.sketchMarquee;
        if (hadMarquee) {
            this.clearSketchMarquee();
        }
        const hadLine = !!this.sketchLineStart;
        const hadArc = !!this.sketchArcStart || !!this.sketchArcEnd;
        const hadRect = !!this.sketchRectStart;
        if (hadLine) {
            this.cancelSketchLine();
        }
        if (hadArc) {
            this.cancelSketchArc();
        }
        if (hadRect) {
            this.cancelSketchRect();
        }
        if (this.getSketchTool() !== 'select') {
            this.setSketchTool('select');
            return true;
        }
        return hadLine || hadArc || hadRect || hadMarquee;
    }

    if (event.code === 'KeyV') {
        this.setSketchTool('select');
        return true;
    }

    if (event.code === 'KeyL') {
        this.setSketchTool('line');
        return true;
    }
    if (event.code === 'KeyA') {
        this.setSketchTool('arc');
        return true;
    }
    if (event.code === 'KeyO') {
        this.setSketchTool('circle');
        return true;
    }
    if (event.code === 'KeyR') {
        this.setSketchTool(event.shiftKey ? 'rect-center' : 'rect');
        return true;
    }

    if (event.code === 'KeyQ') {
        return this.toggleSelectedConstruction();
    }

    if (event.code === 'KeyH') {
        return this.applySketchConstraint('horizontal');
    }

    if (event.code === 'KeyI') {
        return this.applySketchConstraint('vertical');
    }

    if (event.code === 'KeyK') {
        return this.applySketchConstraint('perpendicular');
    }
    if (event.code === 'KeyE') {
        return this.applySketchConstraint('equal');
    }
    if (event.code === 'KeyG') {
        return this.applySketchConstraint('collinear');
    }
    if (event.code === 'KeyT') {
        return this.applySketchConstraint('tangent');
    }

    if (event.code === 'KeyC') {
        return this.applySketchConstraint('coincident');
    }

    if (event.code === 'KeyF') {
        return this.applySketchConstraint('fixed');
    }

    if (event.code === 'Delete' || event.code === 'Backspace') {
        if (this.selectedSketchConstraints?.size) {
            return this.deleteSelectedSketchConstraints();
        }
        return this.deleteSelectedSketchEntities();
    }

    return false;
}

function selectSketchConstraint(constraintId, event = {}) {
    if (!constraintId) {
        return false;
    }
    const multi = !!(event.ctrlKey || event.metaKey || event.shiftKey);
    if (!multi) {
        if (this.selectedSketchConstraints.size === 1 && this.selectedSketchConstraints.has(constraintId)) {
            return false;
        }
        this.selectedSketchConstraints.clear();
        this.selectedSketchConstraints.add(constraintId);
    } else {
        if (this.selectedSketchConstraints.has(constraintId)) {
            this.selectedSketchConstraints.delete(constraintId);
        } else {
            this.selectedSketchConstraints.add(constraintId);
        }
    }
    this.hoveredSketchConstraintId = constraintId;
    this.updateSketchInteractionVisuals();
    return true;
}

function setHoveredSketchConstraint(constraintId) {
    const next = constraintId || null;
    if (this.hoveredSketchConstraintId === next) {
        return false;
    }
    this.hoveredSketchConstraintId = next;
    this.updateSketchInteractionVisuals();
    return true;
}

function deleteSelectedSketchConstraints() {
    const feature = this.getEditingSketchFeature();
    if (!feature || !this.selectedSketchConstraints?.size) {
        return false;
    }
    const removeIds = new Set(this.selectedSketchConstraints);
    let removed = 0;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const keep = [];
        for (const c of sketch.constraints) {
            if (c?.id && removeIds.has(c.id)) {
                removed++;
            } else {
                keep.push(c);
            }
        }
        sketch.constraints = keep;
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'constraints.remove', ids: Array.from(removeIds) }
    });
    if (!removed) {
        return false;
    }
    this.selectedSketchConstraints.clear();
    this.hoveredSketchConstraintId = null;
    this.updateSketchInteractionVisuals();
    return true;
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
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const endpointCandidates = new Set();
        for (const entity of sketch.entities) {
            if (!removeIds.has(entity?.id)) continue;
            if (entity?.type !== 'line' && entity?.type !== 'arc') continue;
            if (typeof entity.a === 'string') endpointCandidates.add(entity.a);
            if (typeof entity.b === 'string') endpointCandidates.add(entity.b);
        }
        if (endpointCandidates.size) {
            const prospectiveRemove = new Set([...removeIds, ...endpointCandidates]);
            const usedByRemainingCurve = new Set();
            for (const entity of sketch.entities) {
                if (removeIds.has(entity?.id)) continue;
                if (entity?.type !== 'line' && entity?.type !== 'arc') continue;
                if (typeof entity.a === 'string') usedByRemainingCurve.add(entity.a);
                if (typeof entity.b === 'string') usedByRemainingCurve.add(entity.b);
            }
            const usedByRemainingConstraint = new Set();
            for (const constraint of sketch.constraints) {
                const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
                // Ignore constraints that will be removed with candidate endpoints.
                if (refs.some(ref => prospectiveRemove.has(ref))) continue;
                for (const ref of refs) {
                    usedByRemainingConstraint.add(ref);
                }
            }
            for (const pointId of endpointCandidates) {
                if (usedByRemainingCurve.has(pointId)) continue;
                if (usedByRemainingConstraint.has(pointId)) continue;
                removeIds.add(pointId);
            }
        }

        const keep = [];
        for (const entity of sketch.entities) {
            if (removeIds.has(entity.id)) {
                removed++;
            } else {
                keep.push(entity);
            }
        }
        sketch.entities = keep;
        sketch.constraints = sketch.constraints.filter(constraint => {
            const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
            return !refs.some(ref => removeIds.has(ref));
        });
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.remove', ids: Array.from(removeIds) }
    });

    if (!removed) {
        return false;
    }

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
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

    const selected = (feature.entities || []).filter(entity =>
        this.selectedSketchEntities.has(entity.id) && (entity.type === 'line' || entity.type === 'arc'));
    if (!selected.length) {
        return false;
    }

    const setConstruction = selected.some(entity => !entity.construction);
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        for (const entity of sketch.entities) {
            if (!this.selectedSketchEntities.has(entity.id) || (entity.type !== 'line' && entity.type !== 'arc')) {
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

function applySketchConstraint(type) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const selected = entities.filter(entity => this.selectedSketchEntities.has(entity.id));
    if (!selected.length) {
        return false;
    }

    const lines = selected.filter(entity => entity.type === 'line');
    const arcs = selected.filter(entity => entity.type === 'arc');
    const points = selected.filter(entity => entity.type === 'point');
    const arcCenters = selected.filter(entity => entity.type === 'arc' && this.selectedSketchArcCenters?.has?.(entity.id));
    const specs = [];

    if (type === 'horizontal' || type === 'vertical') {
        if (lines.length) {
            for (const line of lines) {
                specs.push({ type, refs: [line.id] });
            }
        } else if (points.length === 2) {
            specs.push({ type: `${type}_points`, refs: [points[0].id, points[1].id] });
        } else {
            return false;
        }
    } else if (type === 'perpendicular') {
        if (lines.length !== 2) {
            return false;
        }
        specs.push({ type, refs: [lines[0].id, lines[1].id] });
    } else if (type === 'equal') {
        if (lines.length < 2) {
            return false;
        }
        const base = lines[0];
        for (let i = 1; i < lines.length; i++) {
            specs.push({ type, refs: [base.id, lines[i].id] });
        }
    } else if (type === 'collinear') {
        if (lines.length !== 2) {
            return false;
        }
        specs.push({ type, refs: [lines[0].id, lines[1].id] });
    } else if (type === 'tangent') {
        if (lines.length === 1 && arcs.length === 1) {
            specs.push({ type, refs: [lines[0].id, arcs[0].id] });
        } else if (lines.length === 0 && arcs.length === 2) {
            specs.push({ type, refs: [arcs[0].id, arcs[1].id] });
        } else {
            return false;
        }
    } else if (type === 'midpoint') {
        if (points.length === 3) {
            specs.push({ type, refs: [points[0].id, points[1].id, points[2].id] });
        } else if (points.length === 1 && lines.length === 1) {
            const line = lines[0];
            const aId = typeof line?.a === 'string' ? line.a : (typeof line?.p1_id === 'string' ? line.p1_id : null);
            const bId = typeof line?.b === 'string' ? line.b : (typeof line?.p2_id === 'string' ? line.p2_id : null);
            if (!aId || !bId) {
                return false;
            }
            specs.push({ type, refs: [points[0].id, aId, bId] });
        } else {
            return false;
        }
    } else if (type === 'coincident') {
        if (points.length === 2) {
            const circleArc = this.findArcWithEndpoints(feature, points[0].id, points[1].id);
            if (circleArc) {
                return this.convertArcToCircle(feature, circleArc.id, points[0].id, points[1].id);
            }
            specs.push({ type, refs: [points[0].id, points[1].id] });
        } else if (points.length === 1 && lines.length === 1) {
            specs.push({ type: 'point_on_line', refs: [points[0].id, lines[0].id] });
        } else if (points.length === 1 && arcs.length === 1) {
            specs.push({ type: 'point_on_arc', refs: [points[0].id, arcs[0].id] });
        } else if (points.length === 1 && arcCenters.length === 1) {
            specs.push({ type: 'arc_center_coincident', refs: [arcCenters[0].id, points[0].id] });
        } else {
            return false;
        }
    } else if (type === 'fixed') {
        for (const point of points) {
            specs.push({ type, refs: [point.id] });
        }
    } else {
        return false;
    }

    if (!specs.length) {
        return false;
    }

    let changed = false;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        for (const spec of specs) {
            if (this.toggleSketchConstraintInList(sketch, sketch.constraints, spec.type, spec.refs)) {
                changed = true;
            }
        }
        if (changed) {
            enforceSketchConstraintsInPlace(sketch);
        }
    }, {
        opType: 'feature.update',
        payload: {
            field: 'constraints.apply',
            type,
            refs: specs.map(spec => spec.refs)
        }
    });

    return changed;
}

function findArcWithEndpoints(feature, p1Id, p2Id) {
    if (!feature || !p1Id || !p2Id || p1Id === p2Id) return null;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (entity?.type !== 'arc' || !entity.id) continue;
        const a = typeof entity.a === 'string' ? entity.a : null;
        const b = typeof entity.b === 'string' ? entity.b : null;
        if (!a || !b) continue;
        if ((a === p1Id && b === p2Id) || (a === p2Id && b === p1Id)) {
            return entity;
        }
    }
    return null;
}

function convertArcToCircle(feature, arcId, p1Id, p2Id) {
    let changed = false;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const byId = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
        const arc = byId.get(arcId);
        const p1 = byId.get(p1Id);
        const p2 = byId.get(p2Id);
        if (!arc || arc.type !== 'arc' || !p1 || !p2) {
            return;
        }
        const center = this.getArcCenterLocalFromEntity(arc, byId)
            || (Number.isFinite(arc.cx) && Number.isFinite(arc.cy) ? { x: arc.cx, y: arc.cy } : null);
        if (!center) return;

        if (Math.abs((p2.x || 0) - (p1.x || 0)) > 1e-9 || Math.abs((p2.y || 0) - (p1.y || 0)) > 1e-9) {
            p2.x = p1.x || 0;
            p2.y = p1.y || 0;
            changed = true;
        }

        const radius = Math.hypot((p1.x || 0) - center.x, (p1.y || 0) - center.y);
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            return;
        }

        if (!arc.circle) {
            arc.circle = true;
            changed = true;
        }
        if (Math.abs((arc.cx || 0) - center.x) > 1e-9) {
            arc.cx = center.x;
            changed = true;
        }
        if (Math.abs((arc.cy || 0) - center.y) > 1e-9) {
            arc.cy = center.y;
            changed = true;
        }
        if (Math.abs((arc.radius || 0) - radius) > 1e-9) {
            arc.radius = radius;
            changed = true;
        }
        const angle = Math.atan2((p1.y || 0) - center.y, (p1.x || 0) - center.x);
        const mx = center.x + Math.cos(angle + Math.PI / 2) * radius;
        const my = center.y + Math.sin(angle + Math.PI / 2) * radius;
        if (!Number.isFinite(arc.mx) || Math.abs((arc.mx || 0) - mx) > 1e-9) {
            arc.mx = mx;
            changed = true;
        }
        if (!Number.isFinite(arc.my) || Math.abs((arc.my || 0) - my) > 1e-9) {
            arc.my = my;
            changed = true;
        }
        if (!Number.isFinite(arc.startAngle)) {
            arc.startAngle = 0;
            changed = true;
        }
        if (!Number.isFinite(arc.endAngle)) {
            arc.endAngle = Math.PI * 2;
            changed = true;
        }
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.arc_to_circle', arcId, refs: [p1Id, p2Id] }
    });
    return changed;
}

function toggleSketchConstraintInList(sketch, list, type, refs) {
    const key = this.makeSketchConstraintKey(type, refs);
    for (let i = 0; i < list.length; i++) {
        const existing = list[i];
        if (this.makeSketchConstraintKey(existing?.type, existing?.refs || []) === key) {
            list.splice(i, 1);
            return true;
        }
    }
    const data = {};
    if (type === 'fixed') {
        data.anchors = {};
        const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
        const pointById = new Map(entities.filter(e => e?.type === 'point' && e.id).map(e => [e.id, e]));
        for (const id of this.normalizeConstraintRefs(type, refs)) {
            const p = pointById.get(id);
            if (p) {
                data.anchors[id] = { x: p.x || 0, y: p.y || 0 };
            }
        }
    }
    list.push({
        id: this.newSketchEntityId('cst'),
        type,
        refs: this.normalizeConstraintRefs(type, refs),
        data,
        created_at: Date.now()
    });
    return true;
}

function normalizeConstraintRefs(type, refs) {
    const out = Array.from(new Set((refs || []).filter(Boolean)));
    if (type === 'horizontal' || type === 'vertical' || type === 'fixed') {
        return out.slice(0, 1);
    }
    if (type === 'horizontal_points' || type === 'vertical_points') {
        return out.slice(0, 2).sort();
    }
    if (type === 'point_on_line' || type === 'point_on_arc') {
        return out.slice(0, 2).sort();
    }
    if (type === 'midpoint') {
        return out.slice(0, 3);
    }
    if (type === 'arc_center_coincident') {
        return out.slice(0, 2);
    }
    return out.sort();
}

function makeSketchConstraintKey(type, refs) {
    return `${type}:${this.normalizeConstraintRefs(type, refs).join(',')}`;
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
        hitType: hit?.type || null,
        clientX: event?.clientX ?? 0,
        clientY: event?.clientY ?? 0
    };

    if (this.getSketchTool() === 'line' && !this.sketchLineStart) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchLineStart = start;
        this.sketchLineStartRefId = (hit?.type === 'point' && hit?.id && hit.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? hit.id : null;
        this.sketchLineStartSeq = seq;
        this.sketchLinePreview = { a: start, b: start };
        this.updateSketchInteractionVisuals();
    }
    if ((this.getSketchTool() === 'rect' || this.getSketchTool() === 'rect-center') && !this.sketchRectStart) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchRectStart = start;
        this.sketchRectStartRefId = (hit?.type === 'point' && hit?.id && hit.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? hit.id : null;
        this.sketchRectStartSeq = seq;
        this.sketchRectPreview = this.makeSketchRectPreview(start, start, this.getSketchTool() === 'rect-center');
        this.updateSketchInteractionVisuals();
    }
    if (this.getSketchTool() === 'circle' && !this.sketchCircleCenter) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchCircleCenter = start;
        // Do not auto-bind center to hovered point; users can add explicit constraints later.
        this.sketchCircleCenterRefId = null;
        this.sketchCircleStartSeq = seq;
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
    if (tool === 'arc') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextArc = null;
        if (this.sketchArcStart && !this.sketchArcEnd && local) {
            nextArc = { mode: 'chord', a: this.sketchArcStart, b: local };
        } else if (this.sketchArcStart && this.sketchArcEnd && local) {
            const geom = this.computeArcGeometry(this.sketchArcStart, this.sketchArcEnd, local);
            if (geom) {
                nextArc = { mode: 'arc', a: this.sketchArcStart, b: this.sketchArcEnd, ...geom };
            }
        }
        const prevArc = this.sketchArcPreview;
        const sameArc = JSON.stringify(prevArc || null) === JSON.stringify(nextArc || null);
        if (!sameArc) {
            this.sketchArcPreview = nextArc;
            previewChanged = true;
        }
    } else if (this.sketchArcPreview !== null) {
        this.sketchArcPreview = null;
        previewChanged = true;
    }
    if (tool === 'circle') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextArc = null;
        if (this.sketchCircleCenter && local) {
            const radius = Math.hypot((local.x || 0) - (this.sketchCircleCenter.x || 0), (local.y || 0) - (this.sketchCircleCenter.y || 0));
            if (radius > SKETCH_MIN_LINE_LENGTH) {
                nextArc = {
                    mode: 'circle',
                    circle: true,
                    cx: this.sketchCircleCenter.x || 0,
                    cy: this.sketchCircleCenter.y || 0,
                    radius
                };
            }
        }
        const prevArc = this.sketchArcPreview;
        const sameArc = JSON.stringify(prevArc || null) === JSON.stringify(nextArc || null);
        if (!sameArc) {
            this.sketchArcPreview = nextArc;
            previewChanged = true;
        }
    }
    if (tool === 'rect' || tool === 'rect-center') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextRect = null;
        if (this.sketchRectStart && local) {
            nextRect = this.makeSketchRectPreview(this.sketchRectStart, local, tool === 'rect-center');
        }
        const prevRect = this.sketchRectPreview;
        const sameRect = JSON.stringify(prevRect || null) === JSON.stringify(nextRect || null);
        if (!sameRect) {
            this.sketchRectPreview = nextRect;
            previewChanged = true;
        }
    } else if (this.sketchRectPreview !== null) {
        this.sketchRectPreview = null;
        previewChanged = true;
    }

    const hit = this.resolveSketchHit(event, intersections, feature);
    const hoveredId = hit && !this.selectedSketchEntities.has(hit.id) ? hit.id : null;
    if (this.hoveredSketchEntityId !== hoveredId || previewChanged) {
        this.hoveredSketchEntityId = hoveredId;
        this.updateSketchInteractionVisuals();
    }

    return true;
}

function handleSketchPointerMove(event) {
    const feature = this.getEditingSketchFeature();
    if (!feature || this.getSketchTool() !== 'select') {
        return false;
    }
    if (!this.sketchPointerDown) {
        return false;
    }
    if (!(event?.buttons & 1)) {
        return false;
    }
    if (this.sketchDrag) {
        return false;
    }
    const offsetMag = this.pointerDistance(event, this.sketchPointerDown);
    if (offsetMag < SKETCH_DRAG_START_PX) {
        return false;
    }
    const downId = this.sketchPointerDown.hitId || this.hoveredSketchEntityId || null;
    if (downId && downId !== SKETCH_VIRTUAL_ORIGIN_ID) {
        return false;
    }
    if (!this.sketchMarquee) {
        this.startSketchMarquee(feature, this.sketchPointerDown, event);
    } else {
        this.updateSketchMarquee(event);
    }
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function handleSketchMouseUp(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }
    const tool = this.getSketchTool();
    const allowOutsideViewport = tool === 'circle' && !!this.sketchCircleCenter;
    if (!allowOutsideViewport && !this.isSketchEventInViewport(event)) {
        return false;
    }
    if (this.sketchMarquee) {
        this.finishSketchMarquee(feature);
        return true;
    }

    const pointerDown = this.sketchPointerDown;
    const dist = pointerDown ? this.pointerDistance(event, pointerDown) : 0;
    const wasDrag = !!this.sketchDrag;

    if (wasDrag) {
        return true;
    }

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
            const isArcCenter = hit.type === 'arc-center';
            if (this.selectedSketchEntities.has(hit.id)) {
                this.selectedSketchEntities.delete(hit.id);
                this.selectedSketchArcCenters?.delete?.(hit.id);
            } else {
                this.selectedSketchEntities.add(hit.id);
                if (isArcCenter) {
                    this.selectedSketchArcCenters?.add?.(hit.id);
                } else {
                    this.selectedSketchArcCenters?.delete?.(hit.id);
                }
            }
        } else {
            this.selectedSketchEntities.clear();
            this.selectedSketchArcCenters?.clear?.();
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
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const endRefId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local || !this.sketchLineStart) {
            return true;
        }

        if (this.sketchLineStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchLine(feature, this.sketchLineStart, local, {
                    startRefId: this.sketchLineStartRefId || null,
                    endRefId
                });
                // Drag gesture creates one segment and exits pending state.
                this.cancelSketchLine();
            }
            return true;
        }

        const created = this.createSketchLine(feature, this.sketchLineStart, local, {
            startRefId: this.sketchLineStartRefId || null,
            endRefId
        });
        if (this.getSketchHitLocalPoint(feature, resolved)) {
            // Common polygon workflow: close/attach on existing point and exit line mode.
            this.cancelSketchLine();
            this.setSketchTool('select');
            return true;
        }
        // Click-chain mode: keep endpoint as next segment start.
        this.sketchLineStart = { x: local.x, y: local.y };
        this.sketchLineStartRefId = created?.endPointId || null;
        this.sketchLineStartSeq = null;
        return true;
    }
    if (tool === 'arc') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const refId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local) {
            return true;
        }
        if (!this.sketchArcStart) {
            const downLocal = pointerDown?.local;
            const downRefId = (pointerDown?.hitId && pointerDown.hitId !== SKETCH_VIRTUAL_ORIGIN_ID) ? pointerDown.hitId : null;
            if (downLocal && dist > SKETCH_DRAG_START_PX) {
                this.sketchArcStart = { x: downLocal.x, y: downLocal.y };
                this.sketchArcStartRefId = downRefId;
                this.sketchArcEnd = { x: local.x, y: local.y };
                this.sketchArcEndRefId = refId;
                this.sketchArcPreview = null;
                this.updateSketchInteractionVisuals();
                return true;
            }
            this.sketchArcStart = { x: local.x, y: local.y };
            this.sketchArcStartRefId = refId;
            this.sketchArcEnd = null;
            this.sketchArcEndRefId = null;
            this.sketchArcPreview = null;
            this.updateSketchInteractionVisuals();
            return true;
        }
        if (!this.sketchArcEnd) {
            this.sketchArcEnd = { x: local.x, y: local.y };
            this.sketchArcEndRefId = refId;
            this.updateSketchInteractionVisuals();
            return true;
        }
        const created = this.createSketchArc(feature, this.sketchArcStart, this.sketchArcEnd, local, {
            startRefId: this.sketchArcStartRefId || null,
            endRefId: this.sketchArcEndRefId || null
        });
        if (created) {
            this.cancelSketchArc();
            this.setSketchTool('select');
        }
        return true;
    }
    if (tool === 'circle') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const unsnappedLocal = this.projectEventToSketchLocal(event, feature);
        const snappedLocal = this.getSketchHitLocalPoint(feature, resolved) || unsnappedLocal;
        if (!this.sketchCircleCenter) {
            return true;
        }
        // Circle creation is intentionally simple:
        // first click establishes center, any later mouse-up with non-zero radius creates.
        // Works for click-click and click-drag-release.
        let end = unsnappedLocal || snappedLocal;
        if (!end && this.sketchArcPreview?.mode === 'circle') {
            end = {
                x: (this.sketchArcPreview.cx || 0) + (this.sketchArcPreview.radius || 0),
                y: this.sketchArcPreview.cy || 0
            };
        }
        if (!end) {
            return true;
        }
        const radial = Math.hypot(
            (end.x || 0) - (this.sketchCircleCenter.x || 0),
            (end.y || 0) - (this.sketchCircleCenter.y || 0)
        );
        if (!Number.isFinite(radial) || radial <= SKETCH_MIN_LINE_LENGTH) {
            return true;
        }
        const created = this.createSketchCircle(feature, this.sketchCircleCenter, end, {
            centerRefId: this.sketchCircleCenterRefId || null
        });
        if (created) {
            this.cancelSketchCircle();
            this.setSketchTool('select');
        }
        return true;
    }
    if (tool === 'rect' || tool === 'rect-center') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const endRefId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local || !this.sketchRectStart) {
            return true;
        }
        const centerMode = tool === 'rect-center';
        if (this.sketchRectStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchRectangle(feature, this.sketchRectStart, local, {
                    centerMode,
                    startRefId: this.sketchRectStartRefId || null,
                    endRefId
                });
                this.cancelSketchRect();
                this.setSketchTool('select');
            }
            return true;
        }
        const created = this.createSketchRectangle(feature, this.sketchRectStart, local, {
            centerMode,
            startRefId: this.sketchRectStartRefId || null,
            endRefId
        });
        if (created) {
            this.cancelSketchRect();
            this.setSketchTool('select');
        }
        return true;
    }

    return true;
}

function handleSketchDrag(delta, offset, isDone) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }
    const tool = this.getSketchTool();

    if (tool === 'circle') {
        if (!isDone) {
            return true;
        }
        if (!this.sketchCircleCenter) {
            return false;
        }
        const preview = this.sketchArcPreview;
        if (!preview || preview.mode !== 'circle' || !Number.isFinite(preview.radius)) {
            return true;
        }
        if (preview.radius <= SKETCH_MIN_LINE_LENGTH) {
            return true;
        }
        const end = {
            x: Number(preview.cx || 0) + Number(preview.radius || 0),
            y: Number(preview.cy || 0)
        };
        const created = this.createSketchCircle(feature, this.sketchCircleCenter, end, {
            centerRefId: this.sketchCircleCenterRefId || null
        });
        if (created) {
            this.cancelSketchCircle();
            this.setSketchTool('select');
        }
        return true;
    }

    if (tool !== 'select') {
        return false;
    }

    if (!this.sketchPointerDown) {
        return false;
    }

    if (isDone) {
        if (this.sketchMarquee) {
            this.finishSketchMarquee(feature);
            return true;
        }
        if (!this.sketchDrag) {
            return false;
        }
        const moved = !!this.sketchDrag.moved;
        const snapPointId = this.sketchDrag.snapPointId || null;
        const snapPointType = this.sketchDrag.snapPointType || null;
        const snapArcId = this.sketchDrag.snapArcId || null;
        const snapMovedPointId = this.sketchDrag.snapMovedPointId || null;
        const movedPointIds = this.sketchDrag.movedPointIds || new Set();
        this.sketchDrag = null;
        if (moved) {
            if (snapPointType === 'point' && snapPointId && snapMovedPointId && snapMovedPointId !== snapPointId) {
                addCoincidentConstraintIfMissing.call(this, feature, snapMovedPointId, snapPointId);
                enforceSketchConstraintsInPlace(feature);
            }
            if (snapPointType === 'arc-center' && snapArcId && snapMovedPointId) {
                feature.constraints = Array.isArray(feature.constraints) ? feature.constraints : [];
                this.toggleSketchConstraintInList(feature, feature.constraints, 'arc_center_coincident', [snapArcId, snapMovedPointId]);
                enforceSketchConstraintsInPlace(feature);
            }
            // Always run one final full solve at gesture end to settle coupled constraints.
            enforceSketchConstraintsInPlace(feature);
            api.features.commit(feature.id, {
                opType: 'feature.update',
                payload: {
                    field: snapPointType === 'point' && snapPointId && snapMovedPointId
                        ? 'entities.move+constraints.coincident'
                        : snapPointType === 'arc-center' && snapArcId && snapMovedPointId
                            ? 'entities.move+constraints.arc_center_coincident'
                            : 'entities.move'
                }
            });
        }
        this.hoveredSketchEntityId = null;
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
        const downType = this.sketchPointerDown.hitType || null;
        const entities = Array.isArray(feature?.entities) ? feature.entities : [];
        const entityById = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
        if (!downId || downId === SKETCH_VIRTUAL_ORIGIN_ID) {
            this.startSketchMarquee(feature, this.sketchPointerDown, event);
            this.hoveredSketchEntityId = null;
            this.updateSketchInteractionVisuals();
            return true;
        }
        const centerDrag = downType === 'arc-center';
        const downEntity = entityById.get(downId) || null;
        const circleCurveDown = downType === 'arc' && downEntity?.type === 'arc' && downEntity?.circle;
        const dragSelectedLines = this.selectedSketchEntities.has(downId)
            || this.isPointOnSelectedSketchLine(feature, downId);
        const activeIds = centerDrag
            ? new Set([downId])
            : circleCurveDown
            ? new Set([downId])
            : dragSelectedLines
            ? new Set(this.selectedSketchEntities)
            : new Set([downId]);
        const circleCurveDragIds = new Set();
        if (!centerDrag) {
            for (const id of activeIds) {
                const ent = entityById.get(id);
                if (ent?.type === 'arc' && ent?.circle) {
                    circleCurveDragIds.add(id);
                }
            }
            const downEnt = entityById.get(downId);
            if (downType === 'arc' && downEnt?.type === 'arc' && downEnt?.circle) {
                circleCurveDragIds.add(downId);
            }
        }
        const refs = this.collectCoordinateRefsFromIds(feature, activeIds);
        if (!this.sketchPointerDown.local) {
            return false;
        }
        const baseline = new Map();
        if (!centerDrag) {
            for (const ref of refs) {
                baseline.set(ref, { x: ref.x || 0, y: ref.y || 0 });
            }
        }
        const arcControlBaseline = [];
        const pointById = new Map(entities.filter(e => e?.type === 'point' && e.id).map(e => [e.id, e]));
        for (const entity of entities) {
            if (entity?.type !== 'arc' || !entity.id) continue;
            if (!activeIds.has(entity.id)) continue;
            if (!Number.isFinite(entity.mx) || !Number.isFinite(entity.my)) continue;
            const pa = pointById.get(entity.a) || null;
            const pb = pointById.get(entity.b) || null;
            arcControlBaseline.push({
                entity,
                mx: entity.mx,
                my: entity.my,
                cx: Number(entity.cx || 0),
                cy: Number(entity.cy || 0),
                radius: Number(entity.radius || 0),
                a: pa ? { x: pa.x || 0, y: pa.y || 0 } : null,
                b: pb ? { x: pb.x || 0, y: pb.y || 0 } : null
            });
        }
        this.sketchDrag = {
            start: { x: this.sketchPointerDown.local.x, y: this.sketchPointerDown.local.y },
            baseline,
            arcControlBaseline,
            activeIds,
            circleCurveDragIds,
            movedPointIds: new Set((centerDrag ? [] : refs).map(ref => ref?.id).filter(Boolean)),
            centerDrag,
            snapPointId: null,
            snapMovedPointId: null,
            moved: false
        };
        this.hoveredSketchEntityId = null;
        this.updateSketchInteractionVisuals();
    }

    if (this.sketchMarquee) {
        this.updateSketchMarquee(event);
        return true;
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
    for (const ctrl of this.sketchDrag.arcControlBaseline || []) {
        ctrl.entity.mx = ctrl.mx + dx;
        ctrl.entity.my = ctrl.my + dy;
    }
    this.applyCircleDragKinematics(feature, dx, dy, local);

    const activeCircleDrag = !!(this.sketchDrag.circleCurveDragIds?.size);
    const snap = (this.sketchDrag.centerDrag || activeCircleDrag)
        ? null
        : this.getSketchDragSnapTarget(event, feature, this.sketchDrag.movedPointIds);
    const snapId = snap?.targetId || null;
    const snapType = snap?.targetType || null;
    const snapArcId = snap?.targetArcId || null;
    const snapMovedPointId = snap?.movedId || null;
    this.sketchDrag.snapPointId = snapId;
    this.sketchDrag.snapPointType = snapType;
    this.sketchDrag.snapArcId = snapArcId;
    this.sketchDrag.snapMovedPointId = snapMovedPointId;
    this.hoveredSketchEntityId = snap?.hoveredId || snapId;

    if (activeCircleDrag && !this.sketchDrag.centerDrag) {
        // Keep circle-attached points stable during live radius drags; do one full solve on mouse-up.
        this.projectPointOnArcConstraintsForArcs(feature, this.sketchDrag.circleCurveDragIds);
    } else {
        enforceSketchConstraintsInPlace(feature, {
            useFallback: true,
            iterations: 48,
            draggedPointIds: Array.from(this.sketchDrag.movedPointIds || [])
        });
    }
    // Rebase to current solved state to keep long drags stable.
    this.rebaseSketchDragState(feature, local);
    this.sketchDrag.moved = this.sketchDrag.moved || Math.hypot(dx, dy) > 0;
    api.sketchRuntime.sync();
    this.updateSketchInteractionVisuals();
    return true;
}

function isPointOnSelectedSketchLine(feature, pointId) {
    if (!pointId || !this.selectedSketchEntities?.size) {
        return false;
    }
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if ((entity?.type !== 'line' && entity?.type !== 'arc') || !entity.id) continue;
        if (!this.selectedSketchEntities.has(entity.id)) continue;
        const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
        const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
        if (aId === pointId || bId === pointId) {
            return true;
        }
    }
    return false;
}

function startSketchMarquee(feature, pointerDown, event) {
    const start = this.viewportPointFromClient(pointerDown?.clientX, pointerDown?.clientY);
    const end = this.getEventViewportXY(event);
    if (!start || !end) {
        return;
    }
    this.sketchMarquee = {
        featureId: feature?.id || null,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        mode: end.x >= start.x ? 'window' : 'cross'
    };
    this.updateSketchMarqueeVisual();
}

function updateSketchMarquee(event) {
    if (!this.sketchMarquee) {
        return;
    }
    const end = this.getEventViewportXY(event);
    if (!end) {
        return;
    }
    this.sketchMarquee.endX = end.x;
    this.sketchMarquee.endY = end.y;
    this.sketchMarquee.mode = end.x >= this.sketchMarquee.startX ? 'window' : 'cross';
    this.updateSketchMarqueeVisual();
}

function finishSketchMarquee(feature) {
    if (!this.sketchMarquee) {
        return;
    }
    const marquee = this.sketchMarquee;
    this.clearSketchMarquee();
    const selectIds = this.selectSketchEntitiesInMarquee(feature, marquee);
    this.selectedSketchEntities = new Set(selectIds);
    this.selectedSketchArcCenters?.clear?.();
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
}

function clearSketchMarquee() {
    this.sketchMarquee = null;
    if (this.sketchMarqueeEl?.parentElement) {
        this.sketchMarqueeEl.parentElement.removeChild(this.sketchMarqueeEl);
    }
    this.sketchMarqueeEl = null;
}

function updateSketchMarqueeVisual() {
    const marquee = this.sketchMarquee;
    if (!marquee) {
        this.clearSketchMarquee();
        return;
    }
    const { container } = space.internals();
    if (!container) {
        return;
    }
    if (!this.sketchMarqueeEl) {
        const el = document.createElement('div');
        el.className = 'sketch-marquee sketch-marquee-window';
        container.appendChild(el);
        this.sketchMarqueeEl = el;
    }
    const left = Math.min(marquee.startX, marquee.endX);
    const top = Math.min(marquee.startY, marquee.endY);
    const width = Math.abs(marquee.endX - marquee.startX);
    const height = Math.abs(marquee.endY - marquee.startY);
    this.sketchMarqueeEl.className = `sketch-marquee ${marquee.mode === 'cross' ? 'sketch-marquee-cross' : 'sketch-marquee-window'}`;
    this.sketchMarqueeEl.style.left = `${left}px`;
    this.sketchMarqueeEl.style.top = `${top}px`;
    this.sketchMarqueeEl.style.width = `${width}px`;
    this.sketchMarqueeEl.style.height = `${height}px`;
}

function viewportPointFromClient(clientX, clientY) {
    const { container } = space.internals();
    if (!container) {
        return null;
    }
    const rect = container.getBoundingClientRect();
    return {
        x: (clientX || 0) - rect.left,
        y: (clientY || 0) - rect.top
    };
}

function selectSketchEntitiesInMarquee(feature, marquee) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const basis = this.getSketchBasis(feature);
    if (!basis) {
        return [];
    }
    const minX = Math.min(marquee.startX, marquee.endX);
    const maxX = Math.max(marquee.startX, marquee.endX);
    const minY = Math.min(marquee.startY, marquee.endY);
    const maxY = Math.max(marquee.startY, marquee.endY);
    const rect = { minX, maxX, minY, maxY };
    const isWindow = marquee.mode !== 'cross';

    const out = [];
    const pointById = new Map();
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            pointById.set(entity.id, entity);
        }
    }
    for (const entity of entities) {
        if (!entity?.id) continue;
        if (entity.type === 'point') {
            const p = this.projectSketchLocalToScreen({ x: entity.x || 0, y: entity.y || 0 }, basis);
            if (!p) continue;
            if (this.isPointInRect(p.x, p.y, rect)) {
                out.push(entity.id);
            }
            continue;
        }
        if (entity.type === 'line') {
            const [a, b] = this.getLineEndpoints(entity, pointById);
            if (!a || !b) continue;
            const pa = this.projectSketchLocalToScreen({ x: a.x || 0, y: a.y || 0 }, basis);
            const pb = this.projectSketchLocalToScreen({ x: b.x || 0, y: b.y || 0 }, basis);
            if (!pa || !pb) continue;
            const hit = isWindow
                ? (this.isPointInRect(pa.x, pa.y, rect) && this.isPointInRect(pb.x, pb.y, rect))
                : this.segmentTouchesRect(pa, pb, rect);
            if (hit) {
                out.push(entity.id);
            }
            continue;
        }
        if (entity.type === 'arc') {
            const [a, b] = this.getArcEndpoints(entity, pointById);
            if (!a || !b) continue;
            const sample = this.sampleArcPolyline(entity, a, b, 28);
            if (!sample.length) continue;
            const screen = sample
                .map(local => this.projectSketchLocalToScreen(local, basis))
                .filter(Boolean);
            if (screen.length < 2) continue;
            let hit = false;
            if (isWindow) {
                hit = screen.every(p => this.isPointInRect(p.x, p.y, rect));
            } else {
                for (let i = 0; i < screen.length - 1 && !hit; i++) {
                    if (this.segmentTouchesRect(screen[i], screen[i + 1], rect)) {
                        hit = true;
                    }
                }
            }
            if (hit) {
                out.push(entity.id);
            }
        }
    }
    return out;
}

function projectSketchLocalToScreen(local, basis) {
    const world = this.sketchLocalToWorld(local, basis);
    const proj = api.overlay.project3Dto2D(world);
    if (!proj?.visible) {
        return null;
    }
    return { x: proj.x, y: proj.y };
}

function isPointInRect(x, y, rect) {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function segmentTouchesRect(a, b, rect) {
    if (this.isPointInRect(a.x, a.y, rect) || this.isPointInRect(b.x, b.y, rect)) {
        return true;
    }
    const edges = [
        [{ x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }],
        [{ x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }],
        [{ x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }],
        [{ x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY }]
    ];
    for (const [c, d] of edges) {
        if (this.segmentsIntersect(a, b, c, d)) {
            return true;
        }
    }
    return false;
}

function segmentsIntersect(a, b, c, d) {
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSeg = (p, q, r) =>
        Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
        Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);

    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);

    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) {
        return true;
    }
    if (Math.abs(o1) < 1e-9 && onSeg(a, c, b)) return true;
    if (Math.abs(o2) < 1e-9 && onSeg(a, d, b)) return true;
    if (Math.abs(o3) < 1e-9 && onSeg(c, a, d)) return true;
    if (Math.abs(o4) < 1e-9 && onSeg(c, b, d)) return true;
    return false;
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
            // Use canonical point entities so drag/solver mutate shared objects.
            const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
            const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
            if (aId && pointById.has(aId)) {
                refs.add(pointById.get(aId));
            }
            if (bId && pointById.has(bId)) {
                refs.add(pointById.get(bId));
            }
        }
        if (entity.type === 'arc') {
            const aId = typeof entity?.a === 'string' ? entity.a : null;
            const bId = typeof entity?.b === 'string' ? entity.b : null;
            if (aId && pointById.has(aId)) {
                refs.add(pointById.get(aId));
            }
            if (bId && pointById.has(bId)) {
                refs.add(pointById.get(bId));
            }
        }
    }
    return Array.from(refs);
}

function createSketchPoint(feature, local) {
    const existing = this.findPointByCoord(feature, local, SKETCH_POINT_MERGE_EPS);
    if (existing) {
        this.selectedSketchEntities.clear();
        this.selectedSketchArcCenters?.clear?.();
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
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'point' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
}

function createSketchLine(feature, a, b, options = {}) {
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    if (Math.hypot(dx, dy) < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }

    const id = this.newSketchEntityId('line');
    let createdStartPointId = null;
    let createdEndPointId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const pa = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: a.x,
            y: a.y,
            fixed: false
        };
        const pb = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: b.x,
            y: b.y,
            fixed: false
        };
        createdStartPointId = pa.id;
        createdEndPointId = pb.id;
        sketch.entities.push(pa, pb);

        if (options.startRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pa.id, options.startRefId);
        }
        if (options.endRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pb.id, options.endRefId);
        }

        sketch.entities.push({
            id,
            type: 'line',
            construction: false,
            a: pa.id,
            b: pb.id
        });
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'line' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchLinePreview = null;
    this.updateSketchInteractionVisuals();
    return { lineId: id, startPointId: createdStartPointId, endPointId: createdEndPointId };
}

function createSketchArc(feature, start, end, onArc, options = {}) {
    const geom = this.computeArcGeometry(start, end, onArc);
    if (!geom) {
        return null;
    }
    const id = this.newSketchEntityId('arc');
    let createdStartPointId = null;
    let createdEndPointId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const pa = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: start.x,
            y: start.y,
            fixed: false
        };
        const pb = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: end.x,
            y: end.y,
            fixed: false
        };
        createdStartPointId = pa.id;
        createdEndPointId = pb.id;
        sketch.entities.push(pa, pb);

        if (options.startRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pa.id, options.startRefId);
        }
        if (options.endRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pb.id, options.endRefId);
        }

        sketch.entities.push({
            id,
            type: 'arc',
            construction: false,
            a: pa.id,
            b: pb.id,
            mx: onArc.x,
            my: onArc.y,
            cx: geom.cx,
            cy: geom.cy,
            radius: geom.radius,
            startAngle: geom.startAngle,
            endAngle: geom.endAngle,
            ccw: geom.ccw
        });
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'arc' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchArcPreview = null;
    this.updateSketchInteractionVisuals();
    return { arcId: id, startPointId: createdStartPointId, endPointId: createdEndPointId };
}

function createSketchCircle(feature, center, edge, options = {}) {
    const radius = Math.hypot((edge.x || 0) - (center.x || 0), (edge.y || 0) - (center.y || 0));
    if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const angle = Math.atan2((edge.y || 0) - (center.y || 0), (edge.x || 0) - (center.x || 0));
    const edgePt = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
    };
    const id = this.newSketchEntityId('arc');
    let p1Id = null;
    let p2Id = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const p1 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: edgePt.x,
            y: edgePt.y,
            fixed: false
        };
        const p2 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: edgePt.x,
            y: edgePt.y,
            fixed: false
        };
        p1Id = p1.id;
        p2Id = p2.id;
        sketch.entities.push(p1, p2);
        if (options.centerRefId) {
            sketch.constraints.push({
                id: this.newSketchEntityId('cst'),
                type: 'arc_center_coincident',
                refs: [id, options.centerRefId],
                data: {},
                created_at: Date.now()
            });
        }
        sketch.entities.push({
            id,
            type: 'arc',
            circle: true,
            construction: false,
            a: p1.id,
            b: p2.id,
            cx: center.x,
            cy: center.y,
            radius,
            mx: center.x + Math.cos(angle + Math.PI / 2) * radius,
            my: center.y + Math.sin(angle + Math.PI / 2) * radius,
            startAngle: 0,
            endAngle: Math.PI * 2,
            ccw: true
        });
        addCoincidentConstraintIfMissing.call(this, sketch, p1.id, p2.id);
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'circle' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchArcPreview = null;
    this.updateSketchInteractionVisuals();
    return { circleId: id, pointIds: [p1Id, p2Id] };
}

function makeSketchRectPreview(start, end, centerMode = false) {
    const corners = this.getRectangleCorners(start, end, centerMode);
    if (!corners) return null;
    return {
        mode: centerMode ? 'center' : 'corner',
        corners
    };
}

function getRectangleCorners(start, end, centerMode = false) {
    if (!start || !end) return null;
    const sx = Number(start.x || 0);
    const sy = Number(start.y || 0);
    const ex = Number(end.x || 0);
    const ey = Number(end.y || 0);
    let p1, p2, p3, p4;
    if (centerMode) {
        const dx = ex - sx;
        const dy = ey - sy;
        p1 = { x: sx - dx, y: sy - dy };
        p3 = { x: sx + dx, y: sy + dy };
        p2 = { x: p3.x, y: p1.y };
        p4 = { x: p1.x, y: p3.y };
    } else {
        p1 = { x: sx, y: sy };
        p3 = { x: ex, y: ey };
        p2 = { x: p3.x, y: p1.y };
        p4 = { x: p1.x, y: p3.y };
    }
    if (Math.abs(p3.x - p1.x) < SKETCH_MIN_LINE_LENGTH || Math.abs(p3.y - p1.y) < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    return [p1, p2, p3, p4];
}

function createSketchRectangle(feature, start, end, options = {}) {
    const corners = this.getRectangleCorners(start, end, !!options.centerMode);
    if (!corners) {
        return null;
    }
    const [c1, c2, c3, c4] = corners;
    const ids = {
        p1: this.newSketchEntityId('point'),
        p2: this.newSketchEntityId('point'),
        p3: this.newSketchEntityId('point'),
        p4: this.newSketchEntityId('point'),
        pc: options.centerMode ? this.newSketchEntityId('point') : null,
        l1: this.newSketchEntityId('line'),
        l2: this.newSketchEntityId('line'),
        l3: this.newSketchEntityId('line'),
        l4: this.newSketchEntityId('line')
    };
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const pts = [
            { id: ids.p1, type: 'point', x: c1.x, y: c1.y, fixed: false },
            { id: ids.p2, type: 'point', x: c2.x, y: c2.y, fixed: false },
            { id: ids.p3, type: 'point', x: c3.x, y: c3.y, fixed: false },
            { id: ids.p4, type: 'point', x: c4.x, y: c4.y, fixed: false }
        ];
        if (ids.pc) {
            pts.push({
                id: ids.pc,
                type: 'point',
                x: ((c1.x || 0) + (c3.x || 0)) * 0.5,
                y: ((c1.y || 0) + (c3.y || 0)) * 0.5,
                fixed: false
            });
        }
        sketch.entities.push(...pts);

        if (options.startRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, ids.p1, options.startRefId);
        }
        if (options.endRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, ids.p3, options.endRefId);
        }

        sketch.entities.push(
            { id: ids.l1, type: 'line', construction: false, a: ids.p1, b: ids.p2 },
            { id: ids.l2, type: 'line', construction: false, a: ids.p2, b: ids.p3 },
            { id: ids.l3, type: 'line', construction: false, a: ids.p3, b: ids.p4 },
            { id: ids.l4, type: 'line', construction: false, a: ids.p4, b: ids.p1 }
        );

        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'horizontal', [ids.l1]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'horizontal', [ids.l3]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'vertical', [ids.l2]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'vertical', [ids.l4]);
        if (options.centerMode && ids.pc) {
            this.toggleSketchConstraintInList(sketch, sketch.constraints, 'midpoint', [ids.pc, ids.p1, ids.p3]);
        }
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: options.centerMode ? 'rect-center' : 'rect' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(ids.l1);
    this.selectedSketchEntities.add(ids.l2);
    this.selectedSketchEntities.add(ids.l3);
    this.selectedSketchEntities.add(ids.l4);
    this.hoveredSketchEntityId = null;
    this.sketchRectPreview = null;
    this.updateSketchInteractionVisuals();

    return ids;
}

function createSketchPolygonFromSelectedCircle(mode = 'inscribed') {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const circle = this.getSelectedSketchCircle(feature);
    if (!circle) return false;

    const raw = window.prompt('Number of sides', '6');
    if (raw === null) return false;
    const sides = Math.max(3, Math.min(64, Math.round(Number(raw))));
    if (!Number.isFinite(sides) || sides < 3) return false;

    const data = this.getCircleData(feature, circle);
    if (!data) return false;
    const { cx, cy, radius, startAngle } = data;
    const isCircumscribed = mode === 'circumscribed';
    const step = (Math.PI * 2) / sides;
    const base = isCircumscribed ? startAngle + (Math.PI / sides) : startAngle;
    const polyRadius = isCircumscribed ? (radius / Math.cos(Math.PI / sides)) : radius;
    if (!Number.isFinite(polyRadius) || polyRadius <= SKETCH_MIN_LINE_LENGTH) return false;

    const pointIds = [];
    const lineIds = [];
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        for (let i = 0; i < sides; i++) {
            const ang = base + i * step;
            const pid = this.newSketchEntityId('point');
            pointIds.push(pid);
            sketch.entities.push({
                id: pid,
                type: 'point',
                x: cx + Math.cos(ang) * polyRadius,
                y: cy + Math.sin(ang) * polyRadius,
                fixed: false
            });
        }
        for (let i = 0; i < sides; i++) {
            const lid = this.newSketchEntityId('line');
            lineIds.push(lid);
            sketch.entities.push({
                id: lid,
                type: 'line',
                construction: false,
                a: pointIds[i],
                b: pointIds[(i + 1) % sides]
            });
        }

        for (let i = 1; i < lineIds.length; i++) {
            this.toggleSketchConstraintInList(sketch, sketch.constraints, 'equal', [lineIds[0], lineIds[i]]);
        }
        if (isCircumscribed) {
            for (const lineId of lineIds) {
                this.toggleSketchConstraintInList(sketch, sketch.constraints, 'tangent', [lineId, circle.id]);
            }
        } else {
            for (const pointId of pointIds) {
                this.toggleSketchConstraintInList(sketch, sketch.constraints, 'point_on_arc', [pointId, circle.id]);
            }
        }
        enforceSketchConstraintsInPlace(sketch, {
            useFallback: true,
            iterations: 96
        });
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: isCircumscribed ? 'polygon-circumscribed' : 'polygon-inscribed' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    for (const id of lineIds) this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function getSelectedSketchCircle(feature) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const selected = entities.filter(entity => this.selectedSketchEntities.has(entity.id));
    const circles = selected.filter(entity => entity?.type === 'arc' && entity?.circle);
    if (circles.length !== 1) return null;
    return circles[0];
}

function getCircleData(feature, circle) {
    if (!circle || circle.type !== 'arc' || !circle.circle) return null;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const [a] = this.getArcEndpoints(circle, byId);
    const cx = Number(circle.cx);
    const cy = Number(circle.cy);
    const radius = Number(circle.radius);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const startAngle = a
        ? Math.atan2((a.y || 0) - cy, (a.x || 0) - cx)
        : 0;
    return { cx, cy, radius, startAngle };
}

function computeArcGeometry(start, end, onArc) {
    if (!start || !end || !onArc) {
        return null;
    }
    const x1 = start.x || 0;
    const y1 = start.y || 0;
    const x2 = end.x || 0;
    const y2 = end.y || 0;
    const x3 = onArc.x || 0;
    const y3 = onArc.y || 0;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-8) {
        return null;
    }
    const x1sq = x1 * x1 + y1 * y1;
    const x2sq = x2 * x2 + y2 * y2;
    const x3sq = x3 * x3 + y3 * y3;
    const cx = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
    const cy = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
    const radius = Math.hypot(x1 - cx, y1 - cy);
    if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const startAngle = Math.atan2(y1 - cy, x1 - cx);
    const endAngle = Math.atan2(y2 - cy, x2 - cx);
    const midAngle = Math.atan2(y3 - cy, x3 - cx);
    const normalize = a => {
        let out = a % (Math.PI * 2);
        if (out < 0) out += Math.PI * 2;
        return out;
    };
    const sa = normalize(startAngle);
    const ea = normalize(endAngle);
    const ma = normalize(midAngle);
    const ccwSpan = (ea - sa + Math.PI * 2) % (Math.PI * 2);
    const ccwMid = (ma - sa + Math.PI * 2) % (Math.PI * 2);
    const ccw = ccwMid <= ccwSpan;
    return { cx, cy, radius, startAngle, endAngle, ccw };
}

function addCoincidentConstraintIfMissing(sketch, aId, bId) {
    if (!aId || !bId || aId === bId) return;
    sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
    const refs = [aId, bId].sort();
    const key = `coincident:${refs.join(',')}`;
    for (const c of sketch.constraints) {
        if (this.makeSketchConstraintKey(c?.type, c?.refs || []) === key) {
            return;
        }
    }
    sketch.constraints.push({
        id: this.newSketchEntityId('cst'),
        type: 'coincident',
        refs,
        data: {},
        created_at: Date.now()
    });
    this.convertArcToCircleInSketch?.(sketch, aId, bId);
}

function convertArcToCircleInSketch(sketch, p1Id, p2Id) {
    if (!sketch || !p1Id || !p2Id || p1Id === p2Id) {
        return false;
    }
    sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
    const byId = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
    const p1 = byId.get(p1Id);
    const p2 = byId.get(p2Id);
    if (!p1 || !p2) return false;
    let changed = false;
    for (const arc of sketch.entities) {
        if (arc?.type !== 'arc' || !arc.id) continue;
        const a = typeof arc.a === 'string' ? arc.a : null;
        const b = typeof arc.b === 'string' ? arc.b : null;
        if (!a || !b) continue;
        const match = (a === p1Id && b === p2Id) || (a === p2Id && b === p1Id);
        if (!match) continue;

        const center = this.getArcCenterLocalFromEntity(arc, byId)
            || (Number.isFinite(arc.cx) && Number.isFinite(arc.cy) ? { x: arc.cx, y: arc.cy } : null);
        if (!center) continue;
        const rx = (p1.x || 0) - center.x;
        const ry = (p1.y || 0) - center.y;
        const radius = Math.hypot(rx, ry);
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            continue;
        }
        if (Math.abs((p2.x || 0) - (p1.x || 0)) > 1e-9 || Math.abs((p2.y || 0) - (p1.y || 0)) > 1e-9) {
            p2.x = p1.x || 0;
            p2.y = p1.y || 0;
            changed = true;
        }
        const angle = Math.atan2(ry, rx);
        arc.circle = true;
        arc.cx = center.x;
        arc.cy = center.y;
        arc.radius = radius;
        arc.mx = center.x + Math.cos(angle + Math.PI / 2) * radius;
        arc.my = center.y + Math.sin(angle + Math.PI / 2) * radius;
        arc.startAngle = 0;
        arc.endAngle = Math.PI * 2;
        arc.ccw = true;
        changed = true;
    }
    return changed;
}

function updateSketchInteractionVisuals() {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return;
    }
    const dragHoverId = this.sketchDrag?.snapPointId || null;
    api.sketchRuntime?.setEntityInteraction(feature.id, {
        hoveredId: this.sketchDrag ? dragHoverId : this.hoveredSketchEntityId,
        selectedIds: Array.from(this.selectedSketchEntities),
        hoveredConstraintId: this.hoveredSketchConstraintId || null,
        selectedConstraintIds: Array.from(this.selectedSketchConstraints || []),
        previewLine: this.sketchLinePreview,
        previewStart: this.sketchLineStart || this.sketchArcStart || this.sketchCircleCenter || this.sketchRectStart,
        previewEnd: this.sketchArcEnd || null,
        previewArc: this.sketchArcPreview,
        previewRect: this.sketchRectPreview
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
        if (entity.type === 'arc') {
            const center = this.getArcCenterLocalFromEntity(entity, pointById);
            if (center) {
                const wc = this.sketchLocalToWorld(center, basis);
                const pc = api.overlay.project3Dto2D(wc);
                if (pc?.visible) {
                    const cd = Math.hypot(screenPoint.x - pc.x, screenPoint.y - pc.y);
                    if (cd <= SKETCH_HIT_POINT_PX && (!bestPoint || cd < bestPoint.dist)) {
                        bestPoint = { id: entity.id, type: 'arc-center', dist: cd };
                    }
                }
            }
            const [a, b] = this.getArcEndpoints(entity, pointById);
            if (!a || !b) continue;
            const sample = this.sampleArcPolyline(entity, a, b, 32);
            let minDist = Infinity;
            for (let i = 0; i < sample.length - 1; i++) {
                const wa = this.sketchLocalToWorld(sample[i], basis);
                const wb = this.sketchLocalToWorld(sample[i + 1], basis);
                const pa = api.overlay.project3Dto2D(wa);
                const pb = api.overlay.project3Dto2D(wb);
                if (!pa?.visible || !pb?.visible) continue;
                const dist = this.distanceToSegmentPx(screenPoint.x, screenPoint.y, pa.x, pa.y, pb.x, pb.y);
                minDist = Math.min(minDist, dist);
            }
            if (minDist <= SKETCH_HIT_LINE_PX && (!bestLine || minDist < bestLine.dist)) {
                bestLine = { id: entity.id, type: 'arc', dist: minDist };
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

function getArcCenterLocalFromEntity(arc, pointById) {
    const [a, b] = this.getArcEndpoints(arc, pointById);
    if (!a || !b) return null;
    if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my)) {
        const geom = this.computeArcGeometry(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (geom) {
            return { x: geom.cx, y: geom.cy };
        }
    }
    if (Number.isFinite(arc?.cx) && Number.isFinite(arc?.cy)) {
        return { x: arc.cx, y: arc.cy };
    }
    return null;
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
        const refId = hit.object.userData?.sketchEntityRefId || id;
        const cand = { id: refId, type, distance: hit.distance ?? Infinity };
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

function isSketchEventInViewport(event) {
    if (!event) return true;
    const { container } = space.internals();
    if (!container) return true;
    if (!event.target) return true;
    return container.contains(event.target);
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

function getSketchDragSnapTarget(event, feature, movedPointIds) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const basis = this.getSketchBasis(feature);
    const vp = this.getEventViewportXY(event);
    if (!basis || !vp) {
        return null;
    }

    const points = entities.filter(e => e?.type === 'point' && e.id);
    const moved = points.filter(p => movedPointIds?.has(p.id));
    const others = points.filter(p => !movedPointIds?.has(p.id) && p.id !== SKETCH_VIRTUAL_ORIGIN_ID);
    if (!moved.length) {
        return null;
    }

    let target = null;
    for (const p of others) {
        const world = this.sketchLocalToWorld(p, basis);
        const proj = api.overlay.project3Dto2D(world);
        if (!proj?.visible) continue;
        const d = Math.hypot(vp.x - proj.x, vp.y - proj.y);
        if (d > SKETCH_HIT_POINT_PX * 1.8) continue;
        if (!target || d < target.dist) {
            target = { point: p, dist: d, type: 'point', hoveredId: p.id };
        }
    }
    const byId = new Map(points.map(p => [p.id, p]));
    for (const arc of entities) {
        if (arc?.type !== 'arc' || !arc.id) continue;
        const center = this.getArcCenterLocalFromEntity(arc, byId);
        if (!center) continue;
        const world = this.sketchLocalToWorld(center, basis);
        const proj = api.overlay.project3Dto2D(world);
        if (!proj?.visible) continue;
        const d = Math.hypot(vp.x - proj.x, vp.y - proj.y);
        if (d > SKETCH_HIT_POINT_PX * 1.8) continue;
        const arcCenterId = `arc-center:${arc.id}`;
        if (!target || d < target.dist) {
            target = { arc, center, dist: d, type: 'arc-center', hoveredId: arcCenterId };
        }
    }
    if (!target) {
        return null;
    }

    let nearestMoved = null;
    const tx = target.type === 'arc-center' ? (target.center.x || 0) : (target.point.x || 0);
    const ty = target.type === 'arc-center' ? (target.center.y || 0) : (target.point.y || 0);
    for (const p of moved) {
        const dx = (p.x || 0) - tx;
        const dy = (p.y || 0) - ty;
        const d = Math.hypot(dx, dy);
        if (!nearestMoved || d < nearestMoved.dist) {
            nearestMoved = { point: p, dist: d };
        }
    }
    if (!nearestMoved) {
        return null;
    }
    return {
        targetType: target.type || 'point',
        targetId: target.point?.id || null,
        targetArcId: target.arc?.id || null,
        hoveredId: target.hoveredId || target.point?.id || null,
        movedId: nearestMoved.point.id
    };
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
    const aId = typeof line?.a === 'string' ? line.a : (typeof line?.p1_id === 'string' ? line.p1_id : null);
    const bId = typeof line?.b === 'string' ? line.b : (typeof line?.p2_id === 'string' ? line.p2_id : null);
    let a = null;
    let b = null;
    if (aId) {
        a = pointById?.get(aId) || null;
    } else if (line?.a && typeof line.a === 'object') {
        a = line.a;
    }
    if (bId) {
        b = pointById?.get(bId) || null;
    } else if (line?.b && typeof line.b === 'object') {
        b = line.b;
    }
    return [a, b];
}

function getArcEndpoints(arc, pointById) {
    const aId = typeof arc?.a === 'string' ? arc.a : null;
    const bId = typeof arc?.b === 'string' ? arc.b : null;
    const a = aId ? (pointById?.get(aId) || null) : null;
    const b = bId ? (pointById?.get(bId) || null) : null;
    return [a, b];
}

function applyCircleDragKinematics(feature, dx = 0, dy = 0, local = null) {
    const drag = this.sketchDrag;
    if (!drag) return;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const ctrlByArcId = new Map((drag.arcControlBaseline || []).map(rec => [rec.entity?.id, rec]));

    for (const arc of entities) {
        if (arc?.type !== 'arc' || !arc?.circle || !arc.id) continue;
        const touchesCircle = drag.activeIds?.has?.(arc.id)
            || drag.movedPointIds?.has?.(arc.a)
            || drag.movedPointIds?.has?.(arc.b);
        if (!touchesCircle) continue;
        const a = byId.get(arc.a);
        const b = byId.get(arc.b);
        if (!a || !b) continue;
        let cx = Number(arc.cx || 0);
        let cy = Number(arc.cy || 0);

        const movedA = drag.movedPointIds?.has?.(a.id);
        const movedB = drag.movedPointIds?.has?.(b.id);

        if (drag.centerDrag) {
            const cbase = ctrlByArcId.get(arc.id);
            if (cbase) {
                arc.cx = (cbase.cx || 0) + dx;
                arc.cy = (cbase.cy || 0) + dy;
                if (cbase.a) {
                    a.x = (cbase.a.x || 0) + dx;
                    a.y = (cbase.a.y || 0) + dy;
                }
                if (cbase.b) {
                    b.x = (cbase.b.x || 0) + dx;
                    b.y = (cbase.b.y || 0) + dy;
                }
                arc.mx = (cbase.mx || 0) + dx;
                arc.my = (cbase.my || 0) + dy;
                arc.radius = Number.isFinite(cbase.radius) ? cbase.radius : (arc.radius || 0);
                arc.startAngle = 0;
                arc.endAngle = Math.PI * 2;
                arc.ccw = true;
                continue;
            }
        } else {
            // Keep center fixed for radius/curve drags.
            cx = arc.cx;
            cy = arc.cy;
        }

        const curveDrag = drag.circleCurveDragIds?.has?.(arc.id) && !drag.centerDrag;
        // Radius drag: use the moved endpoint, or when dragging the circle curve itself,
        // use the current mouse-projected local point as the radius handle.
        const anchor = movedA ? a : (movedB ? b : null);
        const vx = curveDrag && local ? ((local.x || 0) - cx) : ((anchor?.x || a.x || 0) - cx);
        const vy = curveDrag && local ? ((local.y || 0) - cy) : ((anchor?.y || a.y || 0) - cy);
        let radius = Math.hypot(vx, vy);
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            radius = Number(arc.radius || 0);
        }
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            continue;
        }
        const angle = Math.atan2(vy, vx);
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        a.x = px;
        a.y = py;
        b.x = px;
        b.y = py;
        arc.radius = radius;
        arc.mx = cx + Math.cos(angle + Math.PI / 2) * radius;
        arc.my = cy + Math.sin(angle + Math.PI / 2) * radius;
        arc.startAngle = 0;
        arc.endAngle = Math.PI * 2;
        arc.ccw = true;
    }
}

function projectPointOnArcConstraintsForArcs(feature, arcIds) {
    const idSet = arcIds instanceof Set ? arcIds : new Set(Array.isArray(arcIds) ? arcIds : []);
    if (!idSet.size) return;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];
    const pointById = new Map(entities.filter(e => e?.type === 'point' && e?.id).map(e => [e.id, e]));
    const arcById = new Map(entities.filter(e => e?.type === 'arc' && e?.id).map(e => [e.id, e]));
    for (const c of constraints) {
        if (c?.type !== 'point_on_arc') continue;
        const refs = Array.isArray(c.refs) ? c.refs : [];
        if (refs.length < 2) continue;
        const arcId = arcById.has(refs[0]) ? refs[0] : (arcById.has(refs[1]) ? refs[1] : null);
        const pointId = pointById.has(refs[0]) ? refs[0] : (pointById.has(refs[1]) ? refs[1] : null);
        if (!arcId || !pointId || !idSet.has(arcId)) continue;
        const arc = arcById.get(arcId);
        const point = pointById.get(pointId);
        if (!arc?.circle || !point) continue;
        const cx = Number(arc.cx || 0);
        const cy = Number(arc.cy || 0);
        const radius = Number(arc.radius || 0);
        if (!Number.isFinite(radius) || radius <= SKETCH_MIN_LINE_LENGTH) continue;
        const vx = (point.x || 0) - cx;
        const vy = (point.y || 0) - cy;
        const len = Math.hypot(vx, vy);
        if (!Number.isFinite(len) || len <= 1e-9) continue;
        point.x = cx + (vx / len) * radius;
        point.y = cy + (vy / len) * radius;
    }
}

function rebaseSketchDragState(feature, local) {
    const drag = this.sketchDrag;
    if (!drag || !local) return;
    drag.start = { x: local.x || 0, y: local.y || 0 };

    if (drag.baseline instanceof Map) {
        for (const ref of drag.baseline.keys()) {
            drag.baseline.set(ref, { x: ref.x || 0, y: ref.y || 0 });
        }
    }

    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const entityById = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const pointById = new Map(entities.filter(e => e?.type === 'point' && e?.id).map(e => [e.id, e]));
    drag.arcControlBaseline = [];
    for (const id of (drag.activeIds || [])) {
        const entity = entityById.get(id);
        if (entity?.type !== 'arc' || !entity.id) continue;
        if (!Number.isFinite(entity.mx) || !Number.isFinite(entity.my)) continue;
        const pa = pointById.get(entity.a) || null;
        const pb = pointById.get(entity.b) || null;
        drag.arcControlBaseline.push({
            entity,
            mx: entity.mx,
            my: entity.my,
            cx: Number(entity.cx || 0),
            cy: Number(entity.cy || 0),
            radius: Number(entity.radius || 0),
            a: pa ? { x: pa.x || 0, y: pa.y || 0 } : null,
            b: pb ? { x: pb.x || 0, y: pb.y || 0 } : null
        });
    }
}

function sampleArcPolyline(arc, a, b, segments = 24) {
    if (arc?.circle) {
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        let radius = Number(arc?.radius);
        if (!Number.isFinite(radius) || radius <= 0) {
            radius = a ? Math.hypot((a.x || 0) - cx, (a.y || 0) - cy) : 0;
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || radius <= 0) {
            return [];
        }
        const count = Math.max(24, segments * 2);
        let start = 0;
        if (a) {
            start = Math.atan2((a.y || 0) - cy, (a.x || 0) - cx);
        }
        const pts = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const angle = start + t * Math.PI * 2;
            pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
        }
        return pts;
    }
    let cx = Number(arc?.cx);
    let cy = Number(arc?.cy);
    let radius = Number(arc?.radius);
    let startAngle = Number(arc?.startAngle);
    let endAngle = Number(arc?.endAngle);
    let ccw = arc?.ccw !== false;
    if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my) && a && b) {
        const geomFromThree = this.computeArcGeometry(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (geomFromThree) {
            cx = geomFromThree.cx;
            cy = geomFromThree.cy;
            radius = geomFromThree.radius;
            startAngle = geomFromThree.startAngle;
            endAngle = geomFromThree.endAngle;
            ccw = geomFromThree.ccw;
        }
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
        if (!a || !b) return [];
        const geom = this.computeArcGeometry(a, b, { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 + 1e-3 });
        if (!geom) return [{ x: a.x || 0, y: a.y || 0 }, { x: b.x || 0, y: b.y || 0 }];
        startAngle = geom.startAngle;
        endAngle = geom.endAngle;
        cx = geom.cx;
        cy = geom.cy;
        radius = geom.radius;
        ccw = geom.ccw;
    }
    if (!Number.isFinite(radius) || radius <= 0) {
        radius = a ? Math.hypot((a.x || 0) - cx, (a.y || 0) - cy) : 0;
    }
    if (radius <= 0) return [];
    const tau = Math.PI * 2;
    let sweep;
    if (ccw) {
        sweep = (endAngle - startAngle) % tau;
        if (sweep < 0) sweep += tau;
    } else {
        sweep = (startAngle - endAngle) % tau;
        if (sweep < 0) sweep += tau;
        sweep = -sweep;
    }
    const count = Math.max(6, segments);
    const pts = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const angle = startAngle + sweep * t;
        pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    if (a) {
        pts[0] = { x: a.x || 0, y: a.y || 0 };
    }
    if (b) {
        pts[pts.length - 1] = { x: b.x || 0, y: b.y || 0 };
    }
    return pts;
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
    cancelSketchArc,
    cancelSketchCircle,
    cancelSketchRect,
    clearSketchSelection,
    selectSketchConstraint,
    setHoveredSketchConstraint,
    handleSketchKeyDown,
    applySketchConstraint,
    toggleSketchConstraintInList,
    normalizeConstraintRefs,
    makeSketchConstraintKey,
    handleSketchPointerDown,
    handleSketchHover,
    handleSketchPointerMove,
    handleSketchMouseUp,
    handleSketchDrag,
    toggleSelectedConstruction,
    updateSketchInteractionVisuals,
    newSketchEntityId,
    pointerDistance,
    hitTestSketchEntity,
    getSketchEntityHitFromIntersections,
    resolveSketchHit,
    isSketchEventInViewport,
    getSketchHitLocalPoint,
    getSketchDragSnapTarget,
    distanceToSegmentPx,
    getEventViewportXY,
    getSketchBasis,
    sketchLocalToWorld,
    projectEventToSketchLocal,
    viewportPointFromClient,
    startSketchMarquee,
    updateSketchMarquee,
    finishSketchMarquee,
    clearSketchMarquee,
    updateSketchMarqueeVisual,
    selectSketchEntitiesInMarquee,
    projectSketchLocalToScreen,
    isPointInRect,
    segmentTouchesRect,
    segmentsIntersect,
    collectSelectedCoordinateRefs,
    collectCoordinateRefsFromIds,
    isPointOnSelectedSketchLine,
    createSketchArc,
    createSketchCircle,
    createSketchRectangle,
    makeSketchRectPreview,
    getRectangleCorners,
    findArcWithEndpoints,
    convertArcToCircle,
    convertArcToCircleInSketch,
    computeArcGeometry,
    getArcEndpoints,
    applyCircleDragKinematics,
    projectPointOnArcConstraintsForArcs,
    rebaseSketchDragState,
    getArcCenterLocalFromEntity,
    sampleArcPolyline,
    createSketchPoint,
    createSketchLine,
    createSketchPolygonFromSelectedCircle,
    deleteSelectedSketchEntities,
    deleteSelectedSketchConstraints,
    findPointByCoord,
    ensureSketchPoint,
    getLineEndpoints,
    getSelectedSketchCircle,
    getCircleData
};
