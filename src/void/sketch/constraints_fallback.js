/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { applyTangentConstraint } from './constraints_tangent.js';
import { isCircleCurve, isThreePointCircle, markCircleThreePoint } from './curve.js';
import { SKETCH_VIRTUAL_ORIGIN_ID } from './constants.js';

const EPS = 1e-9;

function enforceWithFallback(sketch, opts = {}) {
    const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
    const constraints = Array.isArray(sketch?.constraints) ? sketch.constraints : [];
    if (!entities.length) {
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
    const refreshThreePointCircles = () => applyThreePointCircleDefinitions(arcs, points, fixed);
    let changed = refreshThreePointCircles();
    if (!constraints.length) {
        return changed;
    }
    const dragged = new Set(Array.isArray(opts?.draggedPointIds) ? opts.draggedPointIds : []);
    const draggedArcs = new Set(Array.isArray(opts?.draggedArcIds) ? opts.draggedArcIds : []);
    const tangentAggressive = !!opts?.tangentAggressive;
    const iterations = Math.max(1, Math.min(64, opts.iterations || 12));
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
                case 'mirror_point':
                    iterChanged = applyMirrorPoint(c, points, lines, fixed, dragged) || iterChanged;
                    break;
                case 'mirror_arc':
                    iterChanged = applyMirrorArc(c, points, lines, arcs, fixed, dragged, draggedArcs) || iterChanged;
                    break;
                case 'point_on_line':
                    iterChanged = applyPointOnLine(c, points, lines, fixed) || iterChanged;
                    break;
                case 'point_on_arc':
                    iterChanged = applyPointOnArc(c, points, arcs, fixed) || iterChanged;
                    break;
                case 'polygon_pattern':
                    iterChanged = applyPolygonPattern(c, constraints, points, lines, arcs, fixed, dragged) || iterChanged;
                    break;
                case 'circular_pattern':
                    iterChanged = applyCircularPattern(c, points, lines, arcs, fixed, dragged, draggedArcs) || iterChanged;
                    break;
                case 'grid_pattern':
                    iterChanged = applyGridPattern(c, points, lines, arcs, fixed, dragged, draggedArcs) || iterChanged;
                    break;
                case 'horizontal':
                    iterChanged = applyHorizontal(c, points, lines, fixed) || iterChanged;
                    break;
                case 'horizontal_points':
                    iterChanged = applyHorizontalPoints(c, points, arcs, fixed) || iterChanged;
                    break;
                case 'vertical':
                    iterChanged = applyVertical(c, points, lines, fixed) || iterChanged;
                    break;
                case 'vertical_points':
                    iterChanged = applyVerticalPoints(c, points, arcs, fixed) || iterChanged;
                    break;
                case 'perpendicular':
                    iterChanged = applyPerpendicular(c, points, lines, fixed) || iterChanged;
                    break;
                case 'equal':
                    iterChanged = applyEqual(c, points, lines, arcs, fixed, constraints) || iterChanged;
                    break;
                case 'collinear':
                    iterChanged = applyCollinear(c, points, lines, fixed) || iterChanged;
                    break;
                case 'dimension':
                    iterChanged = applyDimension(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'min_distance':
                    iterChanged = applyDistanceToConstraint(c, constraints, points, lines, arcs, fixed, 'min') || iterChanged;
                    break;
                case 'max_distance':
                    iterChanged = applyDistanceToConstraint(c, constraints, points, lines, arcs, fixed, 'max') || iterChanged;
                    break;
                case 'tangent':
                    iterChanged = applyTangent(c, points, lines, arcs, fixed, dragged, draggedArcs, tangentAggressive) || iterChanged;
                    break;
                case 'arc_center_coincident':
                    iterChanged = applyArcCenterCoincident(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'arc_center_on_line':
                    iterChanged = applyArcCenterOnLine(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'arc_center_on_arc':
                    iterChanged = applyArcCenterOnArc(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'arc_center_fixed_origin':
                    iterChanged = applyArcCenterFixedOrigin(c, points, lines, arcs, fixed) || iterChanged;
                    break;
                case 'midpoint':
                    iterChanged = applyMidpoint(c, points, fixed, dragged) || iterChanged;
                    break;
                default:
                    break;
            }
        }
        iterChanged = refreshThreePointCircles() || iterChanged;
        // Keep on-curve constraints "hard" at the end of each iteration so
        // subsequent line-length adjustments do not leave vertices drifting
        // off circles/arcs during drag.
        iterChanged = applyPointOnArcConstraints(constraints, points, arcs, fixed) || iterChanged;
        iterChanged = applyEqualConstraintGroups(constraints, points, lines, arcs, fixed, draggedArcs) || iterChanged;
        changed = changed || iterChanged;
        if (!iterChanged) break;
    }

    return changed;
}

function applyPolygonPattern(constraint, constraints, points, lines, arcs, fixed, dragged = new Set()) {
    let changed = false;
    const data = constraint?.data || {};
    const mode = data?.mode === 'circumscribed' ? 'circumscribed' : 'inscribed';
    const sides = Math.max(3, Math.min(128, Number(data?.sides || 0) || 0));
    const pointIds = Array.isArray(data?.pointIds) ? data.pointIds.filter(Boolean) : [];
    const lineIds = Array.isArray(data?.lineIds) ? data.lineIds.filter(Boolean) : [];
    if (!sides || pointIds.length < sides || lineIds.length < sides) return false;

    const circleId = (typeof data?.circleId === 'string' && arcs.has(data.circleId))
        ? data.circleId
        : (Array.isArray(constraint?.refs) ? constraint.refs.find(id => arcs.has(id)) : null);
    if (!circleId) return false;
    const circle = arcs.get(circleId);
    const circ = getArcCircleData(circle, points);
    if (!circ || !Number.isFinite(circ.radius) || circ.radius < EPS) return false;

    const step = (Math.PI * 2) / sides;
    let circleRadius = circ.radius;
    const draggedPatternPoints = pointIds.filter(id => dragged?.has?.(id)).map(id => points.get(id)).filter(Boolean);
    if (draggedPatternPoints.length) {
        const avgDraggedDist = draggedPatternPoints.reduce((sum, p) => {
            return sum + Math.hypot((p.x || 0) - circ.cx, (p.y || 0) - circ.cy);
        }, 0) / draggedPatternPoints.length;
        if (Number.isFinite(avgDraggedDist) && avgDraggedDist > EPS) {
            circleRadius = mode === 'circumscribed'
                ? avgDraggedDist * Math.cos(Math.PI / sides)
                : avgDraggedDist;
            if (Number.isFinite(circleRadius) && circleRadius > EPS) {
                changed = setArcCenterAndMeta(circle, circ.cx, circ.cy, circleRadius, 0, Math.PI * 2, true) || changed;
                changed = setArcControl(circle, circ.cx, circ.cy + circleRadius) || changed;
                const a = points.get(getLineEndpointId(circle, 'a'));
                const b = points.get(getLineEndpointId(circle, 'b'));
                if (a && !isFixed(getLineEndpointId(circle, 'a'), fixed)) {
                    changed = setPoint(a, circ.cx + circleRadius, circ.cy) || changed;
                }
                if (b && !isFixed(getLineEndpointId(circle, 'b'), fixed)) {
                    changed = setPoint(b, circ.cx + circleRadius, circ.cy) || changed;
                }
            }
        }
    }
    const polyRadius = mode === 'circumscribed'
        ? (circleRadius / Math.cos(Math.PI / sides))
        : circleRadius;
    if (!Number.isFinite(polyRadius) || polyRadius < EPS) return false;

    let base = derivePatternBaseFromPoints(pointIds, points, circ.cx, circ.cy, step);
    const oriented = derivePatternBaseFromLineOrientation(lineIds, constraints, step, base);
    if (Number.isFinite(oriented)) {
        base = oriented;
    }

    for (let i = 0; i < sides; i++) {
        const id = pointIds[i];
        const p = points.get(id);
        if (!p || isFixed(id, fixed)) continue;
        const ang = base + i * step;
        const tx = circ.cx + Math.cos(ang) * polyRadius;
        const ty = circ.cy + Math.sin(ang) * polyRadius;
        changed = setPoint(p, tx, ty) || changed;
    }
    return changed;
}

function applyPolygonPatternConstraints(constraints, points, lines, arcs, fixed, dragged = new Set()) {
    let changed = false;
    for (const c of constraints || []) {
        if (c?.type !== 'polygon_pattern') continue;
        changed = applyPolygonPattern(c, constraints, points, lines, arcs, fixed, dragged) || changed;
    }
    return changed;
}

function resolvePatternPointLike(ref, points, arcs) {
    if (!ref) return null;
    if (ref === SKETCH_VIRTUAL_ORIGIN_ID) return { x: 0, y: 0 };
    if (typeof ref === 'string' && ref.startsWith('arc-center:')) {
        const arc = arcs.get(ref.substring('arc-center:'.length));
        const data = getArcCircleData(arc, points);
        return data ? { x: data.cx, y: data.cy } : null;
    }
    const point = points.get(ref);
    if (!point) return null;
    return { x: point.x || 0, y: point.y || 0 };
}

function rotatePatternPointAround(point, center, angle) {
    const dx = (point.x || 0) - (center.x || 0);
    const dy = (point.y || 0) - (center.y || 0);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    return {
        x: (center.x || 0) + dx * ca - dy * sa,
        y: (center.y || 0) + dx * sa + dy * ca
    };
}

function applyCircularPattern(constraint, points, lines, arcs, fixed, dragged = new Set(), draggedArcs = new Set()) {
    const data = constraint?.data || {};
    const centerRef = typeof data?.centerRef === 'string'
        ? data.centerRef
        : (Array.isArray(constraint?.refs) ? constraint.refs[0] : null);
    const sourceIds = Array.isArray(data?.sourceIds) ? data.sourceIds.filter(Boolean) : [];
    const copies = Array.isArray(data?.copies) ? data.copies : [];
    const pointMaps = Array.isArray(data?.pointMaps) ? data.pointMaps : [];
    const count = Math.max(2, Math.min(256, Number(data?.count || 0) || 0));
    if (!centerRef || !sourceIds.length || count < 2) return false;
    const center = resolvePatternPointLike(centerRef, points, arcs);
    if (!center) return false;

    let changed = false;
    // Back-propagate drag from copies -> source so dragging any copy behaves
    // like dragging the source, then forward-propagate source -> all copies.
    for (let step = 1; step < count; step++) {
        const angle = (Math.PI * 2 * step) / count;
        const pointPairs = Array.isArray(pointMaps[step - 1]) ? pointMaps[step - 1] : [];
        for (const pair of pointPairs) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const srcId = pair[0];
            const dstId = pair[1];
            if (!dragged?.has?.(dstId) || dragged?.has?.(srcId) || isFixed(srcId, fixed)) continue;
            const dst = points.get(dstId);
            const src = points.get(srcId);
            if (!src || !dst) continue;
            const inv = rotatePatternPointAround(dst, center, -angle);
            changed = setPoint(src, inv.x, inv.y) || changed;
            dragged?.add?.(srcId);
        }
        const stepCopies = Array.isArray(copies[step - 1]) ? copies[step - 1] : [];
        for (let i = 0; i < sourceIds.length; i++) {
            const sourceId = sourceIds[i];
            const copyId = stepCopies[i];
            if (!sourceId || !copyId) continue;
            if (!draggedArcs?.has?.(copyId) || draggedArcs?.has?.(sourceId)) continue;
            const srcArc = arcs.get(sourceId);
            const dstArc = arcs.get(copyId);
            if (!srcArc || !dstArc) continue;
            if (Number.isFinite(dstArc.cx) && Number.isFinite(dstArc.cy)) {
                const invC = rotatePatternPointAround({ x: dstArc.cx, y: dstArc.cy }, center, -angle);
                const sa = Number(dstArc.startAngle);
                const ea = Number(dstArc.endAngle);
                changed = setArcCenterAndMeta(
                    srcArc,
                    invC.x,
                    invC.y,
                    Number.isFinite(dstArc.radius) ? dstArc.radius : Number(srcArc.radius || 0),
                    Number.isFinite(sa) ? sa - angle : Number(srcArc.startAngle || 0),
                    Number.isFinite(ea) ? ea - angle : Number(srcArc.endAngle || 0),
                    dstArc.ccw === undefined ? true : dstArc.ccw
                ) || changed;
                draggedArcs?.add?.(sourceId);
            }
            if (Number.isFinite(dstArc.mx) && Number.isFinite(dstArc.my)) {
                const invM = rotatePatternPointAround({ x: dstArc.mx, y: dstArc.my }, center, -angle);
                changed = setArcControl(srcArc, invM.x, invM.y) || changed;
            }
        }
    }

    for (let step = 1; step < count; step++) {
        const angle = (Math.PI * 2 * step) / count;
        const pointPairs = Array.isArray(pointMaps[step - 1]) ? pointMaps[step - 1] : [];
        const pointMap = new Map();
        for (const pair of pointPairs) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            pointMap.set(pair[0], pair[1]);
        }
        for (const [srcId, dstId] of pointMap.entries()) {
            const src = points.get(srcId);
            const dst = points.get(dstId);
            if (!src || !dst || isFixed(dstId, fixed)) continue;
            const rot = rotatePatternPointAround(src, center, angle);
            changed = setPoint(dst, rot.x, rot.y) || changed;
        }
        const stepCopies = Array.isArray(copies[step - 1]) ? copies[step - 1] : [];
        for (let i = 0; i < sourceIds.length; i++) {
            const sourceId = sourceIds[i];
            const copyId = stepCopies[i];
            if (!sourceId || !copyId) continue;
            const srcLine = lines.get(sourceId);
            const dstLine = lines.get(copyId);
            if (srcLine && dstLine) continue;
            const srcArc = arcs.get(sourceId);
            const dstArc = arcs.get(copyId);
            if (srcArc && dstArc) {
                if (draggedArcs?.has?.(copyId)) continue;
                if (Number.isFinite(srcArc.cx) && Number.isFinite(srcArc.cy)) {
                    const c = rotatePatternPointAround({ x: srcArc.cx, y: srcArc.cy }, center, angle);
                    const sa = Number(srcArc.startAngle);
                    const ea = Number(srcArc.endAngle);
                    changed = setArcCenterAndMeta(
                        dstArc,
                        c.x,
                        c.y,
                        Number.isFinite(srcArc.radius) ? srcArc.radius : Number(dstArc.radius || 0),
                        Number.isFinite(sa) ? sa + angle : Number(dstArc.startAngle || 0),
                        Number.isFinite(ea) ? ea + angle : Number(dstArc.endAngle || 0),
                        srcArc.ccw === undefined ? true : srcArc.ccw
                    ) || changed;
                }
                if (Number.isFinite(srcArc.mx) && Number.isFinite(srcArc.my)) {
                    const m = rotatePatternPointAround({ x: srcArc.mx, y: srcArc.my }, center, angle);
                    changed = setArcControl(dstArc, m.x, m.y) || changed;
                }
                continue;
            }
            const srcPoint = points.get(sourceId);
            const dstPoint = points.get(copyId);
            if (srcPoint && dstPoint && !isFixed(copyId, fixed)) {
                const rot = rotatePatternPointAround(srcPoint, center, angle);
                changed = setPoint(dstPoint, rot.x, rot.y) || changed;
            }
        }
    }
    return changed;
}

function applyCircularPatternConstraints(constraints, points, lines, arcs, fixed, dragged = new Set(), draggedArcs = new Set()) {
    let changed = false;
    for (const c of constraints || []) {
        if (c?.type !== 'circular_pattern') continue;
        changed = applyCircularPattern(c, points, lines, arcs, fixed, dragged, draggedArcs) || changed;
    }
    return changed;
}

function applyGridPattern(constraint, points, lines, arcs, fixed, dragged = new Set(), draggedArcs = new Set()) {
    const data = constraint?.data || {};
    const centerPointId = typeof data?.centerPointId === 'string' ? data.centerPointId : null;
    const sourceIds = Array.isArray(data?.sourceIds) ? data.sourceIds.filter(Boolean) : [];
    const uLineId = typeof data?.uLineId === 'string' ? data.uLineId : null;
    const vLineId = typeof data?.vLineId === 'string' ? data.vLineId : null;
    const pointMaps = Array.isArray(data?.pointMaps) ? data.pointMaps : [];
    const copies = Array.isArray(data?.copies) ? data.copies : [];
    const countH = Math.max(1, Math.min(256, Number(data?.countH || 0) || 0));
    const countV = Math.max(1, Math.min(256, Number(data?.countV || 0) || 0));
    if (!centerPointId || !uLineId || !vLineId || !sourceIds.length || countH < 1 || countV < 1) return false;
    const center = points.get(centerPointId);
    const uLine = lines.get(uLineId);
    const vLine = lines.get(vLineId);
    if (!center || !uLine || !vLine) return false;
    const uOtherId = uLine.a === centerPointId ? uLine.b : uLine.a;
    const vOtherId = vLine.a === centerPointId ? vLine.b : vLine.a;
    const uOther = points.get(uOtherId);
    const vOther = points.get(vOtherId);
    if (!uOther || !vOther) return false;
    const ux = (uOther.x || 0) - (center.x || 0);
    const uy = (uOther.y || 0) - (center.y || 0);
    const vx = (vOther.x || 0) - (center.x || 0);
    const vy = (vOther.y || 0) - (center.y || 0);
    let changed = false;

    // Back-propagate dragged copy points/arcs to source.
    for (const rec of pointMaps) {
        const i = Number(rec?.i || 0);
        const j = Number(rec?.j || 0);
        const ox = i * ux + j * vx;
        const oy = i * uy + j * vy;
        for (const pair of (rec?.pairs || [])) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const srcId = pair[0];
            const dstId = pair[1];
            if (!dragged?.has?.(dstId) || dragged?.has?.(srcId) || isFixed(srcId, fixed)) continue;
            const src = points.get(srcId);
            const dst = points.get(dstId);
            if (!src || !dst) continue;
            changed = setPoint(src, (dst.x || 0) - ox, (dst.y || 0) - oy) || changed;
            dragged?.add?.(srcId);
        }
    }
    for (const rec of copies) {
        const i = Number(rec?.i || 0);
        const j = Number(rec?.j || 0);
        const ox = i * ux + j * vx;
        const oy = i * uy + j * vy;
        const ids = Array.isArray(rec?.ids) ? rec.ids : [];
        for (let k = 0; k < sourceIds.length; k++) {
            const srcId = sourceIds[k];
            const dstId = ids[k];
            if (!srcId || !dstId) continue;
            if (!draggedArcs?.has?.(dstId) || draggedArcs?.has?.(srcId)) continue;
            const srcArc = arcs.get(srcId);
            const dstArc = arcs.get(dstId);
            if (!srcArc || !dstArc) continue;
            if (Number.isFinite(dstArc.cx) && Number.isFinite(dstArc.cy)) {
                changed = setArcCenterAndMeta(
                    srcArc,
                    (dstArc.cx || 0) - ox,
                    (dstArc.cy || 0) - oy,
                    Number.isFinite(dstArc.radius) ? dstArc.radius : Number(srcArc.radius || 0),
                    Number(dstArc.startAngle || 0),
                    Number(dstArc.endAngle || 0),
                    dstArc.ccw === undefined ? true : dstArc.ccw
                ) || changed;
                draggedArcs?.add?.(srcId);
            }
            if (Number.isFinite(dstArc.mx) && Number.isFinite(dstArc.my)) {
                changed = setArcControl(srcArc, (dstArc.mx || 0) - ox, (dstArc.my || 0) - oy) || changed;
            }
        }
    }

    // Forward-propagate source entities -> copies.
    for (const rec of pointMaps) {
        const i = Number(rec?.i || 0);
        const j = Number(rec?.j || 0);
        const ox = i * ux + j * vx;
        const oy = i * uy + j * vy;
        for (const pair of (rec?.pairs || [])) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const src = points.get(pair[0]);
            const dst = points.get(pair[1]);
            if (!src || !dst || isFixed(pair[1], fixed)) continue;
            changed = setPoint(dst, (src.x || 0) + ox, (src.y || 0) + oy) || changed;
        }
    }
    for (const rec of copies) {
        const i = Number(rec?.i || 0);
        const j = Number(rec?.j || 0);
        const ox = i * ux + j * vx;
        const oy = i * uy + j * vy;
        const ids = Array.isArray(rec?.ids) ? rec.ids : [];
        for (let k = 0; k < sourceIds.length; k++) {
            const srcArc = arcs.get(sourceIds[k]);
            const dstArc = arcs.get(ids[k]);
            if (!srcArc || !dstArc) continue;
            if (Number.isFinite(srcArc.cx) && Number.isFinite(srcArc.cy)) {
                changed = setArcCenterAndMeta(
                    dstArc,
                    (srcArc.cx || 0) + ox,
                    (srcArc.cy || 0) + oy,
                    Number.isFinite(srcArc.radius) ? srcArc.radius : Number(dstArc.radius || 0),
                    Number(srcArc.startAngle || 0),
                    Number(srcArc.endAngle || 0),
                    srcArc.ccw === undefined ? true : srcArc.ccw
                ) || changed;
            }
            if (Number.isFinite(srcArc.mx) && Number.isFinite(srcArc.my)) {
                changed = setArcControl(dstArc, (srcArc.mx || 0) + ox, (srcArc.my || 0) + oy) || changed;
            }
        }
    }
    return changed;
}

function applyGridPatternConstraints(constraints, points, lines, arcs, fixed, dragged = new Set(), draggedArcs = new Set()) {
    let changed = false;
    for (const c of constraints || []) {
        if (c?.type !== 'grid_pattern') continue;
        changed = applyGridPattern(c, points, lines, arcs, fixed, dragged, draggedArcs) || changed;
    }
    return changed;
}

function derivePatternBaseFromPoints(pointIds, points, cx, cy, step) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let i = 0; i < pointIds.length; i++) {
        const p = points.get(pointIds[i]);
        if (!p) continue;
        const ang = Math.atan2((p.y || 0) - cy, (p.x || 0) - cx);
        const phase = ang - i * step;
        sx += Math.cos(phase);
        sy += Math.sin(phase);
        count++;
    }
    if (!count) return 0;
    return Math.atan2(sy, sx);
}

function derivePatternBaseFromLineOrientation(lineIds, constraints, step, preferredBase = 0) {
    const orientationByLine = new Map();
    for (const c of constraints || []) {
        if (!c?.type) continue;
        if (c.type !== 'horizontal' && c.type !== 'vertical') continue;
        const lid = Array.isArray(c.refs) ? c.refs[0] : null;
        if (!lid) continue;
        orientationByLine.set(lid, c.type);
    }
    for (let i = 0; i < lineIds.length; i++) {
        const type = orientationByLine.get(lineIds[i]);
        if (!type) continue;
        const target = type === 'vertical' ? (Math.PI * 0.5) : 0;
        // Regular polygon edge i direction = base + i*step + step/2 + pi/2.
        const base0 = target - (i * step) - (step * 0.5) - (Math.PI * 0.5);
        // Horizontal/vertical do not constrain edge direction sign; avoid
        // branch flips by choosing the orientation nearest to current pose.
        const base1 = base0 + Math.PI;
        return nearestAngle(preferredBase, base0, base1);
    }
    return NaN;
}

function normAngle(a) {
    let out = a % (Math.PI * 2);
    if (out < 0) out += Math.PI * 2;
    return out;
}

function angleDist(a, b) {
    const aa = normAngle(a);
    const bb = normAngle(b);
    let d = Math.abs(aa - bb);
    if (d > Math.PI) d = (Math.PI * 2) - d;
    return d;
}

function nearestAngle(ref, a, b) {
    return angleDist(ref, a) <= angleDist(ref, b) ? a : b;
}

function applyThreePointCircleDefinitions(arcs, points, fixed) {
    let changed = false;
    if (!(arcs instanceof Map) || !(points instanceof Map)) return false;
    for (const arc of arcs.values()) {
        if (!arc) continue;
        const ids = Array.isArray(arc?.data?.threePointIds) ? arc.data.threePointIds.filter(Boolean) : [];
        if (!isThreePointCircle(arc) && ids.length < 3) continue;
        if (ids.length < 3) continue;
        const p1 = points.get(ids[0]);
        const p2 = points.get(ids[1]);
        const p3 = points.get(ids[2]);
        if (!p1 || !p2 || !p3) continue;
        const circle = computeArcGeometry(
            { x: p1.x || 0, y: p1.y || 0 },
            { x: p2.x || 0, y: p2.y || 0 },
            { x: p3.x || 0, y: p3.y || 0 }
        );
        if (!circle) continue;
        const radius = Math.hypot((p1.x || 0) - circle.cx, (p1.y || 0) - circle.cy);
        if (!Number.isFinite(radius) || radius < EPS) continue;
        const a = points.get(getLineEndpointId(arc, 'a'));
        const b = points.get(getLineEndpointId(arc, 'b'));
        const aId = getLineEndpointId(arc, 'a');
        const bId = getLineEndpointId(arc, 'b');
        if (a && !isFixed(aId, fixed)) {
            changed = setPoint(a, p1.x || 0, p1.y || 0) || changed;
        }
        if (b && !isFixed(bId, fixed)) {
            changed = setPoint(b, p1.x || 0, p1.y || 0) || changed;
        }
        changed = setArcCenterAndMeta(arc, circle.cx, circle.cy, radius, 0, Math.PI * 2, true) || changed;
        changed = setArcControl(arc, circle.cx, circle.cy + radius) || changed;
        changed = markCircleThreePoint(arc) || changed;
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

function getPointLikeRef(ref, points, arcs) {
    if (!ref) return null;
    if (ref === SKETCH_VIRTUAL_ORIGIN_ID) {
        return { x: 0, y: 0, virtual: true, ref };
    }
    const p = points.get(ref);
    if (p) {
        return { x: p.x || 0, y: p.y || 0, point: p, ref };
    }
    if (typeof ref === 'string' && ref.startsWith('arc-center:')) {
        const arcId = ref.substring('arc-center:'.length);
        const arc = arcs.get(arcId);
        if (!arc) return null;
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
            return { x: cx, y: cy, arc, arcId, ref };
        }
        const [a, b] = getLineEndpoints(arc, points);
        if (!a || !b) return null;
        const center = getArcCenter(arc, a, b);
        if (!center) return null;
        return { x: center.x, y: center.y, arc, arcId, ref };
    }
    return null;
}

function setPointLikeRef(pointLike, x, y, points, fixed) {
    if (!pointLike) return false;
    if (pointLike.virtual) return false;
    if (pointLike.point) {
        if (isFixed(pointLike.ref, fixed)) return false;
        return setPoint(pointLike.point, x, y);
    }
    if (pointLike.arc) {
        const arc = pointLike.arc;
        const [a, b] = getLineEndpoints(arc, points);
        if (!a || !b) return false;
        const aId = getLineEndpointId(arc, 'a');
        const bId = getLineEndpointId(arc, 'b');
        const fa = !!(aId && fixed.has(aId));
        const fb = !!(bId && fixed.has(bId));
        return enforceArcFromCenter(arc, a, b, x, y, fa, fb);
    }
    return false;
}

function applyHorizontalPoints(constraint, points, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const a = getPointLikeRef(refs[0], points, arcs);
    const b = getPointLikeRef(refs[1], points, arcs);
    if (!a || !b) return false;
    const aFixed = a.virtual || (a.point && isFixed(refs[0], fixed));
    const bFixed = b.virtual || (b.point && isFixed(refs[1], fixed));
    if (aFixed && bFixed) return false;
    const y = aFixed ? (a.y || 0) : (bFixed ? (b.y || 0) : (((a.y || 0) + (b.y || 0)) * 0.5));
    if (aFixed) return setPointLikeRef(b, b.x || 0, y, points, fixed);
    if (bFixed) return setPointLikeRef(a, a.x || 0, y, points, fixed);
    return setPointLikeRef(a, a.x || 0, y, points, fixed) || setPointLikeRef(b, b.x || 0, y, points, fixed);
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

function applyVerticalPoints(constraint, points, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const a = getPointLikeRef(refs[0], points, arcs);
    const b = getPointLikeRef(refs[1], points, arcs);
    if (!a || !b) return false;
    const aFixed = a.virtual || (a.point && isFixed(refs[0], fixed));
    const bFixed = b.virtual || (b.point && isFixed(refs[1], fixed));
    if (aFixed && bFixed) return false;
    const x = aFixed ? (a.x || 0) : (bFixed ? (b.x || 0) : (((a.x || 0) + (b.x || 0)) * 0.5));
    if (aFixed) return setPointLikeRef(b, x, b.y || 0, points, fixed);
    if (bFixed) return setPointLikeRef(a, x, a.y || 0, points, fixed);
    return setPointLikeRef(a, x, a.y || 0, points, fixed) || setPointLikeRef(b, x, b.y || 0, points, fixed);
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

function applyEqual(constraint, points, lines, arcs, fixed, constraints = []) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const l1 = lines.get(refs[0]);
    const l2 = lines.get(refs[1]);
    const a1 = arcs.get(refs[0]);
    const a2 = arcs.get(refs[1]);
    if (a1 && a2) {
        const c1 = getArcCircleData(a1, points);
        const c2 = getArcCircleData(a2, points);
        if (!c1 || !c2) return false;
        const r1Driving = getDrivingArcRadiusFromConstraints(constraints, refs[0]);
        const r2Driving = getDrivingArcRadiusFromConstraints(constraints, refs[1]);
        if (Number.isFinite(r1Driving) && Number.isFinite(r2Driving)) {
            if (Math.abs(r1Driving - r2Driving) <= EPS) return false;
            return false;
        }
        if (Number.isFinite(r1Driving) && !Number.isFinite(r2Driving)) {
            return applyArcRadiusTarget(a2, points, r1Driving, fixed);
        }
        if (Number.isFinite(r2Driving) && !Number.isFinite(r1Driving)) {
            return applyArcRadiusTarget(a1, points, r2Driving, fixed);
        }
        const target = (c1.radius + c2.radius) * 0.5;
        const p2a = getLineEndpointId(a2, 'a');
        const p2b = getLineEndpointId(a2, 'b');
        const fa = isFixed(p2a, fixed);
        const fb = isFixed(p2b, fixed);
        if (fa && fb) {
            const p1a = getLineEndpointId(a1, 'a');
            const p1b = getLineEndpointId(a1, 'b');
            const f1a = isFixed(p1a, fixed);
            const f1b = isFixed(p1b, fixed);
            if (f1a && f1b) return false;
            return applyArcRadiusTarget(a1, points, target, fixed);
        }
        return applyArcRadiusTarget(a2, points, target, fixed);
    }
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
        let changed = false;
        changed = setPoint(a, mx - hx, my - hy) || changed;
        changed = setPoint(b, mx + hx, my + hy) || changed;
        return changed;
    }

    const ux = ((d.x || 0) - (c.x || 0)) / len2;
    const uy = ((d.y || 0) - (c.y || 0)) / len2;
    if (fc) return setPoint(d, (c.x || 0) + ux * target, (c.y || 0) + uy * target);
    if (fd) return setPoint(c, (d.x || 0) - ux * target, (d.y || 0) - uy * target);
    const mx = ((c.x || 0) + (d.x || 0)) * 0.5;
    const my = ((c.y || 0) + (d.y || 0)) * 0.5;
    const hx = ux * target * 0.5;
    const hy = uy * target * 0.5;
    let changed = false;
    changed = setPoint(c, mx - hx, my - hy) || changed;
    changed = setPoint(d, mx + hx, my + hy) || changed;
    return changed;
}

function getDrivingArcRadiusFromConstraints(constraints, arcId) {
    if (!arcId) return NaN;
    for (const c of constraints || []) {
        if (c?.type !== 'dimension') continue;
        if (c?.data?.mode === 'driven') continue;
        const refs = Array.isArray(c?.refs) ? c.refs : [];
        if (refs.length !== 1 || refs[0] !== arcId) continue;
        const v = Number(c?.data?.value);
        if (Number.isFinite(v) && v > EPS) return v * 0.5;
    }
    return NaN;
}

function applyEqualConstraintGroups(constraints, points, lines, arcs, fixed, draggedArcs = new Set()) {
    const equalLinePairs = [];
    const equalArcPairs = [];
    for (const c of constraints) {
        if (c?.type !== 'equal') continue;
        const refs = Array.isArray(c.refs) ? c.refs : [];
        if (refs.length < 2) continue;
        if (lines.has(refs[0]) && lines.has(refs[1])) {
            equalLinePairs.push([refs[0], refs[1]]);
            continue;
        }
        if (arcs.has(refs[0]) && arcs.has(refs[1])) {
            equalArcPairs.push([refs[0], refs[1]]);
            continue;
        }
    }
    if (!equalLinePairs.length && !equalArcPairs.length) return false;

    const parent = new Map();
    const find = id => {
        if (!parent.has(id)) parent.set(id, id);
        let p = parent.get(id);
        while (p !== parent.get(p)) p = parent.get(p);
        let n = id;
        while (parent.get(n) !== p) {
            const next = parent.get(n);
            parent.set(n, p);
            n = next;
        }
        return p;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
    };
    let changed = false;
    for (const [a, b] of equalLinePairs) union(a, b);
    const lineGroups = new Map();
    for (const [a, b] of equalLinePairs) {
        const ids = [a, b];
        for (const id of ids) {
            const r = find(id);
            if (!lineGroups.has(r)) lineGroups.set(r, new Set());
            lineGroups.get(r).add(id);
        }
    }
    for (const ids of lineGroups.values()) {
        const linesInGroup = Array.from(ids).map(id => lines.get(id)).filter(Boolean);
        if (linesInGroup.length < 2) continue;
        let sum = 0;
        let count = 0;
        for (const line of linesInGroup) {
            const [a, b] = getLineEndpoints(line, points);
            if (!a || !b) continue;
            const len = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
            if (len > EPS) {
                sum += len;
                count++;
            }
        }
        if (!count) continue;
        const target = sum / count;
        for (const line of linesInGroup) {
            const [a, b] = getLineEndpoints(line, points);
            if (!a || !b) continue;
            const aId = getLineEndpointId(line, 'a');
            const bId = getLineEndpointId(line, 'b');
            const fa = isFixed(aId, fixed);
            const fb = isFixed(bId, fixed);
            if (fa && fb) continue;
            const vx = (b.x || 0) - (a.x || 0);
            const vy = (b.y || 0) - (a.y || 0);
            const len = Math.hypot(vx, vy);
            if (len < EPS) continue;
            const ux = vx / len;
            const uy = vy / len;
            if (fa) {
                changed = setPoint(b, (a.x || 0) + ux * target, (a.y || 0) + uy * target) || changed;
            } else if (fb) {
                changed = setPoint(a, (b.x || 0) - ux * target, (b.y || 0) - uy * target) || changed;
            } else {
                const mx = ((a.x || 0) + (b.x || 0)) * 0.5;
                const my = ((a.y || 0) + (b.y || 0)) * 0.5;
                const hx = ux * target * 0.5;
                const hy = uy * target * 0.5;
                changed = setPoint(a, mx - hx, my - hy) || changed;
                changed = setPoint(b, mx + hx, my + hy) || changed;
            }
        }
    }

    const aparent = new Map();
    const afind = id => {
        if (!aparent.has(id)) aparent.set(id, id);
        let p = aparent.get(id);
        while (p !== aparent.get(p)) p = aparent.get(p);
        let n = id;
        while (aparent.get(n) !== p) {
            const next = aparent.get(n);
            aparent.set(n, p);
            n = next;
        }
        return p;
    };
    const aunion = (a, b) => {
        const ra = afind(a);
        const rb = afind(b);
        if (ra !== rb) aparent.set(rb, ra);
    };
    for (const [a, b] of equalArcPairs) aunion(a, b);
    const arcGroups = new Map();
    for (const [a, b] of equalArcPairs) {
        const ids = [a, b];
        for (const id of ids) {
            const r = afind(id);
            if (!arcGroups.has(r)) arcGroups.set(r, new Set());
            arcGroups.get(r).add(id);
        }
    }
    for (const ids of arcGroups.values()) {
        const arcIds = Array.from(ids).filter(id => arcs.has(id));
        if (arcIds.length < 2) continue;
        let target = NaN;
        for (const aid of arcIds) {
            const dv = getDrivingArcRadiusFromConstraints(constraints, aid);
            if (Number.isFinite(dv) && dv > EPS) {
                target = dv;
                break;
            }
        }
        if (!Number.isFinite(target)) {
            const dragged = arcIds.filter(id => draggedArcs?.has?.(id));
            if (dragged.length) {
                let sum = 0;
                let count = 0;
                for (const aid of dragged) {
                    const c = getArcCircleData(arcs.get(aid), points);
                    if (!c) continue;
                    sum += c.radius;
                    count++;
                }
                if (count) target = sum / count;
            }
        }
        if (!Number.isFinite(target)) {
            let sum = 0;
            let count = 0;
            for (const aid of arcIds) {
                const c = getArcCircleData(arcs.get(aid), points);
                if (!c) continue;
                sum += c.radius;
                count++;
            }
            if (!count) continue;
            target = sum / count;
        }
        for (const aid of arcIds) {
            const arc = arcs.get(aid);
            if (!arc) continue;
            changed = applyArcRadiusTarget(arc, points, target, fixed) || changed;
        }
    }

    return changed;
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

function applyDimension(constraint, points, lines, arcs, fixed) {
    if (constraint?.data?.mode === 'driven') return false;
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    const target = Number(constraint?.data?.value);
    if (!Number.isFinite(target) || target <= EPS) return false;

    let p1Id = null;
    let p2Id = null;
    if (refs.length === 1 && lines.has(refs[0])) {
        const line = lines.get(refs[0]);
        p1Id = getLineEndpointId(line, 'a');
        p2Id = getLineEndpointId(line, 'b');
    } else if (refs.length === 1 && arcs.has(refs[0])) {
        const arc = arcs.get(refs[0]);
        return applyArcRadiusTarget(arc, points, target * 0.5, fixed);
    } else if (refs.length >= 2 && points.has(refs[0]) && points.has(refs[1])) {
        p1Id = refs[0];
        p2Id = refs[1];
    } else if (refs.length >= 2) {
        const aRef = getPointLikeRef(refs[0], points, arcs);
        const bRef = getPointLikeRef(refs[1], points, arcs);
        if (!aRef || !bRef) return false;
        const aFixed = aRef.virtual || (aRef.point && isFixed(refs[0], fixed));
        const bFixed = bRef.virtual || (bRef.point && isFixed(refs[1], fixed));
        if (aFixed && bFixed) return false;
        let vx = (bRef.x || 0) - (aRef.x || 0);
        let vy = (bRef.y || 0) - (aRef.y || 0);
        let len = Math.hypot(vx, vy);
        if (len < EPS) {
            vx = 1; vy = 0; len = 1;
        }
        const ux = vx / len;
        const uy = vy / len;
        if (aFixed) {
            return setPointLikeRef(bRef, (aRef.x || 0) + ux * target, (aRef.y || 0) + uy * target, points, fixed);
        }
        if (bFixed) {
            return setPointLikeRef(aRef, (bRef.x || 0) - ux * target, (bRef.y || 0) - uy * target, points, fixed);
        }
        const mx = ((aRef.x || 0) + (bRef.x || 0)) * 0.5;
        const my = ((aRef.y || 0) + (bRef.y || 0)) * 0.5;
        const hx = ux * target * 0.5;
        const hy = uy * target * 0.5;
        let changed = false;
        changed = setPointLikeRef(aRef, mx - hx, my - hy, points, fixed) || changed;
        changed = setPointLikeRef(bRef, mx + hx, my + hy, points, fixed) || changed;
        return changed;
    }
    if (!p1Id || !p2Id) return false;
    const a = points.get(p1Id);
    const b = points.get(p2Id);
    if (!a || !b) return false;
    const fa = isFixed(p1Id, fixed);
    const fb = isFixed(p2Id, fixed);
    if (fa && fb) return false;

    let vx = (b.x || 0) - (a.x || 0);
    let vy = (b.y || 0) - (a.y || 0);
    let len = Math.hypot(vx, vy);
    if (len < EPS) {
        vx = 1;
        vy = 0;
        len = 1;
    }
    const ux = vx / len;
    const uy = vy / len;
    if (fa) {
        return setPoint(b, (a.x || 0) + ux * target, (a.y || 0) + uy * target);
    }
    if (fb) {
        return setPoint(a, (b.x || 0) - ux * target, (b.y || 0) - uy * target);
    }
    const mx = ((a.x || 0) + (b.x || 0)) * 0.5;
    const my = ((a.y || 0) + (b.y || 0)) * 0.5;
    const hx = ux * target * 0.5;
    const hy = uy * target * 0.5;
    let changed = false;
    changed = setPoint(a, mx - hx, my - hy) || changed;
    changed = setPoint(b, mx + hx, my + hy) || changed;
    return changed;
}

function applyDistanceToConstraint(constraint, constraints, points, lines, arcs, fixed, mode = 'min') {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    const target = Number(constraint?.data?.value);
    if (refs.length < 2 || !Number.isFinite(target) || target <= EPS) return false;
    const arcId = refs.find(ref => arcs.has(ref)) || null;
    if (!arcId) return false;
    const arc = arcs.get(arcId);
    if (!arc) return false;
    const circle = getArcCircleData(arc, points);
    if (!circle) return false;
    const currentRadius = Number(circle.radius);
    if (!Number.isFinite(currentRadius) || currentRadius <= EPS) return false;

    const targetRef = refs.find(ref => ref !== arcId) || null;
    if (!targetRef) return false;

    let centerDistance = null;
    let targetRadius = null;
    let targetPoint = null;
    let lineAnchor = null;
    let lineDir = null;
    let otherCenter = null;
    const pointLike = getPointLikeRef(targetRef, points, arcs);
    const isArcTarget = arcs.has(targetRef);
    const isLineTarget = lines.has(targetRef);
    if (pointLike) {
        targetPoint = { x: pointLike.x || 0, y: pointLike.y || 0 };
        centerDistance = Math.hypot((pointLike.x || 0) - circle.cx, (pointLike.y || 0) - circle.cy);
    } else if (isLineTarget) {
        const line = lines.get(targetRef);
        const [a, b] = getLineEndpoints(line, points);
        if (!a || !b) return false;
        const nearest = nearestPointOnInfiniteLine(circle.cx, circle.cy, a.x || 0, a.y || 0, b.x || 0, b.y || 0);
        lineAnchor = { x: nearest.x, y: nearest.y };
        lineDir = { x: (b.x || 0) - (a.x || 0), y: (b.y || 0) - (a.y || 0) };
        centerDistance = Math.hypot((nearest.x || 0) - circle.cx, (nearest.y || 0) - circle.cy);
    } else if (isArcTarget) {
        const other = arcs.get(targetRef);
        const otherCircle = getArcCircleData(other, points);
        if (!otherCircle) return false;
        otherCenter = { x: otherCircle.cx || 0, y: otherCircle.cy || 0 };
        centerDistance = Math.hypot((otherCircle.cx || 0) - circle.cx, (otherCircle.cy || 0) - circle.cy);
        targetRadius = Number(otherCircle.radius);
        if (!Number.isFinite(targetRadius) || targetRadius <= EPS) return false;
    } else {
        return false;
    }
    if (!Number.isFinite(centerDistance)) return false;
    const r2 = Number.isFinite(targetRadius) ? targetRadius : 0;
    const [pa, pb] = getLineEndpoints(arc, points);
    if (!pa || !pb) return false;
    const aId = getLineEndpointId(arc, 'a');
    const bId = getLineEndpointId(arc, 'b');
    const fa = isFixed(aId, fixed);
    const fb = isFixed(bId, fixed);
    const radiusDriven = Number.isFinite(getDrivingArcRadiusFromConstraints(constraints, arcId));

    // min distance = nearest boundary distance
    // max distance = farthest boundary distance
    const currentMin = Math.max(0, Math.max(centerDistance - (currentRadius + r2), Math.abs(currentRadius - r2) - centerDistance));
    const currentMax = centerDistance + currentRadius + r2;
    if (mode === 'min' && Math.abs(currentMin - target) <= 1e-6) return false;
    if (mode === 'max' && Math.abs(currentMax - target) <= 1e-6) return false;

    const candidates = [];
    const centerTargets = [];
    if (mode === 'max') {
        const d = target - currentRadius - r2;
        if (Number.isFinite(d) && d > EPS) centerTargets.push(d);
    } else if (mode === 'min') {
        const ext = currentRadius + r2 + target;
        if (Number.isFinite(ext) && ext > EPS) centerTargets.push(ext);
        // For point/line targets, using only external branch avoids drag-time
        // branch flipping and keeps resizing smooth against fixed references.
        if (isArcTarget) {
            const containsOther = currentRadius - r2 - target;
            if (Number.isFinite(containsOther) && containsOther > EPS) centerTargets.push(containsOther);
            const insideOther = r2 - currentRadius - target;
            if (Number.isFinite(insideOther) && insideOther > EPS) centerTargets.push(insideOther);
        }
    } else {
        return false;
    }
    if (centerTargets.length && !(fa && fb)) {
        let dTarget = centerTargets[0];
        let dDelta = Math.abs(dTarget - centerDistance);
        for (let i = 1; i < centerTargets.length; i++) {
            const d = centerTargets[i];
            const delta = Math.abs(d - centerDistance);
            if (delta < dDelta) {
                dTarget = d;
                dDelta = delta;
            }
        }
        let moved = false;
        if (targetPoint) {
            let vx = circle.cx - targetPoint.x;
            let vy = circle.cy - targetPoint.y;
            let vl = Math.hypot(vx, vy);
            if (vl < EPS) { vx = 1; vy = 0; vl = 1; }
            const nx = vx / vl;
            const ny = vy / vl;
            moved = enforceArcFromCenter(arc, pa, pb, targetPoint.x + nx * dTarget, targetPoint.y + ny * dTarget, fa, fb);
        } else if (lineAnchor && lineDir) {
            const lx = lineDir.x || 0;
            const ly = lineDir.y || 0;
            const ll = Math.hypot(lx, ly);
            if (ll < EPS) return false;
            const nx = -ly / ll;
            const ny = lx / ll;
            const sx = circle.cx - lineAnchor.x;
            const sy = circle.cy - lineAnchor.y;
            const signed = sx * nx + sy * ny;
            constraint.data = constraint.data || {};
            let side = Number(constraint.data.line_side_sign);
            if (!(side === 1 || side === -1)) {
                side = signed < 0 ? -1 : 1;
                constraint.data.line_side_sign = side;
            }
            moved = enforceArcFromCenter(arc, pa, pb, lineAnchor.x + nx * side * dTarget, lineAnchor.y + ny * side * dTarget, fa, fb);
        } else if (otherCenter) {
            let vx = circle.cx - otherCenter.x;
            let vy = circle.cy - otherCenter.y;
            let vl = Math.hypot(vx, vy);
            if (vl < EPS) { vx = 1; vy = 0; vl = 1; }
            const nx = vx / vl;
            const ny = vy / vl;
            moved = enforceArcFromCenter(arc, pa, pb, otherCenter.x + nx * dTarget, otherCenter.y + ny * dTarget, fa, fb);
        }
        if (moved) return true;
    }

    if (mode === 'max') {
        const radius = target - centerDistance - r2;
        if (Number.isFinite(radius) && radius > EPS) candidates.push(radius);
    } else if (mode === 'min') {
        const external = centerDistance - r2 - target;
        if (Number.isFinite(external) && external > EPS && centerDistance >= external + r2 - EPS) candidates.push(external);
        if (isArcTarget) {
            const containsOther = target + centerDistance + r2;
            if (Number.isFinite(containsOther) && containsOther > EPS && containsOther >= centerDistance + r2 - EPS) candidates.push(containsOther);
            const insideOther = r2 - centerDistance - target;
            if (Number.isFinite(insideOther) && insideOther > EPS && r2 >= centerDistance + insideOther - EPS) candidates.push(insideOther);
        }
    }
    if (!candidates.length) return false;

    let best = candidates[0];
    let bestDelta = Math.abs(best - currentRadius);
    for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        const d = Math.abs(c - currentRadius);
        if (d < bestDelta) {
            best = c;
            bestDelta = d;
        }
    }
    if (radiusDriven) return false;
    return applyArcRadiusTarget(arc, points, best, fixed);
}

function applyArcRadiusTarget(arc, points, target, fixed) {
    if (!arc || !Number.isFinite(target) || target <= EPS) return false;
    const [a, b] = getLineEndpoints(arc, points);
    if (!a || !b) return false;
    const center = getArcCenter(arc, a, b) || (Number.isFinite(arc?.cx) && Number.isFinite(arc?.cy) ? { x: arc.cx, y: arc.cy } : null);
    if (!center) return false;
    const aId = getLineEndpointId(arc, 'a');
    const bId = getLineEndpointId(arc, 'b');
    const fa = isFixed(aId, fixed);
    const fb = isFixed(bId, fixed);
    if (fa && fb) return false;
    let changed = false;
    if (isCircleCurve(arc)) {
        let ang = Math.atan2((a.y || 0) - center.y, (a.x || 0) - center.x);
        if (!Number.isFinite(ang)) ang = 0;
        const px = center.x + Math.cos(ang) * target;
        const py = center.y + Math.sin(ang) * target;
        if (!fa) changed = setPoint(a, px, py) || changed;
        if (!fb) changed = setPoint(b, px, py) || changed;
        changed = setArcCenterAndMeta(arc, center.x, center.y, target, 0, Math.PI * 2, true) || changed;
        changed = setArcControl(arc, center.x, center.y + target) || changed;
        return changed;
    }
    const angA = Math.atan2((a.y || 0) - center.y, (a.x || 0) - center.x);
    const angB = Math.atan2((b.y || 0) - center.y, (b.x || 0) - center.x);
    if (!fa) changed = setPoint(a, center.x + Math.cos(angA) * target, center.y + Math.sin(angA) * target) || changed;
    if (!fb) changed = setPoint(b, center.x + Math.cos(angB) * target, center.y + Math.sin(angB) * target) || changed;
    const sa = Math.atan2((a.y || 0) - center.y, (a.x || 0) - center.x);
    const ea = Math.atan2((b.y || 0) - center.y, (b.x || 0) - center.x);
    const ccw = arc?.ccw !== false;
    const tau = Math.PI * 2;
    let mid;
    if (ccw) {
        const sweep = (ea - sa + tau) % tau;
        mid = sa + sweep * 0.5;
    } else {
        const sweep = (sa - ea + tau) % tau;
        mid = sa - sweep * 0.5;
    }
    changed = setArcCenterAndMeta(arc, center.x, center.y, target, sa, ea, ccw) || changed;
    changed = setArcControl(arc, center.x + Math.cos(mid) * target, center.y + Math.sin(mid) * target) || changed;
    return changed;
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
    const pointId = points.has(refs[0]) ? refs[0] : (points.has(refs[1]) ? refs[1] : null);
    const line = lines.get(lines.has(refs[0]) ? refs[0] : (lines.has(refs[1]) ? refs[1] : null));
    if (!pointId) return false;
    if (!line) return false;
    return projectPointToLine(pointId, line, points, fixed);
}

function applyPointOnArc(constraint, points, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const pointId = points.has(refs[0]) ? refs[0] : (points.has(refs[1]) ? refs[1] : null);
    const arc = arcs.get(arcs.has(refs[0]) ? refs[0] : (arcs.has(refs[1]) ? refs[1] : null));
    if (!pointId || !arc || isFixed(pointId, fixed)) return false;
    const p = points.get(pointId);
    if (!p) return false;

    const circ = getArcCircleData(arc, points);
    if (!circ) return false;
    const px = p.x || 0;
    const py = p.y || 0;
    const vx = px - circ.cx;
    const vy = py - circ.cy;
    const vlen = Math.hypot(vx, vy);
    if (!Number.isFinite(vlen) || vlen < EPS) return false;

    if (isCircleCurve(arc)) {
        return setPoint(p, circ.cx + (vx / vlen) * circ.radius, circ.cy + (vy / vlen) * circ.radius);
    }

    // For arc segments, project onto sampled arc polyline.
    const [a, b] = getLineEndpoints(arc, points);
    if (!a || !b) return false;
    const samples = sampleArcPolylineForConstraint(arc, a, b, 64);
    if (samples.length < 2) return false;
    let best = null;
    for (let i = 0; i < samples.length - 1; i++) {
        const p1 = samples[i];
        const p2 = samples[i + 1];
        const cand = nearestPointOnSegment(px, py, p1.x, p1.y, p2.x, p2.y);
        if (!best || cand.d2 < best.d2) {
            best = cand;
        }
    }
    if (!best) return false;
    return setPoint(p, best.x, best.y);
}

function applyPointOnArcConstraints(constraints, points, arcs, fixed) {
    let changed = false;
    for (const c of constraints) {
        if (c?.type !== 'point_on_arc') continue;
        changed = applyPointOnArc(c, points, arcs, fixed) || changed;
    }
    return changed;
}

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < EPS) {
        const dx = px - ax;
        const dy = py - ay;
        return { x: ax, y: ay, d2: dx * dx + dy * dy };
    }
    const apx = px - ax;
    const apy = py - ay;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const x = ax + abx * t;
    const y = ay + aby * t;
    const dx = px - x;
    const dy = py - y;
    return { x, y, d2: dx * dx + dy * dy };
}

function nearestPointOnInfiniteLine(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < EPS) {
        return { x: ax, y: ay, d2: (px - ax) * (px - ax) + (py - ay) * (py - ay) };
    }
    const apx = px - ax;
    const apy = py - ay;
    const t = (apx * abx + apy * aby) / abLenSq;
    const x = ax + abx * t;
    const y = ay + aby * t;
    const dx = px - x;
    const dy = py - y;
    return { x, y, d2: dx * dx + dy * dy };
}

function sampleArcPolylineForConstraint(arc, a, b, segments = 48) {
    if (isCircleCurve(arc) && Number.isFinite(arc?.cx) && Number.isFinite(arc?.cy) && Number.isFinite(arc?.radius)) {
        const count = Math.max(24, segments);
        const pts = [];
        const start = Math.atan2((a.y || 0) - (arc.cy || 0), (a.x || 0) - (arc.cx || 0));
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const ang = start + t * Math.PI * 2;
            pts.push({
                x: (arc.cx || 0) + Math.cos(ang) * (arc.radius || 0),
                y: (arc.cy || 0) + Math.sin(ang) * (arc.radius || 0)
            });
        }
        return pts;
    }
    const center = getArcCenter(arc, a, b);
    if (!center) return [];
    const radius = Math.hypot((a.x || 0) - center.x, (a.y || 0) - center.y);
    if (radius < EPS) return [];
    const startAngle = Number.isFinite(arc?.startAngle) ? arc.startAngle : Math.atan2((a.y || 0) - center.y, (a.x || 0) - center.x);
    const endAngle = Number.isFinite(arc?.endAngle) ? arc.endAngle : Math.atan2((b.y || 0) - center.y, (b.x || 0) - center.x);
    const ccw = arc?.ccw !== false;
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
    const count = Math.max(8, segments);
    const pts = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const ang = startAngle + sweep * t;
        pts.push({
            x: center.x + Math.cos(ang) * radius,
            y: center.y + Math.sin(ang) * radius
        });
    }
    pts[0] = { x: a.x || 0, y: a.y || 0 };
    pts[pts.length - 1] = { x: b.x || 0, y: b.y || 0 };
    return pts;
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

function applyArcCenterOnLine(constraint, points, lines, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const arcId = refs.find(id => arcs.has(id)) || null;
    const lineId = refs.find(id => lines.has(id)) || null;
    if (!arcId || !lineId) return false;
    const arc = arcs.get(arcId);
    const line = lines.get(lineId);
    if (!arc || !line) return false;
    const [a, b] = getLineEndpoints(arc, points);
    const [l1, l2] = getLineEndpoints(line, points);
    if (!a || !b || !l1 || !l2) return false;
    const center = getArcCenter(arc, a, b);
    if (!center) return false;

    const abx = (l2.x || 0) - (l1.x || 0);
    const aby = (l2.y || 0) - (l1.y || 0);
    const len2 = abx * abx + aby * aby;
    if (len2 < EPS) return false;
    const t = (((center.x || 0) - (l1.x || 0)) * abx + ((center.y || 0) - (l1.y || 0)) * aby) / len2;
    const tx = (l1.x || 0) + abx * t;
    const ty = (l1.y || 0) + aby * t;

    const aId = getLineEndpointId(arc, 'a');
    const bId = getLineEndpointId(arc, 'b');
    const fa = !!(aId && fixed.has(aId));
    const fb = !!(bId && fixed.has(bId));
    return enforceArcFromCenter(arc, a, b, tx, ty, fa, fb);
}

function applyArcCenterOnArc(constraint, points, lines, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 2) return false;
    const sourceArcId = refs.find(id => arcs.has(id)) || null;
    const targetArcId = refs.find(id => id !== sourceArcId && arcs.has(id)) || null;
    if (!sourceArcId || !targetArcId) return false;
    const sourceArc = arcs.get(sourceArcId);
    const targetArc = arcs.get(targetArcId);
    if (!sourceArc || !targetArc) return false;

    const [sa, sb] = getLineEndpoints(sourceArc, points);
    const [ta, tb] = getLineEndpoints(targetArc, points);
    if (!sa || !sb || !ta || !tb) return false;
    const sourceCenter = getArcCenter(sourceArc, sa, sb);
    if (!sourceCenter) return false;

    const targetCirc = getArcCircleData(targetArc, points);
    if (!targetCirc) return false;

    let tx;
    let ty;
    if (isCircleCurve(targetArc)) {
        const vx = (sourceCenter.x || 0) - targetCirc.cx;
        const vy = (sourceCenter.y || 0) - targetCirc.cy;
        const vlen = Math.hypot(vx, vy);
        if (!Number.isFinite(vlen) || vlen < EPS) {
            tx = targetCirc.cx + targetCirc.radius;
            ty = targetCirc.cy;
        } else {
            tx = targetCirc.cx + (vx / vlen) * targetCirc.radius;
            ty = targetCirc.cy + (vy / vlen) * targetCirc.radius;
        }
    } else {
        const samples = sampleArcPolylineForConstraint(targetArc, ta, tb, 64);
        if (samples.length < 2) return false;
        let best = null;
        for (let i = 0; i < samples.length - 1; i++) {
            const p1 = samples[i];
            const p2 = samples[i + 1];
            const cand = nearestPointOnSegment(
                sourceCenter.x || 0,
                sourceCenter.y || 0,
                p1.x || 0,
                p1.y || 0,
                p2.x || 0,
                p2.y || 0
            );
            if (!best || cand.d2 < best.d2) best = cand;
        }
        if (!best) return false;
        tx = best.x;
        ty = best.y;
    }

    const aId = getLineEndpointId(sourceArc, 'a');
    const bId = getLineEndpointId(sourceArc, 'b');
    const fa = !!(aId && fixed.has(aId));
    const fb = !!(bId && fixed.has(bId));
    return enforceArcFromCenter(sourceArc, sa, sb, tx, ty, fa, fb);
}

function applyArcCenterFixedOrigin(constraint, points, lines, arcs, fixed) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    const arcId = refs.find(id => arcs.has(id)) || null;
    if (!arcId) return false;
    const arc = arcs.get(arcId);
    if (!arc) return false;
    const [a, b] = getLineEndpoints(arc, points);
    if (!a || !b) return false;
    const aId = getLineEndpointId(arc, 'a');
    const bId = getLineEndpointId(arc, 'b');
    const fa = !!(aId && fixed.has(aId));
    const fb = !!(bId && fixed.has(bId));
    return enforceArcFromCenter(arc, a, b, 0, 0, fa, fb);
}

function applyTangent(constraint, points, lines, arcs, fixed, dragged = new Set(), draggedArcs = new Set(), tangentAggressive = false) {
    return applyTangentConstraint(constraint, {
        points,
        lines,
        arcs,
        fixed,
        dragged,
        draggedArcs,
        tangentAggressive,
        deps: {
            getLineEndpoints,
            getLineEndpointId,
            isFixed,
            setPoint,
            getArcCircleData,
            moveArcCenterBy
        }
    });
}

function moveArcCenterBy(arc, points, fixed, dx, dy) {
    const [a, b] = getLineEndpoints(arc, points);
    if (!a || !b) return false;
    const center = getArcCenter(arc, a, b);
    if (!center) return false;
    const aId = getLineEndpointId(arc, 'a');
    const bId = getLineEndpointId(arc, 'b');
    const fa = !!(aId && fixed.has(aId));
    const fb = !!(bId && fixed.has(bId));
    return enforceArcFromCenter(arc, a, b, center.x + dx, center.y + dy, fa, fb);
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
    // When midpoint is fixed and one endpoint is user-dragged, reflect the opposite
    // endpoint across the midpoint. This avoids shearing/translation artifacts.
    if (fm && aDragged && !fb) {
        return setPoint(b, 2 * (mid.x || 0) - (a.x || 0), 2 * (mid.y || 0) - (a.y || 0));
    }
    if (fm && bDragged && !fa) {
        return setPoint(a, 2 * (mid.x || 0) - (b.x || 0), 2 * (mid.y || 0) - (b.y || 0));
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

function mirrorPointAcrossAxisLocal(point, axisA, axisB) {
    const ax = axisA?.x || 0;
    const ay = axisA?.y || 0;
    const bx = axisB?.x || 0;
    const by = axisB?.y || 0;
    const px = point?.x || 0;
    const py = point?.y || 0;
    const dx = bx - ax;
    const dy = by - ay;
    const den = dx * dx + dy * dy;
    if (!Number.isFinite(den) || den < EPS) {
        return { x: px, y: py };
    }
    const t = ((px - ax) * dx + (py - ay) * dy) / den;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    return { x: qx * 2 - px, y: qy * 2 - py };
}

function resolveMirrorAxis(constraint, lines, points) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 1) return null;
    const axisLine = lines.get(refs[0]);
    if (!axisLine) return null;
    const [a, b] = getLineEndpoints(axisLine, points);
    if (!a || !b) return null;
    const len = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    if (!Number.isFinite(len) || len < EPS) return null;
    return { a, b };
}

function applyMirrorPoint(constraint, points, lines, fixed, dragged = new Set()) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length < 3) return false;
    const axis = resolveMirrorAxis(constraint, lines, points);
    if (!axis) return false;
    const srcId = refs[1];
    const dstId = refs[2];
    const src = points.get(srcId);
    const dst = points.get(dstId);
    if (!src || !dst) return false;
    const srcDragged = !!dragged?.has?.(srcId);
    const dstDragged = !!dragged?.has?.(dstId);
    const srcFixed = isFixed(srcId, fixed);
    const dstFixed = isFixed(dstId, fixed);
    if (!srcDragged && !dstDragged && !srcFixed && !dstFixed) {
        const reflectedDst = mirrorPointAcrossAxisLocal(dst, axis.a, axis.b);
        const sx = ((src.x || 0) + (reflectedDst.x || 0)) * 0.5;
        const sy = ((src.y || 0) + (reflectedDst.y || 0)) * 0.5;
        const mirrored = mirrorPointAcrossAxisLocal({ x: sx, y: sy }, axis.a, axis.b);
        let changed = false;
        changed = setPoint(src, sx, sy) || changed;
        changed = setPoint(dst, mirrored.x, mirrored.y) || changed;
        return changed;
    }
    let primary = src;
    let primaryId = srcId;
    let secondary = dst;
    let secondaryId = dstId;
    if (dstDragged && !srcDragged) {
        primary = dst;
        primaryId = dstId;
        secondary = src;
        secondaryId = srcId;
    } else if (srcFixed && !dstFixed) {
        primary = src;
        primaryId = srcId;
        secondary = dst;
        secondaryId = dstId;
    } else if (dstFixed && !srcFixed) {
        primary = dst;
        primaryId = dstId;
        secondary = src;
        secondaryId = srcId;
    }
    if (isFixed(secondaryId, fixed) && !isFixed(primaryId, fixed)) {
        return false;
    }
    const mirrored = mirrorPointAcrossAxisLocal(primary, axis.a, axis.b);
    return setPoint(secondary, mirrored.x, mirrored.y);
}

function applyMirrorArc(constraint, points, lines, arcs, fixed, draggedPoints = new Set(), draggedArcs = new Set()) {
    // Disabled by design: mirrored arc/circle behavior is driven by mirrored
    // point pairs. Keeping this path inactive avoids unstable center-drag
    // interactions until we add a dedicated robust arc mirror relation.
    return false;
}

function applyMirrorConstraints(constraints, points, lines, arcs, fixed, draggedPoints = new Set(), draggedArcs = new Set()) {
    let changed = false;
    for (const c of constraints || []) {
        if (c?.type === 'mirror_point') {
            changed = applyMirrorPoint(c, points, lines, fixed, draggedPoints) || changed;
        } else if (c?.type === 'mirror_arc') {
            changed = applyMirrorArc(c, points, lines, arcs, fixed, draggedPoints, draggedArcs) || changed;
        }
    }
    return changed;
}

function normalizeAngle(a) {
    let out = a % (Math.PI * 2);
    if (out < 0) out += Math.PI * 2;
    return out;
}

function enforceArcFromCenter(arc, a, b, cx, cy, fa, fb) {
    if (isCircleCurve(arc)) {
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
    if (isCircleCurve(arc) && Number.isFinite(arc?.cx) && Number.isFinite(arc?.cy)) {
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


export {
    enforceWithFallback,
    applyThreePointCircleDefinitions,
    captureFixedAnchors,
    getLineEndpointId,
    applyPolygonPattern,
    applyPolygonPatternConstraints,
    applyCircularPatternConstraints,
    applyGridPatternConstraints,
    applyPointOnArcConstraints,
    applyArcCenterCoincidentConstraints,
    applyMidpointConstraints,
    applyTangentConstraints,
    applyMirrorConstraints
};
