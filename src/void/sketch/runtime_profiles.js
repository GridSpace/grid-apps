/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { ClipperLib } from '../../ext/clip2.esm.js';

const PROFILE_MERGE_EPS = 1e-3;
const CLIPPER_SCALE = 100000;

function addClosedProfileFills(rec, entities, pointById) {
    const loops = this.findClosedCurveLoops(rec.feature, entities, pointById);
    for (const loop of loops) {
        if (!Array.isArray(loop) || loop.length < 3) continue;
        const shape = new THREE.Shape();
        shape.moveTo(loop[0].x, loop[0].y);
        for (let i = 1; i < loop.length; i++) {
            shape.lineTo(loop[i].x, loop[i].y);
        }
        shape.closePath();
        const geom = new THREE.ShapeGeometry(shape);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x8f8f8f,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const fill = new THREE.Mesh(geom, mat);
        fill.position.z = -0.005;
        fill.renderOrder = 6;
        rec.entitiesGroup.add(fill);
    }
}

function simplifyLoopsWithClipper(loops) {
    if (!Array.isArray(loops) || !loops.length || !ClipperLib?.Clipper) {
        return loops || [];
    }
    const out = [];
    const fill = ClipperLib.PolyFillType.pftEvenOdd;
    for (const loop of loops) {
        if (!Array.isArray(loop) || loop.length < 3) continue;
        const path = [];
        for (const p of loop) {
            path.push({
                X: Math.round((p.x || 0) * CLIPPER_SCALE),
                Y: Math.round((p.y || 0) * CLIPPER_SCALE)
            });
        }
        if (path.length < 3) continue;
        const simp = ClipperLib.Clipper.SimplifyPolygon(path, fill) || [];
        if (!simp.length) {
            out.push(loop);
            continue;
        }
        for (const poly of simp) {
            if (!Array.isArray(poly) || poly.length < 3) continue;
            out.push(poly.map(pt => ({
                x: (pt.X || 0) / CLIPPER_SCALE,
                y: (pt.Y || 0) / CLIPPER_SCALE
            })));
        }
    }
    return out.length ? out : loops;
}

function findClosedCurveLoops(feature, entities, pointById) {
    const curves = entities.filter(e => (e?.type === 'line' || e?.type === 'arc') && !e.construction);
    if (!curves.length) return [];

    const q = v => Math.round(v / PROFILE_MERGE_EPS) * PROFILE_MERGE_EPS;
    const nodes = new Map();
    const nodeCoord = new Map();
    const baseSegments = [];
    let nodeSeq = 0;

    const getNodeId = (x, y) => {
        const key = `${q(x)},${q(y)}`;
        let node = nodes.get(key);
        if (!node) {
            node = { id: `n${++nodeSeq}`, x, y };
            nodes.set(key, node);
            nodeCoord.set(node.id, { x, y });
        }
        return node.id;
    };

    for (const curve of curves) {
        let poly = null;
        if (curve.type === 'line') {
            const [a, b] = this.getLineEndpoints(curve, pointById);
            if (a && b) {
                poly = [{ x: a.x || 0, y: a.y || 0 }, { x: b.x || 0, y: b.y || 0 }];
            }
        } else if (curve.type === 'arc') {
            const [a, b] = this.getArcEndpoints(curve, pointById);
            if (a && b) {
                poly = this.getArcRenderPoints(curve, a, b, 64);
            }
        }
        if (!poly || poly.length < 2) continue;

        for (let i = 0; i < poly.length - 1; i++) {
            const p1 = poly[i];
            const p2 = poly[i + 1];
            const x1 = p1.x || 0;
            const y1 = p1.y || 0;
            const x2 = p2.x || 0;
            const y2 = p2.y || 0;
            if (Math.hypot(x2 - x1, y2 - y1) < PROFILE_MERGE_EPS) continue;
            baseSegments.push({ id: baseSegments.length, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, ts: [0, 1] });
        }
    }
    if (!baseSegments.length) return [];

    const segEps = 1e-9;
    for (let i = 0; i < baseSegments.length; i++) {
        const s1 = baseSegments[i];
        for (let j = i + 1; j < baseSegments.length; j++) {
            const s2 = baseSegments[j];
            const hit = this.segmentIntersectionParams(s1.a, s1.b, s2.a, s2.b, segEps);
            if (!hit || hit.collinear) continue;
            if (Number.isFinite(hit.t) && hit.t >= -segEps && hit.t <= 1 + segEps) {
                s1.ts.push(Math.max(0, Math.min(1, hit.t)));
            }
            if (Number.isFinite(hit.u) && hit.u >= -segEps && hit.u <= 1 + segEps) {
                s2.ts.push(Math.max(0, Math.min(1, hit.u)));
            }
        }
    }

    const edges = [];
    const edgeKeys = new Set();
    const uniqueSorted = list => {
        const out = Array.from(new Set(list.map(v => Number(v.toFixed(12)))));
        out.sort((a, b) => a - b);
        return out;
    };
    for (const seg of baseSegments) {
        const ts = uniqueSorted(seg.ts).filter(t => t >= 0 && t <= 1);
        if (ts.length < 2) continue;
        const sx = seg.a.x;
        const sy = seg.a.y;
        const dx = seg.b.x - seg.a.x;
        const dy = seg.b.y - seg.a.y;
        for (let i = 0; i < ts.length - 1; i++) {
            const t0 = ts[i];
            const t1 = ts[i + 1];
            if ((t1 - t0) < 1e-9) continue;
            const p0 = { x: sx + dx * t0, y: sy + dy * t0 };
            const p1 = { x: sx + dx * t1, y: sy + dy * t1 };
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < PROFILE_MERGE_EPS) continue;
            const aId = getNodeId(p0.x, p0.y);
            const bId = getNodeId(p1.x, p1.y);
            if (!aId || !bId || aId === bId) continue;
            const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
            if (edgeKeys.has(key)) continue;
            edgeKeys.add(key);
            edges.push({ id: edges.length, a: aId, b: bId });
        }
    }
    if (!edges.length) return [];

    const halfEdges = [];
    const outgoing = new Map();
    const addOutgoing = (nid, heId) => {
        if (!outgoing.has(nid)) outgoing.set(nid, []);
        outgoing.get(nid).push(heId);
    };
    for (const edge of edges) {
        const a = nodeCoord.get(edge.a);
        const b = nodeCoord.get(edge.b);
        if (!a || !b) continue;
        const heAB = { id: halfEdges.length, edgeId: edge.id, from: edge.a, to: edge.b, angle: Math.atan2(b.y - a.y, b.x - a.x), twin: -1 };
        halfEdges.push(heAB);
        const heBA = { id: halfEdges.length, edgeId: edge.id, from: edge.b, to: edge.a, angle: Math.atan2(a.y - b.y, a.x - b.x), twin: heAB.id };
        halfEdges.push(heBA);
        heAB.twin = heBA.id;
        addOutgoing(heAB.from, heAB.id);
        addOutgoing(heBA.from, heBA.id);
    }
    for (const [nid, list] of outgoing.entries()) {
        list.sort((ha, hb) => halfEdges[ha].angle - halfEdges[hb].angle);
        outgoing.set(nid, list);
    }

    const visited = new Set();
    const loops = [];
    const minArea = 1e-5;
    for (const start of halfEdges) {
        if (visited.has(start.id)) continue;
        const cycleHes = [];
        let curr = start;
        let guard = 0;
        while (curr && !visited.has(curr.id) && guard++ < halfEdges.length * 4) {
            visited.add(curr.id);
            cycleHes.push(curr.id);
            const outAtTo = outgoing.get(curr.to) || [];
            if (!outAtTo.length) break;
            const twinIndex = outAtTo.indexOf(curr.twin);
            if (twinIndex < 0) break;
            const nextIndex = (twinIndex - 1 + outAtTo.length) % outAtTo.length;
            curr = halfEdges[outAtTo[nextIndex]];
            if (curr.id === start.id) {
                cycleHes.push(curr.id);
                break;
            }
        }
        if (!cycleHes.length || cycleHes[cycleHes.length - 1] !== start.id) continue;
        const nodeIds = [];
        for (let i = 0; i < cycleHes.length - 1; i++) nodeIds.push(halfEdges[cycleHes[i]].from);
        if (nodeIds.length < 3) continue;
        const pts = nodeIds.map(nid => nodeCoord.get(nid)).filter(Boolean);
        if (pts.length < 3) continue;
        let area2 = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const q2 = pts[(i + 1) % pts.length];
            area2 += p.x * q2.y - q2.x * p.y;
        }
        if ((area2 * 0.5) > minArea) {
            loops.push(pts.map(p => ({ x: p.x, y: p.y })));
        }
    }
    return loops;
}

function segmentIntersectionParams(a, b, c, d, eps = 1e-9) {
    const r = { x: (b.x || 0) - (a.x || 0), y: (b.y || 0) - (a.y || 0) };
    const s = { x: (d.x || 0) - (c.x || 0), y: (d.y || 0) - (c.y || 0) };
    const cross = (u, v) => u.x * v.y - u.y * v.x;
    const qmp = { x: (c.x || 0) - (a.x || 0), y: (c.y || 0) - (a.y || 0) };
    const denom = cross(r, s);
    const qmpxr = cross(qmp, r);

    if (Math.abs(denom) < eps) {
        if (Math.abs(qmpxr) < eps) return { collinear: true };
        return null;
    }
    const t = cross(qmp, s) / denom;
    const u = cross(qmp, r) / denom;
    if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
    return { t, u, collinear: false };
}

function findClosedLineLoops(feature, entities, pointById) {
    return this.findClosedCurveLoops(feature, entities, pointById);
}

export {
    addClosedProfileFills,
    simplifyLoopsWithClipper,
    findClosedCurveLoops,
    segmentIntersectionParams,
    findClosedLineLoops
};
