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

function enforceWithPlanegcs(sketch) {
    const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
    const constraints = Array.isArray(sketch?.constraints) ? sketch.constraints : [];
    if (!entities.length || !constraints.length) {
        return false;
    }

    const primitives = [];
    const pointById = new Map();
    const lineById = new Map();

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

    if (c.type === 'horizontal') {
        const lId = refs[0];
        if (!lId || !lineById.has(lId)) return null;
        return {
            id,
            type: 'horizontal_l',
            l_id: String(lId)
        };
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

    if (c.type === 'perpendicular') {
        if (refs.length < 2 || !lineById.has(refs[0]) || !lineById.has(refs[1])) return null;
        return {
            id,
            type: 'perpendicular_ll',
            l1_id: String(refs[0]),
            l2_id: String(refs[1])
        };
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
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            points.set(entity.id, entity);
        } else if (entity?.type === 'line' && entity.id) {
            lines.set(entity.id, entity);
        }
    }

    const fixed = captureFixedAnchors(constraints, points);
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
                case 'horizontal':
                    iterChanged = applyHorizontal(c, points, lines, fixed) || iterChanged;
                    break;
                case 'vertical':
                    iterChanged = applyVertical(c, points, lines, fixed) || iterChanged;
                    break;
                case 'perpendicular':
                    iterChanged = applyPerpendicular(c, points, lines, fixed) || iterChanged;
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

export { initSketchConstraintsSolver, enforceSketchConstraintsInPlace };
