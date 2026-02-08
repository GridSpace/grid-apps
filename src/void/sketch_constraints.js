/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { make_gcs_wrapper, Algorithm, SolveStatus } from './solver/planegcs.js';
import {
    enforceWithFallback,
    captureFixedAnchors,
    getLineEndpointId,
    applyPointOnArcConstraints,
    applyArcCenterCoincidentConstraints,
    applyMidpointConstraints,
    applyTangentConstraints
} from './sketch_constraints_fallback.js';

const EPS = 1e-9;

let gcsWrapper = null;
let gcsInitPromise = null;
let gcsInitError = null;

function initSketchConstraintsSolver() {
    if (gcsWrapper) {
        return Promise.resolve(gcsWrapper);
    }
    if (gcsInitPromise) {
        return gcsInitPromise;
    }
    gcsInitPromise = make_gcs_wrapper().then(wrapper => {
        gcsWrapper = wrapper;
        return wrapper;
    }).catch(error => {
        gcsInitError = error;
        console.warn('sketch_constraints: planegcs init failed, using fallback solver', error);
        return null;
    });
    return gcsInitPromise;
}

function enforceSketchConstraintsInPlace(sketch, opts = {}) {
    if (opts?.useFallback) {
        return enforceWithFallback(sketch, opts);
    }

    if (gcsWrapper) {
        try {
            return enforceWithPlanegcs(sketch, opts);
        } catch (error) {
            console.warn('sketch_constraints: planegcs solve failed, using fallback solver', error);
            return enforceWithFallback(sketch, opts);
        }
    }

    if (!gcsInitPromise && !gcsInitError) {
        // Fire-and-forget lazy initialization; callers remain synchronous.
        initSketchConstraintsSolver();
    }

    return enforceWithFallback(sketch, opts);
}

function enforceWithPlanegcs(sketch, opts = {}) {
    const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
    const constraints = Array.isArray(sketch?.constraints) ? sketch.constraints : [];
    if (!entities.length || !constraints.length) {
        return false;
    }

    const primitives = [];
    const pointById = new Map();
    const lineById = new Map();
    const arcById = new Map();

    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            const p = {
                id: String(entity.id),
                type: 'point',
                x: Number(entity.x || 0),
                y: Number(entity.y || 0),
                fixed: false
            };
            pointById.set(entity.id, p);
            primitives.push(p);
        }
    }

    for (const entity of entities) {
        const aId = getLineEndpointId(entity, 'a');
        const bId = getLineEndpointId(entity, 'b');
        if (entity?.type === 'line' && entity.id && pointById.has(aId) && pointById.has(bId)) {
            const l = {
                id: String(entity.id),
                type: 'line',
                p1_id: String(aId),
                p2_id: String(bId)
            };
            lineById.set(entity.id, l);
            primitives.push(l);
        }
        if (entity?.type === 'arc' && entity.id && pointById.has(aId) && pointById.has(bId)) {
            arcById.set(entity.id, entity);
        }
    }

    for (const c of constraints) {
        const gc = toPlanegcsConstraint(c, pointById, lineById);
        if (Array.isArray(gc)) {
            primitives.push(...gc);
        } else if (gc) {
            primitives.push(gc);
        }
    }

    if (!primitives.length) {
        return false;
    }

    gcsWrapper.clear_data();
    gcsWrapper.push_primitives_and_params(primitives);
    const status = gcsWrapper.solve(Algorithm.DogLeg);
    if (!(status === SolveStatus.Success || status === SolveStatus.Converged)) {
        throw new Error(`planegcs solve status=${status}`);
    }

    gcsWrapper.apply_solution();

    let changed = false;
    const pointEntityById = new Map(entities.filter(e => e?.type === 'point' && e.id).map(e => [e.id, e]));
    const solvedPrimitives = gcsWrapper?.sketch_index?.get_primitives?.() || [];
    const solvedPointById = new Map(
        solvedPrimitives
            .filter(e => e?.type === 'point' && e.id)
            .map(e => [e.id, e])
    );
    for (const [id, p] of pointEntityById.entries()) {
        const solved = solvedPointById.get(id);
        if (!solved) continue;
        const nx = Number(solved.x || 0);
        const ny = Number(solved.y || 0);
        if (Math.abs((p.x || 0) - nx) > EPS || Math.abs((p.y || 0) - ny) > EPS) {
            p.x = nx;
            p.y = ny;
            changed = true;
        }
    }

    const fixed = captureFixedAnchors(constraints, pointEntityById);
    changed = applyPointOnArcConstraints(constraints, pointEntityById, arcById, fixed) || changed;
    changed = applyArcCenterCoincidentConstraints(constraints, pointEntityById, lineById, arcById, fixed) || changed;
    const dragged = new Set(Array.isArray(opts?.draggedPointIds) ? opts.draggedPointIds : []);
    changed = applyMidpointConstraints(constraints, pointEntityById, fixed, dragged) || changed;
    for (let i = 0; i < 4; i++) {
        const tChanged = applyTangentConstraints(constraints, pointEntityById, lineById, arcById, fixed);
        if (!tChanged) break;
        changed = true;
    }

    return changed;
}

function toPlanegcsConstraint(c, pointById, lineById) {
    if (!c?.id || !c?.type) return null;
    const id = String(c.id);
    const refs = Array.isArray(c.refs) ? c.refs : [];

    if (c.type === 'coincident') {
        if (refs.length < 2 || !pointById.has(refs[0]) || !pointById.has(refs[1])) return null;
        return {
            id,
            type: 'p2p_coincident',
            p1_id: String(refs[0]),
            p2_id: String(refs[1])
        };
    }
    if (c.type === 'point_on_line') {
        if (refs.length < 2) return null;
        const pId = pointById.has(refs[0]) ? refs[0] : (pointById.has(refs[1]) ? refs[1] : null);
        const lId = lineById.has(refs[0]) ? refs[0] : (lineById.has(refs[1]) ? refs[1] : null);
        if (!pId || !lId) return null;
        return {
            id,
            type: 'point_on_line_pl',
            p_id: String(pId),
            l_id: String(lId)
        };
    }

    if (c.type === 'horizontal') {
        const lId = refs[0];
        if (!lId || !lineById.has(lId)) return null;
        return {
            id,
            type: 'horizontal_l',
            l_id: String(lId)
        };
    }
    if (c.type === 'horizontal_points') {
        if (refs.length < 2 || !pointById.has(refs[0]) || !pointById.has(refs[1])) return null;
        const lId = `${id}:hl`;
        return [
            { id: lId, type: 'line', p1_id: String(refs[0]), p2_id: String(refs[1]) },
            { id: `${id}:c`, type: 'horizontal_l', l_id: lId }
        ];
    }

    if (c.type === 'vertical') {
        const lId = refs[0];
        if (!lId || !lineById.has(lId)) return null;
        return {
            id,
            type: 'vertical_l',
            l_id: String(lId)
        };
    }
    if (c.type === 'vertical_points') {
        if (refs.length < 2 || !pointById.has(refs[0]) || !pointById.has(refs[1])) return null;
        const lId = `${id}:vl`;
        return [
            { id: lId, type: 'line', p1_id: String(refs[0]), p2_id: String(refs[1]) },
            { id: `${id}:c`, type: 'vertical_l', l_id: lId }
        ];
    }

    if (c.type === 'perpendicular') {
        if (refs.length < 2 || !lineById.has(refs[0]) || !lineById.has(refs[1])) return null;
        return {
            id,
            type: 'perpendicular_ll',
            l1_id: String(refs[0]),
            l2_id: String(refs[1])
        };
    }
    if (c.type === 'equal') {
        if (refs.length < 2 || !lineById.has(refs[0]) || !lineById.has(refs[1])) return null;
        return {
            id,
            type: 'equal_length',
            l1_id: String(refs[0]),
            l2_id: String(refs[1])
        };
    }
    if (c.type === 'collinear') {
        if (refs.length < 2 || !lineById.has(refs[0]) || !lineById.has(refs[1])) return null;
        const l1 = lineById.get(refs[0]);
        const l2 = lineById.get(refs[1]);
        if (!l1 || !l2) return null;
        return [
            {
                id: `${id}:parallel`,
                type: 'parallel',
                l1_id: String(refs[0]),
                l2_id: String(refs[1])
            },
            {
                id: `${id}:point_on`,
                type: 'point_on_line_pl',
                p_id: String(l2.p1_id),
                l_id: String(refs[0])
            }
        ];
    }

    if (c.type === 'fixed') {
        const pId = refs[0];
        if (!pId || !pointById.has(pId)) return null;
        const p = pointById.get(pId);
        const anchor = c.data?.anchors?.[pId] || { x: p.x, y: p.y };
        const cxId = `${id}:x`;
        const cyId = `${id}:y`;
        // Return as paired constraints; caller accepts arrays from mapper.
        return [
            {
                id: cxId,
                type: 'coordinate_x',
                p_id: String(pId),
                x: Number(anchor.x || 0)
            },
            {
                id: cyId,
                type: 'coordinate_y',
                p_id: String(pId),
                y: Number(anchor.y || 0)
            }
        ];
    }

    return null;
}


export { initSketchConstraintsSolver, enforceSketchConstraintsInPlace };
