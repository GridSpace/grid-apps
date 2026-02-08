/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function applyTangentConstraint(constraint, ctx) {
    const {
        points,
        lines,
        arcs,
        fixed,
        dragged = new Set(),
        draggedArcs = new Set(),
        tangentAggressive = false,
        deps
    } = ctx;
    const {
        getLineEndpoints,
        getLineEndpointId,
        isFixed,
        setPoint,
        getArcCircleData,
        moveArcCenterBy
    } = deps;

    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const line = lines.get(lines.has(refs[0]) ? refs[0] : (lines.has(refs[1]) ? refs[1] : null));
    const arc = arcs.get(arcs.has(refs[0]) ? refs[0] : (arcs.has(refs[1]) ? refs[1] : null));
    if (!line && !arc) return false;
    if (!line && arc) {
        const a1 = arcs.get(refs[0]);
        const a2 = arcs.get(refs[1]);
        if (!a1 || !a2) return false;
        return applyArcArcTangent(constraint, a1, a2, ctx, deps);
    }
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
    if (len < 1e-9) return false;
    const nx = -dy / len;
    const ny = dx / len;
    const dist = ((circ.cx - x1) * nx + (circ.cy - y1) * ny);
    const sign = dist >= 0 ? 1 : -1;
    const target = sign * circ.radius;
    const err = dist - target;
    if (Math.abs(err) < 1e-5) return false;
    const relax = 0.35;
    const maxStep = Math.max(0.25, len * 0.2);
    const corr = Math.max(-maxStep, Math.min(maxStep, err * relax));

    const aId = getLineEndpointId(line, 'a');
    const bId = getLineEndpointId(line, 'b');
    const fa = isFixed(aId, fixed);
    const fb = isFixed(bId, fixed);
    if (fa && fb) return false;
    if (!fa && !fb) {
        const mx = corr * nx;
        const my = corr * ny;
        let changed = false;
        changed = setPoint(a, x1 + mx, y1 + my) || changed;
        changed = setPoint(b, x2 + mx, y2 + my) || changed;
        return changed;
    }
    if (!fa) {
        return setPoint(a, x1 + corr * nx, y1 + corr * ny);
    }
    return setPoint(b, x2 + corr * nx, y2 + corr * ny);
}

function applyArcArcTangent(constraint, arc1, arc2, ctx, deps) {
    const {
        points,
        fixed,
        dragged = new Set(),
        draggedArcs = new Set(),
        tangentAggressive = false
    } = ctx;
    const {
        getLineEndpointId,
        isFixed,
        getArcCircleData,
        moveArcCenterBy
    } = deps;

    const c1 = getArcCircleData(arc1, points);
    const c2 = getArcCircleData(arc2, points);
    if (!c1 || !c2) return false;

    let dx = c2.cx - c1.cx;
    let dy = c2.cy - c1.cy;
    let dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 1e-9) {
        dx = 1;
        dy = 0;
        dist = 1;
    }
    const ux = dx / dist;
    const uy = dy / dist;

    const ext = c1.radius + c2.radius;
    const intl = Math.abs(c1.radius - c2.radius);
    const mode = resolveArcArcTangentMode(constraint, dist, ext, intl);
    const target = mode === 'internal' ? intl : ext;
    const err = dist - target;
    if (Math.abs(err) < 1e-6) return false;

    const a2id = getLineEndpointId(arc2, 'a');
    const b2id = getLineEndpointId(arc2, 'b');
    const a2f = isFixed(a2id, fixed);
    const b2f = isFixed(b2id, fixed);
    const a1id = getLineEndpointId(arc1, 'a');
    const b1id = getLineEndpointId(arc1, 'b');
    const a1f = isFixed(a1id, fixed);
    const b1f = isFixed(b1id, fixed);

    const arc1Dragged = draggedArcs?.has?.(arc1.id);
    const arc2Dragged = draggedArcs?.has?.(arc2.id);
    const a1Dragged = dragged?.has?.(a1id) || dragged?.has?.(b1id);
    const a2Dragged = dragged?.has?.(a2id) || dragged?.has?.(b2id);

    if (arc1Dragged && !arc2Dragged && !(a2f && b2f)) {
        return moveArcCenterTowardTarget(c1, c2, target, ux, uy, arc2, points, fixed, tangentAggressive, moveArcCenterBy);
    }
    if (arc2Dragged && !arc1Dragged && !(a1f && b1f)) {
        return moveArcCenterTowardTarget(c2, c1, target, -ux, -uy, arc1, points, fixed, tangentAggressive, moveArcCenterBy);
    }
    if (a1Dragged && !a2Dragged && !(a2f && b2f)) {
        return moveArcCenterTowardTarget(c1, c2, target, ux, uy, arc2, points, fixed, tangentAggressive, moveArcCenterBy);
    }
    if (a2Dragged && !a1Dragged && !(a1f && b1f)) {
        return moveArcCenterTowardTarget(c2, c1, target, -ux, -uy, arc1, points, fixed, tangentAggressive, moveArcCenterBy);
    }
    if (!(a2f && b2f)) {
        return moveArcCenterTowardTarget(c1, c2, target, ux, uy, arc2, points, fixed, tangentAggressive, moveArcCenterBy);
    }
    if (!(a1f && b1f)) {
        return moveArcCenterTowardTarget(c2, c1, target, -ux, -uy, arc1, points, fixed, tangentAggressive, moveArcCenterBy);
    }
    return false;
}

function resolveArcArcTangentMode(constraint, dist, ext, intl) {
    const data = (constraint && typeof constraint === 'object') ? (constraint.data || (constraint.data = {})) : {};
    if (data.arc_arc_mode === 'external' || data.arc_arc_mode === 'internal') {
        return data.arc_arc_mode;
    }
    const mode = Math.abs(dist - ext) <= Math.abs(dist - intl) ? 'external' : 'internal';
    data.arc_arc_mode = mode;
    return mode;
}

function moveArcCenterTowardTarget(anchor, moving, targetDist, ux, uy, moveArc, points, fixed, aggressive = false, moveArcCenterBy) {
    const tx = anchor.cx + ux * targetDist;
    const ty = anchor.cy + uy * targetDist;
    let dx = tx - moving.cx;
    let dy = ty - moving.cy;
    if (!aggressive) {
        dx *= 0.4;
        dy *= 0.4;
    }
    return moveArcCenterBy(moveArc, points, fixed, dx, dy);
}

export { applyTangentConstraint };
