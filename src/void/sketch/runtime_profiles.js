/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { ClipperLib } from '../../ext/clip2.esm.js';

const PROFILE_MERGE_EPS = 1e-3;
const CLIPPER_SCALE = 100000;

function addClosedProfileFills(rec, entities, pointById) {
    const loops = this.findClosedCurveLoops(rec.feature, entities, pointById);
    const regions = buildProfileRegions(loops);
    for (let index = 0; index < regions.length; index++) {
        const region = regions[index];
        const outer = region?.outer;
        const holes = Array.isArray(region?.holes) ? region.holes : [];
        if (!Array.isArray(outer) || outer.length < 3) continue;
        const shape = loopToShapePath(ensureLoopWinding(outer, true), THREE.Shape);
        if (!shape) continue;
        for (const hole of holes) {
            const path = loopToShapePath(ensureLoopWinding(hole, false), THREE.Path);
            if (path) shape.holes.push(path);
        }
        const geom = new THREE.ShapeGeometry(shape);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x8f8f8f,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            side: THREE.DoubleSide
        });
        const fill = new THREE.Mesh(geom, mat);
        fill.position.z = 0;
        fill.renderOrder = 6;
        const profileId = `profile-${index}`;
        fill.userData.sketchEntityId = profileId;
        fill.userData.sketchEntityType = 'profile';
        fill.userData.sketchProfileId = profileId;
        fill.userData.sketchFeatureId = rec.feature?.id || null;
        const profileLoops = [
            ensureLoopWinding(outer, true),
            ...holes.map(loop => ensureLoopWinding(loop, false))
        ]
            .map(loop => (Array.isArray(loop) ? loop.map(p => ({ x: p.x || 0, y: p.y || 0 })) : null))
            .filter(loop => Array.isArray(loop) && loop.length >= 3);
        fill.userData.sketchProfileLoops = profileLoops;
        fill.userData.sketchProfileLoop = profileLoops[0] || null;
        rec.entitiesGroup.add(fill);
        rec.entityViews.set(profileId, {
            entity: {
                id: profileId,
                type: 'profile',
                loop: fill.userData.sketchProfileLoop,
                loops: profileLoops
            },
            object: fill,
            type: 'profile'
        });
    }
}

function loopToShapePath(loop, Ctor = THREE.Path) {
    if (!Array.isArray(loop) || loop.length < 3) return null;
    const path = new Ctor();
    path.moveTo(loop[0].x || 0, loop[0].y || 0);
    for (let i = 1; i < loop.length; i++) {
        path.lineTo(loop[i].x || 0, loop[i].y || 0);
    }
    path.closePath();
    return path;
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
                poly = this.getArcRenderPoints(curve, a, b, this.getArcSegmentsFor?.(curve, a, b, 'profile') || 64);
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

function polygonAbsArea(loop) {
    if (!Array.isArray(loop) || loop.length < 3) return 0;
    let area2 = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        area2 += (a.x || 0) * (b.y || 0) - (b.x || 0) * (a.y || 0);
    }
    return Math.abs(area2 * 0.5);
}

function polygonSignedArea(loop) {
    if (!Array.isArray(loop) || loop.length < 3) return 0;
    let area2 = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        area2 += (a.x || 0) * (b.y || 0) - (b.x || 0) * (a.y || 0);
    }
    return area2 * 0.5;
}

function ensureLoopWinding(loop, ccw = true) {
    if (!Array.isArray(loop)) return loop;
    const signed = polygonSignedArea(loop);
    const isCCW = signed > 0;
    if ((ccw && isCCW) || (!ccw && !isCCW)) return loop;
    return loop.slice().reverse();
}

function pointOnSegment(p, a, b, eps = 1e-8) {
    const px = p.x || 0;
    const py = p.y || 0;
    const ax = a.x || 0;
    const ay = a.y || 0;
    const bx = b.x || 0;
    const by = b.y || 0;
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const cross = abx * apy - aby * apx;
    if (Math.abs(cross) > eps) return false;
    const dot = apx * abx + apy * aby;
    if (dot < -eps) return false;
    const len2 = abx * abx + aby * aby;
    if (dot - len2 > eps) return false;
    return true;
}

// returns 1 = inside, 0 = boundary, -1 = outside
function pointInPolygonState(point, loop) {
    if (!Array.isArray(loop) || loop.length < 3) return -1;
    const p = { x: point.x || 0, y: point.y || 0 };
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i];
        const b = loop[j];
        if (pointOnSegment(p, a, b)) return 0;
        const yi = a.y || 0;
        const yj = b.y || 0;
        const xi = a.x || 0;
        const xj = b.x || 0;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < ((xj - xi) * (p.y - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside ? 1 : -1;
}

function loopContainsLoop(outer, inner) {
    if (!Array.isArray(outer) || !Array.isArray(inner) || outer.length < 3 || inner.length < 3) return false;
    let sawInside = false;
    for (const p of inner) {
        const state = pointInPolygonState(p, outer);
        if (state < 0) return false;
        if (state > 0) sawInside = true;
    }
    return sawInside;
}

function buildProfileRegions(loops) {
    const valid = (loops || [])
        .filter(loop => Array.isArray(loop) && loop.length >= 3 && polygonAbsArea(loop) > 1e-10)
        .map((loop, index) => ({
            id: index,
            loop,
            area: polygonAbsArea(loop),
            parent: null,
            children: []
        }));
    if (!valid.length) return [];
    valid.sort((a, b) => a.area - b.area);
    for (let i = 0; i < valid.length; i++) {
        const child = valid[i];
        for (let j = i + 1; j < valid.length; j++) {
            const parent = valid[j];
            if (loopContainsLoop(parent.loop, child.loop)) {
                child.parent = parent;
                parent.children.push(child);
                break;
            }
        }
    }
    // Every loop yields one selectable region: itself minus immediate children.
    const regions = [];
    for (const node of valid) {
        regions.push({
            outer: node.loop,
            holes: node.children.map(c => c.loop)
        });
    }
    return regions;
}

export {
    addClosedProfileFills,
    simplifyLoopsWithClipper,
    findClosedCurveLoops,
    segmentIntersectionParams,
    findClosedLineLoops
};
