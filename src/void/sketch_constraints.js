/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { make_gcs_wrapper, Algorithm, SolveStatus } from './solver/planegcs.js';

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
        return false;
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
    changed = applyArcCenterCoincidentConstraints(constraints, pointEntityById, lineById, arcById, fixed) || changed;
    const dragged = new Set(Array.isArray(opts?.draggedPointIds) ? opts.draggedPointIds : []);
    changed = applyMidpointConstraints(constraints, pointEntityById, fixed, dragged) || changed;
    for (let i = 0; i < 8; i++) {
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
        if (refs.length < 2 || !pointById.has(refs[0]) || !lineById.has(refs[1])) return null;
        return {
            id,
            type: 'point_on_line_pl',
            p_id: String(refs[0]),
            l_id: String(refs[1])
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

// ---------- Legacy fallback solver (kept while planegcs initializes/fails) ----------

function enforceWithFallback(sketch, opts = {}) {
    const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
    const constraints = Array.isArray(sketch?.constraints) ? sketch.constraints : [];
    if (!entities.length || !constraints.length) {
        return false;
    }

    const points = new Map();
    const lines = new Map();
    const arcs = new Map();
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            points.set(entity.id, entity);
        } else if (entity?.type === 'line' && entity.id) {
            lines.set(entity.id, entity);
        } else if (entity?.type === 'arc' && entity.id) {
            arcs.set(entity.id, entity);
        }
    }

    const fixed = captureFixedAnchors(constraints, points);
    const dragged = new Set(Array.isArray(opts?.draggedPointIds) ? opts.draggedPointIds : []);
    const iterations = Math.max(1, Math.min(64, opts.iterations || 12));
    let changed = false;

    for (let i = 0; i < iterations; i++) {
        let iterChanged = false;
        for (const c of constraints) {
            if (!c?.type) continue;
            switch (c.type) {
                case 'fixed':
                    iterChanged = applyFixed(c, points, fixed) || iterChanged;
                    break;
                case 'coincident':
                    iterChanged = applyCoincident(c, points, fixed) || iterChanged;
                    break;
                case 'point_on_line':
                    iterChanged = applyPointOnLine(c, points, lines, fixed) || iterChanged;
                    break;
                case 'horizontal':
                    iterChanged = applyHorizontal(c, points, lines, fixed) || iterChanged;
                    break;
                case 'horizontal_points':
                    iterChanged = applyHorizontalPoints(c, points, fixed) || iterChanged;
                    break;
                case 'vertical':
                    iterChanged = applyVertical(c, points, lines, fixed) || iterChanged;
                    break;
                case 'vertical_points':
                    iterChanged = applyVerticalPoints(c, points, fixed) || iterChanged;
                    break;
                case 'perpendicular':
                    iterChanged = applyPerpendicular(c, points, lines, fixed) || iterChanged;
                    break;
                case 'equal':
                    iterChanged = applyEqual(c, points, lines, fixed) || iterChanged;
                    break;
                case 'collinear':
                    iterChanged = applyCollinear(c, points, lines, fixed) || iterChanged;
                    break;
                case 'tangent':
                    iterChanged = applyTangent(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'arc_center_coincident':
                    iterChanged = applyArcCenterCoincident(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'midpoint':
                    iterChanged = applyMidpoint(c, points, fixed, dragged) || iterChanged;
                    break;
                default:
                    break;
            }
        }
        changed = changed || iterChanged;
        if (!iterChanged) break;
    }

    return changed;
}

function captureFixedAnchors(constraints, points) {
    const fixed = new Map();
    for (const c of constraints) {
        if (c?.type !== 'fixed') continue;
        const refs = Array.isArray(c.refs) ? c.refs : [];
        const anchors = c.data?.anchors || {};
        for (const id of refs) {
            const p = points.get(id);
            if (!p) continue;
            const a = anchors[id];
            if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) fixed.set(id, { x: a.x, y: a.y });
            else fixed.set(id, { x: p.x || 0, y: p.y || 0 });
        }
    }
    return fixed;
}

function isFixed(id, fixed) {
    return !!(id && fixed.has(id));
}

function setPoint(point, x, y) {
    const nx = Number.isFinite(x) ? x : (point.x || 0);
    const ny = Number.isFinite(y) ? y : (point.y || 0);
    const dx = nx - (point.x || 0);
    const dy = ny - (point.y || 0);
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return false;
    point.x = nx;
    point.y = ny;
    return true;
}

function getLineEndpoints(line, points) {
    const a = points.get(getLineEndpointId(line, 'a')) || null;
    const b = points.get(getLineEndpointId(line, 'b')) || null;
    return [a, b];
}

function getLineEndpointId(line, which) {
    if (!line || (which !== 'a' && which !== 'b')) return null;
    const legacy = which === 'a' ? line.a : line.b;
    const alt = which === 'a' ? line.p1_id : line.p2_id;
    if (typeof legacy === 'string') return legacy;
    if (typeof alt === 'string') return alt;
    return null;
}

function applyFixed(constraint, points, fixed) {
    let changed = false;
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    for (const id of refs) {
        const p = points.get(id);
        const a = fixed.get(id);
        if (!p || !a) continue;
        changed = setPoint(p, a.x, a.y) || changed;
    }
    return changed;
}

function applyCoincident(constraint, points, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const pa = points.get(refs[0]);
    const pb = points.get(refs[1]);
    if (!pa || !pb) return false;
    const fa = isFixed(refs[0], fixed);
    const fb = isFixed(refs[1], fixed);
    if (fa && fb) return false;
    if (fa) return setPoint(pb, pa.x || 0, pa.y || 0);
    if (fb) return setPoint(pa, pb.x || 0, pb.y || 0);
    const mx = ((pa.x || 0) + (pb.x || 0)) * 0.5;
    const my = ((pa.y || 0) + (pb.y || 0)) * 0.5;
    const ca = setPoint(pa, mx, my);
    const cb = setPoint(pb, mx, my);
    return ca || cb;
}

function applyHorizontal(constraint, points, lines, fixed) {
    const lineId = Array.isArray(constraint?.refs) ? constraint.refs[0] : null;
    const line = lines.get(lineId);
    if (!line) return false;
    const [a, b] = getLineEndpoints(line, points);
    if (!a || !b) return false;
    const fa = isFixed(getLineEndpointId(line, 'a'), fixed);
    const fb = isFixed(getLineEndpointId(line, 'b'), fixed);
    if (fa && fb) return false;
    const y = fa ? (a.y || 0) : (fb ? (b.y || 0) : (((a.y || 0) + (b.y || 0)) * 0.5));
    if (fa) return setPoint(b, b.x || 0, y);
    if (fb) return setPoint(a, a.x || 0, y);
    const ca = setPoint(a, a.x || 0, y);
    const cb = setPoint(b, b.x || 0, y);
    return ca || cb;
}

function applyHorizontalPoints(constraint, points, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const a = points.get(refs[0]);
    const b = points.get(refs[1]);
    if (!a || !b) return false;
    const fa = isFixed(refs[0], fixed);
    const fb = isFixed(refs[1], fixed);
    if (fa && fb) return false;
    const y = fa ? (a.y || 0) : (fb ? (b.y || 0) : (((a.y || 0) + (b.y || 0)) * 0.5));
    if (fa) return setPoint(b, b.x || 0, y);
    if (fb) return setPoint(a, a.x || 0, y);
    return setPoint(a, a.x || 0, y) || setPoint(b, b.x || 0, y);
}

function applyVertical(constraint, points, lines, fixed) {
    const lineId = Array.isArray(constraint?.refs) ? constraint.refs[0] : null;
    const line = lines.get(lineId);
    if (!line) return false;
    const [a, b] = getLineEndpoints(line, points);
    if (!a || !b) return false;
    const fa = isFixed(getLineEndpointId(line, 'a'), fixed);
    const fb = isFixed(getLineEndpointId(line, 'b'), fixed);
    if (fa && fb) return false;
    const x = fa ? (a.x || 0) : (fb ? (b.x || 0) : (((a.x || 0) + (b.x || 0)) * 0.5));
    if (fa) return setPoint(b, x, b.y || 0);
    if (fb) return setPoint(a, x, a.y || 0);
    const ca = setPoint(a, x, a.y || 0);
    const cb = setPoint(b, x, b.y || 0);
    return ca || cb;
}

function applyVerticalPoints(constraint, points, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const a = points.get(refs[0]);
    const b = points.get(refs[1]);
    if (!a || !b) return false;
    const fa = isFixed(refs[0], fixed);
    const fb = isFixed(refs[1], fixed);
    if (fa && fb) return false;
    const x = fa ? (a.x || 0) : (fb ? (b.x || 0) : (((a.x || 0) + (b.x || 0)) * 0.5));
    if (fa) return setPoint(b, x, b.y || 0);
    if (fb) return setPoint(a, x, a.y || 0);
    return setPoint(a, x, a.y || 0) || setPoint(b, x, b.y || 0);
}

function applyPerpendicular(constraint, points, lines, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const l1 = lines.get(refs[0]);
    const l2 = lines.get(refs[1]);
    if (!l1 || !l2) return false;
    const [a, b] = getLineEndpoints(l1, points);
    const [c, d] = getLineEndpoints(l2, points);
    if (!a || !b || !c || !d) return false;

    const ux = (b.x || 0) - (a.x || 0);
    const uy = (b.y || 0) - (a.y || 0);
    const ulen = Math.hypot(ux, uy);
    if (ulen < EPS) return false;
    const nx = -uy / ulen;
    const ny = ux / ulen;

    const vx = (d.x || 0) - (c.x || 0);
    const vy = (d.y || 0) - (c.y || 0);
    const vlen = Math.max(EPS, Math.hypot(vx, vy));
    const dot = vx * nx + vy * ny;
    const sx = dot >= 0 ? nx : -nx;
    const sy = dot >= 0 ? ny : -ny;

    const fc = isFixed(getLineEndpointId(l2, 'a'), fixed);
    const fd = isFixed(getLineEndpointId(l2, 'b'), fixed);
    if (fc && fd) return false;
    if (fc) return setPoint(d, (c.x || 0) + sx * vlen, (c.y || 0) + sy * vlen);
    if (fd) return setPoint(c, (d.x || 0) - sx * vlen, (d.y || 0) - sy * vlen);

    const mx = ((c.x || 0) + (d.x || 0)) * 0.5;
    const my = ((c.y || 0) + (d.y || 0)) * 0.5;
    const hx = sx * vlen * 0.5;
    const hy = sy * vlen * 0.5;
    const cc = setPoint(c, mx - hx, my - hy);
    const cd = setPoint(d, mx + hx, my + hy);
    return cc || cd;
}

function applyEqual(constraint, points, lines, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const l1 = lines.get(refs[0]);
    const l2 = lines.get(refs[1]);
    if (!l1 || !l2) return false;
    const [a, b] = getLineEndpoints(l1, points);
    const [c, d] = getLineEndpoints(l2, points);
    if (!a || !b || !c || !d) return false;

    const len1 = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    const len2 = Math.hypot((d.x || 0) - (c.x || 0), (d.y || 0) - (c.y || 0));
    if (len1 < EPS || len2 < EPS) return false;
    const target = (len1 + len2) * 0.5;

    const cId = getLineEndpointId(l2, 'a');
    const dId = getLineEndpointId(l2, 'b');
    const fc = isFixed(cId, fixed);
    const fd = isFixed(dId, fixed);
    if (fc && fd) {
        const aId = getLineEndpointId(l1, 'a');
        const bId = getLineEndpointId(l1, 'b');
        const fa = isFixed(aId, fixed);
        const fb = isFixed(bId, fixed);
        if (fa && fb) return false;
        const ux1 = ((b.x || 0) - (a.x || 0)) / len1;
        const uy1 = ((b.y || 0) - (a.y || 0)) / len1;
        if (fa) return setPoint(b, (a.x || 0) + ux1 * len2, (a.y || 0) + uy1 * len2);
        if (fb) return setPoint(a, (b.x || 0) - ux1 * len2, (b.y || 0) - uy1 * len2);
        const mx = ((a.x || 0) + (b.x || 0)) * 0.5;
        const my = ((a.y || 0) + (b.y || 0)) * 0.5;
        const hx = ux1 * len2 * 0.5;
        const hy = uy1 * len2 * 0.5;
        return setPoint(a, mx - hx, my - hy) || setPoint(b, mx + hx, my + hy);
    }

    const ux = ((d.x || 0) - (c.x || 0)) / len2;
    const uy = ((d.y || 0) - (c.y || 0)) / len2;
    if (fc) return setPoint(d, (c.x || 0) + ux * target, (c.y || 0) + uy * target);
    if (fd) return setPoint(c, (d.x || 0) - ux * target, (d.y || 0) - uy * target);
    const mx = ((c.x || 0) + (d.x || 0)) * 0.5;
    const my = ((c.y || 0) + (d.y || 0)) * 0.5;
    const hx = ux * target * 0.5;
    const hy = uy * target * 0.5;
    return setPoint(c, mx - hx, my - hy) || setPoint(d, mx + hx, my + hy);
}

function applyCollinear(constraint, points, lines, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const l1 = lines.get(refs[0]);
    const l2 = lines.get(refs[1]);
    if (!l1 || !l2) return false;
    const changedParallel = applyParallelLike(l1, l2, points, fixed);
    const changedPointOn = projectPointToLine(getLineEndpointId(l2, 'a'), l1, points, fixed);
    return changedParallel || changedPointOn;
}

function applyParallelLike(l1, l2, points, fixed) {
    const [a, b] = getLineEndpoints(l1, points);
    const [c, d] = getLineEndpoints(l2, points);
    if (!a || !b || !c || !d) return false;
    const ux = (b.x || 0) - (a.x || 0);
    const uy = (b.y || 0) - (a.y || 0);
    const ulen = Math.hypot(ux, uy);
    if (ulen < EPS) return false;
    const vx = (d.x || 0) - (c.x || 0);
    const vy = (d.y || 0) - (c.y || 0);
    const vlen = Math.hypot(vx, vy);
    if (vlen < EPS) return false;
    const dirx = ux / ulen;
    const diry = uy / ulen;
    const dot = vx * dirx + vy * diry;
    const sx = dot >= 0 ? dirx : -dirx;
    const sy = dot >= 0 ? diry : -diry;
    const cId = getLineEndpointId(l2, 'a');
    const dId = getLineEndpointId(l2, 'b');
    const fc = isFixed(cId, fixed);
    const fd = isFixed(dId, fixed);
    if (fc && fd) return false;
    if (fc) return setPoint(d, (c.x || 0) + sx * vlen, (c.y || 0) + sy * vlen);
    if (fd) return setPoint(c, (d.x || 0) - sx * vlen, (d.y || 0) - sy * vlen);
    const mx = ((c.x || 0) + (d.x || 0)) * 0.5;
    const my = ((c.y || 0) + (d.y || 0)) * 0.5;
    const hx = sx * vlen * 0.5;
    const hy = sy * vlen * 0.5;
    return setPoint(c, mx - hx, my - hy) || setPoint(d, mx + hx, my + hy);
}

function projectPointToLine(pointId, line, points, fixed) {
    if (!pointId || isFixed(pointId, fixed)) return false;
    const p = points.get(pointId);
    if (!p) return false;
    const [a, b] = getLineEndpoints(line, points);
    if (!a || !b) return false;
    const abx = (b.x || 0) - (a.x || 0);
    const aby = (b.y || 0) - (a.y || 0);
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < EPS) return false;
    const apx = (p.x || 0) - (a.x || 0);
    const apy = (p.y || 0) - (a.y || 0);
    const t = (apx * abx + apy * aby) / abLenSq;
    return setPoint(p, (a.x || 0) + abx * t, (a.y || 0) + aby * t);
}

function applyPointOnLine(constraint, points, lines, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const pointId = refs[0];
    const line = lines.get(refs[1]);
    if (!line) return false;
    return projectPointToLine(pointId, line, points, fixed);
}

function applyArcCenterCoincident(constraint, points, lines, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const arc = arcs.get(refs[0]);
    const target = points.get(refs[1]);
    if (!arc || !target) return false;

    const [a, b] = getLineEndpoints(arc, points);
    if (!a || !b) return false;
    const aId = getLineEndpointId(arc, 'a');
    const bId = getLineEndpointId(arc, 'b');

    const center = getArcCenter(arc, a, b);
    if (!center) return false;
    const tx = target.x || 0;
    const ty = target.y || 0;
    const fa = !!(aId && fixed.has(aId));
    const fb = !!(bId && fixed.has(bId));
    return enforceArcFromCenter(arc, a, b, tx, ty, fa, fb);
}

function applyArcCenterCoincidentConstraints(constraints, points, lines, arcs, fixed) {
    let changed = false;
    for (const c of constraints) {
        if (c?.type !== 'arc_center_coincident') continue;
        changed = applyArcCenterCoincident(c, points, lines, arcs, fixed) || changed;
    }
    return changed;
}

function applyTangent(constraint, points, lines, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const line = lines.get(refs[0]);
    const arc = arcs.get(refs[1]);
    if (!line || !arc) return false;
    const [a, b] = getLineEndpoints(line, points);
    if (!a || !b) return false;
    const circ = getArcCircleData(arc, points);
    if (!circ) return false;

    const x1 = a.x || 0;
    const y1 = a.y || 0;
    const x2 = b.x || 0;
    const y2 = b.y || 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < EPS) return false;
    const nx = -dy / len;
    const ny = dx / len;
    const dist = ((circ.cx - x1) * nx + (circ.cy - y1) * ny);
    const sign = dist >= 0 ? 1 : -1;
    const target = sign * circ.radius;
    const err = dist - target;
    if (Math.abs(err) < 1e-5) return false;

    const aId = getLineEndpointId(line, 'a');
    const bId = getLineEndpointId(line, 'b');
    const fa = isFixed(aId, fixed);
    const fb = isFixed(bId, fixed);
    if (fa && fb) return false;
    if (!fa && !fb) {
        const mx = -err * nx;
        const my = -err * ny;
        return setPoint(a, x1 + mx, y1 + my) || setPoint(b, x2 + mx, y2 + my);
    }
    if (!fa) {
        return setPoint(a, x1 - err * nx, y1 - err * ny);
    }
    return setPoint(b, x2 - err * nx, y2 - err * ny);
}

function applyTangentConstraints(constraints, points, lines, arcs, fixed) {
    let changed = false;
    for (const c of constraints) {
        if (c?.type !== 'tangent') continue;
        changed = applyTangent(c, points, lines, arcs, fixed) || changed;
    }
    return changed;
}

function applyMidpoint(constraint, points, fixed, dragged = new Set()) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 3) return false;
    const mid = points.get(refs[0]);
    const a = points.get(refs[1]);
    const b = points.get(refs[2]);
    if (!mid || !a || !b) return false;
    const fm = isFixed(refs[0], fixed);
    const fa = isFixed(refs[1], fixed);
    const fb = isFixed(refs[2], fixed);
    const midDragged = !!dragged?.has?.(refs[0]);
    const aDragged = !!dragged?.has?.(refs[1]);
    const bDragged = !!dragged?.has?.(refs[2]);
    if (fm && fa && fb) return false;

    if (fm && fa) {
        return setPoint(b, 2 * (mid.x || 0) - (a.x || 0), 2 * (mid.y || 0) - (a.y || 0));
    }
    if (fm && fb) {
        return setPoint(a, 2 * (mid.x || 0) - (b.x || 0), 2 * (mid.y || 0) - (b.y || 0));
    }
    if (fa && fb) {
        return setPoint(mid, ((a.x || 0) + (b.x || 0)) * 0.5, ((a.y || 0) + (b.y || 0)) * 0.5);
    }
    const mx = ((a.x || 0) + (b.x || 0)) * 0.5;
    const my = ((a.y || 0) + (b.y || 0)) * 0.5;
    if (midDragged && !fm) {
        if (fa && fb) {
            return setPoint(mid, mx, my);
        }
        const tx = (mid.x || 0) - mx;
        const ty = (mid.y || 0) - my;
        let moved = false;
        if (!fa) moved = setPoint(a, (a.x || 0) + tx, (a.y || 0) + ty) || moved;
        if (!fb) moved = setPoint(b, (b.x || 0) + tx, (b.y || 0) + ty) || moved;
        return moved;
    }
    if ((aDragged || bDragged) && !fm) {
        return setPoint(mid, mx, my);
    }
    if (!fm) {
        return setPoint(mid, mx, my);
    }
    // midpoint fixed: move both endpoints symmetrically to preserve center
    const tx = (mid.x || 0) - mx;
    const ty = (mid.y || 0) - my;
    let changed = false;
    if (!fa) changed = setPoint(a, (a.x || 0) + tx, (a.y || 0) + ty) || changed;
    if (!fb) changed = setPoint(b, (b.x || 0) + tx, (b.y || 0) + ty) || changed;
    return changed;
}

function applyMidpointConstraints(constraints, points, fixed, dragged = new Set()) {
    let changed = false;
    for (const c of constraints) {
        if (c?.type !== 'midpoint') continue;
        changed = applyMidpoint(c, points, fixed, dragged) || changed;
    }
    return changed;
}

function setArcControl(arc, x, y) {
    const nx = Number.isFinite(x) ? x : (arc.mx || 0);
    const ny = Number.isFinite(y) ? y : (arc.my || 0);
    const dx = nx - (arc.mx || 0);
    const dy = ny - (arc.my || 0);
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return false;
    arc.mx = nx;
    arc.my = ny;
    return true;
}

function setArcCenterAndMeta(arc, cx, cy, radius, startAngle, endAngle, ccw) {
    let changed = false;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius)) {
        return false;
    }
    if (Math.abs((arc.cx || 0) - cx) > EPS) {
        arc.cx = cx;
        changed = true;
    }
    if (Math.abs((arc.cy || 0) - cy) > EPS) {
        arc.cy = cy;
        changed = true;
    }
    if (Math.abs((arc.radius || 0) - radius) > EPS) {
        arc.radius = radius;
        changed = true;
    }
    if (Number.isFinite(startAngle) && Math.abs((arc.startAngle || 0) - startAngle) > EPS) {
        arc.startAngle = startAngle;
        changed = true;
    }
    if (Number.isFinite(endAngle) && Math.abs((arc.endAngle || 0) - endAngle) > EPS) {
        arc.endAngle = endAngle;
        changed = true;
    }
    if (typeof ccw === 'boolean' && arc.ccw !== ccw) {
        arc.ccw = ccw;
        changed = true;
    }
    return changed;
}

function normalizeAngle(a) {
    let out = a % (Math.PI * 2);
    if (out < 0) out += Math.PI * 2;
    return out;
}

function enforceArcFromCenter(arc, a, b, cx, cy, fa, fb) {
    if (arc?.circle) {
        const ax = a.x || 0;
        const ay = a.y || 0;
        const bx = b.x || 0;
        const by = b.y || 0;
        let radius = Number(arc?.radius);
        if (!Number.isFinite(radius) || radius < EPS) {
            const ra = Math.hypot(ax - cx, ay - cy);
            const rb = Math.hypot(bx - cx, by - cy);
            radius = Math.max(ra, rb, 1);
        }
        const base = Number.isFinite(arc?.mx) && Number.isFinite(arc?.my)
            ? Math.atan2((arc.my || 0) - cy, (arc.mx || 0) - cx)
            : (Math.atan2(ay - cy, ax - cx) || 0);

        let changed = false;
        const px = cx + Math.cos(base) * radius;
        const py = cy + Math.sin(base) * radius;
        if (!fa) changed = setPoint(a, px, py) || changed;
        if (!fb) changed = setPoint(b, px, py) || changed;
        const mx = cx + Math.cos(base + Math.PI / 2) * radius;
        const my = cy + Math.sin(base + Math.PI / 2) * radius;
        changed = setArcControl(arc, mx, my) || changed;
        changed = setArcCenterAndMeta(arc, cx, cy, radius, 0, Math.PI * 2, true) || changed;
        return changed;
    }

    const ax = a.x || 0;
    const ay = a.y || 0;
    const bx = b.x || 0;
    const by = b.y || 0;
    let ra = Math.hypot(ax - cx, ay - cy);
    let rb = Math.hypot(bx - cx, by - cy);
    if (ra < EPS && rb < EPS) {
        return false;
    }

    const aa = Math.atan2(ay - cy, ax - cx);
    const ab = Math.atan2(by - cy, bx - cx);

    let radius;
    if (fa && fb) {
        radius = ra;
    } else if (fa) {
        radius = ra;
    } else if (fb) {
        radius = rb;
    } else {
        radius = (ra + rb) * 0.5;
    }
    if (!Number.isFinite(radius) || radius < EPS) {
        radius = Math.max(ra, rb, 1);
    }

    let changed = false;
    if (!fa) {
        changed = setPoint(a, cx + Math.cos(aa) * radius, cy + Math.sin(aa) * radius) || changed;
    }
    if (!fb) {
        changed = setPoint(b, cx + Math.cos(ab) * radius, cy + Math.sin(ab) * radius) || changed;
    }

    const startAngle = Math.atan2((a.y || 0) - cy, (a.x || 0) - cx);
    const endAngle = Math.atan2((b.y || 0) - cy, (b.x || 0) - cx);

    let ccw = arc?.ccw !== false;
    if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my)) {
        const g = computeArcGeometry(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (g) {
            ccw = g.ccw;
        }
    }

    const sa = normalizeAngle(startAngle);
    const ea = normalizeAngle(endAngle);
    let mid;
    if (ccw) {
        const sweep = (ea - sa + Math.PI * 2) % (Math.PI * 2);
        mid = sa + sweep * 0.5;
    } else {
        const sweep = (sa - ea + Math.PI * 2) % (Math.PI * 2);
        mid = sa - sweep * 0.5;
    }
    const mx = cx + Math.cos(mid) * radius;
    const my = cy + Math.sin(mid) * radius;
    changed = setArcControl(arc, mx, my) || changed;
    changed = setArcCenterAndMeta(arc, cx, cy, radius, startAngle, endAngle, ccw) || changed;
    return changed;
}

function getArcCenter(arc, a, b) {
    if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my)) {
        const g = computeArcGeometry(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (g) return { x: g.cx, y: g.cy };
    }
    const cx = Number(arc?.cx);
    const cy = Number(arc?.cy);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
        return { x: cx, y: cy };
    }
    return null;
}

function getArcCircleData(arc, points) {
    const [a, b] = getLineEndpoints(arc, points);
    if (!a || !b) return null;
    if (arc?.circle && Number.isFinite(arc?.cx) && Number.isFinite(arc?.cy)) {
        let r = Number(arc?.radius);
        if (!Number.isFinite(r) || r < EPS) {
            r = Math.hypot((a.x || 0) - (arc.cx || 0), (a.y || 0) - (arc.cy || 0));
        }
        if (!Number.isFinite(r) || r < EPS) return null;
        return { cx: Number(arc.cx), cy: Number(arc.cy), radius: r };
    }
    const c = getArcCenter(arc, a, b);
    if (!c) return null;
    const r = Math.hypot((a.x || 0) - c.x, (a.y || 0) - c.y);
    if (!Number.isFinite(r) || r < EPS) return null;
    return { cx: c.x, cy: c.y, radius: r };
}

function computeArcGeometry(start, end, onArc) {
    if (!start || !end || !onArc) return null;
    const x1 = start.x || 0;
    const y1 = start.y || 0;
    const x2 = end.x || 0;
    const y2 = end.y || 0;
    const x3 = onArc.x || 0;
    const y3 = onArc.y || 0;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-8) return null;
    const x1sq = x1 * x1 + y1 * y1;
    const x2sq = x2 * x2 + y2 * y2;
    const x3sq = x3 * x3 + y3 * y3;
    const cx = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
    const cy = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
    return { cx, cy };
}

export { initSketchConstraintsSolver, enforceSketchConstraintsInPlace };
