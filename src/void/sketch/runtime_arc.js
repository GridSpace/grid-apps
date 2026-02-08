/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { isCircleCurve } from './curve.js';

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

function getArcRenderPoints(arc, a, b, segments = 32) {
    if (isCircleCurve(arc)) {
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        let radius = Number(arc?.radius);
        if (!Number.isFinite(radius) || radius <= 0) {
            if (a) {
                radius = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
            }
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= 0) {
            return [];
        }
        const count = Math.max(32, segments * 2);
        let start = 0;
        if (a) {
            start = Math.atan2((a.y || 0) - cy, (a.x || 0) - cx);
        }
        const pts = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const ang = start + t * Math.PI * 2;
            pts.push({
                x: cx + Math.cos(ang) * radius,
                y: cy + Math.sin(ang) * radius
            });
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
        const geom = computeArcFromThreePoints(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (geom) {
            cx = geom.cx;
            cy = geom.cy;
            radius = geom.radius;
            startAngle = geom.startAngle;
            endAngle = geom.endAngle;
            ccw = geom.ccw;
        }
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
        return [];
    }
    if (!Number.isFinite(radius) || radius <= 0) {
        if (a) {
            radius = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
        }
    }
    if (!Number.isFinite(radius) || radius <= 0) {
        return [];
    }
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
            x: cx + Math.cos(ang) * radius,
            y: cy + Math.sin(ang) * radius
        });
    }
    if (a) pts[0] = { x: a.x || 0, y: a.y || 0 };
    if (b) pts[pts.length - 1] = { x: b.x || 0, y: b.y || 0 };
    return pts;
}

function getArcCenterLocal(arc, a, b) {
    if (isCircleCurve(arc)) {
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
            return { x: cx, y: cy };
        }
    }
    if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my) && a && b) {
        const geom = computeArcFromThreePoints(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (geom) {
            return { x: geom.cx, y: geom.cy };
        }
    }
    const cx = Number(arc?.cx);
    const cy = Number(arc?.cy);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
        return { x: cx, y: cy };
    }
    return null;
}

function computeArcFromThreePoints(start, end, onArc) {
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
    if (!Number.isFinite(radius) || radius < 1e-6) {
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

export {
    getLineEndpoints,
    getArcEndpoints,
    getArcRenderPoints,
    getArcCenterLocal,
    computeArcFromThreePoints
};
