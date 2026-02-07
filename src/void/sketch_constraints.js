/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const EPS = 1e-9;

function enforceSketchConstraintsInPlace(sketch, opts = {}) {
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

    // Repeatedly project entities back onto constraint manifolds.
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
        if (!iterChanged) {
            break;
        }
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
            if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
                fixed.set(id, { x: a.x, y: a.y });
            } else {
                fixed.set(id, { x: p.x || 0, y: p.y || 0 });
            }
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
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
        return false;
    }
    point.x = nx;
    point.y = ny;
    return true;
}

function getLineEndpoints(line, points) {
    const a = points.get(line?.a) || null;
    const b = points.get(line?.b) || null;
    return [a, b];
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
    if (fa && fb) {
        return false;
    }
    if (fa) {
        return setPoint(pb, pa.x || 0, pa.y || 0);
    }
    if (fb) {
        return setPoint(pa, pb.x || 0, pb.y || 0);
    }
    const mx = ((pa.x || 0) + (pb.x || 0)) * 0.5;
    const my = ((pa.y || 0) + (pb.y || 0)) * 0.5;
    return setPoint(pa, mx, my) || setPoint(pb, mx, my);
}

function applyHorizontal(constraint, points, lines, fixed) {
    const lineId = Array.isArray(constraint?.refs) ? constraint.refs[0] : null;
    const line = lines.get(lineId);
    if (!line) return false;
    const [a, b] = getLineEndpoints(line, points);
    if (!a || !b) return false;
    const fa = isFixed(line.a, fixed);
    const fb = isFixed(line.b, fixed);
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
    const fa = isFixed(line.a, fixed);
    const fb = isFixed(line.b, fixed);
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

    const fc = isFixed(l2.a, fixed);
    const fd = isFixed(l2.b, fixed);
    if (fc && fd) return false;

    if (fc) {
        return setPoint(d, (c.x || 0) + sx * vlen, (c.y || 0) + sy * vlen);
    }
    if (fd) {
        return setPoint(c, (d.x || 0) - sx * vlen, (d.y || 0) - sy * vlen);
    }

    const mx = ((c.x || 0) + (d.x || 0)) * 0.5;
    const my = ((c.y || 0) + (d.y || 0)) * 0.5;
    const hx = sx * vlen * 0.5;
    const hy = sy * vlen * 0.5;
    return setPoint(c, mx - hx, my - hy) || setPoint(d, mx + hx, my + hy);
}

export { enforceSketchConstraintsInPlace };
