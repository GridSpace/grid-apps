/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { enforceSketchConstraintsInPlace } from './constraints.js';
import * as sketchCreate from './create.js';

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
            if (entity?.type === 'arc') {
                const threePointIds = Array.isArray(entity?.data?.threePointIds) ? entity.data.threePointIds : [];
                for (const pid of threePointIds) {
                    if (typeof pid === 'string') endpointCandidates.add(pid);
                }
            }
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
    return sketchCreate.findArcWithEndpoints.call(this, feature, p1Id, p2Id);
}

function convertArcToCircle(feature, arcId, p1Id, p2Id) {
    return sketchCreate.convertArcToCircle.call(this, feature, arcId, p1Id, p2Id);
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

export {
    deleteSelectedSketchConstraints,
    deleteSelectedSketchEntities,
    toggleSelectedConstruction,
    applySketchConstraint,
    findArcWithEndpoints,
    convertArcToCircle,
    toggleSketchConstraintInList,
    normalizeConstraintRefs,
    makeSketchConstraintKey
};
